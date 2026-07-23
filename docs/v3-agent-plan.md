# Glovebox v3 — Ask Glovebox (vehicle agent)

**Branch:** `dev/v3-agent`
**Status:** Draft for build
**Last updated:** 2026-07-22

Adds an **Ask** tab: a chat interface that answers questions about this specific
car by reasoning over its own service history, its owner's manual, and the web.

## Why this exists

The goal, in the owner's words: *"to enable me to take smarter decisions going
forward."* Not record-keeping — record-keeping is v2, and it's done. This is
decision support.

The motivating case is concrete and already in the data. Per the owner's manual
(p. 479–481), an **"A1" service means exactly two things: replace engine oil and
oil filter (`A`), and rotate the tires (`1`)**. Nothing else. Priced against the
history:

| Visit | Billed as | Paid |
|---|---|---|
| 18 Jul 2026 · Honda San Carlos | oil + filter + rotation | **$169.17** |
| 29 Jan 2026 · Anderson Honda | "A1 service" alone | **$295.80** |
| 1 Aug 2025 · Anderson Honda | A1 + brake flush + air filters | **$741.06** |

Same code, same car. An agent holding both the manual and the invoice history
would have flagged that spread unprompted. A second example found during
planning: **brake fluid is code `7`**, on a ~3-year interval — but it was flushed
in Oct 2023 (\$204.20) and again in Aug 2025, **22 months apart**.

Neither finding required intelligence. Both required *having the manual and the
history in the same place at the same time*. That is the entire product.

## Research findings

### The corpus is tiny — this is not a RAG problem

| Source | Rows | Est. tokens |
|---|---|---|
| `maintenance_entries` | 7 | ~4k |
| `fuel_entries` | dozens | ~3–5k |
| `charging_sessions` | dozens | ~2k |
| `VEHICLE` config | 1 | ~0.1k |
| **Total** | | **~10k** |

That fits in a prompt twenty times over. **No Vectorize, no embeddings, no
chunking.** Retrieval over a corpus this small can only lose information the
model needed. Serialize all of it, every request.

### The manual is 659 pages, but the useful part is 15

`ATRW1919OM.PDF` (2019 Clarity PHEV owner's manual): 30 MB, **659 pages**, with a
real text layer — 33.5k text-show operators, **no OCR needed**. Whole-document
size is ~360k tokens, far too large to prompt.

But the decision-relevant content is extraordinarily concentrated. The complete
Maintenance Minder code table lives on **pages 479–481** — three pages:

| Code | Meaning |
|---|---|
| `A` | Replace engine oil + oil filter |
| `0` | Inspect front/rear brakes · tie rod ends, steering gearbox & boots · suspension · driveshaft boots · brake hoses & lines (incl. ABS/VSA) · all fluid levels · exhaust · fuel lines · underbody battery cover |
| `1` | Rotate tires |
| `2` | Replace dust and pollen filter |
| `3` | Replace transmission fluid |
| `4` | Replace spark plugs + inspect valve clearance |
| `5` | Replace engine coolant |
| `7` | Replace brake fluid |
| `8` | Replace air cleaner element |

Manual footnotes worth carrying verbatim: change oil at least yearly regardless
of Minder; dust/pollen filter every 15,000 mi in high-soot urban areas;
transmission fluid every 47,500 mi / 3 yr under sustained low-speed mountain
driving; brake fluid every 3 yr if no message within 36 months; air cleaner every
15,000 mi in dusty conditions.

Note this car uses **`A` + `0`** (US models); there is no `B` code. Canadian
models use `9` where US uses `0`.

**Decision: curated facts file, not RAG.** Beyond the size argument, RAG would
actively fail here — that code table is a dense grid of two-word phrases with
almost no keyword surface. "Do I need a brake flush?" plausibly retrieves the
*brake fluid reservoir check* page instead, and nothing would signal the miss.
~15 curated pages at ~5k tokens sit in context permanently, for a fraction of a
cent. Web search covers the long tail.

## 1. Scope

**v3.0 is chat only, with ephemeral history.** New `#/ask` tab, streaming
answers, conversation lives in browser memory and is gone on reload. Smallest
thing that proves the concept.

Explicitly **not** in v3.0 (revisit once real usage exists):

- Persistent chat threads in D1
- Proactive "what's due" dashboard card
- A UI field for the current Maintenance Minder code — for v3.0 the owner just
  types it into the chat ("dash shows B12"), which costs nothing and defers the
  schema question until we know it's wanted
- Push/email reminders, multi-vehicle, spend analytics

### The six question classes it must serve

| # | Class | Example | Needs |
|---|---|---|---|
| 1 | Recall | "When did I last change the oil?" | DB |
| 2 | Derived | "What's my real MPG?" | DB + computed stats |
| 3 | **Should I actually?** ⭐ | "They want \$204 for a brake flush — do I need it?" | DB + manual + web |
| 4 | Due / upcoming | "What's coming in the next 5,000 miles?" | DB + manual + date |
| 5 | Price sanity | "Is \$853 reasonable for an A1?" | DB + web |
| 6 | Warranty / recall | "Is the A/C condenser still covered?" | DB + in-service date + web |

Class 3 is the product; the rest are the surrounding surface.

## 2. Data gaps to close first

These block real questions and no architecture substitutes for them.

1. **Original in-service date — OPEN.** Bulletin 21-017 runs 10 years from the
   car's *first retail sale*, not from the owner's April 2023 pre-owned purchase.
   For a 2019 that's likely mid-2018 to 2019, so coverage probably expires
   **2028–2029**. Given the condenser's 12–15 month failure cycle (Oct 2023 →
   Oct 2024 → Jan 2026), knowing the exact date decides whether the next one or
   two replacements are free. VIN-linked; any Honda dealer can read it.
2. **`purchase_date` / `vin` empty** in `src/config/vehicle.js`. VIN is known
   from every service summary: `JHMZC5F33KC005237`. Purchase: April 2023,
   pre-owned, dealership in Oxnard, CA.
3. **The ownership void.** Owned since April 2023; first record is Oct 2023 at
   32,242 mi. Roughly 30,000 miles of prior history is unknown. This must be an
   **explicit fact in the context**, not an absence — otherwise the model reasons
   "no record of spark plugs → still original → replace them," when the previous
   owner may have done exactly that.
4. **Four summaries carry superseded claims** (see Phase 0). Once all seven land
   in one prompt, contradictions become answers.

## 3. Schema change — `summary_md`

`migrations/0005_summary.sql`:

```sql
ALTER TABLE maintenance_entries ADD COLUMN summary_md TEXT;
```

The rich per-visit narrative (brake thickness, tread depth, inspection results,
warranty bulletin detail) currently exists **only as `.md` files on one laptop**.
The DB's `notes` column is deliberately a one-liner. Without this column the
agent answers class-3 questions from date/cost/line-items alone — noticeably
shallower.

**Input path:** a plain `<textarea>` in the maintenance form labelled "Full
summary (Markdown)". Raw paste, **no JSON escaping** — which sidesteps the
backslash-eating bug that broke the July 2024 import entirely. It is deliberately
*not* added to the "Import from Claude" JSON payload.

**What goes in it — per-visit content only.** Split by ownership:

| Content | Home | Why |
|---|---|---|
| This visit: jobs, measurements, costs, warranty detail | `summary_md` → agent | Unique. Can never go stale. |
| Cross-visit history table, running totals, trends | `context.js`, computed live | Always current by construction. |
| Both | the `.md` on disk | Repetition is a *feature* for a human opening one file standalone. |

Deduping the `.md` files is micro-optimization (~6k tokens, a fraction of a cent
per question). This split is not — it makes contradiction structurally
impossible, and drops the redundancy as a side effect.

Backfill all seven visits by hand after the migration.

## 4. The context — `src/lib/context.js`

One function, `buildContext(env)`, returns the complete brief the model sees.
Assembled per request; ~15k tokens.

**Context is not the same thing as the rules**, though both ride in the `system`
parameter. The rules say *how to behave* ("never compute aggregates yourself") —
hand-written, versioned in git, unchanged for months. The context says *what is
true about this car* ("last brake fluid: 1 Aug 2025") — generated from D1 on
every request. Keeping them apart is what makes a wrong answer diagnosable: a
missing fact is a `context.js` bug, bad judgment is a `RULES` bug. Tangled into
one string, you can't tell which, and you end up editing prose at random.

```
buildContext(env)
├── vehicle          VEHICLE config + VIN + ownership_start + the void note
├── maintenance      all rows incl. summary_md, newest first
├── fuel             all rows
├── charging         all rows
├── derived          computed in JS — see below
└── manual           MANUAL_FACTS from src/config/manual.js
```

### Deterministic math in JS, judgment in the model

**Never ask the model to add up the fuel log.** It will be subtly wrong and
sound certain. `derived` is computed in JavaScript and handed over as fact:

- current odometer (max across all three logs) and its date
- miles + months since: last oil change, last tire rotation, last brake fluid,
  last transmission fluid, last coolant
- real gas MPG (electric miles excluded, per v2.1), % electric, mi/kWh
- lifetime spend, spend by category, spend by shop, cost per mile
- average miles/year → used to project when a mileage interval will be reached
- A/C condenser replacement dates + the interval between them

Every number the agent quotes should trace to this block or to a `summary_md`.

## 5. API — `POST /glovebox/api/chat`

`src/handlers/chat.js`. Request `{ messages: [{role, content}] }`; response is an
SSE stream piped straight through.

```
authedEmail(request, env)         ← same Access header as every other handler; 401 if absent
  ↓
buildContext(env)
  ↓
fetch https://api.anthropic.com/v1/messages
  x-api-key: env.ANTHROPIC_API_KEY        ← Worker secret, never in the browser
  anthropic-version: 2023-06-01
  model: claude-sonnet-5
  stream: true
  system: [ {RULES}, {context, cache_control:{type:"ephemeral"}} ]
  tools:  [ web_search ]                  ← executes on Anthropic's servers
  ↓
return new Response(upstream.body, {headers: {"content-type":"text/event-stream"}})
```

Three things keep this small:

- **No tool-calling loop in the Worker.** `web_search` runs server-side at
  Anthropic, so the Worker is a dumb streaming proxy — `fetch` in, body out. No
  orchestration, no retries, no agent framework, no new dependency.
- **The context is stable between turns**, so prompt caching applies: the ~15k
  context is a cache *read* on every turn after the first.

**Ordering inside `system` is deliberate.** Prompt caching works on **prefixes** —
it matches from the start of the request up to a marked breakpoint, and the first
byte that differs invalidates everything after it. `RULES` is hand-written and
effectively never changes; the context changes every time a service visit is
logged. Volatile-last means a new maintenance entry invalidates only the tail.
Reversing them would throw away the whole cache on every entry.
- **No new frontend dependency.** An SSE reader is ~40 lines of vanilla JS.

Verify the current `web_search` tool version string and whether prompt caching
still wants a beta header against the live API docs at build time.

Guards: cap `max_tokens`; reject bodies over N messages; 400 on malformed input.
Access already restricts callers to family, so no auth work beyond `authedEmail`.

**Secrets:** `wrangler secret put ANTHROPIC_API_KEY` for production, plus a line
in `.dev.vars` (and a placeholder in `.dev.vars.example`) for local.

## 6. Frontend — `#/ask`

`public/glovebox/js/ask.js`, registered in `router.js` like every other tab.

- Message list + textarea + send button. Enter sends, Shift+Enter newlines.
- Streams tokens into the last bubble as they arrive.
- Renders assistant replies as light Markdown (bold, lists, tables) — the answers
  are comparative and want tables. A ~60-line renderer, no library.
- Surfaces web-search citations as links when present.
- Empty state seeds 3–4 starter questions drawn from the classes in §1, so the
  first use isn't a blank box.

## 7. System prompt design

Beyond the context, the rules block should establish:

- **You are advising on one specific car**, described entirely below. Prefer its
  own history over generic internet advice when the two conflict.
- **Quote numbers only from `derived` or a `summary_md`.** Never compute
  aggregates yourself.
- **The ownership void is real.** No record before April 2023 means *unknown*,
  never *not done*. Say so out loud rather than inferring.
- **Cite the manual by code** when recommending or declining a service — "code 7,
  brake fluid, ~3 year interval" beats "brakes should be flushed periodically."
- **Be willing to say a service isn't needed**, and say what it would cost if it
  were. Upsell detection is the job.
- **Not a mechanic.** Flag safety-relevant symptoms for professional inspection
  rather than diagnosing them.
- Today's date, injected per request.

## 8. Manual extraction skill

`.claude/skills/manual-extract/SKILL.md` — same shape as `maintenance-extract`.
Input: the owner's-manual PDF. Output: `src/config/manual.js` exporting
`MANUAL_FACTS`, ~5k tokens, covering the Minder code tables (§Research) and their
footnotes verbatim, fluid specs (ATF DW-1, DOT 3 brake fluid), capacities, tire
sizes and pressures, bulb specs, and wear limits.

One-time run, versioned in git, re-run only if the manual is revised. The PDF has
a clean text layer, so extraction is scripted, not visual.

## 9. Cost

~15k cached context + ~800 output tokens per question puts this at roughly **one
to two cents per question** on a Sonnet-class model — under a dollar a month at
family volume. Not a constraint; do not design around it. If per-family-member
visibility or a hard cap is ever wanted, Cloudflare AI Gateway drops in front of
the same endpoint without touching handler code.

## 10. Build phasing

Each phase is independently testable in `wrangler dev`. Migrations `--local`
first, `--remote` before the push to `main` (Workers Builds auto-deploys).

- **Phase 0 — data hygiene.** Fill `vin` + `purchase_date` in
  `src/config/vehicle.js`. Fix the four stale summaries: `Aug 2025`, `Oct 2023`,
  `Oct 2024` still call the Jan 2026 brake reading an "unmeasured default"
  (retracted — regenerative braking means the pads barely wear); `Oct 2024` and
  `Jan 2026` say the condenser failed *twice* when it is three times. Stamp
  cross-visit sections "as of <date>". Update `maintenance-extract/SKILL.md` so
  future summaries don't mint new contradictions.
- **Phase 1 — manual facts.** Build the skill, generate `src/config/manual.js`.
  Pure data, no runtime surface, verifiable on its own.
- **Phase 2 — `summary_md`.** Migration 0005, handler + normalize() support,
  textarea in the maintenance form, backfill seven visits.
- **Phase 3 — context.** `src/lib/context.js` + a temporary
  `GET /api/context` (dev-only) to eyeball the assembled context and check the
  derived math by hand before any model sees it.
- **Phase 4 — chat endpoint.** `src/handlers/chat.js`, secret, streaming
  passthrough. Test with `curl` before building any UI.
- **Phase 5 — `#/ask` tab.** Router entry, `ask.js`, streaming reader, Markdown
  rendering, starter questions.
- **Phase 6 — evaluate.** Run the six question classes against the real corpus.
  The two known-good checks: *"Is \$295.80 reasonable for an A1 service?"* should
  surface the \$169.17 comparison unprompted, and *"Do I need a brake flush?"*
  should cite code 7 and the 22-month gap.

## 11. Open questions

- **Original in-service date** (§2.1) — blocks class-6 answers. Needs a dealer or
  Honda owner-site lookup against the VIN.
- Whether `document_urls` (photo links) should be surfaced to the agent so it can
  point at source paperwork. Cheap to add later; not v3.0.
