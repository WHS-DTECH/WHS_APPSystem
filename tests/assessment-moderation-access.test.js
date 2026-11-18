const test = require('node:test');
const assert = require('node:assert/strict');
const { assessmentModerationAccess } = require('../src/assessmentModerationAccess');
const express = require('express');
const { createModuleIdentityRouter } = require('../src/moduleIdentity');

test('moderation HoLA access requires a unique active staff identity and current reviewed department leadership', async () => {
  const user = { id: 'owner', email: 'synthetic@example.test', roles: ['Teacher'] };
  const staff = [{ code: 'TST', first_name: 'Synthetic', last_name: 'Teacher', email_school: user.email }];
  const account = { id: user.id, display_name: 'Synthetic Teacher', student_account: false };
  const role = { role: 'HOLA', department: 'Technology', source: 'https://school.example.test/staff', reviewedOn: '2026-11-18' };
  let leaders = [{ first_name: 'Synthetic', last_name: 'Teacher', department: 'Technology', leadership_roles: [role] }];
  const load = () => assessmentModerationAccess(user, async () => ({ rows: staff }), async sql =>
    ({ rows: sql.includes('FROM public.department') ? leaders : [account] }));
  assert.deepEqual(await load(), { all: false, departments: ['Technology'] });
  for (const change of [{ onLeave: true }, { role: 'TIC' }, { source: '' }, { reviewedOn: '' }]) {
    leaders[0].leadership_roles = [{ ...role, ...change }];
    assert.deepEqual((await load()).departments, []);
  }
  leaders[0].leadership_roles = [role];
  account.display_name = 'Different Person';
  assert.deepEqual((await load()).departments, []);
  account.display_name = 'Synthetic Teacher'; account.student_account = true;
  assert.deepEqual((await load()).departments, []);
  account.student_account = false;
  staff.push({ ...staff[0] });
  assert.deepEqual((await load()).departments, []);
  staff.pop();
  leaders.push({ first_name: 'Other', last_name: 'Leader', department: 'Technology', leadership_roles: [role] });
  assert.deepEqual((await load()).departments, []);
  leaders[0].leadership_roles = [{ ...role, acting: true }];
  assert.deepEqual((await load()).departments, ['Technology']);
  leaders = [];
  assert.deepEqual((await load()).departments, []);
  assert.deepEqual(await assessmentModerationAccess({ roles: ['ADMIN'] }), { all: true, departments: [] });
  await assert.rejects(assessmentModerationAccess(user, async () => { throw new Error('Directory unavailable'); }, async () => ({ rows: [account] })), /Directory unavailable/);
});

test('moderation authority bridge requires the registered Assessment Manager client and a current grant', async t => {
  let allowed = true, role = 'ADMIN', unavailable = false, directoryReads = 0;
  const app = express(); app.use(express.json());
  app.use('/module-auth', createModuleIdentityRouter({
    dbQuery: async (sql, params) => {
      if (sql.includes('FROM module_builder_projects')) return { rows: [{ id: 'project', slug: params[0], kind: 'development', app_url: 'https://fixture.onrender.com' }] };
      if (sql.includes('FROM module_identity_grants')) return { rows: allowed ? [{ user_id: 'owner' }] : [] };
      if (sql.includes('FROM users u')) return { rows: [{ id: 'owner', email: 'synthetic@example.test', roles: [role] }] };
      throw new Error('Unexpected Core query');
    },
    directoryQuery: async () => {
      directoryReads++;
      if (unavailable) throw new Error('Directory unavailable');
      return { rows: [] };
    }
  }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const post = (client = 'whs-assessment-manager:development', token = 'A'.repeat(43)) => fetch(
    `http://127.0.0.1:${server.address().port}/module-auth/moderation-access`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ client_id: client, departments: ['Forged'], all: true })
    });
  assert.equal((await post(undefined, '')).status, 401);
  assert.equal((await post('teacher-planner:development')).status, 403);
  assert.equal(directoryReads, 0);
  const response = await post();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { all: true, departments: [] });
  allowed = false;
  assert.equal((await post()).status, 401);
  allowed = true; role = 'Teacher'; unavailable = true;
  assert.equal((await post()).status, 502);
  assert.equal(directoryReads, 1);
});
