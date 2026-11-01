const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const session = require('express-session');
const PizZip = require('pizzip');
const { createModuleRouter } = require('./app');
const { validContent, validKey } = require('./planner');
const { common, documents, critique, yesNo, isSchedulePlaceholder } = require('./public/moderation-schema');
const { DOCX, renderDocument, fillDocument, importDocument } = require('./moderationDocuments');
const { renderShell } = require('./shell');
const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const other = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const fixture = {
  title: 'Synthetic moderation test', subject: 'Biology', course: '13BIO', department: 'Science',
  teacher: 'Example teacher (EXT)', assessors: 'Example assessor', standardNumber: '99999',
  standardTitle: 'Synthetic assessment title', version: '2', level: '3', credits: '5',
  studentName: 'Synthetic learner', studentId: 'TEST-001'
};
test('staff directory requires teacher access and uses only the current owner records across years', async t => {
  const calls = [];
  let failure = false, malformed = false, dbFailure = false;
  const app = express();
  app.use(session({ secret: 'synthetic-staff-test-secret', resave: false, saveUninitialized: false }));
  app.use((req, res, next) => {
    if (req.get('x-test-user')) req.user = { id: req.get('x-test-user'), roles: [req.get('x-test-role') || 'Teacher'] };
    next();
  });
  app.use(createModuleRouter({
    loadStaff: async req => {
      calls.push(['staff', req.user.id]);
      if (failure) throw new Error('Upstream unavailable');
      return { departments: [], staff: malformed ? [{}] : [{ id: '1', first_name: 'Amy', last_name: 'Adams', code: 'AAD' },
        { id: '2', first_name: 'Zoe', last_name: 'Baker', code: null }] };
    },
    query: async (sql, params) => {
      calls.push([sql, params]);
      assert.match(sql, /owner_id=\$1 AND section='moderation' AND entry_key<>'main'/);
      assert.match(sql, /COUNT\(\*\)::integer AS uses/);
      assert.doesNotMatch(sql, /year=/);
      if (dbFailure) throw new Error('Database unavailable');
      return { rows: params[0] === owner ? [{ teacher: 'Amy Adams (AAD)', uses: 3 }, { teacher: 'Amy Adams', uses: 1 }] : [] };
    }
  }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const get = (user, role) => fetch(`http://127.0.0.1:${server.address().port}/api/planner/staff`,
    { headers: user ? { 'x-test-user': user, ...(role ? { 'x-test-role': role } : {}) } : {} });
  assert.equal((await get()).status, 401);
  assert.equal((await get(owner, 'Student')).status, 403); assert.equal(calls.length, 0);
  let response = await get(owner);
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { departments: [], staff: [{ id: '1', name: 'Amy Adams (AAD)', uses: 4 },
    { id: '2', name: 'Zoe Baker', uses: 0 }] });
  assert.deepEqual((await (await get(other)).json()).staff.map(person => person.uses), [0, 0]);
  assert.deepEqual(calls.filter(call => Array.isArray(call[1])).map(call => call[1]), [[owner], [other]]);
  failure = true; assert.equal((await get(owner)).status, 502);
  failure = false; malformed = true; assert.equal((await get(owner)).status, 502);
  malformed = false; dbFailure = true; assert.equal((await get(owner)).status, 502);
});
function example(type) {
  const definition = documents[type], value = {};
  for (const [key, , kind] of definition.groups.flatMap(([, fields]) => fields)) {
    value[key] = kind === 'drive' ? key + ' | https://drive.google.com/file/d/document_id_123/view' : kind === 'url' ? 'https://example.test/' + key : kind?.checks ? 'Commercial, NZQA, Other' : Array.isArray(kind) ? kind.includes('A') ? 'A' : 'Yes' : kind === 'date' ? '2026-10-22' : key + ' example\nSecond line & <safe>';
  }
  value.notes = 'Supporting notes\nSecond paragraph';
  value.resources = 'Evidence | https://example.test/evidence';
  if (definition.rows) value[definition.rows.key] = Array.from({ length: 7 }, (_, i) => Object.fromEntries(
    definition.rows.fields.map(([key, , kind]) => [key, Array.isArray(kind) ? 'A' : kind === 'date' ? '2026-10-22' : key + ' ' + i])));
  if (type === 'internal') value.samples[0].markingScheduleRecord = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  return value;
}
test('moderation validates record addresses, document fields, dates, rows and Drive metadata', () => {
  const linked = { id: 'document_id_123', name: 'Editable', mimeType: 'application/vnd.google-apps.document' };
  const pdf = { id: 'pdf_document_123', name: 'Assessment.pdf', mimeType: 'application/pdf' };
  for (const page of ['schedule', 'feedback']) {
    assert.equal(validContent('moderation', { driveDocuments: JSON.stringify({ [page]: { ...linked, pdf } }) }), true);
    for (const invalid of [{ ...pdf, id: 'bad' }, { ...pdf, mimeType: linked.mimeType }, { ...pdf, extra: true }, []]) {
      assert.equal(validContent('moderation', { driveDocuments: JSON.stringify({ [page]: { ...linked, pdf: invalid } }) }), false);
    }
  }
  assert.equal(validContent('moderation', { driveDocuments: JSON.stringify({ coversheet: { ...linked, pdf } }) }), false);
  const selected = { number: '99999', subject: 'Science', title: 'Synthetic standard', credits: '5 credits',
    assessment: 'Internal', url: 'https://www.nzqa.govt.nz/nqfdocs/units/pdf/99999.pdf', level: '3', version: '2' };
  assert.equal(validContent('assessmentSetup', { selectedStandards: JSON.stringify([selected]) }), true);
  assert.equal(validContent('assessmentSetup', { selectedStandards: JSON.stringify([{ ...selected, level: 'bogus' }]) }), false);
  assert.equal(validKey(2026, 'moderation', 'main'), true);
  assert.equal(validKey(2026, 'moderation', id), true);
  assert.equal(validKey(2026, 'moderation', '../other'), false);
  assert.equal(validContent('moderation', { standardFolder: JSON.stringify({
    id: 'standard_folder_123', root: 'folder_id_123', level: '3', number: '29785'
  }) }), true);
  const folderLinks = { root: 'folder_id_123', levels: Object.fromEntries(['1', '2', '3'].map(level =>
    [level, { id: 'level_folder_' + level, standards: [{ id: 'standard_folder_123', name: '29785' }] }])) };
  assert.equal(validContent('moderation', { folderLinks: JSON.stringify(folderLinks) }), true);
  for (const invalid of [null, {}, { ...folderLinks, root: 'bad' }, { ...folderLinks, levels: {} },
    { ...folderLinks, levels: { ...folderLinks.levels, '3': { id: 'level_folder_3', standards: [{ id: 'bad', name: '29785' }] } } },
    { ...folderLinks, levels: { ...folderLinks.levels, '3': { id: 'level_folder_3', standards: [{ id: 'standard_folder_123', name: 'not a standard' }] } } }]) {
    assert.equal(validContent('moderation', { folderLinks: JSON.stringify(invalid) }), false);
  }
  assert.equal(validContent('moderation', { ...fixture, folderId: 'folder_id_123', folderName: 'Private assessment',
    ...Object.fromEntries(Object.keys(documents).map(type => [type, JSON.stringify(example(type))])),
    driveDocuments: JSON.stringify({ internal: { id: 'document_id_123', name: 'Test', mimeType: 'application/vnd.google-apps.document' } }) }), true);
  for (const bad of [
    { internal: 'null' }, { schedule: '[]' }, { feedback: 'true' }, { coversheet: '"text"' },
    { folderId: "bad'query" }, { title: 'a'.repeat(501) }, { standardNumber: 'invalid' },
    { standardFolder: 'null' }, { standardFolder: 'broken' }, { standardFolder: '{}' },
    ...[{ id: 'bad' }, { root: 'bad' }, { level: '4' }, { number: 'abc' }, { extra: 'bad' }].map(overrides => ({
      standardFolder: JSON.stringify({ id: 'standard_folder_123', root: 'folder_id_123', level: '3', number: '29785', ...overrides })
    })),
    { internal: JSON.stringify({ consent: 'maybe' }) }, { internal: JSON.stringify({ consent: null }) },
    { internal: JSON.stringify({ sourceTypes: 'Commercial, Bogus' }) }, { internal: JSON.stringify({ sourceTypes: 'TKI, TKI' }) },
    { internal: JSON.stringify({ moderatorReportLink: 'javascript:alert(1)' }) },
    { internal: JSON.stringify({ conditionsLink: 'not a URL' }) },
    { internal: JSON.stringify({ externalFeedbackLink: 'https://user:password@example.test/' }) },
    { internal: JSON.stringify({ samples: [{ student: 'Learner', markingScheduleRecord: 'not-a-record' }] }) },
    { parentRecord: 'not-a-record' },
    { schedule: JSON.stringify({ requirements: Array.from({ length: 51 }, () => ({})) }) },
    { schedule: JSON.stringify({ topicBriefLink: 'Brief | javascript:alert(1)' }) },
    { schedule: JSON.stringify({ fileSubmissionLink: 'File | https://user:password@example.test/file' }) },
    { schedule: JSON.stringify({ tourReportLink: 'Report\nExtra | https://drive.google.com/file/d/document_id_123/view' }) },
    { internal: JSON.stringify({ resultsDate: '2026-02-30' }) }, { feedback: JSON.stringify({ unexpected: 'bad' }) },
    { feedback: JSON.stringify({ notes: '\u0000' }) },
    { driveDocuments: JSON.stringify({ internal: { id: 'valid_id_123', name: 'Test', mimeType: 'text/html' } }) }
  ]) assert.equal(validContent('moderation', bad), false, JSON.stringify(bad));
});
function scheduleWithHyperlinks(links) {
  const zip = new PizZip(renderDocument('schedule', { ...fixture, schedule: JSON.stringify({ instructions: 'Legacy heading links' }) }, 2026));
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const P = 'http://schemas.openxmlformats.org/package/2006/relationships';
  const doc = new DOMParser().parseFromString(zip.file('word/document.xml').asText(), 'application/xml');
  const rels = new DOMParser().parseFromString(zip.file('word/_rels/document.xml.rels').asText(), 'application/xml');
  const tableRows = Array.from(doc.getElementsByTagNameNS(W, 'tbl')[0].childNodes).filter(n => n.localName === 'tr');
  const cell = Array.from(tableRows[4].childNodes).filter(n => n.localName === 'tc')[1];
  while (cell.firstChild) cell.removeChild(cell.firstChild);
  for (const [i, [label, target]] of links.entries()) {
    const rel = rels.createElementNS(P, 'Relationship');
    rel.setAttribute('Id', 'resourceLink' + i); rel.setAttribute('TargetMode', 'External');
    rel.setAttribute('Type', R + '/hyperlink'); rel.setAttribute('Target', target);
    rels.documentElement.appendChild(rel);
    const p = doc.createElementNS(W, 'w:p'), link = doc.createElementNS(W, 'w:hyperlink');
    link.setAttributeNS(R, 'r:id', 'resourceLink' + i);
    for (const part of [label.slice(0, 5), label.slice(5)]) {
      const run = doc.createElementNS(W, 'w:r'), t = doc.createElementNS(W, 'w:t');
      t.textContent = part; run.appendChild(t); link.appendChild(run);
    }
    p.appendChild(link); cell.appendChild(p);
  }
  zip.file('word/document.xml', new XMLSerializer().serializeToString(doc));
  zip.file('word/_rels/document.xml.rels', new XMLSerializer().serializeToString(rels));
  return zip.generate({ type: 'nodebuffer' });
}
test('legacy schedule heading hyperlinks populate all five resources, preserving Google URLs and split-run labels', () => {
  const fields = documents.schedule.groups[0][1].filter(def => def[2] === 'drive');
  const urls = fields.map((_, i) => 'https://docs.google.com/document/d/resource_doc_' + i + '/edit?resourcekey=example');
  const imported = importDocument(scheduleWithHyperlinks(fields.map(([, label], i) => [label, urls[i]])), 'schedule');
  for (const [i, [key, label]] of fields.entries()) {
    assert.equal(imported.document[key], label + ' | ' + urls[i]);
  }
  assert.equal(validContent('moderation', { schedule: JSON.stringify(imported.document) }), true);
  const roundTrip = importDocument(renderDocument('schedule', { ...fixture, schedule: JSON.stringify(imported.document) }, 2026), 'schedule');
  for (const [key] of fields) assert.equal(roundTrip.document[key], imported.document[key]);
});
test('legacy schedule import retains multiple heading hyperlinks but does not guess missing or unsafe links', () => {
  const imported = importDocument(scheduleWithHyperlinks([
    ['Topic Brief', 'https://docs.google.com/document/d/first_doc_123/edit'],
    ['Topic Brief', 'https://docs.google.com/document/d/second_doc_123/edit'],
    ['File Submission', 'javascript:alert(1)'],
    ['Unrelated link', 'https://example.test/unrelated']
  ]), 'schedule');
  assert.equal(imported.document.topicBriefLink.split('\n').length, 2);
  assert.ok(!imported.document.fileSubmissionLink);
  assert.ok(!imported.document.tourReportLink);
  assert.match(imported.warning, /File Submission hyperlink could not be imported/);
});
test('twelve mixed file types remain clickable resource links through schedule export and reimport', () => {
  const extensions = ['pdf', 'accdb', 'png', 'xlsx', 'docx', 'py', 'zip', 'pdf', 'pdf', 'pdf', 'txt', 'pptx'];
  const links = extensions.map((extension, i) =>
    'Submission ' + i + '.' + extension + ' | https://drive.google.com/file/d/resource_file_' + i + '/view').join('\n');
  const content = { ...fixture, schedule: JSON.stringify({ fileSubmissionLink: links }) };
  assert.equal(validContent('moderation', content), true);
  const buffer = renderDocument('schedule', content, 2026);
  assert.equal(importDocument(buffer, 'schedule').document.fileSubmissionLink, links);
  const relationships = new PizZip(buffer).file('word/_rels/document.xml.rels').asText();
  for (let i = 0; i < 12; i++) assert.ok(relationships.includes('https://drive.google.com/file/d/resource_file_' + i + '/view'));
});
test('multiple resource links validate and round-trip without losing existing single-file compatibility', () => {
  const links = 'First | https://drive.google.com/file/d/first_file_123/view\nSecond | https://docs.google.com/document/d/second_file_123/edit';
  const content = { ...fixture, schedule: JSON.stringify({ fileSubmissionLink: links }) };
  assert.equal(validContent('moderation', content), true);
  assert.equal(importDocument(renderDocument('schedule', content, 2026), 'schedule').document.fileSubmissionLink, links);
  assert.equal(validContent('moderation', { schedule: JSON.stringify({ fileSubmissionLink: links + '\nUnsafe | javascript:alert(1)' }) }), false);
  assert.equal(validContent('moderation', { schedule: JSON.stringify({ fileSubmissionLink: 'One | https://example.test/' + 'a'.repeat(500) }) }), false);
});
test('Unit Standard generated schedules leave Merit and Excellence requirements empty', () => {
  const imported = importDocument(renderDocument('schedule', { ...fixture, standardType: 'Unit',
    schedule: JSON.stringify({ achieved: 'Required achieved criteria', merit: 'Stale merit', excellence: 'Stale excellence' }) }, 2026), 'schedule');
  assert.equal(imported.document.achieved, 'Required achieved criteria');
  assert.equal(imported.document.merit, '');
  assert.equal(imported.document.excellence, '');
});
test('schedule export styles Unit banner and two-row resource cells and links the official standard PDF', () => {
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const data = { ...fixture, standardType: 'Unit', schedule: JSON.stringify({
    assessmentInstructionsLink: 'Instructions | https://example.test/instructions',
    topicBriefLink: 'Brief | https://example.test/brief',
    documentationSubmissionLink: 'Documentation | https://example.test/documentation',
    fileSubmissionLink: 'Work | https://example.test/work'
  }) };
  for (const buffer of [renderDocument('schedule', data, 2026),
    fillDocument(renderDocument('schedule', data, 2026), 'schedule', data, 2026)]) {
    const zip = new PizZip(buffer);
    const doc = new DOMParser().parseFromString(zip.file('word/document.xml').asText(), 'application/xml');
    const table = doc.getElementsByTagNameNS(W, 'tbl')[0];
    const rows = Array.from(table.childNodes).filter(n => n.localName === 'tr');
    const cells = row => Array.from(row.childNodes).filter(n => n.localName === 'tc');
    const banner = cells(rows[1])[0];
    assert.equal(cells(rows[7])[0].textContent, 'Achieved Grade Criteria');
    assert.equal(banner.textContent, 'Computing');
    for (const [tag, value] of [['color', 'FFFFFF'], ['b', '1'], ['sz', '162'], ['szCs', '162']]) {
      assert.equal(banner.getElementsByTagNameNS(W, tag)[0].getAttributeNS(W, 'val'), value);
    }
    for (const [index, headings] of [[1, ['Assessment Instructions & Schedule', 'Topic Brief']],
      [2, ['Documentation Submission', 'File Submission']]]) {
      const nested = cells(rows[4])[index].getElementsByTagNameNS(W, 'tbl');
      assert.equal(nested.length, 1, 'resource grid is not duplicated on repeated generation');
      const resourceRows = Array.from(nested[0].childNodes).filter(n => n.localName === 'tr');
      assert.equal(resourceRows.length, 2);
      resourceRows.forEach((row, i) => {
        const p = cells(row)[0].getElementsByTagNameNS(W, 'p')[0];
        assert.equal(p.textContent, headings[i]);
        assert.equal(p.getElementsByTagNameNS(W, 'b')[0].getAttributeNS(W, 'val'), '1');
      });
    }
    const standardLink = cells(rows[4])[4].getElementsByTagNameNS(W, 'hyperlink')[0];
    assert.equal(standardLink.textContent, fixture.standardNumber);
    assert.equal(standardLink.getAttributeNS(R, 'id'), 'planner-standard-pdf');
    assert.match(zip.file('word/_rels/document.xml.rels').asText(),
      /Target="https:\/\/www.nzqa.govt.nz\/nqfdocs\/units\/pdf\/99999.pdf"/);
    const imported = importDocument(buffer, 'schedule');
    assert.equal(imported.common.subject, fixture.subject, 'normal subject field remains unchanged');
    assert.equal(imported.document.topicBriefLink, 'Brief | https://example.test/brief');
  }
  assert.throws(() => renderDocument('schedule', { ...data, standardPdfUrl: 'https://example.test/99999.pdf' }, 2026), /official NZQA/);
});
test('schedule evidence is left aligned and Overall Grade prints the saved decision, never inferred ticks', () => {
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  for (const grade of ['', 'N', 'A', 'M', 'E', 'Not assessed']) {
    const buffer = renderDocument('schedule', { ...fixture, schedule: JSON.stringify({
      grade, markerComments: 'Keep comments', requirements: [
        { requirement: 'Actual requirement', grade: 'A', evidence: 'Evidence line 1\nEvidence line 2', judgement: 'Judgement' }
      ]
    }) }, 2026);
    const doc = new DOMParser().parseFromString(new PizZip(buffer).file('word/document.xml').asText(), 'application/xml');
    const rows = Array.from(doc.getElementsByTagNameNS(W, 'tbl')[0].childNodes).filter(n => n.localName === 'tr');
    const cells = row => Array.from(row.childNodes).filter(n => n.localName === 'tc');
    const evidence = cells(rows[11])[4];
    assert.equal(evidence.getElementsByTagNameNS(W, 'jc')[0].getAttributeNS(W, 'val'), 'left');
    assert.equal(cells(rows.at(-1))[1].textContent, grade);
    assert.equal(cells(rows.at(-1))[2].textContent, 'Keep comments');
    assert.equal(importDocument(buffer, 'schedule').document.grade || '', grade);
  }
});
test('schedule cleanup removes only template heading rows, retaining actual marking and requirements', () => {
  const placeholder = { requirement: 'Key requirements (list):', grade: '',
    evidence: 'Describe or attach the evidence considered.', judgement: 'Explain how the judgement was made.' };
  assert.equal(isSchedulePlaceholder(placeholder), true);
  assert.equal(isSchedulePlaceholder({ ...placeholder,
    requirement: '\u200BKey\u00A0requirements (list):\u200B',
    evidence: 'Describe or attach the evidence considered.\u200B',
    judgement: 'Explain how the judgement was made.\uFEFF' }), true);
  assert.equal(isSchedulePlaceholder({ ...placeholder, evidence: '', judgement: '' }), true);
  for (const real of [
    { ...placeholder, requirement: 'Produce integrated documents' },
    { ...placeholder, grade: 'A' },
    { ...placeholder, evidence: 'Actual learner evidence' },
    { ...placeholder, judgement: 'Actual assessment judgement' },
    { ...placeholder, extra: 'Retain unknown data' }
  ]) assert.equal(isSchedulePlaceholder(real), false);
  const requirements = [
    { requirement: 'Produce integrated documents', grade: 'A', evidence: 'Student C work', judgement: 'Achieved' },
    { requirement: 'Edit original images', grade: 'A', evidence: '', judgement: '' },
    { requirement: 'Use good practice', grade: 'A', evidence: '', judgement: '' }
  ];
  const data = { ...fixture, schedule: JSON.stringify({ requirements: [placeholder, ...requirements] }) };
  const before = data.schedule;
  const buffer = renderDocument('schedule', data, 2026);
  assert.deepEqual(importDocument(buffer, 'schedule').document.requirements, requirements);
  assert.equal(data.schedule, before, 'export does not mutate input');
  const zip = new PizZip(buffer);
  const doc = new DOMParser().parseFromString(zip.file('word/document.xml').asText(), 'application/xml');
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const rows = Array.from(doc.getElementsByTagNameNS(W, 'tbl')[0].childNodes).filter(n => n.localName === 'tr');
  const header = rows[10].cloneNode(true);
  const cells = Array.from(header.childNodes).filter(n => n.localName === 'tc');
  for (const [i, value] of ['Key requirements (list):', '', '', '', placeholder.evidence, placeholder.judgement].entries()) {
    const p = cells[i].getElementsByTagNameNS(W, 'p')[0];
    while (p.firstChild) p.removeChild(p.firstChild);
    const run = doc.createElementNS(W, 'w:r'), text = doc.createElementNS(W, 'w:t');
    text.appendChild(doc.createTextNode(value)); run.appendChild(text); p.appendChild(run);
  }
  rows[11].parentNode.insertBefore(header, rows[11]);
  zip.file('word/document.xml', new XMLSerializer().serializeToString(doc));
  assert.deepEqual(importDocument(zip.generate({ type: 'nodebuffer' }), 'schedule').document.requirements, requirements,
    'import ignores the template prompt row before actual requirements');
});
for (const type of Object.keys(documents)) {
  test(type + ' uses the local template layout and round-trips saved form data without sample answers', () => {
    const values = example(type);
    const buffer = renderDocument(type, { ...fixture, [type]: JSON.stringify(values) }, 2026);
    const zip = new PizZip(buffer), xml = zip.file('word/document.xml').asText();
    assert.ok(zip.file('word/media/image1.png'), 'school branding is preserved');
    assert.ok(xml.includes('99999'));
    assert.ok(xml.includes(type === 'schedule' ? 'TEST-001' : type === 'internal' ? 'student 0' : 'Synthetic learner'));
    assert.doesNotMatch(xml, /Digital Technologies|29785|Student A|Student B|Student C|vanessapringle|19\/05\/2025/);
    const imported = importDocument(buffer, type);
    if (type === 'schedule') {
      const tableKeys = ['subject', 'studentId', 'level', 'standardNumber', 'version', 'standardTitle', 'credits'];
      assert.deepEqual(imported.common, Object.fromEntries(tableKeys.map(key => [key, fixture[key]])));
    } else if (type === 'internal') {
      const sheetKeys = ['course', 'standardNumber', 'version', 'standardTitle', 'credits', 'level', 'department', 'teacher', 'assessors'];
      assert.deepEqual(imported.common, Object.fromEntries(sheetKeys.map(key => [key, fixture[key]])));
    } else if (type === 'feedback') {
      const sheetKeys = ['subject', 'standardNumber', 'standardTitle', 'level', 'credits', 'version', 'studentName'];
      assert.deepEqual(imported.common, Object.fromEntries(sheetKeys.map(key => [key, fixture[key]])));
    } else assert.deepEqual(imported.common, fixture);
    const formOnly = type === 'schedule' ? ['notes', 'resources', 'instructions', 'submissions'] :
      type === 'internal' ? ['notes', 'resources', 'signatoryPosition',
        ...documents.internal.groups.flatMap(([, fields]) => fields).filter(([, , kind]) => kind === 'url').map(([key]) => key)] :
        type === 'feedback' ? ['notes', 'resources', 'feedback'] : [];
    for (const [key, value] of Object.entries(values)) {
      if (type === 'internal' && key === 'samples') {
        assert.deepEqual(imported.document.samples, value.map(({ markingScheduleRecord, ...sample }) => sample));
      } else if (!formOnly.includes(key)) assert.deepEqual(imported.document[key], value, type + ':' + key);
    }
    assert.equal(validContent('moderation', { ...imported.common, [type]: JSON.stringify(imported.document) }), true);
    const template = new PizZip(fs.readFileSync(path.join(__dirname, 'templates', type + '.docx')));
    for (const entry of Object.values(template.files)) if (/\.(xml|rels)$/.test(entry.name)) {
      assert.doesNotMatch(entry.asText(), /Digital Technologies|29785|Student A|Student B|Student C|vanessapringle|V Pringle|19\/05\/2025/);
      if (entry.name.endsWith('.rels')) assert.doesNotMatch(entry.asText(), /TargetMode="External"/);
    }
  });
}
test('internal sync includes only the moderation sheet, not supporting information or a Planner appendix', () => {
      const values = { ...example('internal'), notes: 'PRIVATE SUPPORT NOTE', resources: 'PRIVATE RESOURCE LINK',
        retentionLocation: 'APP Moderation / Level 3 / 99999\nhttps://drive.google.com/drive/folders/standard_folder_123' };
      const data = { ...fixture, internal: JSON.stringify(values) };
      const buffer = renderDocument('internal', data, 2026);
      const xml = new PizZip(buffer).file('word/document.xml').asText();
      assert.doesNotMatch(xml, /Planner record details|Supporting notes:|Supporting resources:|PRIVATE SUPPORT NOTE|PRIVATE RESOURCE LINK|Individual marking schedule references:/);
      assert.match(xml, /APP Moderation \/ Level 3 \/ 99999/);
      assert.match(xml, /https:\/\/drive.google.com\/drive\/folders\/standard_folder_123/);
      assert.match(xml, /student 0/);
      assert.equal(data.internal, JSON.stringify(values), 'sync does not change saved form data');
      const imported = importDocument(buffer, 'internal').document;
      assert.equal(imported.notes, undefined);
      assert.equal(imported.resources, undefined);
      assert.equal(imported.retentionLocation, values.retentionLocation);
      const refilled = fillDocument(buffer, 'internal', data, 2026);
      assert.doesNotMatch(new PizZip(refilled).file('word/document.xml').asText(), /Planner record details|PRIVATE SUPPORT NOTE/);
    });
    test('schedule sync exports only table data with clickable resources and one grade beside marker comments', () => {
      const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
      const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
      const values = { grade: 'A', markerComments: 'Keep these comments next to the grade.',
        notes: 'PRIVATE SUPPORTING NOTE', resources: 'PRIVATE SUPPORTING RESOURCE',
        assessmentInstructionsLink: 'Assessment PDF | https://example.test/assessment.pdf?x=1&y=2',
        topicBriefLink: 'Topic brief | https://example.test/brief',
        documentationSubmissionLink: 'Documentation | https://example.test/documentation',
        fileSubmissionLink: 'First file | https://example.test/first\nSecond file | https://example.test/second' };
      const data = { ...fixture, schedule: JSON.stringify(values) };
      const buffer = renderDocument('schedule', data, 2026);
      const zip = new PizZip(buffer), xml = zip.file('word/document.xml').asText();
      assert.doesNotMatch(xml, /Planner record details|PRIVATE SUPPORTING|Synthetic moderation test|Example assessor/);
      assert.equal(data.schedule, JSON.stringify(values), 'export leaves database/form content untouched');
      const doc = new DOMParser().parseFromString(xml, 'application/xml');
      const table = doc.getElementsByTagNameNS(W, 'tbl')[0];
      const rows = Array.from(table.childNodes).filter(n => n.localName === 'tr');
      const cells = row => Array.from(row.childNodes).filter(n => n.localName === 'tc');
      const read = node => Array.from(node.getElementsByTagNameNS(W, 't')).map(n => n.textContent).join('');
      const last = cells(rows.at(-1));
      assert.equal(last.length, 3);
      assert.deepEqual(last.map(read), ['OVERALL GRADE:', 'A', values.markerComments]);
      assert.equal(last[1].getElementsByTagNameNS(W, 'gridSpan')[0].getAttributeNS(W, 'val'), '20');
      assert.equal(last[1].getElementsByTagNameNS(W, 'jc')[0].getAttributeNS(W, 'val'), 'center');
      const resourceCells = cells(rows[4]);
      assert.match(read(resourceCells[1]), /Assessment PDF.*Topic brief/);
      assert.match(read(resourceCells[2]), /Documentation.*First file.*Second file/);
      const links = Array.from(table.getElementsByTagNameNS(W, 'hyperlink'));
      assert.equal(links.length, 5);
      assert.equal(resourceCells[2].getElementsByTagNameNS(W, 'hyperlink').length, 3);
      const rels = new DOMParser().parseFromString(zip.file('word/_rels/document.xml.rels').asText(), 'application/xml');
      const relationships = Array.from(rels.getElementsByTagNameNS('http://schemas.openxmlformats.org/package/2006/relationships', 'Relationship'));
      for (const link of links) {
        const target = relationships.find(rel => rel.getAttribute('Id') === link.getAttributeNS(R, 'id'));
        assert.equal(target.getAttribute('TargetMode'), 'External');
        assert.match(target.getAttribute('Target'), /^https:\/\/example.test\//);
        assert.equal(link.getElementsByTagNameNS(W, 'p').length, 0);
      }
      const repeated = fillDocument(buffer, 'schedule', data, 2026);
      const imported = importDocument(repeated, 'schedule').document;
      for (const key of ['grade', 'markerComments', 'assessmentInstructionsLink', 'topicBriefLink', 'documentationSubmissionLink', 'fileSubmissionLink']) {
        assert.equal(imported[key], values[key], key);
      }
      assert.equal(imported.notes, undefined);
      assert.equal(imported.resources, undefined);
      zip.file('word/document.xml', xml.replace(/ w:tooltip="[^"]*"/g, ''));
      const withoutTooltips = importDocument(zip.generate({ type: 'nodebuffer' }), 'schedule').document;
      assert.equal(withoutTooltips.fileSubmissionLink, values.fileSubmissionLink, 'heading context survives Google Docs tooltip removal');
      assert.equal(withoutTooltips.topicBriefLink, values.topicBriefLink);
    });
    test('schedule sync removes an old generated appendix and still accepts legacy six-cell grade layouts', () => {
      const buffer = fs.readFileSync(path.join(__dirname, 'templates', 'schedule.docx'));
      const zip = new PizZip(buffer);
      zip.file('word/document.xml', zip.file('word/document.xml').asText().replace('<w:sectPr',
        '<w:p><w:r><w:t>Planner record details</w:t></w:r></w:p><w:p><w:r><w:t>OLD APPENDIX</w:t></w:r></w:p><w:sectPr'));
      const result = fillDocument(zip.generate({ type: 'nodebuffer' }), 'schedule', {
        ...fixture, schedule: '{"grade":"M","markerComments":"Still beside grade"}'
      }, 2026);
      assert.doesNotMatch(new PizZip(result).file('word/document.xml').asText(), /Planner record details|OLD APPENDIX/);
      assert.equal(importDocument(result, 'schedule').document.grade, 'M');
    });
test('unrelated or malformed document imports fail explicitly', () => {
  assert.throws(() => importDocument(Buffer.from('not a zip'), 'schedule'));
  assert.throws(() => importDocument(renderDocument('feedback', fixture, 2026), 'schedule'), /template/);
  const zip = new PizZip();
  zip.file('word/document.xml', '<!DOCTYPE doc><doc/>');
  assert.throws(() => importDocument(zip.generate({ type: 'nodebuffer' }), 'feedback'), /supported/);
});
test('internal sync removes imported duplicate category prefixes without deleting values or changing saved input', () => {
  const values = { verifierName: 'Verifier name: Verifier Name:', verifierSchool: 'School: School:',
    verifierPosition: 'Position:', critiqueName: "Critiquer's name: V Pringle",
    critiqueSchool: 'School: Westland HS', signatory: 'Signed:', retained: '',
    verificationEvidence: 'Evidence / location of verification: Available in the overleaf',
    retentionLocation: 'Location / file path: APP Moderation / Level 3 / 29785\nhttps://example.test/folder' };
  const data = { ...fixture, internal: JSON.stringify(values) };
  const buffer = renderDocument('internal', data, 2026);
  const xml = new PizZip(buffer).file('word/document.xml').asText();
  assert.doesNotMatch(xml, /Verifier name: Verifier|School: School:|Position: Position:|Decision:|Signed:/);
  assert.match(xml, /Critiquer's name: V Pringle/);
  assert.match(xml, /School: Westland HS/);
  const result = importDocument(buffer, 'internal').document;
  assert.equal(result.verifierName, '');
  assert.equal(result.verifierSchool, '');
  assert.equal(result.verifierPosition, '');
  assert.equal(result.critiqueName, 'V Pringle');
  assert.equal(result.verificationEvidence, 'Available in the overleaf');
  assert.equal(result.retentionLocation, 'APP Moderation / Level 3 / 29785\nhttps://example.test/folder');
  assert.equal(data.internal, JSON.stringify(values));
});
test('internal Section C starts on a new page and critique names strip legacy misspellings and smart apostrophes', () => {
  for (const name of ["Critique's Name: V Pringle", 'Critiquer\u2019s Name: V Pringle', "Critiquer's name: Critique's Name: V Pringle"]) {
    const buffer = renderDocument('internal', { ...fixture, internal: JSON.stringify({ critiqueName: name }) }, 2026);
    const zip = new PizZip(buffer), xml = zip.file('word/document.xml').asText();
    assert.doesNotMatch(xml, /Critique's Name:|name: Critiquer/);
    assert.equal(importDocument(buffer, 'internal').document.critiqueName, 'V Pringle');
    const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const table = doc.getElementsByTagNameNS(W, 'tbl')[0];
    const section = Array.from(table.childNodes).filter(n => n.localName === 'tr')[22];
    const p = section.getElementsByTagNameNS(W, 'p')[0];
    assert.match(p.textContent, /Section C: Verify/);
    assert.equal(p.getElementsByTagNameNS(W, 'pageBreakBefore')[0].getAttributeNS(W, 'val'), '1');
    assert.equal(p.getElementsByTagNameNS(W, 'keepNext')[0].getAttributeNS(W, 'val'), '1');
    const second = fillDocument(buffer, 'internal', { ...fixture, internal: '{"critiqueName":"V Pringle"}' }, 2026);
    assert.equal(importDocument(second, 'internal').document.critiqueName, 'V Pringle');
  }
});
test('Confirmation sync exports student result and clickable manually selected links without supporting notes or copied feedback', () => {
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const values = { grade: 'A', feedback: 'LEGACY COMMENTS', notes: 'PRIVATE NOTES', resources: 'PRIVATE RESOURCES',
    markingScheduleLink: 'Special schedule | https://example.test/schedule',
    coversheetLink: 'Special cover | https://example.test/cover', contactEmail: 'teacher@example.test' };
  const buffer = renderDocument('feedback', { ...fixture, feedback: JSON.stringify(values) }, 2026);
  const zip = new PizZip(buffer), xml = zip.file('word/document.xml').asText();
  assert.doesNotMatch(xml, /Planner record details|PRIVATE NOTES|PRIVATE RESOURCES|LEGACY COMMENTS|Feedback: /);
  assert.match(xml, /Synthetic learner/);
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  assert.ok(Array.from(doc.getElementsByTagNameNS(W, 'p')).some(p => p.textContent === 'Assessed grade: A'));
  assert.match(xml, /Special schedule/);
  assert.match(xml, /Special cover/);
  assert.match(zip.file('word/_rels/document.xml.rels').asText(), /https:\/\/example.test\/schedule/);
  const imported = importDocument(buffer, 'feedback').document;
  assert.equal(imported.grade, 'A');
  assert.equal(imported.markingScheduleLink, values.markingScheduleLink);
  assert.equal(imported.coversheetLink, values.coversheetLink);
  assert.equal(imported.contactEmail, values.contactEmail);
  assert.equal(imported.notes, undefined);
  assert.equal(imported.feedback, undefined);
});
test('Confirmation export preserves original branding and centred headings with prominent standard, student and grade', () => {
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const original = new PizZip(fs.readFileSync(path.join(__dirname, 'templates', 'feedback.docx')));
  const zip = new PizZip(renderDocument('feedback', { ...fixture,
    feedback: JSON.stringify({ grade: 'E', contactEmail: 'teacher@example.test', instructions: 'Please sign your cover sheet.' }) }, 2026));
  const source = new DOMParser().parseFromString(original.file('word/document.xml').asText(), 'application/xml');
  const doc = new DOMParser().parseFromString(zip.file('word/document.xml').asText(), 'application/xml');
  const ps = Array.from(doc.getElementsByTagNameNS(W, 'body')[0].childNodes).filter(p => p.localName === 'p');
  const originalPs = Array.from(source.getElementsByTagNameNS(W, 'body')[0].childNodes).filter(p => p.localName === 'p');
  const WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
  const extent = ps[0].getElementsByTagNameNS(WP, 'extent')[0];
  const originalExtent = originalPs[0].getElementsByTagNameNS(WP, 'extent')[0];
  for (const dimension of ['cx', 'cy']) assert.equal(Number(extent.getAttribute(dimension)),
    Math.round(Number(originalExtent.getAttribute(dimension)) / 2), 'logo dimensions halved');
  const margins = doc.getElementsByTagNameNS(W, 'pgMar')[0];
  const originalMargins = source.getElementsByTagNameNS(W, 'pgMar')[0];
  for (const side of ['left', 'right']) {
    assert.equal(margins.getAttributeNS(W, side), '720', 'half-inch horizontal margins');
    originalMargins.setAttributeNS(W, 'w:' + side, '720');
  }
  assert.equal(doc.getElementsByTagNameNS(W, 'sectPr')[0].toString(),
    source.getElementsByTagNameNS(W, 'sectPr')[0].toString(), 'other page settings unchanged');
  for (const i of [1, 2, 3, 4]) {
    assert.equal(ps[i].getElementsByTagNameNS(W, 'jc')[0].getAttributeNS(W, 'val'), 'center');
  }
  for (const i of [1, 2]) {
    assert.equal(ps[i].getElementsByTagNameNS(W, 'pStyle')[0].getAttributeNS(W, 'val'), 'Title');
    assert.equal(ps[i].getElementsByTagNameNS(W, 'sz')[0].getAttributeNS(W, 'val'), '46');
  }
  assert.equal(ps[4].textContent, 'Level: ' + fixture.level + '   Credits: ' + fixture.credits + '   Version: ' + fixture.version);
  for (const [i, value, size, color] of [
    [3, fixture.standardNumber, '46', '1155CC'],
    [6, fixture.studentName, '40', '9900FF'],
    [7, 'E', '40', '9900FF']
  ]) {
    const run = Array.from(ps[i].getElementsByTagNameNS(W, 'r')).find(r => r.textContent === value);
    assert.equal(run.getElementsByTagNameNS(W, 'sz')[0].getAttributeNS(W, 'val'), size);
    assert.equal(run.getElementsByTagNameNS(W, 'color')[0].getAttributeNS(W, 'val'), color);
    assert.equal(run.getElementsByTagNameNS(W, 'b')[0].getAttributeNS(W, 'val'), '1');
  }
  assert.equal(ps[8].textContent, 'If you have any queries, please email: teacher@example.test');
  for (const size of Array.from(ps[8].getElementsByTagNameNS(W, 'sz'))) assert.equal(size.getAttributeNS(W, 'val'), '20');
  assert.equal(ps.length, 15, 'two email spacers and one marking schedule spacer');
  assert.equal(ps[9].textContent, '');
  assert.equal(ps[10].textContent, '');
  assert.equal(ps[11].textContent, 'Marking Schedule:');
  assert.equal(ps[12].textContent, '');
  assert.equal(ps[13].textContent, 'Cover Sheet:');
  for (const p of ps) {
    const spacing = p.getElementsByTagNameNS(W, 'spacing')[0];
    assert.equal(spacing.getAttributeNS(W, 'before'), '0');
    assert.equal(spacing.getAttributeNS(W, 'after'), '60');
    assert.equal(spacing.getAttributeNS(W, 'line'), '240');
  }
  assert.equal(ps[5].getElementsByTagNameNS(W, 'jc')[0].getAttributeNS(W, 'val'), 'left');
  const titleRuns = Array.from(ps[5].getElementsByTagNameNS(W, 'r'));
  assert.equal(ps[5].textContent, fixture.standardTitle);
  for (const run of titleRuns) assert.equal(run.getElementsByTagNameNS(W, 'sz')[0].getAttributeNS(W, 'val'), '18');
  for (const heading of ['Marking Schedule:', 'Cover Sheet:']) {
    const p = ps.find(p => p.textContent === heading);
    assert.equal(p.getElementsByTagNameNS(W, 'b')[0].getAttributeNS(W, 'val'), '1');
  }
  const coverIndex = ps.findIndex(p => p.textContent === 'Cover Sheet:');
  assert.equal(ps[coverIndex + 1].textContent, 'Please sign your cover sheet.');
  assert.equal(ps.filter(p => p.textContent === 'Please sign your cover sheet.').length, 1);
  assert.doesNotMatch(zip.file('word/document.xml').asText(), /Teacher contact email:|Next steps \/ coversheet instructions:/);
  assert.equal(importDocument(zip.generate({ type: 'nodebuffer' }), 'feedback').document.instructions, 'Please sign your cover sheet.');
});
test('Confirmation export prefers generic links without changing saved student links and imports compact content', () => {
  const values = { contactEmail: '', markingScheduleLink:
    'Student B - schedule.pdf | https://example.test/student\nMarking Schedule | https://example.test/final',
    coversheetLink: 'Student B - cover | https://example.test/old-cover\nCover Sheet | https://example.test/cover' };
  const data = { ...fixture, feedback: JSON.stringify(values) };
  const before = data.feedback;
  const zip = new PizZip(renderDocument('feedback', data, 2026));
  const rels = zip.file('word/_rels/document.xml.rels').asText();
  assert.doesNotMatch(rels, /https:\/\/example.test\/(?:student|old-cover)/);
  assert.match(rels, /https:\/\/example.test\/final/);
  assert.match(rels, /https:\/\/example.test\/cover/);
  const doc = new DOMParser().parseFromString(zip.file('word/document.xml').asText(), 'application/xml');
  const ps = Array.from(doc.getElementsByTagNameNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'p'));
  const scheduleIndex = ps.findIndex(p => p.textContent === 'Marking Schedule:');
  assert.equal(ps[scheduleIndex - 1].textContent, '');
  assert.equal(ps[scheduleIndex - 2].textContent, '');
  assert.equal(ps[scheduleIndex + 1].textContent, 'Marking Schedule');
  assert.equal(ps[scheduleIndex + 2].textContent, '');
  assert.equal(ps[scheduleIndex + 3].textContent, 'Cover Sheet:');
  assert.equal(data.feedback, before);
  const imported = importDocument(zip.generate({ type: 'nodebuffer' }), 'feedback');
  assert.equal(imported.document.contactEmail, '');
  assert.equal(imported.common.standardTitle, fixture.standardTitle);
  assert.equal(imported.document.markingScheduleLink, 'Marking Schedule | https://example.test/final');
  assert.equal(imported.document.coversheetLink, 'Cover Sheet | https://example.test/cover');
});
test('internal decision cells sync only the answer and import both plain and older prefixed answers', () => {
  const decisions = documents.internal.groups.flatMap(([, fields]) => fields).filter(([, , kind]) => kind === yesNo);
  for (const answer of ['Yes', 'No', 'Not applicable', '']) {
    const values = Object.fromEntries(decisions.map(([key]) => [key, answer]));
    const buffer = renderDocument('internal', { ...fixture, internal: JSON.stringify(values) }, 2026);
    const zip = new PizZip(buffer), xml = zip.file('word/document.xml').asText();
    assert.doesNotMatch(xml, /Decision:/);
    const imported = importDocument(buffer, 'internal').document;
    for (const [key] of decisions) assert.equal(imported[key], answer, key);
  }
  const legacy = new PizZip(renderDocument('internal', { ...fixture, internal: '{"consent":"Yes"}' }, 2026));
  legacy.file('word/document.xml', legacy.file('word/document.xml').asText().replace('>Yes</w:t>', '>Decision: Yes</w:t>'));
  assert.equal(importDocument(legacy.generate({ type: 'nodebuffer' }), 'internal').document.consent, 'Yes');
});
test('legacy feedback paragraphs and NZ dates import without carrying ambiguous checkbox decisions', () => {
  const zip = new PizZip();
  const lines = ['Biology', 'Marking Feedback', 'Standard: 99999 ', 'Level: 3 Credits: 5 Version: 2',
    'Student Name: Synthetic learner', 'Assessed Grade: AMarking Schedule'];
  zip.file('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
    lines.map(line => '<w:p><w:r><w:t>' + line + '</w:t></w:r></w:p>').join('') + '</w:body></w:document>');
  const result = importDocument(zip.generate({ type: 'nodebuffer' }), 'feedback');
  assert.equal(result.common.standardNumber, '99999');
  assert.equal(result.common.subject, 'Biology');
  assert.equal(result.common.level, '3');
  assert.equal(result.document.grade, 'A');
  assert.equal(validContent('moderation', { ...result.common, feedback: JSON.stringify(result.document) }), true);
  const internal = new PizZip(renderDocument('internal', { ...fixture, internal: JSON.stringify({ consent: 'Yes', critiqueDate: '2026-10-22' }) }, 2026));
  internal.file('word/document.xml', internal.file('word/document.xml').asText().replace('Decision: Yes', 'Yes')
    .replace(/<w:(?:highlight|shd)\b[^>]*\/>/g, '').replaceAll('2026-10-22', '22/10/2026'));
  const imported = importDocument(internal.generate({ type: 'nodebuffer' }), 'internal');
  assert.equal(imported.document.critiqueDate, '2026-10-22');
  assert.equal(imported.document.consent, 'Yes', 'a single exported answer with the alternative cell empty is explicit');
  const sourceXml = new PizZip(renderDocument('internal', { ...fixture, internal: JSON.stringify({ sourceTypes: 'TKI' }) }, 2026)).file('word/document.xml').asText();
  assert.match(sourceXml, /Source of materials: ☐ Commercial   ☐ Own   ☒ TKI   ☐ NZQA   ☐ Subject Association   ☐ Other/);
  const legacy = new PizZip(renderDocument('internal', { ...fixture, internal: JSON.stringify({ source: 'placeholder' }) }, 2026));
  legacy.file('word/document.xml', legacy.file('word/document.xml').asText().replace(/☐ Commercial[^<]*/, 'Teacher-written task'));
  const legacyImport = importDocument(legacy.generate({ type: 'nodebuffer' }), 'internal');
  assert.equal(legacyImport.document.sourceTypes, undefined);
  assert.equal(legacyImport.document.source, 'Teacher-written task\nplaceholder');
});
test('legacy source menu imports only highlighted options, including split runs and Google Docs shading', () => {
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  function importSource(runs) {
    const zip = new PizZip(renderDocument('internal', fixture, 2026));
    const doc = new DOMParser().parseFromString(zip.file('word/document.xml').asText(), 'application/xml');
    const table = doc.getElementsByTagNameNS(W, 'tbl')[0];
    const row = Array.from(table.childNodes).filter(n => n.localName === 'tr')[4];
    const cell = Array.from(row.childNodes).find(n => n.localName === 'tc');
    while (cell.firstChild) cell.removeChild(cell.firstChild);
    const p = doc.createElementNS(W, 'w:p'); cell.appendChild(p);
    for (const [value, style = ''] of runs) {
      const r = doc.createElementNS(W, 'w:r');
      if (style) {
        const pr = doc.createElementNS(W, 'w:rPr');
        const mark = doc.createElementNS(W, style === 'shading' ? 'w:shd' : 'w:highlight');
        mark.setAttributeNS(W, style === 'shading' ? 'w:fill' : 'w:val', style === 'shading' ? 'FFFF00' : style);
        pr.appendChild(mark); r.appendChild(pr);
      }
      const t = doc.createElementNS(W, 'w:t'); t.textContent = value; r.appendChild(t); p.appendChild(r);
    }
    zip.file('word/document.xml', new XMLSerializer().serializeToString(doc));
    return importDocument(zip.generate({ type: 'nodebuffer' }), 'internal').document;
  }
  const start = ['Source of Materials: '];
  const tail = [' / Own / TKI / NZQA / Subject Association / Other: '];
  const selected = importSource([start, ['Commer', 'yellow'], ['cial', 'yellow'], tail]);
  assert.equal(selected.sourceTypes, 'Commercial');
  assert.equal(selected.source, '');
  assert.equal(validContent('moderation', { internal: JSON.stringify(selected) }), true);
  const shaded = importSource([start, ['Commercial', 'shading'], [' / Own / TKI / '],
    ['NZQA', 'yellow'], [' / Subject Association / Other: Adapted task']]);
  assert.equal(shaded.sourceTypes, 'Commercial, NZQA');
  assert.equal(shaded.source, 'Adapted task');
  for (const style of ['', 'none', 'white']) {
    const unselected = importSource([start, ['Commercial', style], tail]);
    assert.equal(unselected.sourceTypes, undefined, 'unmarked menu must not imply Commercial');
  }
});
test('legacy highlighted Yes/No decisions import across consent, critique, review and appeal without guessing', () => {
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const children = (node, tag) => Array.from(node.childNodes).filter(n => n.localName === tag);
  function prepare(type) {
    const zip = new PizZip(renderDocument(type, fixture, 2026));
    const doc = new DOMParser().parseFromString(zip.file('word/document.xml').asText(), 'application/xml');
    const tables = children(doc.getElementsByTagNameNS(W, 'body')[0], 'tbl');
    const cell = (t, r, c) => children(children(tables[t], 'tr')[r], 'tc')[c];
    function set(node, value, style) {
      while (node.firstChild) node.removeChild(node.firstChild);
      if (style === 'cell' || style === 'grey') {
        const pr = doc.createElementNS(W, 'w:tcPr'), shd = doc.createElementNS(W, 'w:shd');
        shd.setAttributeNS(W, 'w:fill', style === 'cell' ? 'FFFF00' : 'DDDDDD');
        pr.appendChild(shd); node.appendChild(pr);
      }
      const p = doc.createElementNS(W, 'w:p'), r = doc.createElementNS(W, 'w:r');
      if (style === 'run') {
        const pr = doc.createElementNS(W, 'w:rPr'), h = doc.createElementNS(W, 'w:highlight');
        h.setAttributeNS(W, 'w:val', 'yellow'); pr.appendChild(h); r.appendChild(pr);
      }
      const t = doc.createElementNS(W, 'w:t'); t.textContent = value;
      r.appendChild(t); p.appendChild(r); node.appendChild(p);
    }
    return { cell, set, import() {
      zip.file('word/document.xml', new XMLSerializer().serializeToString(doc));
      return importDocument(zip.generate({ type: 'nodebuffer' }), type);
    } };
  }
  const f = prepare('internal');
  f.set(f.cell(0, 3, 3), 'Yes', 'run'); f.set(f.cell(0, 3, 4), 'No');
  const critiqueRows = [8, 9, 10, 11, 13, 14, 15, 16, 17, 18, 19, 20];
  critiqueRows.forEach((row, i) => {
    f.set(f.cell(0, row, 1), 'Yes', i === 3 ? undefined : 'run');
    f.set(f.cell(0, row, 2), 'No', i === 3 ? 'cell' : undefined);
  });
  for (const row of [30, 32, 33, 34]) {
    f.set(f.cell(0, row, 1), 'Yes', 'cell'); f.set(f.cell(0, row, 2), 'No');
  }
  const result = f.import();
  assert.equal(result.document.consent, 'Yes');
  critique.forEach(([key], i) => assert.equal(result.document[key], i === 3 ? 'No' : 'Yes', key));
  for (const key of ['retained', 'randomSelection', 'reviewed', 'benchmarks']) assert.equal(result.document[key], 'Yes');
  assert.equal(validContent('moderation', { internal: JSON.stringify(result.document) }), true);
  f.set(f.cell(0, 8, 2), 'No', 'cell');
  const conflict = f.import();
  assert.equal(conflict.document.moderatorReport, '');
  assert.match(conflict.warning, /Conflicting highlights/);
  f.set(f.cell(0, 8, 1), 'Yes', 'grey'); f.set(f.cell(0, 8, 2), 'No', 'grey');
  assert.equal(f.import().document.moderatorReport, '', 'decorative grey cells do not imply answers');
  const cover = prepare('coversheet');
  for (const row of [1, 2, 3]) cover.set(cover.cell(2, row, 1), 'Yes / No', 'run');
  assert.equal(cover.import().document.appeal, '', 'both highlighted is ambiguous');
  cover.set(cover.cell(2, 1, 1), 'No', 'cell');
  assert.equal(cover.import().document.appeal, 'No');
});
test('moderation routes enforce sign-in, owner isolation, CSRF and private database reads/writes', async t => {
  const calls = [], records = new Map();
  records.set(owner + ':' + id, { content: fixture, revision: 1 });
  const app = express();
  app.use(session({ secret: 'synthetic-moderation-test-secret', resave: false, saveUninitialized: false }));
  app.use((req, res, next) => {
    if (req.get('x-test-user')) req.user = { id: req.get('x-test-user'), roles: [req.get('x-test-role') || 'Teacher'] };
    next();
  });
  app.use(createModuleRouter({ query: async (sql, params) => {
    calls.push({ sql, params });
    if (sql.startsWith('DELETE FROM planner_sections')) {
      assert.match(sql, /owner_id=\$1 AND year=\$2 AND section='moderation' AND entry_key=\$3 AND revision=\$4/);
      assert.match(sql, /NOT EXISTS/);
      assert.match(sql, /child.owner_id=\$1 AND child.year=\$2 AND child.section='moderation'/);
      assert.match(sql, /child.content->>'parentRecord'=\$3/);
      const key = params[0] + ':' + params[2], entry = records.get(key);
      const hasChildren = [...records.entries()].some(([key, row]) =>
        key.startsWith(params[0] + ':') && row.content.parentRecord === params[2]);
      if (params[1] !== 2026 || !entry || entry.revision !== params[3] || hasChildren) return { rows: [] };
      records.delete(key);
      return { rows: [{ entry_key: params[2] }] };
    }
    if (sql.includes('entry_key<>\'main\'')) {
      assert.match(sql, /content->>'standardTitle' AS standard_title/);
      assert.match(sql, /content->>'parentRecord' AS parent_record/);
      assert.match(sql, /owner_id=\$1 AND year=\$2/);
      return { rows: params[0] === owner ? [{ entry_key: id, title: fixture.title, standard_number: fixture.standardNumber,
        standard_title: fixture.standardTitle, parent_record: null }] : [] };
    }
    if (sql.startsWith('SELECT')) {
      const key = params.length === 3 ? params[2] : params[3];
      const entry = records.get(params[0] + ':' + key);
      return { rows: entry ? [entry] : [] };
    }
    if (sql.startsWith('UPDATE')) {
      const entry = records.get(params[0] + ':' + params[3]);
      if (!entry || entry.revision !== params[5]) return { rows: [] };
      entry.content = JSON.parse(params[4]); entry.revision++;
      return { rows: [{ revision: entry.revision, updated_at: new Date().toISOString() }] };
    }
    throw new Error('Unexpected test SQL: ' + sql);
  } }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = 'http://127.0.0.1:' + server.address().port + '/api/planner/';
  assert.equal((await fetch(base + 'moderation/2026')).status, 401);
  const sessionResponse = await fetch(base + 'session', { headers: { 'x-test-user': owner } });
  const cookie = sessionResponse.headers.get('set-cookie').split(';')[0];
  const csrf = (await sessionResponse.json()).csrf;
  const headers = { 'x-test-user': owner, cookie };
  const templatePath = base + 'moderation/templates/feedback';
  assert.equal((await fetch(templatePath)).status, 401);
  assert.equal((await fetch(templatePath, { headers: { ...headers, 'x-test-role': 'Student' } })).status, 403);
  const beforeTemplate = calls.length;
  const template = await fetch(templatePath, { headers });
  assert.equal(template.status, 200);
  assert.equal(template.headers.get('cache-control'), 'no-store');
  assert.ok(template.headers.get('content-disposition').includes('confirmation-feedback-template.docx'));
  assert.ok(template.headers.get('content-type').includes(DOCX));
  const blank = importDocument(Buffer.from(await template.arrayBuffer()), 'feedback');
  for (const key of ['studentName', 'studentId', 'standardNumber', 'standardTitle', 'version', 'level', 'credits']) {
    assert.ok(!blank.common[key], key + ' must be blank in the reusable template');
  }
  assert.ok(!blank.document.grade);
  assert.ok(!blank.document.feedback);
  assert.equal(calls.length, beforeTemplate, 'Downloading the blank template never reads or writes assessment records');
  const scheduleTemplatePath = base + 'moderation/templates/schedule';
  assert.equal((await fetch(scheduleTemplatePath)).status, 401);
  assert.equal((await fetch(scheduleTemplatePath, { headers: { ...headers, 'x-test-role': 'Student' } })).status, 403);
  const scheduleTemplate = await fetch(scheduleTemplatePath, { headers });
  assert.equal(scheduleTemplate.status, 200);
  assert.equal(scheduleTemplate.headers.get('cache-control'), 'no-store');
  assert.ok(scheduleTemplate.headers.get('content-disposition').includes('marking-schedule-template.docx'));
  assert.ok(scheduleTemplate.headers.get('content-type').includes(DOCX));
  const blankSchedule = importDocument(Buffer.from(await scheduleTemplate.arrayBuffer()), 'schedule');
  for (const key of ['studentName', 'studentId', 'standardNumber', 'standardTitle', 'version', 'level', 'credits']) {
    assert.ok(!blankSchedule.common[key], key + ' must be blank in the schedule template');
  }
  for (const key of ['grade', 'markerComments', 'achieved', 'merit', 'excellence']) assert.ok(!blankSchedule.document[key]);
  assert.deepEqual(blankSchedule.document.requirements, []);
  assert.equal((await fetch(base + 'moderation/templates/unsupported', { headers })).status, 400);
  assert.equal(calls.length, beforeTemplate, 'Template downloads and invalid types never access assessment records');
  const listing = await fetch(base + 'moderation/2026', { headers });
  assert.equal(listing.headers.get('cache-control'), 'no-store');
  const listed = (await listing.json()).records[0];
  assert.equal(listed.entry_key, id);
  assert.equal(listed.standard_title, fixture.standardTitle);
  const outsider = await fetch(base + 'moderation/2026', { headers: { 'x-test-user': other } });
  assert.deepEqual((await outsider.json()).records, []);
  const privateDoc = 'moderation/2026/' + id + '/schedule/document';
  assert.equal((await fetch(base + privateDoc, { headers: { 'x-test-user': other } })).status, 404);
  const download = await fetch(base + privateDoc, { headers });
  assert.equal(download.status, 200);
  assert.ok(download.headers.get('content-type').includes(DOCX));
  const buffer = Buffer.from(await download.arrayBuffer());
  assert.ok(importDocument(buffer, 'schedule').common.standardNumber === '99999');
  const address = base + '2026/moderation/' + id;
  const body = JSON.stringify({ content: { ...fixture, feedback: JSON.stringify({ grade: 'A', feedback: 'Synthetic comment' }) }, revision: 1 });
  assert.equal((await fetch(address, { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' }, body })).status, 403);
  const saved = await fetch(address, { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json', 'x-planner-csrf': csrf }, body });
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).revision, 2);
  assert.equal((await fetch(address, { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json', 'x-planner-csrf': csrf }, body })).status, 409);
  const imported = await fetch(base + 'moderation/import/schedule', {
    method: 'POST', headers: { ...headers, 'Content-Type': DOCX, 'x-planner-csrf': csrf }, body: buffer
  });
  assert.equal(imported.status, 200);
  assert.equal((await imported.json()).common.standardNumber, '99999');
  const child = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  records.set(owner + ':' + child, { content: { parentRecord: id }, revision: 1 });
  const remove = (record, revision, overrides = {}) => fetch(base + 'moderation/2026/' + record, {
    method: 'DELETE', headers: { ...headers, 'Content-Type': 'application/json', 'x-planner-csrf': csrf, ...overrides },
    body: JSON.stringify({ revision })
  });
  assert.equal((await remove(id, 2, { 'x-planner-csrf': 'forged' })).status, 403);
  assert.equal((await remove('main', 2)).status, 400);
  assert.equal((await remove(id, 0)).status, 400);
  assert.equal((await remove(id, 2)).status, 409, 'parent with student records must not be deleted');
  assert.equal((await remove(child, 1, { 'x-test-user': other })).status, 409);
  assert.equal((await remove(child, 2)).status, 409, 'stale revision must not delete');
  assert.equal((await remove(child, 1)).status, 200);
  assert.ok(records.has(owner + ':' + id));
  assert.equal((await remove(id, 1)).status, 409);
  const deleted = await remove(id, 2);
  assert.equal(deleted.status, 200);
  assert.deepEqual(await deleted.json(), { deleted: id });
  assert.equal(records.has(owner + ':' + id), false);
  assert.equal((await remove(id, 2)).status, 409);
  for (const call of calls) assert.match(call.sql, /owner_id=\$1/);
});
test('Moderation is enabled in navigation, with template-backed scripts and no browser storage', () => {
  const html = renderShell({ baseUrl: '/', standalone: false, coreUrl: '' });
  assert.match(html, /data-section="moderation">Moderation/);
  assert.match(html, /moderation-schema\.js/);
  assert.match(html, /moderation\.js/);
  const source = fs.readFileSync(require.resolve('./public/moderation.js'), 'utf8');
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB/);
  assert.equal(common.length, 13);
});
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');
