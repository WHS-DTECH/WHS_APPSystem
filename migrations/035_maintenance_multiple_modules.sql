ALTER TABLE maintenance_notices ADD COLUMN module_keys TEXT[];

UPDATE maintenance_notices SET module_keys = ARRAY[module_key];

ALTER TABLE maintenance_notices
  ALTER COLUMN module_keys SET NOT NULL,
  ADD CONSTRAINT maintenance_notice_modules_required
    CHECK (cardinality(module_keys) > 0 AND array_position(module_keys, NULL) IS NULL);
