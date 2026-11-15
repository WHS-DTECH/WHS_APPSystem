const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const session = require('express-session');
const { validate, createAssessmentRouter } = require('../src/legacy/kamar-uploader/assessment');

const example = () => ({
  year: 2026, observedOn: '2026-11-15', sourceName: 'fictional.png', imageHash: 'a'.repeat(64),
  supersedesId: null, reviewed: true,
  assessment: { className: '11TEST', standardNumber: '92004', code: '', title: 'Synthetic standard',
    version: '2', credits: '5', level: '1' },
  rows: [
    { visibleName: 'Fictional, Avery', studentId: '100', yearLevel: '11', tutor: '11TEST', course: '11TEST',
      entered: true, published: false, notify: null, status: 'result', result: 'Achieved', derivedGrade: '',
      reviewed: true, matchConfirmed: true },
    { visibleName: 'Fictional, Blair', studentId: '', yearLevel: '', tutor: '', course: '',
      entered: null, published: null, notify: null, status: 'external', result: '', derivedGrade: 'Merit',
      reviewed: true, matchConfirmed: false }
  ]
});

const namesOnly = () => ({
  year: null, observedOn: null, sourceName: null, imageHash: null, supersedesId: null, reviewed: true,
  assessment: { className: '', standardNumber: '', code: '', title: '', version: '', credits: '', level: '' },
  rows: [{ visibleName: 'Avery Fictional', studentId: '', yearLevel: '', tutor: '', course: '',
    entered: null, published: null, notify: null, status: 'unknown', result: '', derivedGrade: '',
    reviewed: true, matchConfirmed: false }]
});

function saveButtonFixture({ rows = namesOnly().rows, reviewed = true, request, loadHistory } = {}) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'legacy', 'kamar-uploader', 'site', 'assessment.js'), 'utf8');
  const start = source.indexOf("  $('save').addEventListener('click', async () => {");
  const end = source.indexOf('  async function openSnapshot(', start);
  assert.ok(start !== -1 && end > start);
  const elements = Object.fromEntries(['year', 'date', 'class', 'number', 'code', 'title', 'version',
    'credits', 'level', 'reviewed', 'save', 'history-year'].map(id => [id, { value: '', checked: false, disabled: false }]));
  elements.reviewed.checked = reviewed;
  const state = { busy: false, historical: false, csrf: 'token', imageHash: '', sourceName: '', supersedesId: null, rows };
  let handler, message, error;
  elements.save.addEventListener = (_type, callback) => { handler = callback; };
  const showSave = (value, failed = false) => { message = value; error = failed; };
  new Function('$', 'state', 'request', 'clear', 'loadHistory', 'showSave', source.slice(start, end))(
    id => elements[id], state, request || (async () => ({})), () => {},
    loadHistory || (async () => {}), showSave);
  return { click: () => handler(), state, elements, result: () => ({ message, error }) };
}

test('save feedback identifies missing review steps beside the button', async () => {
  const input = namesOnly().rows[0];
  for (const [options, expected] of [
    [{ rows: [] }, /Add at least one student/],
    [{ rows: [{ ...input, visibleName: '' }] }, /Enter a name for Student 1/],
    [{ rows: [{ ...input, reviewed: false }] }, /confirmation box on Student 1/],
    [{ reviewed: false }, /final confirmation box/]
  ]) {
    let calls = 0;
    const fixture = saveButtonFixture({ ...options, request: async () => { calls++; } });
    await fixture.click();
    assert.match(fixture.result().message, expected);
    assert.equal(fixture.result().error, true);
    assert.equal(calls, 0);
  }
});

test('save feedback reports server errors and successful saves without discarding failed work', async () => {
  const failure = saveButtonFixture({ request: async () => { throw new Error('Run the KAMAR history migration.'); } });
  await failure.click();
  assert.match(failure.result().message, /Snapshot not saved.*migration/);
  assert.equal(failure.result().error, true);
  assert.equal(failure.state.rows.length, 1);
  assert.equal(failure.elements.save.disabled, false);

  const success = saveButtonFixture();
  await success.click();
  assert.match(success.result().message, /snapshot saved/i);
  assert.equal(success.result().error, false);
  const historyFailure = saveButtonFixture({ loadHistory: async () => { throw new Error('offline'); } });
  await historyFailure.click();
  assert.match(historyFailure.result().message, /Snapshot saved, but the history list/);
});

async function fixture(t) {
  const owner = crypto.randomUUID(), snapshots = new Map(), writes = [];
  const pool = {
    async query(sql, values) {
      if (sql.includes('FROM student_details_upload')) return { rows: [
        { id_number: '100', first_name: 'Avery', last_name: 'Fictional', status: 'Current' }
      ] };
      if (sql.includes('FROM kamar_assessment_snapshots s WHERE s.id')) {
        const row = snapshots.get(values[0]);
        return { rows: row ? [{ ...row, is_current: ![...snapshots.values()].some(item => item.supersedes_id === row.id) }] : [] };
      }
      if (sql.includes('FROM kamar_assessment_snapshots s WHERE s.school_year')) {
        return { rows: [...snapshots.values()].filter(row => row.school_year === values[0] || row.school_year === null)
          .map(row => ({ ...row, assessment: row.data.assessment, row_count: row.data.rows.length,
            is_current: ![...snapshots.values()].some(item => item.supersedes_id === row.id) })) };
      }
      assert.fail('Unexpected pool query: ' + sql);
    },
    async connect() {
      return {
        async query(sql, values) {
          writes.push({ sql, values });
          if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) return { rows: [] };
          if (sql.includes('SELECT id,image_hash')) {
            const row = snapshots.get(values[0]); return { rows: row ? [row] : [] };
          }
          if (sql.includes('SELECT id_number FROM student_details_upload')) {
            return { rows: values[0].filter(id => id === '100').map(id_number => ({ id_number })) };
          }
          if (sql.startsWith('INSERT INTO kamar_assessment_snapshots')) {
            if (values[6] && [...snapshots.values()].some(row => row.supersedes_id === values[6])) {
              throw Object.assign(new Error('Synthetic conflict'), { code: '23505' });
            }
            snapshots.set(values[0], { id: values[0], school_year: values[1], observed_on: values[2],
              source_name: values[3], image_hash: values[4], data: JSON.parse(values[5]), supersedes_id: values[6],
              created_by: values[7] });
            return { rows: [] };
          }
          assert.fail('Unexpected transaction query: ' + sql);
        },
        release() {}
      };
    }
  };
  const app = express(); app.use(express.json());
  app.use(session({ secret: 'kamar-assessment-test-secret', resave: false, saveUninitialized: false }));
  app.use((req, res, next) => {
    const role = req.get('x-test-role');
    if (!role) return res.status(401).json({ error: 'Sign in.' });
    if (role !== 'ADMIN') return res.status(403).json({ error: 'Admin access required.' });
    req.user = { id: owner, roles: [role] }; next();
  });
  app.use('/api/kamar-assessment', createAssessmentRouter({ pool, appBaseUrl: 'https://school.example.test' }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  let cookie;
  const call = async (path, options = {}) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/kamar-assessment${path}`, {
      ...options, headers: { 'x-test-role': 'ADMIN', ...(cookie ? { cookie } : {}), ...options.headers }
    });
    if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
    return response;
  };
  return { owner, snapshots, writes, call };
}

test('review validation preserves unknowns and distinguishes derived and official results', () => {
  validate(example());
  validate(namesOnly());
  for (const change of [
    input => { input.reviewed = false; },
    input => { input.observedOn = '2026-02-30'; },
    input => { input.rows[0].matchConfirmed = false; },
    input => { input.rows[0].reviewed = false; },
    input => { input.rows[0].entered = 'false'; },
    input => { input.rows[0].result = ''; },
    input => { input.rows[1].studentId = '100'; input.rows[1].matchConfirmed = true; },
    input => { input.imageHash = 'not-an-image-hash'; }
  ]) {
    const input = example(); change(input);
    assert.throws(() => validate(input));
  }
  for (const change of [
    input => { input.sourceName = 'fictional.png'; },
    input => { input.imageHash = 'a'.repeat(64); },
    input => { input.year = 0; },
    input => { input.rows[0].visibleName = ' '; }
  ]) {
    const input = namesOnly(); change(input);
    assert.throws(() => validate(input));
  }
});

test('names can be saved unmatched and completed later without changing the original', async t => {
  const { snapshots, call } = await fixture(t);
  const { csrf } = await (await call('/session')).json();
  const save = input => call('/snapshots', { method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://school.example.test', 'x-kamar-assessment-csrf': csrf },
    body: JSON.stringify(input) });
  const first = await save(namesOnly());
  assert.equal(first.status, 201);
  const { id } = await first.json();
  const original = (await (await call('/snapshots/' + id)).json()).snapshot;
  assert.equal(original.school_year, null);
  assert.equal(original.observed_on, null);
  assert.equal(original.image_hash, null);
  assert.equal(original.data.rows[0].studentId, '');
  assert.equal(original.data.rows[0].entered, null);
  assert.equal((await (await call('/snapshots?year=2026')).json()).snapshots.length, 1);
  const completed = namesOnly();
  completed.supersedesId = id;
  completed.year = 2026;
  completed.assessment.standardNumber = '92004';
  completed.rows[0].studentId = '100';
  completed.rows[0].matchConfirmed = true;
  completed.sourceName = 'fictional.png';
  completed.imageHash = 'a'.repeat(64);
  const saved = await save(completed);
  assert.equal(saved.status, 201);
  assert.equal(snapshots.get(id).data.rows[0].studentId, '');
  const newest = (await (await call('/snapshots/' + (await saved.json()).id)).json()).snapshot;
  assert.equal(newest.data.rows[0].studentId, '100');
  assert.equal(newest.image_hash, 'a'.repeat(64));
  assert.equal((await save(completed)).status, 409);
});

test('assessment snapshots require admin, CSRF, reviewed matches and append-only correction', async t => {
  const { owner, snapshots, writes, call } = await fixture(t);
  assert.equal((await call('/students', { headers: { 'x-test-role': 'Teacher' } })).status, 403);
  const { csrf } = await (await call('/session')).json();
  const save = (input, headers = {}) => call('/snapshots', { method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://school.example.test', ...headers },
    body: JSON.stringify(input) });
  assert.equal((await save(example())).status, 403);
  assert.equal((await save(example(), { 'x-kamar-assessment-csrf': csrf, Origin: 'https://other.example.test' })).status, 403);
  const bad = example(); bad.rows[0].studentId = 'does-not-exist';
  assert.equal((await save(bad, { 'x-kamar-assessment-csrf': csrf })).status, 409);
  const saved = await save(example(), { 'x-kamar-assessment-csrf': csrf });
  assert.equal(saved.status, 201);
  const { id } = await saved.json();
  const snapshot = (await (await call('/snapshots/' + id)).json()).snapshot;
  assert.equal(writes.find(item => item.sql.startsWith('INSERT INTO kamar_assessment_snapshots')).values[7], owner);
  assert.equal(snapshot.data.rows[0].studentId, '100');
  assert.equal(snapshot.data.rows[0].published, false);
  assert.equal(snapshot.data.rows[1].studentId, '');
  assert.equal(snapshot.data.rows[1].derivedGrade, 'Merit');
  assert.equal(snapshot.data.rows[1].result, '');
  const correction = example(); correction.supersedesId = id; correction.rows[0].result = 'Merit';
  assert.equal((await save(correction, { 'x-kamar-assessment-csrf': csrf })).status, 201);
  assert.equal((await save(correction, { 'x-kamar-assessment-csrf': csrf })).status, 409);
  assert.equal((await (await call('/snapshots/' + id)).json()).snapshot.is_current, false);
  assert.equal(snapshots.get(id).data.rows[0].result, 'Achieved');
  assert.equal(snapshots.size, 2);
  const otherImage = example(); otherImage.supersedesId = id; otherImage.imageHash = 'b'.repeat(64);
  assert.equal((await save(otherImage, { 'x-kamar-assessment-csrf': csrf })).status, 409);
  assert.ok(writes.filter(item => /^(?:INSERT|UPDATE|DELETE)/.test(item.sql))
    .every(item => item.sql.startsWith('INSERT INTO kamar_assessment_snapshots')));
});
