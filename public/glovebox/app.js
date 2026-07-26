// Entry point: wire the shared header, mount the router, register routes.
// Feature logic lives in js/<feature>.js — this file just boots them.
import { initTheme } from "./js/theme.js";
import { initUnitsToggle } from "./js/units.js";
import { initAccount } from "./js/account.js";
import { initRouter, registerRoute, startRouter } from "./js/router.js";
import { initFuel, loadFuel, setDashSegment } from "./js/fuel.js";
import { initVehicle, loadVehicle } from "./js/vehicle.js";
import { initMaintenance, loadMaintenance } from "./js/maintenance.js";
import { initInsurance, loadInsurance } from "./js/insurance.js";
import { initCharging, loadCharging } from "./js/charging.js";
import { initChat, loadChat } from "./js/chat.js";

initTheme(document.getElementById("theme-toggle"));
initUnitsToggle(document.getElementById("units-toggle"));
initAccount(
  document.getElementById("account-chip"),
  document.getElementById("account-popover")
);

initRouter({
  app: document.querySelector(".app"),
  nav: document.getElementById("side-nav"),
  navToggle: document.getElementById("nav-toggle"),
  scrim: document.getElementById("nav-scrim"),
});

// Fuel tab (default) + Vehicle (header name → detail view) + Maintenance +
// Insurance.
initFuel();
initVehicle(
  document.getElementById("nav-vehicle-name"),
  document.getElementById("route-vehicle")
);
initMaintenance();
initInsurance(document.getElementById("insurance-body"));
initCharging();
initChat({
  log: document.getElementById("ask-log"),
  form: document.getElementById("ask-form"),
  input: document.getElementById("ask-input"),
  send: document.getElementById("ask-send"),
  error: document.getElementById("ask-error"),
  status: document.getElementById("ask-status"),
});
initSegment();

// The Fuel & Charging tab (default, #/log) holds both the fuel and charging
// logs behind a Gas/Charge segmented control, so its load fetches both.
registerRoute("#/log", document.getElementById("route-log"), () => {
  loadFuel();
  loadCharging();
});
registerRoute("#/maintenance", document.getElementById("route-maintenance"), loadMaintenance);
registerRoute("#/insurance", document.getElementById("route-insurance"), loadInsurance);
registerRoute("#/vehicle", document.getElementById("route-vehicle"), loadVehicle);
registerRoute("#/ask", document.getElementById("route-ask"), loadChat);

startRouter();

// Gas/Charge segmented control: show/hide the two panels (both stay in the DOM
// so a half-typed entry survives a switch) and remember the last-used segment.
function initSegment() {
  const KEY = "glovebox-log-segment";
  const gasBtn = document.getElementById("seg-gas");
  const evBtn = document.getElementById("seg-ev");
  const panelGas = document.getElementById("panel-gas");
  const panelEv = document.getElementById("panel-ev");

  function setTab(btn, active) {
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", String(active));
    btn.tabIndex = active ? 0 : -1; // roving tabindex for the tablist
  }

  function select(segment) {
    const gas = segment !== "ev";
    panelGas.hidden = !gas;
    panelEv.hidden = gas;
    setTab(gasBtn, gas);
    setTab(evBtn, !gas);
    localStorage.setItem(KEY, gas ? "gas" : "ev");
    setDashSegment(gas ? "gas" : "ev"); // dashboard reflects the active segment
  }

  gasBtn.addEventListener("click", () => select("gas"));
  evBtn.addEventListener("click", () => select("ev"));

  // Arrow-key navigation between the two tabs (WAI-ARIA tabs pattern).
  for (const btn of [gasBtn, evBtn]) {
    btn.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        select("ev");
        evBtn.focus();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        select("gas");
        gasBtn.focus();
      }
    });
  }

  select(localStorage.getItem(KEY) === "ev" ? "ev" : "gas");
}
