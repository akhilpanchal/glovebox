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

## To Do

_(nothing scheduled yet)_

## In Progress

_(nothing in flight)_

## Done

_(nothing yet)_
