// Tests for the chat agent's pure pieces: transcript validation, context
// injection, and the agentic tool loop. The loop is dependency-injected, so we
// stub the Anthropic call — no network, no API key. Run with:  node --test

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  sanitizeMessages,
  buildSystemPrompt,
  runToolLoop,
} from "../src/handlers/chat.js";

// --- sanitizeMessages -------------------------------------------------------

test("sanitizeMessages accepts a clean transcript and trims content", () => {
  const out = sanitizeMessages([
    { role: "user", content: "  hi  " },
    { role: "assistant", content: "hello" },
    { role: "user", content: "is my oil due?" },
  ]);
  assert.deepEqual(out, [
    { role: "user", content: "hi" },
    { role: "assistant", content: "hello" },
    { role: "user", content: "is my oil due?" },
  ]);
});

test("sanitizeMessages rejects malformed inputs", () => {
  assert.equal(sanitizeMessages(null), null);
  assert.equal(sanitizeMessages([]), null);
  assert.equal(sanitizeMessages("nope"), null);
  assert.equal(sanitizeMessages([{ role: "system", content: "x" }]), null); // bad role
  assert.equal(sanitizeMessages([{ role: "user", content: 42 }]), null); // non-string
  assert.equal(sanitizeMessages([{ role: "user", content: "   " }]), null); // blank
});

test("sanitizeMessages drops leading assistant turns (API needs a user first)", () => {
  const out = sanitizeMessages([
    { role: "assistant", content: "stray" },
    { role: "user", content: "hi" },
  ]);
  assert.deepEqual(out, [{ role: "user", content: "hi" }]);
  assert.equal(sanitizeMessages([{ role: "assistant", content: "only" }]), null);
});

test("sanitizeMessages caps the transcript length", () => {
  const many = Array.from({ length: 100 }, (_, i) => ({
    role: i % 2 === 0 ? "user" : "assistant",
    content: `m${i}`,
  }));
  const out = sanitizeMessages(many);
  assert.ok(out.length <= 40);
  assert.equal(out[0].role, "user"); // still starts on a user turn
});

// --- buildSystemPrompt ------------------------------------------------------

const HISTORY = [
  { date: "2026-07-18", odometer: 65157, service_items: ["oil", "tire_rotation"], categories: ["Oil"], shop_name: "Honda of Serramonte", total_cost: 89.99, notes: null },
  { date: "2025-08-01", odometer: 50418, service_items: ["brake_fluid"], categories: ["Fluids"], shop_name: null, total_cost: null, notes: "brakes measured" },
];

test("buildSystemPrompt injects the car, the legend, and the history", () => {
  const sys = buildSystemPrompt(HISTORY);
  assert.match(sys, /JHMZC5F33KC005237/); // VIN
  assert.match(sys, /get_maintenance_dueness/); // grounding rule names the tool
  assert.match(sys, /oil = Engine oil & filter/); // legend from manual.js
  assert.match(sys, /2026-07-18 · 65157 mi · items: oil, tire_rotation/); // a history line
  assert.match(sys, /\$89\.99/); // cost surfaced
  assert.match(sys, /brakes measured/); // notes surfaced
});

// --- runToolLoop ------------------------------------------------------------

const TOOLS = [{ name: "get_maintenance_dueness" }];
const textTurn = (t) => ({ stop_reason: "end_turn", content: [{ type: "text", text: t }] });
const toolTurn = (id) => ({
  stop_reason: "tool_use",
  content: [
    { type: "text", text: "Let me check." },
    { type: "tool_use", id, name: "get_maintenance_dueness", input: {} },
  ],
});

test("runToolLoop returns text immediately when no tool is requested", async () => {
  let toolRuns = 0;
  const { reply, turns } = await runToolLoop({
    callFn: async () => textTurn("The oil is fine."),
    model: "m", system: "s", tools: TOOLS,
    messages: [{ role: "user", content: "hi" }],
    runTool: async () => { toolRuns++; return "[]"; },
  });
  assert.equal(reply, "The oil is fine.");
  assert.equal(turns, 1);
  assert.equal(toolRuns, 0);
});

test("runToolLoop runs the tool, feeds the result back, then answers", async () => {
  const calls = [];
  const seen = [];
  const responses = [toolTurn("toolu_1"), textTurn("Brake fluid is due next August.")];
  const { reply, turns } = await runToolLoop({
    callFn: async (body) => { calls.push(body); return responses.shift(); },
    model: "m", system: "s", tools: TOOLS,
    messages: [{ role: "user", content: "is brake fluid due?" }],
    runTool: async (block) => { seen.push(block); return '[{"item":"brake_fluid"}]'; },
  });

  assert.equal(reply, "Brake fluid is due next August.");
  assert.equal(turns, 2);
  // tool ran once, on the right block
  assert.equal(seen.length, 1);
  assert.equal(seen[0].name, "get_maintenance_dueness");

  // second API call carried the appended assistant turn + tool_result
  const secondConvo = calls[1].messages;
  assert.equal(secondConvo.length, 3); // user, assistant(tool_use), user(tool_result)
  assert.equal(secondConvo[1].role, "assistant");
  const toolResult = secondConvo[2].content[0];
  assert.equal(toolResult.type, "tool_result");
  assert.equal(toolResult.tool_use_id, "toolu_1");
  assert.equal(toolResult.content, '[{"item":"brake_fluid"}]');
});

test("runToolLoop handles multiple tool_use blocks in one turn", async () => {
  let runs = 0;
  const multi = {
    stop_reason: "tool_use",
    content: [
      { type: "tool_use", id: "a", name: "get_maintenance_dueness", input: {} },
      { type: "tool_use", id: "b", name: "get_maintenance_dueness", input: {} },
    ],
  };
  const responses = [multi, textTurn("done")];
  const { reply } = await runToolLoop({
    callFn: async () => responses.shift(),
    model: "m", system: "s", tools: TOOLS,
    messages: [{ role: "user", content: "x" }],
    runTool: async () => { runs++; return "[]"; },
  });
  assert.equal(reply, "done");
  assert.equal(runs, 2); // one tool_result per block
});

test("runToolLoop bails out (exhausted) if the model never stops calling tools", async () => {
  const { reply, exhausted, turns } = await runToolLoop({
    callFn: async () => toolTurn("loop"),
    model: "m", system: "s", tools: TOOLS,
    messages: [{ role: "user", content: "x" }],
    runTool: async () => "[]",
    maxTurns: 3,
  });
  assert.equal(reply, null);
  assert.equal(exhausted, true);
  assert.equal(turns, 3);
});
