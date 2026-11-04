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
  const context = { structuredClone, crypto, TextEncoder, confirm: () => true };
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
function importFixture() {
  const automatic = { ...group, name: 'Synthetic class', scheduleMode: 'auto', classes: ['VP-TEST-CW', 'VP-OTHER-CW'],
    students: [{ id: 'k:100', name: 'Alex Example' }] };
  return {
    pdf: { weeks: ['2026-10-26', '2026-11-02'], rows: [{ name: 'Example, Alex', days: [
      { date: '2026-10-27', slots: ['L', 'P', 'A', '', 'P', 'L', '', 'A'] },
      { date: '2026-10-28', slots: ['A', 'L', 'P', '', 'P', 'L', '', 'A'] },
      { date: '2026-11-05', slots: ['P', 'P', '', '', '', '', '', ''] }
    ] }] },
    group: automatic,
    directory: { classes: [
      { code: 'VP-TEST-CW', students: automatic.students },
      { code: 'VP-OTHER-CW', students: [{ id: 'k:200', name: 'Other Student' }] }
    ] },
    schedules: { '2026-10-26': {
      'p1:1': [{ title: 'TEST' }], 'p2:1': [{ title: 'OTHER' }], 'p3:1': [{ title: 'TEST' }],
      'p1:2': [{ title: 'TEST' }], 'p2:2': [{ title: 'TEST' }], 'p5:2': [{ title: 'TEST' }]
    }, '2026-11-02': { 'p1:3': [{ title: 'TEST' }], 'p2:3': [{ title: 'TEST' }] } },
    savedMarks: [
      { student_id: 'k:100', date: '2026-10-27', period: 'p3', mark: 'A', revision: 1 },
      { student_id: 'k:100', date: '2026-10-28', period: 'p1', mark: 'A', revision: 1 },
      { student_id: 'k:100', date: '2026-10-28', period: 'p2', mark: '', revision: 2 }
    ],
    year: 2026, today: '2026-11-05', ranges: [{ term: '4', startDate: '2026-10-12', endDate: '2026-12-18' }],
    school: {}, calendar: {}
  };
}
test('import matches unique roster names, maps Wednesday slots and selects each student timetable', () => {
  const options = importFixture();
  const plan = browser().planImport(options);
  assert.equal(plan.matched, 1);
  assert.equal(plan.conflicts.length, 1);
  assert.equal(plan.conflicts[0].existing, 'A');
  assert.equal(plan.conflicts[0].mark, 'P');
  assert.equal(plan.unchanged, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(plan.fills.map(value => [value.date, value.period, value.mark, value.revision]))), [
    ['2026-10-27', 'p1', 'P', 0],
    ['2026-10-28', 'p2', 'L', 2],
    ['2026-10-28', 'p5', 'A', 0],
    ['2026-11-05', 'p1', 'P', 0]
  ]);
  assert.equal(plan.fills.some(value => value.date === '2026-10-27' && value.period === 'p2'), false,
    'a student in TEST must not import OTHER periods from the combined tab');
});
test('import excludes closures, known holidays, future dates and dates outside configured terms', () => {
  const options = importFixture();
  options.calendar.publicHolidays = [{ date: '2026-10-27' }];
  options.school.events = [{ date: '2026-10-28', kind: 'teacherOnly' }];
  options.today = '2026-11-04';
  let plan = browser().planImport(options);
  assert.equal(plan.fills.length + plan.conflicts.length, 0);
  options.today = '2026-11-06';
  options.ranges = [{ startDate: '2026-11-06', endDate: '2026-12-18' }];
  plan = browser().planImport(options);
  assert.equal(plan.fills.length, 0);
});
test('weekly coverage distinguishes complete PDFs from missing/future slots and unresolved names', () => {
  const options = importFixture(), api = browser();
  let plan = api.planImport(options);
  assert.equal(plan.coverage[0].expected, 5);
  assert.equal(plan.coverage[0].recorded, 5);
  assert.equal(plan.coverage[0].conflicts, 1);
  assert.match(api.weekStatus(plan.coverage[0], true), /^Loaded.*1 conflicts kept/);
  assert.equal(plan.coverage[1].expected, 2);
  assert.equal(plan.coverage[1].recorded, 1);
  assert.match(api.weekStatus(plan.coverage[1], true), /^Partial/);
  assert.equal(api.weekStatus(undefined, true), 'Marks present - import status unknown');
  assert.equal(api.weekStatus(undefined, false), 'Not loaded');
  options.today = '2026-10-27';
  plan = api.planImport(options);
  assert.equal(plan.coverage[0].recorded, 2);
  assert.equal(plan.coverage[0].expected, 5, 'future teaching periods count towards complete-week coverage');
  options.group.students.push({ id: 'k:300', name: 'Unmatched Student' });
  plan = api.planImport(options);
  assert.equal(plan.coverage[0].unresolved, true);
});
test('two-week page filters term/class, displays every week and distinguishes legacy and tracked imports', async () => {
  const options = importFixture(), host = element('section');
  const second = { ...options.group, id: crypto.randomUUID(), name: 'Second class', students: [] };
  const entry = { ...browser().planImport(options).coverage[0], importedAt: '2026-11-05T00:00:00Z' };
  await browser().mount(host, {
    el: element, ...options, overview: true,
    ranges: [{ term: '3', startDate: '2026-07-20', endDate: '2026-09-25' }, ...options.ranges],
    request: async path => path.endsWith('/groups') ? { revision: 1, content: { groups: [options.group, second] } } :
      { imports: { [options.group.id + ':2026-10-26']: entry }, markedWeeks: [{ student_id: 'k:100', week: '2026-11-02' }] }
  });
  let nodes = descendants(host);
  assert.equal(nodes.filter(node => node.attrs.scope === 'row').length, 10);
  assert.ok(nodes.some(node => node.textContent === 'Week 10'));
  assert.ok(nodes.some(node => node.textContent.startsWith('Loaded - 5/5')));
  assert.ok(nodes.some(node => node.textContent === 'Marks present - import status unknown'));
  const classes = nodes.find(node => node.attrs['aria-label'] === 'Two-week attendance class');
  classes.value = second.id; classes.events.change(); await new Promise(resolve => setImmediate(resolve));
  nodes = descendants(host);
  assert.equal(nodes.filter(node => node.attrs['data-import-status'] === 'empty').length, 10);
  const terms = nodes.find(node => node.attrs['aria-label'] === 'Two-week attendance term');
  terms.value = '3'; terms.events.change(); await new Promise(resolve => setImmediate(resolve));
  nodes = descendants(host);
  assert.ok(nodes.some(node => node.textContent === '2026-07-20'));
  assert.ok(nodes.some(node => node.textContent === 'Second class - Term 3 import history'));
});
test('all-class import ignores display filters, deduplicates shared marks and records each class week', async () => {
  const options = importFixture(), host = element('section'), saved = [];
  const second = { ...options.group, id: crypto.randomUUID(), name: 'Second class' };
  const manual = { ...options.group, id: crypto.randomUUID(), name: 'Manual class', scheduleMode: 'manual' };
  await browser().mount(host, {
    el: element, ...options, overview: true,
    request: async path => path.endsWith('/groups') ? { revision: 1, content: { groups: [options.group, second, manual] } } :
      path.endsWith('/imports') ? { imports: {}, markedWeeks: [] } :
        path.includes('/classes/') ? options.directory : { marks: options.savedMarks },
    loadSchedule: async week => options.schedules[week], uploadPdf: async () => options.pdf,
    mutate: async (path, body) => { saved.push([path, body]); return { revision: 1 }; }
  });
  descendants(host).find(node => node.attrs.type === 'file').files = [{ size: 100 }];
  await descendants(host).find(node => node.textContent === 'Preview PDF import').events.click();
  const nodes = descendants(host);
  assert.ok(nodes.some(node => node.textContent.startsWith('Second class: 4 blank marks')));
  assert.ok(nodes.some(node => node.textContent.startsWith('Manual class: skipped')));
  await nodes.find(node => node.textContent === 'Fill 4 blank marks').events.click();
  assert.equal(saved.filter(([path]) => path.endsWith('/mark')).length, 4, 'shared marks are not saved twice');
  const history = saved.find(([path]) => path.endsWith('/imports'))[1];
  assert.equal(history.entries.length, 4);
  assert.deepEqual(new Set(history.entries.map(item => item.groupId)), new Set([options.group.id, second.id]));
});
test('an already populated PDF can record import history without rewriting any marks', async () => {
  const options = importFixture(), host = element('section'), writes = [];
  const plan = browser().planImport(options);
  options.savedMarks.push(...plan.fills.map(value => ({ student_id: value.studentId, ...value })));
  await browser().mount(host, {
    el: element, ...options, overview: true,
    request: async path => path.endsWith('/groups') ? { revision: 1, content: { groups: [options.group] } } :
      path.endsWith('/imports') ? { imports: {}, markedWeeks: [] } :
        path.includes('/classes/') ? options.directory : { marks: options.savedMarks },
    loadSchedule: async week => options.schedules[week], uploadPdf: async () => options.pdf,
    mutate: async (path, body) => { writes.push([path, body]); return {}; }
  });
  descendants(host).find(node => node.attrs.type === 'file').files = [{ size: 100 }];
  await descendants(host).find(node => node.textContent === 'Preview PDF import').events.click();
  await descendants(host).find(node => node.textContent === 'Record import status (no mark changes)').events.click();
  assert.equal(writes.length, 1);
  assert.equal(writes[0][0], 'attendance/2026/imports');
});
function driveFixture() {
  const options = importFixture(), writes = [], processed = {}, files = [
    { id: 'synthetic_pdf_123', name: 'Attendance one.pdf', version: 'version-one' },
    { id: 'synthetic_pdf_456', name: 'Attendance two.pdf', version: 'version-two' }
  ];
  let revision = 1, failMark = 0, attempts = 0;
  const savedMarks = structuredClone(options.savedMarks);
  return {
    options, writes, processed, files,
    setRevision(value) { revision = value; }, failOnMark(value) { failMark = value; attempts = 0; },
    helpers: {
      ...options,
      request: async path => {
        if (path.endsWith('/drive-sync')) return { enabled: true, folderId: 'synthetic_folder_123', processed };
        if (path.endsWith('/groups')) return { revision, content: { groups: [options.group] } };
        if (path.includes('/classes/')) return options.directory;
        if (path.endsWith('/files')) return { files, accountId: 'synthetic-account', connectionId: 'connection-test' };
        if (path.includes('/files/')) {
          const file = files.find(item => path.endsWith(item.id));
          return { pdf: options.pdf, version: file.version, accountId: 'synthetic-account', connectionId: 'connection-test' };
        }
        return { marks: savedMarks };
      },
      loadSchedule: async week => options.schedules[week],
      mutate: async (path, body) => {
        if (path.endsWith('/mark') && ++attempts === failMark) throw new Error('Concurrent mark edit');
        writes.push([path, body]);
        if (path.endsWith('/mark')) {
          const old = savedMarks.find(item => item.student_id === body.studentId && item.date === body.date && item.period === body.period);
          if (old) { old.mark = body.mark; old.revision++; }
          else savedMarks.push({ student_id: body.studentId, ...body });
        } else if (path.endsWith('/file')) processed[body.fileId] = { ...body };
        return {};
      }
    }
  };
}
test('Drive sync fills matching blanks, checkpoints successful PDFs and skips unchanged versions', async () => {
  const fixture = driveFixture(), api = browser();
  let result = await api.syncDrive(fixture.helpers);
  assert.equal(result.files, 2);
  assert.equal(result.marks, 4, 'overlapping PDFs do not duplicate or overwrite marks');
  assert.equal(result.conflicts, 2);
  assert.equal(Object.keys(fixture.processed).length, 2);
  assert.ok(fixture.writes.filter(([path]) => path.endsWith('/mark')).every(([, value]) => value.fillOnly));
  const count = fixture.writes.length;
  result = await api.syncDrive(fixture.helpers);
  assert.equal(result.files, 0);
  assert.equal(result.skipped, 2);
  assert.equal(fixture.writes.length, count);
  fixture.files[0].version = 'updated-version';
  result = await api.syncDrive(fixture.helpers);
  assert.equal(result.files, 1);
  assert.equal(result.marks, 0);
  assert.equal(fixture.processed[fixture.files[0].id].version, 'updated-version');
  fixture.setRevision(2);
  result = await api.syncDrive(fixture.helpers);
  assert.equal(result.files, 2, 'changed saved classes trigger rematching of old PDFs');
  fixture.options.ranges[0].startDate = '2026-10-19';
  result = await api.syncDrive(fixture.helpers);
  assert.equal(result.files, 2, 'published term/calendar/roster context changes trigger rematching');
});
test('Drive sync never checkpoints a failed PDF and retry resumes without overwriting prior fills', async () => {
  const fixture = driveFixture(), api = browser();
  fixture.failOnMark(2);
  await assert.rejects(api.syncDrive(fixture.helpers), /1 marks saved so far.*not marked processed/);
  assert.equal(Object.keys(fixture.processed).length, 0);
  fixture.failOnMark(0);
  const result = await api.syncDrive(fixture.helpers);
  assert.equal(result.marks, 3);
  assert.equal(result.files, 2);
});
test('Drive sync retries previously deferred future marks when their date arrives', async () => {
  const fixture = driveFixture(), api = browser();
  fixture.options.pdf.rows[0].days[2].slots[2] = 'A';
  let result = await api.syncDrive({ ...fixture.helpers, today: '2026-10-29' });
  assert.equal(result.files, 2);
  assert.equal(fixture.processed[fixture.files[0].id].retryOn, '2026-11-05');
  result = await api.syncDrive({ ...fixture.helpers, today: '2026-11-05' });
  assert.equal(result.files, 2);
  assert.equal(result.marks, 2);
});
test('disabled Drive sync does not read Drive or change marks', async () => {
  const calls = [];
  const result = await browser().syncDrive({ year: 2026,
    request: async path => { calls.push(path); return { enabled: false }; } });
  assert.equal(result.enabled, false);
  assert.deepEqual(calls, ['attendance/2026/drive-sync']);
});
test('Drive setup authorises only on click and saves the chosen private folder before sync', async () => {
  const options = importFixture(), host = element('section'), writes = [];
  let syncs = 0;
  await browser().mount(host, {
    el: element, ...options, overview: true,
    request: async path => path.endsWith('/groups') ? { revision: 1, content: { groups: [options.group] } } :
      path.endsWith('/drive-sync') ? { enabled: false, folderId: '', processed: {} } : { imports: {}, markedWeeks: [] },
    mutate: async (path, body, method) => {
      writes.push([path, body, method]);
      return { url: 'https://accounts.google.com/o/oauth2/v2/auth?synthetic=true' };
    },
    syncNow: async () => { syncs++; }
  });
  assert.equal(writes.length, 0);
  let nodes = descendants(host);
  await nodes.find(node => node.textContent === 'Authorise read-only Google Drive').events.click();
  assert.deepEqual(JSON.parse(JSON.stringify(writes[0])), ['google-calendar/connect', { includeAttendanceDrive: true }, 'POST']);
  assert.ok(descendants(host).some(node => node.tag === 'a' && node.attrs.target === '_blank'));
  nodes.find(node => node.attrs['aria-label'] === 'Attendance Google Drive folder URL').value =
    'https://drive.google.com/drive/folders/synthetic_folder_123';
  nodes.find(node => node.attrs['aria-label'] === 'Automatically sync Drive attendance on planner open').checked = true;
  await nodes.find(node => node.textContent === 'Save folder and sync').events.click();
  assert.equal(writes[1][0], 'attendance/2026/drive-sync');
  assert.equal(writes[1][1].enabled, true);
  assert.equal(syncs, 1);
});
test('planner-opening Drive sync protects navigation and shows explicit success or failure', async () => {
  const source = fs.readFileSync(require.resolve('./public/planner.js'), 'utf8');
  const helpers = source.slice(source.indexOf('  let attendanceSyncRunning = false;'), source.indexOf('  async function load()'));
  const termHelpers = source.slice(source.indexOf('  function termRanges('), source.indexOf('  async function loadTermDates('));
  for (const fail of [false, true]) {
    const host = element('main');
    let active = false;
    const context = {
      content: host, year: 2026, api: '/api/planner/', localDate: '2026-11-05', el: element, csrf: 'synthetic',
      refreshSession: async () => {},
      request: async path => path.endsWith('/drive-sync') ? { enabled: true } :
        path.includes('school-settings') ? { content: { term4Start: '2026-10-12', term4End: '2026-12-18' } } : { terms: [] },
      plannerAttendance: { syncDrive: async options => {
        active = true;
        assert.equal(host.children[0].attrs['data-preferences-busy'], 'true');
        assert.equal(options.ranges[3].startDate, '2026-10-12');
        if (fail) throw new Error('Drive permission required');
        return { enabled: true, files: 1, marks: 4, conflicts: 1, warnings: 0, skipped: 2 };
      } }
    };
    vm.runInNewContext(termHelpers + helpers, context);
    if (fail) {
      await assert.rejects(context.runAttendanceDriveSync(), /permission required/);
      assert.equal(host.children[0].attrs.role, 'alert');
    } else {
      await context.runAttendanceDriveSync();
      assert.match(host.children[0].textContent, /4 blank marks filled/);
    }
    assert.equal(active, true);
    assert.equal(host.children[0].attrs['data-preferences-busy'], undefined);
  }
});
test('import refuses duplicate, unmatched and manual identities rather than guessing', () => {
  for (const change of [
    options => options.pdf.rows.push(options.pdf.rows[0]),
    options => options.group.students.push({ id: 'k:200', name: 'Example, Alex' }),
    options => { options.pdf.rows[0].name = 'Different Person'; },
    options => { options.group.students[0].id = 'm:' + crypto.randomUUID(); },
    options => { options.directory.classes = []; }
  ]) {
    const options = importFixture(); change(options);
    const plan = browser().planImport(options);
    assert.equal(plan.fills.length, 0);
    assert.ok(plan.warnings.length);
  }
});
test('PDF preview saves nothing until confirmation and sends only blank fills with atomic protection', async () => {
  const options = importFixture(), host = element('section'), saved = [];
  const context = browser();
  await context.mount(host, {
    el: element, ...options,
    request: async path => path.includes('/classes/') ? options.directory :
      path.endsWith('/groups') ? { revision: 1, content: { groups: [options.group] } } : { marks: options.savedMarks },
    loadSchedule: async week => options.schedules[week],
    uploadPdf: async () => options.pdf,
    mutate: async (path, body) => { saved.push([path, body]); return { revision: 3 }; }
  });
  let nodes = descendants(host);
  nodes.find(node => node.attrs.type === 'file').files = [{ size: 100 }];
  await nodes.find(node => node.textContent === 'Preview PDF import').events.click();
  assert.equal(saved.length, 0);
  nodes = descendants(host);
  assert.ok(nodes.some(node => node.textContent === 'Keep saved A (conflict)'));
  await nodes.find(node => node.textContent === 'Fill 4 blank marks').events.click();
  assert.equal(saved.length, 5);
  assert.ok(saved.slice(0, 4).every(([path, body]) => path === 'attendance/2026/mark' && body.fillOnly === true && !Object.hasOwn(body, 'name')));
  assert.equal(saved[4][0], 'attendance/2026/imports');
  assert.equal(saved[4][1].entries.length, 2);
  assert.equal(saved.some(([, body]) => body.date === '2026-10-27' && body.period === 'p3'), false);
  assert.ok(descendants(host).some(node => node.textContent.includes('4 blank marks filled from the PDF')));
});
test('a failed import stops with an explicit partial-save count and allows safe re-preview', async () => {
  const options = importFixture(), host = element('section');
  let attempts = 0;
  await browser().mount(host, {
    el: element, ...options,
    request: async path => path.includes('/classes/') ? options.directory :
      path.endsWith('/groups') ? { revision: 1, content: { groups: [options.group] } } : { marks: options.savedMarks },
    loadSchedule: async week => options.schedules[week], uploadPdf: async () => options.pdf,
    mutate: async () => { if (++attempts === 2) throw new Error('Mark changed in another window'); return { revision: 1 }; }
  });
  descendants(host).find(node => node.attrs.type === 'file').files = [{ size: 100 }];
  await descendants(host).find(node => node.textContent === 'Preview PDF import').events.click();
  await descendants(host).find(node => node.textContent === 'Fill 4 blank marks').events.click();
  assert.equal(attempts, 2);
  assert.ok(descendants(host).some(node => node.attrs.role === 'alert' && node.textContent.includes('1 of 4 marks saved')));
  assert.equal(host.attrs['data-preferences-busy'], undefined);
});
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
test('holiday outages warn without blocking saved attendance, navigation or individual marks', async () => {
  for (const publicHolidaysError of ['Public holiday dates could not be loaded from govt.nz.', '']) {
    const host = element('section'), saved = [];
    await browser().mount(host, {
      el: element, year: 2026, today: '2026-10-29',
      ranges: [{ term: '4', startDate: '2026-10-12', endDate: '2026-12-18' }],
      school: { events: [{ date: '2026-10-28', kind: 'teacherOnly' }] },
      calendar: { publicHolidaysAvailable: false, publicHolidaysError, publicHolidays: [{ date: '2026-10-26' }] },
      request: async path => path.endsWith('/groups') ? { revision: 1, content } :
        { marks: [{ student_id: 'k:100', date: '2026-10-29', period: 'p3', mark: 'L', revision: 2 }] },
      mutate: async (path, body) => { saved.push([path, body]); return { revision: 3 }; }
    });
    const nodes = descendants(host);
    const warning = nodes.find(node => node.attrs.role === 'alert' && node.textContent.includes('Attendance remains available'));
    assert.ok(warning);
    assert.match(warning.textContent, /check dates before recording marks/);
    const cell = nodes.find(node => node.attrs['aria-label'] === 'Synthetic Student, 2026-10-29, P3');
    assert.equal(cell.value, 'L', 'saved marks remain visible during an outage');
    assert.equal(saved.length, 0, 'loading during an outage never changes marks');
    for (const closed of ['2026-10-26', '2026-10-28']) {
      assert.equal(nodes.some(node => node.attrs['aria-label'] === 'Synthetic Student, ' + closed + ', P3'), false);
    }
    cell.value = 'P'; await cell.events.change();
    assert.equal(saved[0][1].mark, 'P');
    assert.equal(saved[0][1].revision, 2);
    assert.equal(warning.attrs.role, 'alert', 'save feedback must not replace the outage warning');
    nodes.find(node => node.textContent === 'Week 4').events.click();
    await new Promise(resolve => setImmediate(resolve));
    assert.ok(descendants(host).some(node => node.attrs['aria-label'] === 'Synthetic Student, 2026-11-02, P3'));
    assert.ok(descendants(host).includes(warning));
  }
});
test('opening Attendance tolerates a failed government calendar request using published school term dates', async () => {
  const source = fs.readFileSync(require.resolve('./public/planner.js'), 'utf8');
  const settings = { term4Start: '2026-10-12', term4End: '2026-12-18' };
  const host = element('main');
  const requests = [];
  const context = {
    section: 'attendance', year: 2026, api: '/api/planner/', localDate: '2026-10-29',
    content: host, el: element, refreshSession: async () => {}, notice() {},
    request: async path => {
      requests.push(path);
      if (path.includes('school-settings/')) return { content: settings };
      throw new Error('Calendar source returned 502');
    },
    plannerAttendance: { mount: (node, options) => {
      assert.equal(node, host.children[0]);
      assert.equal(options.school, settings);
      assert.equal(options.ranges[3].startDate, '2026-10-12');
      assert.equal(options.calendar.publicHolidaysAvailable, false);
      assert.match(options.calendar.publicHolidaysError, /502/);
      return browser().mount(node, { ...options,
        request: async path => path.endsWith('/groups') ? { revision: 1, content } : { marks: [] }
      });
    } }
  };
  const helpers = source.slice(source.indexOf('  function termRanges('), source.indexOf('  async function loadTermDates('));
  const branch = source.slice(source.indexOf("      if (section === 'attendance' || section === 'attendanceImport') {"), source.indexOf('      const data = await request(address());'));
  await vm.runInNewContext(helpers + '(async () => {' + branch + '})()', context);
  assert.deepEqual(requests, ['/api/planner/school-settings/2026', '/api/school-calendar/2026']);
  assert.equal(context.loaded, true);
  assert.ok(descendants(host).some(node => node.attrs['aria-label'] === 'Synthetic Student, 2026-10-29, P3'));
  assert.ok(descendants(host).some(node => node.attrs.role === 'alert' && node.textContent.includes('502')));
});
test('missing term dates still report an explicit error during a holiday outage', async () => {
  const host = element('section');
  await browser().mount(host, {
    el: element, year: 2026, today: '2026-10-29', ranges: [], school: {},
    calendar: { publicHolidaysAvailable: false, publicHolidays: [] },
    request: async () => ({ revision: 1, content })
  });
  assert.ok(descendants(host).some(node => node.attrs.role === 'alert' && node.textContent.includes('Term dates are unavailable')));
  assert.equal(descendants(host).some(node => node.attrs['aria-label']?.startsWith('Synthetic Student,')), false);
});
test('the new planner section mounts the import dashboard with shared upload and save connections', async () => {
  const source = fs.readFileSync(require.resolve('./public/planner.js'), 'utf8');
  let mounted;
  const context = {
    section: 'attendanceImport', year: 2026, api: '/api/planner/', localDate: '2026-11-05', csrf: 'test',
    content: element('main'), el: element, refreshSession: async () => {}, notice() {},
    request: async path => path.includes('school-settings') ? { content: { term4Start: '2026-10-12', term4End: '2026-12-18' } } : { terms: [] },
    plannerAttendance: { mount: async (_host, options) => { mounted = options; } }
  };
  const helpers = source.slice(source.indexOf('  function termRanges('), source.indexOf('  async function loadTermDates('));
  const branch = source.slice(source.indexOf("      if (section === 'attendance' || section === 'attendanceImport') {"), source.indexOf('      const data = await request(address());'));
  await vm.runInNewContext(helpers + '(async () => {' + branch + '})()', context);
  assert.equal(mounted.overview, true);
  assert.equal(typeof mounted.uploadPdf, 'function');
  assert.equal(typeof mounted.mutate, 'function');
  assert.equal(mounted.ranges[3].startDate, '2026-10-12');
  assert.equal(context.loaded, true);
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
    if (sql.startsWith('INSERT') && old || sql.startsWith('UPDATE') &&
        (old?.revision !== params[7] || sql.includes("AND mark=''") && old?.mark !== '')) return { rows: [] };
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
  assert.equal((await put('mark', { ...mark, revision: 1, mark: 'A', fillOnly: true })).status, 409,
    'fill-only cannot overwrite a nonblank mark even with the current revision');
  assert.equal((await put('mark', { ...mark, revision: 1, mark: '' })).status, 200, 'blank explicitly clears a saved mark');
  assert.equal((await put('mark', { ...mark, revision: 2, fillOnly: true })).status, 200, 'fill-only can fill a saved blank');
  assert.equal((await put('mark', { ...mark, revision: 3, mark: '', fillOnly: false })).status, 400);
  assert.equal((await put('mark', { ...mark, revision: 3, mark: '' })).status, 200);
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
test('import history is private, validates class ownership and persists across class setup saves', async t => {
  const records = new Map();
  const { base, login } = await fixture(t, async (sql, params) => {
    const key = params[0] + ':' + params[1];
    if (sql.includes('planner_attendance_marks')) {
      return { rows: params[0] === owner ? [{ student_id: 'k:100', week: '2026-10-26' }] : [] };
    }
    const previous = records.get(key);
    if (sql.startsWith('SELECT')) return { rows: previous ? [previous] : [] };
    if (sql.includes("SET content=jsonb_set")) {
      if (!previous) return { rows: [] };
      previous.content.imports = { ...previous.content.imports, ...JSON.parse(params[2]) };
      return { rows: [{ revision: previous.revision }] };
    }
    const content = { ...JSON.parse(params[2]), imports: previous?.content.imports || {} };
    const revision = (previous?.revision || 0) + 1;
    records.set(key, { content, revision });
    return { rows: [{ revision }] };
  });
  const headers = await login(owner), otherHeaders = await login(other);
  const put = (path, body, auth = headers) => fetch(base + 'attendance/2026/' + path,
    { method: 'PUT', headers: auth, body: JSON.stringify(body) });
  await put('groups', { content, revision: 0 });
  const entry = { groupId: group.id, week: '2026-10-26', expected: 10, recorded: 5, conflicts: 1, unresolved: false };
  assert.equal((await put('imports', { entries: [entry] }, { ...headers, 'x-planner-csrf': 'bad' })).status, 403);
  assert.equal((await put('imports', { entries: [entry] }, otherHeaders)).status, 400);
  for (const invalid of [{ ...entry, recorded: 11 }, { ...entry, groupId: crypto.randomUUID() },
    { ...entry, week: '2026-10-27' }, { ...entry, expected: 0 }, { ...entry, importedAt: 'fake' }]) {
    assert.equal((await put('imports', { entries: [invalid] })).status, 400);
  }
  assert.equal((await put('imports', { entries: [entry] })).status, 200);
  await put('groups', { content, revision: 1 });
  let result = await (await fetch(base + 'attendance/2026/imports', { headers })).json();
  assert.equal(result.imports[group.id + ':' + entry.week].recorded, 5);
  assert.ok(Number.isFinite(Date.parse(result.imports[group.id + ':' + entry.week].importedAt)));
  assert.equal(result.markedWeeks.length, 1);
  assert.equal((await put('imports', { entries: [{ ...entry, recorded: 10 }] })).status, 200);
  result = await (await fetch(base + 'attendance/2026/imports', { headers })).json();
  assert.equal(result.imports[group.id + ':' + entry.week].recorded, 10);
  const otherResult = await (await fetch(base + 'attendance/2026/imports', { headers: otherHeaders })).json();
  assert.deepEqual(otherResult, { imports: {}, markedWeeks: [] });
});
test('Drive settings and processed-file checkpoints require CSRF, owner identity and unchanged setup', async t => {
  const records = new Map();
  const { base, login } = await fixture(t, async (sql, params) => {
    const key = params[0] + ':' + params[1], record = records.get(key);
    if (sql.startsWith('SELECT')) return { rows: record ? [record] : [] };
    if (sql.includes("'{driveSync}'")) {
      if (!record) return { rows: [] };
      record.content.driveSync = { ...(record.content.driveSync?.folderId === params[2] ? record.content.driveSync : { processed: {} }),
        folderId: params[2], enabled: params[3] };
      return { rows: [{ revision: record.revision }] };
    }
    if (sql.includes("ARRAY['driveSync','processed'")) {
      if (!record || record.revision !== params[4] || record.content.driveSync?.folderId !== params[5] || !record.content.driveSync.enabled) {
        return { rows: [] };
      }
      record.content.driveSync.processed[params[2]] = JSON.parse(params[3]);
      return { rows: [{ revision: record.revision }] };
    }
    records.set(key, { content: { ...JSON.parse(params[2]), ...(record?.content.driveSync ? { driveSync: record.content.driveSync } : {}) },
      revision: (record?.revision || 0) + 1 });
    return { rows: [{ revision: records.get(key).revision }] };
  });
  const headers = await login(owner), otherHeaders = await login(other);
  const put = (path, body, auth = headers) => fetch(base + 'attendance/2026/' + path,
    { method: 'PUT', headers: auth, body: JSON.stringify(body) });
  const read = auth => fetch(base + 'attendance/2026/drive-sync', { headers: auth || headers }).then(response => response.json());
  const settings = { folder: 'https://drive.google.com/drive/folders/synthetic_folder_123', enabled: true };
  assert.equal((await read()).enabled, false);
  assert.equal((await put('drive-sync', settings)).status, 400, 'class tabs must exist before enabling');
  await put('groups', { revision: 0, content });
  assert.equal((await put('drive-sync', settings, { ...headers, 'x-planner-csrf': 'bad' })).status, 403);
  assert.equal((await put('drive-sync', { ...settings, folder: 'https://evil.test/folder' })).status, 400);
  assert.equal((await put('drive-sync', settings)).status, 200);
  let state = await read();
  assert.equal(state.folderId, 'synthetic_folder_123');
  assert.equal((await read(otherHeaders)).enabled, false);
  const checkpoint = { folderId: state.folderId, fileId: 'synthetic_file_123',
    version: 'synthetic_file_123:2026-11-05:a', accountId: 'synthetic-google', revision: 1, retryOn: null, contextKey: 'a'.repeat(64) };
  assert.equal((await put('drive-sync/file', checkpoint, otherHeaders)).status, 409);
  assert.equal((await put('drive-sync/file', { ...checkpoint, revision: 99 })).status, 409);
  assert.equal((await put('drive-sync/file', checkpoint)).status, 200);
  await put('groups', { revision: 1, content });
  state = await read();
  assert.equal(state.revision, 2);
  assert.equal(state.processed[checkpoint.fileId].accountId, checkpoint.accountId, 'class edits preserve existing checkpoints');
  assert.equal((await put('drive-sync/file', checkpoint)).status, 409, 'an old in-flight sync cannot checkpoint against changed classes');
  assert.equal((await put('drive-sync', { ...settings, enabled: false })).status, 200);
  assert.equal((await put('drive-sync/file', { ...checkpoint, revision: 2 })).status, 409);
  assert.ok((await read()).processed[checkpoint.fileId], 'disabling preserves prior processed versions');
  await put('drive-sync', { ...settings, folder: 'synthetic_new_folder_123' });
  assert.deepEqual((await read()).processed, {}, 'changing the folder clears processed versions');
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
  assert.equal((await put('mark', { ...value, revision: 2, fillOnly: true })).status, 409);
  const stored = await (await fetch(base + 'attendance/2026/week/2026-10-26', { headers })).json();
  assert.deepEqual(stored.marks, [{ student_id: 'k:100', student_name: 'Synthetic Student', date: '2026-10-29', period: 'p3', mark: 'A', revision: 2 }]);
  assert.equal((await put('mark', { ...value, revision: 2, mark: '' })).status, 200);
  assert.equal((await put('mark', { ...value, revision: 3, fillOnly: true })).status, 200);
  const historyEntry = { groupId: group.id, week: '2026-10-26', expected: 10, recorded: 5, conflicts: 0, unresolved: false };
  assert.equal((await put('imports', { entries: [historyEntry] })).status, 200);
  assert.equal((await put('drive-sync', { folder: 'synthetic_folder_123', enabled: true })).status, 200);
  const checkpoint = { folderId: 'synthetic_folder_123', fileId: 'synthetic_file_123',
    version: 'synthetic_file_123:2026-11-05:a', accountId: 'synthetic-google', revision: 1, retryOn: null, contextKey: 'a'.repeat(64) };
  assert.equal((await put('drive-sync/file', checkpoint)).status, 200);
  assert.equal((await put('groups', { revision: 1, content })).status, 200);
  const drive = await (await fetch(base + 'attendance/2026/drive-sync', { headers })).json();
  assert.equal(drive.processed[checkpoint.fileId].version, checkpoint.version);
  assert.equal((await put('drive-sync/file', checkpoint)).status, 409);
  const history = await (await fetch(base + 'attendance/2026/imports', { headers })).json();
  assert.equal(history.imports[group.id + ':2026-10-26'].recorded, 5);
  assert.equal(history.markedWeeks[0].week, '2026-10-26');
  assert.equal((await put('groups', { revision: 2, content: { groups: [] } })).status, 200);
  assert.equal((await (await fetch(base + 'attendance/2026/week/2026-10-26', { headers })).json()).marks.length, 1, 'removing a tab never deletes attendance');
});
