// Curated maintenance intervals for the 2019 Honda Clarity Plug-In Hybrid.
// Static, model-specific facts — the source of truth for the due-ness engine.
// Grounding-by-construction: the calculator reads these numbers and computes
// verdicts deterministically; the agent quotes them. NOTHING here is fetched at
// runtime. Update by editing this file (cite the source when you do).
//
// intervalType — what KIND of number this is (drives how the calculator uses it
//   and how the agent phrases it):
//     "minder-only"    no published interval; the car's Maintenance Minder is the
//                      sole trigger. Not computable — defer to the dashboard.
//     "time-floor"     Minder is the normal trigger, but replace at least this
//                      often regardless (owner's-manual calendar backstop).
//     "severe-ceiling" interval for SEVERE driving only; a normal driver waits for
//                      the Minder (longer). Computable, but caveat it.
//     "max-backstop"   hard maximum from general Honda spec (not Clarity-specific).
// basis — how to combine when both time and miles are set: "whichever-first".
// source — "owner-manual" | "honda-schedule" | "general-spec"
// confidence — "high" | "medium" (agent hedges more on medium).
//
// Reference sources (verified 2026-07-23):
//   Owner's-manual intervals: Honda official Clarity PHEV Maintenance Minder doc
//     https://owners.honda.com/utility/download?path=/static/pdfs/2020/Clarity+Plug-In+Hybrid/2020_Clarity_PHEV_Maintenance_Minder_System.pdf
//   Spark plugs (~100k mi): general iridium-plug Honda spec (not Clarity-published).
//   Coolant (10yr/120k first, then 5yr/60k): Honda Long Life Type 2 factory-fill spec.

export const MAINTENANCE_ITEMS = {
  oil: {
    label: "Engine oil & filter", minderCode: "A",
    intervalType: "time-floor", intervalMonths: 12, intervalMiles: null,
    basis: "time",
    source: "owner-manual", sourceNote: "Minder footnote *1", confidence: "high",
  },
  tire_rotation: {
    label: "Tire rotation", minderCode: "1",
    intervalType: "minder-only", intervalMonths: null, intervalMiles: null,
    basis: null,
    source: "owner-manual", sourceNote: "Minder sub-item 1; no interval published", confidence: "high",
  },
  brake_inspection: {
    label: "Front & rear brake inspection", minderCode: "0",
    intervalType: "minder-only", intervalMonths: null, intervalMiles: null,
    basis: null,
    source: "owner-manual", sourceNote: "Minder main item 0; inspection, Minder-triggered", confidence: "high",
  },
  cabin_filter: {
    label: "Dust & pollen (cabin) filter", minderCode: "2",
    intervalType: "severe-ceiling", intervalMonths: null, intervalMiles: 15000,
    basis: "miles",
    source: "owner-manual", sourceNote: "Minder footnote *2 (urban/high-soot)", confidence: "high",
  },
  engine_air_filter: {
    label: "Engine air cleaner element", minderCode: "8",
    intervalType: "severe-ceiling", intervalMonths: null, intervalMiles: 15000,
    basis: "miles",
    source: "owner-manual", sourceNote: "Minder footnote *5 (dusty conditions)", confidence: "high",
  },
  transmission_fluid: {
    label: "Transmission fluid (Honda ATF DW-1)", minderCode: "3",
    intervalType: "severe-ceiling", intervalMonths: 36, intervalMiles: 47500,
    basis: "whichever-first",
    source: "owner-manual", sourceNote: "Minder footnote *3 (mountainous/low-speed)", confidence: "high",
  },
  brake_fluid: {
    label: "Brake fluid (Honda DOT 3)", minderCode: "7",
    intervalType: "time-floor", intervalMonths: 36, intervalMiles: null,
    basis: "time",
    source: "owner-manual", sourceNote: "Minder footnote *4", confidence: "high",
  },
  spark_plugs: {
    label: "Spark plugs (NGK DILZKAR7C11H)", minderCode: "4",
    intervalType: "max-backstop", intervalMonths: null, intervalMiles: 100000,
    basis: "miles",
    source: "general-spec",
    sourceNote: "Not published for the Clarity; iridium-plug general Honda spec ~100k mi",
    confidence: "medium",
  },
  coolant: {
    label: "Engine coolant (Honda Long Life Type 2)", minderCode: "5",
    intervalType: "max-backstop", intervalMonths: 120, intervalMiles: 120000,
    subsequentMonths: 60, subsequentMiles: 60000,   // after the first change
    basis: "whichever-first",
    source: "general-spec",
    sourceNote: "Not published for the Clarity; Honda Type 2 factory-fill: first 10yr/120k, then 5yr/60k",
    confidence: "medium",
  },
};
