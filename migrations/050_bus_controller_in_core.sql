-- Bus Controller now runs inside Global Control at /bus-controller/.
-- A full address keeps its public parent map outside the module access guard and keeps it under In Development.
UPDATE module_builder_environments environment
SET config = environment.config || jsonb_build_object('appUrl', 'https://whs-appsystem.onrender.com/bus-controller/')
FROM module_builder_projects project
WHERE environment.project_id = project.id
  AND environment.kind = 'development'
  AND project.slug = 'bus-controller-app'
  AND rtrim(COALESCE(environment.config->>'appUrl', ''), '/') = 'https://whs-buscontroller.onrender.com';

UPDATE modules SET path = 'https://whs-appsystem.onrender.com/bus-controller/'
WHERE module_key = 'bus-controller-app'
  AND rtrim(path, '/') = 'https://whs-buscontroller.onrender.com';

UPDATE launchpad_links SET url = 'https://whs-appsystem.onrender.com/bus-controller/'
WHERE rtrim(url, '/') = 'https://whs-buscontroller.onrender.com';
