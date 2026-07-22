---
name: maintenance-extract
description: Extract a Glovebox maintenance entry from a photo or scan of a car service statement/invoice — writes a human-readable Markdown summary and a standalone HTML summary, then outputs structured JSON ready to paste into the Glovebox app's "Import from Claude" box.
---

# Glovebox maintenance extractor

Given images or PDFs of an auto service statement / invoice, produce **three
outputs**:

1. **`service-summary-<YYYY-MM-DD>.md`** — a plain-English walkthrough of the
   visit, for a human who finds the dealer paperwork unreadable.
2. **`service-summary-<YYYY-MM-DD>.html`** — the same content as a standalone,
   self-contained HTML document that can be opened in a browser or printed.
3. **The JSON object** — emitted as the final chat message, for pasting into
   Glovebox → Maintenance → "Import from Claude".

Write files 1 and 2 with the Write tool **before** emitting the JSON. Tool calls
and brief progress notes along the way are fine; the constraint is that the
**final assistant message contains the JSON object and nothing else** — no
prose, no explanation, no markdown code fences.

## Where the files go

Save both files **into the same directory as the source images**, unless the
user names a different location. Use the service date for the filename:
`service-summary-2026-01-29.md` / `.html`. If files with those names already
exist, overwrite them (they are regenerated artifacts).

---

## Step 1 — Read the source and reconcile the numbers

Read every image in the directory. Statements routinely span 3–5 pages, and the
pages are not in order: the estimate/summary page, the itemized invoice pages,
and the inspection checklist are usually separate photos.

Before writing anything, **make the arithmetic reconcile**:

- Sum each job's labor + parts + hazmat → should equal that job's printed sub-total.
- Sum all labor across jobs → should equal the invoice's LABOR total. Same for PARTS.
- `subtotal − discounts + tax` → should equal TOTAL DUE.

If a figure doesn't reconcile, re-read the photo before assuming an OCR error.
Two recurring traps:

- **Concatenated quantity + unit price.** A line reading `3011.84  35.52` is
  *qty 3 @ $11.84 = $35.52*, not a $3,011.84 part. The **rightmost** column is
  always the amount that counts toward the sub-total.
- **The estimate page is not the invoice.** The "Summary of Visit" / "Total
  Estimate" page is a *pre-invoice* figure and usually differs from what was
  actually paid. The itemized invoice page with `TOTAL DUE` is authoritative.

Call out in the summary any figure that still doesn't reconcile, rather than
silently smoothing it over.

---

## Step 2 — Write the Markdown summary

Aim it at someone who wants to know *what happened to the car* and *what it
cost*, not someone auditing the dealer. Structure:

- **Header block** — shop name & address, date, vehicle + VIN, RO number,
  advisor, technician, odometer in/out, total paid.
- **The numbered jobs, in plain English.** Dealer ROs number their operations
  (`#1`, `#2`, …). Keep those numbers so the summary can be checked against the
  paper, but **group them by who paid**: paid work first, then warranty work,
  then no-charge/internal items. Give each paid job a small table of its labor
  and parts.
- **Translate the codes.** `A1`, `M3`, `ASDC`, `WCE` and similar mean nothing to
  a normal reader — say "standard A1 maintenance service (the routine oil change
  Honda's Maintenance Minder called for)".
- **Surface the buried headline.** The most consequential item is often a
  warranty repair split across two line items on two different pages, showing
  `$0.00`. Pull it out into its own highlighted section: what was reported, what
  was found, what bulletin covered it, what was replaced, what the outcome was.
- **Inspection results** — measurements (brake pad mm, tire tread /32) in a
  small table; the pass/fail list compactly; any follow-up tasks performed.
- **How the total was calculated** — labor / parts / hazmat / discount / tax /
  total, as a running arithmetic block, plus a sentence on what the discount
  actually applied to.
- **Things worth knowing** — discrepancies, estimate-vs-actual gaps, template
  values that contradict measured ones.
- **Bottom line** — two or three sentences someone could read on its own.

---

## Step 3 — Write the HTML summary

Same content, same order — a standalone document, not a stripped-down version.

- Full document: `<!doctype html>`, `<html lang="en">`, `<head>` with `<meta
  charset>`, `<meta name="viewport">`, and a `<title>` naming shop and date.
- **Inline the stylesheet at `assets/summary.css`** (in this skill's directory)
  verbatim inside a `<style>` tag. Read it and paste it — never `<link>` to it,
  the file must work when moved or emailed. No external fonts, scripts, or
  images.
- Use the class vocabulary the stylesheet defines:
  - `header.doc` with `.eyebrow`, `h1`, `.subtitle`, `dl.facts` (dt/dd pairs),
    and `.headline` containing `.amt` + `.lbl` for the total paid.
  - `.job` cards, each with `.job-head` > `.job-num` + `.job-title` +
    `.job-cost` (`.paid` or `.free`), and optional `.job-note`.
  - `.callout` for the warranty/headline repair; `.tag.free` / `.tag.paid` pills.
  - `.table-wrap` around every `<table>`; `td.num` for figures; `tr.sum` for
    sub-total rows.
  - `table.totals` with `tr.rule`, `tr.grand`, and `.neg` for the discount.
  - `.checklist` for the inspection pass list; `.note-block`; `.bottom-line`;
    `footer` for provenance.
- Every table must sit inside `.table-wrap` so wide content scrolls rather than
  breaking the page on a phone.

---

## Step 4 — Output the JSON

### Schema

```
{
  "date": "YYYY-MM-DD",              // service date
  "odometer": <integer miles>,        // convert from km if the statement uses km
  "shop_name": "<string|null>",
  "total_cost": <number|null>,        // grand total, no currency symbol
  "categories": [<from the list below>],
  "line_items": [ { "description": "<string>", "cost": <number|null> } ],
  "invoice_number": "<string|null>",  // RO / invoice number if present
  "notes": "<string|null>",
  "document_urls": []                 // always empty — the user adds links in the app
}
```

### Category vocabulary (use only these)

`Oil`, `Tires`, `Brakes`, `Battery`, `Fluids`, `Filters`, `Scheduled service`,
`Inspection`, `Repair`, `Diagnostic`, `Other`

Include every category that applies to the visit. If nothing fits, use `Other`.

### Rules

- Dates → `YYYY-MM-DD`.
- `odometer` → integer **miles**, using the **mileage in** reading. If the
  statement is in kilometers, convert (`miles = km / 1.60934`) and round.
- Costs → plain numbers (e.g. `89.99`), never `"$89.99"`. Unknown cost → `null`.
- One `line_items` entry per numbered job on the RO — not one per part. Roll the
  job's parts into its description and use its sub-total as the cost.
- Warranty and internal (no-charge) jobs still get a line item, with `cost: 0`
  and the coverage noted in the description. They are part of the service history
  even though they cost nothing.
- Discounts and tax get their own line items (discount as a **negative** number)
  so the line items sum to `total_cost`.
- `total_cost` = `TOTAL DUE` on the invoice, after discount and tax — **not** the
  estimate page's total. `null` if genuinely not shown.
- `invoice_number` = the RO number without any page suffix (`784928/2` → `784928`).
- `notes` = **short and optional.** At most a single one-line headline worth
  seeing at a glance on the app card — e.g. the warranty repair
  (`"A/C condenser replaced free under warranty bulletin 21-017"`). Usually
  `null`. **Do NOT** put VIN, mileage in/out, advisor/tech names, inspection
  measurements, or the labor/parts/tax breakdown here — that detail belongs only
  in the generated Markdown/HTML summary (files 1 and 2), not in the app. The app
  card is a compact index; the summary document is the full record.
- `document_urls` is **always** `[]` — the user attaches photo links in the app.
- The final message is **only** the JSON object.

### Example output

```
{"date":"2026-06-14","odometer":41250,"shop_name":"Honda of Fremont","total_cost":189.42,"categories":["Oil","Filters","Inspection"],"line_items":[{"description":"Full synthetic oil & filter change","cost":89.99},{"description":"Cabin air filter replacement","cost":38.00},{"description":"Multi-point inspection","cost":0}],"invoice_number":"RO-88231","notes":null,"document_urls":[]}
```
