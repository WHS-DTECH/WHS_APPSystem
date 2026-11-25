const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createStudentTrackerMcpData, toolDefinitions, outputSchema } = require('../src/studentTrackerMcp');

const departmentId = 'c024dfee-5bc5-491c-b3ab-d57fd306a530';
const otherDepartment = 'f77a7253-23bf-4578-b0dc-c003fed5c299';
const owner = 'a227dd46-d2ce-4d02-a8ec-7dbd0ee9fe0c';
const key = crypto.randomBytes(32).toString('base64url');
const env = { STUDENT_TRACKER_MCP_APP_URL: 'https://tracker.example.test', STUDENT_TRACKER_MCP_BRIDGE_KEY: key };
const input = (name, args) => toolDefinitions.find(tool => tool.name === name).inputSchema.parse(args);
const digest = value => crypto.createHash('sha256').update(value).digest('base64url');

function fixture() {
  const state = { allowed: true, managed: true, staffDenied: false, actions: [], requests: [], fail: false };
  const setup = { admin: false, departments: [{ id: departmentId, name: 'Technology', canManage: true },
    { id: otherDepartment, name: 'Other department', canManage: false }] };
  const roster = { year: 2026, groups: [{ students: [{ id: 'k:123', name: 'Private, Student' }] }] };
  const fetcher = async (url, options) => {
    state.requests.push({ url, options });
    assert.equal(url, 'https://tracker.example.test/integrations/mcp/read-audit');
    assert.equal(options.redirect, 'error');
    const hash = digest(options.body);
    assert.equal(options.headers['x-whs-mcp-digest'], hash);
    assert.equal(options.headers['x-whs-mcp-signature'],
      crypto.createHmac('sha256', key).update(options.headers['x-whs-mcp-time'] +
        '\nPOST\n/integrations/mcp/read-audit\n' + hash).digest('base64url'));
    const body = JSON.parse(options.body);
    assert.deepEqual(body.departmentIds, [departmentId], 'unmanaged departments never reach the bridge');
    if (state.fail) return new Response('private source failure', { status: 503 });
    if (body.operation === 'catalogue') return Response.json({ availableYears: [2026, 2025] });
    assert.equal(body.departmentId, departmentId);
    assert.deepEqual(body.roster, roster, 'the current permission-checked roster is used, not stale snapshot permissions');
    return Response.json({ available: true, availableYears: [2026], sourceComplete: false,
      sourceUpdatedAt: { reports: '2026-11-23T01:00:00.000Z', awards: null, reviews: null },
      records: [], pagination: { offset: body.offset, limit: body.limit, total: 0, hasMore: false },
      warnings: ['Some PDF evidence is not checked.'] });
  };
  const data = createStudentTrackerMcpData({ env, fetcher, getUser: async id => state.allowed && id === owner ? { id: owner } : undefined,
    trackerService: { run: async (user, body) => {
      assert.equal(user.id, owner);
      state.actions.push(body);
      assert.ok(['setup', 'department-audit-roster'].includes(body.action), 'no mutation, student profile, or file download action is reachable');
      if (state.staffDenied) throw Object.assign(new Error('Current staff identity is not authorised.'), { status: 403 });
      if (body.action === 'setup') return { ...setup, departments: setup.departments.map(item => ({ ...item, canManage: item.canManage && state.managed })) };
      return roster;
    } } });
  return { data, state };
}

test('Tracker page discovery advertises only the actual authorised audit page and saved years', async () => {
  const { data, state } = fixture();
  assert.equal((await data.authorizeUser(owner)).id, owner);
  const result = outputSchema.parse(await data.read(owner, 'list_available_pages', input('list_available_pages', { year: 2026 })));
  assert.equal(result.pages.length, 1);
  assert.equal(result.pages[0].id, 'department-awards-audit');
  assert.deepEqual(result.pages[0].availableYears, [2026, 2025]);
  assert.deepEqual(result.pages[0].departments.map(item => item.id), [departmentId]);
  assert.ok(result.pages[0].availableFilters.includes('band'));
  assert.equal(result.sourceUrl, 'https://tracker.example.test/department-awards-audit?year=2026');
  assert.equal(result.academicYear, 2026);
  assert.equal(result.complete, true);
  assert.equal(result.freshnessVerified, false);
  assert.equal(state.actions.some(action => action.action === 'department-audit-roster'), false, 'catalogue needs no student data');
});

test('Tracker reads use the current verified department roster and preserve applicable filters and source provenance', async () => {
  const { data, state } = fixture();
  for (const name of ['get_page_data', 'search_records', 'get_audit_status']) {
    const args = input(name, { year: 2026, teacher: 'VP', subject: 'DTECH', classCode: 'JPI-PIDTECH', band: 'junior', semester: 2, limit: 25, offset: 5 });
    const result = outputSchema.parse(await data.read(owner, name, args));
    const sent = JSON.parse(state.requests.at(-1).options.body);
    assert.equal(sent.filters.teacher, 'VP');
    assert.equal(sent.filters.subject, 'DTECH');
    assert.equal(sent.filters.classCode, 'JPI-PIDTECH');
    assert.equal(sent.filters.band, 'junior');
    assert.equal(sent.filters.semester, 2);
    assert.equal(sent.filters.followUpOnly, name === 'search_records');
    assert.equal(sent.filters.part, name === 'search_records' ? 'reporting' : 'all');
    assert.equal(result.appliedFilters.departmentId, departmentId);
    assert.equal(result.pagination.offset, 5);
    assert.equal(result.pagination.limit, 25);
    assert.equal(result.sourceUpdatedAt.reports, '2026-11-23T01:00:00.000Z');
    assert.equal(result.complete, false);
    const json = JSON.stringify(result);
    for (const value of ['Private, Student', 'k:123', key, 'canManage', 'moduleToken']) assert.equal(json.includes(value), false);
  }
});

test('Tracker refuses unmanaged departments and rechecks account and HoLA authority on every access', async () => {
  const { data, state } = fixture();
  await assert.rejects(() => data.read(owner, 'get_page_data', input('get_page_data', { year: 2026, departmentId: otherDepartment })), /authorised department/);
  assert.equal(state.requests.length, 0);
  state.managed = false;
  assert.equal(await data.authorizeUser(owner), undefined);
  await assert.rejects(() => data.read(owner, 'get_page_data', input('get_page_data', { year: 2026 })), /management access/);
  assert.equal(state.requests.length, 0);
  state.managed = true;
  state.staffDenied = true;
  assert.equal(await data.authorizeUser(owner), undefined, 'an existing Tracker staff-denial is an access denial, not an available empty audit');
  state.allowed = false;
  assert.equal(await data.authorizeUser(owner), undefined);
});

test('Tracker rejects upstream failure and unexpected private output instead of silently reporting an empty successful audit', async () => {
  const { data, state } = fixture();
  state.fail = true;
  await assert.rejects(() => data.read(owner, 'get_audit_status', input('get_audit_status', { year: 2026 })), /source is unavailable/);
  const unsafe = createStudentTrackerMcpData({ env, getUser: async () => ({ id: owner }),
    trackerService: { run: async () => ({ admin: true, departments: [{ id: departmentId, name: 'Technology' }] }) },
    fetcher: async () => Response.json({ availableYears: [2026], students: [{ name: 'Private, Student' }] }) });
  await assert.rejects(() => unsafe.read(owner, 'list_available_pages', input('list_available_pages', {})));
});
