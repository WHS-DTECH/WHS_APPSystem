const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { authorizationHandler } = require('@modelcontextprotocol/sdk/server/auth/handlers/authorize.js');
const { tokenHandler } = require('@modelcontextprotocol/sdk/server/auth/handlers/token.js');
const { revocationHandler } = require('@modelcontextprotocol/sdk/server/auth/handlers/revoke.js');
const { metadataHandler } = require('@modelcontextprotocol/sdk/server/auth/handlers/metadata.js');
const { requireBearerAuth } = require('@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js');
const { createReadOnlyMcpProvider, mcpSettings } = require('./teacherPlannerMcp');
const { createAssessmentManagerMcpData, inputSchemas, outputSchemas } = require('./assessmentManagerMcpData');
const { query: coreQuery } = require('./db');

const PREFIX = '/integrations/assessment-manager';
const MCP_PATH = PREFIX + '/mcp';
const SCOPE = 'assessment:read';
const descriptions = {
  search_assessment_resources: 'Search shared assessment resource library entries and their standard metadata. Deleted resources, drafts, files and purchasing details are excluded.',
  list_my_assessments: 'List your own assessment-level standard metadata and structured moderation checks for a year. Individual student records, grades, notes and document content are excluded.',
  list_audit_departments: 'List departments currently authorised for you in Students Audit for a year.',
  get_enrolment_summary: 'Read saved Enrolled List PDF counts for one currently authorised department. Counts are evidence, not proof of individual enrolment or grades. External standards are excluded; unknown classification is flagged.',
  get_senior_audit_summary: 'Read aggregate saved Senior Audit source and reconciliation counts for authorised Technology staff. No student details, grades or sync operations.'
};

function createAssessmentManagerMcpRouter({ env = process.env, dbQuery = coreQuery, data, authorizeUser } = {}) {
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
  try { configured = mcpSettings(env, 'assessment-manager'); }
  catch {
    console.warn('Assessment Manager MCP is disabled: configure its HTTPS origin and exact ChatGPT redirect URI.');
    router.use((req, res) => res.status(503).json({ error: 'Assessment Manager MCP HTTPS origin is not configured.' }));
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
    scopes_supported: [SCOPE], resource_name: 'WHS Assessment Manager' }));
  if (!callback) {
    router.all(MCP_PATH, (req, res) => res.status(401).set('WWW-Authenticate',
      `Bearer resource_metadata="${origin + metadataPath}", scope="${SCOPE}"`).json({ error: 'Configure the exact ChatGPT callback before linking.' }));
    router.use((req, res) => res.status(503).json({ error: 'Set ASSESSMENT_MANAGER_MCP_REDIRECT_URI to the exact ChatGPT callback in Render.' }));
    return router;
  }
  const reads = data || createAssessmentManagerMcpData({ env, dbQuery });
  const provider = createReadOnlyMcpProvider({ query: dbQuery, authorizeUser: authorizeUser || reads.authorizeUser,
    origin, resource, callback, integration: 'assessment-manager' });
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
    const server = new McpServer({ name: 'whs-assessment-manager', version: '1.0.0' }, {
      instructions: 'Read-only Assessment Manager summaries. Never infer a completed audit from missing or incomplete sources, or treat course-level PDF counts as individual grade or enrolment verification. No student-level records, marking details, free-text moderation notes or writes.'
    });
    for (const [name, description] of Object.entries(descriptions)) server.registerTool(name, {
      description, inputSchema: inputSchemas[name], outputSchema: outputSchemas[name],
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    }, async args => {
      try {
        const result = outputSchemas[name].parse(await reads.read(req.auth.extra.userId, name, args));
        return { structuredContent: result, content: [{ type: 'text', text: JSON.stringify(result) }] };
      } catch {
        console.error('Assessment Manager MCP read failed:', name);
        return { isError: true, content: [{ type: 'text', text: 'Assessment Manager data or your current access is unavailable. Check your permissions and source data, then retry.' }] };
      }
    });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true,
      enableDnsRebindingProtection: true, allowedHosts: [new URL(origin).host], allowedOrigins: [origin, 'https://chatgpt.com'] });
    res.once('close', () => server.close().catch(() => console.error('Assessment Manager MCP transport cleanup failed.')));
    try { await server.connect(transport); await transport.handleRequest(req, res, req.body); }
    catch {
      console.error('Assessment Manager MCP transport failed.');
      if (res.headersSent) return next(new Error('Assessment Manager MCP transport failed.'));
      res.status(500).json({ error: 'Assessment Manager MCP request failed.' });
    }
  });
  router.use((error, req, res, next) => {
    console.error('Assessment Manager MCP request rejected.');
    if (res.headersSent) return next(new Error('Assessment Manager MCP request failed.'));
    res.status(error.type === 'entity.too.large' ? 413 : 500).json({ error: 'Assessment Manager MCP request could not be processed.' });
  });
  return router;
}

module.exports = { createAssessmentManagerMcpRouter, MCP_PATH };
