const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const path = require('path');
const workshop = require('../src/modules/workshop');

function startApp(roles) {
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));
  app.use(express.json());
  app.use((req, res, next) => {
    req.user = roles ? { id: '00000000-0000-0000-0000-000000000001', roles, display_name: 'Test User', email: 't@westlandhigh.school.nz' } : undefined;
    req.logout = (done) => done();
    Object.assign(res.locals, { currentUser: req.user, isAdmin: false, activeRole: 'Teacher' });
    next();
  });
  app.use('/workshop', workshop);

  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve({ server, base: `http://127.0.0.1:${server.address().port}/workshop` }));
  });
}

test('legacy Workshop pages and navbar are served under /workshop', async () => {
  const { server, base } = await startApp(['Student']);
  try {
    for (const page of ['index.html', 'navbar.html', 'worksheets_manager.html', 'upload_activity.html']) {
      assert.strictEqual((await fetch(`${base}/${page}`)).status, 200, page);
    }
    const navbar = await (await fetch(`${base}/navbar.html`)).text();
    assert.ok(!navbar.includes('href="/"'));
  } finally {
    server.close();
  }
});

test('anonymous users are rejected by protected legacy APIs and see no user', async () => {
  const { server, base } = await startApp(null);
  try {
    assert.strictEqual(await (await fetch(`${base}/api/user`)).json(), null);
    assert.strictEqual((await fetch(`${base}/api/worksheets`)).status, 401);
    assert.strictEqual((await fetch(`${base}/api/admin/suggestions`)).status, 401);
  } finally {
    server.close();
  }
});

test('students cannot use admin or lead-teacher APIs', async () => {
  const { server, base } = await startApp(['Student']);
  try {
    assert.strictEqual((await fetch(`${base}/api/admin/suggestions`)).status, 403);
  } finally {
    server.close();
  }
});

test('legacy role pages redirect to the app user administration', async () => {
  const { server, base } = await startApp(['ADMIN']);
  try {
    const response = await fetch(`${base}/admin_user_roles.html`, { redirect: 'manual' });
    assert.strictEqual(response.headers.get('location'), '/admin/users');
    const user = await (await fetch(`${base}/api/user`)).json();
    assert.strictEqual(user.name, 'Test User');
  } finally {
    server.close();
  }
});
