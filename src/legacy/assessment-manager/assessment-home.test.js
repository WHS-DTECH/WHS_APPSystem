const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { Pool } = require('pg');
const { parseCalendar, nationalCalendar, schoolCalendar, MONTHS } = require('./assessmentCalendar');
const { parseTimetable, parseAssessmentPdf, filterTimetable, examTimetable } = require('./examTimetable');
const { moderationTask } = require('./assessmentHome');
const { createAssessmentRouter } = require('./assessment');
const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', other = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const record = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', taskId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
function calendarHtml() {
  const entry = (day, title, id) => `<span class="key-dates-page__key-date-numeric">${day}</span>
    <div class="key-dates-page__key-date-summary"><div><p>${title}</p></div></div>
    <div class="key-dates-page__calendar-link-wrapper"><a href="/key-date/download/${id}">Add</a></div>`;
  return 'Key business dates 2026' + MONTHS.map((month, i) =>
    `<span class="key-dates-page__month-english">${month}</span>` + entry('01', 'Data submission &amp; checks', i + 1) +
    (i === 10 ? entry('10', 'NCEA AND NZ SCHOLARSHIP EXAMS COMMENCE', 20) + entry('27', 'Submit assessment plan for 2027 moderation', 21) : '') +
    (i === 11 ? entry('04', 'NCEA AND NZ SCHOLARSHIP EXAMINATIONS END', 22) : '')).join('');
}
function timetableHtml() {
  const exam = (id, name, digital = false) => `<div class="exam-timetable-page__exam-list-cell-item checkbox">
    <input aria-label="Select ${name} to add to calendar" value="${id}">
    ${digital ? '<img class="digitally-assessed">' : ''}</div>`;
  const submission = name => `<div class="exam-timetable-page__exam-list-cell-item"><span>${name}</span></div>`;
  return `<p class="page-hero__summary">Find dates for 2026 NCEA exams and assessments</p>
    <form id="ExamTimetableList"><h3 class="exam-timetable-page__exam-list-item-title">Exams on Tuesday, 10th November</h3>
    <div class="exam-timetable-page__table-row" role="row"><div role="rowheader">2:00pm</div>
    ${exam(1, 'Level 3 Digital Technologies', true)}${exam(2, 'Level 1 English')}</div></form>
    <h3>Dates for submitting portfolios and reports</h3><div class="exam-timetable-page__table-row" role="row">
    <div class="exam-timetable-page__table-cell " role="cell">Wednesday 28 October</div>
    ${submission('Level 1 Design and Visual Communication')}${submission('Level 3 Design and Visual Communication')}
    ${submission('Level 2 Visual Arts')}</div><h2>Other assessments</h2>`;
}
test('NZQA timetable includes department exams, times, digital status and portfolio submissions without leaking unrelated subjects', () => {
  const all = parseTimetable(timetableHtml(), 2026);
  const tech = filterTimetable(all, [{ name: 'Technology', subjects: ['DTECH', 'DVC'] }]);
  assert.equal(tech.events.length, 3);
  assert.deepEqual(tech.events.map(item => item.date), ['2026-11-10', '2026-10-28', '2026-10-28']);
  assert.match(tech.events[0].details, /2:00pm.*Digitally assessed/);
  assert.ok(tech.events.every(item => !/English|Visual Arts/.test(item.title)));
  assert.equal(filterTimetable(all, [{ name: 'English', subjects: [] }]).events.length, 1);
  assert.deepEqual(filterTimetable(all, [{ name: 'Other', subjects: ['UNKNOWN'] }]).unknown, ['UNKNOWN']);
  assert.throws(() => parseTimetable(timetableHtml(), 2027), /requested year/);
  assert.throws(() => parseTimetable(timetableHtml().replace('2:00pm', 'unknown'), 2026), /start time/);
  assert.throws(() => parseTimetable(timetableHtml().replace('Wednesday 28 October', 'Wednesday 32 October'), 2026), /invalid date/);
});
test('exam timetable uses its separate cache and reports stale or missing dates', async () => {
  let cached;
  const query = async (sql, params) => {
    if (sql.startsWith('SELECT')) return { rows: cached ? [cached] : [] };
    cached = { events: JSON.parse(params[1]), checked_at: params[2] }; return { rows: [] };
  };
  const loaded = await examTimetable(2026, { query, now: new Date('2026-11-14T08:00:00Z'),
    fetchImpl: async () => ({ ok: true, text: async () => timetableHtml() }) });
  assert.equal(loaded.warning, '');
  const stale = await examTimetable(2026, { query, now: new Date('2026-11-15T08:00:00Z'),
    fetchImpl: async () => { throw new Error('Temporary outage'); } });
  assert.deepEqual(stale.events, loaded.events); assert.match(stale.warning, /last saved exam timetable/);
  cached = undefined;
  const missing = await examTimetable(2027, { query, fetchImpl: async () => ({ ok: true, text: async () => timetableHtml() }) });
  assert.equal(missing.events.length, 0); assert.match(missing.warning, /unavailable/);
});
test('future-year assessment PDFs preserve portfolio levels and never invent exam times', () => {
  const pdf = `NCEA and NZ Scholarship Assessment Timetable 2027
Term 4 27 October Design and Visual Communication L1, L2, L3, NZ Schol NZC N/A Submission
Term 4 27 October Materials and Processing Technology 1.3 and 1.4 L1 NZC N/A Submission`;
  const events = parseAssessmentPdf(pdf, 2027, 'https://www2.nzqa.govt.nz/assets/timetable.pdf');
  assert.equal(events.length, 5);
  assert.ok(events.every(item => item.date === '2027-10-27'));
  assert.ok(events.some(item => item.title === 'Scholarship Design and Visual Communication portfolio submission'));
  assert.ok(events.some(item => item.title === 'Level 1 Materials and Processing Technology portfolio submission'));
  assert.throws(() => parseAssessmentPdf(pdf, 2026, ''), /different year/);
  assert.throws(() => parseAssessmentPdf(pdf + '\nTerm 4 Unknown NZC N/A Submission', 2027, ''), /could not be read/);
});
test('NZQA parsing retains all twelve months, clean titles, cross-month exams and the actual calendar year', () => {
  const events = parseCalendar(calendarHtml(), 2026);
  assert.equal(new Set(events.map(event => event.date.slice(0, 7))).size, 12);
  assert.equal(events[0].title, 'Data submission & checks');
  assert.equal(events.find(event => event.id === 'nzqa-20').endDate, '2026-12-04');
  assert.equal(events.find(event => event.id === 'nzqa-21').date, '2026-11-27');
  assert.throws(() => parseCalendar(calendarHtml(), 2027), /requested year/);
  assert.throws(() => parseCalendar(calendarHtml().replace('>February<', '>Unknown<'), 2026), /unknown calendar month/);
});
test('NZQA refresh persists good data and visibly reports stale or unavailable dates without rolling a year forward', async () => {
  let cached, writes = 0;
  const query = async (sql, params) => {
    if (sql.startsWith('SELECT')) return { rows: cached ? [cached] : [] };
    writes++; cached = { events: JSON.parse(params[1]), checked_at: params[2] }; return { rows: [] };
  };
  const loaded = await nationalCalendar(2026, { query, now: new Date('2026-11-14T08:00:00Z'),
    fetchImpl: async () => ({ ok: true, text: async () => calendarHtml() }) });
  assert.equal(writes, 1); assert.equal(loaded.warning, '');
  const stale = await nationalCalendar(2026, { query, now: new Date('2026-11-15T08:00:00Z'),
    fetchImpl: async () => { throw new Error('Temporary outage'); } });
  assert.deepEqual(stale.events, loaded.events); assert.match(stale.warning, /last saved calendar/);
  cached = undefined;
  const future = await nationalCalendar(2027, { query, fetchImpl: async () => ({ ok: true, text: async () => calendarHtml() }) });
  assert.equal(future.events.length, 0); assert.match(future.warning, /unavailable/); assert.equal(writes, 1);
});
test('moderation ticks automatically from recorded moderation with no additional evidence requirements', () => {
  const make = internal => moderationTask({ entry_key: record, content: { standardNumber: '29777', internal: JSON.stringify(internal) } }, '2026-11-22');
  assert.equal(make({ verificationDate: '2026-11-15' }).done, true);
  assert.equal(make({ samples: [{ moderatedDate: '2026-11-15' }] }).done, true);
  assert.equal(make({ critiqueDate: '2026-11-15' }).done, false);
  assert.equal(make({}).done, false);
  assert.throws(() => moderationTask({ entry_key: record, content: { internal: '{' } }, ''), SyntaxError);
});
test('school source references preserve imprecise dates from the supplied summary', () => {
  const school = schoolCalendar(2026);
  assert.match(school.find(event => event.id === 'whs-dtech-entries').sourceDeadline, /End of May/);
  assert.match(school.find(event => event.id === 'whs-term-one').sourceDeadline, /Term 1/);
  assert.match(school.find(event => event.id === 'whs-publish-results').sourceDocument, /slideshow/);
});
test('homepage PostgreSQL persistence, automatic ticks, audit, revisions and owner isolation', {
  skip: !process.env.ASSESSMENT_HOME_TEST_DATABASE_URL && 'Set ASSESSMENT_HOME_TEST_DATABASE_URL to an empty disposable PostgreSQL database.'
}, async t => {
  const pool = new Pool({ connectionString: process.env.ASSESSMENT_HOME_TEST_DATABASE_URL });
  t.after(() => pool.end());
  for (const file of ['002_assessment_records.sql', '004_assessment_home.sql', '005_school_calendar.sql', '008_exam_timetable_cache.sql']) {
    await pool.query(fs.readFileSync(path.join(__dirname, 'db', 'migrations', file), 'utf8'));
  }
  await pool.query('INSERT INTO assessment_calendar_cache(year,events) VALUES(2026,$1::jsonb)', [JSON.stringify(parseCalendar(calendarHtml(), 2026))]);
  await pool.query('INSERT INTO assessment_exam_timetable_cache(year,events) VALUES(2026,$1::jsonb)', [JSON.stringify(parseTimetable(timetableHtml(), 2026))]);
  let user = owner, roles = ['Teacher'], moduleRoles = [], ownerDepartment = true;
  const app = express(), session = {};
  app.use((req, res, next) => { req.user = { id: user, roles, module_roles: moduleRoles }; req.session = session; next(); });
  app.use('/api/', createAssessmentRouter({ query: (sql, params) => pool.query(sql, params),
    loadTeachingSubjects: async req => ({ myDepartments: req.user.id === owner && ownerDepartment ? [{ name: 'Technology', subjects: ['DVC', 'DTECH'] }] : [] }) }));
  app.use((error, req, res, next) => res.status(500).json({ error: 'Test request failed.' }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/`;
  const csrf = (await (await fetch(base + 'session')).json()).csrf;
  const read = async url => { const response = await fetch(base + url); assert.equal(response.status, 200); return response.json(); };
  const put = (url, content, revision, token = csrf) => fetch(base + url, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-assessment-csrf': token }, body: JSON.stringify({ content, revision })
  });
  const common = { standardNumber: '29777', title: 'Database assessment', internal: '{}' };
  assert.equal((await put('2026/moderation/' + record, common, 0)).status, 200);
  let home = await read('home/2026');
  const exam = home.events.find(event => event.title === 'Level 3 Digital Technologies exam (2:00pm)');
  assert.equal(exam.date, '2026-11-10');
  assert.equal(home.events.filter(event => /Design and Visual Communication portfolio/.test(event.title)).length, 2);
  assert.equal(home.events.some(event => /Level 1 English exam/.test(event.title)), false);
  assert.equal(home.tasks.length, 1); assert.equal(home.tasks[0].completed_at, null);
  const moderated = { ...common, internal: '{"verificationDate":"2026-11-15"}' };
  assert.equal((await put('2026/moderation/' + record, moderated, 1)).status, 200);
  home = await read('home/2026');
  assert.ok(home.tasks[0].completed_at);
  assert.equal((await read('home/2026')).tasks[0].completed_at, home.tasks[0].completed_at);
  let audit = await read('home/2026/history');
  assert.equal(audit.entries.filter(entry => entry.action === 'auto-completed').length, 1);
  assert.equal((await put('2026/moderation/' + record, common, 2)).status, 200);
  assert.equal((await read('home/2026')).tasks[0].completed_at, null);
  assert.ok((await read('home/2026/history')).entries.some(entry => entry.action === 'reopened'));
  const manual = { title: 'Finish markbooks', dueDate: '2026-12-01', notes: '', completed: false, eventId: 'whs-markbooks' };
  assert.equal((await put('home/2026/tasks/' + taskId, manual, 0, '')).status, 403);
  assert.equal((await put('home/2026/tasks/' + taskId, manual, 0)).status, 200);
  assert.equal((await put('home/2026/tasks/' + taskId, { ...manual, completed: true }, 1)).status, 200);
  assert.equal((await put('home/2026/tasks/' + taskId, manual, 1)).status, 409);
  assert.equal((await put('home/2026/tasks/' + taskId, { ...manual, dueDate: '2026-02-30' }, 2)).status, 400);
  const event = { title: 'Finish moderation', date: '2026-11-21', endDate: '', details: 'Updated instruction', needsConfirmation: false };
  assert.equal((await put('home/2026/calendar/whs-publish-results', event, 0)).status, 200);
  assert.equal((await put('home/2026/calendar/whs-publish-results', event, 0)).status, 409);
  assert.equal((await put('home/2026/calendar/nzqa-21', { ...event, title: 'My national date' }, 0)).status, 200);
  const withPrivateNational = await read('home/2026');
  assert.equal(withPrivateNational.events.find(item => item.id === 'nzqa-21').date, '2026-11-21');
  assert.equal(withPrivateNational.nationalEvents.find(item => item.id === 'nzqa-21').date, '2026-11-27');
  assert.equal((await read('home/2026')).tasks.find(task => task.kind === 'moderation').content.dueDate, '2026-11-21');
  user = other;
  assert.equal((await read('home/2026')).tasks.length, 0);
  assert.equal((await read('home/2026/history')).entries.length, 0);
  assert.equal((await read('home/2026')).events.find(event => event.id === 'whs-publish-results').date, '2026-11-22');
  assert.equal((await put('home/2026/tasks/' + taskId, manual, 2)).status, 409);
  const shared = { title: 'Shared publication deadline', date: '2026-11-23', endDate: '', details: '', needsConfirmation: false };
  assert.equal((await put('home/2026/school-calendar/whs-publish-results', shared, 0)).status, 403);
  moduleRoles = ['technician'];
  assert.equal((await put('home/2026/school-calendar/whs-publish-results', shared, 0)).status, 403);
  moduleRoles = ['lead-teacher'];
  assert.equal((await put('home/2026/school-calendar/whs-publish-results', shared, 0)).status, 200);
  assert.equal((await put('home/2026/school-calendar/whs-publish-results', shared, 0)).status, 409);
  assert.equal((await put('home/2026/school-calendar/nzqa-20', shared, 0)).status, 400);
  assert.equal((await put('home/2026/school-calendar/whs-publish-results', { ...shared, date: '2027-01-01' }, 1)).status, 400);
  assert.equal((await put('home/2026/school-calendar/whs-publish-results', { ...shared, date: '2026-11-24' }, 1)).status, 200);
  await pool.query("ALTER TABLE assessment_school_calendar_history ADD CONSTRAINT test_shared_audit_failure CHECK (content->>'title'<>'Rejected shared') NOT VALID");
  assert.equal((await put('home/2026/school-calendar/whs-publish-results', { ...shared, title: 'Rejected shared' }, 2)).status, 500);
  await pool.query('ALTER TABLE assessment_school_calendar_history DROP CONSTRAINT test_shared_audit_failure');
  const otherHome = await read('home/2026');
  assert.equal(otherHome.events.find(item => item.id === 'whs-publish-results').date, '2026-11-24');
  assert.equal(otherHome.schoolEvents.find(item => item.id === 'whs-publish-results').date, '2026-11-24');
  assert.equal(otherHome.events.find(item => item.id === 'whs-publish-results').revision, 0);
  assert.equal(otherHome.schoolEvents.find(item => item.id === 'whs-publish-results').revision, 2);
  assert.match(otherHome.schoolEvents.find(item => item.id === 'whs-publish-results').sourceDeadline, /22 November/);
  assert.equal(otherHome.canEditSchool, true);
  assert.match(otherHome.nationalUrl, /^https:\/\/www2\.nzqa\.govt\.nz\//);
  assert.equal((await put('home/2026/calendar/whs-publish-results', { ...shared, date: '2026-11-25' }, 0)).status, 200);
  assert.equal((await read('home/2026')).events.find(item => item.id === 'whs-publish-results').date, '2026-11-25');
  moduleRoles = []; roles = ['ADMIN'];
  const future = { ...shared, title: 'Future school deadline', date: '2027-02-01',
    sourceDocument: 'School memorandum', sourceDeadline: '1 February 2027: school deadline' };
  assert.equal((await put('home/2027/school-calendar/whs-new-deadline', future, 0)).status, 200);
  assert.equal((await put('home/2027/school-calendar/whs-new-deadline', { ...future, sourceDocument: 'x'.repeat(601) }, 1)).status, 400);
  const { sourceDocument, sourceDeadline, ...legacyFuture } = future;
  assert.equal((await put('home/2027/school-calendar/whs-new-deadline', { ...legacyFuture, title: 'Updated deadline' }, 1)).status, 200);
  await pool.query("INSERT INTO assessment_calendar_cache(year,events) VALUES(2027,'[]'::jsonb)");
  await pool.query("INSERT INTO assessment_exam_timetable_cache(year,events) VALUES(2027,'[]'::jsonb)");
  const futureEvent = (await read('home/2027/calendar')).schoolEvents.find(item => item.id === 'whs-new-deadline');
  assert.equal(futureEvent.date, '2027-02-01');
  assert.equal(futureEvent.sourceDocument, sourceDocument);
  assert.equal(futureEvent.sourceDeadline, sourceDeadline);
  assert.equal((await pool.query('SELECT COUNT(*)::integer AS count FROM assessment_school_calendar_history')).rows[0].count, 4);
  roles = ['Teacher'];
  user = owner;
  const ownerHome = await read('home/2026');
  assert.equal(ownerHome.events.find(item => item.id === 'whs-publish-results').date, '2026-11-21');
  assert.equal(ownerHome.events.find(item => item.id === 'whs-publish-results').privateOverride, true);
  assert.equal(ownerHome.schoolEvents.find(item => item.id === 'whs-publish-results').date, '2026-11-24');
  await pool.query("ALTER TABLE assessment_home_audit ADD CONSTRAINT test_audit_failure CHECK (action<>'task-updated') NOT VALID");
  assert.equal((await put('home/2026/tasks/' + taskId, { ...manual, completed: true, notes: 'Must roll back' }, 2)).status, 500);
  assert.equal((await read('home/2026')).tasks.find(task => task.task_key === taskId).content.notes, '');
  await pool.query('ALTER TABLE assessment_home_audit DROP CONSTRAINT test_audit_failure');
  assert.equal((await put('home/2026/tasks/' + taskId, manual, 2)).status, 200);
  assert.ok((await read('home/2026/history')).entries.some(entry => entry.entry_key === taskId && entry.action === 'reopened'));
  const deleted = await fetch(base + 'moderation/2026/' + record, {
    method: 'DELETE', headers: { 'Content-Type': 'application/json', 'x-assessment-csrf': csrf }, body: JSON.stringify({ revision: 3 })
  });
  assert.equal(deleted.status, 200);
  assert.equal((await read('home/2026')).tasks.filter(task => task.kind === 'moderation').length, 0);
  assert.ok((await read('home/2026/history')).entries.some(entry => entry.action === 'record-removed'));
  const examTask = { title: 'Review digital exam', dueDate: exam.date, notes: '', completed: false, eventId: exam.id };
  assert.equal((await put('home/2026/tasks/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', examTask, 0)).status, 200);
  assert.equal((await put('home/2026/calendar/' + exam.id,
    { title: exam.title, date: exam.date, endDate: '', details: exam.details, needsConfirmation: false }, 0)).status, 200);
  assert.equal((await read('home/2026')).tasks.find(item => item.content.eventId === exam.id).content.title, 'Review digital exam');
  ownerDepartment = false;
  const noDepartment = await read('home/2026');
  assert.equal(noDepartment.events.some(item => item.id === exam.id), false);
  assert.ok(noDepartment.tasks.some(item => item.content.eventId === exam.id));
  assert.match(noDepartment.warning, /No verified department/);
  assert.equal((await fetch(base + 'home/invalid')).status, 400);
});
