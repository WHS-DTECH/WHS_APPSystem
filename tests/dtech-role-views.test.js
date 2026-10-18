const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const path = require('path');
const vm = require('vm');
const express = require('express');
const session = require('express-session');
const { navData } = require('../src/globalNav');
const { createDtechRouter, effectiveDtechView, prefixText } = require('../src/modules/dtechHub');

test('Homepage Event Settings uses the original page and requires current DTECH admin access', async () => {
  for (const [page, systemAdmin, permissions, active, expected] of [
    ['/dtech-hub/', true, [], true, true],
    ['/dtech-hub/settings.html', false, ['admin.manage'], true, true],
    ['/dtech-hub/teacher-view.html', false, ['teacher.view'], true, false],
    ['/dtech-hub/', false, [], true, false],
    ['/dtech-hub/', true, [], false, false],
    ['/dtech-hub/class-training/home', true, [], true, false],
    ['/food-room/', true, [], true, false]
  ]) {
    let data;
    await navData(async (sql) => ({ rows: sql.includes('FROM users') && active
      ? [{ system_admin: systemAdmin, permissions, hub_roles: [] }] : [] }),
    async () => false, async () => null)(
      { user: { email: 'fixture@westlandhigh.school.nz', roles: systemAdmin ? ['ADMIN'] : [] },
        session: { dtechView: 'student' }, query: { path: page } },
      { locals: {}, set() {}, json(value) { data = value; } },
      (error) => { throw error; }
    );
    assert.equal(data.homepageEventSettingsUrl, expected ? '/dtech-hub/settings.html' : null, page);
  }
  const source = await fs.readFile(path.join(__dirname, '..', 'public', 'global-nav.js'), 'utf8');
  assert.match(source, /if \(data\.homepageEventSettingsUrl\) link\(settings, 'Homepage Event Settings', data\.homepageEventSettingsUrl\)/);
});

test('Global Control offers only current DTECH teachers its independent module views', async () => {
  for (const [page, permissions, selected, expected] of [
    ['/dtech-hub/', ['teacher.view'], undefined, 'teacher'],
    ['/dtech-hub/index.html', ['teacher.view'], 'student', 'student'],
    ['/dtech-hub/teacher-view.html', ['teacher.view'], 'student', 'teacher'],
    ['/dtech-hub/ProjectPages/activity-detail.html', ['teacher.view'], 'student', 'student'],
    ['/dtech-hub/', [], 'teacher', null],
    ['/food-room/', ['teacher.view'], 'teacher', null],
    ['/dtech-hub/class-training/home', ['teacher.view'], 'teacher', null]
  ]) {
    let data;
    await navData(async (sql) => ({ rows: sql.includes('FROM users')
      ? [{ permissions, hub_roles: ['teacher'], system_admin: false }] : [] }),
    async () => false, async () => null)(
      { user: { email: 'teacher@westlandhigh.school.nz', roles: ['Teacher'] },
        session: { dtechView: selected, classTrainingView: 'student' }, query: { path: page } },
      { locals: {}, set() {}, json(value) { data = value; } },
      (error) => { throw error; }
    );
    assert.equal(data.activeView, expected, page);
    assert.equal(data.roleViewModule, expected ? 'DTECH Hub' : null);
    assert.deepEqual(data.roleViews.map((view) => view.url), expected
      ? ['/dtech-hub/view/teacher', '/dtech-hub/view/student'] : []);
  }
  assert.equal(effectiveDtechView({ teacher: false }, { dtechView: 'teacher' }), 'student');
});

test('view switches save the school session and recheck authority without requiring legacy database startup', async () => {
  const app = express();
  let teacher = true;
  let active = true;
  const store = new session.MemoryStore();
  app.use(session({ secret: 'isolated-dtech-views', store, resave: false, saveUninitialized: false }));
  app.use((req, res, next) => {
    req.user = { email: 'teacher@westlandhigh.school.nz', roles: ['Teacher'] };
    req.session.classTrainingView = 'student';
    next();
  });
  app.use('/dtech-hub', createDtechRouter({
    env: {},
    dbQuery: async () => ({ rows: active ? [{
      system_admin: false, hub_roles: ['teacher'], permissions: teacher ? ['teacher.view'] : []
    }] : [] })
  }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/dtech-hub`;
  let cookie;
  const readSession = () => new Promise((resolve, reject) => store.all((error, sessions) => {
    if (error) reject(error);
    else resolve(Object.values(sessions)[0]);
  }));
  try {
    for (const mode of ['student', 'teacher']) {
      const response = await fetch(`${base}/view/${mode}`, {
        redirect: 'manual', headers: cookie ? { cookie } : {}
      });
      assert.equal(response.status, 302);
      assert.equal(response.headers.get('location'), `/dtech-hub/${mode === 'teacher' ? 'teacher-view.html' : 'index.html'}`);
      const setCookie = response.headers.get('set-cookie');
      if (setCookie) cookie = setCookie.split(';')[0];
      const saved = await readSession();
      assert.equal(saved.dtechView, mode);
      assert.equal(saved.classTrainingView, 'student');
    }
    let response = await fetch(`${base}/view/admin`, { headers: { cookie } });
    assert.equal(response.status, 400);
    teacher = false;
    response = await fetch(`${base}/view/teacher`, { headers: { cookie } });
    assert.equal(response.status, 403);
    active = false;
    response = await fetch(`${base}/view/student`, { headers: { cookie } });
    assert.equal(response.status, 403);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('original homepage and activity detail use the session mode even with stale or unavailable storage', async () => {
  const root = path.join(__dirname, '..', 'src', 'legacy', 'dtech-hub');
  const main = prefixText(await fs.readFile(path.join(root, 'script.js'), 'utf8'));
  const detail = prefixText(await fs.readFile(path.join(root, 'ProjectPages', 'activity-detail.js'), 'utf8'));
  const context = {
    window: { whsDtech: { viewMode: 'student' } },
    localStorage: { getItem() { throw new Error('Storage unavailable'); } }
  };
  vm.createContext(context);
  vm.runInContext(main.slice(main.indexOf('function getEffectiveHubViewMode()'), main.indexOf('function isHomepagePath()')), context);
  vm.runInContext(detail.slice(detail.indexOf('function readStoredHubViewModeForDetail()'), detail.indexOf('async function canEditDetails()')), context);
  context.isTeacherWorkspacePathForDetail = () => false;
  for (const mode of ['student', 'teacher']) {
    context.window.whsDtech.viewMode = mode;
    assert.equal(vm.runInContext('getEffectiveHubViewMode()', context), mode);
    assert.equal(vm.runInContext('resolveDetailTeacherMode(true)', context), mode === 'teacher');
    assert.equal(vm.runInContext('resolveDetailTeacherMode(false)', context), false);
  }
  const css = await fs.readFile(path.join(__dirname, '..', 'public', 'account-controls.css'), 'utf8');
  assert.match(css, /\.whs-dtech-integrated #hub-staff-link,/);
  assert.match(css, /\.whs-dtech-integrated #hub-user-badge,/);
  assert.match(css, /\.whs-dtech-integrated #hub-global-sidebar-teacher-link\s*\{\s*display: none !important;/);
});
