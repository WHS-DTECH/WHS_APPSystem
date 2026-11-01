const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');
const session = require('express-session');
const { createGoogleCalendarRouter, SCOPES, configuration, decryptTokens, encryptTokens } = require('./googleCalendar');
const { DOCS_SCOPE } = require('./googleDocEvents');
const { TASKS_SCOPE } = require('./googleTasks');

test('Tasks reuses private Google consent, preserves scopes and isolates list/create/complete operations', async t => {
  const env = { GOOGLE_CALENDAR_CLIENT_ID: 'fixture-client', GOOGLE_CALENDAR_CLIENT_SECRET: 'fixture-secret',
    GOOGLE_CALENDAR_TOKEN_KEY: crypto.randomBytes(32).toString('base64'), APP_BASE_URL: 'https://planner.example.test' };
  const rows = new Map(), owner = { id: crypto.randomUUID() }, other = { id: crypto.randomUUID(), roles: ['ADMIN'] };
  let user = owner, granted = SCOPES, fail = '', refreshed = 0, version = 1;
  const query = async (sql, values) => {
    const row = rows.get(values[0]);
    if (sql.startsWith('SELECT')) return { rows: row ? [{ ...row }] : [] };
    if (sql.startsWith('INSERT')) {
      const [owner_id, connection_id, google_subject, email, encrypted_tokens, selected] = values;
      rows.set(owner_id, { owner_id, connection_id, google_subject, email, encrypted_tokens, selected_calendars: JSON.parse(selected) });
      return { rows: [] };
    }
    if (sql.startsWith('UPDATE') && row?.connection_id === values[1]) {
      row.encrypted_tokens = values[2]; return { rows: [{ connection_id: row.connection_id }] };
    }
    throw new Error('Unexpected fixture SQL');
  };
  const calls = [], writes = [];
  const provider = async (target, options) => {
    const url = new URL(target); calls.push({ url, options });
    assert.equal(options.redirect, 'error');
    if (url.pathname === '/token') {
      if (new URLSearchParams(options.body).get('grant_type') === 'refresh_token') refreshed++;
      return Response.json({ access_token: 'fixture-token', refresh_token: 'fixture-refresh', expires_in: 3600,
        scope: (fail === 'missing-scope' ? SCOPES : granted).join(' ') });
    }
    if (url.pathname.endsWith('/userinfo')) return Response.json({ id: 'google-owner', email: 'teacher@example.test', verified_email: true });
    if (url.pathname.endsWith('/calendarList')) return Response.json({ items: [{ id: 'primary', summary: 'Calendar', primary: true }] });
    assert.equal(url.hostname, 'tasks.googleapis.com');
    assert.equal(options.headers.Authorization, 'Bearer fixture-token');
    if (fail === 'network') throw new Error('secret provider body');
    if (fail === 'denied') return Response.json({ secret: 'do not expose' }, { status: 403 });
    if (fail === 'unavailable') return Response.json({}, { status: 503 });
    if (fail === 'unreadable') return new Response('not-json');
    if (options.method === 'POST' || options.method === 'PATCH') {
      writes.push({ path: url.pathname, options });
      if (fail === 'conflict') return Response.json({}, { status: 412 });
      if (fail === 'unconfirmed') return Response.json({});
      if (fail === 'swap') rows.get(owner.id).connection_id = crypto.randomUUID();
      return Response.json(options.method === 'PATCH' ? { id: 'task', status: JSON.parse(options.body).status } : { id: 'created' });
    }
    if (url.pathname.endsWith('/tasks/task')) return Response.json({
      id: 'task', title: 'Task', etag: '"version-' + version + '"', ...(fail === 'assigned' ? { assignmentInfo: { linkToTask: 'private' } } : {})
    });
    if (url.pathname.endsWith('/users/@me/lists')) {
      if (fail === 'empty') return Response.json({});
      return Response.json({ items: [{ id: 'list-' + (url.searchParams.get('pageToken') || 'first'), title: '<script>List</script>' }],
        ...(url.searchParams.has('pageToken') && fail !== 'too-many' ? {} : { nextPageToken: 'second' }) });
    }
    if (url.pathname.endsWith('/tasks')) {
      assert.equal(url.searchParams.get('showCompleted'), 'true');
      assert.equal(url.searchParams.get('showHidden'), 'true');
      assert.equal(url.searchParams.get('showDeleted'), 'false');
      return Response.json({ items: [
        { id: 'task-' + (url.searchParams.get('pageToken') || 'first'), title: '<img onerror=bad()>', notes: 'Private notes', status: 'needsAction', due: '2026-10-19T00:00:00.000Z' },
        { id: 'done', title: 'Completed', status: 'completed', parent: 'parent' },
        { id: 'deleted', deleted: true }
      ], ...(url.searchParams.has('pageToken') ? {} : { nextPageToken: 'second' }) });
    }
    throw new Error('Unexpected Tasks provider request');
  };
  const app = express();
  app.use(express.json());
  app.use(session({ secret: 'tasks-fixture', saveUninitialized: false, resave: false }));
  app.use((req, res, next) => { req.user = user; next(); });
  app.use('/google', createGoogleCalendarRouter({ query, env, fetchImpl: provider }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = 'http://127.0.0.1:' + server.address().port + '/google';
  let cookie;
  async function call(path = '/', method = 'GET', body) {
    const response = await fetch(base + path, { method, headers: { ...(cookie ? { cookie } : {}), 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
    return response;
  }
  async function begin(body) {
    const response = await call('/connect', 'POST', body);
    assert.equal(response.status, 200);
    const url = new URL((await response.json()).url);
    granted = url.searchParams.get('scope').split(' ');
    return url.searchParams.get('state');
  }
  const callback = state => call('/callback?code=fixture-code&state=' + state);
  let state = await begin({ includeDocs: true });
  assert.ok(granted.includes(DOCS_SCOPE)); assert.ok(!granted.includes(TASKS_SCOPE));
  assert.equal((await callback(state)).status, 200);
  let status = await (await call()).json();
  assert.equal(status.tasksEnabled, false);
  assert.equal((await call('/tasks/lists?connectionId=' + status.connectionId)).status, 409);
  assert.equal((await call('/connect', 'POST', { includeTasks: 'true' })).status, 400);
  state = await begin({ includeTasks: true });
  assert.ok(granted.includes(DOCS_SCOPE)); assert.ok(granted.includes(TASKS_SCOPE));
  fail = 'missing-scope'; assert.equal((await callback(state)).status, 403);
  assert.equal((await (await call()).json()).tasksEnabled, false);
  fail = ''; state = await begin({ includeTasks: true }); assert.equal((await callback(state)).status, 200);
  status = await (await call()).json();
  assert.equal(status.docsEnabled, true); assert.equal(status.tasksEnabled, true);
  assert.ok(!JSON.stringify(status).includes('fixture-token'));
  state = await begin({});
  assert.ok(granted.includes(DOCS_SCOPE) && granted.includes(TASKS_SCOPE), 'Calendar reconnect keeps optional permissions');
  assert.equal((await call('/callback?state=' + state + '&error=access_denied')).status, 400);
  const id = status.connectionId, list = '/tasks/lists/list-first/tasks';
  const listsUrl = '/tasks/lists?connectionId=' + id, tasksUrl = list + '?connectionId=' + id;
  assert.equal((await call('/tasks/lists')).status, 409);
  assert.equal((await (await call(listsUrl)).json()).lists.length, 2);
  const tasks = await (await call(tasksUrl)).json();
  assert.equal(tasks.tasks.length, 4); assert.equal(tasks.tasks[0].due, '2026-10-19');
  assert.equal(tasks.tasks[0].title, '<img onerror=bad()>'); assert.equal(tasks.tasks[1].parent, 'parent');
  user = other;
  assert.equal((await call(listsUrl + '&owner_id=' + owner.id)).status, 409);
  assert.equal((await call(list, 'POST', { connectionId: id, title: 'Forged', owner_id: owner.id })).status, 409);
  user = owner;
  assert.equal((await call(list, 'POST', { connectionId: 'stale', title: 'Test' })).status, 409);
  for (const body of [{ title: '' }, { title: 'x'.repeat(1025) }, { title: 'Task', due: '2026-02-30' }, { title: 'Task', notes: 5 }]) {
    assert.equal((await call(list, 'POST', { connectionId: id, ...body })).status, 400);
  }
  assert.equal(writes.length, 0);
  assert.equal((await call(list, 'POST', { connectionId: id, title: '  Test  ', notes: 'Note', due: '2026-10-21', status: 'completed', owner: other.id })).status, 201);
  assert.deepEqual(JSON.parse(writes[0].options.body), { title: 'Test', notes: 'Note', due: '2026-10-21T00:00:00.000Z' });
  assert.equal((await call(list + '/task', 'PATCH', { connectionId: id, completed: true, title: 'Forged' })).status, 200);
  assert.deepEqual(JSON.parse(writes[1].options.body), { status: 'completed' });
  assert.equal(writes[1].options.headers['If-Match'], '"version-1"');
  version = 2;
  assert.equal((await call(list + '/task', 'PATCH', { connectionId: id, completed: false })).status, 200);
  assert.deepEqual(JSON.parse(writes[2].options.body), { status: 'needsAction', completed: null });
  assert.equal(writes[2].options.headers['If-Match'], '"version-2"');
  assert.equal((await call(list + '/task', 'PATCH', { connectionId: id, completed: 'true' })).status, 400);
  fail = 'assigned';
  assert.equal((await call(list + '/task', 'PATCH', { connectionId: id, completed: true })).status, 409);
  assert.equal(writes.length, 3);
  fail = 'conflict';
  assert.equal((await call(list + '/task', 'PATCH', { connectionId: id, completed: true })).status, 409);
  fail = 'unconfirmed';
  assert.equal((await call(list, 'POST', { connectionId: id, title: 'Check response' })).status, 502);
  assert.equal((await call(list + '/task', 'PATCH', { connectionId: id, completed: true })).status, 502);
  fail = 'empty'; assert.deepEqual((await (await call(listsUrl)).json()).lists, []);
  fail = 'too-many'; assert.equal((await call(listsUrl)).status, 502);
  for (const mode of ['network', 'unavailable', 'unreadable', 'denied']) {
    fail = mode; const response = await call(list, 'POST', { connectionId: id, title: 'Uncertain' });
    assert.equal(response.status, mode === 'denied' ? 403 : 502);
    const text = await response.text(); assert.ok(!text.includes('secret'));
    if (mode !== 'denied') assert.match(text, /No automatic retry/);
  }
  fail = '';
  const row = rows.get(owner.id), config = configuration(env);
  const tokens = decryptTokens(row.encrypted_tokens, config.key, owner.id);
  tokens.expiresAt = 0; row.encrypted_tokens = encryptTokens(tokens, config.key, owner.id);
  assert.equal((await call(listsUrl)).status, 200); assert.equal(refreshed, 1);
  assert.ok(decryptTokens(row.encrypted_tokens, config.key, owner.id).scopes.includes(TASKS_SCOPE));
  fail = 'swap';
  assert.equal((await call(list, 'POST', { connectionId: id, title: 'Changed connection' })).status, 409);
  assert.equal((await call(tasksUrl)).status, 409);
  assert.equal((await call(list + '/task', 'DELETE', { connectionId: row.connection_id })).status, 404, 'no delete endpoint');
});
