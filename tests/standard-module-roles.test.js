const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const express = require('express');
const session = require('express-session');
const { Pool } = require('pg');

test('standard module roles preserve assignments, mirror Teacher, and isolate module administration', {
  skip: !process.env.MODULE_BUILDER_TEST_DATABASE_URL
}, async (t) => {
  const pool = new Pool({ connectionString: process.env.MODULE_BUILDER_TEST_DATABASE_URL, ssl: false });
  const db = await pool.connect();
  const schema = 'standard_roles_' + crypto.randomBytes(8).toString('hex');
  let server;
  try {
    await db.query('CREATE SCHEMA ' + schema);
    await db.query('SET search_path TO ' + schema + ',public');
    for (const name of ['001_init.sql', '002_roles_and_module_assignments.sql']) {
      await db.query(await fs.readFile(path.join(__dirname, '..', 'migrations', name), 'utf8'));
    }
    await db.query(`CREATE TABLE sewing_hub_access(user_id uuid,access_level text,granted_by uuid);
      CREATE TABLE technology_hub_access(user_id uuid,area_key text);
      CREATE TABLE staff_upload(email_school text,status text);
      CREATE TABLE student_details_upload(email_school text,status text);
      CREATE TABLE user_additional_roles(email text,role_name text,user_type text,app_synced boolean,
        UNIQUE(email,role_name))`);
    for (const name of ['007_hub_roles_and_permissions.sql', '016_hub_roles_base.sql', '018_student_apps.sql',
      '025_dtech_hub.sql', '026_module_builder.sql', '030_teacher_planner_roles.sql']) {
      await db.query(await fs.readFile(path.join(__dirname, '..', 'migrations', name), 'utf8'));
    }
    const account = (await db.query("INSERT INTO users(email,display_name) VALUES ('staff@fixture.test','Module Fixture') RETURNING *")).rows[0];
    await db.query(`INSERT INTO user_hub_roles(user_id,hub_role_id,area_key)
      SELECT $1,id,'textiles' FROM hub_roles WHERE hub_key='technology-hub' AND role_key='teacher'`, [account.id]);
    const before = (await db.query('SELECT * FROM user_hub_roles ORDER BY user_id,hub_role_id,area_key')).rows;
    const migration = await fs.readFile(path.join(__dirname, '..', 'migrations', '031_standard_teaching_module_roles.sql'), 'utf8');
    await db.query(migration);
    await db.query(migration);
    assert.deepEqual((await db.query('SELECT * FROM user_hub_roles ORDER BY user_id,hub_role_id,area_key')).rows, before);
    const rolesFor = async key => (await db.query('SELECT role_key FROM hub_roles WHERE hub_key=$1 ORDER BY role_key', [key])).rows.map(row => row.role_key);
    const permissionsFor = async (key, role) => (await db.query(`SELECT p.permission_key
      FROM hub_roles r JOIN hub_role_permissions rp ON rp.hub_role_id=r.id
      JOIN hub_permissions p ON p.id=rp.hub_permission_id
      WHERE r.hub_key=$1 AND r.role_key=$2 ORDER BY p.permission_key`, [key, role])).rows.map(row => row.permission_key);
    const registered = (await db.query(`SELECT module_key AS key FROM modules
      UNION SELECT hub_key FROM student_apps UNION SELECT slug FROM module_builder_projects UNION SELECT hub_key FROM hub_roles`)).rows;
    for (const { key } of registered) {
      if (['core', 'kamar-uploader', 'module-builder'].includes(key)) continue;
      const keys = await rolesFor(key);
      for (const role of ['lead-teacher', 'teacher', 'technician']) assert.ok(keys.includes(role), key + ':' + role);
      assert.deepEqual(await permissionsFor(key, 'technician'), await permissionsFor(key, 'teacher'), key);
      assert.ok((await permissionsFor(key, 'lead-teacher')).includes('admin.manage'), key);
    }
    assert.ok((await rolesFor('dtech-hub')).includes('student'), 'existing extra roles remain');
    for (const key of ['core', 'kamar-uploader', 'module-builder']) assert.deepEqual(await rolesFor(key), []);
    await db.query(`INSERT INTO modules(module_key,display_name) VALUES
      ('core','Core Administration'),('kamar-uploader','KAMAR Uploader'),('module-builder','Module Builder')
      ON CONFLICT(module_key) DO NOTHING`);
    for (const key of ['core', 'kamar-uploader', 'module-builder']) assert.deepEqual(await rolesFor(key), []);
    await db.query(`INSERT INTO modules(module_key,display_name) VALUES ('learning-sites','WHS Learning Sites'),('future-module','Future Module');
      INSERT INTO student_apps(slug,name,hub_key,app_url,secret_hash) VALUES ('future-app','Future App','app-future','https://example.test','fixture');
      INSERT INTO modules(module_key,display_name,path) VALUES ('student-app-future-app','Future App','/student-apps/future-app/open');
      INSERT INTO module_builder_projects(slug,name,mount_path) VALUES ('future-project','Future Project','/future-project/')`);
    for (const key of ['learning-sites', 'future-module', 'app-future', 'future-project']) {
      assert.deepEqual(await rolesFor(key), ['lead-teacher', 'teacher', 'technician']);
    }
    assert.deepEqual(await rolesFor('student-app-future-app'), [], 'app aliases share their existing app hub roles');
    await db.query(`INSERT INTO hub_permissions(hub_key,permission_key,label) VALUES ('future-module','custom.write','Custom write');
      INSERT INTO hub_role_permissions(hub_role_id,hub_permission_id)
        SELECT r.id,p.id FROM hub_roles r JOIN hub_permissions p ON p.hub_key=r.hub_key
        WHERE r.hub_key='future-module' AND r.role_key='teacher' AND p.permission_key='custom.write'`);
    assert.deepEqual(await permissionsFor('future-module', 'technician'), await permissionsFor('future-module', 'teacher'));
    await db.query(`DELETE FROM hub_role_permissions WHERE hub_role_id IN
      (SELECT id FROM hub_roles WHERE hub_key='future-module' AND role_key='technician')`);
    assert.deepEqual(await permissionsFor('future-module', 'technician'), await permissionsFor('future-module', 'teacher'));
    await db.query(`DELETE FROM hub_role_permissions WHERE hub_role_id IN
      (SELECT id FROM hub_roles WHERE hub_key='future-module' AND role_key='teacher')`);
    assert.deepEqual(await permissionsFor('future-module', 'technician'), []);
    await db.query(`INSERT INTO hub_role_permissions(hub_role_id,hub_permission_id)
      SELECT r.id,p.id FROM hub_roles r JOIN hub_permissions p ON p.hub_key=r.hub_key
      WHERE r.hub_key='future-module' AND r.role_key='technician'`);
    assert.deepEqual(await permissionsFor('future-module', 'technician'), []);

    const appDb = require('../src/db');
    t.mock.method(appDb, 'query', (...args) => db.query(...args));
    t.mock.method(appDb.pool, 'query', (...args) => db.query(...args));
    const hubs = require('../src/hubRoles');
    const learning = require('../src/modules/learningSites');
    const sewing = require('../src/legacy/sewing-hub/routes');
    const workshop = require('../src/legacy/workshop/routes');
    const foodPool = require('../src/legacy/food-room/db');
    t.mock.method(foodPool, 'connect', async () => ({ query: (...args) => db.query(...args), release() {} }));
    const food = require('../src/legacy/food-room/middleware/requireAdmin');
    const { searchableAreas } = require('../src/modules/technologyHub');
    const user = { ...account, roles: [], display_name: 'Module Fixture' };
    assert.equal(await hubs.userHasHubPermission(user, 'technology-hub', 'teacher.view'), false, 'area roles are not hub-wide');
    assert.deepEqual((await searchableAreas(user)).map(area => area.key), ['textiles']);
    const grant = async (key, role) => db.query(`INSERT INTO user_hub_roles(user_id,hub_role_id)
      SELECT $1,id FROM hub_roles WHERE hub_key=$2 AND role_key=$3 ON CONFLICT DO NOTHING`, [user.id, key, role]);
    await grant('teacher-planner', 'lead-teacher');
    await db.query(`INSERT INTO hub_roles(hub_key,role_key,display_name) VALUES ('core','lead-teacher','Stray system module role');
      INSERT INTO user_hub_roles(user_id,hub_role_id)
      SELECT '${user.id}',id FROM hub_roles WHERE hub_key='core'`);
    assert.equal(await hubs.canManageHubRoles(user, 'teacher-planner'), true);
    assert.equal(await hubs.canManageHubRoles(user, 'learning-sites'), false);
    assert.equal(await hubs.canManageHubRoles(user, 'core'), false);
    assert.equal(await hubs.canManageHubRoles({ ...user, is_active: false }, 'teacher-planner'), false);
    const app = express();
    app.set('view engine', 'ejs');
    app.set('views', path.join(__dirname, '..', 'views'));
    app.use(express.urlencoded({ extended: false }));
    app.use(session({ secret: 'standard-roles-fixture', saveUninitialized: false, resave: false }));
    app.use((req, res, next) => {
      req.user = user; req.isAuthenticated = () => true;
      Object.assign(res.locals, { currentUser: user, activeRole: 'Teacher', isAdmin: false });
      next();
    });
    app.use('/hubs', hubs.router);
    app.use('/', learning.pagesRouter);
    app.use('/api', learning.apiRouter);
    app.use('/workshop', workshop);
    app.get('/food-session', food.attachAuthUser, (req, res) => res.json({ admin: req.foodRoomAdmin }));
    app.use((error, req, res, next) => { console.error(error); res.status(500).send('Fixture request failed'); });
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = 'http://127.0.0.1:' + server.address().port;
    let cookie;
    const call = async (route, data) => {
      const response = await fetch(base + route, { redirect: 'manual',
        method: data ? 'POST' : 'GET', headers: { ...(cookie ? { cookie } : {}),
          ...(data ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
        ...(data ? { body: new URLSearchParams(data) } : {}) });
      if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
      return response;
    };
    let html = await (await call('/hubs')).text();
    assert.match(html, /teacher-planner\/roles/);
    assert.doesNotMatch(html, /hubs\/core\/roles|learning-sites\/roles/);
    html = await (await call('/hubs/teacher-planner/roles')).text();
    const csrf = /name="csrf" value="([^"]+)"/.exec(html)[1];
    assert.match(html, /Technician has the same permissions as Teacher/);
    assert.match(html, /checked disabled/);
    assert.equal((await call('/hubs/learning-sites/roles')).status, 403);
    assert.equal((await call('/ADMIN/')).status, 403);
    assert.equal((await call('/ReleverPlan/')).status, 403);
    assert.equal((await call('/hubs/teacher-planner/roles/' + user.id, {})).status, 403);
    assert.equal((await call('/hubs/teacher-planner/roles/' + user.id, { csrf })).status, 302);
    assert.equal(await hubs.canManageHubRoles(user, 'teacher-planner'), true, 'module leads cannot remove their protected Lead assignment');
    for (const role of ['teacher', 'technician', 'lead-teacher']) {
      await db.query("DELETE FROM user_hub_roles WHERE user_id=$1 AND area_key IS NULL", [user.id]);
      for (const key of ['learning-sites', 'sewing-hub', 'workshop', 'food-room']) await grant(key, role);
      assert.equal((await call('/ADMIN/')).status, role === 'lead-teacher' ? 200 : 403);
      assert.equal((await call('/ReleverPlan/')).status, 200);
      assert.equal((await (await call('/api/admin/session')).json()).authenticated, role === 'lead-teacher');
      assert.equal(await sewing.userCanUploadActivity(user), true);
      assert.equal(await sewing.userCanViewTeacherCard(user), true);
      const localRoles = (await (await call('/workshop/api/my-roles')).json()).map(row => row.role);
      assert.equal(localRoles.includes('Admin'), role === 'lead-teacher');
      assert.equal(localRoles.includes('Teacher'), role !== 'lead-teacher');
      const localFood = await (await call('/food-session')).json();
      assert.equal(localFood.admin, role === 'lead-teacher');
      const foodRoles = (await db.query('SELECT role_name FROM user_additional_roles WHERE email=$1', [user.email])).rows.map(row => row.role_name);
      assert.equal(foodRoles.includes('admin'), role === 'lead-teacher');
      assert.equal(foodRoles.includes('teacher'), role !== 'lead-teacher');
      assert.equal((await db.query('SELECT * FROM user_roles WHERE user_id=$1', [user.id])).rowCount, 0);
      assert.deepEqual(user.roles, []);
    }
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await db.query('SET search_path TO public');
    await db.query('DROP SCHEMA ' + schema + ' CASCADE');
    db.release();
    await pool.end();
  }
});
