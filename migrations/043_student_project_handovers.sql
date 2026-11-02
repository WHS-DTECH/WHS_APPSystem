CREATE TABLE IF NOT EXISTS student_project_handovers (
  id uuid PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  source_repository text NOT NULL,
  source_commit text NOT NULL,
  student_name text NOT NULL,
  student_github text,
  school_year integer NOT NULL,
  review_on date NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  busy_until timestamptz,
  labelled_at timestamptz,
  made_private boolean,
  school_copy_kind text CHECK (school_copy_kind IN ('repository', 'existing')),
  school_copy_url text,
  school_copy_commit text,
  school_copy_at timestamptz,
  backup_snapshot jsonb,
  backup_preview_by uuid REFERENCES users(id),
  backup_preview_expires_at timestamptz,
  backup_url text,
  backup_commit text,
  backup_at timestamptz,
  backup_skipped_reason text,
  frozen_at timestamptz,
  finished_at timestamptz,
  finish_action text CHECK (finish_action IN ('transferred', 'deleted', 'kept')),
  history jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS student_project_handovers_active_source_idx
  ON student_project_handovers (lower(source_repository)) WHERE finished_at IS NULL;
