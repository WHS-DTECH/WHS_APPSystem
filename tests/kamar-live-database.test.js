const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const express = require('express');
const { databaseOptions } = require('../src/legacy/kamar-uploader/db');
const { currentDirectory, classifyPeople } = require('../src/kamarDirectory');
const { syncKamarRoles } = require('../src/roleSync');

const source = name => fs.readFileSync(path.join(__dirname, '..', 'src', 'legacy', 'kamar-uploader', name), 'utf8');

function loadWithDependencies(name, dependencies) {
  const module = { exports: {} };
  const execute = vm.runInThisContext('(function(require,module,exports){\n' + source(name) + '\n})', { filename: name });
  execute(key => dependencies[key] || require(key), module, module.exports);
  return module.exports;
}

test('Kamar database requires its explicit legacy connection and never uses Core or Learning Sites as fallback', () => {
  const legacy = 'postgresql://fixture:password@legacy.example.test/kamar';
  const core = 'postgresql://fixture:password@core.example.test/core';
  assert.equal(databaseOptions({ INTEGRATION_KAMAR_DATABASE_URL: legacy }, core).connectionString, legacy);
  assert.deepEqual(databaseOptions({ INTEGRATION_KAMAR_DATABASE_URL: legacy }, core).ssl, { rejectUnauthorized: false });
  assert.equal(databaseOptions({ INTEGRATION_KAMAR_DATABASE_URL: legacy, KAMAR_DATABASE_SSL: 'false' }, core).ssl, false);
  assert.throws(() => databaseOptions({ INTEGRATION_LEARNING_SITES_DATABASE_URL: legacy }, core), /No fallback/);
  assert.throws(() => databaseOptions({ INTEGRATION_KAMAR_DATABASE_URL: core }, core), /not Global Control/);
  assert.throws(() => databaseOptions({ INTEGRATION_KAMAR_DATABASE_URL: core.replace('postgresql:', 'postgres:') }, core), /not Global Control/);
  assert.throws(() => databaseOptions({ INTEGRATION_KAMAR_DATABASE_URL: 'https://example.test/kamar' }, core), /PostgreSQL/);
});

test('Kamar initialization validates existing tables without writing or importing and retries failed checks', async () => {
  let unavailable = true;
  const calls = [];
  const store = loadWithDependencies('store.js', { './db': { query: sql => {
    calls.push(sql);
    if (unavailable) throw new Error('Unavailable');
    return Promise.resolve({ rows: [] });
  } } });
  await assert.rejects(store.init(), /Unavailable/);
  unavailable = false;
  await store.init();
  const completed = calls.length;
  await store.init();
  assert.equal(calls.length, completed);
  assert.ok(calls.every(sql => /^SELECT .* LIMIT 0$/.test(sql)));
  assert.doesNotMatch(source('store.js'), /CREATE TABLE|INSERT INTO|copyTable|importLegacyData|SCHEMA_SQL/);
});

test('Core classification and role synchronization use current legacy emails, not imported Core tables', async () => {
  const directoryQuery = async sql => ({ rows: sql.includes('FROM staff_upload') ? [
    { email_school: ' Staff@School.test ', first_name: 'Current', last_name: 'Teacher' },
    { email_school: null }
  ] : [{ email_school: 'student@school.test' }] });
  const directory = await currentDirectory(directoryQuery);
  assert.deepEqual(directory.staffEmails, ['staff@school.test']);
  assert.deepEqual(directory.studentEmails, ['student@school.test']);
  const classified = classifyPeople([{ email: 'STAFF@school.test' }, { email: 'student@school.test' }, { email: 'former@school.test' }], directory);
  assert.deepEqual(classified.map(person => [person.is_staff, person.is_student]), [[true, false], [false, true], [false, false]]);
  const writes = [];
  await syncKamarRoles({ query: async (sql, params) => { writes.push({ sql, params }); } }, 'user', 'staff@school.test',
    async sql => ({ rows: sql.includes('FROM staff_upload') ? [{}] : [] }));
  assert.equal(writes.length, 3);
  assert.deepEqual(writes.slice(1).map(call => call.params), [['user', true], ['user', false]]);
  assert.ok(writes.every(call => !/FROM staff_upload|FROM student_details_upload/.test(call.sql)));
  assert.ok(writes.slice(1).every(call => /DO NOTHING/.test(call.sql)), 'manual assignments must not become Kamar-managed');
  writes.length = 0;
  await assert.rejects(syncKamarRoles({ query: async () => writes.push('write') }, 'user', 'staff@school.test',
    async () => { throw new Error('Kamar offline'); }), /Kamar offline/);
  assert.equal(writes.length, 0, 'directory failure must not remove existing Core roles');
});

function syntheticPool() {
  const calls = [];
  const records = {};
  let snapshot;
  let failing = false;
  let nextId = 1;
  const query = async (sql, params = []) => {
    calls.push({ sql, params });
    const statement = sql.trim();
    if (statement === 'BEGIN') { snapshot = structuredClone(records); return { rows: [] }; }
    if (statement === 'COMMIT') { snapshot = null; return { rows: [] }; }
    if (statement === 'ROLLBACK') {
      for (const key of Object.keys(records)) delete records[key];
      Object.assign(records, snapshot);
      return { rows: [] };
    }
    if (statement === 'SELECT 1') return { rows: [{}] };
    if (statement.includes('FROM kamar_history_migrations')) return { rows: [{}] };
    if (statement.includes('pg_advisory_xact_lock') || statement.includes('set_config')) return { rows: [] };
    if (statement.startsWith('INSERT INTO kamar_datasets')) return { rows: [{ id: params[0] }], rowCount: 1 };
    const table = /(?:FROM|INTO|UPDATE)\s+(staff_upload|student_details_upload|student_upload|timetable_upload)\b/i.exec(sql)?.[1];
    if (/^SELECT id FROM staff_upload/.test(statement)) {
      const existing = Object.values(records).find(row => row.table === table && (sql.includes("coalesce(email_school") ? row.email_school : row.code).toLowerCase() === params[0]);
      return { rows: existing ? [{ id: existing.id }] : [] };
    }
    if (/^INSERT INTO/.test(statement)) {
      const columns = /INSERT INTO \w+\s*\(([\s\S]*?)\)\s*VALUES/.exec(statement)[1].split(',').map(column => column.trim());
      const values = /\)\s*VALUES\s*\(([\s\S]*?)\)\s*(?:ON CONFLICT|;|$)/.exec(statement)[1].split(',').map(value => value.trim());
      const row = { table };
      columns.forEach((column, index) => {
        const placeholder = /^\$(\d+)/.exec(values[index]);
        row[column] = placeholder ? params[Number(placeholder[1]) - 1] : values[index] === "'Current'" ? 'Current' : 'timestamp';
      });
      const key = table + ':' + (row.code || row.id_number || row.teacher);
      const old = records[key];
      row.id = old?.id || nextId++;
      records[key] = { ...old, ...row };
      if (failing) throw new Error('Synthetic write failed');
      return { rows: [{ inserted: !old }], rowCount: 1 };
    }
    if (/^UPDATE staff_upload\s+SET code/.test(statement)) {
      const row = Object.values(records).find(record => record.table === table && record.id === params[0]);
      Object.assign(row, { code: params[1], last_name: params[2], first_name: params[3], title: params[4],
        email_school: params[5] || row.email_school, status: 'Current', upload_year: params[6], upload_term: params[7], upload_date: params[8] });
      if (failing) throw new Error('Synthetic write failed');
      return { rows: [], rowCount: 1 };
    }
    if (/^UPDATE/.test(statement) && statement.includes("status = 'Not Current'")) return { rows: [], rowCount: 0 };
    throw new Error('Unexpected synthetic query: ' + statement);
  };
  return { calls, records, query, connect: async () => ({ query, release() {} }), fail() { failing = true; } };
}

const uploads = [
  { route: '/api/staff_upload', table: 'staff_upload', payload: { headers: ['Code', 'LastName', 'FirstName', 'EmailSchool'], staff: [['TST', 'Teacher', 'Synthetic', 'teacher@school.test']] } },
  { route: '/api/student_details_upload', table: 'student_details_upload', payload: { headers: ['StudentID', 'LastName', 'FirstName', 'StudentEmailSchool'], students: [['100', 'Student', 'Synthetic', 'student@school.test']] } },
  { route: '/api/student_upload', table: 'student_upload', payload: { headers: ['StudentName', 'IDNumber', 'Mon_P1_1'], students: [['Synthetic Student', '100', 'TST-11TEST-CW']] } },
  { route: '/api/upload_timetable', table: 'timetable_upload', payload: { headers: ['Teacher', 'Teacher_Name', 'Mon_P1'], timetable: [['TST', 'Synthetic Teacher', '11TEST-CW']] } }
];

test('all original upload endpoints accept Terms 1-4, preserve IDs and report rolled-back failures', async () => {
  const pool = syntheticPool();
  const router = loadWithDependencies('routes.js', {
    './db': { pool }, './store': { init: async () => {} },
    '../../db': { query: async () => assert.fail('Upload data must never query Core') },
    './departments': require('../src/legacy/kamar-uploader/departments'),
    './history': require('../src/legacy/kamar-uploader/history')
  });
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.user = { roles: ['ADMIN'], email: 'admin@school.test' }; next(); });
  app.use(router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const ids = new Map();
    for (const term of ['Term 1', 'Term 2', 'Term 3', 'Term 4']) {
      for (const upload of uploads) {
        const response = await fetch(base + upload.route, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...upload.payload, uploadYear: 2026, uploadTerm: term, uploadDate: '2026-11-01' }) });
        const output = await response.json();
        assert.equal(response.status, 200, JSON.stringify(output));
        assert.equal(response.headers.get('cache-control'), 'no-store');
        assert.equal(output.success, true);
        assert.match(output.dataset_id, /^[0-9a-f-]{36}$/);
        assert.equal(output.processed, 1);
        assert.equal(output.upload_year, 2026);
        assert.equal(output.upload_term, term);
        assert.equal(output.upload_date, '2026-11-01');
        const row = Object.values(pool.records).find(record => record.table === upload.table);
        assert.equal(row.upload_term, term);
        assert.equal(row.upload_year, 2026);
        assert.equal(row.status, 'Current');
        if (ids.has(upload.table)) assert.equal(row.id, ids.get(upload.table));
        else ids.set(upload.table, row.id);
      }
    }
    const health = await fetch(base + '/api/feed/health');
    assert.deepEqual(await health.json(), { success: true, database: 'existing-kamar', importsEnabled: false });
    const before = structuredClone(pool.records);
    pool.fail();
    for (const upload of uploads) {
      const response = await fetch(base + upload.route, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...upload.payload, uploadYear: 2027, uploadTerm: 'Term 1', uploadDate: '2027-02-01' }) });
      assert.equal(response.status, 500);
      assert.deepEqual(pool.records, before, 'failed uploads must preserve the last successful data');
    }
    assert.equal(pool.calls.filter(call => call.sql.trim() === 'ROLLBACK').length, 4);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('legacy connection failure is explicit and does not execute upload SQL or return stale data', async () => {
  const router = loadWithDependencies('routes.js', {
    './db': { pool: { query: async () => assert.fail('No fallback query'), connect: async () => assert.fail('No fallback connection') } },
    './store': { init: async () => { throw new Error('Kamar unavailable'); } },
    '../../db': { query: async () => assert.fail('No Core data fallback') },
    './departments': require('../src/legacy/kamar-uploader/departments'),
    './history': require('../src/legacy/kamar-uploader/history')
  });

  const app = express();
  app.use((req, res, next) => { req.user = { roles: ['ADMIN'] }; next(); });
  app.use(router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/staff_upload/all`);
    assert.equal(response.status, 503);
    assert.equal((await response.json()).success, false);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
