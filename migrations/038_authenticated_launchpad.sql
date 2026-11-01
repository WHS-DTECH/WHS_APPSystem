-- Preserve existing destinations and business databases. These are registry entries only.
INSERT INTO modules(module_key,display_name,description,path)
SELECT p.slug,p.name,p.description,e.config->>'appUrl'
FROM module_builder_projects p JOIN module_builder_environments e ON e.project_id=p.id AND e.kind='development'
WHERE p.slug IN ('teacher-planner','bus-controller-app','international-app')
  AND p.stage<>'archived' AND COALESCE(e.config->>'appUrl','')<>''
ON CONFLICT(module_key) DO NOTHING;

ALTER TABLE launchpad_links ADD COLUMN module_key TEXT REFERENCES modules(module_key) ON DELETE SET NULL;

UPDATE launchpad_links l SET module_key=m.module_key
FROM modules m
WHERE rtrim(l.url,'/')=rtrim(m.path,'/') OR
  (l.url='https://whs-appsystem.onrender.com/learning-sites' AND m.module_key='learning-sites') OR
  (l.url='https://whs-appsystem.onrender.com/technology-hub/' AND m.module_key='technology-hub') OR
  (l.url='https://whs-appsystem.onrender.com/apps/guidance-counsellor-app/' AND
    (m.module_key='app-guidance-counsellor-app' OR m.module_key='student-app-guidance-counsellor-app'));

-- Unmapped custom cards are preserved as drafts until an administrator binds a module.
UPDATE launchpad_links SET is_visible=false WHERE module_key IS NULL;

-- Keep custom duplicate records as drafts rather than deleting administrator edits.
UPDATE launchpad_links SET module_key=NULL,is_visible=false WHERE id IN (
  SELECT id FROM (
    SELECT id,row_number() OVER (PARTITION BY module_key ORDER BY sort_order,title,id) AS position
    FROM launchpad_links WHERE module_key IS NOT NULL
  ) duplicates WHERE position>1
);
CREATE UNIQUE INDEX launchpad_module_card ON launchpad_links(module_key) WHERE module_key IS NOT NULL;
