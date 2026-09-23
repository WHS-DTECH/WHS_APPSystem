INSERT INTO modules (module_key, display_name, description, path)
VALUES ('learning-sites', 'WHS Learning Sites', 'Public learning content with protected Relief Planning and administration.', '/learning-sites')
ON CONFLICT (module_key) DO NOTHING;

INSERT INTO permissions (module_key, key, label, description) VALUES
  ('learning-sites', 'learning-sites.public.view', 'View Learning Sites', 'Open public learning site content.'),
  ('learning-sites', 'learning-sites.relief.view', 'View Relief Planning', 'Open Relief Planning as a Teacher or ADMIN.'),
  ('learning-sites', 'learning-sites.admin', 'Manage Learning Sites', 'Manage protected Learning Site administration tools.')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
FROM roles
CROSS JOIN permissions
WHERE roles.name = 'ADMIN' AND permissions.module_key = 'learning-sites'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
FROM roles
CROSS JOIN permissions
WHERE roles.name = 'Teacher' AND permissions.key = 'learning-sites.relief.view'
ON CONFLICT DO NOTHING;
