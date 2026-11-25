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
const { metadataHandler } = require('@modelcontextprotocol/sdk/server/auth/handlers/metadata.js');
const { requireBearerAuth } = require('@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js');
const { createReadOnlyMcpProvider, mcpSettings } = require('./teacherPlannerMcp');
const { authorisedModuleUser } = require('./moduleIdentity');
const { createStudentTrackerService } = require('./studentTracker');
const { query: coreQuery } = require('./db');
const { query: kamarQuery } = require('./legacy/kamar-uploader/db');

const PREFIX = '/integrations/student-tracker';
const MCP_PATH = PREFIX + '/mcp';
const BRIDGE_PATH = '/integrations/mcp/read-audit';
const CLIENT_ID = 'student-tracker-chatgpt';
const SCOPE = 'tracker:read';
const PAGE_ID = 'department-awards-audit';
const PAGE_TITLE = 'Department Awards Audit';
const FILTERS = ['year', 'departmentId', 'teacher', 'subject', 'classCode', 'band', 'semester', 'part', 'followUpOnly'];
const yearSchema = z.number().int().min(2000).max(2100);
const count = z.number().int().nonnegative();
const subject = z.enum(['DTECH', 'MPROG', 'WOOD', 'DVC', 'TEXTILES', 'FOOD']);
const band = z.enum(['junior', 'middle']);
const part = z.enum(['all', 'reporting', 'slo', 'values', 'awards']);
const readShape = {
  pageId: z.literal(PAGE_ID).default(PAGE_ID), year: yearSchema, departmentId: z.string().uuid().optional(),
  teacher: z.string().regex(/^[A-Z0-9_-]{1,30}$/).optional(), subject: subject.optional(),
  classCode: z.string().regex(/^[A-Z0-9_-]{1,80}$/).optional(), band: band.optional(),
  semester: z.number().int().min(1).max(2).optional(), part: part.optional(), followUpOnly: z.boolean().optional(),
  offset: count.max(100000).default(0), limit: z.number().int().min(1).max(100).default(50)
};
const checkSchema = z.object({
  status: z.enum(['Complete', 'Incomplete', 'Not checked', 'Part checked', 'Conflicting PDFs',
    'Roster coverage gap', 'Insufficient SLO fields', 'No reports required', 'Resolved', 'PDF only']),
  state: z.enum(['complete', 'incomplete', 'partial', 'unknown', 'excluded', 'resolved']),
  entries: count, total: count, blanks: count, missing: count, checked: count, required: count,
  resolvedEntries: count, resolvedFields: count
}).strict();
const recordSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  teacher: z.object({ code: z.string().max(80), name: z.string().max(200) }).strict().nullable(),
  subject, classes: z.array(z.string().max(100)), band,
  semester: z.number().int().min(1).max(2).nullable(), terms: z.array(z.number().int().min(1).max(4)), pdfOnly: z.boolean(),
  slo: checkSchema, values: checkSchema,
  awards: z.object({ status: z.enum(['PDF checked', 'Excluded 7S/8S', 'Conflicting PDFs', 'Not checked']),
    state: z.enum(['evidence', 'excluded', 'partial', 'unknown']), mohio: count.nullable(), akoranga: count.nullable() }).strict()
}).strict();
const timestampsSchema = z.object({
  reports: z.string().datetime().nullable(), awards: z.string().datetime().nullable(), reviews: z.string().datetime().nullable()
}).strict();
const paginationSchema = z.object({ offset: count, limit: count, total: count, hasMore: z.boolean() }).strict();
const appliedSchema = z.object({
  year: yearSchema, departmentId: z.string().uuid().nullable(), teacher: z.string().nullable(),
  subject: subject.nullable(), classCode: z.string().nullable(), band: band.nullable(),
  semester: z.number().nullable(), part, followUpOnly: z.boolean()
}).strict();
const outputSchema = z.object({
  sourcePageTitle: z.literal(PAGE_TITLE), sourceUrl: z.string().url(), academicYear: yearSchema,
  appliedFilters: appliedSchema, retrievedAt: z.string().datetime(), sourceUpdatedAt: timestampsSchema,
  availability: z.enum(['available', 'unavailable']), complete: z.boolean(), sourceComplete: z.boolean(),
  freshnessVerified: z.literal(false), studentInformationExcluded: z.literal(true), warnings: z.array(z.string()),
  pages: z.array(z.object({
    id: z.literal(PAGE_ID), title: z.literal(PAGE_TITLE), description: z.string(), url: z.string().url(),
    availableFilters: z.array(z.string()), availableYears: z.array(yearSchema), informationTypes: z.array(z.string()),
    departments: z.array(z.object({ id: z.string().uuid(), name: z.string() }).strict())
  }).strict()),
  records: z.array(recordSchema.extend({ url: z.string().url() })).nullable(), pagination: paginationSchema.nullable()
}).strict();
const bridgeSchema = z.object({
  available: z.boolean(), availableYears: z.array(yearSchema), records: z.array(recordSchema).nullable(),
  pagination: paginationSchema.nullable(), sourceComplete: z.boolean(), sourceUpdatedAt: timestampsSchema,
  warnings: z.array(z.string())
}).strict();
const readInput = z.object(readShape).strict();
const toolDefinitions = [
  { name: 'list_available_pages', description: 'Discover the authorised Department Awards Audit page, saved audit years, departments and supported filters. Junior and Middle reporting are views of this page, not separate invented pages. Other Student Tracker pages and student-level data are excluded.',
    inputSchema: z.object({ year: yearSchema.optional() }).strict() },
  { name: 'get_page_data', description: 'Read aggregate teacher/class SLO, Values and award evidence from Department Awards Audit, using its existing calculation model. Specify year and an authorised departmentId (optional only when exactly one department is authorised). Teacher is an exact staff code. Student details and writes are excluded.',
    inputSchema: readInput },
  { name: 'search_records', description: 'Find reporting responsibilities needing follow-up, including Junior/Middle reports, using structured teacher, subject and class filters. Defaults to part=reporting and followUpOnly=true. Unknown and partial evidence require checking, not an assumption of unfinished or published reports. Awards evidence never proves completed review.',
    inputSchema: readInput },
  { name: 'get_audit_status', description: 'Retrieve existing Department Awards Audit statuses and per-teacher/class counts for Junior/Middle SLOs, Values and award PDFs. Counts match the source calculation; do not sum overlapping class responsibilities as unique students. Compare stable record IDs and source timestamps between checks; no audit history is created.',
    inputSchema: readInput }
].map(tool => ({ ...tool, outputSchema }));

const schoolYear = () => Number(new Intl.DateTimeFormat('en', { timeZone: 'Pacific/Auckland', year: 'numeric' }).format(new Date()));
const digest = value => crypto.createHash('sha256').update(value).digest('base64url');
function normalize(name, args) {
  return { year: args.year ?? schoolYear(), departmentId: args.departmentId ?? null,
    teacher: args.teacher ?? null, subject: args.subject ?? null, classCode: args.classCode ?? null,
    band: args.band ?? null, semester: args.semester ?? null,
    part: args.part ?? (name === 'search_records' ? 'reporting' : 'all'),
    followUpOnly: args.followUpOnly ?? name === 'search_records' };
}
function appOrigin(env) {
  const url = new URL(env.STUDENT_TRACKER_MCP_APP_URL);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Configure the Student Tracker HTTPS application origin.');
  }
  return url.origin;
}
function envelope(env, filters) {
  return {
    sourcePageTitle: PAGE_TITLE, sourceUrl: appOrigin(env) + '/' + PAGE_ID + '?year=' + filters.year,
    academicYear: filters.year, appliedFilters: filters, retrievedAt: new Date().toISOString(),
    sourceUpdatedAt: { reports: null, awards: null, reviews: null }, availability: 'unavailable',
    complete: false, sourceComplete: false, freshnessVerified: false, studentInformationExcluded: true,
    warnings: [], pages: [], records: null, pagination: null
  };
}

function createStudentTrackerMcpData({ env = process.env, dbQuery = coreQuery, trackerService,
  getUser = id => authorisedModuleUser(id, 'whs-techstudent-tracker', dbQuery), fetcher = fetch } = {}) {
  const tracker = trackerService || createStudentTrackerService({ dbQuery, directoryQuery: kamarQuery, env });
  async function access(id, year) {
    const user = await getUser(id);
    if (!user) return null;
    let setup;
    try { setup = await tracker.run(user, { action: 'setup', year }); }
    catch (error) {
      if (error.status === 403) return null;
      throw error;
    }
    const departments = setup.departments.filter(item => setup.admin || item.canManage).map(({ id, name }) => ({ id, name }));
    return departments.length ? { user, departments } : null;
  }
  async function internalRead(body) {
    const key = env.STUDENT_TRACKER_MCP_BRIDGE_KEY;
    if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(key)) throw new Error('Configure the read-only audit bridge key.');
    const bytes = Buffer.from(JSON.stringify(body));
    if (bytes.length > 8 * 1024 * 1024) throw new Error('The authorised audit roster exceeds the read limit.');
    const stamp = String(Date.now()), bodyDigest = digest(bytes);
    const signature = crypto.createHmac('sha256', key).update(stamp + '\nPOST\n' + BRIDGE_PATH + '\n' + bodyDigest).digest('base64url');
    const response = await fetcher(appOrigin(env) + BRIDGE_PATH, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30000),
      headers: { 'Content-Type': 'application/json', 'x-whs-mcp-time': stamp,
        'x-whs-mcp-digest': bodyDigest, 'x-whs-mcp-signature': signature }, body: bytes
    });
    if (!response.ok) throw new Error('The authorised audit source is unavailable.');
    return response.json();
  }
  return {
    authorizeUser: async id => (await access(id, schoolYear()))?.user,
    read: async (owner, name, args) => {
      const filters = normalize(name, args);
      const context = await access(owner, filters.year);
      if (!context) throw new Error('Current department management access is required.');
      if (name !== 'list_available_pages') {
        if (!filters.departmentId && context.departments.length === 1) filters.departmentId = context.departments[0].id;
        if (!context.departments.some(item => item.id === filters.departmentId)) {
          throw new Error('Choose a currently authorised department from list_available_pages.');
        }
      }
      const result = envelope(env, filters);
      const scope = { departmentIds: context.departments.map(item => item.id) };
      let data;
      if (name === 'list_available_pages') {
        data = z.object({ availableYears: z.array(yearSchema) }).strict().parse(await internalRead({ operation: 'catalogue', ...scope }));
        Object.assign(result, { availability: 'available', complete: true, sourceComplete: true,
          warnings: ['Available years are saved shared PDF audit years, not a guarantee of reporting completion or a live Drive check.'] });
      } else {
        const roster = await tracker.run(context.user, { action: 'department-audit-roster',
          year: filters.year, departmentId: filters.departmentId });
        data = bridgeSchema.parse(await internalRead({ operation: 'audit', ...scope, departmentId: filters.departmentId,
          year: filters.year, roster, filters, offset: args.offset, limit: args.limit }));
        Object.assign(result, { availability: data.available ? 'available' : 'unavailable',
          sourceComplete: data.sourceComplete,
          complete: data.sourceComplete && data.pagination?.offset === 0 && !data.pagination.hasMore,
          sourceUpdatedAt: data.sourceUpdatedAt, warnings: data.warnings, pagination: data.pagination,
          records: data.records?.map(record => ({ ...record, url: result.sourceUrl })) ?? null });
      }
      result.pages = [{
        id: PAGE_ID, title: PAGE_TITLE, description: 'Read-only existing Junior/Middle SLO, School Values and award recipient PDF audit summaries.',
        url: result.sourceUrl, availableFilters: FILTERS, availableYears: data.availableYears,
        informationTypes: ['Teacher/class responsibilities', 'SLO PDF evidence', 'School Values PDF evidence', 'Award recipient PDF evidence'],
        departments: context.departments
      }];
      return result;
    }
  };
}

function createStudentTrackerMcpRouter({ env = process.env, dbQuery = coreQuery, data, authorizeUser } = {}) {
  const router = express.Router();
  const metadataPath = '/.well-known/oauth-protected-resource' + MCP_PATH;
  const issuerMetadataPath = '/.well-known/oauth-authorization-server' + PREFIX;
  router.use((req, res, next) => {
    const path = req.path.replace(/\/$/, '');
    if (path !== PREFIX && !path.startsWith(PREFIX + '/') && path !== metadataPath && path !== issuerMetadataPath) return next('router');
    next();
  });
  const policy = { defaultSrc: ["'none'"], styleSrc: ["'self'"], formAction: ["'self'"], frameAncestors: ["'none'"], baseUri: ["'none'"] };
  router.use(helmet({ contentSecurityPolicy: { directives: policy } }));
  router.use((req, res, next) => { res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }); next(); });
  router.use(rateLimit({ windowMs: 60000, limit: 120 }));
  let configured;
  try { configured = mcpSettings(env, 'student-tracker'); appOrigin(env); }
  catch {
    console.warn('Student Tracker MCP is disabled: configure its HTTPS application origins and exact ChatGPT redirect URI.');
    router.use((req, res) => res.status(503).json({ error: 'Student Tracker MCP HTTPS origins are not configured.' }));
    return router;
  }
  const { origin, resource, callback } = configured;
  const issuer = origin + PREFIX;
  router.use(issuerMetadataPath, metadataHandler({
    issuer, authorization_endpoint: issuer + '/oauth/authorize', token_endpoint: issuer + '/oauth/token',
    revocation_endpoint: issuer + '/oauth/revoke', response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'], code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'], revocation_endpoint_auth_methods_supported: ['none'], scopes_supported: [SCOPE]
  }));
  router.use(metadataPath, metadataHandler({ resource: resource.href, authorization_servers: [issuer],
    scopes_supported: [SCOPE], resource_name: 'WHS Student Tracker' }));
  if (!callback) {
    console.warn('Student Tracker MCP requires STUDENT_TRACKER_MCP_REDIRECT_URI before linking.');
    router.all(MCP_PATH, (req, res) => res.status(401).set('WWW-Authenticate',
      `Bearer resource_metadata="${origin + metadataPath}", scope="${SCOPE}"`).json({ error: 'OAuth is required. Configure the exact ChatGPT callback before linking.' }));
    router.use((req, res) => res.status(503).json({ error: 'Set STUDENT_TRACKER_MCP_REDIRECT_URI to the exact ChatGPT callback in Render.' }));
    return router;
  }
  const reads = data || createStudentTrackerMcpData({ env, dbQuery });
  const provider = createReadOnlyMcpProvider({ query: dbQuery, authorizeUser: authorizeUser || reads.authorizeUser,
    origin, resource, callback, integration: 'student-tracker' });
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
      console.warn('Student Tracker MCP request origin rejected.');
      return res.status(403).json({ error: 'Unapproved MCP request origin.' });
    }
    const server = new McpServer({ name: 'whs-student-tracker', version: '1.0.0' }, {
      instructions: 'Read-only, teacher/class aggregates only. Student Tracker is authoritative. Never treat missing data as zero outstanding work, PDF rows as proof of official publication, or award recipient PDFs as completed review. No student details, writes, sync operations or Trello operations. Use pagination, returned source dates and original page links; compare stable record IDs between checks without inferring completion from disappeared rows.'
    });
    for (const tool of toolDefinitions) server.registerTool(tool.name, {
      description: tool.description, inputSchema: tool.inputSchema, outputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    }, async args => {
      try {
        const result = outputSchema.parse(await reads.read(req.auth.extra.userId, tool.name, args));
        console.info('Student Tracker MCP read', { tool: tool.name, year: result.academicYear, availability: result.availability, complete: result.complete });
        return { structuredContent: result, content: [{ type: 'text', text: JSON.stringify(result) }] };
      } catch {
        console.error('Student Tracker MCP read failed:', tool.name);
        const result = envelope(env, normalize(tool.name, args));
        result.warnings = ['The authorised audit read failed or its source is unavailable. Check current department access and the shared audit, then retry. No records were changed; this is not zero outstanding work.'];
        return { isError: true, structuredContent: result, content: [{ type: 'text', text: JSON.stringify(result) }] };
      }
    });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true,
      enableDnsRebindingProtection: true, allowedHosts: [new URL(origin).host], allowedOrigins: [origin, 'https://chatgpt.com'] });
    res.once('close', () => server.close().catch(() => console.error('Student Tracker MCP transport cleanup failed.')));
    try { await server.connect(transport); await transport.handleRequest(req, res, req.body); }
    catch {
      console.error('Student Tracker MCP transport failed.');
      if (res.headersSent) return next(new Error('Student Tracker MCP transport failed.'));
      res.status(500).json({ error: 'Student Tracker MCP request failed.' });
    }
  });
  router.use((error, req, res, next) => {
    console.error('Student Tracker MCP request rejected.');
    if (res.headersSent) return next(new Error('Student Tracker MCP request failed.'));
    res.status(error.type === 'entity.too.large' ? 413 : 500).json({ error: 'Student Tracker MCP request could not be processed.' });
  });
  return router;
}

module.exports = { createStudentTrackerMcpRouter, createStudentTrackerMcpData, toolDefinitions, outputSchema, MCP_PATH, CLIENT_ID };
