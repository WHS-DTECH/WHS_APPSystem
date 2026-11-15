const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
const { createAssessmentRouter, validModerationContent } = require('./assessment');
const library = require('./public/resource-library-schema');
const { renderDocument, importDocument } = require('./moderationDocuments');
const resourceId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const teacherId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const secondTeacher = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const file = (id, name, mimeType = 'application/pdf') => ({ id, name, mimeType, modifiedTime: '2026-11-14T00:00:00Z' });
function example() {
  return { ...library.emptyContent(), title: 'Database project', edition: '2026 edition', supplier: 'Synthetic Supplier',
    price: '125.50', purchaseDate: '2026-03-01', gst: 'Included',
    standards: [{ number: '29777', version: '2' }],
    purchaseZip: [file('purchase_zip_123', 'Purchase.zip', 'application/zip')],
    resourceFolder: [file('resource_folder_123', 'Teacher resources', 'application/vnd.google-apps.folder')],
    assessmentFiles: [file('assessment_file_123', 'Instructions and schedule.pdf')],
    topicBriefFiles: [file('topic_brief_file_123', 'Topic brief.pdf')],
    critiques: [{ id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', name: 'Synthetic Critiquer', school: 'Synthetic School',
      date: '2026-03-09', outcome: 'Approved', changes: '', evidence: file('critique_file_123', 'Critique.pdf') }] };
}
test('library editions validate purchase, standards, Drive groups and approved critique details', () => {
  assert.equal(library.validate(example()), '');
  for (const change of [
    { price: '-1' }, { price: '1.999' }, { purchaseDate: '2026-02-30' }, { currency: 'dollars' },
    { supplierWebsite: 'javascript:alert(1)' }, { standards: [{ number: '29777', version: '' }] },
    { purchaseZip: [file('purchase_zip_123', 'Instructions.pdf')] },
    { resourceFolder: [file('purchase_zip_123', 'Not a folder.pdf')] },
    { critiques: [{ ...example().critiques[0], date: '' }] }
  ]) assert.ok(library.validate({ ...example(), ...change }), JSON.stringify(change));
});
test('supplier IDs are optional and validated for shared records and private drafts', () => {
  const content = example(), supplierId = '48f6472f-0982-4c87-94af-e62ef1e68eb2';
  assert.equal(library.validate(content), '');
  assert.equal(library.validate({ ...content, supplierId }), '');
  assert.equal(library.validateDraft({ ...content, supplierId }), '');
  assert.ok(library.validate({ ...content, supplierId: 'invalid' }));
  assert.ok(library.validateDraft({ ...content, supplierId: 'invalid' }));
});
test('own, TKI and NZQA assessments validate their source and apply the correct moderation ticks', () => {
  const origin = { type: 'Own', authorId: teacherId, authorName: 'Synthetic Teacher', originalUrl: '', linkedDate: '', modificationNotes: '', finalUrl: '' };
  const content = { ...example(), supplier: '', origin };
  assert.equal(library.validate(content), '');
  const own = library.snapshot({ id: resourceId, revision: 1, content }, '29777', '2');
  assert.equal(own.sourceTypes, 'Own');
  assert.match(own.source, /^Instructions and schedule\.pdf \| https:/);
  assert.equal(library.fillMissing({}, {}, own).internal.sourceTypes, 'Own');
  assert.ok(library.validate({ ...content, origin: { ...origin, authorId: '' } }));
  for (const type of ['TKI', 'NZQA']) {
    const external = { ...content, origin: { ...origin, type, authorId: '', authorName: '',
      originalUrl: 'https://example.org/original', linkedDate: '2026-11-15',
      modificationNotes: 'Adjusted the scenario', finalUrl: 'https://docs.google.com/document/d/assessment/edit' } };
    assert.equal(library.validate(external), '');
    const selected = library.snapshot({ id: resourceId, revision: 1, content: external }, '29777', '2');
    assert.equal(selected.sourceTypes, type);
    assert.match(selected.source, /^Instructions and schedule\.pdf \| https:/);
    assert.doesNotMatch(selected.source, /Original assessment|Final assessment|Date linked|Modification notes/);
    assert.match(selected.assessmentInstructionsLink, /docs\.google\.com\/document/);
    const filled = library.fillMissing({ sourceTypes: 'Commercial', source: 'Existing source' }, {}, selected);
    assert.equal(filled.internal.sourceTypes, 'Commercial, ' + type);
    assert.equal(filled.internal.source, 'Existing source');
    assert.equal(library.fillMissing(filled.internal, filled.schedule, selected).internal.sourceTypes, 'Commercial, ' + type);
    assert.match(require('./public/moderation-schema').sourceScheduleLinks(selected.source).assessmentInstructionsLink, /assessment_file_123/);
    const moderation = { standardNumber: '29777', version: '2', resourceLibrary: JSON.stringify(selected), internal: JSON.stringify(filled.internal) };
    assert.equal(validModerationContent(moderation), true);
    const imported = importDocument(Buffer.from(renderDocument('internal', moderation, 2026)), 'internal');
    assert.ok(imported.document.sourceTypes.split(', ').includes(type));
    assert.ok(library.validate({ ...external, origin: { ...external.origin, linkedDate: '' } }));
    assert.ok(library.validate({ ...external, origin: { ...external.origin, originalUrl: 'javascript:alert(1)' } }));
    assert.ok(library.validate({ ...external, origin: { ...external.origin, finalUrl: 'https://example.org/final' } }));
    assert.equal(library.validateDraft({ ...external, origin: { ...external.origin, originalUrl: '', linkedDate: '' } }), '');
  }
});
test('multiple original and final links survive validation and flow to moderation', () => {
  for (const type of ['TKI', 'NZQA']) {
    const origin = { type, authorId: '', authorName: '', originalUrl: 'https://example.org/one',
      linkedDate: '2025-01-02', modificationNotes: 'Adapted',
      finalUrl: 'https://drive.google.com/file/d/first/view',
      additionalOriginals: [{ url: 'https://example.org/two', linkedDate: '2026-03-04' }],
      additionalFinals: ['https://docs.google.com/document/d/second/edit'] };
    const content = { ...example(), origin };
    assert.equal(library.validate(content), '');
    const selected = library.snapshot({ id: resourceId, revision: 1, content }, '29777', '2');
    assert.equal(selected.sourceTypes, type);
    assert.match(selected.source, /^Instructions and schedule\.pdf \| https:/);
    assert.doesNotMatch(selected.source, /Original assessment|Final assessment|Date linked|Modification notes/);
    assert.match(selected.assessmentInstructionsLink, /docs.google.com\/document\/d\/second\/edit/);
    const filled = library.fillMissing({}, {}, selected);
    const links = require('./public/moderation-schema').documentResources(filled.schedule.assessmentInstructionsLink);
    assert.equal(links.length, 3);
    assert.ok(links.some(link => link.url.includes('/first/')));
    assert.ok(links.some(link => link.url.includes('/second/')));
    const moderation = { standardNumber: '29777', version: '2', resourceLibrary: JSON.stringify(selected),
      internal: JSON.stringify(filled.internal), schedule: JSON.stringify(filled.schedule) };
    assert.equal(validModerationContent(moderation), true);
    const exported = importDocument(Buffer.from(renderDocument('schedule', moderation, 2026)), 'schedule');
    assert.equal(exported.document.assessmentInstructionsLink, filled.schedule.assessmentInstructionsLink);
    const noFinals = { ...content, origin: { ...origin, finalUrl: '', additionalFinals: [] } };
    const fallback = library.snapshot({ id: resourceId, revision: 1, content: noFinals }, '29777', '2');
    assert.match(fallback.assessmentInstructionsLink, /example.org\/one/);
    assert.match(fallback.assessmentInstructionsLink, /example.org\/two/);
    for (const invalid of [
      { additionalOriginals: [{ url: 'https://example.org/two', linkedDate: '' }] },
      { additionalOriginals: [{ url: 'https://example.org/one', linkedDate: '2025-01-02' }] },
      { additionalFinals: ['https://example.org/not-google'] },
      { additionalFinals: [origin.finalUrl] }
    ]) assert.ok(library.validate({ ...content, origin: { ...origin, ...invalid } }));
    const draft = { ...content, origin: { ...origin, additionalOriginals: [{ url: '', linkedDate: '' }] } };
    assert.equal(library.validateDraft(draft), '');
    assert.ok(library.validate(draft));
    const tooLong = { ...content, origin: { ...origin, finalUrl: 'https://drive.google.com/' + 'a'.repeat(470), additionalFinals: [] } };
    assert.throws(() => library.snapshot({ id: resourceId, revision: 1, content: tooLong }, '29777', '2'), /too long/);
  }
});
test('source shows assessment document names and falls back to final links only when no files are linked', () => {
  const content = example();
  content.origin = { type: 'TKI', authorId: '', authorName: '', originalUrl: 'https://example.org/original', linkedDate: '2026-01-02',
    modificationNotes: 'Private notes', finalUrl: 'https://drive.google.com/file/d/final/view' };
  content.assessmentFiles.push(file('another_file_123', 'Another instructions.pdf'));
  const entry = { id: resourceId, revision: 1, content };
  const selected = library.snapshot(entry, '29777', '2');
  assert.equal(selected.source, content.assessmentFiles.map(item => item.name + ' | ' + library.driveUrl(item)).join('\n'));
  assert.equal(content.origin.modificationNotes, 'Private notes');
  assert.match(selected.sourceProvenance, /Original assessment \| https:\/\/example.org\/original/);
  assert.match(selected.sourceProvenance, /Date linked: 2026-01-02/);
  assert.match(selected.sourceProvenance, /Modification notes: Private notes/);
  assert.match(selected.assessmentInstructionsLink, /file\/d\/final/);
  content.assessmentFiles = [];
  assert.equal(library.snapshot(entry, '29777', '2').source, 'Assessment Instructions & Schedule | ' + content.origin.finalUrl);
});
test('legacy saved source is simplified without changing the saved snapshot or existing manual source', () => {
  const selected = library.snapshot({ id: resourceId, revision: 1, content: example() }, '29777', '2');
  const legacy = { ...selected, source: 'TKI - Database project\nFinal assessment | https://example.org/final\n' +
    'Original assessment | https://example.org/original\nDate linked: 2026-01-02\nModification notes: Kept in snapshot\n' +
    'Assessment Instructions & Schedule | https://drive.google.com/file/d/assessment_file_123/view' };
  delete legacy.sourceProvenance;
  assert.equal(library.moderationSource(legacy), selected.source);
  const internal = library.fillMissing({}, {}, legacy).internal;
  assert.equal(internal.source, selected.source);
  assert.equal(library.fillMissing({ source: 'Manual source' }, {}, legacy).internal.source, 'Manual source');
  assert.match(legacy.source, /Modification notes: Kept in snapshot/);
  const record = { standardNumber: '29777', version: '2', resourceLibrary: JSON.stringify(legacy), internal: JSON.stringify(internal) };
  const imported = importDocument(Buffer.from(renderDocument('internal', record, 2026)), 'internal');
  assert.equal(imported.document.source, selected.source);
});
test('additional source links round-trip through shared records and saved revisions', async t => {
  const app = await serverFixture(t);
  const content = { ...example(), origin: { type: 'TKI', authorId: '', authorName: '', originalUrl: 'https://example.org/one',
    linkedDate: '2025-01-02', modificationNotes: '', finalUrl: 'https://drive.google.com/file/d/first/view',
    additionalOriginals: [{ url: 'https://example.org/two', linkedDate: '2025-03-04' }],
    additionalFinals: ['https://docs.google.com/document/d/second/edit'] } };
  assert.equal((await app.put(content, 0)).status, 200);
  const saved = await (await fetch(app.base + 'resource-library/' + resourceId)).json();
  assert.deepEqual(saved.content.origin, content.origin);
  assert.equal((await app.put({ ...content, description: 'Updated description' }, 1)).status, 200);
  assert.deepEqual(app.history[0].content.origin, content.origin);
});
test('Own attribution must be made by the signed-in author and is retained for shared edits', async t => {
  const app = await serverFixture(t);
  app.user = { id: teacherId, roles: ['Teacher'], display_name: 'Synthetic Teacher' };
  const content = { ...example(), supplier: '', origin: { type: 'Own', authorId: secondTeacher,
    authorName: 'Another Teacher', originalUrl: '', linkedDate: '', modificationNotes: '', finalUrl: '' } };
  assert.equal((await app.put(content, 0)).status, 403);
  content.origin = { ...content.origin, authorId: teacherId, authorName: 'Synthetic Teacher' };
  assert.equal((await app.put(content, 0)).status, 200);
  app.user = { id: secondTeacher, roles: ['Teacher'], display_name: 'Another Teacher' };
  assert.equal((await app.put({ ...content, description: 'Shared edit' }, 1)).status, 200);
  assert.equal((await app.put({ ...content, origin: { ...content.origin, authorName: 'Someone Else' } }, 2)).status, 403);
});
test('critique positions are optional for legacy records and validated when present', async t => {
  const app = await serverFixture(t), content = example();
  assert.equal(library.validate(content), '');
  content.critiques[0].position = 'Head of Department';
  assert.equal((await app.put(content, 0)).status, 200);
  const saved = await (await fetch(app.base + 'resource-library/' + resourceId)).json();
  assert.equal(saved.content.critiques[0].position, 'Head of Department');
  for (const position of [null, 123, 'x'.repeat(501)]) {
    assert.ok(library.validate({ ...content, critiques: [{ ...content.critiques[0], position }] }));
  }
  const cleared = { ...content, critiques: [{ ...content.critiques[0], position: '', positionAutofillDisabled: true }] };
  assert.equal(library.validate(cleared), '');
  assert.equal(library.validateDraft(cleared), '');
  assert.ok(library.validate({ ...cleared, critiques: [{ ...cleared.critiques[0], positionAutofillDisabled: 'yes' }] }));
  assert.ok(library.validateDraft({ ...cleared, critiques: [{ ...cleared.critiques[0], positionAutofillDisabled: 'yes' }] }));
});
test('new library records save and apply without a supplier edition while retaining legacy editions', async t => {
  const app = await serverFixture(t), content = { ...example(), edition: '' };
  assert.equal(library.validate(content), '');
  assert.equal((await app.put(content, 0)).status, 200);
  const entry = await (await fetch(app.base + 'resource-library/' + resourceId)).json();
  const snapshot = library.snapshot(entry, '29777', '2');
  assert.equal(library.validSnapshot(snapshot), true);
  assert.doesNotMatch(snapshot.source, /\(edition\s*\)/);
  assert.equal(library.fillMissing({}, {}, snapshot).internal.source, snapshot.source);
  assert.equal(library.snapshot({ ...entry, content: example() }, '29777', '2').edition, '2026 edition');
  const legacyApp = await serverFixture(t), legacy = example();
  assert.equal((await legacyApp.put(legacy, 0)).status, 200);
  assert.equal((await legacyApp.put({ ...legacy, description: 'Updated brief' }, 1)).status, 200);
  const saved = await (await fetch(legacyApp.base + 'resource-library/' + resourceId)).json();
  assert.equal(saved.content.edition, '2026 edition');
});
test('library snapshots exclude purchasing resources and do not invent unrecorded critique checks', () => {
  const content = example(), entry = { id: resourceId, revision: 3, content };
  const snapshot = library.snapshot(entry, '29777', '2', content.critiques[0].id);
  assert.ok(library.validSnapshot(snapshot));
  assert.doesNotMatch(JSON.stringify(snapshot), /125\.50|purchase_zip|resource_folder|GST|orderReference/);
  assert.match(snapshot.source, /^Instructions and schedule\.pdf \| https:/);
  assert.equal(snapshot.critiqueName, 'Synthetic Critiquer');
  const next = library.fillMissing({ source: 'Existing assessment', critiqueName: 'Existing Critiquer', conditions: 'No' },
    { grade: 'A', fileSubmissionLink: 'Existing student files', topicBriefLink: 'Existing topic' }, snapshot);
  assert.equal(next.internal.source, 'Existing assessment');
  assert.equal(next.internal.critiqueName, 'Existing Critiquer');
  assert.equal(next.internal.critiqueSchool, 'Synthetic School');
  assert.equal(next.internal.conditions, 'No');
  assert.equal(next.internal.previousCritique, undefined);
  assert.equal(next.schedule.grade, 'A');
  assert.equal(next.schedule.fileSubmissionLink, 'Existing student files');
  assert.equal(next.schedule.topicBriefLink, 'Existing topic');
  assert.match(next.schedule.assessmentInstructionsLink, /assessment_file_123/);
  content.title = 'Changed in library';
  assert.equal(snapshot.title, 'Database project');
  assert.throws(() => library.snapshot(entry, '29777', '3'), /does not match/);
  assert.throws(() => library.snapshot({ ...entry, content: { ...content, status: 'Superseded' } }, '29777', '2'), /superseded/);
  assert.throws(() => library.snapshot({ ...entry, content: { ...content, licenceExpiry: '2000-01-01' } }, '29777', '2'), /expired/);
  const child = library.fillMissing({}, {}, snapshot, false);
  assert.deepEqual(child.internal, {});
});
test('library snapshots retain class codes while accepting older selections', () => {
  const content = example();
  content.classCodes = ['11DTECH', '12DTECH'];
  const snapshot = library.snapshot({ id: resourceId, revision: 1, content }, '29777', '2');
  assert.deepEqual(snapshot.classCodes, ['11DTECH', '12DTECH']);
  content.classCodes.push('13COMP');
  assert.deepEqual(snapshot.classCodes, ['11DTECH', '12DTECH']);
  assert.equal(library.validSnapshot({ ...snapshot, classCodes: ['11DTECH', '11dtech'] }), false);
  const legacy = { ...snapshot }; delete legacy.classCodes;
  assert.equal(library.validSnapshot(legacy), true);
});
test('recorded critique checks persist and fill only empty moderation answers in a saved snapshot', async t => {
  const app = await serverFixture(t), content = example();
  content.critiques[0].checks = { context: 'Yes', allGrades: 'No', scheduleConsistent: 'Not applicable', standardDetails: '' };
  assert.equal((await app.put(content, 0)).status, 200);
  const entry = await (await fetch(app.base + 'resource-library/' + resourceId)).json();
  const snapshot = library.snapshot(entry, '29777', '2', content.critiques[0].id);
  assert.deepEqual(snapshot.critiqueChecks, { context: 'Yes', allGrades: 'No', scheduleConsistent: 'Not applicable' });
  assert.equal(library.validSnapshot(snapshot), true);
  const next = library.fillMissing({ context: 'No', conditions: 'Yes' }, {}, snapshot);
  assert.deepEqual([next.internal.context, next.internal.allGrades, next.internal.scheduleConsistent, next.internal.standardDetails],
    ['No', 'No', 'Not applicable', undefined]);
  assert.equal(library.fillMissing({}, {}, snapshot, false).internal.allGrades, undefined);
  assert.equal(library.snapshot(entry, '29777', '2').critiqueChecks, undefined);
  entry.content.critiques[0].checks.allGrades = 'Yes';
  assert.equal(snapshot.critiqueChecks.allGrades, 'No');
  const moderation = { standardNumber: '29777', version: '2', course: '11DTECH, 12DTECH',
    resourceLibrary: JSON.stringify(snapshot), internal: JSON.stringify(next.internal) };
  assert.equal(validModerationContent(moderation), true);
  assert.equal(validModerationContent({ ...moderation, resourceLibraryId: resourceId }), true);
  assert.equal(validModerationContent({ ...moderation, resourceLibraryId: 'not-an-id' }), false);
  assert.equal(validModerationContent({ ...moderation, resourceLibraryId: secondTeacher }), false);
  assert.equal(validModerationContent({ standardNumber: '29777', resourceLibraryId: resourceId }), true);
  assert.equal(validModerationContent({ standardNumber: '29777', courseLibraryInitialized: resourceId }), true);
  assert.equal(validModerationContent({ standardNumber: '29777', courseLibraryInitialized: 'invalid' }), false);
  const imported = importDocument(Buffer.from(renderDocument('internal', moderation, 2026)), 'internal');
  assert.equal(imported.common.course, '11DTECH, 12DTECH');
  assert.equal(imported.document.critiqueName, snapshot.critiqueName);
  assert.equal(imported.document.critiqueSchool, snapshot.critiqueSchool);
  assert.equal(imported.document.critiqueDate, snapshot.critiqueDate);
  assert.equal(imported.document.sourceTypes, snapshot.sourceTypes);
  assert.equal(imported.document.context, 'No');
  assert.equal(imported.document.allGrades, 'No');
  assert.equal(imported.document.scheduleConsistent, 'Not applicable');
  for (const checks of [{ context: true }, { context: 'Maybe' }, { conditions: 'Yes' }, null, []]) {
    assert.ok(library.validate({ ...content, critiques: [{ ...content.critiques[0], checks }] }));
    assert.equal(library.validSnapshot({ ...snapshot, critiqueChecks: checks }), false);
  }
  assert.equal(library.validSnapshot({ ...snapshot, critiqueId: '' }), false);
  const legacy = { ...snapshot }; delete legacy.critiqueChecks;
  assert.equal(library.validSnapshot(legacy), true);
  assert.equal(library.fillMissing({}, {}, legacy).internal.context, undefined);
});
test('library-backed moderation exports teaching links but not the library purchase ZIP or folder', () => {
  const snapshot = library.snapshot({ id: resourceId, revision: 1, content: example() }, '29777', '2');
  const next = library.fillMissing({}, {}, snapshot);
  const content = { standardNumber: '29777', version: '2', resourceLibrary: JSON.stringify(snapshot),
    internal: JSON.stringify(next.internal), schedule: JSON.stringify(next.schedule) };
  assert.equal(validModerationContent(content), true);
  const rendered = renderDocument('internal', content, 2026);
  const imported = importDocument(Buffer.from(rendered), 'internal');
  assert.match(imported.document.source, /assessment_file_123/);
  assert.doesNotMatch(JSON.stringify(imported), /purchase_zip|resource_folder|125\.50/);
  const schedule = importDocument(Buffer.from(renderDocument('schedule', content, 2026)), 'schedule');
  assert.equal(schedule.document.assessmentInstructionsLink, snapshot.assessmentInstructionsLink);
  assert.equal(schedule.document.topicBriefLink, snapshot.topicBriefLink);
  assert.doesNotMatch(JSON.stringify(schedule), /purchase_zip|resource_folder|125\.50/);
  assert.equal(validModerationContent({ ...content, resourceLibrary: JSON.stringify({ ...snapshot, price: '125.50' }) }), false);
});

async function serverFixture(t) {
  let user = { id: teacherId, roles: ['Teacher'] };
  const rows = new Map(), history = [], evaluations = [];
  const app = express(), session = {};
  app.use((req, res, next) => { req.user = user; req.session = session; next(); });
  app.use('/api', createAssessmentRouter({ query: async (sql, params) => {
    if (sql.includes('COUNT(*) > 1 FROM assessment_resource_library candidate')) {
      return { rows: [{ number: '29777', version: '2', ambiguous: false }] };
    }
    if (sql.includes('FROM assessment_records r')) {
      assert.match(sql, /r\.parent_record IS NULL/);
      assert.match(sql, /resourceLibraryId/);
      assert.match(sql, /selection->>'resourceId'/);
      assert.equal(params[0], resourceId);
      return { rows: evaluations };
    }
    if (sql.includes('COUNT(*) OVER()')) {
      return { rows: [...rows.values()].map(row => ({ id: row.id, revision: row.revision, ...row.content, total: rows.size })) };
    }
    if (sql.includes('FROM assessment_resource_library_history')) return { rows: history.filter(item => item.resource_id === params[0]).reverse() };
    if (sql.startsWith('SELECT id,content')) return { rows: rows.has(params[0]) ? [rows.get(params[0])] : [] };
    if (sql.includes('saved AS (')) {
      const [id, json, editor, revision = 0] = params, old = rows.get(id);
      if ((!revision && old) || revision && (!old || old.revision !== revision)) return { rows: [] };
      assert.match(sql, /INSERT INTO assessment_resource_library_history/);
      const row = { id, content: JSON.parse(json), revision: revision + 1, updated_by: editor, updated_at: '2026-11-14T00:00:00Z' };
      rows.set(id, row); history.push({ resource_id: id, ...structuredClone(row) });
      return { rows: [{ id, revision: row.revision, updated_at: row.updated_at }] };
    }
    throw new Error('Unexpected SQL');
  } }));
  app.use((error, req, res, next) => { res.status(500).json({ error: 'Test request failed.' }); });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/`;
  const csrf = (await (await fetch(base + 'session')).json()).csrf;
  const put = (content, revision, token = csrf) => fetch(base + 'resource-library/' + resourceId, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-assessment-csrf': token },
    body: JSON.stringify({ content, revision })
  });
  return { base, put, rows, history, evaluations, set user(value) { user = value; } };
}
test('library exposes only linked evaluation details to signed-in staff', async t => {
  const app = await serverFixture(t);
  app.evaluations.push({ year: 2026, standard_number: '29777', standard_version: '2', match: 'linked', name: 'Evaluator', position: 'Teacher',
    date: '2026-03-09', comments: 'Review comments', owner_id: 'private-owner', student: 'Private student' });
  const result = await (await fetch(app.base + 'resource-library/' + resourceId + '/evaluations')).json();
  assert.deepEqual(result, { standards: [{ number: '29777', version: '2', ambiguous: false }], evaluations: [{ year: 2026, standardNumber: '29777', standardVersion: '2', name: 'Evaluator',
    position: 'Teacher', date: '2026-03-09', comments: 'Review comments', match: 'linked' }], more: false });
  app.user = { id: secondTeacher, roles: ['Student'] };
  assert.equal((await fetch(app.base + 'resource-library/' + resourceId + '/evaluations')).status, 403);
});
test('PostgreSQL shares separate linked evaluations and follows edits and deletion without student data', {
  skip: !process.env.ASSESSMENT_LIBRARY_TEST_DATABASE_URL && 'Set ASSESSMENT_LIBRARY_TEST_DATABASE_URL to an empty disposable PostgreSQL database.'
}, async t => {
  const pool = new Pool({ connectionString: process.env.ASSESSMENT_LIBRARY_TEST_DATABASE_URL });
  t.after(() => pool.end());
  for (const file of ['002_assessment_records.sql', '003_resource_library.sql', '006_library_drafts_and_deletion.sql', '007_suppliers.sql']) {
    await pool.query(fs.readFileSync(path.join(__dirname, 'db', 'migrations', file), 'utf8'));
  }
  let user = { id: teacherId, roles: ['Teacher'] };
  const app = express(), session = {};
  app.use((req, res, next) => { req.user = user; req.session = session; next(); });
  app.use('/api', createAssessmentRouter({ query: (sql, params) => pool.query(sql, params) }));
  app.use((error, req, res, next) => { console.error(error); res.status(500).json({ error: 'Test request failed.' }); });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/`;
  const csrf = (await (await fetch(base + 'session')).json()).csrf;
  const write = (url, body, method = 'PUT') => fetch(base + url, {
    method, headers: { 'Content-Type': 'application/json', 'x-assessment-csrf': csrf }, body: JSON.stringify(body)
  });
  const instant = '48f6472f-0982-4c87-94af-e62ef1e68eb2', kura = '337991fb-8e1e-4d24-80d5-1c9ee0fb579e';
  const supplierId = '77777777-7777-4777-8777-777777777777', reminderId = '88888888-8888-4888-8888-888888888888';
  const suppliers = (await (await fetch(base + 'suppliers')).json()).suppliers;
  assert.equal(suppliers.find(s => s.id === kura).phone, '021 552 247');
  assert.equal(suppliers.find(s => s.id === instant).email, 'orders@instant.org.nz');
  const supplier = { name: 'Synthetic Supplier', website: 'https://example.org/', email: '', phone: '', notes: '' };
  assert.equal((await write('suppliers/' + supplierId, { supplier, revision: 0 })).status, 200);
  assert.equal((await write('suppliers/' + crypto.randomUUID(), { supplier, revision: 0 })).status, 409);
  assert.equal((await write('suppliers/' + supplierId, { supplier: { ...supplier, website: 'http://example.org' }, revision: 1 })).status, 400);
  assert.equal((await write('suppliers/' + supplierId, { supplier, revision: 1 })).status, 200);
  assert.equal((await write('suppliers/' + supplierId, { supplier, revision: 1 })).status, 409);
  user = { id: secondTeacher, roles: ['Student'] };
  assert.equal((await fetch(base + 'suppliers')).status, 403);
  assert.equal((await write('suppliers/' + supplierId, { supplier, revision: 2 })).status, 403);
  user = { id: teacherId, roles: ['Teacher'] };
  const content = example(), first = '11111111-1111-4111-8111-111111111111';
  const second = '22222222-2222-4222-8222-222222222222', child = '33333333-3333-4333-8333-333333333333';
  const unrelated = '44444444-4444-4444-8444-444444444444';
  const draftId = '55555555-5555-4555-8555-555555555555', draftUrl = 'resource-library/' + draftId;
  const incomplete = { ...library.emptyContent(), title: 'Unfinished brief' };
  assert.equal((await write(draftUrl + '/draft', { content: incomplete, revision: 0, draftRevision: 0 })).status, 200);
  assert.equal((await (await fetch(base + draftUrl + '/draft')).json()).content.title, 'Unfinished brief');
  assert.equal((await (await fetch(base + 'resource-library/drafts')).json()).drafts.length, 1);
  assert.equal((await (await fetch(base + 'resource-library')).json()).records.length, 0);
  assert.equal((await write(draftUrl + '/draft', { content: incomplete, revision: 0, draftRevision: 0 })).status, 409);
  assert.equal((await write(draftUrl + '/draft', { content: { ...incomplete, standards: null }, revision: 0, draftRevision: 1 })).status, 400);
  user = { id: secondTeacher, roles: ['Teacher'] };
  assert.equal((await fetch(base + draftUrl + '/draft')).status, 404);
  assert.equal((await (await fetch(base + 'resource-library/drafts')).json()).drafts.length, 0);
  user = { id: teacherId, roles: ['Teacher'] };
  assert.equal((await write(draftUrl + '/draft', { content, revision: 0, draftRevision: 1 })).status, 200);
  assert.equal((await write(draftUrl, { content, revision: 0, draftRevision: 1 })).status, 409);
  assert.equal((await write(draftUrl, { content, revision: 0, draftRevision: 2 })).status, 200);
  assert.equal((await (await fetch(base + 'resource-library/drafts')).json()).drafts.length, 0);
  assert.equal((await (await fetch(base + draftUrl)).json()).revision, 1);
  const draftEdit = { ...content, supplierWebsite: 'https://' };
  assert.equal((await write(draftUrl + '/draft', { content: draftEdit, revision: 1, draftRevision: 0 })).status, 200);
  assert.equal((await (await fetch(base + draftUrl)).json()).content.supplierWebsite, content.supplierWebsite);
  user = { id: secondTeacher, roles: ['Teacher'] };
  assert.equal((await write(draftUrl, { content: { ...content, notes: 'Another teacher' }, revision: 1 })).status, 200);
  user = { id: teacherId, roles: ['Teacher'] };
  assert.equal((await write(draftUrl, { content, revision: 1, draftRevision: 1 })).status, 409);
  assert.equal((await (await fetch(base + draftUrl + '/draft')).json()).content.supplierWebsite, 'https://');
  assert.equal((await write(draftUrl, { revision: 1 }, 'DELETE')).status, 409);
  assert.equal((await write(draftUrl, { revision: 2 }, 'DELETE')).status, 200);
  assert.equal((await fetch(base + draftUrl)).status, 404);
  assert.equal((await fetch(base + draftUrl + '/draft')).status, 404);
  assert.equal((await (await fetch(base + 'resource-library/deleted')).json()).records[0].id, draftId);
  assert.equal((await write(draftUrl + '/restore', {}, 'POST')).status, 200);
  assert.equal((await (await fetch(base + draftUrl)).json()).content.notes, 'Another teacher');
  assert.equal((await (await fetch(base + draftUrl + '/history')).json()).revisions.length, 2);
  const raceUrl = 'resource-library/66666666-6666-4666-8666-666666666666';
  assert.equal((await write(raceUrl + '/draft', { content, revision: 0, draftRevision: 0 })).status, 200);
  const races = await Promise.all([
    write(raceUrl, { content, revision: 0, draftRevision: 1 }),
    write(raceUrl + '/draft', { content: { ...content, notes: 'Later edit' }, revision: 0, draftRevision: 1 })
  ]);
  assert.deepEqual(races.map(response => response.status).sort(), [200, 409]);
  const raceDraft = await fetch(base + raceUrl + '/draft');
  assert.equal(raceDraft.status, 200);
  const raceEntry = await raceDraft.json();
  assert.ok(raceEntry.draftRevision === 2 && raceEntry.content.notes === 'Later edit' || raceEntry.revision === 1);
  assert.equal((await write('resource-library/' + resourceId, { content, revision: 0 })).status, 200);
  assert.ok((await (await fetch(base + 'suppliers/' + supplierId + '/resources')).json()).resources.some(r => r.id === resourceId));
  const reminderUrl = 'suppliers/' + supplierId + '/reminders/' + reminderId;
  const reminder = { revision: 0, resourceId, details: 'New supplier revision', source: 'Supplier email', dueDate: '' };
  assert.equal((await write(reminderUrl, { ...reminder, source: '' })).status, 400);
  assert.equal((await write('suppliers/' + instant + '/reminders/' + reminderId, reminder)).status, 409);
  assert.equal((await write(reminderUrl, reminder)).status, 200);
  assert.equal((await (await fetch(base + 'suppliers/reminders')).json()).reminders.length, 1);
  assert.equal((await write(reminderUrl, { revision: 1, completed: true })).status, 200);
  assert.equal((await write(reminderUrl, { revision: 1, completed: false })).status, 409);
  assert.equal((await (await fetch(base + 'suppliers/reminders')).json()).reminders.length, 0);
  assert.equal((await write(reminderUrl, { revision: 2, completed: false })).status, 200);
  assert.equal((await (await fetch(base + 'suppliers/' + supplierId + '/reminders')).json()).reminders[0].completed, false);
  const linked = { ...content, supplierId };
  assert.equal((await write('resource-library/' + resourceId, { content: linked, revision: 1 })).status, 200);
  const externalId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const external = { ...linked, origin: { type: 'TKI', authorId: '', authorName: '', originalUrl: 'https://example.org/original',
    linkedDate: '2026-01-02', modificationNotes: '', finalUrl: '',
    additionalOriginals: [{ url: 'https://example.org/another', linkedDate: '2026-02-03' }],
    additionalFinals: ['https://docs.google.com/document/d/assessment/edit'] } };
  assert.equal((await write('resource-library/' + externalId, { content: external, revision: 0 })).status, 200);
  assert.deepEqual((await (await fetch(base + 'resource-library/' + externalId)).json()).content.origin, external.origin);
  assert.ok(!(await (await fetch(base + 'suppliers/' + supplierId + '/resources')).json()).resources.some(r => r.id === externalId));
  assert.equal((await write('suppliers/' + supplierId + '/reminders/' + crypto.randomUUID(), { ...reminder, resourceId: externalId })).status, 409);
  assert.equal((await write('suppliers/' + supplierId, { supplier: { ...supplier, name: 'Renamed Supplier' }, revision: 2 })).status, 200);
  assert.ok((await (await fetch(base + 'suppliers/' + supplierId + '/resources')).json()).resources.some(r => r.id === resourceId));
  const savedContent = (await (await fetch(base + 'resource-library/' + resourceId)).json()).content;
  assert.equal(savedContent.price, content.price);
  assert.equal(savedContent.purchaseDate, content.purchaseDate);
  const selection = JSON.stringify(library.snapshot({ id: resourceId, revision: 1, content }, '29777', '2'));
  const form = (name, comments) => ({ standardNumber: '29777', version: '2', resourceLibrary: selection,
    studentName: 'Private student', internal: JSON.stringify({ evaluationName: name, evaluationPosition: 'Teacher',
      evaluationDate: '2026-03-09', evaluationComments: comments }) });
  assert.equal((await write('2026/moderation/' + first, { content: form('Teacher A', 'First'), revision: 0 })).status, 200);
  user = { id: secondTeacher, roles: ['Teacher'] };
  assert.equal((await write('2027/moderation/' + second, { content: form('Teacher B', 'Second'), revision: 0 })).status, 200);
  assert.equal((await write('2027/moderation/' + child, { content: { ...form('Child', 'Do not share'), parentRecord: second }, revision: 0 })).status, 200);
  const unlinked = form('Unlinked', 'Not shared'); delete unlinked.resourceLibrary;
  assert.equal((await write('2027/moderation/' + unrelated, { content: unlinked, revision: 0 })).status, 200);
  const read = async () => {
    const response = await fetch(base + 'resource-library/' + resourceId + '/evaluations');
    assert.equal(response.status, 200);
    return response.json();
  };
  let result = await read();
  assert.equal(result.evaluations.length, 2);
  assert.deepEqual(result.evaluations.map(item => item.name).sort(), ['Teacher A', 'Teacher B']);
  assert.doesNotMatch(JSON.stringify(result), /Private student|Do not share|Not shared/);
  user = { id: teacherId, roles: ['Teacher'] };
  assert.equal((await write('2027/moderation/' + unrelated, { content: { ...unlinked, resourceLibraryId: resourceId }, revision: 1 })).status, 409);
  user = { id: secondTeacher, roles: ['Teacher'] };
  assert.equal((await write('2027/moderation/' + unrelated, { content: { ...unlinked, resourceLibraryId: resourceId }, revision: 1 })).status, 200);
  result = await read();
  assert.equal(result.evaluations.length, 3);
  assert.equal(result.evaluations.find(item => item.name === 'Unlinked').comments, 'Not shared');
  assert.doesNotMatch(JSON.stringify(result), /Private student/);
  assert.equal((await write('2027/moderation/' + unrelated, { content: { ...unlinked, version: '3', resourceLibraryId: resourceId }, revision: 2 })).status, 200);
  assert.equal((await read()).evaluations.length, 2);
  assert.equal((await write('2027/moderation/' + unrelated, { content: { ...unlinked, resourceLibraryId: resourceId }, revision: 3 })).status, 200);
  assert.equal((await read()).evaluations.length, 3);
  assert.equal((await write('2027/moderation/' + unrelated, { content: unlinked, revision: 4 })).status, 200);
  assert.equal((await read()).evaluations.length, 2);
  assert.equal((await write('2027/moderation/' + second, { content: form('Teacher B', 'Updated'), revision: 1 })).status, 200);
  result = await read();
  assert.equal(result.evaluations.find(item => item.name === 'Teacher B').comments, 'Updated');
  assert.equal((await write('moderation/2027/' + child, { revision: 1 }, 'DELETE')).status, 200);
  assert.equal((await write('moderation/2027/' + second, { revision: 2 }, 'DELETE')).status, 200);
  assert.equal((await read()).evaluations.length, 1);
  const combinedId = '99999999-9999-4999-8999-999999999999';
  const otherId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab';
  const combined = { ...example(), title: 'Combined assessment', standards: [
    { number: '29785', version: '2' }, { number: '29786', version: '2' }, { number: '29787', version: '2' }
  ] };
  assert.equal((await write('resource-library/' + combinedId, { content: combined, revision: 0 })).status, 200);
  user = { id: teacherId, roles: ['Teacher'] };
  for (const [index, standard] of combined.standards.entries()) {
    const id = ['11111111-aaaa-4111-8111-111111111111', '22222222-aaaa-4222-8222-222222222222',
      '33333333-aaaa-4333-8333-333333333333'][index];
    assert.equal((await write('2026/moderation/' + id, { revision: 0, content: {
      standardNumber: standard.number, version: standard.version,
      internal: JSON.stringify({ evaluationName: 'Owner', evaluationComments: 'Same feedback' })
    } })).status, 200);
  }
  const combinedResult = async () => (await (await fetch(base + 'resource-library/' + combinedId + '/evaluations')).json());
  const combinedRead = async () => (await combinedResult()).evaluations;
  assert.deepEqual((await combinedRead()).map(e => e.standardNumber).sort(), ['29785', '29786', '29787']);
  assert.ok((await combinedRead()).every(e => e.match === 'standard'));
  user = { id: secondTeacher, roles: ['Teacher'] };
  assert.equal((await combinedRead()).length, 0, 'another teacher cannot see private automatic matches');
  assert.equal((await write('2026/moderation/44444444-aaaa-4444-8444-444444444444', { revision: 0, content: {
    standardNumber: '29785', version: '3', internal: JSON.stringify({ evaluationComments: 'Wrong version' })
  } })).status, 200);
  assert.equal((await combinedRead()).length, 0);
  assert.equal((await write('2026/moderation/55555555-aaaa-4555-8555-555555555555', { revision: 0, content: {
    standardNumber: '29786', version: '2', internal: JSON.stringify({ evaluationComments: 'Other teacher private feedback' })
  } })).status, 200);
  assert.deepEqual((await combinedRead()).map(e => e.comments), ['Other teacher private feedback']);
  assert.equal((await write('resource-library/' + otherId, { content: { ...combined, title: 'Other assessment',
    standards: [{ number: '29785', version: '2' }] }, revision: 0 })).status, 200);
  user = { id: teacherId, roles: ['Teacher'] };
  assert.deepEqual((await combinedRead()).map(e => e.standardNumber).sort(), ['29786', '29787'],
    'a second library assessment makes that standard ambiguous');
  assert.ok((await combinedRead()).every(e => e.comments !== 'Other teacher private feedback'));
  assert.equal((await combinedResult()).standards.find(s => s.number === '29785').ambiguous, true);
  const firstAutomatic = await (await fetch(base + '2026/moderation/11111111-aaaa-4111-8111-111111111111')).json();
  assert.equal(firstAutomatic.content.resourceLibraryId, undefined, 'automatic matching does not alter or share records');
  assert.equal((await write('2026/moderation/11111111-aaaa-4111-8111-111111111111', { revision: firstAutomatic.revision,
    content: { ...firstAutomatic.content, resourceLibraryId: otherId } })).status, 200);
  assert.deepEqual((await combinedRead()).map(e => e.standardNumber).sort(), ['29786', '29787'],
    'an explicit link elsewhere is not matched');
  user = { id: secondTeacher, roles: ['Teacher'] };
  const sharedElsewhere = (await (await fetch(base + 'resource-library/' + otherId + '/evaluations')).json()).evaluations;
  assert.equal(sharedElsewhere[0].match, 'linked');
  assert.equal(sharedElsewhere[0].comments, 'Same feedback');
  assert.equal((await write('resource-library/' + otherId, { revision: 1 }, 'DELETE')).status, 200);
  user = { id: teacherId, roles: ['Teacher'] };
  assert.equal((await combinedResult()).standards.find(s => s.number === '29785').ambiguous, false);
  assert.deepEqual((await combinedRead()).map(e => e.standardNumber).sort(), ['29786', '29787'],
    'a record explicitly linked elsewhere is not inferred even when the remaining match is unique');
});
test('all teachers share library edits with CSRF, revision conflicts and atomic history; students are denied', async t => {
  const app = await serverFixture(t), content = example();
  assert.equal((await app.put(content, 0, '')).status, 403);
  assert.equal((await app.put(content, 0)).status, 200);
  app.user = { id: secondTeacher, roles: ['Teacher'] };
  assert.equal((await fetch(app.base + 'resource-library/' + resourceId)).status, 200);
  assert.equal((await app.put({ ...content, notes: 'Shared edit' }, 1)).status, 200);
  assert.equal(app.rows.get(resourceId).updated_by, secondTeacher);
  assert.equal((await app.put(content, 1)).status, 409);
  assert.equal(app.history.length, 2);
  assert.equal((await (await fetch(app.base + 'resource-library/' + resourceId + '/history')).json()).revisions.length, 2);
  assert.equal((await fetch(app.base + 'resource-library?standard=bad')).status, 400);
  app.user = { id: secondTeacher, roles: ['Student'] };
  assert.equal((await fetch(app.base + 'resource-library')).status, 403);
  assert.equal((await app.put(content, 2)).status, 403);
});
test('changed assessment editions cannot silently reuse existing approved critiques', async t => {
  const app = await serverFixture(t), original = example();
  await app.put(original, 0);
  const changed = { ...original, edition: 'Revised edition' };
  assert.equal((await app.put(changed, 1)).status, 400);
  changed.critiques = [{ ...original.critiques[0], outcome: 'Superseded' },
    { ...original.critiques[0], id: crypto.randomUUID(), date: '2026-11-14' }];
  assert.equal((await app.put(changed, 1)).status, 200);
  assert.equal(app.history[0].content.edition, '2026 edition');
});
test('changing source or source assessment links requires a new critique', async t => {
  const app = await serverFixture(t), original = example();
  assert.equal((await app.put(original, 0)).status, 200);
  const origin = { type: 'TKI', authorId: '', authorName: '', originalUrl: 'https://example.org/original',
    linkedDate: '2026-01-02', modificationNotes: '', finalUrl: '' };
  const changed = { ...original, origin };
  assert.equal((await app.put(changed, 1)).status, 400);
  changed.critiques = [{ ...original.critiques[0], outcome: 'Superseded' }];
  assert.equal((await app.put(changed, 1)).status, 200);
  const approved = { ...changed, critiques: [...changed.critiques, { ...original.critiques[0], id: crypto.randomUUID() }] };
  assert.equal((await app.put(approved, 2)).status, 200);
  assert.equal((await app.put({ ...approved, origin: { ...origin, finalUrl: 'https://drive.google.com/file/d/example/view' } }, 3)).status, 400);
  assert.equal((await app.put({ ...approved, origin: { ...origin, originalUrl: 'https://example.org/new' } }, 3)).status, 400);
  assert.equal((await app.put({ ...approved, origin: { ...origin,
    additionalOriginals: [{ url: 'https://example.org/second', linkedDate: '2026-01-03' }] } }, 3)).status, 400);
  assert.equal((await app.put({ ...approved, origin: { ...origin,
    additionalFinals: ['https://drive.google.com/file/d/example/view'] } }, 3)).status, 400);
  assert.equal((await app.put({ ...approved, origin: { ...origin, linkedDate: '2026-01-03', modificationNotes: 'Review notes' } }, 3)).status, 200);
});
test('adding a standard requires existing approved critiques to be superseded', async t => {
  const app = await serverFixture(t), original = example();
  assert.equal((await app.put(original, 0)).status, 200);
  const combined = { ...original, standards: [...original.standards, { number: '29785', version: '2' }] };
  assert.equal((await app.put(combined, 1)).status, 400);
  combined.critiques = [{ ...original.critiques[0], outcome: 'Superseded' }];
  assert.equal((await app.put(combined, 1)).status, 200);
  assert.deepEqual((await (await fetch(app.base + 'resource-library/' + resourceId)).json()).content.standards, combined.standards);
});
test('legacy editions can add standard metadata and class choices without invalidating the same approved assessment', async t => {
  const app = await serverFixture(t), legacy = example();
  delete legacy.classCodes;
  assert.equal((await app.put(legacy, 0)).status, 200);
  const enriched = { ...legacy, classCodes: ['11DTECH', '12DTECH'],
    standards: [{ number: '29777', version: '2', title: 'Database standard', subject: 'Computing', credits: '6', level: '2' }] };
  assert.equal((await app.put(enriched, 1)).status, 200);
  assert.deepEqual((await (await fetch(app.base + 'resource-library/' + resourceId)).json()).content, enriched);
  for (const change of [
    { classCodes: ['12DTECH', '12dtech'] }, { classCodes: [''] }, { classCodes: ['x'.repeat(81)] },
    { classCodes: Array.from({ length: 101 }, (_, i) => 'CLASS' + i) },
    { standards: [{ ...enriched.standards[0], credits: '-1' }] },
    { standards: [{ ...enriched.standards[0], level: '11' }] }
  ]) assert.equal((await app.put({ ...enriched, ...change }, 2)).status, 400);
  assert.equal((await app.put({ ...enriched, standards: [{ ...enriched.standards[0], version: '3' }] }, 2)).status, 400);
  assert.equal(app.history.length, 2);
});
