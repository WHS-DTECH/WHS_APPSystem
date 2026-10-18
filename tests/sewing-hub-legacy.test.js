const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const path = require('path');
test.mock.method(require('../src/db'), 'query', async () => ({ rows: [], rowCount: 0 }));
const sewingHub = require('../src/modules/sewingHub');
const sewingApi = require('../src/legacy/sewing-hub/routes');

function startApp(roles) {
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));
  app.use(express.json());
  app.use((req, res, next) => {
    req.isAuthenticated = () => Boolean(roles);
    req.user = roles ? { id: 1, roles, display_name: 'Test User', email: 'test@westlandhigh.school.nz' } : undefined;
    Object.assign(res.locals, { currentUser: req.user, isAdmin: false, activeRole: 'Teacher' });
    next();
  });
  app.use('/sewing-hub', sewingHub.pageGuards);
  app.use('/sewing-hub', sewingHub);
  app.use('/api', sewingHub.apiRouter);

  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` }));
  });
}

test('legacy Sewing Room pages are served and the old placeholder redirects to them', async () => {
  const { server, base } = await startApp(['Student']);
  try {
    assert.strictEqual((await fetch(`${base}/sewing-hub/index.html`)).status, 200);
    const redirect = await fetch(`${base}/sewing-hub/activities`, { redirect: 'manual' });
    assert.strictEqual(redirect.headers.get('location'), '/sewing-hub/index.html');
  } finally {
    server.close();
  }
});

test('students cannot use the legacy upload pages or admin APIs', async () => {
  const { server, base } = await startApp(['Student']);
  try {
    assert.strictEqual((await fetch(`${base}/api/admin/assessment-standards`)).status, 403);
    const post = await fetch(`${base}/api/admin/activities`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}'
    });
    assert.strictEqual(post.status, 403);
    assert.strictEqual((await fetch(`${base}/sewing-hub/admin_upload_activity.html`)).status, 403);
  } finally {
    server.close();
  }
});

test('ADMIN gets the standards list, upload pages and activity validation', async () => {
  const { server, base } = await startApp(['ADMIN']);
  try {
    const standards = await (await fetch(`${base}/api/admin/assessment-standards`)).json();
    assert.strictEqual(standards.standards.length, 4);
    assert.strictEqual((await fetch(`${base}/sewing-hub/admin_upload_activity.html`)).status, 200);

    const invalid = await fetch(`${base}/api/admin/activities`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}'
    });
    assert.strictEqual(invalid.status, 400);

    const me = await (await fetch(`${base}/api/me`)).json();
    assert.strictEqual(me.user.isAdmin, true);
    assert.strictEqual(me.user.canViewTeacherCard, true);
  } finally {
    server.close();
  }
});

test('suggestions validate input before touching the database', async () => {
  const { server, base } = await startApp(['Student']);
  try {
    const post = await fetch(`${base}/api/suggestions`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ activity_name: 'Tote', email: 'not-an-email', reason: 'fun' })
    });
    assert.strictEqual(post.status, 400);
  } finally {
    server.close();
  }
});

test('route module exports the permission helpers', async () => {
  assert.strictEqual(typeof sewingApi.userCanUploadActivity, 'function');
  assert.strictEqual(await sewingApi.userCanViewTeacherCard({ roles: ['Teacher'] }), true);
  assert.strictEqual(await sewingApi.userCanViewTeacherCard({ roles: ['Student'] }), false);
});
