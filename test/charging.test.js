// Handler tests for the charging sessions API. Run with: node --test

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  getCharging,
  createCharging,
  updateCharging,
  deleteCharging,
} from "../src/handlers/charging.js";
import { makeDB, makeRequest } from "./helpers/db.js";

const EMAIL = "family@example.com";
const OK_BODY = { date: "2026-07-25", odometer: 65410, kwh: 8.4 };

// --- getCharging ------------------------------------------------------------

test("getCharging returns rows newest-first", async () => {
  const { DB, statements } = makeDB([{ results: [{ id: 1 }] }]);
  const res = await getCharging({ DB });
  assert.equal(res.status, 200);
  assert.match(statements[0].sql, /ORDER BY date DESC, id DESC/);
});

// --- createCharging: auth + body --------------------------------------------

test("createCharging 401s unauthenticated and 400s on bad JSON", async () => {
  const { DB, statements } = makeDB();
  assert.equal((await createCharging(makeRequest({ body: OK_BODY }), { DB })).status, 401);
  assert.equal((await createCharging(makeRequest({ email: EMAIL, rawBody: "x{" }), { DB })).status, 400);
  assert.equal(statements.length, 0);
});

// --- createCharging: validation ---------------------------------------------

test("createCharging rejects bad date/odometer/kwh", async () => {
  const { DB, statements } = makeDB();
  const bad = [
    { ...OK_BODY, date: "2026-02-30" }, // impossible date
    { ...OK_BODY, odometer: 0 },
    { ...OK_BODY, odometer: "" },
    { ...OK_BODY, kwh: 0 }, // kwh must be positive
    { ...OK_BODY, kwh: -2 },
    { ...OK_BODY, kwh: "" },
  ];
  for (const body of bad) {
    assert.equal((await createCharging(makeRequest({ email: EMAIL, body }), { DB })).status, 400, JSON.stringify(body));
  }
  assert.equal(statements.length, 0);
});

test("createCharging treats miles_added as optional but rejects non-positive when present (B2)", async () => {
  const { DB } = makeDB();
  assert.equal((await createCharging(makeRequest({ email: EMAIL, body: { ...OK_BODY, miles_added: -5 } }), { DB })).status, 400);
  assert.equal((await createCharging(makeRequest({ email: EMAIL, body: { ...OK_BODY, miles_added: 0 } }), { DB })).status, 400);
  assert.equal((await createCharging(makeRequest({ email: EMAIL, body: { ...OK_BODY, miles_added: "abc" } }), { DB })).status, 400);
});

// --- createCharging: happy path ---------------------------------------------

test("createCharging rounds odometer, defaults miles_added to null, binds header email", async () => {
  const row = { id: 4, ...OK_BODY };
  const { DB, statements } = makeDB([{ meta: { last_row_id: 4 } }, { results: [row] }]);
  const res = await createCharging(
    makeRequest({ email: EMAIL, body: { date: "2026-07-25", odometer: 65409.6, kwh: "8.4" } }),
    { DB }
  );
  assert.equal(res.status, 201);
  assert.deepEqual(await res.json(), row);

  // INSERT binds: [date, odometer(int), kwh, miles_added, notes, added_by]
  assert.deepEqual(statements[0].binds, ["2026-07-25", 65410, 8.4, null, null, EMAIL]);
});

test("createCharging keeps a provided miles_added", async () => {
  const { DB, statements } = makeDB([{ meta: { last_row_id: 1 } }, { results: [{ id: 1 }] }]);
  await createCharging(makeRequest({ email: EMAIL, body: { ...OK_BODY, miles_added: 30 } }), { DB });
  assert.equal(statements[0].binds[3], 30);
});

// --- update / delete --------------------------------------------------------

test("updateCharging 404s when absent and 200s on success", async () => {
  const missing = makeDB([{ meta: { changes: 0 } }]);
  assert.equal((await updateCharging(makeRequest({ email: EMAIL, body: OK_BODY }), { DB: missing.DB }, 9)).status, 404);

  const ok = makeDB([{ meta: { changes: 1 } }, { results: [{ id: 2 }] }]);
  assert.equal((await updateCharging(makeRequest({ email: EMAIL, body: OK_BODY }), { DB: ok.DB }, 2)).status, 200);
});

test("deleteCharging 204/404/401", async () => {
  const ok = makeDB([{ meta: { changes: 1 } }]);
  assert.equal((await deleteCharging(makeRequest({ email: EMAIL }), { DB: ok.DB }, 1)).status, 204);
  const missing = makeDB([{ meta: { changes: 0 } }]);
  assert.equal((await deleteCharging(makeRequest({ email: EMAIL }), { DB: missing.DB }, 9)).status, 404);
  assert.equal((await deleteCharging(makeRequest({}), { DB: makeDB().DB }, 1)).status, 401);
});
