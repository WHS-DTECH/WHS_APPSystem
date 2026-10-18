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
    const user = (await pool.query("INSERT INTO users(email,display_name) VALUES ('admin@example.test','Admin') RETURNING *")).rows[0];
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
    app.use('/module-auth', createModuleIdentityRouter({ dbQuery: (sql, values) => pool.query(sql, values) }));
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
    assert.equal((await authorize('Teacher')).status, 403);
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
    const token = (await exchanges.find((item) => item.status === 200).json()).access_token;
    assert.equal((await post('identity', { client_id: parameters.client_id }, token)).status, 200);
    assert.equal((await post('identity', { client_id: 'teacher-planner:staging' }, token)).status, 401);
    const stored = (await pool.query('SELECT * FROM module_identity_grants')).rows[0];
    assert.notEqual(stored.token_hash, token);
    await pool.query('DELETE FROM user_roles WHERE user_id=$1', [user.id]);
    assert.equal((await post('identity', { client_id: parameters.client_id }, token)).status, 401);
    await pool.query("INSERT INTO user_roles(user_id,role_id) SELECT $1,id FROM roles WHERE name='ADMIN'", [user.id]);
    await pool.query("UPDATE module_identity_grants SET expires_at=NOW()-INTERVAL '1 second'");
    assert.equal((await post('identity', { client_id: parameters.client_id }, token)).status, 401);
    response = await authorize('ADMIN');
    const expiring = new URL(response.headers.get('location')).searchParams.get('code');
    await pool.query("UPDATE module_identity_codes SET expires_at=NOW()-INTERVAL '1 second'");
    assert.equal((await post('token', { ...body, code: expiring })).status, 401);
    await pool.query("UPDATE module_builder_projects SET stage='archived' WHERE id=$1", [project.id]);
    assert.equal((await authorize('ADMIN')).status, 400);
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    await pool.end();
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.end();
  }
});
