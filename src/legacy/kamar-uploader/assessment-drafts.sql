ALTER TABLE kamar_assessment_snapshots
  ALTER COLUMN school_year DROP NOT NULL,
  ALTER COLUMN observed_on DROP NOT NULL,
  ALTER COLUMN source_name DROP NOT NULL,
  ALTER COLUMN image_hash DROP NOT NULL;

ALTER TABLE kamar_assessment_snapshots
  ADD CONSTRAINT kamar_assessment_snapshot_source_pair
  CHECK ((source_name IS NULL) = (image_hash IS NULL));
