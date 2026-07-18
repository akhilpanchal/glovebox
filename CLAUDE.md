# Glovebox

Family car-tracking app for one shared car. v1 is a fuel logger. Long-term vision
(not yet built): maintenance history, service expenditures, receipts/paperwork.
Don't build toward that vision speculatively — add tables/features only when
actually requested.

## Stack

- Single Cloudflare Worker (`src/index.js`) serving both the API and static
  frontend (Workers Static Assets, `public/glovebox/` → `[assets]` binding).
- Cloudflare D1 (SQLite), binding `DB`, database `glovebox-db`.
- No frontend framework, no build step. Vanilla HTML/CSS/JS in
  `public/glovebox/`. Keep it that way unless a real need for a framework
  shows up (this is a small family tool, not a product).
- Fonts: Inter (UI text) + JetBrains Mono (numeric fields/values), loaded via
  Google Fonts `<link>` in `index.html`.

## Deployment

- Repo is connected to Cloudflare via **Workers Builds** (git integration):
  every push to `main` auto-builds and deploys to production. Feature
  branches get a non-production preview build.
- D1 migrations are **not** applied automatically — run them yourself:
  `wrangler d1 migrations apply glovebox-db --local` (dev) and
  `--remote` (before pushing a schema change to `main`).
- Never push to `main` without testing locally first (`wrangler dev`).

## Routing & Access

- App is mounted at `/glovebox*` on **both** `algorythm.dev` and
  `www.algorythm.dev` (two separate route entries in `wrangler.toml` — both
  required, don't remove either).
- The rest of `algorythm.dev` is a public personal site on GitHub Pages,
  unrelated to this Worker. Never widen Access scope beyond `/glovebox*`.
- Cloudflare Access (Zero Trust) gates `/glovebox*` on both hostnames.
  Identity provider is **One-Time PIN only** (no Google/OAuth) — family
  members authenticate via emailed PIN, no Cloudflare account needed.

## Identity model — read before touching auth or the entries API

There is **no user-entered name/email field anywhere, ever.** Every request
reaching the Worker in production carries `Cf-Access-Authenticated-User-Email`
(set by Cloudflare Access at the edge). Server-side code reads this header
and uses it directly — never accept an identity field from the request body.

Local dev doesn't have Access, so the header is absent. Fallback pattern
(used in both `handlePostEntry` and `handleGetMe` in `src/index.js`):

```js
const email =
  request.headers.get("Cf-Access-Authenticated-User-Email") ||
  (env.LOCAL_DEV_EMAIL ? env.LOCAL_DEV_EMAIL : null);
if (!email) return json({ error: "Unauthorized" }, 401);
```

`LOCAL_DEV_EMAIL` comes from `.dev.vars` (gitignored, see
`.dev.vars.example`). If neither the header nor the env var is present,
**fail with 401** — never silently default to a hardcoded email. This same
code path runs in production; silently defaulting would mask a
misconfigured Access application.

## Schema

`fuel_entries` (`migrations/0001_init.sql`) — the entire v1 schema:

```sql
id INTEGER PRIMARY KEY AUTOINCREMENT
date TEXT NOT NULL          -- YYYY-MM-DD
odometer INTEGER NOT NULL   -- always stored in MILES, regardless of display unit
volume REAL NOT NULL        -- always stored in GALLONS, regardless of display unit
added_by TEXT NOT NULL      -- from Cf-Access-Authenticated-User-Email, never client-supplied
notes TEXT
created_at TEXT DEFAULT CURRENT_TIMESTAMP
```

No `cost` column (removed — not needed for v1). No `vehicles`,
`maintenance_events`, or `documents` tables — deliberately deferred.
Add new tables/columns as simple migrations when a feature actually needs
them, not before. Since nothing was in production pre-launch, early
migrations were edited in place rather than layered with `ALTER TABLE`;
**post-launch, always add a new migration file instead of editing
`0001_init.sql`.**

## Units convention

Miles/gallons are canonical in the DB and the API. The frontend has a
mi·gal ⇄ km·L toggle (`localStorage: glovebox-units`) that converts for
**both** the history display and the "Log a Fill-up" form inputs — but
whatever unit the user typed in, `app.js` converts back to miles/gallons
before POSTing. If you add new numeric fields tied to distance or volume,
follow this same pattern: canonical storage in imperial, convert at the
UI edges only.

## Frontend conventions

- Theme: `prefers-color-scheme` sets the default; an explicit toggle
  (sun/moon icon button, `localStorage: glovebox-theme`) overrides it via
  `[data-theme="light"|"dark"]` attribute selectors, which take precedence
  over the media query by specificity. Icons show the **destination** mode
  (moon while in light mode = tap to go dark), not the current one.
- All circular header buttons (theme toggle, units toggle, avatar chip)
  share the `.chip` class — same size/shape/font. Keep new header controls
  consistent with this.
- Dates always render as `12 July, 2026` (custom formatter in `app.js`,
  not `toLocaleDateString`, to avoid locale drift). The date `<input>`
  itself stays native (`type="date"`) for picker functionality, with a
  formatted-text overlay on top (see `.date-field-wrap` in `style.css`).
- Date field defaults to today and is never a required/blocking field.
- The account chip shows the first letter of the logged-in email;
  tapping reveals the full email in a popover. Fails silently (hides
  itself) if `/api/me` 401s — this is a non-critical enhancement, never
  block the core fuel-logging flow on it.

## API

- `GET /glovebox/api/entries` — all rows, `ORDER BY date DESC, id DESC`.
- `POST /glovebox/api/entries` — body: `{ date, odometer, volume, notes }`.
  `added_by` is server-derived, never from the body.
- `GET /glovebox/api/me` — `{ email }` of the current authenticated user,
  same header/fallback/401 logic as above. Used only for the avatar chip.

## Local development

1. `npm install`
2. `wrangler dev` — Miniflare-backed local server at `localhost:8787`,
   uses local D1 by default (not `--remote`).
3. `wrangler d1 migrations apply glovebox-db --local` after any schema change.
4. Create `.dev.vars` (gitignored) with `LOCAL_DEV_EMAIL="you@example.com"`.
5. Test in browser at `http://localhost:8787/glovebox/` before pushing.
