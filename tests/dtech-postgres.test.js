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

for (const legacyLessonIds of [null, 'integer', 'text']) {
test(`original DTECH HTTP pages and uploads survive restart (${legacyLessonIds ? `legacy ${legacyLessonIds} course lesson IDs` : 'fresh schema'})`, {
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
  let originalConstraints;
  let originalLessons;
  let originalSections;
  let originalColumns;
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
        course_id INTEGER NOT NULL,
        title VARCHAR(255) NOT NULL,
        content TEXT,
        "order" INTEGER,
        template_path VARCHAR(255),
        created_at TIMESTAMP,
        updated_at TIMESTAMP,
        description TEXT
      )`);
      await client.query(`INSERT INTO "${schema}".lessons
        (course_id, title, content, "order", description, template_path)
        VALUES (7, 'Existing legacy lesson', '<p>Keep original lesson content</p>', 1, 'Keep existing work', 'original-template.html')`);
      await client.query(`CREATE TABLE "${schema}".sections (
        id SERIAL PRIMARY KEY,
        lesson_id INTEGER NOT NULL REFERENCES "${schema}".lessons(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        content TEXT,
        "order" INTEGER,
        template_path VARCHAR(255),
        video_url VARCHAR(255),
        created_at TIMESTAMP,
        updated_at TIMESTAMP,
        UNIQUE (lesson_id, id)
      )`);
      await client.query(`CREATE TABLE "${schema}".section_notes (
        lesson_id INTEGER NOT NULL,
        section_id INTEGER NOT NULL,
        note TEXT NOT NULL,
        CONSTRAINT section_notes_section_fkey FOREIGN KEY (lesson_id, section_id)
          REFERENCES "${schema}".sections(lesson_id, id) ON UPDATE CASCADE ON DELETE CASCADE
          DEFERRABLE INITIALLY DEFERRED
      )`);
      await client.query(`INSERT INTO "${schema}".sections (lesson_id, title, content, "order", video_url)
        VALUES (1, 'Existing section', '<p>Original section content</p>', 1, 'https://example.test/video')`);
      await client.query(`INSERT INTO "${schema}".sections (lesson_id, title, content, "order")
        VALUES (1, 'Earlier section', '<p>Earlier content</p>', 0)`);
      await client.query(`INSERT INTO "${schema}".section_notes VALUES (1, 1, 'Existing note')`);
      if (legacyLessonIds === 'text') {
        await client.query(`ALTER TABLE "${schema}".section_notes DROP CONSTRAINT section_notes_section_fkey;
          ALTER TABLE "${schema}".sections DROP CONSTRAINT sections_lesson_id_fkey;
          ALTER TABLE "${schema}".lessons ALTER COLUMN id TYPE TEXT USING id::text;
          ALTER TABLE "${schema}".sections ALTER COLUMN lesson_id TYPE TEXT USING lesson_id::text;
          ALTER TABLE "${schema}".section_notes ALTER COLUMN lesson_id TYPE TEXT USING lesson_id::text;
          ALTER TABLE "${schema}".sections ADD CONSTRAINT sections_lesson_id_fkey
            FOREIGN KEY (lesson_id) REFERENCES "${schema}".lessons(id) ON DELETE CASCADE;
          ALTER TABLE "${schema}".section_notes ADD CONSTRAINT section_notes_section_fkey
            FOREIGN KEY (lesson_id, section_id) REFERENCES "${schema}".sections(lesson_id, id)
            ON UPDATE CASCADE ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED`);
      }
      originalLessons = (await client.query(`SELECT * FROM "${schema}".lessons`)).rows;
      originalSections = (await client.query(`SELECT * FROM "${schema}".sections`)).rows;
      originalColumns = (await client.query(`SELECT table_name, column_name, data_type, is_nullable, column_default
        FROM information_schema.columns WHERE table_schema = $1 AND table_name IN ('lessons', 'sections')
        ORDER BY table_name, ordinal_position`, [schema])).rows;
      originalConstraints = (await client.query(`SELECT conname, pg_get_constraintdef(oid) AS definition
        FROM pg_constraint WHERE connamespace = $1::regnamespace AND contype = 'f' ORDER BY conname`, [schema])).rows;
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
      response = await fetch(`${base}/dtech-hub/api/lessons/legacy-course-1`);
      assert.equal(response.status, 200);
      const existing = await response.json();
      assert.equal(existing.id, 'legacy-course-1');
      assert.equal(existing.lesson_title, 'Existing legacy lesson');
      assert.equal(existing.lesson_plan.legacy_content, '<p>Keep original lesson content</p>');
      assert.deepEqual(existing.lesson_plan.legacy_sections.map((section) => section.title), ['Earlier section', 'Existing section']);
      assert.equal(existing.lesson_plan.legacy_sections[1].content, '<p>Original section content</p>');
      response = await fetch(`${base}/dtech-hub/api/lessons`);
      const all = await response.json();
      assert.equal(all.filter((lesson) => lesson.legacy_course_lesson).length, 1);
      assert.ok(all.some((lesson) => lesson.id.startsWith('relief-')));
      assert.deepEqual((await client.query(`SELECT * FROM "${schema}".lessons`)).rows, originalLessons);
      assert.deepEqual((await client.query(`SELECT * FROM "${schema}".sections`)).rows, originalSections);
      assert.deepEqual((await client.query(`SELECT table_name, column_name, data_type, is_nullable, column_default
        FROM information_schema.columns WHERE table_schema = $1 AND table_name IN ('lessons', 'sections')
        ORDER BY table_name, ordinal_position`, [schema])).rows, originalColumns);
      const generated = await client.query(`INSERT INTO "${schema}".lessons
        (course_id, title) VALUES (7, 'Default ID lesson')
        RETURNING id`);
      assert.equal(String(generated.rows[0].id), '2');
      assert.deepEqual((await client.query(`SELECT lesson_id::text, title FROM "${schema}".sections`)).rows,
        [{ lesson_id: '1', title: 'Existing section' }, { lesson_id: '1', title: 'Earlier section' }]);
      assert.deepEqual((await client.query(`SELECT lesson_id::text, section_id, note FROM "${schema}".section_notes`)).rows,
        [{ lesson_id: '1', section_id: 1, note: 'Existing note' }]);
      assert.deepEqual((await client.query(`SELECT conname, pg_get_constraintdef(oid) AS definition
        FROM pg_constraint WHERE connamespace = $1::regnamespace AND contype = 'f' ORDER BY conname`, [schema])).rows,
      originalConstraints);
      await assert.rejects(client.query(`INSERT INTO "${schema}".sections (lesson_id, title)
        VALUES (999, 'Invalid reference')`), { code: '23503' });
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
    if (legacyLessonIds) {
      assert.equal((await client.query(`SELECT count(*) FROM "${schema}".lessons`)).rows[0].count, '2');
      assert.equal((await client.query(`SELECT count(*) FROM "${schema}".whs_dtech_lessons WHERE id = $1`, [lesson.id])).rows[0].count, '1');
      response = await fetch(`${base}/dtech-hub/api/lessons`, {
        method: 'POST', headers: { cookie, 'x-dtech-csrf': context.csrf, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'legacy-course-1', lesson_title: 'Do not overwrite', lesson_type: 'DTECH',
          activity_name: 'Test', lesson_year_level: 'Year 9', lesson_focus: 'Test' })
      });
      assert.equal(response.status, 409);
    }
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
      response = await fetch(`${restarted}/dtech-hub/api/lessons/legacy-course-1`);
      assert.equal((await response.json()).lesson_title, 'Existing legacy lesson');
      assert.deepEqual((await client.query(`SELECT table_name, column_name, data_type, is_nullable, column_default
        FROM information_schema.columns WHERE table_schema = $1 AND table_name IN ('lessons', 'sections')
        ORDER BY table_name, ordinal_position`, [schema])).rows, originalColumns);
      response = await fetch(`${restarted}/dtech-hub/browse-lessons.html`);
      assert.match(await response.text(), /Existing Course Lessons/);
      await client.query(`UPDATE "${schema}".sections SET lesson_id = '2' WHERE lesson_id = '1'`);
      assert.equal(String((await client.query(`SELECT lesson_id FROM "${schema}".section_notes`)).rows[0].lesson_id), '2');
      await client.query(`DELETE FROM "${schema}".lessons WHERE id = '2'`);
      assert.equal((await client.query(`SELECT * FROM "${schema}".sections`)).rowCount, 0);
      assert.equal((await client.query(`SELECT * FROM "${schema}".section_notes`)).rowCount, 0);
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
