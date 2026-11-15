CREATE TABLE assessment_resource_library (
  id uuid PRIMARY KEY,
  content jsonb NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE assessment_resource_library_history (
  resource_id uuid NOT NULL REFERENCES assessment_resource_library(id),
  revision integer NOT NULL CHECK (revision > 0),
  content jsonb NOT NULL,
  updated_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (resource_id, revision)
);
