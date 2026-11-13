ALTER TABLE student_tracker_departments
  ADD COLUMN class_links jsonb NOT NULL DEFAULT '{}'::jsonb
  CHECK (jsonb_typeof(class_links) = 'object');
