const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const express = require('express');
const session = require('express-session');
const { createStudentBuildersRouter, creditFrom } = require('../src/studentBuilders');

let server;
let base;
let rows;
let handovers;
let kamarFails = false;
const kamarDb = async (sql, params) => {
  if (kamarFails) throw new Error('down');
  assert.match(sql, /student_details_upload WHERE id_number = \$1/);
  return { rows: params[0] === '12345' ? [{ first_name: 'Jonas', last_name: 'Pinkerneil', status: 'Left' }] : [] };
};

async function dbQuery(sql, params = []) {
  if (sql.startsWith('DELETE FROM student_builders')) { rows.delete(params[0]); return { rows: [] }; }
  if (sql.includes('FROM student_builders ORDER BY')) return { rows: [...rows.values()] };
  if (sql.includes('FROM student_builders WHERE id')) return { rows: rows.has(params[0]) ? [rows.get(params[0])] : [] };
  if (sql.includes('FROM student_project_handovers')) return { rows: handovers.filter((item) => item.builder_id === params[0]) };
  if (sql.startsWith('INSERT INTO student_builders')) {
    rows.set(params[0], { id: params[0], full_name: params[1], credit_name: params[2], kamar_student_id: params[3], github_username: params[4],
      first_year: params[5], status: params[6], projects: params[7], permission_recorded_at: params[8] ? new Date() : null, notes: params[9] });
    return { rows: [] };
  }
  if (sql.startsWith('UPDATE student_builders')) {
    const row = rows.get(params[0]);
    Object.assign(row, { full_name: params[1], credit_name: params[2], kamar_student_id: params[3], github_username: params[4],
      first_year: params[5], status: params[6], projects: params[7], permission_recorded_at: params[8] ? (row.permission_recorded_at || new Date()) : null, notes: params[9] });
    return { rows: [] };
  }
  throw new Error(`Unexpected SQL: ${sql}`);
}

test.before(async () => {
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));
  app.use(express.urlencoded({ extended: false }));
  app.use(session({ secret: 'test-only', resave: false, saveUninitialized: false }));
  app.use((req, res, next) => {
    req.user = { id: 'admin', display_name: 'Test Admin', roles: req.get('x-role') === 'teacher' ? ['TEACHER'] : ['ADMIN'] };
    res.locals.activeRole = 'ADMIN';
    next();
  });
  app.use('/admin/student-builders', createStudentBuildersRouter({ dbQuery, kamarDb }));
  app.use((error, req, res, next) => res.status(500).send(error.message));
  server = await new Promise((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  base = `http://127.0.0.1:${server.address().port}/admin/student-builders`;
});
test.after(() => new Promise((resolve) => server.close(resolve)));
test.beforeEach(() => { rows = new Map(); handovers = []; kamarFails = false; });

async function formSession() {
  const response = await fetch(base);
  const html = await response.text();
  return { cookie: response.headers.get('set-cookie').split(';')[0], csrf: html.match(/name="csrf" value="([^"]+)"/)[1] };
}

const post = (route, data, cookie) => fetch(base + route, { method: 'POST', redirect: 'manual',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie }, body: new URLSearchParams(data) });

const jonas = { fullName: 'Jonas <P> Pinkerneil', githubUsername: 'zomotokari-cpu', kamarStudentId: '12345', status: 'left',
  projects: 'WHS-DTECH/WHS_BusController\nWHS-DTECH/WHS_International', permission: 'yes' };

test('only administrators can view or record student builders', async () => {
  for (const method of ['GET', 'POST']) {
    const response = await fetch(base, { method, headers: { 'x-role': 'teacher' } });
    assert.equal(response.status, 403);
  }
});

test('forms require a valid CSRF token', async () => {
  const form = await formSession();
  const response = await post('', { csrf: 'wrong', ...jonas }, form.cookie);
  assert.equal(response.status, 403);
  assert.equal(rows.size, 0);
});

test('administrators record, list and edit a student builder', async () => {
  const form = await formSession();
  let response = await post('', { csrf: form.csrf, ...jonas }, form.cookie);
  assert.equal(response.status, 303);
  const [row] = rows.values();
  assert.equal(row.credit_name, 'JPinkerneil');
  assert.equal(row.kamar_student_id, '12345');
  assert.equal(Object.keys(row).some((key) => key.includes('email')), false);
  assert.equal(row.status, 'left');
  assert.ok(row.permission_recorded_at);
  const html = await (await fetch(base, { headers: { cookie: form.cookie } })).text();
  assert.match(html, /Jonas &lt;P&gt; Pinkerneil/);
  assert.match(html, /JPinkerneil/);
  const edit = await (await fetch(`${base}/${row.id}`, { headers: { cookie: form.cookie } })).text();
  assert.match(edit, /Kamar record: <strong>Jonas Pinkerneil<\/strong> \(Left\)/);
  assert.doesNotMatch(edit, /email/i);
  assert.match(html, /WHS-DTECH\/WHS_BusController, WHS-DTECH\/WHS_International/);

  response = await post(`/${row.id}`, { csrf: form.csrf, ...jonas, permission: '', notes: 'Returned to Germany' }, form.cookie);
  assert.equal(response.status, 303);
  assert.equal(rows.get(row.id).notes, 'Returned to Germany');
  assert.equal(rows.get(row.id).permission_recorded_at, null);
});

test('invalid details are rejected', async () => {
  const form = await formSession();
  for (const bad of [{ fullName: '' }, { githubUsername: 'bad name' }, { kamarStudentId: 'no spaces' }, { creditName: 'J Pinkerneil' }, { firstYear: '99' }]) {
    const response = await post('', { csrf: form.csrf, ...jonas, ...bad }, form.cookie);
    assert.equal(response.status, 400);
  }
  assert.equal(rows.size, 0);
});

test('details cannot be removed while a handover is in progress', async () => {
  const form = await formSession();
  await post('', { csrf: form.csrf, ...jonas }, form.cookie);
  const [row] = rows.values();
  handovers = [{ id: 'h1', builder_id: row.id, title: 'Bus', source_repository: 'WHS-DTECH/WHS_BusController', finished_at: null }];
  let response = await post(`/${row.id}/delete`, { csrf: form.csrf }, form.cookie);
  assert.equal(response.status, 409);
  assert.ok(rows.has(row.id));
  handovers[0].finished_at = new Date();
  handovers[0].finish_action = 'transferred';
  response = await post(`/${row.id}/delete`, { csrf: form.csrf }, form.cookie);
  assert.equal(response.status, 303);
  assert.equal(rows.size, 0);
});

test('credit names default to first initial and surname', () => {
  assert.equal(creditFrom('Jonas Pinkerneil'), 'JPinkerneil');
  assert.equal(creditFrom('jonas Michael Pinkerneil'), 'JPinkerneil');
  assert.equal(creditFrom('Jonas'), 'J');
});

test('an unavailable Kamar database does not stop editing', async () => {
  const form = await formSession();
  await post('', { csrf: form.csrf, ...jonas }, form.cookie);
  const [row] = rows.values();
  kamarFails = true;
  const response = await fetch(`${base}/${row.id}`, { headers: { cookie: form.cookie } });
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Kamar records could not be checked/);
});