const crypto = require('node:crypto');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { authorizationHandler } = require('@modelcontextprotocol/sdk/server/auth/handlers/authorize.js');
const { tokenHandler } = require('@modelcontextprotocol/sdk/server/auth/handlers/token.js');
const { revocationHandler } = require('@modelcontextprotocol/sdk/server/auth/handlers/revoke.js');
const { mcpAuthMetadataRouter } = require('@modelcontextprotocol/sdk/server/auth/router.js');
const { requireBearerAuth } = require('@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js');
const { OAuthError, InvalidRequestError, InvalidGrantError, InvalidTokenError, InvalidScopeError,
  AccessDeniedError, UnsupportedGrantTypeError, ServerError } = require('@modelcontextprotocol/sdk/server/auth/errors.js');
const config = require('./config');
const { query: coreQuery } = require('./db');
const { authorisedModuleUser } = require('./moduleIdentity');
const { createTeacherPlannerMcpData } = require('./teacherPlannerMcpData');

const PREFIX = '/integrations/teacher-planner';
const MCP_PATH = PREFIX + '/mcp';
const SCOPE = 'planner:read';
const CLIENT_ID = 'teacher-planner-chatgpt';
const TOKEN_SECONDS = 3600;
const hash = value => crypto.createHash('sha256').update(value).digest('base64url');
const opaque = value => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
const yearSchema = z.number().int().min(2000).max(2100);
const sectionSchema = z.enum(['year', 'term', 'week']);
const recordSchema = z.object({
  id: z.string(), year: yearSchema, section: sectionSchema, key: z.string(), revision: z.number().int().positive(),
  updatedAt: z.string(), url: z.string().url(), weekStarting: z.string().optional(), term: z.number().int().min(1).max(4).optional(),
  startDate: z.string().optional(), endDate: z.string().optional()
}).strict();
const calendarsSchema = z.object({
  year: yearSchema, month: z.number().int().min(1).max(12), timeZone: z.literal('Pacific/Auckland'),
  retrievedAt: z.string(), complete: z.boolean(),
  sources: z.array(z.object({ source: z.string(), status: z.enum(['ok', 'partial', 'unavailable']),
    count: z.number().int().nonnegative(), warning: z.string().optional() }).strict()),
  events: z.array(z.object({ id: z.string(), source: z.string(), title: z.string(), start: z.string(),
    end: z.string(), allDay: z.boolean(), endExclusive: z.boolean(), needsConfirmation: z.boolean(),
    weeklyReference: z.boolean(), url: z.string().url() }).strict())
}).strict();

function settings(env) {
  const base = new URL(env.APP_BASE_URL || env.RENDER_EXTERNAL_URL || config.appBaseUrl);
  const callback = env.TEACHER_PLANNER_MCP_REDIRECT_URI ? new URL(env.TEACHER_PLANNER_MCP_REDIRECT_URI) : null;
  if (base.protocol !== 'https:' || base.username || base.password || base.pathname !== '/' || base.search || base.hash ||
      (callback && (callback.protocol !== 'https:' || callback.hostname !== 'chatgpt.com' || callback.username || callback.password ||
      callback.port || callback.search || callback.hash ||
      !/^(?:\/connector\/oauth\/[A-Za-z0-9_-]+|\/connector_platform_oauth_redirect)$/.test(callback.pathname)))) {
    throw new Error('Configure the HTTPS site origin and exact ChatGPT MCP OAuth redirect URI.');
  }
  return { origin: base.origin, resource: new URL(MCP_PATH, base), callback: callback?.href };
}

function createProvider({ query, authorizeUser, origin, resource, callback }) {
  const client = { client_id: CLIENT_ID, client_name: 'ChatGPT Teacher Planner',
    redirect_uris: [callback], token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code'], response_types: ['code'], scope: SCOPE };
  const guard = work => async (...args) => {
    try { return await work(...args); }
    catch (error) {
      console.warn('Planner MCP OAuth operation failed.');
      if (error instanceof OAuthError) throw error;
      throw new ServerError('Planner authorisation is unavailable. Contact an administrator.');
    }
  };
  const saveSession = req => new Promise((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
  const checkResource = value => {
    if (value?.href !== resource.href) throw new InvalidRequestError('The Planner MCP resource is required.');
  };
  const provider = {
    clientsStore: { getClient: async id => id === CLIENT_ID ? client : undefined },
    authorize: guard(async (registered, params, res) => {
      const req = res.req;
      checkResource(params.resource);
      if (!opaque(params.codeChallenge) || typeof params.state !== 'string' || !params.state || params.state.length > 512) {
        throw new InvalidRequestError('A valid PKCE challenge and state are required.');
      }
      if (params.scopes?.length && (params.scopes.length !== 1 || params.scopes[0] !== SCOPE)) {
        throw new InvalidScopeError('Only planner:read is supported.');
      }
      if (!req.user) {
        if (req.method !== 'GET') throw new AccessDeniedError('Sign in again and restart the ChatGPT connection.');
        return res.redirect('/auth/google?next=' + encodeURIComponent(req.originalUrl));
      }
      const user = await authorizeUser(req.user.id);
      if (!user) throw new AccessDeniedError('An active school account with Teacher Planner access is required.');
      const binding = hash(JSON.stringify([user.id, registered.client_id, params.redirectUri, params.codeChallenge, params.state, resource.href]));
      if (req.method === 'GET') {
        const csrf = crypto.randomBytes(32).toString('base64url');
        req.session.teacherPlannerMcpConsent = { csrf, binding, expires: Date.now() + 5 * 60000 };
        await saveSession(req);
        return res.render('teacher-planner-mcp-consent', { csrf, fields: {
          client_id: registered.client_id, redirect_uri: params.redirectUri, response_type: 'code',
          code_challenge: params.codeChallenge, code_challenge_method: 'S256', state: params.state,
          resource: resource.href, scope: SCOPE
        } });
      }
      const pending = req.session.teacherPlannerMcpConsent;
      const supplied = Buffer.from(typeof req.body.csrf === 'string' ? req.body.csrf : '');
      const expected = Buffer.from(pending?.csrf || '');
      if (req.get('origin') !== origin || !pending || pending.expires < Date.now() ||
          pending.binding !== binding || supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
        throw new AccessDeniedError('The consent request changed or expired. Restart the ChatGPT connection.');
      }
      delete req.session.teacherPlannerMcpConsent;
      await saveSession(req);
      if (req.body.decision !== 'allow') throw new AccessDeniedError('The connection was not approved.');
      const code = crypto.randomBytes(32).toString('base64url');
      await query('DELETE FROM teacher_planner_mcp_codes WHERE expires_at <= NOW()');
      await query('DELETE FROM teacher_planner_mcp_grants WHERE expires_at <= NOW()');
      await query(`INSERT INTO teacher_planner_mcp_codes(code_hash,user_id,client_id,redirect_uri,challenge,resource)
        VALUES($1,$2,$3,$4,$5,$6)`, [hash(code), user.id, registered.client_id, params.redirectUri, params.codeChallenge, resource.href]);
      const redirect = new URL(params.redirectUri);
      redirect.searchParams.set('code', code);
      redirect.searchParams.set('state', params.state);
      res.redirect(redirect.href);
    }),
    challengeForAuthorizationCode: guard(async (registered, code) => {
      if (!opaque(code)) throw new InvalidGrantError('Invalid authorisation code.');
      const row = (await query(`SELECT challenge FROM teacher_planner_mcp_codes
        WHERE code_hash=$1 AND client_id=$2 AND resource=$3 AND expires_at>NOW()`,
      [hash(code), registered.client_id, resource.href])).rows[0];
      if (!row) throw new InvalidGrantError('Authorisation code expired or already used.');
      return row.challenge;
    }),
    exchangeAuthorizationCode: guard(async (registered, code, verifier, redirectUri, requestedResource) => {
      checkResource(requestedResource);
      if (!opaque(code) || redirectUri !== callback) throw new InvalidGrantError('Invalid authorisation code exchange.');
      const row = (await query(`DELETE FROM teacher_planner_mcp_codes
        WHERE code_hash=$1 AND client_id=$2 AND redirect_uri=$3 AND resource=$4 AND expires_at>NOW()
        RETURNING user_id`, [hash(code), registered.client_id, redirectUri, resource.href])).rows[0];
      if (!row || !await authorizeUser(row.user_id)) throw new InvalidGrantError('Planner authorisation expired or was withdrawn.');
      const token = crypto.randomBytes(32).toString('base64url');
      await query(`INSERT INTO teacher_planner_mcp_grants(token_hash,user_id,client_id,resource,scope)
        VALUES($1,$2,$3,$4,$5)`, [hash(token), row.user_id, registered.client_id, resource.href, SCOPE]);
      return { access_token: token, token_type: 'Bearer', expires_in: TOKEN_SECONDS, scope: SCOPE };
    }),
    exchangeRefreshToken: async () => { throw new UnsupportedGrantTypeError('Reconnect after the one-hour read-only grant expires.'); },
    verifyAccessToken: guard(async token => {
      if (!opaque(token)) throw new InvalidTokenError('Invalid Planner token.');
      const row = (await query(`SELECT user_id,client_id,resource,scope,expires_at FROM teacher_planner_mcp_grants
        WHERE token_hash=$1 AND client_id=$2 AND resource=$3 AND scope=$4 AND expires_at>NOW()`,
      [hash(token), CLIENT_ID, resource.href, SCOPE])).rows[0];
      if (!row || !await authorizeUser(row.user_id)) throw new InvalidTokenError('Planner access expired or was withdrawn.');
      return { token, clientId: row.client_id, resource: new URL(row.resource), scopes: [row.scope],
        expiresAt: new Date(row.expires_at).getTime() / 1000, extra: { userId: row.user_id } };
    }),
    revokeToken: guard(async (registered, request) => {
      if (typeof request.token !== 'string') throw new InvalidRequestError('A token is required.');
      await query('DELETE FROM teacher_planner_mcp_grants WHERE token_hash=$1 AND client_id=$2', [hash(request.token), registered.client_id]);
    })
  };
  return provider;
}

function createTeacherPlannerMcpRouter({ env = process.env, dbQuery = coreQuery, data, authorizeUser } = {}) {
  const router = express.Router();
  const metadataPath = '/.well-known/oauth-protected-resource' + MCP_PATH;
  const paths = [PREFIX, '/.well-known/oauth-authorization-server', metadataPath];
  router.use((req, res, next) => {
    if (!paths.some(path => req.path === path || req.path.startsWith(path + '/'))) return next('router');
    next();
  });
  const consentPolicy = {
    defaultSrc: ["'none'"], styleSrc: ["'self'"], formAction: ["'self'"], frameAncestors: ["'none'"], baseUri: ["'none'"]
  };
  router.use(helmet({ contentSecurityPolicy: { directives: consentPolicy } }));
  router.use((req, res, next) => { res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }); next(); });
  router.use(rateLimit({ windowMs: 60000, limit: 120 }));
  let configured;
  try { configured = settings(env); }
  catch {
    console.warn('Planner MCP is disabled: configure TEACHER_PLANNER_MCP_REDIRECT_URI and the HTTPS APP_BASE_URL.');
    router.use((req, res) => res.status(503).json({ error: 'Planner MCP is not configured. Set the exact ChatGPT MCP OAuth redirect URI and HTTPS APP_BASE_URL in Render.' }));
    return router;
  }
  const { origin, resource, callback } = configured;
  router.use(mcpAuthMetadataRouter({ resourceServerUrl: resource, resourceName: 'Teacher Planner (read-only)',
    scopesSupported: [SCOPE], oauthMetadata: {
      issuer: origin, authorization_endpoint: origin + PREFIX + '/oauth/authorize',
      token_endpoint: origin + PREFIX + '/oauth/token', revocation_endpoint: origin + PREFIX + '/oauth/revoke',
      response_types_supported: ['code'], grant_types_supported: ['authorization_code'],
      code_challenge_methods_supported: ['S256'], token_endpoint_auth_methods_supported: ['none'],
      revocation_endpoint_auth_methods_supported: ['none'], scopes_supported: [SCOPE]
    } }));
  if (!callback) {
    console.warn('Planner MCP data access is disabled until TEACHER_PLANNER_MCP_REDIRECT_URI is configured.');
    router.all(MCP_PATH, (req, res) => res.status(401).set('WWW-Authenticate',
      `Bearer resource_metadata="${origin + metadataPath}", scope="${SCOPE}"`)
      .json({ error: 'Planner MCP requires OAuth. Configure the exact ChatGPT callback in Render before linking.' }));
    router.use((req, res) => res.status(503).json({ error: 'Set TEACHER_PLANNER_MCP_REDIRECT_URI to the exact callback shown by ChatGPT, then redeploy.' }));
    return router;
  }
  const provider = createProvider({ query: dbQuery, origin, resource, callback,
    authorizeUser: authorizeUser || (id => authorisedModuleUser(id, 'teacher-planner', dbQuery)) });
  const reads = data || createTeacherPlannerMcpData({ env, origin });
  router.use(PREFIX, express.urlencoded({ extended: false, limit: '32kb' }), express.json({ limit: '32kb' }));
  router.use(PREFIX + '/oauth/authorize',
    helmet.contentSecurityPolicy({ directives: { ...consentPolicy, formAction: ["'self'", callback] } }),
    (req, res, next) => {
      if (req.method === 'POST') res.once('finish', () => {
        const location = res.get('Location');
        console.info('Planner MCP OAuth POST /integrations/teacher-planner/oauth/authorize', {
          status: res.statusCode, chatgptRedirect: typeof location === 'string' && location.startsWith(callback + '?')
        });
      });
      next();
    }, authorizationHandler({ provider }));
  router.use(PREFIX + '/oauth/token', tokenHandler({ provider }));
  router.use(PREFIX + '/oauth/revoke', revocationHandler({ provider }));
  router.use(MCP_PATH, requireBearerAuth({ verifier: provider, requiredScopes: [SCOPE],
    expectedResource: resource, resourceMetadataUrl: origin + metadataPath }));
  router.all(MCP_PATH, async (req, res, next) => {
    if (req.get('origin') && req.get('origin') !== origin && req.get('origin') !== 'https://chatgpt.com') {
      console.warn('Planner MCP request origin rejected.');
      return res.status(403).json({ error: 'Unapproved MCP request origin.' });
    }
    const server = new McpServer({ name: 'teacher-planner-read-only', version: '1.0.0' }, {
      instructions: 'Only record metadata and calendar dates are available. Planner notes, student records and writes are excluded. Calendar source failures are explicit; unavailable feeds do not mean no events. Open returned Planner links for full records.'
    });
    const owner = req.auth.extra.userId;
    const register = (name, description, schema, outputSchema, work, external = false) => server.registerTool(name, {
      description, inputSchema: schema, outputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: external }
    }, async args => {
      try {
        const result = await work(args);
        return { structuredContent: result, content: [{ type: 'text', text: JSON.stringify(result) }] };
      } catch {
        console.error('Planner MCP read failed:', name);
        return { isError: true, content: [{ type: 'text', text: 'The authorised Planner read failed. Check the record address, source availability or configuration, and retry. No changes were made.' }] };
      }
    });
    register('list_planning_records', 'List your available saved planning years. Supply a year to list its Year, Term and Week record metadata and original Planner links. No notes or student records.',
      z.object({ year: yearSchema.optional() }).strict(),
      z.object({ years: z.array(yearSchema), records: z.array(recordSchema) }).strict(),
      ({ year }) => reads.listRecords(owner, year));
    register('get_planning_record', 'Retrieve approved metadata, saved term dates and the original link for one of your Year, Term or Week records. Content and notes are excluded.',
      z.object({ year: yearSchema, section: sectionSchema, key: z.string().max(10) }).strict(),
      z.object({ found: z.boolean(), record: recordSchema.nullable(), contentExcluded: z.literal(true) }).strict(),
      ({ year, section, key }) => reads.getRecord(owner, year, section, key));
    register('get_calendar_dates', 'Read consolidated calendar dates for one month from school setup, Ministry/GOVT, KAMAR, your selected Google calendars, the configured school document and NZQA. Private event labels are generic; every feed reports availability.',
      z.object({ year: yearSchema, month: z.number().int().min(1).max(12) }).strict(),
      calendarsSchema,
      ({ year, month }) => reads.calendarDates(owner, year, month), true);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true,
      enableDnsRebindingProtection: true, allowedHosts: [new URL(origin).host],
      allowedOrigins: [origin, 'https://chatgpt.com'] });
    const close = () => server.close().catch(() => console.error('Planner MCP transport cleanup failed.'));
    res.once('close', close);
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error('Planner MCP transport failed.');
      if (res.headersSent) return next(new Error('Planner MCP transport failed.'));
      res.status(500).json({ error: 'Planner MCP request failed.' });
    }
  });
  router.use((error, req, res, next) => {
    console.error('Planner MCP request rejected.');
    if (res.headersSent) return next(new Error('Planner MCP request failed.'));
    res.status(error.type === 'entity.too.large' ? 413 : 500).json({ error: 'Planner MCP request could not be processed.' });
  });
  return router;
}

module.exports = { createTeacherPlannerMcpRouter, MCP_PATH, CLIENT_ID };
