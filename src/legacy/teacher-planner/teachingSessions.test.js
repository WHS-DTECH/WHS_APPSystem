const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const session = require('express-session');
const { createModuleRouter } = require('./app');
const { validContent, validSessionContent, draft, nextActivities } = require('./teachingSessions');
const { loadTeachingContent } = require('./teachingContent');
const { Client, Pool } = require('pg');
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');

const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

async function fixture(t) {
  const records = new Map(), checkpoints = new Map(), statements = [];
  let clock = new Date('2026-11-24T00:00:00Z'), sourceVersion = 1, timetableReads = 0, classAvailable = true, ambiguousWhanau = false;
  let whanauClass = '9WHAU';
  const query = async (sql, params) => {
    statements.push(sql);
    if (sql.includes('teacher_calendar_settings')) return { rows: [{ subscription_url: 'https://synthetic.invalid/timetable' }] };
    if (sql.includes('planner_sections')) return { rows: params[0] === OWNER ? [{ content: {
      title: 'CW Routine:', priorities: 'Independent start', instructions: 'Typing Kit\nMinecraft'
    } }] : [] };
    const context = sql.includes('planner_class_contexts');
    const store = context ? checkpoints : records;
    if (sql.includes("slot_key LIKE 'manual-%'")) return { rows: [...records.values()]
      .filter(row => row.owner_id === params[0] && row.date === params[1] && row.slot_key.startsWith('manual-'))
      .map(row => ({ slot_key: row.slot_key, title: row.content.session.title, session_type: row.session_type })) };
    if (sql.includes('LEFT(group_key')) return { rows: [...records.values()]
      .filter(row => row.owner_id === params[0] && row.date === params[2] &&
        row.group_key.startsWith(params[3]) && row.slot_key === params[4]).map(row => structuredClone(row)) };
    if (sql.includes('array_position')) return { rows: [...records.values()]
      .filter(row => row.owner_id === params[0] && Number(row.date.slice(0, 4)) === params[1] &&
        (row.group_key === params[2] || params[3].includes(row.group_key) ||
          params[7].includes(row.group_key) && row.content.session?.title.trim().toUpperCase() === 'PIDTECH (JPI)') &&
        (row.date < params[4] || row.date === params[4] && params[5].indexOf(row.slot_key) < params[5].indexOf(params[6])))
      .sort((a, b) => b.date.localeCompare(a.date) || params[5].indexOf(b.slot_key) - params[5].indexOf(a.slot_key))
      .slice(0, 1).map(row => ({ ...structuredClone(row), session_date: row.date })) };
    const select = sql.startsWith('SELECT');
    let key = context ? params.slice(0, 3).join('|') : [params[0], params[1], params[select ? 2 : 3], params[select ? 3 : 4]].join('|');
    if (sql.includes('group_key=$10')) key = [params[0], params[1], params[3], params[9]].join('|');
    const existing = store.get(key);
    if (sql.startsWith('SELECT')) {
      if (!context && sql.includes('session_date <')) return { rows: [...records.values()]
        .filter(row => row.owner_id === params[0] && row.group_key === params[2] && row.date < params[3])
        .sort((a, b) => a.date.localeCompare(b.date)) };
      return { rows: existing ? [structuredClone(existing)] : [] };
    }
    const insert = sql.startsWith('INSERT');
    const generic = sql.includes('content,slot_key') || sql.includes('session_type=$8');
    const revision = params[context ? 4 : generic ? 8 : 7];
    if (insert && existing || !insert && (!existing || existing.revision !== revision)) return { rows: [] };
    const row = context ? { checkpoint_note: params[3], confirmed_at: clock.toISOString() } : {
      owner_id: params[0], group_key: params[4], date: params[3], session_date: new Date(params[3] + 'T00:00:00Z'),
      occurrence_id: params[2], content: JSON.parse(params[5]), updated_at: clock.toISOString(),
      slot_key: generic ? params[6] : 'p2', session_type: generic ? params[7] : 'teaching',
      confirmed_content: !generic && params[6] ? JSON.parse(params[5]) : existing?.confirmed_content || null,
      confirmed_at: !generic && params[6] ? clock.toISOString() : existing?.confirmed_at || null
    };
    row.revision = (existing?.revision || 0) + 1;
    if (sql.includes('group_key=$10')) {
      store.delete(key);
      key = [params[0], params[1], params[3], params[4]].join('|');
    }
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
    timetable: async () => { timetableReads++; return { events: ['2026-11-23', '2026-11-30'].flatMap(day => [{
      id: day + '-jpi-' + sourceVersion, title: 'PIDTECH (JPI)', allDay: false,
      start: day + 'T10:00:00', end: day + 'T11:00:00', location: '05'
    }, { id: day + '-whanau', title: 'WHANAU (' + whanauClass + ')', start: day + 'T08:45:00', end: day + 'T09:00:00', location: 'CW' },
    ...(ambiguousWhanau ? [{ id: day + '-other', title: 'WHANAU (9OTHER)', start: day + 'T08:45:00', end: day + 'T09:00:00', location: 'CW' }] : [])])
      .filter(event => classAvailable || !event.title.includes('JPI')) }; }
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
    timetableReads: () => timetableReads, removeClass: () => { classAvailable = false; },
    time: value => { clock = new Date(value); }, changeSource: () => { sourceVersion++; },
    makeWhanauAmbiguous: () => { ambiguousWhanau = true; clock = new Date(clock.getTime() + 31000); },
    setWhanauClass: value => { whanauClass = value; clock = new Date(clock.getTime() + 31000); } };
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
test('combined session notes can hold both original maximum-length fields', () => {
  const note = 'a'.repeat(20000) + '\n\n' + 'b'.repeat(20000);
  assert.equal(validContent({ ...draft([]), note, actualProgress: '' }), true);
  assert.equal(validSessionContent({ note, actualProgress: '', evaluation: '', activities: [],
    session: { title: 'Class', type: 'teaching', startTime: '', endTime: '' } }, 'p2'), true);
});
test('slot outcomes are separately validated and persist without confirming progress', async t => {
  const f = await fixture(t), path = 'sessions/2026-11-23/p2';
  const plan = await f.get(path);
  plan.content.slotOutcomes = [{ title: 'Typing Kit', occurrence: 1, status: 'taught' },
    { title: 'Binary Piano — Review', occurrence: 1, status: 'partial' }];
  assert.equal((await f.put(path, plan.content, plan.revision)).status, 200);
  const saved = await f.get(path);
  assert.deepEqual(saved.content.slotOutcomes, plan.content.slotOutcomes);
  assert.equal(saved.confirmed_content, null);
  assert.equal(saved.content.activities[0].status, 'planned');
  for (const invalid of [
    [{ title: 'Typing Kit', occurrence: 1, status: 'completed' }],
    [{ title: 'Typing Kit', occurrence: 1, status: 'taught' }, { title: 'Typing Kit', occurrence: 1, status: 'partial' }],
    [{ title: '', occurrence: 1, status: 'taught' }]
  ]) {
    assert.equal(validContent({ ...saved.content, slotOutcomes: invalid }), false);
  }
  const generic = await f.get('sessions/2026-11-23/whanau');
  generic.content.slotOutcomes = [{ title: 'Notices', occurrence: 1, status: 'not_taught' }];
  assert.equal((await f.put('sessions/2026-11-23/whanau', generic.content, generic.revision)).status, 200);
  assert.deepEqual((await f.get('sessions/2026-11-23/whanau')).content.slotOutcomes, generic.content.slotOutcomes);
  assert.deepEqual((await f.get(path)).content.slotOutcomes, plan.content.slotOutcomes);
});
test('Friday preparation remains saved under Friday after opening Thursday notes', async t => {
  const f = await fixture(t);
  const friday = await f.get('sessions/2026-11-27/p1');
  friday.content.session = { title: 'Friday class', type: 'teaching', startTime: '09:00', endTime: '10:00' };
  friday.content.note = 'Prepare Friday lesson resources';
  assert.equal((await f.put('sessions/2026-11-27/p1', friday.content, friday.revision)).status, 200);

  const thursday = await f.get('sessions/2026-11-26/p1');
  thursday.content.session = { title: 'Thursday class', type: 'teaching', startTime: '09:00', endTime: '10:00' };
  thursday.content.note = 'Prepare Thursday lesson resources';
  assert.equal((await f.put('sessions/2026-11-26/p1', thursday.content, thursday.revision)).status, 200);

  assert.equal((await f.get('sessions/2026-11-26/p1')).content.note, 'Prepare Thursday lesson resources');
  assert.equal((await f.get('sessions/2026-11-27/p1')).content.note, 'Prepare Friday lesson resources');
  assert.equal((await f.get('sessions/2026-11-27/p1')).content.session.title, 'Friday class');
});
test('session GETs reuse an owner-private timetable briefly but writes recheck the current class and records stay fresh', async t => {
  const f = await fixture(t), path = 'sessions/2026-11-23/p2';
  await f.get('sessions/2026-11-23/whanau');
  const plan = await f.get(path);
  assert.equal(f.timetableReads(), 1);
  const other = await fetch(f.base + path, { headers: { ...f.headers, 'x-test-user': OTHER } });
  assert.equal(other.status, 200);
  assert.equal(f.timetableReads(), 2, 'another owner cannot reuse the private feed');
  plan.content.note = 'A current saved note';
  assert.equal((await f.put(path, plan.content, 0)).status, 200);
  assert.equal(f.timetableReads(), 3, 'writes bypass the read cache');
  assert.equal((await f.get(path)).content.note, plan.content.note, 'Planner records are never cached');
  assert.equal(f.timetableReads(), 3);
  f.time('2026-11-24T00:00:31Z');
  await f.get(path);
  assert.equal(f.timetableReads(), 4, 'read cache expires after thirty seconds');
  f.removeClass();
  plan.content.activities[0].status = 'completed';
  assert.equal((await f.put(path + '?confirm=true', plan.content, 1)).status, 400);
  assert.equal(f.timetableReads(), 5);
  assert.equal([...f.records.values()][0].confirmed_at, null, 'cached timetable context cannot authorise progress confirmation');
});

test('JPI session roundtrip preserves explicit timing and confirmation, prevents conflicts and isolates owners', async t => {
  const f = await fixture(t), path = 'sessions/2026-11-23/p2';
  assert.equal((await fetch(f.base + path)).status, 401);
  const other = await fetch(f.base + path, { headers: { ...f.headers, 'x-test-user': OTHER } });
  const otherPlan = await other.json();
  assert.equal(otherPlan.available, true);
  assert.equal(otherPlan.teaching, undefined, 'other owners do not receive this owner-private teaching context');
  let plan = await f.get(path);
  assert.equal(plan.event.className, 'JPI');
  assert.equal(plan.event.location, 'CW');
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
  assert.equal((await f.get('sessions/2027-01-04/p2')).teaching, undefined);
  assert.equal((await f.get('sessions/2026-11-23/whanau')).teaching, undefined);
});

test('Whanau saves and reopens independently of P1, with revisions and no class-progress linkage', async t => {
  const f = await fixture(t), whanau = 'sessions/2026-11-23/whanau', p1 = 'sessions/2026-11-23/p1';
  const first = await f.get(p1), plan = await f.get(whanau);
  assert.equal(plan.event.title, 'WHANAU (9WHAU)');
  assert.equal(plan.event.classKey, '9WHAU');
  assert.equal(plan.content.session.type, 'whanau');
  assert.equal(plan.content.session.startTime, '08:45');
  first.content.note = 'P1 observation preparation';
  first.content.session.type = 'observation';
  assert.equal((await f.put(p1, first.content, 0)).status, 200);
  plan.content.note = 'Whanau notices and routine';
  assert.equal((await f.put(whanau, plan.content, 0)).status, 200);
  assert.equal((await f.put(whanau, plan.content, 0)).status, 409);
  const reopened = await f.get(whanau);
  assert.equal(reopened.content.note, plan.content.note);
  assert.equal(reopened.revision, 1);
  assert.equal((await f.get(p1)).content.note, first.content.note);
  assert.equal((await f.get(p1)).revision, 1);
  assert.equal((await f.put(whanau + '?confirm=true', plan.content, 1)).status, 400);
  const forged = { ...plan.content, activities: draft([]).activities };
  assert.equal((await f.put(whanau, forged, 1)).status, 400);
  assert.equal(f.checkpoints.size, 0);
  assert.equal((await f.get('sessions/2026-11-30/p2')).previous.length, 0);
  const other = await fetch(f.base + whanau, { headers: { ...f.headers, 'x-test-user': OTHER } });
  assert.equal((await other.json()).content.note, '', 'session notes are owner-private');
});

test('ambiguous timetable events leave date-and-slot notes available without selecting a class', async t => {
  const f = await fixture(t), path = 'sessions/2026-11-23/whanau';
  const original = await f.get(path);
  original.content.note = 'Existing date and slot notes';
  assert.equal((await f.put(path, original.content, 0)).status, 200);
  f.makeWhanauAmbiguous();
  const plan = await f.get(path);
  assert.equal(plan.event.source, 'ambiguous');
  assert.equal(plan.event.classKey, null);
  assert.equal(plan.event.location, '');
  assert.equal(plan.content.note, '');
  assert.equal(plan.otherClassNotes[0].content.note, 'Existing date and slot notes');
  assert.equal(plan.revision, 0);
  plan.content.note = 'Unassigned period note';
  assert.equal((await f.put(path, plan.content, 0)).status, 200);
  assert.equal((await f.get(path)).content.note, 'Unassigned period note');
  assert.equal(f.records.size, 2);
});

test('session notes and actual progress follow class, date and period without overwriting earlier classes', async t => {
  const f = await fixture(t), path = 'sessions/2026-11-23/whanau';
  const first = await f.get(path);
  first.content.actualProgress = 'Students completed the check-in';
  first.content.note = 'Start with notices next time';
  assert.equal((await f.put(path, first.content, 0)).status, 200);
  f.setWhanauClass('9OTHER');
  assert.equal((await f.put(path, first.content, 1)).status, 409, 'a stale class cannot save against the new timetable');
  const second = await f.get(path);
  assert.equal(second.content.note, '');
  assert.equal(second.otherClassNotes[0].content.actualProgress, first.content.actualProgress);
  second.content.actualProgress = 'Different class progress';
  second.content.note = 'Different reminder';
  assert.equal((await f.put(path, second.content, 0)).status, 200);
  f.setWhanauClass('9WHAU');
  const reopened = await f.get(path);
  assert.equal(reopened.content.actualProgress, first.content.actualProgress);
  assert.equal(reopened.content.note, first.content.note);
  assert.equal(reopened.otherClassNotes[0].content.note, second.content.note);
  assert.equal((await f.get('sessions/2026-11-30/whanau')).content.note, '');
});

test('legacy period notes are adopted only for a matching timetable title and remain available otherwise', async t => {
  const f = await fixture(t), path = 'sessions/2026-11-23/whanau';
  const legacy = await f.get(path);
  delete legacy.content.session.classKey;
  legacy.content.note = 'Existing original notes';
  assert.equal((await f.put(path, legacy.content, 0)).status, 200);
  f.setWhanauClass('9OTHER');
  const other = await f.get(path);
  assert.equal(other.content.note, '');
  assert.equal(other.unassignedNotes.note, legacy.content.note);
  f.setWhanauClass('9WHAU');
  const matching = await f.get(path);
  assert.equal(matching.content.note, legacy.content.note);
  matching.content.actualProgress = 'Recorded now';
  assert.equal((await f.put(path, matching.content, matching.revision)).status, 200);
  const reopened = await f.get(path);
  assert.equal(reopened.content.note, legacy.content.note);
  assert.equal(reopened.content.actualProgress, 'Recorded now');
  assert.equal(f.records.size, 1);
});

test('JPI previous recorded progress includes unconfirmed notes without confirming outcomes', async t => {
  const f = await fixture(t), first = await f.get('sessions/2026-11-23/p2');
  first.content.actualProgress = 'Reached the second example';
  first.content.note = 'Start with a recap';
  assert.equal((await f.put('sessions/2026-11-23/p2', first.content, 0)).status, 200);
  const later = await f.get('sessions/2026-11-30/p2');
  assert.equal(later.previousSession.content.actualProgress, first.content.actualProgress);
  assert.equal(later.previous.length, 0);
  assert.equal(later.previousSession.confirmed_content, null);
});

test('JPI previous session chooses the latest earlier period and never crosses class or year', async t => {
  const f = await fixture(t);
  const record = (date, slot, group, title, actualProgress) => {
    const row = { owner_id: OWNER, date, session_date: date, slot_key: slot, group_key: group,
      content: { session: { title }, actualProgress }, confirmed_content: null };
    f.records.set([OWNER, date.slice(0, 4), date, group].join('|'), row);
  };
  record('2026-11-22', 'p2', 'session:p2:JPI', 'PIDTECH (JPI)', 'Earlier day');
  record('2026-11-23', 'p1', 'session:p1', 'PIDTECH (JPI)', 'Earlier period');
  record('2026-11-23', 'p3', 'session:p3:JPI', 'PIDTECH (JPI)', 'Later period');
  record('2026-11-23', 'whanau', 'session:whanau:OTHER', 'OTHER', 'Different class');
  record('2025-11-23', 'p2', 'session:p2:JPI', 'PIDTECH (JPI)', 'Different year');
  const plan = await f.get('sessions/2026-11-23/p2');
  assert.equal(plan.previousSession.content.actualProgress, 'Earlier period');
  assert.equal(plan.previousSession.slot_key, 'p1');
});

test('manual commitments use independent stable IDs, can be reopened and never write calendar or class records', async t => {
  const f = await fixture(t), slot = 'manual-' + crypto.randomUUID(), path = 'sessions/2026-11-23/' + slot;
  const plan = await f.get(path);
  assert.equal(plan.event.source, 'manual');
  Object.assign(plan.content.session, { title: 'Library duty', type: 'duty', startTime: '13:30', endTime: '13:50' });
  plan.content.note = 'Duty arrangements';
  assert.equal((await f.put(path, plan.content, 0)).status, 200);
  assert.deepEqual((await f.get(path)).content, plan.content);
  const list = await f.get('sessions/2026-11-23');
  assert.equal(list.sessions[0].slot_key, slot);
  assert.equal(list.sessions[0].title, 'Library duty');
  plan.content.session.type = 'meeting';
  assert.equal((await f.put(path, plan.content, 1)).status, 200);
  assert.equal((await f.put(path, plan.content, 1)).status, 409);
  plan.content.session.startTime = '25:00';
  assert.equal((await f.put(path, plan.content, 2)).status, 400);
  assert.ok(!f.statements.some(sql => /(?:INSERT INTO|UPDATE|DELETE FROM) (?:teacher_calendar|planner_class_contexts|planner_sections)/.test(sql)));
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
  const generic = async slot => (await fetch(base + 'sessions/2026-11-23/' + slot, { headers })).json();
  const save = (slot, content, revision) => fetch(base + 'sessions/2026-11-23/' + slot, { method: 'PUT', headers,
    body: JSON.stringify({ content, revision }) });
  const whanau = await generic('whanau'), observation = await generic('p1');
  whanau.content.note = 'Whanau-only notes';
  observation.content.note = 'Observation-only notes'; observation.content.session.type = 'observation';
  assert.equal((await save('p1', observation.content, 0)).status, 200);
  assert.equal((await save('whanau', whanau.content, 0)).status, 200);
  assert.equal((await save('whanau', whanau.content, 0)).status, 409);
  assert.equal((await generic('whanau')).content.note, 'Whanau-only notes');
  assert.equal((await generic('p1')).content.note, 'Observation-only notes');
  whanau.content.note = 'Updated Whanau notes';
  assert.equal((await save('whanau', whanau.content, 1)).status, 200);
  assert.equal((await generic('whanau')).content.note, 'Updated Whanau notes');
  assert.equal((await generic('p1')).content.note, 'Observation-only notes');
  assert.equal((await generic('p2')).revision, 1, 'Whanau does not change JPI progress');
  const manual = 'manual-' + crypto.randomUUID(), duty = await generic(manual);
  duty.content.session.title = 'Private duty'; duty.content.session.type = 'duty';
  assert.equal((await save(manual, duty.content, 0)).status, 200);
  assert.equal((await generic(manual)).content.session.type, 'duty');
  const untouched = await pool.query("SELECT count(*)::integer AS count FROM planner_sessions WHERE session_type <> 'teaching' AND (confirmed_content IS NOT NULL OR lesson_id IS NOT NULL OR unit_id IS NOT NULL)");
  assert.equal(untouched.rows[0].count, 0);
});
