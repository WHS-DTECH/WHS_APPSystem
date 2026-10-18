INSERT INTO hub_roles(hub_key,role_key,display_name,description)
VALUES ('teacher-planner','teacher','Teacher','Use your private Teacher Planner. Does not grant school-wide settings or access to anyone else''s planner.')
ON CONFLICT (hub_key,role_key) DO NOTHING;
