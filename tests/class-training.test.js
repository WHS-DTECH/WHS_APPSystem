const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
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
