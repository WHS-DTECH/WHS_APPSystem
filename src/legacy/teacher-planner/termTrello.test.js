const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createTermTrelloRouter } = require('./termTrello');

const owner = '11111111-1111-4111-8111-111111111111';
const board = 'a'.repeat(24), list = 'b'.repeat(24);
const env = { TEACHER_PLANNER_TRELLO_OWNER_ID: owner, TEACHER_PLANNER_TRELLO_API_KEY: 'c'.repeat(32),
  TEACHER_PLANNER_TRELLO_TOKEN: 'd'.repeat(64) };
const card = { id: 'e'.repeat(24), idList: list, name: 'NZQA & Assessment', desc: 'Umbrella summary\nReview key dates.',
  due: '2026-11-27T00:00:00.000Z', start: null, url: 'https://trello.com/c/AbCd1234/nzqa-assessment', closed: false, labels: [] };

async function fixture(t, options = {}) {
  const calls = [], state = { user: { id: owner }, listName: 'TERM 4 \u2014 2026', cards: [{ ...card }], ...options };
  const app = express();
  app.use((req, res, next) => { req.user = state.user; next(); });
  app.use('/trello', createTermTrelloRouter({ env: state.env || env, fetchImpl: async (url, request) => {
    calls.push({ url, request });
    if (state.failure) return new Response('', { status: state.failure });
    if (state.networkFailure) throw new Error(env.TEACHER_PLANNER_TRELLO_TOKEN);
    const path = new URL(url).pathname;
    if (path.startsWith('/1/tokens/')) return Response.json({ permissions: state.permissions || [
      { modelType: 'boards', idModel: '*', read: true, write: Boolean(state.writeToken) }
    ] });
    if (path === '/1/boards/QsFC8J3m') return Response.json({ id: board, shortLink: 'QsFC8J3m', closed: false });
    if (path === '/1/boards/QsFC8J3m/lists') return Response.json(state.lists || [
      { id: 'f'.repeat(24), name: 'TO DO', closed: false },
      { id: list, name: state.listName, closed: false },
      { id: '1'.repeat(24), name: 'URGENT', closed: false }
    ]);
    assert.equal(path, '/1/lists/' + list + '/cards');
    return Response.json(state.cards);
  } }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const call = (path = '/2026/4', options = {}) => fetch(`http://127.0.0.1:${server.address().port}/trello` + path, options);
  return { state, calls, call };
}

test('term reads use only the selected fixed-board list and return compact metadata without credentials', async t => {
  const { state, calls, call } = await fixture(t);
  const response = await call();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const result = await response.json();
  assert.equal(result.status, 'ok');
  assert.equal(result.year, 2026);
  assert.equal(result.term, 4);
  assert.deepEqual(result.cards, [{ id: card.id, title: card.name, summary: 'Umbrella summary Review key dates.',
    due: card.due, start: null, url: card.url, labels: [] }]);
  assert.equal(calls.length, 4);
  assert.ok(calls.every(({ url, request }) => request.method === 'GET' && new URL(url).origin === 'https://api.trello.com' &&
    !new URL(url).searchParams.has('key') && !new URL(url).searchParams.has('token') &&
    request.headers.Authorization.includes(env.TEACHER_PLANNER_TRELLO_TOKEN)));
  assert.ok(!JSON.stringify(result).includes(env.TEACHER_PLANNER_TRELLO_TOKEN));
  state.cards[0].desc = 'Changed in Trello ' + 'x'.repeat(500);
  const refreshed = await (await call()).json();
  assert.equal(refreshed.cards[0].summary.length, 400);
  assert.match(refreshed.cards[0].summary, /^Changed in Trello/);
  assert.match(refreshed.cards[0].summary, /\.\.\.$/);
  assert.equal(calls.length, 8, 'refresh reads Trello again, not a Planner copy');
  assert.equal((await call('/2026/4', { method: 'POST' })).status, 404);
  assert.equal(calls.length, 8, 'there is no Trello mutation route');
});

test('label names and colours come from Trello, including multiple and uncoloured labels, and refresh independently of titles', async t => {
  const { state, calls, call } = await fixture(t);
  state.cards[0].labels = [
    { id: '1'.repeat(24), name: 'Reviewed', color: null, idBoard: board },
    { id: '2'.repeat(24), name: 'Assessment', color: 'blue_dark' },
    { id: '3'.repeat(24), name: '', color: 'pink_light' }
  ];
  const first = await (await call()).json();
  assert.deepEqual(first.cards[0].labels, [
    { name: 'Reviewed', color: null }, { name: 'Assessment', color: 'blue_dark' }, { name: '', color: 'pink_light' }
  ]);
  assert.ok(new URL(calls.at(-1).url).searchParams.get('fields').split(',').includes('labels'));
  state.cards[0].labels = [{ name: 'Changed in Trello', color: 'green' }];
  const refreshed = await (await call()).json();
  assert.deepEqual(refreshed.cards[0].labels, [{ name: 'Changed in Trello', color: 'green' }]);
  assert.deepEqual({ ...refreshed.cards[0], labels: first.cards[0].labels }, first.cards[0],
    'label changes do not change titles, summaries, dates or links');
  for (const labels of [undefined, [{ name: 'Unsafe', color: 'red; background: url(secret)' }], [{ name: null, color: 'blue' }]]) {
    state.cards[0].labels = labels;
    assert.equal((await call()).status, 502, 'invalid label metadata fails explicitly');
  }
});

test('capitalized Trello permission models accept read-only Board grants but reject other writes and workspace-only grants', async t => {
  const permissions = [
    { modelType: 'Board', idModel: '*', read: true, write: false },
    { modelType: 'Organization', idModel: '*', read: true, write: false }
  ];
  const { call, calls } = await fixture(t, { permissions });
  assert.equal((await call()).status, 200);
  assert.equal(calls.length, 4);
  permissions[1].write = true;
  assert.equal((await call()).status, 502);
  assert.equal(calls.length, 6, 'a workspace write grant prevents list and card reads');
  permissions[1].write = false;
  permissions.shift();
  assert.equal((await call()).status, 502);
  assert.equal(calls.length, 8, 'workspace read permission alone cannot authorise board reads');
});

test('year and term select matching lists without carrying dates or creating missing lists', async t => {
  const { state, call } = await fixture(t);
  for (const [year, term, name] of [[2027, 4, 'TERM 4 \u2014 2027'], [2028, 1, ' term 1 - 2028 ']]) {
    state.listName = name;
    const result = await (await call(`/${year}/${term}`)).json();
    assert.equal(result.status, 'ok');
    assert.equal(result.year, year);
    assert.equal(result.term, term);
    assert.equal(result.cards[0].due, card.due, 'recorded Trello dates are not rolled forward');
  }
  state.listName = 'TERM 4 \u2014 2026';
  const missing = await (await call('/2027/4')).json();
  assert.equal(missing.status, 'missing');
  assert.deepEqual(missing.cards, []);
});

test('empty, archived and ambiguous lists never fall back to operational tasks', async t => {
  const { state, calls, call } = await fixture(t);
  state.cards = [];
  assert.equal((await (await call()).json()).status, 'empty');
  state.lists = [{ id: list, name: state.listName, closed: true }];
  calls.length = 0;
  assert.equal((await (await call()).json()).status, 'missing');
  assert.equal(calls.length, 3, 'no cards are fetched without a matching active list');
  state.lists = [{ id: list, name: state.listName, closed: false },
    { id: 'f'.repeat(24), name: 'TERM 4 - 2026', closed: false }];
  assert.equal((await call()).status, 409);
});

test('only the configured school owner can read; configuration and input failures make no Trello requests', async t => {
  const { state, calls, call } = await fixture(t);
  state.user = { id: '22222222-2222-4222-8222-222222222222', roles: ['ADMIN'] };
  assert.equal((await call()).status, 403);
  state.user = null;
  assert.equal((await call()).status, 403);
  state.user = { id: owner };
  for (const path of ['/2026/5', '/1999/1', '/2026/01']) assert.equal((await call(path)).status, 400);
  assert.equal(calls.length, 0);
  const unconfigured = await fixture(t, { env: {} });
  assert.equal((await unconfigured.call()).status, 503);
  assert.equal(unconfigured.calls.length, 0);
});

test('write-capable tokens, unsafe card links and upstream failures are explicit and leak no token', async t => {
  const { state, call } = await fixture(t);
  state.writeToken = true;
  assert.equal((await call()).status, 502);
  state.writeToken = false;
  for (const invalid of [{ url: 'javascript:alert(1)' }, { url: 'https://attacker.example/c/AbCd1234' },
    { idList: 'f'.repeat(24) }, { due: 'not-a-date' }]) {
    state.cards = [{ ...card, ...invalid }];
    assert.equal((await call()).status, 502);
  }
  for (const failure of [401, 429]) {
    state.failure = failure;
    const response = await call();
    assert.equal(response.status, 502);
    assert.match((await response.json()).error, failure === 401 ? /permission.*expired/ : /rate-limiting/);
  }
  state.failure = null; state.networkFailure = true;
  const response = await call();
  assert.equal(response.status, 502);
  assert.ok(!(await response.text()).includes(env.TEACHER_PLANNER_TRELLO_TOKEN));
});
