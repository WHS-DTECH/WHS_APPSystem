const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const session = require('express-session');
const {
  createCostProviders, createInfrastructureCostsRouter, costSummary, CostReportError,
  renderServiceCost, renderDatabaseCost, githubAccountCost
} = require('../src/infrastructureCosts');
const { DEVELOPMENT_POLICY, developmentPolicyError } = require('../src/developmentPolicy');
const { createBuilderProviders, BuilderError } = require('../src/moduleBuilderProviders');
const now = () => new Date('2026-11-02T00:00:00Z');
const env = { INFRA_COST_GITHUB_TOKEN: 'synthetic-github-secret', INFRA_COST_RENDER_API_KEY: 'synthetic-render-secret' };
const reply = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
const service = { id: 'srv-one', name: 'Existing app', type: 'web_service', ownerId: 'tea-one',
  suspended: 'not_suspended', serviceDetails: { region: 'oregon', plan: 'starter', numInstances: 2 } };
const database = { id: 'dpg-one', name: 'Existing DB', owner: { id: 'tea-one' }, plan: '0.1c-256mb',
  diskSizeGB: 5, region: 'oregon', highAvailabilityEnabled: false, status: 'available' };

test('cost calculations cover paid/free plans, instances, unknown plans and high availability without invented zeros', () => {
  assert.equal(renderServiceCost(service).monthlyUsd, 14);
  assert.equal(renderServiceCost({ ...service, serviceDetails: { ...service.serviceDetails, plan: '0.5c-512mb' } }).monthlyUsd, 14);
  assert.equal(renderServiceCost({ ...service, serviceDetails: { plan: 'free', numInstances: 1 } }).monthlyUsd, 0);
  assert.equal(renderServiceCost({ ...service, serviceDetails: { plan: 'new-plan', numInstances: 1 } }).monthlyUsd, null);
  assert.equal(renderServiceCost({ ...service, serviceDetails: { plan: 'starter' } }).monthlyUsd, null);
  assert.equal(renderServiceCost({ ...service, type: 'cron_job' }).monthlyUsd, null);
  assert.equal(renderDatabaseCost(database).monthlyUsd, 6);
  assert.equal(renderDatabaseCost(database).storageGb, 5);
  assert.equal(renderDatabaseCost({ ...database, highAvailabilityEnabled: true }).monthlyUsd, null);
  assert.equal(renderDatabaseCost({ ...database, plan: 'unknown-legacy' }).monthlyUsd, null);
});

test('GitHub subscriptions are priced once per account with unknown seats distinct from zero', () => {
  const repositories = [{ owner: 'Example' }, { owner: 'Example' }];
  const account = githubAccountCost({ login: 'Example', type: 'Organization', plan: { name: 'team', filled_seats: 3 } }, repositories);
  assert.equal(account.monthlyUsd, 12);
  assert.equal(account.repositoryCount, 2);
  assert.equal(githubAccountCost({ login: 'Example', type: 'Organization', plan: { name: 'team' } }, []).monthlyUsd, null);
  assert.equal(githubAccountCost({ login: 'Example', type: 'Organization' }, []).monthlyUsd, null);
  assert.equal(githubAccountCost({ login: 'Example', type: 'User', plan: { name: 'pro' } }, []).monthlyUsd, 4);
});

test('Render discovers every accessible workspace, includes replicas, paginates, deduplicates and strips private fields', async () => {
  const calls = [];
  const providers = createCostProviders({ env, now, fetchImpl: async (url, init) => {
    calls.push({ url, init });
    if (url.includes('/services?') && !url.includes('cursor=')) return reply(Array.from({ length: 100 }, (_, i) => ({
      service: { ...service, id: 'srv-' + i, envVars: [{ value: 'do-not-persist' }] }, cursor: 'next-page'
    })));
    if (url.includes('/services?')) return reply([{ service }, { service }]);
    if (url.includes('/postgres?')) return reply([{ postgres: { ...database, password: 'do-not-persist' } }]);
    if (url.includes('/owners?')) return reply([{ owner: { id: 'tea-one', name: 'WHS workspace', email: 'do-not-persist' } }]);
    throw new Error('Unexpected request');
  } });
  const report = await providers.render();
  assert.equal(report.resources.length, 102);
  assert.ok(calls.some(c => c.url.includes('cursor=next-page')));
  assert.ok(calls.some(c => c.url.includes('includeReplicas=true')));
  assert.ok(calls.every(c => c.init.method === 'GET' && !c.url.includes('ownerId=')));
  assert.ok(!JSON.stringify(report).includes('do-not-persist'));
  assert.ok(!JSON.stringify(report).includes('synthetic-'));
  assert.equal(report.workspaces[0].monthlyUsd, null);
});

test('Render malformed and repeated pagination is rejected rather than called complete', async () => {
  for (const body of [{ services: [] }, [{ service: {} }], Array.from({ length: 100 }, () => ({ service }))]) {
    const providers = createCostProviders({ env, now, fetchImpl: async () => reply(body) });
    await assert.rejects(providers.render(), CostReportError);
  }
});

test('GitHub inventories accounts/repositories and separates actual organisation usage from estimated subscriptions', async () => {
  const calls = [];
  const providers = createCostProviders({ env, now, fetchImpl: async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith('/user')) return reply({ login: 'Teacher', type: 'User', plan: { name: 'pro' }, secret: 'do-not-persist' });
    if (url.includes('/user/repos?')) return reply([{ id: 1, full_name: 'School/app', owner: { login: 'School' }, private: true },
      { id: 2, full_name: 'Other/shared', owner: { login: 'Other' }, private: false }]);
    if (url.includes('/user/orgs?')) return reply([{ id: 3, login: 'School' }]);
    if (url.endsWith('/orgs/School')) return reply({ login: 'School', plan: { name: 'team', filled_seats: 2 } });
    if (url.includes('/billing/usage/summary?year=2026&month=11')) return reply({ usageItems: [{ netAmount: 2.5 }, { netAmount: 1 }] });
    throw new Error('Unexpected request: ' + url);
  } });
  const report = await providers.github();
  assert.equal(report.accounts.length, 3);
  const school = report.accounts.find(a => a.login === 'School');
  assert.equal(school.monthlyUsd, 8);
  assert.equal(school.reportedUsageUsd, 3.5);
  assert.equal(school.usagePeriod, '2026-11');
  assert.equal(report.accounts.find(a => a.login === 'Other').monthlyUsd, null);
  assert.ok(!JSON.stringify(report).includes('do-not-persist'));
  assert.ok(calls.every(c => c.init.method === 'GET'));
});

test('GitHub pagination and unavailable billing remain explicit', async () => {
  let pages = 0;
  const providers = createCostProviders({ env, now, fetchImpl: async url => {
    if (url.endsWith('/user')) return reply({ login: 'Teacher', type: 'User' });
    if (url.includes('/user/repos?')) {
      pages++;
      return reply(new URL(url).searchParams.get('page') === '1' ? Array.from({ length: 100 }, (_, i) => ({
        id: i + 1, full_name: 'School/app-' + i, owner: { login: 'School' }
      })) : []);
    }
    if (url.includes('/user/orgs?')) return reply([{ id: 300, login: 'School' }]);
    if (url.endsWith('/orgs/School')) return reply({ login: 'School', type: 'Organization' });
    return reply({ error: 'secret-provider-response' }, 403);
  } });
  const report = await providers.github();
  assert.equal(pages, 2);
  assert.equal(report.repositories.length, 100);
  assert.equal(report.accounts[1].monthlyUsd, null);
  assert.equal(report.accounts[1].reportedUsageUsd, undefined);
  assert.match(report.accounts[1].usageError, /HTTP 403/);
  assert.ok(!JSON.stringify(report).includes('secret-provider-response'));
});

test('missing credentials and provider failures are explicit and never echo secrets', async () => {
  const missing = createCostProviders({ env: {}, now });
  await assert.rejects(missing.render(), /credential is not configured/);
  const providers = createCostProviders({ env, now, fetchImpl: async () => reply({ error: 'secret-response' }, 401) });
  await assert.rejects(providers.github(), error => error instanceof CostReportError && /HTTP 401/.test(error.message) && !error.message.includes('secret-response'));
  const failed = createCostProviders({ env, now, fetchImpl: async () => { throw new Error('secret-password'); } });
  await assert.rejects(failed.render(), error => error instanceof CostReportError && !error.message.includes('secret-password'));
});

test('NZD rate requires valid recent USD data and never sends provider credentials to exchange service', async () => {
  const body = { result: 'success', base_code: 'USD', rates: { NZD: 1.7 }, time_last_update_unix: now().getTime() / 1000 };
  let init;
  const providers = createCostProviders({ env, now, fetchImpl: async (url, options) => { init = options; return reply(body); } });
  assert.equal((await providers.exchange()).rate, 1.7);
  assert.equal(init.headers.Authorization, undefined);
  for (const invalid of [{ ...body, rates: { NZD: '1.7' } }, { ...body, time_last_update_unix: 1 }, { ...body, base_code: 'EUR' }]) {
    await assert.rejects(createCostProviders({ env, now, fetchImpl: async () => reply(invalid) }).exchange(), CostReportError);
  }
});

test('subtotal includes only known estimates and never adds actual usage to full-month estimates', () => {
  assert.equal(costSummary({}).usd, null);
  const summary = costSummary({ render: { data: { resources: [{ monthlyUsd: 7 }, { monthlyUsd: null }], workspaces: [{}] } },
    github: { data: { accounts: [{ monthlyUsd: 4, reportedUsageUsd: 20 }] } } });
  assert.deepEqual(summary, { usd: 11, unknown: 1, known: 2, workspaces: 1 });
});

test('new development policy blocks free/other regions before provider calls and preserves live database plans', async () => {
  assert.equal(developmentPolicyError(DEVELOPMENT_POLICY), '');
  const env = { MODULE_BUILDER_RENDER_OWNER_ID: 'tea-example', MODULE_BUILDER_RENDER_API_KEY: 'synthetic',
    MODULE_BUILDER_RENDER_ENV_GROUP_ID: 'evg-example' };
  let calls = 0;
  const providers = createBuilderProviders({ env, fetchImpl: async () => { calls++; throw new Error('Must not call'); } });
  for (const settings of [{ ...DEVELOPMENT_POLICY, region: 'singapore' }, { ...DEVELOPMENT_POLICY, servicePlan: 'free' },
    { ...DEVELOPMENT_POLICY, databasePlan: 'free' }]) {
    assert.ok(developmentPolicyError(settings));
    await assert.rejects(providers.database({}, settings), BuilderError);
    await assert.rejects(providers.service({}, settings), BuilderError);
  }
  assert.equal(calls, 0);
  const migration = fs.readFileSync(path.join(__dirname, '..', 'migrations', '041_infrastructure_costs.sql'), 'utf8');
  assert.match(migration, /BEFORE INSERT ON module_builder_environments/);
  assert.doesNotMatch(migration, /UPDATE module_builder_environments/i);
});

test('new database uses the lowest paid Oregon tier and service refuses an actual free database without mutating it', async () => {
  const env = { MODULE_BUILDER_RENDER_OWNER_ID: 'tea-example', MODULE_BUILDER_RENDER_API_KEY: 'synthetic',
    MODULE_BUILDER_RENDER_ENV_GROUP_ID: 'evg-example' };
  const requests = [];
  const settings = { ...DEVELOPMENT_POLICY, databaseName: 'example-db', databaseId: 'dpg-example' };
  const providers = createBuilderProviders({ env, fetchImpl: async (url, init) => {
    requests.push({ url, ...init });
    if (url.endsWith('/postgres')) {
      const body = JSON.parse(init.body);
      assert.equal(body.region, 'oregon'); assert.equal(body.plan, '0.1c-256mb');
      return reply({ id: 'dpg-example', status: 'creating' });
    }
    if (url.endsWith('/env-groups/evg-example')) return reply({
      ownerId: 'tea-example', envVars: [{ key: 'GLOBAL_CONTROL_URL', value: 'https://core.example.test' }], secretFiles: []
    });
    if (url.endsWith('/postgres/dpg-example')) return reply({ owner: { id: 'tea-example' }, region: 'oregon', plan: 'free' });
    throw new Error('Must not request a connection or create a service');
  } });
  assert.equal((await providers.database({}, settings)).databaseId, 'dpg-example');
  requests.length = 0;
  await assert.rejects(providers.service({ repository: 'School/example' }, settings), /lowest paid plan/);
  assert.equal(requests.length, 2);
  assert.ok(requests.every(request => request.method === 'GET'));
});

test('cost report enforces admin/CSRF, persists snapshots, labels stale data and escapes provider names', async t => {
  let stored, writes = 0, fail = false;
  const dbQuery = async (sql, params) => {
    if (sql.startsWith('SELECT')) return { rows: stored ? [{ snapshot: stored }] : [] };
    writes++; stored = JSON.parse(params[0]); return { rows: [] };
  };
  const providers = {
    render: async () => {
      if (fail) throw new CostReportError('Render reporting returned HTTP 403.');
      return { checkedAt: now().toISOString(), warning: 'Compute only', resources: [
        renderServiceCost({ ...service, name: '<script>unsafe</script>' }), renderDatabaseCost(database)
      ], workspaces: [{ id: 'tea-one', name: 'School' }] };
    },
    github: async () => ({ checkedAt: now().toISOString(), accounts: [], repositories: [], warning: 'Not an invoice' }),
    exchange: async () => {
      if (fail) throw new CostReportError('NZD rate unavailable.');
      return { rate: 1.7, updatedAt: now().toISOString(), checkedAt: now().toISOString() };
    }
  };
  const app = express();
  app.set('views', path.join(__dirname, '..', 'views')); app.set('view engine', 'ejs');
  app.use(express.urlencoded({ extended: false }));
  app.use(session({ secret: 'synthetic-cost-test-secret', resave: false, saveUninitialized: false }));
  app.use((req, res, next) => {
    req.user = req.get('x-role') ? { id: 'synthetic-admin', roles: [req.get('x-role')] } : null;
    res.locals.user = req.user; res.locals.activeRole = req.get('x-role'); res.locals.title = 'Test'; next();
  });
  app.use('/admin/infrastructure-costs', createInfrastructureCostsRouter({ dbQuery, providers, now }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/admin/infrastructure-costs`;
  assert.equal((await fetch(base)).status, 403);
  assert.equal((await fetch(base, { headers: { 'x-role': 'Teacher' } })).status, 403);
  const initial = await fetch(base, { headers: { 'x-role': 'ADMIN' } });
  assert.equal(initial.status, 200);
  assert.equal(initial.headers.get('cache-control'), 'no-store');
  const cookie = initial.headers.get('set-cookie').split(';')[0];
  const html = await initial.text();
  assert.match(html, /Not checked yet/);
  const csrf = html.match(/name="csrf" value="([^"]+)"/)[1];
  const headers = { 'x-role': 'ADMIN', cookie, 'Content-Type': 'application/x-www-form-urlencoded' };
  assert.equal((await fetch(base + '/refresh', { method: 'POST', headers, body: 'csrf=invalid' })).status, 403);
  assert.equal(writes, 0);
  let response = await fetch(base + '/refresh', { method: 'POST', headers, body: new URLSearchParams({ csrf }), redirect: 'manual' });
  assert.equal(response.status, 302); assert.equal(writes, 1);
  let report = await (await fetch(base, { headers })).text();
  assert.match(report, /USD 20.00/); assert.match(report, /NZD 34.00/);
  assert.match(report, /&lt;script&gt;unsafe&lt;\/script&gt;/);
  assert.doesNotMatch(report, /<script>unsafe<\/script>/);
  fail = true;
  response = await fetch(base + '/refresh', { method: 'POST', headers, body: new URLSearchParams({ csrf }), redirect: 'manual' });
  assert.equal(response.status, 302);
  assert.equal(stored.render.data.resources[0].monthlyUsd, 14);
  report = await (await fetch(base, { headers })).text();
  assert.match(report, /showing stale data/); assert.match(report, /NZD conversion unavailable/);
  assert.match(report, /USD 20.00/); assert.doesNotMatch(report, /NZD 34.00/);
});
