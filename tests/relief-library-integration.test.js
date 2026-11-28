const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { Client } = require('pg');
const { createReliefLibraryRouter } = require('../src/modules/reliefLibrary');
const { injectGlobalNav, navData } = require('../src/globalNav');
const { moduleForPath } = require('../src/moduleSearch');
const { createModuleAccessGuard } = require('../src/moduleAccess');
const events = require('../src/legacy/relief-library/data/events.json');

async function fixture(t) {
  const state = { signedIn: true, allowed: true, roles: ['Teacher'], queries: 0 };
  const app = express();
  app.use((req, res, next) => {
    if (state.signedIn) req.user = { id: 'test-user' };
    next();
  });
  app.use(injectGlobalNav);
  app.use('/relief-plan', createReliefLibraryRouter({
    dbQuery: async (sql, values) => {
      state.queries++;
      assert.match(sql, /FROM users u/);
      assert.deepEqual(values, ['test-user', 'whs-relief-library']);
      return { rows: state.allowed ? [{ id: 'test-user', roles: state.roles }] : [] };
    }
  }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const call = (path, options = {}) => fetch(`http://127.0.0.1:${server.address().port}/relief-plan${path}`,
    { ...options, redirect: 'manual' });
  return { state, call };
}

test('embedded Relief Library keeps its calendar, links, prefixed assets and global navigation', async t => {
  const { call } = await fixture(t);
  const response = await call('/', { headers: { Accept: 'text/html' } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const html = await response.text();
  assert.match(html, /data-relief-events-url="\/relief-plan\/api\/relief-plan\/events"/);
  assert.match(html, /src="\/relief-plan\/framework\/relief-plan\.js"/);
  assert.match(html, /src="\/global-nav\.js" defer/);
  assert.match(html, /href="\/DTECH\/MDTECH-S1\/"/);
  assert.equal((await call('/framework/relief-plan.js')).status, 200);
  assert.equal((await call('/data/events.json')).status, 404);
  const data = await (await call('/api/relief-plan/events')).json();
  assert.equal(data.year, 2027);
  assert.equal(data.role, 'Teacher');
  assert.deepEqual(data.events, events);
  assert.equal((await call('/api/relief-plan/events', { method: 'POST' })).status, 404);
  assert.equal(moduleForPath('/relief-plan/').key, 'core');
});

test('school identity and current Relief Library assignment are checked for every request', async t => {
  const { state, call } = await fixture(t);
  state.signedIn = false;
  assert.equal((await call('/')).status, 302);
  assert.equal((await call('/api/relief-plan/events')).status, 401);
  assert.equal(state.queries, 0);
  state.signedIn = true;
  assert.equal((await call('/api/relief-plan/events')).status, 200);
  state.allowed = false;
  assert.equal((await call('/api/relief-plan/events')).status, 403);
  assert.equal((await call('/framework/relief-plan.js')).status, 403);
  state.allowed = true;
  state.roles = ['Student'];
  assert.equal((await call('/api/relief-plan/events')).status, 403);
  state.roles = ['ADMIN'];
  assert.equal((await (await call('/api/relief-plan/events')).json()).role, 'ADMIN');
});

test('Relief Library navigation checks its own role management permission', async () => {
  const checks = [];
  let result;
  await navData(async () => ({ rows: [] }), async (user, key) => {
    checks.push(key);
    return true;
  })({ user: { id: 'test-user', email: 'teacher@school.test', roles: ['Teacher'] },
    query: { path: '/relief-plan/' }, session: {} },
  { locals: {}, set() { return this; }, json(value) { result = value; } },
  error => { throw error; });
  assert.deepEqual(checks, ['whs-relief-library']);
  assert.equal(result.assignRolesUrl, '/hubs/whs-relief-library/roles');
});

test('registered Relief API reports session expiry and revoked access as JSON', async t => {
  const state = { signedIn: false, allowed: true };
  const app = express();
  app.use((req, res, next) => {
    if (state.signedIn) req.user = { id: 'test-user', roles: ['Teacher'] };
    next();
  });
  app.use(createModuleAccessGuard({ dbQuery: async () => ({ rows: [{
    module_key: 'whs-relief-library', path: '/relief-plan/', is_active: true, has_access: state.allowed
  }] }) }));
  app.use('/relief-plan', createReliefLibraryRouter({ dbQuery: async () => ({ rows: [{
    id: 'test-user', roles: ['Teacher']
  }] }) }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/relief-plan/api/relief-plan/events`;
  let response = await fetch(url, { redirect: 'manual' });
  assert.equal(response.status, 401);
  assert.match(response.headers.get('content-type'), /application\/json/);
  state.signedIn = true;
  state.allowed = false;
  response = await fetch(url, { redirect: 'manual' });
  assert.equal(response.status, 403);
  assert.match((await response.json()).error, /Relief Library/);
});

test('cutover preserves existing roles, inactive modules and customised destinations', {
  skip: !process.env.MODULE_BUILDER_TEST_DATABASE_URL
}, async () => {
  const client = new Client({ connectionString: process.env.MODULE_BUILDER_TEST_DATABASE_URL, ssl: false });
  const schema = 'relief_test_' + crypto.randomBytes(8).toString('hex');
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET search_path TO ${schema}`);
    await client.query(`CREATE TABLE module_builder_projects (id integer PRIMARY KEY, slug text, name text, description text, stage text);
      CREATE TABLE module_builder_environments (project_id integer, kind text, config jsonb);
      CREATE TABLE modules (module_key text PRIMARY KEY, display_name text, description text, path text, is_active boolean DEFAULT true);
      CREATE TABLE role_grants (module_key text, role_name text)`);
    await client.query(`INSERT INTO module_builder_projects VALUES (1,'whs-relief-library','Relief Library','Staff planning','development');
      INSERT INTO module_builder_environments VALUES (1,'development','{"appUrl":"https://whs-relief-library-development.onrender.com/"}');
      INSERT INTO role_grants VALUES ('whs-relief-library','teacher')`);
    const migration = fs.readFileSync(path.join(__dirname, '..', 'migrations', '065_relief_library_project_key.sql'), 'utf8');
    await client.query(migration);
    await client.query(migration);
    assert.deepEqual((await client.query('SELECT path, is_active FROM modules')).rows, [
      { path: '/relief-plan/', is_active: true }
    ]);
    assert.equal((await client.query('SELECT count(*)::int AS count FROM role_grants')).rows[0].count, 1);
    await client.query("UPDATE modules SET path='https://custom.example.test/', is_active=false");
    await client.query(migration);
    assert.deepEqual((await client.query('SELECT path, is_active FROM modules')).rows, [
      { path: 'https://custom.example.test/', is_active: false }
    ]);
    await client.query("UPDATE modules SET path='https://whs-relief-library-development.onrender.com/'");
    await client.query(migration);
    assert.deepEqual((await client.query('SELECT path, is_active FROM modules')).rows, [
      { path: '/relief-plan/', is_active: false }
    ]);
  } finally {
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await client.end();
  }
});
