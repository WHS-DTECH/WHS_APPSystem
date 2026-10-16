const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const path = require('path');
const learningSites = require('../src/modules/learningSites');

function startApp(roles) {
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));
  app.use(express.json());
  app.use((req, res, next) => {
    req.isAuthenticated = () => Boolean(roles);
    req.user = roles ? { roles, display_name: 'Test' } : undefined;
    Object.assign(res.locals, { currentUser: req.user, isAdmin: false, activeRole: 'Teacher' });
    next();
  });
  app.use('/learning-sites', learningSites);
  app.use('/', learningSites.pagesRouter);
  app.use('/api', learningSites.apiRouter);
  app.get('/admin', (req, res) => res.send('app admin dashboard'));

  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` }));
  });
}

test('ADMIN serves the legacy HOD Update Dashboard page, not the app admin page', async () => {
  const { server, base } = await startApp(['ADMIN']);
  try {
    const legacy = await fetch(`${base}/ADMIN/`);
    assert.strictEqual(legacy.status, 200);
    const html = await legacy.text();
    assert.ok(html.includes('HOD Update Dashboard'));
    assert.ok(html.includes('uploader-drive-sync-all-button'));

    assert.strictEqual(await (await fetch(`${base}/admin`)).text(), 'app admin dashboard');

    const session = await (await fetch(`${base}/api/admin/session`)).json();
    assert.strictEqual(session.authenticated, true);

    const redirect = await fetch(`${base}/learning-sites/admin`, { redirect: 'manual' });
    assert.strictEqual(redirect.headers.get('location'), '/ADMIN/');
  } finally {
    server.close();
  }
});

test('Teachers cannot use the HOD admin API but can read the Relief Plan', async () => {
  const { server, base } = await startApp(['Teacher']);
  try {
    assert.strictEqual((await fetch(`${base}/api/admin/dashboard`)).status, 401);
    assert.strictEqual((await fetch(`${base}/ADMIN/`)).status, 403);

    const events = await (await fetch(`${base}/api/relief-plan/events`)).json();
    assert.strictEqual(events.role, 'Teacher');
    assert.ok(events.events.length >= 136);
    assert.strictEqual((await fetch(`${base}/ReleverPlan/`)).status, 200);
  } finally {
    server.close();
  }
});

test('Students are denied the Relief Plan API', async () => {
  const { server, base } = await startApp(['Student']);
  try {
    assert.strictEqual((await fetch(`${base}/api/relief-plan/events`)).status, 401);
    const session = await (await fetch(`${base}/api/relief-plan/session`)).json();
    assert.strictEqual(session.authenticated, false);
  } finally {
    server.close();
  }
});
