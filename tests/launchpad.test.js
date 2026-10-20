const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const session = require('express-session');
const crypto = require('node:crypto');
const { Pool } = require('pg');
const { createPublicLaunchpad, createLaunchpadAdminRouter, renderLaunchpad, linkInput } = require('../src/launchpad');
const { injectGlobalNav } = require('../src/globalNav');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'launchpad.html'), 'utf8');

test('standalone Launchpad links to the six agreed services using absolute HTTPS addresses', () => {
  const cards = [...html.matchAll(/<a class="app" href="([^"]+)">([\s\S]*?)<\/a>/g)];
  assert.equal(cards.length, 6);
  const expected = new Map([
    ['WHS Learning Sites', 'https://whs-appsystem.onrender.com/learning-sites'],
    ['Hub Dashboard', 'https://whs-appsystem.onrender.com/technology-hub/'],
    ['Teacher Planner', 'https://teacher-planner-development.onrender.com'],
    ['Guidance Counsellor App', 'https://whs-appsystem.onrender.com/apps/guidance-counsellor-app/'],
    ['International App', 'https://whs-international.onrender.com'],
    ['Bus Controller App', 'https://whs-buscontroller.onrender.com']
  ]);
  for (const [, url, content] of cards) {
    const title = /<h3>([^<]+)<\/h3>/.exec(content)[1];
    assert.equal(url, expected.get(title));
    assert.equal(new URL(url).protocol, 'https:');
    expected.delete(title);
  }
  assert.equal(expected.size, 0);
});

test('Launchpad is portable and accessible without scripts or external assets', () => {
  assert.match(html, /<html lang="en-NZ">/);
  assert.match(html, /name="viewport"/);
  assert.match(html, /class="skip-link" href="#services"/);
  assert.match(html, /<main id="services"/);
  assert.match(html, /:focus-visible/);
  assert.match(html, /prefers-reduced-motion/);
  assert.doesNotMatch(html, /<script\b|<link\b|<img\b|@import|url\s*\(/i);
  assert.doesNotMatch(html, /target="_blank"/);
  assert.equal([...html.matchAll(/<h1\b/g)].length, 1);
});

test('Launchpad is served before session and shared navigation middleware', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'src', 'server.js'), 'utf8');
  const route = server.indexOf("app.get('/launchpad.html'");
  assert.ok(route > server.indexOf('app.use(helmet('));
  assert.ok(route < server.indexOf('app.use(session('));
  assert.ok(route < server.indexOf('app.use(injectGlobalNav)'));
});

test('Launchpad input accepts HTTPS only and validates all editable fields', () => {
  const valid = { title: 'Test', url: 'https://example.school.nz/path', description: 'A school service.', icon: 'hub', sortOrder: '10', visible: 'on' };
  assert.deepEqual(linkInput(valid), {
    title: 'Test', url: valid.url, description: valid.description, icon: 'hub', sortOrder: 10, visible: true
  });
  for (const change of [
    { url: 'javascript:alert(1)' }, { url: '//example.school.nz' }, { url: 'http://example.school.nz' },
    { url: 'https://user:password@example.school.nz' }, { url: 'not a URL' },
    { title: '' }, { description: '' }, { icon: 'toString' }, { sortOrder: '-1' },
    { sortOrder: '1.2' }, { sortOrder: '10000' }, { title: 'x'.repeat(101) },
    { description: 'x'.repeat(501) }, { url: 'https://example.school.nz/\npath' }
  ]) assert.throws(() => linkInput({ ...valid, ...change }));
});

test('generated public HTML escapes content, excludes hidden links and remains standalone', () => {
  const links = [{
    title: '<Test & Service>', url: 'https://example.school.nz/?a=1&b=2',
    description: '<script>alert(1)</script>', icon: 'learning', is_visible: true
  }, {
    title: 'Private draft', url: 'https://example.school.nz/draft',
    description: 'Not published', icon: 'bus', is_visible: false
  }];
  const output = renderLaunchpad(links);
  assert.match(output, /&lt;Test &amp; Service&gt;/);
  assert.match(output, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(output, /href="https:\/\/example.school.nz\/\?a=1&amp;b=2"/);
  assert.doesNotMatch(output, /Private draft|LAUNCHPAD_CARDS|<script\b|<link\b|<img\b|@import|url\s*\(/i);
  assert.equal((output.match(/class="app"/g) || []).length, 1);
  assert.match(renderLaunchpad([]), /No services are currently published/);
  assert.throws(() => renderLaunchpad([{ ...links[0], url: 'javascript:alert(1)' }]));
});

test('public Launchpad surfaces database failures rather than displaying stale default links', async t => {
  const logged = t.mock.method(console, 'error', () => {});
  let status;
  let message;
  const response = {
    status(code) { status = code; return this; },
    type() { return this; },
    send(body) { message = body; }
  };
  await createPublicLaunchpad({ dbQuery: async () => { throw new Error('Database unavailable'); } })({}, response);
  assert.equal(status, 503);
  assert.match(message, /temporarily unavailable/);
  assert.equal(logged.mock.calls.length, 1);
});

test('Launchpad migration seeds six links and edits persist in PostgreSQL', {
  skip: !process.env.MODULE_BUILDER_TEST_DATABASE_URL
}, async () => {
  const pool = new Pool({ connectionString: process.env.MODULE_BUILDER_TEST_DATABASE_URL, ssl: false });
  const client = await pool.connect();
  const schema = 'launchpad_' + crypto.randomBytes(8).toString('hex');
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}",public`);
    await client.query('CREATE TABLE users(id uuid PRIMARY KEY)');
    await client.query(fs.readFileSync(path.join(__dirname, '..', 'migrations', '036_launchpad_links.sql'), 'utf8'));
    const initial = (await client.query('SELECT * FROM launchpad_links ORDER BY sort_order,title,id')).rows;
    assert.equal(initial.length, 6);
    for (const [, url] of html.matchAll(/<a class="app" href="([^"]+)">/g)) {
      assert.ok(initial.some(link => link.url === url));
    }
    const added = (await client.query(`INSERT INTO launchpad_links(title,url,description,sort_order)
      VALUES ('New module','https://example.school.nz/','School service',1) RETURNING id`)).rows[0];
    await client.query(`UPDATE launchpad_links SET is_visible=false WHERE id=$1`, [initial[0].id]);
    await client.query(`UPDATE launchpad_links SET url='https://moved.school.nz/' WHERE id=$1`, [added.id]);
    const stored = (await client.query('SELECT * FROM launchpad_links WHERE is_visible=true ORDER BY sort_order,title,id')).rows;
    assert.equal(stored.length, 6);
    assert.equal(stored[0].url, 'https://moved.school.nz/');
    assert.doesNotMatch(renderLaunchpad(stored), /<h3>WHS Learning Sites<\/h3>/);
  } finally {
    await client.query('SET search_path TO public');
    await client.query(`DROP SCHEMA "${schema}" CASCADE`);
    client.release();
    await pool.end();
  }
});

test('admin manages durable links while the public view and download share published output', async () => {
  const links = [];
  const writes = [];
  let user = { id: 'admin-fixture', roles: ['ADMIN'], is_active: true };
  const dbQuery = async (sql, params = []) => {
    if (sql.startsWith('SELECT')) {
      const sorted = links.filter(link => !sql.includes('WHERE is_visible=true') || link.is_visible)
        .sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title));
      return { rows: sorted };
    }
    writes.push({ sql, params });
    const [title, url, description, icon, sort_order, is_visible] = params;
    if (sql.startsWith('INSERT')) {
      links.push({ id: 'a0000000-0000-4000-8000-000000000001', title, url, description, icon, sort_order, is_visible });
      return { rowCount: 1 };
    }
    if (sql.startsWith('UPDATE')) {
      const link = links.find(item => item.id === params[7]);
      if (!link) return { rowCount: 0 };
      Object.assign(link, { title, url, description, icon, sort_order, is_visible });
      return { rowCount: 1 };
    }
    throw new Error('Unexpected Launchpad query');
  };
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));
  app.get('/launchpad.html', createPublicLaunchpad({ dbQuery }));
  app.use(express.urlencoded({ extended: false }));
  app.use(session({ secret: 'launchpad-fixture-only', saveUninitialized: false, resave: false }));
  app.use(injectGlobalNav);
  app.use((req, res, next) => {
    req.user = user;
    req.isAuthenticated = () => Boolean(user);
    res.locals.activeRole = user?.roles[0] || '';
    next();
  });

  app.use('/admin/launchpad', createLaunchpadAdminRouter({ dbQuery }));
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
    const initialPublic = await call('/launchpad.html');
    assert.equal(initialPublic.status, 200);
    assert.equal(initialPublic.headers.get('set-cookie'), null);
    assert.match(await initialPublic.text(), /No services are currently published/);
    user = null;
    assert.equal((await call('/admin/launchpad')).status, 302);
    user = { id: 'teacher', roles: ['Teacher'] };
    assert.equal((await call('/admin/launchpad')).status, 403);
    assert.equal((await call('/admin/launchpad/download')).status, 403);
    user = { id: 'admin-fixture', roles: ['ADMIN'], is_active: false };
    assert.equal((await call('/admin/launchpad')).status, 403);
    user.is_active = true;
    const adminPage = await call('/admin/launchpad');
    assert.equal(adminPage.status, 200);
    const adminHtml = await adminPage.text();
    assert.match(adminHtml, /Download standalone HTML/);
    const csrf = /name="csrf" value="([^"]+)"/.exec(adminHtml)[1];
    const data = { csrf, title: 'New module', url: 'https://example.school.nz/', description: 'New service', icon: 'hub', sortOrder: '20', visible: 'on' };
    assert.equal((await call('/admin/launchpad/save', { ...data, csrf: 'wrong' })).status, 403);
    assert.equal((await call('/admin/launchpad/save', { ...data, url: 'javascript:alert(1)' })).status, 400);
    assert.equal(writes.length, 0);
    assert.equal((await call('/admin/launchpad/save', data)).status, 303);
    assert.equal(writes[0].params[6], user.id);
    const publicPage = await call('/launchpad.html');
    const publicHtml = await publicPage.text();
    assert.match(publicHtml, /New module/);
    assert.doesNotMatch(publicHtml, /global-nav|name="csrf"/);
    const download = await call('/admin/launchpad/download');
    assert.match(download.headers.get('content-disposition'), /attachment; filename="launchpad.html"/);
    assert.match(download.headers.get('content-type'), /application\/octet-stream/);
    assert.equal(await download.text(), publicHtml);
    links.push({ ...links[0], id: 'a0000000-0000-4000-8000-000000000002', title: 'First module', sort_order: 1 });
    const ordered = await (await call('/launchpad.html')).text();
    assert.ok(ordered.indexOf('<h3>First module') < ordered.indexOf('<h3>New module'));
    assert.equal((await call('/admin/launchpad/save', {
      ...data, id: links[0].id, title: 'Updated module', url: 'https://moved.school.nz/', sortOrder: '30', visible: ''
    })).status, 303);
    assert.equal(links[0].url, 'https://moved.school.nz/');
    assert.doesNotMatch(await (await call('/launchpad.html')).text(), /Updated module|moved.school.nz/);
    const editHtml = await (await call('/admin/launchpad')).text();
    assert.match(editHtml, /Updated module \(hidden\)/);
    assert.equal((await call('/admin/launchpad/save', { ...data, id: 'bad-id' })).status, 400);
    assert.equal((await call('/admin/launchpad/save', { ...data, id: 'ffffffff-ffff-4fff-8fff-ffffffffffff' })).status, 404);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
