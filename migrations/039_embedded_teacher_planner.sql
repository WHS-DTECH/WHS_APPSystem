-- Registry cutover only. The original Planner database and standalone callback remain unchanged.
INSERT INTO modules(module_key,display_name,description,path)
VALUES ('teacher-planner','Teacher Planner','Your private teaching, reflection and professional learning space.','/teacher-planner/')
ON CONFLICT(module_key) DO UPDATE SET path=EXCLUDED.path;

UPDATE launchpad_links SET url='/teacher-planner/' WHERE module_key='teacher-planner';
