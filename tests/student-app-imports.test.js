const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const express = require('express');
const session = require('express-session');
const { createImportRouter } = require('../src/studentAppImports');
const { ArchiveError } = require('../src/studentAppArchive');

const project = { id: 'project-id', slug: 'project-name', name: 'Student <Project>' };
const snapshot = { repository: 'student/project', commit: 'a'.repeat(40), files: [{ path: 'app.py', size: 10 }],
  excluded: [{ path: '.env', reason: 'Potential credentials' }], bytes: 10 };
let server;
let records;
let previewCalls;
let archiveCalls;
let failure;
let ready;
let base;

async function dbQuery(sql, params = []) {
  if (sql === 'SELECT id, slug, name FROM student_apps ORDER BY name') return { rows: [project] };
  if (sql.startsWith('SELECT id, slug, name FROM student_apps WHERE')) return { rows: params[0] === project.id ? [project] : [] };
  if (sql.includes('FROM student_app_imports imports')) return { rows: [...records.values()].map((row) => ({
    ...row, name: project.name, repository: row.snapshot.repository, source_commit: row.snapshot.commit
  })).reverse() };
  if (sql.includes('INSERT INTO student_app_imports')) {
    records.set(params[0], { id: params[0], app_id: params[1], created_by: params[2], snapshot: JSON.parse(params[3]),
      destination_repository: params[4], created_at: new Date(), status: 'preview' });
    return { rows: [] };
  }
  if (sql.includes("SET status = 'importing'")) {
    const record = records.get(params[0]);
    if (!record || record.status !== 'preview' || record.created_by !== params[1] || record.expired) return { rows: [] };
    record.status = 'importing';
    return { rows: [{ ...record }] };
  }
  if (sql.includes("SET status = 'completed'")) {
    Object.assign(records.get(params[0]), { status: 'completed', archive_commit: params[1], archive_folder: params[2], archive_url: params[3] });
    return { rows: [] };
  }
  if (sql.includes("SET status = 'failed'")) {
    Object.assign(records.get(params[0]), { status: 'failed', error_message: params[1] });
    return { rows: [] };
  }
  throw new Error(`Unexpected SQL: ${sql}`);
}

test.before(async () => {
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));
  app.use(express.urlencoded({ extended: false }));
  app.use(session({ secret: 'test-only', resave: false, saveUninitialized: false }));
  app.use((req, res, next) => {
    req.user = { id: req.get('x-user') || 'admin', roles: req.get('x-role') === 'builder' ? ['Student'] : ['ADMIN'] };
    res.locals.activeRole = 'ADMIN';
    next();
  });
  app.use('/student-apps/github-import', createImportRouter({
    dbQuery, service: {
      configuration: () => ({ ready, missing: ready ? [] : ['GITHUB_READER_APP_ID'], destination: 'WHS-DTECH/WHS-TECHArchive' }),
      preview: async (repository, ref) => {
        previewCalls.push([repository, ref]);
        if (failure) throw new ArchiveError('GitHub denied access.', 502);
        return snapshot;
      },
      archive: async (data, slug, id) => {
        archiveCalls.push([data, slug, id]);
        if (failure) throw new ArchiveError('GitHub rejected the archive update.', 502);
        return { commit: 'b'.repeat(40), folder: `LegacySites/StudentApps/${slug}/snapshots/commit`,
          url: 'https://github.com/WHS-DTECH/WHS-TECHArchive/tree/commit' };
      }
    }
  }));
  app.use((error, req, res, next) => res.status(500).send(error.message));
  server = await new Promise((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  base = `http://127.0.0.1:${server.address().port}/student-apps/github-import`;
});
test.after(() => new Promise((resolve) => server.close(resolve)));
test.beforeEach(() => { records = new Map(); previewCalls = []; archiveCalls = []; failure = false; ready = true; });

async function formSession() {
  const response = await fetch(base);
  const html = await response.text();
  const cookie = response.headers.get('set-cookie').split(';')[0];
  const csrf = html.match(/name="csrf" value="([^"]+)"/)[1];
  return { cookie, csrf, html };
}

async function post(route, data, cookie, user = 'admin') {
  return fetch(base + route, { method: 'POST', redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie, 'x-user': user }, body: new URLSearchParams(data) });
}

async function preview() {
  const form = await formSession();
  const response = await post('/preview', { csrf: form.csrf, appId: project.id, repository: 'student/project', ref: 'main', reviewConsent: 'yes' }, form.cookie);
  assert.equal(response.status, 200);
  return { ...form, response, id: [...records.keys()][0] };
}

test('only administrators can view or submit imports', async () => {
  for (const method of ['GET', 'POST']) {
    const response = await fetch(base + (method === 'POST' ? '/preview' : ''), { method, headers: { 'x-role': 'builder' } });
    assert.equal(response.status, 403);
  }
  assert.equal(previewCalls.length, 0);
});

test('connection status is explicit and credentials are not rendered', async () => {
  ready = false;
  const { html } = await formSession();
  assert.match(html, /Not configured/);
  assert.match(html, /GITHUB_READER_APP_ID/);
  assert.match(html, /Preview source<\/button>/);
  assert.doesNotMatch(html, /PRIVATE KEY/);
});

test('preview requires a valid CSRF token, registered project and consent before accessing GitHub', async () => {
  const { cookie, csrf } = await formSession();
  for (const token of ['', 'wrong', 'é'.repeat(64)]) {
    assert.equal((await post('/preview', { csrf: token }, cookie)).status, 403);
  }
  assert.equal((await post('/preview', { csrf, appId: 'not-registered', reviewConsent: 'yes' }, cookie)).status, 400);
  assert.equal((await post('/preview', { csrf, appId: project.id }, cookie)).status, 400);
  assert.equal(previewCalls.length, 0);
});

test('preview renders escaped file lists and a separate review acknowledgement without writing archive', async () => {
  const { response } = await preview();
  const html = await response.text();
  assert.match(html, /Student &lt;Project&gt;/);
  assert.match(html, /app.py/);
  assert.match(html, /Potential credentials/);
  assert.match(html, /name="confirmReview"/);
  assert.match(html, /snapshots/);
  assert.equal(archiveCalls.length, 0);
  assert.deepEqual(previewCalls, [['student/project', 'main']]);
});

test('confirm uses stored pinned source, records success and prevents double submission', async () => {
  const { cookie, csrf, id } = await preview();
  const response = await post('/confirm', { csrf, importId: id, confirmReview: 'yes', repository: 'attacker/ignored' }, cookie);
  assert.equal(response.status, 303);
  assert.equal(archiveCalls.length, 1);
  assert.deepEqual(archiveCalls[0], [snapshot, project.slug, id]);
  assert.equal(records.get(id).status, 'completed');
  const repeated = await post('/confirm', { csrf, importId: id, confirmReview: 'yes' }, cookie);
  assert.equal(repeated.status, 400);
  assert.equal(archiveCalls.length, 1);
});

test('another administrator, expired preview and missing confirmation cannot import', async () => {
  const { cookie, csrf, id } = await preview();
  assert.equal((await post('/confirm', { csrf, importId: id }, cookie)).status, 400);
  assert.equal((await post('/confirm', { csrf, importId: id, confirmReview: 'yes' }, cookie, 'other-admin')).status, 400);
  records.get(id).expired = true;
  assert.equal((await post('/confirm', { csrf, importId: id, confirmReview: 'yes' }, cookie)).status, 400);
  assert.equal(archiveCalls.length, 0);
});

test('GitHub failures are visible and never reported as a completed import', async () => {
  const { cookie, csrf, id } = await preview();
  failure = true;
  const response = await post('/confirm', { csrf, importId: id, confirmReview: 'yes' }, cookie);
  assert.equal(response.status, 502);
  assert.match(await response.text(), /GitHub rejected/);
  assert.equal(records.get(id).status, 'failed');
  assert.equal(records.get(id).archive_url, undefined);
});

test('changing the destination after preview requires a new review', async () => {
  const { cookie, csrf, id } = await preview();
  records.get(id).destination_repository = 'another/private-archive';
  const response = await post('/confirm', { csrf, importId: id, confirmReview: 'yes' }, cookie);
  assert.equal(response.status, 400);
  assert.match(await response.text(), /destination changed/);
  assert.equal(archiveCalls.length, 0);
  assert.equal(records.get(id).status, 'failed');
});
