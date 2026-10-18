const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const path = require('path');
const vm = require('vm');
const express = require('express');
const { createBuilderProviders, BuilderError } = require('../src/moduleBuilderProviders');
const { environmentInput, appUrl, repositoryName } = require('../src/moduleBuilder');

const env = {
  MODULE_BUILDER_GITHUB_TOKEN: 'fixture-github-secret',
  MODULE_BUILDER_GITHUB_OWNER: 'WHS-DTECH',
  MODULE_BUILDER_RENDER_API_KEY: 'fixture-render-secret',
  MODULE_BUILDER_RENDER_OWNER_ID: 'tea-fixture',
  DATABASE_URL: 'postgresql://core-production'
};
const project = { slug: 'example-module', repository: 'WHS-DTECH/example-module', branch: 'main', mount_path: '/example-module/', repository_managed: true };
const settings = {
  serviceName: 'example-module-dev', databaseName: 'example-module-dev-db',
  servicePlan: 'free', databasePlan: 'free', region: 'singapore',
  healthPath: '/health', dockerfilePath: './Dockerfile', databaseId: 'dpg-fixture-a'
};
const reply = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

test('wizard accepts metadata, but rejects secret URLs, unsafe links and malformed variable checklists', () => {
  assert.equal(repositoryName('https://github.com/WHS-DTECH/WHS_TeacherPlanner.git'), 'WHS-DTECH/WHS_TeacherPlanner');
  for (const url of ['http://example.onrender.com', 'https://localhost/', 'https://example.onrender.com?token=secret', 'https://user:password@example.onrender.com/', 'javascript:alert(1)']) {
    assert.throws(() => appUrl(url), BuilderError);
  }
  const valid = { ...settings, appUrl: 'https://example.onrender.com', environmentVariables: 'DATABASE_URL | required | Module database' };
  const output = environmentInput(valid);
  assert.equal(output.appUrl, 'https://example.onrender.com/');
  assert.deepEqual(output.environmentVariables, [{ name: 'DATABASE_URL', purpose: 'Module database', required: true }]);
  assert.equal(output.databaseManaged, undefined);
  for (const environmentVariables of ['DATABASE_URL=postgres://user:password@host/db', 'KEY | required | postgresql://secret', 'KEY | required | one\nKEY | optional | two']) {
    assert.throws(() => environmentInput({ ...valid, environmentVariables }), BuilderError);
  }
});

test('GitHub creates a private org repository, never rewrites an existing unrelated repository', async () => {
  const calls = [];
  const providers = createBuilderProviders({ env, fetchImpl: async (url, init) => {
    calls.push({ url, ...init, body: init.body && JSON.parse(init.body) });
    if (init.method === 'GET') return reply({ type: 'Organization' });
    return reply({ full_name: 'WHS-DTECH/example-module', private: true, default_branch: 'main' }, 201);
  } });
  const result = await providers.repository({ slug: project.slug, repository: '' });
  assert.equal(result.repositoryManaged, true);
  assert.equal(calls[0].url, 'https://api.github.com/users/WHS-DTECH');
  assert.equal(calls[1].url, 'https://api.github.com/orgs/WHS-DTECH/repos');
  assert.equal(calls[1].body.private, true);
  assert.equal(calls[1].body.auto_init, true);
  await assert.rejects(providers.repository({ ...project, repository: 'WHS-DTECH/WHS_TeacherPlanner' }), /will not be overwritten/);
  assert.equal(calls.length, 2);
});

test('GitHub personal repositories use the authenticated owner endpoint and remain private', async () => {
  const calls = [];
  const providers = createBuilderProviders({ env, fetchImpl: async (url, init) => {
    calls.push({ url, method: init.method, body: init.body && JSON.parse(init.body) });
    if (url.endsWith('/users/WHS-DTECH')) return reply({ type: 'User' });
    if (url.endsWith('/user')) return reply({ login: 'whs-dtech' });
    return reply({ full_name: 'WHS-DTECH/example-module', private: true, default_branch: 'main' }, 201);
  } });
  assert.equal((await providers.repository({ slug: project.slug, repository: '' })).repositoryManaged, true);
  assert.equal(calls[2].url, 'https://api.github.com/user/repos');
  assert.equal(calls[2].body.private, true);
  assert.equal(calls[2].body.auto_init, true);
});

test('GitHub owner mismatch or unsupported type blocks repository creation before any write', async () => {
  for (const type of ['User', 'Unexpected']) {
    const methods = [];
    const providers = createBuilderProviders({ env, fetchImpl: async (url, init) => {
      methods.push(init.method);
      return reply(url.endsWith('/user') ? { login: 'another-account' } : { type });
    } });
    await assert.rejects(providers.repository({ slug: project.slug, repository: '' }), BuilderError);
    assert.ok(methods.every((method) => method === 'GET'));
  }
});

test('framework installation is a fast-forward commit of bundled source and never overwrites other work', async () => {
  const calls = [];
  const responses = [
    { object: { sha: 'parent' } }, { tree: { sha: 'base-tree' } },
    { tree: [{ path: 'README.md' }] }, { sha: 'new-tree' }, { sha: 'framework' }, {}
  ];
  const providers = createBuilderProviders({ env, fetchImpl: async (url, init) => {
    calls.push({ url, method: init.method, body: init.body && JSON.parse(init.body) });
    return reply(responses.shift());
  } });
  assert.equal((await providers.scaffold(project)).commit, 'framework');
  const files = calls[3].body.tree;
  assert.ok(files.some((file) => file.path === '.github/workflows/ci.yml'));
  assert.ok(files.some((file) => file.path === '.env.example'));
  assert.ok(files.some((file) => file.path === 'db/migrations/001_initial.sql'));
  assert.match(files.find((file) => file.path === 'package.json').content, /node migrate.js && node server.js/);
  assert.ok(files.some((file) => file.path === 'module.json' && file.content.includes('/example-module/')));
  assert.ok(files.every((file) => !file.content.includes(env.MODULE_BUILDER_GITHUB_TOKEN)));
  for (const file of files.filter((file) => file.path.endsWith('.js'))) new vm.Script(file.content);
  assert.equal(calls[5].body.force, false);
  await assert.rejects(providers.scaffold({ ...project, repository_managed: false }), /only for new/);
  const protectedProvider = createBuilderProviders({ env, fetchImpl: async (url) => reply(
    url.includes('/git/ref/') ? { object: { sha: 'parent' } }
      : url.includes('/git/commits/') ? { tree: { sha: 'base' } } : { tree: [{ path: 'src' }] }
  ) });
  await assert.rejects(protectedProvider.scaffold(project), /will not overwrite/);
});

test('Render database requests disable public IP access and autoscaling', async () => {
  let body;
  const providers = createBuilderProviders({ env, fetchImpl: async (url, init) => {
    assert.equal(url, 'https://api.render.com/v1/postgres');
    body = JSON.parse(init.body);
    return reply({ id: 'dpg-fixture-a', status: 'creating' }, 201);
  } });
  assert.equal((await providers.database(project, settings)).databaseId, 'dpg-fixture-a');
  assert.deepEqual(body.ipAllowList, []);
  assert.equal(body.version, '17');
  assert.equal(body.enableDiskAutoscaling, false);
  assert.equal(body.ownerId, 'tea-fixture');
  assert.ok(!JSON.stringify(body).includes('core-production'));
});

test('framework upgrades refuse repositories with application commits and fast-forward untouched frameworks', async () => {
  const projectWithFramework = { ...project, framework_commit: 'parent' };
  let calls = [];
  const responses = [
    { object: { sha: 'parent' } }, { tree: { sha: 'base-tree' } },
    { tree: [{ path: 'server.js' }, { path: 'app.js' }] }, { sha: 'new-tree' }, { sha: 'updated' }, {}
  ];
  const providers = createBuilderProviders({ env, fetchImpl: async (url, init) => {
    calls.push({ url, method: init.method, body: init.body && JSON.parse(init.body) });
    return reply(responses.shift());
  } });
  assert.equal((await providers.upgrade(projectWithFramework)).commit, 'updated');
  assert.equal(calls[5].body.force, false);
  assert.ok(calls[3].body.tree.find((file) => file.path === 'server.js').content.includes('GLOBAL_CONTROL_URL'));
  calls = [];
  const changed = createBuilderProviders({ env, fetchImpl: async (url, init) => {
    calls.push(init.method);
    return reply({ object: { sha: 'application-work' } });
  } });
  await assert.rejects(changed.upgrade(projectWithFramework), /has changed/);
  assert.deepEqual(calls, ['GET']);
});

test('Render web service only receives the separate DB and a fresh secret; later auto-deploys are off', async () => {
  const calls = [];
  const providers = createBuilderProviders({ env, fetchImpl: async (url, init) => {
    calls.push({ url, method: init.method, body: init.body && JSON.parse(init.body) });
    if (url.endsWith('/connection-info')) return reply({ internalConnectionString: 'postgresql://module-development' });
    if (url.includes('/postgres/')) return reply({ owner: { id: 'tea-fixture' }, region: 'singapore' });
    return reply({ service: { id: 'srv-fixture', serviceDetails: { url: 'https://example.onrender.com' } }, deployId: 'dep-fixture' }, 201);
  } });
  const result = await providers.service({ ...project, framework_commit: 'framework' }, settings);
  assert.equal(result.serviceId, 'srv-fixture');
  const body = calls[2].body;
  assert.equal(body.autoDeployTrigger, 'off');
  assert.equal(body.serviceDetails.runtime, 'docker');
  assert.equal(body.serviceDetails.healthCheckPath, '/health');
  assert.equal(body.envVars.find((item) => item.key === 'DATABASE_URL').value, 'postgresql://module-development');
  assert.ok(body.envVars.find((item) => item.key === 'SESSION_SECRET').value.length >= 64);
  for (const secret of Object.values(env)) {
    if (secret.startsWith('fixture-') || secret.startsWith('postgresql://core')) assert.ok(!JSON.stringify(body).includes(secret));
  }
});

test('provider verification retains only allowlisted metadata, never environment values or passwords', async () => {
  const providers = createBuilderProviders({ env, fetchImpl: async (url) => {
    if (url.includes('api.github.com')) return reply({ private: true, default_branch: 'main', secret: 'do-not-store' });
    if (url.includes('/env-vars')) return reply([{ envVar: { key: 'DATABASE_URL', value: 'secret-db-password' }, cursor: 'one' }]);
    if (url.includes('/deploys')) return reply([{ deploy: { status: 'live', commit: { id: 'abc123' } } }]);
    if (url.includes('/postgres/')) return reply({ owner: { id: 'tea-fixture' }, name: 'test', status: 'available', password: 'secret-password' });
    return reply({ ownerId: 'tea-fixture', name: 'example', serviceDetails: { url: 'https://example.onrender.com' } });
  } });
  const result = await providers.verify(project, { ...settings, serviceId: 'srv-fixture' });
  assert.deepEqual(result.environmentVariableNames, ['DATABASE_URL']);
  assert.equal(result.deploy.status, 'live');
  assert.ok(!JSON.stringify(result).includes('secret'));
  await assert.rejects(providers.verify({ repository: '' }, {}), /Record a repository or resource ID/);
});

test('provider failures are explicit, redact response bodies, and mark ambiguous mutations uncertain', async () => {
  const denied = createBuilderProviders({ env, fetchImpl: async () => reply({ error: 'sensitive-echo' }, 401) });
  await assert.rejects(denied.database(project, settings), (error) => error.message.includes('HTTP 401') && !error.message.includes('sensitive') && !error.uncertain);
  const timeout = createBuilderProviders({ env, fetchImpl: async () => { throw new Error('secret-request-content'); } });
  await assert.rejects(timeout.database(project, settings), (error) => error.uncertain && !error.message.includes('secret-request'));
  const missing = createBuilderProviders({ env: {} });
  await assert.rejects(missing.database(project, settings), /workspace ID is not configured/);
});

test('generated module router enforces supplied identity and supports a nested mount', async () => {
  const source = await fs.readFile(path.join(__dirname, '..', 'module-templates', 'node', 'app.js.template'), 'utf8');
  const exported = { exports: {} };
  vm.runInNewContext(source.replaceAll('__MODULE_SLUG__', 'test-module'), { require, module: exported, process });
  let user;
  const app = express();
  app.use((req, res, next) => { req.user = user; next(); });
  app.use('/test-module/', exported.exports.createModuleRouter());
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const url = `http://127.0.0.1:${server.address().port}/test-module/`;
    assert.equal((await fetch(url)).status, 401);
    user = { roles: ['Student'] };
    assert.equal((await fetch(url)).status, 403);
    user = { roles: ['Teacher'] };
    assert.equal((await fetch(url)).status, 200);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
