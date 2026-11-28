const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const fs = require('node:fs');
const PizZip = require('pizzip');
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');
const { DOCX, renderDocument, fillDocument, importDocument } = require('./moderationDocuments');
const { createAssessmentRouter, validModerationContent, validSelectedStandards } = require('./assessment');
const { achievementDetails, unitPerformanceCriteria } = require('./standardDetails');

test('coversheet criteria round-trip in one Unit or three Achievement columns without losing legacy text', () => {
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  for (const standardType of ['Unit', 'Achievement']) {
    const values = { achieved: 'First line\nSecond line', merit: 'Merit wording', excellence: 'Excellence wording',
      higherGrades: 'Previous combined wording', grade: 'A', acknowledgedDate: '2026-03-01' };
    const data = { standardType, standardNumber: '99999', coversheet: JSON.stringify(values) };
    assert.equal(validModerationContent(data), true);
    const first = renderDocument('coversheet', data, 2026);
    for (const buffer of [first, fillDocument(first, 'coversheet', data, 2026)]) {
      const doc = new DOMParser().parseFromString(new PizZip(buffer).file('word/document.xml').asText(), 'application/xml');
      const body = doc.getElementsByTagNameNS(W, 'body')[0];
      const kids = (n, tag) => Array.from(n.childNodes).filter(item => item.namespaceURI === W && item.localName === tag);
      const table = kids(body, 'tbl')[1];
      const cells = kids(kids(table, 'tr')[2], 'tc');
      assert.equal(cells.length, standardType === 'Unit' ? 1 : 3);
      const result = importDocument(buffer, 'coversheet').document;
      for (const [key, value] of Object.entries(values)) assert.equal(result[key], value, key);
    }
  }
  const legacy = { standardNumber: '99999', coversheet: JSON.stringify({ achieved: 'Original', higherGrades: 'Unsplit text' }) };
  const imported = importDocument(renderDocument('coversheet', legacy, 2026), 'coversheet').document;
  assert.equal(imported.higherGrades, 'Unsplit text');
  assert.equal(imported.merit, undefined);
  assert.equal(imported.excellence, undefined);
});
const { checkBsas } = require('./nzqaConsent');
const { parseSeniorAuditPdf } = require('./seniorAuditPdf');
const { parseSeniorAuditWorkbook } = require('./seniorAuditWorkbook');
const { reconcileSeniorAudit } = require('./seniorAuditMatch');
const { createSeniorAuditRouter, readWorkbook } = require('./seniorAudit');
const { createStudentsAuditRouter } = require('./studentsAudit');
const { matchStudentsAuditIdentities } = require('./studentsAuditMatch');
const crypto = require('node:crypto');

const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const otherOwner = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const record = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const child = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

test('Unit Standard preview extracts complete criteria and ranges and rejects ambiguous rows', () => {
  const source = 'Outcomes and performance criteria\nOutcome 1\nExample outcome.\nPerformance criteria\n' +
    '1.1 First criterion\ncontinued.\nRange first item,\nsecond item.\n' +
    'NZQA unit standard 99999 version 2\n Page 2 of 3\nCouncil\n© NZQA 2026\n' +
    '1.2 Second criterion.\nPlanned review date 2027\n';
  assert.deepEqual(unitPerformanceCriteria(source),
    ['1.1 First criterion continued.\nRange: first item, second item.', '1.2 Second criterion.']);
  assert.throws(() => unitPerformanceCriteria(source.replace('1.2 Second', '1.1 Second')), /ambiguous/);
  assert.throws(() => unitPerformanceCriteria('Outcomes and performance criteria\nOutcome 1\nNo criteria'), /could not be located/);
});

test('marking evidence is assessment-owned, version-scoped and uses verified school email identities', async t => {
  const departmentId = otherOwner;
  const people = [{ id: 'k:1', name: 'Example, Alpha' }, { id: 'k:2', name: 'Example, Beta' }];
  const department = { id: departmentId, courses: ['11DTECH'], markbookEvidence: true,
    identityMemberships: [{ course: '11DTECH', classCodes: ['11DTECH'], studentIds: people.map(p => p.id) }] };
  let allowed = true, found = true;
  const source = version => ({ file: { id: 'synthetic_pdf', modifiedTime: '2026-11-25T00:00:00Z' },
    report: { course: '11DTECH', number: '92004', version, kind: 'achievement',
      rows: [{ name: people[0].name, teachers: ['TST'] }, { name: people[1].name, teachers: ['TST'] }] } });
  const query = async sql => {
    if (sql.includes('FROM assessment_records')) return { rows: found ? [{ content: { standardNumber: '92004', version: '2' } }] : [] };
    if (sql.includes('FROM senior_audit_sync')) return { rows: [{ reports: [source('1'), source('2')],
      completed_at: '2026-11-25T00:00:00Z', sources_complete: true }] };
    if (sql.includes('FROM students_audit_sync')) return { rows: [] };
    throw new Error('Unexpected query');
  };
  const loadSeniorAudit = async (_req, input) => {
    if (input.action === 'students-audit-roster') return { students: people, departments: allowed ? [department] : [] };
    assert.equal(input.action, 'marking-identities');
    assert.deepEqual(input.studentIds, ['k:1', 'k:2']);
    return { identities: [{ id: 'k:1', email: 'alpha@example.test' }], memberships: [
      { id: 'k:1', course: '11DTECH', classCode: '3-11DTECH' },
      { id: 'k:2', course: '11DTECH', classCode: '6-11DTECH' }
    ] };
  };
  const app = express(); app.use((req, _res, next) => { req.user = { id: owner }; next(); });
  app.use('/audit', createStudentsAuditRouter({ query, loadSeniorAudit }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/audit/marking?year=2026&departmentId=${departmentId}&record=${record}`;
  const response = await fetch(url);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.evidence.length, 1);
  assert.equal(data.evidence[0].version, '2');
  assert.deepEqual(data.evidence[0].students, [
    { ...people[0], email: 'alpha@example.test', classCodes: ['3-11DTECH'] },
    { ...people[1], email: '', classCodes: ['6-11DTECH'] }
  ]);
  found = false;
  assert.equal((await fetch(url)).status, 404);
  found = true; allowed = false;
  assert.equal((await fetch(url)).status, 403);
});

test('Students Audit rechecks department access, saves summary counts and lists only actual matched PDF rows', async t => {
  const departmentId = otherOwner;
  const people = [{ id: 'k:1', name: 'Example, Alpha', yearLevel: '11' },
    { id: 'k:2', name: 'Example, Beta', yearLevel: '12' }];
  const department = { id: departmentId, name: 'Technology', courses: ['11DTECH', '13DTECH'], memberships: [],
    identityMemberships: [{ course: '11DTECH', classCodes: ['1-11DTECH', '6-11DTECH'], studentIds: ['k:1', 'k:2'] }],
    markbookEvidence: true };
  let allowed = true, saved, writes = 0, conflict = false, workbookError = false, revokeSpreadsheet = false, removeCourse = false;
  const file = { id: 'synthetic_summary', version: 'v1', name: 'TopicsSubjectEntries_20261125_112207.pdf' };
  const entries = [
    { course: '11DTECH', number: '92004', version: '2', kind: 'achievement', external: false, students: 17, enrolled: 5, published: 5 },
    { course: '11DTECH', number: '92006', version: '2', kind: 'achievement', external: true, students: 17, enrolled: 5, published: null }
  ];
  const sync = { completed_at: '2026-11-25T00:00:00Z', sources_complete: true, reports: [{
    file: { id: 'synthetic_markbook', modifiedTime: '2026-11-25T00:00:00Z' },
    report: { course: '11DTECH', number: '92004', version: '2', kind: 'achievement',
      rows: [{ name: people[0].name, status: 'Not yet assessed', grade: null, teachers: ['TST'] }] }
  }] };
  const query = async (sql, params) => {
    if (sql.startsWith('SELECT * FROM students_audit_sync')) return { rows: saved ? [saved] : [] };
    if (sql.startsWith('SELECT * FROM senior_audit_sync')) return { rows: [sync] };
    assert.ok(sql.startsWith('INSERT INTO students_audit_sync'));
    writes++;
    if (conflict) return { rows: [] };
    saved = { source: JSON.parse(params[3]), entries: JSON.parse(params[4]), workbook: JSON.parse(params[5]),
      completed_at: sync.completed_at };
    return { rows: [{ completed_at: sync.completed_at }] };
  };
  const loadSeniorAudit = async (_req, input) => {
    if (input.action === 'students-audit-roster') return { students: people, departments: allowed ? [department] : [] };
    assert.equal(allowed, true);
    if (input.action === 'students-audit-enrolments') return { file, entries };
    if (input.action === 'senior-audit-workbook') {
      if (workbookError) throw Object.assign(new Error('Spreadsheet unavailable.'), { status: 403 });
      if (revokeSpreadsheet) department.markbookEvidence = false;
      if (removeCourse) department.courses = ['13DTECH'];
      return { data: seniorWorkbook({ extraEntries: [{ zi_IDNumber: '456', Module_Enrol: '13ENGL',
        zc_Stu_Name_Last_First_Preferred: 'Outside, Department' }] }).toString('base64'), modifiedTime: sync.completed_at };
    }
    assert.equal(input.action, 'senior-audit-roster');
    return { groups: [{ staffCode: 'TST', course: '11DTECH', classCode: '1-11DTECH', term: null, students: people }] };
  };
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => { req.user = { id: owner }; next(); });
  app.use('/audit', createStudentsAuditRouter({ query, loadSeniorAudit }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/audit`;
  const post = () => fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ year: 2026, departmentId }) });
  const withoutSummary = await (await fetch(base + '?year=2026&departmentId=' + departmentId)).json();
  assert.equal(withoutSummary.summary, null);
  assert.equal(withoutSummary.identityMatching[0].matchedRows, 1, 'Cached PDF identities do not depend on an EnrolledList import');
  assert.equal((await post()).status, 200);
  const data = await (await fetch(base + '?year=2026&departmentId=' + departmentId)).json();
  assert.deepEqual(data.summary.entries, entries);
  assert.deepEqual(data.evidence[0].students, [{ id: 'k:1', name: people[0].name }],
    'The roster student absent from the PDF is not labelled as PDF evidence');
  assert.equal(data.students.length, 2);
  assert.equal(data.identityMatching[0].matchedRows, 1);
  assert.equal(data.identityMatching[0].studentCount, 2);
  const memberships = department.identityMemberships;
  delete department.identityMemberships;
  assert.equal((await fetch(base + '?year=2026&departmentId=' + departmentId)).status, 503,
    'An older Core deployment must not silently fall back to teacher-line identity matching');
  department.identityMemberships = memberships;
  assert.equal(data.workbook.entries.length, 1, 'Only currently linked department courses leave the server');
  assert.equal(data.workbook.entries[0].name, 'Student, Synthetic');
  assert.equal(data.workbook.entries[0].course, '13DTECH');
  assert.equal(saved.workbook.entries.length, 1, 'Out-of-department spreadsheet rows are not persisted');
  department.courses = ['11DTECH'];
  const narrowed = await (await fetch(base + '?year=2026&departmentId=' + departmentId)).json();
  assert.deepEqual(narrowed.workbook.entries, [], 'Previously saved issues are filtered against current course permissions');
  department.courses = ['11DTECH', '13DTECH'];
  department.markbookEvidence = false;
  assert.equal((await (await fetch(base + '?year=2026&departmentId=' + departmentId)).json()).workbook, null);
  department.markbookEvidence = true;
  const savedBefore = saved, writesBefore = writes;
  workbookError = true;
  assert.equal((await post()).status, 403);
  assert.equal(writes, writesBefore, 'A failed spreadsheet read must not save a successful-looking comparison');
  assert.equal(saved, savedBefore);
  workbookError = false;
  revokeSpreadsheet = true;
  assert.equal((await post()).status, 403);
  assert.equal(writes, writesBefore, 'Spreadsheet access must still be valid before persistence');
  revokeSpreadsheet = false; department.markbookEvidence = true;
  removeCourse = true;
  assert.equal((await post()).status, 409);
  assert.equal(writes, writesBefore, 'Losing all authorised count rows must not save an empty successful summary');
  removeCourse = false; department.courses = ['11DTECH', '13DTECH'];
  conflict = true;
  assert.equal((await post()).status, 409);
  allowed = false;
  const before = writes;
  assert.equal((await post()).status, 403);
  assert.equal((await fetch(base + '?year=2026&departmentId=' + departmentId)).status, 403);
  const namesOnly = await (await fetch(base + '?year=2026')).json();
  assert.deepEqual(namesOnly.students, people);
  assert.equal(namesOnly.summary, null);
  assert.equal(namesOnly.workbook, null);
  assert.deepEqual(namesOnly.evidence, []);
  assert.equal(writes, before);
});

test('Students Audit matches exact identities across timetable classes without mixing courses or ambiguous students', () => {
  const students = ['Alpha', 'Beta', 'Beta', 'Cross', 'Computing'].map((name, i) => ({ id: 'k:' + (i + 1), name: 'Student, ' + name }));
  const memberships = [
    { course: '11DTECH', classCodes: ['3-11DTECH', '6-11DTECH'], studentIds: ['k:1', 'k:2', 'k:3', 'k:1'] },
    { course: '12DTECH', classCodes: ['3-12DTECH'], studentIds: ['k:4'] },
    { course: '11COMP', classCodes: ['3-11COMP'], studentIds: ['k:5'] }
  ];
  const source = { file: { id: 'synthetic', modifiedTime: '2026-11-25T00:00:00Z' },
    report: { course: '11DTECH', number: '92004', version: '2', kind: 'achievement',
      rows: [{ name: 'student,   alpha', teachers: ['OTHER'] }, { name: students[1].name },
        { name: students[3].name }, { name: students[4].name }] } };
  const matched = matchStudentsAuditIdentities({ students, memberships, reports: [source,
    { ...source, report: { ...source.report, course: '11TEXT' } }] });
  assert.equal(matched.evidence.length, 1, 'Unapproved courses are not returned');
  assert.deepEqual(matched.evidence[0].students, [students[0]], 'Teacher line does not override an exact course identity');
  assert.equal(matched.identityMatching[0].studentCount, 3, 'Repeated timetable slots do not duplicate students');
  assert.equal(matched.identityMatching[0].matchedRows, 1);
  assert.deepEqual(matched.identityMatching[0].issues.map(issue => issue.reason),
    ['ambiguous-name', 'not-in-course', 'not-in-course']);
  assert.deepEqual(matched.identityMatching[0].issues[1].otherCourses, ['12DTECH']);
  assert.deepEqual(matched.identityMatching[0].issues[2].otherCourses, ['11COMP']);
  assert.equal(matched.unresolved, 3);
  assert.throws(() => matchStudentsAuditIdentities({ students: [], memberships, reports: [] }), /unavailable student identity/);
});

test('Students Audit identity matching selects the latest PDF and never guesses tied sources or duplicate names', () => {
  const students = [{ id: 'k:1', name: 'Student, Alpha' }];
  const memberships = [{ course: '11DTECH', classCodes: ['11DTECH'], studentIds: ['k:1'] }];
  const current = { file: { id: 'current', modifiedTime: '2026-11-25T00:00:00Z' },
    report: { course: '11DTECH', number: '92004', version: '2', kind: 'achievement', rows: [{ name: students[0].name }] } };
  const older = { file: { id: 'older', modifiedTime: '2026-11-24T00:00:00Z' },
    report: { ...current.report, version: '1', rows: [{ name: 'Student, Former' }] } };
  const run = reports => matchStudentsAuditIdentities({ students, memberships, reports });
  assert.deepEqual(run([older, current]).evidence.map(book => book.version), ['2']);
  assert.equal(run([older, current]).unresolved, 0, 'Superseded PDF rows do not inflate the current matching warning');
  const separateTeachers = run([
    { ...older, report: { ...older.report, rows: [{ name: students[0].name, teachers: ['FIRST'] }] } },
    { ...current, report: { ...current.report, rows: [{ name: students[0].name, teachers: ['SECOND'] }] } }
  ]);
  assert.equal(separateTeachers.evidence.length, 2, 'A newer export for another teacher must not hide an independent class PDF');
  assert.ok(separateTeachers.evidence.every(book => book.students[0].id === 'k:1'),
    'PDF teacher labels do not restrict exact course identity matching');
  const tied = run([current, { ...current, file: { ...current.file, id: 'tied' } }]);
  assert.equal(tied.unresolved, 2);
  assert.ok(tied.evidence.every(book => book.conflict && book.students.length === 0));
  assert.equal(run([older, { ...current, file: { id: 'unknown-time' } }]).unresolved, 2);
  const repeated = run([{ ...current, report: { ...current.report,
    rows: [...current.report.rows, { name: 'Student,  Alpha' }] } }]);
  assert.equal(repeated.evidence[0].students.length, 0);
  assert.ok(repeated.identityMatching[0].issues.every(issue => issue.reason === 'duplicate-pdf-name'));
});

function seniorWorkbook({ secondGrade = 'Not yet assessed', duplicate = false, formula = false, extraEntries = [] } = {}) {
  const zip = new PizZip();
  const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  zip.file('xl/workbook.xml', `<workbook xmlns="${ns}" xmlns:r="${rel}"><sheets>
    <sheet name="By Teacher" r:id="r1"/><sheet name="By curriculum area" r:id="r2"/>
    </sheets></workbook>`);
  zip.file('xl/_rels/workbook.xml.rels', `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
    <Relationship Id="r1" Type="${rel}/worksheet" Target="worksheets/sheet1.xml"/>
    <Relationship Id="r2" Type="${rel}/worksheet" Target="worksheets/sheet2.xml"/>
    </Relationships>`);
  zip.file('xl/sharedStrings.xml', `<sst xmlns="${ns}"/>`);
  const heading = ['zi_IDNumber', 'zc_Stu_Name_Last_First_Preferred', 'zc_Stu_Level', 'Number_AsNum',
    'Version', 'Level', 'Title', 'zc_Module_Sub_Field', 'Teacher_Markbook', 'Module_Enrol',
    'zc_Result_Markbook', 'zc_Result_Printouts'];
  const values = ['123', 'Student, Synthetic', '13', '425', '2', '3', 'Synthetic standard',
    'Technology', 'TST', '13DTECH', 'Not yet assessed', 'Not yet assessed'];
  const row = (number, data) => `<row r="${number}">${data.map((value, i) =>
    `<c r="${String.fromCharCode(65 + i)}${number}" t="inlineStr">${formula && number === 2 && i === 3 ? '<f>1+1</f>' : ''}<is><t>${value}</t></is></c>`).join('')}</row>`;
  const sheet = grade => `<worksheet xmlns="${ns}"><sheetData>${row(1, heading)}${row(2, values)}
    ${extraEntries.map((entry, i) => row(3 + i, heading.map((name, j) => entry[name] ?? values[j]))).join('')}
    ${duplicate ? row(3, values) : ''}</sheetData></worksheet>`.replace(
    '<t>Not yet assessed</t></is></c></row>', `<t>${grade}</t></is></c></row>`);
  zip.file('xl/worksheets/sheet1.xml', sheet('Not yet assessed'));
  zip.file('xl/worksheets/sheet2.xml', sheet(secondGrade));
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

test('senior workbook validates both sheets and preserves ungraded results', () => {
  const rows = parseSeniorAuditWorkbook(seniorWorkbook());
  assert.equal(rows.length, 1);
  assert.equal(rows[0].Number_AsNum, '425');
  assert.equal(rows[0].zc_Result_Markbook, 'Not yet assessed');
  assert.throws(() => parseSeniorAuditWorkbook(seniorWorkbook({ secondGrade: 'Achieved' })), /disagree/);
  assert.throws(() => parseSeniorAuditWorkbook(seniorWorkbook({ duplicate: true })), /duplicate/);
  assert.throws(() => parseSeniorAuditWorkbook(seniorWorkbook({ formula: true })), /calculated/);
  assert.throws(() => parseSeniorAuditWorkbook(Buffer.from('not a workbook')), /readable Excel/);
  const zip = new PizZip(seniorWorkbook());
  zip.file('xl/sharedStrings.xml', '<sst>' + 'x'.repeat(2 * 1024 * 1024) + '</sst>');
  assert.throws(() => parseSeniorAuditWorkbook(zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' })), /oversized/);
});

test('senior audit flags blank PDF grades and recognises grades entered since the workbook', () => {
  const roster = { unavailableClassCount: 0, ambiguousIds: [], conflictingYearIds: [], groups: [{
    teacher: 'Synthetic Teacher', staffCode: 'TST', classCode: '3-13DTECH', course: '13DTECH', term: null,
    students: ['Alpha', 'Beta', 'Gamma'].map((name, i) => ({ id: 'k:' + (i + 1), name: 'Student, ' + name }))
  }] };
  const report = { course: '13DTECH', number: '425', version: '2', level: '1', title: 'Synthetic standard', kind: 'unit', printed: '23 Nov 2026',
    rows: [
      { name: 'Student, Alpha', teachers: ['TST'], grade: 'Achieved', status: 'Achieved' },
      { name: 'Student, Beta', teachers: ['TST'], grade: 'Achieved', status: 'Achieved' },
      { name: 'Student, Gamma', teachers: ['TST'], grade: null, status: 'Not yet assessed' }
    ] };
  const entry = { zi_IDNumber: '1', Number_AsNum: '425', Version: '2', Module_Enrol: '13DTECH_x000B_2026TT',
    zc_Stu_Name_Last_First_Preferred: 'Student, Alpha', Teacher_Markbook: 'TST',
    zc_Result_Markbook: 'Achieved', zc_Result_Printouts: 'Grade is being moderated' };
  const input = { roster, reports: [{ report, file: { id: 'syntheticfile123' } }],
    entries: [entry], workbookConfirmed: true, sourcesComplete: true };
  const rows = reconcileSeniorAudit(input).groups[0].markbooks[0].students;
  assert.equal(reconcileSeniorAudit(input).groups[0].markbooks[0].level, '1',
    'Standard level comes from the PDF, not the Year 13 class');
  const workbookOnly = reconcileSeniorAudit({ ...input, reports: [], entries: [{ ...entry, Level: '2' }] });
  assert.equal(workbookOnly.groups[0].markbooks[0].level, '2');
  assert.equal(reconcileSeniorAudit({ ...input, reports: [], entries: [{ ...entry, Level: '' }] })
    .groups[0].markbooks[0].level, '', 'Missing levels are not guessed from the class year or standard number');
  assert.deepEqual(rows.map(row => row.state), ['sorted', 'sorted', 'outstanding']);
  assert.equal(rows[0].workbookStatus, 'Grade is being moderated');
  const updated = reconcileSeniorAudit({ ...input, entries: [{ ...entry, zc_Result_Markbook: 'Not yet assessed' }] });
  assert.equal(updated.groups[0].markbooks[0].students[0].state, 'updated');
  assert.equal(reconcileSeniorAudit({ ...input, sourcesComplete: false }).groups[0].markbooks[0].students[1].state, 'not checked');
  assert.equal(reconcileSeniorAudit({ ...input, workbookConfirmed: false, entries: [] }).groups[0].markbooks[0].students[1].state, 'sorted');
  const differentCourse = { ...entry, zi_IDNumber: '2', zc_Stu_Name_Last_First_Preferred: 'Student, Beta',
    Module_Enrol: '13OTHER_x000B_2026TT' };
  const changed = reconcileSeniorAudit({ ...input, entries: [entry, differentCourse] }).groups[0].markbooks[0].students[1];
  assert.equal(changed.state, 'not checked');
  assert.match(changed.issues.join(' '), /course differs/);
  const duplicate = reconcileSeniorAudit({ ...input, reports: [...input.reports, ...input.reports] });
  assert.equal(duplicate.groups[0].markbooks.length, 1);
  assert.equal(duplicate.groups[0].markbooks[0].students[1].state, 'not checked');
  assert.equal(duplicate.groups[0].markbooks[0].conflict, true);
  assert.equal(duplicate.groups[0].markbooks[0].sources.length, 2);
  assert.equal(duplicate.groups[0].markbooks[0].students[1].hasRecordedGrade, true);
  assert.equal(duplicate.groups[0].markbooks[0].workbookListed, true);
  const older = { report, file: { id: 'old', modifiedTime: '2026-01-01T00:00:00Z' } };
  const newer = { report: { ...report, rows: report.rows.map(row => ({ ...row, teachers: ['TST', 'OTHER'] })),
    version: '3' }, file: { id: 'new', modifiedTime: '2026-02-01T00:00:00Z' } };
  const latest = reconcileSeniorAudit({ ...input, reports: [newer, older] });
  assert.equal(latest.groups[0].markbooks.length, 2);
  const latestBook = latest.groups[0].markbooks.find(book => book.version === '3');
  assert.match(latestBook.url, /\/new\/view$/);
  assert.match(latestBook.students[0].issues.join(' '), /different standard version/);
  assert.ok(latest.groups[0].markbooks.find(book => book.version === '2').students
    .some(row => row.issues.includes('No uniquely matched PDF result was found.')));
  const tied = reconcileSeniorAudit({ ...input, reports: [older, { ...newer,
    file: { ...newer.file, modifiedTime: older.file.modifiedTime } }] });
  assert.ok(tied.groups[0].markbooks.every(book => book.conflict));
  const partial = reconcileSeniorAudit({ ...input, reports: [older, { ...newer,
    report: { ...newer.report, rows: newer.report.rows.slice(0, 1) } }] });
  const partialPdf = partial.groups[0].markbooks.find(book => book.url);
  assert.match(partialPdf.url, /\/new\/view$/);
  assert.equal(partialPdf.olderReportWarning, true);
  assert.equal(partialPdf.students.find(row => row.name === 'Student, Beta').state, 'not checked');
  const sameVersion = reconcileSeniorAudit({ ...input, reports: [older, { ...newer,
    report: { ...newer.report, version: '2', rows: [newer.report.rows[0],
      { name: 'Unknown, Student', teachers: ['TST'], grade: null, status: '' }] } }] });
  assert.equal(sameVersion.groups[0].markbooks.length, 1);
  assert.match(sameVersion.groups[0].markbooks[0].url, /\/new\/view$/);
  assert.equal(sameVersion.groups[0].markbooks[0].unmatched, 1);
  assert.equal(sameVersion.groups[0].markbooks[0].olderReportWarning, true);
  const sameTimestamp = reconcileSeniorAudit({ ...input, reports: [older, { ...older,
    file: { ...older.file, id: 'other' },
    report: { ...report, rows: report.rows.map(row => ({ ...row, grade: null, status: 'Not entered' })) }
  }], decisions: [{ student_id: 'k:2', standard_number: '425', standard_version: '2', not_enrolled: true, revision: 1 }] });
  const conflictBook = sameTimestamp.groups[0].markbooks[0];
  assert.equal(sameTimestamp.groups[0].markbooks.length, 1);
  assert.equal(conflictBook.conflict, true);
  assert.equal(conflictBook.url, '');
  assert.equal(conflictBook.sources.length, 2);
  assert.equal(conflictBook.students[1].result, 'Not checked');
  assert.equal(conflictBook.students[1].hasRecordedGrade, true);
  assert.match(conflictBook.students[1].issues.join(' '), /conflicts with the not-enrolled decision/);
  assert.equal(reconcileSeniorAudit({ ...input, workbookConfirmed: false }).groups[0].markbooks[0].workbookListed, false);
  assert.equal(reconcileSeniorAudit({ ...input, entries: [{ ...entry, Number_AsNum: '999' }] })
    .groups[0].markbooks.find(book => book.number === '425').workbookListed, false);
  assert.equal(reconcileSeniorAudit({ ...input, entries: [{ ...entry, zi_IDNumber: '999', Version: '3' }] })
    .groups[0].markbooks.find(book => book.number === '425').workbookListed, true,
  'An unmatched workbook student for this course and teacher keeps the component listed, regardless of version');
  assert.equal(reconcileSeniorAudit({ ...input, entries: [{ ...entry, Module_Enrol: '11TEXT_x000B_2026TT' }] })
    .groups[0].markbooks.find(book => book.number === '425').workbookListed, false,
  'The same standard in TEXT must not make its DTECH component red');
  assert.equal(reconcileSeniorAudit({ ...input, entries: [{ ...entry, zi_IDNumber: '999', Teacher_Markbook: 'OTHER' }] })
    .groups[0].markbooks.find(book => book.number === '425').workbookListed, false,
  'Another teacher’s unrelated class must not make this component red');
  assert.equal(reconcileSeniorAudit({ ...input, entries: [{ ...entry, Teacher_Markbook: 'OTHER' }] })
    .groups[0].markbooks.find(book => book.number === '425').workbookListed, true,
  'A linked student in the same course must remain flagged even when the workbook teacher differs');
  const textGroup = { ...roster.groups[0], course: '11TEXT', classCode: '6-11TEXT',
    students: [{ id: 'k:9', name: 'Student, Textile' }] };
  const components = reconcileSeniorAudit({ ...input, roster: { ...roster, groups: [...roster.groups, textGroup] },
    reports: [...input.reports, { file: { id: 'textsynthetic123' }, report: { ...report, course: '11TEXT',
      rows: [{ name: 'Student, Textile', teachers: ['TST'], grade: 'Achieved', status: 'Achieved' }] } }] });
  assert.equal(components.groups.find(group => group.course === '13DTECH').markbooks[0].workbookListed, true);
  const textBook = components.groups.find(group => group.course === '11TEXT').markbooks[0];
  assert.equal(textBook.workbookListed, false);
  assert.equal(textBook.students[0].state, 'sorted', 'Resolved TEXT grades remain resolved when only DTECH is listed');
  const ambiguous = reconcileSeniorAudit({ ...input, roster: { ...roster, ambiguousIds: ['k:2'] } });
  assert.equal(ambiguous.groups[0].markbooks[0].unmatched, 1);
  const missing = reconcileSeniorAudit({ ...input, reports: [{ ...input.reports[0],
    report: { ...report, rows: report.rows.slice(0, 2) } }] });
  assert.equal(missing.groups[0].markbooks[0].students.find(row => row.name === 'Student, Gamma').state, 'not checked');
  const decision = { student_id: 'k:3', standard_number: '425', standard_version: '2', not_enrolled: true, revision: 1 };
  const resolved = reconcileSeniorAudit({ ...input, decisions: [decision] }).groups[0].markbooks[0].students[2];
  assert.equal(resolved.state, 'not enrolled');
  assert.equal(resolved.decisionRevision, 1);
  const changedGrade = reconcileSeniorAudit({ ...input, decisions: [decision], reports: [{ ...input.reports[0],
    report: { ...report, rows: report.rows.map(row => ({ ...row, grade: 'Achieved', status: 'Achieved' })) } }] });
  assert.equal(changedGrade.groups[0].markbooks[0].students[2].state, 'not checked');
  assert.match(changedGrade.groups[0].markbooks[0].students[2].issues.join(' '), /conflicts/);
  const ambiguousDecision = reconcileSeniorAudit({ ...input, decisions: [decision],
    roster: { ...roster, ambiguousIds: ['k:3'] } }).groups[0].markbooks[0].students.find(row => row.name === 'Student, Gamma');
  assert.equal(ambiguousDecision.state, 'not checked');
  assert.equal(ambiguousDecision.id, undefined);
  const workbookGrade = reconcileSeniorAudit({ ...input, decisions: [decision],
    entries: [{ ...entry, zi_IDNumber: '3', zc_Stu_Name_Last_First_Preferred: 'Student, Gamma' }] });
  assert.equal(workbookGrade.groups[0].markbooks[0].students[2].state, 'not checked');
  const withoutTeacher = { ...report, rows: [{ ...report.rows[0], teachers: [] }] };
  const linked = reconcileSeniorAudit({ ...input, reports: [{ report: withoutTeacher, file: { id: 'syntheticfile123' } }] });
  assert.equal(linked.groups[0].markbooks[0].students[0].name, 'Student, Alpha');
  const mixedLine = { ...roster.groups[0], classCode: '3-11COMP' };
  const consolidated = reconcileSeniorAudit({ ...input, roster: { ...roster, groups: [...roster.groups, mixedLine] } });
  assert.equal(consolidated.groups.length, 1);
  assert.equal(consolidated.groups[0].classCode, '3-13DTECH');
  assert.equal(consolidated.groups[0].markbooks[0].students[1].state, 'sorted');
  const differentLine = { ...mixedLine, classCode: '4-11COMP' };
  assert.ok(reconcileSeniorAudit({ ...input, roster: { ...roster, groups: [...roster.groups, differentLine] } }).unresolved);
  const emptyLine = { ...mixedLine, classCode: '4-11COMP', students: [] };
  const noPhantom = reconcileSeniorAudit({ ...input, roster: { ...roster, groups: [...roster.groups, emptyLine] } });
  assert.equal(noPhantom.groups[1].markbooks.length, 0);
  const differentTeacher = { ...report, rows: [{ ...report.rows[0], teachers: ['OTHER'] }] };
  const mismatch = reconcileSeniorAudit({ ...input, reports: [{ report: differentTeacher, file: { id: 'syntheticfile123' } }] });
  assert.equal(mismatch.groups[0].markbooks[0].students[0].state, 'not checked');
  assert.match(mismatch.groups[0].markbooks[0].students[0].issues.join(' '), /teacher code differs/);
  const sameName = { ...roster.groups[0], staffCode: 'OTH', teacher: 'Other Teacher' };
  const unclear = reconcileSeniorAudit({ ...input, roster: { ...roster, groups: [...roster.groups, sameName] },
    reports: [{ report: withoutTeacher, file: { id: 'syntheticfile123' } }] });
  assert.equal(unclear.unresolved, 1);
  assert.equal(unclear.groups[0].markbooks.length, 1);
  assert.equal(unclear.groups[0].markbooks[0].students[0].state, 'not checked');
  const unlinked = reconcileSeniorAudit({ ...input, roster: { ...roster,
    teachers: [{ staffCode: 'TST', teacher: 'Synthetic Teacher' }] },
    entries: [{ ...entry, zi_IDNumber: '999' }, { ...entry, zi_IDNumber: '998', Teacher_Markbook: 'OTHER' }] });
  assert.equal(unlinked.unresolvedWorkbook, 1);
  assert.equal(unlinked.unresolvedByTeacher.TST, 1);
});

test('automatic non-enrolment resolves ungraded students in scanned non-red components', () => {
  const roster = { unavailableClassCount: 0, groups: [{
    teacher: 'Synthetic Teacher', staffCode: 'TST', classCode: '3-13DTECH', course: '13DTECH', term: null,
    students: ['Alpha', 'Beta', 'Gamma'].map((name, i) => ({ id: 'k:' + (i + 1), name: 'Student, ' + name }))
  }] };
  const report = { course: '13DTECH', number: '425', version: '2', title: 'Synthetic standard', kind: 'unit', rows: [
    { name: 'Student, Alpha', teachers: ['TST'], grade: null, status: 'Not entered' },
    { name: 'Student, Beta', teachers: ['TST'], grade: 'Not Achieved', status: 'Not Achieved' }
  ] };
  const input = { roster, reports: [{ report, file: { id: 'synthetic123' } }], entries: [],
    workbookConfirmed: true, sourcesComplete: true, automaticNotEnrolled: true };
  const first = overrides => reconcileSeniorAudit({ ...input, ...overrides }).groups[0].markbooks[0].students[0];
  const automatic = first({});
  assert.equal(automatic.state, 'not enrolled');
  assert.equal(automatic.notEnrolled, true);
  assert.equal(automatic.automaticNotEnrolled, true);
  assert.equal(automatic.decisionRevision, 0);
  assert.equal(automatic.baseState, 'outstanding');
  const students = reconcileSeniorAudit(input).groups[0].markbooks[0].students;
  assert.equal(students[1].state, 'sorted', 'Not Achieved is a grade, not an automatic non-enrolment');
  assert.equal(students[1].automaticNotEnrolled, false);
  assert.equal(students[2].state, 'not enrolled', 'Roster students absent from the scanned PDF are automatically resolved');
  assert.equal(students[2].automaticNotEnrolled, true);
  assert.deepEqual(students[2].issues, []);
  assert.ok(students.every(row => ['sorted', 'not enrolled'].includes(row.state) && !row.issues.length),
    'The entire component is resolved, not left yellow for students absent from the PDF');
  for (const overrides of [{ automaticNotEnrolled: false }, { workbookConfirmed: false }, { sourcesComplete: false },
    { roster: { ...roster, unavailableClassCount: 1 } },
    { decisions: [{ student_id: 'k:1', standard_number: '425', standard_version: '2', not_enrolled: false, revision: 1 }] }]) {
    assert.equal(first(overrides).automaticNotEnrolled, false);
    assert.equal(first(overrides).state, 'outstanding');
  }
  const elsewhere = { zi_IDNumber: '999', Number_AsNum: '425', Version: '9', Module_Enrol: '11TEXT',
    Teacher_Markbook: 'OTHER', zc_Stu_Name_Last_First_Preferred: 'Student, Elsewhere',
    zc_Result_Markbook: 'Not yet assessed', zc_Result_Printouts: '' };
  const listed = first({ entries: [elsewhere] });
  assert.equal(listed.state, 'not enrolled', 'A red component in another subject must not block this component');
  assert.equal(listed.automaticNotEnrolled, true);
  const red = reconcileSeniorAudit({ ...input, entries: [{ ...elsewhere, Module_Enrol: '13DTECH', Teacher_Markbook: 'TST' }] })
    .groups[0].markbooks[0];
  assert.equal(red.workbookListed, true);
  assert.equal(red.students[0].automaticNotEnrolled, false);
  assert.equal(red.students[2].automaticNotEnrolled, false, 'Red components do not auto-resolve missing PDF students');
  assert.equal(first({ entries: [{ ...elsewhere, Number_AsNum: '999' }] }).automaticNotEnrolled, true);
  const mismatch = first({ reports: [{ ...input.reports[0], report: { ...report,
    rows: report.rows.map(row => ({ ...row, teachers: ['OTHER'] })) } }] });
  assert.equal(mismatch.automaticNotEnrolled, false, 'A teacher mismatch remains flagged');
  const ambiguous = reconcileSeniorAudit({ ...input, roster: { ...roster, ambiguousIds: ['k:1'] } })
    .groups[0].markbooks[0].students.find(row => row.name === 'Student, Alpha');
  assert.equal(ambiguous.automaticNotEnrolled, false);
  assert.equal(ambiguous.state, 'not checked');
  const conflict = first({ reports: [...input.reports, ...input.reports] });
  assert.equal(conflict.automaticNotEnrolled, false);
  assert.equal(conflict.state, 'not checked');
  const graded = first({ reports: [{ ...input.reports[0], report: { ...report,
    rows: report.rows.map(row => ({ ...row, grade: 'Achieved', status: 'Achieved' })) } }] });
  assert.equal(graded.automaticNotEnrolled, false);
  assert.equal(graded.state, 'sorted');
});

test('senior workbook reads a bounded verified response from Core', async () => {
  const buffer = seniorWorkbook();
  const calls = [];
  const loader = async (_req, input) => {
    calls.push(input);
    return { data: buffer.toString('base64'), modifiedTime: '2026-11-23T00:00:00Z' };
  };
  const result = await readWorkbook({}, loader, 2026);
  assert.equal(result.entries.length, 1);
  assert.deepEqual(calls, [{ year: 2026, action: 'senior-audit-workbook' }]);
  await assert.rejects(readWorkbook({}, async () => ({ data: 'invalid!', modifiedTime: '2026-11-23' }), 2026), /could not be verified/);
});

function seniorPdf({ unit = false, firstStatus = 'Not yet assessed', secondStatus = 'Not Achieved' } = {}) {
  const item = (text, x, y) => ({ text, x, y, width: 10 });
  return { pages: [{ view: [0, 0, 595, 842], items: [
    item('KAMAR', 46, 49), item('13DTECH', 49, 777),
    item(unit ? 'US 29786 - Synthetic unit standard' : 'Synthetic achievement standard', 46, 746),
    item(unit ? '29786' : '91907', 131, 659), item('2', 203, 659), item('3', 257, 659),
    item('Student Name', 49, 640.5), item('Teacher', 200.7, 642), item('Status', 268.7, 640),
    ...(!unit ? [item('Attempt 1', 334.5, 637)] : []),
    item('Student, Alpha', 49, 622), item('TST, PEER', 210.5, 620), ...(firstStatus ? [item(firstStatus, 250.5, 622.5)] : []),
    item('Student, Beta', 49, 603), item('TST', 210.5, 601), item(secondStatus, 257.1, 603.5),
    item('Male: 1, Female: 1, Students: 2', 50, 582),
    item('23 Nov 2026, 4:50 pm (TST)', 442.8, 50)
  ] }] };
}

test('senior audit API authorises before reading the workbook and does not expose unmatched PDF students', async t => {
  const buffer = seniorWorkbook();
  let allowed = false, reads = 0, pdfReads = 0, revoke = false, workbookError = false, secondFile = false,
    holdWorkbook = false, releaseWorkbook, workbookStarted,
    currentUser = owner, stamp = '2026-11-23T00:00:00Z', grade = 'Not yet assessed';
  const roster = { groups: [{ teacher: 'Synthetic Teacher', staffCode: 'TST', classCode: '3-13DTECH', course: '13DTECH',
    term: null, students: [{ id: 'k:123', name: 'Student, Alpha' }] }], ambiguousIds: [], conflictingYearIds: [], unavailableClassCount: 0 };
  const loadSeniorAudit = async (_req, input) => {
    if (!allowed) throw Object.assign(new Error('Technology staff only.'), { status: 403 });
    if (input.action === 'senior-audit-roster') return roster;
    if (input.action === 'senior-audit-workbook') {
      reads++;
      if (workbookError) throw Object.assign(new Error('Workbook unavailable.'), { status: 503 });
      if (holdWorkbook) await new Promise(resolve => { releaseWorkbook = resolve; workbookStarted(); });
      return { data: buffer.toString('base64'), modifiedTime: '2026-11-23T00:00:00Z' };
    }
    if (input.action === 'senior-audit-files') {
      if (revoke) allowed = false;
      return { files: ['syntheticfile123', ...(secondFile ? ['syntheticfile456'] : [])]
        .map(id => ({ id, version: id + ':' + stamp + ':aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' })), folders: [{ name: 'DTECH', found: true }] };
    }
    pdfReads++;
    return { results: input.items.map(item => ({ file: { id: item.fileId, version: item.version },
      report: seniorPdf({ firstStatus: grade }) })) };
  };
  const saved = new Map(), decisions = new Map(), snapshots = new Map(), jobs = new Map();
  const query = async (sql, params) => {
    if (sql.includes('FROM senior_audit_sync_jobs')) {
      const job = jobs.get(JSON.stringify(params));
      return { rows: job ? [{ ...job, active: true }] : [] };
    }
    if (sql.startsWith('INSERT INTO senior_audit_sync_jobs')) {
      const [year, user, run] = params, key = JSON.stringify([year, user]), old = jobs.get(key);
      if (old?.status === 'running') return { rows: [] };
      jobs.set(key, { run_id: run, status: 'running' }); return { rows: [{ run_id: run }] };
    }
    if (sql.startsWith('UPDATE senior_audit_sync_jobs')) {
      const [year, user, run, message] = params, job = jobs.get(JSON.stringify([year, user]));
      if (job?.run_id === run) { job.status = message ? 'failed' : 'complete'; job.error_message = message; }
      return { rows: [] };
    }
    if (sql.startsWith('SELECT * FROM senior_audit_sync')) {
      return { rows: snapshots.has(JSON.stringify(params)) ? [snapshots.get(JSON.stringify(params))] : [] };
    }
    if (sql.startsWith('INSERT INTO senior_audit_sync')) {
      const [year, user, started, complete, failures, details, missing, folders, reports, checked, modified, entries, automaticReady] = params;
      const key = JSON.stringify([year, user]), old = snapshots.get(key);
      if (!old || Date.parse(old.started_at) <= Date.parse(started)) snapshots.set(key, {
        started_at: started, completed_at: started, sources_complete: complete, source_failures: failures,
        failure_details: JSON.parse(details), missing_saved: missing, folders: JSON.parse(folders), reports: JSON.parse(reports),
        workbook_checked_at: checked || old?.workbook_checked_at, workbook_modified_at: modified || old?.workbook_modified_at,
        workbook_entries: entries ? JSON.parse(entries) : old?.workbook_entries, automatic_enrolment_ready: automaticReady
      });
      return { rows: [] };
    }
    if (sql.includes('FROM senior_audit_enrolment')) return { rows: [...decisions.values()] };
    if (sql.startsWith('INSERT INTO senior_audit_enrolment') || sql.startsWith('UPDATE senior_audit_enrolment')) {
      const [year, student, number, version, active, , revision] = params;
      const key = JSON.stringify([year, student, number, version]), previous = decisions.get(key);
      if (previous ? previous.revision !== revision : revision !== undefined) return { rows: [] };
      const record = { student_id: student, standard_number: number, standard_version: version,
        not_enrolled: active, revision: (previous?.revision || 0) + 1 };
      decisions.set(key, record); return { rows: [record] };
    }
    if (sql.startsWith('INSERT INTO senior_audit_reports')) {
      const [, key, timestamp, file, report] = params, previous = saved.get(key);
      if (!previous || Date.parse(timestamp) > Date.parse(previous.timestamp)) {
        saved.set(key, { timestamp, file: JSON.parse(file), report: JSON.parse(report) });
        return { rows: [{ report_key: key }] };
      }
      return { rows: [] };
    }
    if (sql.startsWith('SELECT modified_at')) {
      const previous = saved.get(params[1]);
      return { rows: previous ? [{ modified_at: previous.timestamp, source: previous.file }] : [] };
    }
    if (sql.startsWith('DELETE FROM senior_audit_reports')) return { rows: [] };
    return { rows: [...saved.values()] };
  };
  const app = express(); app.use(express.json()); app.use((req, _res, next) => { req.user = { id: currentUser }; next(); });
  app.use('/audit', createSeniorAuditRouter({ query, loadSeniorAudit }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const post = (compareWorkbook = true) => fetch(`http://127.0.0.1:${server.address().port}/audit`, { method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ year: 2026, compareWorkbook }) });
  assert.equal((await post()).status, 403);
  assert.equal(reads, 0);
  allowed = true;
  const pdfOnly = await post(false);
  assert.equal(pdfOnly.status, 200);
  const pdfOnlyResult = await pdfOnly.json();
  assert.equal(pdfOnlyResult.workbookLoaded, false);
  assert.equal(pdfOnlyResult.groups[0].markbooks[0].students[0].automaticNotEnrolled, false);
  assert.equal(reads, 0, 'PDF sync does not require Google workbook access');
  const response = await post();
  assert.equal(response.status, 200);
  assert.equal(pdfReads, 1, 'Unchanged PDFs are not downloaded again');
  const result = await response.json();
  assert.equal(result.groups[0].markbooks[0].students[0].automaticNotEnrolled, true);
  assert.equal(result.groups[0].markbooks[0].students[0].state, 'not enrolled');
  assert.equal(result.groups[0].markbooks[0].unmatched, 1);
  assert.doesNotMatch(JSON.stringify(result), /Student, Beta/);
  const savedResponse = await fetch(`http://127.0.0.1:${server.address().port}/audit?year=2026`);
  assert.equal(savedResponse.status, 200);
  const savedView = await savedResponse.json();
  assert.equal(savedView.workbookLoaded, true);
  assert.ok(savedView.lastSyncedAt);
  assert.ok(savedView.workbookCheckedAt);
  assert.equal(savedView.groups[0].markbooks[0].students[0].result, 'No grade');
  assert.equal(savedView.groups[0].markbooks[0].students[0].automaticNotEnrolled, true,
    'Automatic results survive refresh through the saved combined comparison');
  const cachedWorkbookOnly = await (await post(false)).json();
  assert.equal(cachedWorkbookOnly.workbookLoaded, true);
  assert.equal(cachedWorkbookOnly.groups[0].markbooks[0].students[0].automaticNotEnrolled, false,
    'A PDF-only sync must not infer non-enrolment from the cached workbook');
  assert.equal((await (await post()).json()).groups[0].markbooks[0].students[0].automaticNotEnrolled, true);
  assert.doesNotMatch(JSON.stringify(savedView), /Student, Beta/);
  const savedReport = [...saved.values()][0].report;
  savedReport.rows[0].grade = 'Achieved';
  const unchangedSnapshot = await (await fetch(`http://127.0.0.1:${server.address().port}/audit?year=2026`)).json();
  assert.equal(unchangedSnapshot.groups[0].markbooks[0].students[0].result, 'No grade',
    'The last completed snapshot is not replaced by a partial sync');
  savedReport.rows[0].grade = null;
  currentUser = otherOwner;
  assert.equal((await (await fetch(`http://127.0.0.1:${server.address().port}/audit?year=2026`)).json()).workbookLoaded, false,
    'Another staff member cannot read this account’s cached workbook');
  currentUser = owner;
  workbookError = true;
  assert.equal((await post()).status, 503);
  const afterFailure = await (await fetch(`http://127.0.0.1:${server.address().port}/audit?year=2026`)).json();
  assert.equal(afterFailure.workbookLoaded, true, 'A failed check retains the previous comparison');
  assert.equal(afterFailure.syncError, 'Workbook unavailable.');
  workbookError = false;
  holdWorkbook = true;
  const started = new Promise(resolve => { workbookStarted = resolve; });
  const firstSync = post();
  await started;
  const whileSyncing = await (await fetch(`http://127.0.0.1:${server.address().port}/audit?year=2026`)).json();
  assert.equal(whileSyncing.syncing, true);
  assert.equal(whileSyncing.workbookLoaded, true, 'A running sync preserves the last comparison');
  assert.equal((await post()).status, 202, 'Another tab follows the existing sync instead of starting another');
  holdWorkbook = false; releaseWorkbook();
  assert.equal((await firstSync).status, 200);
  const decision = { year: 2026, staffCode: 'TST', classCode: '3-13DTECH', course: '13DTECH',
    number: '91907', version: '2', studentId: 'k:123', notEnrolled: true, revision: 0 };
  const decide = body => fetch(`http://127.0.0.1:${server.address().port}/audit/enrolment`, { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await decide({ ...decision, studentId: 'k:999' })).status, 409);
  currentUser = otherOwner;
  assert.equal((await decide({ ...decision, requireWorkbook: true })).status, 409,
    'Bulk decisions require this staff member’s workbook comparison');
  currentUser = owner;
  const snapshot = snapshots.get(JSON.stringify([2026, owner]));
  snapshot.workbook_entries.push({ ...snapshot.workbook_entries[0], Number_AsNum: '91907',
    zc_Stu_Name_Last_First_Preferred: 'Student, Alpha', zc_Result_Markbook: 'Achieved' });
  assert.equal((await decide({ ...decision, requireWorkbook: true })).status, 409,
    'The server must reject a grade recorded in the workbook even if the PDF is blank');
  snapshot.workbook_entries.pop();
  assert.equal((await decide(decision)).status, 200);
  assert.equal((await decide(decision)).status, 409, 'A stale decision cannot overwrite another change');
  const resolvedView = await (await fetch(`http://127.0.0.1:${server.address().port}/audit?year=2026`)).json();
  assert.equal(resolvedView.groups[0].markbooks[0].students[0].state, 'not enrolled');
  assert.equal((await decide({ ...decision, notEnrolled: false, revision: 1 })).status, 200);
  const undone = await (await fetch(`http://127.0.0.1:${server.address().port}/audit?year=2026`)).json();
  assert.equal(undone.groups[0].markbooks[0].students[0].state, 'outstanding');
  assert.equal(undone.groups[0].markbooks[0].students[0].automaticNotEnrolled, false);
  const rechecked = await (await post()).json();
  assert.equal(rechecked.groups[0].markbooks[0].students[0].state, 'outstanding',
    'A fresh comparison does not override an explicit manual undo');
  stamp = '2026-11-24T00:00:00Z'; grade = 'Achieved';
  assert.equal((await (await post()).json()).groups[0].markbooks[0].students[0].result, 'Achieved');
  assert.equal((await decide({ ...decision, revision: 2 })).status, 409, 'A recorded PDF grade cannot be marked not enrolled');
  stamp = '2026-11-22T00:00:00Z'; grade = 'Not yet assessed';
  assert.equal((await (await post()).json()).groups[0].markbooks[0].students[0].result, 'Achieved',
    'An older Drive report cannot overwrite a newer saved report');
  secondFile = true;
  assert.equal((await post()).status, 200);
  assert.equal(saved.size, 2, 'Separate Drive files must not overwrite each other');
  revoke = true;
  assert.equal((await post()).status, 403, 'Revoked Technology access is checked again before returning results');
  assert.equal((await decide({ ...decision, revision: 2 })).status, 403);
  assert.equal((await fetch(`http://127.0.0.1:${server.address().port}/audit?year=2026`)).status, 403);
});

test('senior KAMAR reports preserve recorded grades and distinguish not yet assessed', () => {
  const result = parseSeniorAuditPdf(seniorPdf(), 2026);
  assert.equal(result.kind, 'achievement');
  assert.deepEqual(result.rows.map(row => row.grade), [null, 'Not Achieved']);
  assert.deepEqual(result.rows[0].teachers, ['TST', 'PEER']);
  const unit = parseSeniorAuditPdf(seniorPdf({ unit: true, firstStatus: 'Achieved' }), 2026);
  assert.equal(unit.kind, 'unit');
  assert.deepEqual(unit.rows.map(row => row.grade), ['Achieved', 'Not Achieved']);
  const blank = seniorPdf({ unit: true, firstStatus: '' });
  blank.pages[0].items.find(item => item.text.startsWith('Male:')).text = 'Male: 2, Students: 2';
  assert.equal(parseSeniorAuditPdf(blank, 2026).rows[0].grade, null);
  const split = seniorPdf({ firstStatus: 'not entered' });
  const firstName = split.pages[0].items.find(item => item.text === 'Student, Alpha');
  firstName.text = 'Student,'; firstName.width = 40;
  split.pages[0].items.push({ text: 'Alpha', x: 89, y: 622, width: 20 });
  split.pages[0].items.find(item => item.text === 'not entered').y = 621.5;
  split.pages[0].items = split.pages[0].items.filter(item => item.text !== 'TST, PEER');
  const parsedSplit = parseSeniorAuditPdf(split);
  assert.equal(parsedSplit.rows[0].name, 'Student, Alpha');
  assert.equal(parsedSplit.rows[0].grade, null);
  assert.deepEqual(parsedSplit.rows[0].teachers, []);
});

test('senior KAMAR reports reject unrecognised or unverifiable evidence', () => {
  assert.throws(() => parseSeniorAuditPdf(seniorPdf({ firstStatus: 'Unknown result' }), 2026), /unrecognised/);
  assert.throws(() => parseSeniorAuditPdf(seniorPdf({ unit: true, firstStatus: 'Merit' }), 2026), /unexpected/);
  assert.equal(parseSeniorAuditPdf(seniorPdf()).course, '13DTECH');
  const report = seniorPdf();
  report.pages[0].items.pop();
  assert.equal(parseSeniorAuditPdf(report).course, '13DTECH');
  const unknownKind = seniorPdf();
  unknownKind.pages[0].items = unknownKind.pages[0].items.filter(item => item.text !== 'Attempt 1');
  assert.throws(() => parseSeniorAuditPdf(unknownKind, 2026), /standard type/);
  const incorrectTotal = seniorPdf();
  incorrectTotal.pages[0].items.find(item => item.text.startsWith('Male:')).text = 'Male: 1, Female: 1, Students: 3';
  assert.throws(() => parseSeniorAuditPdf(incorrectTotal, 2026), /student count/);
});

test('BSAS consent requires the exact NZQA classification and an eligible level', async () => {
  const framework = (level = 2, extra = '') => `<h2>Assessment Standards</h2><table>
    <tr><td><a href="/framework/explore/domain.do?frameworkId=42#standards">Digital Technologies</a></td></tr>
    <tr><td>Level ${level}</td></tr><tr><td><span class="itemId">91897</span>${extra}</td></tr></table>`;
  const domain = (field = 'Engineering and Technology', subfield = 'Technology') => `<p class="important">
    <a href="/framework/explore/index.do">TOP</a> &gt;
    <a href="/framework/explore/field.do?frameworkId=1">${field}</a> &gt;
    <a href="/framework/explore/sub-field.do?frameworkId=2">${subfield}</a> &gt; Digital Technologies</p>`;
  const header = '<tr><th>Field</th><th>Subfield</th><th>Domain</th><th>BSAS Level</th></tr>';
  const row = (field, subfield, name, level) => `<tr><td>${field}</td><td>${subfield}</td><td>${name}</td><td>${level}</td></tr>`;
  const registered = row('Engineering and Technology', 'Technology', 'Digital Technologies', 3) +
    Array.from({ length: 10 }, (_, i) => row('Other', 'Other', 'Domain ' + i, 3)).join('');
  const bsas = `<h3>Registered domains</h3><table>${header}${registered}</table>
    <h3>Expired domains</h3><table>${header}${row('Other', 'Other', 'Digital Technologies', 4)}</table>`;
  const run = (search = framework(), details = domain(), table = bsas) => checkBsas('91897', { fetchImpl: async url => ({
    ok: true, text: async () => url.includes('results.do') ? search : url.includes('domain.do') ? details : table
  }) });
  assert.equal((await run()).eligible, true);
  assert.equal((await run(framework(4))).eligible, false);
  assert.equal((await run(framework(2, 'This standard has expired and is no longer available.'))).eligible, false);
  assert.equal((await run(framework(), domain('Other', 'Other'))).eligible, false);
  await assert.rejects(run(framework().replace('91897', '99999')), /missing or ambiguous/);
  await assert.rejects(run(framework(), domain(), bsas.replace('Registered domains', 'Changed domains')), /could not be identified/);
  await assert.rejects(run(framework(), domain(), bsas.replace('Digital Technologies</td><td>3', 'Digital Technologies</td><td>unknown')), /unsupported row/);
});

test('Achievement PDF extraction separates criteria and individual requirements across page breaks', () => {
  const item = (str, x, y, width = str.length * 5) => ({ str, transform: [1, 0, 0, 1, x, y], width });
  const page = [
    item('Achievement Criteria', 50, 500), item('Achievement', 50, 470),
    item('Achievement with Merit', 200, 470), item('Achievement with', 360, 470), item('Excellence', 360, 455),
    item('\u2022', 50, 425), item('Basic work', 65, 425), item('continues.', 65, 410),
    item('\u2022', 200, 425), item('Capable work.', 215, 425),
    item('\u2022', 360, 425), item('Excellent work.', 375, 425),
    item('Explanatory Notes', 50, 370),
    item('1 Basic work involves:', 50, 96),
    item('\u2022 First requirement', 65, 81),
    item('\u2022 Second requirement', 65, 66),
    item('\uf0d3 Publisher footer', 356, 20)
  ];
  const second = [
    item('Standard ', 50, 806), item('version 1 Page 2', 96, 806.4),
    item('\uf0d3 Publisher footer', 356, 20),
    item('\u2022 Third requirement', 65, 773), item('with a continuation.', 80, 759),
    item('Capable work involves:', 65, 730), item('\u2022 Another requirement.', 65, 716),
    item('Other work involves:', 65, 685), item('\u2022 Truncated requirement', 65, 671),
    item('\uf0d3 Contaminated work involves:', 65, 640), item('\u2022 Unreliable requirement.', 65, 626)
  ];
  const pages = [page, second].map(items => ({ items, height: 842 }));
  const details = achievementDetails(pages);
  assert.deepEqual(details.criteria, { achieved: '\u2022 Basic work continues.', merit: '\u2022 Capable work.', excellence: '\u2022 Excellent work.' });
  assert.deepEqual(details.requirements, [
    'Basic work involves:\n\u2022 First requirement',
    'Basic work involves:\n\u2022 Second requirement',
    'Basic work involves:\n\u2022 Third requirement with a continuation.',
    'Capable work involves:\n\u2022 Another requirement.'
  ]);
  assert.throws(() => achievementDetails([{ items: page.filter(entry => entry.str !== 'Excellence'), height: 842 }]), /ambiguous/);
});

test('Achievement notes starting at the top of a new page are not lost to the running footer', () => {
  const item = (str, x, y, width = str.length * 5) => ({ str, transform: [1, 0, 0, 1, x, y], width });
  const first = [
    item('Achievement Criteria', 50, 500), item('Achievement', 50, 470),
    item('Achievement with Merit', 200, 470), item('Achievement with Excellence', 360, 470),
    item('\u2022', 50, 425), item('Basic.', 65, 425), item('\u2022', 200, 425),
    item('Capable.', 215, 425), item('\u2022', 360, 425), item('Excellent.', 375, 425),
    item('Explanatory Notes', 50, 370), item('Background material.', 50, 100),
    item('\uf0d3 Publisher footer', 356, 20)
  ];
  const second = [
    item('Standard version 1 Page 2', 50, 806), item('2 Basic work involves:', 50, 773),
    item('\u2022 An achieved requirement.', 65, 759), item('\uf0d3 Publisher footer', 356, 20)
  ];
  const result = achievementDetails([first, second].map(items => ({ items, height: 842 })));
  assert.deepEqual(result.requirements, ['Basic work involves:\n\u2022 An achieved requirement.']);
});

test('reviewed standard criteria and requirements survive schedule export and import', () => {
  const source = 'Source: NZQA, Achievement Standard 99999, version 2 — https://www.nzqa.govt.nz/nqfdocs/ncea-resource/achievements/2026/as99999.pdf';
  const schedule = { achieved: 'Synthetic criteria', notes: source,
    requirements: [{ requirement: 'Synthetic requirement.\n\n' + source, grade: 'A', evidence: 'Existing evidence', judgement: 'Existing judgement' }] };
  const data = { standardNumber: '99999', version: '2', schedule: JSON.stringify(schedule) };
  assert.equal(validModerationContent(data), true);
  const imported = importDocument(renderDocument('schedule', data, 2026), 'schedule').document;
  assert.equal(imported.achieved, schedule.achieved);
  assert.equal(imported.notes, schedule.notes);
  assert.deepEqual(imported.requirements[0], { requirement: schedule.requirements[0].requirement,
    evidence: 'Existing evidence', judgement: 'Existing judgement' });
  const updated = fillDocument(renderDocument('schedule', data, 2026), 'schedule', data, 2026);
  assert.equal(importDocument(updated, 'schedule').document.notes, source);
});

test('schedule documents round-trip requirement text, evidence and judgement without per-requirement grades', () => {
  const requirements = [
    { requirement: 'Basic requirement', level: 'A', grade: 'N', evidence: 'Evidence' },
    { requirement: 'Merit requirement', level: 'M', grade: 'M' },
    { requirement: 'Excellence requirement', level: 'E', grade: 'M' },
    { requirement: 'Unclassified requirement', grade: 'N' }
  ];
  const data = { standardNumber: '99999', version: '2', schedule: JSON.stringify({ requirements, grade: 'E' }) };
  assert.equal(validModerationContent(data), true);
  const first = renderDocument('schedule', data, 2026);
  for (const buffer of [first, fillDocument(first, 'schedule', data, 2026)]) {
    const result = importDocument(buffer, 'schedule').document;
    assert.deepEqual(result.requirements, requirements.map(({ requirement, evidence = '', judgement = '' }) =>
      ({ requirement, evidence, judgement })));
    assert.equal(result.grade, 'E');
  }
  assert.deepEqual(JSON.parse(data.schedule).requirements, requirements, 'saved historical grades are unchanged');
});

test('Achievement schedules retain manual marks and levels in new and previously ungraded documents', () => {
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const requirements = [
    { requirement: 'Blank', level: 'A', evidence: 'Evidence', judgement: 'MET' },
    { requirement: 'Achieved', level: 'A', grade: 'A' },
    { requirement: 'Not achieved', level: 'M', grade: 'N' },
    { requirement: 'Conflicting historical mark', level: 'E', grade: 'M' },
    { requirement: 'Unknown level', grade: 'A' }
  ];
  const data = { standardNumber: '99999', standardType: 'Achievement',
    schedule: JSON.stringify({ requirements, grade: 'M' }) };
  const ungraded = renderDocument('schedule', { ...data, standardType: 'Unit' }, 2026);
  const first = renderDocument('schedule', data, 2026);
  const upgraded = fillDocument(ungraded, 'schedule', data, 2026);
  for (const buffer of [first, fillDocument(first, 'schedule', data, 2026), upgraded,
    fillDocument(upgraded, 'schedule', data, 2026)]) {
    const result = importDocument(buffer, 'schedule').document;
    assert.deepEqual(result.requirements, requirements.map(({ requirement, grade = '', level, evidence = '', judgement = '' }) =>
      ({ requirement, grade, ...(level ? { level } : {}), evidence, judgement })));
    assert.equal(result.grade, 'M');
    const doc = new DOMParser().parseFromString(new PizZip(buffer).file('word/document.xml').asText(), 'application/xml');
    const text = node => Array.from(node.getElementsByTagNameNS(W, 't')).map(t => t.textContent).join('');
    const rows = Array.from(doc.getElementsByTagNameNS(W, 'tr'));
    const columns = row => Array.from(row.childNodes).filter(node => node.namespaceURI === W && node.localName === 'tc');
    const header = rows.map(columns).find(c => c.some(cell => text(cell) === 'Key requirements (list):'));
    assert.deepEqual(header.map(cell => text(cell).trim()), ['Key requirements (list):', 'N', 'A', 'M', 'E',
      'Describe or attach the evidence considered.', 'Explain how the judgment was made.']);
    const conflict = rows.map(columns).find(c => text(c[0]) === 'Conflicting historical mark');
    assert.equal(text(conflict[3]), 'Yes (previously saved)');
    assert.equal(conflict.reduce((sum, cell) => sum + Number(cell.getElementsByTagNameNS(W, 'gridSpan')[0]?.getAttributeNS(W, 'val') || 1), 0), 29);
  }
});

test('new marking schedules use the illustrated colours, class code and compact grade layout', () => {
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const data = { subject: 'Digital Technologies', course: '11DTECH', studentId: 'Student A',
    standardNumber: '91897', schedule: JSON.stringify({ achieved: 'Criteria', merit: 'Merit criteria',
      excellence: 'Excellence criteria', grade: 'A', markerComments: 'Comment',
      requirements: [{ requirement: 'Planning', level: 'A', grade: 'A', evidence: 'Evidence' }] }) };
  const first = renderDocument('schedule', data, 2026);
  for (const buffer of [first, fillDocument(first, 'schedule', data, 2026)]) {
    const doc = new DOMParser().parseFromString(new PizZip(buffer).file('word/document.xml').asText(), 'application/xml');
    const kids = (node, tag) => Array.from(node.childNodes).filter(item => item.namespaceURI === W && item.localName === tag);
    const table = kids(doc.getElementsByTagNameNS(W, 'body')[0], 'tbl')[0];
    const rows = kids(table, 'tr'), cells = row => kids(row, 'tc');
    const text = node => Array.from(node.getElementsByTagNameNS(W, 't')).map(t => t.textContent).join('');
    const fill = node => node.getElementsByTagNameNS(W, 'shd')[0]?.getAttributeNS(W, 'fill').toUpperCase();
    const label = value => rows.find(row => cells(row).some(cell => text(cell) === value));
    const identity = cells(rows[3]);
    assert.equal(text(identity[2]), 'Class Code'); assert.equal(text(identity[3]), '11DTECH');
    assert.equal(fill(identity[0]), '0000FF'); assert.equal(fill(identity[1]), 'FFFF00');
    const criteria = cells(label('Achieved Grade Criteria'));
    assert.deepEqual(criteria.map(fill), ['0000FF', '0000FF', '0000FF']);
    for (const cell of criteria) {
      const run = cell.getElementsByTagNameNS(W, 'r')[0];
      assert.equal(run.getElementsByTagNameNS(W, 'color')[0].getAttributeNS(W, 'val'), 'FFFFFF');
    }
    const requirements = cells(label('Key requirements (list):'));
    assert.deepEqual(requirements.map(fill), Array(3).fill('0000FF'));
    assert.deepEqual(requirements.map(cell => text(cell).trim()), ['Key requirements (list):',
      'Describe or attach the evidence considered.', 'Explain how the judgment was made.']);
    const entry = cells(label('Planning'));
    assert.deepEqual(entry.map(fill), Array(3).fill('FFFFFF'));
    assert.deepEqual(entry.map(text), ['Planning', 'Evidence', '']);
    assert.equal(entry.reduce((sum, cell) =>
      sum + Number(cell.getElementsByTagNameNS(W, 'gridSpan')[0]?.getAttributeNS(W, 'val') || 1), 0), 29);
    const heading = cells(label('Marking Grade')), overall = cells(label('OVERALL GRADE:'));
    assert.deepEqual(heading.map(text), ['', 'Marking Grade', 'Marker’s Comments']);
    assert.deepEqual(heading.map(fill), ['9900FF', '9900FF', '9900FF']);
    assert.deepEqual(overall.map(text), ['OVERALL GRADE:', 'A', 'Comment']);
    for (const row of [heading, overall]) {
      assert.deepEqual(row.map(cell => cell.getElementsByTagNameNS(W, 'gridSpan')[0].getAttributeNS(W, 'val')), ['4', '5', '20']);
    }
    assert.equal(overall[1].getElementsByTagNameNS(W, 'sz')[0].getAttributeNS(W, 'val'), '64');
    const imported = importDocument(buffer, 'schedule');
    assert.equal(imported.common.subject, data.subject);
    assert.equal(imported.common.course, data.course);
    assert.equal(imported.document.grade, 'A');
    assert.equal(imported.document.markerComments, 'Comment');
  }
});

test('new unit schedules retain their single-grade marking and legacy schedules retain subject imports', () => {
  const data = { subject: 'Computing', course: '11COMP', standardType: 'Unit', standardNumber: '29785',
    schedule: JSON.stringify({ achieved: 'Outcome', requirements: [{ requirement: 'Task', level: 'A', grade: 'A' }], grade: 'A' }) };
  const imported = importDocument(renderDocument('schedule', data, 2026), 'schedule');
  assert.equal(imported.common.course, '11COMP');
  assert.equal(imported.document.grade, 'A');
  assert.equal(imported.document.requirements[0].grade, undefined);
  const old = fillDocument(fs.readFileSync(require('node:path').join(__dirname, 'templates', 'schedule.docx')), 'schedule', data, 2026);
  const legacy = importDocument(old, 'schedule');
  assert.equal(legacy.common.subject, 'Computing');
  assert.equal(legacy.common.course, undefined);
});

test('older schedules with and without N import their saved grades but updates use ungraded requirement columns', () => {
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const kids = (node, tag) => Array.from(node.childNodes).filter(item => item.namespaceURI === W && item.localName === tag);
  const set = (cell, value) => Array.from(cell.getElementsByTagNameNS(W, 't')).forEach((t, i) => { t.textContent = i ? '' : value; });
  for (const withNotAchieved of [false, true]) {
    const zip = new PizZip(fs.readFileSync(require('node:path').join(__dirname, 'templates', 'schedule.docx')));
    const doc = new DOMParser().parseFromString(zip.file('word/document.xml').asText(), 'application/xml');
    const table = doc.getElementsByTagNameNS(W, 'tbl')[0];
    if (withNotAchieved) for (const index of [10, 11]) {
      const row = kids(table, 'tr')[index], c = kids(row, 'tc');
      c[0].getElementsByTagNameNS(W, 'gridSpan')[0].setAttributeNS(W, 'w:val', '5');
      const added = c[1].cloneNode(true);
      added.getElementsByTagNameNS(W, 'gridSpan')[0].setAttributeNS(W, 'w:val', '2');
      set(added, index === 10 ? 'N' : '');
      row.insertBefore(added, c[1]);
    }
    const columns = kids(kids(table, 'tr')[11], 'tc');
    set(columns[0], 'Legacy requirement'); set(columns[withNotAchieved ? 3 : 2], 'Yes');
    if (withNotAchieved) for (const index of [2, 4]) set(columns[index], '\u2014');
    set(columns.at(-2), 'Legacy evidence'); set(columns.at(-1), 'Legacy judgement');
    zip.file('word/document.xml', new XMLSerializer().serializeToString(doc));
    const buffer = zip.generate({ type: 'nodebuffer' });
    const imported = importDocument(buffer, 'schedule').document;
    assert.equal(imported.requirements[0].requirement, 'Legacy requirement');
    assert.equal(imported.requirements[0].grade, 'M');
    assert.equal(imported.requirements[0].level, withNotAchieved ? 'M' : undefined);
    const updated = fillDocument(buffer, 'schedule', { schedule: JSON.stringify({ ...imported, grade: 'E' }) }, 2026);
    const result = importDocument(updated, 'schedule').document;
    assert.deepEqual(result.requirements, [{ requirement: 'Legacy requirement', evidence: 'Legacy evidence', judgement: 'Legacy judgement' }]);
    assert.equal(result.grade, 'E');
    const achievement = fillDocument(buffer, 'schedule', { standardType: 'Achievement', schedule: JSON.stringify(imported) }, 2026);
    const retained = importDocument(achievement, 'schedule').document.requirements[0];
    assert.equal(retained.grade, 'M');
    assert.equal(retained.level, withNotAchieved ? 'M' : undefined);
    assert.equal(retained.evidence, 'Legacy evidence');
    assert.equal(retained.judgement, 'Legacy judgement');
  }
});

test('schedule imports preserve requirement evidence when empty grade cells are merged', () => {
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const kids = (node, tag) => Array.from(node.childNodes).filter(item => item.namespaceURI === W && item.localName === tag);
  const set = (cell, value) => Array.from(cell.getElementsByTagNameNS(W, 't')).forEach((t, i) => { t.textContent = i ? '' : value; });
  const zip = new PizZip(fs.readFileSync(require('node:path').join(__dirname, 'templates', 'schedule.docx')));
  const doc = new DOMParser().parseFromString(zip.file('word/document.xml').asText(), 'application/xml');
  const table = doc.getElementsByTagNameNS(W, 'tbl')[0];
  const row = kids(table, 'tr')[11], columns = kids(row, 'tc');
  set(columns[0], 'Requirement'); set(columns[1], 'Yes');
  set(columns[2], ''); set(columns[3], '');
  set(columns[4], 'Evidence'); set(columns[5], 'Judgement');
  const span = cell => Number(cell.getElementsByTagNameNS(W, 'gridSpan')[0].getAttributeNS(W, 'val'));
  columns[2].getElementsByTagNameNS(W, 'gridSpan')[0].setAttributeNS(W, 'w:val', String(span(columns[2]) + span(columns[3])));
  row.removeChild(columns[3]);
  const spacer = row.cloneNode(true);
  for (const cell of kids(spacer, 'tc')) set(cell, '');
  table.insertBefore(spacer, row.nextSibling);
  const encode = () => {
    zip.file('word/document.xml', new XMLSerializer().serializeToString(doc));
    return zip.generate({ type: 'nodebuffer' });
  };
  assert.deepEqual(importDocument(encode(), 'schedule').document.requirements,
    [{ requirement: 'Requirement', grade: 'A', evidence: 'Evidence', judgement: 'Judgement' }]);
  set(columns[2], 'Yes');
  assert.throws(() => importDocument(encode(), 'schedule'), /requirement row has unsupported columns/);
});

test('internal evaluation survives generated document export and import without duplicate sections', () => {
  const evaluation = { evaluationName: 'Evaluator', evaluationPosition: 'Teacher',
    evaluationDate: '2026-03-09', evaluationComments: 'First line\nSecond line', reviewed: 'Yes' };
  const data = { standardNumber: '29777', version: '2', internal: JSON.stringify(evaluation) };
  assert.equal(validModerationContent(data), true);
  const first = renderDocument('internal', data, 2026);
  const second = fillDocument(first, 'internal', data, 2026);
  const imported = importDocument(second, 'internal').document;
  for (const [key, value] of Object.entries(evaluation)) assert.equal(imported[key], value);
  const xml = new PizZip(second).file('word/document.xml').asText();
  assert.equal((xml.match(/Assessment Evaluation/g) || []).length, 1);
});

test('internal exports omit saved sighted details until verifier name and date are present', () => {
  const sighted = { signatory: 'Synthetic Observer', signatoryPosition: 'Teacher', signatoryDate: '2026-11-16' };
  for (const verification of [{}, { verifierName: 'Verifier' }, { verificationDate: '2026-11-15' },
    { verifierName: ' ', verificationDate: '2026-11-15' }]) {
    const data = { internal: JSON.stringify({ ...sighted, ...verification }) };
    const imported = importDocument(renderDocument('internal', data, 2026), 'internal').document;
    for (const key of Object.keys(sighted)) assert.equal(imported[key] || '', '');
    assert.deepEqual(JSON.parse(data.internal), { ...sighted, ...verification });
  }
  const data = { internal: JSON.stringify({ ...sighted, verifierName: 'Verifier', verificationDate: '2026-11-15' }) };
  const first = renderDocument('internal', data, 2026);
  for (const buffer of [first, fillDocument(first, 'internal', data, 2026)]) {
    const imported = importDocument(buffer, 'internal').document;
    for (const key of ['signatory', 'signatoryDate']) assert.equal(imported[key], sighted[key]);
  }
});

test('random initials and generated sample slots are validated before saving', () => {
  const internal = value => validModerationContent({ internal: JSON.stringify(value) });
  assert.equal(internal({ randomInitialsA: 'ŌK', samples: [{ student: 'Student A - ŌK', randomSlot: 'A' }] }), true);
  assert.equal(internal({ randomInitialsA: 'A1' }), false);
  assert.equal(internal({ randomInitialsA: 'ABCDEFGHIJK' }), false);
  assert.equal(internal({ samples: [{ student: 'Student A - FH', randomSlot: 'E' }] }), false);
});

test('marking students require unique identities and cannot be attached to a child roster', () => {
  const person = { id: 'k:1', name: 'Example, Alpha', email: 'alpha@example.test', initials: 'AE', record: child };
  const valid = students => validModerationContent({ markingStudents: JSON.stringify(students) });
  assert.equal(valid([person]), true);
  assert.equal(valid([{ ...person, enteredKamar: true }]), true);
  assert.equal(valid([{ ...person, enteredKamar: 'Yes' }]), false);
  assert.equal(valid([{ ...person, courses: ['11DTECH', '12COMP'] }]), true);
  assert.equal(valid([{ ...person, courses: ['11DTECH', '11DTECH'] }]), false);
  assert.equal(valid([{ ...person, courses: [' 11DTECH'] }]), false);
  assert.equal(valid([person, { ...person, id: 'k:2', record }]), false);
  assert.equal(valid([person, { ...person, email: 'beta@example.test', id: 'k:2' }]), false);
  assert.equal(valid([{ ...person, initials: 'A1' }]), false);
  assert.equal(validModerationContent({ parentRecord: record, markingStudents: JSON.stringify([person]) }), false);
  assert.equal(validModerationContent({ parentRecord: record, additionalMarking: 'Yes' }), true);
  assert.equal(validModerationContent({ additionalMarking: 'Yes' }), false);
});

test('retention auto-processing metadata is validated before saving', () => {
  const internal = value => validModerationContent({ internal: JSON.stringify(value) });
  assert.equal(internal({ retentionLocation: 'Shared folder', retained: 'No', retentionAutoProcessed: 'Yes' }), true);
  assert.equal(internal({ retentionAutoProcessed: 'invalid' }), false);
});

test('internal document formats assessment details and critique rows on create and update', () => {
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const internal = { critiqueName: 'Synthetic Critiquer', critiqueSchool: 'Synthetic School', critiqueDate: '2026-02-02',
    moderatorReport: 'Yes', conditions: 'Not applicable' };
  const data = { department: 'Technology', teacher: 'Teacher', assessors: 'Assessor', standardNumber: '91897',
    version: '1', credits: '6', level: '2', internal: JSON.stringify(internal) };
  const first = renderDocument('internal', data, 2026);
  for (const buffer of [first, fillDocument(first, 'internal', data, 2026)]) {
    const doc = new DOMParser().parseFromString(new PizZip(buffer).file('word/document.xml').asText(), 'application/xml');
    const kids = (node, tag) => Array.from(node.childNodes).filter(item => item.namespaceURI === W && item.localName === tag);
    const body = doc.getElementsByTagNameNS(W, 'body')[0], table = kids(body, 'tbl')[0];
    const row = i => kids(table, 'tr')[i], cell = (r, c) => kids(row(r), 'tc')[c];
    const heading = kids(body, 'p').map(p => p.textContent).find(line => line.startsWith('Faculty / Department:'));
    assert.equal(heading, 'Faculty / Department: Technology    Teacher in Charge: Teacher    Assessor: Assessor');
    assert.ok(!kids(body, 'p').some(p => p.textContent.startsWith('Assessor:')));
    for (const [r, c, label, value] of [[1, 2, 'Standard Number: ', '91897'], [1, 3, 'Version: ', '1'],
      [3, 0, 'Credits: ', '6'], [3, 1, 'NZQF Level: ', '2'],
      [21, 0, "Critiquer's name: ", 'Synthetic Critiquer'], [21, 1, 'School: ', 'Synthetic School'],
      [21, 2, 'Date: ', '02-02-2026']]) {
      const runs = kids(kids(cell(r, c), 'p')[0], 'r');
      assert.deepEqual(runs.map(run => run.textContent), [label, value]);
      assert.deepEqual(runs.map(run => run.getElementsByTagNameNS(W, 'b')[0].getAttributeNS(W, 'val')), ['1', '0']);
    }
    for (const r of [10, 11]) {
      assert.equal(cell(r, 1).textContent, 'No');
      assert.equal(cell(r, 1).getElementsByTagNameNS(W, 'shd')[0].getAttributeNS(W, 'fill'), 'FFFF00');
    }
    assert.equal(cell(11, 2).getElementsByTagNameNS(W, 'shd')[0].getAttributeNS(W, 'fill'), 'FFFFFF');
    const assessment = Array.from(cell(13, 0).getElementsByTagNameNS(W, 'r')).find(run => /\bassessment\b/i.test(run.textContent));
    assert.equal(assessment.getElementsByTagNameNS(W, 'u')[0].getAttributeNS(W, 'val'), 'none');
    for (let r = 13; r <= 20; r++) for (const col of kids(row(r), 'tc')) for (const p of kids(col, 'p')) {
      const spacing = kids(kids(p, 'pPr')[0], 'spacing')[0];
      assert.equal(spacing.getAttributeNS(W, 'line'), '360');
      assert.equal(spacing.getAttributeNS(W, 'lineRule'), 'auto');
    }
    assert.equal(cell(22, 0).getElementsByTagNameNS(W, 'pageBreakBefore')[0].getAttributeNS(W, 'val'), '1');
    const imported = importDocument(buffer, 'internal');
    assert.equal(imported.common.assessors, 'Assessor');
    assert.equal(imported.document.critiqueDate, '2026-02-02');
    assert.equal(imported.document.moderatorReport, 'Yes');
    assert.equal(imported.document.conditions, 'Not applicable');
    assert.equal(imported.document.externalFeedback, 'No');
    assert.equal(imported.document.previousCritique, 'No');
  }
  const explicit = importDocument(renderDocument('internal', {
    internal: JSON.stringify({ externalFeedback: 'Not applicable', previousCritique: 'Yes' })
  }, 2026), 'internal').document;
  assert.equal(explicit.externalFeedback, 'Not applicable');
  assert.equal(explicit.previousCritique, 'Yes');
});

function testQuery() {
  const records = new Map();
  const settings = new Map();
  const audit = [];
  const key = (ownerId, year, entry) => [ownerId, year, entry].join(':');
  return {
    records, settings, audit,
    async query(sql, params = []) {
      if (sql.includes("SELECT content->>'folderId' AS folder_id")) {
        const [ownerId, year] = params;
        const match = [...records.entries()].filter(([address, row]) =>
          address.startsWith(ownerId + ':') && address.endsWith(':main') &&
          Number(address.split(':')[1]) !== year && row.content.folderId
        ).sort(([a], [b]) => Number(b.split(':')[1]) - Number(a.split(':')[1]))[0];
        return { rows: match ? [{ folder_id: match[1].content.folderId, folder_name: match[1].content.folderName }] : [] };
      }
      if (sql.includes('SELECT content,revision,updated_at FROM assessment_records')) {
        const row = records.get(key(...params));
        return { rows: row ? [{ content: row.content, revision: row.revision, updated_at: row.updated_at }] : [] };
      }
      if (sql.includes('INSERT INTO assessment_records')) {
        const [ownerId, year, entry, parent, content, action] = params;
        const address = key(ownerId, year, entry);
        if (records.has(address)) return { rows: [] };
        const parsed = JSON.parse(content);
        records.set(address, { content: parsed, parent_record: parent, revision: 1, updated_at: '2026-11-14T00:00:00Z' });
        audit.push({ ownerId, year, entry, action, revision: 1 });
        return { rows: [{ revision: 1, updated_at: '2026-11-14T00:00:00Z' }] };
      }
      if (sql.includes('UPDATE assessment_records')) {
        const [ownerId, year, entry, parent, content, revision, action] = params;
        const address = key(ownerId, year, entry), row = records.get(address);
        if (!row || row.revision !== revision) return { rows: [] };
        row.content = JSON.parse(content);
        row.parent_record = parent;
        row.revision += 1;
        row.updated_at = '2026-11-14T00:00:00Z';
        audit.push({ ownerId, year, entry, action, revision: row.revision });
        return { rows: [{ revision: row.revision, updated_at: row.updated_at }] };
      }
      if (sql.includes('WITH deleted AS')) {
        const [ownerId, year, entry, revision] = params;
        const address = key(ownerId, year, entry), row = records.get(address);
        const hasChild = [...records.values()].some(item => item.parent_record === entry);
        if (!row || row.revision !== revision || hasChild) return { rows: [] };
        records.delete(address);
        audit.push({ ownerId, year, entry, action: 'deleted', revision });
        return { rows: [{ entry_key: entry }] };
      }
      if (sql.includes("SELECT entry_key,content->>'driveDocuments' AS documents")) {
        const [ownerId, year, parent] = params;
        return { rows: [...records.entries()].filter(([address, row]) =>
          address.startsWith(ownerId + ':' + year + ':') && row.parent_record === parent)
          .map(([address, row]) => ({ entry_key: address.split(':')[2], documents: row.content.driveDocuments })) };
      }
      if (sql.includes('SELECT 1 FROM assessment_records')) {
        const row = records.get(key(...params));
        return { rows: row && row.parent_record === null ? [{ one: 1 }] : [] };
      }
      if (sql.includes('SELECT content,revision,updated_at FROM assessment_settings')) {
        const row = settings.get(key(...params, 'settings'));
        return { rows: row ? [{ content: row.content, revision: row.revision, updated_at: row.updated_at }] : [] };
      }
      if (sql.includes('INSERT INTO assessment_settings')) {
        const [ownerId, year, content] = params, address = key(ownerId, year, 'settings');
        if (settings.has(address)) return { rows: [] };
        settings.set(address, { content: JSON.parse(content), revision: 1, updated_at: '2026-11-14T00:00:00Z' });
        audit.push({ ownerId, year, entry: 'standards', action: 'settings-updated', revision: 1 });
        return { rows: [{ revision: 1, updated_at: '2026-11-14T00:00:00Z' }] };
      }
      if (sql.includes('UPDATE assessment_settings')) {
        const [ownerId, year, content, revision] = params, address = key(ownerId, year, 'settings');
        const row = settings.get(address);
        if (!row || row.revision !== revision) return { rows: [] };
        row.content = JSON.parse(content);
        row.revision += 1;
        audit.push({ ownerId, year, entry: 'standards', action: 'settings-updated', revision: row.revision });
        return { rows: [{ revision: row.revision, updated_at: row.updated_at }] };
      }
      if (sql.includes('FROM assessment_records WHERE owner_id=$1 AND NULLIF(TRIM(content->>')) {
        return { rows: [] };
      }
      throw new Error('Unexpected SQL in test: ' + sql);
    }
  };
}

async function createServer(t, { query = testQuery().query, loadStaff, loadTeachingSubjects, loadClassSize, checkConsent, session = {} } = {}) {
  let userId = owner;
  const app = express();
  app.use((req, res, next) => {
    req.user = { id: userId, email: 'teacher@example.test', roles: ['Teacher'] };
    req.session = session;
    next();
  });
  app.use('/api/moderation', createAssessmentRouter({ query, loadStaff, loadTeachingSubjects, loadClassSize, checkConsent, env: {} }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    res.status(500).json({ error: 'Test request failed.' });
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return {
    base: `http://127.0.0.1:${server.address().port}/api/moderation/`,
    setUser: value => { userId = value; }
  };
}

async function csrf(base) {
  const response = await fetch(base + 'session');
  assert.equal(response.status, 200);
  return (await response.json()).csrf;
}

function put(base, token, year, id, content, revision) {
  return fetch(base + year + '/moderation/' + id, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-assessment-csrf': token },
    body: JSON.stringify({ content, revision })
  });
}

test('marking document links are limited to the assessment owner and omit form content', async t => {
  const store = testQuery(), app = await createServer(t, { query: store.query });
  const token = await csrf(app.base);
  assert.equal((await put(app.base, token, 2026, record, { title: 'Assessment' }, 0)).status, 200);
  const links = { schedule: { id: 'document_id_123', name: 'Private file',
    mimeType: 'application/vnd.google-apps.document' } };
  assert.equal((await put(app.base, token, 2026, child, { parentRecord: record,
    studentName: 'Private student', driveDocuments: JSON.stringify(links) }, 0)).status, 200);
  const url = app.base + 'moderation/2026/' + record + '/marking-documents';
  const result = await (await fetch(url)).json();
  assert.deepEqual(result, { records: [{ record: child, documents: {
    schedule: { id: 'document_id_123', mimeType: 'application/vnd.google-apps.document' }
  } }] });
  assert.doesNotMatch(JSON.stringify(result), /Private/);
  app.setUser(otherOwner);
  assert.equal((await fetch(url)).status, 404);
});

test('new years inherit only the owner main folder, preserving year-specific setup and revisions', async t => {
  const store = testQuery(), app = await createServer(t, { query: store.query });
  const token = await csrf(app.base);
  assert.equal((await put(app.base, token, 2026, 'main', {
    folderId: 'original_root_123', folderName: 'Internal Moderation', folderTopics: '["Database"]'
  }, 0)).status, 200);
  const newYear = await (await fetch(app.base + '2027/moderation/main')).json();
  assert.deepEqual(newYear.content, { folderId: 'original_root_123', folderName: 'Internal Moderation' });
  assert.equal(newYear.revision, 0);
  assert.equal((await put(app.base, token, 2027, 'main', { folderTopics: '["Spreadsheet"]' }, 0)).status, 200);
  const configured = await (await fetch(app.base + '2027/moderation/main')).json();
  assert.equal(configured.content.folderId, 'original_root_123');
  assert.equal(configured.content.folderTopics, '["Spreadsheet"]');
  assert.equal(configured.revision, 1);
  assert.equal((await put(app.base, token, 2027, 'main', {
    folderId: 'different_root_123', folderName: 'Different folder'
  }, 1)).status, 200);
  assert.equal((await (await fetch(app.base + '2027/moderation/main')).json()).content.folderId, 'different_root_123');
  app.setUser(otherOwner);
  assert.deepEqual((await (await fetch(app.base + '2028/moderation/main')).json()).content, {});
});

test('moderation records are private, revision-checked and metadata-audited', async t => {
  const store = testQuery();
  const app = await createServer(t, { query: store.query });
  const token = await csrf(app.base);
  const content = { title: 'Biology assessment', standardNumber: '29785' };

  assert.equal((await put(app.base, '', 2026, record, content, 0)).status, 403);
  const created = await put(app.base, token, 2026, record, content, 0);
  assert.equal(created.status, 200);
  assert.equal((await created.json()).revision, 1);
  assert.equal((await put(app.base, token, 2026, record, content, 0)).status, 409);

  app.setUser(otherOwner);
  const hidden = await fetch(app.base + '2026/moderation/' + record);
  assert.equal(hidden.status, 200);
  assert.deepEqual(await hidden.json(), { content: {}, revision: 0, updated_at: null });
  app.setUser(owner);

  assert.equal(store.audit.length, 1);
  assert.deepEqual(store.audit[0], { ownerId: owner, year: 2026, entry: record, action: 'created', revision: 1 });
  assert.deepEqual(store.records.get([owner, 2026, record].join(':')).content, content);
});

test('parent assessment cannot be deleted while student moderation records remain', async t => {
  const store = testQuery();
  const app = await createServer(t, { query: store.query });
  const token = await csrf(app.base);
  assert.equal((await put(app.base, token, 2026, record, { title: 'Assessment' }, 0)).status, 200);
  assert.equal((await put(app.base, token, 2026, child, { title: 'Student schedule', parentRecord: record }, 0)).status, 200);
  assert.equal([...store.records.values()].some(item => item.parent_record === record), true);

  const removeParent = () => fetch(app.base + 'moderation/2026/' + record, {
    method: 'DELETE', headers: { 'Content-Type': 'application/json', 'x-assessment-csrf': token },
    body: JSON.stringify({ revision: 1 })
  });
  assert.equal((await removeParent()).status, 409);
  const removeChild = await fetch(app.base + 'moderation/2026/' + child, {
    method: 'DELETE', headers: { 'Content-Type': 'application/json', 'x-assessment-csrf': token },
    body: JSON.stringify({ revision: 1 })
  });
  assert.equal(removeChild.status, 200);
  assert.equal((await removeParent()).status, 200);
});

test('standards settings are private and use optimistic revisions', async t => {
  const store = testQuery();
  const app = await createServer(t, { query: store.query });
  const token = await csrf(app.base);
  const standard = { number: '29785', subject: 'Biology', title: 'Assessment', credits: '5 credits',
    assessment: 'Internal', url: 'https://www.nzqa.govt.nz/nqfdocs/ncea-resource/achievements/as29785.pdf' };
  const save = (revision, item) => fetch(app.base + '2026/assessmentSetup/main', {
    method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-assessment-csrf': token },
    body: JSON.stringify({ revision, content: { selectedStandards: JSON.stringify([item]) } })
  });
  assert.equal((await save(0, standard)).status, 200);
  assert.equal((await save(0, standard)).status, 409);

  app.setUser(otherOwner);
  const hidden = await fetch(app.base + '2026/assessmentSetup/main');
  assert.deepEqual(await hidden.json(), { content: {}, revision: 0, updated_at: null });
  app.setUser(owner);
  assert.equal((await (await fetch(app.base + '2026/assessmentSetup/main')).json()).revision, 1);
  assert.equal((await save(1, { ...standard, url: 'https://example.test/standard.pdf' })).status, 400);
});

test('saved standards accept official NZQA links and reject malformed or duplicate entries', () => {
  const item = { number: '29785', subject: 'Biology', title: 'Assessment', credits: '5 credits',
    assessment: 'Internal', url: 'https://www.nzqa.govt.nz/nqfdocs/ncea-resource/achievements/as29785.pdf' };
  assert.equal(validSelectedStandards(JSON.stringify([item])), true);
  assert.equal(validSelectedStandards(JSON.stringify([{ ...item, topic: 'Database' }])), true);
  assert.equal(validSelectedStandards(JSON.stringify([item, item])), false);
  assert.equal(validSelectedStandards(JSON.stringify([{ ...item, topic: 'Database/Spreadsheet' }])), false);
  assert.equal(validSelectedStandards(JSON.stringify([{ ...item, url: 'https://example.test/standard.pdf' }])), false);
  assert.equal(validModerationContent({ title: 'Assessment', standardNumber: '29785' }), true);
  assert.equal(validModerationContent({ folderTopics: '["Database","Spreadsheet"]' }), true);
  assert.equal(validModerationContent({ folderTopics: '["Database","database"]' }), false);
  assert.equal(validModerationContent({ folderTopics: '["Database/Spreadsheet"]' }), false);
  const levels = Object.fromEntries(['1', '2', '3'].map(level => [level, { id: 'level_folder_' + level, standards: [] }]));
  assert.equal(validModerationContent({ folderLinks: JSON.stringify({ root: 'folder_id_123',
    year: { id: 'year_folder_123', name: '2027' },
    topics: [{ id: 'topic_folder_123', name: 'Database', levels }] }) }), true);
  const topicLinks = standards => validModerationContent({ folderLinks: JSON.stringify({ root: 'folder_id_123',
    year: { id: 'year_folder_123', name: '2026' }, topics: [{ id: 'topic_folder_123', name: 'Database', standards }] }) });
  assert.equal(topicLinks([{ id: 'standard_folder_1', level: '2', number: '91892' }]), true);
  assert.equal(topicLinks([{ id: 'standard_folder_1', level: '4', number: '91892' }]), false);
  assert.equal(topicLinks([{ id: 'standard_folder_1', level: '2', number: '91892', name: 'Level 2 - 91892' }]), false);
  assert.equal(validModerationContent({ title: 'Assessment', unexpected: 'value' }), false);
});

test('teaching subjects return validated subject and course pairs and hide Core failures', async t => {
  let response = { classes: [{ subject: 'DTECH', course: '13DTECH', email: 'hidden@example.test' }],
    departments: [{ name: 'Technology', teachers: ['Synthetic Peer'], emails: ['hidden@example.test'] }] }, years = [];
  const app = await createServer(t, { loadTeachingSubjects: async (req, year) => { years.push(year); if (response instanceof Error) throw response; return response; } });
  const ok = await fetch(app.base + 'teaching-subjects/2026');
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { classes: [{ subject: 'DTECH', course: '13DTECH' }], departments: [{ name: 'Technology', teachers: ['Synthetic Peer'] }] });
  assert.deepEqual(years, [2026]);
  assert.equal((await fetch(app.base + 'teaching-subjects/1999')).status, 400);
  response = { classes: [], departments: [{ name: 'Technology', teachers: [''] }] };
  assert.equal((await fetch(app.base + 'teaching-subjects/2026')).status, 502);
  response = { classes: [{ subject: 'DTECH', course: '' }] };
  assert.equal((await fetch(app.base + 'teaching-subjects/2026')).status, 502);
  response = new Error('secret Core detail');
  const failed = await fetch(app.base + 'teaching-subjects/2026');
  assert.equal(failed.status, 502);
  assert.doesNotMatch((await failed.json()).error, /secret/);
  const missing = await createServer(t);
  assert.equal((await fetch(missing.base + 'teaching-subjects/2026')).status, 503);
});

test('KAMAR staff lookup omits school email fields and Word templates can be downloaded and imported', async t => {
  const store = testQuery();
  const app = await createServer(t, {
    query: store.query,
    loadStaff: async () => ({ staff: [{ id: '123', code: 'ABC', first_name: 'Staff', last_name: 'Member' }],
      departments: [{ name: 'Science', teacher: '', leaders: [] }] })
  });
  const staff = await fetch(app.base + 'staff');
  assert.equal(staff.status, 200);
  assert.deepEqual(await staff.json(), {
    staff: [{ id: '123', name: 'Staff Member (ABC)', uses: 0 }],
    departments: [{ name: 'Science', teacher: '', leaders: [] }]
  });
  const template = await fetch(app.base + 'moderation/templates/schedule');
  assert.equal(template.status, 200);
  assert.match(template.headers.get('content-type'), /wordprocessingml/);
  const docx = Buffer.from(await template.arrayBuffer());
  assert.ok(docx.byteLength > 1000);
  const imported = await fetch(app.base + 'moderation/import/schedule', {
    method: 'POST',
    headers: { 'Content-Type': DOCX, 'x-assessment-csrf': await csrf(app.base) },
    body: renderDocument('schedule', {}, 2026)
  });
  assert.equal(imported.status, 200, await imported.text());
});

test('internal import reads older cover sheets whose Section C and D answers sit in separate cells', () => {
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const zip = new PizZip(fs.readFileSync(require('node:path').join(__dirname, 'templates', 'internal.docx')));
  const doc = new DOMParser().parseFromString(zip.file('word/document.xml').asText(), 'application/xml');
  const kids = (node, tag) => Array.from(node.childNodes).filter(item => item.namespaceURI === W && item.localName === tag);
  const table = kids(doc.getElementsByTagNameNS(W, 'body')[0], 'tbl')[0];
  const row = i => kids(table, 'tr')[i], cell = (r, c) => kids(row(r), 'tc')[c];
  const set = (node, value) => Array.from(node.getElementsByTagNameNS(W, 't')).forEach((t, i) => { t.textContent = i ? '' : value; });
  const after = (node, value) => { const copy = node.cloneNode(true); set(copy, value); node.parentNode.insertBefore(copy, node.nextSibling); };
  set(cell(24, 0), 'Verifier name: Synthetic Verifier'); after(cell(24, 3), '05/11/2026');
  after(cell(27, 0), 'Position:');
  set(cell(29, 0), 'Results loaded into student management system:'); after(cell(29, 0), 'Yes'); after(cell(29, 2), '06/11/2026');
  set(cell(25, 0), 'Evidence/location of verification: (Evidence of verification is available on Overleaf, attached or at location (specify):)');
  set(cell(30, 1), 'Yes'); set(cell(30, 2), 'Location / file path:  '); table.removeChild(row(31));
  for (const r of [31, 32, 33]) { set(cell(r, 1), r === 32 ? 'No' : 'Yes'); row(r).removeChild(cell(r, 2)); }
  zip.file('word/document.xml', new XMLSerializer().serializeToString(doc));
  const { document } = importDocument(zip.generate({ type: 'nodebuffer' }), 'internal');
  assert.deepEqual([document.verifierName, document.verificationDate, document.verificationEvidence, document.signatoryDate,
    document.resultsLoaded, document.resultsDate, document.retained, document.retentionLocation,
    document.randomSelection, document.reviewed, document.benchmarks],
  ['Synthetic Verifier', '2026-11-05', '', '', 'Yes', '2026-11-06', 'Yes', '', 'Yes', 'No', 'Yes']);
});
test('internal import accepts legacy labels and keeps a sighted name separate from its inline position', () => {
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const zip = new PizZip(fs.readFileSync(require('node:path').join(__dirname, 'templates', 'internal.docx')));
  const doc = new DOMParser().parseFromString(zip.file('word/document.xml').asText(), 'application/xml');
  const kids = (node, tag) => Array.from(node.childNodes).filter(item => item.namespaceURI === W && item.localName === tag);
  const body = doc.getElementsByTagNameNS(W, 'body')[0];
  const table = kids(body, 'tbl')[0];
  let appendix = false;
  for (const paragraph of kids(body, 'p')) {
    if (paragraph.textContent === 'Planner record details') appendix = true;
    if (appendix) body.removeChild(paragraph);
  }
  const cell = (r, c) => kids(kids(table, 'tr')[r], 'tc')[c];
  const set = (node, value) => Array.from(node.getElementsByTagNameNS(W, 't')).forEach((t, i) => { t.textContent = i ? '' : value; });
  set(cell(1, 2), 'Standard Number: 29777');
  set(cell(21, 0), "Critiquers' Name: Synthetic Critiquer");
  set(cell(24, 0), 'Verifier Name:Synthetic Verifier');
  set(cell(24, 1), 'School:Synthetic School');
  set(cell(24, 2), 'Position:TIC');
  set(cell(24, 3), 'Date:26/05/2026');
  set(cell(25, 0), 'Evidence of verification is available overleaf, attached or at the location (specify):');
  set(cell(27, 0), 'Signed: Synthetic Observer    Position: TIC Digital Tech');
  set(cell(27, 1), 'Date:27/05/2026');
  set(cell(29, 0), 'Results loaded into the student management system: Yes');
  set(cell(29, 1), 'Date:03/06/2026');
  set(cell(31, 0), 'Location or file path: Synthetic archive');
  zip.file('word/document.xml', new XMLSerializer().serializeToString(doc));
  const buffer = zip.generate({ type: 'nodebuffer' });
  const { common, document } = importDocument(buffer, 'internal');
  assert.equal(common.standardNumber, '29777');
  assert.deepEqual([document.critiqueName, document.verifierName, document.verificationDate,
    document.verificationEvidence, document.signatory, document.signatoryPosition, document.signatoryDate,
    document.resultsLoaded, document.resultsDate, document.retentionLocation],
  ['Synthetic Critiquer', 'Synthetic Verifier', '2026-05-26', '', 'Synthetic Observer', 'TIC Digital Tech',
    '2026-05-27', 'Yes', '2026-06-03', 'Synthetic archive']);
  const rendered = fillDocument(buffer, 'internal', { ...common, internal: JSON.stringify(document) }, 2026);
  const again = importDocument(Buffer.from(rendered), 'internal').document;
  assert.deepEqual([again.signatory, again.signatoryPosition, again.verificationDate, again.resultsLoaded, again.retentionLocation],
    ['Synthetic Observer', 'TIC Digital Tech', '2026-05-26', 'Yes', 'Synthetic archive']);
  const withheld = fillDocument(buffer, 'internal', { ...common,
    internal: JSON.stringify({ ...document, verificationDate: '' }) }, 2026);
  const incomplete = importDocument(withheld, 'internal').document;
  assert.equal(incomplete.signatory || '', '');
  assert.equal(incomplete.signatoryPosition || '', '');
  assert.equal(incomplete.signatoryDate || '', '');
});
test('schedule import reads Drive-edited schedules whose Topic Brief and File Submission sit in an extra row', () => {
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const links = 'Task 4 - Travel & Tours | https://drive.google.com/file/d/aaaaaaaaaaaa/view\nTask 2 - Tour Report | https://drive.google.com/file/d/bbbbbbbbbbbb/view';
  const rendered = fillDocument(fs.readFileSync(require('node:path').join(__dirname, 'templates', 'schedule.docx')), 'schedule',
    { standardNumber: '29785', standardTitle: 'Synthetic title', credits: '5', schedule: JSON.stringify({ fileSubmissionLink: links }) }, 2026);
  const zip = new PizZip(rendered);
  const doc = new DOMParser().parseFromString(zip.file('word/document.xml').asText().replace(/ w:tooltip="[^"]*"/g, ''), 'application/xml');
  const kids = (node, tag) => Array.from(node.childNodes).filter(item => item.namespaceURI === W && item.localName === tag);
  const table = kids(doc.getElementsByTagNameNS(W, 'body')[0], 'tbl')[0];
  const notes = kids(table, 'tr')[4], extra = notes.cloneNode(true);
  table.insertBefore(extra, notes.nextSibling);
  const only = (cell, value) => {
    kids(cell, 'p').slice(1).forEach(p => cell.removeChild(p));
    Array.from(cell.getElementsByTagNameNS(W, 't')).forEach((t, i) => { t.textContent = i ? '' : value; });
  };
  only(kids(notes, 'tc')[2], 'Documentation Submission'); only(kids(extra, 'tc')[1], 'Topic Brief');
  zip.file('word/document.xml', new XMLSerializer().serializeToString(doc));
  const result = importDocument(zip.generate({ type: 'nodebuffer' }), 'schedule');
  assert.equal(result.common.standardTitle, 'Synthetic title');
  assert.equal(result.common.credits, '5');
  assert.equal(result.document.fileSubmissionLink, links);
  assert.equal(result.document.tourReportLink, undefined);
});

test('schedule import finds criteria and every requirement when blank spacer rows were removed in Drive', () => {
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const requirements = ['One', 'Two', 'Three'].map(name => ({ requirement: name + ' requirement', grade: 'A', evidence: name + ' evidence', judgement: name + ' judgement' }));
  const rendered = fillDocument(fs.readFileSync(require('node:path').join(__dirname, 'templates', 'schedule.docx')), 'schedule',
    { standardNumber: '29785', schedule: JSON.stringify({ achieved: 'Synthetic criteria', requirements }) }, 2026);
  const zip = new PizZip(rendered);
  const doc = new DOMParser().parseFromString(zip.file('word/document.xml').asText(), 'application/xml');
  const table = Array.from(doc.getElementsByTagNameNS(W, 'tbl'))[0];
  const tableRows = Array.from(table.childNodes).filter(item => item.namespaceURI === W && item.localName === 'tr');
  table.removeChild(tableRows[9]); table.removeChild(tableRows[6]);
  zip.file('word/document.xml', new XMLSerializer().serializeToString(doc));
  const { document } = importDocument(zip.generate({ type: 'nodebuffer' }), 'schedule');
  assert.equal(document.achieved, 'Synthetic criteria');
  assert.deepEqual(document.requirements.map(row => row.requirement), ['One requirement', 'Two requirement', 'Three requirement']);
});
test('schedule import accepts a unit-standard criteria row merged into one Achieved cell', () => {
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const rendered = fillDocument(fs.readFileSync(require('node:path').join(__dirname, 'templates', 'schedule.docx')), 'schedule',
    { standardNumber: '29786', schedule: JSON.stringify({ achieved: 'Outcome 1 criteria', requirements: [{ requirement: 'Only requirement', grade: 'A' }] }) }, 2026);
  const zip = new PizZip(rendered);
  const doc = new DOMParser().parseFromString(zip.file('word/document.xml').asText(), 'application/xml');
  const table = doc.getElementsByTagNameNS(W, 'tbl')[0];
  const criteria = Array.from(table.childNodes).filter(item => item.namespaceURI === W && item.localName === 'tr')[8];
  Array.from(criteria.childNodes).filter(item => item.localName === 'tc').slice(1).forEach(cell => criteria.removeChild(cell));
  zip.file('word/document.xml', new XMLSerializer().serializeToString(doc));
  const { document } = importDocument(zip.generate({ type: 'nodebuffer' }), 'schedule');
  assert.equal(document.achieved, 'Outcome 1 criteria');
  assert.deepEqual(document.requirements.map(row => row.requirement), ['Only requirement']);
});
test('consent scope endpoint validates the standard and reports NZQA failures', async t => {
  let fails = false;
  const app = await createServer(t, { checkConsent: async number => {
    if (fails) throw new Error('private upstream detail');
    return { number, domain: 'Digital Technologies', level: 2, bsasLevel: 3, eligible: true, expired: false };
  } });
  const ok = await fetch(app.base + 'standards/91897/consent-scope');
  assert.equal((await ok.json()).eligible, true);
  assert.equal(ok.headers.get('cache-control'), 'no-store');
  assert.equal((await fetch(app.base + 'standards/invalid/consent-scope')).status, 400);
  fails = true;
  const unavailable = await fetch(app.base + 'standards/91897/consent-scope');
  assert.equal(unavailable.status, 502);
  assert.doesNotMatch((await unavailable.json()).error, /private upstream detail/);
  assert.equal(validModerationContent({ internal: JSON.stringify({ consent: 'Yes', consentBsasStandard: '91897' }) }), true);
  assert.equal(validModerationContent({ internal: JSON.stringify({ consent: 'Yes', consentBsasStandard: 'invalid' }) }), false);
  const document = renderDocument('internal', { standardNumber: '91897', internal: JSON.stringify({
    consent: 'Yes', consentBsasStandard: '91897'
  }) }, 2026);
  assert.equal(importDocument(document, 'internal').document.consent, 'Yes');
});
test('class size returns only a validated Student Tracker count', async t => {
  let response = { year: 2026, course: '13DTECH', students: 18, term: null, linked: true, ambiguous: false, names: ['Hidden'] }, calls = [];
  const app = await createServer(t, { loadClassSize: async (req, year, course) => { calls.push([year, course]); if (response instanceof Error) throw response; return response; } });
  const ok = await fetch(app.base + 'class-size/2026?course=13dtech');
  assert.deepEqual(await ok.json(), { course: '13DTECH', students: 18, term: null, linked: true, ambiguous: false });
  assert.deepEqual(calls, [[2026, '13dtech']]);
  assert.equal((await fetch(app.base + 'class-size/2026?course=13%20DTECH')).status, 400);
  response = { students: -1, term: null, linked: true, ambiguous: false };
  assert.equal((await fetch(app.base + 'class-size/2026?course=13DTECH')).status, 502);
  response = new Error('secret Core detail');
  const failed = await fetch(app.base + 'class-size/2026?course=13DTECH');
  assert.doesNotMatch((await failed.json()).error, /secret/);
  assert.equal((await fetch((await createServer(t)).base + 'class-size/2026?course=13DTECH')).status, 503);
});