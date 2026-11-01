const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const schema = require('./public/moderation-schema');
const source = fs.readFileSync(require.resolve('./public/moderation.js'), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));
const record = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
function node(tag = 'div', text = '', attrs = {}) {
  return {
    tag, textContent: text, attrs, children: [], events: {}, value: attrs.value || '', dataset: {}, isConnected: true,
    get parentElement() { return this.parent; },
    append(...children) { for (const child of children) { child.parent = this; this.children.push(child); } },
    replaceChildren(...children) { this.children = []; this.append(...children); },
    addEventListener(type, callback) { this.events[type] = callback; },
    dispatchEvent(event) { this.events[event.type]?.(event); if (event.bubbles) this.parent?.dispatchEvent(event); },
    setAttribute(key, value) { this.attrs[key] = value; },
    removeAttribute(key) { delete this.attrs[key]; },
    focus() { this.focused = true; },
    querySelectorAll(selector) {
      return this.all().filter(child => selector.split(',').includes(child.tag));
    },
    all() { return this.children.flatMap(child => [child, ...child.all()]); },
    find(predicate) { return this.all().find(predicate); }
  };
}
function fixture({ page = 'overview', id = record, data = {}, setupOnly = false, saveFails = false, staff = [], departments = [], staffRequest, standardRequest, referenceRequest, recordRequest, recordsRequest, mutation, importResult, selectedLevel = '3', displayName = 'Synthetic Teacher', userEmail = '' } = {}) {
  const host = node(), saved = [], calls = [], notices = [], navigation = [];
  const file = { id: 'document_id_123', name: 'Existing assessment', mimeType: 'application/vnd.google-apps.document',
    modifiedTime: '2026-10-22T00:00:00Z', parents: ['student_folder_123'], capabilities: { canEdit: true, canAddChildren: true } };
  let chosen = { id: file.id }, missing = false;
  const access = {
    authorize: async () => calls.push(['authorize']),
    ensureAssessmentFolders: async (folderId, level, number) => {
      calls.push(['folders', folderId, level, number]);
      return { id: 'standard_folder_123', name: number };
    },
    ensureStudentFolder: async (folderId, index) => {
      calls.push(['studentFolder', folderId, index]);
      return { id: 'student_folder_' + index, name: 'Student ' + String.fromCharCode(65 + index) };
    },
    assessmentFolderLinks: async root => {
      calls.push(['folderLinks', root]);
      return { root, levels: Object.fromEntries(['1', '2', '3'].map(level => [level, {
        id: 'level_folder_' + level, standards: level === '3' ? [{ id: 'standard_folder_123', name: '29785' }] : []
      }])) };
    },
    choose: async (folder, allowPdf) => { calls.push(['choose', folder, allowPdf]); return chosen; },
    chooseFiles: async multiple => { calls.push(['chooseFiles', multiple]); return chosen ? Array.isArray(chosen) ? chosen : [chosen] : null; },
    metadata: async id => {
      calls.push(['metadata', id]);
      if (missing) throw new Error('The Drive file is missing or inaccessible.');
      return id === 'folder_id_123' ? { ...file, id, mimeType: 'application/vnd.google-apps.folder' } : { ...file, id };
    },
    find: async () => { calls.push(['find']); return null; },
    upload: async (blob, options) => { calls.push(['upload', options]); return file; },
    savePdf: async (source, options) => {
      calls.push(['savePdf', source, options]);
      return { id: options.id || 'pdf_document_123', name: options.name, mimeType: 'application/pdf' };
    },
    download: async () => { calls.push(['download']); return new Blob(['docx'], { type: DOCX }); }
  };
  const context = {
    plannerModerationSchema: schema, crypto, Blob, Event, URL, URLSearchParams, console: { error: () => {} },
    confirm: text => { calls.push(['confirm', text]); return true; },
    plannerGoogleDrive: {
      prepareDocumentAccess: async () => access,
      mount: (host, options) => calls.push(['mount', options]),
      resourceLink: value => {
        const i = value.lastIndexOf(' | ');
        return i < 0 ? { url: value, name: value } : { url: value.slice(i + 3), name: value.slice(0, i) };
      }
    }
  };
  vm.runInNewContext(source, context);
  context.plannerModeration.mount(host, {
    el: node, data: { title: 'Synthetic assessment', folderId: 'folder_id_123', folderName: 'Private assessments',
      level: page === 'overview' ? '' : '3', version: page === 'overview' ? '' : '2', standardNumber: '99999', ...data }, displayName, userEmail,
    year: 2026, record: id, page, setupOnly, ownerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    feedbackTemplateUrl: '/teacher-planner/api/planner/moderation/templates/feedback',
    scheduleTemplateUrl: '/teacher-planner/api/planner/moderation/templates/schedule',
    coversheetTemplateUrl: '/teacher-planner/api/planner/moderation/templates/coversheet',
    request: async path => {
      calls.push(['request', path]);
      if (path === 'staff') return staffRequest ? staffRequest() : { staff, departments };
      if (path.includes('/references?')) return referenceRequest();
      if (path.startsWith('standards/search')) return standardRequest ? standardRequest() : { standards: [{ number: '99999', level: '3', version: '2' }] };
      if (/^standards\/\d+\/details$/.test(path)) return standardRequest ? standardRequest() : { number: '99999', level: '3', version: '2', standardType: 'Achievement',
        url: 'https://www.nzqa.govt.nz/nqfdocs/ncea-resource/achievements/2026/as99999.pdf' };
      if (/^\d{4}\/moderation\//.test(path)) return recordRequest ? recordRequest(path) : { content: {}, revision: 0 };
      if (path.startsWith('moderation/')) return recordsRequest ? recordsRequest(path) : { records: [{ entry_key: record, title: 'Synthetic assessment', standard_number: '99999' }] };
      return { content: { selectedStandards: JSON.stringify([{ number: '99999', title: 'Example Biology standard', subject: 'Biology', credits: '5 credits', level: selectedLevel }]) } };
    },
    mutate: async (path, body) => { calls.push(['mutate', path, body]); if (mutation) return mutation(path, body); },
    saveNow: async () => {
      saved.push(Object.fromEntries(host.all().filter(child => child.attrs.name || child.attrs['data-moderation-setting']).map(child => [child.attrs.name || child.attrs['data-moderation-setting'], child.value])));
      return !saveFails;
    },
    navigate: async (...args) => navigation.push(args),
    binaryRequest: async (path, options) => {
      calls.push(['binary', path, options]);
      return path.startsWith('moderation/import') ? importResult || { common: { subject: 'Biology', studentName: 'Synthetic learner' },
        document: { grade: 'A', feedback: 'Imported comment' }, warning: 'Review all imported fields.' } : new Blob(['docx'], { type: DOCX });
    },
    notice: (...args) => notices.push(args)
  });
  const click = async label => {
    const button = host.find(child => child.tag === 'button' && child.textContent === label);
    assert.ok(button, label); assert.notEqual(button.disabled, true, label + ' enabled');
    await button.events.click();
  };
  return { host, saved, calls, notices, navigation, click, access, set chosen(value) { chosen = value; }, set missing(value) { missing = value; } };
}
test('results completion follows named students and fills an empty loaded date from the latest KAMAR date', async () => {
  const f = fixture({ page: 'internal', data: { internal: JSON.stringify({ samples: [
    { student: 'Learner A', reportedGrade: 'A', reportedDate: '2026-10-20' }, {}
  ] }) } }); await flush();
  const control = id => f.host.find(n => n.attrs.id === 'moderation-internal-' + id);
  const state = () => JSON.parse(f.host.find(n => n.attrs.name === 'internal').value);
  const edit = (id, value) => { const item = control(id); item.value = value; item.events.input(); };
  assert.equal(control('resultsLoaded').checked, true);
  assert.equal(control('resultsDate').value, '2026-10-20');
  assert.equal(state().resultsLoaded, 'Yes');
  edit('1-student', 'Learner B');
  assert.equal(control('resultsLoaded').checked, false);
  assert.equal(control('resultsLoaded-answer').textContent, 'No');
  assert.equal(state().resultsDate, '2026-10-20', 'untick preserves date');
  edit('1-reportedDate', '2026-10-22');
  assert.equal(state().resultsLoaded, 'No', 'grade is also required');
  edit('1-reportedGrade', 'M');
  assert.equal(control('resultsLoaded').checked, true);
  assert.equal(state().resultsDate, '2026-10-20', 'existing date is preserved');
  edit('0-reportedDate', '');
  assert.equal(state().resultsLoaded, 'No');
  edit('0-reportedDate', '2026-10-20');
  assert.equal(state().resultsLoaded, 'Yes');
  await f.click('Remove entry 2');
  assert.equal(state().resultsLoaded, 'Yes');
  await f.click('Remove entry 1');
  assert.equal(state().resultsLoaded, 'No', 'zero named students cannot auto-complete');
});
test('results use the latest reporting date on load, ignore blank panels and support manual ticking', async () => {
  const f = fixture({ page: 'internal', data: { internal: JSON.stringify({ samples: [
    { student: 'A', reportedGrade: 'A', reportedDate: '2026-09-30' },
    { student: 'B', reportedGrade: 'E', reportedDate: '2026-10-22' },
    { reportedDate: '2026-12-31' }
  ] }) } }); await flush();
  assert.equal(f.host.find(n => n.attrs.id === 'moderation-internal-resultsDate').value, '2026-10-22');
  const manual = fixture({ page: 'internal', data: { internal: JSON.stringify({ samples: [
    { student: 'A', reportedDate: '2026-10-21' }
  ] }) } }); await flush();
  const box = manual.host.find(n => n.attrs.id === 'moderation-internal-resultsLoaded');
  box.checked = true; box.events.change();
  assert.equal(manual.host.find(n => n.attrs.id === 'moderation-internal-resultsDate').value, '2026-10-21');
  const empty = fixture({ page: 'internal' }); await flush();
  assert.notEqual(empty.host.find(n => n.attrs.id === 'moderation-internal-resultsLoaded').checked, true);
});
test('folder preparation persists a standard link above its button and fills retention location on reopen', async () => {
  const f = fixture({ data: { level: '3', version: '2', internal: '{"retentionLocation":"Old location"}' } }); await flush();
  await f.click('Prepare level / standard folders');
  const saved = f.saved.at(-1);
  assert.deepEqual(JSON.parse(saved.standardFolder), { id: 'standard_folder_123', root: 'folder_id_123', level: '3', number: '99999' });
  const url = 'https://drive.google.com/drive/folders/standard_folder_123';
  const locationPath = 'Private assessments / Level 3 / 99999\n' + url;
  assert.equal(JSON.parse(saved.internal).retentionLocation, locationPath);
  const link = f.host.find(n => n.tag === 'a' && n.textContent === 'Level 3 / 99999');
  assert.equal(link.href, url);
  const button = f.host.find(n => n.tag === 'button' && n.textContent === 'Prepare level / standard folders');
  assert.equal(link.parentElement.parentElement.children.indexOf(link.parentElement) + 1, button.parentElement.children.indexOf(button));
  const reopened = fixture({ page: 'internal', data: { ...saved, internal: '{}' } }); await flush();
  const location = reopened.host.find(n => n.attrs.id === 'moderation-internal-retentionLocation');
  assert.equal(location.value, locationPath);
  assert.equal(location.readOnly, true);
  assert.equal(JSON.parse(reopened.host.find(n => n.attrs.name === 'internal').value).retentionLocation, locationPath);
  assert.equal(reopened.calls.filter(c => c[0] === 'authorize' || c[0] === 'folders').length, 0);
  const stale = fixture({ page: 'internal', data: { ...saved, standardNumber: '12345' } }); await flush();
  assert.equal(stale.host.find(n => n.attrs.id === 'moderation-internal-retentionLocation').value, '');
  const changedRoot = fixture({ data: { ...saved } }); await flush();
  changedRoot.chosen = { id: 'another_root_123' };
  changedRoot.access.metadata = async id => ({ id, name: 'New main folder', mimeType: 'application/vnd.google-apps.folder', capabilities: { canAddChildren: true } });
  await changedRoot.click('Choose a folder for this record');
  const newSaved = changedRoot.saved.at(-1);
  assert.equal(newSaved.folderId, 'another_root_123');
  assert.equal(JSON.parse(newSaved.standardFolder).root, 'another_root_123');
  assert.equal(JSON.parse(newSaved.internal).retentionLocation, 'New main folder / Level 3 / 99999\n' + url);
});
test('failed folder preparation does not save a successful standard link', async () => {
  const f = fixture({ data: { level: '3', version: '2' } }); await flush();
  f.access.ensureAssessmentFolders = async () => { throw new Error('Folder unavailable'); };
  await f.click('Prepare level / standard folders');
  assert.equal(f.host.find(n => n.attrs.name === 'standardFolder').value, '');
  assert.ok(f.host.find(n => n.attrs.role === 'alert' && n.textContent.includes('Folder unavailable')));
});
test('imported internal reporting details reconcile results and preserve an existing loaded date', async () => {
  const f = fixture({ page: 'internal', importResult: { common: {}, document: { resultsLoaded: 'No', resultsDate: '2026-10-01',
    samples: [{ student: 'A', reportedGrade: 'A', reportedDate: '2026-10-22' }] }, warning: 'Review import.' } }); await flush();
  await f.click('Choose existing document and import its form data');
  const state = JSON.parse(f.saved.at(-1).internal);
  assert.equal(state.resultsLoaded, 'Yes');
  assert.equal(state.resultsDate, '2026-10-01');
  assert.equal(f.host.find(n => n.attrs.id === 'moderation-internal-resultsLoaded').checked, true);
});
test('moderation setup saves grouped level and standard folder buttons above Prepare and reopens without Drive access', async () => {
  const f = fixture({ id: '', setupOnly: true }); await flush();
  assert.equal(f.calls.filter(c => c[0] === 'folderLinks').length, 0);
  await f.click('Prepare level / standard folders');
  const saved = f.saved.at(-1);
  assert.equal(JSON.parse(saved.folderLinks).root, 'folder_id_123');
  const hierarchy = f.host.find(n => n.attrs.class === 'moderation-folder-levels');
  assert.equal(hierarchy.children.length, 3);
  assert.deepEqual(hierarchy.children.map(n => n.children[0].children[0].textContent), ['Level 1', 'Level 2', 'Level 3']);
  const standard = hierarchy.find(n => n.tag === 'a' && n.textContent === '29785');
  assert.equal(standard.attrs.href, 'https://drive.google.com/drive/folders/standard_folder_123');
  assert.equal(standard.attrs.target, '_blank');
  const prepare = f.host.find(n => n.tag === 'button' && n.textContent === 'Prepare level / standard folders');
  assert.equal(hierarchy.parentElement.children.indexOf(hierarchy) + 1, prepare.parentElement.children.indexOf(prepare));
  const reopened = fixture({ id: '', setupOnly: true, data: saved }); await flush();
  assert.ok(reopened.host.find(n => n.tag === 'a' && n.textContent === '29785'));
  assert.equal(reopened.calls.filter(c => c[0] === 'folderLinks' || c[0] === 'authorize').length, 0);
  const stale = fixture({ id: '', setupOnly: true, data: { ...saved, folderId: 'different_root_123' } }); await flush();
  assert.equal(stale.host.find(n => n.tag === 'a' && n.textContent === '29785'), undefined);
  f.access.assessmentFolderLinks = async () => { throw new Error('Cannot list Drive folders'); };
  await f.click('Prepare level / standard folders');
  assert.ok(f.host.find(n => n.attrs.role === 'alert' && n.textContent.includes('Cannot list Drive folders')));
  assert.equal(f.host.find(n => n.attrs['data-moderation-setting'] === 'folderLinks').value, saved.folderLinks);
});
test('internal location inherits the matching standard folder saved in Setup Moderation without Drive access', async () => {
  const hierarchy = { root: 'folder_id_123', levels: { '3': { id: 'level_folder_3',
    standards: [{ id: 'setup_standard_123', name: '99999' }] } } };
  const main = { folderId: 'folder_id_123', folderLinks: JSON.stringify(hierarchy) };
  const f = fixture({ page: 'internal', data: { internal: '{"retentionLocation":"Location or file path:"}' },
    recordRequest: async path => {
      assert.equal(path, '2026/moderation/main'); return { content: main, revision: 1 };
    } }); await flush();
  const location = f.host.find(n => n.attrs.id === 'moderation-internal-retentionLocation');
  const url = 'https://drive.google.com/drive/folders/setup_standard_123';
  const locationPath = 'Private assessments / Level 3 / 99999\n' + url;
  assert.equal(location.value, locationPath);
  assert.equal(location.readOnly, true);
  assert.equal(JSON.parse(f.host.find(n => n.attrs.name === 'internal').value).retentionLocation, locationPath);
  assert.equal(JSON.parse(f.host.find(n => n.attrs.name === 'standardFolder').value).id, 'setup_standard_123');
  assert.equal(f.calls.filter(c => ['authorize', 'folders', 'folderLinks'].includes(c[0])).length, 0);
  const otherRoot = fixture({ page: 'internal', data: { folderId: 'another_root_123', internal: '{"retentionLocation":"Keep me"}' },
    recordRequest: async () => ({ content: main, revision: 1 }) }); await flush();
  assert.equal(otherRoot.host.find(n => n.attrs.id === 'moderation-internal-retentionLocation').value, 'Keep me');
  const absent = fixture({ page: 'internal', data: { standardNumber: '12345', internal: '{"retentionLocation":"Keep me"}' },
    recordRequest: async () => ({ content: main, revision: 1 }) }); await flush();
  assert.equal(absent.host.find(n => n.attrs.id === 'moderation-internal-retentionLocation').value, 'Keep me');
});
test('setup folder lookup reports errors and ambiguous matches without changing the location', async () => {
  for (const failure of ['unavailable', 'duplicate']) {
    const f = fixture({ page: 'internal', data: { internal: '{"retentionLocation":"Keep me"}' },
      recordRequest: async () => {
        if (failure === 'unavailable') throw new Error('Database unavailable');
        return { revision: 1, content: { folderId: 'folder_id_123', folderLinks: JSON.stringify({
          root: 'folder_id_123', levels: { '3': { standards: [
            { name: '99999', id: 'first_folder_123' }, { name: '99999', id: 'second_folder_123' }
          ] } }
        }) } };
      } }); await flush();
    assert.equal(f.host.find(n => n.attrs.id === 'moderation-internal-retentionLocation').value, 'Keep me');
    assert.ok(f.host.find(n => n.attrs.role === 'alert' && n.textContent.includes('could not be populated from Setup Moderation')));
  }
});
test('internal import keeps form-only supporting information and unique student schedule references', async () => {
  const child = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const original = { notes: 'Private supporting note', resources: 'Private supporting resources',
    moderatorReportLink: 'https://example.test/reference', signatoryPosition: 'Teacher',
    samples: [{ student: 'Learner A', markingScheduleRecord: child }] };
  const f = fixture({ page: 'internal', data: { internal: JSON.stringify(original) },
    importResult: { common: {}, document: { retained: 'Yes', samples: [{ student: 'Learner A', reportedGrade: 'A' }] }, warning: 'Review import.' } });
  await flush();
  await f.click('Choose existing document and import its form data');
  const imported = JSON.parse(f.saved.at(-1).internal);
  for (const key of ['notes', 'resources', 'moderatorReportLink', 'signatoryPosition']) assert.equal(imported[key], original[key]);
  assert.equal(imported.samples[0].markingScheduleRecord, child);
  assert.equal(imported.retained, 'Yes');
});
test('internal forms clean imported category labels and placeholders while retaining actual data', async () => {
  const f = fixture({ page: 'internal', data: { internal: JSON.stringify({
    verifierName: 'Verifier Name:', verifierSchool: 'School:', verifierPosition: 'Position:',
    critiqueName: "Critique's Name: V Pringle", verificationEvidence: 'Evidence / location of verification: See folder',
    notes: 'School: Keep supporting text unchanged'
  }) } }); await flush();
  const state = JSON.parse(f.host.find(n => n.attrs.name === 'internal').value);
  assert.equal(state.verifierName, '');
  assert.equal(state.verifierSchool, '');
  assert.equal(state.verifierPosition, '');
  assert.equal(state.critiqueName, 'V Pringle');
  assert.equal(state.verificationEvidence, 'See folder');
  assert.equal(state.notes, 'School: Keep supporting text unchanged');
  assert.equal(f.host.find(n => n.attrs.id === 'moderation-internal-verifierName').value, '');
  assert.ok(f.host.find(n => n.tag === 'label' && n.textContent === "Critiquer's name"));
});
test('schedule import fills gaps, merges missing links and requirements and changes only the future sync target', async () => {
  const original = { grade: 'A', markerComments: 'Keep my comments', achieved: 'Keep standard text', notes: 'Private note',
    fileSubmissionLink: 'Original | https://example.test/original', requirements: [
      { requirement: 'First requirement', grade: 'A', evidence: 'Keep evidence' }
    ] };
  const f = fixture({ page: 'schedule', data: { subject: 'Computing', schedule: JSON.stringify(original),
    driveDocuments: JSON.stringify({ schedule: { id: 'wrong_document_123', name: 'Wrong document', mimeType: 'application/vnd.google-apps.document' } }) },
    importResult: { common: { standardNumber: '99999', subject: 'Do not replace', course: '13DTECH' },
      document: { grade: 'E', markerComments: 'Do not replace', achieved: 'Do not replace', merit: 'Missing standard text',
        fileSubmissionLink: 'Renamed | https://example.test/original\nNew | https://example.test/new',
        requirements: [{ requirement: 'First requirement', grade: 'E', evidence: 'Do not replace', judgement: 'Fill judgement' },
          { requirement: 'New requirement', grade: 'M', evidence: 'New evidence' }] }, warning: 'Review import.' } });
  await flush();
  f.chosen = { id: 'correct_document_123' };
  await f.click('Choose existing document and import its form data');
  const saved = f.saved.at(-1), merged = JSON.parse(saved.schedule);
  assert.equal(saved.subject, 'Computing');
  assert.equal(saved.course, '13DTECH');
  for (const key of ['grade', 'markerComments', 'achieved', 'notes']) assert.equal(merged[key], original[key]);
  assert.equal(merged.merit, 'Missing standard text');
  assert.equal(merged.fileSubmissionLink, original.fileSubmissionLink + '\nNew | https://example.test/new');
  assert.deepEqual(merged.requirements, [
    { ...original.requirements[0], judgement: 'Fill judgement' },
    { requirement: 'New requirement', grade: 'M', evidence: 'New evidence' }
  ]);
  assert.equal(JSON.parse(saved.driveDocuments).schedule.id, 'correct_document_123');
  assert.equal(f.calls.filter(c => c[0] === 'upload').length, 0);
  await f.click('Choose existing document and import its form data');
  assert.deepEqual(JSON.parse(f.saved.at(-1).schedule), merged, 'reimport is idempotent');
  await f.click('Create / update Google Drive document');
  assert.equal(f.calls.find(c => c[0] === 'upload')[1].id, 'correct_document_123');
});
test('new student schedules copy reusable master content but never student marking or Drive targets', async () => {
  const master = { instructions: 'Template instructions', achieved: 'Template criteria',
    assessmentInstructionsLink: 'Assessment | https://example.test/assessment', grade: 'A', markerComments: 'Do not copy',
    fileSubmissionLink: 'Private work | https://example.test/private', documentationSubmissionLink: 'Private docs | https://example.test/docs',
    requirements: [{ requirement: 'First requirement', grade: 'A', evidence: 'Private evidence', judgement: 'Private judgement' }] };
  for (const target of ['marking schedule', 'Confirmation & Feedback']) {
    const f = fixture({ page: 'internal', data: { schedule: JSON.stringify(master),
      internal: JSON.stringify({ samples: [{ student: 'Learner A', markerGrade: 'M' }] }) } });
    await flush();
    await f.click('Create / open ' + target + ' for entry 1');
    const content = f.calls.find(c => c[0] === 'mutate')[2].content;
    const schedule = JSON.parse(content.schedule);
    assert.equal(schedule.instructions, master.instructions);
    assert.equal(schedule.achieved, master.achieved);
    assert.equal(schedule.assessmentInstructionsLink, master.assessmentInstructionsLink);
    assert.deepEqual(schedule.requirements, [{ requirement: 'First requirement' }]);
    for (const key of ['grade', 'markerComments', 'fileSubmissionLink', 'documentationSubmissionLink']) assert.equal(schedule[key], undefined);
    assert.equal(content.driveDocuments, undefined);
  }
});
test('student template update fills gaps idempotently and preserves existing marking and sync targets', async () => {
  const master = { instructions: 'New instructions', achieved: 'New criteria', grade: 'A', markerComments: 'Do not copy',
    assessmentInstructionsLink: 'Assessment | https://example.test/assessment',
    fileSubmissionLink: 'Private work | https://example.test/private',
    requirements: [{ requirement: 'First', grade: 'A', evidence: 'Do not copy', judgement: 'Do not copy' },
      { requirement: 'Second', grade: 'A', evidence: 'Do not copy' }] };
  const original = { instructions: 'Keep instructions', grade: 'M', markerComments: 'Keep comments',
    fileSubmissionLink: 'Student work | https://example.test/student', requirements: [
      { requirement: 'First', grade: 'A', evidence: 'Keep evidence', judgement: 'Keep judgement' }] };
  const driveDocuments = JSON.stringify({ schedule: { id: 'student_document_123', name: 'Student schedule' } });
  const f = fixture({ page: 'schedule', data: { parentRecord: record, schedule: JSON.stringify(original), driveDocuments },
    recordRequest: async () => ({ revision: 3, content: { standardNumber: '99999', schedule: JSON.stringify(master) } }) });
  await flush();
  await f.click('Fill missing from standard template');
  const saved = f.saved.at(-1), schedule = JSON.parse(saved.schedule);
  for (const key of ['instructions', 'grade', 'markerComments', 'fileSubmissionLink']) assert.equal(schedule[key], original[key]);
  assert.equal(schedule.achieved, master.achieved);
  assert.equal(schedule.assessmentInstructionsLink, master.assessmentInstructionsLink);
  assert.deepEqual(schedule.requirements, [...original.requirements, { requirement: 'Second' }]);
  assert.equal(saved.driveDocuments, driveDocuments);
  await f.click('Fill missing from standard template');
  assert.deepEqual(JSON.parse(f.host.find(n => n.attrs.name === 'schedule').value), schedule);
  assert.equal(f.calls.filter(c => ['upload', 'download', 'binary', 'authorize'].includes(c[0])).length, 0);
});
test('student template update rejects missing or mismatched parents and oversized merges', async () => {
  for (const kind of ['missing', 'wrongStandard', 'nested', 'oversized']) {
    const original = { requirements: Array.from({ length: 50 }, (_, i) => ({ requirement: 'Existing ' + i })) };
    const f = fixture({ page: 'schedule', data: { parentRecord: record, schedule: JSON.stringify(original) },
      recordRequest: async () => ({ revision: kind === 'missing' ? 0 : 1, content: {
        standardNumber: kind === 'wrongStandard' ? '14998' : '99999',
        ...(kind === 'nested' ? { parentRecord: record } : {}),
        schedule: JSON.stringify({ requirements: [{ requirement: 'New requirement' }] })
      } }) });
    await flush();
    await f.click('Fill missing from standard template');
    assert.deepEqual(JSON.parse(f.host.find(n => n.attrs.name === 'schedule').value), original);
    assert.ok(f.host.find(n => n.attrs.role === 'alert' && n.textContent));
  }
});
test('schedule import rejects mismatched standards and oversized merges without replacing saved data or document target', async () => {
  for (const oversized of [false, true]) {
    const original = { markerComments: 'Keep comments', requirements: Array.from({ length: 50 }, (_, i) => ({ requirement: 'Existing ' + i })) };
    const f = fixture({ page: 'schedule', data: { schedule: JSON.stringify(original) },
      importResult: { common: { standardNumber: oversized ? '99999' : '12345' },
        document: { requirements: [{ requirement: 'One more' }] }, warning: '' } });
    await flush();
    await f.click('Choose existing document and import its form data');
    assert.deepEqual(JSON.parse(f.host.find(n => n.attrs.name === 'schedule').value), original);
    assert.equal(JSON.parse(f.host.find(n => n.attrs.name === 'driveDocuments').value).schedule, undefined);
    assert.ok(f.host.find(n => n.attrs.role === 'alert' && n.textContent.includes(oversized ? 'exceeds' : 'not 99999')));
  }
});
test('all document imports reject a different standard without changing assessment metadata or links', async () => {
  for (const page of ['internal', 'schedule', 'feedback', 'coversheet']) {
    const original = { notes: 'Keep existing content' };
    const f = fixture({ page, data: { [page]: JSON.stringify(original) },
      importResult: { common: { standardNumber: '14998', standardTitle: 'Wrong template standard', level: '1' },
        document: { notes: 'Do not import' }, warning: '' } });
    await flush();
    await f.click('Choose existing document and import its form data');
    assert.equal(f.host.find(n => n.attrs.name === 'standardNumber').value, '99999');
    assert.deepEqual(JSON.parse(f.host.find(n => n.attrs.name === page).value), original);
    assert.equal(JSON.parse(f.host.find(n => n.attrs.name === 'driveDocuments').value)[page], undefined);
    assert.ok(f.host.find(n => n.attrs.role === 'alert' && n.textContent.includes('14998, not 99999')));
    assert.equal(f.calls.filter(c => c[0] === 'upload').length, 0);
  }
});
test('student Confirmation button creates a shared individual record with assessed grade but no copied comments', async () => {
  const f = fixture({ page: 'internal', data: { internal: JSON.stringify({ samples: [
    { student: 'Learner A', markerGrade: 'A', comments: 'Do not copy this discussion' }
  ] }) } }); await flush();
  await f.click('Create / open Confirmation & Feedback for entry 1');
  const created = f.calls.find(c => c[0] === 'mutate');
  const child = JSON.parse(f.saved.at(-1).internal).samples[0].markingScheduleRecord;
  assert.deepEqual(f.navigation.at(-1), [child, 'feedback']);
  assert.equal(created[1], '2026/moderation/' + child);
  assert.equal(created[2].content.parentRecord, record);
  assert.equal(created[2].content.studentName, 'Learner A');
  assert.equal(created[2].content.standardNumber, '99999');
  assert.equal(created[2].content.level, '3');
  assert.equal(JSON.parse(created[2].content.feedback).grade, 'A');
  assert.equal(JSON.parse(created[2].content.feedback).feedback, undefined);
  assert.ok(f.calls.some(c => c[0] === 'studentFolder' && c[2] === 0));
});
test('Confirmation button reuses the marking record, fills missing grade from schedule and preserves existing choices', async () => {
  const child = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  for (const grade of ['', 'M']) {
    const f = fixture({ page: 'internal', data: { internal: JSON.stringify({ samples: [
      { student: 'Learner A', markerGrade: 'A', markingScheduleRecord: child }
    ] }) }, recordRequest: async () => ({ revision: 7, content: {
      parentRecord: record, studentName: 'Learner A', standardNumber: '99999',
      schedule: '{"grade":"E","markerComments":"Do not copy"}',
      feedback: JSON.stringify({ grade, markingScheduleLink: 'Custom schedule | https://example.test/schedule' })
    } }) }); await flush();
    await f.click('Create / open Confirmation & Feedback for entry 1');
    const mutation = f.calls.find(c => c[0] === 'mutate');
    assert.equal(mutation[2].revision, 7);
    const feedback = JSON.parse(mutation[2].content.feedback);
    assert.equal(feedback.grade, grade || 'E');
    assert.equal(feedback.markingScheduleLink, 'Custom schedule | https://example.test/schedule');
    assert.equal(feedback.feedback, undefined);
    assert.deepEqual(f.navigation.at(-1), [child, 'feedback']);
  }
});
test('Confirmation import preserves existing fields, adds manual links and syncs to the selected document', async () => {
  const f = fixture({ page: 'feedback', data: { studentName: 'Learner A', feedback: JSON.stringify({
    grade: 'A', notes: 'Keep private notes', markingScheduleLink: 'Custom | https://example.test/custom'
  }) }, importResult: { common: { standardNumber: '99999', studentName: 'Do not overwrite' },
    document: { grade: 'E', markingScheduleLink: 'Duplicate | https://example.test/custom\nNew | https://example.test/new',
      coversheetLink: 'Cover sheet | https://example.test/cover' }, warning: 'Review import.' } }); await flush();
  assert.equal(f.host.find(n => n.attrs.id === 'moderation-feedback-grade').value, 'A');
  await f.click('Choose existing document and import its form data');
  const merged = JSON.parse(f.saved.at(-1).feedback);
  assert.equal(merged.grade, 'A');
  assert.equal(merged.notes, 'Keep private notes');
  assert.equal(f.saved.at(-1).studentName, 'Learner A');
  assert.equal(merged.markingScheduleLink, 'Custom | https://example.test/custom\nNew | https://example.test/new');
  assert.equal(merged.coversheetLink, 'Cover sheet | https://example.test/cover');
  assert.equal(f.calls.filter(c => c[0] === 'upload').length, 0);
  await f.click('Choose Google Drive files for Cover Sheet');
  assert.ok(JSON.parse(f.saved.at(-1).feedback).coversheetLink.includes('document_id_123'));
  await f.click('Create / update Google Drive document');
  assert.equal(f.calls.find(c => c[0] === 'upload')[1].id, 'document_id_123');
});
test('Confirmation launch rejects mismatched parents and failed saves without navigating or replacing student data', async () => {
  const child = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  for (const saveFails of [false, true]) {
    const f = fixture({ page: 'internal', saveFails, data: { internal: JSON.stringify({ samples: [
      { student: 'Learner A', markingScheduleRecord: child }
    ] }) }, recordRequest: async () => ({ revision: 1, content: { parentRecord: child } }) });
    await flush();
    await f.click('Create / open Confirmation & Feedback for entry 1');
    assert.equal(f.navigation.length, 0);
    assert.equal(f.calls.filter(c => c[0] === 'mutate').length, 0);
    assert.ok(f.host.find(n => n.attrs.role === 'alert' && n.textContent.includes(saveFails ? 'not saved' : 'another moderation record')));
  }
});
test('top year contents tabs navigate to year-wide lists instead of the current record', async () => {
  const f = fixture({ page: 'schedule' }); await flush();
  const tabs = f.host.find(n => n.attrs.class === 'moderation-tabs');
  assert.equal(tabs.children.length, 5);
  assert.equal(tabs.children[2].attrs['aria-current'], 'page');
  await tabs.children[1].events.click();
  assert.deepEqual(f.navigation.at(-1), ['', 'internal']);
  await tabs.children[3].events.click();
  assert.deepEqual(f.navigation.at(-1), ['', 'feedback']);
});
test('year contents group shared and individual schedules by standard and open the selected form', async () => {
  const child = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const records = [
    { entry_key: child, title: 'Student A', standard_number: '99999', standard_title: 'Example standard', parent_record: record },
    { entry_key: record, title: 'Shared assessment', standard_number: '99999', standard_title: 'Example standard' },
    { entry_key: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', title: 'Another assessment', standard_number: '92004', standard_title: 'Other standard' }
  ];
  for (const page of ['internal', 'schedule', 'feedback', 'coversheet']) {
    const f = fixture({ id: '', page, recordsRequest: async path => {
      assert.equal(path, 'moderation/2026'); return { records };
    } }); await flush();
    const groups = f.host.all().filter(n => n.attrs.class === 'moderation-contents-group');
    assert.deepEqual(groups.map(n => n.children[0].textContent), page !== 'internal'
      ? ['99999 — Example standard'] : ['92004 — Other standard', '99999 — Example standard']);
    const links = groups.flatMap(n => n.all()).filter(n => n.tag === 'a');
    assert.equal(links.length, page === 'internal' ? 2 : 1);
    if (page === 'schedule') {
      assert.ok(links.some(n => n.textContent.includes('(Individual schedule)')));
      assert.ok(!links.some(n => n.textContent.includes('(Standard marking schedule template)')));
    }
    let prevented = false;
    await links[0].events.click({ preventDefault: () => { prevented = true; } });
    assert.ok(prevented);
    assert.equal(f.navigation[0][1], page);
    assert.ok(links[0].attrs.href.startsWith('#year=2026'));
    assert.equal(f.calls.filter(call => call[0] === 'authorize').length, 0);
  }
});
test('contents empty and failed states are explicit, with retry', async () => {
  const empty = fixture({ id: '', page: 'internal', recordsRequest: async () => ({ records: [] }) });
  await flush();
  assert.ok(empty.host.find(n => n.textContent.includes('No records for this contents page')));
  let fail = true;
  const f = fixture({ id: '', page: 'schedule', recordsRequest: async () => {
    if (fail) throw new Error('Records unavailable');
    return { records: [] };
  } }); await flush();
  assert.ok(f.host.find(n => n.attrs.role === 'alert' && n.textContent === 'Records unavailable'));
  fail = false; await f.click('Retry loading records');
  assert.ok(f.host.find(n => n.textContent.startsWith('No student Marking Schedule forms yet.')));
});
for (const [page, title] of [['feedback', 'Confirmation & Feedback'], ['coversheet', 'WHS Coversheet']]) {
test(title + ' contents identify the correct forms without changing saved schedule titles', async () => {
  const child = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const records = [
    { entry_key: child, title: '29785 — Student A - TV — Marking Schedule', student_name: 'Student A - TV', standard_number: '29785', parent_record: record },
    { entry_key: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', title: '29785 — Student B - CJ — Marking Schedule', standard_number: '29785', parent_record: record },
    { entry_key: record, title: '29785 — Integrate data into documents', standard_number: '29785' }
  ];
  const original = JSON.stringify(records);
  const f = fixture({ id: '', page, recordsRequest: async () => ({ records }) });
  await flush();
  const links = f.host.all().filter(n => n.tag === 'a' && n.attrs.href.startsWith('#'));
  assert.equal(links.length, 2);
  assert.ok(links.some(n => n.textContent === 'Student A - TV — ' + title));
  assert.ok(links.some(n => n.textContent === '29785 — Student B - CJ — ' + title));
  for (const link of links) {
    assert.ok(link.textContent.endsWith(' — ' + title));
    assert.ok(!link.textContent.includes('Marking Schedule'));
    const params = new URLSearchParams(link.attrs.href.slice(1));
    assert.equal(params.get('page'), page);
    await link.events.click({ preventDefault() {} });
    assert.deepEqual(f.navigation.at(-1), [params.get('record'), page]);
  }
  assert.equal(JSON.stringify(records), original);
  assert.equal(f.calls.filter(call => ['mutate', 'upload', 'authorize'].includes(call[0])).length, 0);
});
}
for (const [page, title, filename] of [
  ['feedback', 'Confirmation & Feedback', 'confirmation-feedback-template.docx'],
  ['schedule', 'Marking Schedule', 'marking-schedule-template.docx'],
  ['coversheet', 'WHS Coversheet', 'whs-coversheet-template.docx']
]) {
test(title + ' offers one blank template even without student forms', async () => {
  const f = fixture({ id: '', page, recordsRequest: async () => ({ records: [
    { entry_key: record, title: 'Standard assessment', standard_number: '29785' },
    { entry_key: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', title: 'Another assessment', standard_number: '29786' }
  ] }) });
  await flush();
  const links = f.host.all().filter(n => n.tag === 'a');
  assert.equal(links.length, 1);
  assert.equal(links[0].textContent, 'Download blank ' + title + ' template');
  assert.equal(links[0].attrs.href, '/teacher-planner/api/planner/moderation/templates/' + page);
  assert.equal(links[0].attrs.download, filename);
  assert.ok(f.host.find(n => n.textContent.startsWith('No student ' + title + ' forms yet.')));
  assert.ok(f.host.find(n => n.textContent.includes(page === 'feedback'
    ? 'Existing assessment-level feedback remains available through Records.'
    : page === 'schedule' ? 'Existing standard-specific instructions and criteria remain available through Records'
    : 'Existing assessment-level coversheets remain available through Records.')));
  if (page === 'coversheet') assert.ok(f.host.find(n => n.textContent.includes('Open a student WHS Coversheet from the list below.')));
  assert.equal(f.calls.filter(call => ['mutate', 'upload', 'authorize'].includes(call[0])).length, 0);
});
}
test('Records table groups standards and stacks student links in the correct document columns', async () => {
  const first = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', second = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  const f = fixture({ id: '', recordsRequest: async () => ({ records: [
    { entry_key: first, title: 'Student A schedule', student_name: 'Student A - TV', standard_number: '29785', parent_record: record },
    { entry_key: second, title: 'Student B schedule', student_name: 'Student B - CJ', standard_number: '29785', parent_record: record },
    { entry_key: record, title: 'Main assessment', standard_number: '29785', standard_title: 'Integrate data into documents' }
  ] }) }); await flush();
  const table = f.host.find(n => n.attrs.class === 'moderation-records-table');
  assert.ok(table);
  assert.deepEqual(table.children[1].children[0].children.map(n => n.textContent),
    ['Standard Number', 'Internal Moderation Sheet', 'Marking Schedules']);
  const rows = table.children[2].children;
  assert.equal(rows.length, 1); assert.equal(rows[0].children.length, 3);
  const cells = rows[0].children;
  assert.equal(cells[0].children[0].textContent, '29785');
  assert.equal(cells[0].children[1].textContent, 'Integrate data into documents');
  const targets = ['overview', 'internal', 'schedule'];
  for (const [index, cell] of cells.entries()) {
    const links = cell.all().filter(n => n.tag === 'a');
    assert.equal(links.length, index < 2 ? 1 : 3);
    for (const link of links) {
      await link.events.click({ preventDefault() {} });
      assert.equal(f.navigation.at(-1)[1], targets[index]);
    }
  }
  const schedules = cells[2].all().filter(n => n.tag === 'a');
  assert.deepEqual(schedules.map(n => n.textContent), ['Standard marking schedule template', 'Student A - TV', 'Student B - CJ']);
  await schedules[1].events.click({ preventDefault() {} });
  assert.deepEqual(f.navigation.at(-1), [first, 'schedule']);
});
test('Records table preserves multiple assessments of one standard and orphaned individual schedules', async () => {
  const f = fixture({ id: '', recordsRequest: async () => ({ records: [
    { entry_key: record, title: 'Task One', standard_number: '29785' },
    { entry_key: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', title: 'Task Two', standard_number: '29785' },
    { entry_key: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', title: 'Orphan student', parent_record: record, standard_number: '92004' }
  ] }) }); await flush();
  const rows = f.host.find(n => n.attrs.class === 'moderation-records-table').children[2].children;
  assert.equal(rows.length, 2);
  assert.equal(rows[0].children[0].all().filter(n => n.tag === 'a').length, 2);
  assert.equal(rows[0].children[1].all().filter(n => n.tag === 'a').length, 2);
  assert.ok(rows[1].children[1].all().some(n => n.textContent === 'No assessment record'));
  assert.ok(rows[1].children[2].all().some(n => n.textContent === 'Orphan student'));
});
test('student panels use letter labels and compact fields; empty discussion imports only its linked marker comments', async () => {
  const first = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const second = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  const f = fixture({ page: 'internal', data: { internal: JSON.stringify({ samples: [
    { student: 'Student A - TV', markingScheduleRecord: first },
    { student: 'Student B - CJ', markingScheduleRecord: second, comments: 'My existing discussion' }
  ] }) }, recordRequest: async path => {
    assert.ok(path.endsWith(first), 'nonempty discussions are not fetched');
    return { revision: 1, content: { parentRecord: record, schedule: '{"markerComments":"Comments from marker"}' } };
  } }); await flush();
  assert.ok(f.host.find(n => n.tag === 'legend' && n.textContent === 'Student A'));
  assert.ok(f.host.find(n => n.tag === 'legend' && n.textContent === 'Student B'));
  assert.equal(f.host.all().filter(n => n.attrs.class === 'moderation-fields moderation-student-fields').length, 2);
  const top = f.host.find(n => n.attrs.class === 'moderation-fields moderation-student-fields');
  const reporting = f.host.find(n => n.attrs.class === 'moderation-fields moderation-student-reporting');
  assert.deepEqual(top.children.map(n => n.children[1].attrs.id),
    ['moderation-internal-0-student', 'moderation-internal-0-markerGrade', 'moderation-internal-0-comments']);
  assert.ok(top.children.every(n => n.children[1].attrs.class === 'moderation-student-highlight'));
  assert.deepEqual(reporting.children.map(n => n.children[1].attrs.id),
    ['moderation-internal-0-verifierGrade', 'moderation-internal-0-moderatedDate', 'moderation-internal-0-reportedGrade', 'moderation-internal-0-reportedDate']);
  assert.equal(top.parentElement.children[2], reporting);
  assert.equal(top.parentElement.children[3].tag, 'button');
  const samples = JSON.parse(f.host.find(n => n.attrs.name === 'internal').value).samples;
  assert.equal(samples[0].comments, 'Comments from marker');
  assert.equal(samples[1].comments, 'My existing discussion');
  assert.equal(f.host.find(n => n.attrs.id === 'moderation-internal-0-comments').value, 'Comments from marker');
});
test('discussion import does not overwrite edits made while loading or copy another parent record', async () => {
  const id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  let resolve;
  const f = fixture({ page: 'internal', data: { internal: JSON.stringify({ samples: [{ markingScheduleRecord: id }] }) },
    recordRequest: () => new Promise(done => { resolve = done; }) });
  const control = f.host.find(n => n.attrs.id === 'moderation-internal-0-comments');
  control.value = 'Typed during lookup'; control.events.input();
  resolve({ revision: 1, content: { parentRecord: record, schedule: '{"markerComments":"Old comment"}' } });
  await flush();
  assert.equal(JSON.parse(f.host.find(n => n.attrs.name === 'internal').value).samples[0].comments, 'Typed during lookup');
  const mismatch = fixture({ page: 'internal', data: { internal: JSON.stringify({ samples: [{ markingScheduleRecord: id }] }) },
    recordRequest: async () => ({ revision: 1, content: { parentRecord: id, schedule: '{"markerComments":"Do not copy"}' } }) });
  await flush();
  assert.ok(!JSON.parse(mismatch.host.find(n => n.attrs.name === 'internal').value).samples[0].comments);
  assert.ok(mismatch.host.find(n => n.attrs.role === 'alert' && n.textContent.includes('does not belong')));
});
test('all moderation Yes/No fields render in two-column tick tables without changing saved answers on load', async () => {
  for (const [page, definition] of Object.entries(schema.documents)) {
    const decisions = definition.groups.flatMap(([, fields]) => fields).filter(def => def[2] === schema.yesNo);
    const data = Object.fromEntries(decisions.map(([key], i) => [key, ['Yes', 'No', 'Not applicable', ''][i % 4]]));
    const f = fixture({ page, data: { [page]: JSON.stringify(data) } }); await flush();
    const tables = f.host.all().filter(child => child.attrs.class === 'moderation-decisions');
    assert.equal(tables.length, definition.groups.filter(([, fields]) => fields.some(def => def[2] === schema.yesNo)).length);
    for (const [key, label] of decisions) {
      const box = f.host.find(child => child.attrs.id === 'moderation-' + page + '-' + key);
      assert.equal(box.type, 'checkbox', page + ':' + key);
      assert.equal(box.checked, data[key] === 'Yes');
      assert.equal(box.indeterminate, !data[key] || data[key] === 'Not applicable');
      assert.equal(box.parentElement.tag, 'td');
      assert.equal(box.parentElement.parentElement.children.length, 2);
      assert.equal(box.parentElement.parentElement.children[0].children[0].textContent, label);
    }
    assert.deepEqual(JSON.parse(f.host.find(child => child.attrs.name === page).value), data);
    if (decisions.length) {
      const key = decisions[0][0];
      const box = f.host.find(child => child.attrs.id === 'moderation-' + page + '-' + key);
      box.checked = false; box.events.change();
      assert.equal(JSON.parse(f.host.find(child => child.attrs.name === page).value)[key], 'No');
      box.checked = true; box.events.change();
      assert.equal(JSON.parse(f.host.find(child => child.attrs.name === page).value)[key], 'Yes');
      assert.equal(box.indeterminate, false);
    }
    if (page === 'coversheet') assert.equal(f.host.find(child => child.attrs.id === 'moderation-coversheet-grade').tag, 'select');
    if (page === 'internal') assert.equal(f.host.find(child => child.attrs.id === 'moderation-internal-sourceTypes-commercial').type, 'checkbox');
  }
});
test('Unit Standards clear and hide higher requirements; Achievement Standards retain all three', async () => {
  for (const standardType of ['Unit', 'Achievement']) {
    const f = fixture({ page: 'schedule', data: { schedule: JSON.stringify({ achieved: 'Achieved criteria', merit: 'Old merit', excellence: 'Old excellence' }) },
      standardRequest: async () => ({ number: '99999', level: '3', version: '2', standardType }) });
    await flush();
    const state = JSON.parse(f.host.find(n => n.attrs.name === 'schedule').value);
    assert.equal(state.achieved, 'Achieved criteria');
    assert.equal(state.merit, standardType === 'Unit' ? '' : 'Old merit');
    assert.equal(state.excellence, standardType === 'Unit' ? '' : 'Old excellence');
    assert.equal(Boolean(f.host.find(n => n.attrs.id === 'moderation-schedule-merit')), standardType === 'Achievement');
    assert.equal(Boolean(f.host.find(n => n.attrs.id === 'moderation-schedule-excellence')), standardType === 'Achievement');
  }
});
test('unverified standard types do not clear existing requirements and surface the failure', async () => {
  const f = fixture({ page: 'schedule', data: { schedule: '{"merit":"Keep merit","excellence":"Keep excellence"}' },
    standardRequest: async () => { throw new Error('NZQA unavailable'); } });
  await flush();
  assert.equal(JSON.parse(f.host.find(n => n.attrs.name === 'schedule').value).merit, 'Keep merit');
  assert.ok(f.host.find(n => n.attrs.role === 'alert' && n.textContent.includes('Standard type could not be verified')));
});
test('requirements use a document-style table with exclusive grade ticks and only A for Unit Standards', async () => {
  for (const standardType of ['Unit', 'Achievement']) {
    const f = fixture({ page: 'schedule', data: { schedule: JSON.stringify({ requirements: [
      { requirement: 'Requirement one', grade: 'A', evidence: 'Evidence', judgement: 'Judgement' }
    ] }) }, standardRequest: async () => ({ number: '99999', standardType }) });
    await flush();
    let table = f.host.find(n => n.attrs.class === 'moderation-requirements-table');
    assert.deepEqual(table.children[1].children[0].children.map(n => n.textContent),
      ['Key requirements (list)', ...(standardType === 'Unit' ? ['A'] : ['A', 'M', 'E']),
        'Describe or attach the evidence considered', 'Explain how the judgement was made']);
    const boxes = table.all().filter(n => n.type === 'checkbox');
    assert.equal(boxes[0].checked, true);
    const selected = standardType === 'Unit' ? boxes[0] : boxes[1];
    selected.checked = true; selected.events.change();
    assert.equal(boxes.filter(n => n.checked).length, 1);
    assert.equal(JSON.parse(f.host.find(n => n.attrs.name === 'schedule').value).requirements[0].grade,
      standardType === 'Unit' ? 'A' : 'M');
    selected.checked = false; selected.events.change();
    assert.equal(JSON.parse(f.host.find(n => n.attrs.name === 'schedule').value).requirements[0].grade, '');
    assert.equal(table.all().some(n => n.tag === 'select'), false);
    assert.ok(f.host.find(n => n.textContent === 'Requirement 1'));
    assert.ok(f.host.find(n => n.tag === 'h3' && n.textContent === 'Standard'));
    assert.ok(f.host.find(n => n.tag === 'label' && n.textContent === 'Achieved Grade Criteria'));
    await f.click('Add requirement');
    table = f.host.find(n => n.attrs.class === 'moderation-requirements-table');
    assert.equal(table.children[2].children.length, 2);
    await f.click('Remove requirement 2');
    assert.equal(JSON.parse(f.host.find(n => n.attrs.name === 'schedule').value).requirements.length, 1);
  }
});
test('hidden legacy requirement grades are labelled and can be explicitly cleared', async () => {
  const f = fixture({ page: 'schedule', data: { schedule: '{"requirements":[{"grade":"E"}]}' },
    standardRequest: async () => ({ number: '99999', standardType: 'Unit' }) });
  await flush();
  assert.ok(f.host.find(n => n.textContent.startsWith('Saved grade: E.')));
  await f.click('Clear saved grade for requirement 1');
  assert.equal(JSON.parse(f.host.find(n => n.attrs.name === 'schedule').value).requirements[0].grade, '');
});
test('four visible schedule resources independently select and save Drive links without importing or updating contents', async () => {
  const f = fixture({ page: 'schedule', data: { schedule: JSON.stringify({ instructions: 'Existing instructions', submissions: 'Existing submissions' }) } });
  await flush();
  const fields = schema.documents.schedule.groups[0][1].filter(def => def[2] === 'drive' && def[0] !== 'tourReportLink');
  assert.equal(fields.length, 4);
  for (const [i, [key, label]] of fields.entries()) {
    f.chosen = { id: 'resource_doc_' + i };
    await f.click('Choose Google Drive files for ' + label);
    const saved = JSON.parse(f.saved.at(-1).schedule);
    assert.equal(saved[key], 'Existing assessment | https://drive.google.com/file/d/resource_doc_' + i + '/view');
    assert.equal(saved.instructions, 'Existing instructions');
    assert.equal(saved.submissions, 'Existing submissions');
    assert.ok(f.host.find(n => n.tag === 'a' && n.attrs.href === 'https://drive.google.com/file/d/resource_doc_' + i + '/view'));
  }
  const saved = JSON.parse(f.saved.at(-1).schedule);
  for (const [key] of fields) assert.ok(saved[key]);
  assert.equal(f.calls.filter(call => ['upload', 'download', 'binary'].includes(call[0])).length, 0);
  await f.host.find(n => n.attrs['aria-label'] === 'Remove Existing assessment from Topic Brief').events.click();
  assert.equal(JSON.parse(f.saved.at(-1).schedule).topicBriefLink, '');
  assert.ok(JSON.parse(f.saved.at(-1).schedule).assessmentInstructionsLink);
  const reopened = fixture({ page: 'schedule', data: { schedule: f.saved.at(-1).schedule } });
  await flush();
  assert.ok(reopened.host.find(n => n.tag === 'a' && n.attrs.href === 'https://drive.google.com/file/d/resource_doc_0/view'));
});
test('resource selection cancellation, inaccessible documents and failed saves surface without changing Drive contents', async () => {
  const f = fixture({ page: 'schedule' }); await flush();
  const label = 'Choose Google Drive files for Topic Brief';
  f.chosen = null; await f.click(label);
  assert.equal(f.saved.length, 0);
  f.chosen = { id: 'document_id_123' }; f.missing = true; await f.click(label);
  assert.ok(f.host.find(n => n.attrs.role === 'alert' && n.textContent.includes('inaccessible')));
  assert.equal(f.saved.length, 0);
  const failed = fixture({ page: 'schedule', saveFails: true }); await flush();
  await failed.click(label);
  assert.ok(failed.host.find(n => n.attrs.role === 'alert' && n.textContent.includes('not saved')));
  assert.equal(failed.calls.filter(call => ['upload', 'download', 'binary'].includes(call[0])).length, 0);
});
test('Confirmation contact email defaults to signed-in identity, autosaves and preserves overrides', async () => {
  for (const [existing, signedIn, expected] of [
    ['', 'teacher@example.test', 'teacher@example.test'],
    ['   ', 'teacher@example.test', 'teacher@example.test'],
    ['other@example.test', 'teacher@example.test', 'other@example.test'],
    ['', '', '']
  ]) {
    const f = fixture({ page: 'feedback', userEmail: signedIn,
      data: { feedback: JSON.stringify({ contactEmail: existing, grade: 'M' }) } });
    let changed = 0;
    f.host.addEventListener('input', () => { changed++; });
    await flush();
    const control = f.host.find(n => n.attrs.id === 'moderation-feedback-contactEmail');
    assert.equal(control.value, expected);
    const saved = JSON.parse(f.host.find(n => n.attrs.name === 'feedback').value);
    assert.equal(saved.contactEmail, expected);
    assert.equal(saved.grade, 'M');
    if (!existing.trim() && signedIn) assert.ok(changed > 0, 'prefill triggers host autosave after mount');
    control.value = 'custom@example.test'; control.events.input();
    assert.equal(JSON.parse(f.host.find(n => n.attrs.name === 'feedback').value).contactEmail, 'custom@example.test');
    assert.equal(f.calls.filter(call => ['upload', 'download', 'binary'].includes(call[0])).length, 0);
  }
});
test('schedule and confirmation sync editable documents then update a persistent PDF in the source folder', async () => {
  for (const page of ['schedule', 'feedback']) {
    const f = fixture({ page }); await flush();
    const metadata = f.access.metadata;
    f.access.metadata = async id => id === 'pdf_document_123' ?
      { id, name: 'Existing.pdf', mimeType: 'application/pdf', capabilities: { canEdit: true }, etag: '"pdf-rev"' } : metadata(id);
    await f.click('Create / update Google Drive document');
    const pdfCall = f.calls.find(c => c[0] === 'savePdf');
    assert.ok(pdfCall);
    assert.equal(pdfCall[2].folderId, 'student_folder_123');
    assert.equal(pdfCall[2].properties.plannerDocument, page + '-pdf');
    assert.ok(f.calls.findIndex(c => c[0] === 'upload') < f.calls.findIndex(c => c[0] === 'savePdf'));
    if (page === 'schedule') {
      const generation = f.calls.find(c => c[0] === 'binary' && c[1].includes('/document'));
      assert.equal(new URL('https://planner.example.test/' + generation[1]).searchParams.get('standardPdfUrl'),
        'https://www.nzqa.govt.nz/nqfdocs/ncea-resource/achievements/2026/as99999.pdf');
    }
    assert.equal(JSON.parse(f.saved.at(-1).driveDocuments)[page].pdf.id, 'pdf_document_123');
    assert.ok(f.host.find(n => n.tag === 'a' && n.textContent === 'Open PDF copy'));
    await f.click('Create / update Google Drive document');
    assert.equal(f.calls.filter(c => c[0] === 'savePdf').at(-1)[2].id, 'pdf_document_123');
    assert.equal(f.calls.filter(c => c[0] === 'savePdf').at(-1)[2].etag, '"pdf-rev"');
  }
});
test('PDF failure clearly reports partial success and keeps the editable document link', async () => {
  const f = fixture({ page: 'feedback' }); await flush();
  f.access.savePdf = async () => { throw new Error('PDF export unavailable'); };
  await f.click('Create / update Google Drive document');
  assert.equal(JSON.parse(f.saved.at(-1).driveDocuments).feedback.id, 'document_id_123');
  assert.ok(f.host.find(n => n.attrs.role === 'alert' && /editable document synced successfully.*PDF export unavailable/.test(n.textContent)));
});
test('generated schedule PDF becomes the single confirmation schedule reference and removes generic-link duplicates', async () => {
  const oldFeedback = { grade: 'M', contactEmail: 'teacher@example.test',
    markingScheduleLink: 'Student A schedule | https://example.test/old\nMarking Schedule | https://example.test/manual',
    coversheetLink: 'Student A cover | https://example.test/old-cover\nCover Sheet | https://example.test/cover' };
  const f = fixture({ page: 'schedule', data: { feedback: JSON.stringify(oldFeedback) } }); await flush();
  await f.click('Create / update Google Drive document');
  const saved = f.saved.at(-1);
  const feedback = JSON.parse(saved.feedback);
  assert.equal(feedback.markingScheduleLink, 'Marking Schedule | https://drive.google.com/file/d/pdf_document_123/view');
  assert.equal(feedback.coversheetLink, 'Cover Sheet | https://example.test/cover');
  assert.equal(feedback.grade, 'M');
  assert.equal(feedback.contactEmail, oldFeedback.contactEmail);
  const reopened = fixture({ page: 'feedback', data: saved }); await flush();
  const marking = reopened.host.find(n => n.tag === 'h4' && n.textContent === 'Marking Schedule').parentElement;
  assert.equal(marking.all().filter(n => n.tag === 'a').length, 1);
  assert.equal(marking.all().find(n => n.tag === 'a').attrs.href, 'https://drive.google.com/file/d/pdf_document_123/view');
});
test('opening confirmation reconciles existing duplicate references and prefers the generated schedule PDF', async () => {
  const f = fixture({ page: 'feedback', data: {
    driveDocuments: JSON.stringify({ schedule: { id: 'schedule_doc_123', name: 'Schedule',
      mimeType: 'application/vnd.google-apps.document', pdf: { id: 'generated_pdf_123', name: 'Schedule.pdf', mimeType: 'application/pdf' } } }),
    feedback: JSON.stringify({
      markingScheduleLink: 'Student B | https://example.test/old\nMarking Schedule | https://example.test/short',
      coversheetLink: 'Student B | https://example.test/cover\nCover Sheet | https://example.test/cover\nCover Sheet | https://example.test/cover'
    })
  } });
  await flush();
  const feedback = JSON.parse(f.host.find(n => n.attrs.name === 'feedback').value);
  assert.equal(feedback.markingScheduleLink, 'Marking Schedule | https://drive.google.com/file/d/generated_pdf_123/view');
  assert.equal(feedback.coversheetLink, 'Cover Sheet | https://example.test/cover');
  assert.equal(f.calls.filter(c => ['upload', 'savePdf', 'download'].includes(c[0])).length, 0);
});
test('PDF sync recovers tagged copies and refuses to replace an inaccessible existing PDF', async () => {
  for (const canEdit of [true, false]) {
    const f = fixture({ page: 'feedback' }); await flush();
    f.access.find = async (_folder, properties) => properties.plannerDocument === 'feedback-pdf' ?
      { id: 'recovered_pdf_123' } : null;
    const metadata = f.access.metadata;
    f.access.metadata = async id => id === 'recovered_pdf_123' ?
      { id, mimeType: 'application/pdf', name: 'Recovered.pdf', capabilities: { canEdit } } : metadata(id);
    await f.click('Create / update Google Drive document');
    if (canEdit) assert.equal(f.calls.find(c => c[0] === 'savePdf')[2].id, 'recovered_pdf_123');
    else {
      assert.equal(f.calls.filter(c => c[0] === 'savePdf').length, 0);
      assert.ok(f.host.find(n => n.attrs.role === 'alert' && n.textContent.includes('Restore access')));
    }
  }
});
test('all link-only fields allow any file type without importing or changing file contents', async () => {
  for (const [page, label, key, mimeType] of [
    ['feedback', 'Marking Schedule', 'markingScheduleLink', 'application/pdf'],
    ['feedback', 'Cover Sheet', 'coversheetLink', 'application/pdf'],
    ['schedule', 'Topic Brief', 'topicBriefLink', 'image/png'],
    ['schedule', 'File Submission', 'fileSubmissionLink', 'application/msaccess']
  ]) {
    const f = fixture({ page }); await flush();
    f.access.metadata = async id => ({ id, name: 'Student submission', mimeType });
    await f.click('Choose Google Drive files for ' + label);
    const choice = f.calls.find(call => call[0] === 'chooseFiles');
    assert.equal(choice[1], page !== 'feedback');
    assert.equal(JSON.parse(f.saved.at(-1)[page])[key],
      'Student submission | https://drive.google.com/file/d/document_id_123/view');
    assert.ok(f.host.find(n => n.tag === 'a' && n.textContent === 'Student submission'));
    assert.equal(f.calls.filter(call => ['upload', 'download', 'binary'].includes(call[0])).length, 0);
  }
});
test('moderation buttons distinguish Drive sync, replacement and removal without changing navigation actions', async () => {
  const f = fixture({ page: 'schedule', data: { schedule: JSON.stringify({
    requirements: [{ requirement: 'Actual requirement', grade: 'A' }],
    topicBriefLink: 'Brief | https://example.test/brief'
  }) } });
  await flush();
  const button = label => f.host.find(n => n.tag === 'button' && n.textContent === label);
  assert.equal(button('Create / update Google Drive document').attrs.class, 'moderation-button-drive');
  assert.equal(button('Create a replacement document').attrs.class, 'moderation-button-warning');
  assert.equal(button('Remove requirement 1').attrs.class, 'moderation-button-danger');
  assert.equal(f.host.find(n => n.attrs['aria-label'] === 'Remove Brief from Topic Brief').attrs.class, 'moderation-button-danger');
  await f.click('Remove requirement 1');
  assert.deepEqual(JSON.parse(f.host.find(n => n.attrs.name === 'schedule').value).requirements, []);
  const internal = fixture({ page: 'internal', data: { internal: JSON.stringify({ samples: [{ student: 'Learner' }] }) } });
  await flush();
  assert.equal(internal.host.find(n => n.tag === 'button' && n.textContent === 'Remove entry 1').attrs.class, 'moderation-button-danger');
  assert.notEqual(internal.host.find(n => n.tag === 'button' &&
    n.textContent === 'Create / open marking schedule for entry 1').attrs.class, 'moderation-button-danger');
});
test('Unit criteria populate from PDF outcomes only when empty or the old Achieved placeholder', async () => {
  for (const [standardType, existing, expected] of [
    ['Unit', '', 'Outcome 1: Integrate documents.\n\nOutcome 2: Review documents.'],
    ['Unit', 'Achieved', 'Outcome 1: Integrate documents.\n\nOutcome 2: Review documents.'],
    ['Unit', 'Custom assessment criteria', 'Custom assessment criteria'],
    ['Achievement', '', '']
  ]) {
    const f = fixture({ page: 'schedule', data: { schedule: JSON.stringify({ achieved: existing }) },
      standardRequest: async () => ({ number: '99999', standardType,
        outcomes: ['Outcome 1: Integrate documents.', 'Outcome 2: Review documents.'] }) });
    await flush();
    assert.equal(JSON.parse(f.host.find(n => n.attrs.name === 'schedule').value).achieved, expected);
    assert.equal(f.host.find(n => n.attrs.id === 'moderation-schedule-achieved').value, expected);
    assert.ok(f.host.find(n => n.tag === 'label' && n.textContent === 'Achieved Grade Criteria'));
  }
});
test('resource tables put short and long filename links on the left and Remove buttons on the right', async () => {
  const f = fixture({ page: 'schedule', data: { schedule: JSON.stringify({
    fileSubmissionLink: 'Short | https://example.test/short\nA much longer submission file name | https://example.test/long'
  }) } });
  await flush();
  const table = f.host.find(n => n.attrs.class === 'moderation-resource-table' && n.attrs['aria-label'] === 'File Submission files');
  assert.ok(table);
  assert.deepEqual(table.children[0].children[0].children.map(n => [n.textContent, n.attrs.scope]), [['Filename', 'col'], ['Action', 'col']]);
  const rows = table.children[1].children;
  assert.equal(rows.length, 2);
  for (const item of rows) {
    assert.deepEqual(item.children.map(child => child.tag), ['td', 'td']);
    const filename = item.children[0].children[0], remove = item.children[1].children[0];
    assert.equal(filename.tag, 'a');
    assert.equal(remove.attrs.class, 'moderation-button-danger');
    assert.equal(remove.textContent, 'Remove');
    assert.equal(remove.attrs['aria-label'], 'Remove ' + filename.textContent + ' from File Submission');
  }
  const css = fs.readFileSync(require.resolve('./public/planner.css'), 'utf8');
  assert.match(css, /\.moderation-resource-table\s*\{[^}]*width:\s*100%/);
  assert.match(css, /\.moderation-resource-table th,[^{]*\{[^}]*overflow-wrap:\s*anywhere/);
});
test('Unit overall grade follows requirement ticks and clears when incomplete while Achievement grade remains manual', async () => {
  const f = fixture({ page: 'schedule', standardRequest: async () => ({ number: '99999', standardType: 'Unit' }),
    data: { standardType: 'Unit', schedule: JSON.stringify({ requirements: [
      { requirement: 'First', grade: 'A' }, { requirement: 'Second', grade: 'A' }
    ] }) } });
  await flush();
  const grade = () => JSON.parse(f.host.find(n => n.attrs.name === 'schedule').value).grade;
  const control = () => f.host.find(n => n.attrs.id === 'moderation-schedule-grade');
  assert.equal(grade(), 'A');
  assert.equal(control().value, 'A');
  const tick = f.host.find(n => n.attrs['aria-label'] === 'A for requirement 2');
  tick.checked = false; tick.events.change();
  assert.equal(grade(), '');
  assert.equal(control().value, '');
  tick.checked = true; tick.events.change();
  assert.equal(grade(), 'A');
  await f.click('Add requirement');
  assert.equal(grade(), '');
  await f.click('Remove requirement 3');
  assert.equal(grade(), 'A');
  await f.click('Remove requirement 2'); await f.click('Remove requirement 1');
  assert.equal(grade(), '');
  const achievement = fixture({ page: 'schedule', data: { schedule: JSON.stringify({
    grade: 'M', requirements: [{ requirement: 'First', grade: 'A' }]
  }) } }); await flush();
  const aTick = achievement.host.find(n => n.attrs['aria-label'] === 'A for requirement 1');
  aTick.checked = false; aTick.events.change();
  assert.equal(JSON.parse(achievement.host.find(n => n.attrs.name === 'schedule').value).grade, 'M');
});
test('opening a saved student schedule removes its template-only row and keeps the three actual requirements', async () => {
  const placeholder = { requirement: 'Key requirements (list):', grade: '',
    evidence: 'Describe or attach the evidence considered.', judgement: 'Explain how the judgement was made.' };
  const requirements = [
    { requirement: 'Integrated documents', grade: 'A', evidence: 'Student C evidence', judgement: 'Achieved' },
    { requirement: 'Edited images', grade: 'A', evidence: '', judgement: '' },
    { requirement: 'Good practice', grade: 'A', evidence: '', judgement: '' }
  ];
  const f = fixture({ page: 'schedule', data: { standardType: 'Unit',
    schedule: JSON.stringify({ requirements: [placeholder, ...requirements], comments: 'Keep marker comments' }) } });
  let autosaved = false;
  f.host.addEventListener('input', () => { autosaved = true; });
  await flush();
  const saved = JSON.parse(f.host.find(n => n.attrs.name === 'schedule').value);
  assert.deepEqual(saved.requirements, requirements);
  assert.equal(saved.comments, 'Keep marker comments');
  assert.equal(autosaved, true);
  assert.equal(f.host.find(n => n.attrs.id === 'moderation-schedule-0-requirement').value, requirements[0].requirement);
  assert.equal(f.host.all().filter(n => n.tag === 'button' && /^Remove requirement /.test(n.textContent)).length, 3);
  assert.ok(f.host.find(n => n.attrs.role === 'status' && n.textContent.includes('Template-only requirement rows removed')));
});
test('resource sections append multiple files, deduplicate selections and remove only the selected file', async () => {
  const f = fixture({ page: 'schedule' }); await flush();
  const choose = 'Choose Google Drive files for File Submission';
  f.chosen = { id: 'first_file_123' }; await f.click(choose);
  f.chosen = { id: 'second_file_123' }; await f.click(choose);
  const value = JSON.parse(f.saved.at(-1).schedule).fileSubmissionLink;
  assert.equal(value.split('\n').length, 2);
  await f.click(choose);
  assert.equal(JSON.parse(f.host.find(n => n.attrs.name === 'schedule').value).fileSubmissionLink, value);
  const panel = f.host.find(n => n.tag === 'h4' && n.textContent === 'File Submission').parentElement;
  const remove = panel.all().find(n => n.tag === 'button' && n.textContent === 'Remove');
  await remove.events.click();
  assert.equal(JSON.parse(f.saved.at(-1).schedule).fileSubmissionLink,
    'Existing assessment | https://drive.google.com/file/d/second_file_123/view');
  const reopened = fixture({ page: 'schedule', data: { schedule: JSON.stringify({ fileSubmissionLink: value }) } });
  await flush();
  assert.equal(reopened.host.all().filter(n => n.tag === 'a' && n.attrs.href?.includes('_file_123')).length, 2);
  assert.equal(f.calls.filter(call => ['upload', 'download', 'binary'].includes(call[0])).length, 0);
});
test('one selection saves twelve mixed-type files, deduplicates them and persists after reopening', async () => {
  const f = fixture({ page: 'schedule', data: { schedule: JSON.stringify({
    fileSubmissionLink: 'Existing PDF | https://drive.google.com/file/d/resource_file_0/view'
  }) } }); await flush();
  const names = ['Australia passengers.pdf', 'NZ Promotion.accdb', 'Relationship.png', 'Workbook.xlsx',
    'Instructions.docx', 'Program.py', 'Archive.zip', 'Query.pdf', 'Table.pdf', 'Report.pdf', 'Notes.txt', 'Presentation.pptx'];
  f.chosen = names.map((_, i) => ({ id: 'resource_file_' + i }));
  f.access.metadata = async id => ({
    id, name: names[Number(id.split('_').at(-1))],
    mimeType: 'application/octet-stream'
  });
  await f.click('Choose Google Drive files for File Submission');
  const value = JSON.parse(f.saved.at(-1).schedule).fileSubmissionLink;
  assert.equal(value.split('\n').length, 12);
  assert.ok(value.startsWith('Existing PDF | '));
  assert.match(value, /NZ Promotion\.accdb/);
  assert.match(value, /Relationship\.png/);
  assert.equal(f.calls.find(c => c[0] === 'chooseFiles')[1], true);
  assert.equal(f.calls.filter(c => ['upload', 'download', 'binary'].includes(c[0])).length, 0);
  const reopened = fixture({ page: 'schedule', data: { schedule: f.saved.at(-1).schedule } });
  await flush();
  assert.equal(reopened.host.all().filter(n => n.tag === 'a' && n.attrs.href?.includes('resource_file_')).length, 12);
  await f.click('Choose Google Drive files for File Submission');
  assert.equal(JSON.parse(f.host.find(n => n.attrs.name === 'schedule').value).fileSubmissionLink, value);
});
test('multi-file selection validates the whole batch before saving any links', async () => {
  for (const failure of ['folder', 'trashed', 'inaccessible', 'longName', 'totalLength']) {
    const original = 'Original | https://example.test/original';
    const f = fixture({ page: 'schedule', data: { schedule: JSON.stringify({ fileSubmissionLink: original }) } });
    await flush();
    f.chosen = Array.from({ length: failure === 'totalLength' ? 25 : 2 }, (_, i) => ({ id: 'batch_file_' + i }));
    f.access.metadata = async id => {
      if (id === 'batch_file_1' && failure === 'inaccessible') throw new Error('File is inaccessible.');
      return { id, name: failure === 'totalLength' ? 'x'.repeat(350) :
        id === 'batch_file_1' && failure === 'longName' ? 'x'.repeat(501) : 'Submission',
        trashed: id === 'batch_file_1' && failure === 'trashed',
        mimeType: id === 'batch_file_1' && failure === 'folder' ? 'application/vnd.google-apps.folder' : 'application/octet-stream' };
    };
    await f.click('Choose Google Drive files for File Submission');
    assert.equal(JSON.parse(f.host.find(n => n.attrs.name === 'schedule').value).fileSubmissionLink, original);
    assert.equal(f.saved.length, 0);
    assert.ok(f.host.find(n => n.attrs.role === 'alert' && n.textContent));
  }
});
test('schedule resources match the paper layout and hide legacy text boxes without removing their data', async () => {
  const f = fixture({ page: 'schedule', data: { schedule: JSON.stringify({ instructions: 'Keep old instructions', submissions: 'Keep old submissions' }) } }); await flush();
  const columns = f.host.find(n => n.attrs.class === 'moderation-resource-columns');
  assert.equal(columns.children.length, 2);
  assert.deepEqual(columns.children[0].children.map(n => n.children[0].textContent),
    ['Assessment Instructions & Schedule', 'Topic Brief']);
  assert.deepEqual(columns.children[1].children.map(n => n.children[0].textContent),
    ['Documentation Submission', 'File Submission']);
  assert.equal(f.host.find(n => n.attrs.id === 'moderation-schedule-instructions'), undefined);
  assert.equal(f.host.find(n => n.attrs.id === 'moderation-schedule-submissions'), undefined);
  assert.deepEqual(JSON.parse(f.host.find(n => n.attrs.name === 'schedule').value),
    { instructions: 'Keep old instructions', submissions: 'Keep old submissions' });
});
test('Tour Report controls are removed while previously saved links remain intact', async () => {
  const value = 'Saved report | https://example.test/report';
  const f = fixture({ page: 'schedule', data: { schedule: JSON.stringify({ tourReportLink: value }) } });
  await flush();
  assert.equal(f.host.find(n => n.textContent.includes('Task 2 - Tour Report')), undefined);
  assert.equal(JSON.parse(f.host.find(n => n.attrs.name === 'schedule').value).tourReportLink, value);
});
test('source materials automatically fill shared and existing individual schedules without overwriting chosen links', async () => {
  const source = '29785 Assessment Combined.pdf | https://drive.google.com/file/d/assessment_pdf_123/view\nTopic Brief.pdf | https://drive.google.com/file/d/topic_brief_123/view\nOther assessment | https://example.test/other';
  const shared = fixture({ page: 'schedule', data: { internal: JSON.stringify({ source }) } }); await flush();
  const saved = JSON.parse(shared.host.find(n => n.attrs.name === 'schedule').value);
  assert.equal(saved.assessmentInstructionsLink, source.split('\n')[0]);
  assert.equal(saved.topicBriefLink, source.split('\n')[1]);
  const child = fixture({ page: 'schedule', data: { parentRecord: record,
    schedule: JSON.stringify({ topicBriefLink: 'Chosen brief | https://example.test/chosen' }) },
    recordRequest: async () => ({ content: { internal: JSON.stringify({ source }) } }) });
  await flush();
  const childData = JSON.parse(child.host.find(n => n.attrs.name === 'schedule').value);
  assert.equal(childData.assessmentInstructionsLink, saved.assessmentInstructionsLink);
  assert.equal(childData.topicBriefLink, 'Chosen brief | https://example.test/chosen');
  assert.ok(child.host.find(n => n.tag === 'a' && n.attrs.href === 'https://drive.google.com/file/d/assessment_pdf_123/view'));
});
test('new individual schedules inherit source links and unsafe or plain source lines are not guessed', async () => {
  const source = 'Plain text\nUnsafe | javascript:alert(1)\nTopic_Brief.pdf | https://example.test/brief\nFirst assessment.pdf | https://example.test/assessment\nSecond assessment | https://example.test/second';
  const f = fixture({ page: 'internal', data: { internal: JSON.stringify({ source, samples: [{ student: 'Student A' }] }) } });
  await flush(); await f.click('Create / open marking schedule for entry 1');
  const schedule = JSON.parse(f.calls.find(call => call[0] === 'mutate')[2].content.schedule);
  assert.equal(schedule.assessmentInstructionsLink, 'First assessment.pdf | https://example.test/assessment');
  assert.equal(schedule.topicBriefLink, 'Topic_Brief.pdf | https://example.test/brief');
});
test('resource selectors remain enabled after importing an existing marking schedule', async () => {
  const f = fixture({ page: 'schedule', importResult: { common: {}, document: { instructions: 'Imported notes' }, warning: 'Review import' } });
  await flush(); await f.click('Choose existing document and import its form data');
  await f.click('Choose Google Drive files for Topic Brief');
  assert.ok(JSON.parse(f.saved.at(-1).schedule).topicBriefLink);
  assert.equal(JSON.parse(f.saved.at(-1).schedule).instructions, 'Imported notes');
});
test('backlog link-only refresh fills missing links without overwriting marking data or existing selections', async () => {
  const existing = 'Saved brief | https://docs.google.com/document/d/existing_brief/edit';
  const imported = 'Assessment Instructions & Schedule | https://docs.google.com/document/d/imported_instructions/edit';
  const f = fixture({ page: 'schedule', data: {
    schedule: JSON.stringify({ grade: 'E', markerComments: 'Keep marking', topicBriefLink: existing }),
    driveDocuments: JSON.stringify({ schedule: { id: 'schedule_doc_123', name: 'Old schedule', mimeType: 'application/vnd.google-apps.document' } })
  }, importResult: { common: { studentName: 'Different student' }, document: {
    grade: 'N', markerComments: 'Do not import', assessmentInstructionsLink: imported,
    topicBriefLink: 'Different brief | https://example.test/brief'
  }, warning: 'Review links' } });
  await flush(); await f.click('Import missing resource links from linked schedule');
  const saved = JSON.parse(f.saved.at(-1).schedule);
  assert.equal(saved.grade, 'E'); assert.equal(saved.markerComments, 'Keep marking');
  assert.equal(saved.topicBriefLink, existing); assert.equal(saved.assessmentInstructionsLink, imported);
  assert.notEqual(f.saved.at(-1).studentName, 'Different student');
  assert.equal(f.calls.filter(call => ['choose', 'upload'].includes(call[0])).length, 0);
  assert.ok(f.host.find(n => n.tag === 'a' && n.attrs.href === imported.split(' | ')[1]));
  assert.ok(f.host.find(n => n.tag === 'button' && n.textContent === 'Choose Google Drive files for Topic Brief' && !n.disabled));
});
test('link-only refresh explains missing source and reports save failures', async () => {
  const missing = fixture({ page: 'schedule' }); await flush();
  await missing.click('Import missing resource links from linked schedule');
  assert.ok(missing.host.find(n => n.attrs.role === 'alert' && n.textContent.includes('existing marking schedule')));
  assert.equal(missing.calls.filter(call => call[0] === 'download').length, 0);
  const failed = fixture({ page: 'schedule', saveFails: true }); await flush();
  await failed.click('Import missing resource links from linked schedule');
  assert.ok(failed.host.find(n => n.attrs.role === 'alert' && n.textContent.includes('not saved')));
});
test('internal workflow puts strategic entries between critique and verification; each creates a separate template-based schedule', async () => {
  const f = fixture({ page: 'internal', data: { schedule: '{"instructions":"Shared schedule"}',
    internal: JSON.stringify({ samples: [{ student: 'Learner One' }, { student: 'Learner Two' }] }) } });
  await flush();
  const headings = f.host.all().filter(child => child.tag === 'h3').map(child => child.textContent);
  assert.ok(headings.indexOf('B. Pre-assessment critique') < headings.indexOf('Strategic selection of work for verification'));
  assert.ok(headings.indexOf('Strategic selection of work for verification') < headings.indexOf('C. Verify teacher judgements'));
  assert.ok(headings.indexOf('D. Results, retention and review') < headings.indexOf('Supporting information for this stage'));
  await f.click('Create / open marking schedule for entry 1');
  const first = f.calls.find(call => call[0] === 'mutate');
  const id = first[1].split('/').at(-1);
  assert.equal(first[2].content.studentName, 'Learner One');
  assert.equal(first[2].content.parentRecord, record);
  assert.equal(first[2].content.standardNumber, '99999');
  assert.equal(first[2].content.folderId, 'folder_id_123');
  assert.ok(f.calls.some(call => call[0] === 'studentFolder' && call[1] === 'standard_folder_123' && call[2] === 0));
  assert.equal(first[2].content.schedule, '{"instructions":"Shared schedule"}', 'individual form starts with reusable template instructions');
  assert.equal(JSON.parse(f.saved.at(-1).internal).samples[0].markingScheduleRecord, id);
  assert.deepEqual(f.navigation.at(-1), [id, 'schedule']);
  await f.click('Create / open marking schedule for entry 2');
  const second = f.calls.filter(call => call[0] === 'mutate')[1];
  assert.notEqual(second[1], first[1]);
  assert.equal(second[2].content.studentName, 'Learner Two');
  assert.ok(f.calls.some(call => call[0] === 'studentFolder' && call[2] === 1));
});
test('individual schedules reopen without recreation and preserve record metadata without duplicate navigation or explanatory text', async () => {
  const id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const f = fixture({ page: 'internal', data: { internal: JSON.stringify({ samples: [{ student: 'Learner', markingScheduleRecord: id }] }) },
    recordRequest: async () => ({ revision: 1, content: { parentRecord: record } }) });
  await flush(); await f.click('Create / open marking schedule for entry 1');
  assert.equal(f.calls.filter(call => call[0] === 'mutate').length, 0);
  assert.deepEqual(f.navigation[0], [id, 'schedule']);
  const child = fixture({ page: 'schedule', id, data: { parentRecord: record, studentName: 'Learner' },
    recordRequest: async () => ({ content: { internal: JSON.stringify({ samples: [{ student: 'Learner', markingScheduleRecord: id }] }) } }) });
  await flush();
  assert.equal(child.host.find(n => n.attrs.class === 'moderation-navigation'), undefined);
  assert.equal(child.host.find(n => n.textContent.startsWith('Individual marking schedule for ')), undefined);
  const tabs = child.host.find(n => n.attrs.class === 'moderation-tabs');
  await tabs.children[1].events.click();
  assert.deepEqual(child.navigation[0], ['', 'internal']);
  assert.equal(child.host.find(n => n.attrs.name === 'parentRecord').value, record);
  await child.click('Create / update Google Drive document');
  assert.equal(child.saved.at(-1).parentRecord, record);
  assert.equal(child.calls.find(call => call[0] === 'upload')[1].folderId, 'student_folder_0');
});
test('preparing parent folders creates anonymous folders for all entries; child preparation resolves entry position, not initials', async () => {
  const samples = [{ student: 'Student A - TV' }, { student: 'Student B - XY', markingScheduleRecord: record }];
  const parent = fixture({ page: 'overview', data: { internal: JSON.stringify({ samples }) } });
  await flush(); await parent.click('Prepare level / standard folders');
  assert.deepEqual(parent.calls.filter(call => call[0] === 'studentFolder').map(call => call.slice(1)), [
    ['standard_folder_123', 0], ['standard_folder_123', 1]
  ]);
  const child = fixture({ page: 'schedule', data: { parentRecord: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', studentName: 'Student B - XY' },
    recordRequest: async () => ({ content: { internal: JSON.stringify({ samples }) } }) });
  await flush(); await child.click('Create / update Google Drive document');
  assert.equal(child.calls.find(call => call[0] === 'upload')[1].folderId, 'student_folder_1');
  assert.equal(JSON.parse(child.saved.at(-1).standardFolder).id, 'standard_folder_123');
  assert.equal(JSON.parse(child.saved.at(-1).internal).retentionLocation, 'Private assessments / Level 3 / 99999\nhttps://drive.google.com/drive/folders/standard_folder_123');
});
test('existing individual Drive documents update in place without being moved, and unmatched entries cannot create new documents', async () => {
  const f = fixture({ page: 'schedule', data: { parentRecord: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    driveDocuments: JSON.stringify({ schedule: { id: 'existing_document_123', name: 'Existing', mimeType: 'application/vnd.google-apps.document' } }) } });
  await flush(); await f.click('Create / update Google Drive document');
  assert.equal(f.calls.find(call => call[0] === 'upload')[1].id, 'existing_document_123');
  assert.equal(f.calls.filter(call => call[0] === 'studentFolder').length, 0);
  const unmatched = fixture({ page: 'schedule', data: { parentRecord: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' } });
  await flush(); await unmatched.click('Create / update Google Drive document');
  assert.equal(unmatched.calls.filter(call => call[0] === 'upload').length, 0);
  assert.ok(unmatched.host.find(n => n.attrs.role === 'alert' && n.textContent.includes('exactly one entry')));
});
test('individual schedule failures preserve a reserved ID for retry and never navigate on failed save', async () => {
  const f = fixture({ page: 'internal', data: { internal: JSON.stringify({ samples: [{ student: 'Learner' }] }) },
    mutation: async () => { throw new Error('Creation unavailable'); } });
  await flush(); await f.click('Create / open marking schedule for entry 1');
  assert.equal(f.navigation.length, 0);
  const id = JSON.parse(f.saved.at(-1).internal).samples[0].markingScheduleRecord;
  await f.click('Create / open marking schedule for entry 1');
  assert.ok(f.calls.filter(call => call[0] === 'mutate').every(call => call[1].endsWith(id)));
  assert.ok(f.host.find(n => n.attrs.role === 'alert' && n.textContent.includes('Creation unavailable')));
  const failed = fixture({ page: 'internal', saveFails: true, data: { internal: '{"samples":[{"student":"Learner"}]}' } });
  await flush(); await failed.click('Create / open marking schedule for entry 1');
  assert.equal(failed.calls.filter(call => call[0] === 'mutate').length, 0);
  const blank = fixture({ page: 'internal', data: { internal: '{"samples":[{}]}' } });
  await flush(); await blank.click('Create / open marking schedule for entry 1');
  assert.equal(blank.navigation.length, 0);
  assert.ok(blank.host.find(n => n.attrs.role === 'alert' && n.textContent.includes('student name')));
});
test('reimporting paper samples keeps uniquely matched individual schedule links', async () => {
  const id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const f = fixture({ page: 'internal', data: { internal: JSON.stringify({ samples: [{ student: 'Learner', markingScheduleRecord: id }] }) },
    importResult: { common: {}, document: { samples: [{ student: 'Learner', markerGrade: 'A' }] }, warning: 'Review import' } });
  await flush(); await f.click('Choose existing document and import its form data');
  assert.equal(JSON.parse(f.saved.at(-1).internal).samples[0].markingScheduleRecord, id);
});
test('NZQA suggestions require explicit selection, confirm replacements and never tick review checks', async () => {
  const reportUrl = 'https://www2.nzqa.govt.nz/ncea/subjects/select-subject/biology/nmr/';
  const specUrl = 'https://www.nzqa.govt.nz/nqfdocs/ncea-resource/specifications/2026/99999-spc-2026.pdf';
  const result = { number: '99999', year: 2026, checkedAt: '2026-10-24T20:00:00Z', warnings: [], suggestions: [
    { target: 'moderatorReportLink', url: reportUrl, title: 'Biology report', kind: 'Moderator report', year: '2025', scope: 'Mentions standard 99999' },
    { target: 'conditionsLink', url: specUrl, title: 'Assessment specifications 2026', kind: 'Assessment specifications', year: '2026', scope: 'PDF mentions standard 99999' }
  ] };
  let fail = false;
  const f = fixture({ page: 'internal', data: { internal: JSON.stringify({ moderatorReport: 'No', conditions: 'No', moderatorReportLink: 'https://example.test/manual' }) },
    referenceRequest: async () => { if (fail) throw new Error('NZQA unavailable'); return result; } });
  await flush();
  const saved = () => JSON.parse(f.host.find(child => child.attrs.name === 'internal').value);
  const reference = key => f.host.find(child => child.attrs.id === 'moderation-internal-' + key).parentElement.parentElement;
  const click = async (row, label) => row.children.find(child => child.tag === 'button' && child.textContent === label).events.click();
  const reportRow = reference('moderatorReportLink');
  await click(reportRow, 'Find NZQA references');
  assert.equal(saved().moderatorReportLink, 'https://example.test/manual', 'lookup preserves manual link');
  const use = reportRow.find(child => child.tag === 'button' && child.textContent === 'Use this link');
  assert.ok(use);
  await use.events.click();
  assert.equal(saved().moderatorReportLink, reportUrl);
  assert.equal(saved().moderatorReport, 'No');
  assert.ok(f.calls.some(call => call[0] === 'confirm' && call[1].includes('Replace the existing reference')));
  const conditionsRow = reference('conditionsLink');
  await click(conditionsRow, 'Find NZQA references');
  await conditionsRow.find(child => child.tag === 'button' && child.textContent === 'Use this link').events.click();
  assert.equal(saved().conditionsLink, specUrl);
  assert.equal(saved().conditions, 'No');
  fail = true;
  await click(conditionsRow, 'Find NZQA references');
  assert.ok(conditionsRow.find(child => child.attrs.role === 'alert' && child.textContent.includes('NZQA unavailable')));
  assert.equal(saved().conditionsLink, specUrl);
});
test('previous critique shortcut sets exactly eight lower checks, autosaves once and allows individual overrides', async () => {
  const initial = { previousCritique: 'Yes', moderatorReport: 'No', conditions: 'Not applicable',
    externalFeedback: '', context: 'No', allGrades: 'Not applicable', previousCritiqueLink: 'https://example.test/critique' };
  const f = fixture({ page: 'internal', data: { internal: JSON.stringify(initial) } }); await flush();
  const control = key => f.host.find(child => child.attrs.id === 'moderation-internal-' + key);
  const saved = () => JSON.parse(f.host.find(child => child.attrs.name === 'internal').value);
  assert.deepEqual(saved(), initial, 'opening an existing Yes does not overwrite other answers');
  let changes = 0;
  f.host.addEventListener('input', () => changes++);
  control('previousCritique').checked = true; control('previousCritique').events.change();
  assert.equal(changes, 1, 'one coherent autosave event');
  for (const [key] of schema.critique.slice(4)) {
    assert.equal(saved()[key], 'Yes', key);
    assert.equal(control(key).checked, true);
    assert.equal(control(key).indeterminate, false);
    assert.equal(f.host.find(child => child.attrs.id === 'moderation-internal-' + key + '-answer').textContent, 'Yes');
  }
  for (const key of ['moderatorReport', 'conditions', 'externalFeedback', 'previousCritiqueLink']) assert.equal(saved()[key], initial[key]);
  control('context').checked = false; control('context').events.change();
  assert.equal(saved().context, 'No', 'individual override remains available');
  control('previousCritique').checked = false; control('previousCritique').events.change();
  assert.equal(saved().context, 'No');
  assert.equal(saved().allGrades, 'Yes', 'unticking parent does not clear lower checks');
  assert.equal(saved().previousCritique, 'No');
});
test('critique reference boxes sit under their statements, autosave and safely open links; redundant summary is absent', async () => {
  const f = fixture({ page: 'internal', data: { standardNumber: '14998', standardTitle: 'Old imported title',
    internal: JSON.stringify({ moderatorReportLink: 'https://example.test/report' }) } });
  await flush();
  assert.equal(f.host.find(child => child.tag === 'p' && child.textContent === '14998 · Old imported title'), undefined);
  for (const key of ['moderatorReport', 'conditions', 'externalFeedback', 'previousCritique']) {
    const control = f.host.find(child => child.attrs.id === 'moderation-internal-' + key + 'Link');
    assert.equal(control.type, 'url');
    assert.equal(control.parentElement.parentElement.tag, 'th');
    const link = control.parentElement.parentElement.children.find(child => child.tag === 'a');
    control.value = 'https://example.test/' + key; control.events.input();
    assert.equal(JSON.parse(f.host.find(child => child.attrs.name === 'internal').value)[key + 'Link'], control.value);
    assert.equal(link.attrs.href, control.value);
    assert.equal(link.hidden, false);
    assert.equal(link.attrs.rel, 'noopener noreferrer');
    control.value = 'javascript:alert(1)'; control.events.input();
    assert.equal(link.hidden, true);
    assert.equal(link.attrs.href, undefined);
    control.value = ''; control.events.input();
    assert.equal(link.hidden, true);
  }
});
test('Teacher in Charge lists frequent staff above a divider and repeats them in surname order; selection triggers autosave', async () => {
  const staff = [{ id: '1', name: 'Zoe Adams (ZAD)', uses: 1 }, { id: '2', name: 'Amy Jones (AJO)', uses: 4 },
    { id: '3', name: 'Ben Smith (BSM)', uses: 0 }];
  const f = fixture({ staff, data: { teacher: 'Zoe Adams (ZAD)' } }); await flush();
  const select = f.host.find(child => child.attrs.id === 'moderation-teacher');
  assert.equal(select.tag, 'select'); assert.equal(select.value, staff[0].name);
  const groups = select.children.filter(child => child.tag === 'optgroup');
  assert.deepEqual(groups.map(group => group.attrs.label), ['Most used by me', 'All current staff']);
  assert.deepEqual(groups[0].children.map(option => option.value), [staff[1].name, staff[0].name]);
  assert.deepEqual(groups[1].children.map(option => option.value), staff.map(person => person.name));
  assert.equal(select.children[2].tag, 'hr');
  const inputs = [];
  f.host.addEventListener('input', () => inputs.push(f.host.find(child => child.attrs.name === 'teacher').value));
  select.value = staff[1].name; select.events.change();
  assert.deepEqual(inputs, [staff[1].name]);
  assert.equal(f.host.find(child => child.attrs.name === 'teacher').value, staff[1].name);
});
test('record field labels and order use department, subject, course code and singular Assessor with name default', async () => {
  const f = fixture(); await flush();
  const labels = f.host.all().filter(child => child.tag === 'label').map(child => child.textContent);
  assert.deepEqual(labels.slice(0, 6), ['Assessment / record title', 'Faculty / Department', 'Subject', 'Course Code', 'Teacher in charge', 'Assessor']);
  assert.equal(f.host.find(child => child.attrs.id === 'moderation-assessors').value, 'Synthetic Teacher');
  assert.equal(f.host.find(child => child.attrs.name === 'assessors').value, 'Synthetic Teacher');
  const saved = fixture({ data: { assessors: 'Recorded assessor' } }); await flush();
  assert.equal(saved.host.find(child => child.attrs.name === 'assessors').value, 'Recorded assessor');
  const email = fixture({ displayName: 'teacher@example.test' }); await flush();
  assert.equal(email.host.find(child => child.attrs.name === 'assessors').value, '');
});
test('empty and incorrect saved versions reconcile to the PDF; level/version share one lookup', async () => {
  const f = fixture(); await flush();
  assert.equal(f.host.find(child => child.attrs.id === 'moderation-version').value, '2');
  assert.equal(f.host.find(child => child.attrs.name === 'version').value, '2');
  assert.equal(f.calls.filter(call => call[0] === 'request' && call[1] === 'standards/99999/details').length, 1);
  const saved = fixture({ data: { version: '1', level: '3' } }); await flush();
  assert.equal(saved.host.find(child => child.attrs.name === 'version').value, '2');
  assert.equal(saved.host.find(child => child.attrs.id === 'moderation-version').value, '2');
  assert.equal(saved.calls.filter(call => call[1] === 'standards/99999/details').length, 1);
});
test('imported versions never replace the NZQA version in any form', async () => {
  for (const page of ['internal', 'schedule', 'feedback', 'coversheet']) {
    const f = fixture({ page, data: { version: '5' },
      importResult: { common: { standardNumber: '99999', version: '7' }, document: {}, warning: '' } });
    await flush();
    assert.equal(f.host.find(n => n.attrs.name === 'version').value, '2');
    await f.click('Choose existing document and import its form data');
    assert.equal(f.saved.at(-1).version, '2');
    if (page === 'feedback') {
      const version = f.host.find(n => n.attrs.id === 'moderation-feedback-details-version');
      assert.equal(version.value, '2'); assert.equal(version.readOnly, true);
    }
  }
});
test('failed PDF version verification preserves saved data and prevents all document syncs', async () => {
  for (const page of ['internal', 'schedule', 'feedback', 'coversheet']) {
    const f = fixture({ page, data: { version: '5' }, standardRequest: async () => { throw new Error('NZQA unavailable'); } });
    await flush();
    await f.click('Create / update Google Drive document');
    assert.equal(f.host.find(n => n.attrs.name === 'version').value, '5');
    assert.equal(f.calls.filter(c => ['upload', 'binary'].includes(c[0])).length, 0);
    assert.ok(f.host.find(n => n.attrs.role === 'alert' && n.textContent.includes('NZQA unavailable')));
  }
});
test('record creation does not write database records when folder preparation or PDF metadata fails', async () => {
  const f = fixture({ id: '' }); await flush();
  f.access.ensureAssessmentFolders = async () => { throw new Error('Drive folders unavailable'); };
  f.host.find(child => child.attrs.id === 'moderation-new-standard').value = '99999';
  await f.click('Create moderation record');
  assert.equal(f.calls.some(call => call[0] === 'mutate'), false);
  assert.ok(f.host.find(child => child.attrs.role === 'alert' && child.textContent === 'Drive folders unavailable'));
  const noFolder = fixture({ id: '', data: { folderId: '' } }); await flush();
  noFolder.host.find(child => child.attrs.id === 'moderation-new-standard').value = '99999';
  await noFolder.click('Create moderation record');
  assert.equal(noFolder.calls.some(call => call[0] === 'mutate'), false);
  assert.equal(noFolder.calls.some(call => call[0] === 'authorize'), false);
});
test('staff loading preserves imported names, reports failures and allows retry without overwriting changes', async () => {
  let fail = true, resolve;
  const f = fixture({ data: { teacher: 'Former teacher' }, staffRequest: () => {
    if (fail) throw new Error('Staff service unavailable');
    return new Promise(done => { resolve = done; });
  } }); await flush();
  const select = f.host.find(child => child.attrs.id === 'moderation-teacher');
  const status = f.host.find(child => child.attrs.id === 'moderation-teacher-status');
  assert.equal(select.value, 'Former teacher');
  assert.equal(status.attrs.role, 'alert'); assert.match(status.textContent, /unavailable/);
  fail = false;
  const loading = f.click('Refresh staff list');
  assert.equal(select.disabled, true);
  f.host.find(child => child.attrs.name === 'teacher').value = 'Newly imported teacher';
  resolve({ staff: [{ id: '1', name: 'Current teacher', uses: 0 }], departments: [] }); await loading;
  assert.equal(select.value, 'Newly imported teacher');
  assert.ok(select.children.some(child => child.value === 'Newly imported teacher'));
  assert.equal(select.disabled, false); assert.equal(status.attrs.role, 'status');
  assert.equal(select.children.some(child => child.tag === 'hr'), false);
});
test('empty Kamar staff list explains how to fix it and leaves the saved teacher unchanged', async () => {
  const f = fixture({ data: { teacher: 'Saved teacher' } }); await flush();
  assert.equal(f.host.find(child => child.attrs.id === 'moderation-teacher').value, 'Saved teacher');
  assert.match(f.host.find(child => child.attrs.id === 'moderation-teacher-status').textContent, /No current staff.*Kamar Uploader/);
});
test('department selection fills the leader, permits override and preserves saved student data without a name control', async () => {
  const departments = [{ name: 'Science', teacher: 'Rachel Wastney (RWA)', leaders: [] },
    { name: 'Technology', teacher: 'Vanessa Pringle (VPR)', leaders: [] }, { name: 'Unknown leadership', teacher: '', leaders: [] }];
  const f = fixture({ departments, data: { studentName: 'Existing learner', studentId: 'TEST-001', department: 'Science', teacher: 'My override' } }); await flush();
  const department = f.host.find(child => child.attrs.id === 'moderation-department');
  const teacher = f.host.find(child => child.attrs.id === 'moderation-teacher');
  assert.equal(department.tag, 'select'); assert.equal(department.value, 'Science');
  assert.equal(teacher.value, 'My override');
  assert.equal(f.host.find(child => child.attrs.id === 'moderation-studentName'), undefined);
  assert.equal(f.host.find(child => child.attrs.name === 'studentName').value, 'Existing learner');
  assert.equal(f.host.find(child => child.attrs.id === 'moderation-studentId'), undefined);
  assert.equal(f.host.find(child => child.attrs.name === 'studentId').value, 'TEST-001');
  const changes = [];
  f.host.addEventListener('input', () => changes.push(true));
  department.value = 'Technology'; department.events.change();
  assert.equal(teacher.value, 'Vanessa Pringle (VPR)');
  assert.equal(f.host.find(child => child.attrs.name === 'teacher').value, 'Vanessa Pringle (VPR)');
  assert.equal(f.host.find(child => child.attrs.name === 'department').value, 'Technology');
  assert.equal(changes.length, 2);
  department.value = 'Unknown leadership'; department.events.change();
  assert.equal(teacher.value, 'Vanessa Pringle (VPR)');
  assert.match(f.host.find(child => child.attrs.id === 'moderation-department-status').textContent, /No single available leader/);
});
test('saved department prepopulates only an empty teacher; saved unknown departments survive refresh', async () => {
  const f = fixture({ departments: [{ name: 'Technology', teacher: 'Vanessa Pringle (VPR)', leaders: [] }],
    data: { department: 'Technology' } }); await flush();
  assert.equal(f.host.find(child => child.attrs.name === 'teacher').value, 'Vanessa Pringle (VPR)');
  const unknown = fixture({ data: { department: 'Former department', teacher: 'Saved teacher' } }); await flush();
  assert.equal(unknown.host.find(child => child.attrs.id === 'moderation-department').value, 'Former department');
  assert.equal(unknown.host.find(child => child.attrs.name === 'teacher').value, 'Saved teacher');
});
test('existing records fill an empty level from NZQA and expose retry on failures', async () => {
  const f = fixture({ data: { standardNumber: '99999' } }); await flush();
  const level = f.host.find(child => child.attrs.id === 'moderation-level');
  assert.equal(level.readOnly, true); assert.equal(level.value, '3');
  assert.equal(f.host.find(child => child.attrs.name === 'level').value, '3');
  let failed = true;
  const retry = fixture({ data: { standardNumber: '99999' }, standardRequest: () => {
    if (failed) throw new Error('NZQA unavailable');
    return { number: '99999', level: '2', version: '2' };
  } }); await flush();
  assert.equal(retry.host.find(child => child.attrs.name === 'level').value, '');
  assert.ok(retry.host.find(child => child.attrs.role === 'alert' && child.textContent === 'NZQA unavailable'));
  failed = false; await retry.click('Retry standard level');
  assert.equal(retry.host.find(child => child.attrs.name === 'level').value, '2');
});
test('old My Standards without levels are resolved before creating a moderation record', async () => {
  const f = fixture({ id: '', selectedLevel: '' }); await flush();
  const standard = f.host.find(child => child.tag === 'select');
  standard.value = '99999'; await f.click('Create moderation record');
  const mutation = f.calls.find(call => call[0] === 'mutate');
  assert.equal(mutation[2].content.level, '3'); assert.equal(mutation[2].content.version, '2');
  const failed = fixture({ id: '', selectedLevel: '', standardRequest: () => ({}) }); await flush();
  failed.host.find(child => child.tag === 'select').value = '99999';
  await failed.click('Create moderation record');
  assert.equal(failed.calls.some(call => call[0] === 'mutate'), false);
  assert.ok(failed.host.find(child => child.attrs.role === 'alert' && child.textContent.includes('NZQA did not return the level')));
});
test('moderation hub selects a teacher-specific folder and creates a database record from My Standards', async () => {
  const setup = fixture({ id: '', setupOnly: true }); await flush();
  setup.chosen = { id: 'folder_id_123' };
  await setup.click('Choose my Assessment / Moderation folder');
  assert.equal(setup.saved.at(-1).folderId, 'folder_id_123');
  assert.ok(setup.calls.some(call => call[0] === 'folders' && call[1] === 'folder_id_123' && call[2] === undefined));
  assert.equal(setup.host.find(n => n.textContent === 'Create moderation record'), undefined);
  assert.equal(setup.host.find(n => n.attrs.class === 'moderation-tabs'), undefined);
  assert.equal(setup.host.all().filter(n => n.attrs.name).length, 0, 'personal setup fields cannot enter school-wide form submissions');
  const f = fixture({ id: '' }); await flush();
  assert.equal(f.host.find(n => n.textContent === 'Choose my Assessment / Moderation folder'), undefined);
  assert.equal(f.host.find(child => child.attrs.id === 'moderation-new-title'), undefined);
  await f.click('Create moderation record');
  assert.equal(f.calls.some(([action]) => action === 'mutate'), false, 'a standard must be chosen');
  f.host.find(child => child.attrs['aria-label'] === 'Use a standard from My Standards').value = '99999';
  await f.click('Create moderation record');
  const mutation = f.calls.find(([action]) => action === 'mutate');
  assert.match(mutation[1], /^2026\/moderation\/[0-9a-f-]+$/);
  assert.equal(mutation[2].content.subject, 'Biology');
  assert.equal(mutation[2].content.standardNumber, '99999');
  assert.equal(mutation[2].content.title, '99999 — Example Biology standard');
  assert.equal(mutation[2].content.folderId, 'folder_id_123');
  assert.equal(mutation[2].content.assessors, 'Synthetic Teacher');
  assert.ok(f.calls.some(call => call[0] === 'folders' && call[2] === '3' && call[3] === '99999'));
  assert.equal(mutation[2].revision, 0);
  assert.equal(f.navigation[0][1], 'overview');
});
test('separate document forms retain other forms and serialize editable evidence and supporting notes', async () => {
  const f = fixture({ page: 'schedule', data: { feedback: JSON.stringify({ feedback: 'Keep this feedback' }) } });
  await flush();
  const achieved = f.host.find(child => child.attrs.id === 'moderation-schedule-achieved');
  achieved.value = 'Biology achievement requirement'; achieved.events.input();
  await f.click('Add requirement');
  const evidence = f.host.find(child => child.attrs.id === 'moderation-schedule-0-evidence');
  evidence.value = 'Synthetic evidence'; evidence.events.input();
  const notes = f.host.find(child => child.attrs.id === 'moderation-schedule-notes');
  notes.value = 'Evidence link notes'; notes.events.input();
  await f.click('Create / update Google Drive document');
  const uploaded = f.calls.find(([action]) => action === 'upload');
  assert.equal(uploaded[1].id, undefined, 'first save creates a file');
  assert.equal(uploaded[1].folderId, 'standard_folder_123');
  assert.equal(uploaded[1].properties.plannerRecord, record);
  assert.deepEqual(JSON.parse(f.saved.at(-1).feedback), { feedback: 'Keep this feedback',
    markingScheduleLink: 'Marking Schedule | https://drive.google.com/file/d/pdf_document_123/view' });
  const saved = JSON.parse(f.saved.at(-1).schedule);
  assert.equal(saved.requirements[0].evidence, 'Synthetic evidence');
  assert.equal(saved.notes, 'Evidence link notes');
  assert.equal(JSON.parse(f.saved.at(-1).driveDocuments).schedule.id, 'document_id_123');
  assert.equal(f.host.children[0].inert, false);
  await f.click('Create / update Google Drive document');
  assert.equal(f.calls.filter(([action]) => action === 'upload').at(-1)[1].id, 'document_id_123', 'later saves update the linked file');
});
test('existing document import fills database forms and requires a separate explicit Drive update', async () => {
  const f = fixture({ page: 'feedback' }); await flush();
  await f.click('Choose existing document and import its form data');
  assert.equal(f.saved.at(-1).studentName, 'Synthetic learner');
  assert.equal(JSON.parse(f.saved.at(-1).feedback).feedback, 'Imported comment');
  assert.equal(JSON.parse(f.saved.at(-1).driveDocuments).feedback.id, 'document_id_123');
  assert.equal(f.calls.filter(([action]) => action === 'upload').length, 0);
  assert.equal(f.host.find(child => child.attrs.id === 'moderation-feedback-feedback'), undefined, 'legacy comments stay stored, not displayed');
  assert.equal(f.host.find(child => child.attrs.id === 'moderation-feedback-details-studentName').value, 'Synthetic learner');
  assert.ok(f.host.find(child => child.textContent.includes('Future syncs will update')));
});
test('failed database save and missing Drive files never silently create a new document', async () => {
  const failed = fixture({ page: 'feedback', saveFails: true }); await flush();
  await failed.click('Create / update Google Drive document');
  assert.equal(failed.calls.filter(([action]) => action === 'upload').length, 0);
  assert.ok(failed.host.find(child => child.attrs.role === 'alert' && /not saved/.test(child.textContent)));
  const missing = fixture({ page: 'feedback', data: { driveDocuments: JSON.stringify({
    feedback: { id: 'document_id_123', name: 'Missing file', mimeType: 'application/vnd.google-apps.document' }
  }) } });
  await flush(); missing.missing = true;
  await missing.click('Create / update Google Drive document');
  assert.equal(missing.calls.filter(([action]) => action === 'upload').length, 0);
  assert.ok(missing.host.find(child => child.attrs.role === 'alert' && /missing/.test(child.textContent)));
});

test('source of materials tick boxes autosave and a compact source box has an assessment Drive chooser beside it', async () => {
  const f = fixture({ page: 'internal', data: { internal: JSON.stringify({ sourceTypes: 'NZQA', source: 'Existing note' }) } });
  await flush();
  const box = option => f.host.find(child => child.attrs.id === 'moderation-internal-sourceTypes-' + option);
  assert.equal(box('nzqa').checked, true);
  assert.equal(box('commercial').checked, false);
  assert.ok(box('subject-association'));
  box('commercial').checked = true; box('commercial').events.change();
  assert.equal(JSON.parse(f.host.find(child => child.attrs.name === 'internal').value).sourceTypes, 'Commercial, NZQA');
  const source = f.host.find(child => child.attrs.id === 'moderation-internal-source');
  assert.equal(source.rows, 2);
  assert.equal(source.value, 'Existing note');
  const mounted = f.calls.find(call => call[0] === 'mount' && call[1].resources === source);
  assert.ok(mounted, 'Drive chooser is linked to the source box');
  assert.equal(mounted[1].label, 'Link assessment from Google Drive');
  assert.equal(source.parent.parent.attrs.class, 'moderation-source');
  assert.equal(source.hidden, true, 'link addresses are hidden by default');
  source.value = 'Assessment task.pdf | https://drive.google.com/file/d/abc123/view\nTeacher-written task'; source.events.input();
  assert.equal(JSON.parse(f.host.find(child => child.attrs.name === 'internal').value).source, source.value);
  const list = f.host.find(child => child.attrs.class === 'moderation-source-links');
  assert.equal(list.children[0].children[0].textContent, 'Assessment task.pdf');
  assert.equal(list.children[0].children[0].attrs.href, 'https://drive.google.com/file/d/abc123/view');
  assert.equal(list.children[1].textContent, 'Teacher-written task');
  assert.ok(!list.all().some(child => child.textContent.includes('drive.google.com')), 'address is not shown as text');
  await f.click('Edit source details');
  assert.equal(source.hidden, false);
  await f.click('Hide link addresses');
  assert.equal(source.hidden, true);
});
