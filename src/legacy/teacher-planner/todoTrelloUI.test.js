const test = require('node:test');
const assert = require('node:assert/strict');
const { groupCards, todayTasks, meetingMetadata, meetingViews, dateKey, refreshData, subscribe } = require('./public/todo-trello');

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
  assert.deepEqual(todayTasks(groups, today).map(entry => entry.id), ['1', '2']);
  assert.equal(dateKey('2026-11-25T12:00:00Z'), today, 'uses Auckland, not UTC');
});
test('duplicate card IDs fail rather than displaying conflicting cards', () => {
  assert.throws(() => groupCards([{ role: 'urgent', cards: [card('1')] },
    { role: 'todo', cards: [card('1')] }], '2026-11-26'), /more than one list/);
});

test('meeting cards use structured Trello metadata and Auckland day, not Trello due dates', () => {
  const today = '2026-11-26';
  const groups = groupCards([{ role: 'meetings', cards: [
    card('today', null, { position: 2, description: 'Start: 2026-11-25T11:30:00Z\nEnd: 2026-11-26T01:00:00+13:00\nLocation: Room 1\nSource: https://calendar.google.com/calendar/event?eid=example' }),
    card('later', null, { position: 1, description: 'Start: 2026-12-10T09:00:00+13:00\nEnd: unspecified' }),
    card('unknown', '2026-11-25T23:00:00Z', { position: 3, start: '2026-11-25T23:00:00Z', description: 'Discussion at 10am' }),
    card('past', null, { position: 4, description: 'Start: 2026-11-25T09:00:00+13:00' })
  ] }], today).groups;
  const view = meetingViews(groups, today);
  assert.deepEqual(view.all.map(meeting => meeting.id), ['past', 'today', 'later', 'unknown']);
  assert.deepEqual(view.today.map(meeting => meeting.id), ['today']);
  assert.deepEqual(view.upcoming.map(meeting => meeting.id), ['today', 'later']);
  assert.equal(view.today[0].location, 'Room 1');
  assert.equal(view.today[0].url, 'https://calendar.google.com/calendar/event?eid=example');
  assert.equal(view.today[0].end, '2026-11-26T01:00:00+13:00');
  assert.equal(view.all[3].start, null);
});

test('ambiguous and malformed structured metadata is flagged without guessing', () => {
  const parsed = meetingMetadata({ description: [
    'Start: 2026-02-30T09:00:00+13:00', 'End: 2026-11-26T08:00:00+13:00',
    'Location: Room 1', 'Location: Room 2', 'Source: https://user:password@example.com'
  ].join('\n') });
  assert.equal(parsed.start, null);
  assert.equal(parsed.end, null);
  assert.equal(parsed.location, '');
  assert.equal(parsed.url, null);
  assert.deepEqual(parsed.errors, ['Duplicate location field', 'Invalid start timestamp',
    'End requires a valid earlier start', 'Invalid source URL']);
  const duplicate = meetingMetadata({ description: 'Start: 2026-11-26T09:00:00+13:00\nStart: 2026-11-26T10:00:00+13:00' });
  assert.equal(duplicate.start, null);
  assert.deepEqual(duplicate.errors, ['Duplicate start field']);
  assert.equal(meetingMetadata({ description: 'Start: 2026-11-26T09:00:00' }).start, null);
  assert.equal(meetingMetadata({ description: 'Start: 2026-11-26T24:00:00+13:00' }).start, null);
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
