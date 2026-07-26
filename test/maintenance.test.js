// Handler tests for the maintenance API — the richest normalizer (categories
// whitelist, line-item filtering, JSON-column hydration). Run with: node --test

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  getMaintenance,
  createMaintenance,
  updateMaintenance,
  deleteMaintenance,
} from "../src/handlers/maintenance.js";
import { makeDB, makeRequest } from "./helpers/db.js";

const EMAIL = "family@example.com";
const OK_BODY = { date: "2026-07-25", odometer: 65500 };

// Positions of the JSON-text columns in the INSERT bind list:
// [date, odometer, shop_name, total_cost, categories, line_items,
//  invoice_number, document_urls, notes, added_by]
const CATEGORIES = 4;
const LINE_ITEMS = 5;
const DOCUMENT_URLS = 7;
const ADDED_BY = 9;

// --- getMaintenance: hydration ----------------------------------------------

test("getMaintenance hydrates JSON-text columns into real arrays", async () => {
  const stored = {
    id: 1,
    categories: JSON.stringify(["Oil"]),
    service_items: JSON.stringify(["oil"]),
    line_items: JSON.stringify([{ description: "Oil change", cost: 89.99 }]),
    document_urls: JSON.stringify([]),
  };
  const { DB } = makeDB([{ results: [stored] }]);
  const res = await getMaintenance({ DB });
  const [row] = await res.json();
  assert.deepEqual(row.categories, ["Oil"]);
  assert.deepEqual(row.line_items, [{ description: "Oil change", cost: 89.99 }]);
  assert.deepEqual(row.service_items, ["oil"]);
});

// --- createMaintenance: auth + validation -----------------------------------

test("createMaintenance 401/400 on auth and bad JSON", async () => {
  const { DB, statements } = makeDB();
  assert.equal((await createMaintenance(makeRequest({ body: OK_BODY }), { DB })).status, 401);
  assert.equal((await createMaintenance(makeRequest({ email: EMAIL, rawBody: "{" }), { DB })).status, 400);
  assert.equal(statements.length, 0);
});

test("createMaintenance rejects bad date and non-positive odometer", async () => {
  const { DB } = makeDB();
  for (const body of [{ ...OK_BODY, date: "nope" }, { ...OK_BODY, odometer: 0 }, { ...OK_BODY, odometer: "" }]) {
    assert.equal((await createMaintenance(makeRequest({ email: EMAIL, body }), { DB })).status, 400, JSON.stringify(body));
  }
});

test("createMaintenance filters unknown categories against the whitelist", async () => {
  const { DB, statements } = makeDB([{ meta: { last_row_id: 1 } }, { results: [{ id: 1, categories: "[]", line_items: "[]", document_urls: "[]", service_items: "[]" }] }]);
  await createMaintenance(makeRequest({ email: EMAIL, body: { ...OK_BODY, categories: ["Oil", "Bogus", "Brakes"] } }), { DB });
  assert.deepEqual(JSON.parse(statements[0].binds[CATEGORIES]), ["Oil", "Brakes"]);
});

test("createMaintenance drops blank-description line items and rejects a non-numeric cost", async () => {
  // blank description dropped
  const kept = makeDB([{ meta: { last_row_id: 1 } }, { results: [{ id: 1, categories: "[]", line_items: "[]", document_urls: "[]", service_items: "[]" }] }]);
  await createMaintenance(
    makeRequest({ email: EMAIL, body: { ...OK_BODY, line_items: [{ description: "  ", cost: 5 }, { description: "Oil", cost: 90 }] } }),
    { DB: kept.DB }
  );
  assert.deepEqual(JSON.parse(kept.statements[0].binds[LINE_ITEMS]), [{ description: "Oil", cost: 90 }]);

  // non-numeric cost → 400
  const bad = makeDB();
  const res = await createMaintenance(
    makeRequest({ email: EMAIL, body: { ...OK_BODY, line_items: [{ description: "Oil", cost: "free" }] } }),
    { DB: bad.DB }
  );
  assert.equal(res.status, 400);
});

test("createMaintenance allows a zero or negative cost (free warranty work / discounts)", async () => {
  const { DB, statements } = makeDB([{ meta: { last_row_id: 1 } }, { results: [{ id: 1, categories: "[]", line_items: "[]", document_urls: "[]", service_items: "[]" }] }]);
  const res = await createMaintenance(
    makeRequest({ email: EMAIL, body: { ...OK_BODY, total_cost: 0, line_items: [{ description: "Discount", cost: -20 }] } }),
    { DB }
  );
  assert.equal(res.status, 201);
  assert.deepEqual(JSON.parse(statements[0].binds[LINE_ITEMS]), [{ description: "Discount", cost: -20 }]);
});

test("createMaintenance normalizes document_urls (string and object forms)", async () => {
  const { DB, statements } = makeDB([{ meta: { last_row_id: 1 } }, { results: [{ id: 1, categories: "[]", line_items: "[]", document_urls: "[]", service_items: "[]" }] }]);
  await createMaintenance(
    makeRequest({ email: EMAIL, body: { ...OK_BODY, document_urls: ["https://a.test/x.pdf", { url: "https://b.test/y.pdf", label: "Invoice" }, { url: "" }] } }),
    { DB }
  );
  assert.deepEqual(JSON.parse(statements[0].binds[DOCUMENT_URLS]), [
    { url: "https://a.test/x.pdf" },
    { url: "https://b.test/y.pdf", label: "Invoice" },
  ]);
});

test("createMaintenance binds the header email and rounds odometer", async () => {
  const { DB, statements } = makeDB([{ meta: { last_row_id: 1 } }, { results: [{ id: 1, categories: "[]", line_items: "[]", document_urls: "[]", service_items: "[]" }] }]);
  await createMaintenance(makeRequest({ email: EMAIL, body: { date: "2026-07-25", odometer: 65499.5, added_by: "attacker@evil.com" } }), { DB });
  assert.equal(statements[0].binds[1], 65500); // rounded
  assert.equal(statements[0].binds[ADDED_BY], EMAIL); // header, not body
});

// --- update / delete --------------------------------------------------------

test("updateMaintenance 404s when absent, hydrates on success", async () => {
  const missing = makeDB([{ meta: { changes: 0 } }]);
  assert.equal((await updateMaintenance(makeRequest({ email: EMAIL, body: OK_BODY }), { DB: missing.DB }, 9)).status, 404);

  const ok = makeDB([{ meta: { changes: 1 } }, { results: [{ id: 2, categories: JSON.stringify(["Oil"]), line_items: "[]", document_urls: "[]", service_items: "[]" }] }]);
  const res = await updateMaintenance(makeRequest({ email: EMAIL, body: OK_BODY }), { DB: ok.DB }, 2);
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).categories, ["Oil"]);
});

test("deleteMaintenance 204/404/401", async () => {
  assert.equal((await deleteMaintenance(makeRequest({ email: EMAIL }), { DB: makeDB([{ meta: { changes: 1 } }]).DB }, 1)).status, 204);
  assert.equal((await deleteMaintenance(makeRequest({ email: EMAIL }), { DB: makeDB([{ meta: { changes: 0 } }]).DB }, 9)).status, 404);
  assert.equal((await deleteMaintenance(makeRequest({}), { DB: makeDB().DB }, 1)).status, 401);
});
