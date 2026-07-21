import { getCharging, createCharging, deleteCharging } from "./api.js";
import { currentUnits, MI_TO_KM, formatOdometer, onUnitsChange } from "./units.js";
import { formatDate, todayIsoDate, escapeHtml } from "./format.js";

let entries = [];
const els = {};

export function initCharging() {
  els.list = document.getElementById("charge-list");
  els.formWrap = document.getElementById("charge-form-wrap");
  els.addBtn = document.getElementById("charge-add-btn");

  els.addBtn.addEventListener("click", openForm);
  els.list.addEventListener("click", onListClick);
  onUnitsChange(() => renderList());
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

// --- units helpers for the distance fields --------------------------------

function distToDisplay(miles) {
  return currentUnits() === "metric" ? Math.round(miles * MI_TO_KM) : Math.round(miles);
}

function distToMiles(displayValue) {
  const n = Number(displayValue);
  if (!Number.isFinite(n)) return NaN;
  return currentUnits() === "metric" ? Math.round(n / MI_TO_KM) : Math.round(n);
}

function odoLabel() {
  return currentUnits() === "metric" ? "Odometer (km)" : "Odometer (mi)";
}

function milesAddedLabel() {
  return currentUnits() === "metric" ? "Range added (km, from ChargePoint)" : "Miles added (from ChargePoint)";
}

function attr(value) {
  return escapeHtml(String(value ?? "")).replace(/"/g, "&quot;");
}

// --- list -----------------------------------------------------------------

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
      <div class="maint-actions">
        <button type="button" class="btn-link btn-danger" data-del="${e.id}">Delete</button>
      </div>
    </li>`;
}

function onListClick(event) {
  const delBtn = event.target.closest("[data-del]");
  if (delBtn) onDelete(Number(delBtn.dataset.del));
}

async function onDelete(id) {
  const entry = entries.find((e) => e.id === id);
  const label = entry
    ? `${formatDate(entry.date)} · ${Number(entry.kwh).toFixed(2)} kWh`
    : "this session";
  if (!confirm(`Delete charging session (${label})? This can't be undone.`)) return;
  try {
    await deleteCharging(id);
    await loadEntries();
  } catch (err) {
    alert(`Could not delete: ${err.message}`);
  }
}

// --- form (add-only) ------------------------------------------------------

function openForm() {
  els.formWrap.innerHTML = `
    <form id="charge-form" class="maint-form">
      <div class="field">
        <label for="charge-date">Date</label>
        <input type="date" id="charge-date" name="date" />
      </div>
      <div class="field">
        <label for="charge-odometer" id="charge-odo-label">${odoLabel()}</label>
        <input type="number" id="charge-odometer" name="odometer" min="0" step="1" inputmode="numeric" />
      </div>
      <div class="field">
        <label for="charge-kwh">kWh delivered</label>
        <input type="number" id="charge-kwh" name="kwh" min="0" step="0.01" inputmode="decimal" />
      </div>
      <div class="field">
        <label for="charge-miles" id="charge-miles-label">${milesAddedLabel()}</label>
        <input type="number" id="charge-miles" name="miles_added" min="0" step="1" inputmode="numeric" />
      </div>
      <div class="field">
        <label for="charge-notes">Notes (optional)</label>
        <textarea id="charge-notes" name="notes" rows="2"></textarea>
      </div>
      <div class="form-actions">
        <button type="submit">Add charge</button>
        <button type="button" id="charge-cancel" class="btn-secondary">Cancel</button>
      </div>
      <p id="charge-form-error" class="error" role="alert" aria-live="polite" hidden></p>
    </form>`;
  els.formWrap.hidden = false;
  els.addBtn.hidden = true;

  els.formWrap.querySelector("#charge-date").value = todayIsoDate();
  els.formWrap.querySelector("#charge-cancel").addEventListener("click", closeForm);
  els.formWrap.querySelector("#charge-form").addEventListener("submit", onSubmit);
  els.formWrap.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function closeForm() {
  els.formWrap.hidden = true;
  els.formWrap.innerHTML = "";
  els.addBtn.hidden = false;
}

async function onSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const errEl = form.querySelector("#charge-form-error");
  const setErr = (m) => {
    errEl.textContent = m;
    errEl.hidden = false;
  };
  errEl.hidden = true;

  const date = form.querySelector("#charge-date").value || todayIsoDate();

  const odoRaw = form.querySelector("#charge-odometer").value;
  if (odoRaw === "") return setErr("Odometer is required.");
  const odometer = distToMiles(odoRaw);
  if (!Number.isFinite(odometer)) return setErr("Odometer must be a number.");

  const kwhRaw = form.querySelector("#charge-kwh").value;
  if (kwhRaw === "") return setErr("kWh is required.");
  const kwh = Number(kwhRaw);
  if (!Number.isFinite(kwh) || kwh <= 0) return setErr("kWh must be a positive number.");

  let milesAdded = null;
  const milesRaw = form.querySelector("#charge-miles").value;
  if (milesRaw !== "") {
    const m = distToMiles(milesRaw);
    if (!Number.isFinite(m)) return setErr("Miles added must be a number.");
    milesAdded = m;
  }

  const body = {
    date,
    odometer,
    kwh,
    miles_added: milesAdded,
    notes: form.querySelector("#charge-notes").value.trim() || null,
  };

  const submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  try {
    await createCharging(body);
    closeForm();
    await loadEntries();
  } catch (err) {
    setErr(err.message);
    submitBtn.disabled = false;
  }
}
