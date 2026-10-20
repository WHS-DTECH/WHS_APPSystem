CREATE TABLE IF NOT EXISTS maintenance_notices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key TEXT NOT NULL,
  module_name TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  expected_duration TEXT NOT NULL DEFAULT '',
  impact TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'in_progress', 'resuming', 'resumption_failed', 'resumed', 'cancelled')),
  warning_attempted_at TIMESTAMPTZ,
  warning_sent_at TIMESTAMPTZ,
  warning_error TEXT,
  resumed_at TIMESTAMPTZ,
  resumption_notes TEXT NOT NULL DEFAULT '',
  resumption_error TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS maintenance_notices_due_idx
  ON maintenance_notices (scheduled_at)
  WHERE status = 'scheduled' AND warning_sent_at IS NULL;
