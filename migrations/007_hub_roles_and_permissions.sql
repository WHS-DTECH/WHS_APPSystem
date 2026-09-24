CREATE TABLE IF NOT EXISTS hub_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_key TEXT NOT NULL,
  role_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (hub_key, role_key)
);

CREATE TABLE IF NOT EXISTS hub_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_key TEXT NOT NULL,
  permission_key TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (hub_key, permission_key)
);

CREATE TABLE IF NOT EXISTS hub_role_permissions (
  hub_role_id UUID NOT NULL REFERENCES hub_roles(id) ON DELETE CASCADE,
  hub_permission_id UUID NOT NULL REFERENCES hub_permissions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (hub_role_id, hub_permission_id)
);

CREATE TABLE IF NOT EXISTS user_hub_roles (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hub_role_id UUID NOT NULL REFERENCES hub_roles(id) ON DELETE CASCADE,
  area_key TEXT,
  granted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, hub_role_id, area_key)
);

INSERT INTO hub_roles (hub_key, role_key, display_name, description) VALUES
  ('sewing-hub', 'lead-teacher', 'Lead Teacher', 'Manage Sewing Hub activities, planning, and administration.'),
  ('sewing-hub', 'teacher', 'Teacher', 'Use the Sewing Hub teacher features and browse activities.'),
  ('sewing-hub', 'technician', 'Technician', 'Use assigned Sewing Hub technical and activity features.'),
  ('sewing-hub', 'staff', 'Staff', 'Use approved Sewing Hub staff features.'),
  ('sewing-hub', 'student', 'Student', 'Use the Sewing Hub student activity library.'),
  ('sewing-hub', 'student-admin', 'Student Admin', 'Manage approved student-facing Sewing Hub content.'),
  ('technology-hub', 'lead-teacher', 'Lead Teacher', 'Manage assigned Technology Hub areas and planning.'),
  ('technology-hub', 'teacher', 'Teacher', 'Use assigned Technology Hub teacher features.'),
  ('technology-hub', 'student', 'Student', 'Use assigned Technology Hub areas as a student.'),
  ('technology-hub', 'student-admin', 'Student Admin', 'Manage approved student-facing Technology Hub content.')
ON CONFLICT (hub_key, role_key) DO NOTHING;

INSERT INTO hub_permissions (hub_key, permission_key, label, description) VALUES
  ('sewing-hub', 'home.view', 'View Home Page', 'Open the Sewing Hub home page.'),
  ('sewing-hub', 'activities.browse', 'Browse Activities', 'Browse and search Sewing Hub activities.'),
  ('sewing-hub', 'activities.upload', 'Upload Activity', 'Create and publish Sewing Hub activities.'),
  ('sewing-hub', 'planning.manage', 'Manage Planning', 'Manage Sewing Hub planning and projects.'),
  ('sewing-hub', 'suggestions.submit', 'Submit Suggestions', 'Submit an activity suggestion.'),
  ('sewing-hub', 'suggestions.manage', 'Manage Suggestions', 'Review and manage Sewing Hub suggestions.'),
  ('sewing-hub', 'admin.manage', 'Manage Hub Administration', 'Manage Sewing Hub users, roles, and settings.'),
  ('technology-hub', 'home.view', 'View Home Page', 'Open the Technology Hub home page.'),
  ('technology-hub', 'area.view', 'View Assigned Area', 'Open an assigned Technology Hub area.'),
  ('technology-hub', 'activities.upload', 'Upload Activity', 'Create and publish Technology Hub activities.'),
  ('technology-hub', 'planning.manage', 'Manage Planning', 'Manage Technology Hub planning and projects.'),
  ('technology-hub', 'suggestions.submit', 'Submit Suggestions', 'Submit an activity suggestion.'),
  ('technology-hub', 'suggestions.manage', 'Manage Suggestions', 'Review and manage Technology Hub suggestions.'),
  ('technology-hub', 'admin.manage', 'Manage Hub Administration', 'Manage Technology Hub users, roles, and settings.')
ON CONFLICT (hub_key, permission_key) DO NOTHING;

INSERT INTO hub_role_permissions (hub_role_id, hub_permission_id)
SELECT roles.id, permissions.id
FROM hub_roles roles
JOIN hub_permissions permissions ON permissions.hub_key = roles.hub_key
WHERE (roles.hub_key = 'sewing-hub' AND roles.role_key IN ('lead-teacher', 'teacher')
       AND permissions.permission_key IN ('home.view', 'activities.browse', 'suggestions.submit'))
   OR (roles.hub_key = 'sewing-hub' AND roles.role_key = 'lead-teacher'
       AND permissions.permission_key IN ('activities.upload', 'planning.manage', 'suggestions.manage', 'admin.manage'))
   OR (roles.hub_key = 'technology-hub' AND roles.role_key = 'lead-teacher'
       AND permissions.permission_key IN ('home.view', 'area.view', 'activities.upload', 'planning.manage', 'suggestions.submit', 'suggestions.manage', 'admin.manage'))
   OR (roles.hub_key = 'technology-hub' AND roles.role_key = 'teacher'
       AND permissions.permission_key IN ('home.view', 'area.view', 'suggestions.submit'))
   OR (roles.role_key = 'student' AND permissions.permission_key IN ('home.view', 'area.view', 'activities.browse'))
ON CONFLICT DO NOTHING;

INSERT INTO user_hub_roles (user_id, hub_role_id, granted_by)
SELECT access.user_id, roles.id, access.granted_by
FROM sewing_hub_access access
JOIN hub_roles roles
  ON roles.hub_key = 'sewing-hub'
 AND roles.role_key = CASE access.access_level
   WHEN 'teacher' THEN 'teacher'
   WHEN 'student' THEN 'student'
  END
ON CONFLICT DO NOTHING;

INSERT INTO user_hub_roles (user_id, hub_role_id, area_key)
SELECT access.user_id, roles.id, access.area_key
FROM technology_hub_access access
JOIN user_roles assigned_role ON assigned_role.user_id = access.user_id
JOIN roles global_role ON global_role.id = assigned_role.role_id
JOIN hub_roles roles
  ON roles.hub_key = 'technology-hub'
 AND roles.role_key = CASE global_role.name
   WHEN 'Teacher' THEN 'teacher'
   WHEN 'Student' THEN 'student'
  END
ON CONFLICT DO NOTHING;