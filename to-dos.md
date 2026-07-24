# Glovebox — To-Dos / Backlog

A lightweight, Trello/Jira-style backlog for **non-urgent** stories: things worth
doing eventually, tracked so they aren't forgotten. Nothing here is blocking.

## How this board works

- **Statuses:** `Backlog` (captured, not scheduled) → `To Do` (ready to pick up) →
  `In Progress` → `Done`. Move a story by changing its **Status** line; when it's
  `Done`, keep it (strike it or move it to the Done section) for history.
- **Priority:** `P1` (do sooner) · `P2` (normal) · `P3` (nice to have).
- **IDs:** `GLOV-<n>`, incrementing. Never reuse a number.
- **Areas:** `docs` · `ui` · `api` · `data` · `agent` · `skill` — tag what it touches.

---

## Backlog

### GLOV-1 — Owner-neutral language everywhere (vehicle-anchored, not owner-tailored)

- **Status:** Backlog
- **Priority:** P2
- **Area:** docs, data, ui, agent, skill
- **Created:** 2026-07-23

**Problem.** Generated documents, seeded data, and (future) UI copy are written from
the *current owner's* point of view. Words like "previous owner," "current owner,"
"your ownership," "you bought," and the literal name "Akhil" are all relative to a
reference point that moves the instant the car changes hands, is used by another family
member, or is read back by the v3 agent long after the fact. "Previous owner" is also
plain ambiguous — previous to *whom?*

**Principle.** Anchor language to the **vehicle**, never to who owns it now. Things that
don't move: the VIN, absolute dates, odometer readings, and an **owner ordinal**
(Owner 1, Owner 2, …) taken from the Carfax / registration sequence. For this car:
Owner 1 = first owner (Oct 2019 – Apr 2023, 3–27,215 mi); Owner 2 = the Apr 2023 buyer.
If the car is ever sold, Owner 3 simply appears — nothing needs renaming.

**Scope — this is more than a find-and-replace:**

1. **Owner references** → ordinals. "previous owner" / "first owner" → **Owner 1**;
   "current owner" / "me" → **Owner 2** (or the relevant ordinal). Prefer "Owner N"
   over "first/previous" so it stays correct across future sales.
2. **Second-person voice** → third-person about the vehicle. "your ownership,"
   "you bought," "yours" → "under Owner 2," "at acquisition by Owner 2," "Owner 2's
   records."
3. **Named individual + PII.** The purchase summary bakes in the current owner's name,
   address, and credit score — the most owner-tailored content there is. Decide a rule:
   generated/shareable docs carry **owner labels only**; personal identity/PII is
   omitted or kept out of generated artifacts. (Future-proofing *and* privacy.)
4. **Unknown owners.** Say "owner unknown" for gaps, never "previous owner."
5. **Forward rule, not just cleanup.** Bake the convention into the `maintenance-extract`
   skill and the v3 agent's system prompt/rules so *new* output stays neutral — the
   agent must never say "you did X" when a different owner did it.

**Consider (design, not required):** model ownership as first-class — an owner dimension
(ordinal → date range → mileage range) so any record attributes objectively to an owner
instead of relying on prose. Today `added_by = 'carfax-import'` marks provenance but
doesn't encode *which* owner. A small ownership map would let the app/agent say
"Owner 1: 2019-10 → 2023-04, 3–27,215 mi" deterministically.

**Dependency captured — v3 price-fairness (2026-07-23):** the market-rate feature needs a
*current-owner location*: a default zip (currently **94070**) that anchors the web-search
price lookups and is announced at the top of each answer. This is owner-current state and
drifts (the owner moved from 94086 → 94070); it is distinct from vehicle state and from
frozen purchase-doc facts, which correctly keep the old 94086 address. v3.0 will stub it as
a `DEFAULT_ZIP` config constant; its proper home is the ownership model above. First
functional consumer of this story — not purely cosmetic.

**Acceptance criteria:**

- [ ] An owner-labeling convention is written down (ordinal, Carfax/registration-ordered)
      — in a style/glossary doc so it's enforceable going forward.
- [ ] No relative owner terms (`previous`/`current`/`your`/`you`/`me`) remain in
      generated artifacts or UI copy.
- [ ] A decision is recorded on the current owner's name/PII in generated docs
      (omit vs. owner-label only), and applied.
- [ ] Existing artifacts are retrofitted and the seed regenerated:
      - `migrations/0005_preownership.sql` (notes currently say "Previous owner, from Carfax")
      - `scripts/gen_preownership.py` (`PROV` constant)
      - `Purchase Documents/preownership-services.md` / `.html`
      - `Purchase Documents/carfax-history-2023-04-07.md` / `.html`
      - `Purchase Documents/purchase-summary-2023-04-07.md` / `.html`
      - `src/config/vehicle.js` (comment: "previous owner's records")
- [ ] The `maintenance-extract` skill and the v3 agent prompt/rules encode the convention.
- [ ] Current-owner location (the default market-rate zip, today 94070) has a real home in
      the ownership model — not a stray `DEFAULT_ZIP` constant — once that model exists.

**Notes.** If the seed migration reaches production before this is done, the fix is a
follow-up migration (or an in-app edit — the rows are ordinary `maintenance_entries`)
plus regenerating from `gen_preownership.py`. Not urgent; the data is correct, only the
framing is owner-relative.

---

### GLOV-2 — Hide cost in the maintenance UI (UI-only, data untouched)

- **Status:** Backlog
- **Priority:** P3
- **Area:** ui
- **Created:** 2026-07-23

**Problem.** Cost isn't the point of Glovebox — the goal is smarter maintenance decisions,
not expense tracking. Dealer prices are also skewed high and not worth surfacing as a
default. And pre-ownership records have no cost at all (Carfax never lists price), so
cost fields render empty/inconsistent on those cards.

**Decision (already made):** **hide in the UI only** — do **not** remove cost from the
data model or API. `total_cost` and `line_items[].cost` stay in the DB and keep flowing
through `GET /api/maintenance`; the frontend simply stops rendering them. Reversible, and
no data is lost (the market-rate comparison work in the v3 plan may still use costs
server-side / in the agent context even while the UI hides them).

**Scope:** the **maintenance cards only** (the history list). Out of scope for now:
the import/paste flow, the "Log a service" form, and the fuel/efficiency cost figures —
those stay as they are unless a separate story revisits them.

**Acceptance criteria:**

- [ ] Maintenance history cards no longer show a per-visit total or per-line-item cost.
- [ ] `total_cost` and `line_items[].cost` remain in the DB and in the `/api/maintenance`
      response (no schema or handler change).
- [ ] Cards with cost data and cards without (pre-ownership) render identically — no
      empty "$" / blank cost slots.
- [ ] Import/paste flow, service-entry form, and fuel cost figures are untouched.

**Notes.** Pure frontend change (`public/glovebox/`). If a "show cost" toggle is ever
wanted, the data is still there to switch back on. Relates to GLOV-1 only in spirit
(both are about what the app chooses to foreground).

---

### GLOV-3 — Surface generated documents inside the app (in-app document library)

- **Status:** Backlog
- **Priority:** P2
- **Area:** docs, ui, data
- **Created:** 2026-07-24

**Problem.** A growing set of generated human-readable artifacts — the purchase
summary, the Carfax history, the pre-ownership service list, the owner's-manual
essentials, and one Markdown/HTML summary per service visit — all live **outside the
repo** in `~/Documents/Honda Clarity/…`. They are the richest records the project has,
yet the Glovebox UI can't reach any of them. They should be surfaced into a
well-organized folder **within the app** so the UI can link to and display them
(this is the first real step toward the long-term "receipts/paperwork" vision in
CLAUDE.md — do it because it's now actually needed, not speculatively).

**Shape (design, not fixed).** The Worker already serves static assets from
`public/glovebox/` under the Access-gated `/glovebox*` scope, so a docs folder there
is automatically private to authenticated family members. Sketch:

- A folder like `public/glovebox/docs/` organized by kind:
  `purchase/`, `maintenance/` (per-visit summaries), `reference/` (owner-essentials).
- The HTML artifacts are already self-contained (inlined CSS, no external assets), so
  they can be served as-is. Confirm they render standalone when moved.
- **Discovery:** Workers Static Assets has no directory listing, so the UI needs an
  index — either a small committed `docs/manifest.json` (title, kind, date, path) or
  an API endpoint — for a "Documents" view to enumerate them.
- **Linking:** maintenance history cards link to their matching
  `service-summary-<date>.html`; a vehicle/purchase area links the purchase + Carfax
  docs; a reference area links owner-essentials.

**Dependencies / cross-links.**

- **PII (GLOV-1) blocks the purchase summary.** That document bakes in the current
  owner's name, address, and credit score. Surfacing it in-app serves it to everyone
  with Access — so PII removal must land **before** the purchase summary is exposed.
  Other docs (maintenance summaries, owner-essentials, Carfax) are safe to surface
  first.
- **maintenance-extract skill.** It currently writes summaries into the source-image
  directory. Decide whether the skill should also emit into `public/glovebox/docs/`
  (or a copy/sync step), so new visits land in the library automatically instead of
  being hand-moved.

**Acceptance criteria:**

- [ ] A committed, organized `public/glovebox/docs/` structure exists, with the
      existing safe artifacts (maintenance summaries, owner-essentials, Carfax) in it.
- [ ] The UI can enumerate the documents (manifest or endpoint) and open each one.
- [ ] Maintenance history cards deep-link to their per-visit summary where one exists.
- [ ] The purchase summary is only added **after** GLOV-1's PII decision is applied.
- [ ] A decision is recorded on how new service summaries reach the library
      (skill emits there vs. a manual/scripted copy step).

**Notes.** Everything served this way stays behind Cloudflare Access (`/glovebox*`),
so it's family-only by default — but treat "in the app" as "shared with everyone who
has Access," which is exactly why the PII gate above matters.

---

### GLOV-4 — Represent tire replacement as a maintenance item (brand-driven, not manufacturer-scheduled)

- **Status:** Backlog
- **Priority:** P2
- **Area:** data, agent, docs
- **Created:** 2026-07-24

**Problem.** The `service_items` taxonomy (the 9 canonical items from the Honda
Maintenance Minder) has **no concept of a tire *replacement*** — only `tire_rotation`.
So a major maintenance event like the Oct 2024 visit (all four tires replaced with
Goodyear Eagle LS2) currently carries **no service-item tag**, and the due-ness engine
has no way to reason about "when are the tires due for replacement?"

**Why it doesn't fit the existing model.** Every current due-ness item comes from the
**owner's manual / Honda schedule** — a fixed interval tied to the *vehicle*. Tire
replacement is fundamentally different: its cadence depends on the **fitted tire brand
and model** (tread-life warranty, e.g. a 50k/60k-mile treadwear rating), driving style,
and measured **tread depth** — none of which live in the owner's manual and none of
which are properties of the car. It's a real maintenance need, but a **different *kind*
of due-ness** (consumable-wear / product-warranty based, not manufacturer-interval
based). Forcing it into `manual.js` would be wrong.

**Things to think through (not decisions):**

- A distinct item type, e.g. `tires_replacement`, whose "interval" comes from the
  **installed tire's** treadwear/warranty mileage (captured at install time), not from
  the vehicle manual.
- Whether due-ness for it is **tread-based** (inspections record tread depth — e.g. the
  Jul 2026 visit logged 7/32 front, 6/32 rear; California legal minimum 2/32) rather
  than pure mileage, and whether the agent should reason from the tread trend.
- Where the tire's brand/model/warranty gets recorded — a new field on the install
  entry? a small `tires` concept? — and how the agent picks the *current* set after a
  replacement resets the clock.
- The agent's source hierarchy here is **web-first** (tire model reviews, treadwear
  ratings, local pricing) — closer to the price-fairness path than the manual-first
  due-ness path.

**Acceptance criteria (for when this is picked up):**

- [ ] A decision on how tire replacement is represented (item type + where brand/tread
      data lives), written down.
- [ ] The due-ness engine can answer "are the tires due for replacement?" using
      tread/warranty data, clearly flagged as brand-driven (not a Honda interval).
- [ ] The Oct 2024 four-tire replacement entry is taggable/attributable under the new
      model (retro-tag the existing row).

**Notes.** Out of scope for now (raised 2026-07-24 during the C' tagging review). The
current `service_items` backfill deliberately leaves tire-replacement visits untagged
rather than mislabel them. Relates to the v3 due-ness engine and, in spirit, to the
web-first price-fairness path.

---

## To Do

_(nothing scheduled yet)_

## In Progress

_(nothing in flight)_

## Done

_(nothing yet)_
