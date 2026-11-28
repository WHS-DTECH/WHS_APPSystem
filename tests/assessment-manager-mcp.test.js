const test = require('node:test');
const assert = require('node:assert/strict');
const { createAssessmentManagerMcpData } = require('../src/assessmentManagerMcpData');

const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const departmentId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const env = { APP_BASE_URL: 'https://school.example.test' };
const user = { id: owner, email: 'teacher@westlandhigh.school.nz', roles: ['Teacher'] };

test('department summaries recheck authority and return only scoped aggregate PDF counts', async () => {
  let allowed = true, queries = 0, changeRoster = false, calls = 0;
  const department = { id: departmentId, name: 'Technology', courses: ['11DTECH'],
    unavailableClassCount: 1, identityMemberships: [{ studentIds: ['secret student'] }] };
  const data = createAssessmentManagerMcpData({ env, getUser: async () => allowed ? user : undefined,
    trackerService: { seniorAudit: async () => ({ students: [{ name: 'secret student' }],
      departments: changeRoster && ++calls % 2 === 0 ? [] : [department] }) },
    assessmentQuery: async (sql, params) => {
      queries++;
      assert.match(sql, /^SELECT /);
      assert.deepEqual(params, [2026, departmentId]);
      return { rows: [{ completed_at: '2026-01-01T00:00:00Z', entries: [
        { course: '11DTECH', number: '92004', version: '2', students: 10, enrolled: null, published: null, external: false, name: 'secret student' },
        { course: '11DTECH', number: '92005', version: '1', students: 10, enrolled: 5, published: 4, external: true },
        { course: '11FURN', number: '92006', version: '1', students: 8, enrolled: 8, published: 8, external: false }
      ] }] };
    } });
  const result = await data.read(owner, 'get_enrolment_summary', { year: 2026, departmentId });
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].enrolled, null);
  assert.equal(result.entries[0].published, null);
  assert.doesNotMatch(JSON.stringify(result), /secret student|11FURN|92005/);
  assert.match(result.warnings.join(' '), /unavailable/);
  await assert.rejects(() => data.read(owner, 'get_enrolment_summary',
    { year: 2026, departmentId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' }), /department access/);
  assert.equal(queries, 1);
  changeRoster = true;
  await assert.rejects(() => data.read(owner, 'get_enrolment_summary', { year: 2026, departmentId }), /rosters changed/);
  assert.equal(queries, 2);
  allowed = false;
  await assert.rejects(() => data.read(owner, 'list_audit_departments', { year: 2026 }), /access/);
  assert.equal(queries, 2);
});

test('senior audit returns only aggregate reconciliation information and fails if the roster changes', async () => {
  let changes = false, calls = 0;
  const data = createAssessmentManagerMcpData({ env, getUser: async () => user,
    trackerService: { seniorAudit: async () => ({ teachers: [], groups: [], unavailableClassCount: changes ? calls++ : 0 }) },
    assessmentQuery: async sql => {
      assert.match(sql, /^SELECT /);
      return { rows: [] };
    } });
  const result = await data.read(owner, 'get_senior_audit_summary', { year: 2026 });
  assert.equal(result.syncedAt, null);
  assert.equal(result.sourcesComplete, false);
  assert.match(result.warnings.join(' '), /No completed sync/);
  changes = true;
  await assert.rejects(() => data.read(owner, 'get_senior_audit_summary', { year: 2026 }), /rosters changed/);
});

test('enrolment counts preserve unknown classifications, paginate and reject unsafe identifiers', async () => {
  const department = { id: departmentId, name: 'Technology', courses: ['11DTECH'], unavailableClassCount: 0 };
  const entries = [
    { course: '11DTECH', number: '92004', version: '2', students: 10, enrolled: null, published: null },
    { course: '11DTECH', number: '92005', version: '1', students: 10, enrolled: 5, published: 4, external: false }
  ];
  const data = createAssessmentManagerMcpData({ env, getUser: async () => user,
    trackerService: { seniorAudit: async () => ({ departments: [department] }) },
    assessmentQuery: async () => ({ rows: [{ entries, completed_at: '2026-01-01T00:00:00Z' }] }) });
  const first = await data.read(owner, 'get_enrolment_summary', { year: 2026, departmentId, limit: 1 });
  assert.equal(first.hasMore, true);
  assert.equal(first.entries[0].external, null);
  assert.match(first.warnings.join(' '), /classification is missing/);
  const second = await data.read(owner, 'get_enrolment_summary', { year: 2026, departmentId, limit: 1, offset: 1 });
  assert.equal(second.entries[0].number, '92005');
  assert.equal(second.hasMore, false);
  entries[0].number = 'student name';
  await assert.rejects(() => data.read(owner, 'get_enrolment_summary', { year: 2026, departmentId }));
});

test('real PostgreSQL resource and owner summaries exclude student records, notes and deleted resources', {
  skip: !process.env.ASSESSMENT_MCP_TEST_DATABASE_URL
}, async t => {
  const { Client } = require('pg');
  const client = new Client({ connectionString: process.env.ASSESSMENT_MCP_TEST_DATABASE_URL, ssl: false });
  await client.connect();
  t.after(() => client.end());
  await client.query(`CREATE TEMP TABLE assessment_resource_library (id uuid,content jsonb,deleted_at timestamptz);
    CREATE TEMP TABLE assessment_records (owner_id uuid,year integer,entry_key text,parent_record text,content jsonb,updated_at timestamptz);
    INSERT INTO assessment_resource_library VALUES
      ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','{"title":"Resource","standards":[{"number":"92004","version":"2"}],"notes":"secret student"}',NULL),
      ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','{"title":"Deleted","standards":[]}',now())`);
  await client.query(`INSERT INTO assessment_records VALUES
      ($1,2026,'11111111-1111-4111-8111-111111111111',NULL,
       '{"standardNumber":"92004","version":"2","course":"11DTECH, 12DTECH","internal":"{\\"consent\\":\\"Yes\\",\\"evaluationComments\\":\\"secret student\\"}"}',now()),
      ($1,2026,'22222222-2222-4222-8222-222222222222',NULL,'{"studentName":"secret student"}',now()),
      ($1,2026,'33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','{}',now()),
      ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',2026,'44444444-4444-4444-8444-444444444444',NULL,'{"standardNumber":"92005"}',now())`, [owner]);
  const data = createAssessmentManagerMcpData({ env, getUser: async () => user,
    assessmentQuery: (...args) => client.query(...args), trackerService: {} });
  const resources = await data.read(owner, 'search_assessment_resources', {});
  assert.deepEqual(resources.resources.map(item => item.title), ['Resource']);
  const records = await data.read(owner, 'list_my_assessments', { year: 2026 });
  assert.equal(records.records.length, 1);
  assert.equal(records.records[0].standardNumber, '92004');
  assert.equal(records.records[0].course, '11DTECH, 12DTECH');
  assert.equal(records.records[0].moderation.consent, 'Yes');
  assert.doesNotMatch(JSON.stringify({ resources, records }), /secret student|92005|evaluationComments/);
});
