import { json } from "../lib/responses.js";
import { authedEmail } from "../lib/auth.js";
import { isYmd, positiveInt, positiveNumber, text } from "../lib/validate.js";

export async function getEntries(env) {
  const { results } = await env.DB.prepare(
    "SELECT * FROM fuel_entries ORDER BY date DESC, id DESC"
  ).all();
  return json(results);
}

export async function postEntry(request, env) {
  const addedBy = authedEmail(request, env);
  if (!addedBy) {
    return json(
      { error: "Unauthorized: no authenticated user email found" },
      401
    );
  }

  let body;
  try {
    body = await request.json();
  } catch (err) {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { date, odometer, volume, notes } = body;

  if (!isYmd(date)) {
    return json({ error: "date is required (YYYY-MM-DD)" }, 400);
  }
  const odo = positiveInt(odometer);
  if (!odo.ok) {
    return json({ error: "odometer must be a positive integer" }, 400);
  }
  const vol = positiveNumber(volume);
  if (!vol.ok) {
    return json({ error: "volume must be a positive number" }, 400);
  }

  const result = await env.DB.prepare(
    `INSERT INTO fuel_entries (date, odometer, volume, added_by, notes)
     VALUES (?, ?, ?, ?, ?)`
  )
    .bind(date, odo.value, vol.value, addedBy, text(notes))
    .run();

  const insertedId = result.meta.last_row_id;
  const { results } = await env.DB.prepare(
    "SELECT * FROM fuel_entries WHERE id = ?"
  )
    .bind(insertedId)
    .all();

  return json(results[0], 201);
}

export async function updateEntry(request, env, id) {
  const editor = authedEmail(request, env);
  if (!editor) {
    return json({ error: "Unauthorized: no authenticated user email found" }, 401);
  }

  let body;
  try {
    body = await request.json();
  } catch (err) {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { date, odometer, volume, notes } = body;

  if (!isYmd(date)) {
    return json({ error: "date is required (YYYY-MM-DD)" }, 400);
  }
  const odo = positiveInt(odometer);
  if (!odo.ok) {
    return json({ error: "odometer must be a positive integer" }, 400);
  }
  const vol = positiveNumber(volume);
  if (!vol.ok) {
    return json({ error: "volume must be a positive number" }, 400);
  }

  const result = await env.DB.prepare(
    `UPDATE fuel_entries SET date = ?, odometer = ?, volume = ?, notes = ? WHERE id = ?`
  )
    .bind(date, odo.value, vol.value, text(notes), id)
    .run();

  if (result.meta.changes === 0) return json({ error: "Not found" }, 404);

  const { results } = await env.DB.prepare(
    "SELECT * FROM fuel_entries WHERE id = ?"
  )
    .bind(id)
    .all();

  return json(results[0]);
}

export async function deleteEntry(request, env, id) {
  const editor = authedEmail(request, env);
  if (!editor) {
    return json({ error: "Unauthorized: no authenticated user email found" }, 401);
  }

  const result = await env.DB.prepare(
    "DELETE FROM fuel_entries WHERE id = ?"
  )
    .bind(id)
    .run();

  if (result.meta.changes === 0) return json({ error: "Not found" }, 404);
  return new Response(null, { status: 204 });
}
