const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { assessmentMerge } = require('../src/legacy/learning-sites/adminStore');
const { createModuleIdentityRouter } = require('../src/moduleIdentity');

test('Learning Sites assessment merge preserves manual entries and is idempotent', () => {
  const result = assessmentMerge(
    ['Teacher-entered assessment', 'Replace with assessment 1.'],
    ['teacher-entered ASSESSMENT', '91906 - Programming']
  );
  assert.deepEqual(result, {
    assessments: ['Teacher-entered assessment', '91906 - Programming'],
    added: ['91906 - Programming']
  });
  assert.deepEqual(assessmentMerge(result.assessments, ['91906 - Programming']), {
    assessments: result.assessments,
    added: []
  });
});

test('Learning Sites assessment merge rejects placeholders and over-capacity additions', () => {
  assert.throws(() => assessmentMerge([], ['Replace with assessment 1.']), /cannot be placeholders/);
  assert.throws(() => assessmentMerge(
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
    ['11']
  ), /up to 10 assessment entries/);
});

test('Unit Library bridge restricts sync, returns private My Standards and merges only through the authorized service', async t => {
  let roles = ['ADMIN'];
  const calls = [];
  const app = express();
  app.use(express.json());
  app.use('/module-auth', createModuleIdentityRouter({
    dbQuery: async (sql, params) => {
      calls.push([sql, params]);
      if (sql.includes('FROM module_builder_projects')) {
        return { rows: [{ id: 'library-project', slug: 'whs-unit-library', kind: 'development',
          app_url: 'https://library.example.test' }] };
      }
      if (sql.includes('FROM module_identity_grants')) return { rows: [{ user_id: 'user-id' }] };
      if (sql.includes('FROM users u')) {
        return { rows: [{ id: 'user-id', email: 'staff@example.test', display_name: 'Staff User',
          roles, module_roles: [] }] };
      }
      if (sql.includes('FROM user_hub_roles assignments')) return { rows: [], rowCount: 0 };
      throw new Error('Unexpected query: ' + sql);
    },
    loadMyStandards: async (userId, year) => {
      assert.equal(userId, 'user-id');
      assert.equal(year, 2026);
      return [{ number: '91906', title: 'Programming', subject: 'Digital Technologies' }];
    },
    learningSitesSyncService: {
      initAdminSchema: async () => {},
      previewCourseAssessmentsMerge: async entries => ({ courses: entries }),
      mergeCourseAssessments: async (entries, actor) => ({ ok: true, entries, actor })
    }
  }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/module-auth/learning-area-sync`;
  const post = (body, clientId = 'whs-unit-library:development') => fetch(base, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${'A'.repeat(43)}` },
    body: JSON.stringify({ client_id: clientId, ...body })
  });

  assert.equal((await post({ action: 'access' })).status, 200);
  assert.deepEqual(await (await post({ action: 'standards', year: 2026 })).json(), {
    standards: [{ number: '91906', title: 'Programming', subject: 'Digital Technologies' }]
  });
  assert.deepEqual(await (await post({ action: 'preview', entries: [{ courseCode: '11DTECH', assessments: ['91906 - Programming'] }] })).json(), {
    courses: [{ courseCode: '11DTECH', assessments: ['91906 - Programming'] }]
  });
  const applied = await (await post({ action: 'apply', entries: [{ courseCode: '11DTECH', assessments: ['91906 - Programming'] }] })).json();
  assert.equal(applied.actor, 'Staff User');
  assert.equal((await post({ action: 'access' }, 'another-app:development')).status, 403);

  roles = ['Teacher'];
  assert.deepEqual(await (await post({ action: 'access' })).json(), { canSync: false });
  assert.equal((await post({ action: 'apply', entries: [{ courseCode: '11DTECH', assessments: ['91906 - Programming'] }] })).status, 403);
  assert.ok(calls.some(([sql]) => sql.includes('module_identity_grants')));
});
