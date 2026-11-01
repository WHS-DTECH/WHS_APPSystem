CREATE TABLE google_calendar_connections (
  owner_id uuid PRIMARY KEY,
  connection_id uuid NOT NULL,
  google_subject text NOT NULL,
  email text NOT NULL,
  encrypted_tokens text NOT NULL,
  selected_calendars jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(selected_calendars) = 'array'),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
