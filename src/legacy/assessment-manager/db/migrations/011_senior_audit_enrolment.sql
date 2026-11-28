CREATE TABLE senior_audit_enrolment (
  assessment_year integer NOT NULL,
  student_id text NOT NULL,
  standard_number text NOT NULL,
  standard_version text NOT NULL,
  not_enrolled boolean NOT NULL,
  revision integer NOT NULL DEFAULT 1,
  updated_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (assessment_year, student_id, standard_number, standard_version)
);
