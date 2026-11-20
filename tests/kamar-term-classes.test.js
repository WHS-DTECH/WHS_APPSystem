const test = require('node:test');
const assert = require('node:assert/strict');
const { attendanceClasses } = require('../src/kamarDirectory');
const { buildStudentHeaderMap, mapStudentRow } = require('../src/legacy/kamar-uploader/studentTimetable');

const headers = ['Student Name', 'ID Number', 'Form Class', 'Year Level',
  'Mon P1', 'Mon P1', 'Mon P2', 'Tue P3', ''];
const payload = { headers, rows: [
  ['Synthetic Student', '100', 'W1', '8', 'TST-JDTECH-A', 'TST-JDTECH-B', 'OTHER-MATH', 'TST-JDTECH-A', ''],
  ['Other Student', '200', 'W2', '9', 'OTHER-MDTECH-A', '', '', '', '']
] };

test('ordered duplicate P1 columns remain distinct in uploader and preserved snapshots', () => {
  const mapped = mapStudentRow(payload.rows[0], buildStudentHeaderMap(headers));
  assert.equal(mapped.mon_p1_1, 'TST-JDTECH-A');
  assert.equal(mapped.mon_p1_2, 'TST-JDTECH-B');
  assert.equal(mapped.tue_p3, 'TST-JDTECH-A');
});

test('term class lists use only the latest preserved year/term student timetable for the matched teacher', async () => {
  const calls = [];
  const query = async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes('staff_upload')) return { rows: [{ code: 'TST' }] };
    assert.match(sql, /source_date DESC,source_time DESC,created_at DESC,id DESC LIMIT 1/);
    assert.deepEqual(params, [2026, 3]);
    return { rows: [{ payload }] };
  };
  const result = await attendanceClasses({ email: 'synthetic@example.test' }, 2026, query, 3);
  assert.deepEqual(result, { staffCode: 'TST', classes: [
    { code: 'TST-JDTECH-A', students: [{ id: 'k:100', name: 'Synthetic Student', yearLevel: '8', whanau: 'W1' }], slots: ['mon_p1_1', 'tue_p3'] },
    { code: 'TST-JDTECH-B', students: [{ id: 'k:100', name: 'Synthetic Student', yearLevel: '8', whanau: 'W1' }], slots: ['mon_p1_2'] }
  ] });
  assert.equal(calls.length, 2);
  assert.ok(calls.every(call => !/FROM student_upload\b/.test(call.sql)), 'Term selection never falls back to current timetable rows');
});

test('missing or malformed historical rosters fail explicitly instead of showing the current term', async () => {
  const query = async sql => sql.includes('staff_upload') ? { rows: [{ code: 'TST' }] } : { rows: [] };
  await assert.rejects(attendanceClasses({ email: 'synthetic@example.test' }, 2026, query, 3), /No preserved student timetable/);
  const malformed = async sql => sql.includes('staff_upload') ? { rows: [{ code: 'TST' }] } :
    { rows: [{ payload: { headers: ['Student Name'], rows: [['Synthetic']] } }] };
  await assert.rejects(attendanceClasses({ email: 'synthetic@example.test' }, 2026, malformed, 3), /missing required columns/);
  await assert.rejects(attendanceClasses({ email: 'synthetic@example.test' }, 2026, query, 5), /valid attendance term/);
});

test('Junior audit uses Timetable Class, with 7S, 8S and unassigned students kept', async () => {
  const query = async sql => sql.includes('staff_upload') ? { rows: [{ code: 'TST' }] } : { rows: [{ payload:
    sql.includes("dataset_type='student_details'") ?
      { headers: ['Student ID', 'Timetable Class'], rows: [['100', 'JPI'], ['300', 'JVE'], ['400', ''], ['500', '']] } : {
    headers, rows: [...payload.rows,
      ['Not Taught', '300', '7S', '7', 'OTHER-JDTECH', '', '', '', ''],
      ['Another Junior', '400', '8S', '8', '', '', '', '', ''],
      ['No Homeroom', '500', '', '7', '', '', '', '', '']]
  } }] };
  const result = await attendanceClasses({ email: 'synthetic@example.test' }, 2026, query, 4, true);
  assert.deepEqual(result.homerooms.map(group => [group.code, group.students.map(student => student.id)]),
    [['7S', ['k:300']], ['8S', ['k:400']], ['PI', ['k:100']], ['Unassigned', ['k:500']]]);
  assert.ok(result.classes.every(group => group.students.every(student => student.id === 'k:100')));
});
