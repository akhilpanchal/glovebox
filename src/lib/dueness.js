// Due-ness calculator for the 2019 Honda Clarity PHEV.
//
// Grounding-by-construction: this module does ALL the date/mileage arithmetic
// deterministically in JS and returns a structured verdict. The agent only
// phrases what this returns — it never computes due-ness itself, because LLMs
// are unreliable at date/number math.
//
// Pure and I/O-free: every input (including "today") is passed in, so the same
// inputs always produce the same output and the whole thing is unit-testable.
// The caller (the agent's on-demand tool) supplies the DB rows and the date.
//
// Verdict contract (one object per maintenance item, returned as an array):
//   {
//     item,        // canonical key, e.g. "oil"
//     label,       // human label from manual.js
//     status,      // "overdue" | "due_soon" | "not_due" | "minder_only"
//     lastDone:  { date, odometer, source },        // source: "history" | "factory-anchor"
//     dueBy:     { date, odometer, trigger } | null, // trigger: "time" | "miles"; null for minder-only
//     remaining: { days, miles },                    // either may be null
//     spec:      { intervalType, intervalMonths, intervalMiles, basis, source, confidence },
//     caveats:   [ { type, text } ],                 // typed, the agent MUST surface each
//     computedAt:{ asOf, currentOdometer, milesPerDay },
//   }
//
// See migrations/0006 (service_items tags) and src/config/manual.js (intervals).

import { MAINTENANCE_ITEMS } from "../config/manual.js";

// Factory in-service anchor: the car's first recorded reading (2019-10-01, ~3 mi).
// Items with no service record (spark_plugs, coolant) are treated as "not done
// since new" from here — high confidence, because the 2019→now history is dense
// and continuous, so an absence is trustworthy (see v3-dueness-design memory).
export const FACTORY_ANCHOR = { date: "2019-10-01", odometer: 3 };

// "due_soon" window — how close to the binding trigger counts as approaching.
// Tunable. Chosen 2026-07-24: 30 days is the calendar edge; 1,000 miles is a
// touch tighter than 30 days would be at ~42 mi/day (~1,260 mi), which is fine.
export const DUE_SOON_DAYS = 30;
export const DUE_SOON_MILES = 1000;

const MS_PER_DAY = 86_400_000;

// ---- date helpers (UTC, no locale/TZ drift) --------------------------------

function toUTC(isoDate) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

// Whole days from a → b (positive if b is later). Fractional days are truncated
// toward zero by the division; callers round where they need an integer.
export function daysBetween(a, b) {
  return (toUTC(b) - toUTC(a)) / MS_PER_DAY;
}

// Add whole months to a YYYY-MM-DD date, clamping the day to the target month's
// last day (2023-01-29 + 36mo → 2026-01-29; a Jan-31 + 1mo → Feb-28/29).
export function addMonths(isoDate, months) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = total - ny * 12; // 0-based month
  const lastDay = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  const nd = Math.min(d, lastDay);
  const pad = (n) => String(n).padStart(2, "0");
  return `${ny}-${pad(nm + 1)}-${pad(nd)}`;
}

// Add a whole number of days to a YYYY-MM-DD date.
export function addDays(isoDate, days) {
  const t = toUTC(isoDate) + Math.round(days) * MS_PER_DAY;
  const dt = new Date(t);
  const pad = (n) => String(n).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

// ---- mileage rate & current-odometer estimate ------------------------------

// Gather every dated odometer reading from the maintenance history plus any
// extra sources (fuel + charging), sorted ascending by date. Duplicate/blank
// odometers are dropped; the DB stores odometer in miles.
export function collectReadings(maintenanceEntries = [], extraReadings = []) {
  const rows = [...maintenanceEntries, ...extraReadings]
    .filter((r) => r && r.date && Number.isFinite(Number(r.odometer)))
    .map((r) => ({ date: r.date, odometer: Number(r.odometer) }));
  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return rows;
}

// Trailing-window miles/day: use the readings from the last `windowDays` before
// asOf; the car's pace is accelerating, so recent history beats the lifetime
// average. Falls back to the lifetime average when the window is too thin to
// span any distance. Returns { milesPerDay, method, spanDays }.
export function mileageRate(readings, asOf, windowDays = 365) {
  const rateFrom = (rows) => {
    if (rows.length < 2) return null;
    const first = rows[0];
    const last = rows[rows.length - 1];
    const span = daysBetween(first.date, last.date);
    if (span <= 0) return null;
    const miles = last.odometer - first.odometer;
    if (miles <= 0) return null;
    return miles / span;
  };

  const windowStart = addDays(asOf, -windowDays);
  const inWindow = readings.filter((r) => r.date >= windowStart && r.date <= asOf);
  const windowed = rateFrom(inWindow);
  if (windowed != null) {
    return { milesPerDay: windowed, method: "trailing-window", spanDays: daysBetween(inWindow[0].date, inWindow[inWindow.length - 1].date) };
  }

  const upToNow = readings.filter((r) => r.date <= asOf);
  const lifetime = rateFrom(upToNow);
  if (lifetime != null) {
    return { milesPerDay: lifetime, method: "lifetime", spanDays: daysBetween(upToNow[0].date, upToNow[upToNow.length - 1].date) };
  }

  return { milesPerDay: 0, method: "unknown", spanDays: 0 };
}

// Estimate the odometer as of `asOf`: take the latest actual reading and project
// forward at `milesPerDay` for the days elapsed since it was taken.
export function estimateCurrentOdometer(readings, asOf, milesPerDay) {
  const past = readings.filter((r) => r.date <= asOf);
  if (past.length === 0) return null;
  const latest = past[past.length - 1];
  const elapsed = daysBetween(latest.date, asOf);
  return Math.round(latest.odometer + milesPerDay * Math.max(0, elapsed));
}

// ---- last-done resolution --------------------------------------------------

// Most recent maintenance entry whose service_items include `key`, or the
// factory anchor if the item was never recorded as done.
export function resolveLastDone(key, maintenanceEntries, factoryAnchor = FACTORY_ANCHOR) {
  const done = maintenanceEntries
    .filter((e) => Array.isArray(e.service_items) && e.service_items.includes(key))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)); // newest first
  if (done.length > 0) {
    return { date: done[0].date, odometer: Number(done[0].odometer), source: "history" };
  }
  return { date: factoryAnchor.date, odometer: factoryAnchor.odometer, source: "factory-anchor" };
}

// ---- caveat texts ----------------------------------------------------------

const CAVEAT_TEXT = {
  factory_anchor:
    "No service record for this item, so it's treated as original since the car went into service (2019-10-01). The history is dense enough that this is a confident assumption, not a guess.",
  medium_confidence:
    "The interval isn't published for the Clarity specifically; it comes from Honda's general spec, so treat it as a guideline rather than an exact figure.",
  severe_ceiling:
    "This interval is Honda's severe-service ceiling. A normal-use driver typically waits for the dashboard Maintenance Minder, which usually calls for it later than this.",
  projected_mileage:
    "The due date is projected from recent driving pace, not a fixed calendar date; it moves as driving habits change.",
  calendar_floor:
    "This is a time floor from the owner's manual. The dashboard Maintenance Minder is the normal trigger and may call for it sooner.",
  minder_normal:
    "Honda publishes no fixed interval for this item — the car's Maintenance Minder is the sole trigger. Check the dashboard for the actual call.",
};

function caveat(type) {
  return { type, text: CAVEAT_TEXT[type] };
}

// ---- status bucketing ------------------------------------------------------

// Bucket from remaining {days, miles} against the binding trigger. remaining.days
// always reflects the binding (earliest) trigger, so OR semantics are correct for
// whichever-first: overdue if either trigger is passed, due_soon if either is near.
function bucket(remainingDays, remainingMiles) {
  const passed =
    (remainingDays != null && remainingDays < 0) ||
    (remainingMiles != null && remainingMiles < 0);
  if (passed) return "overdue";
  const daysSoon = remainingDays != null && remainingDays <= DUE_SOON_DAYS;
  const milesSoon = remainingMiles != null && remainingMiles <= DUE_SOON_MILES;
  if (daysSoon || milesSoon) return "due_soon";
  return "not_due";
}

// ---- per-item verdict ------------------------------------------------------

function verdictFor(key, spec, ctx) {
  const { maintenanceEntries, currentOdometer, milesPerDay, asOf, factoryAnchor } = ctx;
  const lastDone = resolveLastDone(key, maintenanceEntries, factoryAnchor);
  const caveats = [];
  if (lastDone.source === "factory-anchor") caveats.push(caveat("factory_anchor"));
  if (spec.confidence === "medium") caveats.push(caveat("medium_confidence"));

  const base = {
    item: key,
    label: spec.label,
    lastDone,
    spec: {
      intervalType: spec.intervalType,
      intervalMonths: spec.intervalMonths ?? null,
      intervalMiles: spec.intervalMiles ?? null,
      basis: spec.basis ?? null,
      source: spec.source,
      confidence: spec.confidence,
    },
  };

  // minder-only: no published interval, nothing to compute. Defer to dashboard.
  if (spec.intervalType === "minder-only") {
    caveats.push(caveat("minder_normal"));
    return { ...base, status: "minder_only", dueBy: null, remaining: { days: null, miles: null }, caveats };
  }

  // Candidate triggers. Each yields a due date; the binding one is the earliest.
  const candidates = [];

  if (spec.intervalMonths != null) {
    const date = addMonths(lastDone.date, spec.intervalMonths);
    candidates.push({ trigger: "time", date, odometer: null });
  }

  let dueOdo = null;
  if (spec.intervalMiles != null) {
    dueOdo = lastDone.odometer + spec.intervalMiles;
    // Project the date we'd hit that odometer at the current pace.
    const milesToGo = dueOdo - currentOdometer;
    const date = milesPerDay > 0 ? addDays(asOf, milesToGo / milesPerDay) : null;
    candidates.push({ trigger: "miles", date, odometer: dueOdo });
  }

  // Pick the binding (earliest-dated) trigger. A null projected date (rate 0)
  // sorts last so a real calendar date wins.
  candidates.sort((a, b) => {
    if (a.date == null) return 1;
    if (b.date == null) return -1;
    return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
  });
  const binding = candidates[0];

  const remaining = {
    days: binding.date != null ? Math.round(daysBetween(asOf, binding.date)) : null,
    miles: dueOdo != null ? dueOdo - currentOdometer : null,
  };

  // Caveats tied to how the number was derived.
  if (spec.intervalType === "severe-ceiling") caveats.push(caveat("severe_ceiling"));
  if (spec.intervalType === "time-floor") caveats.push(caveat("calendar_floor"));
  if (binding.trigger === "miles") caveats.push(caveat("projected_mileage"));

  return {
    ...base,
    status: bucket(remaining.days, remaining.miles),
    dueBy: { date: binding.date, odometer: binding.odometer, trigger: binding.trigger },
    remaining,
    caveats,
  };
}

// ---- public entry point ----------------------------------------------------

// Compute due-ness for every maintenance item (or a subset via `only`).
// Inputs:
//   asOf                "YYYY-MM-DD" — the day to evaluate against ("today")
//   maintenanceEntries  [{ date, odometer, service_items:[...] }] — the hydrated history
//   extraReadings       [{ date, odometer }] — fuel + charging odo readings (optional)
//   items               interval config (defaults to MAINTENANCE_ITEMS)
//   factoryAnchor       last-done fallback (defaults to FACTORY_ANCHOR)
//   only                array of item keys to compute (defaults to all)
// Returns an array of verdict objects (see contract at top of file).
export function computeDueness({
  asOf,
  maintenanceEntries = [],
  extraReadings = [],
  items = MAINTENANCE_ITEMS,
  factoryAnchor = FACTORY_ANCHOR,
  only = null,
} = {}) {
  const readings = collectReadings(maintenanceEntries, extraReadings);
  const rate = mileageRate(readings, asOf);
  const estimated = estimateCurrentOdometer(readings, asOf, rate.milesPerDay);
  const currentOdometer = estimated != null ? estimated : factoryAnchor.odometer;

  const computedAt = {
    asOf,
    currentOdometer,
    milesPerDay: Math.round(rate.milesPerDay * 10) / 10,
  };

  const ctx = { maintenanceEntries, currentOdometer, milesPerDay: rate.milesPerDay, asOf, factoryAnchor };

  const keys = only ? only.filter((k) => k in items) : Object.keys(items);
  return keys.map((key) => ({ ...verdictFor(key, items[key], ctx), computedAt }));
}
