// Entry point: wire the shared header, mount the router, register routes.
// Feature logic lives in js/<feature>.js — this file just boots them.
import { initTheme } from "./js/theme.js";
import { initUnitsToggle } from "./js/units.js";
import { initAccount } from "./js/account.js";
import { initRouter, registerRoute, startRouter } from "./js/router.js";
import { initFuel, loadFuel } from "./js/fuel.js";
import { initVehicle, loadVehicle } from "./js/vehicle.js";
import { initMaintenance, loadMaintenance } from "./js/maintenance.js";
import { initInsurance, loadInsurance } from "./js/insurance.js";
import { initCharging, loadCharging } from "./js/charging.js";

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

startRouter();

// Gas/Charge segmented control: show/hide the two panels (both stay in the DOM
// so a half-typed entry survives a switch) and remember the last-used segment.
function initSegment() {
  const KEY = "glovebox-log-segment";
  const gasBtn = document.getElementById("seg-gas");
  const evBtn = document.getElementById("seg-ev");
  const panelGas = document.getElementById("panel-gas");
  const panelEv = document.getElementById("panel-ev");

  function select(segment) {
    const gas = segment !== "ev";
    panelGas.hidden = !gas;
    panelEv.hidden = gas;
    gasBtn.classList.toggle("active", gas);
    evBtn.classList.toggle("active", !gas);
    gasBtn.setAttribute("aria-selected", String(gas));
    evBtn.setAttribute("aria-selected", String(!gas));
    localStorage.setItem(KEY, gas ? "gas" : "ev");
  }

  gasBtn.addEventListener("click", () => select("gas"));
  evBtn.addEventListener("click", () => select("ev"));
  select(localStorage.getItem(KEY) === "ev" ? "ev" : "gas");
}
