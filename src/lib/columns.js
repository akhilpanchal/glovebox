// Helpers for D1 columns that hold JSON text. The Worker parses them on read and
// stringifies on write so the frontend always sees real arrays/objects.

export function parseJson(value, fallback) {
  if (typeof value !== "string") return value ?? fallback;
  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
}
