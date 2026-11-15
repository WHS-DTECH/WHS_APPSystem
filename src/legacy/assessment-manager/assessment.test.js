const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const fs = require('node:fs');
const PizZip = require('pizzip');
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');
const { DOCX, renderDocument, fillDocument, importDocument } = require('./moderationDocuments');
const { createAssessmentRouter, validModerationContent, validSelectedStandards } = require('./assessment');
const { achievementDetails } = require('./standardDetails');
const { checkBsas } = require('./nzqaConsent');

const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const otherOwner = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const record = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const child = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

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
  assert.deepEqual(imported.requirements[0], schedule.requirements[0]);
  const updated = fillDocument(renderDocument('schedule', data, 2026), 'schedule', data, 2026);
  assert.equal(importDocument(updated, 'schedule').document.notes, source);
});

test('schedule documents round-trip N and requirement levels, including conflicting saved marks', () => {
  const requirements = [
    { requirement: 'Basic requirement', level: 'A', grade: 'N', evidence: 'Evidence' },
    { requirement: 'Merit requirement', level: 'M', grade: 'M' },
    { requirement: 'Excellence requirement', level: 'E', grade: 'M' },
    { requirement: 'Unclassified requirement', grade: 'N' }
  ];
  const data = { standardNumber: '99999', version: '2', schedule: JSON.stringify({ requirements }) };
  assert.equal(validModerationContent(data), true);
  const first = renderDocument('schedule', data, 2026);
  for (const buffer of [first, fillDocument(first, 'schedule', data, 2026)]) {
    const result = importDocument(buffer, 'schedule').document.requirements;
    assert.deepEqual(result.map(({ requirement, level, grade }) => ({ requirement, level, grade })),
      requirements.map(({ requirement, level, grade }) => ({ requirement, level, grade })));
    assert.equal(result[0].evidence, 'Evidence');
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
    assert.deepEqual(requirements.map(fill), Array(7).fill('0000FF'));
    const entry = cells(label('Planning'));
    assert.deepEqual(entry.map(fill), Array(7).fill('FFFFFF'));
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
  assert.equal(imported.document.requirements[0].grade, 'A');
  const old = fillDocument(fs.readFileSync(require('node:path').join(__dirname, 'templates', 'schedule.docx')), 'schedule', data, 2026);
  const legacy = importDocument(old, 'schedule');
  assert.equal(legacy.common.subject, 'Computing');
  assert.equal(legacy.common.course, undefined);
});

test('older schedule documents without N retain their recorded grade without guessing a level', () => {
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const zip = new PizZip(fs.readFileSync(require('node:path').join(__dirname, 'templates', 'schedule.docx')));
  const doc = new DOMParser().parseFromString(zip.file('word/document.xml').asText(), 'application/xml');
  const table = doc.getElementsByTagNameNS(W, 'tbl')[0];
  const kids = (node, tag) => Array.from(node.childNodes).filter(item => item.namespaceURI === W && item.localName === tag);
  const row = kids(table, 'tr')[11], columns = kids(row, 'tc');
  const set = (cell, value) => Array.from(cell.getElementsByTagNameNS(W, 't')).forEach((t, i) => { t.textContent = i ? '' : value; });
  set(columns[0], 'Legacy requirement'); set(columns[2], 'Yes');
  zip.file('word/document.xml', new XMLSerializer().serializeToString(doc));
  const imported = importDocument(zip.generate({ type: 'nodebuffer' }), 'schedule').document.requirements[0];
  assert.equal(imported.requirement, 'Legacy requirement');
  assert.equal(imported.grade, 'M');
  assert.equal(imported.level, undefined);
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