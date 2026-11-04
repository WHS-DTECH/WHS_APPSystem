const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const session = require('express-session');
const { folderId, DRIVE_SCOPE, createAttendanceDriveRouter } = require('./attendanceDrive');
const { createGoogleCalendarRouter, configuration, encryptTokens, SCOPES } = require('./googleCalendar');
const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const folder = 'synthetic_folder_123';
const file = { id: 'synthetic_file_123', name: 'Attendance.pdf', mimeType: 'application/pdf', trashed: false,
  parents: [folder], modifiedTime: '2026-11-05T00:00:00Z', md5Checksum: 'a'.repeat(32), size: '20' };
class DriveError extends Error {
  constructor(message, status = 502) { super(message); this.status = status; }
}
test('Drive folder settings accept only folder IDs or trusted HTTPS folder links', () => {
  for (const value of [folder, 'https://drive.google.com/drive/folders/' + folder + '?usp=sharing',
    'https://drive.google.com/drive/u/0/folders/' + folder]) assert.equal(folderId(value), folder);
  for (const value of ['', undefined, 'https://evil.test/drive/folders/' + folder,
    'http://drive.google.com/drive/folders/' + folder, "x' in parents", 'https://drive.google.com/file/d/' + folder]) {
    assert.equal(folderId(value), null);
  }
});
test('Drive provider enforces selected folder, permissions, pagination, file versions and bounded downloads', async t => {
  const app = express();
  let mode = '', parsed = 0, metadataReads = 0, enabled = true, granted = true;
  const row = { owner_id: owner, connection_id: 'connection-test', google_subject: 'google-test' };
  app.use((req, _res, next) => { req.user = { id: owner }; next(); });
  app.use(createAttendanceDriveRouter({
    query: async (_sql, params) => {
      assert.equal(params[0], owner);
      return { rows: [{ content: { driveSync: { enabled, folderId: folder } } }] };
    },
    ensureConnected: async () => row, access: async () => 'synthetic-token',
    hasScope: (_row, scope) => { assert.equal(scope, DRIVE_SCOPE); return granted; },
    unchanged: async () => { if (mode === 'account-change') throw new DriveError('Google connection changed', 409); },
    parsePdf: async buffer => { parsed++; assert.ok(buffer.length <= 5 * 1024 * 1024); return { weeks: ['2026-10-26', '2026-11-02'], rows: [] }; },
    ErrorType: DriveError,
    fetchImpl: async (urlString, options) => {
      const url = new URL(urlString);
      assert.equal(url.origin, 'https://www.googleapis.com');
      assert.equal(options.headers.Authorization, 'Bearer synthetic-token');
      assert.equal(options.redirect, 'error');
      if (mode === 'forbidden') return new Response('', { status: 403 });
      if (mode === 'missing') return new Response('', { status: 404 });
      if (url.pathname.endsWith('/' + folder)) return Response.json({ id: folder, mimeType: 'application/vnd.google-apps.folder', trashed: false });
      if (url.pathname.endsWith('/files')) {
        assert.ok(url.searchParams.get('q').includes("'" + folder + "' in parents"));
        if (mode === 'too-many') return Response.json({ files: [], nextPageToken: 'more' });
        if (mode === 'pagination' && !url.searchParams.has('pageToken')) return Response.json({ files: [], nextPageToken: 'next' });
        return Response.json({ files: [mode === 'oversized-list' ? { ...file, size: String(6 * 1024 * 1024) } : file] });
      }
      if (url.searchParams.get('alt') === 'media') {
        if (mode === 'oversized-stream') return new Response(new Uint8Array(5 * 1024 * 1024 + 1));
        return new Response('%PDF-test', { headers: mode === 'oversized-header' ? { 'content-length': String(6 * 1024 * 1024) } : {} });
      }
      metadataReads++;
      return Response.json(mode === 'wrong-folder' ? { ...file, parents: ['different_folder'] } :
        mode === 'file-change' && metadataReads > 1 ? { ...file, modifiedTime: '2026-11-06T00:00:00Z' } : file);
    }
  }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = 'http://127.0.0.1:' + server.address().port + '/2026/files';
  let result = await (await fetch(base)).json();
  assert.equal(result.files[0].id, file.id);
  assert.ok(result.files[0].version.includes(file.modifiedTime));
  mode = 'pagination';
  assert.equal((await (await fetch(base)).json()).files.length, 1);
  mode = '';
  result = await (await fetch(base + '/' + file.id)).json();
  assert.equal(result.accountId, 'google-test');
  assert.equal(parsed, 1);
  for (const [value, status] of [['wrong-folder', 422], ['oversized-header', 422], ['oversized-stream', 422],
    ['file-change', 409], ['forbidden', 403], ['missing', 404], ['account-change', 409]]) {
    mode = value; metadataReads = 0;
    assert.equal((await fetch(base + '/' + file.id)).status, status, value);
  }
  for (const value of ['oversized-list', 'too-many']) {
    mode = value;
    assert.equal((await fetch(base)).status, 422, value);
  }
  mode = ''; granted = false;
  assert.equal((await fetch(base)).status, 409);
  granted = true; enabled = false;
  assert.equal((await fetch(base)).status, 409);
  assert.equal((await fetch(base.replace('2026', 'bad'))).status, 400);
});
test('Drive consent is opt-in and reconnect retains previously granted scopes', async t => {
  const env = {
    GOOGLE_CALENDAR_CLIENT_ID: 'synthetic-client', GOOGLE_CALENDAR_CLIENT_SECRET: 'synthetic-secret',
    GOOGLE_CALENDAR_TOKEN_KEY: Buffer.alloc(32, 7).toString('base64'), APP_BASE_URL: 'https://planner.example.test'
  };
  let stored = null;
  const app = express();
  app.use(express.json(), session({ secret: 'synthetic-drive-consent', resave: false, saveUninitialized: false }));
  app.use((req, _res, next) => { req.user = { id: owner }; next(); });
  app.use(createGoogleCalendarRouter({ env, query: async () => ({ rows: stored ? [stored] : [] }) }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = 'http://127.0.0.1:' + server.address().port;
  const connect = async body => {
    const response = await fetch(base + '/connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return response;
  };
  let result = await (await connect({})).json();
  assert.equal(new URL(result.url).searchParams.get('scope').includes(DRIVE_SCOPE), false);
  result = await (await connect({ includeAttendanceDrive: true })).json();
  assert.equal(new URL(result.url).searchParams.get('scope').includes(DRIVE_SCOPE), true);
  assert.equal((await connect({ includeAttendanceDrive: 'yes' })).status, 400);
  stored = { owner_id: owner, encrypted_tokens: encryptTokens({ scopes: [...SCOPES, DRIVE_SCOPE] }, configuration(env).key, owner),
    connection_id: 'connection-test', selected_calendars: [] };
  result = await (await connect({})).json();
  assert.equal(new URL(result.url).searchParams.get('scope').includes(DRIVE_SCOPE), true);
  assert.equal((await (await fetch(base)).json()).attendanceDriveEnabled, true);
});
