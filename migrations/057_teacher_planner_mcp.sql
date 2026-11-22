CREATE TABLE teacher_planner_mcp_codes (
  code_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id text NOT NULL,
  redirect_uri text NOT NULL,
  challenge text NOT NULL,
  resource text NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT NOW() + INTERVAL '5 minutes'
);

CREATE TABLE teacher_planner_mcp_grants (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id text NOT NULL,
  resource text NOT NULL,
  scope text NOT NULL CHECK (scope = 'planner:read'),
  expires_at timestamptz NOT NULL DEFAULT NOW() + INTERVAL '1 hour'
);
