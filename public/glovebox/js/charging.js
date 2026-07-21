import {
  getCharging,
  createCharging,
  updateCharging,
  deleteCharging,
} from "./api.js";
import { currentUnits, MI_TO_KM, formatOdometer, onUnitsChange } from "./units.js";
import { formatDate, todayIsoDate, escapeHtml } from "./format.js";
import { itemActions } from "./icons.js";

// The charge form + history live inline in the "Charge" segment of the
// Fuel & Charging tab (no separate tab, no add button — mirrors the fuel form).

let entries = [];
let editingId = null;
const els = {};

export function initCharging() {
  els.list = document.getElementById("charge-list");
  els.form = document.getElementById("charge-form");
  els.formError = document.getElementById("charge-form-error");
  els.date = document.getElementById("charge-date");
  els.dateDisplay = document.getElementById("charge-date-display");
  els.odometer = document.getElementById("charge-odometer");
  els.odoLabel = document.getElementById("charge-odo-label");
  els.kwh = document.getElementById("charge-kwh");
  els.miles = document.getElementById("charge-miles");
  els.milesLabel = document.getElementById("charge-miles-label");
  els.notes = document.getElementById("charge-notes");
  els.submitBtn = els.form.querySelector('button[type="submit"]');
  els.cancelBtn = document.getElementById("charge-cancel");
  els.formTitle = document.getElementById("charge-form-title");

  els.date.addEventListener("input", updateDateDisplay);
  els.date.addEventListener("change", updateDateDisplay);
  els.date.value = todayIsoDate();
  updateDateDisplay();
  applyLabels();

  els.form.addEventListener("submit", onSubmit);
  els.list.addEventListener("click", onListClick);
  els.cancelBtn.addEventListener("click", resetEditMode);
  onUnitsChange(() => {
    applyLabels();
    renderList();
  });
}

export function loadCharging() {
  loadEntries();
}

async function loadEntries() {
  els.list.innerHTML = '<li class="history-empty">Loading…</li>';
  try {
    entries = await getCharging();
    renderList();
  } catch (err) {
    els.list.innerHTML = `<li class="history-empty">Error loading charging: ${escapeHtml(
      err.message
    )}</li>`;
  }
}

// --- date + units -------------------------------------------------------

function updateDateDisplay() {
  els.dateDisplay.textContent = els.date.value ? formatDate(els.date.value) : "";
}

function distToMiles(displayValue) {
  const n = Number(displayValue);
  if (!Number.isFinite(n)) return NaN;
  return currentUnits() === "metric" ? Math.round(n / MI_TO_KM) : Math.round(n);
}

function applyLabels() {
  els.odoLabel.textContent =
    currentUnits() === "metric" ? "Odometer (km)" : "Odometer (mi)";
  els.milesLabel.textContent =
    currentUnits() === "metric"
      ? "Range added — km (ChargePoint)"
      : "Miles added (ChargePoint)";
}

// --- list ---------------------------------------------------------------

function renderList() {
  if (!entries.length) {
    els.list.innerHTML = '<li class="history-empty">No charging sessions yet.</li>';
    return;
  }
  els.list.innerHTML = entries.map(renderItem).join("");
}

function renderItem(e) {
  const kwh = `${Number(e.kwh).toFixed(2)} kWh`;
  const added =
    e.miles_added === null || e.miles_added === undefined
      ? ""
      : ` · +${formatOdometer(e.miles_added)}`;
  const notes = e.notes ? `<div class="hi-notes">${escapeHtml(e.notes)}</div>` : "";
  return `
    <li class="history-item">
      <div class="hi-odo">${kwh}</div>
      <div class="hi-meta">${formatDate(e.date)} · <span class="hi-mono">${formatOdometer(
        e.odometer
      )}</span>${added}</div>
      ${notes}
      ${itemActions(e.id)}
    </li>`;
}

function onListClick(event) {
  const editBtn = event.target.closest("[data-edit]");
  if (editBtn) {
    const entry = entries.find((e) => e.id === Number(editBtn.dataset.edit));
    if (entry) startEdit(entry);
    return;
  }
  const delBtn = event.target.closest("[data-del]");
  if (delBtn) onDelete(Number(delBtn.dataset.del));
}

function startEdit(entry) {
  editingId = entry.id;
  els.formError.hidden = true;
  els.date.value = entry.date;
  updateDateDisplay();
  const isMetric = currentUnits() === "metric";
  els.odometer.value = isMetric
    ? Math.round(entry.odometer * MI_TO_KM)
    : entry.odometer;
  els.kwh.value = entry.kwh;
  els.miles.value =
    entry.miles_added === null || entry.miles_added === undefined
      ? ""
      : isMetric
      ? Math.round(entry.miles_added * MI_TO_KM)
      : entry.miles_added;
  els.notes.value = entry.notes || "";
  els.submitBtn.textContent = "Save changes";
  els.cancelBtn.hidden = false;
  els.formTitle.textContent = "Edit Charge";
  els.form.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function resetEditMode() {
  editingId = null;
  els.submitBtn.textContent = "Add Charge";
  els.cancelBtn.hidden = true;
  els.formTitle.textContent = "Log a Charge";
  els.form.reset();
  els.date.value = todayIsoDate();
  updateDateDisplay();
  els.formError.hidden = true;
}

async function onDelete(id) {
  const entry = entries.find((e) => e.id === id);
  const label = entry
    ? `${formatDate(entry.date)} · ${Number(entry.kwh).toFixed(2)} kWh`
    : "this session";
  if (!confirm(`Delete charging session (${label})? This can't be undone.`)) return;
  try {
    await deleteCharging(id);
    if (editingId === id) resetEditMode();
    await loadEntries();
  } catch (err) {
    alert(`Could not delete: ${err.message}`);
  }
}

// --- submit -------------------------------------------------------------

function showError(message) {
  els.formError.textContent = message;
  els.formError.hidden = false;
}

async function onSubmit(event) {
  event.preventDefault();
  els.formError.hidden = true;

  const date = els.date.value || todayIsoDate();

  if (els.odometer.value === "") return showError("Odometer is required.");
  const odometer = distToMiles(els.odometer.value);
  if (!Number.isFinite(odometer)) return showError("Odometer must be a number.");

  if (els.kwh.value === "") return showError("kWh is required.");
  const kwh = Number(els.kwh.value);
  if (!Number.isFinite(kwh) || kwh <= 0)
    return showError("kWh must be a positive number.");

  let milesAdded = null;
  if (els.miles.value !== "") {
    const m = distToMiles(els.miles.value);
    if (!Number.isFinite(m)) return showError("Miles added must be a number.");
    milesAdded = m;
  }

  const body = {
    date,
    odometer,
    kwh,
    miles_added: milesAdded,
    notes: els.notes.value.trim() || null,
  };

  els.submitBtn.disabled = true;
  try {
    if (editingId) await updateCharging(editingId, body);
    else await createCharging(body);
    resetEditMode();
    await loadEntries();
  } catch (err) {
    showError(err.message);
  } finally {
    els.submitBtn.disabled = false;
  }
}
