const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { once } = require('node:events');
const { createAdminAttendanceRouter, timetableEntries } = require('./adminAttendance');

const adminId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const otherAdminId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const teacherId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const groupId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

async function serve(t, options) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const userId = req.get('x-user-id');
    if (userId) req.user = { id: userId, roles: req.get('x-admin') === 'true' ? ['ADMIN'] : [] };
    next();
  });
  app.use('/attendance-admin', createAdminAttendanceRouter(options));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve, reject) =>
    server.close(error => error ? reject(error) : resolve())));
  return 'http://127.0.0.1:' + server.address().port + '/attendance-admin';
}

function headers(userId = adminId, admin = true) {
  return { 'x-user-id': userId, 'x-admin': String(admin) };
}

test('admin attendance timetable entries map KAMAR slots to period/day keys', () => {
  assert.deepEqual(timetableEntries({ classes: [
    { code: '10ENG', slots: ['mon_p1_1', 'wed_p3', 'fri_p5', 'mon_whanau'] },
    { code: '11SCI', slots: ['mon_p1_2'] }
  ] }), {
    'p1:0': [{ title: '10ENG' }, { title: '11SCI' }],
    'p3:2': [{ title: '10ENG' }],
    'p5:4': [{ title: '10ENG' }]
  });
});

test('admin attendance API enforces ADMIN access and returns settings without student marks', async t => {
  const url = await serve(t, {
    query: async sql => sql.includes('planner_attendance_admin_sync')
      ? { rows: [{ folder_id: 'synthetic_folder_123', enabled: true, processed: {}, revision: 1 }] }
      : { rows: [] },
    loadTeachers: async () => [{ id: teacherId, name: 'Selected Teacher', staffCode: 'T01' }],
    authorizeTarget: async () => null,
    loadClasses: async () => ({ classes: [] }),
    loadSchoolCalendar: async () => ({ terms: [], publicHolidays: [] }),
    driveService: { listFiles: async () => ({ files: [] }), readFile: async () => ({}) },
    driveStatus: async () => ({ connected: true, driveAccess: true, email: 'admin@example.test' })
  });
  const denied = await fetch(url + '/teachers', { headers: headers(adminId, false) });
  assert.equal(denied.status, 403);
  const response = await fetch(url + '/settings/2026', { headers: headers() });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const settings = await response.json();
  assert.deepEqual(settings, {
    folderId: 'synthetic_folder_123', enabled: true, connected: true,
    driveAccess: true, googleEmail: 'admin@example.test'
  });
  assert.equal(JSON.stringify(settings).includes('mark'), false);
});

test('admin sync writes to the selected teacher and exposes file summaries, not marks', async t => {
  const dbGroup = {
    id: groupId, name: '10ENG', classes: ['10ENG'],
    students: [{ id: 'k:100', name: 'Private Student' }],
    periods: ['p1', 'p2', 'p3', 'p4', 'p5'], scheduleMode: 'auto'
  };
  let classOwner, driveOwner, authorizedOwner;
  const fileVersion = 'synthetic_file_123:2000-01-03:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const pdf = { weeks: ['2000-01-03'], rows: [{
    name: 'Private Student',
    days: [{ date: '2000-01-03', slots: ['', 'P', '', '', '', '', '', ''] }]
  }] };
  const url = await serve(t, {
    query: async (sql, params) => {
      if (sql.startsWith('SELECT folder_id,enabled,processed,revision')) {
        return { rows: [{ folder_id: 'synthetic_folder_123', enabled: true, processed: {}, revision: 1 }] };
      }
      if (sql.startsWith('UPDATE planner_attendance_admin_sync')) return { rows: [{ revision: 2 }] };
      if (sql.includes('school_planner_settings')) {
        return { rows: [{ content: { term1Start: '2000-01-03', term1End: '2000-01-07' } }] };
      }
      if (sql.includes('SELECT student_id,student_name')) return { rows: [] };
      if (sql.includes('WITH input AS')) return { rows: [{ saved: 1 }] };
      if (sql.startsWith('UPDATE planner_attendance_groups')) return { rows: [{ revision: 1 }] };
      if (sql.includes('SELECT content FROM planner_attendance_groups') ||
          sql.includes('SELECT content,revision FROM planner_attendance_groups')) {
        assert.equal(params[0], teacherId);
        return { rows: [{ content: { groups: [dbGroup] }, revision: 1 }] };
      }
      throw new Error('Unexpected query in admin attendance test.');
    },
    loadTeachers: async () => [{ id: teacherId, name: 'Selected Teacher', staffCode: 'T01' }],
    authorizeTarget: async id => { authorizedOwner = id; return { id }; },
    loadClasses: async req => {
      classOwner = req.user.id;
      return { staffCode: 'T01', classes: [{
        code: '10ENG', slots: ['mon_p1_1'],
        students: [{ id: 'k:100', name: 'Private Student' }]
      }] };
    },
    loadSchoolCalendar: async () => ({ terms: [], publicHolidays: [] }),
    driveService: {
      listFiles: async req => {
        driveOwner = req.user.id;
        return { files: [{ id: 'synthetic_file_123', name: 'attendance.pdf', version: fileVersion }],
          connectionId: 'synthetic-connection', accountId: 'synthetic-google' };
      },
      readFile: async req => {
        assert.equal(req.user.id, adminId);
        return { pdf, version: fileVersion, accountId: 'synthetic-google',
          connectionId: 'synthetic-connection' };
      }
    },
    driveStatus: async () => ({ connected: true, driveAccess: true, email: 'admin@example.test' })
  });
  const started = await fetch(url + '/sync', {
    method: 'POST', headers: { ...headers(), 'content-type': 'application/json' },
    body: JSON.stringify({ year: 2000, teacherId })
  });
  assert.equal(started.status, 202);
  const { jobId } = await started.json();
  let result;
  for (let attempt = 0; attempt < 50; attempt++) {
    const response = await fetch(url + '/jobs/' + jobId, { headers: headers() });
    result = await response.json();
    if (result.status !== 'running') break;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.equal(result.status, 'complete', result.error || result.progress);
  assert.equal(authorizedOwner, teacherId);
  assert.equal(classOwner, teacherId);
  assert.equal(driveOwner, adminId);
  assert.deepEqual(result.summary, {
    files: 1, marksFilled: 1, conflictsKept: 0, matchWarnings: 0, unchanged: 0, errors: 0,
    documents: [{ name: 'attendance.pdf', status: 'synced', marks: 1, conflicts: 0, warnings: 0 }]
  });
  assert.doesNotMatch(JSON.stringify(result), /Private Student|k:100|"mark"|"P"/);
  const hidden = await fetch(url + '/jobs/' + jobId, { headers: headers(otherAdminId) });
  assert.equal(hidden.status, 404);
});

test('admin PDF preview and apply are scoped to one teacher and never return individual marks', async t => {
  const dbGroup = {
    id: groupId, name: '10ENG', classes: ['10ENG'],
    students: [{ id: 'k:100', name: 'Private Student' }],
    periods: ['p1', 'p2', 'p3', 'p4', 'p5'], scheduleMode: 'auto'
  };
  const pdf = { weeks: ['2026-11-09'], rows: [{
    name: 'Private Student',
    days: [{ date: '2026-11-09', slots: ['', 'P', '', '', '', '', '', ''] }]
  }] };
  let authorizedOwner, classOwner, savedOwner;
  const url = await serve(t, {
    query: async (sql, params) => {
      if (sql.includes('school_planner_settings')) {
        return { rows: [{ content: { term4Start: '2026-10-12', term4End: '2026-12-11' } }] };
      }
      if (sql.includes('SELECT content,revision FROM planner_attendance_groups')) {
        assert.equal(params[0], teacherId);
        return { rows: [{ content: { groups: [dbGroup] }, revision: 1 }] };
      }
      if (sql.includes('SELECT student_id,student_name')) {
        assert.equal(params[0], teacherId);
        return { rows: [] };
      }
      if (sql.includes('WITH input AS')) {
        savedOwner = params[0];
        return { rows: [{ saved: JSON.parse(params[2]).length }] };
      }
      if (sql.includes('SELECT content FROM planner_attendance_groups')) {
        assert.equal(params[0], teacherId);
        return { rows: [{ content: { groups: [dbGroup] } }] };
      }
      if (sql.includes("SET content=jsonb_set(content,'{imports}'")) {
        assert.equal(params[0], teacherId);
        return { rows: [{ revision: 1 }] };
      }
      throw new Error('Unexpected query in admin PDF import test.');
    },
    loadTeachers: async () => [{ id: teacherId, name: 'Selected Teacher', staffCode: 'T01' }],
    authorizeTarget: async id => { authorizedOwner = id; return { id }; },
    loadClasses: async req => {
      classOwner = req.user.id;
      return { staffCode: 'T01', classes: [{
        code: '10ENG', slots: ['mon_p1_1'],
        students: [{ id: 'k:100', name: 'Private Student' }]
      }] };
    },
    loadSchoolCalendar: async () => ({ terms: [], publicHolidays: [] }),
    driveService: { listFiles: async () => ({ files: [] }), readFile: async () => ({}) },
    driveStatus: async () => ({ connected: false, driveAccess: false }),
    parsePdf: async buffer => {
      assert.deepEqual(buffer, Buffer.from('PDF'));
      return pdf;
    },
    today: () => '2026-11-12'
  });
  const denied = await fetch(url + '/pdf-preview/2026/' + teacherId, {
    method: 'POST', headers: { ...headers(adminId, false), 'content-type': 'application/pdf' }, body: 'PDF'
  });
  assert.equal(denied.status, 403);
  const response = await fetch(url + '/pdf-preview/2026/' + teacherId, {
    method: 'POST', headers: { ...headers(), 'content-type': 'application/pdf' }, body: 'PDF'
  });
  assert.equal(response.status, 200);
  const preview = await response.json();
  assert.deepEqual({
    teacherName: preview.teacherName, year: preview.year, weeks: preview.weeks,
    marksToFill: preview.marksToFill, conflictsKept: preview.conflictsKept,
    unchanged: preview.unchanged, matchWarnings: preview.matchWarnings,
    hasImportStatus: preview.hasImportStatus
  }, {
    teacherName: 'Selected Teacher', year: 2026, weeks: ['2026-11-09'],
    marksToFill: 1, conflictsKept: 0, unchanged: 0, matchWarnings: 0,
    hasImportStatus: true
  });
  assert.doesNotMatch(JSON.stringify(preview), /Private Student|k:100|"mark"|"P"/);
  assert.equal(authorizedOwner, teacherId);
  assert.equal(classOwner, teacherId);

  const hidden = await fetch(url + '/pdf-apply', {
    method: 'POST', headers: { ...headers(otherAdminId), 'content-type': 'application/json' },
    body: JSON.stringify({ previewId: preview.previewId })
  });
  assert.equal(hidden.status, 404);
  const applied = await fetch(url + '/pdf-apply', {
    method: 'POST', headers: { ...headers(), 'content-type': 'application/json' },
    body: JSON.stringify({ previewId: preview.previewId })
  });
  assert.equal(applied.status, 200);
  assert.deepEqual(await applied.json(), {
    marksFilled: 1, conflictsKept: 0, matchWarnings: 0, unchanged: 0,
    teacherName: 'Selected Teacher', year: 2026
  });
  assert.equal(savedOwner, teacherId);
  const replay = await fetch(url + '/pdf-apply', {
    method: 'POST', headers: { ...headers(), 'content-type': 'application/json' },
    body: JSON.stringify({ previewId: preview.previewId })
  });
  assert.equal(replay.status, 404);
});
