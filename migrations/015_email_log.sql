CREATE TABLE IF NOT EXISTS email_log (
  id BIGSERIAL PRIMARY KEY,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT NOT NULL DEFAULT 'System',
  status TEXT NOT NULL,
  to_addresses TEXT NOT NULL DEFAULT '',
  bcc_addresses TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  body_text TEXT,
  body_html TEXT,
  message_id TEXT,
  error TEXT
);

CREATE INDEX IF NOT EXISTS email_log_sent_at_idx ON email_log (sent_at DESC);
