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

let els = null; // { log, form, input, send, error, status }
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
        <div class="empty-state-icon">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>
        </div>
        <h2 class="ask-empty-title">Ask about your car</h2>
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
      `<div class="ask-msg ask-assistant"><div class="ask-bubble ask-thinking" aria-hidden="true"><span></span><span></span><span></span></div></div>`
    );
  }
  els.log.innerHTML = parts.join("");
  els.log.scrollTop = els.log.scrollHeight;
}

function showError(message) {
  els.error.innerHTML = `<span>${escapeHtml(
    message || "The assistant is unavailable right now."
  )}</span> <button type="button" class="ask-retry">Retry</button>`;
  els.error.hidden = false;
  els.error.querySelector(".ask-retry").addEventListener("click", retry);
}

function clearError() {
  els.error.hidden = true;
  els.error.innerHTML = "";
}

// Re-send the last (unanswered) user turn after a failed request.
function retry() {
  if (pending) return;
  if (messages.length && messages[messages.length - 1].role === "user") {
    clearError();
    runTurn();
  }
}

// --- sending ----------------------------------------------------------------

async function send(text) {
  const content = text.trim();
  if (!content || pending) return;

  clearError();
  messages.push({ role: "user", content });
  save();
  await runTurn();
}

// Post the current transcript and append the reply. Split out from send() so a
// failed request can be retried without pushing the user's turn again.
async function runTurn() {
  pending = true;
  updateLock();
  els.status.textContent = "Thinking…"; // SR announcement while the request runs
  render();

  try {
    const { reply } = await postChat(messages);
    const answer = reply || "(no response)";
    messages.push({ role: "assistant", content: answer });
    save();
    els.status.textContent = answer; // announce only the new reply, not the whole log
  } catch (err) {
    els.status.textContent = "";
    showError(err.message);
  } finally {
    pending = false;
    updateLock();
    render();
    els.input.focus();
  }
}

function updateLock() {
  els.input.disabled = pending;
  updateSendState();
}

// The send button reflects whether there's anything to send (and isn't mid-request),
// so it never looks tappable while the input is empty.
function updateSendState() {
  els.send.disabled = pending || !els.input.value.trim();
}

// --- textarea behavior ------------------------------------------------------

function autoGrow() {
  els.input.style.height = "auto";
  els.input.style.height = `${Math.min(els.input.scrollHeight, 160)}px`;
}

// --- wiring -----------------------------------------------------------------

export function initChat({ log, form, input, send: sendBtn, error, status }) {
  els = { log, form, input, send: sendBtn, error, status };
  load();
  updateSendState(); // start disabled — nothing typed yet

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

  input.addEventListener("input", () => {
    autoGrow();
    updateSendState();
  });

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
