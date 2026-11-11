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
  const context = { structuredClone, crypto, TextEncoder, URL, confirm: () => true };
  vm.runInNewContext(fs.readFileSync(require.resolve('./public/attendance.js'), 'utf8'), context);
  return context.plannerAttendance;
}
test('timetable tabs combine only same-subject senior classes sharing uploaded slots', () => {
  const { timetableGroups } = browser();
  const item = (code, slots, id) => ({ code: 'TEST-' + code + '-CW', slots,
    students: [{ id: 'k:' + id, name: 'Student ' + id }] });
  const directory = { classes: [
    item('11DTECH', ['mon_p2'], 100), item('12DTECH', ['mon_p2', 'tue_p3'], 200),
    item('13DTECH', ['tue_p3'], 300), item('11TEXT', ['mon_p2'], 400),
    item('12TEXT', ['fri_p5'], 500), item('PIDTECH', ['mon_p2'], 600),
    item('SRDTECH', ['mon_p2'], 700), item('11ART', ['wed_p1_1'], 800),
    item('12ART', ['wed_p1_2'], 900)
  ] };
  const next = Array.from(timetableGroups([], directory));
  assert.deepEqual(next.map(group => group.name), ['11/12/13DTECH', '11TEXT', '12TEXT', 'PIDTECH', 'SRDTECH', '11ART', '12ART']);
  assert.deepEqual(Array.from(next[0].students, student => student.id), ['k:100', 'k:200', 'k:300']);
  assert.equal(next[0].classes.length, 3);
  assert.equal(validGroups({ groups: next }), true);
  assert.equal(JSON.stringify(timetableGroups(next, directory)), JSON.stringify(next), 'repeat openings are idempotent');
  const combined = timetableGroups([], { classes: [item('11/12DTECH', ['mon_p2'], 100), item('13DTECH', ['mon_p2'], 200)] });
  assert.equal(combined[0].name, '11/12/13DTECH');
  assert.throws(() => timetableGroups([], { classes: [] }), /No timetable classes/);
  assert.throws(() => timetableGroups([], { classes: [{ code: 'TEST-11DTECH-CW', students: [] }] }), /slots are unavailable/);
});
test('regrouping preserves names, stable identities and retained/manual rosters without duplicating tabs', () => {
  const { timetableGroups } = browser();
  const classes = ['11DTECH', '12DTECH'].map((code, i) => ({
    code: 'TEST-' + code + '-CW', slots: ['mon_p2'],
    students: [{ id: 'k:' + (100 + i), name: 'Current ' + i }]
  }));
  const old = classes.map((item, i) => ({ id: crypto.randomUUID(), name: 'Old ' + i, classes: [item.code],
    students: item.students.map(student => ({ ...student, name: 'Teacher spelling ' + i })),
    periods: ['p1'], scheduleMode: 'manual' }));
  const manual = { ...group, id: crypto.randomUUID(), name: 'Manual-only tab', classes: [] };
  let next = Array.from(timetableGroups([...old, manual], { classes }));
  assert.equal(next.length, 2);
  assert.ok(old.every(group => group.id !== next[0].id), 'merged class coverage must not inherit a smaller tab’s synced status');
  assert.equal(next[0].name, '11/12DTECH');
  assert.equal(next[0].scheduleMode, 'auto');
  assert.deepEqual(Array.from(next[0].students, student => student.name), ['Teacher spelling 0', 'Teacher spelling 1']);
  assert.deepEqual(next[1], manual);
  old[0].students.push({ id: 'm:' + crypto.randomUUID(), name: 'Manual addition' }, { id: 'k:999', name: 'Former student' });
  next = Array.from(timetableGroups([...old, manual], { classes }));
  const retained = next.find(item => item.id === old[0].id);
  assert.equal(retained.name, 'Old 0 (retained)');
  assert.equal(retained.scheduleMode, 'manual');
  assert.equal(retained.students.length, 2);
  assert.notEqual(next[0].id, retained.id);
  assert.equal(JSON.stringify(timetableGroups(next, { classes })), JSON.stringify(next));
  assert.equal(validGroups({ groups: next }), true);
  const separated = classes.map((item, i) => ({ ...item, slots: [i ? 'tue_p3' : 'mon_p2'] }));
  const split = Array.from(timetableGroups([{ ...next[0], name: 'Combined' }], { classes: separated }));
  assert.deepEqual(split.map(item => item.name), ['11DTECH', '12DTECH']);
  assert.equal(split[0].students.length, 1);assert.equal(split[1].students.length, 1);
});
test('automatic tab creation persists once with revisions and shows errors without losing saved tabs', async () => {
  for (const fail of [false, true]) {
    const host = element('section'), writes = [];
    const current = { ...group, scheduleMode: 'auto', classes: ['TEST-11TEST-CW'] };
    await browser().mount(host, {
      el: element, year: 2026, today: '2026-10-15', automaticTabs: true, overview: true,
      ranges: [{ term: '4', startDate: '2026-10-12', endDate: '2026-10-23' }], school: {}, calendar: {},
      request: async path => {
        if (path.endsWith('/groups')) return { revision: 7, content: { groups: [current] } };
        if (path.includes('/classes/')) return { staffCode: 'TEST', classes: [{ code: 'TEST-11TEST-CW', slots: ['mon_p2'], students: current.students }] };
        if (path.endsWith('/drive-sync')) return { enabled: false };
        if (path.endsWith('/imports')) return { imports: {}, markedWeeks: [] };
        if (path === 'google-calendar/') return { configured: true, connected: false };
        throw new Error('Unexpected request: ' + path);
      },
      mutate: async (path, body) => {
        writes.push({ path, body });
        if (fail) throw new Error('Attendance tabs changed in another window.');
        return { revision: 8 };
      }
    });
    assert.equal(writes.length, 1);
    assert.equal(writes[0].body.revision, 7);
    assert.equal(writes[0].body.content.groups[0].id, current.id);
    assert.equal(writes[0].body.content.groups[0].name, '11TEST');
    const nodes = descendants(host);
    assert.ok(nodes.some(node => node.textContent === 'Refresh timetable class tabs'));
    if (fail) {
      assert.ok(nodes.some(node => node.attrs.role === 'alert' && /another window/.test(node.textContent)));
      assert.ok(nodes.some(node => node.tag === 'option' && node.textContent === current.name));
    } else assert.ok(nodes.some(node => node.tag === 'option' && node.textContent === '11TEST'));
  }
});
test('Drive sync refreshes timetable tabs before reading PDFs, including from other Planner sections', async () => {
  const writes = [], calls = [];
  const directory = { staffCode: 'TEST', classes: [
    { code: 'TEST-11DTECH-CW', slots: ['mon_p2'], students: [{ id: 'k:100', name: 'Synthetic One' }] },
    { code: 'TEST-12DTECH-CW', slots: ['mon_p2'], students: [{ id: 'k:200', name: 'Synthetic Two' }] }
  ] };
  const result = await browser().syncDrive({
    year: 2026, automaticTabs: true, school: {}, calendar: {}, ranges: [], today: '2026-10-15',
    request: async path => {
      calls.push(path);
      if (path.endsWith('/drive-sync')) return { enabled: true, processed: {} };
      if (path.endsWith('/groups')) return { revision: 4, content: { groups: [] } };
      if (path.includes('/classes/')) return directory;
      if (path.endsWith('/files')) {
        assert.equal(writes.length, 1, 'tabs must be saved before checking Drive files');
        return { files: [] };
      }
      throw new Error('Unexpected path ' + path);
    },
    mutate: async (path, body) => { writes.push({ path, body }); return { revision: 5 }; }
  });
  assert.equal(writes[0].path,'attendance/2026/groups');
  assert.equal(writes[0].body.revision,4);
  assert.equal(writes[0].body.content.groups[0].name,'11/12DTECH');
  assert.equal(result.failed,0);
  assert.equal(result.marks,0);
});

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
    prepend(...items) { this.children.unshift(...items); },
    replaceChildren(...items) { this.children = items; }, setAttribute(key, value) { this.attrs[key] = value; },
    getAttribute(key) { return this.attrs[key] ?? null; },
    querySelector(selector) {
      return descendants(this).slice(1).find(child => selector === '[data-attendance-drive-feedback]' &&
        Object.hasOwn(child.attrs, 'data-attendance-drive-feedback')) || null;
    },
    removeAttribute(key) { delete this.attrs[key]; }, addEventListener(event, callback) { this.events[event] = callback; } };
  return node;
}
const descendants = node => [node, ...node.children.flatMap(descendants)];
test('student panel filters only the selected roster by name, year and whanau and shows complete term weeks', async () => {
  const host = element('section'), paths = [];
  const students = [
    { id: 'k:100', name: 'Indy Example' }, { id: 'k:200', name: 'Indy Another' },
    { id: 'm:cccccccc-cccc-4ccc-8ccc-cccccccccccc', name: 'Manual Student' }
  ];
  const current = { ...group, students };
  await browser().mount(host, {
    el: element, year: 2026, today: '2026-10-15',
    ranges: [{ term: '4', startDate: '2026-10-14', endDate: '2026-10-23' },
      { term: '3', startDate: '2026-07-20', endDate: '2026-07-24' }],
    school: { events: [{ date: '2026-10-16', kind: 'teacherOnly' }] }, calendar: {},
    request: async path => {
      paths.push(path);
      if (path.endsWith('/groups')) return { revision: 1, content: { groups: [current] } };
      if (path.includes('/classes/')) return { staffCode: 'TEST', classes: [{ code: '11TEST', students: [
        { ...students[0], yearLevel: '9', whanau: 'W1' }, { ...students[1], yearLevel: '10', whanau: 'W2' },
        { id: 'k:999', name: 'Indy Outside', yearLevel: '9', whanau: 'W1' }
      ] }] };
      return { marks: [{ student_id: 'k:100', date: '2026-10-15', period: 'p1', mark: 'P', revision: 1 },
        { student_id: 'k:200', date: '2026-10-15', period: 'p1', mark: 'A', revision: 1 }] };
    },
    mutate: async () => ({ revision: 2 })
  });
  const find = label => descendants(host).find(node => node.attrs['aria-label'] === label);
  const picker = find('Select student');
  assert.deepEqual(picker.children.map(node => node.attrs.value), students.map(student => student.id));
  const name = find('Search student name'); name.value = 'indy'; name.events.input();
  assert.equal(picker.children.length, 2);
  const years = find('Student year level'); years.value = '9'; years.events.change();
  assert.deepEqual(picker.children.map(node => node.attrs.value), ['k:100']);
  const whanau = find('Whānau'); whanau.value = 'W2'; whanau.events.change();
  assert.equal(picker.children.length, 0);
  years.value = ''; years.events.change();
  assert.deepEqual(picker.children.map(node => node.attrs.value), ['k:200']);
  whanau.value = 'W1'; whanau.events.change();
  picker.value = 'k:100'; await picker.events.change();
  const table = () => descendants(host).find(node => node.attrs.class === 'attendance-table attendance-student-table');
  const rows = table().children.find(node => node.tag === 'tbody').children;
  assert.equal(rows.length, 2);
  assert.equal(rows[0].children[0].textContent, 'Week 1');
  assert.equal(rows[0].children[1].textContent, '2026-10-12');
  assert.equal(rows[0].children[2].textContent, 'No school', 'partial first week stays outside the term');
  assert.equal(rows[0].children[6].textContent, 'No school', 'school closure is not an absence');
  assert.ok(descendants(table()).some(node => node.textContent === 'P1: P'));
  assert.ok(descendants(table()).some(node => node.textContent === 'P3: Not recorded'));
  assert.ok(!descendants(table()).some(node => node.textContent === 'P1: A'), 'same-name/other IDs never supply marks');
  assert.ok(paths.some(path => path.includes('/student/k%3A100?groupId=' + current.id) &&
    path.endsWith('&start=2026-10-14&end=2026-10-23')));
  const cell = find('Indy Example, 2026-10-15, P1');
  cell.value = 'L'; await cell.events.change();
  assert.ok(descendants(table()).some(node => node.textContent === 'P1: L'), 'successful daily edit updates the term view');
  const terms = find('Student attendance term'); terms.value = '3'; await terms.events.change();
  assert.equal(table().children.find(node => node.tag === 'tbody').children.length, 1);
  assert.ok(paths.some(path => path.endsWith('&start=2026-07-20&end=2026-07-24')));
  name.value = 'manual'; name.events.input(); whanau.value = ''; whanau.events.change();
  assert.deepEqual(picker.children.map(node => node.attrs.value), [students[2].id]);
  assert.equal(table(), undefined, 'filtering out the selected student clears previous attendance');
});
test('student term attendance uses individual class membership and reports load failures explicitly', async () => {
  const host = element('section'), current = { ...group, scheduleMode: 'auto', classes: ['VP-TEST-CW', 'VP-OTHER-CW'] };
  let fail = false;
  await browser().mount(host, {
    el: element, year: 2026, today: '2026-10-15',
    ranges: [{ term: '4', startDate: '2026-10-12', endDate: '2026-10-16' }], school: {}, calendar: {},
    request: async path => {
      if (path.endsWith('/groups')) return { revision: 1, content: { groups: [current] } };
      if (path.includes('/classes/')) return { classes: [
        { code: 'VP-TEST-CW', students: current.students },
        { code: 'VP-OTHER-CW', students: [{ id: 'k:200', name: 'Other Student' }] }
      ] };
      if (path.includes('/student/') && fail) throw new Error('Database unavailable');
      return { marks: [{ student_id: 'k:100', date: '2026-10-12', period: 'p2', mark: 'A', revision: 1 }] };
    },
    loadSchedule: async () => ({ 'p1:0': [{ title: 'TEST' }], 'p2:0': [{ title: 'OTHER' }] })
  });
  const picker = descendants(host).find(node => node.attrs['aria-label'] === 'Select student');
  picker.value = 'k:100'; await picker.events.change();
  const result = descendants(host).find(node => node.attrs.class === 'attendance-table attendance-student-table');
  assert.ok(descendants(result).some(node => node.textContent === 'P1: Not recorded'));
  assert.ok(!descendants(result).some(node => node.textContent.startsWith('P2:')), 'other combined class periods are excluded');
  assert.ok(descendants(result).some(node => node.textContent === 'No lesson'));
  fail = true;
  await descendants(host).find(node => node.textContent === 'Refresh student attendance').events.click();
  assert.ok(descendants(host).some(node => node.attrs.role === 'alert' &&
    node.textContent.includes('Student attendance could not be loaded. Database unavailable')));
  assert.ok(!descendants(host).some(node => node.attrs.class === 'attendance-table attendance-student-table'),
    'failed refresh does not present stale marks as current data');
});
test('directory metadata does not leak into saved class roster shape', () => {
  const result = browser().combinedStudents([], [{ students: [
    { id: 'k:100', name: 'Synthetic Student', yearLevel: '9', whanau: 'W1' }
  ] }]);
  assert.equal(validGroups({ groups: [{ ...group, students: Array.from(result) }] }), true);
  assert.deepEqual(Object.keys(result[0]), ['id', 'name']);
});
test('student search resets on class change and missing directory details leave manual name search usable', async () => {
  const host = element('section');
  const second = { ...group, id: other, name: 'Other class',
    students: [{ id: 'm:cccccccc-cccc-4ccc-8ccc-cccccccccccc', name: 'Manual Student' }] };
  await browser().mount(host, {
    el: element, year: 2026, today: '2026-10-15',
    ranges: [{ term: '4', startDate: '2026-10-12', endDate: '2026-10-16' }], school: {}, calendar: {},
    request: async path => {
      if (path.endsWith('/groups')) return { revision: 1, content: { groups: [group, second] } };
      if (path.includes('/classes/')) throw new Error('Directory unavailable');
      return { marks: [] };
    }
  });
  let name = descendants(host).find(node => node.attrs['aria-label'] === 'Search student name');
  name.value = 'Synthetic'; name.events.input();
  await descendants(host).find(node => node.attrs.role === 'tab' && node.textContent === 'Other class').events.click();
  name = descendants(host).find(node => node.attrs['aria-label'] === 'Search student name');
  assert.equal(name.value, '');
  const picker = descendants(host).find(node => node.attrs['aria-label'] === 'Select student');
  assert.deepEqual(picker.children.map(node => node.attrs.value), [second.students[0].id]);
  assert.equal(picker.value, '');
  assert.ok(descendants(host).some(node => node.attrs.role === 'alert' &&
    node.textContent.includes('Directory unavailable') && node.textContent.includes('Name search remains available')));
  picker.value = second.students[0].id; await picker.events.change();
  assert.ok(descendants(host).some(node => node.tag === 'caption' && node.textContent === 'Manual Student - Term 4 - Other class'));
});
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
  assert.equal(api.weekStatus(plan.coverage[0]), 'Synced');
  assert.equal(plan.coverage[1].expected, 2);
  assert.equal(plan.coverage[1].recorded, 1);
  assert.equal(api.weekStatus(plan.coverage[1]), 'Synced');
  assert.equal(api.weekStatus(undefined, true), 'Not synced');
  assert.equal(api.weekStatus(undefined, false), 'Not synced');
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
  assert.equal(nodes.filter(node => node.tag === 'tr' &&
    node.children.some(child => Object.hasOwn(child.attrs, 'data-import-status'))).length, 10);
  assert.ok(nodes.some(node => node.textContent === 'Week 10'));
  assert.ok(nodes.some(node => node.textContent === 'Synced'));
  assert.ok(nodes.some(node => node.textContent === 'Not synced'));
  assert.equal(nodes.some(node => /Loaded means|Partial includes|scheduled marks in PDF/.test(node.textContent)), false);
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
test('all-class import ignores display filters, deduplicates shared marks and records each class week', async t => {
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
  await t.  test('attendance import status filters terms, refreshes saved history and points Drive admins to Kamar Uploader', async () => {
    const options = importFixture(), host = element('section');
    const second = { ...options.group, id: crypto.randomUUID(), name: 'Second automatic class' };
    const manual = { ...options.group, id: crypto.randomUUID(), scheduleMode: 'manual' };
    const imports = {};
    const complete = { expected: 5, recorded: 5, unresolved: false, importedAt: '2026-11-05T00:00:00Z' };
    imports[options.group.id + ':2026-10-26'] = complete;
    imports[second.id + ':2026-10-26'] = complete;
    imports[options.group.id + ':2026-11-02'] = { ...complete, recorded: 2, unresolved: true };
    await browser().mount(host, {
      el: element, ...options, overview: true,
      ranges: [{ term: '3', startDate: '2026-07-20', endDate: '2026-09-25' }, ...options.ranges],
      request: async path => path.endsWith('/groups') ? { revision: 1, content: { groups: [options.group, second, manual] } } :
        { imports, markedWeeks: [{ student_id: 'k:100', week: '2026-10-19' }] }
    });
    const coverage = () => descendants(host).find(node => node.attrs['aria-label'] === 'Term attendance import status');
    let nodes = descendants(coverage());
    const rows = nodes.filter(node => node.tag === 'tr' && node.children.some(child => child.attrs.scope === 'row'));
    assert.equal(rows.length, 10);
    assert.equal(rows[0].children[0].textContent, 'Week 1');
    assert.equal(rows[0].children[1].textContent, '2026-10-12');
    assert.equal(rows[0].children[2].textContent, 'Not synced');
    assert.equal(rows[1].children[2].textContent, 'Not synced', 'manual marks alone do not indicate a PDF import');
    assert.equal(rows[2].children[2].textContent, 'Synced');
    assert.equal(rows[3].children[2].textContent, 'Synced', 'PDF import counts regardless of blank slots or unmatched students');
    assert.ok(nodes.filter(node => Object.hasOwn(node.attrs, 'data-week-sync-status'))
      .every(node => ['Synced', 'Not synced'].includes(node.textContent)));
    assert.equal(nodes.some(node => /Saved PDF import coverage/.test(node.textContent)), false, 'explanation is removed');
    const select = nodes.find(node => node.attrs['aria-label'] === 'Attendance status term number');
    select.value = '3'; select.events.change();
    assert.ok(descendants(coverage()).some(node => node.textContent === '2026-07-20'));
    await descendants(coverage()).find(node => node.textContent === 'Refresh weekly import status').events.click();
    assert.equal(descendants(coverage()).find(node => node.attrs['aria-label'] === 'Attendance status term number').value, '3');
    const current = descendants(coverage()).find(node => node.attrs['aria-label'] === 'Attendance status term number');
    current.value = '4'; current.events.change();
    imports[options.group.id + ':2026-11-09'] = complete;
    await descendants(coverage()).find(node => node.textContent === 'Refresh weekly import status').events.click();
    assert.equal(descendants(coverage()).filter(node => node.attrs['data-week-sync-status'] === 'Synced').length, 3);
    assert.ok(descendants(host).some(node => /manage Google Drive imports in Kamar Uploader/.test(node.textContent)));
  });
  descendants(host).find(node => node.attrs.type === 'file').files = [{ size: 100 }];
  await descendants(host).find(node => node.textContent === 'Preview PDF import').events.click();
  const nodes = descendants(host);
  assert.ok(nodes.some(node => node.textContent.startsWith('Second class: 4 blank marks')));
  assert.ok(nodes.some(node => node.textContent.startsWith('Manual class: skipped')));
  await nodes.find(node => node.textContent === 'Fill 4 blank marks').events.click();
  assert.equal(saved.filter(([path]) => path.endsWith('/import-marks')).length, 1);
  assert.equal(saved.find(([path]) => path.endsWith('/import-marks'))[1].marks.length, 4, 'shared marks are not saved twice');
  const history = saved.find(([path]) => path.endsWith('/imports'))[1];
  assert.equal(history.entries.length, 4);
  assert.deepEqual(new Set(history.entries.map(item => item.groupId)), new Set([options.group.id, second.id]));
});
test('failed PDF preview displays its error beside the preview controls and never saves marks', async () => {
  const options = importFixture(), host = element('section');
  const message = 'The attendance PDF could not be read. The PDF day columns have changed.';
  await browser().mount(host, {
    el: element, ...options, overview: true,
    request: async path => path.endsWith('/groups') ? { revision: 1, content: { groups: [options.group] } } :
      { imports: {}, markedWeeks: [] },
    loadSchedule: async () => { throw new Error('Failed preview must not load schedules'); },
    uploadPdf: async () => { throw new Error(message); },
    mutate: async () => { assert.fail('Failed preview must not save marks'); }
  });
  const panel = descendants(host).find(node => node.tag === 'details' &&
    node.children.some(child => child.textContent.startsWith('Load Two-Week Attendance PDF')));
  descendants(panel).find(node => node.attrs.type === 'file').files = [{ size: 100 }];
  await descendants(panel).find(node => node.textContent === 'Preview PDF import').events.click();
  assert.ok(descendants(panel).some(node => node.attrs.role === 'alert' && node.textContent === message));
  assert.equal(descendants(panel).some(node => node.textContent.startsWith('Fill ')), false);
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
        if (path.endsWith('/import-marks') && ++attempts === failMark) throw new Error('Concurrent mark edit');
        writes.push([path, body]);
        if (path.endsWith('/import-marks')) {
          for (const mark of body.marks) {
            const old = savedMarks.find(item => item.student_id === mark.studentId && item.date === mark.date && item.period === mark.period);
            if (old) { old.mark = mark.mark; old.revision++; }
            else savedMarks.push({ student_id: mark.studentId, ...mark });
          }
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
  assert.equal(fixture.writes.filter(([path]) => path.endsWith('/import-marks')).length, 1);
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
  fixture.failOnMark(1);
  const first = await api.syncDrive(fixture.helpers);
  assert.equal(first.failed, 1);
  assert.equal(first.files, 1, 'later PDF completes even after a partial mark-write failure');
  assert.equal(first.marks, 4, 'total includes the failed PDF partial save without double counting');
  assert.equal(first.documents[0].marks, 0);
  assert.match(first.documents[0].error, /0 blank marks saved.*not marked processed/);
  assert.equal(Object.keys(fixture.processed).length, 1);
  assert.equal(fixture.processed[fixture.files[0].id], undefined);
  fixture.failOnMark(0);
  const result = await api.syncDrive(fixture.helpers);
  assert.equal(result.marks, 0);
  assert.equal(result.files, 1);
  assert.equal(result.skipped, 1);
  assert.equal(result.failed, 0);
});
test('Drive sync completes and reports each document before reading the next, continuing past rejected PDFs', async () => {
  for (const failedIndex of [0, 1, 2]) {
    const fixture = driveFixture(), reports = [], reads = [];
    fixture.files.push({ id: 'synthetic_pdf_789', name: '<img src=x> Invalid statistics.pdf', version: 'version-three' });
    const rejected = fixture.files[failedIndex];
    const helpers = { ...fixture.helpers,
      request: async path => {
        if (path.includes('/files/')) {
          assert.equal(reports.length, reads.length, 'previous PDF was reported before next download');
          reads.push(path);
          if (path.endsWith(rejected.id)) throw new Error('Half Days statistics report has no daily period marks.');
        }
        return fixture.helpers.request(path);
      },
      onDocument: document => {
        reports.push(document);
        assert.equal(Boolean(fixture.processed[document.id]), document.status === 'synced');
        if (document.status === 'synced') assert.ok(fixture.writes.some(([path]) => path.endsWith('/imports')));
      }
    };
    const result = await browser().syncDrive(helpers);
    assert.equal(result.files, 2);
    assert.equal(result.failed, 1);
    assert.equal(result.marks, 4);
    assert.equal(result.documents.length, 3);
    assert.equal(reports.length, 3);
    assert.equal(result.documents[failedIndex].name, rejected.name);
    assert.match(result.documents[failedIndex].error, /Half Days statistics.*0 blank marks saved.*not marked processed/);
    const retry = await browser().syncDrive({ ...helpers, onDocument: () => {} });
    assert.equal(retry.files, 0);
    assert.equal(retry.failed, 1);
    assert.equal(retry.skipped, 2);
  }
});
test('Drive history or checkpoint errors leave the PDF retryable but do not prevent later documents syncing', async () => {
  for (const stage of ['/imports', '/drive-sync/file']) {
    const fixture = driveFixture();
    let failed = false;
    const result = await browser().syncDrive({ ...fixture.helpers,
      mutate: async (path, body) => {
        if (!failed && path.endsWith(stage)) { failed = true; throw new Error('Synthetic completion failure'); }
        return fixture.helpers.mutate(path, body);
      }
    });
    assert.equal(result.files, 1);
    assert.equal(result.failed, 1);
    assert.equal(result.marks, 4);
    assert.equal(result.documents[0].marks, 4);
    assert.match(result.documents[0].error, /Synthetic completion failure/);
    assert.equal(fixture.processed[fixture.files[0].id], undefined);
    assert.ok(fixture.processed[fixture.files[1].id]);
    const retry = await browser().syncDrive(fixture.helpers);
    assert.equal(retry.files, 1);
    assert.equal(retry.skipped, 1);
    assert.equal(retry.marks, 0);
  }
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
test('Two-Week Attendance shows read-only import history and directs Drive admins to Kamar Uploader', async () => {
  const options = importFixture(), host = element('section');
  const requested = [];
  await browser().mount(host, {
    el: element, ...options, overview: true,
    request: async path => {
      requested.push(path);
      return path.endsWith('/groups') ? { revision: 1, content: { groups: [options.group] } } :
        { imports: {}, markedWeeks: [] };
    },
    loadSchedule: async week => options.schedules[week],
    uploadPdf: async () => options.pdf,
    syncNow: async () => assert.fail('Teacher Planner must not start Drive imports')
  });
  const nodes = descendants(host);
  assert.ok(nodes.some(node => /manage Google Drive imports in Kamar Uploader/.test(node.textContent)));
  assert.ok(nodes.some(node => node.textContent === 'Attendance import status'));
  for (const label of ['Authorise read-only Google Drive', 'Save folder settings', 'Update attendance from Drive']) {
    assert.equal(nodes.some(node => node.textContent === label), false, label);
  }
  assert.equal(nodes.some(node => node.attrs.type === 'url'), false);
  assert.ok(nodes.some(node => node.textContent === 'Preview PDF import'), 'teachers retain personal PDF preview');
  assert.equal(requested.some(path => path.endsWith('/drive-sync')), false);
});
test('daily Attendance does not expose a Drive import action', async () => {
  const options = importFixture(), host = element('section');
  let syncs = 0;
  await browser().mount(host, {
    el: element, ...options,
    request: async path => path.endsWith('/groups') ? { revision: 1, content: { groups: [options.group] } } :
      path.includes('/week/') ? { marks: [] } : { imports: {}, markedWeeks: [] },
    syncNow: async () => { syncs++; }
  });
  const nodes = descendants(host);
  assert.equal(nodes.some(node => node.textContent === 'Update attendance from Drive'), false);
  assert.equal(nodes.some(node => node.attrs.type === 'url'), false);
  assert.equal(syncs, 0);
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
  assert.equal(saved.length, 2);
  assert.equal(saved[0][0], 'attendance/2026/import-marks');
  assert.equal(saved[0][1].marks.length, 4);
  assert.ok(saved[0][1].marks.every(value => !Object.hasOwn(value, 'name')));
  assert.equal(saved[1][0], 'attendance/2026/imports');
  assert.equal(saved[1][1].entries.length, 2);
  assert.equal(saved[0][1].marks.some(value => value.date === '2026-10-27' && value.period === 'p3'), false);
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
    mutate: async () => { attempts++; throw new Error('1 of 4 marks in this batch were saved; other marks changed in another window.'); }
  });
  descendants(host).find(node => node.attrs.type === 'file').files = [{ size: 100 }];
  await descendants(host).find(node => node.textContent === 'Preview PDF import').events.click();
  await descendants(host).find(node => node.textContent === 'Fill 4 blank marks').events.click();
  assert.equal(attempts, 1);
  assert.ok(descendants(host).some(node => node.attrs.role === 'alert' && node.textContent.includes('1 of 4 marks in this batch were saved')));
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
    content: host, el: element, refreshSession: async () => {}, notice() {}, bindAttendanceSyncState() {}, placeAttendanceDriveNote() {},
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
  const mounting = source.slice(source.indexOf('  async function mountAttendancePage('), source.indexOf('  async function loadAttendanceSchedule('));
  host.append(element('section'));
  host.children[0].isConnected = true;
  await vm.runInNewContext(helpers + mounting + '\nmountAttendancePage(content.children[0], false);', context);
  assert.deepEqual(requests, ['/api/planner/school-settings/2026', '/api/school-calendar/2026']);
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
test('the setup attendance tab mounts the import dashboard with shared upload and save connections', async () => {
  const source = fs.readFileSync(require.resolve('./public/planner.js'), 'utf8');
  let mounted;
  const context = {
    section: 'attendanceImport', year: 2026, api: '/api/planner/', localDate: '2026-11-05', csrf: 'test',
    content: element('main'), el: element, refreshSession: async () => {}, notice() {}, bindAttendanceSyncState() {},
    request: async path => path.includes('school-settings') ? { content: { term4Start: '2026-10-12', term4End: '2026-12-18' } } : { terms: [] },
    plannerAttendance: { mount: async (_host, options) => { mounted = options; } }
  };
  const helpers = source.slice(source.indexOf('  function termRanges('), source.indexOf('  async function loadTermDates('));
  const mounting = source.slice(source.indexOf('  async function mountAttendancePage('), source.indexOf('  async function loadAttendanceSchedule('));
  context.content.isConnected = true;
  await vm.runInNewContext(helpers + mounting + '\nmountAttendancePage(content, true);', context);
  assert.equal(mounted.overview, true);
  assert.equal(typeof mounted.uploadPdf, 'function');
  assert.equal(typeof mounted.mutate, 'function');
  assert.equal(mounted.ranges[3].startDate, '2026-10-12');
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
test('batch imports validate roster and revisions and report partially saved conflicts', async t => {
  const calls = [];
  let saved = 2;
  const { base, login } = await fixture(t, async (sql, params) => {
    calls.push([sql, params]);
    if (sql.includes('SELECT content,revision FROM planner_attendance_groups')) return { rows: [{ content }] };
    assert.match(sql, /ON CONFLICT DO NOTHING/);
    assert.match(sql, /m\.revision=i\.revision AND m\.mark=''/);
    return { rows: [{ saved }] };
  });
  const headers = await login(owner);
  const marks = [
    { studentId: 'k:100', date: '2026-10-29', period: 'p1', mark: 'P', revision: 0 },
    { studentId: 'k:100', date: '2026-10-30', period: 'p3', mark: 'A', revision: 2 }
  ];
  const put = body => fetch(base + 'attendance/2026/import-marks',
    { method: 'PUT', headers, body: JSON.stringify(body) });
  let response = await put({ marks });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).saved, 2);
  const input = JSON.parse(calls.at(-1)[1][2]);
  assert.equal(input[0].name, 'Synthetic Student');
  saved = 1;
  response = await put({ marks });
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /1 of 2 marks in this batch were saved/);
  const before = calls.length;
  for (const invalid of [{ marks: [marks[0], marks[0]] }, { marks: [{ ...marks[0], mark: '' }] },
    { marks: [{ ...marks[0], studentId: 'k:other' }] }, { marks: Array(201).fill(marks[0]) }]) {
    assert.equal((await put(invalid)).status, 400);
  }
  assert.equal(calls.length, before + 1, 'only roster lookup runs for a valid but unowned student');
});
test('student term API bounds dates and isolates owner, selected roster and student ID', async t => {
  const calls = [];
  const { base, login } = await fixture(t, async (sql, params) => {
    calls.push([sql, params]);
    if (sql.includes('planner_attendance_groups')) return { rows: params[0] === owner ? [{ content }] : [] };
    assert.match(sql, /owner_id=\$1 AND year=\$2 AND student_id=\$3/);
    assert.match(sql, /lesson_date >= \$4::date AND lesson_date <= \$5::date/);
    assert.deepEqual(params, [owner, 2026, 'k:100', '2026-10-12', '2026-12-18']);
    return { rows: [{ student_id: 'k:100', date: '2026-10-29', period: 'p1', mark: 'P', revision: 1 }] };
  });
  const headers = await login(owner), otherHeaders = await login(other);
  const path = base + 'attendance/2026/student/k%3A100?groupId=' + group.id + '&start=2026-10-12&end=2026-12-18';
  const response = await fetch(path, { headers });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await response.json()).marks[0].mark, 'P');
  assert.equal((await fetch(path)).status, 401);
  assert.equal((await fetch(path, { headers: { 'x-user': owner, 'x-role': 'Student' } })).status, 403);
  assert.equal((await fetch(path, { headers: otherHeaders })).status, 403);
  assert.equal((await fetch(path.replace('k%3A100', 'k%3A200'), { headers })).status, 403);
  assert.equal((await fetch(path.replace(group.id, other), { headers })).status, 403);
  for (const invalid of [
    path.replace('2026-10-12', '2026-02-30'), path.replace('2026-10-12', '2025-10-12'),
    path.replace('2026-10-12', '2026-12-21'), path.replace('2026-10-12', '2026-01-01'),
    path.replace('k%3A100', 'forged'), path.replace(group.id, 'bad')
  ]) assert.equal((await fetch(invalid, { headers })).status, 400);
  assert.equal(calls.filter(([sql]) => sql.includes('planner_attendance_marks')).length, 1,
    'invalid or unowned roster requests never query marks');
});
test('teacher class directory exposes year and whanau only for matching teacher class memberships', async () => {
  const { attendanceClasses } = require('../../kamarDirectory');
  const result = await attendanceClasses({ email: 'synthetic@example.test' }, 2026, async (sql, params) => {
    if (sql.includes('staff_upload')) {
      assert.deepEqual(params, ['synthetic@example.test']);
      return { rows: [{ code: 'TEST' }] };
    }
    assert.match(sql, /SELECT id_number,student_name,year_level,form_class/);
    assert.deepEqual(params, [2026]);
    return { rows: [
      { id_number: '100', student_name: 'Synthetic Student', year_level: '9', form_class: 'W1',
        mon_p2: 'TEST/SHARED-11TEST-CW', tue_p3: 'OTHER-12TEST-CW' },
      { id_number: '200', student_name: 'Other Teacher Student', year_level: '10', form_class: 'W2',
        mon_p2: 'OTHER-12TEST-CW' }
    ] };
  });
  assert.deepEqual(result, { staffCode: 'TEST', classes: [{ code: 'TEST/SHARED-11TEST-CW',
    students: [{ id: 'k:100', name: 'Synthetic Student', yearLevel: '9', whanau: 'W1' }],
    slots: ['mon_p2'] }] });
});
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
  assert.equal((await put('groups', { revision: 1, content: { groups: [{ ...group,
    name: '11/12TEST', scheduleMode: 'auto', periods: ['p1', 'p2', 'p3', 'p4', 'p5'] }] } })).status, 200);
  assert.equal((await (await fetch(base + 'attendance/2026/week/2026-10-26', { headers })).json()).marks[0].mark, 'P',
    'regrouping/renaming class tabs never changes saved attendance marks');
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
  assert.equal((await fetch(base + 'attendance/classes/2026?term=3', { headers })).status, 200);
  for (const invalid of ['0', '5', '3.0', 'abc']) {
    assert.equal((await fetch(base + 'attendance/classes/2026?term=' + invalid, { headers })).status, 400);
  }
  assert.equal((await put('groups', { revision: 2, content: {
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
  const blank = { studentId: 'k:100', date: '2026-10-30', period: 'p1', mark: '', revision: 0 };
  assert.equal((await put('mark', blank)).status, 200);
  const batch = [
    { ...blank, mark: 'P', revision: 1 },
    { ...blank, date: '2026-10-28', mark: 'A', revision: 0 },
    { ...value, mark: 'P', revision: 4 }
  ];
  const partial = await put('import-marks', { marks: batch });
  assert.equal(partial.status, 409);
  assert.match((await partial.json()).error, /2 of 3 marks in this batch were saved/);
  const afterBatch = (await (await fetch(base + 'attendance/2026/week/2026-10-26', { headers })).json()).marks;
  assert.equal(afterBatch.find(mark => mark.date === '2026-10-29').mark, 'L');
  assert.equal(afterBatch.find(mark => mark.date === '2026-10-30').mark, 'P');
  assert.equal(afterBatch.find(mark => mark.date === '2026-10-28').mark, 'A');
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
  assert.equal((await (await fetch(base + 'attendance/2026/week/2026-10-26', { headers })).json()).marks.length, 3, 'removing a tab never deletes attendance');
});
