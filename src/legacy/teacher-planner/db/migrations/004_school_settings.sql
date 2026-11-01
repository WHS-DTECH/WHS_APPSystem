CREATE TABLE school_planner_settings (
  year integer PRIMARY KEY CHECK (year BETWEEN 2000 AND 2100),
  content jsonb NOT NULL,
  revision integer NOT NULL DEFAULT 1,
  updated_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
