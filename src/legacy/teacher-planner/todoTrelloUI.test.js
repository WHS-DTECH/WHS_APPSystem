const test = require('node:test');
const assert = require('node:assert/strict');
const { groupCards, dateKey, refreshData, subscribe } = require('./public/todo-trello');

const card = (id, due = null, extra = {}) => ({ id, due, dueComplete: false, ...extra });

test('cards have one primary group and preserve other status information', () => {
  const today = '2026-11-26';
  const lists = [
    { role: 'urgent', cards: [card('1', '2026-11-26T01:00:00Z')] },
    { role: 'todo', cards: [card('2', '2026-11-26T01:00:00Z'),
      card('3', '2026-11-28T01:00:00Z'), card('4', '2026-11-25T01:00:00Z'),
      card('5', null, { dueComplete: true })] },
    { role: 'waiting', cards: [card('6')] },
    { role: 'done', cards: [card('7', null, { completionActivity: 'verified', completedAt: '2026-11-25T12:00:00Z' }),
      card('8', null, { completionActivity: 'unknown' })] },
    { role: 'filed', cards: [card('9')] }
  ];
  const { groups, outstanding } = groupCards(lists, today);
  assert.equal(outstanding, 5);
  assert.deepEqual(Object.fromEntries(Object.entries(groups).filter(([, values]) => values.length)
    .map(([name, values]) => [name, values.map(value => value.id)])),
  { urgent: ['1'], today: ['2'], upcoming: ['3'], todo: ['4'], waiting: ['6'],
    doneToday: ['7'], doneOther: ['8'], completedActive: ['5'] });
  assert.equal(groups.urgent[0].dueDate, today);
  assert.equal(dateKey('2026-11-25T12:00:00Z'), today, 'uses Auckland, not UTC');
});

test('duplicate card IDs fail rather than displaying conflicting cards', () => {
  assert.throws(() => groupCards([{ role: 'urgent', cards: [card('1')] },
    { role: 'todo', cards: [card('1')] }], '2026-11-26'), /more than one list/);
});

test('sidebar and dashboard share one refresh and failures do not look like empty tasks', async () => {
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  const updates = [], dashboardUpdates = [];
  let resolve, calls = 0;
  globalThis.fetch = () => { calls++; return new Promise(done => { resolve = done; }); };
  console.warn = () => {};
  const unsubscribe = subscribe(state => updates.push({ ...state }));
  const unsubscribeDashboard = subscribe(state => dashboardUpdates.push({ ...state }));
  try {
    const first = refreshData('/api/'), second = refreshData('/api/');
    await Promise.resolve();
    assert.equal(calls, 1);
    resolve({ ok: true, json: async () => ({ status: 'ok', fetchedAt: '2026-11-26T00:00:00Z', lists: [] }) });
    await Promise.all([first, second]);
    assert.equal(updates.at(-1).data.status, 'ok');
    assert.equal(dashboardUpdates.at(-1).lastRefresh, updates.at(-1).lastRefresh);
    const failed = refreshData('/api/');
    await Promise.resolve();
    resolve({ ok: false, json: async () => ({ error: 'Token expired' }) });
    await failed;
    assert.equal(updates.at(-1).data, null);
    assert.equal(dashboardUpdates.at(-1).error, 'Token expired');
    assert.ok(updates.at(-1).lastRefresh);
  } finally {
    unsubscribe(); unsubscribeDashboard();
    globalThis.fetch = originalFetch; console.warn = originalWarn;
  }
});
