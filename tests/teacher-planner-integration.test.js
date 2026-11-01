const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const session = require('express-session');
const { createTeacherPlannerRouter, databaseOptions } = require('../src/modules/teacherPlanner');
const { createModuleAccessGuard } = require('../src/moduleAccess');
const { injectGlobalNav, navData } = require('../src/globalNav');
const { moduleForPath } = require('../src/moduleSearch');
const { configuration, encryptTokens, decryptTokens } = require('../src/legacy/teacher-planner/googleCalendar');

const origin = 'https://school.example.test';

async function fixture(t, { env = {}, useRealDatabase = false } = {}) {
  const owner = crypto.randomUUID();
  const state = { signedIn: true, allowed: true, unavailable: false, failureCode: null, roles: ['Teacher'], revision: 4,
    content: { professional: 'Original private planner' }, plannerCalls: [], coreCalls: [], directoryCalls: [] };
  const app = express();
  app.use(session({ secret: 'embedded-planner-test-session', resave: false, saveUninitialized: false }));
  app.use((req, res, next) => {
    if (state.signedIn) req.user = { id: owner, roles: [] };
    next();
  });
  app.use(injectGlobalNav);
  const dbQuery = async (sql, values) => {
    state.coreCalls.push({ sql, values });
    assert.doesNotMatch(sql, /FROM staff_upload|FROM student_upload|planner_sections|google_calendar_connections/);
    if (sql.includes('FROM users u')) {
      assert.deepEqual(values, [owner, 'teacher-planner']);
      assert.match(sql, /u.is_active=true/);
      assert.match(sql, /p.permission_key='home.view'/);
      return { rows: state.allowed ? [{ id: owner, email: 'teacher@school.test', display_name: 'Current Teacher',
        roles: state.roles, module_roles: ['lead-teacher'] }] : [] };
    }
    if (sql.includes('FROM public.department')) return { rows: [] };
    assert.fail('Unexpected Core query: ' + sql);
  };
  const plannerQuery = async (sql, values) => {
    state.plannerCalls.push({ sql, values });
    if (state.failureCode) throw Object.assign(new Error('private connection details must not be exposed'), { code: state.failureCode });
    if (state.unavailable) throw new Error('Database unavailable');
    if (/LIMIT 0$/.test(sql) || sql === 'SELECT 1') return { rows: [] };
    assert.doesNotMatch(sql, /users|roles|staff_upload|student_upload/);
    assert.equal(values[0], owner, 'retain the original verified Core owner UUID');
    if (sql.startsWith('SELECT content,revision')) return { rows: [{ content: state.content, revision: state.revision }] };
    if (sql.startsWith('UPDATE planner_sections')) {
      if (values[5] !== state.revision) return { rows: [] };
      state.content = JSON.parse(values[4]);
      return { rows: [{ revision: ++state.revision }] };
    }
    if (sql.startsWith('SELECT content FROM planner_sections')) return { rows: [] };
    if (sql.startsWith("SELECT content->>'teacher'")) return { rows: [] };
    assert.fail('Unexpected Planner query: ' + sql);
  };
  const directoryQuery = async (sql, values) => {
    state.directoryCalls.push({ sql, values });
    if (sql.includes('SELECT DISTINCT upper(trim(code))')) {
      assert.deepEqual(values, ['teacher@school.test']);
      return { rows: [{ code: 'TST' }] };
    }
    if (sql.includes('FROM student_upload')) {
      assert.deepEqual(values, [2026]);
      return { rows: [{ id_number: '100', student_name: 'Current Student', mon_p1_1: 'TST-11TEST-CW', tue_p1_1: 'OTHER-12TEST-CW' }] };
    }
    if (sql.includes('FROM staff_upload')) return { rows: [{ id: '1', code: 'TST', first_name: 'Current', last_name: 'Teacher' }] };
    assert.fail('Unexpected directory query: ' + sql);
  };
  app.use('/teacher-planner', createTeacherPlannerRouter({ dbQuery, ...(useRealDatabase ? {} : { plannerQuery }), directoryQuery,
    env: { APP_BASE_URL: origin, ...env }, schoolCalendar: async year => ({ year, terms: [], holidays: [] }) }));
  app.use((error, req, res, next) => res.status(500).json({ error: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  let cookie;
  const call = async (route, options = {}) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/teacher-planner` + route, {
      ...options, redirect: 'manual', headers: { ...(cookie ? { cookie } : {}), ...options.headers }
    });
    if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
    return response;
  };
  return { state, call, owner };
}

test('Planner database never falls back to Core or Kamar and Google connections retain the original encryption key', () => {
  const planner = 'postgresql://planner.example.test/planner';
  const core = 'postgresql://core.example.test/core';
  assert.equal(databaseOptions({ TEACHER_PLANNER_DATABASE_URL: planner }, core).connectionString, planner);
  assert.throws(() => databaseOptions({}, core), /No fallback/);
  assert.throws(() => databaseOptions({ TEACHER_PLANNER_DATABASE_URL: core }, core), /Core or Kamar/);
  assert.throws(() => databaseOptions({ TEACHER_PLANNER_DATABASE_URL: planner, INTEGRATION_KAMAR_DATABASE_URL: planner }, core), /Core or Kamar/);
  assert.throws(() => databaseOptions({ TEACHER_PLANNER_DATABASE_URL: 'https://planner.example.test/planner' }, core), /PostgreSQL/);
  const googleEnv = { APP_BASE_URL: origin, GOOGLE_CALENDAR_CLIENT_ID: 'test-client',
    GOOGLE_CALENDAR_CLIENT_SECRET: 'test-secret', GOOGLE_CALENDAR_TOKEN_KEY: Buffer.alloc(32, 7).toString('base64') };
  const old = configuration(googleEnv), embedded = configuration({ ...googleEnv, TEACHER_PLANNER_BASE_PATH: '/teacher-planner' });
  assert.equal(old.redirectUri, origin + '/api/planner/google-calendar/callback');
  assert.equal(embedded.redirectUri, origin + '/teacher-planner/api/planner/google-calendar/callback');
  const owner = crypto.randomUUID(), tokens = { refreshToken: 'test-refresh' };
  assert.deepEqual(decryptTokens(encryptTokens(tokens, old.key, owner), embedded.key, owner), tokens);
});

test('embedded Planner preserves screens, private owner, CSRF, autosave and revision conflicts', async t => {
  const { state, call, owner } = await fixture(t);
  const page = await call('/');
  assert.equal(page.status, 200);
  assert.equal(page.headers.get('cache-control'), 'no-store');
  const html = await page.text();
  assert.match(html, /data-api="\/teacher-planner\/api\/planner\/"/);
  assert.match(html, /src="\/teacher-planner\/framework\/planner.js/);
  assert.match(html, /<script src="\/global-nav.js" defer>/);
  assert.doesNotMatch(html, /src="\/teacher-planner\/framework\/global-nav.js/);
  assert.match(html, /Teacher Planner/);
  assert.equal((await call('/framework/planner.css')).status, 200);
  assert.equal((await call('/server.js')).status, 404);
  const recovery = await call('/auth/global-control?next=' + encodeURIComponent('/#section=week&year=2026'));
  assert.equal(recovery.headers.get('location'), '/teacher-planner/#section=week&year=2026');
  const before = await (await call('/api/planner/2026/goals/main?owner_id=forged')).json();
  assert.deepEqual(before.content, state.content);
  const sessionInfo = await (await call('/api/planner/session')).json();
  assert.equal(sessionInfo.userId, owner);
  assert.equal(sessionInfo.canManageSchoolSettings, true);
  const save = (revision, headers = {}) => call('/api/planner/2026/goals/main', {
    method: 'PUT', headers: { Origin: origin, 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ revision, content: { professional: 'Changed in synthetic test' } })
  });
  assert.equal((await save(4)).status, 403);
  assert.equal((await save(4, { 'x-planner-csrf': sessionInfo.csrf, Origin: 'https://other.example.test' })).status, 403);
  assert.equal((await save(4, { 'x-planner-csrf': sessionInfo.csrf })).status, 200);
  assert.equal((await save(4, { 'x-planner-csrf': sessionInfo.csrf })).status, 409);
  assert.equal((await (await call('/api/planner/2026/goals/main')).json()).content.professional, 'Changed in synthetic test');
  assert.equal(state.plannerCalls.filter(({ sql }) => sql.startsWith('UPDATE planner_sections')).length, 2);
  assert.ok(state.plannerCalls.filter(({ sql }) => sql.includes('LIMIT 0')).every(({ sql }) => sql.startsWith('SELECT')));
});

test('embedded staff and attendance readers use live Kamar and preserve verified teacher class scoping', async t => {
  const { state, call } = await fixture(t);
  const staff = await call('/api/planner/staff');
  assert.equal(staff.status, 200);
  assert.equal((await staff.json()).staff[0].name, 'Current Teacher (TST)');
  const classes = await call('/api/planner/attendance/classes/2026?staffCode=OTHER');
  assert.equal(classes.status, 200);
  assert.deepEqual(await classes.json(), { staffCode: 'TST',
    classes: [{ code: 'TST-11TEST-CW', students: [{ id: 'k:100', name: 'Current Student' }] }] });
  assert.ok(state.directoryCalls.some(({ sql }) => sql.includes('FROM student_upload')));
});

test('Planner denies unassigned accounts and reports database outages without fallback, then retries', async t => {
  const { state, call } = await fixture(t);
  state.signedIn = false;
  assert.equal((await call('/api/planner/session')).status, 401);
  const signin = await call('/');
  assert.equal(signin.status, 302);
  assert.match(signin.headers.get('location'), /^\/auth\/google\?next=/);
  state.signedIn = true; state.allowed = false;
  assert.equal((await call('/')).status, 403);
  assert.equal(state.plannerCalls.length, 0);
  state.allowed = true; state.unavailable = true;
  assert.equal((await call('/health')).status, 503);
  state.unavailable = false;
  const health = await call('/health');
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ok', database: 'existing-teacher-planner', importsEnabled: false });
  state.unavailable = true;
  assert.equal((await call('/health')).status, 503);
  assert.ok(state.plannerCalls.every(({ sql }) => /^SELECT/.test(sql)));
});

test('global module guard retains JSON sign-in errors for Planner autosave and registry cutover preserves old callback', async t => {
  const app = express();
  app.use(createModuleAccessGuard({ dbQuery: async () => ({ rows: [
    { module_key: 'teacher-planner', path: '/teacher-planner/', is_active: true, has_access: false }
  ] }) }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/teacher-planner/api/planner/session`, { redirect: 'manual' });
  assert.equal(response.status, 401);
  assert.match(response.headers.get('content-type'), /application\/json/);
  assert.equal(moduleForPath('/teacher-planner/').key, 'core');
  const migration = fs.readFileSync(path.join(__dirname, '..', 'migrations', '039_embedded_teacher_planner.sql'), 'utf8');
  assert.doesNotMatch(migration, /DELETE|DROP|module_builder_environments|planner_sections|DATABASE_URL/);
  assert.match(migration, /DO UPDATE SET path=EXCLUDED.path/);
});

test('shared Planner navigation links role management without offering unrelated Core role views', async () => {
  let model;
  await navData(async () => ({ rows: [] }), async (user, hub) => hub === 'teacher-planner', async () => null)(
    { user: { id: 'teacher', roles: [] }, query: { path: '/teacher-planner/' }, session: {} },
    { locals: {}, set() {}, json: value => { model = value; } }, error => { throw error; });
  assert.equal(model.assignRolesUrl, '/hubs/teacher-planner/roles');
  assert.deepEqual(model.roleViews, []);
});

test('readiness diagnostics distinguish configuration and schema failures without exposing secrets', async t => {
  const missing = await fixture(t, { useRealDatabase: true });
  missing.state.roles = ['ADMIN'];
  const missingResponse = await missing.call('/');
  assert.equal(missingResponse.status, 503);
  assert.match((await missingResponse.json()).diagnostic, /Set TEACHER_PLANNER_DATABASE_URL/);
  assert.equal(missing.state.plannerCalls.length, 0);

  const schema = await fixture(t);
  schema.state.roles = ['ADMIN'];
  schema.state.failureCode = '42P01';
  const schemaResponse = await schema.call('/');
  assert.equal(schemaResponse.status, 503);
  const detail = await schemaResponse.json();
  assert.match(detail.diagnostic, /missing table planner_sections/);
  assert.match(detail.diagnostic, /42P01/);
  assert.doesNotMatch(JSON.stringify(detail), /private connection details/);
  schema.state.roles = ['Teacher'];
  assert.equal((await (await schema.call('/')).json()).diagnostic, undefined);

  const google = await fixture(t, { env: { GOOGLE_CALENDAR_CLIENT_ID: 'incomplete' } });
  google.state.roles = ['ADMIN'];
  const googleResponse = await google.call('/');
  assert.equal(googleResponse.status, 503);
  assert.equal((await googleResponse.json()).diagnostic, 'Set all three GOOGLE_CALENDAR credentials.');
  assert.ok(google.state.plannerCalls.every(({ sql }) => sql.startsWith('SELECT')));
});
