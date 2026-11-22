const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const session = require('express-session');
const { createModuleRouter } = require('./app');
const { parseMetadata } = require('./teachingDayTrello');
const owner = '11111111-1111-4111-8111-111111111111';
const boardId = '6b0286099da18b3599a6940e', listId = '6b02860d27edaa3359a950a5';
const metadata = overrides => ({
  schema_version: 1, teaching_date: '2026-11-23', session_slot: 'p2', class_key: 'JPI',
  session_type: 'teaching', display_name: 'JPI - JuniorDTECH', start_time: '10:00', end_time: '11:00',
  lesson_title: 'Binary Piano', preparation_status: 'Ready', home_list: listId, ...overrides
});
const description = value => 'Preparation and activities remain readable.\n\n```whs-teaching-session-v1\n' +
  JSON.stringify(value, null, 2) + '\n```\n\n[Worksheet](https://example.test/worksheet)';
const card = (id, value) => ({ id: id.repeat(24), idList: listId, name: 'A deliberately unrelated card title',
  desc: description(value), url: 'https://trello.com/c/AbCd' + id.repeat(4) + '/teaching',
  closed: false, dateLastActivity: '2026-11-22T05:00:00Z' });

async function fixture(t, overrides = {}) {
  const state = { user: { id: owner, roles: ['Teacher'] }, calls: [], queries: [],
    cards: [card('a', metadata()), card('b', metadata({ session_slot: 'whanau', class_key: '9WHAU',
      session_type: 'whanau', display_name: 'Whanau 9WHAU', start_time: '08:45', end_time: '09:00', lesson_title: 'Whanau routine' }))],
    env: { TEACHER_PLANNER_TRELLO_OWNER_ID: owner, TEACHER_PLANNER_TRELLO_API_KEY: 'c'.repeat(32),
      TEACHER_PLANNER_TRELLO_TOKEN: 'd'.repeat(64), TEACHER_PLANNER_TEACHING_TRELLO_BOARD_ID: boardId,
      TEACHER_PLANNER_TEACHING_TRELLO_LIST_ID: listId }, ...overrides };
  const app = express();
  app.use(session({ secret: 'synthetic-teaching-day-test', resave: false, saveUninitialized: false }));
  app.use((req, res, next) => { req.user = state.user; next(); });
  app.use(createModuleRouter({ env: state.env, query: async (sql) => { state.queries.push(sql); return { rows: [] }; },
    teachingDayTrello: { fetchImpl: async (url, request) => {
      state.calls.push({ url, request });
      if (state.failure) return new Response('', { status: state.failure });
      if (state.networkFailure) throw new Error(state.env.TEACHER_PLANNER_TRELLO_TOKEN);
      const path = new URL(url).pathname;
      if (path.startsWith('/1/tokens/')) return Response.json({ permissions: [
        { modelType: 'Board', idModel: state.grantedBoard || boardId, read: true, write: Boolean(state.writeToken) }
      ] });
      if (path === '/1/boards/' + boardId) return Response.json({ id: boardId, closed: false });
      if (path === '/1/lists/' + listId) return Response.json({ id: listId,
        idBoard: state.wrongBoard ? 'f'.repeat(24) : boardId, name: state.listName || 'CURRENT TEACHING DAY', closed: false });
      assert.equal(path, '/1/lists/' + listId + '/cards');
      return Response.json(state.cards);
    } } }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = 'http://127.0.0.1:' + server.address().port + '/api/planner/';
  const auth = await fetch(base + 'session'), { csrf } = await auth.json();
  const headers = { cookie: auth.headers.get('set-cookie').split(';')[0], 'x-planner-csrf': csrf };
  const call = (path = 'teaching-day-trello/2026-11-23', options = {}) => fetch(base + path, { headers, ...options });
  return { state, call };
}

test('versioned teaching metadata is strict, handles CRLF, and preserves the remaining description', () => {
  const parsed = parseMetadata(description(metadata()).replace(/\n/g, '\r\n'));
  assert.equal(parsed.metadata.class_key, 'JPI');
  assert.ok(parsed.description.includes('Preparation and activities'));
  assert.ok(parsed.description.includes('[Worksheet]'));
  assert.ok(!parsed.description.includes('schema_version'));
  for (const value of [
    { schema_version: 2 }, { teaching_date: '2026-02-30' }, { session_slot: 'p6' },
    { session_type: 'meeting' }, { session_type: 'whanau' }, { class_key: 'jpi' },
    { end_time: '09:00' }, { start_time: '24:00' }, { home_list: 'a title instead of an ID' }, { extra: 'not allowed' }
  ]) assert.throws(() => parseMetadata(description(metadata(value))));
  assert.throws(() => parseMetadata('A card title and labels are not metadata.'));
  assert.throws(() => parseMetadata(description(metadata()) + '\n' + description(metadata())));
});

test('read-only feed filters student-facing sessions and sorts by timetable slot, not card title or list order', async t => {
  const { state, call } = await fixture(t);
  state.cards.push(card('e', metadata({ session_type: 'observation' })), card('f', metadata({ teaching_date: '2026-11-24' })));
  const response = await call(), result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(result.cards.map(card => card.metadata.class_key), ['9WHAU', 'JPI']);
  assert.equal(result.cards[1].metadata.lesson_title, 'Binary Piano');
  assert.equal(result.cards[1].resources[0].url, 'https://example.test/worksheet');
  assert.equal(result.issues.length, 1);
  assert.ok(!JSON.stringify(result).includes(state.env.TEACHER_PLANNER_TRELLO_TOKEN));
  assert.ok(!JSON.stringify(result).includes('unrelated card title'));
  assert.equal(state.calls.length, 4);
  assert.ok(state.calls.every(({ url, request }) => request.method === 'GET' && request.redirect === 'error' &&
    new URL(url).origin === 'https://api.trello.com' && !new URL(url).searchParams.has('token') &&
    !new URL(url).searchParams.has('key')));
  assert.equal(state.queries.length, 0, 'the feed has no database read/write dependency');
  state.cards[0].desc = description(metadata({ preparation_status: 'Updated outside Planner' }));
  assert.equal((await (await call()).json()).cards[1].metadata.preparation_status, 'Updated outside Planner');
  assert.equal((await call(undefined, { method: 'PUT' })).status, 405);
  assert.equal(state.calls.length, 8, 'refresh reads only; PUT makes no Trello call');
});

test('invalid and duplicate session metadata is reported instead of matching a card by guesswork', async t => {
  const { state, call } = await fixture(t);
  state.cards.push(card('e', metadata()), { ...card('f', metadata()), desc: 'No metadata' });
  const result = await (await call()).json();
  assert.deepEqual(result.cards.map(card => card.metadata.class_key), ['9WHAU']);
  assert.equal(result.issues.length, 3);
  assert.equal(result.issues.filter(issue => issue.message.includes('Duplicate')).length, 2);
  state.cards = [];
  assert.equal((await (await call()).json()).status, 'empty');
});

test('anonymous, student and other-owner requests cannot read private cards; absent config makes no upstream requests', async t => {
  const { state, call } = await fixture(t);
  state.user = null; assert.equal((await call()).status, 401);
  state.user = { id: owner, roles: ['Student'] }; assert.equal((await call()).status, 403);
  state.user = { id: '22222222-2222-4222-8222-222222222222', roles: ['ADMIN'] };
  assert.equal((await call()).status, 403);
  state.user = { id: owner, roles: ['Teacher'] };
  delete state.env.TEACHER_PLANNER_TEACHING_TRELLO_BOARD_ID; delete state.env.TEACHER_PLANNER_TEACHING_TRELLO_LIST_ID;
  assert.equal((await (await call()).json()).status, 'not_configured');
  assert.equal((await call('teaching-day-trello/2026-02-30')).status, 400);
  assert.equal(state.calls.length, 0);
});

test('board/list mismatch, write tokens and missing board grants cannot select another list', async t => {
  const { state, call } = await fixture(t);
  state.writeToken = true; assert.equal((await call()).status, 403);
  assert.equal(state.calls.length, 2);
  state.writeToken = false; state.grantedBoard = 'f'.repeat(24);
  assert.equal((await call()).status, 403);
  state.grantedBoard = boardId; state.wrongBoard = true;
  assert.equal((await call()).status, 409);
  state.wrongBoard = false; state.listName = 'TO DO';
  assert.equal((await call()).status, 409);
  assert.ok(!state.calls.some(({ url }) => new URL(url).pathname.endsWith('/cards')));
});

test('upstream and malformed-link failures are explicit, credential-safe, and cannot block original notes', async t => {
  const { state, call } = await fixture(t);
  for (const status of [401, 429]) {
    state.failure = status;
    const response = await call();
    assert.equal(response.status, 502);
    assert.match((await response.json()).error, status === 401 ? /permission.*expired/ : /rate-limiting/);
  }
  state.failure = null; state.networkFailure = true;
  assert.ok(!(await (await call()).text()).includes(state.env.TEACHER_PLANNER_TRELLO_TOKEN));
  state.networkFailure = false; state.cards[0].url = 'https://attacker.example/c/AbCd1234';
  assert.equal((await call()).status, 502);
  const original = await call('2026/period/2026-11-23_p1');
  assert.equal(original.status, 200);
  assert.equal((await original.json()).revision, 0);
  assert.ok(!state.queries.some(sql => /INSERT|UPDATE|DELETE/.test(sql)));
});
