const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const path = require('path');
const kamarUploader = require('../src/modules/kamarUploader');
const kamarApi = require('../src/legacy/kamar-uploader/routes');

function startApp(roles) {
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));
  app.use(express.json());
  app.use((req, res, next) => {
    req.isAuthenticated = () => Boolean(roles);
    req.user = roles ? { roles, display_name: 'Test', email: 'test@westlandhigh.school.nz' } : undefined;
    req.logout = (done) => done();
    Object.assign(res.locals, { currentUser: req.user, isAdmin: false, activeRole: 'Teacher' });
    next();
  });
  app.use('/admin/kamar-uploader', kamarUploader);
  app.use(kamarApi);

  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` }));
  });
}

test('ADMIN gets the legacy Kamar Uploader pages and session permissions', async () => {
  const { server, base } = await startApp(['ADMIN']);
  try {
    for (const page of ['', 'staff_upload.html', 'student_details_upload.html', 'student_upload.html', 'timetable_upload.html']) {
      assert.strictEqual((await fetch(`${base}/admin/kamar-uploader/${page}`)).status, 200, page);
    }

    const session = await (await fetch(`${base}/api/auth/session`)).json();
    assert.strictEqual(session.user.role, 'admin');
    assert.strictEqual(session.user.permissions.staff_upload, true);
  } finally {
    server.close();
  }
});

test('Teachers cannot open the uploader or its data APIs', async () => {
  const { server, base } = await startApp(['Teacher']);
  try {
    assert.strictEqual((await fetch(`${base}/admin/kamar-uploader/`)).status, 403);
    assert.strictEqual((await fetch(`${base}/api/staff_upload/all`)).status, 403);
    assert.strictEqual((await fetch(`${base}/api/upload_timetable`, { method: 'POST' })).status, 403);

    const session = await (await fetch(`${base}/api/auth/session`)).json();
    assert.strictEqual(session.user.permissions.staff_upload, false);
  } finally {
    server.close();
  }
});

test('Anonymous users are rejected from the Kamar APIs', async () => {
  const { server, base } = await startApp(null);
  try {
    assert.strictEqual((await fetch(`${base}/api/feed/staff/current`)).status, 401);
    assert.strictEqual((await fetch(`${base}/api/staff_upload/all`)).status, 401);
    assert.strictEqual((await fetch(`${base}/api/auth/session`)).status, 401);
  } finally {
    server.close();
  }
});
