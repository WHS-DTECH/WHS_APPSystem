CREATE TABLE IF NOT EXISTS student_builders (
  id uuid PRIMARY KEY,
  full_name text NOT NULL,
  school_email text,
  contact_email text,
  github_username text,
  first_year integer,
  status text NOT NULL DEFAULT 'current' CHECK (status IN ('current', 'left')),
  projects text NOT NULL DEFAULT '',
  permission_recorded_at timestamptz,
  notes text NOT NULL DEFAULT '',
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

ALTER TABLE student_project_handovers
  ADD COLUMN IF NOT EXISTS builder_id uuid REFERENCES student_builders(id) ON DELETE SET NULL;
