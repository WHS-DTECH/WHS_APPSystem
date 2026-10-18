CREATE TABLE IF NOT EXISTS module_builder_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  repository text NOT NULL DEFAULT '',
  branch text NOT NULL DEFAULT 'main',
  mount_path text NOT NULL,
  deployment_type text NOT NULL DEFAULT 'embedded' CHECK (deployment_type IN ('embedded', 'independent')),
  stage text NOT NULL DEFAULT 'development' CHECK (stage IN ('draft', 'development', 'staging', 'released', 'archived')),
  repository_managed boolean NOT NULL DEFAULT false,
  framework_commit text,
  active_operation uuid,
  revision integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES users(id),
  updated_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS module_builder_environments (
  project_id uuid NOT NULL REFERENCES module_builder_projects(id),
  kind text NOT NULL CHECK (kind IN ('development', 'staging', 'production')),
  config jsonb NOT NULL DEFAULT '{}',
  verification jsonb NOT NULL DEFAULT '{}',
  checked_at timestamptz,
  PRIMARY KEY (project_id, kind)
);

CREATE TABLE IF NOT EXISTS module_builder_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES module_builder_projects(id),
  kind text NOT NULL,
  status text NOT NULL CHECK (status IN ('running', 'succeeded', 'failed', 'uncertain', 'resolved')),
  actor_id uuid NOT NULL REFERENCES users(id),
  request_summary jsonb NOT NULL DEFAULT '{}',
  result_summary jsonb NOT NULL DEFAULT '{}',
  message text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  completed_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS module_builder_one_running
  ON module_builder_operations(project_id) WHERE status = 'running';
CREATE INDEX IF NOT EXISTS module_builder_operation_history
  ON module_builder_operations(project_id, created_at DESC);

CREATE OR REPLACE FUNCTION module_builder_default_environments() RETURNS trigger AS $$
BEGIN
  INSERT INTO module_builder_environments(project_id, kind, config)
  SELECT NEW.id, kind, jsonb_build_object(
    'serviceName', LEFT(NEW.slug, 45) || '-' || kind, 'databaseName', LEFT(NEW.slug, 45) || '-' || kind || '-db',
    'region', 'singapore', 'servicePlan', 'free', 'databasePlan', 'free',
    'healthPath', '/health', 'dockerfilePath', './Dockerfile',
    'environmentVariables', jsonb_build_array(
      jsonb_build_object('name', 'DATABASE_URL', 'purpose', 'Separate module database.', 'required', true),
      jsonb_build_object('name', 'NODE_ENV', 'purpose', 'Node runtime mode.', 'required', true),
      jsonb_build_object('name', 'SESSION_SECRET', 'purpose', 'Module-specific session signing secret.', 'required', true),
      jsonb_build_object('name', 'GOOGLE_CLIENT_ID', 'purpose', 'Standalone Google sign-in client.', 'required', true),
      jsonb_build_object('name', 'GOOGLE_CLIENT_SECRET', 'purpose', 'Standalone Google sign-in secret.', 'required', true),
      jsonb_build_object('name', 'APP_BASE_URL', 'purpose', 'Service public URL for Google callbacks.', 'required', true),
      jsonb_build_object('name', 'GOOGLE_HOSTED_DOMAIN', 'purpose', 'Allowed school domain.', 'required', true),
      jsonb_build_object('name', 'MODULE_ALLOWED_EMAILS', 'purpose', 'Explicit school tester email allowlist; empty denies all.', 'required', true),
      jsonb_build_object('name', 'MODULE_ENVIRONMENT', 'purpose', 'Visible development/staging/production label.', 'required', true)
    ))
  FROM unnest(ARRAY['development','staging','production']) kind;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS module_builder_default_environments_trigger ON module_builder_projects;
CREATE TRIGGER module_builder_default_environments_trigger AFTER INSERT ON module_builder_projects
FOR EACH ROW EXECUTE FUNCTION module_builder_default_environments();

INSERT INTO module_builder_projects (slug, name, description, repository, mount_path)
VALUES ('teacher-planner', 'Teacher Planner',
  'Existing initial API/database foundation only. Original Render service was deleted; inspect for a surviving database before creating another. No planner UI or production integration yet.',
  'WHS-DTECH/WHS_TeacherPlanner', '/teacher-planner/')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO modules (module_key, display_name, description, path)
VALUES ('module-builder', 'Module Builder', 'Administrator-only development registry and confirmed GitHub/Render provisioning.', '/module-builder')
ON CONFLICT (module_key) DO NOTHING;
INSERT INTO role_modules (role_id, module_id)
SELECT r.id, m.id FROM roles r CROSS JOIN modules m
WHERE r.name = 'ADMIN' AND m.module_key = 'module-builder'
ON CONFLICT DO NOTHING;
