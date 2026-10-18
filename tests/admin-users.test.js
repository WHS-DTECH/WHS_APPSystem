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
    for (const name of ['001_init.sql', '002_roles_and_module_assignments.sql']) {
      await db.query(await fs.readFile(path.join(__dirname, '..', 'migrations', name), 'utf8'));
    }
    await db.query(`ALTER TABLE user_roles ADD COLUMN assignment_source text NOT NULL DEFAULT 'manual';
      CREATE TABLE staff_upload(first_name text,last_name text,email_school text,status text,code text);
      CREATE TABLE student_details_upload(first_name text,last_name text,email_school text,status text,id_number text);
      INSERT INTO staff_upload VALUES ('Fixture','Staff','staff@school.test','Current','STA'),
        ('Former','Staff','former@school.test','Former','OLD'), ('Missing','Email',NULL,'Current','NONE');
      INSERT INTO student_details_upload VALUES ('Fixture','Student','student@school.test','Current','1234');`);
    const roles = Object.fromEntries((await db.query('SELECT id,name FROM roles')).rows.map(row => [row.name, row.id]));
    let user = { id: crypto.randomUUID(), email: 'admin@school.test', roles: ['ADMIN'] };
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
    assert.doesNotMatch(html, /Lead Teacher|name="roleIds"/);
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
    await db.query('UPDATE users SET is_active=false WHERE id=$1', [staff.id]);
    assert.equal((await add()).status, 409);
    user = { roles: ['Teacher'] };
    assert.equal((await call()).status, 403);
    assert.equal((await call('/directory?type=staff&q=fi')).status, 403);
    assert.equal((await add()).status, 403);
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
