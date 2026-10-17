-- Guidance uses its original app roles; the client manages all app settings.
INSERT INTO student_app_role_map (app_id, platform_role, app_role)
SELECT apps.id, defaults.platform_role, defaults.app_role
FROM student_apps apps
CROSS JOIN (VALUES
  ('admin', 'ADMIN'),
  ('builder', 'AppBuilder'),
  ('lead-teacher', 'ADMIN')
) AS defaults(platform_role, app_role)
WHERE apps.slug = 'guidance-counsellor-app'
ON CONFLICT (app_id, platform_role) DO UPDATE SET app_role = EXCLUDED.app_role;

UPDATE student_apps
SET roles_mapped_at = COALESCE(roles_mapped_at, NOW())
WHERE slug = 'guidance-counsellor-app';
