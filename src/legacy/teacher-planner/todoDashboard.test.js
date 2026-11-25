const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.plannerTodoTrello = require('./public/todo-trello');
const { model } = require('./public/todo-dashboard');

const card = (id, due, labels = [], extra = {}) => ({
  id, due, labels, dueComplete: false, position: 100, title: id, description: '', ...extra
});

test('dashboard summaries use the sidebar outstanding classification and Auckland week', () => {
  const data = { lists: [
    { role: 'urgent', cards: [card('urgent', '2026-11-25T12:00:00Z', [{ name: 'HOLA', color: 'green' }])] },
    { role: 'todo', cards: [card('overdue', '2026-11-24T00:00:00Z', [{ name: 'DTECH', color: 'blue' }]),
      card('future', '2026-11-28T00:00:00Z', [{ name: 'HOLA', color: 'green' }]),
      card('complete', null, [], { dueComplete: true })] },
    { role: 'waiting', cards: [card('waiting', null)] },
    { role: 'meetings', cards: [card('meeting', null)] },
    { role: 'done', cards: [card('done', null, [], { dueComplete: true,
      completedAt: '2026-11-25T12:00:00Z', completionActivity: 'verified' })] },
    { role: 'filed', name: 'DONE - MISCELLANEOUS', cards: [card('filed', null)] }
  ] };
  const result = model(data, '2026-11-26');
  assert.deepEqual(result.summary, { urgent: 1, outstanding: 4, overdue: 1, today: 1,
    week: 3, doing: 0, waiting: 1, doneToday: 1 });
  assert.equal(result.summary.outstanding, globalThis.plannerTodoTrello.groupCards(data.lists, '2026-11-26').outstanding);
  assert.deepEqual(result.labels.find(label => label.name === 'HOLA'), { name: 'HOLA', color: 'green', count: 2 });
  assert.deepEqual(result.labels.find(label => label.name === 'DTECH'), { name: 'DTECH', color: 'blue', count: 1 });
  assert.ok(!result.active.some(entry => ['meeting', 'done', 'complete', 'filed'].includes(entry.id)));
});

test('responsibility counts include distinct cards and retain other actual labels', () => {
  const result = model({ lists: [{ role: 'todo', cards: [
    card('one', null, [{ name: 'Other', color: 'purple' }, { name: 'other', color: 'purple' }])
  ] }] }, '2026-11-26');
  assert.deepEqual(result.labels.find(label => label.name === 'Other'), { name: 'Other', color: 'purple', count: 1 });
  assert.equal(result.labels.find(label => label.name === 'MISCELLANEOUS').count, 0);
});
