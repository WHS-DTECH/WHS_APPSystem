CREATE TABLE assessment_exam_timetable_cache (
  year integer PRIMARY KEY CHECK (year BETWEEN 2000 AND 2100),
  events jsonb NOT NULL,
  warning text NOT NULL DEFAULT '',
  checked_at timestamptz NOT NULL DEFAULT NOW()
);
