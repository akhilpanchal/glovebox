// Minimal hash router + nav/hamburger wiring. Each route owns a <section>; its
// load() runs once, on first activation (lazy fetch). No framework.

const routes = new Map(); // hash -> { section, load, loaded }
const DEFAULT_HASH = "#/log";

let appEl;
let navEl;
let navToggleEl;

export function initRouter({ app, nav, navToggle, scrim }) {
  appEl = app;
  navEl = nav;
  navToggleEl = navToggle;

  navToggle.addEventListener("click", toggleNav);
  scrim.addEventListener("click", closeNav);
  // Close the mobile nav after picking a destination.
  nav.addEventListener("click", (event) => {
    if (event.target.closest(".nav-item")) closeNav();
  });
  window.addEventListener("hashchange", render);
}

export function registerRoute(hash, section, load) {
  routes.set(hash, { section, load, loaded: false });
}

export function startRouter() {
  if (!routes.has(location.hash)) location.hash = DEFAULT_HASH;
  else render();
}

function toggleNav() {
  const open = appEl.classList.toggle("nav-open");
  navToggleEl.setAttribute("aria-expanded", String(open));
}

function closeNav() {
  appEl.classList.remove("nav-open");
  navToggleEl.setAttribute("aria-expanded", "false");
}

function render() {
  const hash = routes.has(location.hash) ? location.hash : DEFAULT_HASH;

  for (const [h, route] of routes) {
    const active = h === hash;
    route.section.hidden = !active;
    // Re-run load() on every activation so a tab reflects data changed on another
    // tab (e.g. the Fuel efficiency card picking up a newly-logged charge).
    if (active && route.load) route.load();
  }

  navEl.querySelectorAll(".nav-item").forEach((link) => {
    link.classList.toggle("active", link.getAttribute("data-route") === hash);
  });

  closeNav();
}
