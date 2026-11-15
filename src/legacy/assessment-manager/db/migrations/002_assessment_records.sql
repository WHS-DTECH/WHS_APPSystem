CREATE TABLE assessment_records (
  owner_id uuid NOT NULL,
  year integer NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  entry_key text NOT NULL CHECK (entry_key = 'main' OR entry_key ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'),
  parent_record text,
  content jsonb NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (owner_id, year, entry_key),
  CHECK (parent_record IS NULL OR parent_record <> entry_key),
  CHECK (entry_key <> 'main' OR parent_record IS NULL),
  FOREIGN KEY (owner_id, year, parent_record)
    REFERENCES assessment_records (owner_id, year, entry_key) ON DELETE RESTRICT
);

CREATE INDEX assessment_records_owner_year_updated
  ON assessment_records (owner_id, year, updated_at DESC);

CREATE TABLE assessment_settings (
  owner_id uuid NOT NULL,
  year integer NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (owner_id, year)
);

CREATE TABLE assessment_audit (
  id bigserial PRIMARY KEY,
  owner_id uuid NOT NULL,
  year integer NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  entry_key text NOT NULL,
  action text NOT NULL CHECK (action IN ('created', 'updated', 'deleted', 'settings-updated')),
  revision integer NOT NULL CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX assessment_audit_owner_time
  ON assessment_audit (owner_id, created_at DESC);
