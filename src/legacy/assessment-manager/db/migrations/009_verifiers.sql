CREATE TABLE assessment_verifiers (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  school text NOT NULL DEFAULT '',
  position text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  nzqa_expert boolean NOT NULL DEFAULT false,
  notes text NOT NULL DEFAULT '',
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE assessment_verifier_history (
  id uuid PRIMARY KEY,
  verifier_id uuid NOT NULL REFERENCES assessment_verifiers(id),
  owner_id uuid NOT NULL,
  year integer NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  department text NOT NULL,
  standard_number text NOT NULL DEFAULT '',
  title text NOT NULL,
  moderated_date date,
  notes text NOT NULL DEFAULT '',
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX assessment_verifier_history_verifier ON assessment_verifier_history(verifier_id,year DESC);
