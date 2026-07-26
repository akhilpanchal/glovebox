// Tests for the shared validators. These are pure functions, so no harness —
// they pin the exact rules the handlers now share. Run with: node --test

import { test } from "node:test";
import assert from "node:assert/strict";

import { text, isYmd, positiveNumber, positiveInt } from "../src/lib/validate.js";

// --- text -------------------------------------------------------------------

test("text trims and nulls empty/whitespace", () => {
  assert.equal(text("  hi  "), "hi");
  assert.equal(text(""), null);
  assert.equal(text("   "), null);
  assert.equal(text(null), null);
  assert.equal(text(undefined), null);
  assert.equal(text(42), "42");
});

// --- isYmd ------------------------------------------------------------------

test("isYmd accepts real calendar dates", () => {
  assert.equal(isYmd("2026-07-25"), true);
  assert.equal(isYmd("2024-02-29"), true); // leap day
  assert.equal(isYmd("2019-10-01"), true);
});

test("isYmd rejects malformed or impossible dates", () => {
  assert.equal(isYmd("2026-02-30"), false); // Feb 30 doesn't exist
  assert.equal(isYmd("2025-02-29"), false); // not a leap year
  assert.equal(isYmd("2026-13-01"), false); // month 13
  assert.equal(isYmd("2026-00-10"), false); // month 0
  assert.equal(isYmd("2026-07-32"), false); // day 32
  assert.equal(isYmd("2026-7-5"), false); // not zero-padded
  assert.equal(isYmd("07/25/2026"), false); // wrong format
  assert.equal(isYmd("banana"), false);
  assert.equal(isYmd(""), false);
  assert.equal(isYmd(20260725), false); // not a string
  assert.equal(isYmd(null), false);
});

// --- positiveNumber ---------------------------------------------------------

test("positiveNumber accepts finite values > 0", () => {
  assert.deepEqual(positiveNumber(9.2), { ok: true, value: 9.2 });
  assert.deepEqual(positiveNumber("9.2"), { ok: true, value: 9.2 });
  assert.deepEqual(positiveNumber(0.001), { ok: true, value: 0.001 });
});

test("positiveNumber rejects zero, negatives, blanks, and non-numbers", () => {
  assert.equal(positiveNumber(0).ok, false);
  assert.equal(positiveNumber(-1).ok, false);
  assert.equal(positiveNumber("").ok, false); // the entries.js silent-zero bug
  assert.equal(positiveNumber("   ").ok, false); // Number("  ") is 0, caught by > 0
  assert.equal(positiveNumber(null).ok, false);
  assert.equal(positiveNumber(undefined).ok, false);
  assert.equal(positiveNumber("abc").ok, false);
  assert.equal(positiveNumber(Infinity).ok, false);
  assert.equal(positiveNumber(NaN).ok, false);
});

// --- positiveInt ------------------------------------------------------------

test("positiveInt rounds to a whole number", () => {
  assert.deepEqual(positiveInt(65340.7), { ok: true, value: 65341 });
  assert.deepEqual(positiveInt("65340"), { ok: true, value: 65340 });
  assert.deepEqual(positiveInt(3), { ok: true, value: 3 });
});

test("positiveInt rejects values that round to 0 or below", () => {
  assert.equal(positiveInt(0.4).ok, false); // rounds to 0
  assert.equal(positiveInt(0).ok, false);
  assert.equal(positiveInt(-5).ok, false);
  assert.equal(positiveInt("").ok, false);
});
