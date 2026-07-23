-- Pre-ownership service history for the 2019 Clarity (VIN ...005237),
-- transcribed from the Carfax report in the April 2023 purchase packet
-- (Honda Clarity Purchase Docs.pdf, pages 31-39). These are the previous
-- owner's dealer services from 3 to 27,380 miles.
--
-- Cost is unknown (Carfax never lists price) -> total_cost NULL.
-- added_by = 'carfax-import' is a provenance sentinel, not a real user:
-- these rows were authored here and seeded by migration, never posted
-- through the API, so the 'identity comes only from Cf-Access' rule is
-- intact. Rows remain fully editable/deletable in the app afterwards.
--
-- Human-readable mirror: Purchase Documents/preownership-services.md / .html
-- Generated from gen_preownership.py -- edit there and regenerate, not by hand.

INSERT INTO maintenance_entries
  (date, odometer, shop_name, total_cost, categories, line_items,
   invoice_number, document_urls, notes, added_by)
VALUES
  ('2019-10-01', 3, 'Ocean Honda of Ventura', NULL, '["Inspection"]', '[{"description":"Pre-delivery inspection completed","cost":null},{"description":"Vehicle washed and detailed","cost":null},{"description":"Accessories installed","cost":null}]', NULL, '[]', 'Previous owner, from Carfax — New-vehicle delivery / PDI', 'carfax-import'),
  ('2020-05-21', 4558, 'Ocean Honda of Ventura', NULL, '["Oil","Inspection"]', '[{"description":"Maintenance inspection completed","cost":null},{"description":"Tire condition and pressure checked","cost":null},{"description":"Engine oil and filter changed","cost":null},{"description":"Emission system checked","cost":null}]', NULL, '[]', 'Previous owner, from Carfax — First scheduled service', 'carfax-import'),
  ('2020-10-20', 9270, 'Ocean Honda of Ventura', NULL, '["Oil","Tires","Fluids","Inspection"]', '[{"description":"Maintenance inspection completed","cost":null},{"description":"Tires rotated","cost":null},{"description":"Tire condition and pressure checked","cost":null},{"description":"Engine oil and filter changed","cost":null},{"description":"Fluids checked","cost":null},{"description":"Emission system checked","cost":null}]', NULL, '[]', 'Previous owner, from Carfax', 'carfax-import'),
  ('2021-04-23', 15050, 'Ocean Honda of Ventura', NULL, '["Oil","Fluids","Inspection"]', '[{"description":"Maintenance inspection completed","cost":null},{"description":"Engine oil and filter changed","cost":null},{"description":"Fluids checked","cost":null}]', NULL, '[]', 'Previous owner, from Carfax', 'carfax-import'),
  ('2021-05-14', 15755, 'Ocean Honda of Ventura', NULL, '["Inspection"]', '[{"description":"Body electrical system checked","cost":null}]', NULL, '[]', 'Previous owner, from Carfax', 'carfax-import'),
  ('2021-10-14', 19622, 'Ocean Honda of Ventura', NULL, '["Oil","Tires","Filters","Fluids","Brakes","Inspection","Scheduled service"]', '[{"description":"Maintenance inspection completed","cost":null},{"description":"Recommended maintenance performed","cost":null},{"description":"Tire condition and pressure checked","cost":null},{"description":"Engine oil and filter changed","cost":null},{"description":"Tires rotated","cost":null},{"description":"Fluids checked","cost":null},{"description":"Cabin air filter replaced/cleaned","cost":null},{"description":"Engine air filter replaced","cost":null},{"description":"Emission system checked","cost":null},{"description":"Wipers replaced","cost":null},{"description":"Electrical system checked","cost":null},{"description":"Trim checked","cost":null},{"description":"Brakes checked","cost":null}]', NULL, '[]', 'Previous owner, from Carfax — Major service', 'carfax-import'),
  ('2022-11-08', 27215, 'West Coast Toyota of Long Beach', NULL, '["Oil","Filters","Fluids","Inspection"]', '[{"description":"Pre-delivery / reconditioning inspection completed","cost":null},{"description":"Maintenance inspection completed","cost":null},{"description":"Fluids checked","cost":null},{"description":"Engine oil and filter changed","cost":null},{"description":"Tire condition and pressure checked","cost":null},{"description":"Interior cleaned","cost":null},{"description":"Wipers and washers checked","cost":null},{"description":"Engine air filter replaced","cost":null},{"description":"Cabin air filter replaced/cleaned","cost":null}]', NULL, '[]', 'Previous owner, from Carfax — Resale reconditioning; last oil change before purchase', 'carfax-import'),
  ('2023-01-05', 27359, 'California Inspection Station', NULL, '["Inspection"]', '[{"description":"Passed California emissions (smog) inspection","cost":null}]', NULL, '[]', 'Previous owner, from Carfax — Smog check (also reported by West Coast Toyota on 2023-01-10 — same test)', 'carfax-import'),
  ('2023-02-03', 27359, 'West Coast Toyota of Long Beach', NULL, '["Battery","Diagnostic"]', '[{"description":"Battery / charging system checked","cost":null}]', NULL, '[]', 'Previous owner, from Carfax — Odometer not reported on Carfax; carried forward from 2023-01-05', 'carfax-import'),
  ('2023-02-27', 27380, 'Lexus of Oxnard', NULL, '["Inspection"]', '[{"description":"Vehicle serviced (specific work not detailed on Carfax)","cost":null}]', NULL, '[]', 'Previous owner, from Carfax — Pre-sale service', 'carfax-import');
