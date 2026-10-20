INSERT INTO module_builder_projects (slug, name, description, mount_path, deployment_type, stage)
VALUES
  ('international-app', 'International App',
   'Existing independently hosted app. Registry entry only; source, sign-in and database are unchanged.',
   '/international-app/', 'independent', 'development'),
  ('bus-controller-app', 'Bus Controller App',
   'Existing independently hosted app. Registry entry only; source, sign-in and database are unchanged.',
   '/bus-controller-app/', 'independent', 'development')
ON CONFLICT (slug) DO NOTHING;

UPDATE module_builder_environments environment
SET config = environment.config || jsonb_build_object('appUrl', registered.app_url)
FROM module_builder_projects project,
  (VALUES
    ('international-app', 'https://whs-international.onrender.com'),
    ('bus-controller-app', 'https://whs-buscontroller.onrender.com')
  ) AS registered(slug, app_url)
WHERE environment.project_id = project.id
  AND environment.kind = 'development'
  AND project.slug = registered.slug
  AND COALESCE(environment.config->>'appUrl', '') = '';
