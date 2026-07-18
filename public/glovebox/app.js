const API_URL = "/glovebox/api/entries";
const ME_URL = "/glovebox/api/me";

const form = document.getElementById("entry-form");
const formError = document.getElementById("form-error");
const historyList = document.getElementById("history-list");
const dashValue = document.getElementById("dash-value");
const dashSub = document.getElementById("dash-sub");
const accountChip = document.getElementById("account-chip");
const accountPopover = document.getElementById("account-popover");
const themeToggle = document.getElementById("theme-toggle");
const unitsToggle = document.getElementById("units-toggle");
const dateInput = document.getElementById("date");
const dateDisplay = document.getElementById("date-display");
const odometerInput = document.getElementById("odometer");
const odometerLabel = document.getElementById("odometer-label");
const volumeInput = document.getElementById("volume");
const volumeLabel = document.getElementById("volume-label");

let cachedEntries = [];

// --- Date formatting: always "12 July, 2026" regardless of browser locale -

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatDate(isoDate) {
  const d = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${d.getFullYear()}`;
}

// --- Date field: always defaults to today, never forces a manual pick -----

function todayIsoDate() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function updateDateDisplay() {
  dateDisplay.textContent = dateInput.value ? formatDate(dateInput.value) : "";
}

function resetDateToToday() {
  dateInput.value = todayIsoDate();
  updateDateDisplay();
}

dateInput.addEventListener("input", updateDateDisplay);
dateInput.addEventListener("change", updateDateDisplay);

resetDateToToday();

// --- Theme toggle ---------------------------------------------------------

const THEME_KEY = "glovebox-theme";
const prefersDark = window.matchMedia("(prefers-color-scheme: dark)");

function currentTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return prefersDark.matches ? "dark" : "light";
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  themeToggle.setAttribute("aria-checked", String(theme === "dark"));
  themeToggle.setAttribute(
    "aria-label",
    theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
  );
}

themeToggle.addEventListener("click", () => {
  const next = currentTheme() === "dark" ? "light" : "dark";
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
});

// If the user hasn't explicitly overridden the theme, keep following the
// device preference live (e.g. system switches to dark at sunset).
prefersDark.addEventListener("change", () => {
  if (!localStorage.getItem(THEME_KEY)) {
    applyTheme(currentTheme());
  }
});

applyTheme(currentTheme());

// --- Units toggle (form + history both respect it; API/DB stay mi/gal) ---

const UNITS_KEY = "glovebox-units";
const MI_TO_KM = 1.60934;
const GAL_TO_L = 3.78541;

function currentUnits() {
  const stored = localStorage.getItem(UNITS_KEY);
  return stored === "metric" ? "metric" : "imperial";
}

function applyUnits(units) {
  unitsToggle.setAttribute("aria-checked", String(units === "metric"));
  unitsToggle.textContent = units === "metric" ? "KM" : "MI";
  unitsToggle.setAttribute(
    "aria-label",
    units === "metric"
      ? "Switch to miles and gallons"
      : "Switch to kilometers and liters"
  );
  odometerLabel.textContent = units === "metric" ? "Odometer (km)" : "Odometer (mi)";
  volumeLabel.textContent = units === "metric" ? "Liters" : "Gallons";
  renderHistory();
}

// Converts whatever the user has already typed into the form so switching
// units mid-entry doesn't silently change the meaning of the number.
function convertFormFields(fromUnits, toUnits) {
  if (fromUnits === toUnits) return;
  const toMetric = toUnits === "metric";

  if (odometerInput.value !== "") {
    const num = Number(odometerInput.value);
    if (Number.isFinite(num)) {
      odometerInput.value = Math.round(toMetric ? num * MI_TO_KM : num / MI_TO_KM);
    }
  }

  if (volumeInput.value !== "") {
    const num = Number(volumeInput.value);
    if (Number.isFinite(num)) {
      volumeInput.value = (toMetric ? num * GAL_TO_L : num / GAL_TO_L).toFixed(2);
    }
  }
}

unitsToggle.addEventListener("click", () => {
  const prev = currentUnits();
  const next = prev === "metric" ? "imperial" : "metric";
  localStorage.setItem(UNITS_KEY, next);
  convertFormFields(prev, next);
  applyUnits(next);
});

function formatOdometer(miles, units) {
  const num = Number(miles);
  if (!Number.isFinite(num)) return String(miles);
  if (units === "metric") {
    return `${Math.round(num * MI_TO_KM).toLocaleString()} km`;
  }
  return `${Math.round(num).toLocaleString()} mi`;
}

function formatVolume(volumeGallons, units) {
  const num = Number(volumeGallons);
  if (!Number.isFinite(num)) return String(volumeGallons);
  if (units === "metric") {
    return `${(num * GAL_TO_L).toFixed(2)} L`;
  }
  return `${num.toFixed(2)} gal`;
}

// --- Form error handling ---------------------------------------------------

function showError(message) {
  formError.textContent = message;
  formError.hidden = false;
}

function clearError() {
  formError.hidden = true;
  formError.textContent = "";
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

// --- Average efficiency dashboard ------------------------------------------

// Assumes every fill-up tops the tank: distance since the earliest entry
// divided by fuel added at every entry after it (the first entry's fuel
// doesn't correspond to any miles we've observed yet).
function computeAverageEfficiency(entries) {
  if (entries.length < 2) return null;

  const sorted = [...entries].sort((a, b) => a.odometer - b.odometer);
  const totalMiles = sorted[sorted.length - 1].odometer - sorted[0].odometer;
  const totalGallons = sorted.slice(1).reduce((sum, e) => sum + e.volume, 0);

  if (totalMiles <= 0 || totalGallons <= 0) return null;

  return {
    mpg: totalMiles / totalGallons,
    totalMiles,
    fillCount: sorted.length,
  };
}

function renderEfficiencyDash() {
  const result = computeAverageEfficiency(cachedEntries);

  if (!result) {
    dashValue.innerHTML =
      '<div class="dash-empty">Log at least 2 fill-ups to see your average</div>';
    dashSub.textContent = "";
    return;
  }

  const units = currentUnits();
  const isMetric = units === "metric";
  const displayValue = isMetric
    ? (result.mpg * (MI_TO_KM / GAL_TO_L)).toFixed(1)
    : result.mpg.toFixed(1);
  const unitLabel = isMetric ? "KM/L" : "MPG";

  const [whole, decimal] = displayValue.split(".");
  const digitTiles = whole
    .split("")
    .map((ch) => `<span class="dash-digit">${ch}</span>`)
    .join("");

  dashValue.innerHTML = `
    <div class="dash-digits">
      ${digitTiles}
      <span class="dash-digit dash-digit-unit">.${decimal} ${unitLabel}</span>
    </div>`;

  dashSub.textContent = `Based on ${result.fillCount} fill-ups · ${formatOdometer(
    result.totalMiles,
    units
  )} driven`;
}

// --- History list ------------------------------------------------------

function renderHistory() {
  renderEfficiencyDash();

  if (!cachedEntries.length) {
    historyList.innerHTML = '<li class="history-empty">No entries yet.</li>';
    return;
  }

  const units = currentUnits();

  historyList.innerHTML = cachedEntries
    .map((e) => {
      const notesHtml = e.notes
        ? `<div class="hi-notes">${escapeHtml(e.notes)}</div>`
        : "";
      return `
        <li class="history-item">
          <div class="hi-odo">${formatOdometer(e.odometer, units)}</div>
          <div class="hi-meta">${formatDate(e.date)} · <span class="hi-mono">${formatVolume(
            e.volume,
            units
          )}</span> · ${escapeHtml(e.added_by)}</div>
          ${notesHtml}
        </li>`;
    })
    .join("");
}

async function loadEntries() {
  historyList.innerHTML = '<li class="history-empty">Loading...</li>';
  try {
    const res = await fetch(API_URL);
    if (!res.ok) throw new Error(`Failed to load entries (${res.status})`);
    cachedEntries = await res.json();
    renderHistory();
  } catch (err) {
    historyList.innerHTML = `<li class="history-empty">Error loading entries: ${escapeHtml(
      err.message
    )}</li>`;
  }
}

// --- Account chip / popover ------------------------------------------------

function closeAccountPopover() {
  accountPopover.hidden = true;
  accountChip.setAttribute("aria-expanded", "false");
}

function openAccountPopover() {
  accountPopover.hidden = false;
  accountChip.setAttribute("aria-expanded", "true");
}

async function loadAccount() {
  try {
    const res = await fetch(ME_URL);
    if (!res.ok) throw new Error("not authenticated");
    const { email } = await res.json();
    if (!email) throw new Error("no email");

    accountChip.textContent = email.charAt(0).toUpperCase();
    accountChip.setAttribute("aria-label", `Logged in as ${email}`);
    accountPopover.textContent = email;
    accountChip.hidden = false;
  } catch (err) {
    // Non-critical UI enhancement — fail quietly and hide the chip.
    accountChip.hidden = true;
  }
}

accountChip.addEventListener("click", (event) => {
  event.stopPropagation();
  if (accountPopover.hidden) {
    openAccountPopover();
  } else {
    closeAccountPopover();
  }
});

document.addEventListener("click", (event) => {
  if (!accountPopover.hidden && !accountPopover.contains(event.target)) {
    closeAccountPopover();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !accountPopover.hidden) {
    closeAccountPopover();
    accountChip.focus();
  }
});

// --- Form submit -----------------------------------------------------------

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearError();

  const date = dateInput.value || todayIsoDate();
  const odometer = odometerInput.value;
  const volume = volumeInput.value;
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

  // The form accepts whichever unit is currently toggled, but the API/DB
  // always store canonical miles and gallons.
  const isMetric = currentUnits() === "metric";
  const odometerMiles = Math.round(isMetric ? odometerEntered / MI_TO_KM : odometerEntered);
  const volumeGallons = isMetric ? volumeEntered / GAL_TO_L : volumeEntered;

  const submitButton = form.querySelector("button[type=submit]");
  submitButton.disabled = true;

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        date,
        odometer: odometerMiles,
        volume: volumeGallons,
        notes: notes || null,
      }),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || `Failed to save entry (${res.status})`);
    }

    form.reset();
    resetDateToToday();
    await loadEntries();
  } catch (err) {
    showError(err.message);
  } finally {
    submitButton.disabled = false;
  }
});

applyUnits(currentUnits());
loadEntries();
loadAccount();
