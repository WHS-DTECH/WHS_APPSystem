CREATE TABLE planner_junior_progress (
  owner_id uuid NOT NULL,
  year integer NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  class_key text NOT NULL CHECK (class_key IN ('JPI', 'JSR')),
  sequence_key text NOT NULL,
  entry_id text NOT NULL CHECK (entry_id ~ '^[0-9a-f]{24}$'),
  revision integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (owner_id, year, class_key, sequence_key)
);

CREATE TABLE planner_junior_session_kits (
  owner_id uuid NOT NULL,
  session_date date NOT NULL,
  slot_key text NOT NULL CHECK (slot_key IN ('p1', 'p2', 'p3', 'p4', 'p5')),
  class_key text NOT NULL CHECK (class_key IN ('JPI', 'JSR')),
  kits jsonb NOT NULL,
  revision integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (owner_id, session_date, slot_key, class_key)
);
