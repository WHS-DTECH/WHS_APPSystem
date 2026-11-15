ALTER TABLE assessment_resource_library ADD COLUMN deleted_at timestamptz;

CREATE TABLE assessment_resource_library_drafts (
  resource_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  content jsonb NOT NULL,
  base_revision integer NOT NULL CHECK (base_revision >= 0),
  revision integer NOT NULL CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (resource_id, owner_id)
);
