const crypto = require('crypto');
const express = require('express');
const { query } = require('./db');

const PRICE_CHECKED = '2026-11-02';
const SOURCES = { render: 'https://render.com/pricing', github: 'https://github.com/pricing',
  exchange: 'https://www.exchangerate-api.com' };
const SERVICE_PRICES = { free: 0, starter: 7, '0.5c-512mb': 7, standard: 25, '1c-2g': 25,
  '2c-4g': 85, '2c-8g': 135, '2c-16g': 200, '4c-8g': 175, '4c-16g': 225, '4c-32g': 350,
  '8c-16g': 300, '8c-32g': 450, '8c-64g': 1000, '12c-24g': 450, '12c-48g': 800, '12c-96g': 1500 };
const DATABASE_PRICES = { free: 0, basic_256mb: 6, '0.1c-256mb': 6, '0.5c-1g': 19,
  '1c-2g': 40, '1c-4g': 55, '2c-4g': 75, '2c-8g': 100, '2c-16g': 160,
  '4c-16g': 200, '4c-32g': 350, '8c-32g': 400, '8c-64g': 750, '16c-64g': 800,
  '16c-128g': 1500, '32c-128g': 1700, '32c-256g': 2500 };
const positiveInteger = value => Number.isInteger(value) && value > 0;
const label = value => typeof value === 'string' ? value.slice(0, 200) : 'Unknown';

class CostReportError extends Error {}

function renderServiceCost(service) {
  const details = service.serviceDetails || {};
  const supported = ['web_service', 'private_service', 'background_worker'].includes(service.type);
  const price = Object.hasOwn(SERVICE_PRICES, details.plan) ? SERVICE_PRICES[details.plan] : null;
  const instances = positiveInteger(details.numInstances) ? details.numInstances : null;
  const monthlyUsd = service.type === 'static_site' ? 0
    : supported && price !== null && instances !== null ? price * instances : null;
  return { id: label(service.id), name: label(service.name), type: label(service.type), owner: label(service.ownerId),
    region: label(details.region), plan: label(details.plan), status: label(service.suspended), instances,
    monthlyUsd, storageGb: null,
    note: service.type === 'static_site' ? 'No compute fee; usage extras excluded.'
      : monthlyUsd === null ? 'Unknown compute price or instance count; check provider billing.'
        : 'Full-month compute at observed instance count; autoscaling, disks and usage extras excluded.' };
}

function renderDatabaseCost(database) {
  const price = Object.hasOwn(DATABASE_PRICES, database.plan) ? DATABASE_PRICES[database.plan] : null;
  const monthlyUsd = database.highAvailabilityEnabled === true ? null : price;
  return { id: label(database.id), name: label(database.name), type: 'postgres', owner: label(database.owner?.id),
    region: label(database.region), plan: label(database.plan), status: label(database.status), instances: null,
    monthlyUsd, storageGb: Number.isInteger(database.diskSizeGB) && database.diskSizeGB >= 0 ? database.diskSizeGB : null,
    note: database.highAvailabilityEnabled ? 'High availability: compute estimate unavailable; check provider billing.'
      : price === null ? 'Unknown/legacy database plan; check provider billing.'
        : 'Full-month compute only; database storage is additional and is not included in this subtotal.' };
}

function githubAccountCost(account, repositories) {
  const plan = label(account.plan?.name);
  const seats = account.type === 'User' ? 1 : positiveInteger(account.plan?.filled_seats) ? account.plan.filled_seats : null;
  const prices = { free: 0, pro: 4, team: 4 };
  const unitPrice = Object.hasOwn(prices, plan.toLowerCase()) ? prices[plan.toLowerCase()] : undefined;
  const monthlyUsd = unitPrice === 0 ? 0 : unitPrice !== undefined && seats !== null ? unitPrice * seats : null;
  return { login: label(account.login), type: label(account.type), plan, seats, monthlyUsd,
    repositoryCount: repositories.filter(repo => repo.owner.toLowerCase() === account.login.toLowerCase()).length,
    note: 'Subscription estimate counted once per account, not per repository. Education discounts, annual billing, enterprise contracts and add-ons are not inferred.' };
}

function createCostProviders({ env = process.env, fetchImpl = fetch, now = () => new Date() } = {}) {
  const githubToken = env.INFRA_COST_GITHUB_TOKEN || env.MODULE_BUILDER_GITHUB_TOKEN;
  const renderToken = env.INFRA_COST_RENDER_API_KEY || env.MODULE_BUILDER_RENDER_API_KEY;
  async function get(provider, endpoint) {
    const token = provider === 'GitHub' ? githubToken : renderToken;
    if (!token) throw new CostReportError(`${provider} reporting credential is not configured.`);
    const base = provider === 'GitHub' ? 'https://api.github.com' : 'https://api.render.com/v1';
    let response;
    try {
      response = await fetchImpl(base + endpoint, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json',
          ...(provider === 'GitHub' ? { 'X-GitHub-Api-Version': '2022-11-28' } : {}) } });
    } catch { throw new CostReportError(`${provider} reporting request could not be completed. Retry or check provider access.`); }
    if (!response.ok) throw new CostReportError(`${provider} reporting returned HTTP ${response.status}. Check reporting permissions or rate limits.`);
    try { return await response.json(); }
    catch { throw new CostReportError(`${provider} returned an unreadable reporting response.`); }
  }
  async function list(provider, endpoint, key) {
    const items = [], ids = new Set(), cursors = new Set();
    let cursor = '';
    for (let page = 1; page <= 100; page++) {
      const separator = endpoint.includes('?') ? '&' : '?';
      const suffix = provider === 'GitHub' ? `per_page=100&page=${page}`
        : `limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
      const rows = await get(provider, endpoint + separator + suffix);
      if (!Array.isArray(rows)) throw new CostReportError(`${provider} inventory response was invalid.`);
      for (const row of rows) {
        const item = key ? row[key] : row;
        if (!item || (typeof item.id !== 'string' && !Number.isInteger(item.id))) {
          throw new CostReportError(`${provider} inventory contained an invalid resource.`);
        }
        if (!ids.has(item.id)) { ids.add(item.id); items.push(item); }
      }
      if (rows.length < 100) return items;
      if (provider === 'Render') {
        cursor = rows.at(-1).cursor;
        if (typeof cursor !== 'string' || !cursor || cursors.has(cursor)) {
          throw new CostReportError('Render pagination could not be completed; inventory is not current.');
        }
        cursors.add(cursor);
      }
    }
    throw new CostReportError(`${provider} inventory exceeded the reporting page limit; inventory is not current.`);
  }
  async function render() {
    const [services, databases, owners] = await Promise.all([
      list('Render', '/services?includePreviews=true', 'service'),
      list('Render', '/postgres?includeReplicas=true', 'postgres'), list('Render', '/owners', 'owner')
    ]);
    return { checkedAt: now().toISOString(), resources: [
      ...services.map(renderServiceCost), ...databases.map(renderDatabaseCost)
    ], workspaces: owners.map(owner => ({ id: label(owner.id), name: label(owner.name), monthlyUsd: null })),
    warning: 'All workspaces visible to the reporting key; not restricted to Module Builder. Workspace subscriptions, database storage, disks, Key Value, cron, bandwidth, builds, taxes and other usage charges are not included. No Render invoices were retrieved. Suspended resources retain a full-month estimate, not their actual prorated charge.' };
  }
  async function github() {
    const period = now().toISOString().slice(0, 7);
    const [user, repos, orgs] = await Promise.all([
      get('GitHub', '/user'), list('GitHub', '/user/repos?affiliation=owner,collaborator,organization_member'),
      list('GitHub', '/user/orgs')
    ]);
    if (typeof user.login !== 'string' || !user.login) throw new CostReportError('GitHub account response was invalid.');
    const repositories = repos.map(repo => ({ name: label(repo.full_name), owner: label(repo.owner?.login),
      private: repo.private === true }));
    const accounts = [githubAccountCost(user, repositories)];
    for (const org of orgs) {
      if (!/^[A-Za-z0-9-]+$/.test(org.login)) throw new CostReportError('GitHub organisation response was invalid.');
      try {
        const details = await get('GitHub', `/orgs/${encodeURIComponent(org.login)}`);
        if (typeof details.login !== 'string') throw new CostReportError('GitHub organisation details were invalid.');
        const account = githubAccountCost({ ...details, type: 'Organization' }, repositories);
        accounts.push(account);
        try {
          const usage = await get('GitHub', `/organizations/${encodeURIComponent(org.login)}/settings/billing/usage/summary?year=${period.slice(0, 4)}&month=${Number(period.slice(5))}`);
          if (!Array.isArray(usage.usageItems) || usage.usageItems.some(item => !Number.isFinite(item.netAmount))) {
            throw new CostReportError('GitHub billing usage response was invalid.');
          }
          account.reportedUsageUsd = usage.usageItems.reduce((sum, item) => sum + item.netAmount, 0);
          account.usagePeriod = period;
        } catch (error) {
          if (!(error instanceof CostReportError)) throw error;
          account.usageError = error.message;
        }
      } catch (error) {
        if (!(error instanceof CostReportError)) throw error;
        accounts.push({ login: org.login, type: 'Organization', plan: 'Unknown', seats: null, monthlyUsd: null,
          repositoryCount: repositories.filter(repo => repo.owner.toLowerCase() === org.login.toLowerCase()).length,
          note: error.message });
      }
    }
    for (const repo of repositories) {
      if (!accounts.some(account => account.login.toLowerCase() === repo.owner.toLowerCase())) {
        accounts.push({ login: repo.owner, type: 'Repository owner', plan: 'Unknown', seats: null, monthlyUsd: null,
          repositoryCount: repositories.filter(item => item.owner === repo.owner).length,
          note: 'Repository access does not establish billing access or who pays. Subscription unavailable.' });
      }
    }
    return { checkedAt: now().toISOString(), accounts, repositories,
      warning: 'Only accounts and repositories visible to this token are reported. Missing plan/seat information is Unknown, not Free. Organisation metered usage is requested where billing permissions allow; it is month-to-date, separate from subscription estimates, and is not an invoice. Actual invoices and personal-account metered charges are unavailable here. Account estimates may include costs paid by other owners and are not an invoice for WHS.' };
  }
  async function exchange() {
    let response;
    try {
      response = await fetchImpl('https://open.er-api.com/v6/latest/USD', {
        method: 'GET', redirect: 'error', signal: AbortSignal.timeout(10000), headers: { Accept: 'application/json' }
      });
    } catch { throw new CostReportError('NZD exchange-rate request failed. USD amounts remain available.'); }
    if (!response.ok) throw new CostReportError(`NZD exchange-rate request returned HTTP ${response.status}.`);
    let body;
    try { body = await response.json(); }
    catch { throw new CostReportError('Exchange-rate provider returned an unreadable response.'); }
    const rate = body.rates?.NZD, updated = body.time_last_update_unix * 1000;
    if (body.result !== 'success' || body.base_code !== 'USD' || !Number.isFinite(rate) || rate <= 0 ||
        !Number.isFinite(updated) || updated > now().getTime() + 3600000 || now().getTime() - updated > 7 * 86400000) {
      throw new CostReportError('NZD exchange rate is invalid or older than seven days. No conversion was applied.');
    }
    return { rate, updatedAt: new Date(updated).toISOString(), checkedAt: now().toISOString() };
  }
  return { render, github, exchange };
}

function costSummary(snapshot) {
  const rows = [...(snapshot.render?.data?.resources || []), ...(snapshot.github?.data?.accounts || [])];
  const amounts = rows.filter(row => Number.isFinite(row.monthlyUsd));
  const usd = amounts.reduce((total, row) => total + row.monthlyUsd, 0);
  return { usd: amounts.length ? usd : null, unknown: rows.length - amounts.length,
    known: amounts.length, workspaces: snapshot.render?.data?.workspaces?.length || 0 };
}

function createInfrastructureCostsRouter({ dbQuery = query, providers = createCostProviders(), now = () => new Date() } = {}) {
  const router = express.Router();
  let refreshing = false;
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!req.user?.roles?.includes('ADMIN')) return res.status(403).render('error', {
      title: 'Access denied', message: 'Infrastructure cost reporting is available only to global administrators.'
    });
    if (!req.session.infrastructureCostsCsrf) req.session.infrastructureCostsCsrf = crypto.randomBytes(32).toString('hex');
    res.locals.csrf = req.session.infrastructureCostsCsrf;
    next();
  });
  const load = async () => (await dbQuery('SELECT snapshot FROM infrastructure_cost_report WHERE id = 1')).rows[0]?.snapshot || {};
  router.get('/', async (req, res, next) => {
    try {
      const snapshot = await load();
      const exchange = snapshot.exchange?.data;
      const rate = !snapshot.exchange?.error && exchange && now().getTime() - Date.parse(exchange.updatedAt) <= 7 * 86400000 ? exchange.rate : null;
      const money = value => Number.isFinite(value) ? `USD ${value.toFixed(2)}` : 'Unknown';
      const nzd = value => Number.isFinite(value) && Number.isFinite(rate) ? `NZD ${(value * rate).toFixed(2)}` : 'Unavailable';
      res.render('admin/infrastructure-costs', { title: 'GitHub & Render Costs', snapshot,
        summary: costSummary(snapshot), rate, money, nzd, sources: SOURCES, priceChecked: PRICE_CHECKED });
    } catch (error) { next(error); }
  });
  router.post('/refresh', async (req, res, next) => {
    const supplied = Buffer.from(String(req.body.csrf || '')), expected = Buffer.from(req.session.infrastructureCostsCsrf);
    if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
      return res.status(403).render('error', { title: 'Form expired', message: 'Reload the cost report and try again.' });
    }
    if (refreshing) return res.status(409).render('error', { title: 'Refresh running', message: 'A cost refresh is already running. Reload shortly.' });
    refreshing = true;
    try {
      const previous = await load();
      const entries = await Promise.all(['render', 'github', 'exchange'].map(async name => {
        try { return [name, { data: await providers[name](), error: null, attemptedAt: now().toISOString() }]; }
        catch (error) {
          if (!(error instanceof CostReportError)) throw error;
          console.warn(`[infrastructure-costs] ${error.message}`);
          return [name, { data: previous[name]?.data || null, error: error.message, attemptedAt: now().toISOString() }];
        }
      }));
      await dbQuery(`INSERT INTO infrastructure_cost_report (id, snapshot, updated_by, updated_at)
        VALUES (1,$1::jsonb,$2,NOW()) ON CONFLICT (id) DO UPDATE
        SET snapshot=EXCLUDED.snapshot, updated_by=EXCLUDED.updated_by, updated_at=EXCLUDED.updated_at`,
      [JSON.stringify(Object.fromEntries(entries)), req.user.id]);
      res.redirect('/admin/infrastructure-costs');
    } catch (error) { next(error); }
    finally { refreshing = false; }
  });
  return router;
}

module.exports = { createCostProviders, createInfrastructureCostsRouter, costSummary, CostReportError,
  renderServiceCost, renderDatabaseCost, githubAccountCost };
