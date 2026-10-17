const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const session = require('express-session');
const path = require('path');
const { createClassTrainingRouter, trainingEmail } = require('../src/modules/classTraining');
const hostedApps = require('../src/hostedApps');
const email = require('../src/email');
const { prefixData } = require('../src/modules/dtechHub');

test('training links open inside DTECH without changing stored legacy addresses', () => {
  assert.equal(prefixData('https://classtrainingsys.onrender.com/auth/login?next=%2Fdashboard'), '/dtech-hub/class-training/home');
  assert.equal(prefixData('https://classtrainingsys.onrender.com/courses/1'), '/dtech-hub/class-training/courses/1');
  assert.equal(prefixData('https://example.test/other'), 'https://example.test/other');
});

test('training mail uses the shared sender and reports authentication, validation and delivery failures', async (t) => {
  t.mock.method(hostedApps, 'validProxyToken', (token) => token === 'fixture-only');
  let delivery = { ok: true };
  let submitted;
  t.mock.method(email, 'sendEmail', async (input) => { submitted = input; return delivery; });
  const app = express();
  app.use(express.json());
  app.post('/email', trainingEmail);
  const server = app.listen(0);
  const url = `http://127.0.0.1:${server.address().port}/email`;
  const payload = { to: 'teacher@westlandhigh.school.nz', sender: 'student@westlandhigh.school.nz', subject: 'Question', message: 'Help please' };
  const send = (body, token = 'fixture-only') => fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-WHS-Token': token }, body: JSON.stringify(body)
  });
  try {
    assert.equal((await send(payload, 'forged')).status, 403);
    assert.equal((await send({ ...payload, message: '' })).status, 400);
    assert.equal((await send(payload)).status, 200);
    assert.equal(submitted.source, 'DTECH Class Training');
    assert.equal(submitted.to, payload.to);
    assert.match(submitted.text, /student@westlandhigh.school.nz/);
    delivery = { ok: false, message: 'Mail unavailable' };
    const response = await send(payload);
    assert.equal(response.status, 502);
    assert.equal((await response.json()).success, false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('module views persist locally, send reduced authority to every training route, and recheck teacher access', async () => {
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));
  app.use(session({ secret: 'isolated-role-view-test', resave: false, saveUninitialized: false }));
  app.use((req, res, next) => {
    req.user = { email: 'fixture@westlandhigh.school.nz', display_name: 'Fixture', roles: ['ADMIN'] };
    res.locals.activeRole = 'ADMIN';
    next();
  });
  let permissions = { active: true, admin: true, role: 'Student' };
  app.use('/dtech-hub/class-training', createClassTrainingRouter({
    env: { CLASS_TRAINING_DATABASE_URL: 'isolated-training-database' },
    access: async () => permissions,
    proxy(req, res, slug, identity) {
      res.json({ role: identity.role, email: identity.email, path: req.path });
    }
  }));
  app.get('/other-module', (req, res) => res.json({ role: res.locals.activeRole, globalRoles: req.user.roles }));
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = '';
  const get = async (url) => {
    const response = await fetch(base + url, { headers: { Cookie: cookie, 'X-WHS-Role': 'teacher' }, redirect: 'manual' });
    if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
    return response;
  };
  const root = '/dtech-hub/class-training';
  try {
    assert.equal((await (await get(root + '/dashboard')).json()).role, 'teacher');
    const student = await get(root + '/view/student');
    assert.equal(student.status, 302);
    assert.equal(student.headers.get('location'), root + '/dashboard');
    for (const route of ['/dashboard', '/courses/', '/api/school-search?q=Original', '/admin/', '/dashboard?view=teacher']) {
      const body = await (await get(root + route)).json();
      assert.equal(body.role, 'student', route);
      assert.equal(body.email, 'fixture@westlandhigh.school.nz');
    }
    assert.equal((await (await fetch(base + root + '/dashboard')).json()).role, 'teacher');
    const other = await (await get('/other-module')).json();
    assert.equal(other.role, 'ADMIN');
    assert.deepEqual(other.globalRoles, ['ADMIN']);
    const management = await get(root + '/view/teacher?page=management');
    assert.equal(management.headers.get('location'), root + '/admin/');
    assert.equal((await (await get(root + '/dashboard')).json()).role, 'teacher');
    assert.equal((await get(root + '/view/teacher?page=https://other.example.test')).headers.get('location'), root + '/dashboard');
    assert.equal((await fetch(base + root + '/view/student', { method: 'POST', headers: { Cookie: cookie } })).status, 405);
    permissions = { active: true, admin: false, role: 'Student' };
    assert.equal((await (await get(root + '/dashboard')).json()).role, 'student');
    assert.equal((await get(root + '/view/teacher')).status, 403);
    assert.equal((await get(root + '/view/student')).status, 403);
    permissions = { active: false, admin: true, role: 'Teacher' };
    assert.equal((await get(root + '/view/teacher')).status, 403);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('Class Training inherits current DTECH authority, not Student Apps or submitted roles', async () => {
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));
  app.use((req, res, next) => {
    res.locals.activeRole = 'Student';
    if (req.get('x-fixture-user')) req.user = { email: req.get('x-fixture-user'), display_name: 'Fixture' };
    next();
  });
  let access = { active: true, admin: false, role: 'Student', permissions: [] };
  const env = { CLASS_TRAINING_DATABASE_URL: 'fixture-classwork' };
  app.use('/dtech-hub/class-training', createClassTrainingRouter({
    env, access: async () => access,
    proxy(req, res, slug, identity) { res.json({ slug, identity }); }
  }));
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/dtech-hub/class-training/home`;
  const headers = { 'x-fixture-user': 'fixture@westlandhigh.school.nz', 'x-whs-role': 'teacher' };
  try {
    assert.equal((await fetch(base, { redirect: 'manual' })).status, 302);
    assert.equal((await fetch(base, { headers: { 'x-fixture-user': 'outside@example.test' } })).status, 403);
    assert.equal((await (await fetch(base, { headers })).json()).identity.role, 'student');
    for (const role of ['Teacher', 'Lead Teacher']) {
      access = { ...access, role };
      const body = await (await fetch(base, { headers })).json();
      assert.equal(body.identity.role, 'teacher');
      assert.equal(body.slug, 'dtech-class-training');
    }
    access = { ...access, role: 'Technician' };
    assert.equal((await (await fetch(base, { headers })).json()).identity.role, 'student');
    access = { ...access, admin: true };
    assert.equal((await (await fetch(base, { headers })).json()).identity.role, 'teacher');
    access = { ...access, active: false };
    assert.equal((await fetch(base, { headers })).status, 403);
    access = { ...access, active: true };
    delete env.CLASS_TRAINING_DATABASE_URL;
    assert.equal((await fetch(base, { headers })).status, 503);
    env.CLASS_TRAINING_DATABASE_URL = 'same-database';
    env.DTECH_DATABASE_URL = 'same-database';
    assert.equal((await fetch(base, { headers })).status, 503);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
