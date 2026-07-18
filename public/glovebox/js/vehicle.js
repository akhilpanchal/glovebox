import { getVehicle } from "./api.js";
import { formatDate, escapeHtml } from "./format.js";

let vehicle = null;
let nameButton = null;
let viewEl = null;

function displayName(v) {
  const nickname = (v.nickname || "").trim();
  if (nickname) return nickname;
  return [v.year, v.make, v.model].filter(Boolean).join(" ");
}

export function initVehicle(nameButtonEl, viewElement) {
  nameButton = nameButtonEl;
  viewEl = viewElement;

  nameButton.addEventListener("click", () => {
    location.hash = "#/vehicle";
  });

  getVehicle()
    .then((v) => {
      vehicle = v;
      const name = displayName(v);
      if (name) {
        nameButton.textContent = name;
        nameButton.hidden = false;
      }
      renderView();
    })
    .catch(() => {
      // Non-critical: leave the header name hidden if vehicle info is missing.
    });
}

// Called by the router when the Vehicle view is first shown (data is usually
// already fetched at boot, so this just renders the cache).
export function loadVehicle() {
  renderView();
}

function renderView() {
  if (!viewEl) return;

  if (!vehicle) {
    viewEl.innerHTML =
      '<section class="card"><p class="placeholder-note">Vehicle details unavailable.</p></section>';
    return;
  }

  const v = vehicle;
  const rows = [
    ["Year", v.year],
    ["Make", v.make],
    ["Model", v.model],
    ["Trim", v.trim],
    ["Color", v.color],
    ["VIN", v.vin],
    ["License plate", v.license_plate],
    ["Purchase date", v.purchase_date ? formatDate(v.purchase_date) : ""],
  ].filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== "");

  viewEl.innerHTML = `
    <section class="card">
      <h2>${escapeHtml(displayName(v))}</h2>
      <dl class="detail-grid">
        ${rows
          .map(
            ([label, value]) => `
          <div class="detail-row">
            <dt>${escapeHtml(label)}</dt>
            <dd>${escapeHtml(String(value))}</dd>
          </div>`
          )
          .join("")}
      </dl>
    </section>`;
}
