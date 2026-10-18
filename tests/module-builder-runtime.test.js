const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const { Pool } = require('pg');
const { createModuleBuilderRouter } = require('../src/moduleBuilder');
const { BuilderError } = require('../src/moduleBuilderProviders');
const { navData } = require('../src/globalNav');

test('wizard database, admin forms, confirmations, durable operations and sidebar work end to end', {
  skip: !process.env.MODULE_BUILDER_TEST_DATABASE_URL
}, async () => {
  const schema = `wizard_${crypto.randomUUID().replaceAll('-', '')}`;
  const admin = new Pool({ connectionString: process.env.MODULE_BUILDER_TEST_DATABASE_URL, ssl: false });
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const url = new URL(process.env.MODULE_BUILDER_TEST_DATABASE_URL);
  url.searchParams.set('options', `-c search_path=${schema},public`);
  const pool = new Pool({ connectionString: url.toString(), ssl: false });
  const query = (sql, values) => pool.query(sql, values);
  let server;
  try {
    for (const migration of ['001_init.sql', '002_roles_and_module_assignments.sql', '026_module_builder.sql', '027_module_identity.sql']) {
      await query(await fs.readFile(path.join(__dirname, '..', 'migrations', migration), 'utf8'));
    }
    // The pilot is idempotent and environment creation is atomic with registration.
    await query(await fs.readFile(path.join(__dirname, '..', 'migrations', '026_module_builder.sql'), 'utf8'));
    assert.equal((await query('SELECT * FROM module_builder_projects')).rows.length, 1);
    assert.equal((await query('SELECT * FROM module_builder_environments')).rows.length, 3);
    const user = (await query("INSERT INTO users(email,display_name) VALUES ('wizard@example.test','Wizard Admin') RETURNING *")).rows[0];
    const calls = [];
    let ambiguous = false;
    let changeDuringVerify = false;
    const providers = {
      configuration: () => ({ githubOwner: 'WHS-DTECH', githubConfigured: true, renderConfigured: true, renderOwnerId: 'tea-fixture' }),
      repository: async (project) => { calls.push('repository'); return { repository: `WHS-DTECH/${project.slug}`, branch: 'main' }; },
      scaffold: async () => { calls.push('scaffold'); return { commit: 'framework' }; },
      database: async () => {
        calls.push('database');
        if (ambiguous) throw new BuilderError('Provider timed out; inspect first.', 502, true);
        return { databaseId: 'dpg-created-a' };
      },
      service: async () => { calls.push('service'); return { serviceId: 'srv-created', appUrl: 'https://created.onrender.com/' }; },
      verify: async (project) => {
        if (changeDuringVerify) {
          await query("UPDATE module_builder_projects SET revision=revision+1 WHERE id=$1", [project.id]);
          await query("UPDATE module_builder_environments SET config=config || '{\"serviceId\":\"srv-new\"}'::jsonb, verification='{}', checked_at=NULL WHERE project_id=$1 AND kind='development'", [project.id]);
        }
        return { environmentVariableNames: ['DATABASE_URL'], deploy: { status: 'live', commit: 'commit' } };
      }
    };
    const app = express();
    app.set('view engine', 'ejs');
    app.set('views', path.join(__dirname, '..', 'views'));
    app.use(express.urlencoded({ extended: false }));
    app.use(session({ secret: 'isolated-wizard-test', resave: false, saveUninitialized: false }));
    app.use((req, res, next) => {
      const role = req.get('x-test-role') || 'ADMIN';
      if (role !== 'anonymous') req.user = { ...user, roles: [role] };
      res.locals.activeRole = role; res.locals.isAdmin = role === 'ADMIN';
      next();
    });

    app.get('/nav-data', navData(query, async () => false, async () => null));
    app.use('/module-builder', createModuleBuilderRouter({ dbQuery: query, providers }));
    app.use((error, req, res, next) => { console.error(error); res.status(500).send('Test request failed.'); });
    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    let cookie;
    const get = async (route, role = 'ADMIN') => fetch(base + route, { headers: { 'x-test-role': role, ...(cookie ? { cookie } : {}) }, redirect: 'manual' });
    const post = async (route, body) => fetch(base + route, {
      method: 'POST', redirect: 'manual', headers: { cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body)
    });
    for (const role of ['anonymous', 'Teacher', 'Student']) assert.equal((await get('/module-builder', role)).status, 403);
    let response = await get('/module-builder');
    assert.equal(response.status, 200);
    cookie = response.headers.get('set-cookie').split(';')[0];
    const html = await response.text();
    const csrf = html.match(/name="csrf" value="([^"]+)"/)[1];
    assert.match(html, /Teacher Planner/);
    assert.match(html, /Not recorded/);
    assert.equal((await post('/module-builder/projects', { name: 'Rejected', slug: 'rejected' })).status, 403);
    response = await post('/module-builder/projects', {
      csrf, name: '<Test Module>', slug: 'test-module', description: 'Pilot test', deploymentType: 'independent'
    });
    assert.equal(response.status, 302);
    const detail = response.headers.get('location');
    const id = detail.split('/').pop();
    assert.equal((await query('SELECT * FROM module_builder_environments WHERE project_id=$1', [id])).rows.length, 3);
    response = await get(detail);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /&lt;Test Module&gt;/);
    const confirm = async (action, overrides = {}) => {
      const review = await post(`${detail}/review`, { csrf, action });
      if (review.status !== 200) return review;
      const content = await review.text();
      const digest = content.match(/name="digest" value="([^"]+)"/)[1];
      return post(`${detail}/provision`, { csrf, action, digest, consent: 'yes', confirm: 'test-module', ...overrides });
    };
    assert.equal((await confirm('repository', { confirm: 'wrong' })).status, 409);
    assert.equal(calls.length, 0);
    const review = await post(`${detail}/review`, { csrf, action: 'repository' });
    const reviewHtml = await review.text();
    const digest = reviewHtml.match(/name="digest" value="([^"]+)"/)[1];
    const duplicates = await Promise.all([1, 2].map(() => post(`${detail}/provision`, {
      csrf, action: 'repository', digest, consent: 'yes', confirm: 'test-module'
    })));
    assert.deepEqual(duplicates.map((item) => item.status).sort(), [302, 409]);
    assert.equal(calls.filter((item) => item === 'repository').length, 1);
    assert.equal((await confirm('repository')).status, 409);
    assert.equal((await confirm('scaffold')).status, 302);
    ambiguous = true;
    assert.equal((await confirm('database')).status, 502);
    assert.equal((await confirm('database')).status, 409);
    assert.equal(calls.filter((call) => call === 'database').length, 1);
    const uncertain = (await query("SELECT * FROM module_builder_operations WHERE project_id=$1 AND status='uncertain'", [id])).rows[0];
    assert.ok(uncertain);
    assert.equal((await post(`${detail}/reconcile/${uncertain.id}`, { csrf, confirm: 'test-module', inspected: 'yes', note: 'Verified no database was created in test provider.' })).status, 302);
    ambiguous = false;
    assert.equal((await confirm('database')).status, 302);
    assert.equal((await confirm('service')).status, 302);
    assert.equal((await confirm('service')).status, 409);
    assert.equal((await post(`${detail}/verify/development`, { csrf })).status, 302);
    const checked = (await query("SELECT * FROM module_builder_environments WHERE project_id=$1 AND kind='development'", [id])).rows[0];
    assert.equal(checked.config.databaseManaged, true);
    assert.equal(checked.verification.deploy.status, 'live');
    assert.ok(checked.checked_at);
    changeDuringVerify = true;
    assert.equal((await post(`${detail}/verify/development`, { csrf })).status, 409);
    const changed = (await query("SELECT * FROM module_builder_environments WHERE project_id=$1 AND kind='development'", [id])).rows[0];
    assert.deepEqual(changed.verification, {});
    assert.equal(changed.checked_at, null);
    assert.equal(changed.config.serviceId, 'srv-new');
    response = await get('/nav-data');
    const nav = await response.json();
    assert.equal(nav.developmentProjects.find((entry) => entry.name === '<Test Module>').url, 'https://created.onrender.com/');
    assert.ok(nav.developmentProjects.find((entry) => entry.name === 'Teacher Planner' && !entry.deployed));
    assert.deepEqual((await (await get('/nav-data', 'Teacher')).json()).developmentProjects, []);
    assert.ok(!(await (await get('/nav-data', 'Teacher')).json()).modules.some((module) => module.path === '/module-builder'));
    response = await post(`${detail}/project`, {
      csrf, name: 'Archived', description: '', repository: 'WHS-DTECH/test-module',
      branch: 'main', deploymentType: 'independent', stage: 'archived'
    });
    assert.equal(response.status, 302);
    assert.ok(!(await (await get('/nav-data')).json()).developmentProjects.some((entry) => entry.name === 'Archived'));
    assert.equal((await query('SELECT * FROM module_builder_operations WHERE project_id=$1', [id])).rows.length, 5);
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    await pool.end();
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.end();
  }
});
