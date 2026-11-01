const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const session = require('express-session');
const crypto = require('node:crypto');
const { Pool } = require('pg');
const { createLaunchpad, createLaunchApp, createLaunchpadAdminRouter, renderLaunchpad, linkInput } = require('../src/launchpad');
const { createModuleAccessGuard, accessibleModules } = require('../src/moduleAccess');
const { injectGlobalNav } = require('../src/globalNav');

const html = fs.readFileSync(path.join(__dirname, '..', 'views', 'launchpad.html'), 'utf8');

test('Launchpad template retains responsive and keyboard-accessible presentation', () => {
  assert.match(html, /<html lang="en-NZ">/);
  assert.match(html, /name="viewport"/);
  assert.match(html, /class="skip-link" href="#services"/);
  assert.match(html, /<main id="services"/);
  assert.match(html, /:focus-visible/);
  assert.match(html, /prefers-reduced-motion/);
  assert.match(html, /<img class="brand-mark" src="\/images\/whs%20logo%20circular%20reo%20\.png" width="58" height="58" alt="">/);
  assert.equal(fs.existsSync(path.join(__dirname, '..', 'public', 'images', 'whs logo circular reo .png')), true);
  assert.doesNotMatch(html, /target="_blank"/);
  assert.equal([...html.matchAll(/<h1\b/g)].length, 1);
  assert.equal(fs.existsSync(path.join(__dirname, '..', 'public', 'launchpad.html')), false);
});

test('root and legacy Launchpad routes run after authentication and before static or module routes', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'src', 'server.js'), 'utf8');
  const route = server.indexOf("app.get(['/', '/launchpad', '/launchpad.html'], createLaunchpad())");
  assert.ok(route > server.indexOf('app.use(passport.session())'));
  assert.ok(route > server.indexOf('app.use(injectGlobalNav)'));
  assert.ok(route < server.indexOf('app.use(express.static'));
  assert.ok(server.indexOf('app.use(createModuleAccessGuard())') < server.indexOf("app.use('/learning-sites'"));
});

test('Launchpad input requires a module binding and validates editable presentation fields', () => {
  const valid = { title: 'Test', moduleKey: 'example-module', description: 'A school service.', icon: 'hub', sortOrder: '10', visible: 'on' };
  assert.deepEqual(linkInput(valid), {
    title: 'Test', moduleKey: valid.moduleKey, description: valid.description, icon: 'hub', sortOrder: 10, visible: true
  });
  for (const change of [
    { moduleKey: '' }, { moduleKey: '../admin' }, { moduleKey: 'Module' },
    { title: '' }, { description: '' }, { icon: 'toString' }, { sortOrder: '-1' },
    { sortOrder: '1.2' }, { sortOrder: '10000' }, { title: 'x'.repeat(101) },
    { description: 'x'.repeat(501) }, { title: 'Test\nname' }
  ]) assert.throws(() => linkInput({ ...valid, ...change }));
});

test('rendered Launchpad escapes text, excludes hidden cards and uses relative links', () => {
  const links = [{
    title: '<Test & Service>', url: '/launchpad/apps/example-module',
    description: '<script>alert(1)</script>', icon: 'learning', is_visible: true
  }, {
    title: 'Private draft', url: '/launchpad/apps/draft',
    description: 'Not published', icon: 'bus', is_visible: false
  }];
  const output = renderLaunchpad(links);
  assert.match(output, /&lt;Test &amp; Service&gt;/);
  assert.match(output, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(output, /href="\/launchpad\/apps\/example-module"/);
  assert.doesNotMatch(output, /Private draft|LAUNCHPAD_CARDS|<script\b/i);
  assert.equal((output.match(/class="app"/g) || []).length, 1);
  assert.match(renderLaunchpad([]), /No active apps are assigned/);
  assert.throws(() => renderLaunchpad([{ ...links[0], url: 'javascript:alert(1)' }]));
});

test('Launchpad surfaces database failures rather than serving default service links', async t => {
  const logged = t.mock.method(console, 'error', () => {});
  let status, message;
  const response = {
    set() { return this; }, status(code) { status = code; return this; },
    type() { return this; }, send(body) { message = body; }
  };
  await createLaunchpad({ dbQuery: async () => { throw new Error('Database unavailable'); } })({ user: { id: 'fixture' } }, response);
  assert.equal(status, 503);
  assert.match(message, /temporarily unavailable/);
  assert.equal(logged.mock.calls.length, 1);
});

test('assignment query excludes global role grants, inactive modules and area-only access', async () => {
  let sql;
  const modules = await accessibleModules({ id: 'fixture' }, async query => {
    sql = query;
    return { rows: [
      { module_key: 'assigned', is_active: true, has_access: true },
      { module_key: 'inactive', is_active: false, has_access: true },
      { module_key: 'unassigned', is_active: true, has_access: false }
    ] };
  });
  assert.deepEqual(modules.map(module => module.module_key), ['assigned']);
  assert.match(sql, /u.is_active=true/);
  assert.match(sql, /teacher_module_assignments/);
  assert.match(sql, /a.area_key IS NULL/);
  assert.match(sql, /p.permission_key='home.view'/);
  assert.match(sql, /m.module_key NOT IN \('core','kamar-uploader','module-builder'\)/);
  assert.doesNotMatch(sql, /FROM role_modules/);
});

test('authenticated Launchpad, admin cards, stable launch routes and direct module guards stay consistent', async () => {
  const id = 'a0000000-0000-4000-8000-000000000001';
  const modules = [
    { id: 'module', module_key: 'example-module', display_name: 'Example App', description: 'School app', path: '/example/', is_active: true },
    { id: 'external', module_key: 'international-app', display_name: 'International App', path: 'https://whs-international.onrender.com/', is_active: true },
    { id: 'core', module_key: 'core', display_name: 'Administration', path: '/admin', is_active: false },
    { id: 'inactive', module_key: 'inactive', display_name: 'Inactive App', path: '/inactive/', is_active: false }
  ];
  const links = [];
  const assigned = new Set(['example-module']);
  const writes = [];
  let user = null;
  const dbQuery = async (sql, params = []) => {
    if (sql.includes('FROM modules m')) return { rows: modules.map(module => ({
      ...module, has_access: Boolean(user && user.is_active !== false && (user.roles.includes('ADMIN') || assigned.has(module.module_key)))
    })) };
    if (sql.startsWith('SELECT * FROM modules WHERE')) return { rows: modules.filter(module => module.module_key === params[0]) };
    if (sql.startsWith('SELECT * FROM modules')) return { rows: modules };
    if (sql.startsWith('SELECT id FROM launchpad_links')) return { rows: links.filter(link => link.module_key === params[0] && link.id !== params[1]) };
    if (sql.startsWith('SELECT * FROM launchpad_links')) return { rows: links };
    writes.push({ sql, params });
    const [title, url, description, icon, sort_order, is_visible, updated_by, module_key] = params;
    if (sql.startsWith('INSERT')) {
      links.push({ id, title, url, description, icon, sort_order, is_visible, updated_by, module_key });
      return { rowCount: 1 };
    }
    if (sql.startsWith('UPDATE')) {
      const link = links.find(item => item.id === params[8]);
      if (!link) return { rowCount: 0 };
      Object.assign(link, { title, url, description, icon, sort_order, is_visible, updated_by, module_key });
      return { rowCount: 1 };
    }
    throw new Error('Unexpected Launchpad query: ' + sql);
  };
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));
  app.use(express.urlencoded({ extended: false }));
  app.use(session({ secret: 'launchpad-fixture-only', saveUninitialized: false, resave: false }));
  app.use(injectGlobalNav);
  app.use((req, res, next) => {
    req.user = user;
    req.isAuthenticated = () => Boolean(user);
    res.locals.currentUser = user;
    res.locals.isAdmin = user?.roles.includes('ADMIN') || false;
    res.locals.activeRole = user?.roles[0] || '';
    next();
  });
  app.get(['/', '/launchpad', '/launchpad.html'], createLaunchpad({ dbQuery }));
  app.get('/launchpad/apps/:moduleKey', createLaunchApp({ dbQuery }));
  app.use(createModuleAccessGuard({ dbQuery }));
  app.use('/admin/launchpad', createLaunchpadAdminRouter({ dbQuery }));
  app.get(['/example/', '/inactive/'], (req, res) => res.send('App content'));
  app.use((error, req, res, next) => res.status(500).send(error.message));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    let cookie;
    const call = async (route, data) => {
      const response = await fetch(base + route, {
        method: data ? 'POST' : 'GET', redirect: 'manual',
        headers: { ...(cookie ? { cookie } : {}), ...(data ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
        ...(data ? { body: new URLSearchParams(data) } : {})
      });
      if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
      return response;
    };
    for (const route of ['/', '/launchpad', '/launchpad.html']) {
      const response = await call(route);
      const output = await response.text();
      assert.match(output, /Sign in with Google/);
      assert.doesNotMatch(output, /whs-international|class="app"/);
      assert.equal(response.headers.get('cache-control'), 'no-store');
    }
    assert.equal((await call('/launchpad/apps/example-module')).headers.get('location'), '/auth/google?next=%2Flaunchpad%2Fapps%2Fexample-module');
    assert.equal((await call('/example/')).status, 302);
    assert.equal((await call('/admin/launchpad')).status, 302);
    user = { id: 'teacher-fixture', roles: ['Teacher'], is_active: true };
    let page = await call('/');
    let output = await page.text();
    assert.match(output, /href="\/launchpad\/apps\/example-module"/);
    assert.doesNotMatch(output, /International App|Inactive App/);
    assert.equal(page.headers.get('cache-control'), 'no-store');
    assert.equal((await call('/example/')).status, 200);
    assert.equal((await call('/launchpad/apps/international-app')).status, 403);
    assert.equal((await call('/inactive/')).status, 403);
    assert.equal((await call('/admin/launchpad')).status, 403);
    assigned.clear();
    assert.equal((await call('/example/')).status, 403);
    assert.equal((await call('/%65xample/')).status, 403, 'encoded static paths cannot bypass app access');
    assert.equal((await call('//example/')).status, 403, 'duplicate slashes cannot bypass static app access');
    assert.equal((await call('/%2fexample/')).status, 403);
    assert.equal((await call('/example%5cprivate')).status, 400);
    assert.equal((await call('/launchpad/apps/example-module')).status, 403);
    assert.match(await (await call('/')).text(), /No active apps are assigned/);
    assigned.add('example-module');
    user.is_active = false;
    assert.equal((await call('/')).status, 403);
    assert.equal((await call('/example/')).status, 403);
    assert.equal((await call('/launchpad/apps/example-module')).status, 403);
    user = { id: 'admin-fixture', roles: ['ADMIN'], is_active: true };
    assert.equal((await call('/admin/launchpad')).status, 200, 'administrators retain recovery tools when the Core card is inactive');
    const adminHtml = await (await call('/admin/launchpad')).text();
    assert.doesNotMatch(adminHtml, /href="\/admin\/launchpad\/download"/);
    assert.equal((await call('/admin/launchpad/download')).status, 410);
    const csrf = /name="csrf" value="([^"]+)"/.exec(adminHtml)[1];
    const data = { csrf, title: 'New module', moduleKey: 'example-module', description: 'New service', icon: 'hub', sortOrder: '20', visible: 'on' };
    assert.equal((await call('/admin/launchpad/save', { ...data, csrf: 'wrong' })).status, 403);
    assert.equal((await call('/admin/launchpad/save', { ...data, moduleKey: 'missing' })).status, 400);
    assert.equal(writes.length, 0);
    assert.equal((await call('/admin/launchpad/save', data)).status, 303);
    assert.equal(writes[0].params[6], user.id);
    assert.equal((await call('/admin/launchpad/save', data)).status, 409);
    output = await (await call('/')).text();
    assert.match(output, /New module/);
    assert.match(output, /International App/);
    assert.doesNotMatch(output, /Inactive App/);
    const launch = '/launchpad/apps/example-module';
    assert.equal((await call(launch)).headers.get('location'), '/example/');
    modules[0].path = '/moved-example/';
    assert.equal((await call(launch)).headers.get('location'), '/moved-example/');
    modules[0].path = 'https://new-provider.example.school.nz/';
    assert.equal((await call(launch)).headers.get('location'), modules[0].path);
    modules[0].path = 'javascript:alert(1)';
    assert.equal((await call(launch)).status, 500);
    modules[0].path = '/launchpad';
    assert.equal((await call(launch)).status, 500);
    modules[0].path = '/example/';
    assert.equal((await call('/admin/launchpad/save', { ...data, id, visible: '' })).status, 303);
    assert.doesNotMatch(await (await call('/')).text(), /New module/);
    assert.equal((await call(launch)).status, 302, 'hiding a card does not revoke its assignment');
    modules[0].is_active = false;
    assert.equal((await call(launch)).status, 403, 'deactivation applies to ADMIN too');
    assert.equal((await call('/admin/launchpad/save', { ...data, id: 'bad-id' })).status, 400);
    assert.equal((await call('/admin/launchpad/save', { ...data, id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', moduleKey: 'international-app' })).status, 404);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test('Launchpad migration preserves destinations and assignment checks work in PostgreSQL', {
  skip: !process.env.MODULE_BUILDER_TEST_DATABASE_URL
}, async () => {
  const pool = new Pool({ connectionString: process.env.MODULE_BUILDER_TEST_DATABASE_URL, ssl: false });
  const client = await pool.connect();
  const schema = 'launchpad_' + crypto.randomBytes(8).toString('hex');
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}",public`);
    await client.query(fs.readFileSync(path.join(__dirname, '..', 'migrations', '001_init.sql'), 'utf8'));
    await client.query(fs.readFileSync(path.join(__dirname, '..', 'migrations', '002_roles_and_module_assignments.sql'), 'utf8'));
    await client.query(`CREATE TABLE student_apps(slug text,hub_key text);
      CREATE TABLE hub_roles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),hub_key text,role_key text);
      CREATE TABLE user_hub_roles(user_id uuid,hub_role_id uuid,area_key text);
      CREATE TABLE hub_permissions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),hub_key text,permission_key text);
      CREATE TABLE hub_role_permissions(hub_role_id uuid,hub_permission_id uuid);
      CREATE TABLE module_builder_projects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),slug text,name text,description text,stage text);
      CREATE TABLE module_builder_environments(project_id uuid,kind text,config jsonb);
      INSERT INTO module_builder_projects(slug,name,stage) VALUES ('teacher-planner','Teacher Planner','development'),
        ('international-app','International App','development'),('bus-controller-app','Bus Controller App','development');
      INSERT INTO module_builder_environments SELECT id,'development',jsonb_build_object('appUrl',CASE slug
        WHEN 'teacher-planner' THEN 'https://teacher-planner-development.onrender.com/'
        WHEN 'international-app' THEN 'https://whs-international.onrender.com/'
        ELSE 'https://whs-buscontroller.onrender.com/' END) FROM module_builder_projects;
      INSERT INTO modules(module_key,display_name,path) VALUES ('learning-sites','Learning','/learning-sites'),
        ('technology-hub','Hub','/technology-hub/'),('student-app-guidance-counsellor-app','Guidance','/student-apps/guidance-counsellor-app/open');`);
    await client.query(fs.readFileSync(path.join(__dirname, '..', 'migrations', '036_launchpad_links.sql'), 'utf8'));
    const before = (await client.query('SELECT url FROM launchpad_links ORDER BY url')).rows;
    await client.query(fs.readFileSync(path.join(__dirname, '..', 'migrations', '038_authenticated_launchpad.sql'), 'utf8'));
    assert.deepEqual((await client.query('SELECT url FROM launchpad_links ORDER BY url')).rows, before);
    assert.equal((await client.query('SELECT * FROM launchpad_links WHERE module_key IS NOT NULL')).rows.length, 6);
    const user = (await client.query("INSERT INTO users(email,display_name) VALUES ('fixture@example.test','Fixture') RETURNING *")).rows[0];
    const dbQuery = (sql, params) => client.query(sql, params);
    assert.deepEqual(await accessibleModules(user, dbQuery), []);
    await client.query(`INSERT INTO teacher_module_assignments SELECT $1,id FROM modules WHERE module_key='teacher-planner'`, [user.id]);
    assert.deepEqual((await accessibleModules(user, dbQuery)).map(module => module.module_key), ['teacher-planner']);
    await client.query(`INSERT INTO hub_roles(hub_key,role_key) VALUES ('bus-controller-app','teacher');
      INSERT INTO hub_permissions(hub_key,permission_key) VALUES ('bus-controller-app','home.view');
      INSERT INTO hub_role_permissions SELECT r.id,p.id FROM hub_roles r JOIN hub_permissions p ON p.hub_key=r.hub_key;`);
    await client.query('INSERT INTO user_hub_roles SELECT $1,id,NULL FROM hub_roles', [user.id]);
    assert.equal((await accessibleModules(user, dbQuery)).length, 2);
    await client.query("UPDATE modules SET is_active=false WHERE module_key='teacher-planner'");
    assert.deepEqual((await accessibleModules(user, dbQuery)).map(module => module.module_key), ['bus-controller-app']);
    await client.query('DELETE FROM user_hub_roles WHERE user_id=$1', [user.id]);
    assert.deepEqual(await accessibleModules(user, dbQuery), []);
    await client.query("INSERT INTO user_roles SELECT $1,id,NOW() FROM roles WHERE name='ADMIN'", [user.id]);
    assert.equal((await accessibleModules(user, dbQuery)).length, 6);
    await client.query('UPDATE users SET is_active=false WHERE id=$1', [user.id]);
    assert.deepEqual(await accessibleModules(user, dbQuery), []);
  } finally {
    await client.query('SET search_path TO public');
    await client.query(`DROP SCHEMA "${schema}" CASCADE`);
    client.release();
    await pool.end();
  }
});
