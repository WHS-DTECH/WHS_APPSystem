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
  const state = { department, row, plannerCalls: [], writes: [], failPlanner: false, conflict: false, hasSnapshot: true };
  const service = createStudentTrackerService({
    today: () => '2026-11-13',
    dbQuery: async (sql, params) => {
      assert.doesNotMatch(sql, /student_upload|planner_sections|planner_attendance_marks/);
      if (sql.startsWith('SELECT * FROM student_tracker_departments')) return { rows: params[0] === departmentId ? [department] : [] };
      if (sql.includes('FROM student_tracker_departments')) return { rows: [department] };
      if (sql.startsWith('SELECT id FROM users')) return { rows: params[0]
        .filter(id => [managerId, teacherId, peerId].includes(id)).map(id => ({ id })) };
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
      if (sql.includes('FROM staff_upload')) return { rows: [
        { code: 'TST', email: 'teacher@example.test' }, { code: 'PEER', email: 'peer@example.test' }
      ] };
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
test('only assigned HoLAs may edit departments and they cannot change their own authority', async () => {
  const { service, input, department, state } = fixture();
  const changes = { ...department, name: 'Tech', managerIds: [teacherId] };
  await assert.rejects(service.run(teacher, { ...input, action: 'save-setup', department: changes }), { status: 403 });
  const manager = { ...teacher, id: managerId };
  const setup = await service.run(manager, { ...input, action: 'setup' });
  assert.equal(setup.departments[0].canManage, true);
  assert.equal(setup.departments[0].managerIds, undefined);
  await service.run(manager, { ...input, action: 'save-setup', department: changes });
  assert.deepEqual(state.writes[0][3], [managerId], 'only ADMIN can change HoLA authority');
  state.conflict = true;
  await assert.rejects(service.run(manager, { ...input, action: 'save-setup', department: changes }), { status: 409 });
  await assert.rejects(service.run(manager, { ...input, action: 'save-setup',
    department: { ...changes, subjects: ['FAKE'] } }), /uploaded KAMAR/);
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
test('ADMIN authorises active managers but a stale department id never creates a replacement', async () => {
  const { service, input, department, state } = fixture();
  const admin = { ...teacher, roles: ['ADMIN'] };
  const changes = { ...department, managerIds: [teacherId] };
  await service.run(admin, { ...input, action: 'save-setup', department: changes });
  assert.deepEqual(state.writes[0][3], [teacherId]);
  await assert.rejects(service.run(admin, { ...input, action: 'save-setup',
    department: { ...changes, id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' } }), { status: 404 });
  await assert.rejects(service.run(admin, { ...input, action: 'save-setup',
    department: { ...changes, managerIds: ['eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'] } }), /active HoLA/);
  assert.equal(state.writes.length, 1);
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
