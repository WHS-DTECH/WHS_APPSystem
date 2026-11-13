const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createStudentTrackerService, termRows, matchingCourses, teacherClassCodes, subjectFamily } = require('../src/studentTracker');
const { userHasHubPermission } = require('../src/hubRoles');
const { createModuleIdentityRouter, authorisedModuleUser } = require('../src/moduleIdentity');
const { accessibleModules } = require('../src/moduleAccess');

const departmentId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const managerId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const teacherId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const peerId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const teacher = { id: teacherId, email: 'teacher@example.test', roles: ['Teacher'] };
function fixture() {
  const department = { id: departmentId, name: 'Technology', subjects: undefined, teacher_emails: [teacher.email], manager_ids: [managerId], revision: 1,
    class_links: { '2026': [{ teacherEmail: teacher.email, code: 'PIDTECH' }, { teacherEmail: 'peer@example.test', code: 'PIDTECH' }] } };
  const row = { id_number: '100', student_name: 'Synthetic Student', year_level: '8', form_class: 'W1',
    mon_p1_1: 'TST-PIDTECH-CW', fri_p3: 'PEER-PIDTECH-05', tue_p2: 'OTHER-MATH-A' };
  const report = { studentId: 'k:100', programme: 'junior', cycle: 'eoy', coding: '3P', design: '4P',
    kaitiakitanga: 'Dem', rangatiratanga: 'Dev', comment: 'Shared draft' };
  const catalog = [
    { first_name: 'Synthetic', last_name: 'Teacher', department: 'Technology', leadership_roles: [
      { department: 'Technology', role: 'HOL', acting: false, onLeave: true }] },
    { first_name: 'Synthetic', last_name: 'Peer', department: 'Science', leadership_roles: [
      { department: 'Technology', role: 'HOLA', acting: true, onLeave: false, reviewedOn: '2026-11-01',
        source: 'https://www.westlandhigh.school.nz/intranet/staff-at-westland-high/' }] }
  ];
  const staff = [
    { code: 'TST', email: 'teacher@example.test', first_name: 'Synthetic', last_name: 'Teacher' },
    { code: 'PEER', email: 'peer@example.test', first_name: 'Synthetic', last_name: 'Peer' }
  ];
  const accounts = [
    { id: teacherId, email: 'teacher@example.test', display_name: 'Synthetic Teacher', lead_teacher: false, student_account: false },
    { id: peerId, email: 'peer@example.test', display_name: 'Synthetic Peer', lead_teacher: true, student_account: false },
    { id: managerId, email: 'student@example.test', display_name: 'Synthetic Student', lead_teacher: true, student_account: true }
  ];
  const state = { department, row, catalog, extraStudents: [], plannerCalls: [], writes: [], failPlanner: false, conflict: false, hasSnapshot: true,
    failDirectory: false, studentHistory: null, staff, accounts, teacherRows: [
      { teacher: 'TST', data: { Teacher: 'TST', Mon_P1: 'PIDTECH-CW', Tue_P2: 'MATH-A' } },
      { teacher: 'PEER', data: { Teacher: 'PEER', Fri_P3: 'PIDTECH-05' } }
    ], teacherHistory: [], teacherYear: 2026, historyYear: 2026, courses: [{ course_code: 'PIDTECH', subject_code: 'DTECH' }],
    settings: { term1Start: '2026-01-29', term1End: '2026-04-02', term4Start: '2026-10-12', term4End: '2026-12-18' },
    marks: [
      { owner_id: teacherId, date: '2026-11-09', period: 'p1', mark: 'P' },
      { owner_id: peerId, date: '2026-11-13', period: 'p3', mark: 'L' },
      { owner_id: teacherId, date: '2026-11-10', period: 'p2', mark: 'A' }
    ] };
  const service = createStudentTrackerService({
    today: () => '2026-11-13',
    dbQuery: async (sql, params) => {
      assert.doesNotMatch(sql, /student_upload|planner_sections|planner_attendance_marks/);
      if (sql.startsWith('SELECT * FROM student_tracker_departments')) return { rows: params[0] === departmentId ? [department] : [] };
      if (sql.includes('FROM student_tracker_departments')) return { rows: [department] };
      if (sql.includes('FROM admin_courses')) return { rows: state.courses };
      if (sql.includes('FROM public.department')) {
        if (state.failDirectory) throw new Error('Shared department directory unavailable');
        return { rows: catalog };
      }
      if (sql.includes('AS lead_teacher')) {
        assert.match(sql, /r.hub_key='whs-techstudent-tracker' AND r.role_key='lead-teacher'/);
        assert.match(sql, /ur.area_key IS NULL/);
        return { rows: accounts };
      }
      if (sql.includes('FROM users')) return { rows: [
        { id: teacherId, email: 'teacher@example.test', display_name: 'Teacher' },
        { id: peerId, email: 'peer@example.test', display_name: 'Peer Teacher' }
      ] };
      if (sql.startsWith('UPDATE student_tracker_departments')) {
        state.writes.push(params);
        if (!state.conflict) {
          if (sql.includes('jsonb_set')) department.class_links[params[3]] = JSON.parse(params[2]);
          else department.class_links = JSON.parse(params[7]);
        }
        return { rows: state.conflict ? [] : [{ id: departmentId }] };
      }
      throw new Error('Unexpected Core query: ' + sql);
    },
    directoryQuery: async (sql, params) => {
      assert.doesNotMatch(sql, /planner_sections|planner_attendance_marks|FROM users/);
      if (sql.includes('FROM student_upload')) return { rows: [row,
        { id_number: '200', student_name: 'Unlinked Student', year_level: '8', mon_p1_1: 'OTHER-MATH-A' }, ...state.extraStudents] };
      if (sql.includes('FROM staff_upload')) return { rows: staff };
      if (sql.includes('FROM timetable_upload')) {
        assert.match(sql, /upload_year=\$1/);
        return { rows: params[0] === state.teacherYear ? state.teacherRows : [] };
      }
      if (sql.includes("dataset_type='teacher_timetable'")) {
        assert.match(sql, /school_year=\$1/);
        return { rows: params[0] === state.historyYear ? state.teacherHistory : [] };
      }
      if (sql.includes('FROM kamar_datasets')) return { rows: state.studentHistory || (state.hasSnapshot ? [{ term: 4, payload: {
        headers: ['Student Name', 'ID Number', 'Year Level', 'Mon P1', 'Mon P1', 'Fri P3', 'Tue P2'],
        rows: [['Synthetic Student', '100', '8', 'TST-PIDTECH-CW', '', 'PEER-PIDTECH-05', 'OTHER-MATH-A']]
      } }] : []) };
      throw new Error('Unexpected KAMAR query: ' + sql);
    },
    plannerQuery: async (sql, params) => {
      state.plannerCalls.push({ sql, params });
      if (state.failPlanner) throw new Error('Planner unavailable');
      assert.doesNotMatch(sql, /INSERT|UPDATE|DELETE|student_upload/);
      if (sql.includes('school_planner_settings')) return { rows: [{ content: state.settings }] };
      if (sql.includes('planner_sections')) return { rows: [
        { owner_id: teacherId, content: { records: JSON.stringify([report, { ...report, studentId: 'k:200' }]) }, updated_at: '2026-11-12' },
        { owner_id: peerId, content: { records: JSON.stringify([report]) }, updated_at: '2026-11-11' }
      ].filter(row => params[0].includes(row.owner_id)) };
      if (sql.includes('planner_attendance_marks')) return { rows: state.marks.filter(row =>
        params[0].includes(row.owner_id) && row.date >= params[3] && row.date <= params[4]) };
      throw new Error('Unexpected Planner query: ' + sql);
    }
  });
  return { ...state, state, service, input: { year: 2026, departmentId, studentId: 'k:100' } };
}
test('Tracker searches linked subjects and profiles preserve uploaded timetables without exposing unrelated students', async () => {
  const { service, input, plannerCalls } = fixture();
  const results = await service.run(teacher, { ...input, action: 'search', q: 'Student' });
  assert.deepEqual(results.students.map(student => student.name), ['Synthetic Student']);
  const profile = await service.run(teacher, { ...input, action: 'profile' });
  assert.equal(profile.student.name, 'Synthetic Student');
  assert.deepEqual(profile.availableTerms, [4]);
  assert.equal(profile.timetables[0].lessons.find(lesson => lesson.subject === 'MATH').linked, false);
  await assert.rejects(service.run(teacher, { ...input, action: 'profile', studentId: 'k:200' }), { status: 404 });
  await assert.rejects(service.run({ ...teacher, email: 'outsider@example.test' }, { ...input, action: 'profile' }), { status: 403 });
  assert.equal(plannerCalls.length, 0, 'search/profile read KAMAR only, never private Planner records');
});
test('department staff can read peer report drafts and term marks only for linked lessons and this student', async () => {
  const { service, input, plannerCalls } = fixture();
  const reports = await service.run(teacher, { ...input, action: 'reports' });
  assert.equal(reports.reports.length, 2);
  assert.deepEqual(reports.reports.map(row => row.teacher), ['Teacher', 'Peer Teacher']);
  assert.match(reports.notice, /Not official published KAMAR/);
  assert.doesNotMatch(JSON.stringify(reports), /k:200/);
  const attendance = await service.run(teacher, { ...input, action: 'attendance', term: 4 });
  assert.deepEqual(attendance.marks.map(mark => [mark.teacher, mark.mark]), [['Teacher', 'P'], ['Peer Teacher', 'L']]);
  assert.equal(attendance.marks.some(mark => mark.subject === 'MATH'), false);
  assert.match(attendance.notice, /not the official KAMAR/);
  await assert.rejects(service.run(teacher, { ...input, action: 'attendance', term: 1 }), { status: 404 });
  assert.equal(plannerCalls.filter(call => call.sql.includes('planner_attendance_marks')).length, 1);
});
test('verified website HoLAs with current module Lead Teacher roles can manage only their department', async () => {
  const { service, input, department, state } = fixture();
  const changes = { ...department, teacherEmails: department.teacher_emails, managerIds: [peerId] };
  await assert.rejects(service.run(teacher, { ...input, action: 'save-setup', department: changes }), { status: 403 });
  const manager = { ...teacher, id: peerId, email: 'peer@example.test' };
  const setup = await service.run(manager, { ...input, action: 'setup' });
  assert.equal(setup.departments[0].canManage, true);
  assert.deepEqual(setup.departments[0].managerIds, [peerId]);
  await service.run(manager, { ...input, action: 'save-setup', department: changes });
  assert.deepEqual(state.writes[0][3], [peerId], 'authority is derived from live identity, role and reviewed website listing');
  await assert.rejects(service.run(manager, { ...input, action: 'save-setup',
    department: { ...changes, name: 'Science' } }), { status: 403 });
  await assert.rejects(service.run(manager, { ...input, action: 'save-setup',
    department: { ...changes, managerIds: [teacherId] } }), /manual assignments are not accepted/);
  state.conflict = true;
  await assert.rejects(service.run(manager, { ...input, action: 'save-setup', department: changes }), { status: 409 });
  await assert.rejects(service.run(manager, { ...input, action: 'save-setup',
    department: { ...changes, subjects: ['FAKE'] } }), /Link Subject Classes/);
});
test('setup lists only verified staff Lead Teacher HoLAs, never students or unrelated active accounts', async () => {
  const { service, input, state } = fixture();
  const setup = await service.run(teacher, { ...input, action: 'setup' });
  assert.deepEqual(setup.departmentOptions.map(item => item.name), ['Science', 'Technology']);
  const technology = setup.departmentOptions.find(item => item.name === 'Technology');
  assert.equal(technology.teacher, 'Synthetic Peer (PEER)');
  assert.equal(technology.leaders.find(item => item.onLeave).name, 'Synthetic Teacher (TST)');
  assert.equal(technology.leaders.find(item => item.acting).reviewedOn, '2026-11-01');
  assert.equal(setup.departments[0].canManage, false);
  assert.deepEqual(setup.users, [{ id: peerId, display_name: 'Synthetic Peer' }]);
  assert.deepEqual(technology.managerIds, [peerId]);
  assert.deepEqual(setup.departments[0].managerIds, [peerId]);
  assert.equal(setup.automaticHolaAccess, true);
  assert.deepEqual(state.department.manager_ids, [managerId]);
  state.failDirectory = true;
  await assert.rejects(service.run(teacher, { ...input, action: 'setup' }), /Shared department directory unavailable/);
  await assert.rejects(service.run(teacher, { ...input, action: 'profile' }), /Shared department directory unavailable/);
});
test('setup rejects invented department names but preserves an existing name removed from the shared directory', async () => {
  const { service, input, department, state } = fixture();
  const manager = { ...teacher, roles: ['ADMIN'] };
  await assert.rejects(service.run(manager, { ...input, action: 'save-setup',
    department: { ...department, teacherEmails: department.teacher_emails, name: 'Invented Faculty' } }), /department from Kamar Uploader/);
  department.name = 'Saved Faculty';
  await service.run(manager, { ...input, action: 'save-setup', department: { ...department, teacherEmails: department.teacher_emails } });
  assert.equal(state.writes[0][1], 'Saved Faculty');
  state.failDirectory = true;
  await assert.rejects(service.run(manager, { ...input, action: 'save-setup', department: { ...department, teacherEmails: department.teacher_emails } }),
    /Shared department directory unavailable/);
  assert.equal(state.writes.length, 1);
});
test('current term attendance can use the current upload but previous terms never borrow its timetable', async () => {
  const { service, input, state } = fixture();
  state.hasSnapshot = false;
  const result = await service.run(teacher, { ...input, action: 'attendance' });
  assert.equal(result.term, 4);
  assert.match(result.timetableSource, /current term only/);
  assert.equal(result.marks.length, 2);
  await assert.rejects(service.run(teacher, { ...input, action: 'attendance', term: 1 }), /No preserved timetable/);
  const overview = await service.run(teacher, { ...input, action: 'attendance-overview' });
  assert.equal(overview.terms[0].status, 'unavailable');
  assert.equal(overview.terms[3].status, 'available');
  assert.match(overview.terms[3].timetableSource, /current term only/);
  state.marks = [];
  assert.deepEqual((await service.run(teacher, { ...input, action: 'attendance-overview' })).terms[3].marks, []);
});
test('profile lists confirmed linked subject classes, teachers and sources without guessing unavailable timetables', async () => {
  const { service, input, state } = fixture();
  state.teacherHistory = [{ term: 4, payload: { headers: ['Teacher', 'Mon P1', 'Fri P3'],
    rows: [['TST', 'PIDTECH-CW', ''], ['PEER', '', 'PIDTECH-05']] } }];
  const profile = await service.run(teacher, { ...input, action: 'profile' });
  assert.deepEqual(profile.subjectClasses, [
    { discipline: 'Digital Technologies', subject: 'PIDTECH', classCode: 'PIDTECH', teacher: 'Synthetic Peer', sources: [null, 4] },
    { discipline: 'Digital Technologies', subject: 'PIDTECH', classCode: 'PIDTECH', teacher: 'Synthetic Teacher', sources: [null, 4] }
  ]);
  assert.deepEqual(profile.subjectClassesWarnings, []);
  state.teacherHistory = [];
  const missing = await service.run(teacher, { ...input, action: 'profile' });
  assert.ok(missing.subjectClasses.every(item => item.sources.length === 1 && item.sources[0] === null));
  assert.match(missing.subjectClassesWarnings.join(' '), /Term 4/);
  assert.doesNotMatch(JSON.stringify(profile.subjectClasses), /MATH|100|example\.test/);
});
test('attendance overview shows each term, recorded linked marks and explicitly incomplete sources', async () => {
  const { service, input, state } = fixture();
  state.settings.term2Start = '2026-04-20';
  state.settings.term2End = '2026-07-03';
  state.settings.term3Start = '2026-07-20';
  state.settings.term3End = '2026-09-25';
  const headers = ['Student Name', 'ID Number', 'Year Level', 'Mon P1', 'Fri P3'];
  const row = ['Synthetic Student', '100', '8', 'TST-PIDTECH-CW', 'PEER-PIDTECH-05'];
  state.studentHistory = [
    { term: 1, payload: { headers, rows: [row] } },
    { term: 2, payload: { headers, rows: [['Synthetic Student', '100', '8', 'OTHER-MATH-A', '']] } },
    { term: 3, payload: { headers, rows: [row] } },
    { term: 4, payload: { headers, rows: [row] } }
  ];
  state.teacherHistory = [1, 4].map(term => ({ term, payload: {
    headers: ['Teacher', 'Mon P1', 'Fri P3'], rows: [['TST', 'PIDTECH-CW', ''], ['PEER', '', 'PIDTECH-05']]
  } }));
  state.marks.push({ owner_id: teacherId, date: '2026-02-02', period: 'p1', mark: 'A' });
  const result = await service.run(teacher, { ...input, action: 'attendance-overview' });
  assert.deepEqual(result.terms.map(item => item.status), ['available', 'not_enrolled', 'unavailable', 'available']);
  assert.deepEqual(result.terms[0].marks.map(item => item.mark), ['A']);
  assert.deepEqual(result.terms[3].marks.map(item => item.mark), ['P', 'L']);
  assert.equal(result.terms[0].startDate, '2026-01-29');
  assert.equal(result.terms[3].endDate, '2026-12-18');
  assert.match(result.notice, /not the official KAMAR/);
  assert.match(result.terms[2].message, /could not be confirmed/);
  assert.doesNotMatch(JSON.stringify(result), /MATH|k:100/);
  state.teacherHistory.find(item => item.term === 4).payload.rows.pop();
  const partial = await service.run(teacher, { ...input, action: 'attendance-overview' });
  assert.deepEqual(partial.terms[3].marks.map(item => item.mark), ['P']);
  assert.match(partial.terms[3].message, /incomplete/);
  state.studentHistory = state.studentHistory.filter(item => item.term !== 1);
  state.settings.term4End = '';
  const missing = await service.run(teacher, { ...input, action: 'attendance-overview' });
  assert.match(missing.terms[0].message, /No student timetable/);
  assert.match(missing.terms[3].message, /term dates/);
  await assert.rejects(service.run({ ...teacher, email: 'outsider@example.test' },
    { ...input, action: 'attendance-overview' }), { status: 403 });
});
test('attendance overview does not duplicate one saved period mark across two subjects', async () => {
  const { service, input, state } = fixture();
  state.department.class_links['2026'] = ['PIDTECH', '11FOOD'].map(code => ({ teacherEmail: teacher.email, code }));
  state.teacherRows[0].data.Mon_P1 = 'PIDTECH-CW;11FOOD-F';
  Object.assign(state.row, { mon_p1_2: 'TST-11FOOD-F', fri_p3: '' });
  state.teacherHistory = [{ term: 4, payload: { headers: ['Teacher', 'Mon P1'],
    rows: [['TST', 'PIDTECH-CW;11FOOD-F']] } }];
  state.studentHistory = [{ term: 4, payload: {
    headers: ['Student Name', 'ID Number', 'Year Level', 'Mon P1', 'Mon P1'],
    rows: [['Synthetic Student', '100', '8', 'TST-PIDTECH-CW', 'TST-11FOOD-F']]
  } }];
  const result = await service.run(teacher, { ...input, action: 'attendance-overview' });
  assert.deepEqual(result.terms[3].marks.map(item => [item.subject, item.mark]), [['11FOOD / PIDTECH', 'P']]);
  assert.match(result.terms[3].message, /cannot be assigned/);
});
test('ADMIN cannot manually grant a student or unrelated account HoLA rights or replace a stale department id', async () => {
  const { service, input, department, state } = fixture();
  const admin = { ...teacher, roles: ['ADMIN'] };
  const changes = { ...department, teacherEmails: department.teacher_emails, managerIds: [peerId] };
  await service.run(admin, { ...input, action: 'save-setup', department: changes });
  assert.deepEqual(state.writes[0][3], [peerId]);
  await assert.rejects(service.run(admin, { ...input, action: 'save-setup',
    department: { ...changes, id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' } }), { status: 404 });
  await assert.rejects(service.run(admin, { ...input, action: 'save-setup',
    department: { ...changes, managerIds: [managerId] } }), /manual assignments are not accepted/);
  assert.equal(state.writes.length, 1);
});
test('HoLA management is withdrawn immediately on missing roles, identity mismatch, leave or ambiguous website data', async () => {
  const cases = [
    state => { state.accounts[1].lead_teacher = false; },
    state => { state.accounts[1].display_name = 'Different Name'; },
    state => { state.accounts[1].email = 'student@example.test'; },
    state => { state.accounts[1].student_account = true; },
    state => { state.catalog[1].leadership_roles[0].onLeave = true; },
    state => { state.catalog[1].leadership_roles[0].source = undefined; },
    state => { state.catalog[1].leadership_roles[0].reviewedOn = undefined; },
    state => { state.catalog[1].leadership_roles[0].role = 'TIC'; },
    state => { state.catalog[1].leadership_roles.push({ ...state.catalog[1].leadership_roles[0] }); },
    state => { state.accounts.push({ ...state.accounts[1], id: managerId }); },
    state => { state.staff.push({ ...state.staff[1], code: 'DUP', first_name: 'Other' }); }
  ];
  for (const mutate of cases) {
    const { service, input, state } = fixture();
    state.department.manager_ids = [peerId];
    state.department.subjects = [];
    mutate(state);
    const user = { ...teacher, id: peerId, email: 'peer@example.test', module_roles: ['lead-teacher'] };
    try {
      const setup = await service.run(user, { ...input, action: 'setup' });
      assert.equal(setup.departments.length, 0, 'stale stored grants and caller role hints never bypass live checks');
      assert.deepEqual(setup.users, []);
    } catch (error) {
      assert.equal(error.status, 403);
      assert.match(error.message, /staff-only/);
    }
    await assert.rejects(service.run(user, { ...input, action: 'save-setup',
      department: { ...state.department, teacherEmails: state.department.teacher_emails } }), { status: 403 });
  }
});
test('a verified HoLA without teaching assignments can access its department; legacy managers cannot', async () => {
  const { service, input, state } = fixture();
  state.department.subjects = [];
  const manager = { ...teacher, id: peerId, email: 'peer@example.test' };
  assert.equal((await service.run(manager, { ...input, action: 'setup' })).departments[0].canManage, true);
  const legacy = { ...teacher, id: managerId, email: 'student@example.test' };
  await assert.rejects(service.run(legacy, { ...input, action: 'setup' }), { status: 403 });
});
test('source outages and malformed snapshots fail explicitly instead of returning empty history', async () => {
  const { service, input, state } = fixture();
  state.failPlanner = true;
  await assert.rejects(service.run(teacher, { ...input, action: 'reports' }), /Planner unavailable/);
  assert.throws(() => termRows({ headers: ['Name'], rows: [] }), /missing columns/);
  await assert.rejects(service.run(teacher, { ...input, year: 1800, action: 'search', q: 'Student' }), { status: 400 });
});
test('HoLAs approve current staff, including staff without Core accounts, but not students or forged identities', async () => {
  const { service, input, state } = fixture();
  state.staff.push({ code: 'NEW', email: 'new@example.test', first_name: 'New', last_name: 'Teacher' },
    { code: 'STUDENT', email: 'student@example.test', first_name: 'Synthetic', last_name: 'Student' });
  const manager = { ...teacher, id: peerId, email: 'peer@example.test' };
  const setup = await service.run(manager, { ...input, action: 'setup' });
  assert.deepEqual(setup.staff.map(person => person.code), ['NEW', 'PEER', 'TST']);
  assert.equal(setup.staff.find(person => person.code === 'NEW').timetableAvailable, false);
  assert.deepEqual(setup.departmentOptions.find(option => option.name === 'Technology').automaticTeachers, ['peer@example.test']);
  const department = { id: departmentId, name: 'Technology', revision: 1, teacherEmails: ['new@example.test', 'peer@example.test'] };
  await service.run(manager, { ...input, action: 'save-setup', department });
  assert.deepEqual(state.writes[0][6], ['new@example.test'], 'automatic HoLA access is not stored as a permanent approval');
  for (const emails of [['student@example.test'], ['forged@example.test'], [teacher.email, teacher.email]]) {
    await assert.rejects(service.run(manager, { ...input, action: 'save-setup',
      department: { ...department, teacherEmails: emails } }), /current staff/);
  }
  const readonly = await service.run(teacher, { ...input, action: 'setup' });
  assert.deepEqual(readonly.staff, []);
  assert.deepEqual(readonly.departments[0].teacherEmails, []);
  assert.equal(state.writes.length, 1);
});
test('only approved teachers supply department codes and private record owners; revocation is immediate', async () => {
  const { service, input, state } = fixture();
  state.accounts[1].lead_teacher = false;
  state.teacherRows[1].data.Fri_P3 = '11HOSP-05';
  state.courses.push({ course_code: '11HOSP', subject_code: 'FOOD' });
  const setup = await service.run(teacher, { ...input, action: 'setup' });
  assert.deepEqual(setup.departments[0].subjects, ['PIDTECH']);
  assert.deepEqual(setup.departments[0].teacherNames, ['Synthetic Teacher']);
  const reports = await service.run(teacher, { ...input, action: 'reports' });
  assert.deepEqual(state.plannerCalls.find(call => call.sql.includes('planner_sections')).params[0], [teacherId]);
  assert.equal(reports.reports.length, 1);
  state.department.teacher_emails = [];
  await assert.rejects(service.run(teacher, { ...input, action: 'profile' }), { status: 403 });
});
test('teacher course matching handles aliases, rooms, year families and preserved duplicate periods without guessing departments', async () => {
  const { service, input, state } = fixture();
  state.courses = [
    { course_code: 'JDTECH', subject_code: 'DTECH' },
    { course_code: 'MDTECH-S1', subject_code: 'DTECH' }, { course_code: 'MDTECH-S2', subject_code: 'DTECH' },
    { course_code: '11DTECH', subject_code: 'DTECH' }, { course_code: '11HOSP', subject_code: 'FOOD' }
  ];
  state.teacherRows[0].data = { Teacher: 'TST', 'D1 P1': 'JPI-05', 'D2 P2': '11DTECH1-CW',
    'D3 P3': 'MATH-JPI', 'D1 I': 'JDTECH-CW', D1: 'MDTECH-CW' };
  state.teacherHistory = [{ term: 3, payload: { headers: ['Teacher', 'D1 P1', 'D1 P1'],
    rows: [['TST', 'TST/PEER-9DTECH-CW', '11HOSP-K1']] } }];
  const manager = { ...teacher, id: peerId, email: 'peer@example.test' };
  const setup = await service.run(manager, { ...input, action: 'setup' });
  const source = setup.staff.find(person => person.code === 'TST');
  assert.deepEqual(source.links.map(link => link.code).sort(), ['11DTECH1', '11HOSP', '9DTECH', 'JPI']);
  assert.deepEqual(source.links.find(link => link.code === '9DTECH').courses, ['MDTECH-S1', 'MDTECH-S2']);
  assert.deepEqual(source.unmatchedCodes, ['MATH']);
  assert.equal(matchingCourses('11DTECHNOLOGY', state.courses).length, 0);
  assert.deepEqual(matchingCourses('7DTECH1', state.courses).map(course => course.course_code), ['JDTECH']);
  state.row.mon_p1_1 = 'TST-JPI-05'; state.hasSnapshot = false;
  state.department.class_links['2026'] = [{ teacherEmail: teacher.email, code: 'JPI' }];
  const reports = await service.run(teacher, { ...input, action: 'reports' });
  assert.equal(reports.reports.length, 1, 'JuniorDTECH aliases retain report history');
  state.department.name = 'Science';
  assert.deepEqual((await service.run(manager, { ...input, action: 'setup' })).departments, []);
  state.teacherRows[0].data = 'invalid';
  await assert.rejects(service.run(teacher, { ...input, action: 'setup' }), { status: 502 });
});
test('teacher approvals permit Tracker sign-in and launcher access only, without global or management roles', async () => {
  let approved = true;
  const dbQuery = async sql => {
    if (sql.includes('FROM modules m') && sql.includes('AS has_access')) return { rows: [
      { module_key: 'whs-techstudent-tracker', is_active: true, has_access: false },
      { module_key: 'teacher-planner', is_active: true, has_access: false }
    ] };
    if (sql.includes('d.teacher_emails')) {
      assert.match(sql, /u.is_active=true/); assert.match(sql, /lower\(r.name\)='student'/);
      assert.match(sql, /is_active=false/);
      return { rows: approved ? [{ ...teacher, module_roles: [] }] : [] };
    }
    return { rowCount: 0, rows: [] };
  };
  assert.deepEqual((await authorisedModuleUser(teacherId, 'whs-techstudent-tracker', dbQuery)).module_roles, []);
  assert.equal(await authorisedModuleUser(teacherId, 'teacher-planner', dbQuery), undefined);
  assert.equal(await userHasHubPermission(teacher, 'whs-techstudent-tracker', 'home.view', dbQuery), true);
  assert.equal(await userHasHubPermission(teacher, 'whs-techstudent-tracker', 'teacher.view', dbQuery), true);
  assert.equal(await userHasHubPermission(teacher, 'whs-techstudent-tracker', 'admin.manage', dbQuery), false);
  assert.equal(await userHasHubPermission(teacher, 'teacher-planner', 'home.view', dbQuery), false);
  assert.deepEqual((await accessibleModules(teacher, dbQuery)).map(module => module.module_key), ['whs-techstudent-tracker']);
  approved = false;
  assert.equal(await authorisedModuleUser(teacherId, 'whs-techstudent-tracker', dbQuery), undefined);
  assert.deepEqual(await accessibleModules(teacher, dbQuery), []);
});
test('teacher links use the selected year and invalid source shapes fail explicitly', async () => {
  const { service, input, state } = fixture();
  const admin = { ...teacher, roles: ['ADMIN'] };
  const historical = await service.run(admin, { ...input, year: 2025, action: 'setup' });
  assert.deepEqual(historical.departments[0].subjects, []);
  assert.equal(historical.staff.every(person => !person.timetableAvailable), true);
  state.teacherHistory = [{ term: 4, payload: { headers: ['Teacher', 'Mon P1'], rows: [['TST']] } }];
  await assert.rejects(service.run(admin, { ...input, action: 'setup' }), { status: 502 });
  state.teacherHistory = [];
  state.teacherRows[0].data = { Teacher: 'TST' };
  await assert.rejects(service.run(admin, { ...input, action: 'setup' }), { status: 502 });
});
test('real teacher cells retain online and hospitality cooking classes while excluding non-teaching entries', () => {
  const parsed = teacherClassCodes('3-13HOSP-F;-HOSPCOOK-;81A-MFOOD-F;2-DTOnline-CW;9WHAU-WHANAU-CW;HAPU',
    [], [{ course_code: '13HOSP' }, { course_code: 'MFOOD-S1' }]);
  assert.deepEqual(parsed.codes, ['3-13HOSP', 'HOSPCOOK', '81A-MFOOD', '2-DTONLINE']);
  assert.equal(parsed.excluded.length, 2);
  assert.equal(subjectFamily('HOSPCOOK'), 'FOOD');
  assert.equal(subjectFamily('2-DTONLINE'), 'DTONLINE');
  assert.equal(subjectFamily('3-13HOSP'), subjectFamily('81A-MFOOD'));
  assert.equal(subjectFamily('81C-MDTECH'), 'DTECH');
  assert.equal(subjectFamily('12HIST-12HIST'), 'HIST');
  assert.equal(subjectFamily('JPI-PISCI'), 'SCI');
  assert.equal(subjectFamily('JSD-SDSCI'), 'SCI');
  assert.equal(subjectFamily('MTR-MTRSCI'), 'SCI');
  assert.deepEqual(matchingCourses('8S-JDTECH', [{ course_code: 'JDTECH' }]).map(course => course.course_code), ['JDTECH']);
  assert.deepEqual(matchingCourses('81A-MFOOD', [{ course_code: 'MFOOD-S1' }, { course_code: 'MDTECH-S1' }])
    .map(course => course.course_code), ['MFOOD-S1']);
  assert.deepEqual(teacherClassCodes('TST/PEER-3-13HOSP-F', [{ code: 'TST' }, { code: 'PEER' }], []).codes, ['3-13HOSP']);
});
test('junior timetable aliases match their own DTECH, FOOD or WOOD Learning Sites', () => {
  const courses = [{ course_code: 'JDTECH' }, { course_code: 'JFOOD' }, { course_code: 'JWOOD' }];
  for (const code of ['JMM-MMDTECH', 'JPI-PIDTECH', 'JSR-SRDTECH', 'JVE-VEDTECH']) {
    assert.deepEqual(matchingCourses(code, courses).map(course => course.course_code), ['JDTECH']);
  }
  assert.deepEqual(matchingCourses('JSD-SDFOOD', courses).map(course => course.course_code), ['JFOOD']);
  for (const code of ['JMM-MMWOOD', 'JPI-PIWOOD', 'JSR-SRWOOD', 'JVE-VEWOOD']) {
    assert.deepEqual(matchingCourses(code, courses).map(course => course.course_code), ['JWOOD']);
  }
  assert.deepEqual(matchingCourses('JSD-SDSCI', courses), []);
  assert.deepEqual(matchingCourses('JMM-PIDTECH', courses), []);
  const withoutGroup = teacherClassCodes('-11HOSP-F;-UNKNOWN-F', [], [{ course_code: '11HOSP' }]);
  assert.deepEqual(withoutGroup.codes, ['11HOSP']);
  assert.deepEqual(withoutGroup.excluded, ['-UNKNOWN-F']);
});
test('HOSPCOOK and DTONLINE are selectable without revealing or broadening individual cooking entries', async () => {
  const { service, input, state } = fixture();
  state.teacherRows[0].data = { Teacher: 'TST', Mon_P1: '100-HOSPCOOK', Fri_P3: '2-DTOnline-CW' };
  state.department.class_links['2026'] = [
    { teacherEmail: teacher.email, code: 'HOSPCOOK' },
    { teacherEmail: teacher.email, code: '2-DTONLINE' }
  ];
  Object.assign(state.row, { year_level: '13', mon_p1_1: 'TST-HOSPCOOK-', fri_p3: '', tue_p2: '' });
  state.extraStudents = [
    { id_number: '101', student_name: 'Other Cooking Student', year_level: '13', mon_p1_1: 'TST-HOSPCOOK-' },
    { id_number: '102', student_name: 'Online Student', year_level: '13', fri_p3: 'TST-DTonline-CW' }
  ];
  state.studentHistory = [{ term: 4, payload: {
    headers: ['Student Name', 'ID Number', 'Year Level', 'Mon P1', 'Fri P3'],
    rows: [
      ['Synthetic Student', '100', '13', 'TST-HOSPCOOK-', ''],
      ['Other Cooking Student', '101', '13', 'TST-HOSPCOOK-', ''],
      ['Online Student', '102', '13', '', 'TST-DTonline-CW']
    ]
  } }];
  state.teacherHistory = [{ term: 4, payload: { headers: ['Teacher', 'Mon P1', 'Fri P3'],
    rows: [['TST', '101-HOSPCOOK', '2-DTOnline-CW']] } }];
  const setup = await service.run({ ...teacher, roles: ['ADMIN'] }, { ...input, action: 'setup' });
  const person = setup.staff.find(entry => entry.code === 'TST');
  assert.equal(person.classes.find(entry => entry.code === 'HOSPCOOK').family, 'FOOD');
  assert.equal(person.classes.find(entry => entry.code === '2-DTONLINE').family, 'DTONLINE');
  assert.doesNotMatch(JSON.stringify(person), /100-HOSPCOOK|101-HOSPCOOK|studentIds|unrestricted/);
  const search = values => service.run(teacher, { ...input, action: 'search', ...values });
  assert.deepEqual((await search({ classCode: 'HOSPCOOK' })).students.map(student => student.name),
    ['Other Cooking Student', 'Synthetic Student']);
  assert.deepEqual((await search({ classCode: 'HOSPCOOK', term: 4 })).students.map(student => student.name),
    ['Other Cooking Student']);
  assert.deepEqual((await search({ classCode: '2-DTONLINE', term: 4 })).students.map(student => student.name), ['Online Student']);
  const profile = await service.run(teacher, { ...input, action: 'profile' });
  assert.equal(profile.timetables[0].lessons[0].linked, true);
  assert.deepEqual(profile.subjectClasses.map(item => [item.classCode, item.sources]), [['HOSPCOOK', [null]]]);
  assert.doesNotMatch(JSON.stringify(profile.subjectClasses), /100|101|studentIds/);
  const overview = await service.run(teacher, { ...input, action: 'attendance-overview' });
  assert.equal(overview.terms[3].status, 'unavailable');
  state.studentHistory = [];
  assert.deepEqual((await search({ classCode: 'HOSPCOOK' })).students.map(student => student.name), ['Synthetic Student']);
  await assert.rejects(service.run(teacher, { ...input, action: 'profile', studentId: 'k:101' }), { status: 404 });
  state.extraStudents[0].fri_p3 = 'TST-DTonline-CW';
  const online = await search({ classCode: '2-DTONLINE' });
  assert.deepEqual(online.students.find(student => student.name === 'Other Cooking Student').subjects,
    [{ code: 'DTONLINE', discipline: 'DTONLINE' }]);
  state.teacherRows[0].data.Mon_P1 = '-HOSPCOOK-';
  assert.deepEqual((await search({ classCode: 'HOSPCOOK' })).students.map(student => student.name),
    ['Other Cooking Student', 'Synthetic Student']);
});
test('class links are explicit, year-specific, and limited to authorised teachers and actual teaching classes', async () => {
  const { service, input, state } = fixture();
  const admin = { ...teacher, roles: ['ADMIN'] };
  state.department.class_links = {};
  const values = { id: departmentId, name: 'Technology', revision: 1, classLinks: [{ teacherEmail: teacher.email, code: 'PIDTECH' }] };
  await assert.rejects(service.run(teacher, { ...input, action: 'search', q: 'Student' }), { status: 409 });
  await assert.rejects(service.run(teacher, { ...input, action: 'save-classes', department: values }), { status: 403 });
  for (const links of [[{ teacherEmail: teacher.email, code: 'WHANAU' }],
    [{ teacherEmail: 'outsider@example.test', code: 'PIDTECH' }], [values.classLinks[0], values.classLinks[0]]]) {
    await assert.rejects(service.run(admin, { ...input, action: 'save-classes',
      department: { ...values, classLinks: links } }), { status: 400 });
  }
  await service.run(admin, { ...input, action: 'save-classes', department: values });
  assert.deepEqual(state.department.class_links['2026'], values.classLinks);
  assert.equal((await service.run(teacher, { ...input, action: 'search', q: 'Student' })).students.length, 1);
  assert.deepEqual((await service.run(admin, { ...input, year: 2025, action: 'setup' })).departments[0].classLinks, []);
  await assert.rejects(service.run(admin, { ...input, action: 'save-classes', department: { ...values, id: undefined } }), { status: 409 });
  state.accounts[1].lead_teacher = false;
  await assert.rejects(service.run(admin, { ...input, action: 'save-classes',
    department: { ...values, classLinks: [{ teacherEmail: 'peer@example.test', code: 'PIDTECH' }] } }), { status: 400 });
  state.conflict = true;
  await assert.rejects(service.run(admin, { ...input, action: 'save-classes', department: values }), { status: 409 });
});
test('class browsing accepts an optional name, includes linked teachers, and rejects unlinked classes', async () => {
  const { service, input, state } = fixture();
  assert.equal((await service.run(teacher, { ...input, action: 'setup' })).classBrowse, true);
  state.extraStudents = [
    { id_number: '201', student_name: 'Peer Only', year_level: '8', fri_p3: 'PEER-PIDTECH-05' },
    ...Array.from({ length: 55 }, (_, i) => ({ id_number: String(300 + i), student_name: 'Class Member ' + i,
      year_level: '8', mon_p1_1: 'TST-PIDTECH-CW' }))
  ];
  const browse = await service.run(teacher, { ...input, action: 'search', classCode: 'PIDTECH' });
  assert.equal(browse.students.length, 57);
  assert.equal(browse.truncated, false);
  assert.equal(browse.ambiguous, false);
  assert.ok(browse.students.some(student => student.name === 'Peer Only'));
  assert.deepEqual((await service.run(teacher, { ...input, action: 'search', classCode: 'PIDTECH', q: 'peer' }))
    .students.map(student => student.name), ['Peer Only']);
  assert.equal((await service.run(teacher, { ...input, action: 'search', classCode: 'PIDTECH', q: 'P' })).students.length, 1);
  const named = await service.run(teacher, { ...input, action: 'search', q: 'Class' });
  assert.equal(named.students.length, 50);
  assert.equal(named.truncated, true);
  await assert.rejects(service.run(teacher, { ...input, action: 'search', classCode: 'MATH' }), { status: 400 });
  await assert.rejects(service.run(teacher, { ...input, action: 'search', q: '' }), { status: 400 });
  await assert.rejects(service.run(teacher, { ...input, action: 'search', classCode: 123 }), { status: 400 });
  await assert.rejects(service.run(teacher, { ...input, action: 'search', classCode: 'PIDTECH',
    departmentId: '00000000-0000-4000-8000-000000000000' }), { status: 403 });
});
test('subject breakdown spans linked disciplines and timetable sources without exposing unlinked lessons', async () => {
  const { service, input, state } = fixture();
  state.teacherRows[0].data = { Teacher: 'TST', Mon_P1: 'PIDTECH-CW', Tue_P2: '11FOOD-F',
    Wed_P3: '12FOOD-F', Thu_P3: '11HOSP-F', Fri_P2: 'MATH-A' };
  state.department.class_links['2026'] = ['PIDTECH', '11FOOD', '12FOOD', '11HOSP']
    .map(code => ({ teacherEmail: teacher.email, code }));
  Object.assign(state.row, { tue_p2: 'TST-11FOOD-F', wed_p3: 'TST-12FOOD-F',
    thu_p3: 'TST-11HOSP-F', fri_p2: 'TST-MATH-A', fri_p3: '' });
  state.teacherHistory = [{ term: 4, payload: { headers: ['Teacher', 'Mon P1', 'Tue P2'],
    rows: [['TST', 'PIDTECH-CW', '11FOOD-F']] } }];
  state.studentHistory = [{ term: 4, payload: { headers: ['Student Name', 'ID Number', 'Year Level', 'Mon P1', 'Tue P2'],
    rows: [['Synthetic Student', '100', '8', 'TST-PIDTECH-CW', 'TST-11FOOD-F']] } }];
  const search = values => service.run(teacher, { ...input, action: 'search', classCode: 'PIDTECH', ...values });
  const all = await search({});
  assert.deepEqual(all.disciplines, ['DTECH', 'FOOD', 'HOSP']);
  assert.deepEqual(all.students[0].subjects, [
    { code: '11FOOD', discipline: 'FOOD' }, { code: '11HOSP', discipline: 'HOSP' },
    { code: '12FOOD', discipline: 'FOOD' }, { code: 'PIDTECH', discipline: 'DTECH' }
  ]);
  assert.deepEqual(all.students[0].uncertainDisciplines, []);
  const term = await search({ term: 4 });
  assert.deepEqual(term.students[0].subjects, [
    { code: '11FOOD', discipline: 'FOOD' }, { code: 'PIDTECH', discipline: 'DTECH' }
  ]);
  assert.deepEqual(term.students[0].uncertainDisciplines, []);
  assert.equal((await search({ term: 4, discipline: 'FOOD' })).students.length, 1);
  assert.equal((await search({ term: 4, discipline: 'HOSP' })).students.length, 0);
  assert.equal((await search({ term: 4, subject: 'FOOD', discipline: 'digital_technologies' })).students.length, 1);
  assert.equal((await search({ term: 4, subject: 'FOOD', discipline: 'food_hospitality' })).students.length, 1);
});
test('discipline browsing combines filters and retains other linked subjects without truncation', async () => {
  const { service, input, state } = fixture();
  state.hasSnapshot = false;
  state.teacherRows[0].data = { Teacher: 'TST', Mon_P1: 'PIDTECH-CW', Tue_P2: '11FOOD-F', Wed_P3: '11HOSP-F' };
  state.department.class_links['2026'] = ['PIDTECH', '11FOOD', '11HOSP'].map(code => ({ teacherEmail: teacher.email, code }));
  Object.assign(state.row, { tue_p2: 'TST-11FOOD-F', fri_p3: '' });
  state.extraStudents = [
    ...Array.from({ length: 60 }, (_, i) => ({ id_number: String(300 + i), student_name: 'Food Student ' + i,
      year_level: '9', tue_p2: 'TST-11FOOD-F' })),
    { id_number: '400', student_name: 'Hospitality Student', year_level: '9', wed_p3: 'TST-11HOSP-F' }
  ];
  const search = values => service.run(teacher, { ...input, action: 'search', ...values });
  const setup = await service.run(teacher, { ...input, action: 'setup' });
  assert.equal(setup.disciplineBrowse, true);
  assert.deepEqual(setup.departments[0].disciplines, ['DTECH', 'FOOD', 'HOSP']);
  const allFood = await search({ discipline: 'FOOD' });
  assert.equal(allFood.students.length, 61);
  assert.equal(allFood.truncated, false);
  assert.equal((await search({ discipline: 'HOSP' })).students.length, 1);
  const combined = await search({ discipline: 'FOOD', classCode: 'PIDTECH', yearLevel: '8', q: 'Synthetic' });
  assert.equal(combined.students.length, 1);
  assert.deepEqual(combined.students[0].subjects.map(item => item.code), ['11FOOD', 'PIDTECH']);
  assert.equal((await search({ discipline: 'FOOD', classCode: 'PIDTECH', yearLevel: '9' })).students.length, 0);
  for (const invalid of ['OTHER', 4, null]) await assert.rejects(search({ discipline: invalid }), { status: 400 });
});
test('broader disciplines group subjects and combine independently with a subject filter', async () => {
  const { service, input, state } = fixture();
  state.hasSnapshot = false;
  const entries = [
    ['Mon_P1', 'mon_p1_1', 'DTECH'], ['Mon_P2', 'mon_p2', 'COMP'],
    ['Mon_P3', 'mon_p3', 'DTONLINE'], ['Mon_P4', 'mon_p4', 'MPROG'], ['Mon_P5', 'mon_p5', 'TECH'],
    ['Tue_P2', 'tue_p2', 'TEXT'], ['Tue_P3', 'tue_p3', 'FOOD'], ['Tue_P4', 'tue_p4', 'HOSP'],
    ['Tue_P5', 'tue_p5', 'WOOD'], ['Wed_P2', 'wed_p2', 'FURN'], ['Wed_P3', 'wed_p3', 'DVC']
  ];
  state.teacherRows[0].data = Object.fromEntries([['Teacher', 'TST'], ...entries.map(([header, , code]) => [header, code + '-X'])]);
  state.department.class_links['2026'] = entries.map(([, , code]) => ({ teacherEmail: teacher.email, code }));
  Object.keys(state.row).filter(key => /^(mon|tue|wed|thu|fri)_p/.test(key)).forEach(key => { state.row[key] = ''; });
  state.row.mon_p1_1 = 'TST-DTECH-X';
  state.row.tue_p3 = 'TST-FOOD-X';
  state.extraStudents = entries.map(([, slot, code], index) => ({
    id_number: String(300 + index), student_name: 'Student ' + code, year_level: '8', [slot]: 'TST-' + code + '-X'
  }));
  const search = values => service.run(teacher, { ...input, action: 'search', ...values });
  const setup = await service.run(teacher, { ...input, action: 'setup' });
  assert.equal(setup.disciplineGroupBrowse, true);
  assert.deepEqual(setup.departments[0].disciplineGroups.map(item => item.label),
    ['Digital Technologies', 'Textiles', 'Food & Hospitality', 'Wood & Furniture', 'Design Visual Communication']);
  const cases = [
    ['digital_technologies', ['DTECH', 'COMP', 'DTONLINE', 'MPROG', 'TECH']],
    ['textiles', ['TEXT']],
    ['food_hospitality', ['FOOD', 'HOSP']],
    ['wood_furniture', ['WOOD', 'FURN']],
    ['dvc', ['DVC']]
  ];
  for (const [group, codes] of cases) {
    const result = await search({ discipline: group });
    const selected = result.students.filter(student => student.name.startsWith('Student ')).map(student => student.name.slice(8)).sort();
    assert.deepEqual(selected, [...codes].sort());
  }
  const combined = await search({ discipline: 'digital_technologies', subject: 'FOOD', yearLevel: '8' });
  assert.deepEqual(combined.students.map(student => student.name), ['Synthetic Student']);
  assert.deepEqual(combined.students[0].subjects.map(item => item.code), ['DTECH', 'FOOD']);
  assert.deepEqual((await search({ subject: 'FOOD' })).students.map(student => student.name),
    (await search({ discipline: 'FOOD' })).students.map(student => student.name));
  assert.equal((await search({ discipline: 'wood_furniture', subject: 'DVC' })).students.length, 0);
  await assert.rejects(search({ discipline: 'unknown' }), { status: 400 });
  await assert.rejects(search({ subject: 'unknown' }), { status: 400 });
});
test('subject breakdown marks missing teacher snapshots and ambiguous linked groups as uncertain', async () => {
  const { service, input, state } = fixture();
  state.teacherRows[0].data = { Teacher: 'TST', Mon_P1: 'PIDTECH-CW', Tue_P2: '3-11FOOD-F;4-11FOOD-F' };
  state.teacherRows[1].data = { Teacher: 'PEER', Fri_P3: '11HOSP-F' };
  state.department.class_links['2026'] = [
    { teacherEmail: teacher.email, code: 'PIDTECH' },
    { teacherEmail: teacher.email, code: '3-11FOOD' },
    { teacherEmail: 'peer@example.test', code: '11HOSP' }
  ];
  Object.assign(state.row, { tue_p2: 'TST-11FOOD-F', fri_p3: 'PEER-11HOSP-F' });
  state.teacherHistory = [{ term: 4, payload: { headers: ['Teacher', 'Mon P1', 'Tue P2'],
    rows: [['TST', 'PIDTECH-CW', '3-11FOOD-F;4-11FOOD-F']] } }];
  state.studentHistory = [{ term: 4, payload: { headers: ['Student Name', 'ID Number', 'Year Level', 'Mon P1', 'Tue P2', 'Fri P3'],
    rows: [['Synthetic Student', '100', '8', 'TST-PIDTECH-CW', 'TST-11FOOD-F', 'PEER-11HOSP-F'],
      ['No Related Lessons', '201', '8', 'TST-PIDTECH-CW', '', '']] } }];
  const result = await service.run(teacher, { ...input, action: 'search', classCode: 'PIDTECH', term: 4 });
  const first = result.students.find(student => student.name === 'Synthetic Student');
  assert.deepEqual(first.subjects, [{ code: 'PIDTECH', discipline: 'DTECH' }]);
  assert.deepEqual(first.uncertainDisciplines, ['FOOD', 'HOSP']);
  assert.deepEqual(result.students.find(student => student.name === 'No Related Lessons').uncertainDisciplines, []);
  await assert.rejects(service.run(teacher, { ...input, action: 'search', classCode: 'PIDTECH', discipline: 'HOSP', term: 4 }),
    /No preserved teacher timetable.*Synthetic Peer/);
  const filtered = await service.run(teacher, { ...input, action: 'search', classCode: 'PIDTECH', discipline: 'FOOD' });
  assert.deepEqual(filtered.students, []);
  assert.equal(filtered.disciplineAmbiguous, true);
  state.studentHistory = [];
  state.row.mon_p1_1 = '';
  state.row.fri_p3 = '';
  const ambiguousOnly = await service.run(teacher, { ...input, action: 'search', discipline: 'FOOD' });
  assert.deepEqual(ambiguousOnly.students, []);
  assert.equal(ambiguousOnly.disciplineAmbiguous, true);
});
test('year-level browsing combines department, class and name filters without truncating the roll', async () => {
  const { service, input, state } = fixture();
  assert.equal((await service.run(teacher, { ...input, action: 'setup' })).yearLevelBrowse, true);
  state.department.class_links['2026'].push({ teacherEmail: teacher.email, code: 'MATH' });
  state.extraStudents = [
    { id_number: '201', student_name: 'Senior Math', year_level: '9', tue_p2: 'TST-MATH-A' },
    { id_number: '202', student_name: 'Senior Peer', year_level: '9', fri_p3: 'PEER-PIDTECH-05' },
    ...Array.from({ length: 55 }, (_, i) => ({ id_number: String(300 + i), student_name: 'Senior Coding ' + i,
      year_level: '9', mon_p1_1: 'TST-PIDTECH-CW' }))
  ];
  const search = values => service.run(teacher, { ...input, action: 'search', ...values });
  const yearNine = await search({ yearLevel: '9' });
  assert.equal(yearNine.students.length, 57);
  assert.equal(yearNine.truncated, false);
  assert.ok(yearNine.students.some(student => student.name === 'Senior Peer'));
  assert.deepEqual((await search({ yearLevel: '8' })).students.map(student => student.name), ['Synthetic Student']);
  const combined = await search({ yearLevel: '9', classCode: 'PIDTECH' });
  assert.equal(combined.students.length, 56);
  assert.ok(!combined.students.some(student => student.name === 'Senior Math'));
  assert.deepEqual((await search({ yearLevel: '9', classCode: 'PIDTECH', q: 'Peer' })).students.map(student => student.name), ['Senior Peer']);
  assert.deepEqual((await search({ yearLevel: '9', q: 'Math' })).students.map(student => student.name), ['Senior Math']);
  assert.equal((await search({ yearLevel: '13' })).students.length, 0);
  for (const yearLevel of ['6', '14', '09', 9, null]) {
    await assert.rejects(search({ yearLevel }), { status: 400 });
  }
  await assert.rejects(search({ yearLevel: '9', classCode: 'UNLINKED' }), { status: 400 });
  await assert.rejects(search({ yearLevel: '9', departmentId: '00000000-0000-4000-8000-000000000000' }), { status: 403 });
});
test('term browsing uses preserved student and relevant teacher timetables without guessing', async () => {
  const { service, input, state } = fixture();
  const search = values => service.run(teacher, { ...input, action: 'search', ...values });
  assert.equal((await service.run(teacher, { ...input, action: 'setup' })).termBrowse, true);
  state.extraStudents = [{ id_number: '201', student_name: 'Current Only', year_level: '8', mon_p1_1: 'TST-PIDTECH-CW' }];
  assert.ok((await search({ yearLevel: '8' })).students.some(student => student.name === 'Current Only'));
  await assert.rejects(search({ term: 1 }), /No preserved student timetable for Term 1/);
  await assert.rejects(search({ term: 4 }), /No preserved teacher timetable for Term 4/);
  state.teacherHistory = [{ term: 4, payload: { headers: ['Teacher', 'Mon P1', 'Fri P3'],
    rows: [['TST', 'PIDTECH-CW', ''], ['PEER', '', 'PIDTECH-05']] } }];
  const term = await search({ term: 4 });
  assert.deepEqual(term.students.map(student => student.name), ['Synthetic Student']);
  assert.equal(term.truncated, false);
  assert.equal((await search({ term: 4, classCode: 'PIDTECH', yearLevel: '8', q: 'Student' })).students.length, 1);
  assert.equal((await search({ term: 4, classCode: 'PIDTECH', yearLevel: '9' })).students.length, 0);
  assert.equal((await search({ term: 4, q: 'Current' })).students.length, 0);
  state.teacherHistory[0].payload.rows.pop();
  await assert.rejects(search({ term: 4, classCode: 'PIDTECH' }), /No preserved teacher timetable.*Synthetic Peer/);
  state.studentHistory = [{ term: 4, payload: {
    headers: ['Student Name', 'ID Number', 'Year Level', 'Mon P1', 'Fri P3'],
    rows: [['Synthetic Student', '100', '8', 'TST-PIDTECH-CW', '']]
  } }];
  assert.deepEqual((await search({ term: 4, classCode: 'PIDTECH' })).students.map(student => student.name), ['Synthetic Student']);
  state.studentHistory[0].payload.rows[0][4] = 'PEER-MATH-05';
  assert.equal((await search({ term: 4 })).students.length, 1, 'a teacher in an unrelated subject does not block the search');
  state.studentHistory[0].payload.rows[0][4] = 'PEER-PIDTECH-05';
  await assert.rejects(search({ term: 4 }), /No preserved teacher timetable.*Synthetic Peer/);
  state.studentHistory[0].payload.rows[0][4] = 'PIDTECH';
  await assert.rejects(search({ term: 4 }), /No preserved teacher timetable.*Synthetic Peer/);
  state.studentHistory[0].payload.rows[0][4] = 'PEER-PIDTECH-05';
  state.department.class_links['2026'][1].code = '2-12COMP';
  assert.equal((await search({ term: 4, classCode: 'PIDTECH' })).students.length, 1);
  await assert.rejects(search({ term: 4 }), /Some linked classes are unavailable/);
  state.department.class_links['2026'] = [{ teacherEmail: teacher.email, code: 'PIDTECH' }];
  assert.equal((await search({ term: 4, classCode: 'PIDTECH' })).students.length, 1);
  state.studentHistory = null;
  state.hasSnapshot = false;
  await assert.rejects(search({ term: 4 }), /No preserved student timetable for Term 4/);
  for (const invalid of [0, 5, '4', null, 2.5]) {
    await assert.rejects(search({ term: invalid }), { status: 400 });
  }
});
test('same-subject classes remain separate by teacher and scheduled group; unlinked marks and owners stay private', async () => {
  const { service, input, state } = fixture();
  state.hasSnapshot = false;
  state.teacherRows[0].data = { Teacher: 'TST', Mon_P1: '3-PIDTECH-CW', Tue_P2: '4-PIDTECH-CW' };
  state.row.tue_p2 = 'TST-PIDTECH-CW';
  state.department.class_links['2026'] = [{ teacherEmail: teacher.email, code: '3-PIDTECH' }];
  const profile = await service.run(teacher, { ...input, action: 'profile' });
  const lessons = profile.timetables[0].lessons;
  assert.equal(lessons.find(lesson => lesson.slot === 'mon_p1_1').linked, true);
  assert.equal(lessons.find(lesson => lesson.slot === 'tue_p2').linked, false);
  assert.equal(lessons.find(lesson => lesson.slot === 'fri_p3').linked, false);
  assert.deepEqual((await service.run(teacher, { ...input, action: 'attendance', term: 4 })).marks.map(mark => mark.mark), ['P']);
  assert.equal((await service.run(teacher, { ...input, action: 'reports' })).reports.length, 1);
  assert.deepEqual(state.plannerCalls.find(call => call.sql.includes('planner_sections')).params[0], [teacherId]);
  await service.run({ ...teacher, roles: ['ADMIN'] }, { ...input, action: 'save-classes',
    department: { id: departmentId, name: 'Technology', revision: 1, classLinks: [{ teacherEmail: teacher.email, code: '4-PIDTECH' }] } });
  assert.deepEqual((await service.run(teacher, { ...input, action: 'attendance', term: 4 })).marks.map(mark => mark.mark), ['A']);
});
test('mixed senior lines include Years 11-13 DTECH and COMP in their selected teaching line', async () => {
  const { service, input, state } = fixture();
  state.teacherRows[0].data = { Teacher: 'TST', Mon_P1: '3-11DTECH-CW;3-12COMP-CW', Fri_P3: '4-11COMP-CW' };
  state.department.class_links['2026'] = [
    { teacherEmail: teacher.email, code: '3-11DTECH' },
    { teacherEmail: teacher.email, code: '4-11COMP' }
  ];
  Object.assign(state.row, { year_level: '13', mon_p1_1: 'TST-13DTECH-CW', fri_p3: '', tue_p2: '' });
  state.extraStudents = [
    { id_number: '201', student_name: 'Senior Computing', year_level: '12', mon_p1_1: 'TST-12COMP-CW' },
    { id_number: '202', student_name: 'Senior Other Line', year_level: '13', fri_p3: 'TST-13DTECH-CW' },
    { id_number: '203', student_name: 'Wrong Group', year_level: '13', mon_p1_1: 'TST-4-13DTECH-CW' },
    { id_number: '204', student_name: 'Wrong Subject', year_level: '13', mon_p1_1: 'TST-13FOOD-CW' },
    { id_number: '205', student_name: 'Wrong Teacher', year_level: '13', mon_p1_1: 'PEER-13DTECH-CW' },
    { id_number: '206', student_name: 'Wrong Period', year_level: '13', tue_p2: 'TST-13DTECH-CW' }
  ];
  state.studentHistory = [{ term: 4, payload: {
    headers: ['Student Name', 'ID Number', 'Year Level', 'Mon P1', 'Fri P3'],
    rows: [
      ['Synthetic Student', '100', '13', 'TST-13DTECH-CW', ''],
      ['Senior Computing', '201', '12', 'TST-12COMP-CW', ''],
      ['Senior Other Line', '202', '13', '', 'TST-13DTECH-CW']
    ]
  } }];
  state.teacherHistory = [{ term: 4, payload: { headers: ['Teacher', 'Mon P1', 'Fri P3'],
    rows: [['TST', '3-11DTECH-CW;3-12COMP-CW', '4-11COMP-CW']] } }];
  const search = values => service.run(teacher, { ...input, action: 'search', ...values });
  assert.deepEqual((await search({ yearLevel: '13' })).students.map(student => student.name),
    ['Senior Other Line', 'Synthetic Student']);
  assert.deepEqual((await search({ classCode: '3-11DTECH' })).students.map(student => student.name),
    ['Senior Computing', 'Synthetic Student']);
  assert.deepEqual((await search({ classCode: '3-11DTECH' })).students[0].subjects,
    [{ code: '12COMP', discipline: 'COMP' }]);
  assert.deepEqual((await search({ classCode: '3-11DTECH', discipline: 'COMP' })).students.map(student => student.name),
    ['Senior Computing']);
  assert.deepEqual((await search({ classCode: '3-11DTECH', subject: 'COMP', discipline: 'digital_technologies' }))
    .students.map(student => student.name), ['Senior Computing']);
  assert.deepEqual((await search({ classCode: '4-11COMP', term: 4 })).students.map(student => student.name),
    ['Senior Other Line']);
  assert.deepEqual((await search({ classCode: '3-11DTECH', yearLevel: '13', term: 4 })).students.map(student => student.name),
    ['Synthetic Student']);
  assert.equal((await service.run(teacher, { ...input, action: 'profile' })).timetables[0].lessons[0].linked, true);
  assert.deepEqual((await service.run(teacher, { ...input, action: 'attendance', term: 4 })).marks.map(mark => mark.mark), ['P']);
  state.department.name = 'Science';
  assert.equal((await search({ yearLevel: '13' })).students.length, 0);
});
test('mixed senior lines do not guess between co-timetabled groups or expose unselected lines', async () => {
  const { service, input, state } = fixture();
  state.hasSnapshot = false;
  state.teacherRows[0].data = { Teacher: 'TST', Mon_P1: '3-11DTECH-CW;4-12COMP-CW' };
  state.department.class_links['2026'] = [{ teacherEmail: teacher.email, code: '3-11DTECH' }];
  Object.assign(state.row, { year_level: '13', mon_p1_1: 'TST-13DTECH-CW', fri_p3: '', tue_p2: '' });
  const search = values => service.run(teacher, { ...input, action: 'search', ...values });
  let result = await search({ yearLevel: '13' });
  assert.equal(result.students.length, 0);
  assert.equal(result.ambiguous, true);
  result = await search({ classCode: '3-11DTECH' });
  assert.equal(result.students.length, 0);
  assert.equal(result.ambiguous, true);
  state.department.class_links['2026'].push({ teacherEmail: teacher.email, code: '4-13COMP' });
  assert.equal((await search({ yearLevel: '13' })).students.length, 0, 'unavailable links do not approve another line');
  state.teacherHistory = [{ term: 3, payload: { headers: ['Teacher', 'Mon P1'],
    rows: [['TST', '4-13COMP-CW']] } }];
  assert.equal((await search({ yearLevel: '13' })).students.length, 0, 'another term does not approve the current line');
  state.teacherHistory = [];
  state.department.class_links['2026'].pop();
  state.teacherRows[0].data.Mon_P1 = '3-11DTECH-CW;JSR-SRDTECH-CW';
  assert.equal((await search({ yearLevel: '13' })).students.length, 0, 'a concurrent senior line remains ambiguous');
  state.teacherRows[0].data.Mon_P1 = '3-11DTECH-CW;4-12COMP-CW';
  state.row.mon_p1_1 = 'TST-3-13DTECH-CW';
  assert.equal((await search({ classCode: '3-11DTECH' })).students.length, 1);
  state.row.mon_p1_1 = 'TST-4-13DTECH-CW';
  assert.equal((await search({ classCode: '3-11DTECH' })).students.length, 0);
  state.row.mon_p1_1 = 'TST-13DTECH-CW';
  state.department.class_links['2026'].push({ teacherEmail: teacher.email, code: '4-12COMP' });
  assert.equal((await search({ yearLevel: '13' })).students.length, 1);
  const profile = await service.run(teacher, { ...input, action: 'profile' });
  assert.deepEqual(profile.subjectClasses.map(item => item.classCode), ['Class group not distinguishable']);
  assert.match(profile.subjectClassesWarnings.join(' '), /current timetable/);
  result = await search({ classCode: '3-11DTECH' });
  assert.equal(result.students.length, 0);
  assert.equal(result.ambiguous, true);
});
test('saving teacher approvals prunes removed teachers across years without automatically linking their classes', async () => {
  const { service, input, state } = fixture();
  state.department.class_links['2025'] = [{ teacherEmail: teacher.email, code: 'PIDTECH' }];
  await service.run({ ...teacher, roles: ['ADMIN'] }, { ...input, action: 'save-setup',
    department: { id: departmentId, name: 'Technology', revision: 1, teacherEmails: [] } });
  assert.deepEqual(state.department.class_links, {
    '2025': [], '2026': [{ teacherEmail: 'peer@example.test', code: 'PIDTECH' }]
  });
  state.teacherRows[1].data = { Teacher: 'PEER', Fri_P3: '11HOSP-F' };
  const setup = await service.run({ ...teacher, roles: ['ADMIN'] }, { ...input, action: 'setup' });
  assert.equal(setup.departments[0].unavailableClassCount, 1);
  assert.deepEqual(setup.departments[0].classLinks, []);
});
test('preserved teacher class periods match their own term, including the current term without a current teacher row', async () => {
  const { service, input, state } = fixture();
  state.teacherRows = [];
  state.teacherHistory = [{ term: 4, payload: { headers: ['Teacher', 'Mon P1'], rows: [['TST', 'PIDTECH-CW']] } }];
  const profile = await service.run(teacher, { ...input, action: 'profile' });
  assert.equal(profile.timetables.find(table => table.term === null).lessons.some(lesson => lesson.linked), false);
  assert.equal(profile.timetables.find(table => table.term === 4).lessons.some(lesson => lesson.linked), true);
  assert.deepEqual((await service.run(teacher, { ...input, action: 'attendance', term: 4 })).marks.map(mark => mark.mark), ['P']);
});
test('co-timetabled same-subject groups cannot expose unselected groups when student exports omit the group identifier', async () => {
  const { service, input, state } = fixture();
  state.hasSnapshot = false;
  state.teacherRows[0].data = { Teacher: 'TST', Mon_P1: '3-PIDTECH-CW;4-PIDTECH-CW' };
  state.department.class_links['2026'] = [{ teacherEmail: teacher.email, code: '3-PIDTECH' }];
  const admin = { ...teacher, roles: ['ADMIN'] };
  assert.equal((await service.run(admin, { ...input, action: 'setup' })).departments[0].ambiguousClassCount, 1);
  assert.equal((await service.run(teacher, { ...input, action: 'search', q: 'Student' })).students.length, 0);
  state.row.mon_p1_1 = 'TST-3-PIDTECH-CW';
  assert.equal((await service.run(teacher, { ...input, action: 'search', q: 'Student' })).students.length, 1);
  assert.equal((await service.run(teacher, { ...input, action: 'search', classCode: '3-PIDTECH' })).students.length, 1);
  await assert.rejects(service.run(teacher, { ...input, action: 'search', classCode: '4-PIDTECH' }), { status: 400 });
  state.row.mon_p1_1 = 'TST-PIDTECH-CW';
  let classSearch = await service.run(teacher, { ...input, action: 'search', classCode: '3-PIDTECH' });
  assert.equal(classSearch.students.length, 0);
  assert.equal(classSearch.ambiguous, true);
  state.department.class_links['2026'].push({ teacherEmail: teacher.email, code: '4-PIDTECH' });
  assert.equal((await service.run(teacher, { ...input, action: 'search', q: 'Student' })).students.length, 1);
  classSearch = await service.run(teacher, { ...input, action: 'search', classCode: '3-PIDTECH' });
  assert.equal(classSearch.students.length, 0);
  assert.equal(classSearch.ambiguous, true);
  state.row.mon_p1_1 = 'TST-4-PIDTECH-CW';
  assert.equal((await service.run(teacher, { ...input, action: 'search', classCode: '3-PIDTECH' })).students.length, 0);
  assert.equal((await service.run(teacher, { ...input, action: 'search', classCode: '4-PIDTECH' })).students.length, 1);
});
test('Tracker bridge requires a live grant for the registered Tracker client before any data access', async t => {
  let calls = 0, allowed = true;
  const app = express(); app.use(express.json());
  app.use('/module-auth', createModuleIdentityRouter({
    dbQuery: async sql => {
      if (sql.includes('FROM module_builder_projects')) return { rows: [{ id: 'project', slug: 'whs-techstudent-tracker',
        kind: 'development', app_url: 'https://tracker.example.test' }] };
      if (sql.includes('FROM module_identity_grants')) return { rows: allowed ? [{ user_id: teacherId }] : [] };
      if (sql.includes('FROM users u')) return { rows: [teacher] };
      throw new Error('Unexpected query');
    },
    trackerService: { run: async () => { calls++; return { students: [] }; } }
  }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const post = (client, token) => fetch(`http://127.0.0.1:${server.address().port}/module-auth/student-tracker`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: JSON.stringify({ client_id: client, action: 'search', year: 2026 })
  });
  assert.equal((await post('whs-techstudent-tracker:development')).status, 401);
  assert.equal(calls, 0);
  assert.equal((await post('teacher-planner:development', 'A'.repeat(43))).status, 403);
  assert.equal(calls, 0);
  const response = await post('whs-techstudent-tracker:development', 'A'.repeat(43));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  allowed = false;
  assert.equal((await post('whs-techstudent-tracker:development', 'A'.repeat(43))).status, 401);
  assert.equal(calls, 1);
});
