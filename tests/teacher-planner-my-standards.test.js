const test = require('node:test');
const assert = require('node:assert/strict');
const { createTeacherPlannerRouter } = require('../src/modules/teacherPlanner');

const userId = '550e8400-e29b-41d4-a716-446655440000';

test('Learning Sites sync reads only the signed-in Teacher Planner user’s My Standards', async () => {
  const calls = [];
  const router = createTeacherPlannerRouter({
    plannerQuery: async (sql, params) => {
      calls.push([sql, params]);
      return { rows: [{ content: { selectedStandards: JSON.stringify([
        { number: '91906', title: 'Programming', subject: 'Digital Technologies', level: '2', version: '1' }
      ]) } }] };
    }
  });

  assert.deepEqual(await router.loadMyStandards(userId, 2026), [{
    number: '91906', title: 'Programming', subject: 'Digital Technologies', level: '2', version: '1'
  }]);
  assert.deepEqual(calls[0][1], [userId, 2026]);
  assert.match(calls[0][0], /owner_id = \$1 AND year = \$2 AND section = 'assessmentSetup'/);
});

test('Learning Sites sync rejects malformed or unrelated Teacher Planner My Standards', async () => {
  const router = createTeacherPlannerRouter({
    plannerQuery: async () => ({ rows: [{ content: { selectedStandards: JSON.stringify([
      { number: 'not-a-number', title: 'Invalid' }
    ]) } }] })
  });
  await assert.rejects(router.loadMyStandards(userId, 2026), /My Standards data is invalid/);
  await assert.rejects(router.loadMyStandards('caller-selected-user', 2026), /valid Teacher Planner user/);
});
