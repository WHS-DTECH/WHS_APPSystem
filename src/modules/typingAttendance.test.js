const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createTypingAttendanceRouter, lessonEntries } = require('./typingAttendance');

const studentEmail = 'synthetic-student@westlandhigh.school.nz';
const startDate = '2026-10-26';
const key = 'synthetic-test-key-not-a-real-secret-123456789';
const ownerId = '11111111-1111-4111-8111-111111111111';
const code = 'TEST-SRDTECH-ROOM';
async function fixture(t, options = {}) {
  const queries = [];
  const marks = options.marks || [{ date: '2026-11-24', period: 'p1', mark: 'A' },
    { date: '2026-11-27', period: 'p3', mark: 'A' }, { date: '2026-11-23', period: 'p1', mark: 'P' }];
  const plannerQuery = async (sql, params) => {
    queries.push({ sql, params });
    assert.match(sql, /^SELECT/, 'The connector is strictly read-only');
    if (sql.includes('planner_sections')) return { rows: [] };
    if (sql.includes('planner_attendance_groups')) return { rows: [{ content: { groups: [{
      name: 'SRDTECH', scheduleMode: 'auto', classes: [code], students: [{ id: 'k:synthetic-id', name: 'Not exported' }]
    }] } }] };
    if (sql.includes('school_planner_settings')) return { rows: [{ content: { term4Start: '2026-10-12', term4End: '2026-12-18',
      events: options.closure ? [{ date: '2026-11-27', kind: 'closure' }] : [] } }] };
    if (sql.includes('teacher_calendar_settings')) return { rows: [{ subscription_url: 'https://westlandhigh.school.kiwi/ics/synthetic-private.ics' }] };
    if (sql.includes('planner_attendance_marks')) return { rows: marks };
    throw new Error('Unexpected query');
  };
  const app = express();
  app.use('/integrations/typing-attendance', createTypingAttendanceRouter({
    env: options.unconfigured ? {} : { DTECH_TYPING_ATTENDANCE_KEY: key, DTECH_TYPING_ATTENDANCE_OWNER_EMAIL: 'synthetic-owner@westlandhigh.school.nz' },
    dbQuery: async sql => { queries.push({ sql }); return { rows: [{ id: ownerId }] }; },
    directoryQuery: async () => ({ rows: options.ambiguous ? [{ id: 'synthetic-id' }, { id: 'other-id' }] : [{ id: 'synthetic-id' }] }),
    plannerQuery,
    authorize: async id => options.denied ? null : { id, email: 'synthetic-owner@westlandhigh.school.nz' },
    classes: async () => ({ classes: [{ code, students: [{ id: 'k:synthetic-id' }] }] }),
    calendar: async () => ({ available: true, publicHolidaysAvailable: !options.calendarUnavailable, publicHolidays: [] }),
    timetable: async () => ({ events: [
      { id: 'a', title: 'SRDTECH', start: '2026-11-24T09:00:00', end: '2026-11-24T10:00:00' },
      { id: 'b', title: 'SRDTECH', start: '2026-11-27T11:20:00', end: '2026-11-27T12:20:00' },
      { id: 'other', title: 'MATH', start: '2026-11-23T09:00:00', end: '2026-11-23T10:00:00' }
    ] }),
    now: () => new Date('2026-11-28T00:00:00Z')
  }));
  const server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const call = async (body = { studentEmail, startDate }, token = key) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/integrations/typing-attendance`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(body)
    });
    return { status: response.status, data: await response.json(), cache: response.headers.get('cache-control') };
  };
  return { call, queries };
}

test('connector returns only the matched student lessons from the fixed owner register', async t => {
  const f = await fixture(t);
  const response = await f.call();
  assert.equal(response.status, 200);
  assert.equal(response.data.weeks.length, 7);
  assert.equal(response.data.studentEmail, studentEmail);
  assert.deepEqual(response.data.weeks[4], { weekStart: '2026-11-23', confirmed: true, lessons: [
    { date: '2026-11-24', period: 'p1', mark: 'A' }, { date: '2026-11-27', period: 'p3', mark: 'A' }
  ] });
  assert.match(response.cache, /no-store/);
  assert.doesNotMatch(JSON.stringify(response.data), /Not exported|synthetic-private|owner|MATH/);
  const markQuery = f.queries.find(item => item.sql.includes('FROM planner_attendance_marks'));
  assert.deepEqual(markQuery.params, [ownerId, 'k:synthetic-id', startDate, '2026-12-13']);
  assert.equal(response.data.weeks[0].confirmed, false, 'No scheduled lesson is not invented as an absence');
});

test('closure dates are excluded and blank marks remain unrecorded', async t => {
  const f = await fixture(t, { closure: true, marks: [] });
  const response = await f.call();
  assert.deepEqual(response.data.weeks[4].lessons, [{ date: '2026-11-24', period: 'p1', mark: '' }]);
});

test('unconfigured, unauthorised and invalid requests never read private records', async t => {
  const absent = await fixture(t, { unconfigured: true });
  assert.equal((await absent.call()).status, 503);
  assert.equal(absent.queries.length, 0);
  const f = await fixture(t);
  assert.equal((await f.call(undefined, 'wrong')).status, 401);
  for (const body of [{ studentEmail: 'external@example.test', startDate }, { studentEmail, startDate: '2026-10-27' },
    { studentEmail, startDate, ownerId: 'someone-else' }, { studentEmail, startDate: '2026-02-30' }]) {
    assert.equal((await f.call(body)).status, 400);
  }
  assert.equal(f.queries.length, 0);
});

test('ambiguous identity, denied owner and unavailable holiday calendar fail explicitly', async t => {
  const logs = [];
  t.mock.method(console, 'error', (...args) => logs.push(args));
  for (const [options, code] of [[{ ambiguous: true }, 'student-not-unique'],
    [{ denied: true }, 'owner-access-unavailable'], [{ calendarUnavailable: true }, 'school-calendar-unavailable']]) {
    const f = await fixture(t, options);
    assert.equal((await f.call()).status, 502);
    assert.deepEqual(logs.at(-1), ['[typing-attendance] Read failed:', code]);
  }
});

test('lesson matching uses NZ dates, period overlap and ignores all-day events', () => {
  const entries = lessonEntries([
    { title: 'SRDTECH', start: '2026-11-23T20:00:00Z', end: '2026-11-23T21:00:00Z' },
    { title: 'Not a lesson', allDay: true, start: '2026-11-24', end: '2026-11-25' }
  ], '2026-11-23');
  assert.deepEqual(entries['p1:1'], [{ title: 'SRDTECH' }]);
  assert.deepEqual(entries['p1:0'], []);
});
