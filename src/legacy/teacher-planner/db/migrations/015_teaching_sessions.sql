CREATE TABLE planner_class_contexts (
  owner_id uuid NOT NULL,
  year integer NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  group_key text NOT NULL,
  checkpoint_note text NOT NULL,
  confirmed_at timestamptz NOT NULL DEFAULT NOW(),
  revision integer NOT NULL DEFAULT 1,
  PRIMARY KEY (owner_id, year, group_key)
);

CREATE TABLE planner_sessions (
  owner_id uuid NOT NULL,
  year integer NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  session_date date NOT NULL,
  occurrence_id text NOT NULL,
  slot_key text NOT NULL,
  group_key text NOT NULL,
  unit_id text,
  lesson_id text,
  session_type text NOT NULL CHECK (session_type IN ('teaching','whanau','observation','meeting','duty')),
  content jsonb NOT NULL,
  confirmed_content jsonb,
  confirmed_at timestamptz,
  revision integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (owner_id, year, occurrence_id),
  UNIQUE (owner_id, session_date, group_key, slot_key),
  CHECK (EXTRACT(YEAR FROM session_date) = year),
  CHECK ((confirmed_content IS NULL) = (confirmed_at IS NULL))
);
CREATE INDEX planner_sessions_class_history ON planner_sessions (owner_id, year, group_key, session_date);
