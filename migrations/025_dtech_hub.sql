INSERT INTO modules (module_key, display_name, description, path)
VALUES ('dtech-hub', 'DTECH Hub', 'Original DTECH Hub connected to shared Google sign-in and Core Administration.', '/dtech-hub/')
ON CONFLICT (module_key) DO NOTHING;

INSERT INTO permissions (module_key, key, label, description)
VALUES ('dtech-hub', 'dtech-hub.view', 'Open DTECH Hub', 'Open the original DTECH Hub.')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id FROM roles CROSS JOIN permissions
WHERE roles.name = 'ADMIN' AND permissions.module_key = 'dtech-hub'
ON CONFLICT DO NOTHING;

INSERT INTO hub_roles (hub_key, role_key, display_name, description) VALUES
('dtech-hub', 'lead-teacher', 'Lead Teacher', 'Manage DTECH teaching, planning and hub administration.'),
('dtech-hub', 'teacher', 'Teacher', 'Use DTECH teaching, activity uploads and planning.'),
('dtech-hub', 'technician', 'Technician', 'Use DTECH technical and teaching views.'),
('dtech-hub', 'staff', 'Staff', 'Browse DTECH activities.'),
('dtech-hub', 'student', 'Student', 'Use DTECH student activities without elevated administration.')
ON CONFLICT (hub_key, role_key) DO NOTHING;

INSERT INTO hub_permissions (hub_key, permission_key, label, description) VALUES
('dtech-hub', 'home.view', 'View Home', 'Open the original DTECH homepage.'),
('dtech-hub', 'activities.browse', 'Browse Activities', 'Browse the DTECH activity library.'),
('dtech-hub', 'teacher.view', 'Teacher View', 'Use DTECH teacher views.'),
('dtech-hub', 'activities.upload', 'Upload Activities', 'Create and update DTECH teaching resources.'),
('dtech-hub', 'planning.manage', 'Manage Planning', 'Manage DTECH planning and allocations.'),
('dtech-hub', 'admin.manage', 'Manage DTECH Administration', 'Manage DTECH settings and assign hub roles.')
ON CONFLICT (hub_key, permission_key) DO NOTHING;

INSERT INTO hub_role_permissions (hub_role_id, hub_permission_id)
SELECT hr.id, hp.id FROM hub_roles hr JOIN hub_permissions hp ON hp.hub_key = hr.hub_key
WHERE hr.hub_key = 'dtech-hub' AND hr.role_key <> 'student-admin'
AND (hp.permission_key IN ('home.view', 'activities.browse')
 OR (hr.role_key IN ('lead-teacher', 'teacher', 'technician') AND hp.permission_key = 'teacher.view')
 OR (hr.role_key IN ('lead-teacher', 'teacher') AND hp.permission_key IN ('activities.upload', 'planning.manage'))
 OR (hr.role_key = 'lead-teacher' AND hp.permission_key = 'admin.manage'))
ON CONFLICT DO NOTHING;
