CREATE TABLE school_duty_rosters (
  year integer NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  term integer NOT NULL CHECK (term BETWEEN 1 AND 4),
  content jsonb NOT NULL,
  revision integer NOT NULL DEFAULT 1,
  updated_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (year, term)
);
