const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const express = require('express');
const session = require('express-session');
const { createHandoverRouter } = require('../src/studentHandovers');
const { createHandoverProviders, HandoverError, parseRepository, handoverMarkdown } = require('../src/studentHandoverProviders');

const COMMIT = 'a'.repeat(40);
let server;
let base;
let rows;
let calls;
let live;
let renderConfigured;
let owner;
let apps;

const push = (row, entry) => { row.history = [...row.history, ...JSON.parse(entry)]; };

const BUILDER = '11111111-2222-4333-8444-555555555555';

async function dbQuery(sql, params = []) {
  if (sql.includes('FROM student_apps ORDER BY name')) return { rows: [...apps.values()] };
  if (sql.includes('FROM module_builder_projects')) return { rows: [{ id: 'p1', name: 'Bus Controller App' }, { id: 'p2', name: 'International App' }] };
  if (sql.startsWith('UPDATE student_apps SET moved_to_development_at = NOW()')) {
    const app = apps.get(params[0]);
    if (!app || app.moved_to_development_at) return { rows: [] };
    app.moved_to_development_at = new Date();
    return { rows: [{ name: app.name }] };
  }
  if (sql.startsWith('UPDATE student_apps SET moved_to_development_at = NULL')) {
    const app = apps.get(params[0]);
    if (app) app.moved_to_development_at = null;
    return { rows: app ? [{ name: app.name }] : [] };
  }
  if (sql.includes('SET student_app_slug = $2')) { const item = rows.get(params[0]); item.student_app_slug = params[1]; push(item, params[2]); return { rows: [] }; }
  if (sql.includes('SET student_app_slug = NULL')) { const item = rows.get(params[0]); item.student_app_slug = null; push(item, params[1]); return { rows: [] }; }
  if (sql.includes('FROM student_builders ORDER BY')) return { rows: [{ id: BUILDER, full_name: 'Jonas Full', credit_name: 'Student <Name>', github_url: 'https://github.com/zomotokari-cpu/WHS_BusController', status: 'left' }] };
  if (sql.includes('FROM student_builders WHERE id')) return { rows: params[0] === BUILDER ? [{ id: BUILDER, credit_name: 'Student <Name>', github_url: 'https://github.com/zomotokari-cpu/WHS_BusController' }] : [] };
  const row = rows.get(params[0]);
  if (sql.includes('ORDER BY finished_at IS NOT NULL')) {
    return { rows: [...rows.values()].map((item) => ({ ...item, review_date: item.review_on })) };
  }
  if (sql.startsWith('SELECT *, review_on::text')) return { rows: row ? [{ ...row, review_date: row.review_on }] : [] };
  if (sql.includes('INSERT INTO student_project_handovers')) {
    const clash = [...rows.values()].some((item) => item.slug === params[1]
      || (!item.finished_at && item.source_repository.toLowerCase() === params[3].toLowerCase()));
    if (clash) return { rows: [] };
    rows.set(params[0], { id: params[0], slug: params[1], title: params[2], source_repository: params[3], source_commit: params[4],
      student_name: params[5], student_github: params[6], school_year: params[7], review_on: params[8], created_by: params[9],
      history: JSON.parse(params[10]), builder_id: params[11], busy_until: null });
    return { rows: [{ id: params[0] }] };
  }
  if (sql.includes("SET busy_until = NOW() + INTERVAL")) {
    if (!row || row.finished_at || row.busy_until) return { rows: [] };
    row.busy_until = 'busy';
    return { rows: [{ ...row }] };
  }
  if (sql === 'UPDATE student_project_handovers SET busy_until = NULL WHERE id = $1') { row.busy_until = null; return { rows: [] }; }
  if (sql.includes('SET labelled_at')) { Object.assign(row, { labelled_at: new Date(), made_private: params[1] }); push(row, params[2]); return { rows: [] }; }
  if (sql.includes("school_copy_kind = 'existing'")) {
    Object.assign(row, { school_copy_kind: 'existing', school_copy_url: params[1], school_copy_at: new Date() }); push(row, params[2]); return { rows: [] };
  }
  if (sql.includes("school_copy_kind = 'repository'")) {
    Object.assign(row, { school_copy_kind: 'repository', school_copy_url: params[1], school_copy_commit: params[2], school_copy_at: new Date() });
    push(row, params[3]); return { rows: [] };
  }
  if (sql.includes('SET backup_snapshot')) {
    Object.assign(row, { backup_snapshot: JSON.parse(params[1]), backup_preview_by: params[2], backup_preview_expires_at: new Date(Date.now() + 3600000) });
    return { rows: [] };
  }
  if (sql.includes('SET backup_url')) { Object.assign(row, { backup_url: params[1], backup_commit: params[2], backup_at: new Date() }); push(row, params[3]); return { rows: [] }; }
  if (sql.includes('SET backup_skipped_reason')) { row.backup_skipped_reason = params[1]; push(row, params[2]); return { rows: [] }; }
  if (sql.includes('SET frozen_at')) { row.frozen_at = new Date(); push(row, params[1]); return { rows: [] }; }
  if (sql.includes('SET review_on')) { row.review_on = params[1]; push(row, params[2]); return { rows: [] }; }
  if (sql.includes('SET finished_at')) { Object.assign(row, { finished_at: new Date(), finish_action: params[1] }); push(row, params[2]); return { rows: [] }; }
  throw new Error(`Unexpected SQL: ${sql}`);
}

const providers = {
  configuration: () => ({ owner: 'WHS-DTECH', githubConfigured: true, renderConfigured }),
  inspect: async (repository) => {
    calls.push(['inspect', repository]);
    return { fullName: repository, owner, schoolOwned: owner === 'WHS-DTECH', archived: false, latestCommit: COMMIT };
  },
  status: async () => ({ private: false, archived: false, description: '' }),
  label: async (repository, options) => { calls.push(['label', repository, options]); return { private: options.makePrivate }; },
  schoolCopy: async (item, name) => {
    calls.push(['schoolCopy', name]);
    return { repository: `WHS-DTECH/${name}`, url: `https://github.com/WHS-DTECH/${name}`, commit: 'c'.repeat(40), copied: 3, excluded: [] };
  },
  liveDeployments: async () => (renderConfigured ? live : null),
  freeze: async (repository) => { calls.push(['freeze', repository]); return { archived: true }; },
  transfer: async (repository, newOwner) => {
    calls.push(['transfer', repository, newOwner]);
    if (!newOwner) throw new HandoverError('Enter the student\'s GitHub username.');
    return { newOwner };
  }
};

const archiveService = {
  configuration: () => ({ ready: true }),
  preview: async (repository, ref) => {
    calls.push(['preview', repository, ref]);
    return { repository, commit: ref, files: [{ path: 'index.html' }], excluded: [{ path: '.env', reason: 'Potential credentials' }], bytes: 10 };
  },
  archive: async (snapshot, slug, id) => {
    calls.push(['archive', slug, id]);
    return { commit: 'd'.repeat(40), folder: `LegacySites/StudentApps/${slug}/snapshots/x`, url: 'https://github.com/WHS-DTECH/WHS-TECHArchive/tree/x' };
  }
};

test.before(async () => {
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));
  app.use(express.urlencoded({ extended: false }));
  app.use(session({ secret: 'test-only', resave: false, saveUninitialized: false }));
  app.use((req, res, next) => {
    req.user = { id: req.get('x-user') || 'admin', display_name: 'Test Admin', roles: req.get('x-role') === 'teacher' ? ['TEACHER'] : ['ADMIN'] };
    res.locals.activeRole = 'ADMIN';
    next();
  });
  app.use('/student-apps/handovers', createHandoverRouter({ dbQuery, providers, archiveService, today: () => '2026-11-03' }));
  app.use((error, req, res, next) => res.status(500).send(error.message));
  server = await new Promise((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  base = `http://127.0.0.1:${server.address().port}/student-apps/handovers`;
});
test.after(() => new Promise((resolve) => server.close(resolve)));
test.beforeEach(() => {
  rows = new Map(); calls = []; live = []; renderConfigured = true; owner = 'WHS-DTECH';
  apps = new Map([
    ['international', { slug: 'international', name: 'International App', moved_to_development_at: null }],
    ['bus-controller', { slug: 'bus-controller', name: 'Bus Controller App', moved_to_development_at: null }]
  ]);
});

async function formSession() {
  const response = await fetch(base);
  const html = await response.text();
  return { cookie: response.headers.get('set-cookie').split(';')[0], csrf: html.match(/name="csrf" value="([^"]+)"/)[1], html };
}

function post(route, data, cookie, user = 'admin') {
  return fetch(base + route, { method: 'POST', redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie, 'x-user': user }, body: new URLSearchParams(data) });
}

async function start(form) {
  const response = await post('', { csrf: form.csrf, repository: 'https://github.com/WHS-DTECH/WHS_BusController',
    builderId: BUILDER, schoolYear: '2026', permission: 'yes' }, form.cookie);
  assert.equal(response.status, 303);
  return response.headers.get('location').split('/').pop();
}

test('only administrators can view or change handovers', async () => {
  for (const method of ['GET', 'POST']) {
    const response = await fetch(base, { method, headers: { 'x-role': 'teacher' } });
    assert.equal(response.status, 403);
  }
  assert.equal(calls.length, 0);
});

test('forms require a valid CSRF token', async () => {
  const form = await formSession();
  const response = await post('', { csrf: 'wrong', repository: 'WHS-DTECH/x', builderId: BUILDER, schoolYear: '2026', permission: 'yes' }, form.cookie);
  assert.equal(response.status, 403);
  assert.equal(calls.length, 0);
});

test('starting a handover pins the latest commit, escapes names and sets a new-year review date', async () => {
  const form = await formSession();
  const id = await start(form);
  const row = rows.get(id);
  assert.equal(row.source_repository, 'WHS-DTECH/WHS_BusController');
  assert.equal(row.source_commit, COMMIT);
  assert.equal(row.slug, 'whs-buscontroller');
  assert.equal(row.review_on, '2027-02-01');
  const html = await (await fetch(`${base}/${id}`, { headers: { cookie: form.cookie } })).text();
  assert.match(html, /Student &lt;Name&gt;/);
  assert.doesNotMatch(html, /Student <Name>/);
  const again = await post('', { csrf: form.csrf, repository: 'WHS-DTECH/whs_buscontroller', builderId: BUILDER, schoolYear: '2026', slug: 'other', permission: 'yes' }, form.cookie);
  assert.equal(again.status, 409);
});

test('a handover must use a recorded student builder', async () => {
  const form = await formSession();
  assert.match(form.html, /Jonas Full, credited as Student &lt;Name&gt; \(zomotokari-cpu\/WHS_BusController\), left school/);
  const response = await post('', { csrf: form.csrf, repository: 'WHS-DTECH/x', builderId: '99999999-2222-4333-8444-555555555555', schoolYear: '2026', permission: 'yes' }, form.cookie);
  assert.equal(response.status, 400);
  assert.match(await response.text(), /Choose the student builder/);
  assert.equal(calls.length, 0);
});

test('repositories outside the school account must be transferred first', async () => {
  owner = 'zomotokari-cpu';
  const form = await formSession();
  const response = await post('', { csrf: form.csrf, repository: 'zomotokari-cpu/project', builderId: BUILDER, schoolYear: '2026', permission: 'yes' }, form.cookie);
  assert.equal(response.status, 400);
  assert.match(await response.text(), /Transfer ownership/);
  assert.equal(rows.size, 0);
});

test('steps run in order and freezing is blocked while a live site deploys from the Student Work', async () => {
  const form = await formSession();
  const id = await start(form);
  let response = await post(`/${id}/school-copy`, { csrf: form.csrf, mode: 'repository', name: 'Bus-School' }, form.cookie);
  assert.equal(response.status, 409);

  response = await post(`/${id}/label`, { csrf: form.csrf, makePrivate: 'yes' }, form.cookie);
  assert.equal(response.status, 303);
  assert.deepEqual(calls.at(-1), ['label', 'WHS-DTECH/WHS_BusController', { studentName: 'Student <Name>', schoolYear: 2026, makePrivate: true }]);

  response = await post(`/${id}/freeze`, { csrf: form.csrf }, form.cookie);
  assert.equal(response.status, 409);

  response = await post(`/${id}/school-copy`, { csrf: form.csrf, mode: 'existing',
    location: 'https://github.com/WHS-DTECH/WHS_APPSystem/tree/main/src/legacy/bus-controller', creditConfirmed: 'yes' }, form.cookie);
  assert.equal(response.status, 303);
  response = await post(`/${id}/backup/skip`, { csrf: form.csrf, reason: 'School copy holds the source' }, form.cookie);
  assert.equal(response.status, 303);

  live = ['WHS_BusController'];
  response = await post(`/${id}/freeze`, { csrf: form.csrf }, form.cookie);
  assert.equal(response.status, 409);
  assert.match(await response.text(), /Render still deploys from this repository: WHS_BusController/);
  assert.ok(!calls.some(([name]) => name === 'freeze'));

  live = [];
  response = await post(`/${id}/freeze`, { csrf: form.csrf }, form.cookie);
  assert.equal(response.status, 303);
  assert.ok(rows.get(id).frozen_at);

  response = await post(`/${id}/finish`, { csrf: form.csrf, action: 'transferred', newOwner: 'zomotokari-cpu', confirmFinish: 'yes' }, form.cookie);
  assert.equal(response.status, 303);
  assert.deepEqual(calls.at(-1), ['transfer', 'WHS-DTECH/WHS_BusController', 'zomotokari-cpu']);
  assert.equal(rows.get(id).finish_action, 'transferred');
  assert.ok(rows.get(id).history.length >= 6);
});

test('without Render access, freezing needs a manual no-live-site confirmation', async () => {
  renderConfigured = false;
  const form = await formSession();
  const id = await start(form);
  Object.assign(rows.get(id), { labelled_at: new Date(), school_copy_at: new Date(), backup_skipped_reason: 'test' });
  let response = await post(`/${id}/freeze`, { csrf: form.csrf }, form.cookie);
  assert.equal(response.status, 400);
  response = await post(`/${id}/freeze`, { csrf: form.csrf, noLiveSite: 'yes' }, form.cookie);
  assert.equal(response.status, 303);
});

test('backup uses the pinned commit and only the previewing administrator can confirm it', async () => {
  const form = await formSession();
  const id = await start(form);
  let response = await post(`/${id}/backup/preview`, { csrf: form.csrf }, form.cookie);
  assert.equal(response.status, 200);
  assert.deepEqual(calls.at(-1), ['preview', 'WHS-DTECH/WHS_BusController', COMMIT]);
  assert.match(await response.text(), /Potential credentials/);
  response = await post(`/${id}/backup/confirm`, { csrf: form.csrf, confirmReview: 'yes' }, form.cookie, 'other-admin');
  assert.equal(response.status, 400);
  assert.match(await response.text(), /belongs to another administrator/);
  response = await post(`/${id}/backup/confirm`, { csrf: form.csrf, confirmReview: 'yes' }, form.cookie);
  assert.equal(response.status, 303);
  assert.deepEqual(calls.at(-1), ['archive', 'whs-buscontroller', `handover-${id}`]);
});

test('a step already running blocks a second one', async () => {
  const form = await formSession();
  const id = await start(form);
  rows.get(id).busy_until = 'busy';
  const response = await post(`/${id}/label`, { csrf: form.csrf }, form.cookie);
  assert.equal(response.status, 409);
  assert.ok(!calls.some(([name]) => name === 'label'));
});

test('due handovers are highlighted on the list', async () => {
  const form = await formSession();
  const id = await start(form);
  rows.get(id).review_on = '2026-11-01';
  const html = await (await fetch(base, { headers: { cookie: form.cookie } })).text();
  assert.match(html, /Due 2026-11-01/);
});

test('a handed-over app can move out of Student Apps into In Development and be put back', async () => {
  const form = await formSession();
  const id = await start(form);
  let html = await (await fetch(`${base}/${id}`, { headers: { cookie: form.cookie } })).text();
  assert.match(html, /<option value="bus-controller" selected>Bus Controller App<\/option>/);
  assert.match(html, /href="\/module-builder\/p1">Bus Controller App<\/a>/);
  assert.doesNotMatch(html, /module-builder\/p2/);
  assert.equal((await post(`/${id}/move-app`, { csrf: form.csrf, studentApp: 'bus-controller' }, form.cookie)).status, 303);
  assert.ok(apps.get('bus-controller').moved_to_development_at);
  assert.equal(apps.get('international').moved_to_development_at, null);
  assert.equal(rows.get(id).student_app_slug, 'bus-controller');
  assert.equal(rows.get(id).history.at(-1).action, 'Moved out of Student Apps into In Development');
  const again = await post(`/${id}/move-app`, { csrf: form.csrf, studentApp: 'international' }, form.cookie);
  assert.equal(again.status, 409);
  html = await (await fetch(`${base}/${id}`, { headers: { cookie: form.cookie } })).text();
  assert.match(html, /Put back in Student Apps/);
  assert.equal((await post(`/${id}/move-app/undo`, { csrf: form.csrf }, form.cookie)).status, 303);
  assert.equal(apps.get('bus-controller').moved_to_development_at, null);
  assert.equal(rows.get(id).student_app_slug, null);
});

function fakeGithub(routes) {
  const seen = [];
  const fetchImpl = async (url, options = {}) => {
    const key = `${options.method || 'GET'} ${url.replace(/^https:\/\/api\.(github|render)\.com(\/v1)?/, '')}`;
    seen.push({ key, body: options.body ? JSON.parse(options.body) : undefined });
    const handler = routes[key];
    if (!handler) return new Response('{}', { status: 404 });
    const [status, body] = typeof handler === 'function' ? handler(options) : handler;
    return new Response(JSON.stringify(body), { status });
  };
  return { fetchImpl, seen };
}

test('providers parse repositories and credit the student', () => {
  assert.equal(parseRepository('https://github.com/WHS-DTECH/WHS_BusController.git').fullName, 'WHS-DTECH/WHS_BusController');
  assert.throws(() => parseRepository('https://evil.example/WHS-DTECH/x'), HandoverError);
  const text = handoverMarkdown({ source: 'WHS-DTECH/x', commit: COMMIT, studentName: 'Sam', schoolYear: 2026, adminName: 'Admin',
    excluded: [{ path: '.env', reason: 'Potential credentials' }], copiedAt: '2026-11-03' });
  assert.match(text, /Original design and code by Sam/);
  assert.match(text, /`\.env`: Potential credentials/);
});

test('label sends a Student Work description and only requests private when chosen', async () => {
  const { fetchImpl, seen } = fakeGithub({ 'PATCH /repos/WHS-DTECH/app': (options) => [200, { ...JSON.parse(options.body), private: false }] });
  const service = createHandoverProviders({ env: { MODULE_BUILDER_GITHUB_TOKEN: 't' }, fetchImpl });
  await service.label('WHS-DTECH/app', { studentName: 'Sam', schoolYear: 2026, makePrivate: false });
  assert.match(seen[0].body.description, /^Student Work: Sam, 2026\./);
  assert.equal('private' in seen[0].body, false);
});

test('school copy never overwrites an existing repository', async () => {
  const { fetchImpl, seen } = fakeGithub({ 'GET /repos/WHS-DTECH/app-School': [200, { full_name: 'WHS-DTECH/app-School' }] });
  const service = createHandoverProviders({ env: { MODULE_BUILDER_GITHUB_TOKEN: 't' }, fetchImpl });
  await assert.rejects(service.schoolCopy({ source_repository: 'WHS-DTECH/app', source_commit: COMMIT, student_name: 'Sam', school_year: 2026 },
    'app-School', 'Admin'), /already exists/);
  assert.ok(seen.every(({ key }) => key.startsWith('GET ')));
});

test('live deployment check matches only active Render services for the repository', async () => {
  const { fetchImpl } = fakeGithub({ 'GET /services?limit=100': [200, [
    { service: { name: 'Bus', repo: 'https://github.com/WHS-DTECH/WHS_BusController', suspended: 'not_suspended' } },
    { service: { name: 'Old', repo: 'https://github.com/WHS-DTECH/WHS_BusController.git', suspended: 'suspended' } },
    { service: { name: 'Other', repo: 'https://github.com/WHS-DTECH/WHS_BusController2', suspended: 'not_suspended' } }
  ]] });
  const service = createHandoverProviders({ env: { MODULE_BUILDER_GITHUB_TOKEN: 't', MODULE_BUILDER_RENDER_API_KEY: 'r' }, fetchImpl });
  assert.deepEqual(await service.liveDeployments('WHS-DTECH/WHS_BusController'), ['Bus']);
  assert.equal(await createHandoverProviders({ env: {}, fetchImpl }).liveDeployments('WHS-DTECH/x'), null);
});
