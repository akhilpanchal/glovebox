// Shared request-body validation for the write handlers. Centralizing these
// rules keeps the three entities (fuel, charging, maintenance) consistent —
// before this, each handler validated slightly differently, and `entries.js`
// silently coerced an empty-string odometer to 0.
//
// Convention: physical quantities (odometer, volume, kWh, miles) must be
// positive. Money (costs) may be 0 or negative (free warranty work, discounts),
// so costs are NOT validated here — the maintenance handler keeps its own
// finite-number check for those.

// Trim a value to a non-empty string, or null. Used for every optional text
// column (notes, shop_name, invoice_number, …) so a whitespace-only value never
// gets stored as literal spaces.
export function text(value) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

// Strict calendar date in YYYY-MM-DD form. Rejects impossible dates like
// 2026-02-30 (which `new Date` would otherwise silently roll over to March 2).
export function isYmd(value) {
  if (typeof value !== "string") return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === mo - 1 &&
    dt.getUTCDate() === d
  );
}

// A finite number strictly greater than zero. Returns { ok, value } | { ok:false }.
// Empty string / null / undefined → not ok (this is what fixes the entries.js
// silent-zero bug: Number("") is 0, which is caught here by the > 0 check).
export function positiveNumber(value) {
  if (value === undefined || value === null || value === "") return { ok: false };
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return { ok: false };
  return { ok: true, value: n };
}

// A positive integer — a positive number rounded to a whole value, re-checked
// so that a sub-1 fraction (0.4) can't round down to a rejected 0. Odometers
// are always whole miles.
export function positiveInt(value) {
  const r = positiveNumber(value);
  if (!r.ok) return { ok: false };
  const n = Math.round(r.value);
  if (n <= 0) return { ok: false };
  return { ok: true, value: n };
}
