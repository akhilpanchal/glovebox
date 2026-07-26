// Handler tests for the insurance singleton API (GET + PUT upsert).
// Run with: node --test

import { test } from "node:test";
import assert from "node:assert/strict";

import { getInsurance, putInsurance } from "../src/handlers/insurance.js";
import { makeDB, makeRequest } from "./helpers/db.js";

const EMAIL = "family@example.com";

// --- getInsurance -----------------------------------------------------------

test("getInsurance returns a well-shaped empty object before the row exists", async () => {
  const { DB } = makeDB([{ results: [] }]); // singleton not yet created
  const res = await getInsurance({ DB });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    insurer_name: null,
    policy_number: null,
    expiry_date: null,
    policy_pdf_url: null,
    emergency_phones: [],
    updated_by: null,
    updated_at: null,
  });
});

test("getInsurance hydrates emergency_phones JSON", async () => {
  const stored = { id: 1, insurer_name: "Geico", emergency_phones: JSON.stringify([{ label: "Claims", number: "1-800-2" }]) };
  const { DB } = makeDB([{ results: [stored] }]);
  const body = await (await getInsurance({ DB })).json();
  assert.deepEqual(body.emergency_phones, [{ label: "Claims", number: "1-800-2" }]);
});

// --- putInsurance -----------------------------------------------------------

test("putInsurance 401s unauthenticated and 400s on bad JSON", async () => {
  const { DB, statements } = makeDB();
  assert.equal((await putInsurance(makeRequest({ body: {} }), { DB })).status, 401);
  assert.equal((await putInsurance(makeRequest({ email: EMAIL, rawBody: "{" }), { DB })).status, 400);
  assert.equal(statements.length, 0);
});

test("putInsurance accepts an empty body (all fields optional) and binds updated_by", async () => {
  const { DB, statements } = makeDB([{ meta: { changes: 1 } }, { results: [{ id: 1, emergency_phones: "[]" }] }]);
  const res = await putInsurance(makeRequest({ email: EMAIL, body: {} }), { DB });
  assert.equal(res.status, 200);
  // upsert binds: [insurer, policy, expiry, pdf_url, phones, updated_by]
  const binds = statements[0].binds;
  assert.deepEqual(binds.slice(0, 4), [null, null, null, null]);
  assert.equal(binds[5], EMAIL); // updated_by from header
});

test("putInsurance validates expiry_date as YYYY-MM-DD when present (B4)", async () => {
  const { DB } = makeDB();
  const res = await putInsurance(makeRequest({ email: EMAIL, body: { expiry_date: "31-12-2027" } }), { DB });
  assert.equal(res.status, 400);
});

test("putInsurance normalizes emergency phones (string + object forms)", async () => {
  const { DB, statements } = makeDB([{ meta: { changes: 1 } }, { results: [{ id: 1, emergency_phones: "[]" }] }]);
  await putInsurance(
    makeRequest({ email: EMAIL, body: { emergency_phones: ["1-800-1", { label: "Roadside", number: "1-800-2" }, { number: "" }] } }),
    { DB }
  );
  assert.deepEqual(JSON.parse(statements[0].binds[4]), [
    { number: "1-800-1" },
    { label: "Roadside", number: "1-800-2" },
  ]);
});
