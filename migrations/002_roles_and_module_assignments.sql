INSERT INTO roles (name, description) VALUES
  ('ADMIN', 'Full access and ability to manage users, roles, permissions, and app modules.'),
  ('Teacher', 'Teacher access to modules specifically assigned by an administrator.'),
  ('Student', 'Student access to approved student modules.'),
  ('Staff', 'Staff access to approved staff modules.')
ON CONFLICT (name) DO NOTHING;

DO $$
DECLARE
  old_role_id UUID;
  new_role_id UUID;
BEGIN
  SELECT id INTO old_role_id FROM roles WHERE name = 'Administrator';
  SELECT id INTO new_role_id FROM roles WHERE name = 'ADMIN';

  IF old_role_id IS NOT NULL AND new_role_id IS NOT NULL THEN
    INSERT INTO user_roles (user_id, role_id)
    SELECT user_id, new_role_id FROM user_roles WHERE role_id = old_role_id
    ON CONFLICT DO NOTHING;
    DELETE FROM role_permissions WHERE role_id = old_role_id;
    DELETE FROM user_roles WHERE role_id = old_role_id;
    DELETE FROM roles WHERE id = old_role_id;
  END IF;
END $$;

DO $$
DECLARE
  old_role_id UUID;
  new_role_id UUID;
BEGIN
  SELECT id INTO old_role_id FROM roles WHERE name = 'Viewer';
  SELECT id INTO new_role_id FROM roles WHERE name = 'Staff';

  IF old_role_id IS NOT NULL AND new_role_id IS NOT NULL THEN
    INSERT INTO user_roles (user_id, role_id)
    SELECT user_id, new_role_id FROM user_roles WHERE role_id = old_role_id
    ON CONFLICT DO NOTHING;
    DELETE FROM role_permissions WHERE role_id = old_role_id;
    DELETE FROM user_roles WHERE role_id = old_role_id;
    DELETE FROM roles WHERE id = old_role_id;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS teacher_module_assignments (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module_id UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, module_id)
);

CREATE TABLE IF NOT EXISTS role_modules (
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  module_id UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (role_id, module_id)
);

INSERT INTO role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
FROM roles
CROSS JOIN permissions
WHERE roles.name = 'ADMIN'
ON CONFLICT DO NOTHING;
