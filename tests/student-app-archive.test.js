const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { createArchiveService, repository, pathReason, contentReason } = require('../src/studentAppArchive');

const keys = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const privateKey = keys.privateKey.export({ type: 'pkcs8', format: 'pem' });
const SOURCE_COMMIT = 'a'.repeat(40);
const SOURCE_TREE = 'b'.repeat(40);
const PARENT = 'c'.repeat(40);
const ROOT = 'd'.repeat(40);
const ARCHIVE_COMMIT = 'e'.repeat(40);
const DESTINATION = 'WHS-DTECH/WHS-TECHArchive';
const ENV = { GITHUB_READER_APP_ID: '123', GITHUB_WRITER_APP_ID: '456',
  GITHUB_READER_PRIVATE_KEY_FILE: 'reader.pem', GITHUB_WRITER_PRIVATE_KEY_FILE: 'writer.pem' };

function fixture(options = {}) {
  const calls = [];
  const blobs = new Map();
  const entries = (options.files || [
    ['app.py', 'print("hello")\n', '100755'],
    ['LICENSE', 'Copyright Student. All rights reserved.', '100644'],
    ['.env', 'PRIVATE=do-not-read', '100644'],
    ['data.db', 'private database', '100644'],
    ['config.js', 'const api_key = "real-sensitive-value";', '100644'],
    ['large-lfs.png', 'version https://git-lfs.github.com/spec/v1\noid sha256:abc\nsize 100000', '100644'],
    ['linked', '', '120000']
  ]).map(([path, content, mode]) => {
    const bytes = Buffer.from(content);
    const sha = crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
    blobs.set(sha, bytes);
    return { path, sha, mode, size: bytes.length, type: mode === '160000' ? 'commit' : 'blob' };
  });
  const fetchImpl = async (url, init) => {
    assert.ok(url.startsWith('https://api.github.com/'));
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers['X-GitHub-Api-Version'], '2022-11-28');
    const path = url.slice('https://api.github.com'.length);
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ path, method: init.method, body, token: init.headers.Authorization });
    if (options.failPath && path.includes(options.failPath)) return new Response('{}', { status: options.failStatus || 403 });
    let data;
    if (path.endsWith('/installation')) {
      const jwt = init.headers.Authorization.slice('Bearer '.length);
      const [header, payload, signature] = jwt.split('.');
      assert.ok(crypto.verify('RSA-SHA256', Buffer.from(`${header}.${payload}`), keys.publicKey, Buffer.from(signature, 'base64url')));
      const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
      assert.ok(['123', '456'].includes(claims.iss));
      assert.ok(claims.exp > Date.now() / 1000);
      data = { id: claims.iss === '123' ? 1 : 2 };
    } else if (path.includes('/access_tokens')) {
      assert.equal(body.repositories.length, 1);
      assert.equal(body.permissions.contents, path.includes('/1/') ? 'read' : 'write');
      data = { token: path.includes('/1/') ? 'reader-token' : 'writer-token' };
    } else if (path === '/repos/student/project') {
      data = { default_branch: 'main', private: true };
    } else if (path === `/repos/${DESTINATION}`) {
      data = { default_branch: 'main', private: options.publicArchive ? false : true };
    } else if (path.startsWith('/repos/student/project/commits/')) {
      data = { sha: SOURCE_COMMIT, commit: { tree: { sha: SOURCE_TREE } } };
    } else if (path === `/repos/student/project/git/trees/${SOURCE_TREE}?recursive=1`) {
      data = { tree: entries, truncated: Boolean(options.truncated) };
    } else if (path.startsWith('/repos/student/project/git/blobs/')) {
      const bytes = blobs.get(path.split('/').at(-1));
      data = { encoding: 'base64', content: options.corrupt ? 'YWJj' : bytes.toString('base64') };
    } else if (path.endsWith('/git/ref/heads/main')) {
      data = { object: { sha: PARENT } };
    } else if (path.endsWith(`/git/commits/${PARENT}`)) {
      data = { tree: { sha: ROOT } };
    } else if (path.endsWith(`/git/trees/${ROOT}?recursive=1`)) {
      data = { tree: options.existing || [], truncated: false };
    } else if (path.endsWith('/git/blobs')) {
      const bytes = Buffer.from(body.content, 'base64');
      data = { sha: crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex') };
    } else if (path.endsWith('/git/trees')) {
      data = { sha: 'f'.repeat(40) };
    } else if (path.endsWith('/git/commits')) {
      data = { sha: ARCHIVE_COMMIT };
    } else if (path.endsWith('/git/refs/heads/main')) {
      data = { object: { sha: body.sha } };
    } else {
      throw new Error(`Unexpected mock path: ${path}`);
    }
    return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
  };
  return { calls, entries, service: createArchiveService({ env: ENV, fetchImpl, readFile: () => privateKey }) };
}

test('repository parser accepts only GitHub repository identifiers, not arbitrary network targets', () => {
  assert.deepEqual(repository('https://github.com/student/project.git'), { owner: 'student', name: 'project', fullName: 'student/project' });
  for (const invalid of ['http://localhost/x', 'https://evil.invalid/a/b', 'student/..', 'https://github.com/a/b?token=x', 'https://x@github.com/a/b', 'a/b/tree/main']) {
    assert.throws(() => repository(invalid));
  }
});

test('path and content filters explicitly identify secrets, runtime data and nonportable sources', () => {
  for (const path of ['../escape', 'a\\b', 'a/.env.local', 'key.pem', 'credentials.json', 'ClientSS/student.xlsx', 'node_modules/a.js', 'notes.csv']) {
    assert.ok(pathReason(path, '100644'), path);
  }
  assert.ok(pathReason('linked', '120000'));
  assert.ok(pathReason('submodule', '160000'));
  assert.equal(pathReason('src/main.py', '100755'), null);
  assert.ok(contentReason(Buffer.from('-----BEGIN RSA PRIVATE KEY-----')));
  assert.ok(contentReason(Buffer.from('postgres://user:password@host/database')));
  assert.equal(contentReason(Buffer.from('secret_key = "your-key-here"')), null);
});

test('preview pins a source commit, scans files and never writes student code or destination files', async () => {
  const { service, calls } = fixture();
  const snapshot = await service.preview('student/project', 'feature/school');
  assert.equal(snapshot.commit, SOURCE_COMMIT);
  assert.equal(snapshot.files.length, 2);
  assert.equal(snapshot.excluded.length, 5);
  assert.ok(calls.some((call) => call.path.endsWith('/commits/feature%2Fschool')));
  assert.equal(calls.some((call) => call.method !== 'GET' && !call.path.includes('access_tokens')), false);
  assert.ok(calls.filter((call) => call.path.includes('/student/project/git/')).every((call) => call.token === 'Bearer reader-token'));
});

test('archive rechecks pinned content and privacy, saves separate snapshot, preserves other archive data and never force pushes', async () => {
  const { service, calls } = fixture();
  const snapshot = await service.preview('student/project');
  const result = await service.archive(snapshot, 'student-project', 'test-import');
  assert.equal(result.commit, ARCHIVE_COMMIT);
  assert.match(result.folder, /^LegacySites\/StudentApps\/student-project\/snapshots\//);
  assert.ok(calls.some((call) => call.path === `/repos/student/project/commits/${SOURCE_COMMIT}`));
  const treeCall = calls.find((call) => call.method === 'POST' && call.path.endsWith('/git/trees'));
  assert.equal(treeCall.body.base_tree, ROOT);
  assert.equal(treeCall.body.tree.length, 3);
  assert.equal(treeCall.body.tree.find((entry) => entry.path.endsWith('/app.py')).mode, '100755');
  const manifest = JSON.parse(treeCall.body.tree.find((entry) => entry.path.endsWith('/_whs-import.json')).content);
  assert.equal(manifest.importId, 'test-import');
  assert.equal(manifest.excluded.length, 5);
  const update = calls.find((call) => call.method === 'PATCH');
  assert.deepEqual(update.body, { sha: ARCHIVE_COMMIT, force: false });
  assert.ok(calls.filter((call) => call.path.startsWith(`/repos/${DESTINATION}/git/`)).every((call) => call.token === 'Bearer writer-token'));
});

test('public destination, incomplete listings, corrupt blobs and oversized repositories stop explicitly', async () => {
  await assert.rejects(fixture({ publicArchive: true }).service.preview('student/project'), /must be private/);
  await assert.rejects(fixture({ truncated: true }).service.preview('student/project'), /listing is incomplete/);
  await assert.rejects(fixture({ corrupt: true }).service.preview('student/project'), /verification failed/);
  await assert.rejects(fixture({ files: [['large.txt', 'x'.repeat(1024 * 1024 + 1), '100644']] }).service.preview('student/project'), /1 MiB/);
  await assert.rejects(fixture({ files: Array.from({ length: 301 }, (_, n) => [`${n}.js`, '', '100644']) }).service.preview('student/project'), /300/);
  await assert.rejects(fixture({ files: Array.from({ length: 16 }, (_, n) => [`${n}.txt`, 'x'.repeat(1024 * 1024), '100644']) }).service.preview('student/project'), /15 MiB/);
  const boundary = await fixture({ files: [['max.txt', 'x'.repeat(1024 * 1024), '100644']] }).service.preview('student/project');
  assert.equal(boundary.bytes, 1024 * 1024);
});

test('confirmation rejects tampering, duplicate snapshots and GitHub ref conflicts without overwriting', async () => {
  const { service, calls } = fixture();
  const snapshot = await service.preview('student/project');
  await assert.rejects(service.archive({ ...snapshot, files: [] }, 'project', 'test'), /Invalid preview/);
  await assert.rejects(service.archive(snapshot, '../project', 'test'), /Invalid preview/);
  const folder = `LegacySites/StudentApps/project/snapshots/${snapshot.commit}-${snapshot.digest.slice(0, 12)}`;
  const duplicate = fixture({ existing: [{ path: `${folder}/app.py` }] });
  await assert.rejects(duplicate.service.archive(snapshot, 'project', 'test'), /already archived/);
  assert.equal(duplicate.calls.some((call) => call.method === 'PATCH'), false);
  const conflict = fixture({ failPath: '/git/refs/heads/', failStatus: 422 });
  await assert.rejects(conflict.service.archive(snapshot, 'project', 'test'), /fresh preview/);
  assert.equal(calls.some((call) => call.method === 'PATCH'), false);
});

test('installation errors and missing key configuration are actionable and do not leak credentials', async () => {
  await assert.rejects(fixture({ failPath: '/installation', failStatus: 404 }).service.preview('student/project'), /install the correct App/);
  const service = createArchiveService({ env: {} });
  assert.equal(service.configuration().ready, false);
  await assert.rejects(service.preview('student/project'), /not configured/);
  const invalidKey = createArchiveService({ env: ENV, readFile: () => 'not-a-key' });
  await assert.rejects(invalidKey.preview('student/project'), /private key could not be loaded/);
});

test('confirmation checks private visibility again, refuses the archive as source, and reports network failures', async () => {
  const snapshot = await fixture().service.preview('student/project');
  const publicDestination = fixture({ publicArchive: true });
  await assert.rejects(publicDestination.service.archive(snapshot, 'project', 'test'), /must be private/);
  assert.equal(publicDestination.calls.some((call) => call.method === 'PATCH'), false);
  await assert.rejects(fixture().service.preview(DESTINATION), /cannot be used as a source/);
  const unreachable = createArchiveService({ env: ENV, readFile: () => privateKey,
    fetchImpl: async () => { throw new Error('sensitive diagnostic should not escape'); } });
  await assert.rejects(unreachable.preview('student/project'), /could not be reached/);
});
