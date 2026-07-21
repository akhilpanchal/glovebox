# Glovebox

A private, family car-tracking web app for one shared car (a 2019 Honda Clarity
PHEV). One place for everything about the car: fuel + charging logs, maintenance
history, insurance, and vehicle details.

Runs behind Cloudflare Access at `algorythm.dev/glovebox` — invite-only, no public
sign-up.

## Features

- **Fuel & Charging** — log gas fill-ups and EV charging sessions from one tab
  (Gas/Charge segmented control). Because the Clarity is a plug-in hybrid, the
  efficiency card shows **real gas MPG** (electric miles excluded), **% electric**,
  and **mi/kWh**. Edit/delete any entry.
- **Maintenance** — structured service history (date, odometer, shop, cost,
  categories, itemized line items, document links). Entries can be generated from a
  photo of a service statement via a Claude skill (`skills/maintenance-extract/`) and
  pasted in.
- **Insurance** — current policy: insurer, policy #, expiry, PDF link, and
  tap-to-call emergency numbers.
- **Vehicle** — read-only vehicle details.
- mi·gal ⇄ km·L units toggle, light/dark theme.

## Stack

- Single **Cloudflare Worker** (`src/index.js`) serving both the JSON API and the
  static frontend (Workers Static Assets, `public/glovebox/`).
- **Cloudflare D1** (SQLite), binding `DB`.
- Frontend is **vanilla HTML/CSS/JS, no framework, no build step**
  (native ES modules in `public/glovebox/js/`).
- Identity comes only from the `Cf-Access-Authenticated-User-Email` header set by
  Cloudflare Access — there is no user-entered name/email anywhere.

## Local development

```sh
npm install
# one-time: create .dev.vars with LOCAL_DEV_EMAIL="you@example.com" (see .dev.vars.example)
wrangler d1 migrations apply glovebox-db --local   # after any schema change
wrangler dev                                        # http://localhost:8787/glovebox/
```

## Deployment

Push to `main` → **Cloudflare Workers Builds** auto-builds and deploys to production;
feature branches get a non-production preview build. D1 migrations are **not**
automatic — run `wrangler d1 migrations apply glovebox-db --remote` before merging a
schema change to `main`.

## More

- `CLAUDE.md` — conventions and guardrails (identity model, units, routing, schema).
- `docs/` — implementation plans (`v2-plan.md`, `v2.1-charging-plan.md`).
