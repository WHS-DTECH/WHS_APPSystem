-- Existing independently hosted student apps can be Module Builder registry entries but still belong
-- under Student Apps until a handover moves them to In Development (reversible flag; nothing deleted).
ALTER TABLE module_builder_projects ADD COLUMN IF NOT EXISTS listed_as_student_app boolean NOT NULL DEFAULT false;
UPDATE module_builder_projects SET listed_as_student_app = true WHERE slug = 'international-app';
