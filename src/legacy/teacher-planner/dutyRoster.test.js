const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const vm = require('node:vm');
const express = require('express');
const session = require('express-session');
const { createModuleRouter } = require('./app');
const { createGoogleCalendarRouter, configuration, encryptTokens } = require('./googleCalendar');
const { DOCS_SCOPE } = require('./googleDocEvents');
const { validDutySettings, staffDutyMappings, parseDutyDocument, dutyEvents, DEFAULT_DOCUMENT_ID } = require('./dutyRoster');

const paragraph = text => ({ paragraph: { elements: [{ textRun: { content: text } }] } });
const cell = text => ({ content: [paragraph(text)] });
const row = cells => ({ tableCells: cells.map(cell) });
function documentFixture() {
  const rows = [
    row(['Duty zone', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']),
    row(['Duty Leader', 'AA', 'BB', 'AA', 'BB', 'AA']),
    row(['Restorative Room', 'BB', 'AA', 'BB', 'AA', 'BB'])
  ];
  for (const zone of ['ZONE 1: Before School - 8:25 - 8:40 am', 'ZONE 2: Morning Tea 11:00 - 11:20 pm',
    'ZONE 3: Lunch 1:20 - 1.40 pm', 'ZONE 4: Lunch 1:40 - 2:00 pm', 'ZONE 1: After school 3:00 - 3:20 pm']) {
    rows.push(row([zone, 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']));
    rows.push(row(['Library', 'AA', 'BB', 'AA', 'AA', 'BB']));
  }
  return { title: '2026 Duty Roster', body: { content: [paragraph('DUTY ROSTER 2026 (Term 4)'), { table: { tableRows: rows } }] } };
}
const settings = { enabled: true, documentId: DEFAULT_DOCUMENT_ID, mappings: [{ code: 'AA', email: 'teacher@example.test' }] };
const dates = { term4Start: '2026-10-12', term4End: '2026-12-18', events: [] };
test('Staff List maps codes and unique first names, rejecting ambiguity and absent school emails', () => {
  const person = (code, first_name, email_school) => ({ code, first_name, last_name: 'Fixture', email_school });
  const result = staffDutyMappings([
    person('AA', 'Alex', ' ALEX@example.test '), person('BB', 'Blair', 'blair@example.test'),
    person('CC', 'Alex', 'other@example.test'), person('DD', 'Missing', null),
    person('EE', 'BB', 'collision@example.test')
  ]);
  assert.ok(result.mappings.some(item => item.code === 'AA' && item.email === 'alex@example.test'));
  assert.ok(result.mappings.some(item => item.code === 'BLAIR' && item.email === 'blair@example.test'));
  assert.ok(!result.mappings.some(item => ['ALEX', 'BB', 'DD', 'MISSING'].includes(item.code)));
  assert.ok(result.warnings.some(text => text.includes('ALEX')));
  assert.ok(result.warnings.some(text => text.includes('BB')));
  assert.throws(() => staffDutyMappings([{ code: 'AA', first_name: 'Test' }]), /Global Control staff bridge/);
  assert.throws(() => staffDutyMappings([]), /empty/);
});
test('duty settings validate exact account email mappings, unique codes and constrained document IDs', () => {
  assert.ok(validDutySettings(settings));
  for (const value of [
    { ...settings, documentId: 'https://evil.test/' }, { ...settings, enabled: 'true' },
    { ...settings, mappings: [...settings.mappings, ...settings.mappings] },
    { ...settings, mappings: [{ code: 'AA', email: 'invalid' }] },
    { ...settings, mappings: [{ code: 'AA', email: 'Teacher@example.test' }] },
    { ...settings, extra: true }
  ]) assert.equal(Boolean(validDutySettings(value)), false);
});
test('source table parsing covers all zones, correct Wednesday morning time and Docs tabs', () => {
  const doc = documentFixture(), parsed = parseDutyDocument(doc, 2026, 4);
  assert.equal(parsed.duties.length, 35);
  assert.deepEqual(parsed.codes, ['AA', 'BB']);
  assert.equal(parsed.duties.find(duty => duty.day === 2 && duty.slot === 'interval').startTime, '11:15');
  assert.equal(parsed.duties.find(duty => duty.day === 3 && duty.slot === 'interval').startTime, '11:00');
  assert.equal(parsed.duties.find(duty => duty.day === 2 && duty.slot === 'lunch').startTime, '13:20');
  assert.deepEqual(parseDutyDocument({ tabs: [{ childTabs: [{ documentTab: { body: doc.body } }] }] }, 2026, 4), parsed);
  assert.throws(() => parseDutyDocument(doc, 2027, 4), /heading/);
  doc.body.content[1].table.tableRows.pop();
  assert.throws(() => parseDutyDocument(doc, 2026, 4), /five duty zones/);
});
test('empty Google Docs paragraphs do not become table rows or prevent duty sync', () => {
  const doc = documentFixture(), expected = parseDutyDocument(doc, 2026, 4);
  doc.body.content.unshift(paragraph('\n'), { paragraph: { elements: [] } });
  doc.body.content.splice(3, 0, paragraph(''), { paragraph: { elements: [{ textRun: {} }] } });
  doc.body.content.push(paragraph('  \n'));
  assert.deepEqual(parseDutyDocument(doc, 2026, 4), expected);
  assert.deepEqual(parseDutyDocument({ tabs: [{ documentTab: { body: doc.body } }] }, 2026, 4), expected);
});
test('duty sync takes updated zone times from source and rejects ambiguous or broken rosters', () => {
  const doc = documentFixture();
  const rows = doc.body.content[1].table.tableRows;
  rows[5].tableCells[0] = cell('ZONE 2: Morning Tea 11:05 - 11:25 pm');
  rows[5].tableCells[3] = cell('11:20 - 11:40 Wednesday');
  const result = parseDutyDocument(doc, 2026, 4);
  assert.equal(result.duties.find(duty => duty.day === 0 && duty.slot === 'interval').startTime, '11:05');
  assert.equal(result.duties.find(duty => duty.day === 2 && duty.slot === 'interval').startTime, '11:20');
  const old = documentFixture();
  doc.body.content.push(...old.body.content);
  assert.throws(() => parseDutyDocument(doc, 2026, 4), /one term duty roster/);
  rows[5].tableCells[0] = cell('ZONE 2: Morning Tea unknown');
  assert.throws(() => parseDutyDocument({ body: { content: doc.body.content.slice(0, 2) } }, 2026, 4), /readable start/);
});
test('duties match account email only and respect term dates, closures and unchanged source mappings', () => {
  const roster = parseDutyDocument(documentFixture(), 2026, 4);
  const original = JSON.stringify(roster);
  const result = dutyEvents(roster, settings.mappings, 'TEACHER@example.test', dates, 2026, 4, '2026-10-26');
  assert.equal(result.mapped, true);
  assert.ok(result.events.every(event => event.code === 'AA'));
  assert.equal(dutyEvents(roster, settings.mappings, 'other@example.test', dates, 2026, 4, '2026-10-26').events.length, 0);
  assert.equal(dutyEvents(roster, settings.mappings, 'teacher@example.test', dates, 2026, 4, '2026-12-21').events.length, 0);
  const closed = dutyEvents(roster, settings.mappings, 'teacher@example.test',
    { ...dates, events: [{ date: '2026-10-26', kind: 'teacherOnly' }] }, 2026, 4, '2026-10-26');
  assert.ok(closed.events.every(event => event.date !== '2026-10-26'));
  assert.equal(JSON.stringify(roster), original);
  assert.throws(() => dutyEvents(roster, settings.mappings, 'teacher@example.test', {}, 2026, 4, '2026-10-26'), /Publish/);
});
async function serve(t, app) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return 'http://127.0.0.1:' + server.address().port;
}
test('shared duty setup is admin-only, CSRF protected and revision checked; active terms hide mappings', async t => {
  let saved;
  const app = express();
  app.use(session({ secret: 'synthetic-duty-fixture', resave: false, saveUninitialized: false }));
  app.use((req, _res, next) => {
    if (req.get('x-role')) req.user = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', roles: [req.get('x-role')] };
    next();
  });
  let directoryFails = false;
  app.use(createModuleRouter({ loadStaff: async (_req, options) => {
    assert.deepEqual(options, { includeEmails: true });
    if (directoryFails) throw new Error('Staff List unavailable');
    return { staff: [{ code: 'AA', first_name: 'Fixture', email_school: 'fixture@example.test' }] };
  }, query: async (sql, params) => {
    if (sql.startsWith('SELECT term')) return { rows: saved ? [{ term: 4 }] : [] };
    if (sql.startsWith('SELECT content')) return { rows: saved ? [saved] : [] };
    if (sql.startsWith('INSERT') && saved || sql.startsWith('UPDATE') && saved.revision !== params[4]) return { rows: [] };
    saved = { content: JSON.parse(params[2]), revision: (saved?.revision || 0) + 1 };
    return { rows: [saved] };
  } }));
  const base = await serve(t, app) + '/api/planner/';
  assert.equal((await fetch(base + 'duty-roster/staff-mappings')).status, 401);
  assert.equal((await fetch(base + 'duty-roster/staff-mappings', { headers: { 'x-role': 'Teacher' } })).status, 403);
  const built = await fetch(base + 'duty-roster/staff-mappings', { headers: { 'x-role': 'ADMIN' } });
  assert.equal(built.headers.get('cache-control'), 'no-store');
  assert.equal((await built.json()).mappings.length, 2);
  directoryFails = true;
  assert.equal((await fetch(base + 'duty-roster/staff-mappings', { headers: { 'x-role': 'ADMIN' } })).status, 502);
  assert.equal(saved, undefined, 'building suggestions never writes duty configuration');
  assert.equal((await fetch(base + 'duty-roster/2026/4')).status, 401);
  assert.equal((await fetch(base + 'duty-roster/2026/4', { headers: { 'x-role': 'Teacher' } })).status, 403);
  const sessionResponse = await fetch(base + 'session', { headers: { 'x-role': 'ADMIN' } });
  const cookie = sessionResponse.headers.get('set-cookie').split(';')[0], { csrf } = await sessionResponse.json();
  const headers = { 'x-role': 'ADMIN', cookie, 'Content-Type': 'application/json', 'x-planner-csrf': csrf };
  const put = (revision, override = {}) => fetch(base + 'duty-roster/2026/4', {
    method: 'PUT', headers: { ...headers, ...override }, body: JSON.stringify({ revision, content: settings })
  });
  assert.equal((await put(0, { 'x-planner-csrf': 'bad' })).status, 403);
  assert.equal((await put(0)).status, 200);
  assert.equal((await put(0)).status, 409);
  assert.equal((await put(1)).status, 200);
  assert.equal((await put(2, { 'x-role': 'Teacher' })).status, 403);
  assert.deepEqual(await (await fetch(base + 'duty-roster/active/2026', { headers: { 'x-role': 'Teacher' } })).json(), { terms: [4] });
  assert.equal((await fetch(base + 'duty-roster/1999/4', { headers })).status, 400);
});
test('Google duty sync reads fresh document per request, filters other staff and denies non-admin previews', async t => {
  const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const env = { GOOGLE_CALENDAR_CLIENT_ID: 'fixture', GOOGLE_CALENDAR_CLIENT_SECRET: 'fixture',
    GOOGLE_CALENDAR_TOKEN_KEY: Buffer.alloc(32, 7).toString('base64'), APP_BASE_URL: 'https://planner.example.test' };
  const connection = { owner_id: owner, connection_id: crypto.randomUUID(), encrypted_tokens: encryptTokens({
    accessToken: 'fixture', expiresAt: Date.now() + 3600000, scopes: [DOCS_SCOPE]
  }, configuration(env).key, owner) };
  let fetches = 0, currentDoc = documentFixture(), responseStatus = 200, schoolDates = dates, calendarReads = 0;
  const app = express();
  app.use((req, _res, next) => {
    req.user = { id: owner, email: req.get('x-email') || 'teacher@example.test', roles: [req.get('x-role') || 'Teacher'] }; next();
  });
  app.use(createGoogleCalendarRouter({ env,
    loadSchoolCalendar: async (_req, year) => {
      assert.equal(year, 2026); calendarReads++;
      return { terms: [{ term: 4, startDate: dates.term4Start, endDate: dates.term4End }] };
    },
    query: async sql => ({ rows: sql.includes('school_duty_rosters') ? [{ content: settings }] :
      sql.includes('school_planner_settings') ? [{ content: schoolDates }] : [connection] }),
    fetchImpl: async (url, options) => {
      fetches++; assert.equal(options.redirect, 'error');
      assert.equal(url, 'https://docs.googleapis.com/v1/documents/' + DEFAULT_DOCUMENT_ID + '?includeTabsContent=true');
      return Response.json(currentDoc, { status: responseStatus });
    }
  }));
  const base = await serve(t, app), url = base + '/duty-events/2026/4?week=2026-10-26';
  currentDoc.body.content.unshift(paragraph('\n'));
  currentDoc.body.content.push({ paragraph: { elements: [] } });
  const firstResponse = await fetch(url);
  assert.equal(firstResponse.status, 200);
  const first = await firstResponse.json();
  assert.ok(first.events.length > 0, 'blank document paragraphs must not suppress weekly duties');
  assert.ok(first.events.every(event => event.code === 'AA'));
  assert.equal(first.codes, undefined);
  assert.equal(calendarReads, 0, 'saved school dates take priority');
  schoolDates = {};
  const fallbackResponse = await fetch(url);
  assert.equal(fallbackResponse.status, 200);
  assert.deepEqual((await fallbackResponse.json()).events, first.events, 'Ministry dates populate duties without published school boundaries');
  assert.equal(calendarReads, 1);
  schoolDates = { ...dates, term4Start: '2026-10-30' };
  const overridden = (await (await fetch(url)).json()).events;
  assert.ok(overridden.length < first.events.length);
  assert.ok(overridden.every(event => event.date >= '2026-10-30'), 'school date overrides exclude earlier duties');
  schoolDates = dates;
  assert.equal((await fetch(url + '&preview=true')).status, 403);
  const preview = await (await fetch(url + '&preview=true', { headers: { 'x-role': 'ADMIN' } })).json();
  assert.deepEqual(preview.unmapped, ['BB']);
  assert.ok(preview.duties.some(duty => duty.code === 'BB'));
  currentDoc = documentFixture();
  currentDoc.body.content[1].table.tableRows[6].tableCells[1] = cell('BB');
  const updated = await (await fetch(url)).json();
  assert.notDeepEqual(updated.events, first.events, 'document changes are used on the next sync');
  const before = fetches;
  assert.equal((await (await fetch(url, { headers: { 'x-email': 'unmapped@example.test' } })).json()).mapped, false);
  assert.equal(fetches, before, 'unmapped staff do not need Google access');
  responseStatus = 403;
  const denied = await fetch(url);
  assert.equal(denied.status, 403);
  assert.match((await denied.json()).error, /not accessible/);
  assert.equal((await fetch(base + '/duty-events/2026/4?week=2026-10-27')).status, 400);
});

function node(tag, text = '', attrs = {}) {
  return { tag, textContent: text, attrs, children: [], events: {}, dataset: {}, isConnected: true,
    append(...items) { this.children.push(...items); }, replaceChildren(...items) { this.children = items; },
    setAttribute(key, value) { this.attrs[key] = value; }, removeAttribute(key) { delete this.attrs[key]; },
    addEventListener(event, callback) { this.events[event] = callback; },
    dispatchEvent(event) { this.events[event.type]?.(event); } };
}
const flush = () => new Promise(resolve => setImmediate(resolve));
test('Duty Roster setup saves shared mappings independently and restricts editing to administrators', async () => {
  const context = { Event }, calls = [];
  vm.runInNewContext(fs.readFileSync(require.resolve('./public/duty-roster.js'), 'utf8'), context);
  const host = node('section');
  context.plannerDutyRoster.mountSetup(host, {
    el: node, year: 2026, week: '2026-10-26', canEdit: true,
    request: async path => path === 'duty-roster/staff-mappings' ? {
      mappings: [{ code: 'AA', email: 'different@example.test' }, { code: 'FIRSTNAME', email: 'teacher@example.test' }],
      warnings: ['DUPLICATE: ambiguous first name']
    } : ({ revision: 3, content: settings }),
    mutate: async (...args) => { calls.push(args); return { revision: 4 }; }
  });
  await flush();
  const all = () => host.children;
  const mappings = all().find(child => child.attrs['aria-label'] === 'Duty code to staff account email mappings');
  assert.equal(mappings.value, 'AA = teacher@example.test');
  mappings.value += '\nBB = other@example.test'; mappings.events.input();
  assert.equal(host.attrs['data-preferences-busy'], 'true');
  await all().find(child => child.textContent === 'Save duty setup').events.click();
  assert.equal(calls[0][0], 'duty-roster/2026/4');
  assert.equal(calls[0][1].revision, 3);
  assert.equal(calls[0][1].content.mappings.length, 2);
  assert.equal(calls[0][2], 'PUT');
  assert.equal(host.attrs['data-preferences-busy'], undefined);
  const build = all().find(child => child.textContent === 'Build map from Staff List');
  await build.events.click();
  assert.match(mappings.value, /AA = teacher@example.test/, 'existing mapping wins over conflicting directory email');
  assert.match(mappings.value, /FIRSTNAME = teacher@example.test/);
  assert.equal(host.attrs['data-preferences-busy'], 'true', 'suggestions remain unsaved until reviewed');
  const warnings = all().find(child => child.attrs['aria-label'] === 'Staff mapping warnings');
  assert.ok(warnings.children.some(child => child.textContent.includes('Existing email preserved')));
  const value = mappings.value;
  await build.events.click();
  assert.equal(mappings.value, value, 'rebuilding does not duplicate aliases');
  const teacher = node('section');
  context.plannerDutyRoster.mountSetup(teacher, { el: node, year: 2026, canEdit: false });
  assert.ok(!teacher.children.some(child => child.tag === 'textarea'));
  assert.match(teacher.children.at(-1).textContent, /administrator configures/);
});
test('Kamar Uploader Duty Roster page loads the shared setup with a CSRF-protected save adapter', async () => {
  const yearInput = node('input'), host = node('section'), status = node('p');
  const calls = [];
  let mounted;
  const context = {
    document: {
      getElementById: id => ({ dutyRosterYear: yearInput, dutyRosterSetup: host, dutyRosterPageStatus: status })[id],
      createElement: tag => node(tag)
    },
    fetch: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, json: async () => ({ csrf: 'x'.repeat(40), canManageSchoolSettings: true }) };
    },
    plannerDutyRoster: { mountSetup: (target, options) => { mounted = { target, options }; } }
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../kamar-uploader/site/duty_roster.js'), 'utf8'), context);
  await flush();
  assert.equal(calls[0].url, '/teacher-planner/api/planner/session');
  assert.equal(mounted.target, host);
  assert.equal(mounted.options.canEdit, true);
  assert.match(mounted.options.week, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(status.textContent, /setup loaded/);
  await mounted.options.mutate('duty-roster/2026/4', { revision: 1 }, 'PUT');
  assert.equal(calls[1].url, '/teacher-planner/api/planner/duty-roster/2026/4');
  assert.equal(calls[1].options.headers['x-planner-csrf'], 'x'.repeat(40));
});
test('duty sync feedback follows the action buttons and distinguishes success from failure', async () => {
  const context = {};
  vm.runInNewContext(fs.readFileSync(require.resolve('./public/duty-roster.js'), 'utf8'), context);
  const host = node('section');
  let failure = false;
  context.plannerDutyRoster.mountSetup(host, {
    el: node, year: 2026, week: '2026-10-26', canEdit: true,
    request: async path => {
      if (!path.includes('duty-events')) return { revision: 1, content: settings };
      if (failure) throw new Error('The duty document is not accessible.');
      return { enabled: true, fetchedAt: '2026-10-29T00:00:00Z', unmapped: [],
        duties: [{ day: 3, startTime: '11:00', endTime: '11:20', location: 'Library', code: 'AA' }] };
    }
  });
  await flush();
  const feedback = host.children.find(child => child.attrs.class === 'duty-roster-feedback');
  const sync = host.children.find(child => child.textContent === 'Sync / preview source roster');
  assert.equal(host.children.indexOf(feedback), host.children.indexOf(sync) + 1);
  assert.match(feedback.textContent, /Live duty sync is enabled/);
  await sync.events.click();
  assert.equal(feedback.attrs.role, 'status');
  assert.match(feedback.textContent, /Synced .*Unmapped source codes: none/);
  const preview = host.children.find(child => child.attrs.class === 'duty-roster-preview');
  assert.equal(preview.children[0].children.length, 2, 'successful sync renders the duty preview');
  failure = true;
  await sync.events.click();
  assert.equal(feedback.attrs.role, 'alert');
  assert.match(feedback.textContent, /not accessible/);
  assert.equal(preview.children.length, 0, 'failed sync must not retain an old preview');
});
test('weekly duty labels are read-only, skip public holidays, refresh and clear on failure', async () => {
  const hosts = ['interval:0', 'interval:3'].map(key => Object.assign(node('div'), { dataset: { weeklyDuties: key } }));
  const spread = { isConnected: true, before(panel) { this.panel = panel; },
    querySelectorAll(selector) { assert.equal(selector, '[data-weekly-duties]'); return hosts; } };
  let fail = false, fetches = 0;
  const request = async path => {
    if (path.startsWith('duty-roster/active')) return { terms: [4] };
    if (path.startsWith('school-settings')) return { content: dates };
    if (path.startsWith('../school-calendar')) return { publicHolidays: [{ date: '2026-10-26' }] };
    if (fail) throw new Error('Google unavailable');
    fetches++;
    return { enabled: true, mapped: true, fetchedAt: '2026-10-29T00:00:00Z',
      events: ['2026-10-26', '2026-10-29'].map(date => ({ date, slot: 'interval', location: 'Library', startTime: '11:00', endTime: '11:20' })) };
  };
  const context = {};
  vm.runInNewContext(fs.readFileSync(require.resolve('./public/duty-roster.js'), 'utf8'), context);
  context.plannerDutyRoster.mountWeek(spread, { el: node, request, week: '2026-10-26', align() {} });
  await flush();
  assert.equal(hosts[0].children.length, 0);
  assert.match(hosts[1].children[0].textContent, /Library.*11:00/);
  await spread.panel.children[1].onclick();
  assert.equal(fetches, 2);
  assert.equal(hosts[1].children.length, 1, 'refresh replaces, not duplicates');
  fail = true;
  await spread.panel.children[1].onclick();
  assert.equal(hosts[1].children.length, 0);
  assert.equal(spread.panel.children[0].attrs.role, 'alert');
  assert.match(spread.panel.children[0].textContent, /No duties are displayed/);
});
test('weekly duties use Ministry dates and the toolbar refresh button when school dates are absent', async () => {
  const host = Object.assign(node('div'), { dataset: { weeklyDuties: 'interval:3' } });
  const spread = { isConnected: true, before(panel) { this.panel = panel; }, querySelectorAll() { return [host]; } };
  const button = node('button');
  let missingDates = false;
  const context = {};
  vm.runInNewContext(fs.readFileSync(require.resolve('./public/duty-roster.js'), 'utf8'), context);
  context.plannerDutyRoster.mountWeek(spread, { el: node, week: '2026-10-26', align() {}, refreshButton: button,
    request: async path => {
      if (path.startsWith('duty-roster/active')) return { terms: [4] };
      if (path.startsWith('school-settings')) return { content: {} };
      if (path.startsWith('../school-calendar')) return { terms: missingDates ? [] :
        [{ term: 4, startDate: '2026-10-12', endDate: '2026-12-18' }], publicHolidays: [] };
      return { enabled: true, mapped: true, fetchedAt: '2026-10-29T00:00:00Z',
        events: [{ date: '2026-10-29', slot: 'interval', location: 'Library', startTime: '11:00', endTime: '11:20' }] };
    }
  });
  await flush();
  assert.equal(button.hidden, false);
  assert.equal(spread.panel.children.length, 1, 'no second refresh button above the weekly pages');
  assert.match(host.children[0].textContent, /Library/);
  await button.onclick();
  assert.equal(host.children.length, 1);
  missingDates = true;
  await button.onclick();
  assert.equal(host.children.length, 0);
  assert.match(spread.panel.children[0].textContent, /School and Ministry term dates are unavailable/);
});
