-- Student builders are identified by school email (admin-only, links to the DTECH Hub record).
-- No Kamar student ID is kept; the public credit name is derived from the school username.
ALTER TABLE student_builders DROP COLUMN IF EXISTS kamar_student_id;
ALTER TABLE student_builders DROP COLUMN IF EXISTS github_username;
ALTER TABLE student_builders ADD COLUMN IF NOT EXISTS school_email text;
ALTER TABLE student_builders ADD COLUMN IF NOT EXISTS github_url text;
CREATE UNIQUE INDEX IF NOT EXISTS student_builders_school_email_idx ON student_builders (lower(school_email));
