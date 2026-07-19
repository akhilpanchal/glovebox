# Glovebox v2 — Detailed Plan

**Branch:** `dev/v2-features`
**Status:** Draft for review
**Last updated:** 2026-07-18

v2 turns Glovebox from a single-page fuel logger into a tabbed "one-stop shop" for
the car: **Fuel Log** (existing), **Maintenance**, and **Insurance**, plus a
**Vehicle** detail view — all behind the existing Cloudflare Access gate. The
long-term AI/chatbot vision is explicitly **deferred to v3**.

---

## 1. Scope

### In v2
1. **Navigation shell** — left nav on desktop, hamburger on mobile (primary device).
   Tabs: **Fuel Log (default)** · Maintenance · Insurance. Vehicle name in the header.
2. **Maintenance tab** — structured service history with itemized line items and
   links to service-document photos. Entries are created via a **Claude skill**
   that extracts structured data from a statement photo (see §7).
3. **Insurance tab** — a single current-policy record (in-app editable) with the
   policy PDF link and emergency phone number(s).
4. **Vehicle detail view** — read-only vehicle info, reached from the header name.

### Deferred to v3 (not built now)
- AI chatbot / natural-language search over the car's data **+ internet lookups**.
- Native file uploads (Cloudflare **R2**) — v2 stores pasted URLs only.
- Maintenance **reminders / notifications** — v3.
- Multi-vehicle support (staying single-car).
- Maintenance spend analytics / dashboards.

### Explicitly considered and rejected for v2
- **React / Vite / TypeScript rewrite** — premature for a 3-tab family tool, adds a
  build step + dependency upkeep, and reverses CLAUDE.md's no-framework principle.
- **Alpine.js** — a reactivity layer, not a component library; the Claude-assisted
  input (§7) removes the main dynamic-form need, and a half-vanilla/half-Alpine
  codebase is worse than either alone. Pre-approved as an incremental upgrade later
  if wiring becomes painful.
- **Nicer UI controls / date picker (e.g. flatpickr)** — a "looks" concern,
  deferred; not needed to ship v2.

---

## 2. Architecture decisions

| Decision | Choice | Rationale |
|---|---|---|
| Frontend framework | **None** — vanilla, no build step | Honors CLAUDE.md; best longevity for a one-maintainer tool |
| Code organization | **ES modules** (frontend) + **handler modules** (backend), split by feature | Fixes the "one big file" problem on both tiers without a bundler |
| Backend / UI separation | **Strict** — Worker owns the API; frontend is a pure API client | The JSON API is the only interface; no server-rendered HTML, no client-side DB access |
| File/photo storage | **Pasted external URLs** (Drive/iCloud/etc.) | No R2 infra in v2; simplest |
| Maintenance data entry | **Claude skill → paste → review → save** | Keeps all LLM work outside the Worker; shrinks the form |
| Vehicle data | **Config-seeded, read-only** (`src/config/vehicle.js`) | Rarely changes; no table/edit UI needed |
| Insurance data | **Single row, in-app editable** (D1 + `PUT`) | Renews yearly; family-friendly, no code deploy to update |
| Routing | **Client-side hash router** (`#/fuel`, …) | No framework; back-button + deep links work |
| Identity | **Unchanged** — `Cf-Access-Authenticated-User-Email` | Same header → `LOCAL_DEV_EMAIL` → 401 pattern as v1 |
| Access scope | **Unchanged** — still `/glovebox*` on both hosts | No `wrangler.toml` route or Access changes needed |

---

## 3. Data model

Canonical units stay **miles / gallons / USD** in the DB and API (per the v1
convention). The mi·gal ⇄ km·L toggle continues to convert at the UI edge only, and
now also applies to the maintenance odometer. Costs are currency, never
unit-converted.

**Dates are `TEXT`** (`YYYY-MM-DD`): SQLite has no native date type; ISO-8601 strings
are the standard choice, sort lexicographically, and match the v1 `fuel_entries`
convention.

JSON-typed columns (`categories`, `line_items`, `document_urls`, `emergency_phones`)
are stored as TEXT holding JSON. **The Worker parses them on read and stringifies on
write**, so the frontend always sees real arrays/objects.

### 3.1 `migrations/0002_maintenance.sql`

```sql
CREATE TABLE maintenance_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,                        -- YYYY-MM-DD, service date
  odometer INTEGER NOT NULL,                 -- MILES (canonical), like fuel_entries
  shop_name TEXT,                            -- where serviced
  total_cost REAL,                           -- grand total on the statement (nullable)
  categories TEXT NOT NULL DEFAULT '[]',     -- JSON array of tag strings
  line_items TEXT NOT NULL DEFAULT '[]',     -- JSON array of {description, cost}
  invoice_number TEXT,                       -- RO / invoice number, nullable
  document_urls TEXT NOT NULL DEFAULT '[]',  -- JSON array of {url, label}
  notes TEXT,
  added_by TEXT NOT NULL,                    -- from Cf-Access-Authenticated-User-Email
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT                            -- set on edit
);

CREATE INDEX idx_maintenance_date ON maintenance_entries (date DESC, id DESC);
```

**Category vocabulary** (chosen from a fixed list; no car knowledge required):
`Oil` · `Tires` · `Brakes` · `Battery` · `Fluids` · `Filters` · `Scheduled service`
· `Inspection` · `Repair` · `Diagnostic` · `Other`.

### 3.2 `migrations/0003_insurance.sql`

Singleton table — the `CHECK (id = 1)` enforces a single current-policy row.

```sql
CREATE TABLE insurance (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  insurer_name TEXT,
  policy_number TEXT,
  expiry_date TEXT,                           -- YYYY-MM-DD
  policy_pdf_url TEXT,
  emergency_phones TEXT NOT NULL DEFAULT '[]',-- JSON array of {label, number}
  updated_by TEXT,                            -- from Cf-Access-Authenticated-User-Email
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

Upsert on save:

```sql
INSERT INTO insurance (id, insurer_name, policy_number, expiry_date,
                       policy_pdf_url, emergency_phones, updated_by, updated_at)
VALUES (1, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
ON CONFLICT(id) DO UPDATE SET
  insurer_name = excluded.insurer_name,
  policy_number = excluded.policy_number,
  expiry_date = excluded.expiry_date,
  policy_pdf_url = excluded.policy_pdf_url,
  emergency_phones = excluded.emergency_phones,
  updated_by = excluded.updated_by,
  updated_at = CURRENT_TIMESTAMP;
```

### 3.3 Vehicle config — `src/config/vehicle.js`

No table. A version-controlled constant imported by the Worker and served read-only.
To change it: edit the file and deploy.

```js
export const VEHICLE = {
  nickname: "",            // optional; header falls back to `${year} ${make} ${model}`
  year: 2019,
  make: "Honda",
  model: "Clarity",
  trim: "PHEV Touring",
  color: "Gray",
  vin: "",
  license_plate: "8NNK865",
  purchase_date: "",       // YYYY-MM-DD
};
```

---

## 4. API

All under `/glovebox/api`. Write endpoints derive identity from
`Cf-Access-Authenticated-User-Email` → `LOCAL_DEV_EMAIL` → `401` (same helper as v1);
identity is **never** read from the request body. GETs stay open (already gated by
Access at the edge), matching the existing `GET /entries` behavior.

| Method | Path | Purpose |
|---|---|---|
| GET | `/entries` | Fuel entries (existing) |
| POST | `/entries` | Add fuel entry (existing) |
| GET | `/me` | Current user email (existing) |
| GET | `/maintenance` | List maintenance, `ORDER BY date DESC, id DESC` |
| POST | `/maintenance` | Create maintenance entry (`added_by` server-derived) |
| PUT | `/maintenance/:id` | Edit an entry (sets `updated_at`) |
| DELETE | `/maintenance/:id` | Delete an entry |
| GET | `/insurance` | Current policy (or empty defaults if unset) |
| PUT | `/insurance` | Upsert the singleton (`updated_by` server-derived) |
| GET | `/vehicle` | Vehicle config object |

**POST/PUT `/maintenance` body** (JSON fields returned as real arrays/objects):

```json
{
  "date": "2026-06-14",
  "odometer": 41250,
  "shop_name": "Honda of Fremont",
  "total_cost": 189.42,
  "categories": ["Oil", "Filters", "Inspection"],
  "line_items": [
    { "description": "Full synthetic oil & filter change", "cost": 89.99 },
    { "description": "Cabin air filter replacement", "cost": 38.00 },
    { "description": "Multi-point inspection", "cost": 0 }
  ],
  "invoice_number": "RO-88231",
  "document_urls": [
    { "url": "https://photos.example/abc", "label": "Invoice" }
  ],
  "notes": ""
}
```

**Validation (server):** `date` + `odometer` required and well-formed; `odometer`,
`total_cost`, and each `line_items[].cost` numeric; `categories` limited to the fixed
vocabulary; malformed JSON → `400`. `src/index.js` gains a small path parser to match
`/maintenance/:id`.

---

## 5. Code structure

Strict backend/UI separation: the Worker (`src/`) owns data + the API; the frontend
(`public/glovebox/`) is a pure API client. The JSON API is the **single contract**
between them — no server-rendered HTML, no DB access from the client, no business
logic duplicated across the two.

### 5.1 Backend (`src/`)

`index.js` shrinks to routing that dispatches to `handlers/`; shared concerns (auth,
JSON helpers, column (de)serialization) live in `lib/`.

```
src/
  index.js              # Worker entry — request routing + dispatch only
  config/
    vehicle.js          # VEHICLE constant (read-only vehicle info)
  lib/
    responses.js        # json(data, status) helper
    auth.js             # authedEmail(request, env) → email | null (Access header → LOCAL_DEV_EMAIL)
    columns.js          # parse/stringify the JSON-text columns
  handlers/
    entries.js          # fuel: GET / POST
    me.js               # GET
    maintenance.js      # GET / POST / PUT / DELETE
    insurance.js        # GET / PUT (upsert)
    vehicle.js          # GET → serves config/vehicle.js
```

### 5.2 Frontend (`public/glovebox/`)

Switch the shell to ES modules (`<script type="module" src="app.js">`).

```
public/glovebox/
  index.html          # app shell: header + nav + <main> with a <section> per route
  style.css           # + nav/hamburger, maintenance/insurance/vehicle styles
  app.js              # boot: mount router, wire shared header (theme/units/account/vehicle name)
  js/
    router.js         # hash router: #/fuel (default) #/maintenance #/insurance #/vehicle
    api.js            # fetch helpers for every endpoint
    format.js         # date formatter, number/odometer formatting, escapeHtml
    units.js          # mi/gal <-> km/L conversion + toggle (extracted from app.js)
    theme.js          # theme toggle (extracted)
    account.js        # account chip / popover (extracted)
    fuel.js           # Fuel tab: efficiency dash + form + history (moved from app.js)
    maintenance.js    # Maintenance tab: list + Import-from-Claude + review form + edit/delete
    insurance.js      # Insurance tab: display + edit form
    vehicle.js        # Vehicle view + header name rendering
```

- **Shell / header:** wordmark · vehicle name (→ `#/vehicle`) · theme chip · units
  chip · account chip. On mobile the tab list collapses to a hamburger; the chips
  stay in the top bar.
- **Nav:** left column on desktop (`min-width` breakpoint), off-canvas hamburger
  panel on mobile. Active route highlighted. Vehicle name lives in the nav header on
  mobile too if header space is tight.
- **Routing:** `router.js` listens to `hashchange`, shows the matching `<section>`,
  hides the rest, and calls that module's `load()` on first activation (lazy fetch).
  Default route `#/fuel`.
- **Fuel tab:** the current dashboard + form + history markup, moved verbatim into
  the fuel section; behavior extracted into `fuel.js`. No functional change.
- **Units toggle:** now also drives the maintenance odometer display and the
  maintenance form's odometer input (converted back to miles before POST). Costs are
  never converted.
- **Dates:** all date inputs keep the native `type="date"` + formatted-overlay
  pattern and the `12 July, 2026` custom formatter.
- **Rendering safety:** continue escaping user/text content (`escapeHtml`) in any
  `innerHTML` templating.

### Maintenance tab UX
- **History list:** card rows — service date · odometer · shop · total cost ·
  category tags · document links; expandable to show line items + notes. Edit and
  delete actions per row.
- **Add entry — primary path:** an **"Import from Claude"** panel with a textarea.
  Paste the JSON from the Claude skill (§7) → parse + validate → populate an
  **editable review form** (all fields, line-item rows, category chips, doc-link
  rows) → Save (`POST`). Parse/validation errors shown inline.
- **Add entry — fallback:** the same review form, blank, for manual entry.
- **Edit:** opens the same form pre-filled (`PUT`). **Delete:** confirm → `DELETE`.

### Insurance tab UX
- Read view: insurer, policy #, expiry, a prominent **"Open policy PDF"** link, and
  emergency phone number(s) as tap-to-call `tel:` links.
- **Edit** button → form → `PUT` (upsert). Empty state prompts to add details.

### Vehicle view (`#/vehicle`)
- Read-only detail: nickname/name heading, then year/make/model/trim, color, VIN,
  license plate, purchase date. "Edit" intentionally absent (config-seeded).

---

## 6. Styling

Extend the existing token system (no new framework). Reuse `.chip`, `.card`,
`.history-item` patterns. New pieces: nav/hamburger, category tag chips, line-item
rows, tel-link buttons, the vehicle detail grid. Both light and dark themes must
stay AA-legible, and the hamburger/nav must be usable one-handed on mobile.

---

## 7. Claude maintenance-extractor skill

A version-controlled Claude skill the user installs into their own Claude
(`~/.claude/skills/`). Given a **photo/scan of a service statement**, it outputs
**only** the JSON object matching §4 — ready to paste into the app's Import panel.

**Location in repo:** `skills/maintenance-extract/SKILL.md`

**Extraction rules the skill enforces:**
- Dates → `YYYY-MM-DD`.
- `odometer` → integer **miles** (convert if the statement is in km).
- Costs → plain numbers, no currency symbols; `total_cost` = the statement grand
  total; each itemized line → a `line_items[]` entry.
- `categories` → only values from the fixed vocabulary (§3.1).
- `invoice_number` → filled only if present, else omitted/null.
- `document_urls` → left empty (the user pastes the photo links in the app).
- Output **only** the JSON (no prose), so it pastes cleanly.

The app's Import panel re-validates and normalizes everything; the review step is the
human check against extraction errors.

---

## 8. Build phasing

Each phase is independently testable and deployable.

- **Phase A — Shell + module split + Fuel tab.** Introduce the frontend ES-module
  structure (router, nav/hamburger) **and** the backend handler-module split; move
  the existing fuel UI + fuel/me handlers into place. *Refactor only, no schema
  change — lowest risk, ships first.*
  - *Done when:* all three nav items render, `#/fuel` is default, fuel logging works
    exactly as before, hamburger works on mobile, theme/units/account unchanged.
- **Phase B — Vehicle.** Add `src/config/vehicle.js` + `GET /api/vehicle`; header name
  + `#/vehicle` view.
  - *Done when:* header shows the name, tapping routes to the detail view with all
    fields.
- **Phase C — Maintenance.** Migration `0002`; maintenance API (GET/POST/PUT/DELETE);
  the maintenance tab (list + Import-from-Claude + review form + edit/delete); the
  Claude skill.
  - *Done when:* paste-from-Claude creates a reviewed entry; manual add works;
    edit/delete work; units toggle applies to odometer; docs links open.
- **Phase D — Insurance.** Migration `0003`; insurance API (GET/PUT); the insurance
  tab (read + edit).
  - *Done when:* editing persists across reload; PDF link opens; emergency numbers
    are tap-to-call.

---

## 9. Deployment & migrations

Per CLAUDE.md — migrations are **not** auto-applied:

1. For each new migration (`0002`, `0003`): `wrangler d1 migrations apply glovebox-db --local`, then test.
2. `wrangler dev` and verify locally at `http://localhost:8787/glovebox/` before pushing.
3. Before merging to `main`: `wrangler d1 migrations apply glovebox-db --remote`.
4. Push to `main` → Workers Builds auto-builds and deploys. Feature-branch pushes get
   a non-production preview build.
- **No `wrangler.toml` route changes** and **no Access scope changes** — v2 stays
  entirely within `/glovebox*`.

---

## 10. Verification checklist

- Migrations apply cleanly `--local`; `PRAGMA table_info` shows the expected columns.
- `wrangler dev`: exercise each endpoint with `curl` (maintenance CRUD, insurance
  upsert, vehicle GET) — correct status codes, `added_by`/`updated_by` server-derived,
  `401` when neither the Access header nor `LOCAL_DEV_EMAIL` is present.
- Browser: default `#/fuel`; nav + hamburger; fuel unchanged; maintenance
  paste→review→save + edit + delete; insurance edit persists; vehicle view; units +
  theme toggles across all tabs; dates render `12 July, 2026`; both themes AA-legible.
- Re-run the v1 fuel + `/api/me` smoke tests to confirm no regression.

---

## 11. Open questions / future

- Whether to later make **vehicle** in-app editable (parity with insurance).
- Whether maintenance needs a **spend summary** (deferred; not requested).
- v3: AI chatbot/search, R2 uploads, service reminders.
```
