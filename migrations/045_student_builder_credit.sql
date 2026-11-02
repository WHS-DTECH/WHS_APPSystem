ALTER TABLE student_builders ADD COLUMN IF NOT EXISTS kamar_student_id text;
ALTER TABLE student_builders ADD COLUMN IF NOT EXISTS credit_name text;
UPDATE student_builders
  SET credit_name = upper(left(full_name, 1)) || CASE WHEN full_name ~ '\s' THEN regexp_replace(regexp_replace(full_name, '^.*\s', ''), '[^A-Za-z0-9-]', '', 'g') ELSE '' END
  WHERE credit_name IS NULL;
ALTER TABLE student_builders DROP COLUMN IF EXISTS school_email;
ALTER TABLE student_builders DROP COLUMN IF EXISTS contact_email;
