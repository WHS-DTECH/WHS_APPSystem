CREATE TABLE IF NOT EXISTS maintenance_email_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('request', 'completed')),
  module_keys TEXT[] NOT NULL CHECK (
    cardinality(module_keys) > 0 AND array_position(module_keys, NULL) IS NULL
  ),
  module_name TEXT NOT NULL,
  payload JSONB NOT NULL,
  content_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN (
    'test_pending', 'test_failed', 'tested', 'scheduling', 'scheduled',
    'sending', 'sent', 'failed'
  )),
  error TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  test_sent_at TIMESTAMPTZ,
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS maintenance_email_drafts_kind_created_idx
  ON maintenance_email_drafts (kind, created_at DESC);

ALTER TABLE maintenance_notices
  ADD COLUMN IF NOT EXISTS warning_test_draft_id UUID
    REFERENCES maintenance_email_drafts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS warning_tested_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS maintenance_notices_warning_test_draft_idx
  ON maintenance_notices (warning_test_draft_id)
  WHERE warning_test_draft_id IS NOT NULL;
