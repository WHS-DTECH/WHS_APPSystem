const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createAssessmentRouter } = require('./assessment');
const { validHistory, validVerifier } = require('./verifiers');
const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const other = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const verifierId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const recordId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const entryId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const verifier = { name: 'Synthetic Verifier', school: 'Example School', position: 'Teacher',
  email: 'verifier@example.test', nzqaExpert: true, notes: 'Designation recorded by staff.' };
async function fixture(t, query, access = async () => ({ all: false, departments: [] })) {
  const state = { user: { id: owner, roles: ['Teacher'] } }, app = express();
  app.use((req, res, next) => { req.user = state.user; req.session = { assessmentManagerCsrf: 'fixture-csrf' }; next(); });
  app.use(createAssessmentRouter({ query, loadModerationAccess: access }));
  app.use((error, req, res, next) => { res.status(500).json({ error: error.message }); });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return { state, async request(path, body, csrf = true) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/verifiers${path}`, {
      method: body ? 'PUT' : 'GET', headers: { 'Content-Type': 'application/json', ...(csrf ? { 'x-assessment-csrf': 'fixture-csrf' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    return { status: response.status, body: await response.json() };
  } };
}
test('shared contacts require staff and CSRF, validate details and reject stale edits', async t => {
  let saved, revision = 0;
  const f = await fixture(t, async (sql, params) => {
    if (sql.startsWith('SELECT')) return { rows: saved ? [saved] : [] };
    assert.match(sql, /ON CONFLICT\(id\) DO NOTHING|WHERE id=\$1 AND revision=\$9/);
    if (sql.startsWith('INSERT') && revision || sql.startsWith('UPDATE') && params[8] !== revision) return { rows: [] };
    assert.equal(params[7], owner);
    saved = { id: params[0], name: params[1], school: params[2], position: params[3], email: params[4],
      nzqa_expert: params[5], notes: params[6], revision: ++revision };
    return { rows: [saved] };
  });
  assert.equal((await f.request('/' + verifierId, { verifier, revision: 0 }, false)).status, 403);
  assert.equal((await f.request('/' + verifierId, { verifier: { ...verifier, email: 'invalid' }, revision: 0 })).status, 400);
  const created = await f.request('/' + verifierId, { verifier, revision: 0 });
  assert.equal(created.status, 200); assert.equal(created.body.nzqa_expert, true);
  f.state.user.id = other;
  assert.equal((await f.request('')).body.verifiers[0].name, verifier.name, 'contacts are shared across staff accounts');
  f.state.user.id = owner;
  assert.equal((await f.request('/' + verifierId, { verifier: { ...verifier, nzqaExpert: false }, revision: 1 })).body.revision, 2);
  assert.equal((await f.request('/' + verifierId, { verifier, revision: 1 })).status, 409);
  assert.equal((await f.request('/' + verifierId, { verifier, revision: 0 })).status, 409);
  f.state.user.roles = ['Student'];
  assert.equal((await f.request('')).status, 403);
  f.state.user = null;
  assert.equal((await f.request('')).status, 403);
});
test('history scopes both sources to the owner or currently verified departments; revocation takes effect immediately', async t => {
  let scope = { all: false, departments: [] }, checks = 0;
  const records = [
    { owner_id: owner, year: 2024, entry_key: recordId, content: { title: 'Own record', department: 'Other', internal: JSON.stringify({ verifierId }) } },
    { owner_id: other, year: 2025, entry_key: entryId, content: { title: 'Department record', department: 'Technology',
      internal: JSON.stringify({ verifierId, samples: [{ student: 'Synthetic learner', moderatedDate: '2025-11-03' }, { moderatedDate: '2025-12-01' }] }) } },
    { owner_id: other, year: 2026, entry_key: recordId, content: { title: 'Private record', department: 'Science', internal: JSON.stringify({ verifierId }) } }
  ];
  const f = await fixture(t, async (sql, params) => {
    assert.deepEqual(params, [owner, scope.departments.map(value => value.toLowerCase()), scope.all, verifierId]);
    if (sql.includes('FROM assessment_records')) {
      assert.match(sql, /parent_record IS NULL/);
      assert.match(sql, /owner_id=\$1 OR \$3 OR lower\(btrim\(content->>'department'\)\)=ANY\(\$2::text\[\]\)/);
      assert.match(sql, /::jsonb\)->>'verifierId'=\$4/);
      return { rows: records.filter(row => row.owner_id === params[0] || params[2] || params[1].includes(row.content.department.toLowerCase())) };
    }
    assert.match(sql, /owner_id=\$1 OR \$3 OR lower\(btrim\(department\)\)=ANY\(\$2::text\[\]\)/);
    return { rows: records.filter(row => row.owner_id === params[0] || params[2] || params[1].includes(row.content.department.toLowerCase()))
      .map(row => ({ owner_id: row.owner_id, year: row.year, department: row.content.department, title: row.content.title })) };
  }, async () => { checks++; return scope; });
  const path = '/' + verifierId + '/history';
  let result = await f.request(path);
  assert.equal(result.body.linked.length, 1); assert.equal(result.body.manual.length, 1);
  assert.equal(result.body.linked[0].pending, true);
  scope = { all: false, departments: ['Technology'] };
  result = await f.request(path);
  assert.equal(result.body.linked.length, 2); assert.equal(result.body.manual.length, 2);
  assert.equal(result.body.linked[1].moderatedDate, '2025-11-03', 'blank sample names do not claim moderation');
  assert.equal(result.body.linked[1].own, false);
  scope.departments = [];
  assert.equal((await f.request(path)).body.linked.length, 1);
  scope.all = true;
  assert.equal((await f.request(path)).status, 500, 'a teacher cannot receive admin scope');
  f.state.user.roles = ['ADMIN'];
  assert.equal((await f.request(path)).body.linked.length, 3);
  assert.equal(checks, 5);
});
test('full record reads include student forms only for the owner, current department HoLA or admin', async t => {
  let scope = { all: false, departments: [] }, childrenReads = 0;
  const content = { title: 'Department record', department: 'Technology', internal: JSON.stringify({ verifierId }) };
  const f = await fixture(t, async (sql, params) => {
    if (sql.includes('parent_record=$3')) {
      childrenReads++; assert.deepEqual(params, [other, 2025, recordId]);
      return { rows: [{ entry_key: entryId, content: { studentName: 'Synthetic learner', schedule: '{"grade":"A"}' } }] };
    }
    assert.match(sql, /AND parent_record IS NULL/);
    return { rows: params[2] === entryId ? [] : [{ content, revision: 3 }] };
  }, async () => scope);
  const path = '/records/' + other + '/2025/' + recordId;
  assert.equal((await f.request(path)).status, 404); assert.equal(childrenReads, 0);
  scope.departments = ['technology'];
  const permitted = await f.request(path);
  assert.equal(permitted.status, 200);
  assert.equal(permitted.body.children[0].content.studentName, 'Synthetic learner');
  scope.departments = [];
  assert.equal((await f.request(path)).status, 404);
  f.state.user.id = other;
  assert.equal((await f.request(path)).status, 200, 'teachers retain their own full forms');
  assert.equal((await f.request('/records/' + other + '/2025/' + entryId)).status, 404, 'a child cannot bypass the parent department check');
  f.state.user.id = owner; f.state.user.roles = ['ADMIN']; scope.all = true;
  assert.equal((await f.request(path)).status, 200);
});
test('manual history uses the signed-in owner and revisions, including when a HoLA can read another owner', async t => {
  let revision = 0;
  const f = await fixture(t, async (sql, params) => {
    assert.equal(params[2], owner);
    if (sql.startsWith('INSERT')) {
      assert.match(sql, /FROM assessment_verifiers WHERE id=\$2/);
      revision = 1; return { rows: [{ id: params[0], revision }] };
    }
    assert.match(sql, /owner_id=\$3 AND revision=\$10/);
    return { rows: params[9] === revision && params[0] !== recordId ? [{ id: params[0], revision: ++revision }] : [] };
  }, async () => ({ all: false, departments: ['Technology'] }));
  const entry = { year: 2023, department: 'Technology', standardNumber: '99999', title: 'External moderation', moderatedDate: '', notes: 'Historical evidence reference' };
  const path = '/' + verifierId + '/history/' + entryId;
  assert.equal((await f.request(path, { entry, revision: 0, ownerId: other })).status, 200);
  assert.equal((await f.request(path, { entry, revision: 1 })).body.revision, 2);
  assert.equal((await f.request(path, { entry, revision: 1 })).status, 409);
  assert.equal((await f.request('/' + verifierId + '/history/' + recordId, { entry, revision: 2 })).status, 409);
  assert.equal((await f.request(path, { entry: { ...entry, moderatedDate: '2025-02-29' }, revision: 2 })).status, 400);
  assert.equal((await f.request(path, { entry: { ...entry, ownerId: other }, revision: 2 })).status, 400);
});
test('authority outages and malformed scopes fail closed before private data queries', async t => {
  let authority = null, failed = false, calls = 0;
  const f = await fixture(t, async () => { calls++; throw new Error('Unexpected private query'); }, async () => {
    if (failed) throw new Error('Authority unavailable');
    return authority;
  });
  for (const value of [null, {}, { all: false, departments: [''] }, { all: true, departments: [] }]) {
    authority = value;
    assert.equal((await f.request('/' + verifierId + '/history')).status, 500);
  }
  failed = true;
  assert.equal((await f.request('/records/' + other + '/2025/' + recordId)).status, 500);
  assert.equal(calls, 0);
});
test('manual moderation dates and verifier designations are strictly validated', () => {
  assert.equal(validVerifier({ ...verifier, nzqaExpert: 'true' }), false);
  const history = { year: 2024, department: 'Technology', standardNumber: '', title: 'Historical moderation', moderatedDate: '2024-02-29', notes: '' };
  assert.equal(validHistory(history), true);
  assert.equal(validHistory({ ...history, year: 1999 }), false);
  assert.equal(validHistory({ ...history, moderatedDate: '2024-02-30' }), false);
});
