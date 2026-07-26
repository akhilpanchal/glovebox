import { json } from "../lib/responses.js";
import { authedEmail } from "../lib/auth.js";
import { isYmd, positiveInt, positiveNumber, text } from "../lib/validate.js";

// Validate + normalize a charging-session body. Returns { ok, error } | { ok, values }.
function normalize(body) {
  if (!body || typeof body !== "object") return { ok: false, error: "Invalid body" };

  if (!isYmd(body.date)) {
    return { ok: false, error: "date is required (YYYY-MM-DD)" };
  }

  const odo = positiveInt(body.odometer);
  if (!odo.ok) return { ok: false, error: "odometer must be a positive integer" };

  const kwh = positiveNumber(body.kwh);
  if (!kwh.ok) return { ok: false, error: "kwh must be a positive number" };

  let milesAdded = null;
  if (body.miles_added !== undefined && body.miles_added !== null && body.miles_added !== "") {
    const m = positiveNumber(body.miles_added);
    if (!m.ok) return { ok: false, error: "miles_added must be a positive number" };
    milesAdded = m.value;
  }

  return {
    ok: true,
    values: {
      date: body.date,
      odometer: odo.value,
      kwh: kwh.value,
      miles_added: milesAdded,
      notes: text(body.notes),
    },
  };
}

export async function getCharging(env) {
  const { results } = await env.DB.prepare(
    "SELECT * FROM charging_sessions ORDER BY date DESC, id DESC"
  ).all();
  return json(results);
}

export async function createCharging(request, env) {
  const addedBy = authedEmail(request, env);
  if (!addedBy) {
    return json({ error: "Unauthorized: no authenticated user email found" }, 401);
  }

  let body;
  try {
    body = await request.json();
  } catch (_) {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const norm = normalize(body);
  if (!norm.ok) return json({ error: norm.error }, 400);
  const v = norm.values;

  const result = await env.DB.prepare(
    `INSERT INTO charging_sessions (date, odometer, kwh, miles_added, notes, added_by)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(v.date, v.odometer, v.kwh, v.miles_added, v.notes, addedBy)
    .run();

  const { results } = await env.DB.prepare(
    "SELECT * FROM charging_sessions WHERE id = ?"
  )
    .bind(result.meta.last_row_id)
    .all();

  return json(results[0], 201);
}

export async function updateCharging(request, env, id) {
  const editor = authedEmail(request, env);
  if (!editor) {
    return json({ error: "Unauthorized: no authenticated user email found" }, 401);
  }

  let body;
  try {
    body = await request.json();
  } catch (_) {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const norm = normalize(body);
  if (!norm.ok) return json({ error: norm.error }, 400);
  const v = norm.values;

  const result = await env.DB.prepare(
    `UPDATE charging_sessions SET date = ?, odometer = ?, kwh = ?, miles_added = ?, notes = ?
     WHERE id = ?`
  )
    .bind(v.date, v.odometer, v.kwh, v.miles_added, v.notes, id)
    .run();

  if (result.meta.changes === 0) return json({ error: "Not found" }, 404);

  const { results } = await env.DB.prepare(
    "SELECT * FROM charging_sessions WHERE id = ?"
  )
    .bind(id)
    .all();

  return json(results[0]);
}

export async function deleteCharging(request, env, id) {
  const editor = authedEmail(request, env);
  if (!editor) {
    return json({ error: "Unauthorized: no authenticated user email found" }, 401);
  }

  const result = await env.DB.prepare(
    "DELETE FROM charging_sessions WHERE id = ?"
  )
    .bind(id)
    .run();

  if (result.meta.changes === 0) return json({ error: "Not found" }, 404);
  return new Response(null, { status: 204 });
}
