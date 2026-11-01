const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const express = require('express');
const session = require('express-session');
const { Pool } = require('pg');
const { createModuleRouter } = require('./app');
const { validGroups, validDay } = require('./attendance');

const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const other = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const group = { id: crypto.randomUUID(), name: 'Combined class', classes: ['11TEST', '12TEST'],
  periods: ['p1', 'p3'], scheduleMode: 'manual', students: [{ id: 'k:100', name: 'Synthetic Student' }] };
const content = { groups: [group] };
test('attendance validates stable student identities, unique memberships, periods and real school days', () => {
  assert.equal(validGroups(content), true);
  for (const value of [
    { groups: [group, group] }, { groups: [{ ...group, students: [...group.students, ...group.students] }] },
    { groups: [{ ...group, name: '' }] }, { groups: [{ ...group, periods: [] }] },
    { groups: [{ ...group, periods: ['p6'] }] }, { groups: [{ ...group, classes: ['11TEST', '11TEST'] }] },
    { groups: [{ ...group, scheduleMode: 'guess' }] },
    { groups: [{ ...group, students: [{ id: 'forged', name: 'Test' }] }] },
    { ...content, owner_id: other }
  ]) assert.equal(Boolean(validGroups(value)), false);
  assert.equal(validDay('2026-10-29', 2026), true);
  for (const value of ['2026-02-30', '2026-10-31', '2025-10-29', 'bad']) assert.equal(validDay(value, 2026), false);
});
test('automatic class matching strips upload teacher/room labels and matches exact timetable codes across days', () => {
  const { scheduledPeriods } = browser();
  const combined = { classes: ['VP-PIDTECH-05', 'VP-PIDTECH-CW', 'VP-11DTECH-CW', 'VP-12DTECH-CW'] };
  const entries = {
    'p1:0': [{ title: 'PIDTECH (JP)' }],
    'p2:0': [{ title: '11DTECH (6)' }, { title: '12DTECH (6)' }],
    'p3:1': [{ title: 'MDTECH (81D)' }],
    'p4:2': [{ title: 'PIDTECHX (JP)' }],
    'p5:4': [{ title: 'PIDTECH (JP)' }]
  };
  assert.deepEqual(JSON.parse(JSON.stringify(scheduledPeriods(combined, entries))),
    [['p1', 'p2'], [], [], [], ['p5']]);
  assert.throws(() => scheduledPeriods({ classes: [] }, entries), /Choose school classes/);
});
function browser() {
  const context = { structuredClone, crypto, confirm: () => true };
  vm.runInNewContext(fs.readFileSync(require.resolve('./public/attendance.js'), 'utf8'), context);
  return context.plannerAttendance;
}
test('term grids include partial first/last weeks and combined rosters deduplicate stable school IDs', () => {
  const { termWeeks, combinedStudents } = browser();
  assert.deepEqual(Array.from(termWeeks('2026-10-14', '2026-10-23')), ['2026-10-12', '2026-10-19']);
  assert.throws(() => termWeeks('2026-02-30', '2026-04-02'), /dates/);
  assert.throws(() => termWeeks('2026-12-01', '2026-10-01'), /dates/);
  const result = combinedStudents(group.students, [
    { students: [{ id: 'k:100', name: 'Source name change' }, { id: 'k:200', name: 'Another Student' }] },
    { students: [{ id: 'k:200', name: 'Another Student' }] }
  ]);
  assert.equal(result.length, 2);
  assert.equal(result.find(item => item.id === 'k:100').name, 'Synthetic Student', 'existing teacher names are preserved');
});
function element(tag, text = '', attrs = {}) {
  const node = { tag, textContent: text, attrs, children: [], events: {}, dataset: {}, value: '', checked: false,
    classList: { add() {} }, append(...items) { this.children.push(...items); },
    replaceChildren(...items) { this.children = items; }, setAttribute(key, value) { this.attrs[key] = value; },
    removeAttribute(key) { delete this.attrs[key]; }, addEventListener(event, callback) { this.events[event] = callback; } };
  return node;
}
const descendants = node => [node, ...node.children.flatMap(descendants)];
test('class picker identifies the matched signed-in staff code and shows only supplied teacher classes', async () => {
  const host = element('section');
  await browser().mount(host, {
    el: element, year: 2026, today: '2026-10-29', ranges: [], school: {}, calendar: {},
    request: async path => path.includes('/classes/') ?
      { staffCode: 'VP', classes: [{ code: 'VP-SRDTECH-CW', students: group.students }] } :
      { revision: 0, content: { groups: [] } }
  });
  descendants(host).find(node => node.textContent === '+ Class tab').events.click();
  await descendants(host).find(node => node.textContent === 'Load school class lists').events.click();
  const nodes = descendants(host);
  assert.ok(nodes.some(node => node.textContent.includes('Matched your school sign-in to staff code VP')));
  const picker = nodes.find(node => node.attrs['aria-label'] === 'School classes to combine');
  assert.deepEqual(picker.children.map(node => node.attrs.value), ['VP-SRDTECH-CW']);
  assert.equal(host.attrs['data-preferences-busy'], 'true', 'loading filtered classes does not save the class draft');
});
test('attendance UI leaves blanks unrecorded, skips closed days and saves individual periods with explicit failure recovery', async () => {
  const host = element('section'), saved = [];
  let fails = false;
  await browser().mount(host, {
    el: element, year: 2026, today: '2026-10-29',
    ranges: [{ term: '4', startDate: '2026-10-12', endDate: '2026-12-18' }],
    school: { events: [{ date: '2026-10-28', kind: 'teacherOnly' }] },
    calendar: { publicHolidays: [{ date: '2026-10-26' }] },
    request: async path => path.endsWith('/groups') ? { revision: 1, content } : { marks: [] },
    mutate: async (path, body) => {
      if (fails) throw new Error('Database unavailable');
      saved.push([path, body]); return { revision: saved.length };
    }
  });
  const nodes = descendants(host);
  const cell = nodes.find(node => node.attrs['aria-label'] === 'Synthetic Student, 2026-10-29, P3');
  assert.equal(nodes.some(node => node.attrs['aria-label'] === 'Synthetic Student, 2026-10-26, P3'), false);
  assert.equal(nodes.some(node => node.attrs['aria-label'] === 'Synthetic Student, 2026-10-28, P3'), false);
  assert.equal(cell.value, '', 'opening a register must never mark students present');
  assert.equal(saved.length, 0);
  cell.value = 'P'; await cell.events.change();
  assert.equal(saved[0][0], 'attendance/2026/mark');
  assert.equal(saved[0][1].period, 'p3');
  assert.equal(saved[0][1].date, '2026-10-29');
  assert.equal(saved[0][1].studentId, 'k:100');
  assert.equal(cell.dataset.mark, 'P');
  assert.equal(host.attrs['data-preferences-busy'], undefined);
  fails = true; cell.value = 'A'; await cell.events.change();
  assert.equal(cell.value, 'P');
  assert.ok(descendants(host).some(node => node.attrs.role === 'alert' && node.textContent.includes('NOT saved')));
});
test('automatic attendance renders only scheduled periods and preserves saved marks outside changed schedules', async () => {
    const host = element('section'), saved = [];
    const automatic = { ...group, scheduleMode: 'auto', classes: ['VP-PIDTECH-CW'], periods: ['p1'] };
    let scheduleReads = 0;
    await browser().mount(host, {
      el: element, year: 2026, today: '2026-10-29',
      ranges: [{ term: '4', startDate: '2026-10-12', endDate: '2026-12-18' }],
      school: {}, calendar: { publicHolidays: [] },
      request: async path => path.endsWith('/groups') ? { revision: 1, content: { groups: [automatic] } } :
        { marks: [{ student_id: 'k:100', date: '2026-10-29', period: 'p3', mark: 'L', revision: 2 },
          { student_id: 'k:100', date: '2026-10-27', period: 'p1', mark: 'A', revision: 1 }] },
      loadSchedule: async week => {
        assert.equal(week, '2026-10-26'); scheduleReads++;
        return { 'p3:3': [{ title: 'PIDTECH (JP)' }], 'p5:4': [{ title: 'PIDTECH (JP)' }] };
      },
      mutate: async (path, body) => { saved.push([path, body]); return { revision: 3 }; }
    });
    assert.equal(scheduleReads, 1);
    const nodes = descendants(host);
    const cells = nodes.filter(node => node.tag === 'select' && node.attrs['aria-label']?.startsWith('Synthetic Student,'));
    assert.equal(cells.length, 2, 'only Thursday P3 and Friday P5 are editable');
    const cell = cells.find(node => node.attrs['aria-label'].endsWith('2026-10-29, P3'));
    assert.equal(cell.value, 'L');
    assert.equal(saved.length, 0, 'schedule loading does not rewrite marks');
    cell.value = 'P'; await cell.events.change();
    assert.equal(saved[0][1].period, 'p3', 'automatic mode is not restricted to old manual period selections');
    assert.equal(saved[0][1].revision, 2);
});
async function fixture(t, query) {
  const app = express();
  let directoryFails = false;
  app.use(session({ secret: 'synthetic-attendance-session', resave: false, saveUninitialized: false }));
  app.use((req, _res, next) => {
    if (req.get('x-user')) req.user = { id: req.get('x-user'), roles: [req.get('x-role') || 'Teacher'] };
    next();
  });
  app.use(createModuleRouter({ query, loadClasses: async (_req, year) => {
    assert.equal(year, 2026);
    if (directoryFails) throw new Error('Directory unavailable');
    return { staffCode: 'TEST', classes: [{ code: '11TEST', students: group.students }] };
  } }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = 'http://127.0.0.1:' + server.address().port + '/api/planner/';
  async function login(id) {
    const response = await fetch(base + 'session', { headers: { 'x-user': id } });
    const cookie = response.headers.get('set-cookie').split(';')[0];
    return { 'x-user': id, cookie, 'Content-Type': 'application/json', 'x-planner-csrf': (await response.json()).csrf };
  }
  return { base, login, failDirectory() { directoryFails = true; } };
}
test('attendance API requires sign-in, CSRF, ownership and revisions without changing planner notes', async t => {
  const saved = new Map(), marks = new Map();
  const { base, login, failDirectory } = await fixture(t, async (sql, params) => {
    assert.match(sql, /planner_attendance_/);
    const key = params[0] + ':' + params[1];
    if (sql.includes('planner_attendance_groups')) {
      if (sql.startsWith('SELECT')) return { rows: saved.has(key) ? [saved.get(key)] : [] };
      const old = saved.get(key);
      if (sql.startsWith('INSERT') && old || sql.startsWith('UPDATE') && old?.revision !== params[3]) return { rows: [] };
      const value = { content: JSON.parse(params[2]), revision: (old?.revision || 0) + 1 };
      saved.set(key, value); return { rows: [{ revision: value.revision }] };
    }
    if (sql.startsWith('SELECT')) return { rows: [...marks.values()].filter(item => item.owner === params[0]) };
    const markKey = key + ':' + params[2] + ':' + params[3] + ':' + params[4], old = marks.get(markKey);
    if (sql.startsWith('INSERT') && old || sql.startsWith('UPDATE') && old?.revision !== params[7]) return { rows: [] };
    const value = { owner: params[0], student_id: params[2], date: params[3], period: params[4], mark: params[5],
      student_name: params[6], revision: (old?.revision || 0) + 1 };
    marks.set(markKey, value); return { rows: [{ revision: value.revision }] };
  });
  assert.equal((await fetch(base + 'attendance/2026/groups')).status, 401);
  assert.equal((await fetch(base + 'attendance/2026/groups', { headers: { 'x-user': owner, 'x-role': 'Student' } })).status, 403);
  const headers = await login(owner), otherHeaders = await login(other);
  const put = (path, body, auth = headers) => fetch(base + 'attendance/2026/' + path,
    { method: 'PUT', headers: auth, body: JSON.stringify(body) });
  assert.equal((await put('groups', { revision: 0, content }, { ...headers, 'x-planner-csrf': 'bad' })).status, 403);
  assert.equal((await put('groups', { revision: 0, content })).status, 200);
  assert.equal((await put('groups', { revision: 0, content })).status, 409);
  assert.deepEqual((await (await fetch(base + 'attendance/2026/groups', { headers: otherHeaders })).json()).content, { groups: [] });
  const mark = { studentId: 'k:100', date: '2026-10-29', period: 'p1', mark: 'P', revision: 0 };
  assert.equal((await put('mark', mark, otherHeaders)).status, 400, 'another teacher cannot mark an unowned register');
  assert.equal((await put('mark', { ...mark, owner_id: other })).status, 400);
  assert.equal((await put('mark', mark)).status, 200);
  assert.equal((await put('mark', mark)).status, 409);
  assert.equal((await put('mark', { ...mark, revision: 1, mark: '' })).status, 200, 'blank explicitly clears a saved mark');
  assert.equal((await put('mark', { ...mark, mark: 'E' })).status, 400);
  const response = await fetch(base + 'attendance/2026/week/2026-10-26', { headers });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await response.json()).marks[0].mark, '');
  assert.equal((await (await fetch(base + 'attendance/2026/week/2026-10-26', { headers: otherHeaders })).json()).marks.length, 0);
  assert.equal((await fetch(base + 'attendance/2026/week/2026-10-27', { headers })).status, 400);
  assert.equal((await fetch(base + 'attendance/classes/2026', { headers })).status, 200);
  assert.equal((await put('groups', { revision: 1, content: {
    groups: [{ ...group, scheduleMode: 'auto', periods: ['p1'] }]
  } })).status, 200);
  assert.equal((await put('mark', { ...mark, period: 'p5' })).status, 200,
    'automatic groups allow timetable periods beyond the legacy manual selection');
  failDirectory();
  assert.equal((await fetch(base + 'attendance/classes/2026', { headers })).status, 502);
});
test('PostgreSQL persists private attendance and rejects stale cell revisions', {
  skip: !process.env.PLANNER_TEST_DATABASE_URL
}, async t => {
  const schema = 'attendance_' + crypto.randomUUID().replaceAll('-', '');
  const admin = new Pool({ connectionString: process.env.PLANNER_TEST_DATABASE_URL, ssl: false });
  await admin.query('CREATE SCHEMA "' + schema + '"');
  const url = new URL(process.env.PLANNER_TEST_DATABASE_URL);
  url.searchParams.set('options', '-c search_path=' + schema);
  const pool = new Pool({ connectionString: url.toString(), ssl: false });
  t.after(async () => { await pool.end(); await admin.query('DROP SCHEMA "' + schema + '" CASCADE'); await admin.end(); });
  await pool.query(fs.readFileSync(require.resolve('./db/migrations/012_attendance.sql'), 'utf8'));
  const { base, login } = await fixture(t, (sql, values) => pool.query(sql, values));
  const headers = await login(owner);
  const put = (path, body) => fetch(base + 'attendance/2026/' + path, { method: 'PUT', headers, body: JSON.stringify(body) });
  assert.equal((await put('groups', { revision: 0, content })).status, 200);
  const value = { studentId: 'k:100', date: '2026-10-29', period: 'p3', mark: 'L', revision: 0 };
  assert.equal((await put('mark', value)).status, 200);
  assert.equal((await put('mark', value)).status, 409);
  assert.equal((await put('mark', { ...value, revision: 1, mark: 'A' })).status, 200);
  const stored = await (await fetch(base + 'attendance/2026/week/2026-10-26', { headers })).json();
  assert.deepEqual(stored.marks, [{ student_id: 'k:100', student_name: 'Synthetic Student', date: '2026-10-29', period: 'p3', mark: 'A', revision: 2 }]);
  assert.equal((await put('groups', { revision: 1, content: { groups: [] } })).status, 200);
  assert.equal((await (await fetch(base + 'attendance/2026/week/2026-10-26', { headers })).json()).marks.length, 1, 'removing a tab never deletes attendance');
});
