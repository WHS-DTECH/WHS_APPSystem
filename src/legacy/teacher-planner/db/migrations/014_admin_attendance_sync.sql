CREATE TABLE planner_attendance_admin_sync (
  admin_id uuid NOT NULL,
  year integer NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  folder_id text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  processed jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(processed) = 'object'),
  revision integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (admin_id, year)
);
