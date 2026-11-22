const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const session = require('express-session');
const { createModuleRouter } = require('./app');
const { validContent, draft, nextActivities } = require('./teachingSessions');
const { loadTeachingContent } = require('./teachingContent');
const { Client, Pool } = require('pg');
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');

const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

async function fixture(t) {
  const records = new Map(), checkpoints = new Map(), statements = [];
  let clock = new Date('2026-11-24T00:00:00Z'), sourceVersion = 1;
  const query = async (sql, params) => {
    statements.push(sql);
    if (sql.includes('teacher_calendar_settings')) return { rows: [{ subscription_url: 'https://synthetic.invalid/timetable' }] };
    if (sql.includes('planner_sections')) return { rows: params[0] === OWNER ? [{ content: {
      title: 'CW Routine:', priorities: 'Independent start', instructions: 'Typing Kit\nMinecraft'
    } }] : [] };
    const context = sql.includes('planner_class_contexts');
    const store = context ? checkpoints : records;
    const key = context ? params.slice(0, 3).join('|') : [params[0], params[1], params[sql.startsWith('SELECT') ? 2 : 3]].join('|');
    const existing = store.get(key);
    if (sql.startsWith('SELECT')) {
      if (!context && sql.includes('session_date <')) return { rows: [...records.values()]
        .filter(row => row.owner_id === params[0] && row.group_key === params[2] && row.date < params[3])
        .sort((a, b) => a.date.localeCompare(b.date)) };
      return { rows: existing ? [structuredClone(existing)] : [] };
    }
    const insert = sql.startsWith('INSERT');
    const revision = params[context ? 4 : 7];
    if (insert && existing || !insert && (!existing || existing.revision !== revision)) return { rows: [] };
    const row = context ? { checkpoint_note: params[3], confirmed_at: clock.toISOString() } : {
      owner_id: params[0], group_key: params[4], date: params[3], session_date: new Date(params[3] + 'T00:00:00Z'),
      occurrence_id: params[2], content: JSON.parse(params[5]), updated_at: clock.toISOString(),
      confirmed_content: params[6] ? JSON.parse(params[5]) : existing?.confirmed_content || null,
      confirmed_at: params[6] ? clock.toISOString() : existing?.confirmed_at || null
    };
    row.revision = (existing?.revision || 0) + 1;
    store.set(key, structuredClone(row));
    return { rows: [row] };
  };
  const app = express();
  app.use(session({ secret: 'synthetic-jpi-session-test', resave: false, saveUninitialized: false }));
  app.use((req, res, next) => {
    if (req.get('x-test-user')) req.user = { id: req.get('x-test-user'), roles: ['Teacher'] };
    next();
  });
  app.use(createModuleRouter({ query, teachingSessions: {
    now: () => clock,
    timetable: async () => ({ events: ['2026-11-23', '2026-11-30'].map(day => ({
      id: day + '-jpi-' + sourceVersion, title: 'PIDTECH (JPI)', allDay: false,
      start: day + 'T10:00:00', end: day + 'T11:00:00', location: '05'
    })) })
  } }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = 'http://127.0.0.1:' + server.address().port + '/api/planner/';
  const auth = await fetch(base + 'session', { headers: { 'x-test-user': OWNER } });
  const { csrf } = await auth.json();
  const headers = { 'x-test-user': OWNER, cookie: auth.headers.get('set-cookie').split(';')[0],
    'Content-Type': 'application/json', 'x-planner-csrf': csrf };
  const get = async path => {
    const response = await fetch(base + path, { headers });
    assert.equal(response.status, 200); return response.json();
  };
  const put = (path, content, revision, extra = {}) => fetch(base + path, { method: 'PUT',
    headers: { ...headers, ...extra }, body: JSON.stringify({ content, revision }) });
  return { records, checkpoints, statements, base, headers, get, put,
    time: value => { clock = new Date(value); }, changeSource: () => { sourceVersion++; } };
}

test('activity timing is explicit and optional, with unique activities and validated outcomes', () => {
  const content = draft([]);
  assert.ok(content.activities.every(item => item.plannedMinutes === null && item.actualMinutes === null));
  content.activities[0].plannedMinutes = 15;
  content.activities[0].actualMinutes = 7.5;
  content.activities[0].status = 'partial';
  assert.equal(validContent(content), true);
  for (const invalid of [
    { ...content, owner_id: OWNER },
    { ...content, activities: [content.activities[0], content.activities[0]] },
    ...[-1, Infinity, '15', 1441].map(actualMinutes => ({ ...content, activities: [{ ...content.activities[0], actualMinutes }] })),
    { ...content, activities: [{ ...content.activities[0], sourceId: 'student-record' }] },
    { ...content, activities: [{ ...content.activities[0], status: 'elapsed' }] }
  ]) assert.equal(validContent(invalid), false);
});

test('JPI session roundtrip preserves explicit timing and confirmation, prevents conflicts and isolates owners', async t => {
  const f = await fixture(t), path = 'sessions/2026-11-23/p2';
  assert.equal((await fetch(f.base + path)).status, 401);
  const other = await fetch(f.base + path, { headers: { ...f.headers, 'x-test-user': OTHER } });
  assert.equal((await other.json()).available, false);
  let plan = await f.get(path);
  assert.equal(plan.event.className, 'JPI');
  assert.equal(plan.event.location, '05');
  assert.equal(plan.checkpoint.confirmed_at, null);
  assert.equal(f.records.size, 0, 'opening the plan does not save a record');
  const content = plan.content;
  Object.assign(content.activities[0], { plannedMinutes: 10, actualMinutes: 7.5, status: 'completed' });
  Object.assign(content.activities[1], { plannedMinutes: 15, status: 'partial', teachingNote: 'First two examples only' });
  Object.assign(content.activities[2], { status: 'deferred', actualMinutes: 0 });
  assert.equal((await f.put(path, content, 0, { 'x-planner-csrf': 'wrong' })).status, 403);
  assert.equal((await f.put(path, content, 0)).status, 200);
  assert.equal((await f.put(path, content, 0)).status, 409);
  plan = await f.get(path);
  assert.equal(plan.revision, 1);
  assert.equal(plan.content.activities[0].actualMinutes, 7.5);
  assert.equal(plan.content.activities[1].actualMinutes, null);
  assert.equal(plan.confirmed_at, null, 'draft status edits never imply confirmed completion');
  let next = await f.get('sessions/2026-11-30/p2');
  assert.deepEqual(next.awaitingConfirmation, ['2026-11-23']);
  assert.equal(next.previous.length, 0);
  assert.equal((await f.put(path + '?confirm=true', content, 1)).status, 200);
  next = await f.get('sessions/2026-11-30/p2');
  assert.equal(next.previous.length, 1);
  assert.equal(next.content.activities.length, 2);
  assert.equal(next.content.activities[0].id, content.activities[1].id);
  assert.equal(next.content.activities[0].status, 'planned');
  assert.equal(next.content.activities[0].actualMinutes, null, 'actual time is not carried into another session');
  assert.equal(next.previous[0].confirmed_content.activities[0].actualMinutes, 7.5);
  assert.equal((await f.put(path, content, 1)).status, 409, 'stale revisions cannot overwrite confirmed outcomes');
  content.activities[1].teachingNote = 'Draft correction awaiting confirmation';
  assert.equal((await f.put(path, content, 2)).status, 200);
  plan = await f.get(path);
  assert.equal(plan.confirmed_content.activities[1].teachingNote, 'First two examples only');
  assert.equal(plan.content.activities[1].teachingNote, 'Draft correction awaiting confirmation');
  f.changeSource();
  assert.equal((await f.get(path)).revision, 3, 'a changed ICS UID does not duplicate the dated class plan');
  assert.equal((await f.put(path, content, 3)).status, 200);
  assert.equal(f.records.size, 1);
  assert.ok(!f.statements.some(sql => /(?:INSERT INTO|UPDATE|DELETE FROM) planner_sections/.test(sql)), 'legacy records are untouched');
});

test('future confirmations are rejected and late confirmations do not rewrite an edited future draft', async t => {
  const f = await fixture(t), path = 'sessions/2026-11-23/p2';
  const first = await f.get(path);
  first.content.activities[0].status = 'completed';
  f.time('2026-11-22T01:00:00Z');
  assert.equal((await f.put(path + '?confirm=true', first.content, 0)).status, 400);
  assert.equal(f.records.size, 0);
  const next = await f.get('sessions/2026-11-30/p2');
  next.content.note = 'Keep these teacher adjustments';
  assert.equal((await f.put('sessions/2026-11-30/p2', next.content, 0)).status, 200);
  f.time('2026-11-24T01:00:00Z');
  assert.equal((await f.put(path + '?confirm=true', first.content, 0)).status, 200);
  const reopened = await f.get('sessions/2026-11-30/p2');
  assert.deepEqual(reopened.content, next.content);
  assert.equal((await fetch(f.base + 'sessions/2027-01-04/p2', { headers: f.headers })).status, 400);
  assert.equal((await fetch(f.base + 'sessions/2026-11-23/whanau', { headers: f.headers })).status, 400);
});

test('the initial JPI checkpoint requires explicit confirmation and revision protection', async t => {
  const f = await fixture(t);
  const put = revision => fetch(f.base + 'sessions/context/2026', { method: 'PUT', headers: f.headers,
    body: JSON.stringify({ note: 'Teacher-confirmed initial preparation; no teaching date assigned.', revision }) });
  assert.equal((await put(0)).status, 200);
  assert.equal((await put(0)).status, 409);
  assert.equal(f.checkpoints.size, 1);
  assert.equal((await f.get('sessions/2026-11-23/p2')).checkpoint.revision, 1);
  const history = [{ confirmed_content: { activities: [
    { ...draft([]).activities[0], status: 'completed' },
    { ...draft([]).activities[1], status: 'partial', actualMinutes: 12, teachingNote: 'Some work remains' }
  ] } }];
  assert.equal(nextActivities(history).length, 1);
  assert.equal(nextActivities(history)[0].actualMinutes, null);
});

test('the pilot reads the existing Binary Piano lesson and original resource links', async () => {
  const teaching = await loadTeachingContent();
  assert.equal(teaching.lesson.title, 'Binary Piano');
  assert.ok(teaching.resources.some(resource => resource.name.includes('Binary Piano') && resource.url.startsWith('https://drive.google.com/')));
  assert.ok(teaching.preparation.some(note => /scissors, glue sticks and exercise books/.test(note)));
});

test('PostgreSQL keeps the teaching date and nullable timing when reopening and suggesting continuation', {
  skip: !process.env.TEACHING_SESSION_TEST_DATABASE_URL
}, async t => {
  const client = new Client({ connectionString: process.env.TEACHING_SESSION_TEST_DATABASE_URL, ssl: false });
  await client.connect();
  const schema = 'jpi_test_' + crypto.randomBytes(8).toString('hex');
  let pool;
  await client.query(`CREATE SCHEMA "${schema}"`);
  t.after(async () => {
    if (pool) await pool.end();
    await client.query('SET search_path TO public');
    await client.query(`DROP SCHEMA "${schema}" CASCADE`);
    await client.end();
  });
  await client.query(`SET search_path TO "${schema}"`);
  await client.query(await fs.readFile(path.join(__dirname, 'db', 'migrations', '015_teaching_sessions.sql'), 'utf8'));
  pool = new Pool({ connectionString: process.env.TEACHING_SESSION_TEST_DATABASE_URL,
    ssl: false, options: '-c search_path=' + schema });
  const app = express();
  app.use(session({ secret: 'synthetic-postgresql-jpi-test', resave: false, saveUninitialized: false }));
  app.use((req, res, next) => { req.user = { id: OWNER, roles: ['Teacher'] }; next(); });
  app.use(createModuleRouter({
    query: (sql, params) => {
      if (sql.includes('teacher_calendar_settings')) return Promise.resolve({ rows: [{ subscription_url: 'https://synthetic.invalid' }] });
      if (sql.includes('planner_sections')) return Promise.resolve({ rows: [{ content: { title: 'CW Routine:', instructions: 'Typing Kit\nMinecraft' } }] });
      return pool.query(sql, params);
    },
    teachingSessions: { now: () => new Date('2026-11-24T00:00:00Z'),
      timetable: async () => ({ events: ['2026-11-23', '2026-11-30'].map(day => ({
        id: day + '-jpi', title: 'PIDTECH (JPI)', start: day + 'T10:00:00', end: day + 'T11:00:00', location: '05'
      })) }) }
  }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = 'http://127.0.0.1:' + server.address().port + '/api/planner/';
  const auth = await fetch(base + 'session'), { csrf } = await auth.json();
  const headers = { cookie: auth.headers.get('set-cookie').split(';')[0], 'Content-Type': 'application/json', 'x-planner-csrf': csrf };
  const plan = await (await fetch(base + 'sessions/2026-11-23/p2', { headers })).json();
  Object.assign(plan.content.activities[0], { actualMinutes: 7.5, plannedMinutes: 10, status: 'partial' });
  const put = revision => fetch(base + 'sessions/2026-11-23/p2?confirm=true', { method: 'PUT', headers,
    body: JSON.stringify({ revision, content: plan.content }) });
  assert.equal((await put(0)).status, 200);
  assert.equal((await put(0)).status, 409);
  const reopened = await (await fetch(base + 'sessions/2026-11-23/p2', { headers })).json();
  assert.equal(reopened.content.activities[0].actualMinutes, 7.5);
  assert.equal(reopened.content.activities[1].actualMinutes, null);
  const next = await (await fetch(base + 'sessions/2026-11-30/p2', { headers })).json();
  assert.equal(next.previous[0].session_date, '2026-11-23');
  assert.equal(next.content.activities[0].actualMinutes, null);
  assert.equal(next.content.activities[0].id, plan.content.activities[0].id);
});
