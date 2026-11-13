const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createStudentTrackerService, termRows, matchingCourses } = require('../src/studentTracker');
const { userHasHubPermission } = require('../src/hubRoles');
const { createModuleIdentityRouter, authorisedModuleUser } = require('../src/moduleIdentity');
const { accessibleModules } = require('../src/moduleAccess');

const departmentId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const managerId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const teacherId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const peerId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const teacher = { id: teacherId, email: 'teacher@example.test', roles: ['Teacher'] };
function fixture() {
  const department = { id: departmentId, name: 'Technology', subjects: ['PIDTECH'], teacher_emails: [teacher.email], manager_ids: [managerId], revision: 1 };
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
  const state = { department, row, catalog, plannerCalls: [], writes: [], failPlanner: false, conflict: false, hasSnapshot: true,
    failDirectory: false, staff, accounts, teacherRows: [
      { teacher: 'TST', data: { Teacher: 'TST', Mon_P1: 'PIDTECH-CW', Tue_P2: 'MATH-A' } },
      { teacher: 'PEER', data: { Teacher: 'PEER', Fri_P3: 'PIDTECH-05' } }
    ], teacherHistory: [], teacherYear: 2026, historyYear: 2026, courses: [{ course_code: 'PIDTECH', subject_code: 'DTECH' }] };
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
        state.writes.push(params); return { rows: state.conflict ? [] : [{ id: departmentId }] };
      }
      throw new Error('Unexpected Core query: ' + sql);
    },
    directoryQuery: async (sql, params) => {
      assert.doesNotMatch(sql, /planner_sections|planner_attendance_marks|FROM users/);
      if (sql.includes('FROM student_upload')) return { rows: [row,
        { id_number: '200', student_name: 'Unlinked Student', year_level: '8', mon_p1_1: 'OTHER-MATH-A' }] };
      if (sql.includes('FROM staff_upload')) return { rows: staff };
      if (sql.includes('FROM timetable_upload')) {
        assert.match(sql, /upload_year=\$1/);
        return { rows: params[0] === state.teacherYear ? state.teacherRows : [] };
      }
      if (sql.includes("dataset_type='teacher_timetable'")) {
        assert.match(sql, /school_year=\$1/);
        return { rows: params[0] === state.historyYear ? state.teacherHistory : [] };
      }
      if (sql.includes('FROM kamar_datasets')) return { rows: state.hasSnapshot ? [{ term: 4, payload: {
        headers: ['Student Name', 'ID Number', 'Year Level', 'Mon P1', 'Mon P1', 'Fri P3', 'Tue P2'],
        rows: [['Synthetic Student', '100', '8', 'TST-PIDTECH-CW', '', 'PEER-PIDTECH-05', 'OTHER-MATH-A']]
      } }] : [] };
      throw new Error('Unexpected KAMAR query: ' + sql);
    },
    plannerQuery: async (sql, params) => {
      state.plannerCalls.push({ sql, params });
      if (state.failPlanner) throw new Error('Planner unavailable');
      assert.doesNotMatch(sql, /INSERT|UPDATE|DELETE|student_upload/);
      if (sql.includes('school_planner_settings')) return { rows: [{ content: {
        term1Start: '2026-01-29', term1End: '2026-04-02', term4Start: '2026-10-12', term4End: '2026-12-18'
      } }] };
      if (sql.includes('planner_sections')) return { rows: [
        { owner_id: teacherId, content: { records: JSON.stringify([report, { ...report, studentId: 'k:200' }]) }, updated_at: '2026-11-12' },
        { owner_id: peerId, content: { records: JSON.stringify([report]) }, updated_at: '2026-11-11' }
      ].filter(row => params[0].includes(row.owner_id)) };
      if (sql.includes('planner_attendance_marks')) return { rows: [
        { owner_id: teacherId, date: '2026-11-09', period: 'p1', mark: 'P' },
        { owner_id: peerId, date: '2026-11-13', period: 'p3', mark: 'L' },
        { owner_id: teacherId, date: '2026-11-10', period: 'p2', mark: 'A' }
      ].filter(row => params[0].includes(row.owner_id)) };
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
    department: { ...changes, subjects: ['FAKE'] } }), /matched automatically/);
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
  await service.run(manager, { ...input, action: 'save-setup', department: { ...department, subjects: [], teacherEmails: department.teacher_emails } });
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
  state.teacherRows[0].data = { Teacher: 'TST', Mon_P1: 'JPI-05', Tue_P2: '11DTECH1-CW', Wed_P3: 'MATH-JPI' };
  state.teacherHistory = [{ term: 3, payload: { headers: ['Teacher', 'Mon P1', 'Mon P1'],
    rows: [['TST', 'TST/PEER-9DTECH-CW', '11HOSP-K1']] } }];
  const manager = { ...teacher, id: peerId, email: 'peer@example.test' };
  const setup = await service.run(manager, { ...input, action: 'setup' });
  const source = setup.staff.find(person => person.code === 'TST');
  assert.deepEqual(source.links.map(link => link.code), ['11DTECH1', '11HOSP', '9DTECH', 'JPI']);
  assert.deepEqual(source.links.find(link => link.code === '9DTECH').courses, ['MDTECH-S1', 'MDTECH-S2']);
  assert.deepEqual(source.unmatchedCodes, ['MATH']);
  assert.equal(matchingCourses('11DTECHNOLOGY', state.courses).length, 0);
  assert.deepEqual(matchingCourses('7DTECH1', state.courses).map(course => course.course_code), ['JDTECH']);
  state.row.mon_p1_1 = 'TST-JPI-05'; state.hasSnapshot = false;
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
