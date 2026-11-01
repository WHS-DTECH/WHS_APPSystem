CREATE TABLE planner_attendance_groups (
  owner_id uuid NOT NULL,
  year integer NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  content jsonb NOT NULL,
  revision integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (owner_id, year)
);

CREATE TABLE planner_attendance_marks (
  owner_id uuid NOT NULL,
  year integer NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  student_id text NOT NULL,
  student_name text NOT NULL,
  lesson_date date NOT NULL,
  period text NOT NULL CHECK (period IN ('p1','p2','p3','p4','p5')),
  mark text NOT NULL CHECK (mark IN ('','P','A','L')),
  revision integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (owner_id, year, student_id, lesson_date, period)
);
