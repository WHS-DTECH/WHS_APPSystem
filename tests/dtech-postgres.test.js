const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const path = require('path');
const express = require('express');
const session = require('express-session');
const { createDtechRouter, accessForEmail } = require('../src/modules/dtechHub');
const { injectGlobalNav } = require('../src/globalNav');

test('shared Core role grants and revocations immediately control DTECH', {
  skip: !process.env.DTECH_TEST_CORE_DATABASE_URL
}, async () => {
  const { Client } = require('pg');
  const client = new Client({ connectionString: process.env.DTECH_TEST_CORE_DATABASE_URL, ssl: false });
  await client.connect();
  await client.query('BEGIN');
  const dbQuery = (sql, values) => client.query(sql, values);
  const email = `dtech-role-fixture-${Date.now()}@example.test`;
  try {
    const user = (await client.query('INSERT INTO users (email, display_name) VALUES ($1, $2) RETURNING id', [email, 'Fixture user'])).rows[0];
    assert.equal((await accessForEmail(email, dbQuery)).teacher, false);
    await client.query(`INSERT INTO user_hub_roles (user_id, hub_role_id)
      SELECT $1, id FROM hub_roles WHERE hub_key = 'dtech-hub' AND role_key = 'teacher'`, [user.id]);
    assert.equal((await accessForEmail(email, dbQuery)).teacher, true);
    assert.equal((await accessForEmail(email, dbQuery)).admin, false);
    await client.query('DELETE FROM user_hub_roles WHERE user_id = $1', [user.id]);
    assert.equal((await accessForEmail(email, dbQuery)).teacher, false);
    await client.query(`INSERT INTO user_roles (user_id, role_id)
      SELECT $1, id FROM roles WHERE name = 'ADMIN'`, [user.id]);
    assert.equal((await accessForEmail(email, dbQuery)).admin, true);
    await client.query('UPDATE users SET is_active = FALSE WHERE id = $1', [user.id]);
    assert.equal((await accessForEmail(email, dbQuery)).active, false);
  } finally {
    await client.query('ROLLBACK');
    await client.end();
  }
});

for (const legacyLessonIds of [false, true]) {
test(`original DTECH HTTP pages and uploads survive restart (${legacyLessonIds ? 'legacy integer lesson IDs' : 'fresh schema'})`, {
  skip: !process.env.DTECH_TEST_DATABASE_URL
}, async () => {
  const { Client } = require('pg');
  const schema = `dtech_fixture_${require('crypto').randomUUID().replaceAll('-', '')}`;
  const client = new Client({ connectionString: process.env.DTECH_TEST_DATABASE_URL, ssl: false });
  await client.connect();
  await client.query(`CREATE SCHEMA "${schema}"`);
  const databaseUrl = new URL(process.env.DTECH_TEST_DATABASE_URL);
  databaseUrl.searchParams.set('options', `-c search_path=${schema}`);
  const env = { DTECH_DATABASE_URL: databaseUrl.toString(), DTECH_DATABASE_SSL: 'false' };
  const instances = [];
  const servers = [];
  let uploaded;
  async function start() {
    const app = express();
    app.set('view engine', 'ejs');
    app.set('views', path.join(__dirname, '..', 'views'));
    app.use(express.json());
    app.use(session({ secret: 'isolated-dtech-postgres', resave: false, saveUninitialized: false, cookie: { maxAge: 3600000 } }));
    app.use((req, res, next) => {
      req.user = { email: 'teacher@westlandhigh.school.nz', display_name: 'Fixture Teacher', roles: ['ADMIN'] };
      res.locals.activeRole = 'ADMIN';
      next();
    });
    app.use(injectGlobalNav);
    app.use('/dtech-hub', createDtechRouter({
      env,
      dbQuery: async () => ({ rows: [{ system_admin: true, hub_roles: [], permissions: [] }] }),
      archive: { async *teachingFiles() {} },
      createLegacy: (integration) => {
        const legacy = require('../src/legacy/dtech-hub/server')(integration);
        instances.push(legacy);
        return legacy;
      }
    }));
    const server = app.listen(0, '127.0.0.1');
    servers.push(server);
    await new Promise((resolve) => server.once('listening', resolve));
    return `http://127.0.0.1:${server.address().port}`;
  }
  try {
    if (legacyLessonIds) {
      await client.query(`CREATE TABLE "${schema}".lessons (
        id SERIAL PRIMARY KEY,
        lesson_title TEXT NOT NULL,
        lesson_type TEXT NOT NULL,
        activity_name TEXT NOT NULL,
        lesson_year_level TEXT NOT NULL,
        lesson_focus TEXT NOT NULL
      )`);
      await client.query(`INSERT INTO "${schema}".lessons
        (lesson_title, lesson_type, activity_name, lesson_year_level, lesson_focus)
        VALUES ('Existing legacy lesson', 'Digital Technologies', 'Legacy activity', 'Year 9', 'Keep existing work')`);
    }
    const base = await start();
    let response = await fetch(`${base}/dtech-hub/`);
    assert.equal(response.status, 200, response.status === 200 ? undefined : await response.text());
    const cookie = response.headers.get('set-cookie').split(';')[0];
    const html = await response.text();
    assert.match(html, /Computer Lab/);
    assert.match(html, /\/global-nav\.js/);
    assert.match(html, /\/dtech-session\.js/);
    const context = JSON.parse(html.match(/window\.whsDtech=(.*?);<\/script>/)[1]);
    assert.equal(context.profile.email, 'teacher@westlandhigh.school.nz');
    assert.ok(context.expiresAt > Date.now());
    assert.match(html, /href="\/dtech-hub\/suggest-activity\.html"/);
    for (const url of ['/dtech-hub/teacher-view.html', '/dtech-hub/learning-pathways/', '/dtech-hub/practical-skills/', '/dtech-hub/script.js',
      '/dtech-hub/practical-skills/library.json', '/dtech-hub/learning-pathways/library.json', '/dtech-hub/api/activities']) {
      response = await fetch(base + url);
      assert.equal(response.status, 200, url);
      if (url.endsWith('.json')) assert.ok(Array.isArray(await response.json()), url);
    }
    if (legacyLessonIds) {
      response = await fetch(`${base}/dtech-hub/api/lessons/1`);
      assert.equal(response.status, 200);
      const existing = await response.json();
      assert.equal(existing.id, '1');
      assert.equal(existing.lesson_title, 'Existing legacy lesson');
      const generated = await client.query(`INSERT INTO "${schema}".lessons
        (lesson_title, lesson_type, activity_name, lesson_year_level, lesson_focus)
        VALUES ('Default ID lesson', 'Digital Technologies', 'Legacy activity', 'Year 9', 'Keep sequence')
        RETURNING id`);
      assert.equal(generated.rows[0].id, '2');
    }
    for (const url of ['/dtech-hub/server.js', '/dtech-hub/SERVER.js', '/dtech-hub/package.json', '/dtech-hub/learning-pathways/library-store.js',
      '/dtech-hub/node_modules/express/index.js', '/dtech-hub/TeacherFiles/private.csv']) {
      response = await fetch(base + url);
      assert.equal(response.status, 404, url);
    }
    response = await fetch(`${base}/dtech-hub/api/lessons`, { method: 'POST', headers: { cookie, 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(response.status, 403);
    const form = new FormData();
    for (const [key, value] of Object.entries({
      lesson_title: 'Fixture lesson', lesson_type: 'Digital Technologies', activity_name: 'Fixture activity',
      lesson_year_level: 'Year 9', lesson_focus: 'Test durable upload'
    })) form.set(key, value);
    form.append('resourceFiles', new Blob([Buffer.from('%PDF-fixture-upload')], { type: 'application/pdf' }), 'fixture.pdf');
    response = await fetch(`${base}/dtech-hub/api/lessons`, { method: 'POST', headers: { cookie, 'x-dtech-csrf': context.csrf }, body: form });
    const lesson = await response.json();
    assert.equal(response.status, 201, JSON.stringify(lesson));
    assert.match(lesson.id, /^lesson-/);
    const url = lesson.lesson_plan.attachedResources[0].url;
    assert.match(url, /^\/dtech-hub\/TeacherFiles\//);
    uploaded = path.join(__dirname, '..', 'src', 'legacy', 'dtech-hub', ...decodeURIComponent(url).split('/').slice(2));
    await fs.unlink(uploaded);
    const restarted = await start();
    response = await fetch(`${restarted}/dtech-hub/`);
    assert.equal(response.status, 200);
    response = await fetch(restarted + url);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), '%PDF-fixture-upload');
    if (legacyLessonIds) {
      response = await fetch(`${restarted}/dtech-hub/api/lessons/1`);
      assert.equal((await response.json()).lesson_title, 'Existing legacy lesson');
    }
  } finally {
    for (const server of servers) await new Promise((resolve) => server.close(resolve));
    for (const instance of instances) {
      if (!instance.pool.ended) await instance.pool.end();
    }
    if (uploaded) await fs.rm(uploaded, { force: true });
    await client.query(`DROP SCHEMA "${schema}" CASCADE`);
    await client.end();
  }
});
}
