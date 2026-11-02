-- A handed-over student app can leave the Student Apps listing and continue under In Development.
-- Reversible: nothing is deleted and module access is unchanged; clearing the timestamp restores the listing.
ALTER TABLE student_apps ADD COLUMN IF NOT EXISTS moved_to_development_at timestamptz;
ALTER TABLE student_project_handovers ADD COLUMN IF NOT EXISTS student_app_slug text;
