CREATE TABLE student_tracker_departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  manager_ids uuid[] NOT NULL DEFAULT '{}',
  subjects text[] NOT NULL DEFAULT '{}',
  revision integer NOT NULL DEFAULT 1,
  updated_by uuid NOT NULL REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
