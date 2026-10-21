const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const { injectGlobalNav } = require('../src/globalNav');
const kamarUploader = require('../src/modules/kamarUploader');
const kamarApi = require('../src/legacy/kamar-uploader/routes');

test('department feed is registered at startup without first loading the staff feed', () => {
  assert.strictEqual(kamarApi.stack.filter(layer => layer.route?.path === '/api/feed/departments').length, 1);
});

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
  app.use(injectGlobalNav);
  app.use('/admin/kamar-uploader', kamarUploader);
  app.use(kamarApi);

  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` }));
  });
}

test('ADMIN gets the legacy Kamar Uploader pages and session permissions', async () => {
  const { server, base } = await startApp(['ADMIN']);
  try {
    for (const page of ['', 'staff_upload.html', 'departments.html', 'student_details_upload.html', 'student_upload.html', 'timetable_upload.html']) {
      const response = await fetch(`${base}/admin/kamar-uploader/${page}`);
      assert.strictEqual(response.status, 200, page);
      const html = await response.text();
      assert.ok(html.includes('/global-nav.js'), page);
      assert.ok(html.includes('/account-controls.css'), page);
      for (const duplicate of ['id="authCard"', 'id="signOutBtn"', 'id="googleSignInTarget"']) {
        assert.ok(!html.includes(duplicate), `${page}: ${duplicate}`);
      }
      if (!page) {
        const hero = html.split('<section class="hero-panel">')[1].split('</section>')[0];
        assert.ok(hero.includes('id="currentUserPanel"'));
        assert.strictEqual(html.split('id="currentUserPanel"').length - 1, 1);
      }
    }

    const session = await (await fetch(`${base}/api/auth/session`)).json();
    assert.strictEqual(session.user.role, 'admin');
    assert.strictEqual(session.user.permissions.staff_upload, true);
  } finally {
    server.close();
  }
});

const siteDir = path.join(__dirname, '..', 'src', 'legacy', 'kamar-uploader', 'site');
const navbarScript = fs.readFileSync(path.join(siteDir, 'shared', 'navbar_loader.js'), 'utf8');

async function renderNavbar(pathname, response, networkError) {
  const host = { innerHTML: '', setAttribute(name, value) { this[name] = value; } };
  const location = { pathname };
  const errors = [];
  vm.runInNewContext(navbarScript, {
    document: { getElementById: () => host },
    window: { location },
    console: { error: (...args) => errors.push(args) },
    fetch: async (url, options) => {
      assert.strictEqual(url, '/api/auth/session');
      assert.strictEqual(options.cache, 'no-store');
      if (networkError) throw networkError;
      return { ok: response.status === 200, status: response.status, json: async () => response.payload };
    }
  });
  await new Promise(setImmediate);
  return { host, location, errors };
}

test('every direct Kamar page gets navigation from the school session without a cached local account', async () => {
  const permissions = { homepage: true, staff_upload: true, student_upload: true, student_timetable: true, staff_timetable: true, admin_menu: true };
  for (const page of ['', 'staff_upload.html', 'student_details_upload.html', 'student_upload.html', 'timetable_upload.html']) {
    const { host, location, errors } = await renderNavbar(`/admin/kamar-uploader/${page}`, {
      status: 200, payload: { success: true, user: { email: 'admin@example.test', role: 'admin', permissions } }
    });
    assert.strictEqual(location.href, undefined);
    for (const label of ['Home', 'Staff Upload', 'Student Upload', 'Student Timetable', 'Staff Timetable']) {
      assert.ok(host.innerHTML.includes(`>${label}</a>`), label);
    }
    assert.ok(!/Sign out|Sign in|top-nav-user|admin@example/.test(host.innerHTML));
    assert.ok(!/User Role Management|top-nav-admin/.test(host.innerHTML));
    assert.strictEqual(errors.length, 0);
  }
});

test('Kamar navigation honours session expiry, denied permissions and visible session errors', async () => {
  const expired = await renderNavbar('/admin/kamar-uploader/staff_upload.html', { status: 401 });
  assert.strictEqual(expired.location.href, '/auth/google?next=%2Fadmin%2Fkamar-uploader%2Fstaff_upload.html');
  const denied = await renderNavbar('/admin/kamar-uploader/staff_upload.html', {
    status: 200, payload: { success: true, user: { email: 'teacher@example.test', role: 'staff', permissions: { homepage: true } } }
  });
  assert.strictEqual(denied.location.href, '/admin/kamar-uploader/');
  assert.ok(!denied.host.innerHTML.includes('>Staff Upload</a>'));
  for (const [response, networkError] of [
    [{ status: 503, payload: { error: 'Session service unavailable' } }],
    [{ status: 200, payload: { success: false } }],
    [null, new Error('Network unavailable')]
  ]) {
    const failed = await renderNavbar('/admin/kamar-uploader/', response, networkError);
    assert.strictEqual(failed.host.role, 'alert');
    assert.match(failed.host.textContent, /Reload to retry/);
    assert.strictEqual(failed.errors.length, 1);
  }
});

test('dashboard keeps project editing tied to the school session without duplicate account controls', async () => {
  const elements = {
    projectLinkForm: { style: {} },
    projectLinksList: {},
    currentUserPanel: {},
    projectLinkStatus: { style: {} }
  };
  let ready;
  const requests = [];
  const context = {
    document: {
      getElementById: (id) => elements[id] || null,
      querySelectorAll: () => []
    },
    window: { addEventListener: (name, callback) => { if (name === 'DOMContentLoaded') ready = callback; } },
    fetch: async (url) => {
      requests.push(url);
      const payload = url === '/api/auth/session'
        ? { success: true, user: { email: 'admin@example.test', role: 'admin' } }
        : url === '/api/projects/links' ? { success: true, links: [] } : {};
      return { ok: true, json: async () => payload };
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(siteDir, 'index.js'), 'utf8'), context);
  await ready();
  assert.strictEqual(elements.projectLinkForm.style.display, 'grid');
  assert.match(elements.currentUserPanel.innerHTML, /admin@example.test/);
  assert.match(elements.currentUserPanel.innerHTML, /Role: ADMIN/);
  assert.strictEqual(requests[0], '/api/auth/session');
  assert.ok(requests.includes('/api/feed/summary/current-counts'));
  assert.ok(requests.includes('/api/projects/links'));
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
