CREATE SCHEMA IF NOT EXISTS kamar;

CREATE TABLE IF NOT EXISTS kamar.upload_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_type TEXT NOT NULL CHECK (upload_type IN ('staff', 'students', 'student_timetable', 'staff_timetable')),
  academic_year INTEGER NOT NULL,
  term TEXT NOT NULL,
  original_filename TEXT,
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  row_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('processing', 'completed', 'failed')),
  error_summary TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS kamar.staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kamar_code TEXT NOT NULL UNIQUE,
  last_name TEXT,
  first_name TEXT,
  title TEXT,
  email_school TEXT,
  status TEXT NOT NULL DEFAULT 'Current',
  academic_year INTEGER NOT NULL,
  term TEXT NOT NULL,
  upload_run_id UUID NOT NULL REFERENCES kamar.upload_runs(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kamar.students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kamar_id TEXT NOT NULL UNIQUE,
  last_name TEXT,
  first_name TEXT,
  gender TEXT,
  year_level TEXT,
  tutor TEXT,
  timetable_class TEXT,
  email_school TEXT,
  status TEXT NOT NULL DEFAULT 'Current',
  academic_year INTEGER NOT NULL,
  term TEXT NOT NULL,
  upload_run_id UUID NOT NULL REFERENCES kamar.upload_runs(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kamar.student_timetables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kamar_student_id TEXT NOT NULL,
  student_name TEXT,
  form_class TEXT,
  year_level TEXT,
  timetable JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'Current',
  academic_year INTEGER NOT NULL,
  term TEXT NOT NULL,
  upload_run_id UUID NOT NULL REFERENCES kamar.upload_runs(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (kamar_student_id, academic_year, term)
);

CREATE TABLE IF NOT EXISTS kamar.staff_timetables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kamar_staff_code TEXT NOT NULL,
  staff_name TEXT,
  timetable JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'Current',
  academic_year INTEGER NOT NULL,
  term TEXT NOT NULL,
  upload_run_id UUID NOT NULL REFERENCES kamar.upload_runs(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (kamar_staff_code, academic_year, term)
);

INSERT INTO modules (module_key, display_name, description, path)
VALUES ('kamar-uploader', 'Kamar Uploader', 'Termly Staff, Student, and Timetable data refreshes.', '/admin/kamar-uploader')
ON CONFLICT (module_key) DO NOTHING;

INSERT INTO permissions (module_key, key, label, description) VALUES
  ('kamar-uploader', 'kamar.dashboard.view', 'View Kamar dashboard', 'Open Kamar upload status and history.'),
  ('kamar-uploader', 'kamar.staff.upload', 'Upload Staff data', 'Refresh Staff records from Kamar.'),
  ('kamar-uploader', 'kamar.students.upload', 'Upload Student data', 'Refresh Student records from Kamar.'),
  ('kamar-uploader', 'kamar.student_timetable.upload', 'Upload Student timetables', 'Refresh Student timetable data from Kamar.'),
  ('kamar-uploader', 'kamar.staff_timetable.upload', 'Upload Staff timetables', 'Refresh Staff timetable data from Kamar.')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
FROM roles
CROSS JOIN permissions
WHERE roles.name = 'ADMIN' AND permissions.module_key = 'kamar-uploader'
ON CONFLICT DO NOTHING;