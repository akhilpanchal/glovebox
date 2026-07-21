import {
  getMaintenance,
  createMaintenance,
  updateMaintenance,
  deleteMaintenance,
} from "./api.js";
import { currentUnits, MI_TO_KM, formatOdometer, onUnitsChange } from "./units.js";
import { formatDate, todayIsoDate, escapeHtml } from "./format.js";
import { itemActions } from "./icons.js";

// Mirrors the backend vocabulary in src/handlers/maintenance.js.
const CATEGORIES = [
  "Oil", "Tires", "Brakes", "Battery", "Fluids", "Filters",
  "Scheduled service", "Inspection", "Repair", "Diagnostic", "Other",
];

let entries = [];
const els = {};

export function initMaintenance() {
  els.list = document.getElementById("maint-list");
  els.formWrap = document.getElementById("maint-form-wrap");
  els.addBtn = document.getElementById("maint-add-btn");

  els.addBtn.addEventListener("click", () => openForm(null));
  els.list.addEventListener("click", onListClick);
  onUnitsChange(() => renderList());
}

export function loadMaintenance() {
  loadEntries();
}

async function loadEntries() {
  els.list.innerHTML = '<li class="history-empty">Loading…</li>';
  try {
    entries = await getMaintenance();
    renderList();
  } catch (err) {
    els.list.innerHTML = `<li class="history-empty">Error loading maintenance: ${escapeHtml(
      err.message
    )}</li>`;
  }
}

// --- helpers -------------------------------------------------------------

function odoToDisplay(miles) {
  return currentUnits() === "metric" ? Math.round(miles * MI_TO_KM) : Math.round(miles);
}

function odoToMiles(displayValue) {
  const n = Number(displayValue);
  if (!Number.isFinite(n)) return NaN;
  return currentUnits() === "metric" ? Math.round(n / MI_TO_KM) : Math.round(n);
}

function odoLabel() {
  return currentUnits() === "metric" ? "Odometer (km)" : "Odometer (mi)";
}

function money(value) {
  return value === null || value === undefined ? "" : `$${Number(value).toFixed(2)}`;
}

// Escape for use inside a double-quoted HTML attribute.
function attr(value) {
  return escapeHtml(String(value ?? "")).replace(/"/g, "&quot;");
}

// Only allow http(s) links to become clickable — blocks javascript: URLs.
function safeUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : "#";
  } catch (_) {
    return "#";
  }
}

// --- list ----------------------------------------------------------------

function renderList() {
  if (!entries.length) {
    els.list.innerHTML = '<li class="history-empty">No maintenance entries yet.</li>';
    return;
  }
  els.list.innerHTML = entries.map(renderItem).join("");
}

function renderItem(e) {
  const cats = (e.categories || [])
    .map((c) => `<span class="cat-chip">${escapeHtml(c)}</span>`)
    .join("");

  const lines = (e.line_items || []).length
    ? `<ul class="li-list">${e.line_items
        .map(
          (li) =>
            `<li><span>${escapeHtml(li.description)}</span><span class="hi-mono">${money(
              li.cost
            )}</span></li>`
        )
        .join("")}</ul>`
    : "";

  const docs = (e.document_urls || []).length
    ? `<div class="doc-links">${e.document_urls
        .map(
          (d) =>
            `<a href="${escapeHtml(safeUrl(d.url))}" target="_blank" rel="noopener">${escapeHtml(
              d.label || "Document"
            )}</a>`
        )
        .join("")}</div>`
    : "";

  const notes = e.notes ? `<div class="hi-notes">${escapeHtml(e.notes)}</div>` : "";
  const shop = e.shop_name ? ` · ${escapeHtml(e.shop_name)}` : "";
  const invoice = e.invoice_number ? ` · #${escapeHtml(e.invoice_number)}` : "";

  return `
    <li class="history-item maint-item">
      <div class="maint-head">
        <div class="hi-odo">${formatOdometer(e.odometer)}</div>
        <div class="maint-cost hi-mono">${money(e.total_cost)}</div>
      </div>
      <div class="hi-meta">${formatDate(e.date)}${shop}${invoice}</div>
      ${cats ? `<div class="maint-cats">${cats}</div>` : ""}
      ${lines}
      ${docs}
      ${notes}
      ${itemActions(e.id)}
    </li>`;
}

function onListClick(event) {
  const editBtn = event.target.closest("[data-edit]");
  if (editBtn) {
    const entry = entries.find((e) => e.id === Number(editBtn.dataset.edit));
    if (entry) openForm(entry);
    return;
  }
  const delBtn = event.target.closest("[data-del]");
  if (delBtn) onDelete(Number(delBtn.dataset.del));
}

async function onDelete(id) {
  const entry = entries.find((e) => e.id === id);
  const label = entry
    ? `${formatDate(entry.date)} · ${formatOdometer(entry.odometer)}`
    : "this entry";
  if (!confirm(`Delete maintenance entry (${label})? This can't be undone.`)) return;
  try {
    await deleteMaintenance(id);
    await loadEntries();
  } catch (err) {
    alert(`Could not delete: ${err.message}`);
  }
}

// --- form ----------------------------------------------------------------

function openForm(entry) {
  const editing = !!entry;
  els.formWrap.innerHTML = formTemplate(editing);
  els.formWrap.hidden = false;
  els.addBtn.hidden = true;

  const form = els.formWrap.querySelector("#maint-form");
  form.dataset.id = editing ? String(entry.id) : "";

  els.formWrap.querySelector("#maint-parse-btn").addEventListener("click", onParseImport);
  els.formWrap.querySelector("#maint-add-li").addEventListener("click", () => addLiRow());
  els.formWrap.querySelector("#maint-add-doc").addEventListener("click", () => addDocRow());
  els.formWrap.querySelector("#maint-cancel").addEventListener("click", closeForm);
  els.formWrap.querySelector("#li-rows").addEventListener("click", onRowRemove);
  els.formWrap.querySelector("#doc-rows").addEventListener("click", onRowRemove);
  form.addEventListener("submit", onSubmitForm);

  if (editing) {
    fillForm(entry);
  } else {
    form.querySelector("#maint-date").value = todayIsoDate();
    addLiRow();
  }

  els.formWrap.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function closeForm() {
  els.formWrap.hidden = true;
  els.formWrap.innerHTML = "";
  els.addBtn.hidden = false;
}

function formTemplate(editing) {
  const cats = CATEGORIES.map(
    (c) =>
      `<label class="cat-option"><input type="checkbox" name="category" value="${attr(
        c
      )}" /> ${escapeHtml(c)}</label>`
  ).join("");

  return `
  <form id="maint-form" class="maint-form">
    <div class="import-box">
      <label for="maint-import">Import from Claude (paste JSON)</label>
      <textarea id="maint-import" rows="3" placeholder='{"date":"2026-06-14","odometer":41250, ...}'></textarea>
      <div class="import-actions">
        <button type="button" id="maint-parse-btn" class="btn-secondary">Parse &amp; fill</button>
        <span id="maint-import-msg" class="import-msg" hidden></span>
      </div>
    </div>

    <div class="field">
      <label for="maint-date">Date</label>
      <input type="date" id="maint-date" name="date" />
    </div>
    <div class="field">
      <label for="maint-odometer" id="maint-odo-label">${odoLabel()}</label>
      <input type="number" id="maint-odometer" name="odometer" min="0" step="1" inputmode="numeric" />
    </div>
    <div class="field">
      <label for="maint-shop">Shop</label>
      <input type="text" id="maint-shop" name="shop_name" />
    </div>
    <div class="field">
      <label for="maint-cost">Total cost ($)</label>
      <input type="number" id="maint-cost" name="total_cost" min="0" step="0.01" inputmode="decimal" />
    </div>
    <div class="field">
      <label for="maint-invoice">Invoice #</label>
      <input type="text" id="maint-invoice" name="invoice_number" />
    </div>

    <div class="field">
      <span class="field-label">Categories</span>
      <div class="cat-options">${cats}</div>
    </div>

    <div class="field">
      <span class="field-label">Line items</span>
      <div id="li-rows" class="rows"></div>
      <button type="button" id="maint-add-li" class="btn-link">+ Add line item</button>
    </div>

    <div class="field">
      <span class="field-label">Document links</span>
      <div id="doc-rows" class="rows"></div>
      <button type="button" id="maint-add-doc" class="btn-link">+ Add link</button>
    </div>

    <div class="field">
      <label for="maint-notes">Notes</label>
      <textarea id="maint-notes" name="notes" rows="2"></textarea>
    </div>

    <div class="form-actions">
      <button type="submit">${editing ? "Save changes" : "Add entry"}</button>
      <button type="button" id="maint-cancel" class="btn-secondary">Cancel</button>
    </div>
    <p id="maint-form-error" class="error" role="alert" aria-live="polite" hidden></p>
  </form>`;
}

function liRowHtml(item = {}) {
  return `
  <div class="row li-row">
    <input type="text" class="li-desc" placeholder="Description" value="${attr(item.description || "")}" />
    <input type="number" class="li-cost" placeholder="Cost" step="0.01" min="0" inputmode="decimal" value="${attr(item.cost ?? "")}" />
    <button type="button" class="row-remove" aria-label="Remove line item">×</button>
  </div>`;
}

function docRowHtml(doc = {}) {
  return `
  <div class="row doc-row">
    <input type="url" class="doc-url" placeholder="https://…" value="${attr(doc.url || "")}" />
    <input type="text" class="doc-label" placeholder="Label (optional)" value="${attr(doc.label || "")}" />
    <button type="button" class="row-remove" aria-label="Remove link">×</button>
  </div>`;
}

function addLiRow(item) {
  els.formWrap.querySelector("#li-rows").insertAdjacentHTML("beforeend", liRowHtml(item));
}

function addDocRow(doc) {
  els.formWrap.querySelector("#doc-rows").insertAdjacentHTML("beforeend", docRowHtml(doc));
}

function onRowRemove(event) {
  const btn = event.target.closest(".row-remove");
  if (btn) btn.closest(".row").remove();
}

// Populate the form from an entry (edit) or parsed import. Odometer arrives in
// canonical miles and is shown in the active display unit.
function fillForm(data) {
  const q = (sel) => els.formWrap.querySelector(sel);

  q("#maint-date").value = data.date || todayIsoDate();
  q("#maint-odometer").value =
    data.odometer !== undefined && data.odometer !== null && data.odometer !== ""
      ? odoToDisplay(Number(data.odometer))
      : "";
  q("#maint-shop").value = data.shop_name || "";
  q("#maint-cost").value =
    data.total_cost === undefined || data.total_cost === null ? "" : data.total_cost;
  q("#maint-invoice").value = data.invoice_number || "";
  q("#maint-notes").value = data.notes || "";

  const cats = new Set(Array.isArray(data.categories) ? data.categories : []);
  els.formWrap
    .querySelectorAll('input[name="category"]')
    .forEach((cb) => {
      cb.checked = cats.has(cb.value);
    });

  const liRows = q("#li-rows");
  liRows.innerHTML = "";
  const items = Array.isArray(data.line_items) ? data.line_items : [];
  if (items.length) items.forEach((it) => addLiRow(it));
  else addLiRow();

  const docRows = q("#doc-rows");
  docRows.innerHTML = "";
  const docs = Array.isArray(data.document_urls) ? data.document_urls : [];
  docs.forEach((d) => addDocRow(typeof d === "string" ? { url: d } : d));
}

function onParseImport() {
  const raw = els.formWrap.querySelector("#maint-import").value.trim();
  if (!raw) return showImportMsg("Paste the JSON from Claude first.", true);

  let data;
  try {
    data = JSON.parse(raw);
  } catch (_) {
    return showImportMsg("That doesn't look like valid JSON.", true);
  }
  if (typeof data !== "object" || Array.isArray(data) || data === null) {
    return showImportMsg("Expected a single JSON object.", true);
  }

  fillForm(data);
  showImportMsg("Filled below — review, then save.", false);
}

function showImportMsg(text, isError) {
  const msg = els.formWrap.querySelector("#maint-import-msg");
  msg.textContent = text;
  msg.hidden = false;
  msg.classList.toggle("import-error", isError);
}

async function onSubmitForm(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const errEl = form.querySelector("#maint-form-error");
  const setErr = (m) => {
    errEl.textContent = m;
    errEl.hidden = false;
  };
  errEl.hidden = true;

  const date = form.querySelector("#maint-date").value || todayIsoDate();

  const odoRaw = form.querySelector("#maint-odometer").value;
  if (odoRaw === "") return setErr("Odometer is required.");
  const odometer = odoToMiles(odoRaw);
  if (!Number.isFinite(odometer)) return setErr("Odometer must be a number.");

  const costRaw = form.querySelector("#maint-cost").value;
  let totalCost = null;
  if (costRaw !== "") {
    const c = Number(costRaw);
    if (!Number.isFinite(c)) return setErr("Total cost must be a number.");
    totalCost = c;
  }

  const categories = [...form.querySelectorAll('input[name="category"]:checked')].map(
    (cb) => cb.value
  );

  const lineItems = [];
  for (const row of form.querySelectorAll(".li-row")) {
    const description = row.querySelector(".li-desc").value.trim();
    const costV = row.querySelector(".li-cost").value;
    if (!description && costV === "") continue;
    if (!description) return setErr("Every line item needs a description.");
    let cost = null;
    if (costV !== "") {
      const n = Number(costV);
      if (!Number.isFinite(n)) return setErr("Line item cost must be a number.");
      cost = n;
    }
    lineItems.push({ description, cost });
  }

  const documentUrls = [];
  for (const row of form.querySelectorAll(".doc-row")) {
    const url = row.querySelector(".doc-url").value.trim();
    const label = row.querySelector(".doc-label").value.trim();
    if (!url) continue;
    documentUrls.push(label ? { url, label } : { url });
  }

  const body = {
    date,
    odometer,
    shop_name: form.querySelector("#maint-shop").value.trim() || null,
    total_cost: totalCost,
    categories,
    line_items: lineItems,
    invoice_number: form.querySelector("#maint-invoice").value.trim() || null,
    document_urls: documentUrls,
    notes: form.querySelector("#maint-notes").value.trim() || null,
  };

  const submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  try {
    const id = form.dataset.id;
    if (id) await updateMaintenance(Number(id), body);
    else await createMaintenance(body);
    closeForm();
    await loadEntries();
  } catch (err) {
    setErr(err.message);
    submitBtn.disabled = false;
  }
}
