CREATE TABLE IF NOT EXISTS helpdesk_faults (
  id uuid PRIMARY KEY,
  ticket_number bigserial UNIQUE NOT NULL,
  reporter_id uuid NOT NULL REFERENCES users(id),
  subject text NOT NULL CHECK (char_length(subject) BETWEEN 1 AND 150),
  app_name text NOT NULL CHECK (char_length(app_name) BETWEEN 1 AND 100),
  page_url text NOT NULL DEFAULT '',
  description text NOT NULL CHECK (char_length(description) BETWEEN 1 AND 10000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in-progress', 'resolved')),
  reply text NOT NULL DEFAULT '' CHECK (char_length(reply) <= 4000),
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  updated_by uuid REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS helpdesk_faults_reporter_idx ON helpdesk_faults(reporter_id, created_at DESC, id);
CREATE INDEX IF NOT EXISTS helpdesk_faults_status_idx ON helpdesk_faults(status, created_at DESC, id);
