const { Pool } = require('pg');
const { z } = require('zod');
const { databaseOptions } = require('./modules/assessmentManager');
const { authorisedModuleUser } = require('./moduleIdentity');
const { createStudentTrackerService } = require('./studentTracker');
const { query: coreQuery } = require('./db');
const { query: kamarQuery } = require('./legacy/kamar-uploader/db');
const { reconcileSeniorAudit } = require('./legacy/assessment-manager/seniorAuditMatch');
const { canonical } = require('./legacy/assessment-manager/seniorAudit');
const config = require('./config');

const year = z.number().int().min(2000).max(2100);
const paging = { offset: z.number().int().min(0).max(100000).default(0), limit: z.number().int().min(1).max(50).default(25) };
const inputSchemas = {
  search_assessment_resources: z.object({ query: z.string().trim().max(100).default(''), ...paging }).strict(),
  list_my_assessments: z.object({ year, ...paging }).strict(),
  list_audit_departments: z.object({ year }).strict(),
  get_enrolment_summary: z.object({ year, departmentId: z.string().uuid(), ...paging }).strict(),
  get_senior_audit_summary: z.object({ year }).strict()
};
const text = z.string().max(500).nullable();
const standard = z.object({ number: z.string().regex(/^\d{4,8}$/), version: z.string().regex(/^\d{1,3}$/),
  title: text, level: text, credits: text }).strict();
const outputSchemas = {
  search_assessment_resources: z.object({ resources: z.array(z.object({
    id: z.string().uuid(), title: text, edition: text, department: text, subject: text, status: text,
    standards: z.array(standard), url: z.string().url()
  }).strict()), offset: z.number(), limit: z.number(), hasMore: z.boolean() }).strict(),
  list_my_assessments: z.object({ year, records: z.array(z.object({
    id: z.string().uuid(), standardNumber: text, version: text, level: text, course: text,
    moderation: z.record(z.string(), z.enum(['', 'Yes', 'No', 'Not applicable'])), updatedAt: z.string(), url: z.string().url()
  }).strict()), offset: z.number(), limit: z.number(), hasMore: z.boolean() }).strict(),
  list_audit_departments: z.object({ year, departments: z.array(z.object({
    id: z.string().uuid(), name: z.string(), unavailableClassCount: z.number().int().nonnegative()
  }).strict()) }).strict(),
  get_enrolment_summary: z.object({ year, department: z.string(), syncedAt: z.string().nullable(),
    entries: z.array(z.object({ course: z.string(), number: z.string(), version: z.string(),
      external: z.boolean().nullable(), students: z.number().nullable(), enrolled: z.number().nullable(),
      published: z.number().nullable() }).strict()), offset: z.number(), limit: z.number(), hasMore: z.boolean(),
    warnings: z.array(z.string()), url: z.string().url() }).strict(),
  get_senior_audit_summary: z.object({ year, syncedAt: z.string().nullable(), sourcesComplete: z.boolean(),
    workbookLoaded: z.boolean(), classResponsibilities: z.number(), markbooks: z.number(),
    conflictingMarkbooks: z.number(), unresolvedPdfRows: z.number(), unresolvedWorkbookRows: z.number(),
    unavailableClassCount: z.number(), warnings: z.array(z.string()), url: z.string().url() }).strict()
};

function createAssessmentManagerMcpData({ env = process.env, dbQuery = coreQuery, directoryQuery = kamarQuery,
  assessmentQuery, getUser = id => authorisedModuleUser(id, 'whs-assessment-manager', dbQuery), trackerService } = {}) {
  let pool;
  const query = assessmentQuery || ((...args) => {
    if (!pool) {
      pool = new Pool(databaseOptions(env, env.DATABASE_URL));
      pool.on('error', () => console.error('Assessment Manager MCP database connection failed.'));
    }
    return pool.query(...args);
  });
  const tracker = trackerService || createStudentTrackerService({ dbQuery, directoryQuery, env });
  const origin = new URL(env.APP_BASE_URL || env.RENDER_EXTERNAL_URL || config.appBaseUrl).origin;
  const link = params => origin + '/whs-assessment-manager/#' + new URLSearchParams(params);
  const safe = (value, pattern) => typeof value === 'string' && pattern.test(value) ? value : null;
  const short = value => typeof value === 'string' && value.length <= 500 ? value : null;
  const stamp = value => value ? new Date(value).toISOString() : null;
  async function authorizeUser(id) {
    const user = await getUser(id);
    const domain = String(env.GOOGLE_HOSTED_DOMAIN || 'westlandhigh.school.nz').toLowerCase();
    return user && String(user.email || '').trim().toLowerCase().endsWith('@' + domain) &&
      user.roles?.some(role => ['ADMIN', 'Teacher'].includes(role)) ? user : undefined;
  }
  async function roster(user, year) {
    return tracker.seniorAudit(user, { year, action: 'students-audit-roster' });
  }
  async function read(id, name, args) {
    const user = await authorizeUser(id);
    if (!user) throw new Error('Current Assessment Manager access is required.');
    const input = inputSchemas[name]?.parse(args);
    if (!input) throw new Error('Unknown Assessment Manager read.');
    let result;
    if (name === 'search_assessment_resources') {
      const { rows } = await query(`SELECT id,content->>'title' AS title,content->>'edition' AS edition,
        content->>'department' AS department,content->>'subject' AS subject,content->>'status' AS status,
        content->'standards' AS standards FROM assessment_resource_library
        WHERE deleted_at IS NULL AND ($1='' OR strpos(lower(concat_ws(' ',content->>'title',
          content->>'department',content->>'subject',content->>'edition',content->'standards')),lower($1))>0)
        ORDER BY lower(content->>'title'),id LIMIT $2 OFFSET $3`, [input.query, input.limit + 1, input.offset]);
      result = { resources: rows.slice(0, input.limit).map(row => ({
        id: row.id, title: short(row.title), edition: short(row.edition), department: short(row.department),
        subject: short(row.subject), status: short(row.status),
        standards: (Array.isArray(row.standards) ? row.standards : []).map(item => ({
          number: item.number, version: item.version, title: short(item.title), level: short(item.level), credits: short(item.credits)
        })), url: link({ section: 'library', record: row.id })
      })), offset: input.offset, limit: input.limit, hasMore: rows.length > input.limit };
    } else if (name === 'list_my_assessments') {
      const { rows } = await query(`SELECT entry_key,updated_at,content->>'standardNumber' AS number,
        content->>'version' AS version,content->>'level' AS level,content->>'course' AS course,
        content->>'internal' AS internal FROM assessment_records
        WHERE owner_id=$1 AND year=$2 AND entry_key<>'main' AND parent_record IS NULL
          AND COALESCE(content->>'parentRecord','')='' AND COALESCE(content->>'studentName','')=''
          AND COALESCE(content->>'studentId','')='' AND COALESCE(content->>'additionalMarking','')<>'Yes'
        ORDER BY updated_at DESC,entry_key LIMIT $3 OFFSET $4`, [id, input.year, input.limit + 1, input.offset]);
      const keys = ['consent', 'moderatorReport', 'conditions', 'externalFeedback', 'previousCritique',
        'context', 'allGrades', 'scheduleConsistent', 'instructionsConsistent', 'judgements',
        'evidenceStatements', 'clearInstructions', 'standardDetails', 'resultsLoaded', 'retained', 'randomSelection', 'reviewed', 'benchmarks'];
      result = { year: input.year, records: rows.slice(0, input.limit).map(row => {
        const internal = row.internal ? JSON.parse(row.internal) : {};
        const moderation = Object.fromEntries(keys.filter(key => ['', 'Yes', 'No', 'Not applicable'].includes(internal[key]))
          .map(key => [key, internal[key]]));
        return { id: row.entry_key, standardNumber: safe(row.number, /^\d{4,8}$/), version: safe(row.version, /^\d{1,3}$/),
          level: safe(row.level, /^(?:[1-9]|10)$/),
          course: safe(row.course, /^(?:9|10|11|12|13)[A-Z][A-Z0-9_-]{0,20}(?:, (?:9|10|11|12|13)[A-Z][A-Z0-9_-]{0,20}){0,29}$/),
          moderation, updatedAt: stamp(row.updated_at),
          url: link({ year: String(input.year), section: 'moderation', record: row.entry_key, page: 'overview' }) };
      }), offset: input.offset, limit: input.limit, hasMore: rows.length > input.limit };
    } else if (name === 'list_audit_departments') {
      const current = await roster(user, input.year);
      result = { year: input.year, departments: current.departments.map(item => ({
        id: item.id, name: item.name, unavailableClassCount: item.unavailableClassCount
      })) };
    } else if (name === 'get_enrolment_summary') {
      const current = await roster(user, input.year);
      const department = current.departments.find(item => item.id === input.departmentId);
      if (!department) throw new Error('Current department access is required.');
      const saved = (await query(`SELECT entries,completed_at FROM students_audit_sync
        WHERE assessment_year=$1 AND department_id=$2`, [input.year, department.id])).rows[0];
      const checked = await roster(user, input.year);
      if (JSON.stringify(canonical(current)) !== JSON.stringify(canonical(checked))) throw new Error('Audit access or rosters changed; retry.');
      const allowed = new Set(department.courses);
      const entries = (saved?.entries || []).filter(entry => allowed.has(entry.course) && entry.external !== true);
      const numeric = value => value === null ? null : z.number().int().nonnegative().parse(value);
      const digits = z.string().regex(/^\d{1,20}$/);
      result = { year: input.year, department: department.name, syncedAt: stamp(saved?.completed_at),
        entries: entries.slice(input.offset, input.offset + input.limit).map(entry => ({
          course: z.string().regex(/^[A-Z0-9]{1,30}$/).parse(entry.course),
          number: digits.parse(entry.number), version: digits.parse(entry.version),
          external: typeof entry.external === 'boolean' ? entry.external : null,
          students: numeric(entry.students), enrolled: numeric(entry.enrolled), published: numeric(entry.published)
        })), offset: input.offset, limit: input.limit, hasMore: input.offset + input.limit < entries.length,
        warnings: [
          ...(!saved ? ['No Enrolled List has been synced; this is not a completed audit.'] : []),
          ...(entries.some(entry => typeof entry.external !== 'boolean') ? ['External classification is missing for some entries; resync before relying on these totals.'] : []),
          ...(department.unavailableClassCount ? ['Some department class links are unavailable.'] : []),
          'Counts are saved PDF evidence, not individual enrolment or grade verification. Blank counts are not zero; review duplicate or missing standards in Assessment Manager.'
        ], url: link({ year: String(input.year), section: 'audit', page: 'enrolment-summary' }) };
    } else {
      const current = await tracker.seniorAudit(user, { year: input.year, action: 'senior-audit-roster' });
      const [saved, decisions, sync] = await Promise.all([
        query('SELECT source AS file,report FROM senior_audit_reports WHERE assessment_year=$1', [input.year]),
        query('SELECT student_id,standard_number,standard_version,not_enrolled,revision FROM senior_audit_enrolment WHERE assessment_year=$1', [input.year]),
        query(`SELECT reports,workbook_entries,sources_complete,automatic_enrolment_ready,completed_at
          FROM senior_audit_sync WHERE assessment_year=$1 AND owner_id=$2`, [input.year, id])
      ]);
      const snapshot = sync.rows[0];
      const checked = await tracker.seniorAudit(user, { year: input.year, action: 'senior-audit-roster' });
      if (JSON.stringify(canonical(current)) !== JSON.stringify(canonical(checked))) throw new Error('Audit access or rosters changed; retry.');
      const reconciled = reconcileSeniorAudit({ roster: current, reports: snapshot?.reports || saved.rows,
        entries: snapshot?.workbook_entries || [], decisions: decisions.rows,
        workbookConfirmed: Array.isArray(snapshot?.workbook_entries), sourcesComplete: Boolean(snapshot?.sources_complete),
        automaticNotEnrolled: Boolean(snapshot?.automatic_enrolment_ready) });
      const books = reconciled.groups.flatMap(group => group.markbooks);
      result = { year: input.year, syncedAt: stamp(snapshot?.completed_at), sourcesComplete: reconciled.sourcesComplete,
        workbookLoaded: reconciled.workbookConfirmed, classResponsibilities: reconciled.groups.length,
        markbooks: books.length, conflictingMarkbooks: books.filter(book => book.conflict).length,
        unresolvedPdfRows: reconciled.unresolved, unresolvedWorkbookRows: reconciled.unresolvedWorkbook,
        unavailableClassCount: reconciled.unavailableClassCount,
        warnings: ['Counts describe class/standard responsibilities, not unique students or proof of completed enrolment.',
          ...(!snapshot ? ['No completed sync exists for this account.'] : []),
          ...(!reconciled.sourcesComplete ? ['PDF sources are incomplete or have not been verified.'] : []),
          ...(!reconciled.workbookConfirmed ? ['The workbook has not been compared for this account.'] : [])],
        url: link({ year: String(input.year), section: 'audit', page: 'department-standards' }) };
    }
    return outputSchemas[name].parse(result);
  }
  return { authorizeUser, read };
}

module.exports = { createAssessmentManagerMcpData, inputSchemas, outputSchemas };
