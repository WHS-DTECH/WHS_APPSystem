CREATE TABLE students_audit_sync (
  assessment_year integer NOT NULL,
  department_id uuid NOT NULL,
  started_at timestamptz NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  source jsonb NOT NULL,
  entries jsonb NOT NULL,
  PRIMARY KEY (assessment_year, department_id)
);
