-- Register the existing destination without switching to the unverified embedded service.
INSERT INTO modules(module_key, display_name, description, path)
SELECT p.slug, p.name, p.description, e.config->>'appUrl'
FROM module_builder_projects p
JOIN module_builder_environments e ON e.project_id=p.id AND e.kind='development'
WHERE p.slug='whs-assessment-manager' AND p.stage<>'archived'
  AND COALESCE(e.config->>'appUrl', '')<>''
ON CONFLICT(module_key) DO NOTHING;
