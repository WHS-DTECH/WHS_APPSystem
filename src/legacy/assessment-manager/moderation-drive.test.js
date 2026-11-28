const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const express = require('express');
const { createModuleRouter } = require('./app');
const source = fs.readFileSync(require.resolve('./public/google-drive.js'), 'utf8');
const config = { configured: true, clientId: 'client', apiKey: 'key', appId: '123',
  scope: 'https://www.googleapis.com/auth/drive' };
test('Picker page overrides inherited no-referrer without changing API or anonymous response policies', async t => {
  const app = express();
  let user = { roles: ['Teacher'] };
  app.use((req, res, next) => {
    res.set('Referrer-Policy', 'no-referrer');
    req.user = user;
    req.session = {};
    next();
  });
  app.use('/module', createModuleRouter({ env: {} }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/module/`;
  const shell = await fetch(base);
  assert.equal(shell.status, 200);
  assert.equal(shell.headers.get('referrer-policy'), 'strict-origin');
  const api = await fetch(base + 'api/moderation/google-drive/config');
  assert.equal(api.status, 200);
  assert.equal(api.headers.get('referrer-policy'), 'no-referrer');
  user = undefined;
  const anonymous = await fetch(base);
  assert.equal(anonymous.status, 401);
  assert.equal(anonymous.headers.get('referrer-policy'), 'no-referrer');
});
function fixture() {
  const calls = [], pickerCalls = [];
  let options, callback, response = () => new Response(JSON.stringify({ id: 'document_id_123', name: 'Synthetic file' }), {
    headers: { 'content-type': 'application/json', etag: '"revision-1"' }
  });
  const picker = {
    Feature: { MULTISELECT_ENABLED: 'multiselect' },
    Action: { PICKED: 'picked', CANCEL: 'cancel' }, ViewId: { FOLDERS: 'folders', DOCS: 'docs' },
    DocsView: class {
      constructor(type) { pickerCalls.push(['view', type]); }
      setIncludeFolders(value) { pickerCalls.push(['includeFolders', value]); return this; }
      setSelectFolderEnabled(value) { pickerCalls.push(['selectFolder', value]); return this; }
      setParent(value) { pickerCalls.push(['parent', value]); return this; }
      setMimeTypes(value) { pickerCalls.push(['mimeTypes', value]); return this; }
    },
    PickerBuilder: class {
      setTitle() { return this; }
      setDeveloperKey() { return this; }
      setAppId() { return this; }
      setOAuthToken() { return this; }
      setOrigin() { return this; }
      addView() { return this; }
      setCallback(fn) { callback = fn; return this; }
      enableFeature(value) { pickerCalls.push(['feature', value]); return this; }
      build() { return this; }
      setVisible() {}
      dispose() { pickerCalls.push(['dispose']); }
    }
  };
  const context = {
    Blob, URL, URLSearchParams, AbortSignal, crypto, setTimeout, clearTimeout, Date,
    console: { error: () => {} }, location: { origin: 'https://planner.example.test' },
    google: { picker, accounts: { oauth2: { hasGrantedAllScopes: (result, scope) => calls.push(['granted', scope]) && !result.missingScope, initTokenClient(value) {
      options = value;
      return { requestAccessToken(value) { calls.push(['authorize', value]); options.callback({ access_token: 'synthetic-token', expires_in: 3600, scope: options.scope, missingScope: context.missingScope }); } };
    } } } },
    gapi: { load: (_name, handlers) => handlers.callback() },
    fetch: async (url, init) => { calls.push(['fetch', url, init]); return response(); }
  };
  vm.runInNewContext(source, context);
  return { calls, pickerCalls, context,
    prepare: () => context.plannerGoogleDrive.prepareDocumentAccess(async () => config),
    get options() { return options; }, get callback() { return callback; },
    set response(value) { response = value; } };
}
test('moderation Drive reuses setup credentials with full Drive access and separate folder/document pickers', async () => {
  const f = fixture(), access = await f.prepare();
  assert.equal(f.calls.length, 0, 'rendering never starts OAuth automatically');
  assert.equal(f.options.scope, 'https://www.googleapis.com/auth/drive');
  assert.equal(require('./googleDrive').pickerConfiguration({ GOOGLE_DRIVE_CLIENT_ID: 'c', GOOGLE_DRIVE_API_KEY: 'k',
    GOOGLE_DRIVE_APP_ID: '1' }).scope, 'https://www.googleapis.com/auth/drive');
  assert.equal(f.options.include_granted_scopes, false);
  f.context.missingScope = true;
  await assert.rejects(access.authorize(), /existing moderation folders can be found/);
  f.context.missingScope = false;
  await access.authorize();
  assert.equal(f.calls[0][1].prompt, 'select_account');
  const folder = access.choose(true);
  f.callback({ action: 'picked', docs: [{ id: 'folder_id_123' }] });
  assert.equal((await folder).id, 'folder_id_123');
  assert.ok(f.pickerCalls.some(([key, value]) => key === 'selectFolder' && value === true));
  assert.ok(f.pickerCalls.some(([key, value]) => key === 'mimeTypes' && value === 'application/vnd.google-apps.folder'));
  const doc = access.choose();
  f.callback({ action: 'cancel' });
  assert.equal(await doc, null);
  assert.ok(f.pickerCalls.some(([key, value]) => key === 'mimeTypes' && value.includes('wordprocessingml')));
});
test('PDF picker support is opt-in and never alters folder or default document filters', async () => {
  const f = fixture(), access = await f.prepare();
  for (const [folder, allowPdf, expected] of [
    [false, true, 'application/vnd.google-apps.document,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf'],
    [false, false, 'application/vnd.google-apps.document,application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    [true, true, 'application/vnd.google-apps.folder']
  ]) {
    const selection = access.choose(folder, allowPdf);
    assert.equal(f.pickerCalls.filter(([key]) => key === 'mimeTypes').at(-1)[1], expected);
    f.callback({ action: 'cancel' });
    assert.equal(await selection, null);
  }
});
test('resource picker accepts all file types and multiple files without changing document or folder pickers', async () => {
  const f = fixture(), access = await f.prepare();
  const files = Array.from({ length: 12 }, (_, i) => ({ id: 'resource_file_' + i }));
  const selected = access.chooseFiles();
  assert.equal(f.pickerCalls.some(([key]) => key === 'mimeTypes'), false);
  assert.ok(f.pickerCalls.some(([key, value]) => key === 'feature' && value === 'multiselect'));
  f.callback({ action: 'picked', docs: files });
  assert.deepEqual(await selected, files);
  const featureCount = f.pickerCalls.filter(([key]) => key === 'feature').length;
  const single = access.chooseFiles(false);
  f.callback({ action: 'picked', docs: [files[0]] });
  assert.deepEqual(await single, [files[0]]);
  assert.equal(f.pickerCalls.filter(([key]) => key === 'feature').length, featureCount);
  const cancelled = access.chooseFiles();
  f.callback({ action: 'cancel' }); assert.equal(await cancelled, null);
  const invalid = access.chooseFiles();
  f.callback({ action: 'picked', docs: [files[0], {}] });
  await assert.rejects(invalid, /did not return/);
  const document = access.choose();
  assert.equal(f.pickerCalls.filter(([key]) => key === 'mimeTypes').at(-1)[1],
    'application/vnd.google-apps.document,application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  f.callback({ action: 'picked', docs: [files[0]] });
  assert.equal((await document).id, files[0].id);
  assert.equal(f.pickerCalls.filter(([key]) => key === 'feature').length, featureCount + 2);
});
test('PDF sync exports the Google document and uploads PDF bytes to a stable file ID', async () => {
  const f = fixture(), access = await f.prepare(); await access.authorize();
  f.response = () => f.calls.at(-1)[1].includes('/export?') ?
    new Response('PDF bytes', { headers: { 'content-type': 'application/pdf' } }) :
    new Response(JSON.stringify({ id: 'pdf_document_123', name: 'Assessment.pdf', mimeType: 'application/pdf' }));
  await access.savePdf({ id: 'document_id_123', mimeType: 'application/vnd.google-apps.document' }, {
    id: 'pdf_document_123', name: 'Assessment.pdf', folderId: 'student_folder_123',
    properties: { plannerDocument: 'feedback-pdf' }, etag: '"pdf-revision"'
  });
  const fetches = f.calls.filter(c => c[0] === 'fetch');
  assert.match(fetches[0][1], /document_id_123\/export\?mimeType=application%2Fpdf/);
  assert.match(fetches[1][1], /upload\/drive\/v3\/files\/pdf_document_123/);
  assert.equal(fetches[1][2].method, 'PATCH');
  assert.equal(fetches[1][2].headers['If-Match'], '"pdf-revision"');
  const body = await fetches[1][2].body.text();
  assert.match(body, /Content-Type: application\/pdf/);
  assert.match(body, /PDF bytes/);
  assert.doesNotMatch(body, /wordprocessingml/);
});
test('DOCX PDF sync converts a temporary Google Doc and trashes it even when export fails', async () => {
  for (const fail of [false, true]) {
    const f = fixture(), access = await f.prepare(); await access.authorize();
    f.response = () => {
      const url = f.calls.at(-1)[1];
      if (url.includes('/export?')) return fail ? new Response('{}', { status: 403 }) : new Response('PDF bytes');
      return new Response(JSON.stringify({ id: 'temporary_doc_123', mimeType: 'application/vnd.google-apps.document' }));
    };
    const action = access.savePdf({ id: 'word_document_123', name: 'Word.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
      { documentBlob: new Blob(['Word bytes']), name: 'Word.pdf', folderId: 'student_folder_123', properties: {} });
    if (fail) await assert.rejects(action, /HTTP 403/); else await action;
    const last = f.calls.at(-1);
    assert.match(last[1], /files\/temporary_doc_123/);
    assert.equal(last[2].body, '{"trashed":true}');
  }
});
test('moderation uploads original DOCX layouts as converted Google Docs and updates the same ID conditionally', async () => {
  const f = fixture(), access = await f.prepare(); await access.authorize();
  const blob = new Blob(['synthetic-docx-content']);
  const options = { name: 'Synthetic assessment', folderId: 'folder_id_123', properties: { plannerRecord: 'record-uuid', plannerDocument: 'internal' } };
  await access.upload(blob, options);
  let [, url, init] = f.calls.at(-1);
  assert.match(url, /^https:\/\/www\.googleapis\.com\/upload\/drive\/v3\/files\?/);
  assert.equal(init.method, 'POST');
  assert.equal(init.headers.Authorization, 'Bearer synthetic-token');
  const body = await init.body.text();
  assert.match(body, /application\/vnd\.google-apps\.document/);
  assert.match(body, /"parents":\["folder_id_123"\]/);
  assert.match(body, /wordprocessingml\.document/);
  assert.match(body, /synthetic-docx-content/);
  const metadata = await access.metadata('document_id_123');
  assert.equal(metadata.etag, '"revision-1"');
  await access.upload(blob, { ...options, id: metadata.id, etag: metadata.etag });
  [, url, init] = f.calls.at(-1);
  assert.match(url, /\/files\/document_id_123\?/);
  assert.equal(init.method, 'PATCH');
  assert.equal(init.headers['If-Match'], '"revision-1"');
  assert.doesNotMatch(await init.body.text(), /"parents"/, 'updating never moves existing documents');
});
test('moderation recovers created file links by per-record properties and rejects ambiguous duplicates', async () => {
  const f = fixture(), access = await f.prepare(); await access.authorize();
  f.response = () => new Response(JSON.stringify({ files: [{ id: 'document_id_123' }] }));
  assert.equal((await access.find('folder_id_123', { plannerRecord: 'record-uuid', plannerDocument: 'feedback' })).id, 'document_id_123');
  const query = new URL(f.calls.at(-1)[1]).searchParams.get('q');
  assert.match(query, /'folder_id_123' in parents/);
  assert.match(query, /key='plannerRecord' and value='record-uuid'/);
  f.response = () => new Response(JSON.stringify({ files: [{ id: 'first' }, { id: 'second' }] }));
  await assert.rejects(access.find('folder_id_123', { plannerRecord: 'record-uuid' }), /More than one/);
});
test('moderation Drive errors are explicit, expire invalid tokens and never retry uncertain creates', async () => {
  const f = fixture(), access = await f.prepare(); await access.authorize();
  f.response = () => new Response('{}', { status: 404 });
  await assert.rejects(access.metadata('document_id_123'), /missing or this Google account/);
  f.response = () => new Response('{}', { status: 401 });
  await assert.rejects(access.upload(new Blob(['test']), { name: 'test', folderId: 'folder_id_123', properties: {} }), /HTTP 401/);
  assert.equal(f.calls.filter(([key, , init]) => key === 'fetch' && init.method === 'POST').length, 1);
  await assert.rejects(access.metadata('document_id_123'), /access expired/);
  assert.throws(() => access.metadata('../bad'), /valid Google Drive/);
});
test('assessment hierarchy creates all levels and a numbered standard folder, then reuses them', async () => {
  const f = fixture(), access = await f.prepare(); await access.authorize();
  const folders = new Map();
  f.response = () => {
    const [, url, init] = f.calls.at(-1);
    if (init.method === 'POST') {
      const body = JSON.parse(init.body);
      assert.equal(body.mimeType, 'application/vnd.google-apps.folder');
      const id = 'new_folder_' + (folders.size + 1), folder = { id, name: body.name };
      folders.set(body.parents[0] + '/' + body.name, folder);
      return new Response(JSON.stringify(folder));
    }
    const q = new URL(url).searchParams.get('q');
    const parent = q.match(/'([\w-]+)' in parents/)[1], name = q.match(/name='([^']+)'/)[1];
    const folder = folders.get(parent + '/' + name);
    return new Response(JSON.stringify({ files: folder ? [folder] : [] }));
  };
  const result = await access.ensureAssessmentFolders('parent_folder_123', '3', '29785');
  assert.equal(result.name, '29785');
  assert.deepEqual([...folders.keys()], ['parent_folder_123/Level 1', 'parent_folder_123/Level 2', 'parent_folder_123/Level 3', 'new_folder_3/29785']);
  assert.equal(f.calls.filter(call => call[2]?.method === 'POST').length, 4);
  assert.equal((await access.ensureAssessmentFolders('parent_folder_123', '3', '29785')).id, result.id);
  assert.equal(f.calls.filter(call => call[2]?.method === 'POST').length, 4, 'no duplicate folder creates');
  await access.ensureAssessmentFolders('parent_folder_123');
  assert.equal(f.calls.filter(call => call[2]?.method === 'POST').length, 4);
  for (const [index, name] of [[0, 'Student A'], [1, 'Student B'], [25, 'Student Z'], [26, 'Student AA'], [49, 'Student AX']]) {
    const student = await access.ensureStudentFolder(result.id, index);
    assert.equal(student.name, name);
    assert.equal((await access.ensureStudentFolder(result.id, index)).id, student.id);
    assert.ok(folders.has(result.id + '/' + name));
  }
  assert.equal(f.calls.filter(call => call[2]?.method === 'POST').length, 9, 'student folders are reused');
  await assert.rejects(access.ensureStudentFolder(result.id, -1), /valid moderation entry/);
  await assert.rejects(access.ensureStudentFolder(result.id, 50), /valid moderation entry/);
  await assert.rejects(access.ensureStudentFolder(result.id, 'TV'), /valid moderation entry/);
  await assert.rejects(access.ensureAssessmentFolders('parent_folder_123', '4', '29785'), /Level 1, 2 or 3/);
});
test('additional student folders use readable names and stable record identity, including legacy folders', async () => {
  const f = fixture(), access = await f.prepare(); await access.authorize();
  const first = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', second = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const legacyRecord = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const unmatched = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const unverified = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  const fallback = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  const folders = [{ id: 'additional_root_123', name: 'Additional Student Marking', parents: ['standard_folder_123'] },
    { id: 'legacy_folder_123', name: legacyRecord, parents: ['additional_root_123'], appProperties: { retained: 'yes' } },
    { id: 'unverified_folder_123', name: unverified, parents: ['additional_root_123'] },
    { id: 'fallback_folder_123', name: fallback, parents: ['additional_root_123'] },
    { id: 'unlinked_folder_123', name: 'Student - ZZ', parents: ['additional_root_123'] }];
  f.response = () => {
    const [, raw, init] = f.calls.at(-1), url = new URL(raw);
    if (init.method === 'POST') {
      const body = JSON.parse(init.body);
      const folder = { ...body, id: 'created_folder_' + folders.length };
      folders.push(folder); return new Response(JSON.stringify(folder));
    }
    if (init.method === 'PATCH') {
      const folder = folders.find(item => url.pathname.endsWith('/' + item.id));
      assert.equal(init.headers['If-Match'], '"revision-1"');
      Object.assign(folder, JSON.parse(init.body));
      return new Response(JSON.stringify(folder));
    }
    const q = url.searchParams.get('q');
    if (!q) {
      const folder = folders.find(item => url.pathname.endsWith('/' + item.id));
      if (url.pathname.includes('/drive/v2/')) {
        return new Response(JSON.stringify({ id: folder.id, title: folder.name, mimeType: 'application/vnd.google-apps.folder',
          parents: folder.parents.map(id => ({ id })), labels: { trashed: false }, capabilities: { canEdit: true },
          version: '1', ...(folder.id === 'fallback_folder_123' ? { etag: '"revision-1"' } : {}) }));
      }
      return new Response(JSON.stringify({ ...folder, mimeType: 'application/vnd.google-apps.folder',
        version: '1', trashed: false, capabilities: { canEdit: true } }),
      { headers: ['unverified_folder_123', 'fallback_folder_123'].includes(folder.id) ? {} : { etag: '"revision-1"' } });
    }
    const parent = q.match(/'([\w-]+)' in parents/)[1];
    const name = q.match(/name='([^']+)'/)?.[1], record = q.match(/value='([^']+)'/)?.[1];
    const matches = folders.filter(folder => folder.parents.includes(parent) &&
      (name ? folder.name === name : folder.appProperties?.plannerStudentRecord === record));
    return new Response(JSON.stringify({ files: matches }));
  };
  const created = await access.ensureAdditionalStudentFolder('standard_folder_123', first, 'DT');
  assert.equal(created.name, 'Student - DT');
  assert.equal((await access.ensureAdditionalStudentFolder('standard_folder_123', first, 'DT')).id, created.id);
  const other = await access.ensureAdditionalStudentFolder('standard_folder_123', second, 'DT');
  assert.equal(other.name, 'Student - DT (bbbbbbbb)');
  assert.notEqual(other.id, created.id);
  const unlinked = await access.ensureAdditionalStudentFolder('standard_folder_123', unmatched, 'ZZ');
  assert.equal(unlinked.name, 'Student - ZZ (dddddddd)');
  assert.notEqual(unlinked.id, 'unlinked_folder_123', 'initials alone never identify a folder');
  const migrated = await access.ensureAdditionalStudentFolder('standard_folder_123', legacyRecord, 'XY');
  assert.equal(migrated.id, 'legacy_folder_123');
  assert.equal(migrated.name, 'Student - XY');
  assert.equal(migrated.appProperties.retained, 'yes');
  assert.equal(migrated.appProperties.plannerStudentRecord, legacyRecord);
  assert.equal((await access.ensureAdditionalStudentFolder('standard_folder_123', legacyRecord, 'XY')).id, migrated.id);
  assert.equal(f.calls.filter(call => call[2]?.method === 'PATCH').length, 1);
  const fallbackResult = await access.ensureAdditionalStudentFolder('standard_folder_123', fallback, 'FF');
  assert.equal(fallbackResult.name, 'Student - FF');
  assert.equal(fallbackResult.id, 'fallback_folder_123');
  folders.push({ id: 'duplicate_folder_123', name: 'Another folder', parents: ['additional_root_123'],
    appProperties: { plannerStudentRecord: first } });
  await assert.rejects(access.ensureAdditionalStudentFolder('standard_folder_123', first, 'DT'), /More than one folder is linked/);
  await assert.rejects(access.ensureAdditionalStudentFolder('standard_folder_123', unverified, 'UV'), /could not be safely verified/);
  assert.equal(f.calls.filter(call => call[2]?.method === 'PATCH').length, 2);
  await assert.rejects(access.ensureAdditionalStudentFolder('standard_folder_123', 'initials', 'DT'), /valid student marking record/);
  await assert.rejects(access.ensureAdditionalStudentFolder('standard_folder_123', first, ''), /valid student initials/);
});
test('assessment folder links list numeric standards under each level with pagination and numeric ordering', async () => {
  const f = fixture(), access = await f.prepare(); await access.authorize();
  f.response = () => {
    const url = new URL(f.calls.at(-1)[1]), q = url.searchParams.get('q');
    const level = q.match(/name='Level ([123])'/)?.[1];
    if (level) return new Response(JSON.stringify({ files: [{ id: 'level_folder_' + level, name: 'Level ' + level }] }));
    if (q.includes("'level_folder_3'")) {
      return new Response(JSON.stringify(url.searchParams.get('pageToken') ? { files: [{ id: 'standard_10000', name: '10000' }] } :
        { files: [{ id: 'standard_29785', name: '29785' }, { id: 'ignored_folder', name: 'Student A' }], nextPageToken: 'next' }));
    }
    return new Response('{"files":[]}');
  };
  const result = await access.assessmentFolderLinks('parent_folder_123');
  assert.equal(result.root, 'parent_folder_123');
  assert.equal(result.levels['1'].id, 'level_folder_1');
  assert.equal(result.levels['2'].standards.length, 0);
  assert.deepEqual(Array.from(result.levels['3'].standards, folder => folder.name), ['10000', '29785']);
  assert.equal(f.calls.filter(c => c[0] === 'fetch' && c[2].method === 'POST').length, 0);
  f.response = () => new Response('{}', { status: 403 });
  await assert.rejects(access.assessmentFolderLinks('parent_folder_123'), /HTTP 403/);
});
test('year and topic folders are reused and existing "Level N - standard" folders are linked without creating level folders', async () => {
  const f = fixture(), access = await f.prepare(); await access.authorize();
  const folders = new Map([
    ['parent_folder_123/2026', { id: 'year_folder_2026', name: '2026' }],
    ['year_folder_2026/Database', { id: 'database_folder', name: 'Database' }],
    ['year_folder_2026/Outcome & Process', { id: 'outcome_folder', name: 'Outcome & Process' }],
    ['database_folder/Level 3 - 91902', { id: 'standard_91902', name: 'Level 3 - 91902' }],
    ['database_folder/Level 2 - 29777', { id: 'standard_29777', name: 'Level 2 - 29777' }],
    ['database_folder/Level 2-91892', { id: 'standard_91892', name: 'Level 2-91892' }],
    ['database_folder/Notes', { id: 'notes_folder', name: 'Notes' }],
    ['outcome_folder/Level 2', { id: 'outcome_level_2', name: 'Level 2' }],
    ['outcome_level_2/91906', { id: 'standard_91906', name: '91906' }],
    ['outcome_level_2/Level 2 - 91907', { id: 'standard_91907', name: 'Level 2 - 91907' }],
    ['outcome_level_2/Level 3 - 91908', { id: 'wrong_level', name: 'Level 3 - 91908' }],
    ['outcome_level_2/Templates', { id: 'templates_folder', name: 'Templates' }]
  ]);
  let nextId = 0;
  f.response = () => {
    const [, url, init] = f.calls.at(-1);
    if (init.method === 'POST') {
      const body = JSON.parse(init.body);
      const folder = { id: 'nested_folder_' + (++nextId), name: body.name };
      folders.set(body.parents[0] + '/' + body.name, folder);
      return new Response(JSON.stringify(folder));
    }
    const query = new URL(url).searchParams.get('q');
    const parent = query.match(/'([\w-]+)' in parents/)[1];
    const named = query.match(/name='((?:[^'\\]|\\.)+)'/);
    const files = named
      ? [folders.get(parent + '/' + named[1].replace(/\\(.)/g, '$1'))].filter(Boolean)
      : [...folders.entries()].filter(([key]) => key.startsWith(parent + '/')).map(([, folder]) => folder);
    return new Response(JSON.stringify({ files }));
  };
  const posts = () => f.calls.filter(call => call[0] === 'fetch' && call[2].method === 'POST').length;
  assert.equal(await access.syncAssessmentYearFolders('parent_folder_123', 2030, []), null);
  const sync = await access.syncAssessmentYearFolders('parent_folder_123', 2026, ['database', 'Spreadsheet']);
  assert.equal(posts(), 0, 'sync only reads Drive');
  assert.deepEqual(JSON.parse(JSON.stringify(sync)), { topics: ['database', 'Spreadsheet', 'Outcome & Process'], links: {
    root: 'parent_folder_123', year: { id: 'year_folder_2026', name: '2026' }, topics: [
      { name: 'database', id: 'database_folder', standards: [{ id: 'standard_29777', level: '2', number: '29777' },
        { id: 'standard_91892', level: '2', number: '91892' }, { id: 'standard_91902', level: '3', number: '91902' }] },
      { name: 'Outcome & Process', id: 'outcome_folder', standards: [{ id: 'standard_91906', level: '2', number: '91906' },
        { id: 'standard_91907', level: '2', number: '91907' }] }] } });
  const synced = await access.assessmentYearFolderLinks('parent_folder_123', 2026, ['Database', 'Outcome & Process']);
  assert.equal(posts(), 0, 'existing year, topic and standard folders are linked without creating anything');
  assert.deepEqual(JSON.parse(JSON.stringify(synced.year)), { id: 'year_folder_2026', name: '2026' });
  assert.deepEqual(JSON.parse(JSON.stringify(synced.topics[0])), { name: 'Database', id: 'database_folder', standards: [
    { id: 'standard_29777', level: '2', number: '29777' }, { id: 'standard_91892', level: '2', number: '91892' },
    { id: 'standard_91902', level: '3', number: '91902' }] });
  assert.equal(synced.topics[1].standards.length, 2, 'standards inside hand-made Level folders are linked');
  assert.equal((await access.ensureTopicStandardFolder('outcome_folder', '2', '91906')).id, 'standard_91906');
  assert.equal((await access.ensureTopicStandardFolder('database_folder', '2', '91892')).id, 'standard_91892');
  assert.equal(posts(), 0);
  const created = await access.ensureTopicStandardFolder('database_folder', '1', '91880');
  assert.equal(created.name, 'Level 1 - 91880');
  assert.equal(posts(), 1);
  await assert.rejects(access.ensureTopicStandardFolder('database_folder', '4', '91880'), /Level 1, 2 or 3/);
  folders.set('database_folder/Level 2 - 91892', { id: 'duplicate_91892', name: 'Level 2 - 91892' });
  await assert.rejects(access.ensureTopicStandardFolder('database_folder', '2', '91892'), /More than one/);
  const nextYear = await access.assessmentYearFolderLinks('parent_folder_123', 2028, ['Database']);
  assert.equal(nextYear.year.name, '2028');
  assert.deepEqual(Array.from(nextYear.topics[0].standards), []);
  assert.equal(posts(), 3, 'a new year creates only its year and topic folders');
  assert.equal([...folders.keys()].some(key => key !== 'outcome_folder/Level 2' && /\/Level [123]$/.test(key)), false);
  await assert.rejects(access.assessmentYearFolderLinks('parent_folder_123', 2027, ['Database', 'database']), /unique/);
});
test('folder creation rejects duplicate matches and does not retry uncertain creates', async () => {
  const f = fixture(), access = await f.prepare(); await access.authorize();
  f.response = () => new Response(JSON.stringify({ files: [{ id: 'a' }, { id: 'b' }] }));
  await assert.rejects(access.ensureAssessmentFolders('parent_folder_123'), /More than one/);
  await assert.rejects(access.ensureStudentFolder('standard_folder_123', 0), /More than one/);
  f.response = () => f.calls.at(-1)[2].method === 'POST' ? new Response('{}', { status: 503 }) : new Response('{"files":[]}');
  await assert.rejects(access.ensureAssessmentFolders('parent_folder_123'), /HTTP 503/);
  assert.equal(f.calls.filter(call => call[2]?.method === 'POST').length, 1);
});
