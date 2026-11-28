-- Register the verified development project without changing existing grants.
INSERT INTO modules(module_key, display_name, description, path)
SELECT p.slug, p.name, p.description, '/relief-plan/'
FROM module_builder_projects p
JOIN module_builder_environments e ON e.project_id=p.id AND e.kind='development'
WHERE p.slug='relief-plan' AND p.stage<>'archived'
  AND rtrim(COALESCE(e.config->>'appUrl', ''), '/')='https://whs-relief-library-development.onrender.com'
ON CONFLICT(module_key) DO NOTHING;

-- Preserve customised destinations, active state and assignments.
UPDATE modules SET path='/relief-plan/'
WHERE module_key='relief-plan'
  AND rtrim(path, '/')='https://whs-relief-library-development.onrender.com';
