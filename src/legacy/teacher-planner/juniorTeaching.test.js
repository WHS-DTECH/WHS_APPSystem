const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const session = require('express-session');
const { createPlannerRouter } = require('./planner');

const owner = '11111111-1111-4111-8111-111111111111';
const board = 'b'.repeat(24);
const lists = [
  { id: '6b08c7950c803f3d6de1804f', idBoard: board, name: 'JuniorDTECH', closed: false },
  { id: '2'.repeat(24), idBoard: board, name: 'Unit Plans', closed: false },
  { id: '3'.repeat(24), idBoard: board, name: 'Licence Kit Plans', closed: false }
];
const unit = title => `Type: Unit lesson\nUnit: Binary & Data\nLesson: ${title}`;
const kit = title => `Type: Licence Kit activity\nPlan: Minecraft Builder Kit\nActivity: ${title}`;
const routine = 'Type: Routine\nPlan: Typing Kit\nActivity: Typing Kit\nScheduling: Recurring';
function card(id, list, name, desc, short) {
  return { id: id.repeat(24), idList: list.id, name, desc, url: 'https://trello.com/c/' + short, closed: false, pos: 100000 };
}
function cards() {
  return [
    card('a', lists[0], 'Typing Kit', routine + '\nLibrary card: https://trello.com/c/typing', 'ordertyping'),
    card('b', lists[0], 'Binary Piano', unit('Binary Piano') + '\nLibrary card: https://trello.com/c/piano', 'orderpiano'),
    card('c', lists[0], 'Encoding Binary', unit('Encoding Binary') + '\nLibrary card: https://trello.com/c/encoding', 'orderencoding'),
    card('d', lists[0], 'Blueprint', kit('Blueprint') + '\nLibrary card: https://trello.com/c/blueprint', 'orderblueprint'),
    card('e', lists[0], 'Walkthrough', kit('Walkthrough') + '\nSource: https://trello.com/c/walkthrough', 'orderwalkthrough'),
    card('f', lists[1], 'Binary Piano', unit('Binary Piano') + '\nInstructions: Original source', 'piano'),
    card('0', lists[1], 'Encoding Binary', unit('Encoding Binary'), 'encoding'),
    card('4', lists[2], 'Typing Kit', routine, 'typing'),
    card('5', lists[2], 'Blueprint', kit('Blueprint'), 'blueprint'),
    card('6', lists[2], 'Walkthrough', kit('Walkthrough'), 'walkthrough')
  ].map((item, index) => ({ ...item, pos: (index + 1) * 100 }));
}
async function fixture(t) {
  const state = { user: { id: owner, roles: [] }, lists: lists.map(item => ({ ...item })),
    cards: cards(), progress: new Map(), sessions: new Map(), middleProgress: new Map(), middleSessions: new Map(), requests: [], queries: [] };
  const env = { TEACHER_PLANNER_TRELLO_OWNER_ID: owner, TEACHER_PLANNER_TEACHING_TRELLO_BOARD_ID: board,
    TEACHER_PLANNER_TRELLO_API_KEY: 'a'.repeat(32), TEACHER_PLANNER_TRELLO_TOKEN: 'c'.repeat(64),
    TEACHER_PLANNER_TRELLO_WRITE_TOKEN: 'w'.repeat(64) };
  async function query(sql, params) {
    state.queries.push(sql);
    if (state.missingMiddleTables && sql.includes('planner_middle_')) throw Object.assign(new Error('Missing table'), { code: '42P01' });
    const middle = sql.includes('planner_middle_');
    const progress = sql.includes('_progress');
    const map = middle ? (progress ? state.middleProgress : state.middleSessions) : (progress ? state.progress : state.sessions);
    const semester = middle && progress ? params[sql.includes('SELECT class_key') ? 2 : sql.includes('SELECT entry_id') ? 4 : sql.includes('INSERT INTO') ? 5 : 6] : null;
    const key = params?.slice(0, 4).join('|') + (semester ? '|' + semester : '');
    if (sql.includes('SELECT class_key')) return { rows: [...map.values()].filter(row => row.owner === params[0] && row.year === params[1] && (!middle || row.semester === semester)) };
    if (sql.includes('SELECT entry_id') || sql.includes('SELECT kits')) return { rows: map.has(key) ? [map.get(key)] : [] };
    if (sql.includes('INSERT INTO')) {
      if (map.has(key)) return { rows: [] };
      const row = progress ? { owner: params[0], year: params[1], class_key: params[2], semester,
        sequence_key: params[3], entry_id: params[4], revision: 1 } : { kits: JSON.parse(params[4]), revision: 1 };
      map.set(key, row); return { rows: [row] };
    }
    if (sql.includes('UPDATE planner_')) {
      const row = map.get(key);
      if (!row || row.revision !== params[5]) return { rows: [] };
      if (progress) row.entry_id = params[4]; else row.kits = JSON.parse(params[4]);
      row.revision++; return { rows: [row] };
    }
    assert.fail('Unexpected query: ' + sql);
  }
  const fetchImpl = async (url, options) => {
    state.requests.push({ url, options });
    if (state.networkError) throw Object.assign(new Error(env.TEACHER_PLANNER_TRELLO_TOKEN), { status: 403 });
    const path = new URL(url).pathname;
    if (path.startsWith('/1/tokens/')) return Response.json({ dateExpires: null, permissions: [
      { modelType: 'Board', idModel: state.wrongGrant ? 'f'.repeat(24) : board, read: true,
        write: options.headers.Authorization.includes(env.TEACHER_PLANNER_TRELLO_WRITE_TOKEN) ?
          state.writerGrant !== false : Boolean(state.writeGrant) }
    ] });
    if (path === '/1/boards/' + board) return Response.json({ id: board, closed: false });
    if (path === '/1/boards/' + board + '/lists') return Response.json(state.lists);
    const list = state.lists.find(item => path === '/1/lists/' + item.id + '/cards');
    if (list) return Response.json(state.cards.filter(item => item.idList === list.id));
    const existing = state.cards.find(item => path === '/1/cards/' + item.id);
    if (existing && options.method === 'GET') return Response.json({ ...existing, idBoard: board });
    if (options.method === 'PUT' || options.method === 'POST') {
      state.writeCount = (state.writeCount || 0) + 1;
      if (state.failWrite === state.writeCount) return Response.json({}, { status: 500 });
      const fields = JSON.parse(options.body);
      if (existing && options.method === 'PUT') {
        assert.equal(existing.idList, lists[0].id, 'writes never reach dated cards or another list');
        assert.deepEqual(Object.keys(fields), ['pos']);
        existing.pos = fields.pos;
        return Response.json(existing);
      }
      if (path === '/1/cards' && options.method === 'POST') {
        assert.equal(fields.idList, lists[0].id);
        const created = { ...fields, id: '9'.repeat(23) + (state.newCards = (state.newCards || 0) + 1),
          closed: false, url: 'https://trello.com/c/new' + state.newCards };
        state.cards.push(created);
        if (state.loseCreateResponse) { state.loseCreateResponse = false; throw new Error('Lost create response'); }
        return Response.json(created);
      }
    }
    assert.fail('Unexpected Trello request: ' + path);
  };
  const app = express();
  app.use(session({ secret: 'junior-test-secret', resave: false, saveUninitialized: false }));
  app.use((req, _res, next) => { req.user = state.user; next(); });
  app.use(createPlannerRouter({ query, env, teachingDayTrello: { fetchImpl } }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  const base = 'http://127.0.0.1:' + server.address().port + '/';
  const auth = await fetch(base + 'session'), { csrf } = await auth.json();
  const cookie = auth.headers.get('set-cookie').split(';')[0];
  const call = (path, body, csrfValue = csrf, programme = 'junior') => fetch(base + programme + '-teaching/' + path, {
    method: body === undefined ? 'GET' : 'PUT',
    headers: { cookie, 'x-planner-csrf': csrfValue, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  return { state, env, call };
}

test('teaching readiness is read from the source library card, independently of the shared order card', async t => {
  const { state, call } = await fixture(t);
  state.cards.push(card('7', lists[1], 'Decoding Binary',
    unit('Decoding Binary') + '\nTeaching readiness: Needs development\nDevelopment gap: Lesson plan and activities still to build.', 'decoding'));
  state.cards.push(card('8', lists[0], 'Decoding Binary',
    unit('Decoding Binary') + '\nLibrary card: https://trello.com/c/decoding\nTeaching readiness: Ready to teach', 'orderdecoding'));
  const before = await (await call('catalogue')).json();
  const decoding = before.entries.find(entry => entry.title === 'Decoding Binary');
  assert.deepEqual(decoding.source.readiness, { status: 'development', gap: 'Lesson plan and activities still to build.' });
  state.cards.find(item => item.id === '7'.repeat(24)).desc = unit('Decoding Binary') + '\nTeaching readiness: Ready to teach';
  const refreshed = await (await call('catalogue')).json();
  assert.equal(refreshed.entries.find(entry => entry.title === 'Decoding Binary').source.readiness.status, 'ready');
  assert.deepEqual(refreshed.entries.map(entry => entry.id), before.entries.map(entry => entry.id));
  assert.ok(!state.requests.some(item => ['POST', 'PUT'].includes(item.options.method)));
  state.cards.find(item => item.id === '7'.repeat(24)).desc = unit('Decoding Binary') + '\nTeaching readiness: Active';
  const invalid = await (await call('catalogue')).json();
  assert.ok(invalid.issues.some(issue => /Teaching readiness must be/.test(issue.message)));
});
test('parent unit and licence kit plans are valid library entries but not teaching activities', async t => {
  const { state, call } = await fixture(t);
  state.cards.push(card('7', lists[1], 'Binary - TECHNOLOGY Unit Plan - DT', 'Type: Unit Plan\nUnit: Binary & Data\nSource: https://example.com/unit', 'unitparent'));
  for (const [index, title] of ['Login Kit', 'Search Kit', 'Files & Folders Kit'].entries()) {
    state.cards.push(card(String(index + 1), lists[2], title, 'Type: Licence Kit Plan\nPlan: ' + title, 'parent' + index));
  }
  let data = await (await call('catalogue')).json();
  assert.equal(data.issues.length, 0);
  assert.deepEqual(data.libraries.units.filter(item => item.parent).map(item => item.title), ['Binary & Data']);
  assert.deepEqual(data.libraries.kits.filter(item => item.parent).map(item => item.title), ['Login Kit', 'Search Kit', 'Files & Folders Kit']);
  state.cards.push(card('8', lists[0], 'Parent in order', 'Type: Unit Plan\nUnit: Binary & Data\nLibrary card: https://trello.com/c/unitparent', 'badparent'));
  data = await (await call('catalogue')).json();
  assert.equal(data.entries.length, 5);
  assert.match(data.issues[0].message, /not a parent plan/);
});

test('saving shared order adds Decoding after Encoding and retains original IDs, sources and class records', async t => {
  const { state, call } = await fixture(t);
  state.cards.push(card('7', lists[1], 'Decoding Binary', unit('Decoding Binary') + '\nSource: https://example.com/decoding', 'decoding'));
  const change = { classKey: 'JPI', sequenceKey: 'unit:Binary & Data', entryId: 'c'.repeat(24), revision: 0, action: 'set' };
  assert.equal((await call('2026/progress', change)).status, 200);
  assert.equal((await call('2026/progress', { ...change, classKey: 'JSR', entryId: 'b'.repeat(24) })).status, 200);
  assert.equal((await call('session/2026-11-23/p2/JPI', { kits: [], revision: 0 })).status, 200);
  const records = JSON.stringify([[...state.progress], [...state.sessions]]);
  const dated = card('8', { id: 'f'.repeat(24) }, 'Dated PI / SR plan', 'Saved outcomes and plan', 'dated');
  state.cards.push(dated);
  const before = await (await call('catalogue')).json();
  const sourceIds = before.entries.map(entry => entry.source.id);
  sourceIds.splice(3, 0, '7'.repeat(24));
  const response = await call('order', { version: before.orderVersion, sourceIds });
  assert.equal(response.status, 200);
  const saved = await response.json();
  assert.deepEqual(saved.entries.map(entry => entry.title), ['Typing Kit', 'Binary Piano', 'Encoding Binary', 'Decoding Binary', 'Blueprint', 'Walkthrough']);
  assert.deepEqual(saved.entries.filter(entry => entry.title !== 'Decoding Binary').map(entry => entry.id), before.entries.map(entry => entry.id));
  assert.match(saved.entries[3].source.description, /https:\/\/example.com\/decoding/);
  assert.equal(JSON.stringify([[...state.progress], [...state.sessions]]), records);
  assert.equal(state.cards.find(item => item.id === dated.id), dated);
  assert.deepEqual((await (await call('catalogue')).json()).entries, saved.entries);
  assert.equal((await call('order', { version: before.orderVersion, sourceIds })).status, 409);
});

test('order writes require owner, CSRF, fixed list and write grant and reject omissions and parent IDs', async t => {
  const { state, env, call } = await fixture(t);
  const data = await (await call('catalogue')).json();
  const body = { version: data.orderVersion, sourceIds: data.entries.map(entry => entry.source.id) };
  state.user.id = '22222222-2222-4222-8222-222222222222';
  assert.equal((await call('order', body)).status, 403);
  state.user.id = owner;
  assert.equal((await call('order', body, 'invalid')).status, 403);
  assert.equal((await call('order', { ...body, sourceIds: body.sourceIds.slice(1) })).status, 409);
  assert.equal((await call('order', { ...body, sourceIds: [...body.sourceIds, body.sourceIds[0]] })).status, 400);
  state.cards.push(card('7', lists[1], 'Binary & Data', 'Type: Unit Plan\nUnit: Binary & Data', 'parent'));
  assert.equal((await call('order', { ...body, sourceIds: [...body.sourceIds, '7'.repeat(24)] })).status, 409);
  state.writerGrant = false;
  assert.equal((await call('order', body)).status, 403);
  state.writerGrant = true;
  delete env.TEACHER_PLANNER_TRELLO_WRITE_TOKEN;
  assert.equal((await call('order', body)).status, 503);
  env.TEACHER_PLANNER_TRELLO_WRITE_TOKEN = 'w'.repeat(64);
  const oldId = state.lists[0].id;
  state.lists[0].id = '1'.repeat(24);
  for (const item of state.cards) if (item.idList === oldId) item.idList = state.lists[0].id;
  const changed = await (await call('catalogue')).json();
  assert.equal((await call('order', { ...body, version: changed.orderVersion })).status, 409);
  assert.ok(!state.requests.some(({ options }) => options.method !== 'GET'));
});

test('partial save and lost create response can be retried without duplicating source cards', async t => {
  const { state, call } = await fixture(t);
  state.cards.push(card('7', lists[1], 'Decoding Binary', unit('Decoding Binary'), 'decoding'));
  const data = await (await call('catalogue')).json();
  const sourceIds = ['7'.repeat(24), ...data.entries.map(entry => entry.source.id).reverse()];
  state.loseCreateResponse = true;
  let response = await call('order', { version: data.orderVersion, sourceIds });
  assert.equal(response.status, 502);
  const failed = await response.json();
  assert.match(failed.error, /draft is still visible/);
  assert.ok(failed.recovery.orderVersion);
  state.failWrite = state.writeCount + 2;
  response = await call('order', { version: failed.recovery.orderVersion, sourceIds });
  assert.equal(response.status, 502);
  const second = await response.json();
  response = await call('order', { version: second.recovery.orderVersion, sourceIds });
  assert.equal(response.status, 200);
  assert.equal(state.newCards, 1);
  assert.deepEqual((await response.json()).entries.map(entry => entry.source.id), sourceIds);
  assert.equal(state.queries.length, 0, 'editing order never queries or writes Planner records');
});

test('MiddleDTECH keeps class, sequence, year and semester progress stable across reorder', async t => {
    const { state, call } = await fixture(t);
    const middleList = { id: '6b09e4b9be7e645cfc6b9650', idBoard: board, name: 'MiddleDTECH', closed: false };
    state.lists.push(middleList);
    const entries = [
      card('7', middleList, 'Binary Piano', unit('Binary Piano') + '\nLibrary card: https://trello.com/c/piano', 'middlepiano'),
      card('8', middleList, 'Encoding Binary', unit('Encoding Binary') + '\nLibrary card: https://trello.com/c/encoding', 'middleencoding'),
      card('9', middleList, 'Blueprint', kit('Blueprint') + '\nLibrary card: https://trello.com/c/blueprint', 'middleblueprint'),
      card('a', middleList, 'Walkthrough', kit('Walkthrough') + '\nLibrary card: https://trello.com/c/walkthrough', 'middlewalkthrough')
    ].map((item, index) => ({ ...item, id: (index + 7).toString(16).repeat(24), pos: (index + 1) * 100 }));
    state.cards.push(...entries);
    const request = (path, body) => call(path, body, undefined, 'middle');
    const change = (scope, classKey, sequenceKey, id, revision, action = 'set') =>
      request(scope + '/progress', { classKey, sequenceKey, entryId: id.repeat(24), revision, action });
    const unitKey = 'unit:Binary & Data', kitKey = 'kit:Minecraft Builder Kit';
    assert.equal((await change('2026/1', '91D', unitKey, '7', 0)).status, 200);
    assert.equal((await change('2026/1', '101D', unitKey, '8', 0)).status, 200);
    assert.equal((await change('2026/1', '91D', kitKey, '9', 0)).status, 200);
    assert.equal((await change('2026/1', '101D', kitKey, '9', 0)).status, 200);
    [entries[0].pos, entries[1].pos] = [entries[1].pos, entries[0].pos];
    assert.equal((await change('2026/1', '91D', kitKey, 'a', 1, 'advance')).status, 200);
    const data = await (await request('2026/1')).json();
    const saved = (classKey, key) => data.progress.find(row => row.class_key === classKey && row.sequence_key === key).entry_id;
    assert.equal(saved('91D', unitKey), '7'.repeat(24));
    assert.equal(saved('101D', unitKey), '8'.repeat(24));
    assert.equal(saved('91D', kitKey), 'a'.repeat(24));
    assert.equal(saved('101D', kitKey), '9'.repeat(24));
    assert.deepEqual(data.entries.filter(entry => entry.kind === 'unit').map(entry => entry.id), ['8'.repeat(24), '7'.repeat(24)]);
    assert.deepEqual((await (await request('2026/2')).json()).progress, []);
    assert.deepEqual((await (await request('2027/1')).json()).progress, []);
    assert.equal((await change('2026/2', '91D', unitKey, '8', 0)).status, 200);
    assert.equal((await change('2026/1', '91D', unitKey, '8', 0)).status, 409);
    assert.equal((await request('2026/3')).status, 400);
    const session = 'session/2026-05-01/p2/91D';
    assert.equal((await request(session, { kits: [kitKey], revision: 0 })).status, 200);
    assert.deepEqual((await (await request(session)).json()).kits, [kitKey]);
    assert.deepEqual((await (await request('session/2026-05-01/p2/101D')).json()).kits, []);
    assert.equal((await request(session, { kits: [], revision: 0 })).status, 409);
    assert.equal((await call('2026')).status, 200, 'JuniorDTECH remains independent');
    state.cards = state.cards.filter(item => item.idList !== middleList.id);
    assert.equal((await (await request('2026/1')).json()).orderCardCount, 0);
    middleList.id = 'f'.repeat(24);
    assert.equal((await request('2026/1')).status, 409, 'the shared list ID must match');
});

test('MiddleDTECH order can be checked without reading unavailable progress tables', async t => {
  const { state, call } = await fixture(t);
  state.lists.push({ id: '6b09e4b9be7e645cfc6b9650', idBoard: board, name: 'MiddleDTECH', closed: false });
  state.missingMiddleTables = true;
  const request = path => call(path, undefined, undefined, 'middle');
  assert.equal((await request('2026/2')).status, 503);
  const response = await request('catalogue');
  assert.equal(response.status, 200);
  assert.equal((await response.json()).orderCardCount, 0);
});

test('verified lists use Trello order and current library content without any progress writes', async t => {
  const { state, env, call } = await fixture(t);
  let response = await call('2026'), result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(result.entries.map(item => item.title), ['Typing Kit', 'Binary Piano', 'Encoding Binary', 'Blueprint', 'Walkthrough']);
  assert.equal(result.issues.length, 0);
  assert.equal(result.libraries.units.length, 2);
  assert.equal(result.libraries.kits.length, 3);
  assert.match(result.entries[1].source.description, /Original source/);
  assert.ok(state.queries.every(sql => !/INSERT|UPDATE|DELETE/.test(sql)));
  assert.ok(state.requests.every(({ url, options }) => options.method === 'GET' &&
    !new URL(url).searchParams.has('token') && !new URL(url).searchParams.has('key')));
  assert.ok(!JSON.stringify(result).includes(env.TEACHER_PLANNER_TRELLO_TOKEN));
  state.cards.find(item => item.id === 'f'.repeat(24)).desc += '\nInstructions: Updated source';
  response = await call('2026'); result = await response.json();
  assert.match(result.entries[1].source.description, /Updated source/);
});

test('owner, read-only grant, board/list validation and CSRF protect the integration', async t => {
  const { state, env, call } = await fixture(t);
  state.user.id = '22222222-2222-4222-8222-222222222222';
  assert.equal((await call('2026')).status, 403);
  assert.equal(state.requests.length, 0);
  state.user.id = owner; state.writeGrant = true;
  assert.equal((await call('2026')).status, 403);
  state.writeGrant = false; state.wrongGrant = true;
  assert.equal((await call('2026')).status, 403);
  state.wrongGrant = false;
  state.lists.push({ ...state.lists[1], id: '7'.repeat(24) });
  assert.equal((await call('2026')).status, 409);
  state.lists.pop();
  const body = { classKey: 'JPI', sequenceKey: 'unit:Binary & Data', entryId: 'b'.repeat(24), revision: 0, action: 'set' };
  assert.equal((await call('2026/progress', body, 'invalid')).status, 403);
  assert.equal(state.progress.size, 0);
  state.networkError = true;
  const response = await call('2026'), text = await response.text();
  assert.equal(response.status, 502);
  assert.ok(!text.includes(env.TEACHER_PLANNER_TRELLO_TOKEN));
});

test('missing, mismatched and duplicate source links are reported rather than guessed', async t => {
  const { state, call } = await fixture(t);
  state.cards.find(item => item.id === 'c'.repeat(24)).desc = unit('Encoding Binary') + '\nLibrary card: https://trello.com/c/missing';
  state.cards.push(card('7', lists[0], 'Second piano', unit('Binary Piano') + '\nLibrary card: https://trello.com/c/piano', 'duplicate'));
  const result = await (await call('2026')).json();
  assert.deepEqual(result.entries.map(item => item.title), ['Typing Kit', 'Blueprint', 'Walkthrough']);
  assert.equal(result.issues.length, 3);
  assert.ok(result.issues.some(issue => /missing, ambiguous/.test(issue.message)));
  assert.equal(result.issues.filter(issue => /more than once/.test(issue.message)).length, 2);
});

test('an invalid intervening teaching-order card cannot be silently skipped when advancing', async t => {
  const { state, call } = await fixture(t);
  const body = { classKey: 'JSR', sequenceKey: 'unit:Binary & Data', entryId: 'b'.repeat(24), revision: 0, action: 'set' };
  assert.equal((await call('2026/progress', body)).status, 200);
  const bad = card('8', lists[0], 'Unverified lesson', unit('Unverified lesson') + '\nLibrary card: https://trello.com/c/missing', 'missingorder');
  bad.pos = 250; state.cards.push(bad);
  const response = await call('2026/progress', { ...body, entryId: 'c'.repeat(24), revision: 1, action: 'advance' });
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /needs? review/);
  assert.equal([...state.progress.values()][0].entry_id, 'b'.repeat(24));
});

test('confirmed progress is isolated per class and sequence and survives reorder, with stale and missing entries rejected', async t => {
  const { state, call } = await fixture(t);
  const unitKey = 'unit:Binary & Data', kitKey = 'kit:Minecraft Builder Kit';
  const change = (classKey, sequenceKey, entryId, revision, action) =>
    call('2026/progress', { classKey, sequenceKey, entryId: entryId.repeat(24), revision, action });
  assert.equal((await change('JPI', unitKey, 'c', 0, 'set')).status, 200);
  assert.equal((await change('JSR', unitKey, 'b', 0, 'set')).status, 200);
  assert.equal((await change('JSR', kitKey, 'd', 0, 'set')).status, 200);
  assert.equal((await change('JSR', kitKey, 'e', 1, 'advance')).status, 200);
  assert.equal((await change('JSR', kitKey, 'd', 1, 'set')).status, 409);
  let result = await (await call('2026')).json();
  const byClass = (name, key) => result.progress.find(row => row.class_key === name && row.sequence_key === key).entry_id;
  assert.equal(byClass('JPI', unitKey), 'c'.repeat(24));
  assert.equal(byClass('JSR', unitKey), 'b'.repeat(24));
  assert.equal(byClass('JSR', kitKey), 'e'.repeat(24));
  const piano = state.cards.findIndex(item => item.id === 'b'.repeat(24));
  const encoding = state.cards.findIndex(item => item.id === 'c'.repeat(24));
  [state.cards[piano].pos, state.cards[encoding].pos] = [state.cards[encoding].pos, state.cards[piano].pos];
  result = await (await call('2026')).json();
  assert.deepEqual(result.entries.filter(item => item.kind === 'unit').map(item => item.id), ['c'.repeat(24), 'b'.repeat(24)]);
  assert.equal(byClass('JPI', unitKey), 'c'.repeat(24));
  assert.equal(byClass('JSR', unitKey), 'b'.repeat(24));
  state.cards = state.cards.filter(item => item.id !== 'e'.repeat(24));
  assert.equal((await change('JSR', kitKey, 'd', 2, 'advance')).status, 409);
  result = await (await call('2026')).json();
  assert.equal(byClass('JSR', kitKey), 'e'.repeat(24));
});

test('kit inclusion is stored separately for each dated class session with revision conflicts', async t => {
  const { call } = await fixture(t);
  const key = 'kit:Minecraft Builder Kit', path = 'session/2026-11-27/p3/JSR';
  assert.deepEqual(await (await call(path)).json(), { kits: [], revision: 0 });
  assert.equal((await call(path, { kits: [key], revision: 0 })).status, 200);
  assert.equal((await call(path, { kits: [], revision: 0 })).status, 409);
  assert.deepEqual(await (await call('session/2026-11-27/p2/JPI')).json(), { kits: [], revision: 0 });
  assert.deepEqual(await (await call('session/2026-11-28/p3/JSR')).json(), { kits: [], revision: 0 });
  assert.equal((await call(path, { kits: ['kit:Unknown'], revision: 1 })).status, 409);
  assert.deepEqual((await (await call(path)).json()).kits, [key]);
});
