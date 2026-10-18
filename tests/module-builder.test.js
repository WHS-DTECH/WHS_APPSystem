const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const path = require('path');
const vm = require('vm');
const express = require('express');
const ejs = require('ejs');
const { createBuilderProviders, BuilderError } = require('../src/moduleBuilderProviders');
const { environmentInput, appUrl, repositoryName } = require('../src/moduleBuilder');

test('wizard shows one framework-services card between Development and Staging without claiming live verification', async () => {
  const kinds = ['development', 'staging', 'production'];
  const html = await ejs.renderFile(path.join(__dirname, '..', 'views', 'module-builder', 'detail.ejs'), {
    title: 'Example Module', activeRole: 'ADMIN', csrf: 'fixture',
    project: { ...project, id: 'fixture', name: 'Example Module', stage: 'development', description: '' },
    configuration: {}, actions: {}, history: [], kinds, stages: [], regions: [], servicePlans: [], databasePlans: [],
    environments: kinds.map((kind) => ({kind, config: {}}))
  });
  const development = html.indexOf('<strong>DEVELOPMENT</strong>');
  const services = html.indexOf('id="mb-framework-services-title"');
  const staging = html.indexOf('<strong>STAGING</strong>');
  assert.ok(development >= 0 && development < services && services < staging);
  assert.equal((html.match(/id="mb-framework-services-title"/g) || []).length, 1);
  for (const label of ['Google sign-in and avatar', 'Roles and permissions', 'Site search', 'Integrated Google email', 'Shared branding and footer']) {
    assert.ok(html.includes(`<dt>${label}</dt>`));
  }
  assert.match(html, /Development access is global ADMIN only/);
  assert.match(html, /until module-specific search is implemented/);
  assert.match(html, /tech@westlandhigh.school.nz/);
  assert.match(html, /Framework reference, not a live service check/);
  assert.match(html, /Older modules need a framework update and manual deployment/);
});

const env = {
  MODULE_BUILDER_GITHUB_TOKEN: 'fixture-github-secret',
  MODULE_BUILDER_GITHUB_OWNER: 'WHS-DTECH',
  MODULE_BUILDER_RENDER_API_KEY: 'fixture-render-secret',
  MODULE_BUILDER_RENDER_OWNER_ID: 'tea-fixture',
  MODULE_BUILDER_RENDER_ENV_GROUP_ID: 'evg-fixture',
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
    { tree: [{ path: 'README.md' }] }, { sha: 'logo-blob' }, { sha: 'new-tree' }, { sha: 'framework' }, {}
  ];
  const providers = createBuilderProviders({ env, fetchImpl: async (url, init) => {
    calls.push({ url, method: init.method, body: init.body && JSON.parse(init.body) });
    return reply(responses.shift());
  } });
  assert.equal((await providers.scaffold(project)).commit, 'framework');
  const files = calls[4].body.tree;
  assert.ok(files.some((file)=>file.path === 'public/whs-logo.png' && file.sha === 'logo-blob'));
  assert.equal(calls[3].body.encoding, 'base64');
  assert.ok(files.some((file) => file.path === '.github/workflows/ci.yml'));
  assert.ok(files.some((file) => file.path === '.env.example'));
  for (const name of ['global-nav.js', 'account-controls.css', 'module-shell.css']) {
    assert.ok(files.some((file) => file.path === 'public/' + name));
  }
  assert.ok(files.find((file) => file.path === 'shell.js').content.includes('Last Updated:'));
  assert.ok(!files.find((file) => file.path === 'shell.js').content.includes('__FRAMEWORK_UPDATED_AT__'));
  assert.ok(files.some((file) => file.path === 'db/migrations/001_initial.sql'));
  assert.match(files.find((file) => file.path === 'package.json').content, /node migrate.js && node server.js/);
  assert.ok(files.some((file) => file.path === 'module.json' && file.content.includes('/example-module/')));
  assert.ok(files.every((file) => !file.content?.includes(env.MODULE_BUILDER_GITHUB_TOKEN)));
  for (const file of files.filter((file) => file.path.endsWith('.js'))) new vm.Script(file.content);
  assert.equal(calls[6].body.force, false);
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
    { tree: [{ path: 'server.js' }, { path: 'app.js' }] }, {sha:'logo-blob'}, { sha: 'new-tree' }, { sha: 'updated' }, {}
  ];
  const providers = createBuilderProviders({ env, fetchImpl: async (url, init) => {
    calls.push({ url, method: init.method, body: init.body && JSON.parse(init.body) });
    return reply(responses.shift());
  } });
  assert.equal((await providers.upgrade(projectWithFramework)).commit, 'updated');
  assert.equal(calls[6].body.force, false);
  assert.ok(calls[4].body.tree.find((file) => file.path === 'server.js').content.includes('GLOBAL_CONTROL_URL'));
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
  let checkpointed = false;
  const providers = createBuilderProviders({ env, fetchImpl: async (url, init) => {
    calls.push({ url, method: init.method, body: init.body && JSON.parse(init.body) });
    if (url.endsWith('/services/srv-fixture')) {
      assert.equal(checkpointed, true);
      return reply({ serviceLinks: [{ id: 'srv-fixture' }] });
    }
    if (url.endsWith('/env-groups/evg-fixture')) return reply({
      ownerId: 'tea-fixture', envVars: [{ key: 'GLOBAL_CONTROL_URL', value: 'https://core.example.test' }], secretFiles: []
    });
    if (url.endsWith('/connection-info')) return reply({ internalConnectionString: 'postgresql://module-development' });
    if (url.includes('/postgres/')) return reply({ owner: { id: 'tea-fixture' }, region: 'singapore' });
    return reply({ service: { id: 'srv-fixture', serviceDetails: { url: 'https://example.onrender.com' } }, deployId: 'dep-fixture' }, 201);
  } });
  const result = await providers.service({ ...project, framework_commit: 'framework' }, settings, async (created) => {
    assert.equal(created.serviceId, 'srv-fixture');
    checkpointed = true;
  });
  assert.equal(result.serviceId, 'srv-fixture');
  assert.equal(result.sharedEnvGroupId, 'evg-fixture');
  assert.equal(calls[4].url, 'https://api.render.com/v1/env-groups/evg-fixture/services/srv-fixture');
  const body = calls[3].body;
  assert.equal(body.autoDeployTrigger, 'off');
  assert.equal(body.serviceDetails.runtime, 'docker');
  assert.equal(body.serviceDetails.healthCheckPath, '/health');
  assert.equal(body.envVars.find((item) => item.key === 'DATABASE_URL').value, 'postgresql://module-development');
  assert.ok(body.envVars.find((item) => item.key === 'SESSION_SECRET').value.length >= 64);
  for (const secret of Object.values(env)) {
    if (secret.startsWith('fixture-') || secret.startsWith('postgresql://core')) assert.ok(!JSON.stringify(body).includes(secret));
  }
});

test('unsafe or missing shared group blocks service creation before any write', async () => {
  const valid = { ownerId: 'tea-fixture', envVars: [{key:'GLOBAL_CONTROL_URL',value:'https://core.example.test'}], secretFiles: [] };
  for (const group of [
    {...valid, ownerId:'tea-other'}, {...valid, secretFiles:[{name:'secret'}]},
    {...valid, envVars:[...valid.envVars,{key:'SESSION_SECRET',value:'never-copy'}]},
    {...valid, envVars:[{key:'GLOBAL_CONTROL_URL',value:'http://core.example.test'}]}
  ]) {
    const methods = [];
    const providers = createBuilderProviders({env, fetchImpl:async (url,init)=>{methods.push(init.method);return reply(group);}});
    await assert.rejects(providers.service({...project,framework_commit:'framework'},settings),BuilderError);
    assert.deepEqual(methods,['GET']);
  }
  const providers = createBuilderProviders({env:{...env,MODULE_BUILDER_RENDER_ENV_GROUP_ID:''}});
  await assert.rejects(providers.service({...project,framework_commit:'framework'},settings),/MODULE_BUILDER_RENDER_ENV_GROUP_ID/);
});

test('failed group linking preserves the created service checkpoint and reports uncertain outcome', async () => {
  let recorded;
  const providers = createBuilderProviders({env,fetchImpl:async(url)=>{
    if(url.endsWith('/env-groups/evg-fixture'))return reply({ownerId:'tea-fixture',envVars:[{key:'GLOBAL_CONTROL_URL',value:'https://core.example.test'}],secretFiles:[]});
    if(url.endsWith('/connection-info'))return reply({internalConnectionString:'postgresql://separate'});
    if(url.includes('/postgres/'))return reply({owner:{id:'tea-fixture'},region:'singapore'});
    if(url.endsWith('/services'))return reply({service:{id:'srv-created',serviceDetails:{url:'https://created.onrender.com'}}});
    return reply({},500);
  }});
  await assert.rejects(providers.service({...project,framework_commit:'framework'},settings,async(created)=>{recorded=created;}),
    (error)=>error.uncertain && /Do not create another service/.test(error.message));
  assert.equal(recorded.serviceId,'srv-created');
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
  const shellModule = { exports: {} };
  const shellSource = (await fs.readFile(path.join(__dirname, '..', 'module-templates', 'node', 'shell.js.template'), 'utf8'))
    .replaceAll('__MODULE_SLUG__', 'test-module').replaceAll('__FRAMEWORK_UPDATED_AT__', '2026-10-18T02:00:00.000Z');
  vm.runInNewContext(shellSource, { module: shellModule, Intl, Date });
  const later = shellModule.exports.renderShell({
    baseUrl: '/', coreUrl: 'https://core.example.test/"<test>', standalone: true,
    now: new Date('2026-10-31T12:00:00.000Z')
  });
  assert.match(later, /&copy; November 2026/);
  assert.match(later, /18 October 2026/);
  assert.match(later, /datetime="2026-10-18T02:00:00.000Z"/);
  assert.ok(later.includes('https://core.example.test/&quot;&lt;test&gt;'));
  const standalone = shellModule.exports.renderShell({baseUrl:'/',coreUrl:'https://core.example.test',standalone:true});
  assert.match(standalone, /href="https:\/\/core.example.test\/contact">Contact Web Master<\/a>/);
  assert.ok(!standalone.includes('target="_blank"'));
  vm.runInNewContext(source.replaceAll('__MODULE_SLUG__', 'test-module'), {
    require: (name) => name === './shell' ? shellModule.exports : require(name),
    module: exported, process, __dirname
  });
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
    const response = await fetch(url);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /Westland High School/);
    assert.match(html, /18 October 2026/);
    assert.match(html, /href="\/test-module\/framework\/module-shell.css"/);
    assert.ok(!html.includes('whs-global-control'));
    assert.match(html, /href="\/contact">Contact Web Master<\/a>/);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
