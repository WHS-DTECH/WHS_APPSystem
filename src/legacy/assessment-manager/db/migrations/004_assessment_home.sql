CREATE TABLE assessment_home_calendar (
  owner_id uuid NOT NULL,
  year integer NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  event_key text NOT NULL,
  content jsonb NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (owner_id, year, event_key)
);

CREATE TABLE assessment_home_tasks (
  owner_id uuid NOT NULL,
  year integer NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  task_key text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('manual', 'moderation')),
  content jsonb NOT NULL,
  completed_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (owner_id, year, task_key)
);

CREATE TABLE assessment_home_audit (
  id bigserial PRIMARY KEY,
  owner_id uuid NOT NULL,
  year integer NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  entry_key text NOT NULL,
  action text NOT NULL,
  content jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX assessment_home_audit_owner_year
  ON assessment_home_audit (owner_id, year, id DESC);

CREATE TABLE assessment_calendar_cache (
  year integer PRIMARY KEY CHECK (year BETWEEN 2000 AND 2100),
  events jsonb NOT NULL,
  checked_at timestamptz NOT NULL DEFAULT NOW()
);
