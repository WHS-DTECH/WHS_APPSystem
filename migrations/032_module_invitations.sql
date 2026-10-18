CREATE TABLE IF NOT EXISTS module_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES users(id),
  user_id uuid NOT NULL REFERENCES users(id),
  module_key text NOT NULL,
  snapshot jsonb NOT NULL,
  status text NOT NULL DEFAULT 'prepared'
    CHECK (status IN ('prepared','test_sending','test_sent','sending','sent','failed')),
  test_message_id text,
  message_id text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  expires_at timestamptz NOT NULL DEFAULT NOW() + INTERVAL '24 hours',
  test_sent_at timestamptz,
  sent_at timestamptz
);
CREATE INDEX IF NOT EXISTS module_invitations_actor_created ON module_invitations(actor_id,created_at DESC);
