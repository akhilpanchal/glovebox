// The "Ask" tab — a chat with the v3 maintenance agent (POST /api/chat).
// Stateless server; the transcript lives here and in sessionStorage so a refresh
// in the same session keeps the conversation. No framework.
import { postChat } from "./api.js";
import { escapeHtml } from "./format.js";

const STORAGE_KEY = "glovebox-ask-transcript";
const SUGGESTIONS = [
  "Is my brake fluid due?",
  "Are any of my air filters due?",
  "When did I last change the oil?",
  "What maintenance is coming up?",
];

let els = null; // { log, form, input, send, error }
let messages = []; // [{ role: "user" | "assistant", content }]
let pending = false; // awaiting a reply → show the thinking bubble, lock input

// --- persistence ------------------------------------------------------------

function load() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    messages = Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    messages = [];
  }
}

function save() {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  } catch (_) {
    /* private-mode / quota — non-critical, the in-memory copy still works */
  }
}

// --- minimal, safe markdown -------------------------------------------------
// Escape ALL html first, then re-introduce only our own tags for the small
// subset the model actually emits: **bold**, "- " bullet lists, and paragraphs.
// Because the source is escaped up front, model output can never inject markup.
function renderMarkdown(src) {
  const bold = escapeHtml(src).replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  return bold
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block.split("\n").filter((l) => l.trim() !== "");
      if (lines.length && lines.every((l) => /^\s*[-*]\s+/.test(l))) {
        const items = lines.map((l) => `<li>${l.replace(/^\s*[-*]\s+/, "")}</li>`).join("");
        return `<ul>${items}</ul>`;
      }
      return `<p>${lines.join("<br>")}</p>`;
    })
    .join("");
}

// --- rendering --------------------------------------------------------------

function bubble(role, html) {
  return `<div class="ask-msg ask-${role}"><div class="ask-bubble">${html}</div></div>`;
}

function render() {
  if (messages.length === 0 && !pending) {
    const chips = SUGGESTIONS.map(
      (q) => `<button type="button" class="ask-chip" data-prompt="${escapeHtml(q).replace(/"/g, "&quot;")}">${escapeHtml(q)}</button>`
    ).join("");
    els.log.innerHTML = `
      <div class="ask-empty">
        <p class="ask-empty-title">Ask about your car</p>
        <p class="ask-empty-sub">Maintenance history, whether a service is due, what it should cost.</p>
        <div class="ask-suggestions">${chips}</div>
      </div>`;
    return;
  }

  const parts = messages.map((m) =>
    m.role === "user"
      ? bubble("user", `<p>${escapeHtml(m.content).replace(/\n/g, "<br>")}</p>`)
      : bubble("assistant", renderMarkdown(m.content))
  );
  if (pending) {
    parts.push(
      `<div class="ask-msg ask-assistant"><div class="ask-bubble ask-thinking"><span></span><span></span><span></span></div></div>`
    );
  }
  els.log.innerHTML = parts.join("");
  els.log.scrollTop = els.log.scrollHeight;
}

function showError(message) {
  els.error.textContent = message;
  els.error.hidden = false;
}

function clearError() {
  els.error.hidden = true;
  els.error.textContent = "";
}

// --- sending ----------------------------------------------------------------

async function send(text) {
  const content = text.trim();
  if (!content || pending) return;

  clearError();
  messages.push({ role: "user", content });
  save();
  pending = true;
  updateLock();
  render();

  try {
    const { reply } = await postChat(messages);
    messages.push({ role: "assistant", content: reply || "(no response)" });
    save();
  } catch (err) {
    showError(err.message || "The assistant is unavailable right now.");
  } finally {
    pending = false;
    updateLock();
    render();
    els.input.focus();
  }
}

function updateLock() {
  els.input.disabled = pending;
  els.send.disabled = pending;
}

// --- textarea behavior ------------------------------------------------------

function autoGrow() {
  els.input.style.height = "auto";
  els.input.style.height = `${Math.min(els.input.scrollHeight, 160)}px`;
}

// --- wiring -----------------------------------------------------------------

export function initChat({ log, form, input, send: sendBtn, error }) {
  els = { log, form, input, send: sendBtn, error };
  load();

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value;
    input.value = "";
    autoGrow();
    send(text);
  });

  // Enter sends; Shift+Enter inserts a newline.
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      form.requestSubmit();
    }
  });

  input.addEventListener("input", autoGrow);

  // Suggestion chips (event-delegated — they're re-rendered).
  log.addEventListener("click", (e) => {
    const chip = e.target.closest(".ask-chip");
    if (chip) send(chip.dataset.prompt);
  });
}

// Called on every route activation: repaint and focus. Nothing to fetch — the
// transcript is already in memory / sessionStorage.
export function loadChat() {
  render();
  els.log.scrollTop = els.log.scrollHeight;
  els.input.focus();
}
