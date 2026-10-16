CREATE TABLE IF NOT EXISTS activity_suggestions (
  id SERIAL PRIMARY KEY,
  submitter_name VARCHAR(255) NOT NULL,
  submitter_email VARCHAR(255) NOT NULL,
  activity_name VARCHAR(255) NOT NULL,
  activity_url TEXT,
  reason TEXT,
  pdf_data BYTEA,
  pdf_filename VARCHAR(255),
  submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS uploaded_activities (
  id SERIAL PRIMARY KEY,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  activity_name VARCHAR(255) NOT NULL,
  card_url TEXT,
  year_level VARCHAR(50),
  activity_type VARCHAR(100),
  activity_category VARCHAR(100),
  duration_minutes INTEGER,
  difficulty VARCHAR(100),
  card_color VARCHAR(50),
  subject_stream VARCHAR(100),
  outcome_image_url TEXT,
  outcome_image_data BYTEA,
  outcome_image_mime VARCHAR(100),
  outcome_image_filename VARCHAR(255),
  short_description TEXT,
  resources_text TEXT,
  equipment_text TEXT,
  instructions_text TEXT,
  management_notes TEXT,
  class_preparation TEXT,
  assessment_focus TEXT,
  common_resources TEXT[] DEFAULT '{}',
  show_this_week BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS uploaded_url_ideas (
  id SERIAL PRIMARY KEY,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  activity_name VARCHAR(255) NOT NULL,
  activity_type VARCHAR(150),
  card_color VARCHAR(50),
  idea_url TEXT NOT NULL,
  short_description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS uploaded_assessment_tasks (
  id SERIAL PRIMARY KEY,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  assessment_task_name VARCHAR(255) NOT NULL,
  year_level VARCHAR(50),
  task_type VARCHAR(100),
  activity_category VARCHAR(120),
  difficulty VARCHAR(100),
  subject_stream VARCHAR(120),
  duration_hours VARCHAR(50),
  card_color VARCHAR(50),
  short_description TEXT,
  task_list TEXT,
  selected_standard VARCHAR(40),
  standard_details TEXT,
  req_achieved TEXT,
  req_merit TEXT,
  req_excellence TEXT,
  submit_requirements TEXT,
  relevant_implications TEXT,
  progress_record TEXT,
  feedback_training TEXT,
  supporting_files JSONB DEFAULT '[]'::jsonb,
  show_this_week BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS year_planner_templates (
  year_level VARCHAR(50) PRIMARY KEY,
  file_name VARCHAR(255) NOT NULL,
  planner JSONB NOT NULL,
  imported_by UUID REFERENCES users(id) ON DELETE SET NULL,
  imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS uploaded_lesson_notes (
  id SERIAL PRIMARY KEY,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  lesson_note_title VARCHAR(255) NOT NULL,
  year_level VARCHAR(50) NOT NULL,
  strand_number INTEGER,
  strand_title VARCHAR(255),
  source_file_name VARCHAR(255),
  source_file_mime VARCHAR(120),
  source_file_size INTEGER,
  source_file_data BYTEA,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS uploaded_worksheets (
  id SERIAL PRIMARY KEY,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  worksheet_title VARCHAR(255) NOT NULL,
  year_level VARCHAR(50) NOT NULL,
  worksheet_category VARCHAR(120),
  strand_number INTEGER,
  strand_title VARCHAR(255),
  lesson_note_id INTEGER REFERENCES uploaded_lesson_notes(id) ON DELETE SET NULL,
  file_name VARCHAR(255) NOT NULL,
  file_mime VARCHAR(120),
  file_size INTEGER,
  file_data BYTEA NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS workshop_legacy_import (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  summary JSONB NOT NULL DEFAULT '{}'::jsonb
);

INSERT INTO hub_roles (hub_key, role_key, display_name, description) VALUES
  ('workshop', 'lead-teacher', 'Workshop Lead Teacher', 'Upload worksheets, lesson notes, planners and manage Workshop planning.'),
  ('workshop', 'technician', 'Workshop Technician', 'Workshop technician access.')
ON CONFLICT (hub_key, role_key) DO NOTHING;