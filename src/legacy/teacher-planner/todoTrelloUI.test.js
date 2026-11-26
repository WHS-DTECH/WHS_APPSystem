const test = require('node:test');
const assert = require('node:assert/strict');
const { groupCards, todayTasks, meetingMetadata, meetingViews, minedStatus, dateKey, refreshData, subscribe,
  configureCompletion, completeCard, writeConnectionMessage } = require('./public/todo-trello');

const card = (id, due = null, extra = {}) => ({ id, due, dueComplete: false, ...extra });

test('write token status clearly distinguishes approaching expiry, revoked access and unknown expiry', () => {
  assert.match(writeConnectionMessage({ writeStatus: 'expiring-soon', writeExpiresAt: '2026-12-02T11:00:00Z', writeAvailable: true }),
    /expires 3 Dec 2026.*Renew/);
  assert.match(writeConnectionMessage({ writeStatus: 'expired-or-revoked', writeAvailable: false }), /expired or was revoked.*read-only/);
  assert.match(writeConnectionMessage({ writeStatus: 'expiry-unknown', writeAvailable: true }), /expiry could not be verified/);
  assert.equal(writeConnectionMessage({ writeStatus: 'available', writeAvailable: true }), '');
});

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

test('MINED deadlines use Auckland dates and never enter task, meeting or completion groups', () => {
  const lists = [
    { role: 'todo', cards: [card('task')] },
    { role: 'mined', cards: [
      card('today', '2026-11-25T11:00:00Z'),
      card('future', '2026-11-26T11:00:00Z', { dueComplete: true }),
      card('past', '2026-11-25T10:59:00Z'),
      card('undated')
    ] }
  ];
  const { groups, outstanding } = groupCards(lists, '2026-11-26');
  assert.equal(outstanding, 1);
  assert.deepEqual(groups.minedToday.map(entry => entry.id), ['today']);
  assert.deepEqual(groups.minedUpcoming.map(entry => entry.id), ['future']);
  assert.deepEqual(groups.todo.map(entry => entry.id), ['task']);
  assert.equal(groups.meetings.length, 0);
  assert.equal(groups.completedActive.length, 0);
  assert.equal(lists[1].cards.length, 4);
});

test('MINED status uses only a single explicit mandatory or optional field', () => {
  assert.equal(minedStatus({ description: 'Type: MINED DEADLINE\nStatus: Optional\nNot a mandatory requirement.' }), 'Optional');
  assert.equal(minedStatus({ description: 'Status: mandatory' }), 'Mandatory');
  assert.equal(minedStatus({ description: 'This may be optional.' }), '');
  assert.match(minedStatus({ description: 'Status: Optional\nStatus: Mandatory' }), /unclear/i);
  assert.match(minedStatus({ description: 'Status: Pending' }), /unclear/i);
});

test('meeting cards use structured Trello metadata and Auckland day, not Trello due dates', () => {
  const today = '2026-11-26';
  const groups = groupCards([{ role: 'meetings', cards: [
    card('today', null, { position: 2, description: 'Start: 2026-11-25T11:30:00Z\nEnd: 2026-11-26T01:00:00+13:00\nLocation: Room 1\nResponsibility: HOLA\nSource: https://calendar.google.com/calendar/event?eid=example' }),
    card('later', null, { position: 1, description: 'Start: 2026-12-10T09:00:00+13:00\nEnd: unspecified' }),
    card('unknown', '2026-11-25T23:00:00Z', { position: 3, start: '2026-11-25T23:00:00Z', description: 'Discussion at 10am' }),
    card('past', null, { position: 4, description: 'Start: 2026-11-25T09:00:00+13:00' })
  ] }], today).groups;
  const view = meetingViews(groups, today);
  assert.deepEqual(view.all.map(meeting => meeting.id), ['past', 'today', 'later', 'unknown']);
  assert.deepEqual(view.today.map(meeting => meeting.id), ['today']);
  assert.deepEqual(view.upcoming.map(meeting => meeting.id), ['today', 'later']);
  assert.equal(view.today[0].location, 'Room 1');
  assert.equal(view.today[0].responsibility, 'HOLA');
  assert.equal(view.today[0].url, 'https://calendar.google.com/calendar/event?eid=example');
  assert.equal(view.today[0].end, '2026-11-26T01:00:00+13:00');
  assert.equal(view.all[3].start, null);
  assert.deepEqual(meetingMetadata({ description: 'Start: 2026-11-26T09:00:00+13:00\nEnd: Unconfirmed' }).errors, []);
  assert.equal(meetingMetadata({ description: 'Start: 2026-11-26T09:00:00+13:00\nEnd: Unconfirmed' }).provisional, true);
  assert.equal(meetingMetadata({ description: 'Start: 2026-11-26T09:00:00+13:00\nStatus: Tentative' }).provisional, true);
  assert.equal(meetingMetadata({ description: 'Start: 2026-11-26T09:00:00+13:00\nEnd: unspecified' }).provisional, false);
});

test('completion is shared, suppresses duplicate clicks and refreshes verified cards', async () => {
  const originalFetch = globalThis.fetch;
  const updates = [], dashboard = [];
  const unsubscribe = subscribe(state => updates.push({ completing: state.completing.size, data: state.data, error: state.actionError }));
  const unsubscribeDashboard = subscribe(state => dashboard.push({ completing: state.completing.size, data: state.data, error: state.actionError }));
  const item = { id: 'a'.repeat(24), listId: 'b'.repeat(24) };
  const now = new Date().toISOString();
  let release, writes = 0, reads = 0, completed = false;
  globalThis.fetch = async (_url, options) => {
    if (options.method === 'POST') {
      writes++;
      assert.equal(options.headers['x-planner-csrf'], 'test-csrf');
      assert.deepEqual(JSON.parse(options.body), { listId: item.listId });
      await new Promise(resolve => { release = resolve; });
      completed = true;
      return { ok: true, json: async () => ({ status: 'ok' }) };
    }
    reads++;
    return { ok: true, json: async () => ({ status: 'ok', fetchedAt: now, writeAvailable: true,
      lists: completed ? [{ role: 'done', id: 'c'.repeat(24), cards: [{ ...item, dueComplete: true,
        completedAt: now, completionActivity: 'verified' }] }] : [] }) };
  };
  try {
    configureCompletion('/api/', () => 'test-csrf');
    await refreshData('/api/');
    const first = completeCard(item), duplicate = completeCard(item);
    await Promise.resolve();
    assert.equal(writes, 1);
    assert.equal(updates.at(-1).completing, 1);
    assert.equal(dashboard.at(-1).completing, 1);
    release();
    await Promise.all([first, duplicate]);
    assert.equal(reads, 2);
    assert.equal(updates.at(-1).error, '');
    assert.equal(dashboard.at(-1).data.lists[0].cards[0].id, item.id);
    assert.equal(dashboard.at(-1).completing, 0);
  } finally {
    unsubscribe(); unsubscribeDashboard(); globalThis.fetch = originalFetch;
  }
});

test('failed completion refreshes actual state and reports the failure to both views', async () => {
  const originalFetch = globalThis.fetch, originalWarn = console.warn;
  const updates = [], dashboard = [];
  const unsubscribe = subscribe(state => updates.push({ data: state.data, error: state.actionError }));
  const unsubscribeDashboard = subscribe(state => dashboard.push({ data: state.data, error: state.actionError }));
  const item = { id: 'a'.repeat(24), listId: 'b'.repeat(24) };
  let writes = 0;
  globalThis.fetch = async (_url, options) => {
    if (options.method === 'POST') {
      writes++;
      return { ok: false, json: async () => ({ error: 'Not marked complete in general DONE. Refresh and retry.' }) };
    }
    return { ok: true, json: async () => ({ status: 'ok', fetchedAt: new Date().toISOString(), writeAvailable: true,
      lists: [{ id: 'c'.repeat(24), role: 'done', cards: [{ ...item, dueComplete: false }] }] }) };
  };
  console.warn = () => {};
  try {
    configureCompletion('/api/', () => 'test-csrf');
    await refreshData('/api/');
    await completeCard(item);
    assert.equal(writes, 1);
    assert.match(updates.at(-1).error, /Not marked complete/);
    assert.equal(dashboard.at(-1).error, updates.at(-1).error);
    assert.equal(dashboard.at(-1).data.lists[0].cards[0].dueComplete, false);
    globalThis.fetch = async () => ({ ok: true, json: async () => ({
      status: 'ok', fetchedAt: new Date().toISOString(), writeAvailable: false, lists: []
    }) });
    await refreshData('/api/');
    await completeCard(item);
    assert.equal(writes, 1, 'read-only fallback does not send a completion request');
  } finally {
    unsubscribe(); unsubscribeDashboard(); globalThis.fetch = originalFetch; console.warn = originalWarn;
  }
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
