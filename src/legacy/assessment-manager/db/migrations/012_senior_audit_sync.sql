CREATE TABLE senior_audit_sync (
  assessment_year integer NOT NULL,
  owner_id uuid NOT NULL,
  started_at timestamptz NOT NULL,
  completed_at timestamptz NOT NULL,
  sources_complete boolean NOT NULL,
  source_failures integer NOT NULL,
  failure_details jsonb NOT NULL,
  missing_saved integer NOT NULL,
  folders jsonb NOT NULL,
  reports jsonb NOT NULL,
  workbook_checked_at timestamptz,
  workbook_modified_at timestamptz,
  workbook_entries jsonb,
  PRIMARY KEY (assessment_year, owner_id)
);

CREATE TABLE senior_audit_sync_jobs (
  assessment_year integer NOT NULL,
  owner_id uuid NOT NULL,
  run_id uuid NOT NULL,
  started_at timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('running', 'complete', 'failed')),
  error_message text,
  PRIMARY KEY (assessment_year, owner_id)
);
