// Entry point: wire the shared header, mount the router, register routes.
// Feature logic lives in js/<feature>.js — this file just boots them.
import { initTheme } from "./js/theme.js";
import { initUnitsToggle } from "./js/units.js";
import { initAccount } from "./js/account.js";
import { initRouter, registerRoute, startRouter } from "./js/router.js";
import { initFuel, loadFuel } from "./js/fuel.js";
import { initVehicle, loadVehicle } from "./js/vehicle.js";
import { initMaintenance, loadMaintenance } from "./js/maintenance.js";

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

// Fuel tab (default) + Vehicle (header name → detail view) + Maintenance.
// Insurance is a placeholder until Phase D wires its module.
initFuel();
initVehicle(
  document.getElementById("vehicle-name"),
  document.getElementById("route-vehicle")
);
initMaintenance();
registerRoute("#/fuel", document.getElementById("route-fuel"), loadFuel);
registerRoute("#/maintenance", document.getElementById("route-maintenance"), loadMaintenance);
registerRoute("#/insurance", document.getElementById("route-insurance"), null);
registerRoute("#/vehicle", document.getElementById("route-vehicle"), loadVehicle);

startRouter();
