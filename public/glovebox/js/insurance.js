import { getInsurance, putInsurance } from "./api.js";
import { formatDate, escapeHtml } from "./format.js";

let current = null;
let bodyEl = null;

export function initInsurance(container) {
  bodyEl = container;
}

export function loadInsurance() {
  bodyEl.innerHTML = '<p class="placeholder-note">Loading…</p>';
  getInsurance()
    .then((data) => {
      current = data;
      renderView();
    })
    .catch((err) => {
      bodyEl.innerHTML = `<p class="placeholder-note">Error loading insurance: ${escapeHtml(
        err.message
      )}</p>`;
    });
}

function attr(value) {
  return escapeHtml(String(value ?? "")).replace(/"/g, "&quot;");
}

function safeUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : "#";
  } catch (_) {
    return "#";
  }
}

function telHref(number) {
  return "tel:" + String(number).replace(/[^0-9+]/g, "");
}

function isEmpty(d) {
  return (
    !d.insurer_name &&
    !d.policy_number &&
    !d.expiry_date &&
    !d.policy_pdf_url &&
    !(d.emergency_phones && d.emergency_phones.length)
  );
}

function renderView() {
  const d = current;

  if (isEmpty(d)) {
    bodyEl.innerHTML = `
      <div class="card-head"><h2>Insurance</h2>
        <button type="button" class="btn-secondary" id="ins-edit">Add details</button>
      </div>
      <p class="placeholder-note">No insurance details yet.</p>`;
    bodyEl.querySelector("#ins-edit").addEventListener("click", openForm);
    return;
  }

  const rows = [
    ["Insurer", d.insurer_name],
    ["Policy #", d.policy_number],
    ["Expires", d.expiry_date ? formatDate(d.expiry_date) : ""],
  ].filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== "");

  const pdf = d.policy_pdf_url
    ? `<a class="ins-pdf" href="${escapeHtml(safeUrl(d.policy_pdf_url))}" target="_blank" rel="noopener">Open policy PDF</a>`
    : "";

  const phones = (d.emergency_phones || []).length
    ? `<div class="ins-phones">
         <span class="field-label">Emergency</span>
         ${d.emergency_phones
           .map(
             (p) =>
               `<a class="ins-phone" href="${escapeHtml(telHref(p.number))}">${escapeHtml(
                 p.label ? `${p.label}: ` : ""
               )}${escapeHtml(p.number)}</a>`
           )
           .join("")}
       </div>`
    : "";

  bodyEl.innerHTML = `
    <div class="card-head"><h2>Insurance</h2>
      <button type="button" class="btn-secondary" id="ins-edit">Edit</button>
    </div>
    <dl class="detail-grid">
      ${rows
        .map(
          ([label, v]) =>
            `<div class="detail-row"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(
              String(v)
            )}</dd></div>`
        )
        .join("")}
    </dl>
    ${pdf}
    ${phones}`;

  bodyEl.querySelector("#ins-edit").addEventListener("click", openForm);
}

function openForm() {
  const d = current || {};
  bodyEl.innerHTML = `
    <div class="card-head"><h2>Edit insurance</h2></div>
    <form id="ins-form">
      <div class="field">
        <label for="ins-insurer">Insurer</label>
        <input type="text" id="ins-insurer" value="${attr(d.insurer_name || "")}" />
      </div>
      <div class="field">
        <label for="ins-policy">Policy #</label>
        <input type="text" id="ins-policy" value="${attr(d.policy_number || "")}" />
      </div>
      <div class="field">
        <label for="ins-expiry">Expiry date</label>
        <input type="date" id="ins-expiry" value="${attr(d.expiry_date || "")}" />
      </div>
      <div class="field">
        <label for="ins-pdf">Policy PDF link</label>
        <input type="url" id="ins-pdf" placeholder="https://…" value="${attr(d.policy_pdf_url || "")}" />
      </div>
      <div class="field">
        <span class="field-label">Emergency phone(s)</span>
        <div id="ins-phone-rows" class="rows"></div>
        <button type="button" id="ins-add-phone" class="btn-link">+ Add number</button>
      </div>
      <div class="form-actions">
        <button type="submit">Save</button>
        <button type="button" id="ins-cancel" class="btn-secondary">Cancel</button>
      </div>
      <p id="ins-form-error" class="error" role="alert" aria-live="polite" hidden></p>
    </form>`;

  const phones = Array.isArray(d.emergency_phones) ? d.emergency_phones : [];
  if (phones.length) phones.forEach((p) => addPhoneRow(p));
  else addPhoneRow();

  bodyEl.querySelector("#ins-add-phone").addEventListener("click", () => addPhoneRow());
  bodyEl.querySelector("#ins-phone-rows").addEventListener("click", onRowRemove);
  bodyEl.querySelector("#ins-cancel").addEventListener("click", renderView);
  bodyEl.querySelector("#ins-form").addEventListener("submit", onSubmit);
}

function phoneRowHtml(p = {}) {
  return `
  <div class="row phone-row">
    <input type="text" class="phone-label" placeholder="Label (e.g. Roadside)" value="${attr(p.label || "")}" />
    <input type="tel" class="phone-number" placeholder="Number" value="${attr(p.number || "")}" />
    <button type="button" class="row-remove" aria-label="Remove number">×</button>
  </div>`;
}

function addPhoneRow(p) {
  bodyEl.querySelector("#ins-phone-rows").insertAdjacentHTML("beforeend", phoneRowHtml(p));
}

function onRowRemove(event) {
  const btn = event.target.closest(".row-remove");
  if (btn) btn.closest(".row").remove();
}

async function onSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const errEl = form.querySelector("#ins-form-error");
  const setErr = (m) => {
    errEl.textContent = m;
    errEl.hidden = false;
  };
  errEl.hidden = true;

  const emergencyPhones = [];
  for (const row of form.querySelectorAll(".phone-row")) {
    const number = row.querySelector(".phone-number").value.trim();
    const label = row.querySelector(".phone-label").value.trim();
    if (!number) continue;
    emergencyPhones.push(label ? { label, number } : { number });
  }

  const body = {
    insurer_name: form.querySelector("#ins-insurer").value.trim() || null,
    policy_number: form.querySelector("#ins-policy").value.trim() || null,
    expiry_date: form.querySelector("#ins-expiry").value || null,
    policy_pdf_url: form.querySelector("#ins-pdf").value.trim() || null,
    emergency_phones: emergencyPhones,
  };

  const submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  try {
    current = await putInsurance(body);
    renderView();
  } catch (err) {
    setErr(err.message);
    submitBtn.disabled = false;
  }
}
