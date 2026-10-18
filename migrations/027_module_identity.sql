CREATE TABLE IF NOT EXISTS module_identity_codes (
  code_hash text PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES module_builder_projects(id),
  kind text NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id),
  challenge text NOT NULL,
  callback_url text NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT NOW() + INTERVAL '60 seconds'
);
CREATE TABLE IF NOT EXISTS module_identity_grants (
  token_hash text PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES module_builder_projects(id),
  kind text NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id),
  callback_url text NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT NOW() + INTERVAL '5 minutes'
);
CREATE INDEX IF NOT EXISTS module_identity_codes_expiry ON module_identity_codes(expires_at);
CREATE INDEX IF NOT EXISTS module_identity_grants_expiry ON module_identity_grants(expires_at);

CREATE OR REPLACE FUNCTION module_identity_environment_defaults() RETURNS trigger AS $$
BEGIN
IF NEW.config ? 'environmentVariables' AND NOT EXISTS (
  SELECT 1 FROM jsonb_array_elements(NEW.config->'environmentVariables') item WHERE item->>'name'='MODULE_CLIENT_ID'
) THEN
NEW.config = jsonb_set(NEW.config, '{environmentVariables}', (
  SELECT COALESCE(jsonb_agg(item), '[]'::jsonb)
  FROM jsonb_array_elements(NEW.config->'environmentVariables') item
  WHERE item->>'name' NOT IN ('GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','GOOGLE_HOSTED_DOMAIN','MODULE_ALLOWED_EMAILS')
) || jsonb_build_array(
  jsonb_build_object('name','GLOBAL_CONTROL_URL','required',true,'purpose','Shared Global Control HTTPS origin; no credentials.'),
  jsonb_build_object('name','MODULE_CLIENT_ID','required',true,'purpose','Site-specific project key and environment, e.g. teacher-planner:development.')
));
END IF;
RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS module_identity_environment_defaults_trigger ON module_builder_environments;
CREATE TRIGGER module_identity_environment_defaults_trigger BEFORE INSERT OR UPDATE OF config ON module_builder_environments
FOR EACH ROW EXECUTE FUNCTION module_identity_environment_defaults();
UPDATE module_builder_environments SET config=config;
