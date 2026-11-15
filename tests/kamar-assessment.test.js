const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
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
      if (sql.includes('FROM kamar_assessment_snapshots s WHERE s.school_year')) return { rows: [] };
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
