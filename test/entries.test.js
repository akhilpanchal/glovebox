// Handler tests for the fuel entries API. Uses the fake D1 spy + real Request —
// no Worker, no network. Run with: node --test

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  getEntries,
  postEntry,
  updateEntry,
  deleteEntry,
} from "../src/handlers/entries.js";
import { makeDB, makeRequest } from "./helpers/db.js";

const EMAIL = "family@example.com";

// --- getEntries -------------------------------------------------------------

test("getEntries returns rows newest-first", async () => {
  const rows = [{ id: 2 }, { id: 1 }];
  const { DB, statements } = makeDB([{ results: rows }]);
  const res = await getEntries({ DB });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), rows);
  assert.match(statements[0].sql, /ORDER BY date DESC, id DESC/);
});

// --- postEntry: auth + body --------------------------------------------------

test("postEntry 401s with no authenticated email", async () => {
  const { DB, statements } = makeDB();
  const res = await postEntry(makeRequest({ body: { date: "2026-07-25", odometer: 1, volume: 1 } }), { DB });
  assert.equal(res.status, 401);
  assert.equal(statements.length, 0); // never touched the DB
});

test("postEntry 400s on invalid JSON", async () => {
  const { DB } = makeDB();
  const res = await postEntry(makeRequest({ email: EMAIL, rawBody: "{ not json" }), { DB });
  assert.equal(res.status, 400);
});

// --- postEntry: validation ---------------------------------------------------

test("postEntry rejects a missing/blank date", async () => {
  const { DB, statements } = makeDB();
  for (const date of [undefined, "", "banana", "2026-13-01"]) {
    const res = await postEntry(makeRequest({ email: EMAIL, body: { date, odometer: 100, volume: 5 } }), { DB });
    assert.equal(res.status, 400, `date=${date}`);
  }
  assert.equal(statements.length, 0);
});

test("postEntry rejects empty-string odometer (the old silent-zero bug)", async () => {
  const { DB, statements } = makeDB();
  const res = await postEntry(makeRequest({ email: EMAIL, body: { date: "2026-07-25", odometer: "", volume: 5 } }), { DB });
  assert.equal(res.status, 400);
  assert.equal(statements.length, 0); // must NOT have stored odometer 0
});

test("postEntry rejects zero/negative/non-numeric odometer and volume", async () => {
  const { DB } = makeDB();
  const bad = [
    { odometer: 0, volume: 5 },
    { odometer: -3, volume: 5 },
    { odometer: "abc", volume: 5 },
    { odometer: 100, volume: 0 },
    { odometer: 100, volume: -1 },
    { odometer: 100, volume: "" },
  ];
  for (const fields of bad) {
    const res = await postEntry(makeRequest({ email: EMAIL, body: { date: "2026-07-25", ...fields } }), { DB });
    assert.equal(res.status, 400, JSON.stringify(fields));
  }
});

// --- postEntry: happy path ---------------------------------------------------

test("postEntry stores a rounded integer odometer and the header email", async () => {
  const row = { id: 7, date: "2026-07-25", odometer: 65341, volume: 9.2, added_by: EMAIL, notes: null };
  const { DB, statements } = makeDB([
    { meta: { last_row_id: 7 } }, // INSERT
    { results: [row] }, // re-SELECT
  ]);
  const res = await postEntry(
    makeRequest({ email: EMAIL, body: { date: "2026-07-25", odometer: 65340.7, volume: "9.2", notes: "  costco  " } }),
    { DB }
  );
  assert.equal(res.status, 201);
  assert.deepEqual(await res.json(), row);

  const insert = statements[0];
  assert.match(insert.sql, /INSERT INTO fuel_entries/);
  // [date, odometer(int, rounded), volume(number), added_by(header), notes(trimmed)]
  assert.deepEqual(insert.binds, ["2026-07-25", 65341, 9.2, EMAIL, "costco"]);
});

test("postEntry never trusts an added_by from the body", async () => {
  const { DB, statements } = makeDB([{ meta: { last_row_id: 1 } }, { results: [{ id: 1 }] }]);
  await postEntry(
    makeRequest({ email: EMAIL, body: { date: "2026-07-25", odometer: 100, volume: 5, added_by: "attacker@evil.com" } }),
    { DB }
  );
  assert.equal(statements[0].binds[3], EMAIL); // header wins, body ignored
});

test("postEntry stores null for an omitted or whitespace-only note", async () => {
  const { DB, statements } = makeDB([{ meta: { last_row_id: 1 } }, { results: [{ id: 1 }] }]);
  await postEntry(makeRequest({ email: EMAIL, body: { date: "2026-07-25", odometer: 100, volume: 5, notes: "   " } }), { DB });
  assert.equal(statements[0].binds[4], null);
});

// --- updateEntry -------------------------------------------------------------

test("updateEntry 404s when the row doesn't exist", async () => {
  const { DB } = makeDB([{ meta: { changes: 0 } }]);
  const res = await updateEntry(makeRequest({ email: EMAIL, body: { date: "2026-07-25", odometer: 100, volume: 5 } }), { DB }, 999);
  assert.equal(res.status, 404);
});

test("updateEntry rounds odometer and returns the updated row", async () => {
  const row = { id: 3, odometer: 65341 };
  const { DB, statements } = makeDB([{ meta: { changes: 1 } }, { results: [row] }]);
  const res = await updateEntry(makeRequest({ email: EMAIL, body: { date: "2026-07-25", odometer: 65340.6, volume: 5 } }), { DB }, 3);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), row);
  assert.equal(statements[0].binds[1], 65341); // odometer rounded
  assert.equal(statements[0].binds[4], 3); // WHERE id
});

test("updateEntry 401s and 400s like postEntry", async () => {
  const { DB } = makeDB();
  assert.equal((await updateEntry(makeRequest({ body: {} }), { DB }, 1)).status, 401);
  assert.equal((await updateEntry(makeRequest({ email: EMAIL, rawBody: "x" }), { DB }, 1)).status, 400);
  assert.equal((await updateEntry(makeRequest({ email: EMAIL, body: { date: "2026-07-25", odometer: 0, volume: 5 } }), { DB }, 1)).status, 400);
});

// --- deleteEntry -------------------------------------------------------------

test("deleteEntry 204s on success, 404s when absent, 401s unauthenticated", async () => {
  const ok = makeDB([{ meta: { changes: 1 } }]);
  assert.equal((await deleteEntry(makeRequest({ email: EMAIL }), { DB: ok.DB }, 1)).status, 204);

  const missing = makeDB([{ meta: { changes: 0 } }]);
  assert.equal((await deleteEntry(makeRequest({ email: EMAIL }), { DB: missing.DB }, 9)).status, 404);

  const noauth = makeDB();
  assert.equal((await deleteEntry(makeRequest({}), { DB: noauth.DB }, 1)).status, 401);
  assert.equal(noauth.statements.length, 0);
});
