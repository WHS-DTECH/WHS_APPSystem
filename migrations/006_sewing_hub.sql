CREATE TABLE IF NOT EXISTS sewing_hub_access (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  access_level TEXT NOT NULL CHECK (access_level IN ('student', 'teacher')),
  granted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, access_level)
);

INSERT INTO modules (module_key, display_name, description, path)
VALUES ('sewing-hub', 'Sewing Hub', 'Public Sewing Hub homepage with assigned Student and Teacher access.', '/sewing-hub')
ON CONFLICT (module_key) DO NOTHING;

INSERT INTO permissions (module_key, key, label, description) VALUES
  ('sewing-hub', 'sewing-hub.home.view', 'View Sewing Hub homepage', 'Open the public Sewing Hub homepage.'),
  ('sewing-hub', 'sewing-hub.activities.student', 'View Sewing Hub as Student', 'Open the student activity library.'),
  ('sewing-hub', 'sewing-hub.activities.teacher', 'View Sewing Hub as Teacher', 'Open teacher activity information.'),
  ('sewing-hub', 'sewing-hub.assign', 'Assign Sewing Hub access', 'Assign individual Student and Teacher access.')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
FROM roles CROSS JOIN permissions
WHERE roles.name = 'ADMIN' AND permissions.module_key = 'sewing-hub'
ON CONFLICT DO NOTHING;