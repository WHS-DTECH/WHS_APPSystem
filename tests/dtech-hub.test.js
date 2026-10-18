const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const vm = require('vm');
const express = require('express');
const session = require('express-session');
const { accessForEmail, prefixText, prefixData, canWrite, createDtechRouter } = require('../src/modules/dtechHub');
const { createTeachingFileStore } = require('../src/dtechFiles');
const { navData } = require('../src/globalNav');

test('original activity details accept the shared school session without legacy OAuth tokens', async () => {
  const source = prefixText(await fs.readFile(path.join(__dirname, '..', 'src', 'legacy', 'dtech-hub', 'ProjectPages', 'activity-detail.js'), 'utf8'));
  const start = source.indexOf('function hasDetailPageAccess()');
  const end = source.indexOf('const DETAIL_HUB_VIEW_MODE_KEY', start);
  const storage = new Map();
  const context = {
    window: { whsDtech: { profile: { email: 'teacher@westlandhigh.school.nz' }, expiresAt: Date.now() + 60000 } },
    localStorage: { getItem: (key) => storage.get(key) },
    sessionStorage: { getItem: (key) => storage.get(key) },
    detailAllowedDomain: 'westlandhigh.school.nz', DETAIL_HUB_AUTH_STORAGE_KEY: 'whs_dtech_auth_v1'
  };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  assert.equal(vm.runInContext('hasDetailPageAccess()', context), true);
  context.window.whsDtech.profile.email = 'outside@example.test';
  assert.equal(vm.runInContext('hasDetailPageAccess()', context), false);
  context.window.whsDtech.profile.email = 'teacher@westlandhigh.school.nz';
  context.window.whsDtech.expiresAt = Date.now() - 1000;
  assert.equal(vm.runInContext('hasDetailPageAccess()', context), false);
  delete context.window.whsDtech;
  assert.equal(vm.runInContext('hasDetailPageAccess()', context), false);
  storage.set('whs_dtech_auth_v1', JSON.stringify({
    profile: { email: 'student@westlandhigh.school.nz' }, idToken: 'legacy-token', expiresAt: Date.now() + 60000
  }));
  assert.equal(vm.runInContext('hasDetailPageAccess()', context), true);
});

test('DTECH appears in the shared account Settings role controls', async () => {
  let body;
  await navData(async () => ({ rows: [] }), async (user, hub) => hub === 'dtech-hub')(
    { user: { email: 'teacher@westlandhigh.school.nz' }, query: { path: '/dtech-hub/admin-menu.html' } },
    { locals: { activeRole: 'Teacher', isAdmin: false }, set() {}, json(value) { body = value; } },
    (error) => { throw error; }
  );
  assert.equal(body.assignRolesUrl, '/hubs/dtech-hub/roles');
});

test('DTECH role authority excludes legacy Student Admin and honours current shared permissions', async () => {
  let sql;
  const lookup = async (text) => {
    sql = text;
    return { rows: [{ hub_roles: ['student-admin'], permissions: [], system_admin: false }] };
  };
  const access = await accessForEmail('student@example.test', lookup);
  assert.equal(access.role, 'Student');
  assert.equal(access.admin, false);
  assert.equal(access.teacher, false);
  assert.match(sql, /hr.role_key <> 'student-admin'/);
  assert.match(sql, /users.is_active = TRUE/);
  const teacher = await accessForEmail('teacher@example.test', async () => ({
    rows: [{ hub_roles: ['teacher'], permissions: ['teacher.view', 'activities.upload'], system_admin: false }]
  }));
  assert.equal(teacher.teacher, true);
  assert.equal(teacher.admin, false);
  assert.equal(canWrite(teacher, '/api/activities'), true);
  assert.equal(canWrite(teacher, '/api/admin/user-roles'), false);
  assert.equal(canWrite(access, '/api/lessons'), false);
  assert.equal(canWrite(access, '/api/student/drive-setup/confirm'), true);
});

test('prefix adapter preserves delimiters, external links and nested API/static paths', () => {
  const original = 'fetch("/api/activities"); const parts = value.split("/"); const home = "/index.html"; const remote = "https://example.test/api/";';
  const adapted = prefixText(original);
  new vm.Script(adapted);
  assert.match(adapted, /fetch\("\/dtech-hub\/api\/activities"\)/);
  assert.match(adapted, /split\("\/"\)/);
  assert.match(adapted, /"https:\/\/example.test\/api\/"/);
  assert.equal(prefixText('href="/learning-pathways/"'), 'href="/dtech-hub/learning-pathways/"');
  assert.equal(prefixText('`${window.location.origin}/trello-callback.html`'), '`${window.location.origin}/dtech-hub/trello-callback.html`');
  assert.deepEqual(prefixData({ url: '/TeacherFiles/file.pdf', remote: '//example.test/file' }),
    { url: '/dtech-hub/TeacherFiles/file.pdf', remote: '//example.test/file' });
});

test('adapted original Trello URLs preserve template expressions and encoded query values', async () => {
  const source = prefixText(await fs.readFile(path.join(__dirname, '..', 'src', 'legacy', 'dtech-hub', 'ProjectPages', 'activity-detail.js'), 'utf8'));
  const expressions = source.match(/`[^`\r\n]*\/api\/integrations\/trello\/(?:connections|list-progress)\?[^`\r\n]*`/g);
  assert.equal(expressions.length, 4);
  const email = 'student@westlandhigh.school.nz';
  const emails = [email, 'second@westlandhigh.school.nz'];
  const board = 'https://trello.com/b/fixture/board?filter=a&b=c';
  for (const expression of expressions) {
    const value = vm.runInNewContext(expression, {
      email, emails, studentEmail: email, trelloUrl: board,
      currentDecompositionTrelloUrl: board, encodeURIComponent
    });
    const url = new URL(value, 'https://school.example');
    assert.ok(url.pathname.startsWith('/dtech-hub/api/integrations/trello/'));
    if (url.pathname.endsWith('/connections')) assert.equal(url.searchParams.get('emails'), emails.join(','));
    else {
      assert.equal(url.searchParams.get('student_email'), email);
      assert.equal(url.searchParams.get('board_url'), board);
    }
  }
  assert.equal(prefixText('fetch(`/api/activities/${items.join("/")}`)'), 'fetch(`/dtech-hub/api/activities/${items.join("/")}`)');
  assert.equal(prefixText('"/dtech-hub/api/activities"'), '"/dtech-hub/api/activities"');
});

test('Trello progress reports missing connection explicitly and retains the original link', async () => {
  const source = await fs.readFile(path.join(__dirname, '..', 'src', 'legacy', 'dtech-hub', 'ProjectPages', 'activity-detail.js'), 'utf8');
  const start = source.indexOf('await Promise.all(trelloStatusCells.map(async (cell) => {');
  const end = source.indexOf('section.querySelectorAll(".interest-progress-btn")', start);
  const messages = [];
  const cell = {
    innerHTML: '<a>Open Trello</a>',
    getAttribute: (name) => name === 'data-student-email' ? 'student@westlandhigh.school.nz' : 'https://trello.com/b/fixture',
    insertAdjacentHTML(position, html) { this.innerHTML += html; }
  };
  await vm.runInNewContext(`(async () => { ${prefixText(source.slice(start, end))} })()`, {
    trelloStatusCells: [cell], buildWriteHeaders: () => ({}),
    fetch: async () => ({ ok: false, status: 404, json: async () => ({ error: 'Student has not connected Trello' }) }),
    encodeURIComponent, escapeHtml: (value) => value,
    console: { error(...args) { messages.push(args); } }
  });
  assert.match(cell.innerHTML, /<a>Open Trello<\/a>/);
  assert.match(cell.innerHTML, /Student has not connected Trello/);
  assert.equal(messages.length, 1);
});

test('Trello list progress 404 is the original explicit missing-connection response', async () => {
  const source = await fs.readFile(path.join(__dirname, '..', 'src', 'legacy', 'dtech-hub', 'server.js'), 'utf8');
  const start = source.indexOf('app.get("/api/integrations/trello/list-progress",');
  const end = source.indexOf('app.post("/api/integrations/trello/connect",', start);
  let handler;
  vm.runInNewContext(source.slice(start, end), {
    app: { get(route, guard, callback) { handler = callback; } },
    requireTrelloBoardReadAccess() {},
    normalizeEmail: (value) => value.toLowerCase(),
    isSchoolEmail: () => true,
    getStoredTrelloConnection: async () => null
  });
  let status;
  let body;
  await handler({ query: { student_email: 'student@westlandhigh.school.nz', board_url: 'https://trello.com/b/fixture' } }, {
    status(value) { status = value; return this; },
    json(value) { body = value; }
  });
  assert.equal(status, 404);
  assert.equal(body.error, 'Student has not connected Trello');
});

test('shared session adds CSRF to legacy fetch and XHR uploads, never external requests', async () => {
  const storage = new Map();
  const calls = [];
  class XHR {
    constructor() { this.headers = {}; }
    open(method, url) { this.url = url; }
    setRequestHeader(name, value) { this.headers[name] = value; }
    send() { return this.headers; }
  }
  const window = {
    whsDtech: { profile: { email: 'student@westlandhigh.school.nz' }, csrf: 'fixture-csrf', viewMode: 'student', expiresAt: Date.now() + 10000 },
    fetch: async (...args) => { calls.push(args); }
  };
  const cache = { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value) };
  vm.runInNewContext(await fs.readFile(path.join(__dirname, '..', 'public', 'dtech-session.js'), 'utf8'), {
    window, localStorage: cache, sessionStorage: cache, console, Headers, Request, URL, XMLHttpRequest: XHR,
    document: { documentElement: { classList: { add(value) { assert.equal(value, 'whs-dtech-integrated'); } } } },
    location: { href: 'https://school.example/dtech-hub/', origin: 'https://school.example' }
  });
  assert.equal(window.getEffectiveHubViewMode(), 'student');
  await window.fetch('/dtech-hub/api/student/drive-setup/confirm', { method: 'POST' });
  assert.equal(calls[0][1].headers.get('x-dtech-csrf'), 'fixture-csrf');
  await window.fetch('https://www.googleapis.com/drive/v3/files', { method: 'POST' });
  assert.equal(calls[1][1].headers, undefined);
  const xhr = new XHR();
  xhr.open('POST', '/dtech-hub/api/staff_upload');
  xhr.send();
  assert.equal(xhr.headers['x-dtech-csrf'], 'fixture-csrf');
  const external = new XHR();
  external.open('POST', 'https://example.test/upload');
  external.send();
  assert.equal(external.headers['x-dtech-csrf'], undefined);
  const state = JSON.parse(storage.get('whs_dtech_auth_v1'));
  assert.equal(state.profile.email, window.whsDtech.profile.email);
  assert.equal(state.idToken, undefined);
  assert.equal(state.accessToken, undefined);
});

test('all original page files remain present and every adapted frontend script parses', async () => {
  const root = path.join(__dirname, '..', 'src', 'legacy', 'dtech-hub');
  let pages = 0;
  let scripts = 0;
  async function visit(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'TeacherFiles') continue;
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(filename);
      else if (entry.name.endsWith('.html')) pages++;
      else if (entry.name.endsWith('.js')) {
        new vm.Script(prefixText(await fs.readFile(filename, 'utf8')), { filename });
        scripts++;
      }
    }
  }
  await visit(root);
  assert.ok(pages >= 60, `Only ${pages} original pages found`);
  assert.ok(scripts >= 60);
});

test('teaching files survive a fresh cache using private archive plus database uploads', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'whs-dtech-files-'));
  const records = new Map();
  const pool = { query: async (sql, values) => {
    if (sql.startsWith('CREATE')) return { rows: [] };
    if (sql.startsWith('INSERT')) { records.set(values[0], values[1]); return { rows: [] }; }
    if (sql === 'SELECT path FROM whs_teaching_files ORDER BY path') return { rows: [...records.keys()].map((name) => ({ path: name })) };
    if (sql.startsWith('SELECT content')) return { rows: [{ content: records.get(values[0]) }] };
    throw new Error('Unexpected SQL');
  } };
  const archive = { async *teachingFiles() { yield { path: 'template.docx', bytes: Buffer.from('original') }; } };
  const store = createTeachingFileStore({ pool, directory, archive });
  try {
    await store.initialize();
    await store.save('Lesson Plans/Uploaded/new.pdf', Buffer.from('new resource'), 'application/pdf');
    await fs.unlink(path.join(directory, 'Lesson Plans', 'Uploaded', 'new.pdf'));
    await createTeachingFileStore({ pool, directory, archive }).initialize();
    assert.equal((await fs.readFile(path.join(directory, 'Lesson Plans', 'Uploaded', 'new.pdf'))).toString(), 'new resource');
    assert.equal((await fs.readFile(path.join(directory, 'template.docx'))).toString(), 'original');
    await assert.rejects(store.save('../escape.pdf', Buffer.from('bad')), /Invalid DTECH/);
    const failure = createTeachingFileStore({ pool: { query: async () => { throw new Error('DB unavailable'); } }, directory, archive });
    await assert.rejects(failure.save('failed.pdf', Buffer.from('data')), /DB unavailable/);
    await assert.rejects(fs.stat(path.join(directory, 'failed.pdf')), { code: 'ENOENT' });
  } finally {
    await fs.rm(directory, { recursive: true });
  }
});

test('hosted DTECH rejects forged identities, old role editors, source access and missing configuration', async () => {
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));
  app.use(session({ secret: 'isolated-dtech-test', resave: false, saveUninitialized: false, cookie: { maxAge: 10000 } }));
  app.use((req, res, next) => {
    res.locals.activeRole = 'Student';
    if (req.get('x-test-user')) req.user = { email: 'student@westlandhigh.school.nz', roles: ['Student'] };
    next();
  });
  app.use('/dtech-hub', createDtechRouter({
    env: {},
    dbQuery: async () => ({ rows: [{ system_admin: false, hub_roles: ['student-admin'], permissions: [] }] })
  }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/dtech-hub`;
  try {
    let response = await fetch(`${base}/api/activities`, { headers: { 'x-user-email': 'admin@example.test', 'x-user-role': 'Admin' } });
    assert.equal(response.status, 401);
    response = await fetch(`${base}/api/admin/user-roles`, { headers: { 'x-test-user': 'yes' } });
    assert.equal(response.status, 409);
    response = await fetch(`${base}/api/admin/maintenance`, { headers: { 'x-test-user': 'yes', 'x-user-role': 'Admin' } });
    assert.equal(response.status, 403);
    response = await fetch(`${base}/`, { headers: { 'x-test-user': 'yes' } });
    assert.equal(response.status, 503);
    assert.doesNotMatch(await response.text(), /DTECH_DATABASE_URL/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
