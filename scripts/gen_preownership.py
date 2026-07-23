#!/usr/bin/env python3
"""Single source of truth for the pre-ownership service records.
Generates, from the same list:
  1. migrations/0005_preownership.sql   (the DB seed)
  2. preownership-services.md           (human-readable)
  3. preownership-services.html         (standalone, styled)
so the database rows and the documents can never drift apart."""

import json, html, pathlib

ADDED_BY = "carfax-import"  # provenance sentinel (not a real email)

# Each dict = one maintenance_entries row.
# odo_approx=True means the odometer wasn't on the Carfax and is carried
# forward from the nearest earlier reading (noted for the reader).
ENTRIES = [
    dict(date="2019-10-01", odo=3, approx=False,
         shop="Ocean Honda of Ventura",
         cats=["Inspection"],
         tasks=["Pre-delivery inspection completed",
                "Vehicle washed and detailed",
                "Accessories installed"],
         note="New-vehicle delivery / PDI"),
    dict(date="2020-05-21", odo=4558, approx=False,
         shop="Ocean Honda of Ventura",
         cats=["Oil", "Inspection"],
         tasks=["Maintenance inspection completed",
                "Tire condition and pressure checked",
                "Engine oil and filter changed",
                "Emission system checked"],
         note="First scheduled service"),
    dict(date="2020-10-20", odo=9270, approx=False,
         shop="Ocean Honda of Ventura",
         cats=["Oil", "Tires", "Fluids", "Inspection"],
         tasks=["Maintenance inspection completed",
                "Tires rotated",
                "Tire condition and pressure checked",
                "Engine oil and filter changed",
                "Fluids checked",
                "Emission system checked"],
         note=None),
    dict(date="2021-04-23", odo=15050, approx=False,
         shop="Ocean Honda of Ventura",
         cats=["Oil", "Fluids", "Inspection"],
         tasks=["Maintenance inspection completed",
                "Engine oil and filter changed",
                "Fluids checked"],
         note=None),
    dict(date="2021-05-14", odo=15755, approx=False,
         shop="Ocean Honda of Ventura",
         cats=["Inspection"],
         tasks=["Body electrical system checked"],
         note=None),
    dict(date="2021-10-14", odo=19622, approx=False,
         shop="Ocean Honda of Ventura",
         cats=["Oil", "Tires", "Filters", "Fluids", "Brakes", "Inspection", "Scheduled service"],
         tasks=["Maintenance inspection completed",
                "Recommended maintenance performed",
                "Tire condition and pressure checked",
                "Engine oil and filter changed",
                "Tires rotated",
                "Fluids checked",
                "Cabin air filter replaced/cleaned",
                "Engine air filter replaced",
                "Emission system checked",
                "Wipers replaced",
                "Electrical system checked",
                "Trim checked",
                "Brakes checked"],
         note="Major service"),
    dict(date="2022-11-08", odo=27215, approx=False,
         shop="West Coast Toyota of Long Beach",
         cats=["Oil", "Filters", "Fluids", "Inspection"],
         tasks=["Pre-delivery / reconditioning inspection completed",
                "Maintenance inspection completed",
                "Fluids checked",
                "Engine oil and filter changed",
                "Tire condition and pressure checked",
                "Interior cleaned",
                "Wipers and washers checked",
                "Engine air filter replaced",
                "Cabin air filter replaced/cleaned"],
         note="Resale reconditioning; last oil change before purchase"),
    dict(date="2023-01-05", odo=27359, approx=False,
         shop="California Inspection Station",
         cats=["Inspection"],
         tasks=["Passed California emissions (smog) inspection"],
         note="Smog check (also reported by West Coast Toyota on 2023-01-10 — same test)"),
    dict(date="2023-02-03", odo=27359, approx=True,
         shop="West Coast Toyota of Long Beach",
         cats=["Battery", "Diagnostic"],
         tasks=["Battery / charging system checked"],
         note="Odometer not reported on Carfax; carried forward from 2023-01-05"),
    dict(date="2023-02-27", odo=27380, approx=False,
         shop="Lexus of Oxnard",
         cats=["Inspection"],
         tasks=["Vehicle serviced (specific work not detailed on Carfax)"],
         note="Pre-sale service"),
]

PROV = "Previous owner, from Carfax"


def full_note(e):
    base = PROV
    if e["note"]:
        base += " — " + e["note"]
    return base


def sql_str(s):
    if s is None:
        return "NULL"
    return "'" + s.replace("'", "''") + "'"


# ---------- 1. SQL migration ----------
def gen_sql():
    lines = []
    lines.append("-- Pre-ownership service history for the 2019 Clarity (VIN ...005237),")
    lines.append("-- transcribed from the Carfax report in the April 2023 purchase packet")
    lines.append("-- (Honda Clarity Purchase Docs.pdf, pages 31-39). These are the previous")
    lines.append("-- owner's dealer services from 3 to 27,380 miles.")
    lines.append("--")
    lines.append("-- Cost is unknown (Carfax never lists price) -> total_cost NULL.")
    lines.append("-- added_by = 'carfax-import' is a provenance sentinel, not a real user:")
    lines.append("-- these rows were authored here and seeded by migration, never posted")
    lines.append("-- through the API, so the 'identity comes only from Cf-Access' rule is")
    lines.append("-- intact. Rows remain fully editable/deletable in the app afterwards.")
    lines.append("--")
    lines.append("-- Human-readable mirror: Purchase Documents/preownership-services.md / .html")
    lines.append("-- Generated from gen_preownership.py -- edit there and regenerate, not by hand.")
    lines.append("")
    lines.append("INSERT INTO maintenance_entries")
    lines.append("  (date, odometer, shop_name, total_cost, categories, line_items,")
    lines.append("   invoice_number, document_urls, notes, added_by)")
    lines.append("VALUES")
    rows = []
    for e in ENTRIES:
        cats = json.dumps(e["cats"], separators=(",", ":"))
        items = json.dumps([{"description": t, "cost": None} for t in e["tasks"]],
                            separators=(",", ":"))
        row = (f"  ({sql_str(e['date'])}, {e['odo']}, {sql_str(e['shop'])}, NULL, "
               f"{sql_str(cats)}, {sql_str(items)}, NULL, '[]', "
               f"{sql_str(full_note(e))}, {sql_str(ADDED_BY)})")
        rows.append(row)
    lines.append(",\n".join(rows) + ";")
    lines.append("")
    return "\n".join(lines)


# ---------- 2. Markdown ----------
def gen_md():
    o = []
    o.append("# Pre-ownership service records — 2019 Honda Clarity PHEV")
    o.append("")
    o.append("The previous owner's dealer service history, transcribed from the Carfax report "
             "in the April 2023 purchase packet (`Honda Clarity Purchase Docs.pdf`, pages 31-39). "
             "These **10 service events**, from 3 to 27,380 miles, are the exact rows seeded into "
             "the Glovebox maintenance history by `migrations/0005_preownership.sql` — this file "
             "and that migration are generated from one source, so they match row-for-row.")
    o.append("")
    o.append("- **Cost:** not available. Carfax lists what was done, never what was paid, so every "
             "entry has no cost.")
    o.append("- **Provenance:** each row is tagged `added_by = carfax-import` and its note begins "
             f"\"{PROV}\", so pre-ownership records stay distinguishable from services you log yourself.")
    o.append("- **Not services (excluded):** DMV title/registration events, odometer-only reports, "
             "and the \"offered for sale\" listing are in the full Carfax extract "
             "(`carfax-history-2023-04-07.md`) but are not maintenance and are not seeded here.")
    o.append("")
    o.append("---")
    o.append("")
    for i, e in enumerate(ENTRIES, 1):
        odo = f"{e['odo']:,} mi" + (" (approx.)" if e["approx"] else "")
        o.append(f"## {i}. {e['date']} — {odo} — {e['shop']}")
        o.append("")
        o.append(f"**Categories:** {', '.join(e['cats'])}  ")
        o.append(f"**Note:** {full_note(e)}")
        o.append("")
        for t in e["tasks"]:
            o.append(f"- {t}")
        o.append("")
    o.append("---")
    o.append("")
    o.append("*Generated from `gen_preownership.py`. To change these records, edit that "
             "generator and regenerate all three artifacts (SQL + MD + HTML) together.*")
    o.append("")
    return "\n".join(o)


# ---------- 3. HTML ----------
CSS = """
:root{--bg:#fff;--surface:#f7f7f5;--surface-2:#efeeea;--text:#1c1c1a;--muted:#6b6b66;--rule:#e0dfda;--accent:#b8493a;--free:#2f7d4f;--free-bg:#eaf5ee;--mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace}
@media (prefers-color-scheme:dark){:root{--bg:#16161a;--surface:#1e1e23;--surface-2:#26262c;--text:#eceae5;--muted:#9b9a94;--rule:#33333a;--accent:#e8877a;--free:#6fc493;--free-bg:#1a2c22}}
*{box-sizing:border-box}
body{margin:0;padding:2.5rem 1.25rem 5rem;background:var(--bg);color:var(--text);font:16px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
main{max-width:820px;margin:0 auto}
header.doc{border-bottom:3px solid var(--text);padding-bottom:1.25rem;margin-bottom:2rem}
.eyebrow{font-size:.75rem;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);font-weight:600;margin:0 0 .5rem}
h1{font-size:2rem;line-height:1.2;margin:0 0 .35rem;letter-spacing:-.02em}
.subtitle{color:var(--muted);margin:0;font-size:1.05rem}
.meta{background:var(--surface);border-left:4px solid var(--accent);padding:1rem 1.25rem;margin:1.75rem 0 0;border-radius:0 6px 6px 0;font-size:.92rem}
.meta code{font-family:var(--mono);font-size:.88em;background:var(--surface-2);padding:.05rem .3rem;border-radius:3px}
.job{background:var(--surface);border:1px solid var(--rule);border-radius:8px;padding:1.1rem 1.25rem;margin-bottom:1rem}
.job-head{display:flex;flex-wrap:wrap;align-items:baseline;gap:.6rem;margin-bottom:.2rem}
.job-num{font-family:var(--mono);font-size:.72rem;font-weight:700;background:var(--surface-2);color:var(--muted);padding:.18rem .5rem;border-radius:4px;white-space:nowrap}
.job-title{font-weight:650;font-size:1.05rem;flex:1;min-width:12rem}
.job-odo{font-family:var(--mono);font-weight:700;white-space:nowrap;color:var(--accent)}
.cats{margin:.5rem 0 .1rem}
.tag{display:inline-block;font-size:.68rem;font-weight:700;letter-spacing:.05em;padding:.15rem .5rem;border-radius:100px;background:var(--free-bg);color:var(--free);margin:0 .25rem .25rem 0}
.job-note{color:var(--muted);font-size:.9rem;margin:.5rem 0 .1rem}
ul.tasks{margin:.6rem 0 0;padding-left:1.15rem;font-size:.93rem}
ul.tasks li{margin-bottom:.2rem}
footer{margin-top:3rem;padding-top:1.25rem;border-top:1px solid var(--rule);color:var(--muted);font-size:.82rem}
@media (max-width:560px){h1{font-size:1.6rem}}
@media print{body{padding:0;font-size:11pt}.job{break-inside:avoid}}
"""

def gen_html():
    esc = html.escape
    o = []
    o.append("<!doctype html>")
    o.append('<html lang="en">')
    o.append("<head>")
    o.append('<meta charset="utf-8">')
    o.append('<meta name="viewport" content="width=device-width, initial-scale=1">')
    o.append("<title>Pre-ownership service records — 2019 Honda Clarity PHEV</title>")
    o.append("<style>" + CSS + "</style>")
    o.append("</head>")
    o.append("<body>")
    o.append("<main>")
    o.append('<header class="doc">')
    o.append('<p class="eyebrow">Glovebox · Pre-ownership service history</p>')
    o.append("<h1>2019 Honda Clarity PHEV — previous owner's services</h1>")
    o.append('<p class="subtitle">10 dealer services, 3 → 27,380 mi · transcribed from the Carfax report</p>')
    o.append('<div class="meta">These are the exact rows seeded into the Glovebox maintenance history by '
             '<code>migrations/0005_preownership.sql</code> — this page and that migration are generated '
             'from one source, so they match row-for-row. <strong>Cost is not available</strong> (Carfax never '
             'lists price). Each row is tagged <code>added_by = carfax-import</code> and noted '
             f'&ldquo;{esc(PROV)}&rdquo; so it stays distinguishable from services you log yourself.</div>')
    o.append("</header>")
    for i, e in enumerate(ENTRIES, 1):
        odo = f"{e['odo']:,} mi" + (" (approx.)" if e["approx"] else "")
        o.append('<div class="job">')
        o.append('<div class="job-head">')
        o.append(f'<span class="job-num">{i:02d}</span>')
        o.append(f'<span class="job-title">{esc(e["date"])} · {esc(e["shop"])}</span>')
        o.append(f'<span class="job-odo">{esc(odo)}</span>')
        o.append("</div>")
        o.append('<div class="cats">' + "".join(
            f'<span class="tag">{esc(c)}</span>' for c in e["cats"]) + "</div>")
        o.append(f'<p class="job-note">{esc(full_note(e))}</p>')
        o.append('<ul class="tasks">' + "".join(
            f"<li>{esc(t)}</li>" for t in e["tasks"]) + "</ul>")
        o.append("</div>")
    o.append("<footer>Generated from gen_preownership.py alongside "
             "migrations/0005_preownership.sql and preownership-services.md — one source, three artifacts. "
             "Source: Honda Clarity Purchase Docs.pdf pages 31-39 (Carfax report).</footer>")
    o.append("</main>")
    o.append("</body></html>")
    return "\n".join(o)


REPO = pathlib.Path("/Users/akhilpanchal/DeepWork/GitHub/glovebox")
DOCS = pathlib.Path("/Users/akhilpanchal/Documents/Honda Clarity/Purchase Documents")

(REPO / "migrations" / "0005_preownership.sql").write_text(gen_sql())
(DOCS / "preownership-services.md").write_text(gen_md())
(DOCS / "preownership-services.html").write_text(gen_html())
print("wrote:")
print(" ", REPO / "migrations" / "0005_preownership.sql")
print(" ", DOCS / "preownership-services.md")
print(" ", DOCS / "preownership-services.html")
print(f"entries: {len(ENTRIES)}")
