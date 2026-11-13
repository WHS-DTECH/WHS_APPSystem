const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createStudentTrackerService, termRows } = require('../src/studentTracker');
const { createModuleIdentityRouter } = require('../src/moduleIdentity');

const departmentId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const managerId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const teacherId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const peerId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const teacher = { id: teacherId, email: 'teacher@example.test', roles: ['Teacher'] };
function fixture() {
  const department = { id: departmentId, name: 'Technology', subjects: ['PIDTECH'], manager_ids: [managerId], revision: 1 };
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
    failDirectory: false, staff, accounts };
  const service = createStudentTrackerService({
    today: () => '2026-11-13',
    dbQuery: async (sql, params) => {
      assert.doesNotMatch(sql, /student_upload|planner_sections|planner_attendance_marks/);
      if (sql.startsWith('SELECT * FROM student_tracker_departments')) return { rows: params[0] === departmentId ? [department] : [] };
      if (sql.includes('FROM student_tracker_departments')) return { rows: [department] };
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
    directoryQuery: async sql => {
      assert.doesNotMatch(sql, /planner_sections|planner_attendance_marks|FROM users/);
      if (sql.includes('FROM student_upload')) return { rows: [row,
        { id_number: '200', student_name: 'Unlinked Student', year_level: '8', mon_p1_1: 'OTHER-MATH-A' }] };
      if (sql.includes('FROM staff_upload')) return { rows: staff };
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
      ] };
      if (sql.includes('planner_attendance_marks')) return { rows: [
        { owner_id: teacherId, date: '2026-11-09', period: 'p1', mark: 'P' },
        { owner_id: peerId, date: '2026-11-13', period: 'p3', mark: 'L' },
        { owner_id: teacherId, date: '2026-11-10', period: 'p2', mark: 'A' }
      ] };
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
  const changes = { ...department, managerIds: [peerId] };
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
    department: { ...changes, subjects: ['FAKE'] } }), /uploaded KAMAR/);
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
    department: { ...department, name: 'Invented Faculty' } }), /department from Kamar Uploader/);
  department.name = 'Saved Faculty';
  await service.run(manager, { ...input, action: 'save-setup', department: { ...department } });
  assert.equal(state.writes[0][1], 'Saved Faculty');
  state.failDirectory = true;
  await assert.rejects(service.run(manager, { ...input, action: 'save-setup', department: { ...department } }),
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
  const changes = { ...department, managerIds: [peerId] };
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
      department: { ...state.department } }), { status: 403 });
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
