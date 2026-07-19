import { getMe } from "./api.js";

// Account chip + email popover. Non-critical enhancement: if /api/me 401s, the
// chip hides itself and never blocks the core flow.
export function initAccount(chip, popover) {
  function close() {
    popover.hidden = true;
    chip.setAttribute("aria-expanded", "false");
  }
  function open() {
    popover.hidden = false;
    chip.setAttribute("aria-expanded", "true");
  }

  chip.addEventListener("click", (event) => {
    event.stopPropagation();
    popover.hidden ? open() : close();
  });

  document.addEventListener("click", (event) => {
    if (!popover.hidden && !popover.contains(event.target)) close();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !popover.hidden) {
      close();
      chip.focus();
    }
  });

  getMe()
    .then(({ email }) => {
      if (!email) throw new Error("no email");
      chip.textContent = email.charAt(0).toUpperCase();
      chip.setAttribute("aria-label", `Logged in as ${email}`);
      popover.textContent = email;
      chip.hidden = false;
    })
    .catch(() => {
      chip.hidden = true;
    });
}
