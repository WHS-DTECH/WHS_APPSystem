CREATE TABLE kamar_assessment_snapshots (
  id uuid PRIMARY KEY,
  school_year integer NOT NULL CHECK (school_year BETWEEN 2000 AND 2100),
  observed_on date NOT NULL,
  source_name text NOT NULL,
  image_hash text NOT NULL CHECK (image_hash ~ '^[0-9a-f]{64}$'),
  data jsonb NOT NULL,
  supersedes_id uuid REFERENCES kamar_assessment_snapshots(id),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX kamar_assessment_snapshot_successor
  ON kamar_assessment_snapshots(supersedes_id) WHERE supersedes_id IS NOT NULL;
CREATE INDEX kamar_assessment_snapshot_year ON kamar_assessment_snapshots(school_year, observed_on DESC, created_at DESC);
CREATE TRIGGER kamar_assessment_snapshots_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON kamar_assessment_snapshots
  FOR EACH STATEMENT EXECUTE FUNCTION kamar_history_immutable();
