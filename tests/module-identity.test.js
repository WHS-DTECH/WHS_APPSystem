const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { Pool } = require('pg');
const { createModuleIdentityRouter } = require('../src/moduleIdentity');

test('Global Control identity binds codes to clients, PKCE, current ADMIN roles and registered callbacks', {
  skip: !process.env.MODULE_BUILDER_TEST_DATABASE_URL
}, async () => {
  const schema = `identity_${crypto.randomUUID().replaceAll('-', '')}`;
  const admin = new Pool({ connectionString: process.env.MODULE_BUILDER_TEST_DATABASE_URL, ssl: false });
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const url = new URL(process.env.MODULE_BUILDER_TEST_DATABASE_URL);
  url.searchParams.set('options', `-c search_path=${schema},public`);
  const pool = new Pool({ connectionString: url.toString(), ssl: false });
  let server;
  try {
    for (const migration of ['001_init.sql', '002_roles_and_module_assignments.sql', '026_module_builder.sql', '027_module_identity.sql', '027_module_identity.sql']) {
      await pool.query(await fs.readFile(path.join(__dirname, '..', 'migrations', migration), 'utf8'));
    }
    await pool.query(`CREATE TABLE sewing_hub_access(user_id uuid,access_level text,granted_by uuid);
      CREATE TABLE technology_hub_access(user_id uuid,area_key text);`);
    for (const migration of ['007_hub_roles_and_permissions.sql', '016_hub_roles_base.sql', '018_student_apps.sql', '030_teacher_planner_roles.sql', '031_standard_teaching_module_roles.sql']) {
      await pool.query(await fs.readFile(path.join(__dirname, '..', 'migrations', migration), 'utf8'));
    }
    const durationMigration = await fs.readFile(path.join(__dirname, '..', 'migrations', '028_module_identity_session_duration.sql'), 'utf8');
    await pool.query(durationMigration);
    await pool.query(durationMigration);
    const defaultExpiry = (await pool.query(`SELECT column_default FROM information_schema.columns
      WHERE table_schema=$1 AND table_name='module_identity_grants' AND column_name='expires_at'`, [schema])).rows[0].column_default;
    assert.match(defaultExpiry, /08:00:00/);
    const user = (await pool.query("INSERT INTO users(email,display_name,avatar_url) VALUES ('admin@example.test','Admin','https://lh3.googleusercontent.com/fixture') RETURNING *")).rows[0];
    await pool.query("INSERT INTO user_roles(user_id,role_id) SELECT $1,id FROM roles WHERE name='ADMIN'", [user.id]);
    const project = (await pool.query("SELECT * FROM module_builder_projects WHERE slug='teacher-planner'")).rows[0];
    await pool.query(`UPDATE module_builder_environments SET config=config || '{"appUrl":"https://fixture.onrender.com/"}' WHERE project_id=$1 AND kind='development'`, [project.id]);
    const config = (await pool.query("SELECT config FROM module_builder_environments WHERE project_id=$1 AND kind='development'", [project.id])).rows[0].config;
    assert.ok(config.environmentVariables.some((item) => item.name === 'GLOBAL_CONTROL_URL'));
    assert.ok(!config.environmentVariables.some((item) => item.name === 'GOOGLE_CLIENT_SECRET'));
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      if (req.get('x-role')) req.user = { ...user, roles: [req.get('x-role')] };
      next();
    });
    let calendarFailure = false;
    app.use('/module-auth', createModuleIdentityRouter({
      dbQuery: (sql, values) => pool.query(sql, values),
      schoolCalendar: async year => {
        if (calendarFailure) throw new Error('Fixture source outage');
        return {year, available:true,terms:[],holidays:[]};
      }
    }));
    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}/module-auth`;
    const verifier = crypto.randomBytes(32).toString('base64url');
    const state = crypto.randomBytes(32).toString('base64url');
    const parameters = {
      client_id: 'teacher-planner:development', redirect_uri: 'https://fixture.onrender.com/auth/global-control/callback',
      state, code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256'
    };
    const authorize = (role, overrides = {}) => fetch(base + '/authorize?' + new URLSearchParams({ ...parameters, ...overrides }), {
      redirect: 'manual', headers: role ? { 'x-role': role } : {}
    });
    const post = (route, body, token) => fetch(base + '/' + route, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body)
    });
    let response = await authorize();
    assert.equal(response.status, 302);
    assert.match(response.headers.get('location'), /^\/auth\/google\?next=/);
    await pool.query('DELETE FROM user_roles WHERE user_id=$1', [user.id]);
    assert.equal((await authorize('Teacher')).status, 403);
    await pool.query("INSERT INTO user_roles(user_id,role_id) SELECT $1,id FROM roles WHERE name='ADMIN'", [user.id]);
    assert.equal((await authorize('ADMIN', { redirect_uri: 'https://evil.onrender.com/auth/global-control/callback' })).status, 400);
    assert.equal((await authorize('ADMIN', { code_challenge_method: 'plain' })).status, 400);
    response = await authorize('ADMIN');
    assert.equal(response.status, 302);
    const callback = new URL(response.headers.get('location'));
    assert.equal(callback.origin, 'https://fixture.onrender.com');
    assert.equal(callback.searchParams.get('state'), state);
    const code = callback.searchParams.get('code');
    const body = { client_id: parameters.client_id, redirect_uri: parameters.redirect_uri, code, code_verifier: verifier };
    assert.equal((await post('token', { ...body, code_verifier: crypto.randomBytes(32).toString('base64url') })).status, 401);
    assert.equal((await post('token', { ...body, client_id: 'teacher-planner:staging' })).status, 400);
    const exchanges = await Promise.all([post('token', body), post('token', body)]);
    assert.deepEqual(exchanges.map((item) => item.status).sort(), [200, 401]);
    const issued = await exchanges.find((item) => item.status === 200).json();
    assert.equal(issued.expires_in, 8 * 60 * 60);
    const token = issued.access_token;
    const remaining = (await pool.query('SELECT EXTRACT(EPOCH FROM expires_at-NOW())::float AS seconds FROM module_identity_grants')).rows[0].seconds;
    assert.ok(remaining > 8 * 60 * 60 - 30 && remaining <= 8 * 60 * 60, remaining);
    await pool.query(durationMigration);
    assert.equal((await pool.query('SELECT EXTRACT(EPOCH FROM expires_at-NOW())::float AS seconds FROM module_identity_grants')).rows[0].seconds <= remaining, true);
    const identity = await post('identity', { client_id: parameters.client_id }, token);
    assert.equal(identity.status, 200);
    assert.equal((await identity.json()).avatar_url, user.avatar_url);
    assert.equal((await post('school-calendar', {client_id:parameters.client_id,year:2026},'Z'.repeat(43))).status,401);
    assert.equal((await post('school-calendar', {client_id:parameters.client_id,year:'2026'},token)).status,400);
    assert.equal((await post('school-calendar', {client_id:parameters.client_id,year:2101},token)).status,400);
    assert.equal((await (await post('school-calendar', {client_id:parameters.client_id,year:2027},token)).json()).year,2027);
    calendarFailure = true;
    assert.equal((await post('school-calendar', {client_id:parameters.client_id,year:2026},token)).status,502);
    calendarFailure = false;
    const search = await post('search', {client_id:parameters.client_id,q:'Dashboard'},token);
    assert.equal(search.status,200);
    assert.ok((await search.json()).results.some((item)=>item.url==='/dashboard'));
    assert.equal((await post('search', {client_id:parameters.client_id,q:'Dashboard'},'Z'.repeat(43))).status,401);
    assert.equal((await post('search', {client_id:parameters.client_id,q:'D'},token)).status,400);
    assert.equal((await post('identity', { client_id: 'teacher-planner:staging' }, token)).status, 401);
    const stored = (await pool.query('SELECT * FROM module_identity_grants')).rows[0];
    assert.notEqual(stored.token_hash, token);
    await pool.query("UPDATE module_identity_grants SET expires_at=NOW()+INTERVAL '7 hours 54 minutes'");
    assert.equal((await post('identity', { client_id: parameters.client_id }, token)).status, 200);
    await pool.query('DELETE FROM user_roles WHERE user_id=$1', [user.id]);
    assert.equal((await post('school-calendar', {client_id:parameters.client_id,year:2026},token)).status,401);
    assert.equal((await post('identity', { client_id: parameters.client_id }, token)).status, 401);
    await pool.query("INSERT INTO user_roles(user_id,role_id) SELECT $1,id FROM roles WHERE name='ADMIN'", [user.id]);
    await pool.query("UPDATE module_identity_grants SET expires_at=NOW()-INTERVAL '1 second'");
    await pool.query(durationMigration);
    assert.equal((await post('identity', { client_id: parameters.client_id }, token)).status, 401);
    assert.equal((await post('revoke', {},token)).status,200);
    assert.equal((await pool.query('SELECT * FROM module_identity_grants')).rows.length,0);
    response = await authorize('ADMIN');
    const expiring = new URL(response.headers.get('location')).searchParams.get('code');
    await pool.query("UPDATE module_identity_codes SET expires_at=NOW()-INTERVAL '1 second'");
    assert.equal((await post('token', { ...body, code: expiring })).status, 401);
    response = await authorize('ADMIN');
    const freshCode = new URL(response.headers.get('location')).searchParams.get('code');
    const active = await post('token', {...body, code:freshCode});
    const activeToken = (await active.json()).access_token;
    assert.equal((await post('revoke', {}, 'bad')).status,401);
    assert.equal((await post('revoke', {}, activeToken)).status,200);
    assert.equal((await post('identity', {client_id:parameters.client_id},activeToken)).status,401);
    await pool.query('DELETE FROM user_roles WHERE user_id=$1', [user.id]);
    await pool.query("INSERT INTO user_roles(user_id,role_id) SELECT $1,id FROM roles WHERE name='Teacher'", [user.id]);
    assert.equal((await authorize('Teacher')).status, 403);
    await pool.query(`INSERT INTO user_hub_roles(user_id,hub_role_id)
      SELECT $1,id FROM hub_roles WHERE hub_key='teacher-planner' AND role_key='teacher'`, [user.id]);
    response = await authorize('Teacher');
    assert.equal(response.status, 302);
    const teacherCode = new URL(response.headers.get('location')).searchParams.get('code');
    const teacherIssued = await post('token', { ...body, code: teacherCode });
    assert.equal(teacherIssued.status, 200);
    const teacherToken = (await teacherIssued.json()).access_token;
    const teacherIdentity = await post('identity', { client_id: parameters.client_id }, teacherToken);
    assert.deepEqual((await teacherIdentity.json()).roles, ['Teacher']);
    assert.equal((await post('school-calendar', { client_id: parameters.client_id, year: 2026 }, teacherToken)).status, 200);
    const otherProject = (await pool.query(`INSERT INTO module_builder_projects(slug,name,mount_path)
      VALUES ('other-module','Other Module','/other/') RETURNING id`)).rows[0];
    await pool.query(`UPDATE module_builder_environments SET config=config || '{"appUrl":"https://other-fixture.onrender.com/"}'
      WHERE project_id=$1 AND kind='development'`, [otherProject.id]);
    assert.equal((await authorize('Teacher', { client_id: 'other-module:development',
      redirect_uri: 'https://other-fixture.onrender.com/auth/global-control/callback' })).status, 403);
    for (const role of ['technician','lead-teacher']) {
      await pool.query('DELETE FROM user_hub_roles WHERE user_id=$1', [user.id]);
      await pool.query(`INSERT INTO user_hub_roles(user_id,hub_role_id)
        SELECT $1,id FROM hub_roles WHERE hub_key='teacher-planner' AND role_key=$2`, [user.id, role]);
      const identity = await (await post('identity', { client_id: parameters.client_id }, teacherToken)).json();
      assert.deepEqual(identity.roles, ['Teacher']);
      assert.deepEqual(identity.module_roles, [role]);
      assert.equal((await authorize('Teacher')).status, 302);
      assert.equal((await authorize('Teacher', { client_id: 'other-module:development',
        redirect_uri: 'https://other-fixture.onrender.com/auth/global-control/callback' })).status, 403);
    }
    await pool.query(`INSERT INTO user_hub_roles(user_id,hub_role_id)
      SELECT $1,id FROM hub_roles WHERE hub_key='other-module' AND role_key='technician'`, [user.id]);
    assert.equal((await authorize('Teacher', { client_id: 'other-module:development',
      redirect_uri: 'https://other-fixture.onrender.com/auth/global-control/callback' })).status, 302);
    const systemProject = (await pool.query(`INSERT INTO module_builder_projects(slug,name,mount_path)
      VALUES ('module-builder','System Project','/system/') RETURNING id`)).rows[0];
    await pool.query(`INSERT INTO hub_roles(hub_key,role_key,display_name) VALUES ('module-builder','lead-teacher','Stray system role');
      INSERT INTO user_hub_roles(user_id,hub_role_id)
      SELECT '${user.id}',id FROM hub_roles WHERE hub_key='module-builder'`);
    await pool.query(`UPDATE module_builder_environments SET config=config || '{"appUrl":"https://system-fixture.onrender.com/"}'
      WHERE project_id=$1 AND kind='development'`, [systemProject.id]);
    assert.equal((await authorize('Teacher', { client_id: 'module-builder:development',
      redirect_uri: 'https://system-fixture.onrender.com/auth/global-control/callback' })).status, 403);
    await pool.query('UPDATE users SET is_active=false WHERE id=$1', [user.id]);
    assert.equal((await authorize('Teacher')).status, 403);
    assert.equal((await post('identity', { client_id: parameters.client_id }, teacherToken)).status, 401);
    await pool.query('UPDATE users SET is_active=true WHERE id=$1', [user.id]);
    response = await authorize('Teacher');
    const revokedCode = new URL(response.headers.get('location')).searchParams.get('code');
    await pool.query('DELETE FROM user_hub_roles WHERE user_id=$1', [user.id]);
    assert.equal((await post('identity', { client_id: parameters.client_id }, teacherToken)).status, 401);
    assert.equal((await post('token', { ...body, code: revokedCode })).status, 401);
    assert.equal((await authorize('Teacher')).status, 403);
    await pool.query("UPDATE module_builder_projects SET stage='archived' WHERE id=$1", [project.id]);
    assert.equal((await authorize('ADMIN')).status, 400);
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    await pool.end();
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.end();
  }
});
