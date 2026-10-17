ALTER TABLE student_apps ADD COLUMN hosted_content_hash TEXT;
ALTER TABLE student_apps ADD COLUMN last_updated_at TIMESTAMPTZ;
UPDATE student_apps SET last_updated_at = created_at;
