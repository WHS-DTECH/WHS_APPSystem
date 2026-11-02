const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const express = require('express');
const session = require('express-session');
const { Pool } = require('pg');
const { newAppInput, newAppApproval, setupFingerprint, nextSetupAction } = require('../src/newDevelopmentApp');
const { createBuilderProviders, BuilderError } = require('../src/moduleBuilderProviders');
const { createModuleBuilderRouter } = require('../src/moduleBuilder');

const configuration = { githubOwner: 'WHS-DTECH', githubConfigured: true, renderConfigured: true,
  renderOwnerId: 'tea-test', renderEnvGroupId: 'evg-test' };
const env = { MODULE_BUILDER_GITHUB_OWNER: 'WHS-DTECH', MODULE_BUILDER_GITHUB_TOKEN: 'test-token',
  MODULE_BUILDER_RENDER_API_KEY: 'test-render-token', MODULE_BUILDER_RENDER_OWNER_ID: 'tea-test',
  MODULE_BUILDER_RENDER_ENV_GROUP_ID: 'evg-test' };
const settings = { region: 'oregon', servicePlan: '0.5c-512mb', databasePlan: '0.1c-256mb',
  serviceName: 'equipment-development', databaseName: 'equipment-development-db',
  healthPath: '/health', dockerfilePath: './Dockerfile', databaseId: 'dpg-test-a', databaseManaged: true };
const project = { name: 'Equipment', slug: 'equipment', description: 'Develop equipment booking.',
  branch: 'main', repository: 'WHS-DTECH/equipment', repository_managed: true, framework_commit: 'starter',
  mount_path: '/equipment/', deployment_type: 'independent' };
const reply = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
const group = { ownerId: 'tea-test', envVars: [{ key: 'GLOBAL_CONTROL_URL', value: 'https://core.example.test' }],
  secretFiles: [], serviceLinks: [{ id: 'srv-test' }] };

test('guided input is bounded, deduplicates testers, generates safe keys and binds approval to the plan', () => {
  const tester = crypto.randomUUID();
  const input = newAppInput({ name: '  Workshop Equipment! ', description: 'Book tools.\nTrack returns.', testers: [tester, tester] });
  assert.equal(input.slug, 'workshop-equipment');
  assert.deepEqual(input.testers, [tester]);
  assert.deepEqual(newAppInput({ name: 'Café App', description: 'Develop an app' }).testers, []);
  for (const bad of [{ name: '12' }, { name: 'A' }, { name: '<>' }, { description: 'postgresql://password' }, { testers: {} }]) {
    assert.throws(() => newAppInput({ name: 'Valid App', description: 'Valid purpose', ...bad }), BuilderError);
  }
  assert.notEqual(newAppApproval(input, configuration), newAppApproval({ ...input, testers: [] }, configuration));
  assert.notEqual(newAppApproval(input, configuration), newAppApproval(input, { ...configuration, renderOwnerId: 'other' }));
  const fingerprint = setupFingerprint(project, settings, configuration);
  assert.equal(fingerprint, setupFingerprint({ ...project, revision: 10, framework_commit: 'installed' }, { ...settings, serviceId: 'srv-new' }, configuration));
  assert.notEqual(fingerprint, setupFingerprint(project, { ...settings, region: 'singapore' }, configuration));
  assert.notEqual(fingerprint, setupFingerprint({ ...project, branch: 'other' }, settings, configuration));
  assert.equal(nextSetupAction({ ...project, repository: '' }, settings), 'repository');
  assert.equal(nextSetupAction({ ...project, framework_commit: null }, settings), 'scaffold');
  assert.equal(nextSetupAction(project, { ...settings, databaseId: '' }), 'database');
  assert.equal(nextSetupAction(project, settings), 'service');
  assert.equal(nextSetupAction(project, { ...settings, serviceId: 'srv-test' }), null);
  assert.throws(() => nextSetupAction({ ...project, repository_managed: false }, settings), BuilderError);
  assert.throws(() => nextSetupAction(project, { ...settings, databaseManaged: false }), BuilderError);
});

test('guided preflight verifies credentials/owner and safe group using only read operations', async () => {
  for (const mismatch of [false, true]) {
    const calls = [];
    const providers = createBuilderProviders({ env, fetchImpl: async (url, init) => {
      calls.push(init.method);
      if (url.endsWith('/users/WHS-DTECH')) return reply({ type: 'User' });
      if (url.endsWith('/user')) return reply({ login: mismatch ? 'other' : 'WHS-DTECH' });
      return reply(group);
    } });
    if (mismatch) await assert.rejects(providers.preflight(), /does not match/);
    else assert.deepEqual(await providers.preflight(), { checked: true });
    assert.ok(calls.every(method => method === 'GET'));
  }
});

test('missing group ID discovers one exact named workspace group, never creates one or chooses ambiguous results', async () => {
  const matching = { id: 'evg-test', name: 'WIZARD-Global-CONTROL', ownerId: 'tea-test' };
  for (const configuredId of ['', 'evg-...']) {
    for (const inventory of [[matching], [], [matching, { ...matching, id: 'evg-other' }],
      [{ ...matching, ownerId: 'tea-other' }], [{ ...matching, name: 'Core secrets' }]]) {
      const calls = [];
      const providers = createBuilderProviders({ env: { ...env, MODULE_BUILDER_RENDER_ENV_GROUP_ID: configuredId },
        fetchImpl: async (url, init) => {
          calls.push(init.method);
          if (url.endsWith('/users/WHS-DTECH')) return reply({ type: 'User' });
          if (url.endsWith('/user')) return reply({ login: 'WHS-DTECH' });
          if (url.includes('/env-groups?')) {
            assert.equal(new URL(url).searchParams.get('ownerId'), 'tea-test');
            assert.equal(new URL(url).searchParams.get('name'), 'WIZARD-Global-CONTROL');
            return reply(inventory);
          }
          return reply(group);
        } });
      if (inventory.length === 1 && inventory[0] === matching) {
        await providers.preflight();
        assert.equal(providers.configuration().renderEnvGroupId, 'evg-test');
      } else await assert.rejects(providers.preflight(), /module-safe WIZARD-Global-CONTROL/);
      assert.ok(calls.every(method => method === 'GET'));
    }
  }
});

test('guided readiness waits, rejects failed/mismatched resources, and checks only provider default health without credentials', async () => {
  let databaseStatus = 'creating', deploymentStatus = 'build_in_progress', serviceOrigin = 'https://equipment.onrender.com';
  let databaseRegion = 'oregon', health = { status: 'ok', database: 'connected' }, linked = true, commit = 'starter';
  const calls = [];
  const providers = createBuilderProviders({ env, fetchImpl: async (url, init) => {
    calls.push({ url, init });
    if (url.includes('/postgres/')) return reply({ owner: { id: 'tea-test' }, region: databaseRegion, plan: '0.1c-256mb', status: databaseStatus });
    if (url.includes('/deploys?')) return reply([{ deploy: { id: 'dep-test', status: deploymentStatus, commit: { id: commit } } }]);
    if (url.includes('/env-groups/')) return reply({ ...group, serviceLinks: linked ? group.serviceLinks : [] });
    if (url.includes('api.render.com')) return reply({ type: 'web_service', ownerId: 'tea-test',
      repo: 'https://github.com/WHS-DTECH/equipment', branch: 'main',
      serviceDetails: { region: 'oregon', plan: '0.5c-512mb', url: serviceOrigin } });
    assert.equal(url, 'https://equipment.onrender.com/health');
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers, undefined);
    return reply(health);
  } });
  assert.equal((await providers.setupStatus(project, settings)).state, 'waiting');
  assert.equal(calls.length, 1);
  databaseStatus = 'available';
  assert.equal((await providers.setupStatus(project, settings)).state, 'database-ready');
  const connected = { ...settings, serviceId: 'srv-test' };
  assert.equal((await providers.setupStatus(project, connected)).state, 'waiting');
  deploymentStatus = 'build_failed';
  await assert.rejects(providers.setupStatus(project, connected), /build_failed/);
  deploymentStatus = 'live';
  assert.equal((await providers.setupStatus(project, connected)).state, 'ready');
  serviceOrigin = 'https://localhost';
  await assert.rejects(providers.setupStatus(project, connected), /default HTTPS/);
  serviceOrigin = 'https://equipment.onrender.com';
  linked = false;
  await assert.rejects(providers.setupStatus(project, connected), /group link/);
  linked = true;
  health = { status: 'ok', database: 'unknown' };
  await assert.rejects(providers.setupStatus(project, connected), /database connectivity/);
  health = { status: 'ok', database: 'connected' };
  commit = 'app-work';
  await assert.rejects(providers.setupStatus(project, connected), /will not replace your code/);
  databaseRegion = 'singapore';
  await assert.rejects(providers.setupStatus(project, connected), /database no longer matches/);
  assert.ok(calls.every(call => !call.init.method || call.init.method === 'GET'));
});

test('guided routes persist approvals, serialize/resume steps, wait safely, grant only selected app access and block uncertain retries', {
  skip: !process.env.MODULE_BUILDER_TEST_DATABASE_URL
}, async () => {
  const schema = 'guided_' + crypto.randomUUID().replaceAll('-', '');
  const admin = new Pool({ connectionString: process.env.MODULE_BUILDER_TEST_DATABASE_URL, ssl: false });
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const url = new URL(process.env.MODULE_BUILDER_TEST_DATABASE_URL);
  url.searchParams.set('options', `-c search_path=${schema},public`);
  const pool = new Pool({ connectionString: url.toString(), ssl: false });
  const query = (sql, values) => pool.query(sql, values);
  let server;
  try {
    for (const file of ['001_init.sql', '002_roles_and_module_assignments.sql', '005_technology_hub.sql',
      '006_sewing_hub.sql', '007_hub_roles_and_permissions.sql',
      '016_hub_roles_base.sql', '018_student_apps.sql', '026_module_builder.sql', '027_module_identity.sql',
      '031_standard_teaching_module_roles.sql', '041_infrastructure_costs.sql', '042_new_development_app.sql']) {
      await query(await fs.readFile(path.join(__dirname, '..', 'migrations', file), 'utf8'));
    }
    const users = (await query(`INSERT INTO users(email,display_name) VALUES
      ('admin@example.test','Admin'),('tester@example.test','Tester'),('other@example.test','Unselected') RETURNING *`)).rows;
    const [user, tester] = users;
    let databaseReady = false, deploymentReady = false, scaffoldFails = true, databaseUncertain = false, groupConfigured = true;
    let repositoryEntered, releaseRepository;
    const entered = new Promise(resolve => { repositoryEntered = resolve; });
    const released = new Promise(resolve => { releaseRepository = resolve; });
    const calls = [];
    const providers = {
      configuration: () => ({ ...configuration, renderEnvGroupId: groupConfigured ? configuration.renderEnvGroupId : '' }),
      preflight: async () => { groupConfigured = true; },
      repository: async p => { calls.push('repository'); repositoryEntered(); await released; return { repository: 'WHS-DTECH/' + p.slug, branch: 'default-branch' }; },
      scaffold: async () => { calls.push('scaffold'); if (scaffoldFails) throw new BuilderError('Fixture permission denied.', 403); return { commit: 'starter' }; },
      database: async () => { calls.push('database'); if (databaseUncertain) throw new BuilderError('Inspect ambiguous fixture result.', 502, true); return { databaseId: 'dpg-test-a' }; },
      service: async (p, s, checkpoint) => { calls.push('service'); const result = { serviceId: 'srv-test', appUrl: 'https://equipment.onrender.com' }; await checkpoint(result); return result; },
      setupStatus: async (p, s) => ({ state: !databaseReady ? 'waiting' : !s.serviceId ? 'database-ready' : !deploymentReady ? 'waiting' : 'ready', message: 'Fixture status.' })
    };
    const app = express();
    app.set('view engine', 'ejs'); app.set('views', path.join(__dirname, '..', 'views'));
    app.use(express.urlencoded({ extended: false }));
    app.use(session({ secret: 'isolated-guided-tests', resave: false, saveUninitialized: false }));
    app.use((req, res, next) => {
      req.user = { ...user, roles: [req.get('x-role') || 'ADMIN'] };
      res.locals.activeRole = req.user.roles[0];
      next();
    });
    app.use('/module-builder', createModuleBuilderRouter({ dbQuery: query, providers }));
    app.use((error, req, res, next) => { console.error(error); res.status(500).send('Test request failed.'); });
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}/module-builder`;
    let cookie;
    const get = (route, role = 'ADMIN') => fetch(base + route, { headers: { 'x-role': role, ...(cookie ? { cookie } : {}) }, redirect: 'manual' });
    const post = (route, body) => fetch(base + route, { method: 'POST', redirect: 'manual', headers: { cookie, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body) });
    assert.equal((await get('/new', 'Teacher')).status, 403);
    let response = await get('/new');
    cookie = response.headers.get('set-cookie').split(';')[0];
    const csrf = (await response.text()).match(/name="csrf" value="([^"]+)"/)[1];
    assert.equal((await post('/new/review', { name: 'Equipment', description: 'Develop bookings.' })).status, 403);
    assert.equal((await post('/new/create', { csrf, consent: 'yes', confirm: 'equipment' })).status, 409);
    const register = async name => {
      const review = await post('/new/review', { csrf, name, description: 'Develop bookings.', testers: tester.id });
      assert.equal(review.status, 200);
      const html = await review.text();
      assert.match(html, /USD 13\/month minimum/);
      const approval = html.match(/name="approval" value="([^"]+)"/)[1];
      assert.equal((await post('/new/create', { csrf, approval, confirm: 'wrong', consent: 'yes' })).status, 409);
      assert.equal((await post('/new/create', { csrf, approval, confirm: name.toLowerCase() })).status, 409);
      const created = await post('/new/create', { csrf, approval, confirm: name.toLowerCase(), consent: 'yes' });
      assert.equal(created.status, 302);
      assert.equal((await post('/new/create', { csrf, approval, confirm: name.toLowerCase(), consent: 'yes' })).status, 409);
      return created.headers.get('location').split('/')[2];
    };
    const id = await register('Equipment');
    assert.deepEqual(calls, []);
    assert.equal((await get(`/${id}/setup`)).status, 200);
    assert.equal((await post('/new/review', { csrf, name: 'Equipment', description: 'Existing name.' })).status, 409);
    assert.equal((await post(`/${id}/setup/step`, {})).status, 403);
    await query('UPDATE users SET is_active=false WHERE id=$1', [tester.id]);
    assert.equal((await post(`/${id}/setup/step`, { csrf })).status, 409);
    assert.deepEqual(calls, []);
    await query('UPDATE users SET is_active=true WHERE id=$1', [tester.id]);
    const step = () => post(`/${id}/setup/step`, { csrf });
    const firstStep = step();
    await entered;
    const overlappingStep = await step();
    releaseRepository();
    assert.equal(overlappingStep.status, 409);
    assert.equal((await firstStep).status, 200);
    assert.equal(calls.filter(action => action === 'repository').length, 1);
    groupConfigured = false;
    assert.equal((await step()).status, 502);
    assert.equal(groupConfigured, true);
    assert.equal((await query('SELECT active_operation FROM module_builder_projects WHERE id=$1', [id])).rows[0].active_operation, null);
    scaffoldFails = false;
    assert.equal((await step()).status, 200);
    assert.equal((await step()).status, 200);
    assert.equal((await (await step()).json()).state, 'waiting');
    assert.equal(calls.filter(action => action === 'database').length, 1);
    assert.equal(calls.includes('service'), false);
    databaseReady = true;
    assert.equal((await step()).status, 200);
    assert.equal((await (await step()).json()).state, 'waiting');
    assert.equal(calls.filter(action => action === 'service').length, 1);
    assert.equal((await query('SELECT * FROM user_hub_roles')).rows.length, 0);
    deploymentReady = true;
    assert.equal((await (await step()).json()).state, 'ready');
    const grants = (await query(`SELECT u.user_id,r.hub_key,r.role_key FROM user_hub_roles u JOIN hub_roles r ON r.id=u.hub_role_id`)).rows;
    assert.deepEqual(grants, [{ user_id: tester.id, hub_key: 'equipment', role_key: 'teacher' }]);
    assert.equal((await query('SELECT * FROM user_roles')).rows.length, 0);
    await query('DELETE FROM user_hub_roles WHERE user_id=$1', [tester.id]);
    await step();
    assert.equal((await query('SELECT * FROM user_hub_roles')).rows.length, 0);
    await query(`UPDATE module_builder_environments SET config=config || '{"region":"singapore"}'::jsonb WHERE project_id=$1 AND kind='development'`, [id]);
    assert.equal((await step()).status, 409);
    const uncertainId = await register('Ambiguous');
    const uncertainStep = () => post(`/${uncertainId}/setup/step`, { csrf });
    await uncertainStep(); await uncertainStep();
    databaseUncertain = true;
    assert.equal((await uncertainStep()).status, 502);
    assert.equal((await uncertainStep()).status, 409);
    assert.equal(calls.filter(action => action === 'database').length, 2);
    assert.equal((await query(`SELECT status FROM module_builder_operations WHERE project_id=$1 AND kind='database'`, [uncertainId])).rows[0].status, 'uncertain');
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await pool.end(); await admin.query(`DROP SCHEMA "${schema}" CASCADE`); await admin.end();
  }
});
