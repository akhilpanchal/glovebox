// Tests for the due-ness calculator. Run with:  node --test
// No test framework/deps — Node's built-in test runner + assert (per the
// project's testing approach: no vitest/vite).
//
// Fixtures mirror this car's REAL data as of 2026-07-24 (pulled from the local
// D1 mirror of production): 17 maintenance entries + fuel/charging odo readings.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  computeDueness,
  mileageRate,
  estimateCurrentOdometer,
  collectReadings,
  resolveLastDone,
  addMonths,
  addDays,
  daysBetween,
  FACTORY_ANCHOR,
} from "../src/lib/dueness.js";

const ASOF = "2026-07-24";

// --- real maintenance history (date, odometer, service_items) ---------------
const HISTORY = [
  { date: "2019-10-01", odometer: 3, service_items: [] },
  { date: "2020-05-21", odometer: 4558, service_items: ["oil"] },
  { date: "2020-10-20", odometer: 9270, service_items: ["oil", "tire_rotation"] },
  { date: "2021-04-23", odometer: 15050, service_items: ["oil"] },
  { date: "2021-05-14", odometer: 15755, service_items: [] },
  { date: "2021-10-14", odometer: 19622, service_items: ["oil", "tire_rotation", "cabin_filter", "engine_air_filter", "brake_inspection"] },
  { date: "2022-11-08", odometer: 27215, service_items: ["oil", "cabin_filter", "engine_air_filter"] },
  { date: "2023-01-05", odometer: 27359, service_items: [] },
  { date: "2023-02-03", odometer: 27359, service_items: [] },
  { date: "2023-02-27", odometer: 27380, service_items: [] },
  { date: "2023-10-06", odometer: 32242, service_items: ["oil", "brake_fluid", "transmission_fluid"] },
  { date: "2024-07-22", odometer: 36687, service_items: ["oil", "tire_rotation"] },
  { date: "2024-10-21", odometer: 40411, service_items: [] },
  { date: "2024-12-09", odometer: 41953, service_items: [] },
  { date: "2025-08-01", odometer: 50418, service_items: ["oil", "brake_fluid", "cabin_filter", "engine_air_filter", "brake_inspection"] },
  { date: "2026-01-29", odometer: 57843, service_items: ["oil", "brake_inspection", "transmission_fluid"] },
  { date: "2026-07-18", odometer: 65157, service_items: ["oil", "tire_rotation", "brake_inspection"] },
];

// fuel + charging odometer readings (no service_items) that feed the rate window
const EXTRA_READINGS = [
  { date: "2026-07-18", odometer: 63940 },
  { date: "2026-07-18", odometer: 64178 },
  { date: "2026-07-18", odometer: 64417 },
  { date: "2026-07-18", odometer: 64655 },
  { date: "2026-07-18", odometer: 64939 },
  { date: "2026-07-19", odometer: 65204 },
  { date: "2026-07-20", odometer: 65257 }, // charging — latest actual reading
];

const byItem = (verdicts) => Object.fromEntries(verdicts.map((v) => [v.item, v]));
const caveatTypes = (v) => v.caveats.map((c) => c.type);

// --- date helpers -----------------------------------------------------------

test("addMonths advances and clamps to the target month's last day", () => {
  assert.equal(addMonths("2026-07-18", 12), "2027-07-18");
  assert.equal(addMonths("2023-01-29", 36), "2026-01-29");
  assert.equal(addMonths("2019-10-01", 120), "2029-10-01");
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28"); // clamp Jan-31 → Feb
  assert.equal(addMonths("2024-01-31", 1), "2024-02-29"); // leap-year clamp
});

test("daysBetween is signed and TZ-stable", () => {
  assert.equal(daysBetween("2026-07-24", "2026-07-24"), 0);
  assert.equal(daysBetween("2026-07-24", "2026-07-18"), -6);
  assert.equal(daysBetween("2026-07-24", "2027-07-18"), 359);
});

test("addDays rounds fractional input and crosses month/year boundaries", () => {
  assert.equal(addDays("2026-07-24", 0), "2026-07-24");
  assert.equal(addDays("2026-07-24", -0.166), "2026-07-24"); // rounds to 0
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
});

// --- mileage rate & odometer estimate ---------------------------------------

test("collectReadings merges + sorts and drops blanks", () => {
  const rows = collectReadings(HISTORY, EXTRA_READINGS);
  assert.ok(rows.length > 0);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1].date <= rows[i].date);
  assert.equal(rows[0].odometer, 3); // earliest
  assert.equal(rows[rows.length - 1].odometer, 65257); // latest
});

test("mileageRate uses the trailing 12-month window (~42 mi/day here)", () => {
  const readings = collectReadings(HISTORY, EXTRA_READINGS);
  const rate = mileageRate(readings, ASOF);
  assert.equal(rate.method, "trailing-window");
  assert.ok(Math.abs(rate.milesPerDay - 42.04) < 0.1, `got ${rate.milesPerDay}`);
});

test("mileageRate falls back to lifetime when the window is empty", () => {
  const readings = collectReadings(HISTORY, EXTRA_READINGS);
  const rate = mileageRate(readings, "2030-01-01"); // no readings in last 365d
  assert.equal(rate.method, "lifetime");
  // lifetime ≈ (65257-3)/daysBetween(2019-10-01,2026-07-20) ≈ 26 mi/day
  assert.ok(Math.abs(rate.milesPerDay - 26) < 1, `got ${rate.milesPerDay}`);
});

test("estimateCurrentOdometer projects forward from the latest reading", () => {
  const readings = collectReadings(HISTORY, EXTRA_READINGS);
  const rate = mileageRate(readings, ASOF);
  // latest 65257 @ 2026-07-20, +4 days * ~42 ≈ 65425
  assert.equal(estimateCurrentOdometer(readings, ASOF, rate.milesPerDay), 65425);
});

// --- last-done resolution ---------------------------------------------------

test("resolveLastDone picks the newest tagged entry", () => {
  const ld = resolveLastDone("oil", HISTORY);
  assert.deepEqual(ld, { date: "2026-07-18", odometer: 65157, source: "history" });
});

test("resolveLastDone falls back to the factory anchor when never recorded", () => {
  const ld = resolveLastDone("spark_plugs", HISTORY);
  assert.deepEqual(ld, { ...FACTORY_ANCHOR, source: "factory-anchor" });
});

// --- full computeDueness against real data ----------------------------------

test("computeDueness returns one verdict per item with shared computedAt", () => {
  const verdicts = computeDueness({ asOf: ASOF, maintenanceEntries: HISTORY, extraReadings: EXTRA_READINGS });
  assert.equal(verdicts.length, 9);
  for (const v of verdicts) {
    assert.equal(v.computedAt.asOf, ASOF);
    assert.equal(v.computedAt.currentOdometer, 65425);
    assert.equal(v.computedAt.milesPerDay, 42.0);
    // every verdict carries a status and a spec
    assert.ok(["overdue", "due_soon", "not_due", "minder_only"].includes(v.status));
    assert.ok(v.spec.source);
  }
});

test("oil: time-floor, not due, calendar_floor caveat, no mile trigger", () => {
  const v = byItem(computeDueness({ asOf: ASOF, maintenanceEntries: HISTORY, extraReadings: EXTRA_READINGS })).oil;
  assert.equal(v.status, "not_due");
  assert.equal(v.lastDone.source, "history");
  assert.deepEqual(v.dueBy, { date: "2027-07-18", odometer: null, trigger: "time" });
  assert.equal(v.remaining.days, 359);
  assert.equal(v.remaining.miles, null);
  assert.deepEqual(caveatTypes(v), ["calendar_floor"]);
});

test("tire_rotation & brake_inspection: minder_only, no dueBy, minder_normal caveat", () => {
  const m = byItem(computeDueness({ asOf: ASOF, maintenanceEntries: HISTORY, extraReadings: EXTRA_READINGS }));
  for (const key of ["tire_rotation", "brake_inspection"]) {
    const v = m[key];
    assert.equal(v.status, "minder_only");
    assert.equal(v.dueBy, null);
    assert.deepEqual(v.remaining, { days: null, miles: null });
    assert.deepEqual(caveatTypes(v), ["minder_normal"]);
    assert.equal(v.lastDone.source, "history"); // still know when it was last done
  }
});

test("cabin/engine air filter: severe-ceiling at the mileage line → overdue", () => {
  const m = byItem(computeDueness({ asOf: ASOF, maintenanceEntries: HISTORY, extraReadings: EXTRA_READINGS }));
  for (const key of ["cabin_filter", "engine_air_filter"]) {
    const v = m[key];
    assert.equal(v.status, "overdue", key);
    assert.equal(v.dueBy.trigger, "miles");
    assert.equal(v.dueBy.odometer, 65418); // 50418 + 15000
    assert.ok(v.remaining.miles < 0);
    assert.ok(caveatTypes(v).includes("severe_ceiling"));
    assert.ok(caveatTypes(v).includes("projected_mileage"));
  }
});

test("transmission_fluid: whichever-first binds on time, not due", () => {
  const v = byItem(computeDueness({ asOf: ASOF, maintenanceEntries: HISTORY, extraReadings: EXTRA_READINGS })).transmission_fluid;
  assert.equal(v.status, "not_due");
  assert.equal(v.dueBy.trigger, "time");
  assert.equal(v.dueBy.date, "2029-01-29"); // 2026-01-29 + 36mo
  assert.equal(v.remaining.miles, 105343 - 65425); // mile trigger still tracked
  assert.ok(caveatTypes(v).includes("severe_ceiling"));
});

test("brake_fluid: time-floor 36mo, not due", () => {
  const v = byItem(computeDueness({ asOf: ASOF, maintenanceEntries: HISTORY, extraReadings: EXTRA_READINGS })).brake_fluid;
  assert.equal(v.status, "not_due");
  assert.deepEqual(v.dueBy, { date: "2028-08-01", odometer: null, trigger: "time" });
  assert.deepEqual(caveatTypes(v), ["calendar_floor"]);
});

test("spark_plugs: factory-anchored max-backstop on miles, not due", () => {
  const v = byItem(computeDueness({ asOf: ASOF, maintenanceEntries: HISTORY, extraReadings: EXTRA_READINGS })).spark_plugs;
  assert.equal(v.status, "not_due");
  assert.equal(v.lastDone.source, "factory-anchor");
  assert.equal(v.dueBy.trigger, "miles");
  assert.equal(v.dueBy.odometer, 100003); // 3 + 100000
  assert.equal(v.remaining.miles, 100003 - 65425);
  assert.deepEqual(caveatTypes(v).sort(), ["factory_anchor", "medium_confidence", "projected_mileage"].sort());
});

test("coolant: factory-anchored whichever-first binds on time (no projected caveat)", () => {
  const v = byItem(computeDueness({ asOf: ASOF, maintenanceEntries: HISTORY, extraReadings: EXTRA_READINGS })).coolant;
  assert.equal(v.status, "not_due");
  assert.equal(v.lastDone.source, "factory-anchor");
  assert.equal(v.dueBy.trigger, "time");
  assert.equal(v.dueBy.date, "2029-10-01"); // 2019-10-01 + 120mo
  const types = caveatTypes(v);
  assert.ok(types.includes("factory_anchor"));
  assert.ok(types.includes("medium_confidence"));
  assert.ok(!types.includes("projected_mileage")); // binding trigger is time, not a projection
});

// --- synthetic status-boundary cases ----------------------------------------

test("overdue: an oil change well past its 12-month floor", () => {
  const history = [{ date: "2024-01-01", odometer: 30000, service_items: ["oil"] }];
  const v = byItem(computeDueness({ asOf: ASOF, maintenanceEntries: history })).oil;
  assert.equal(v.status, "overdue");
  assert.ok(v.remaining.days < 0);
  assert.equal(v.dueBy.date, "2025-01-01");
});

test("due_soon by time: oil floor within 30 days", () => {
  const history = [{ date: "2025-08-01", odometer: 50000, service_items: ["oil"] }];
  const v = byItem(computeDueness({ asOf: ASOF, maintenanceEntries: history })).oil;
  // due 2026-08-01, asOf 2026-07-24 → 8 days out
  assert.equal(v.status, "due_soon");
  assert.equal(v.remaining.days, 8);
});

test("due_soon by miles: a filter within 1,000 mi of the ceiling", () => {
  // last @ 51000, current estimate 65425 → dueOdo 66000, remaining 575 mi
  const history = [
    { date: "2025-08-01", odometer: 51000, service_items: ["cabin_filter"] },
    ...EXTRA_READINGS.map((r) => ({ ...r, service_items: [] })),
  ];
  const v = byItem(computeDueness({ asOf: ASOF, maintenanceEntries: history })).cabin_filter;
  assert.equal(v.dueBy.odometer, 66000);
  assert.ok(v.remaining.miles > 0 && v.remaining.miles <= 1000, `remaining ${v.remaining.miles}`);
  assert.equal(v.status, "due_soon");
});

test("only: computes a subset of items", () => {
  const verdicts = computeDueness({ asOf: ASOF, maintenanceEntries: HISTORY, extraReadings: EXTRA_READINGS, only: ["oil", "coolant"] });
  assert.deepEqual(verdicts.map((v) => v.item), ["oil", "coolant"]);
});
