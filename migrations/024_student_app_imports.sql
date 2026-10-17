CREATE TABLE IF NOT EXISTS student_app_imports (
  id uuid PRIMARY KEY,
  app_id uuid NOT NULL REFERENCES student_apps(id),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  expires_at timestamptz NOT NULL DEFAULT (NOW() + INTERVAL '1 hour'),
  status text NOT NULL DEFAULT 'preview' CHECK (status IN ('preview', 'importing', 'completed', 'failed')),
  snapshot jsonb NOT NULL,
  destination_repository text NOT NULL,
  archive_commit text,
  archive_folder text,
  archive_url text,
  completed_at timestamptz,
  error_message text
);
CREATE INDEX IF NOT EXISTS student_app_imports_created_at_idx ON student_app_imports(created_at DESC);
