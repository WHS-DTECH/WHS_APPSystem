CREATE TABLE assessment_school_calendar (
  year integer NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  event_key text NOT NULL,
  content jsonb NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  updated_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (year, event_key)
);

CREATE TABLE assessment_school_calendar_history (
  year integer NOT NULL,
  event_key text NOT NULL,
  content jsonb NOT NULL,
  revision integer NOT NULL,
  updated_by uuid NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (year, event_key, revision),
  FOREIGN KEY (year, event_key) REFERENCES assessment_school_calendar(year, event_key)
);
