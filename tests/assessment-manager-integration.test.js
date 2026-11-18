const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');
const session = require('express-session');
const { createAssessmentManagerRouter, databaseOptions } = require('../src/modules/assessmentManager');
const { injectGlobalNav, navData } = require('../src/globalNav');
const { moduleForPath } = require('../src/moduleSearch');

const origin = 'https://school.example.test';

async function fixture(t) {
  const owner = crypto.randomUUID();
  const state = { signedIn: true, allowed: true, unavailable: false, incomplete: false, calls: [], revision: 1, roles: ['Teacher'] };
  const app = express();
  const globalJson = express.json({ limit: '25mb' });
  app.use((req, res, next) => req.path.startsWith('/whs-assessment-manager/') ? next() : globalJson(req, res, next));
  app.use(session({ secret: 'assessment-integration-test-session', resave: false, saveUninitialized: false }));
  app.use((req, res, next) => {
    if (state.signedIn) req.user = { id: owner };
    next();
  });
  app.use(injectGlobalNav);
  const dbQuery = async (sql, values) => {
    assert.match(sql, /FROM users u/);
    assert.deepEqual(values, [owner, 'whs-assessment-manager']);
    return { rows: state.allowed ? [{ id: owner, email: 'teacher@school.test', display_name: 'Test Teacher',
      roles: state.roles, module_roles: ['teacher'] }] : [] };
  };
  const assessmentQuery = async (sql, values) => {
    state.calls.push({ sql, values });
    if (state.unavailable) throw new Error('private database connection details');
    if (sql.startsWith('SELECT name FROM module_migrations')) {
      return { rows: values[0].slice(state.incomplete ? 1 : 0).map(name => ({ name })) };
    }
    if (/LIMIT 0$/.test(sql)) return { rows: [] };
    if (sql.includes('FROM assessment_verifiers')) return { rows: [] };
    assert.equal(values[0], owner);
    if (sql.includes("->>'verifierId'=$4") || sql.includes('FROM assessment_verifier_history')) {
      assert.deepEqual(values.slice(1, 3), [[], true], 'embedded ADMIN history uses current server authority');
      return { rows: [] };
    }
    if (sql.startsWith('SELECT content,revision,updated_at FROM assessment_settings')) {
      return { rows: [{ content: {}, revision: state.revision, updated_at: null }] };
    }
    if (sql.includes('UPDATE assessment_settings')) {
      if (values[3] !== state.revision) return { rows: [] };
      return { rows: [{ revision: ++state.revision, updated_at: null }] };
    }
    assert.fail('Unexpected assessment database query: ' + sql);
  };
  const trackerService = {
    teachingSubjects: async (user, { year }) => {
      assert.equal(user.id, owner);
      assert.equal(year, 2026);
      return { classes: [{ subject: 'DTECH', course: '11DTECH' }], departments: [] };
    },
    courseSize: async (user, { year, course }) => {
      assert.equal(user.id, owner);
      assert.equal(year, 2026);
      assert.equal(course, '11DTECH');
      return { students: 3, term: 2, linked: true, ambiguous: false };
    }
  };
  app.use('/whs-assessment-manager', createAssessmentManagerRouter({
    env: { APP_BASE_URL: origin, GOOGLE_DRIVE_CLIENT_ID: 'planner-client', GOOGLE_DRIVE_API_KEY: 'planner-key',
      GOOGLE_DRIVE_APP_ID: '123', ASSESSMENT_MANAGER_GOOGLE_DRIVE_CLIENT_ID: 'assessment-client',
      ASSESSMENT_MANAGER_GOOGLE_DRIVE_API_KEY: 'assessment-key', ASSESSMENT_MANAGER_GOOGLE_DRIVE_APP_ID: '456' },
    dbQuery, assessmentQuery, trackerService
  }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  let cookie;
  const call = async (path, options = {}) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/whs-assessment-manager${path}`, {
      ...options, redirect: 'manual', headers: { ...(cookie ? { cookie } : {}), ...options.headers }
    });
    if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
    return response;
  };
  return { owner, state, call };
}

test('assessment database is separate and never falls back to another database', () => {
  const assessment = 'postgresql://assessment.example.test/assessment';
  const core = 'postgresql://core.example.test/core';
  assert.equal(databaseOptions({ ASSESSMENT_MANAGER_DATABASE_URL: assessment }, core).connectionString, assessment);
  assert.throws(() => databaseOptions({}, core), /No fallback/);
  assert.throws(() => databaseOptions({ ASSESSMENT_MANAGER_DATABASE_URL: core }, core), /must not use/);
  assert.throws(() => databaseOptions({ ASSESSMENT_MANAGER_DATABASE_URL: assessment, INTEGRATION_KAMAR_DATABASE_URL: assessment }, core), /must not use/);
  assert.throws(() => databaseOptions({ ASSESSMENT_MANAGER_DATABASE_URL: assessment, TEACHER_PLANNER_DATABASE_URL: assessment }, core), /must not use/);
  assert.throws(() => databaseOptions({ ASSESSMENT_MANAGER_DATABASE_URL: 'https://assessment.example.test/data' }, core), /PostgreSQL/);
});

test('embedded verifier contacts and cross-year history use their separate tables and live authority loader', async t => {
  const { state, call } = await fixture(t);
  state.roles = ['ADMIN'];
  assert.equal((await call('/framework/verifiers.js')).status, 200);
  assert.deepEqual(await (await call('/api/moderation/verifiers')).json(), { verifiers: [] });
  const response = await call('/api/moderation/verifiers/' + crypto.randomUUID() + '/history');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { linked: [], manual: [] });
  assert.ok(state.calls.some(({ sql }) => sql.includes('FROM assessment_verifier_history')));
});

test('assessment navigation uses its own role management permission', async () => {
  const checks = [];
  let result;
  await navData(async () => ({ rows: [] }), async (user, key) => {
    checks.push(key);
    return true;
  })({ user: { id: crypto.randomUUID(), email: 'teacher@school.test', roles: ['Teacher'] },
    query: { path: '/whs-assessment-manager/' }, session: {} },
  { locals: {}, set() { return this; }, json(value) { result = value; } },
  error => { throw error; });
  assert.deepEqual(checks, ['whs-assessment-manager']);
  assert.equal(result.assignRolesUrl, '/hubs/whs-assessment-manager/roles');
});

test('embedded Assessment Manager retains owner, assets, CSRF, revision checks and linked data', async t => {
  const { owner, state, call } = await fixture(t);
  const page = await call('/', { headers: { Accept: 'text/html' } });
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /data-api="\/whs-assessment-manager\/api\/moderation\/"/);
  assert.match(html, /src="\/whs-assessment-manager\/framework\/assessment-manager.js/);
  assert.match(html, /src="\/global-nav.js" defer/);
  assert.equal((await call('/framework/assessment-manager.js')).status, 200);
  assert.equal((await call('/server.js')).status, 404);
  assert.equal(moduleForPath('/whs-assessment-manager/').key, 'core');
  const sessionInfo = await (await call('/api/moderation/session')).json();
  assert.equal(sessionInfo.userId, owner);
  const picker = await (await call('/api/moderation/google-drive/config')).json();
  assert.equal(picker.clientId, 'assessment-client');
  assert.equal(picker.apiKey, 'assessment-key');
  assert.equal(picker.appId, '456');
  assert.equal((await (await call('/api/moderation/2026/assessmentSetup/main?owner_id=forged')).json()).revision, 1);
  const save = (revision, headers = {}) => call('/api/moderation/2026/assessmentSetup/main', {
    method: 'PUT', headers: { Origin: origin, 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ revision, content: {} })
  });
  assert.equal((await save(1)).status, 403);
  assert.equal((await save(1, { 'x-assessment-csrf': sessionInfo.csrf, Origin: 'https://other.example.test' })).status, 403);
  assert.equal((await save(1, { 'x-assessment-csrf': sessionInfo.csrf })).status, 200);
  assert.equal((await save(1, { 'x-assessment-csrf': sessionInfo.csrf })).status, 409);
  const template = await call('/api/moderation/moderation/templates/schedule');
  assert.equal(template.status, 200);
  const uploaded = await call('/api/moderation/moderation/import/schedule', {
    method: 'POST', headers: { Origin: origin, 'x-assessment-csrf': sessionInfo.csrf,
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
    body: Buffer.from(await template.arrayBuffer())
  });
  assert.equal(uploaded.status, 200);
  assert.deepEqual((await (await call('/api/moderation/teaching-subjects/2026')).json()).classes,
    [{ subject: 'DTECH', course: '11DTECH' }]);
  assert.equal((await (await call('/api/moderation/class-size/2026?course=11DTECH')).json()).students, 3);
  assert.equal(state.calls.filter(({ sql }) => sql.includes('UPDATE assessment_settings')).length, 2);
});

test('embedded Assessment Manager rejects unauthorised access and reports database outages without fallback', async t => {
  const { state, call } = await fixture(t);
  state.signedIn = false;
  assert.equal((await call('/api/moderation/session')).status, 401);
  assert.equal((await call('/')).status, 302);
  state.signedIn = true;
  state.allowed = false;
  assert.equal((await call('/api/moderation/session')).status, 403);
  state.allowed = true;
  state.unavailable = true;
  const failure = await call('/api/moderation/session');
  assert.equal(failure.status, 503);
  assert.doesNotMatch(await failure.text(), /private database connection details/);
  state.unavailable = false;
  state.incomplete = true;
  assert.equal((await call('/api/moderation/session')).status, 503);
  state.incomplete = false;
  assert.equal((await call('/api/moderation/session')).status, 200);
});
