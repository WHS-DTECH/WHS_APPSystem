const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const session = require('express-session');
const { createTodoTrelloRouter, completionToday } = require('./todoTrello');
const { createModuleRouter } = require('./app');

const owner = '11111111-1111-4111-8111-111111111111';
const board = 'a'.repeat(24), urgent = 'b'.repeat(24), todo = 'c'.repeat(24), done = 'd'.repeat(24);
const env = { TEACHER_PLANNER_TRELLO_OWNER_ID: owner, TEACHER_PLANNER_TRELLO_API_KEY: 'e'.repeat(32),
  TEACHER_PLANNER_TRELLO_TOKEN: 'f'.repeat(64) };
const makeCard = (id, idList, name) => ({ id, idList, idBoard: board, name, desc: 'Private task',
  due: null, start: null, dueComplete: false, pos: 100, url: 'https://trello.com/c/AbCd1234/task',
  closed: false, labels: [{ name: 'HOLA', color: 'green' }] });

async function fixture(t) {
  const state = {
    env: { ...env },
    user: { id: owner }, calls: [], permissions: [{ modelType: 'Board', idModel: '*', read: true, write: false }],
    writePermissions: [{ modelType: 'Board', idModel: board, read: true, write: true }],
    lists: [{ id: urgent, name: 'URGENT', closed: false }, { id: todo, name: 'TO DO', closed: false },
      { id: done, name: 'DONE', closed: false }, { id: '1'.repeat(24), name: 'TERM 4 — 2026', closed: false }],
    cards: [makeCard('2'.repeat(24), todo, 'Task'), makeCard('3'.repeat(24), todo, 'TEST — ChatGPT Trello Connection')]
  };
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = state.user; next(); });
  app.use('/todo', createTodoTrelloRouter({ env: state.env, fetchImpl: async (url, options) => {
    state.calls.push({ url, options });
    if (state.failure) return new Response('', { status: state.failure });
    const path = new URL(url).pathname;
    if (path.startsWith('/1/tokens/')) return Response.json({ permissions:
      path.endsWith(state.env.TEACHER_PLANNER_TRELLO_WRITE_TOKEN || '!') ? state.writePermissions : state.permissions });
    if (path === '/1/boards/QsFC8J3m') return Response.json({ id: board, shortLink: 'QsFC8J3m', closed: false });
    if (path === '/1/boards/QsFC8J3m/lists') return Response.json(state.lists);
    const cardMatch = /^\/1\/cards\/([0-9a-f]{24})$/.exec(path);
    if (cardMatch) {
      const card = state.cards.find(item => item.id === cardMatch[1]);
      if (!card) return new Response('', { status: 404 });
      if (options.method === 'PUT') {
        if (state.holdWrite) await state.holdWrite;
        const values = JSON.parse(options.body);
        assert.ok(Object.keys(values).length === 1 && ('dueComplete' in values || 'idList' in values));
        if ('dueComplete' in values && !state.ignoreComplete) card.dueComplete = values.dueComplete;
        if ('idList' in values) card.idList = values.idList;
        if (state.partial === 'move' && 'idList' in values) card.dueComplete = false;
        if (state.partial === 'complete' && 'dueComplete' in values ||
            state.partial === 'move' && 'idList' in values || state.lostResponse && 'idList' in values) {
          return new Response('', { status: 503 });
        }
      }
      return Response.json(card);
    }
    const match = /^\/1\/lists\/([0-9a-f]{24})\/cards$/.exec(path);
    assert.ok(match);
    return Response.json(state.cards.filter(card => card.idList === match[1]));
  } }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/todo`;
  return { state, call: (options = {}) => fetch(base, options),
    complete: (id, listId, options = {}) => fetch(base + '/cards/' + id + '/complete', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listId }), ...options
    }) };
}

test('owner can read selected lists without reference lists, test cards, credentials or writes', async t => {
  const { state, call } = await fixture(t);
  const response = await call();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json();
  assert.deepEqual(body.lists.map(list => [list.role, list.cards.length]), [['urgent', 0], ['todo', 1], ['done', 0]]);
  assert.equal(body.lists[1].cards[0].description, 'Private task');
  assert.ok(!JSON.stringify(body).includes(env.TEACHER_PLANNER_TRELLO_TOKEN));
  assert.ok(state.calls.every(call => call.options.method === 'GET'));
  assert.ok(!state.calls.some(call => call.url.includes('1'.repeat(24) + '/cards')));
  const count = state.calls.length;
  assert.equal((await call({ method: 'POST' })).status, 404);
  assert.equal(state.calls.length, count);
});

test('only the designated completion test cards are excluded from all Planner lists', async t => {
  const { state, call } = await fixture(t);
  const filed = '5'.repeat(24);
  state.lists.push({ id: filed, name: 'DONE – HOLA', closed: false });
  state.cards.push(makeCard('6b07a498a5404bae757ab359', todo, 'Renamed test task'),
    makeCard('6b07a49a5c7787a43ecd3efc', filed, 'Renamed test meeting'),
    makeCard('6'.repeat(24), done, 'TEST — Phase 4 Task Completion'));
  const body = await (await call()).json();
  const cards = body.lists.flatMap(list => list.cards);
  assert.deepEqual(cards.map(card => card.id), ['2'.repeat(24), '6'.repeat(24)]);
});

test('other accounts, including administrators, and write-capable tokens cannot read tasks', async t => {
  const { state, call } = await fixture(t);
  state.user = { id: '22222222-2222-4222-8222-222222222222', roles: ['ADMIN'] };
  assert.equal((await call()).status, 403);
  assert.equal(state.calls.length, 0);
  state.user = { id: owner };
  state.permissions[0].write = true;
  assert.equal((await call()).status, 502);
  assert.equal(state.calls.length, 2);
});

test('filed MISCELLANEOUS tasks remain accessible without entering outstanding lists', async t => {
  const { state, call } = await fixture(t);
  const filed = '5'.repeat(24);
  state.lists.push({ id: filed, name: 'DONE – MISCELLANEOUS', closed: false });
  state.cards.push(makeCard('6'.repeat(24), filed, 'Filed task'));
  const body = await (await call()).json();
  const list = body.lists.find(item => item.id === filed);
  assert.equal(list.role, 'filed');
  assert.equal(list.cards[0].title, 'Filed task');
});

test('MINED reference cards are returned only through the authorised read-only board reader', async t => {
  const { state, call } = await fixture(t);
  const mined = '7'.repeat(24), reference = makeCard('8'.repeat(24), mined, 'Consultation');
  reference.due = '2026-11-26T10:59:00Z';
  reference.desc = 'Type: MINED DEADLINE\nStatus: Optional';
  state.lists.push({ id: mined, name: 'MINED – CURRICULUM UPDATES', closed: false });
  state.cards.push(reference);
  const response = await call();
  assert.equal(response.status, 200);
  const list = (await response.json()).lists.find(item => item.role === 'mined');
  assert.equal(list.cards[0].due, reference.due);
  assert.equal(list.cards[0].description, reference.desc);
  assert.ok(state.calls.every(call => call.options.method === 'GET'));
  state.user = { id: '22222222-2222-4222-8222-222222222222', roles: ['ADMIN'] };
  assert.equal((await call()).status, 403);
});

test('write access is separate, owner-only, and preserves read-only fallback', async t => {
  const { state, call, complete } = await fixture(t);
  const id = state.cards[0].id;
  let result = await (await call()).json();
  assert.equal(result.writeAvailable, false);
  assert.equal(result.writeStatus, 'not-configured');
  assert.equal((await complete(id, todo)).status, 503);
  state.env.TEACHER_PLANNER_TRELLO_WRITE_TOKEN = 'invalid';
  assert.equal((await (await call()).json()).writeStatus, 'invalid-configuration');
  state.env.TEACHER_PLANNER_TRELLO_WRITE_TOKEN = '9'.repeat(64);
  state.writePermissions[0].write = false;
  result = await (await call()).json();
  assert.equal(result.writeAvailable, false);
  assert.equal(result.writeStatus, 'permission-unavailable');
  assert.equal((await complete(id, todo)).status, 503);
  state.writePermissions[0].write = true;
  result = await (await call()).json();
  assert.equal(result.writeAvailable, true);
  assert.equal(result.writeStatus, 'available');
  state.user = { id: '22222222-2222-4222-8222-222222222222', roles: ['ADMIN'] };
  const count = state.calls.length;
  assert.equal((await complete(id, todo)).status, 403);
  assert.equal(state.calls.length, count);
  assert.ok(!state.calls.some(call => call.options.method === 'PUT'));
});

test('tasks and meetings are completed in place while preserving all other card data', async t => {
  const { state, complete } = await fixture(t);
  state.env.TEACHER_PLANNER_TRELLO_WRITE_TOKEN = '9'.repeat(64);
  const meetingList = '1'.repeat(24);
  state.lists.push({ id: meetingList, name: 'MEETINGS / APPOINTMENTS', closed: false });
  const meeting = makeCard('4'.repeat(24), meetingList, 'Meeting');
  meeting.desc = 'Start: 2026-11-27T09:00:00+13:00\nSource: https://example.test';
  meeting.attachments = ['attachment']; meeting.checklists = ['checklist']; meeting.comments = ['comment'];
  state.cards.push(meeting);
  for (const card of [state.cards[0], meeting]) {
    const before = structuredClone(card);
    const response = await complete(card.id, card.idList);
    assert.equal(response.status, 200);
    assert.deepEqual(card, { ...before, dueComplete: true, idList: done });
  }
  const writes = state.calls.filter(call => call.options.method === 'PUT');
  assert.equal(writes.length, 4);
  assert.ok(writes.every(call => !call.url.includes(state.env.TEACHER_PLANNER_TRELLO_WRITE_TOKEN) &&
    !call.url.includes(state.env.TEACHER_PLANNER_TRELLO_API_KEY)));
  assert.equal((await complete(meeting.id, meetingList)).status, 200);
  assert.equal(state.calls.filter(call => call.options.method === 'PUT').length, 4);
});

test('MINED, filed, changed-list and foreign-board cards cannot be completed', async t => {
  const { state, complete } = await fixture(t);
  state.env.TEACHER_PLANNER_TRELLO_WRITE_TOKEN = '9'.repeat(64);
  const mined = '7'.repeat(24), filed = '5'.repeat(24);
  state.lists.push({ id: mined, name: 'MINED – CURRICULUM UPDATES', closed: false },
    { id: filed, name: 'DONE – HOLA', closed: false });
  const reference = makeCard('8'.repeat(24), mined, 'Reference');
  state.cards.push(reference);
  assert.equal((await complete(reference.id, mined)).status, 409);
  assert.equal((await complete(reference.id, todo)).status, 409);
  assert.equal((await complete(reference.id, filed)).status, 409);
  state.cards[0].idBoard = '6'.repeat(24);
  assert.equal((await complete(state.cards[0].id, todo)).status, 409);
  assert.equal(state.calls.filter(call => call.options.method === 'PUT').length, 0);
});

test('partial and uncertain writes report actual state and retry without duplicate cards', async t => {
  const { state, complete } = await fixture(t);
  state.env.TEACHER_PLANNER_TRELLO_WRITE_TOKEN = '9'.repeat(64);
  const card = state.cards[0], id = card.id;
  state.partial = 'complete';
  let response = await complete(id, todo);
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /marked complete in the original list/);
  state.partial = '';
  assert.equal((await complete(id, todo)).status, 200);
  assert.equal(card.idList, done);
  assert.equal(card.dueComplete, true);
  assert.equal(state.cards.filter(item => item.id === id).length, 1);
  card.idList = todo; card.dueComplete = false; state.partial = 'move';
  response = await complete(id, todo);
  assert.match((await response.json()).error, /not marked complete in general DONE/);
  state.partial = '';
  assert.equal((await complete(id, done)).status, 200);
  assert.equal(card.dueComplete, true);
  card.idList = todo; card.dueComplete = false; state.lostResponse = true;
  response = await complete(id, todo);
  assert.match((await response.json()).error, /marked complete in general DONE/);
  state.lostResponse = false;
  const writes = state.calls.filter(call => call.options.method === 'PUT').length;
  assert.equal((await complete(id, todo)).status, 200);
  assert.equal(state.calls.filter(call => call.options.method === 'PUT').length, writes);
});

test('duplicate completion requests for one card are rejected while a write is in flight', async t => {
  const { state, complete } = await fixture(t);
  state.env.TEACHER_PLANNER_TRELLO_WRITE_TOKEN = '9'.repeat(64);
  let release;
  state.holdWrite = new Promise(resolve => { release = resolve; });
  const first = complete(state.cards[0].id, todo);
  while (!state.calls.some(call => call.options.method === 'PUT')) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal((await complete(state.cards[0].id, todo)).status, 409);
  release();
  assert.equal((await first).status, 200);
  assert.equal(state.calls.filter(call => call.options.method === 'PUT').length, 2);
});

test('a card is never moved if Trello does not confirm its completion flag', async t => {
  const { state, complete } = await fixture(t);
  state.env.TEACHER_PLANNER_TRELLO_WRITE_TOKEN = '9'.repeat(64);
  state.ignoreComplete = true;
  const response = await complete(state.cards[0].id, todo);
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /not marked complete in the original list/);
  assert.equal(state.cards[0].idList, todo);
  assert.equal(state.calls.filter(call => call.options.method === 'PUT').length, 1);
});

test('completion endpoint inherits the Planner session CSRF check', async t => {
  const app = express();
  app.use(session({ secret: 'mock-csrf-completion-test', resave: false, saveUninitialized: false }));
  app.use((req, _res, next) => { req.user = { id: owner, roles: ['Teacher'] }; next(); });
  app.use(createModuleRouter({ env: { ...env }, query: async () => ({ rows: [] }) }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/planner/`;
  const auth = await fetch(base + 'session'), csrf = (await auth.json()).csrf;
  const cookie = auth.headers.get('set-cookie').split(';')[0];
  const call = token => fetch(base + 'todo-trello/cards/' + '2'.repeat(24) + '/complete', {
    method: 'POST', headers: { cookie, 'Content-Type': 'application/json', 'x-planner-csrf': token },
    body: JSON.stringify({ listId: todo })
  });
  assert.equal((await call('wrong')).status, 403);
  assert.equal((await call(csrf)).status, 503);
});

test('ambiguous lists, unsafe cards, expired tokens and rate limits fail explicitly', async t => {
  const { state, call } = await fixture(t);
  state.lists.push({ id: '4'.repeat(24), name: 'to do', closed: false });
  assert.match((await (await call()).json()).error, /duplicate/);
  state.lists.pop();
  state.cards[0].url = 'https://example.com/c/AbCd1234';
  assert.equal((await call()).status, 502);
  state.failure = 401;
  assert.match((await (await call()).json()).error, /expired/);
  state.failure = 429;
  assert.match((await (await call()).json()).error, /rate-limiting/);
});

test('completion today requires a matching, current Trello completion action', async () => {
  const id = '1'.repeat(24), now = new Date('2026-11-26T04:00:00Z');
  const action = { type: 'updateCard', date: '2026-11-25T12:00:00Z',
    data: { card: { id, dueComplete: true }, old: { dueComplete: false } } };
  assert.deepEqual(await completionToday(async () => [action], { id, dueComplete: true }, now),
    { completedAt: action.date, completionActivity: 'verified' });
  assert.equal((await completionToday(async () => [{ ...action, date: '2026-11-24T12:00:00Z' }],
    { id, dueComplete: true }, now)).completionActivity, 'unknown');
  assert.equal((await completionToday(async () => [action], { id, dueComplete: false }, now)).completionActivity, 'unknown');
  await assert.rejects(completionToday(async () => [{ ...action, data: { card: { id: '2'.repeat(24) } } }],
    { id, dueComplete: true }, now), /Invalid card activity/);
});

test('completion activity follows pages until it finds a verified transition', async () => {
  const id = '1'.repeat(24), date = '2026-11-26T04:00:00Z', pages = [];
  const unrelated = { type: 'updateCard', date, data: { card: { id }, old: { name: 'previous' } } };
  const result = await completionToday(async (_path, query) => {
    pages.push(query.page);
    return query.page === '0' ? Array.from({ length: 100 }, () => unrelated) :
      [{ type: 'updateCard', date, data: { card: { id, dueComplete: true }, old: { dueComplete: false } } }];
  }, { id, dueComplete: true }, new Date(date));
  assert.deepEqual(pages, ['0', '1']);
  assert.equal(result.completionActivity, 'verified');
});
