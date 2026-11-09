const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const vm = require('node:vm');
const history = require('../src/legacy/kamar-uploader/history');
const { readArchiveFile, planArchive, importArchive } = require('../src/legacy/kamar-uploader/archive');

const sample = () => ({ type: 'student_timetable', year: 2026, term: 3, date: '2026-07-23', time: '14:15:54',
  name: 'TimeTableSummaryStudents_20260723_141554.csv', origin: 'archive',
  payload: { headers: ['Student Name', 'ID Number', 'Year Level', 'Mon P1', 'Mon P1', ''],
    rows: [['Synthetic Student', '100', '8', 'AAA-JDTECH', 'BBB-JDTECH', '']] } });

test('history validation accepts existing Term labels and rejects invalid metadata without losing duplicate CSV columns', () => {
  const dataset = sample();
  history.validate(dataset);
  for (const term of [1, '1', 'Term 3', 'Term 4']) {
    const snapshot = history.fromRequest({ path: '/API/Student_Upload/', body: { uploadYear: 2026,
      uploadTerm: term, uploadDate: '2026-07-23', headers: dataset.payload.headers, students: dataset.payload.rows } });
    assert.equal(snapshot.term, Number(String(term).replace('Term ', '')));
    assert.deepEqual(snapshot.payload, dataset.payload);
  }
  for (const patch of [{ term: 5 }, { date: '2026-02-30' }, { year: 2025 }, { time: '25:01:00' },
    { payload: { headers: ['one'], rows: [['one', 'two']] } }, { payload: { headers: ['one'], rows: [] } }]) {
    assert.throws(() => history.validate({ ...dataset, ...patch }), /valid year, term/);
  }
});

test('archive plan retains headerless staff, duplicate periods, BOM, quoted fields and unsupported-file notices', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kamar-history-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const directory = path.join(root, 'Term 3');
  await fs.mkdir(directory);
  const student = path.join(directory, sample().name);
  const csv = '\uFEFFStudent Name,ID Number,Year Level,Mon P1,Mon P1,\r\n"Synthetic, Student",100,8,AAA-JDTECH,BBB-JDTECH,\r\n';
  await fs.writeFile(student, csv);
  await fs.writeFile(path.join(directory, 'ReportingStaffList_20260723_141757.csv'), 'TST,Teacher,Synthetic,Mx,teacher@school.test\nALT,Other,Synthetic,Mx,other@school.test\n');
  await fs.writeFile(path.join(directory, '81B-MFOOD.csv'), 'custom,export\none,two\n');
  await fs.writeFile(path.join(directory, 'attendance.pdf'), 'synthetic');
  const plan = await planArchive(root, 2026);
  assert.equal(plan.datasets.length, 2);
  assert.equal(plan.excluded.length, 2);
  const staff = plan.datasets.find(item => item.dataset.type === 'staff');
  assert.equal(staff.dataset.payload.rows.length, 2);
  assert.equal(staff.dataset.payload.rows[0][0], 'TST');
  assert.equal(staff.warnings.length, 1);
  const timetable = plan.datasets.find(item => item.dataset.type === 'student_timetable').dataset;
  assert.equal(timetable.rawCsv, csv);
  assert.equal(timetable.payload.headers.filter(header => header === 'Mon P1').length, 2);
  assert.equal(timetable.payload.rows[0][0], 'Synthetic, Student');
  await assert.rejects(planArchive(root, 2025), /valid year/);
  assert.equal(await readArchiveFile(path.join(directory, '81B-MFOOD.csv'), 2026, 3), null);
});

test('archive import rolls back the complete batch when any write fails', async () => {
  const calls = [];
  const client = { query: async sql => {
    calls.push(sql);
    if (sql.startsWith('INSERT INTO')) throw new Error('Synthetic failure');
    return { rows: [] };
  } };
  await assert.rejects(importArchive(client, { datasets: [{ dataset: sample() }] }), /Synthetic failure/);
  assert.equal(calls.at(-1), 'ROLLBACK');
  assert.ok(!calls.includes('COMMIT'));
  assert.ok(calls.every(sql => !/UPDATE|DELETE|TRUNCATE/.test(sql)));
});

test('history APIs remain admin-only, validate filters and IDs, and missing migration blocks writes but not reads', async t => {
  const file = path.join(__dirname, '..', 'src', 'legacy', 'kamar-uploader', 'routes.js');
  let migrated = false;
  const writes = [];
  const pool = { query: async sql => {
    if (sql.includes('kamar_history_migrations')) return { rows: migrated ? [{}] : [] };
    if (sql.includes('FROM kamar_datasets')) return { rows: [] };
    if (sql.includes('staff_upload')) return { rows: [] };
    writes.push(sql); throw new Error('Unexpected query');
  }, connect: async () => assert.fail('No current-data writes expected') };
  const dependencies = { './db': { pool }, './store': { init: async () => {} }, './history': history,
    './departments': require('../src/legacy/kamar-uploader/departments'), '../../db': {} };
  const module = { exports: {} };
  vm.runInThisContext('(function(require,module,exports){' + await fs.readFile(file, 'utf8') + '\n})')(
    key => dependencies[key] || require(key), module, module.exports);
  const app = express(); app.use(express.json());
  app.use((req, res, next) => {
    if (req.headers['x-test-role']) req.user = { roles: [req.headers['x-test-role']], email: 'admin@school.test' };
    next();
  });
  app.use(module.exports);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = (url, role = 'ADMIN') => fetch(base + url, { headers: role ? { 'x-test-role': role } : {} });
  for (const url of ['/api/kamar-datasets?year=2026', '/api/kamar-datasets/123']) {
    assert.equal((await get(url, '')).status, 401);
    assert.equal((await get(url, 'Teacher')).status, 403);
  }
  assert.equal((await get('/api/kamar-datasets?year=2026&term=5')).status, 400);
  assert.equal((await get('/api/kamar-datasets?year=invalid')).status, 400);
  assert.equal((await get('/api/kamar-datasets/invalid')).status, 400);
  assert.equal((await get('/api/kamar-datasets/10000000-0000-4000-8000-000000000000')).status, 404);
  assert.equal((await get('/api/kamar-datasets?year=2026&term=3')).status, 200);
  assert.equal((await get('/api/staff_upload/all')).status, 200);
  for (const [url, method] of [['/api/staff_upload', 'POST'], ['/api/student_upload/sync-emails', 'POST'],
    ['/api/upload_timetable/row/TST', 'PUT'], ['/API/Upload_Timetable/row/TST', 'PUT']]) {
    assert.equal((await fetch(base + url, { method, headers: { 'x-test-role': 'ADMIN', 'Content-Type': 'application/json' },
      body: '{}' })).status, 503);
  }
  migrated = true;
  assert.equal((await fetch(base + '/api/staff_upload', { method: 'POST',
    headers: { 'x-test-role': 'ADMIN', 'Content-Type': 'application/json' }, body: '{}' })).status, 400);
  assert.equal(writes.length, 0);
});

test('PostgreSQL preserves baselines, statuses, snapshots, rollback and immutability', {
  skip: !process.env.KAMAR_HISTORY_TEST_DATABASE_URL
}, async t => {
  const { Client } = require('pg');
  const client = new Client({ connectionString: process.env.KAMAR_HISTORY_TEST_DATABASE_URL });
  await client.connect();
  const schema = 'kamar_history_test_' + require('node:crypto').randomBytes(8).toString('hex');
  await client.query(`CREATE SCHEMA ${schema}`);
  t.after(async () => {
    await client.query(`DROP SCHEMA ${schema} CASCADE`);
    await client.end();
  });
  await client.query(`SET search_path TO ${schema}`);
  for (const table of ['staff_upload', 'student_details_upload', 'student_upload', 'timetable_upload']) {
    await client.query(`CREATE TABLE ${table} (id integer PRIMARY KEY,teacher text,status text,data jsonb)`);
    await client.query(`INSERT INTO ${table} VALUES (1,'TST','Not Current','{"term":3}')`);
  }
  await history.migrate(client);
  await history.migrate(client);
  assert.equal((await client.query('SELECT count(*)::int AS n FROM kamar_record_versions')).rows[0].n, 4);
  const dataset = sample();
  const plan = { datasets: [{ dataset }, { dataset: { ...dataset, term: 4, date: '2026-10-28' } }] };
  const before = (await client.query('SELECT * FROM student_upload')).rows;
  const result = await importArchive(client, plan);
  assert.equal(result.filter(item => item.inserted).length, 2);
  assert.equal((await importArchive(client, plan)).filter(item => item.inserted).length, 0);
  assert.deepEqual((await client.query('SELECT * FROM student_upload')).rows, before);
  assert.equal((await client.query('SELECT count(*)::int AS n FROM kamar_record_versions')).rows[0].n, 4);
  const saved = (await client.query('SELECT payload FROM kamar_datasets WHERE id=$1', [result[0].id])).rows[0].payload;
  assert.deepEqual(saved, dataset.payload);
  await client.query('BEGIN');
  await client.query("SELECT set_config('whs.kamar_dataset_id',$1,true)", [result[1].id]);
  await client.query("UPDATE student_upload SET data='{\"term\":4}',status='Current'");
  await client.query('COMMIT');
  const versions = (await client.query("SELECT * FROM kamar_record_versions WHERE source_table='student_upload' ORDER BY id")).rows;
  assert.equal(versions.length, 3);
  assert.deepEqual(versions.map(row => row.record.status), ['Not Current', 'Not Current', 'Current']);
  assert.equal(versions[1].dataset_id, result[1].id);
  await client.query('DELETE FROM staff_upload');
  assert.equal((await client.query("SELECT record->>'status' AS status FROM kamar_record_versions WHERE event='delete-before'")).rows[0].status, 'Not Current');
  for (const table of ['kamar_datasets', 'kamar_record_versions']) {
    const column = table === 'kamar_datasets' ? 'row_count' : 'event';
    for (const sql of [`UPDATE ${table} SET ${column}=${column}`, `DELETE FROM ${table}`, `TRUNCATE ${table} CASCADE`]) {
      await assert.rejects(client.query(sql), /append-only/);
    }
  }
  await assert.rejects(client.query('TRUNCATE student_upload'), /must not be truncated/);
  const count = (await client.query('SELECT count(*)::int AS n FROM kamar_record_versions')).rows[0].n;
  await client.query('BEGIN');
  await history.saveDataset(client, { ...dataset, term: 2 });
  await client.query("UPDATE student_upload SET status='Not Current'");
  await client.query('ROLLBACK');
  assert.equal((await client.query('SELECT count(*)::int AS n FROM kamar_datasets')).rows[0].n, 2);
  assert.equal((await client.query('SELECT count(*)::int AS n FROM kamar_record_versions')).rows[0].n, count);
  assert.equal((await client.query('SELECT status FROM student_upload')).rows[0].status, 'Current');

  const periods = ['mon', 'tue', 'wed', 'thu', 'fri'].flatMap(day =>
    ['p1_1', 'p1_2', 'p2', 'i', 'p3', 'p4', 'l', 'p5'].map(period => day + '_' + period));
  await client.query(`ALTER TABLE student_upload
    ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (START WITH 2),
    ADD COLUMN id_number text UNIQUE, ADD COLUMN student_name text CHECK(student_name <> 'FAIL'),
    ADD COLUMN form_class text, ADD COLUMN year_level text, ADD COLUMN upload_year int,
    ADD COLUMN upload_term text, ADD COLUMN upload_date date, ADD COLUMN updated_at timestamptz,
    ${periods.map(period => 'ADD COLUMN ' + period + ' text').join(',')}`);
  const dependencies = { './db': { pool: { query: (...args) => client.query(...args),
    connect: async () => ({ query: (...args) => client.query(...args), release() {} }) } },
    './store': { init: async () => {} }, './history': history,
    './departments': require('../src/legacy/kamar-uploader/departments'), '../../db': {} };
  const module = { exports: {} };
  const file = path.join(__dirname, '..', 'src', 'legacy', 'kamar-uploader', 'routes.js');
  vm.runInThisContext('(function(require,module,exports){' + await fs.readFile(file, 'utf8') + '\n})')(
    key => dependencies[key] || require(key), module, module.exports);
  const app = express(); app.use(express.json());
  app.use((req, res, next) => { req.user = { roles: ['ADMIN'] }; next(); });
  app.use(module.exports);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const upload = (term, name = 'Synthetic Student') => fetch(`http://127.0.0.1:${server.address().port}/api/student_upload`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uploadYear: 2026, uploadTerm: 'Term ' + term, uploadDate: '2026-07-23',
        headers: dataset.payload.headers, students: [[name, '100', '8', 'AAA-JDTECH', 'BBB-JDTECH', '']] })
    });
    const first = await upload(3);
    assert.equal(first.status, 200);
    const firstId = (await first.json()).dataset_id;
    const second = await upload(4);
    assert.equal(second.status, 200);
    const secondId = (await second.json()).dataset_id;
    assert.notEqual(firstId, secondId);
    assert.equal((await client.query("SELECT upload_term FROM student_upload WHERE id_number='100'")).rows[0].upload_term, 'Term 4');
    const savedUpload = (await client.query('SELECT payload FROM kamar_datasets WHERE id=$1', [firstId])).rows[0].payload;
    assert.deepEqual(savedUpload, dataset.payload);
    const snapshots = (await client.query('SELECT count(*)::int AS n FROM kamar_datasets')).rows[0].n;
    const versionsBeforeFailure = (await client.query('SELECT count(*)::int AS n FROM kamar_record_versions')).rows[0].n;
    assert.equal((await upload(2, 'FAIL')).status, 500);
    assert.equal((await client.query('SELECT count(*)::int AS n FROM kamar_datasets')).rows[0].n, snapshots);
    assert.equal((await client.query('SELECT count(*)::int AS n FROM kamar_record_versions')).rows[0].n, versionsBeforeFailure);
    assert.equal((await client.query("SELECT upload_term FROM student_upload WHERE id_number='100'")).rows[0].upload_term, 'Term 4');
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/kamar-datasets/${firstId}`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-disposition'), /attachment/);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual((await response.json()).payload, dataset.payload);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
