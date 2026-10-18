const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const session = require('express-session');
const { Pool } = require('pg');
const { createAdminUsersRouter } = require('../src/adminUsers');

test('Global Control role directory and individual changes preserve primary and system roles', {
  skip: !process.env.MODULE_BUILDER_TEST_DATABASE_URL
}, async () => {
  const pool = new Pool({ connectionString: process.env.MODULE_BUILDER_TEST_DATABASE_URL, ssl: false });
  const db = await pool.connect();
  const schema = 'admin_users_' + crypto.randomBytes(8).toString('hex');
  let server;
  try {
    await db.query('CREATE SCHEMA ' + schema);
    await db.query('SET search_path TO ' + schema + ',public');
    for (const name of ['001_init.sql', '002_roles_and_module_assignments.sql', '029_global_lead_teacher.sql']) {
      await db.query(await fs.readFile(path.join(__dirname, '..', 'migrations', name), 'utf8'));
    }
    await db.query(await fs.readFile(path.join(__dirname, '..', 'migrations', '029_global_lead_teacher.sql'), 'utf8'));
    assert.equal((await db.query("SELECT id FROM roles WHERE name='Lead Teacher'")).rows.length, 1);
    await db.query(`ALTER TABLE user_roles ADD COLUMN assignment_source text NOT NULL DEFAULT 'manual';
      CREATE TABLE sewing_hub_access(user_id uuid,access_level text,granted_by uuid);
      CREATE TABLE technology_hub_access(user_id uuid,area_key text);
      CREATE TABLE staff_upload(first_name text,last_name text,email_school text,status text,code text);
      CREATE TABLE student_details_upload(first_name text,last_name text,email_school text,status text,id_number text);
      INSERT INTO staff_upload VALUES ('Fixture','Staff','staff@school.test','Current','STA'),
        ('Former','Staff','former@school.test','Former','OLD'), ('Missing','Email',NULL,'Current','NONE');
      INSERT INTO student_details_upload VALUES ('Fixture','Student','student@school.test','Current','1234');`);
    for (const name of ['007_hub_roles_and_permissions.sql', '016_hub_roles_base.sql', '018_student_apps.sql', '025_dtech_hub.sql']) {
      await db.query(await fs.readFile(path.join(__dirname, '..', 'migrations', name), 'utf8'));
    }
    const roles = Object.fromEntries((await db.query('SELECT id,name FROM roles')).rows.map(row => [row.name, row.id]));
    let user = { id: crypto.randomUUID(), email: 'admin@school.test', roles: ['ADMIN'] };
    await db.query('INSERT INTO users(id,email,display_name) VALUES ($1,$2,$3)', [user.id, user.email, 'Fixture Admin']);
    const app = express();
    app.set('view engine', 'ejs');
    app.set('views', path.join(__dirname, '..', 'views'));
    app.use(express.urlencoded({ extended: false }));
    app.use(session({ secret: 'admin-users-fixture-only', saveUninitialized: false, resave: false }));
    app.use((req, res, next) => {
      req.user = user;
      req.isAuthenticated = () => Boolean(user);
      res.locals.currentUser = user;
      res.locals.activeRole = 'ADMIN';
      next();
    });
    app.use('/admin/users', createAdminUsersRouter({ dbQuery: (...args) => db.query(...args), initDirectory: async () => {} }));
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = 'http://127.0.0.1:' + server.address().port + '/admin/users';
    let cookie;
    async function call(route = '', data) {
      const response = await fetch(base + route, {
        redirect: 'manual', method: data ? 'POST' : 'GET',
        headers: { ...(cookie ? { cookie } : {}), ...(data ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
        ...(data ? { body: new URLSearchParams(data) } : {})
      });
      if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
      return response;
    }
    let html = await (await call()).text();
    assert.match(html, /Staff List/);
    assert.match(html, /Student List/);
    assert.match(html, /Users with Additional Roles/);
    assert.match(html, /All Additional Roles Summary/);
    assert.match(html, /No additional roles or teacher module assignments are recorded/);
    assert.match(html, /<option value="[^"]+">Lead Teacher<\/option>/);
    assert.doesNotMatch(html, /name="roleIds"/);
    const csrf = /name="csrf" value="([^"]+)"/.exec(html)[1];
    assert.equal((await call('/directory?type=staff&q=fi')).status, 200);
    let directory = await (await call('/directory?type=student&q=1234')).json();
    assert.equal(directory.people[0].email, 'student@school.test');
    assert.equal((await (await call('/directory?type=staff&q=former')).json()).people.length, 0);
    assert.equal((await call('/directory?type=staff&q=x')).status, 400);
    assert.equal((await call('/directory?type=unknown&q=fixture')).status, 400);
    assert.equal((await (await call('/directory?type=staff&q=%25%25')).json()).people.length, 0);
    await db.query(`INSERT INTO staff_upload(first_name,last_name,email_school,status,code)
      SELECT 'Many',i::text,'many'||i||'@school.test','Current','M'||i FROM generate_series(1,25) i`);
    directory = await (await call('/directory?type=staff&q=many')).json();
    assert.equal(directory.people.length, 20);
    assert.equal(directory.more, true);
    assert.equal((await call('/add', { type: 'staff', email: 'staff@school.test', roleId: roles.Teacher })).status, 403);
    const add = (email = 'staff@school.test', type = 'staff', roleId = roles.Teacher) =>
      call('/add', { csrf, type, email, roleId });
    assert.equal((await add('absent@school.test')).status, 400);
    assert.equal((await add('student@school.test', 'staff')).status, 400);
    assert.equal((await add('staff@school.test', 'staff', roles.Staff)).status, 400);
    assert.equal((await add(' STAFF@SCHOOL.TEST ')).status, 302);
    const staff = (await db.query("SELECT * FROM users WHERE email='staff@school.test'")).rows[0];
    assert.equal(staff.google_id, null);
    assert.equal(staff.display_name, 'Fixture Staff');
    assert.equal((await add()).status, 302);
    assert.equal((await db.query('SELECT * FROM user_roles WHERE user_id=$1', [staff.id])).rows.length, 1);
    await db.query("INSERT INTO user_roles VALUES ($1,$2,NOW(),'kamar'),($1,$3,NOW(),'system')", [staff.id, roles.Staff, roles.ADMIN]);
    assert.equal((await add('staff@school.test', 'staff', roles.ADMIN)).status, 302);
    assert.equal((await db.query('SELECT assignment_source FROM user_roles WHERE user_id=$1 AND role_id=$2', [staff.id, roles.ADMIN])).rows[0].assignment_source, 'system');
    html = await (await call()).text();
    assert.match(html, /system-managed/);
    assert.match(html, /Remove Teacher/);
    assert.doesNotMatch(html, /Remove ADMIN/);
    assert.equal((await call('/remove', { csrf, userId: staff.id, roleId: roles.Staff })).status, 409);
    assert.equal((await call('/remove', { csrf, userId: staff.id, roleId: roles.ADMIN })).status, 409);
    assert.equal((await call('/remove', { csrf, userId: staff.id, roleId: roles.Teacher })).status, 302);
    assert.equal((await db.query('SELECT * FROM user_roles WHERE user_id=$1', [staff.id])).rows.length, 2);
    assert.equal((await call('/remove', { csrf, userId: staff.id, roleId: roles.Teacher })).status, 409);
    assert.equal((await add('student@school.test', 'student')).status, 302);
    assert.equal((await add('staff@school.test', 'staff', roles['Lead Teacher'])).status, 302);
    assert.equal((await db.query('SELECT * FROM user_roles WHERE user_id=$1 AND role_id=$2', [staff.id, roles['Lead Teacher']])).rows.length, 1);
    assert.equal((await call('/remove', { csrf, userId: staff.id, roleId: roles['Lead Teacher'] })).status, 302);
    const hubRoles = (await db.query('SELECT * FROM hub_roles')).rows;
    const dtechLead = hubRoles.find(role => role.hub_key === 'dtech-hub' && role.role_key === 'lead-teacher').id;
    const dtechStaff = hubRoles.find(role => role.hub_key === 'dtech-hub' && role.role_key === 'staff').id;
    const sewingTeacher = hubRoles.find(role => role.hub_key === 'sewing-hub' && role.role_key === 'teacher').id;
    const hubAdd = (module, roleId, email = staff.email) => call('/add', { csrf, module, type: 'staff', email, roleId });
    const hubRemove = (module, roleId) => call('/remove', { csrf, module, userId: staff.id, roleId });
    html = await (await call('?module=dtech-hub')).text();
    assert.match(html, /Lead Teacher/);
    assert.match(html, /DTECH Hub/);
    assert.match(html, /name="module" value="dtech-hub"/);
    assert.doesNotMatch(html, /<option value="[^"]+">ADMIN<\/option>/);
    assert.equal((await call('?module=unknown')).status, 400);
    assert.equal((await call('?module=dtech-hub&module=sewing-hub')).status, 400);
    assert.equal((await hubAdd('unknown', dtechLead)).status, 400);
    assert.equal((await hubAdd('dtech-hub', roles.ADMIN)).status, 400);
    assert.equal((await hubAdd('dtech-hub', sewingTeacher)).status, 400);
    assert.equal((await call('/add', { module: 'dtech-hub', type: 'staff', email: staff.email, roleId: dtechLead })).status, 403);
    let response = await hubAdd('dtech-hub', dtechLead);
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), '/admin/users?module=dtech-hub&saved=added');
    assert.equal((await hubAdd('dtech-hub', dtechLead)).status, 302);
    assert.equal((await hubAdd('dtech-hub', dtechStaff)).status, 302);
    assert.equal((await hubAdd('sewing-hub', sewingTeacher)).status, 302);
    const globalBefore = (await db.query('SELECT * FROM user_roles WHERE user_id=$1 ORDER BY role_id', [staff.id])).rows;
    assert.equal(globalBefore.length, 2);
    assert.equal((await db.query('SELECT * FROM user_hub_roles WHERE user_id=$1', [staff.id])).rows.length, 3);
    assert.equal((await db.query('SELECT granted_by FROM user_hub_roles WHERE user_id=$1 AND hub_role_id=$2', [staff.id, dtechLead])).rows[0].granted_by, user.id);
    const permission = async hub => (await db.query(`SELECT p.permission_key FROM user_hub_roles ur
      JOIN hub_roles r ON r.id=ur.hub_role_id JOIN hub_role_permissions rp ON rp.hub_role_id=r.id
      JOIN hub_permissions p ON p.id=rp.hub_permission_id WHERE ur.user_id=$1 AND r.hub_key=$2`, [staff.id, hub])).rows.map(row => row.permission_key);
    assert.ok((await permission('dtech-hub')).includes('admin.manage'));
    assert.ok(!(await permission('sewing-hub')).includes('admin.manage'));
    html = await (await call('?module=dtech-hub')).text();
    assert.match(html, /Remove Lead Teacher/);
    assert.match(html, /Remove Staff/);
    assert.doesNotMatch(html, /Remove Teacher|<small>system-managed<\/small>/);
    await db.query("INSERT INTO user_hub_roles(user_id,hub_role_id,area_key) VALUES ($1,$2,'textiles')", [staff.id, sewingTeacher]);
    await db.query(`INSERT INTO student_apps(slug,hub_key,name,app_url,secret_hash)
      VALUES ('summary-fixture','app-summary-fixture','Summary App <script>','https://fixture.invalid','fixture');
      INSERT INTO hub_roles(hub_key,role_key,display_name) VALUES ('app-summary-fixture','teacher','App Teacher <script>');
      INSERT INTO users(email,display_name) VALUES ('primary-only@school.test','Primary Only');
      INSERT INTO user_roles(user_id,role_id,assignment_source)
        SELECT u.id,r.id,'kamar' FROM users u CROSS JOIN roles r WHERE u.email='primary-only@school.test' AND r.name='Staff';`);
    await db.query(`INSERT INTO user_hub_roles(user_id,hub_role_id,granted_by)
      SELECT $1,id,$2 FROM hub_roles WHERE hub_key='app-summary-fixture'`, [staff.id, user.id]);
    await db.query(`INSERT INTO teacher_module_assignments(user_id,module_id)
      SELECT $1,id FROM modules WHERE module_key='dtech-hub'`, [staff.id]);
    const summarySection = html => /<section class="panel" id="all-additional-roles">([\s\S]*?)<\/section>/.exec(html)[1];
    const summaryBefore = summarySection(await (await call()).text());
    assert.equal(summarySection(await (await call('?module=food-room')).text()), summaryBefore);
    assert.match(summaryBefore, /ADMIN \(system-managed\)/);
    assert.match(summaryBefore, /DTECH Hub:<\/strong> Lead Teacher/);
    assert.match(summaryBefore, /DTECH Hub:<\/strong> Staff/);
    assert.match(summaryBefore, /area: textiles/);
    assert.match(summaryBefore, /Summary App &lt;script&gt;:<\/strong> App Teacher &lt;script&gt;/);
    assert.doesNotMatch(summaryBefore, /<script>|primary-only@school.test|<form|<button/);
    assert.equal((summaryBefore.match(/staff@school.test/g) || []).length, 1);
    assert.match(summaryBefore, /Teacher module assignments/);
    assert.match(summaryBefore, /<div class="user-role-assignment">DTECH Hub<\/div>/);
    assert.equal((await db.query('SELECT * FROM user_roles WHERE user_id=$1', [staff.id])).rows.length, 2);
    assert.equal((await hubRemove('dtech-hub', sewingTeacher)).status, 409);
    assert.equal((await hubRemove('global', dtechLead)).status, 409);
    assert.equal((await hubRemove('dtech-hub', dtechLead)).status, 302);
    assert.ok(!(await permission('dtech-hub')).includes('admin.manage'));
    assert.ok((await permission('dtech-hub')).includes('activities.browse'));
    assert.equal((await hubRemove('sewing-hub', sewingTeacher)).status, 302);
    assert.equal((await db.query('SELECT area_key FROM user_hub_roles WHERE user_id=$1 AND hub_role_id=$2', [staff.id, sewingTeacher])).rows[0].area_key, 'textiles');
    assert.deepEqual((await db.query('SELECT * FROM user_roles WHERE user_id=$1 ORDER BY role_id', [staff.id])).rows, globalBefore);
    // A hub grant can also prepare an account before its first Google sign-in.
    await db.query("INSERT INTO staff_upload VALUES ('New','Teacher','new@school.test','Current','NEW')");
    assert.equal((await hubAdd('dtech-hub', dtechStaff, 'new@school.test')).status, 302);
    assert.equal((await db.query("SELECT google_id FROM users WHERE email='new@school.test'")).rows[0].google_id, null);
    await db.query('UPDATE users SET is_active=false WHERE id=$1', [staff.id]);
    const finalSummary = summarySection(await (await call('?module=workshop')).text());
    assert.match(finalSummary, /Inactive account/);
    assert.doesNotMatch(finalSummary, /DTECH Hub:<\/strong> Lead Teacher/);
    assert.match(finalSummary, /DTECH Hub:<\/strong> Staff/);
    assert.equal((await add()).status, 409);
    assert.equal((await hubAdd('dtech-hub', dtechLead)).status, 409);
    user = { roles: ['Teacher'] };
    assert.equal((await call()).status, 403);
    assert.equal((await call('/directory?type=staff&q=fi')).status, 403);
    assert.equal((await add()).status, 403);
    assert.equal((await hubAdd('dtech-hub', dtechLead)).status, 403);
    assert.equal((await hubRemove('dtech-hub', dtechStaff)).status, 403);
    user = null;
    assert.equal((await call()).status, 302);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await db.query('SET search_path TO public');
    await db.query('DROP SCHEMA ' + schema + ' CASCADE');
    db.release();
    await pool.end();
  }
});
