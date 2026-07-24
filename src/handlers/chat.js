// POST /glovebox/api/chat — the v3 maintenance chat agent.
//
// Level-1 agent (see the v3 agent-architecture notes): the Worker hosts a
// stateless, answer-only assistant. The browser holds the transcript and resends
// it each turn; this handler injects the car's context, runs a shallow tool loop
// against the Anthropic Messages API, and returns the final text.
//
// Grounding-by-construction: the ONLY tool is `get_maintenance_dueness`, which
// runs the deterministic calculator (src/lib/dueness.js). The model never does
// date/mileage math — it asks, the code computes, the model phrases the verdict
// and relays the caveats. Maintenance *history* is injected as plain context so
// the model can answer "when did I last…" without a tool; due-ness/intervals go
// through the tool so the numbers and caveats are always code-derived.

import { json } from "../lib/responses.js";
import { authedEmail } from "../lib/auth.js";
import { parseJson } from "../lib/columns.js";
import { callMessages } from "../lib/anthropic.js";
import { computeDueness } from "../lib/dueness.js";
import { MAINTENANCE_ITEMS } from "../config/manual.js";
import { VEHICLE } from "../config/vehicle.js";

// Family tool: cheap + fast beats max intelligence here. Swap to "claude-opus-4-8"
// (or "claude-sonnet-5") if answer quality ever needs it — one line, no other change.
const MODEL = "claude-haiku-4-5";
const MAX_TOKENS = 1024; // a chat answer; non-streaming, so keep it well under the HTTP-timeout zone
const MAX_TURNS = 4; // safety cap on the tool loop (our loop is normally 2: tool_use → answer)
const MAX_MESSAGES = 40; // cap the resent transcript so context can't grow unbounded

// The one tool. Zero model-supplied inputs — the server owns date + history +
// odometer readings (grounding). The description states WHEN to call it, because
// current models under-trigger tools without an explicit trigger condition.
export const DUENESS_TOOL = {
  name: "get_maintenance_dueness",
  description:
    "Compute, for THIS car as of today, whether each scheduled maintenance item is overdue, due soon, " +
    "not yet due, or Minder-only. Call this whenever the user asks whether a service is due, overdue, or " +
    "coming up, or asks about a maintenance interval or schedule (engine oil, tire rotation, brake " +
    "inspection, cabin/engine air filter, transmission fluid, brake fluid, spark plugs, coolant). Returns " +
    "one verdict per item: status, last-done, due-by date/odometer, remaining days/miles, the interval " +
    "spec, and typed caveats. You MUST relay every caveat honestly and MUST NOT estimate due-ness or " +
    "intervals yourself — always call this tool and base the answer strictly on its output.",
  input_schema: { type: "object", properties: {}, additionalProperties: false },
};

// --- request validation -----------------------------------------------------

// Normalize the client transcript into clean {role, content} text messages.
// Returns null on anything malformed. Keeps only the last MAX_MESSAGES, drops
// any leading assistant turns (the API requires the first message to be `user`).
export function sanitizeMessages(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out = [];
  for (const m of raw.slice(-MAX_MESSAGES)) {
    if (!m || (m.role !== "user" && m.role !== "assistant")) return null;
    if (typeof m.content !== "string") return null;
    const content = m.content.trim();
    if (!content) return null;
    out.push({ role: m.role, content });
  }
  while (out.length && out[0].role === "assistant") out.shift();
  return out.length ? out : null;
}

// --- context injection ------------------------------------------------------

function itemLegend() {
  return Object.entries(MAINTENANCE_ITEMS)
    .map(([slug, item]) => `${slug} = ${item.label}`)
    .join("; ");
}

function historyLines(entries) {
  return entries
    .map((e) => {
      const odo = Number.isFinite(e.odometer) ? `${e.odometer} mi` : "? mi";
      const items = e.service_items.length ? ` · items: ${e.service_items.join(", ")}` : "";
      const cats = e.categories.length ? ` · ${e.categories.join(", ")}` : "";
      const shop = e.shop_name ? ` · ${e.shop_name}` : "";
      const cost = e.total_cost != null ? ` · $${e.total_cost}` : "";
      const notes = e.notes ? ` · ${e.notes}` : "";
      return `- ${e.date} · ${odo}${items}${cats}${shop}${cost}${notes}`;
    })
    .join("\n");
}

export function buildSystemPrompt(maintenanceEntries) {
  const v = VEHICLE;
  return [
    "You are the assistant inside Glovebox, a private car-tracking app for one family and one shared car.",
    "Answer questions about this specific vehicle's maintenance history and help the owner decide whether a service is due and reasonably priced.",
    "",
    `THE CAR: ${v.year} ${v.make} ${v.model} ${v.trim} (VIN ${v.vin}). In service ${v.in_service_date} — warranty and maintenance-interval clocks start there. Bought pre-owned ${v.purchase_date} at ${v.purchase_odometer} miles.`,
    "",
    "GROUNDING RULES:",
    "- For ANYTHING about whether a service is due, overdue, or coming up — or about a maintenance interval — call get_maintenance_dueness and base your answer strictly on its output. Never estimate due-ness or intervals from memory or from the history table; the tool does the math and attaches caveats you must relay.",
    "- Surface every caveat the tool returns, honestly (e.g. \"this is the severe-service interval; a normal driver usually waits for the dashboard Maintenance Minder,\" or \"no service record, so it's assumed original since the car was new\").",
    "- Do NOT proactively warn about due items unless the user asks. Answer what is asked.",
    "- If you don't know something (e.g. a fluid capacity or price not in the data), say so plainly — never invent specs, part numbers, or prices.",
    "- Be concise and factual. You may write dates naturally (e.g. 29 January 2026).",
    "",
    `SERVICE-ITEM LEGEND (slugs used below): ${itemLegend()}`,
    "",
    "MAINTENANCE HISTORY (newest first):",
    historyLines(maintenanceEntries),
  ].join("\n");
}

// --- the agentic tool loop --------------------------------------------------

// Core loop, decoupled from the network and D1 for testability:
//   callFn(body)   -> Promise<Anthropic response data>
//   runTool(block) -> Promise<string>  (the tool_result content)
// Returns { reply, turns } on a normal finish, or { reply: null, exhausted: true }
// if the model keeps calling tools past maxTurns.
export async function runToolLoop({ callFn, model, system, tools, messages, runTool, maxTurns = MAX_TURNS }) {
  const convo = [...messages];
  for (let turn = 0; turn < maxTurns; turn++) {
    const data = await callFn({ model, max_tokens: MAX_TOKENS, system, tools, messages: convo });

    if (data.stop_reason === "tool_use") {
      convo.push({ role: "assistant", content: data.content });
      const results = [];
      for (const block of data.content) {
        if (block.type !== "tool_use") continue;
        const content = await runTool(block);
        results.push({ type: "tool_result", tool_use_id: block.id, content });
      }
      convo.push({ role: "user", content: results });
      continue;
    }

    const reply = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    return { reply, turns: turn + 1 };
  }
  return { reply: null, turns: maxTurns, exhausted: true };
}

// --- data loading -----------------------------------------------------------

async function loadCarData(env) {
  const [maint, fuel, charging] = await Promise.all([
    env.DB.prepare(
      "SELECT date, odometer, service_items, categories, shop_name, total_cost, notes FROM maintenance_entries ORDER BY date DESC, id DESC"
    ).all(),
    env.DB.prepare("SELECT date, odometer FROM fuel_entries").all(),
    env.DB.prepare("SELECT date, odometer FROM charging_sessions").all(),
  ]);

  const maintenanceEntries = maint.results.map((r) => ({
    ...r,
    service_items: parseJson(r.service_items, []),
    categories: parseJson(r.categories, []),
  }));
  const extraReadings = [...fuel.results, ...charging.results];
  return { maintenanceEntries, extraReadings };
}

// --- handler ----------------------------------------------------------------

export async function postChat(request, env) {
  const email = authedEmail(request, env);
  if (!email) {
    return json({ error: "Unauthorized: no authenticated user email found" }, 401);
  }
  if (!env.ANTHROPIC_API_KEY) {
    return json({ error: "Chat is not configured (missing ANTHROPIC_API_KEY)" }, 503);
  }

  let body;
  try {
    body = await request.json();
  } catch (_) {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const messages = sanitizeMessages(body && body.messages);
  if (!messages) {
    return json({ error: "messages must be a non-empty array of {role, content}" }, 400);
  }

  const { maintenanceEntries, extraReadings } = await loadCarData(env);
  const system = buildSystemPrompt(maintenanceEntries);
  const asOf = new Date().toISOString().slice(0, 10); // today, UTC — a day's drift is immaterial to 30-day/1000-mi thresholds

  const runTool = async (block) => {
    if (block.name === "get_maintenance_dueness") {
      const verdicts = computeDueness({ asOf, maintenanceEntries, extraReadings });
      return JSON.stringify(verdicts);
    }
    return `Unknown tool: ${block.name}`;
  };

  try {
    const { reply, exhausted } = await runToolLoop({
      callFn: (b) => callMessages(env, b),
      model: MODEL,
      system,
      tools: [DUENESS_TOOL],
      messages,
      runTool,
    });
    if (exhausted) {
      return json({ error: "The assistant took too many steps. Please try rephrasing." }, 502);
    }
    return json({ reply });
  } catch (err) {
    console.error("chat error:", err && err.message ? err.message : err);
    return json({ error: "The assistant is unavailable right now. Please try again." }, 502);
  }
}
