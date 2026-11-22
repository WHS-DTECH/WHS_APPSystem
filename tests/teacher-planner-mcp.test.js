const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');
const path = require('node:path');
const express = require('express');
const session = require('express-session');
const { createTeacherPlannerMcpRouter, MCP_PATH, CLIENT_ID } = require('../src/teacherPlannerMcp');
const { createTeacherPlannerMcpData } = require('../src/teacherPlannerMcpData');

const origin = 'https://school.example.test';
const callback = 'https://chatgpt.com/connector/oauth/test-callback';
const resource = origin + MCP_PATH;
const digest = value => crypto.createHash('sha256').update(value).digest('base64url');

async function fixture(t, { configured = true } = {}) {
  const owner = crypto.randomUUID();
  const codes = new Map(), grants = new Map();
  const state = { signedIn: true, allowed: true, reads: [], codes, grants };
  const query = async (sql, values = []) => {
    if (sql.startsWith('DELETE') && sql.includes('expires_at <= NOW()')) return { rows: [] };
    if (sql.startsWith('INSERT INTO teacher_planner_mcp_codes')) {
      codes.set(values[0], { user_id: values[1], client_id: values[2], redirect_uri: values[3],
        challenge: values[4], resource: values[5], expires_at: Date.now() + 300000 });
      return { rows: [] };
    }
    if (sql.includes('FROM teacher_planner_mcp_codes')) {
      const row = codes.get(values[0]);
      if (!row || row.client_id !== values[1] || row.expires_at <= Date.now()) return { rows: [] };
      if (sql.startsWith('SELECT')) return { rows: row.resource === values[2] ? [row] : [] };
      if (row.redirect_uri !== values[2] || row.resource !== values[3]) return { rows: [] };
      codes.delete(values[0]);
      return { rows: [row] };
    }
    if (sql.startsWith('INSERT INTO teacher_planner_mcp_grants')) {
      assert.match(sql, /NOW\(\) \+ \$6 \* INTERVAL '1 second'/);
      grants.set(values[0], { user_id: values[1], client_id: values[2], resource: values[3],
        scope: values[4], expires_at: new Date(Date.now() + values[5] * 1000) });
      return { rows: [] };
    }
    if (sql.includes('FROM teacher_planner_mcp_grants')) {
      const row = grants.get(values[0]);
      if (!row || row.client_id !== values[1]) return { rows: [] };
      if (sql.startsWith('DELETE')) { grants.delete(values[0]); return { rows: [] }; }
      assert.match(sql, /expires_at>NOW\(\)/);
      return { rows: row.resource === values[2] && row.scope === values[3] && row.expires_at > new Date() ? [row] : [] };
    }
    assert.fail('Unexpected OAuth SQL: ' + sql);
  };
  const data = Object.fromEntries(['listRecords', 'getRecord', 'calendarDates'].map(name => [name, async (...args) => {
    state.reads.push({ name, args });
    if (name === 'listRecords') return { years: [args[1] || 2026], records: [] };
    if (name === 'getRecord') return { found: false, record: null, contentExcluded: true };
    return { year: args[1], month: args[2], timeZone: 'Pacific/Auckland',
      retrievedAt: new Date().toISOString(), complete: true, sources: [], events: [] };
  }]));
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));
  app.use(session({ secret: 'synthetic-mcp-session-secret', resave: false, saveUninitialized: false }));
  app.use((req, res, next) => { if (state.signedIn) req.user = { id: owner }; next(); });
  app.use(createTeacherPlannerMcpRouter({ dbQuery: query, data,
    authorizeUser: async id => state.allowed && id === owner ? { id: owner } : undefined,
    env: { APP_BASE_URL: origin, ...(configured ? { TEACHER_PLANNER_MCP_REDIRECT_URI: callback } : {}) } }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  let cookie;
  const call = async (route, options = {}) => {
    const response = await new Promise((resolve, reject) => {
      const request = http.request(`http://127.0.0.1:${server.address().port}` + route, {
        method: options.method || 'GET',
        headers: { Host: 'school.example.test', ...(cookie ? { Cookie: cookie } : {}), ...options.headers }
      }, incoming => {
        const chunks = [];
        incoming.on('data', chunk => chunks.push(chunk));
        incoming.on('end', () => resolve(new Response(Buffer.concat(chunks), {
          status: incoming.statusCode,
          headers: Object.fromEntries(Object.entries(incoming.headers).map(([name, value]) => [name, String(value)]))
        })));
        incoming.on('error', reject);
      });
      request.on('error', reject);
      request.end(options.body?.toString());
    });
    const received = response.headers.get('set-cookie');
    if (received) cookie = received.split(';')[0];
    return response;
  };
  const verifier = crypto.randomBytes(32).toString('base64url');
  const parameters = { client_id: CLIENT_ID, redirect_uri: callback, resource,
    response_type: 'code', code_challenge: digest(verifier), code_challenge_method: 'S256',
    scope: 'planner:read', state: 'synthetic-state' };
  const consent = async (overrides = {}) => {
    const response = await call('/integrations/teacher-planner/oauth/authorize?' + new URLSearchParams({ ...parameters, ...overrides }));
    if (response.status !== 200) return { response };
    const html = await response.text();
    const fields = Object.fromEntries([...html.matchAll(/name="([^"]+)" value="([^"]*)"/g)].map(match => [match[1], match[2].replaceAll('&amp;', '&')]));
    return { response, fields, html };
  };
  const approve = fields => call('/integrations/teacher-planner/oauth/authorize', {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...fields, decision: 'allow' })
  });
  const exchange = (code, overrides = {}) => call('/integrations/teacher-planner/oauth/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, grant_type: 'authorization_code', code,
      code_verifier: verifier, redirect_uri: callback, resource, ...overrides })
  });
  const link = async () => {
    const { fields } = await consent();
    const approval = await approve(fields);
    assert.equal(approval.status, 302);
    const code = new URL(approval.headers.get('location')).searchParams.get('code');
    const response = await exchange(code);
    assert.equal(response.status, 200);
    return { code, ...await response.json() };
  };
  const rpc = (token, method, params = {}) => call(MCP_PATH, { method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream',
      ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  return { state, owner, call, consent, approve, exchange, link, rpc };
}

test('OAuth consent and PKCE protect a metadata-only MCP session; codes cannot be replayed', async t => {
  const { state, owner, call, consent, approve, exchange, rpc } = await fixture(t);
  const metadata = await (await call('/.well-known/oauth-protected-resource' + MCP_PATH)).json();
  assert.equal(metadata.resource, resource);
  const auth = await (await call('/.well-known/oauth-authorization-server')).json();
  assert.deepEqual(auth.grant_types_supported, ['authorization_code']);
  assert.equal((await rpc(null, 'tools/list')).status, 401, 'a school browser session is not an MCP grant');
  const form = await consent();
  assert.match(form.html, /student records.*excluded/);
  const badCsrf = await approve({ ...form.fields, csrf: 'forged' });
  assert.equal(new URL(badCsrf.headers.get('location')).searchParams.get('error'), 'access_denied');
  assert.equal(state.codes.size, 0);
  const approval = await approve(form.fields);
  const redirect = new URL(approval.headers.get('location'));
  assert.equal(redirect.searchParams.get('state'), 'synthetic-state');
  const code = redirect.searchParams.get('code');
  assert.equal((await exchange(code, { code_verifier: 'wrong-verifier' })).status, 400);
  assert.equal((await exchange(code, { resource: 'https://other.example.test/mcp' })).status, 400);
  const response = await exchange(code);
  assert.equal(response.status, 200);
  const tokens = await response.json();
  assert.equal(tokens.refresh_token, undefined);
  assert.equal((await exchange(code)).status, 400);
  assert.equal(state.grants.has(tokens.access_token), false, 'only token hashes are persisted');
  const initialized = await rpc(tokens.access_token, 'initialize', {
    protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test-client', version: '1' }
  });
  assert.equal(initialized.status, 200, await initialized.text());
  const listed = await (await rpc(tokens.access_token, 'tools/list')).json();
  assert.deepEqual(listed.result.tools.map(tool => tool.name).sort(),
    ['get_calendar_dates', 'get_planning_record', 'list_planning_records']);
  assert.ok(listed.result.tools.every(tool => tool.annotations.readOnlyHint && !tool.annotations.destructiveHint));
  const result = await (await rpc(tokens.access_token, 'tools/call', {
    name: 'list_planning_records', arguments: { year: 2026 }
  })).json();
  assert.deepEqual(result.result.structuredContent.years, [2026]);
  assert.equal(state.reads[0].args[0], owner);
  const forged = await (await rpc(tokens.access_token, 'tools/call', {
    name: 'list_planning_records', arguments: { year: 2026, owner_id: 'forged' }
  })).json();
  assert.ok(forged.result?.isError || forged.error);
  const write = await (await rpc(tokens.access_token, 'tools/call', { name: 'update_planning_record', arguments: {} })).json();
  assert.ok(write.result?.isError || write.error);
  assert.equal(state.reads.length, 1);
});

test('consent policies retain browser origin checks and callback redirects without logging OAuth secrets', async t => {
  const log = t.mock.method(console, 'info', () => {});
  const { state, call, consent, approve } = await fixture(t);
  const form = await consent();
  const policy = form.response.headers.get('content-security-policy');
  assert.ok(policy.split(';').includes("form-action 'self' " + callback));
  assert.match(policy, /frame-ancestors 'none'/);
  assert.match(policy, /base-uri 'none'/);
  assert.equal(form.response.headers.get('referrer-policy'), 'same-origin');
  const denied = await call('/integrations/teacher-planner/oauth/authorize', {
    method: 'POST', headers: { Origin: 'null', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...form.fields, decision: 'allow' })
  });
  assert.equal(new URL(denied.headers.get('location')).searchParams.get('error'), 'access_denied');
  assert.equal(state.codes.size, 0);
  const approval = await approve(form.fields);
  assert.equal(approval.status, 302);
  const redirect = new URL(approval.headers.get('location'));
  assert.equal(redirect.origin + redirect.pathname, callback);
  assert.ok(redirect.searchParams.has('code'));
  assert.deepEqual(log.mock.calls.map(call => call.arguments), [
    ['Planner MCP OAuth POST /integrations/teacher-planner/oauth/authorize',
      { status: 302, chatgptRedirect: true, authorizationCodeIssued: false }],
    ['Planner MCP OAuth POST /integrations/teacher-planner/oauth/authorize',
      { status: 302, chatgptRedirect: true, authorizationCodeIssued: true }]
  ]);
  const metadata = await call('/.well-known/oauth-authorization-server');
  assert.ok(metadata.headers.get('content-security-policy').split(';').includes("form-action 'self'"));
  assert.equal(metadata.headers.get('referrer-policy'), 'no-referrer');
});

test('new read-only grants advertise and enforce exactly eight hours without sliding expiry or refresh tokens', async t => {
  const issuedAt = Date.now();
  t.mock.timers.enable({ apis: ['Date'], now: issuedAt });
  const { state, consent, link, rpc, call } = await fixture(t);
  assert.match((await consent()).html, /read-only access for eight hours/);
  const tokens = await link();
  assert.equal(tokens.expires_in, 28800);
  assert.equal(tokens.scope, 'planner:read');
  assert.equal(tokens.refresh_token, undefined);
  const grant = state.grants.get(digest(tokens.access_token));
  const expiresAt = issuedAt + 28800000;
  assert.equal(grant.expires_at.getTime(), expiresAt);
  t.mock.timers.tick(3600000);
  assert.equal((await rpc(tokens.access_token, 'tools/list')).status, 200, 'valid after the previous one-hour limit');
  t.mock.timers.tick(25199999);
  assert.equal((await rpc(tokens.access_token, 'tools/call', {
    name: 'list_planning_records', arguments: { year: 2026 }
  })).status, 200, 'valid one millisecond before expiry');
  assert.equal(grant.expires_at.getTime(), expiresAt, 'activity does not extend the grant');
  t.mock.timers.tick(1);
  assert.equal((await rpc(tokens.access_token, 'tools/list')).status, 401, 'rejected exactly at eight hours');
  t.mock.timers.tick(1);
  assert.equal((await rpc(tokens.access_token, 'tools/list')).status, 401, 'rejected after expiry');
  const refresh = await call('/integrations/teacher-planner/oauth/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, grant_type: 'refresh_token', refresh_token: 'synthetic-refresh' })
  });
  assert.equal(refresh.status, 400);
  assert.equal((await refresh.json()).error, 'unsupported_grant_type');
});

test('OAuth rejects unapproved redirects, scopes, changed consent, inactive users, expired and revoked grants', async t => {
  const { state, call, consent, approve, link, rpc } = await fixture(t);
  assert.equal((await consent({ redirect_uri: 'https://attacker.example.test' })).response.status, 400);
  const writeScope = await consent({ scope: 'planner:write' });
  assert.equal(new URL(writeScope.response.headers.get('location')).searchParams.get('error'), 'invalid_scope');
  const form = await consent();
  const changed = await approve({ ...form.fields, state: 'different-state' });
  assert.equal(new URL(changed.headers.get('location')).searchParams.get('error'), 'access_denied');
  state.signedIn = false;
  assert.match((await consent()).response.headers.get('location'), /^\/auth\/google\?next=/);
  state.signedIn = true;
  state.allowed = false;
  const denied = await consent();
  assert.equal(new URL(denied.response.headers.get('location')).searchParams.get('error'), 'access_denied');
  state.allowed = true;
  const tokens = await link();
  state.allowed = false;
  assert.equal((await rpc(tokens.access_token, 'tools/list')).status, 401);
  state.allowed = true;
  const grant = state.grants.get(digest(tokens.access_token));
  grant.expires_at = new Date(Date.now() - 1);
  assert.equal((await rpc(tokens.access_token, 'tools/list')).status, 401);
  grant.expires_at = new Date(Date.now() + 60000);
  assert.equal((await call('/integrations/teacher-planner/oauth/revoke', { method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, token: tokens.access_token })
  })).status, 200);
  assert.equal((await rpc(tokens.access_token, 'tools/list')).status, 401);
});

test('unconfigured MCP supports public discovery but fails closed on data and authorisation', async t => {
  const { call } = await fixture(t, { configured: false });
  const denied = await call(MCP_PATH);
  assert.equal(denied.status, 401);
  assert.match(denied.headers.get('www-authenticate'), /oauth-protected-resource/);
  const discovery = await call('/.well-known/oauth-authorization-server');
  assert.equal(discovery.status, 200);
  assert.deepEqual((await discovery.json()).scopes_supported, ['planner:read']);
  assert.equal((await call('/integrations/teacher-planner/oauth/authorize')).status, 503);
  assert.equal((await call('/teacher-planner/')).status, 404);
});

test('record reads query only the verified owner and never return private record content', async () => {
  const owner = crypto.randomUUID();
  const query = async (sql, values) => {
    assert.equal(values[0], owner);
    assert.match(sql, /section IN \('year','term','week'\)/);
    assert.doesNotMatch(sql, /SELECT \*|SELECT content,/);
    if (sql.startsWith('SELECT DISTINCT')) return { rows: [{ year: 2026 }] };
    return { rows: [{ year: 2026, section: 'term', entry_key: '2', revision: 3,
      updated_at: '2026-05-01T00:00:00Z', dates: { startDate: '2026-04-20', endDate: '2026-07-03' },
      content: { studentName: 'PRIVATE-SENTINEL', information: 'PRIVATE-SENTINEL' } }] };
  };
  const data = createTeacherPlannerMcpData({ query, origin });
  assert.deepEqual(await data.listRecords(owner), { years: [2026], records: [] });
  const listed = await data.listRecords(owner, 2026);
  assert.equal(listed.records[0].startDate, '2026-04-20');
  assert.equal(new URL(listed.records[0].url).hash, '#section=term&year=2026&term=2');
  assert.doesNotMatch(JSON.stringify(listed), /PRIVATE-SENTINEL|studentName|information/);
  assert.equal((await data.getRecord(owner, 2026, 'term', '2')).contentExcluded, true);
  await assert.rejects(data.getRecord(owner, 2026, 'reporting', 'main'), /Invalid planning record/);
});

test('calendar aggregation covers external feeds, hides private labels and reports incomplete sources', async () => {
  const owner = crypto.randomUUID(), calls = [];
  const settings = Object.fromEntries(Array.from({ length: 4 }, (_, i) => [
    ['term' + (i + 1) + 'Start', `2026-${String(i * 3 + 1).padStart(2, '0')}-01`],
    ['term' + (i + 1) + 'End', `2026-${String(i * 3 + 3).padStart(2, '0')}-28`]
  ]).flat());
  settings.events = [{ date: '2026-11-20', kind: 'teacherOnly', label: 'PRIVATE-SENTINEL', details: 'PRIVATE-SENTINEL' }];
  const query = async (sql, values) => {
    calls.push(sql);
    assert.doesNotMatch(sql, /attendance|student|reporting|moderation/);
    if (sql.includes('school_planner_settings')) return { rows: [{ content: settings }] };
    assert.equal(values[0], owner);
    if (sql.includes('preferences')) return { rows: [{ region: 'Westland' }] };
    if (sql.includes('teacher_calendar_settings')) return { rows: [{ subscription_url: 'PRIVATE-SENTINEL' }] };
    assert.fail('Unexpected calendar SQL: ' + sql);
  };
  const timed = { id: 'PRIVATE-SENTINEL', title: 'PRIVATE-SENTINEL', description: 'PRIVATE-SENTINEL',
    start: '2026-10-31T12:30:00Z', end: '2026-10-31T13:30:00Z', allDay: false };
  const sources = {
    ministry: async () => ({ available: true, terms: [], holidays: [],
      publicHolidaysAvailable: true, publicHolidays: [{ date: '2026-11-02', name: 'Public holiday' }] }),
    kamar: async () => ({ events: [{ ...timed, start: '2026-11-01T09:00:00', end: '2026-11-01T10:00:00' }] }),
    timetable: async url => { assert.equal(url, 'PRIVATE-SENTINEL'); return { events: [timed] }; },
    googleEvents: async req => { assert.equal(req.user.id, owner); return { events: [timed,
      { start: '2026-10-30', end: '2026-11-01', allDay: true }] }; },
    documentEvents: async req => { assert.equal(req.user.id, owner); return {
      events: [{ date: '2026-11-09', name: 'PRIVATE-SENTINEL', weeklyReference: true }], warnings: ['PRIVATE-SENTINEL'] }; },
    nzqa: async () => ({ events: [{ id: 'nzqa-1', title: 'NZQA public deadline', date: '2026-11-20' }] }),
    exams: async () => { throw new Error('PRIVATE-SENTINEL'); }
  };
  const data = createTeacherPlannerMcpData({ query, sources, origin });
  const result = await data.calendarDates(owner, 2026, 11);
  assert.equal(result.sources.length, 10);
  assert.equal(result.complete, false);
  assert.equal(result.sources.find(source => source.source === 'nzqa-exams').status, 'unavailable');
  assert.equal(result.sources.find(source => source.source === 'school-document').status, 'partial');
  assert.ok(result.events.some(event => event.title === 'NZQA public deadline'));
  assert.ok(result.events.some(event => event.source === 'kamar-timetable'), 'UTC month boundary uses NZ local dates');
  assert.ok(result.events.some(event => event.source === 'kamar-school'), 'floating KAMAR timestamps retain their NZ date');
  assert.equal(result.events.filter(event => event.source === 'google-calendars').length, 1, 'exclusive all-day end does not leak into the next month');
  assert.ok(result.events.find(event => event.source === 'school-document').needsConfirmation);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE-SENTINEL|subscription_url|description|warnings/);
  assert.ok(result.events.every(event => event.url.startsWith(origin + '/teacher-planner/#')));
  assert.equal(calls.length, 3);
});
