const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { groupCards, todayTasks, meetingMetadata, meetingViews, minedStatus, dateKey, refreshData, subscribe,
  configureCompletion, completeCard, writeConnectionMessage } = require('./public/todo-trello');

const card = (id, due = null, extra = {}) => ({ id, due, dueComplete: false, ...extra });

const descendants = node => [node, ...node.children.flatMap(descendants)];
const flush = () => new Promise(resolve => setImmediate(resolve));
function sidebarFixture(preferences = new Map()) {
  function make(tag, text = '') {
    const node = { tag, textContent: text, children: [], attrs: {}, events: {}, style: {
      setProperty(key, value) { this[key] = value; }
    }, isConnected: true, hidden: false, open: false, className: '',
    append(...items) { this.children.push(...items); }, prepend(...items) { this.children.unshift(...items); },
    replaceChildren(...items) { this.children = items; },
    setAttribute(key, value) { this.attrs[key] = value; if (key === 'class') this.className = value; if (key === 'hidden') this.hidden = true; },
    addEventListener(key, handler) { this.events[key] = handler; }, focus() {}, scrollIntoView() {},
    querySelector(selector) { return this.querySelectorAll(selector)[0]; },
    querySelectorAll(selector) {
      return descendants(this).slice(1).filter(child => selector.startsWith('.') ?
        child.className.split(' ').includes(selector.slice(1)) : child.tag === selector);
    },
    get childNodes() { return this.children; }
    };
    node.classList = {
      add(value) { node.className = [...new Set([...node.className.split(' ').filter(Boolean), value])].join(' '); },
      toggle(value, enabled) {
        if (enabled) this.add(value);
        else node.className = node.className.split(' ').filter(name => name !== value).join(' ');
      },
      contains(value) { return node.className.split(' ').includes(value); }
    };
    return node;
  }
  const listeners = new Set(), host = make('div');
  const document = {
    createElement: make, createElementNS: (_namespace, tag) => make(tag), createTextNode: text => make('#text', text),
    addEventListener: (_event, listener) => listeners.add(listener),
    removeEventListener: (_event, listener) => listeners.delete(listener),
    getElementById: () => host, hidden: false
  };
  const now = new Date().toISOString(), item = {
    id: 'a'.repeat(24), title: 'Designated fixture task', labels: [], description: '', due: null,
    dueComplete: false, position: 1, url: 'https://trello.com/c/AbCd1234'
  };
  let completed = false, reads = 0, writes = 0;
  const context = { document, console, Date, Intl, URL, AbortSignal, Set, Map,
    localStorage: { getItem: key => preferences.get(key) || null, setItem: (key, value) => preferences.set(key, value) },
    fetch: async (_url, options) => {
      if (options.method === 'POST') { writes++; completed = true; return { ok: true, json: async () => ({ status: 'ok' }) }; }
      reads++;
      return { ok: true, json: async () => ({ status: 'ok', fetchedAt: now, writeAvailable: true, lists: [
        { id: 'b'.repeat(24), name: 'TO DO', role: 'todo', cards: completed ? [] : [item] },
        { id: 'c'.repeat(24), name: 'DONE', role: 'done', cards: completed ? [{ ...item, dueComplete: true,
          completedAt: now, completionActivity: 'verified' }] : [] },
        { id: 'd'.repeat(24), name: 'MEETINGS / APPOINTMENTS', role: 'meetings', cards: [] },
        { id: 'e'.repeat(24), name: 'MINED', role: 'mined', cards: [] }
      ] }) };
    }
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('./public/todo-trello'), 'utf8'), context);
  vm.runInNewContext(fs.readFileSync(require.resolve('./public/todo-dashboard'), 'utf8'), context);
  return { host, make, context, preferences, listeners, get reads() { return reads; }, get writes() { return writes; } };
}

test('one module sidebar persists across Planner views without refetching or affecting teaching preparation', async () => {
  const f = sidebarFixture();
  Object.assign(f.context, { section: 'cover', dashboardMode: false, week: '2026-11-23',
    api: '/api/', csrf: 'fixture', el: f.make, todoSidebar: undefined });
  const source = fs.readFileSync(require.resolve('./public/planner'), 'utf8');
  vm.runInNewContext(source.slice(source.indexOf('  function updateTodoSidebar()'),
    source.indexOf('  function overviewSchoolEvents(')), f.context);
  f.context.updateTodoSidebar(); await flush();
  const sidebar = f.context.todoSidebar, aside = f.host.querySelector('aside');
  const button = text => descendants(f.host).find(node => node.tag === 'button' && node.textContent === text);
  const width = f.host.querySelector('input');
  width.value = '460'; width.events.input();
  assert.equal(f.host.style['--todo-width'], '460px');
  const groups = f.host.querySelectorAll('details');
  assert.deepEqual(groups.filter(group => group.open).map(group => group.children[0].textContent.split(' (')[0]),
    ['URGENT', 'DUE TODAY']);
  const todo = groups.find(group => group.children[0].textContent.startsWith('TO DO'));
  todo.open = true; todo.events.toggle();
  button('Hide Trello').events.click();
  for (const section of ['year', 'term', 'week', 'period', 'todoDashboard', 'cover']) {
    f.context.section = section; f.context.dashboardMode = section === 'period';
    f.context.updateTodoSidebar();
    assert.equal(f.context.todoSidebar, sidebar);
    assert.equal(aside.hidden, true);
    assert.equal(button('Show Trello').hidden, section === 'todoDashboard');
    assert.equal(f.host.style['--todo-width'], '460px');
  }
  assert.equal(f.reads, 1);
  assert.equal(f.host.querySelectorAll('aside').length, 1);
  button('Show Trello').events.click();
  assert.equal(aside.hidden, false);
  assert.equal(f.host.classList.contains('todo-open'), true);
  assert.equal(f.host.querySelectorAll('details').find(group => group.children[0].textContent.startsWith('TO DO')).open, true);
  sidebar();
  const reloaded = sidebarFixture(f.preferences);
  const dispose = reloaded.context.plannerTodoTrello.mount(reloaded.host, { api: '/api/', getCsrf: () => 'fixture' });
  await flush();
  assert.equal(reloaded.host.querySelector('aside').hidden, false);
  assert.equal(reloaded.host.style['--todo-width'], '460px');
  descendants(reloaded.host).find(node => node.textContent === 'Hide Trello').events.click();
  dispose();
  const hiddenReload = sidebarFixture(f.preferences);
  const hiddenDispose = hiddenReload.context.plannerTodoTrello.mount(hiddenReload.host, { api: '/api/', getCsrf: () => 'fixture' });
  await flush();
  assert.equal(hiddenReload.host.querySelector('aside').hidden, true);
  assert.equal(descendants(hiddenReload.host).find(node => node.textContent === 'Show Trello').hidden, false);
  hiddenDispose();
});

test('sidebar and dashboard mounts reuse data and reflect checkbox completion and manual refresh together', async () => {
  const f = sidebarFixture(), shared = f.context.plannerTodoTrello;
  const dispose = shared.mount(f.host, { api: '/api/', getCsrf: () => 'fixture' });
  await flush();
  const dashboardHost = f.make('section');
  const disposeDashboard = f.context.plannerTodoDashboard.mount(dashboardHost, { api: '/api/', getCsrf: () => 'fixture' });
  await flush();
  assert.equal(f.reads, 1, 'mounting the dashboard reuses loaded sidebar data');
  const checkbox = f.host.querySelectorAll('input').find(node => node.attrs['aria-label'] === 'Complete: Designated fixture task');
  assert.equal(checkbox.disabled, false);
  checkbox.checked = true; checkbox.events.change({ stopPropagation() {} });
  await flush(); await flush();
  assert.equal(f.writes, 1);
  assert.equal(f.reads, 2, 'completion refreshes the shared data once');
  for (const host of [f.host, dashboardHost]) {
    const done = descendants(host).find(node => node.tag === 'details' && node.children[0].textContent.startsWith('DONE TODAY'));
    assert.ok(descendants(done).some(node => node.textContent === 'Designated fixture task'));
    assert.ok(!descendants(host).some(node => node.attrs['aria-label'] === 'Complete: Designated fixture task'));
  }
  descendants(f.host).find(node => node.textContent === 'Refresh').events.click(); await flush();
  assert.equal(f.reads, 3);
  disposeDashboard(); dispose();
  assert.equal(f.listeners.size, 0);
});

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
