-- Bus Controller testers can open the Westland routes page to explore it without becoming a Lead Teacher.
INSERT INTO hub_roles(hub_key,role_key,display_name,description)
SELECT hub_key,'tester','Tester','Explore the Bus Controller staff pages for testing. Does not grant Lead Teacher access.'
FROM hub_roles WHERE hub_key='bus-controller-app' AND role_key='lead-teacher'
ON CONFLICT(hub_key,role_key) DO NOTHING;

INSERT INTO hub_role_permissions(hub_role_id,hub_permission_id)
SELECT r.id,p.id FROM hub_roles r JOIN hub_permissions p ON p.hub_key=r.hub_key AND p.permission_key='home.view'
WHERE r.hub_key='bus-controller-app' AND r.role_key='tester'
ON CONFLICT DO NOTHING;
