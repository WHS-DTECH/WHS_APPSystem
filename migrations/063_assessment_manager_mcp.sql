CREATE TABLE assessment_manager_mcp_codes (
  code_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id text NOT NULL CHECK (client_id = 'assessment-manager-chatgpt'),
  redirect_uri text NOT NULL,
  challenge text NOT NULL,
  resource text NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT NOW() + INTERVAL '5 minutes'
);

CREATE TABLE assessment_manager_mcp_grants (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id text NOT NULL CHECK (client_id = 'assessment-manager-chatgpt'),
  resource text NOT NULL,
  scope text NOT NULL CHECK (scope = 'assessment:read'),
  expires_at timestamptz NOT NULL DEFAULT NOW() + INTERVAL '8 hours'
);
