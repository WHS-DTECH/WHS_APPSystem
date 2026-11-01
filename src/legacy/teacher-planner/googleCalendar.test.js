const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');
const session = require('express-session');
const { Pool } = require('pg');
const fs = require('node:fs/promises');
const path = require('node:path');
const vm = require('node:vm');
const { createGoogleCalendarRouter, configuration, encryptTokens, decryptTokens, nzMidnight, normaliseEvent, SCOPES } = require('./googleCalendar');
const { DOCUMENT_ID, DOCS_SCOPE } = require('./googleDocEvents');

const env = {
  GOOGLE_CALENDAR_CLIENT_ID: 'fixture-client', GOOGLE_CALENDAR_CLIENT_SECRET: 'fixture-secret',
  GOOGLE_CALENDAR_TOKEN_KEY: Buffer.alloc(32, 7).toString('base64'), APP_BASE_URL: 'https://planner.example.test'
};
test('Google configuration is optional, but partial or unsafe configuration fails explicitly', () => {
  assert.equal(configuration({}), null);
  assert.equal(configuration(env).redirectUri, 'https://planner.example.test/api/planner/google-calendar/callback');
  for (const config of [{ GOOGLE_CALENDAR_CLIENT_ID: 'incomplete' },
    { ...env, GOOGLE_CALENDAR_TOKEN_KEY: 'bad' }, { ...env, APP_BASE_URL: 'http://example.test' },
    { ...env, APP_BASE_URL: 'https://example.test/path' }]) assert.throws(() => configuration(config));
});
test('stored Google tokens are authenticated, encrypted and bound to the school owner', () => {
  const key = configuration(env).key, owner = crypto.randomUUID();
  const tokens = { accessToken: 'fixture-access', refreshToken: 'fixture-refresh', expiresAt: 42 };
  const value = encryptTokens(tokens, key, owner);
  assert.ok(!value.includes(tokens.refreshToken));
  assert.notEqual(value, encryptTokens(tokens, key, owner));
  assert.deepEqual(decryptTokens(value, key, owner), tokens);
  assert.throws(() => decryptTokens(value, key, crypto.randomUUID()));
  const altered = Buffer.from(value, 'base64'); altered[altered.length - 1] ^= 1;
  assert.throws(() => decryptTokens(altered.toString('base64'), key, owner));
});
test('Google week boundaries use NZ midnight including daylight saving and year rollover', () => {
  for (const [day, expected] of [
    ['2026-10-18', '2026-10-17T11:00:00.000Z'], ['2026-07-19', '2026-07-18T12:00:00.000Z'],
    ['2026-09-27', '2026-09-26T12:00:00.000Z'], ['2026-09-28', '2026-09-27T11:00:00.000Z'],
    ['2026-04-05', '2026-04-04T11:00:00.000Z'], ['2026-04-06', '2026-04-05T12:00:00.000Z'],
    ['2027-01-01', '2026-12-31T11:00:00.000Z']
  ]) assert.equal(nzMidnight(day), expected, day);
});
test('Google events preserve exclusive all-day ends, normalise offsets and suppress cancelled entries', () => {
  const calendar = { id: 'primary', summary: 'My calendar' };
  assert.equal(normaliseEvent({ status: 'cancelled' }, calendar), null);
  const event = normaliseEvent({ id: 'one', summary: '<img src=x>', start: { dateTime: '2026-10-19T09:00:00+13:00' },
    end: { dateTime: '2026-10-19T10:00:00+13:00' }, htmlLink: 'https://evil.test/' }, calendar);
  assert.equal(event.start, '2026-10-18T20:00:00.000Z');
  assert.equal(event.htmlLink, '');
  assert.equal(event.title, '<img src=x>');
  const allDay = normaliseEvent({ id: 'two', start: { date: '2026-10-19' }, end: { date: '2026-10-20' } }, calendar);
  assert.equal(allDay.allDay, true);
  assert.equal(allDay.end, '2026-10-20');
  assert.throws(() => normaliseEvent({ start: { date: 'bad' }, end: { date: 'bad' } }, calendar));
  assert.throws(() => normaliseEvent({ start: { date: '2026-02-30' }, end: { date: '2026-03-05' } }, calendar));
});

test('private Google API handles consent, owner isolation, refresh, selection, pagination and disconnect', {
  skip: !process.env.PLANNER_TEST_DATABASE_URL
}, async t => {
  const pool = new Pool({ connectionString: process.env.PLANNER_TEST_DATABASE_URL, ssl: false });
  const db = await pool.connect();
  const schema = 'google_fixture_' + crypto.randomBytes(8).toString('hex');
  let server;
  try {
    await db.query('CREATE SCHEMA ' + schema);
    await db.query('SET search_path TO ' + schema);
    await db.query(await fs.readFile(path.join(__dirname, 'db', 'migrations', '006_google_calendar.sql'), 'utf8'));
    let user = { id: crypto.randomUUID(), roles: ['Teacher'] };
    const owner = user, other = { id: crypto.randomUUID(), roles: ['ADMIN'] };
    let fail = '', accountNumber = 1, refreshed = 0, tokenRequests = 0, includeDocs = false;
    const requests = [];
    const provider = async (target, options) => {
      const url = new URL(target);
      requests.push({ url, options });
      assert.equal(options.redirect, 'error');
      if (fail === 'network') throw new Error('Do not expose fixture-secret or fixture-refresh');
      if (fail === 'denied') return Response.json({ error: 'Do not expose fixture-secret' }, { status: 403 });
      if (url.pathname === '/token') {
        tokenRequests++;
        const params = new URLSearchParams(options.body);
        if (params.get('grant_type') === 'refresh_token') { refreshed++; assert.equal(params.get('refresh_token'), 'fixture-refresh'); }
        else assert.ok(params.get('code_verifier'));
        return Response.json({ access_token: 'fixture-access', refresh_token: 'fixture-refresh', expires_in: 3600,
          scope: fail === 'scopes' ? SCOPES[0] : [...SCOPES, ...(includeDocs ? [DOCS_SCOPE] : [])].join(' ') });
      }
      if (url.hostname === 'docs.googleapis.com') {
        assert.equal(url.pathname, '/v1/documents/' + DOCUMENT_ID);
        assert.equal(url.searchParams.get('includeTabsContent'), 'true');
        if (fail === 'missing-doc') return Response.json({}, { status: 404 });
        if (fail === 'bad-doc') return Response.json({ body: { content: [] } });
        const p = text => ({ paragraph: { elements: [{ textRun: { content: text + '\n' } }] } });
        const row = texts => ({ tableCells: texts.map(text => ({ content: [p(text)] })) });
        return Response.json({ title: 'Fixture document', body: { content: [p('Term 4, 2026'),
          { table: { tableRows: [row(['Week', 'School events', 'Meets/Assemblies']),
            row(['2', 'School event', 'Staff Hui: Planning']), row(['Assembly School: Welcome'])] } }] } });
      }
      if (url.pathname.endsWith('/userinfo')) return Response.json({ id: 'google-' + accountNumber, email: 'teacher' + accountNumber + '@example.test', verified_email: true });
      if (url.pathname.endsWith('/calendarList')) return Response.json({ items: [
        { id: 'primary', summary: 'My calendar', primary: true }, { id: 'school', summary: 'School KAMAR events' }
      ] });
      if (url.pathname.endsWith('/events')) {
        assert.equal(url.searchParams.get('timeMin'), '2026-10-17T11:00:00.000Z');
        assert.equal(url.searchParams.get('timeMax'), '2026-10-24T11:00:00.000Z');
        assert.equal(url.searchParams.get('singleEvents'), 'true');
        assert.equal(url.searchParams.get('timeZone'), 'Pacific/Auckland');
        return Response.json({ items: [{
          id: url.searchParams.get('pageToken') || 'first', summary: 'Private lesson', start: { dateTime: '2026-10-19T09:00:00+13:00' },
          end: { dateTime: '2026-10-19T10:00:00+13:00' }
        }], ...(url.searchParams.has('pageToken') ? {} : { nextPageToken: 'second' }) });
      }
      if (url.pathname === '/revoke') return new Response('', { status: 200 });
      throw new Error('Unexpected provider request');
    };
    const app = express();
    app.use(session({ secret: 'google-test-session-only', saveUninitialized: false, resave: false }));
    app.use(express.json());
    app.use((req, res, next) => { req.user = user; next(); });
    // Production mounts this router below the planner's existing CSRF middleware.
    app.use('/google-calendar', createGoogleCalendarRouter({ query: (sql, values) => db.query(sql, values), env, fetchImpl: provider }));
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = 'http://127.0.0.1:' + server.address().port + '/google-calendar';
    let cookie;
    async function call(route = '', method = 'GET', body) {
      const response = await fetch(base + route, {
        method, headers: { ...(cookie ? { cookie } : {}), 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {})
      });
      if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
      return response;
    }
    async function begin(docs = false) {
      const response = await call('/connect', 'POST', { includeDocs: docs });
      assert.equal(response.status, 200);
      const url = new URL((await response.json()).url);
      assert.equal(url.origin, 'https://accounts.google.com');
      assert.equal(url.searchParams.get('prompt'), 'consent select_account');
      assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
      assert.equal(url.searchParams.get('access_type'), 'offline');
      includeDocs = url.searchParams.get('scope').split(' ').includes(DOCS_SCOPE);
      return url.searchParams.get('state');
    }
    const callback = state => call('/callback?state=' + state + '&code=fixture-code');
    assert.equal((await (await call()).json()).connected, false);
    assert.equal((await call('/events?start=2026-10-18')).status, 409);
    let state = await begin();
    assert.equal((await callback('wrong')).status, 403);
    assert.equal(tokenRequests, 0);
    assert.equal((await callback(state)).status, 403);
    state = await begin();
    user = other;
    assert.equal((await callback(state)).status, 403);
    assert.equal(tokenRequests, 0);
    user = owner;
    state = await begin();
    assert.equal((await call('/callback?state=' + state + '&error=access_denied')).status, 400);
    state = await begin(); fail = 'scopes';
    assert.equal((await callback(state)).status, 403); fail = '';
    assert.equal((await (await call()).json()).connected, false);
    state = await begin();
    assert.equal((await callback(state)).status, 200);
    assert.equal((await callback(state)).status, 403);
    let status = await (await call()).json();
    assert.equal(status.email, 'teacher1@example.test');
    assert.deepEqual(status.selectedCalendars, ['primary']);
    assert.ok(!JSON.stringify(status).includes('fixture-access'));
    const stored = (await db.query('SELECT * FROM google_calendar_connections WHERE owner_id=$1', [owner.id])).rows[0];
    assert.ok(!stored.encrypted_tokens.includes('fixture-refresh'));
    assert.equal(stored.google_subject, 'google-1');
    user = other;
    assert.equal((await (await call('?owner_id=' + owner.id)).json()).connected, false);
    assert.equal((await call('/events?start=2026-10-18&owner_id=' + owner.id)).status, 409);
    assert.equal((await call('/selection', 'PUT', { connectionId: status.connectionId, calendarIds: ['primary'] })).status, 409);
    user = owner;
    for (const start of ['2026-10-19', '2026-02-30', 'bad', '1999-01-03']) assert.equal((await call('/events?start=' + start)).status, 400);
    for (const ids of [['forged'], Array(11).fill('primary'), ['primary', 'primary']]) {
      assert.equal((await call('/selection', 'PUT', { connectionId: status.connectionId, calendarIds: ids })).status, 400);
    }
    assert.equal((await call('/selection', 'PUT', { connectionId: 'stale', calendarIds: ['primary'] })).status, 409);
    assert.equal((await call('/selection', 'PUT', { connectionId: status.connectionId, calendarIds: ['primary', 'school'] })).status, 200);
    const result = await (await call('/events?start=2026-10-18')).json();
    assert.equal(result.events.length, 4);
    assert.equal(result.events[0].calendar, 'My calendar');
    assert.equal(new Set(result.events.map(event => event.id)).size, 4);
    const tokens = decryptTokens(stored.encrypted_tokens, configuration(env).key, owner.id);
    tokens.expiresAt = 0;
    await db.query('UPDATE google_calendar_connections SET encrypted_tokens=$2 WHERE owner_id=$1', [owner.id, encryptTokens(tokens, configuration(env).key, owner.id)]);
    assert.equal((await call('/calendars')).status, 200);
    assert.equal(refreshed, 1);
    const docParams = new URLSearchParams({
      year: '2026', term1Start: '2026-01-26', term1End: '2026-04-02',
      term2Start: '2026-04-20', term2End: '2026-07-03',
      term3Start: '2026-07-20', term3End: '2026-09-25', term4Start: '2026-10-12', term4End: '2026-12-18'
    });
    const docRoute = '/document-events?' + docParams;
    assert.equal((await call(docRoute)).status, 409);
    assert.equal((await call('/document-events?year=bad')).status, 400);
    state = await begin(true);
    assert.ok(includeDocs);
    fail = 'scopes';
    assert.equal((await callback(state)).status, 403);
    fail = '';
    assert.equal((await (await call()).json()).docsEnabled, false);
    state = await begin(true);
    assert.equal((await callback(state)).status, 200);
    status = await (await call()).json();
    assert.equal(status.docsEnabled, true);
    assert.deepEqual(status.selectedCalendars, ['primary', 'school']);
    const docResult = await (await call(docRoute)).json();
    assert.equal(docResult.events.length, 3);
    assert.equal(docResult.events.find(event => event.name === 'Staff Hui: Planning').date, '2026-10-20');
    assert.equal(docResult.connectionId, status.connectionId);
    assert.ok(!JSON.stringify(docResult).includes('fixture-access'));
    const upgraded = (await db.query('SELECT * FROM google_calendar_connections WHERE owner_id=$1', [owner.id])).rows[0];
    const upgradedTokens = decryptTokens(upgraded.encrypted_tokens, configuration(env).key, owner.id);
    upgradedTokens.expiresAt = 0;
    await db.query('UPDATE google_calendar_connections SET encrypted_tokens=$2 WHERE owner_id=$1',
      [owner.id, encryptTokens(upgradedTokens, configuration(env).key, owner.id)]);
    assert.equal((await call(docRoute)).status, 200);
    assert.equal(refreshed, 2);
    assert.equal((await (await call()).json()).docsEnabled, true);
    user = other;
    assert.equal((await call(docRoute + '&owner_id=' + owner.id)).status, 409);
    user = owner;
    fail = 'missing-doc';
    assert.equal((await call(docRoute)).status, 404);
    fail = 'bad-doc';
    assert.equal((await call(docRoute)).status, 422);
    fail = 'denied';
    const deniedDoc = await call(docRoute);
    assert.equal(deniedDoc.status, 403);
    assert.match((await deniedDoc.json()).error, /Google Docs API/);
    fail = '';
    fail = 'network';
    const failed = await call('/events?start=2026-10-18');
    assert.equal(failed.status, 502);
    assert.ok(!(await failed.text()).includes('fixture-secret'));
    fail = 'denied';
    assert.equal((await call('/calendars')).status, 403); fail = '';
    accountNumber = 2;
    state = await begin(); assert.equal((await callback(state)).status, 200);
    const switched = await (await call()).json();
    assert.equal(switched.email, 'teacher2@example.test');
    assert.notEqual(switched.connectionId, status.connectionId);
    assert.deepEqual(switched.selectedCalendars, ['primary']);
    assert.equal((await call('', 'DELETE', { connectionId: status.connectionId })).status, 409);
    fail = 'network';
    const disconnect = await (await call('', 'DELETE', { connectionId: switched.connectionId })).json();
    assert.ok(disconnect.warning.includes('revocation'));
    assert.equal((await (await call()).json()).connected, false);
    assert.equal((await db.query('SELECT * FROM google_calendar_connections')).rows.length, 0);
    assert.ok(requests.some(request => request.url.pathname === '/revoke'));
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await db.query('SET search_path TO public');
    await db.query('DROP SCHEMA ' + schema + ' CASCADE');
    db.release(); await pool.end();
  }
});

test('Google mutations inherit planner CSRF protection even before credentials are configured', async () => {
  const { createModuleRouter } = require('./app');
  const app = express();
  app.use(session({ secret: 'google-csrf-test', saveUninitialized: false, resave: false }));
  app.use((req, res, next) => { req.user = { id: crypto.randomUUID(), roles: ['Teacher'] }; next(); });
  app.use(createModuleRouter({ query: async () => ({ rows: [] }) }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const base = 'http://127.0.0.1:' + server.address().port + '/api/planner/google-calendar';
    for (const [route, method] of [['/connect', 'POST'], ['/selection', 'PUT'], ['', 'DELETE'],
      ['/tasks/lists/test/tasks', 'POST'], ['/tasks/lists/test/tasks/test', 'PATCH']]) {
      assert.equal((await fetch(base + route, { method })).status, 403);
    }
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('Term Google calendar opens the current NZ week, navigates, shows overflow details and exposes retries', async () => {
  const source = await fs.readFile(path.join(__dirname, 'public', 'planner.js'), 'utf8');
  const ui = await fs.readFile(path.join(__dirname, 'public', 'google-calendar.js'), 'utf8');
  const helpers = source.slice(source.indexOf('  function kamarEventDate('), source.indexOf('  function renderKamarCalendar('));
  function el(tag, text = '', attrs = {}) {
    return {
      tag, textContent: text, attrs, children: [], dataset: { date: attrs['data-date'], hour: attrs['data-hour'] }, isConnected: true,
      append(...nodes) { this.children.push(...nodes); }, replaceChildren(...nodes) { this.children = nodes; },
      setAttribute(key, value) { this.attrs[key] = value; }, addEventListener(event, handler) { this[event] = handler; },
      focus(options) { this.focusOptions = options; }, scrollIntoView(options) { this.scrollOptions = options; }
    };
  }
  const all = node => [node, ...node.children.flatMap(all)];
  const context = { el, date: value => new Date(value + 'T00:00:00Z'), iso: value => value.toISOString().slice(0, 10), clearInterval };
  vm.runInNewContext(helpers + '\n' + ui, context);
  for (const mode of ['connected', 'unconfigured', 'failure']) {
    const host = el('section'), requests = [];
    let failed = mode === 'failure';
    const events = Array.from({ length: 5 }, (_, index) => ({
      title: 'Lesson ' + index, start: '2026-12-27T20:00:00Z', end: '2026-12-27T21:00:00Z', allDay: false, calendar: 'Mine'
    }));
    context.plannerGoogleCalendar.mount(host, {
      el, date: context.date, iso: context.iso,
      sunday: context.kamarSunday, today: () => '2027-01-01', weekDates: context.kamarWeekDates,
      renderWeek: context.renderKamarWeek, dayEvents: context.kamarEventsForDay, hourEvents: context.kamarHourEvents, hourLabel: context.kamarHourLabel,
      request: async route => {
        requests.push(route);
        if (failed) throw new Error('Calendar could not be reached');
        if (route === 'google-calendar/') return { configured: mode !== 'unconfigured', connected: true,
          connectionId: 'fixture', email: 'fixture@example.test', selectedCalendars: ['primary'] };
        if (route === 'google-calendar/calendars') return { connectionId: 'fixture', calendars: [] };
        return { connectionId: 'fixture', events };
      }
    });
    await new Promise(resolve => setImmediate(resolve));
    if (mode === 'unconfigured') {
      assert.equal(requests.length, 1);
      assert.ok(all(host).some(node => node.textContent.includes('not complete')));
      continue;
    }
    if (failed) {
      assert.ok(all(host).some(node => node.attrs.role === 'alert' && node.textContent.includes('could not be reached')));
      failed = false;
      await all(host).find(node => node.textContent === 'Retry connection').click();
      await new Promise(resolve => setImmediate(resolve));
    }
    assert.equal(requests.at(-1), 'google-calendar/events?start=2026-12-27');
    assert.ok(all(host).some(node => node.attrs['aria-label'] === 'My Google Calendar, Sunday to Saturday, 8am to 5pm'));
    const hour = all(host).find(node => node.dataset.date === '2026-12-28' && node.dataset.hour === '9');
    assert.equal(hour.children.length, 4);
    assert.equal(hour.children[3].textContent, '+2 more');
    hour.click();
    assert.equal(all(host).filter(node => node.tag === 'article').length, 5);
    const panel = all(host).find(node => node.attrs['aria-label'] === 'Selected Google Calendar events');
    assert.equal(panel.attrs.class, 'kamar-day-details kamar-hour-panel');
    assert.equal(panel.focusOptions.preventScroll, true);
    assert.equal(panel.scrollOptions.block, 'nearest');
    assert.ok(all(host).some(node => node.attrs.class === 'kamar-week-layout google-week-layout'));
    all(host).find(node => node.textContent === 'Next week').click();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(requests.at(-1), 'google-calendar/events?start=2027-01-03');
    all(host).find(node => node.textContent === 'This week').click();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(requests.at(-1), 'google-calendar/events?start=2026-12-27');
  }
});
