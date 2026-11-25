const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createTodoTrelloRouter } = require('./todoTrello');

const owner = '11111111-1111-4111-8111-111111111111';
const board = 'a'.repeat(24), urgent = 'b'.repeat(24), todo = 'c'.repeat(24), done = 'd'.repeat(24);
const env = { TEACHER_PLANNER_TRELLO_OWNER_ID: owner, TEACHER_PLANNER_TRELLO_API_KEY: 'e'.repeat(32),
  TEACHER_PLANNER_TRELLO_TOKEN: 'f'.repeat(64) };
const makeCard = (id, idList, name) => ({ id, idList, idBoard: board, name, desc: 'Private task',
  due: null, start: null, dueComplete: false, pos: 100, url: 'https://trello.com/c/AbCd1234/task',
  closed: false, labels: [{ name: 'HOLA', color: 'green' }] });

async function fixture(t) {
  const state = {
    user: { id: owner }, calls: [], permissions: [{ modelType: 'Board', idModel: '*', read: true, write: false }],
    lists: [{ id: urgent, name: 'URGENT', closed: false }, { id: todo, name: 'TO DO', closed: false },
      { id: done, name: 'DONE', closed: false }, { id: '1'.repeat(24), name: 'TERM 4 — 2026', closed: false }],
    cards: [makeCard('2'.repeat(24), todo, 'Task'), makeCard('3'.repeat(24), todo, 'TEST — ChatGPT Trello Connection')]
  };
  const app = express();
  app.use((req, _res, next) => { req.user = state.user; next(); });
  app.use('/todo', createTodoTrelloRouter({ env, fetchImpl: async (url, options) => {
    state.calls.push({ url, options });
    if (state.failure) return new Response('', { status: state.failure });
    const path = new URL(url).pathname;
    if (path.startsWith('/1/tokens/')) return Response.json({ permissions: state.permissions });
    if (path === '/1/boards/QsFC8J3m') return Response.json({ id: board, shortLink: 'QsFC8J3m', closed: false });
    if (path === '/1/boards/QsFC8J3m/lists') return Response.json(state.lists);
    const match = /^\/1\/lists\/([0-9a-f]{24})\/cards$/.exec(path);
    assert.ok(match);
    return Response.json(state.cards.filter(card => card.idList === match[1]));
  } }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return { state, call: (options = {}) => fetch(`http://127.0.0.1:${server.address().port}/todo`, options) };
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
