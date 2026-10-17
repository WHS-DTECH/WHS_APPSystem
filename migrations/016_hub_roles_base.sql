-- user_hub_roles' primary key included the optional area_key, which made hub-wide grants (no area) impossible.
ALTER TABLE user_hub_roles DROP CONSTRAINT IF EXISTS user_hub_roles_pkey;
ALTER TABLE user_hub_roles ALTER COLUMN area_key DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS user_hub_roles_unique_idx ON user_hub_roles (user_id, hub_role_id, COALESCE(area_key, ''));

-- Global Control hub roles are the base for every hub: Lead Teacher, Teacher, Technician, Student.
INSERT INTO hub_roles (hub_key, role_key, display_name, description)
SELECT hubs.hub_key, roles.role_key, roles.display_name, roles.description
FROM (VALUES ('sewing-hub'), ('technology-hub'), ('workshop'), ('food-room')) AS hubs(hub_key)
CROSS JOIN (VALUES
  ('lead-teacher', 'Lead Teacher', 'Manages the hub, its content and who holds roles in it.'),
  ('teacher', 'Teacher', 'Uses the hub teacher features.'),
  ('technician', 'Technician', 'Uses assigned technical features in the hub.'),
  ('student', 'Student', 'Uses the hub student features.')
) AS roles(role_key, display_name, description)
ON CONFLICT (hub_key, role_key) DO NOTHING;

INSERT INTO hub_permissions (hub_key, permission_key, label, description) VALUES
  ('workshop', 'home.view', 'View Home Page', 'Open the Workshop home page.'),
  ('workshop', 'content.manage', 'Manage Content', 'Upload worksheets, lesson notes, planners and activities.'),
  ('workshop', 'suggestions.manage', 'Manage Suggestions', 'Review Workshop activity suggestions.'),
  ('workshop', 'admin.manage', 'Manage Hub Administration', 'Assign Workshop roles to staff and students.'),
  ('food-room', 'home.view', 'View Home Page', 'Open the Food Room home page.'),
  ('food-room', 'recipes.manage', 'Manage Recipes', 'Add and edit recipes and ingredients.'),
  ('food-room', 'bookings.manage', 'Manage Bookings and Shopping', 'Manage class bookings and shopping plans.'),
  ('food-room', 'suggestions.manage', 'Manage Suggestions', 'Review recipe suggestions.'),
  ('food-room', 'admin.manage', 'Manage Hub Administration', 'Assign Food Room roles to staff and students.')
ON CONFLICT (hub_key, permission_key) DO NOTHING;

INSERT INTO hub_role_permissions (hub_role_id, hub_permission_id)
SELECT roles.id, permissions.id
FROM hub_roles roles
JOIN hub_permissions permissions ON permissions.hub_key = roles.hub_key
WHERE roles.hub_key IN ('workshop', 'food-room')
  AND (
    (roles.role_key = 'lead-teacher')
    OR (roles.role_key IN ('teacher', 'technician', 'student') AND permissions.permission_key = 'home.view')
  )
ON CONFLICT DO NOTHING;

-- Sewing Hub teachers could upload activities before hub roles existed; keep that.
INSERT INTO hub_role_permissions (hub_role_id, hub_permission_id)
SELECT roles.id, permissions.id FROM hub_roles roles
JOIN hub_permissions permissions ON permissions.hub_key = roles.hub_key AND permissions.permission_key = 'activities.upload'
WHERE roles.hub_key = 'sewing-hub' AND roles.role_key = 'teacher'
ON CONFLICT DO NOTHING;

-- Technicians in the existing hubs can open the home page.
INSERT INTO hub_role_permissions (hub_role_id, hub_permission_id)
SELECT roles.id, permissions.id
FROM hub_roles roles
JOIN hub_permissions permissions ON permissions.hub_key = roles.hub_key AND permissions.permission_key = 'home.view'
WHERE roles.role_key = 'technician' AND roles.hub_key IN ('sewing-hub', 'technology-hub')
ON CONFLICT DO NOTHING;

-- Existing Sewing Hub teacher grants carry across as hub roles (idempotent).
INSERT INTO user_hub_roles (user_id, hub_role_id, granted_by)
SELECT access.user_id, roles.id, access.granted_by
FROM sewing_hub_access access
JOIN hub_roles roles ON roles.hub_key = 'sewing-hub' AND roles.role_key = access.access_level
ON CONFLICT DO NOTHING;
