CREATE TABLE IF NOT EXISTS technology_hub_access (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  area_key TEXT NOT NULL CHECK (area_key IN ('digital-technologies', 'food-hospitality', 'textiles', 'woodwork-furniture')),
  granted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, area_key)
);

INSERT INTO modules (module_key, display_name, description, path)
VALUES ('technology-hub', 'Technology Hub', 'Public Technology Hub homepage with assigned student and teacher discipline access.', '/technology-hub')
ON CONFLICT (module_key) DO NOTHING;

INSERT INTO permissions (module_key, key, label, description) VALUES
  ('technology-hub', 'technology-hub.home.view', 'View Technology Hub homepage', 'Open the public Technology Hub homepage.'),
  ('technology-hub', 'technology-hub.area.view', 'View assigned Technology Hub area', 'Open an assigned discipline page.'),
  ('technology-hub', 'technology-hub.assign', 'Assign Technology Hub areas', 'Assign individual users to Technology Hub discipline pages.')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
FROM roles
CROSS JOIN permissions
WHERE roles.name = 'ADMIN' AND permissions.module_key = 'technology-hub'
ON CONFLICT DO NOTHING;