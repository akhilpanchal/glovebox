// Theme toggle. prefers-color-scheme sets the default; an explicit choice is
// persisted and overrides the media query via the [data-theme] attribute. The
// icon shows the *destination* mode (moon in light mode = tap to go dark).

const THEME_KEY = "glovebox-theme";
const prefersDark = window.matchMedia("(prefers-color-scheme: dark)");

function currentTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return prefersDark.matches ? "dark" : "light";
}

function applyTheme(theme, button) {
  document.documentElement.setAttribute("data-theme", theme);
  button.setAttribute("aria-checked", String(theme === "dark"));
  button.setAttribute(
    "aria-label",
    theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
  );
}

export function initTheme(button) {
  button.addEventListener("click", () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next, button);
  });

  // Follow the device preference live until the user explicitly overrides it.
  prefersDark.addEventListener("change", () => {
    if (!localStorage.getItem(THEME_KEY)) applyTheme(currentTheme(), button);
  });

  applyTheme(currentTheme(), button);
}
