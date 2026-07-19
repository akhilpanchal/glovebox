import { json } from "../lib/responses.js";
import { authedEmail } from "../lib/auth.js";
import { parseJson } from "../lib/columns.js";

function text(value) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

// Always return a well-shaped object, even before the singleton row exists.
function hydrate(row) {
  if (!row) {
    return {
      insurer_name: null,
      policy_number: null,
      expiry_date: null,
      policy_pdf_url: null,
      emergency_phones: [],
      updated_by: null,
      updated_at: null,
    };
  }
  return { ...row, emergency_phones: parseJson(row.emergency_phones, []) };
}

function normalize(body) {
  if (!body || typeof body !== "object") return { ok: false, error: "Invalid body" };

  const phones = [];
  if (Array.isArray(body.emergency_phones)) {
    for (const p of body.emergency_phones) {
      if (!p) continue;
      const number = typeof p === "string" ? text(p) : text(p.number);
      if (!number) continue;
      const label = typeof p === "string" ? null : text(p.label);
      phones.push(label ? { label, number } : { number });
    }
  }

  return {
    ok: true,
    values: {
      insurer_name: text(body.insurer_name),
      policy_number: text(body.policy_number),
      expiry_date: text(body.expiry_date),
      policy_pdf_url: text(body.policy_pdf_url),
      emergency_phones: JSON.stringify(phones),
    },
  };
}

export async function getInsurance(env) {
  const { results } = await env.DB.prepare(
    "SELECT * FROM insurance WHERE id = 1"
  ).all();
  return json(hydrate(results[0]));
}

export async function putInsurance(request, env) {
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

  await env.DB.prepare(
    `INSERT INTO insurance
       (id, insurer_name, policy_number, expiry_date, policy_pdf_url,
        emergency_phones, updated_by, updated_at)
     VALUES (1, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(id) DO UPDATE SET
       insurer_name = excluded.insurer_name,
       policy_number = excluded.policy_number,
       expiry_date = excluded.expiry_date,
       policy_pdf_url = excluded.policy_pdf_url,
       emergency_phones = excluded.emergency_phones,
       updated_by = excluded.updated_by,
       updated_at = CURRENT_TIMESTAMP`
  )
    .bind(
      v.insurer_name, v.policy_number, v.expiry_date, v.policy_pdf_url,
      v.emergency_phones, editor
    )
    .run();

  const { results } = await env.DB.prepare(
    "SELECT * FROM insurance WHERE id = 1"
  ).all();
  return json(hydrate(results[0]));
}
