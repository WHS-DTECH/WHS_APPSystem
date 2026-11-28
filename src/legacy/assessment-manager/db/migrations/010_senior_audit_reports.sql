CREATE TABLE senior_audit_reports (
  assessment_year integer NOT NULL,
  report_key text NOT NULL,
  modified_at timestamptz NOT NULL,
  source jsonb NOT NULL,
  report jsonb NOT NULL,
  PRIMARY KEY (assessment_year, report_key)
);
