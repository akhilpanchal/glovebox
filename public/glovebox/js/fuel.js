import { getEntries, postEntry, getCharging } from "./api.js";
import {
  MI_TO_KM,
  GAL_TO_L,
  currentUnits,
  formatOdometer,
  formatVolume,
  onUnitsChange,
  odometerLabelText,
  volumeLabelText,
} from "./units.js";
import { formatDate, todayIsoDate, escapeHtml } from "./format.js";

let cachedEntries = [];
let cachedCharges = [];
const els = {};

export function initFuel() {
  els.form = document.getElementById("entry-form");
  els.formError = document.getElementById("form-error");
  els.historyList = document.getElementById("history-list");
  els.dashValue = document.getElementById("dash-value");
  els.dashSub = document.getElementById("dash-sub");
  els.dashLabel = document.getElementById("dash-label");
  els.dateInput = document.getElementById("date");
  els.dateDisplay = document.getElementById("date-display");
  els.odometerInput = document.getElementById("odometer");
  els.odometerLabel = document.getElementById("odometer-label");
  els.volumeInput = document.getElementById("volume");
  els.volumeLabel = document.getElementById("volume-label");

  els.dateInput.addEventListener("input", updateDateDisplay);
  els.dateInput.addEventListener("change", updateDateDisplay);
  resetDateToToday();

  applyUnitLabels();
  els.form.addEventListener("submit", onSubmit);

  onUnitsChange((units, prev) => {
    convertFormFields(prev, units);
    applyUnitLabels();
    renderHistory();
  });
}

// Called by the router the first time the Fuel tab is shown.
export function loadFuel() {
  loadEntries();
}

// --- Date field -----------------------------------------------------------

function updateDateDisplay() {
  els.dateDisplay.textContent = els.dateInput.value
    ? formatDate(els.dateInput.value)
    : "";
}

function resetDateToToday() {
  els.dateInput.value = todayIsoDate();
  updateDateDisplay();
}

// --- Units ----------------------------------------------------------------

function applyUnitLabels() {
  els.odometerLabel.textContent = odometerLabelText();
  els.volumeLabel.textContent = volumeLabelText();
}

// Convert whatever is already typed so flipping units mid-entry doesn't
// silently change the meaning of the number.
function convertFormFields(fromUnits, toUnits) {
  if (fromUnits === toUnits) return;
  const toMetric = toUnits === "metric";

  if (els.odometerInput.value !== "") {
    const num = Number(els.odometerInput.value);
    if (Number.isFinite(num)) {
      els.odometerInput.value = Math.round(
        toMetric ? num * MI_TO_KM : num / MI_TO_KM
      );
    }
  }

  if (els.volumeInput.value !== "") {
    const num = Number(els.volumeInput.value);
    if (Number.isFinite(num)) {
      els.volumeInput.value = (
        toMetric ? num * GAL_TO_L : num / GAL_TO_L
      ).toFixed(2);
    }
  }
}

// --- Errors ---------------------------------------------------------------

function showError(message) {
  els.formError.textContent = message;
  els.formError.hidden = false;
}

function clearError() {
  els.formError.hidden = true;
  els.formError.textContent = "";
}

// --- Average efficiency dashboard -----------------------------------------

// PHEV-aware efficiency over the fuel-fill-to-fuel-fill window. Charging sessions
// whose odometer falls inside that window contribute electric miles, which are
// removed so the headline reflects *gas* efficiency (see docs/v2.1-charging-plan.md).
// Assumes every fill-up tops the tank: distance since the earliest entry divided
// by fuel added at every entry after it.
function computeEfficiency(entries, charges) {
  if (entries.length < 2) return null;

  const sorted = [...entries].sort((a, b) => a.odometer - b.odometer);
  const firstOdo = sorted[0].odometer;
  const lastOdo = sorted[sorted.length - 1].odometer;
  const spanMiles = lastOdo - firstOdo;
  const gallons = sorted.slice(1).reduce((sum, e) => sum + e.volume, 0);

  if (spanMiles <= 0 || gallons <= 0) return null;

  const inWindow = charges.filter(
    (c) => c.odometer >= firstOdo && c.odometer <= lastOdo
  );
  const rawElectric = inWindow.reduce((s, c) => s + (Number(c.miles_added) || 0), 0);
  const kwh = inWindow.reduce((s, c) => s + (Number(c.kwh) || 0), 0);
  const electricMiles = Math.min(rawElectric, spanMiles); // guard against bad data
  const gasMiles = spanMiles - electricMiles;

  return {
    gasMpg: gasMiles / gallons,
    pctElectric: (electricMiles / spanMiles) * 100,
    miPerKwh: kwh > 0 ? electricMiles / kwh : null,
    spanMiles,
    fillCount: sorted.length,
    chargeCount: inWindow.length,
    hasCharging: inWindow.length > 0,
  };
}

function renderEfficiencyDash() {
  const result = computeEfficiency(cachedEntries, cachedCharges);

  if (els.dashLabel) {
    els.dashLabel.textContent =
      result && result.hasCharging ? "Gas Efficiency" : "Average Efficiency";
  }

  if (!result) {
    els.dashValue.innerHTML =
      '<div class="dash-empty">Log at least 2 fill-ups to see your average</div>';
    els.dashSub.textContent = "";
    return;
  }

  const isMetric = currentUnits() === "metric";
  const displayValue = isMetric
    ? (result.gasMpg * (MI_TO_KM / GAL_TO_L)).toFixed(1)
    : result.gasMpg.toFixed(1);
  const unitLabel = isMetric ? "KM/L" : "MPG";

  const [whole, decimal] = displayValue.split(".");
  const tile = (ch) => `<span class="dash-digit">${ch}</span>`;
  const wholeTiles = whole.split("").map(tile).join("");
  const decimalTiles = decimal.split("").map(tile).join("");

  els.dashValue.innerHTML = `
    <div class="dash-digits">
      ${wholeTiles}
      <span class="dash-dot">.</span>
      ${decimalTiles}
      <span class="dash-digit-unit">${unitLabel}</span>
    </div>`;

  els.dashSub.textContent = buildDashSub(result, isMetric);
}

function buildDashSub(result, isMetric) {
  if (!result.hasCharging) {
    return `Based on ${result.fillCount} fill-ups · ${formatOdometer(
      result.spanMiles
    )} driven`;
  }
  const pct = Math.round(result.pctElectric);
  let miKwh = "";
  if (result.miPerKwh != null) {
    const v = isMetric
      ? (result.miPerKwh * MI_TO_KM).toFixed(1)
      : result.miPerKwh.toFixed(1);
    const unit = isMetric ? "km/kWh" : "mi/kWh";
    miKwh = ` · ${v} ${unit} (est)`;
  }
  const charges = `${result.chargeCount} charge${
    result.chargeCount !== 1 ? "s" : ""
  }`;
  return `${pct}% electric${miKwh} · ${formatOdometer(result.spanMiles)} · ${charges}`;
}

// --- History --------------------------------------------------------------

function renderHistory() {
  renderEfficiencyDash();

  if (!cachedEntries.length) {
    els.historyList.innerHTML = '<li class="history-empty">No entries yet.</li>';
    return;
  }

  els.historyList.innerHTML = cachedEntries
    .map((e) => {
      const notesHtml = e.notes
        ? `<div class="hi-notes">${escapeHtml(e.notes)}</div>`
        : "";
      return `
        <li class="history-item">
          <div class="hi-odo">${formatOdometer(e.odometer)}</div>
          <div class="hi-meta">${formatDate(e.date)} · <span class="hi-mono">${formatVolume(
            e.volume
          )}</span> · ${escapeHtml(e.added_by)}</div>
          ${notesHtml}
        </li>`;
    })
    .join("");
}

async function loadEntries() {
  els.historyList.innerHTML = '<li class="history-empty">Loading...</li>';
  try {
    const [entries, charges] = await Promise.all([
      getEntries(),
      getCharging().catch(() => []),
    ]);
    cachedEntries = entries;
    cachedCharges = charges;
    renderHistory();
  } catch (err) {
    els.historyList.innerHTML = `<li class="history-empty">Error loading entries: ${escapeHtml(
      err.message
    )}</li>`;
  }
}

// --- Submit ---------------------------------------------------------------

async function onSubmit(event) {
  event.preventDefault();
  clearError();

  const date = els.dateInput.value || todayIsoDate();
  const odometer = els.odometerInput.value;
  const volume = els.volumeInput.value;
  const notes = document.getElementById("notes").value;

  if (odometer === "" || volume === "") {
    showError("Please fill in odometer and volume.");
    return;
  }

  const odometerEntered = Number(odometer);
  const volumeEntered = Number(volume);

  if (!Number.isFinite(odometerEntered) || !Number.isFinite(volumeEntered)) {
    showError("Odometer and volume must be valid numbers.");
    return;
  }

  // The form accepts whichever unit is toggled; the API/DB stay mi/gal.
  const isMetric = currentUnits() === "metric";
  const odometerMiles = Math.round(
    isMetric ? odometerEntered / MI_TO_KM : odometerEntered
  );
  const volumeGallons = isMetric ? volumeEntered / GAL_TO_L : volumeEntered;

  const submitButton = els.form.querySelector("button[type=submit]");
  submitButton.disabled = true;

  try {
    await postEntry({
      date,
      odometer: odometerMiles,
      volume: volumeGallons,
      notes: notes || null,
    });
    els.form.reset();
    resetDateToToday();
    await loadEntries();
  } catch (err) {
    showError(err.message);
  } finally {
    submitButton.disabled = false;
  }
}
