ALTER TABLE helpdesk_faults
  ADD COLUMN IF NOT EXISTS ticket_type text NOT NULL DEFAULT 'fault'
  CHECK (ticket_type IN ('fault', 'feature'));
