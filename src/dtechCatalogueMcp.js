const fs = require('node:fs/promises');
const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { parseDocument } = require('htmlparser2');
const { getElementsByTagName, textContent } = require('domutils');
const { z } = require('zod');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { authorizationHandler } = require('@modelcontextprotocol/sdk/server/auth/handlers/authorize.js');
const { tokenHandler } = require('@modelcontextprotocol/sdk/server/auth/handlers/token.js');
const { revocationHandler } = require('@modelcontextprotocol/sdk/server/auth/handlers/revoke.js');
const { metadataHandler } = require('@modelcontextprotocol/sdk/server/auth/handlers/metadata.js');
const { requireBearerAuth } = require('@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js');
const { createReadOnlyMcpProvider, mcpSettings } = require('./teacherPlannerMcp');
const { authorisedModuleUser } = require('./moduleIdentity');
const { accessForEmail } = require('./modules/dtechHub');
const { query: coreQuery } = require('./db');

const PREFIX = '/integrations/dtech-catalogue';
const MCP_PATH = PREFIX + '/mcp';
const SCOPE = 'dtech-catalogue:read';
const SOURCE = path.join(__dirname, 'legacy', 'dtech-hub', 'learning-pathways');
const inputSchema = z.object({
  query: z.string().trim().max(120).default(''),
  type: z.enum(['all', 'kit', 'unit', 'lesson']).default('all'),
  offset: z.number().int().min(0).max(100000).default(0),
  limit: z.number().int().min(1).max(100).default(50)
}).strict();
const activitySchema = z.object({ title: z.string(), yearOrCourse: z.string().nullable(),
  url: z.string().url(), sequence: z.number().int().positive(), sourceActivityIndex: z.number().int().nonnegative() }).strict();
const itemSchema = z.object({
  type: z.enum(['kit', 'unit', 'lesson']), id: z.string(), title: z.string(),
  yearOrCourse: z.string().nullable(), url: z.string().url(), hasLinkedPage: z.boolean(),
  unitId: z.string().nullable(), sequence: z.number().int().positive().nullable(),
  unitPlanUrl: z.string().url().nullable(), activities: z.array(activitySchema)
}).strict();
const outputSchema = z.object({
  source: z.string().url(), retrievedAt: z.string().datetime(), resources: z.array(itemSchema),
  offset: z.number().int().nonnegative(), limit: z.number().int().positive(),
  total: z.number().int().nonnegative(), hasMore: z.boolean(), warnings: z.array(z.string())
}).strict();

function canonical(value, origin) {
  if (typeof value !== 'string' || !value.trim() || /[\s\\]/.test(value)) return null;
  const raw = value.trim();
  if (raw.startsWith('//')) return null;
  let url;
  try { url = new URL(raw, origin + '/dtech-hub/'); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password) return null;
  if (url.origin === origin && !url.pathname.startsWith('/dtech-hub/')) {
    url.pathname = '/dtech-hub' + url.pathname;
  }
  return url.href;
}

async function explicitUnitPlan(lessonUrl, origin) {
  const url = new URL(lessonUrl);
  if (url.origin !== origin || !/^\/dtech-hub\/learning-pathways\/[a-z0-9-]+\.html$/i.test(url.pathname)) return null;
  const filename = path.join(SOURCE, path.basename(url.pathname));
  const html = await fs.readFile(filename, 'utf8');
  const anchors = getElementsByTagName('a', parseDocument(html).children, true)
    .filter(node => /\bunit plan\b/i.test(textContent(node)) && node.attribs?.href);
  const links = [...new Set(anchors.map(node => canonical(new URL(node.attribs.href, url).href, origin)).filter(Boolean))];
  if (links.length > 1) throw new Error('A lesson has multiple Unit Plan links; review its source.');
  return links[0] || null;
}

function createDtechCatalogueData({ env = process.env, dbQuery = coreQuery, readCatalogue,
  getUser = id => authorisedModuleUser(id, 'dtech-hub', dbQuery),
  hubAccess = email => accessForEmail(email, dbQuery) }) {
  async function authorizeUser(id) {
    const user = await getUser(id);
    const domain = String(env.GOOGLE_HOSTED_DOMAIN || 'westlandhigh.school.nz').toLowerCase();
    if (!user || !String(user.email || '').toLowerCase().endsWith('@' + domain)) return undefined;
    const access = await hubAccess(user.email);
    return access.active && access.teacher ? user : undefined;
  }
  async function read(id, args) {
    if (!await authorizeUser(id)) throw new Error('Current DTECH teaching access is required.');
    const { origin } = mcpSettings(env, 'dtech-catalogue');
    const source = await readCatalogue();
    if (!Array.isArray(source?.kits) || !Array.isArray(source?.pathways)) throw new Error('The published DTECH catalogue is unavailable.');
    const warnings = [];
    const kits = source.kits.filter(kit => kit.status === 'active').map(kit => {
      const url = canonical(kit.href, origin);
      if (!url || !Array.isArray(kit.activities)) throw new Error('A published kit has an invalid catalogue link or activity list.');
      return { type: 'kit', id: kit.id, title: kit.title, yearOrCourse: kit.yearLevel || null, url,
        hasLinkedPage: true, unitId: null, sequence: null, unitPlanUrl: null,
        activities: kit.activities.map((activity, position) => {
          const activityUrl = canonical(activity.href, origin);
          if (!activityUrl) throw new Error('A published kit activity has an invalid link.');
          const index = new URL(activityUrl).searchParams.get('activity');
          if (!/^\d+$/.test(index || '')) throw new Error('A published kit activity has an invalid link.');
          return { title: activity.title, yearOrCourse: activity.yearLevel || kit.yearLevel || null,
            url: activityUrl, sequence: position + 1, sourceActivityIndex: Number(index) };
        }) };
    });
    const pathways = await Promise.all(source.pathways.filter(card =>
      card.status === 'active' && ['unit', 'lesson'].includes(card.cardType)).map(async card => {
      const direct = canonical(card.href, origin);
      const url = direct || origin + '/dtech-hub/learning-pathways/?type=' + card.cardType + '#card-' + encodeURIComponent(card.id);
      let unitPlanUrl = null;
      if (card.cardType === 'lesson' && direct) {
        try {
          const target = new URL(direct);
          if (target.origin !== origin || !/^\/dtech-hub\/learning-pathways\/[a-z0-9-]+\.html$/i.test(target.pathname)) {
            warnings.push('The Unit Plan link for ' + card.title + ' cannot be checked automatically.');
          } else unitPlanUrl = await explicitUnitPlan(direct, origin);
        }
        catch (error) {
          console.warn('DTECH catalogue Unit Plan link could not be verified:', card.id);
          warnings.push('The Unit Plan link for ' + card.title + ' could not be verified.');
        }
      }
      return { type: card.cardType, id: card.id, title: card.title, yearOrCourse: card.yearLevel || null,
        url, hasLinkedPage: Boolean(direct), unitId: card.unit || null, sequence: card.sequence || null, unitPlanUrl, activities: [] };
    }));
    const terms = value => String(value || '').normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('en-NZ')
      .match(/[\p{L}\p{N}]+/gu)?.map(word => word.length > 4 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word) || [];
    const needle = terms(args.query);
    const matches = [...kits, ...pathways].filter(item => (args.type === 'all' || args.type === item.type) &&
      needle.every(word => terms([item.title, item.id, item.yearOrCourse, ...item.activities.map(activity => activity.title)].join(' ')).includes(word)));
    return outputSchema.parse({ source: origin + '/dtech-hub/', retrievedAt: new Date().toISOString(),
      resources: matches.slice(args.offset, args.offset + args.limit), offset: args.offset, limit: args.limit,
      total: matches.length, hasMore: args.offset + args.limit < matches.length, warnings });
  }
  return { authorizeUser, read };
}

function createDtechCatalogueMcpRouter({ env = process.env, dbQuery = coreQuery, readCatalogue, data, authorizeUser } = {}) {
  const router = express.Router();
  const metadataPath = '/.well-known/oauth-protected-resource' + MCP_PATH;
  const issuerMetadataPath = '/.well-known/oauth-authorization-server' + PREFIX;
  router.use((req, res, next) => {
    const target = req.path.replace(/\/$/, '');
    if (target !== PREFIX && !target.startsWith(PREFIX + '/') && target !== metadataPath && target !== issuerMetadataPath) return next('router');
    next();
  });
  const policy = { defaultSrc: ["'none'"], styleSrc: ["'self'"], formAction: ["'self'"], frameAncestors: ["'none'"], baseUri: ["'none'"] };
  router.use(helmet({ contentSecurityPolicy: { directives: policy } }));
  router.use((req, res, next) => { res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }); next(); });
  router.use(rateLimit({ windowMs: 60000, limit: 120 }));
  let configured;
  try { configured = mcpSettings(env, 'dtech-catalogue'); }
  catch {
    console.warn('DTECH catalogue MCP is disabled: configure its HTTPS origin and exact ChatGPT redirect URI.');
    router.use((req, res) => res.status(503).json({ error: 'DTECH catalogue MCP HTTPS origin is not configured.' }));
    return router;
  }
  const { origin, resource, callback } = configured, issuer = origin + PREFIX;
  router.use(issuerMetadataPath, metadataHandler({
    issuer, authorization_endpoint: issuer + '/oauth/authorize', token_endpoint: issuer + '/oauth/token',
    revocation_endpoint: issuer + '/oauth/revoke', response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'], code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'], revocation_endpoint_auth_methods_supported: ['none'], scopes_supported: [SCOPE]
  }));
  router.use(metadataPath, metadataHandler({ resource: resource.href, authorization_servers: [issuer],
    scopes_supported: [SCOPE], resource_name: 'WHS DTECH Catalogue' }));
  if (!callback) {
    router.all(MCP_PATH, (req, res) => res.status(401).set('WWW-Authenticate',
      `Bearer resource_metadata="${origin + metadataPath}", scope="${SCOPE}"`).json({ error: 'Configure the exact ChatGPT callback before linking.' }));
    router.use((req, res) => res.status(503).json({ error: 'Set DTECH_CATALOGUE_MCP_REDIRECT_URI to the exact ChatGPT callback in Render.' }));
    return router;
  }
  const reads = data || createDtechCatalogueData({ env, dbQuery, readCatalogue });
  const provider = createReadOnlyMcpProvider({ query: dbQuery, authorizeUser: authorizeUser || reads.authorizeUser,
    origin, resource, callback, integration: 'dtech-catalogue' });
  router.use(PREFIX, express.urlencoded({ extended: false, limit: '32kb' }), express.json({ limit: '32kb' }));
  router.use(PREFIX + '/oauth/authorize',
    helmet.contentSecurityPolicy({ directives: { ...policy, formAction: ["'self'", callback] } }),
    (req, res, next) => { res.set('Referrer-Policy', 'same-origin'); next(); }, authorizationHandler({ provider }));
  router.use(PREFIX + '/oauth/token', tokenHandler({ provider }));
  router.use(PREFIX + '/oauth/revoke', revocationHandler({ provider }));
  router.use(MCP_PATH, requireBearerAuth({ verifier: provider, requiredScopes: [SCOPE],
    expectedResource: resource, resourceMetadataUrl: origin + metadataPath }));
  router.all(MCP_PATH, async (req, res, next) => {
    if (req.get('origin') && ![origin, 'https://chatgpt.com'].includes(req.get('origin'))) {
      return res.status(403).json({ error: 'Unapproved MCP request origin.' });
    }
    const server = new McpServer({ name: 'whs-dtech-catalogue', version: '1.0.0' }, {
      instructions: 'Read-only published DTECH teaching catalogue. Activities are in visible catalogue order; sourceActivityIndex is the original zero-based worksheet index. Catalogue-card links without a linked page are not full lessons. Never infer student progress or publication outside the returned catalogue.'
    });
    server.registerTool('search_teaching_catalogue', {
      description: 'List or search active Licence Kits with ordered activity titles, and active unit and lesson catalogue cards. Year/course and canonical links are included. Lesson Unit Plan links appear only when explicitly linked by the lesson. No student information or writes.',
      inputSchema, outputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    }, async args => {
      try {
        const result = await reads.read(req.auth.extra.userId, args);
        return { structuredContent: outputSchema.parse(result), content: [{ type: 'text', text: JSON.stringify(result) }] };
      } catch {
        console.error('DTECH catalogue MCP read failed.');
        return { isError: true, content: [{ type: 'text', text: 'The published catalogue or current DTECH teaching access is unavailable. Retry or contact an administrator.' }] };
      }
    });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true,
      enableDnsRebindingProtection: true, allowedHosts: [new URL(origin).host], allowedOrigins: [origin, 'https://chatgpt.com'] });
    res.once('close', () => server.close().catch(() => console.error('DTECH catalogue MCP transport cleanup failed.')));
    try { await server.connect(transport); await transport.handleRequest(req, res, req.body); }
    catch {
      console.error('DTECH catalogue MCP transport failed.');
      if (res.headersSent) return next(new Error('DTECH catalogue MCP transport failed.'));
      res.status(500).json({ error: 'DTECH catalogue MCP request failed.' });
    }
  });
  router.use((error, req, res, next) => {
    console.error('DTECH catalogue MCP request rejected.');
    if (res.headersSent) return next(new Error('DTECH catalogue MCP request failed.'));
    res.status(error.type === 'entity.too.large' ? 413 : 500).json({ error: 'DTECH catalogue MCP request could not be processed.' });
  });
  return router;
}

module.exports = { createDtechCatalogueMcpRouter, createDtechCatalogueData, inputSchema, outputSchema, canonical, MCP_PATH };
