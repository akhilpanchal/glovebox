import { json } from "../lib/responses.js";
import { authedEmail } from "../lib/auth.js";
import { parseJson } from "../lib/columns.js";

// Mirror of the frontend list; keep the two in sync.
const CATEGORIES = new Set([
  "Oil", "Tires", "Brakes", "Battery", "Fluids", "Filters",
  "Scheduled service", "Inspection", "Repair", "Diagnostic", "Other",
]);

// Parse the JSON-text columns back into real arrays for the client.
function hydrate(row) {
  return {
    ...row,
    categories: parseJson(row.categories, []),
    line_items: parseJson(row.line_items, []),
    document_urls: parseJson(row.document_urls, []),
  };
}

function text(value) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

// Validate + normalize a request body into DB-ready column values. Returns
// { ok, error } or { ok, values }.
function normalize(body) {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Invalid body" };
  }

  if (!body.date || typeof body.date !== "string") {
    return { ok: false, error: "date is required" };
  }

  if (body.odometer === undefined || body.odometer === null || body.odometer === "") {
    return { ok: false, error: "odometer is required" };
  }
  const odometer = Number(body.odometer);
  if (!Number.isFinite(odometer)) {
    return { ok: false, error: "odometer must be a number" };
  }

  let totalCost = null;
  if (body.total_cost !== undefined && body.total_cost !== null && body.total_cost !== "") {
    const c = Number(body.total_cost);
    if (!Number.isFinite(c)) return { ok: false, error: "total_cost must be a number" };
    totalCost = c;
  }

  const categories = Array.isArray(body.categories)
    ? body.categories.filter((c) => CATEGORIES.has(c))
    : [];

  const lineItems = [];
  if (Array.isArray(body.line_items)) {
    for (const item of body.line_items) {
      if (!item || typeof item !== "object") continue;
      const description = text(item.description);
      if (!description) continue; // drop blank lines
      let cost = null;
      if (item.cost !== undefined && item.cost !== null && item.cost !== "") {
        const n = Number(item.cost);
        if (!Number.isFinite(n)) return { ok: false, error: "line item cost must be a number" };
        cost = n;
      }
      lineItems.push({ description, cost });
    }
  }

  const documentUrls = [];
  if (Array.isArray(body.document_urls)) {
    for (const doc of body.document_urls) {
      if (!doc) continue;
      const url = typeof doc === "string" ? text(doc) : text(doc.url);
      if (!url) continue;
      const label = typeof doc === "string" ? null : text(doc.label);
      documentUrls.push(label ? { url, label } : { url });
    }
  }

  return {
    ok: true,
    values: {
      date: body.date,
      odometer: Math.round(odometer),
      shop_name: text(body.shop_name),
      total_cost: totalCost,
      categories: JSON.stringify(categories),
      line_items: JSON.stringify(lineItems),
      invoice_number: text(body.invoice_number),
      document_urls: JSON.stringify(documentUrls),
      notes: text(body.notes),
    },
  };
}

async function readBody(request) {
  try {
    return { ok: true, body: await request.json() };
  } catch (_) {
    return { ok: false };
  }
}

export async function getMaintenance(env) {
  const { results } = await env.DB.prepare(
    "SELECT * FROM maintenance_entries ORDER BY date DESC, id DESC"
  ).all();
  return json(results.map(hydrate));
}

export async function createMaintenance(request, env) {
  const addedBy = authedEmail(request, env);
  if (!addedBy) {
    return json({ error: "Unauthorized: no authenticated user email found" }, 401);
  }

  const parsed = await readBody(request);
  if (!parsed.ok) return json({ error: "Invalid JSON body" }, 400);

  const norm = normalize(parsed.body);
  if (!norm.ok) return json({ error: norm.error }, 400);
  const v = norm.values;

  const result = await env.DB.prepare(
    `INSERT INTO maintenance_entries
       (date, odometer, shop_name, total_cost, categories, line_items,
        invoice_number, document_urls, notes, added_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      v.date, v.odometer, v.shop_name, v.total_cost, v.categories,
      v.line_items, v.invoice_number, v.document_urls, v.notes, addedBy
    )
    .run();

  const { results } = await env.DB.prepare(
    "SELECT * FROM maintenance_entries WHERE id = ?"
  )
    .bind(result.meta.last_row_id)
    .all();

  return json(hydrate(results[0]), 201);
}

export async function updateMaintenance(request, env, id) {
  const editor = authedEmail(request, env);
  if (!editor) {
    return json({ error: "Unauthorized: no authenticated user email found" }, 401);
  }

  const parsed = await readBody(request);
  if (!parsed.ok) return json({ error: "Invalid JSON body" }, 400);

  const norm = normalize(parsed.body);
  if (!norm.ok) return json({ error: norm.error }, 400);
  const v = norm.values;

  const result = await env.DB.prepare(
    `UPDATE maintenance_entries SET
       date = ?, odometer = ?, shop_name = ?, total_cost = ?, categories = ?,
       line_items = ?, invoice_number = ?, document_urls = ?, notes = ?,
       updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  )
    .bind(
      v.date, v.odometer, v.shop_name, v.total_cost, v.categories,
      v.line_items, v.invoice_number, v.document_urls, v.notes, id
    )
    .run();

  if (result.meta.changes === 0) return json({ error: "Not found" }, 404);

  const { results } = await env.DB.prepare(
    "SELECT * FROM maintenance_entries WHERE id = ?"
  )
    .bind(id)
    .all();

  return json(hydrate(results[0]));
}

export async function deleteMaintenance(request, env, id) {
  const editor = authedEmail(request, env);
  if (!editor) {
    return json({ error: "Unauthorized: no authenticated user email found" }, 401);
  }

  const result = await env.DB.prepare(
    "DELETE FROM maintenance_entries WHERE id = ?"
  )
    .bind(id)
    .run();

  if (result.meta.changes === 0) return json({ error: "Not found" }, 404);
  return new Response(null, { status: 204 });
}
