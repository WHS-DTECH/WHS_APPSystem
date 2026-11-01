CREATE TABLE teacher_calendar_settings (
  owner_id uuid PRIMARY KEY,
  subscription_url text NOT NULL CHECK (length(subscription_url) <= 500),
  revision integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
