CREATE TABLE planner_sections (
  owner_id uuid NOT NULL,
  year integer NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  section text NOT NULL CHECK (section IN ('week','year','term','goals','learning')),
  entry_key text NOT NULL,
  content jsonb NOT NULL,
  revision integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (owner_id, year, section, entry_key)
);
