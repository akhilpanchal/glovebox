import { getEntries, postEntry } from "./api.js";
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
const els = {};

export function initFuel() {
  els.form = document.getElementById("entry-form");
  els.formError = document.getElementById("form-error");
  els.historyList = document.getElementById("history-list");
  els.dashValue = document.getElementById("dash-value");
  els.dashSub = document.getElementById("dash-sub");
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

// Assumes every fill-up tops the tank: distance since the earliest entry
// divided by fuel added at every entry after it.
function computeAverageEfficiency(entries) {
  if (entries.length < 2) return null;

  const sorted = [...entries].sort((a, b) => a.odometer - b.odometer);
  const totalMiles = sorted[sorted.length - 1].odometer - sorted[0].odometer;
  const totalGallons = sorted.slice(1).reduce((sum, e) => sum + e.volume, 0);

  if (totalMiles <= 0 || totalGallons <= 0) return null;

  return { mpg: totalMiles / totalGallons, totalMiles, fillCount: sorted.length };
}

function renderEfficiencyDash() {
  const result = computeAverageEfficiency(cachedEntries);

  if (!result) {
    els.dashValue.innerHTML =
      '<div class="dash-empty">Log at least 2 fill-ups to see your average</div>';
    els.dashSub.textContent = "";
    return;
  }

  const isMetric = currentUnits() === "metric";
  const displayValue = isMetric
    ? (result.mpg * (MI_TO_KM / GAL_TO_L)).toFixed(1)
    : result.mpg.toFixed(1);
  const unitLabel = isMetric ? "KM/L" : "MPG";

  const [whole, decimal] = displayValue.split(".");
  const digitTiles = whole
    .split("")
    .map((ch) => `<span class="dash-digit">${ch}</span>`)
    .join("");

  els.dashValue.innerHTML = `
    <div class="dash-digits">
      ${digitTiles}
      <span class="dash-digit dash-digit-unit">.${decimal} ${unitLabel}</span>
    </div>`;

  els.dashSub.textContent = `Based on ${result.fillCount} fill-ups · ${formatOdometer(
    result.totalMiles
  )} driven`;
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
    cachedEntries = await getEntries();
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
