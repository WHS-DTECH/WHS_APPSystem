INSERT INTO modules (module_key, display_name, description, path)
VALUES ('workshop', 'Workshop', 'Original Workshop Woodwork and Furniture activity homepage.', '/workshop')
ON CONFLICT (module_key) DO UPDATE
SET display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    path = EXCLUDED.path,
    is_active = true;

INSERT INTO permissions (module_key, key, label, description)
VALUES (
  'workshop',
  'workshop.home.view',
  'View Workshop homepage',
  'Open the original Workshop Woodwork and Furniture homepage.'
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
FROM roles
CROSS JOIN permissions
WHERE roles.name IN ('Administrator', 'ADMIN')
  AND permissions.key = 'workshop.home.view'
ON CONFLICT DO NOTHING;
