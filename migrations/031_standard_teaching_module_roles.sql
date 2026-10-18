CREATE OR REPLACE FUNCTION seed_teaching_module_roles(module_key text) RETURNS void AS $$
DECLARE
  app_hub_key text;
BEGIN
  SELECT a.hub_key INTO app_hub_key FROM student_apps a
  WHERE module_key=a.hub_key OR module_key='student-app-'||a.slug LIMIT 1;
  IF FOUND THEN module_key := app_hub_key; END IF;
  IF module_key IN ('core','kamar-uploader','module-builder') THEN RETURN; END IF;
  INSERT INTO hub_roles(hub_key,role_key,display_name,description)
  SELECT module_key,r.key,r.name,r.description FROM (VALUES
    ('lead-teacher','Lead Teacher','Administer this module only. Private user records remain private.'),
    ('teacher','Teacher','Use the teaching features in this module.'),
    ('technician','Technician','Same access as Teacher for now.')
  ) r(key,name,description)
  ON CONFLICT(hub_key,role_key) DO NOTHING;
  UPDATE hub_roles SET description='Same access as Teacher for now.'
  WHERE hub_key=module_key AND role_key='technician';
  INSERT INTO hub_permissions(hub_key,permission_key,label)
  SELECT module_key,p.key,p.label FROM (VALUES
    ('home.view','View module'),('teacher.view','Use teacher features'),('admin.manage','Manage this module')
  ) p(key,label) ON CONFLICT(hub_key,permission_key) DO NOTHING;
  INSERT INTO hub_role_permissions(hub_role_id,hub_permission_id)
  SELECT r.id,p.id FROM hub_roles r JOIN hub_permissions p ON p.hub_key=r.hub_key
  WHERE r.hub_key=module_key AND
    (r.role_key='lead-teacher' OR (r.role_key='teacher' AND p.permission_key IN ('home.view','teacher.view')))
  ON CONFLICT DO NOTHING;
  DELETE FROM hub_role_permissions rp USING hub_roles r
  WHERE rp.hub_role_id=r.id AND r.hub_key=module_key AND r.role_key='technician';
  INSERT INTO hub_role_permissions(hub_role_id,hub_permission_id)
  SELECT technician.id,rp.hub_permission_id FROM hub_roles teacher
  JOIN hub_role_permissions rp ON rp.hub_role_id=teacher.id
  JOIN hub_roles technician ON technician.hub_key=teacher.hub_key AND technician.role_key='technician'
  WHERE teacher.hub_key=module_key AND teacher.role_key='teacher'
  ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql;

SELECT seed_teaching_module_roles(key) FROM (
  SELECT module_key AS key FROM modules
  UNION SELECT hub_key FROM student_apps
  UNION SELECT slug FROM module_builder_projects
  UNION SELECT hub_key FROM hub_roles
) registered;

INSERT INTO student_app_role_map(app_id,platform_role,app_role)
SELECT id,'teacher','Counsellor' FROM student_apps WHERE slug='guidance-counsellor-app'
ON CONFLICT(app_id,platform_role) DO NOTHING;
INSERT INTO student_app_role_map(app_id,platform_role,app_role)
SELECT app_id,'technician',app_role FROM student_app_role_map WHERE platform_role='teacher'
ON CONFLICT(app_id,platform_role) DO UPDATE SET app_role=EXCLUDED.app_role;

-- Keep Technician permissions equal to Teacher, including later permission edits.
CREATE OR REPLACE FUNCTION mirror_teacher_module_permissions() RETURNS trigger AS $$
DECLARE
  changed_role hub_roles%ROWTYPE;
BEGIN
  IF pg_trigger_depth()>1 THEN RETURN NULL; END IF;
  SELECT * INTO changed_role FROM hub_roles WHERE id=COALESCE(NEW.hub_role_id,OLD.hub_role_id);
  IF changed_role.role_key NOT IN ('teacher','technician') OR
    changed_role.hub_key IN ('core','kamar-uploader','module-builder') THEN RETURN NULL; END IF;
  DELETE FROM hub_role_permissions rp USING hub_roles r
  WHERE r.id=rp.hub_role_id AND r.hub_key=changed_role.hub_key AND r.role_key='technician';
  INSERT INTO hub_role_permissions(hub_role_id,hub_permission_id)
  SELECT technician.id,rp.hub_permission_id FROM hub_roles teacher
  JOIN hub_role_permissions rp ON rp.hub_role_id=teacher.id
  JOIN hub_roles technician ON technician.hub_key=teacher.hub_key AND technician.role_key='technician'
  WHERE teacher.hub_key=changed_role.hub_key AND teacher.role_key='teacher'
  ON CONFLICT DO NOTHING;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS mirror_teacher_module_permissions_trigger ON hub_role_permissions;
CREATE TRIGGER mirror_teacher_module_permissions_trigger AFTER INSERT OR UPDATE OR DELETE ON hub_role_permissions
FOR EACH ROW EXECUTE FUNCTION mirror_teacher_module_permissions();

CREATE OR REPLACE FUNCTION seed_registered_teaching_module() RETURNS trigger AS $$
BEGIN
  IF TG_TABLE_NAME='modules' THEN PERFORM seed_teaching_module_roles(NEW.module_key);
  ELSIF TG_TABLE_NAME='student_apps' THEN PERFORM seed_teaching_module_roles(NEW.hub_key);
  ELSE PERFORM seed_teaching_module_roles(NEW.slug);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS seed_registered_teaching_roles ON modules;
CREATE TRIGGER seed_registered_teaching_roles AFTER INSERT ON modules FOR EACH ROW EXECUTE FUNCTION seed_registered_teaching_module();
DROP TRIGGER IF EXISTS seed_registered_teaching_roles ON student_apps;
CREATE TRIGGER seed_registered_teaching_roles AFTER INSERT ON student_apps FOR EACH ROW EXECUTE FUNCTION seed_registered_teaching_module();
DROP TRIGGER IF EXISTS seed_registered_teaching_roles ON module_builder_projects;
CREATE TRIGGER seed_registered_teaching_roles AFTER INSERT ON module_builder_projects FOR EACH ROW EXECUTE FUNCTION seed_registered_teaching_module();
