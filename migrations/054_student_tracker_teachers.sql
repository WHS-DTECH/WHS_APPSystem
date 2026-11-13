ALTER TABLE student_tracker_departments
  ADD COLUMN teacher_emails text[] NOT NULL DEFAULT '{}';
