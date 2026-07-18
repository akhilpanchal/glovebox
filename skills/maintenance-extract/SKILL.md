---
name: maintenance-extract
description: Extract a Glovebox maintenance entry as structured JSON from a photo or scan of a car service statement/invoice, ready to paste into the Glovebox app's "Import from Claude" box.
---

# Glovebox maintenance extractor

Given an image or PDF of an auto service statement / invoice, output a **single
JSON object** matching the Glovebox maintenance schema — nothing else: no prose,
no explanation, no markdown code fences. The user pastes your output into
Glovebox → Maintenance → "Import from Claude", reviews it, and saves.

## Output schema

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

## Category vocabulary (use only these)

`Oil`, `Tires`, `Brakes`, `Battery`, `Fluids`, `Filters`, `Scheduled service`,
`Inspection`, `Repair`, `Diagnostic`, `Other`

Include every category that applies to the visit. If nothing fits, use `Other`.

## Rules

- Dates → `YYYY-MM-DD`.
- `odometer` → integer **miles**. If the statement is in kilometers, convert
  (`miles = km / 1.60934`) and round to a whole number.
- Costs → plain numbers (e.g. `89.99`), never `"$89.99"`. Unknown cost → `null`.
- Turn every itemized service/part line into one `line_items` entry (its
  description + its price).
- `total_cost` = the grand total on the statement (after tax); `null` if not shown.
- `invoice_number` = the RO or invoice number if present, else `null`.
- `document_urls` is **always** `[]` — the user attaches photo links in the app.
- Output **only** the JSON object.

## Example output

```
{"date":"2026-06-14","odometer":41250,"shop_name":"Honda of Fremont","total_cost":189.42,"categories":["Oil","Filters","Inspection"],"line_items":[{"description":"Full synthetic oil & filter change","cost":89.99},{"description":"Cabin air filter replacement","cost":38.00},{"description":"Multi-point inspection","cost":0}],"invoice_number":"RO-88231","notes":null,"document_urls":[]}
```
