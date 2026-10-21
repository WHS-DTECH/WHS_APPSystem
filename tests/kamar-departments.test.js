const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Pool } = require('pg');
const express = require('express');
const { departmentDirectory } = require('../src/legacy/kamar-uploader/departments');

test('department leadership matches Kamar names, retains substantive leaders and prefers acting appointments', () => {
  const rows = [
    { first_name: 'Sarah', last_name: 'Bateup', departments_comma: 'P.E. / Health', leadership_roles: [
      { department: 'P.E. / Health', role: 'HOL', acting: false, onLeave: true }] },
    { first_name: 'Mike', last_name: 'Talbot', leadership_roles: [
      { department: 'P.E. / Health', role: 'HOLA', acting: true, onLeave: false },
      { department: 'Outdoor Education', role: 'TIC', acting: false, onLeave: false }] },
    { first_name: 'Siobhan', last_name: 'O\u2019Malley', leadership_roles: [
      { department: 'English', role: 'HOL', acting: false, onLeave: false }] }
  ];
  const staff = [{ first_name: 'Mike', last_name: 'Talbot', code: 'MTA' },
    { first_name: 'Siobhan', last_name: "O'Malley", code: 'SOM' }];
  const result = departmentDirectory(rows, staff);
  assert.equal(result.find(item => item.name === 'P.E. / Health').teacher, 'Mike Talbot (MTA)');
  assert.equal(result.find(item => item.name === 'P.E. / Health').leaders.length, 2);
  assert.equal(result.find(item => item.name === 'Outdoor Education').teacher, 'Mike Talbot (MTA)');
  assert.equal(result.find(item => item.name === 'English').teacher, "Siobhan O'Malley (SOM)");
});
test('ambiguous or unavailable leaders are not guessed; legacy assignments still supply department choices', () => {
  const leader = { first_name: 'A', last_name: 'Teacher', department: 'Science', departments_comma: 'Science, Technology',
    leadership_roles: [{ department: 'Science', role: 'HOL', acting: false, onLeave: false }] };
  const result = departmentDirectory([leader, { ...leader, first_name: 'B' }], []);
  assert.equal(result.find(item => item.name === 'Science').teacher, '');
  assert.equal(result.find(item => item.name === 'Technology').teacher, '');
  const onLeave = departmentDirectory([{ ...leader, leadership_roles: [{ ...leader.leadership_roles[0], onLeave: true }] }], []);
  assert.equal(onLeave.find(item => item.name === 'Science').teacher, '');
  assert.throws(() => departmentDirectory([{ ...leader, leadership_roles: [{ department: 'Science', role: 'invalid' }] }], []), /Invalid/);
});
test('Food Room cannot bulk-delete the shared Kamar department directory', async t => {
  const app = express();
  app.use(require('../src/legacy/food-room/routes/department'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/delete-all`, { method: 'POST' });
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /Kamar Uploader/);
});
test('migration moves existing department rows and extends them without resetting IDs or losing Food Room compatibility', {
  skip: !process.env.MODULE_BUILDER_TEST_DATABASE_URL
}, async () => {
  const name = 'departments_' + crypto.randomBytes(6).toString('hex');
  const food = name + '_food';
  const pool = new Pool({ connectionString: process.env.MODULE_BUILDER_TEST_DATABASE_URL, ssl: false });
  const client = await pool.connect();
  try {
    await client.query(`CREATE SCHEMA ${name}; CREATE SCHEMA ${food};
      CREATE TABLE ${food}.department(id serial PRIMARY KEY,first_name text,last_name text,staff_name text,
        department text,departments_comma text,staff_email text,classes text,code text,title text);
      INSERT INTO ${food}.department(first_name,last_name,classes) VALUES ('Vanessa','Pringle','Existing classes');`);
    const migration = fs.readFileSync(path.join(__dirname, '..', 'migrations', '037_kamar_departments.sql'), 'utf8')
      .replaceAll('food_room.', food + '.').replaceAll('public.', name + '.').replace('SET SCHEMA public', 'SET SCHEMA ' + name);
    await client.query(migration);
    await client.query(`SET search_path TO ${food}, ${name}`);
    const saved = (await client.query("SELECT * FROM department WHERE id=1")).rows[0];
    assert.equal(saved.classes, 'Existing classes');
    assert.equal(saved.leadership_roles[0].department, 'Technology');
    assert.equal(saved.leadership_roles[0].role, 'HOL');
    const inserted = await client.query("INSERT INTO department(first_name,last_name) VALUES ('Another','Teacher') RETURNING id");
    assert.equal(inserted.rows[0].id, 2);
    assert.equal((await client.query(`SELECT 1 FROM information_schema.tables WHERE table_schema=$1 AND table_name='department' AND table_type='BASE TABLE'`, [food])).rowCount, 0);
  } finally {
    await client.query(`SET search_path TO public; DROP SCHEMA ${food} CASCADE; DROP SCHEMA ${name} CASCADE`);
    client.release(); await pool.end();
  }
});
