-- Adds `service_items`: a canonical maintenance-item taxonomy tied to the Honda
-- Maintenance Minder codes, distinct from the coarse `categories` UI vocabulary.
-- These are the items the v3 due-ness engine reasons about (see src/config/manual.js).
--
-- Vocabulary (9 items = Minder codes A,0,1,2,3,4,5,7,8):
--   oil, tire_rotation, brake_inspection, brake_fluid, transmission_fluid,
--   cabin_filter, engine_air_filter, spark_plugs, coolant
--
-- Going forward, the maintenance-extract skill emits `service_items` at entry time
-- (Option C'). This migration BACKFILLS all pre-existing rows by classifying each
-- entry's line_items. Keyed by `date` (all 17 dates are unique) so it applies
-- identically to local and production regardless of row id.
--
-- Tags reflect work actually PERFORMED (a replacement/service/inspection), not
-- merely "checked": "fluids checked" is not a fluid change; a generic multi-point
-- inspection is tagged brake_inspection only when brakes were explicitly measured
-- or serviced. spark_plugs and coolant appear on NO row — the factory originals
-- have never been changed since 2019 (this is the expected, verified result).

ALTER TABLE maintenance_entries
  ADD COLUMN service_items TEXT NOT NULL DEFAULT '[]';

-- Owner 2 (post-purchase) --------------------------------------------------
UPDATE maintenance_entries SET service_items =
  '["oil","brake_inspection","transmission_fluid"]'                     WHERE date = '2026-01-29';
UPDATE maintenance_entries SET service_items =
  '["oil","brake_fluid","cabin_filter","engine_air_filter","brake_inspection"]' WHERE date = '2025-08-01';
UPDATE maintenance_entries SET service_items =
  '["oil","tire_rotation"]'                                            WHERE date = '2024-07-22';
UPDATE maintenance_entries SET service_items =
  '["oil","brake_fluid","transmission_fluid"]'                         WHERE date = '2023-10-06';
UPDATE maintenance_entries SET service_items =
  '["oil","tire_rotation","brake_inspection"]'                         WHERE date = '2026-07-18';
-- (2024-10-21 tires+alignment+A/C, 2024-12-09 recall: no canonical items -> stay '[]')

-- Owner 1 (pre-ownership, from Carfax) -------------------------------------
UPDATE maintenance_entries SET service_items =
  '["oil"]'                                                            WHERE date = '2020-05-21';
UPDATE maintenance_entries SET service_items =
  '["oil","tire_rotation"]'                                            WHERE date = '2020-10-20';
UPDATE maintenance_entries SET service_items =
  '["oil"]'                                                            WHERE date = '2021-04-23';
UPDATE maintenance_entries SET service_items =
  '["oil","tire_rotation","cabin_filter","engine_air_filter","brake_inspection"]' WHERE date = '2021-10-14';
UPDATE maintenance_entries SET service_items =
  '["oil","cabin_filter","engine_air_filter"]'                         WHERE date = '2022-11-08';
-- (2019-10-01 PDI, 2021-05-14 electrical, 2023-01-05 smog, 2023-02-03 battery,
--  2023-02-27 unspecified pre-sale: no canonical items -> stay '[]')
