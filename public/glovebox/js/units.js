// Units state + conversion. Miles/gallons stay canonical everywhere (DB + API);
// this module converts only at the UI edge. Tabs subscribe via onUnitsChange to
// re-render when the toggle flips.

const UNITS_KEY = "glovebox-units";
export const MI_TO_KM = 1.60934;
export const GAL_TO_L = 3.78541;

const listeners = new Set();

export function currentUnits() {
  return localStorage.getItem(UNITS_KEY) === "metric" ? "metric" : "imperial";
}

export function onUnitsChange(cb) {
  listeners.add(cb);
}

function notify(prevUnits) {
  const units = currentUnits();
  listeners.forEach((cb) => cb(units, prevUnits));
}

export function formatOdometer(miles) {
  const num = Number(miles);
  if (!Number.isFinite(num)) return String(miles);
  return currentUnits() === "metric"
    ? `${Math.round(num * MI_TO_KM).toLocaleString()} km`
    : `${Math.round(num).toLocaleString()} mi`;
}

export function formatVolume(gallons) {
  const num = Number(gallons);
  if (!Number.isFinite(num)) return String(gallons);
  return currentUnits() === "metric"
    ? `${(num * GAL_TO_L).toFixed(2)} L`
    : `${num.toFixed(2)} gal`;
}

export function odometerLabelText() {
  return currentUnits() === "metric" ? "Odometer (km)" : "Odometer (mi)";
}

export function volumeLabelText() {
  return currentUnits() === "metric" ? "Liters" : "Gallons";
}

export function initUnitsToggle(button) {
  function apply() {
    const units = currentUnits();
    button.setAttribute("aria-checked", String(units === "metric"));
    button.textContent = units === "metric" ? "KM" : "MI";
    button.setAttribute(
      "aria-label",
      units === "metric"
        ? "Switch to miles and gallons"
        : "Switch to kilometers and liters"
    );
  }

  button.addEventListener("click", () => {
    const prev = currentUnits();
    const next = prev === "metric" ? "imperial" : "metric";
    localStorage.setItem(UNITS_KEY, next);
    apply();
    notify(prev);
  });

  apply();
}
