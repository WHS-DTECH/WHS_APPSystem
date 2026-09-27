INSERT INTO modules (module_key, display_name, description, path)
VALUES ('food-room', 'Food Room Hub', 'Original Food Room recipe, ingredients, and practical learning homepage.', '/food-room')
ON CONFLICT (module_key) DO UPDATE
SET display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    path = EXCLUDED.path,
    is_active = true;

INSERT INTO permissions (module_key, key, label, description)
VALUES (
  'food-room',
  'food-room.home.view',
  'View Food Room Hub homepage',
  'Open the original Food Room recipe and practical learning homepage.'
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
FROM roles
CROSS JOIN permissions
WHERE roles.name IN ('Administrator', 'ADMIN')
  AND permissions.key = 'food-room.home.view'
ON CONFLICT DO NOTHING;
