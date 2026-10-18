const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const session = require('express-session');
const { Pool } = require('pg');
const { createAdminUsersRouter } = require('../src/adminUsers');

test('module invitations require a Tech-only test and one-use confirmed delivery to the user with signed-in CC', {
  skip: !process.env.MODULE_BUILDER_TEST_DATABASE_URL
}, async () => {
  const pool = new Pool({ connectionString: process.env.MODULE_BUILDER_TEST_DATABASE_URL, ssl: false });
  const db = await pool.connect();
  const schema = 'invites_' + crypto.randomBytes(8).toString('hex');
  let server;
  try {
    await db.query('CREATE SCHEMA ' + schema);
    await db.query('SET search_path TO ' + schema + ',public');
    for (const name of ['001_init.sql', '002_roles_and_module_assignments.sql']) {
      await db.query(await fs.readFile(path.join(__dirname, '..', 'migrations', name), 'utf8'));
    }
    await db.query(`ALTER TABLE user_roles ADD COLUMN assignment_source text NOT NULL DEFAULT 'manual';
      CREATE TABLE sewing_hub_access(user_id uuid,access_level text,granted_by uuid);
      CREATE TABLE technology_hub_access(user_id uuid,area_key text);
      CREATE TABLE staff_upload(first_name text,last_name text,email_school text,status text,code text);
      CREATE TABLE student_details_upload(first_name text,last_name text,email_school text,status text,id_number text);
      INSERT INTO staff_upload VALUES ('Ema','Fixture','ema@fixture.test','Current','EMA')`);
    for (const name of ['007_hub_roles_and_permissions.sql', '016_hub_roles_base.sql', '018_student_apps.sql',
      '019_student_app_client.sql', '020_student_app_url_optional.sql', '021_student_app_status.sql',
      '022_student_app_default_roles.sql', '025_dtech_hub.sql', '026_module_builder.sql',
      '030_teacher_planner_roles.sql', '031_standard_teaching_module_roles.sql', '032_module_invitations.sql']) {
      await db.query(await fs.readFile(path.join(__dirname, '..', 'migrations', name), 'utf8'));
    }
    await db.query(await fs.readFile(path.join(__dirname, '..', 'migrations', '032_module_invitations.sql'), 'utf8'));
    const accounts = (await db.query(`INSERT INTO users(email,display_name) VALUES
      ('admin@fixture.test','Admin Fixture'),('other-admin@fixture.test','Other Admin'),
      ('ema@fixture.test','Ema Fixture') RETURNING *`)).rows;
    const admin = { ...accounts[0], roles: ['ADMIN'] };
    const other = { ...accounts[1], roles: ['ADMIN'] };
    const target = accounts[2];
    let user = admin;
    const grant = async (module, role = 'teacher') => db.query(`INSERT INTO user_hub_roles(user_id,hub_role_id)
      SELECT $1,id FROM hub_roles WHERE hub_key=$2 AND role_key=$3 ON CONFLICT DO NOTHING`, [target.id, module, role]);
    await grant('teacher-planner');
    await db.query(`UPDATE module_builder_environments SET config=config||'{"appUrl":"https://planner-fixture.onrender.com/"}'
      WHERE project_id=(SELECT id FROM module_builder_projects WHERE slug='teacher-planner') AND kind='development';
      INSERT INTO modules(module_key,display_name,path) VALUES ('learning-sites','WHS Learning Sites','/learning-sites/')`);
    const calls = [];
    let result = { ok: true, messageId: 'fixture-mail-id' };
    let throws = false;
    const mail = async input => {
      calls.push(input);
      if (throws) throw new Error('Fixture delivery disconnected');
      return result;
    };
    const app = express();
    app.set('view engine', 'ejs');
    app.set('views', path.join(__dirname, '..', 'views'));
    app.use(express.urlencoded({ extended: false }));
    app.use(session({ secret: 'invites-fixture-only', resave: false, saveUninitialized: false }));
    app.use((req, res, next) => {
      req.user = user; req.isAuthenticated = () => Boolean(user);
      Object.assign(res.locals, { currentUser: user, activeRole: 'ADMIN', isAdmin: user?.roles.includes('ADMIN') });
      next();
    });
    app.use('/admin/users', createAdminUsersRouter({
      dbQuery: (...args) => db.query(...args), initDirectory: async () => {},
      mail, baseUrl: 'https://core.fixture.test'
    }));
    app.use((error, req, res, next) => { console.error(error); res.status(500).send('Invitation fixture failed'); });
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = 'http://127.0.0.1:' + server.address().port;
    let cookie;
    const call = async (route, data) => {
      const response = await fetch(base + route, {
        redirect: 'manual', method: data ? 'POST' : 'GET',
        headers: { ...(cookie ? { cookie } : {}), ...(data ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
        ...(data ? { body: new URLSearchParams(data) } : {})
      });
      if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
      return response;
    };
    let html = await (await call('/admin/users?module=teacher-planner')).text();
    const csrf = /name="csrf" value="([^"]+)"/.exec(html)[1];
    assert.match(html, /Send Module Invite to ema@fixture.test/);
    assert.equal(calls.length, 0);
    html = await (await call('/admin/users')).text();
    assert.doesNotMatch(html, /class="user-role-invite"/);
    const create = async (module = 'teacher-planner') => {
      const response = await call('/admin/users/invites', { csrf, module, userId: target.id,
        to: 'forged@fixture.test', cc: 'forged-cc@fixture.test', subject: 'Forged subject' });
      assert.equal(response.status, 302, await response.clone().text());
      return response.headers.get('location');
    };
    let draft = await create();
    assert.equal(calls.length, 0, 'preparing does not send');
    html = await (await call(draft)).text();
    assert.match(html, /Kia ora Ema,/);
    assert.match(html, /Teacher Planner — Your invitation to get started/);
    assert.match(html, /year and term overviews, weekly planning/);
    assert.match(html, /https:\/\/planner-fixture.onrender.com\//);
    assert.match(html, /Send Test Email to Tech/);
    assert.doesNotMatch(html, /type="submit">Confirm and Send/);
    assert.equal((await call(draft + '/confirm', { csrf, confirm: 'send' })).status, 409);
    assert.equal((await call(draft + '/test', { csrf: 'wrong' })).status, 403);
    assert.equal(calls.length, 0);
    assert.equal((await call(draft + '/test', { csrf, to: target.email, cc: admin.email })).status, 302);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].to, 'tech@westlandhigh.school.nz');
    assert.deepEqual(calls[0].cc, []);
    assert.equal(calls[0].bcc, undefined);
    assert.match(calls[0].subject, /^\[TEST\] Teacher Planner/);
    assert.match(calls[0].text, /Intended To: ema@fixture.test\nIntended CC: admin@fixture.test/);
    const { subject, text, html: emailHtml } = (await db.query('SELECT snapshot FROM module_invitations WHERE id=$1', [draft.split('/').pop()])).rows[0].snapshot;
    assert.match(emailHtml, /href="mailto:tech@westlandhigh.school.nz"/);
    html = await (await call(draft)).text();
    assert.match(html, /Confirm and Send Module Invite/);
    assert.equal((await call(draft + '/confirm', { csrf })).status, 400);
    const confirmations = await Promise.all([
      call(draft + '/confirm', { csrf, confirm: 'send', to: 'forged@fixture.test', cc: 'forged@fixture.test' }),
      call(draft + '/confirm', { csrf, confirm: 'send' })
    ]);
    assert.deepEqual(confirmations.map(response => response.status).sort(), [302, 409]);
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[1], { to: target.email, cc: [admin.email], subject, text, html: emailHtml });
    html = await (await call(draft)).text();
    assert.match(html, /Invitation sent/);
    assert.doesNotMatch(html, /type="submit"/);
    assert.equal((await call(draft + '/test', { csrf })).status, 409);
    assert.equal((await call(draft + '/confirm', { csrf, confirm: 'send' })).status, 409);
    assert.equal(calls.length, 2);

    for (const account of [null, { ...admin, roles: ['Teacher'] }, { ...admin, is_active: false }]) {
      user = account;
      assert.ok([302, 403].includes((await call(draft)).status));
      assert.ok([302, 403].includes((await call(draft + '/test', { csrf })).status));
    }
    user = other;
    assert.equal((await call(draft)).status, 404);
    assert.equal((await call(draft + '/confirm', { csrf, confirm: 'send' })).status, 404);
    user = admin;
    for (const module of ['global', 'core', 'kamar-uploader', 'module-builder', 'missing-module']) {
      assert.ok([400, 409].includes((await call('/admin/users/invites', { csrf, module, userId: target.id })).status));
    }
    assert.equal((await call('/admin/users/invites', { csrf, module: 'teacher-planner', userId: 'bad' })).status, 400);
    assert.equal((await call('/admin/users/invites/bad')).status, 400);
    assert.equal(calls.length, 2);
    draft = await create();
    await db.query('UPDATE module_invitations SET expires_at=NOW()-INTERVAL \'1 minute\' WHERE id=$1', [draft.split('/').pop()]);
    assert.equal((await call(draft + '/test', { csrf })).status, 409);
    assert.match(await (await call(draft)).text(), /preview has expired/);
    draft = await create();
    await grant('teacher-planner', 'technician');
    assert.equal((await call(draft + '/test', { csrf })).status, 409, 'changed roles require fresh test');
    draft = await create();
    assert.equal((await call(draft + '/test', { csrf })).status, 302);
    const countBeforeChanges = calls.length;
    user = { ...admin, email: 'changed-admin@fixture.test' };
    assert.equal((await call(draft + '/confirm', { csrf, confirm: 'send' })).status, 409);
    user = admin;
    await db.query('UPDATE users SET is_active=false WHERE id=$1', [target.id]);
    assert.equal((await call(draft + '/confirm', { csrf, confirm: 'send' })).status, 409);
    await db.query('UPDATE users SET is_active=true,email=$2 WHERE id=$1', [target.id, 'changed@fixture.test']);
    assert.equal((await call(draft + '/confirm', { csrf, confirm: 'send' })).status, 409);
    await db.query('UPDATE users SET email=$2 WHERE id=$1', [target.id, target.email]);
    await db.query(`UPDATE module_builder_environments SET config=config||'{"appUrl":"https://changed-fixture.onrender.com/"}'
      WHERE project_id=(SELECT id FROM module_builder_projects WHERE slug='teacher-planner') AND kind='development'`);
    assert.equal((await call(draft + '/confirm', { csrf, confirm: 'send' })).status, 409);
    await db.query(`UPDATE module_builder_environments SET config=config||'{"appUrl":"https://planner-fixture.onrender.com/"}'
      WHERE project_id=(SELECT id FROM module_builder_projects WHERE slug='teacher-planner') AND kind='development'`);
    await db.query("UPDATE module_builder_projects SET stage='archived' WHERE slug='teacher-planner'");
    assert.equal((await call(draft + '/confirm', { csrf, confirm: 'send' })).status, 409);
    await db.query("UPDATE module_builder_projects SET stage='development' WHERE slug='teacher-planner'");
    await db.query('DELETE FROM user_hub_roles WHERE user_id=$1', [target.id]);
    assert.equal((await call(draft + '/confirm', { csrf, confirm: 'send' })).status, 409);
    assert.equal(calls.length, countBeforeChanges);
    await grant('teacher-planner');
    for (const failure of [{ ok: false, skipped: true, message: 'Gmail not configured' }, { ok: false, error: 'Provider failure' }, 'throw']) {
      draft = await create();
      throws = failure === 'throw';
      result = failure;
      assert.equal((await call(draft + '/test', { csrf })).status, 502);
      assert.equal((await call(draft + '/confirm', { csrf, confirm: 'send' })).status, 409);
      assert.equal((await call(draft + '/test', { csrf })).status, 409);
    }
    throws = false; result = { ok: true, messageId: 'test-success' };
    draft = await create();
    assert.equal((await call(draft + '/test', { csrf })).status, 302);
    result = { ok: false, error: 'User delivery failed' };
    assert.equal((await call(draft + '/confirm', { csrf, confirm: 'send' })).status, 502);
    const failedCount = calls.length;
    assert.equal((await call(draft + '/confirm', { csrf, confirm: 'send' })).status, 409);
    assert.equal(calls.length, failedCount, 'failed real sends are not retried');

    await grant('learning-sites', 'lead-teacher');
    draft = await create('learning-sites');
    html = await (await call(draft)).text();
    assert.match(html, /https:\/\/core.fixture.test\/learning-sites\//);
    assert.match(html, /HOD Update Dashboard/);
    await db.query("UPDATE modules SET is_active=false WHERE module_key='learning-sites'");
    assert.equal((await call(draft + '/test', { csrf })).status, 409);
    await db.query("UPDATE modules SET is_active=true WHERE module_key='learning-sites'");
    for (const module of ['dtech-hub', 'sewing-hub', 'food-room', 'workshop', 'technology-hub']) {
      await grant(module);
      const preview = await create(module);
      assert.match(await (await call(preview)).text(), new RegExp('https://core.fixture.test/' + module + '/'));
    }
    await db.query(`INSERT INTO student_apps(slug,hub_key,name,app_url,secret_hash,status)
      VALUES ('fixture-app','app-fixture','Fixture App','https://app.fixture.test','fixture','active')`);
    await grant('app-fixture');
    assert.equal((await call('/admin/users/invites', { csrf, module: 'app-fixture', userId: target.id })).status, 409);
    await db.query(`INSERT INTO student_app_role_map(app_id,platform_role,app_role)
      SELECT id,'teacher','Teacher' FROM student_apps WHERE slug='fixture-app'`);
    draft = await create('app-fixture');
    assert.match(await (await call(draft)).text(), /https:\/\/core.fixture.test\/student-apps\/fixture-app\/open/);
    await db.query("UPDATE student_apps SET status='pending' WHERE slug='fixture-app'");
    assert.equal((await call(draft + '/test', { csrf })).status, 409);
    user = { ...admin, email: 'admin@fixture.test\r\nBcc:evil@fixture.test' };
    assert.equal((await call('/admin/users/invites', { csrf, module: 'teacher-planner', userId: target.id })).status, 409);
    user = admin;
    await db.query("UPDATE users SET display_name='<img src=x onerror=alert(1)>' WHERE id=$1", [target.id]);
    draft = await create();
    html = await (await call(draft)).text();
    assert.doesNotMatch(html, /<img src=x/);
    assert.match(html, /&lt;img/);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await db.query('SET search_path TO public');
    await db.query('DROP SCHEMA ' + schema + ' CASCADE');
    db.release();
    await pool.end();
  }
});
