const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://x:x@localhost:1/x';

const registered = {
  id: 'project', slug: 'guidance-counsellor-app', hub_key: 'app-guidance-counsellor-app',
  name: 'Guidance', owner_user_id: 'builder', client_user_id: 'client',
  status: 'active', roles_mapped_at: '2026-10-17', app_roles: ['Builder', 'Lead Teacher'],
  created_at: '2024-03-01T00:00:00Z', last_updated_at: '2024-03-01T00:00:00Z',
  hosted_content_hash: null
};
let statements = [];
let failInsert = false;

async function query(sql, params = []) {
  statements.push({ sql, params });
  if (sql.includes('FROM staff_upload staff')) return { rows: [{ email: 'client@example.invalid', display_name: 'Client Teacher' }] };
  if (sql.startsWith('SELECT id FROM users')) return { rows: [{ id: 'client' }], rowCount: 1 };
  if (sql.includes('INSERT INTO student_apps')) return { rows: [{ ...registered, status: 'pending' }] };
  if (sql.startsWith('SELECT * FROM student_apps WHERE slug')) return { rows: [registered] };
  if (sql.includes('SET hosted_content_hash = $2')) {
    registered.hosted_content_hash = params[1];
    registered.last_updated_at = '2026-10-17T00:00:00Z';
    return { rows: [{ last_updated_at: registered.last_updated_at }] };
  }
  if (sql.startsWith('SELECT COUNT(*)')) return { rows: [{ count: 2 }] };
  if (sql.startsWith('SELECT id, display_name, email FROM users')) {
    return { rows: [
      { id: 'builder', display_name: 'Student Builder', email: 'builder@example.invalid' },
      { id: 'client', display_name: 'Client Teacher', email: 'client@example.invalid' }
    ] };
  }
  if (sql.includes('SELECT hub_roles.role_key')) {
    return { rows: [{ role_key: params[0] === 'lead' ? 'lead-teacher' : params[0] }] };
  }
  if (sql.startsWith('SELECT platform_role, app_role FROM student_app_role_map')) {
    return { rows: Object.entries(roleConfig(registered.slug).defaults).map(([platform_role, app_role]) => ({ platform_role, app_role })) };
  }
  if (sql.startsWith('INSERT INTO student_app_role_map') && failInsert) throw new Error('insert failed');
  return { rows: [], rowCount: 0 };
}

require.cache[require.resolve('../src/db')] = {
  exports: {
    query,
    pool: {
      connect: async () => ({ query, release() { statements.push({ sql: 'RELEASE' }); } })
    }
  }
};
require.cache[require.resolve('../src/email')] = { exports: { sendEmail: async () => ({ ok: true }) } };
const { router, hostedProxy, resolveAppRole, datasetManagerUrl } = require('../src/studentApps');
const hostedApps = require('../src/hostedApps');
const { roleConfig, contentHash } = hostedApps;
hostedApps.proxy = (req, res) => res.json({ footer: res.locals.studentAppFooter });

let server;
test.before(async () => {
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.use((req, res, next) => {
    const id = req.get('x-test-user') || 'builder';
    req.user = { id, roles: id === 'admin' ? ['ADMIN'] : [] };
    req.isAuthenticated = () => true;
    res.render = (view, model) => res.json({ view, ...model });
    next();
  });
  app.use('/student-apps', router);
  app.use('/apps/:slug', hostedProxy);
  app.use((error, req, res, next) => res.status(500).json({ error: error.message }));
  server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
});
test.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
test.beforeEach(() => { statements = []; failInsert = false; });

async function saveAs(user, body) {
  return fetch(`http://127.0.0.1:${server.address().port}/student-apps/${registered.slug}/roles`, {
    method: 'POST', headers: { 'x-test-user': user, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body), redirect: 'manual'
  });
}

test('Guidance defaults distinguish system administrator, Builder and full-access client', () => {
  assert.deepEqual(roleConfig(registered.slug).defaults, { admin: 'ADMIN', builder: 'AppBuilder', 'lead-teacher': 'ADMIN', teacher: 'Counsellor', technician: 'Counsellor' });
  assert.deepEqual(roleConfig('external-project').defaults, {});
});

test('Dataset Manager menu access follows active Guidance role mappings', async () => {
  for (const id of ['admin', 'builder', 'lead', 'student']) {
    const user = { id, roles: id === 'admin' ? ['ADMIN'] : [] };
    assert.equal(await datasetManagerUrl(user, registered.slug),
      id === 'student' ? null : '/apps/guidance-counsellor-app/infrastructure');
    assert.equal(await datasetManagerUrl(user, 'other-app'), null);
  }
  const oldStatus = registered.status;
  try {
    registered.status = 'pending';
    assert.equal(await datasetManagerUrl({ id: 'admin', roles: ['ADMIN'] }, registered.slug), null);
  } finally {
    registered.status = oldStatus;
  }
});

test('registration automatically assigns the Builder, chosen client and Guidance mappings', async () => {
  const response = await fetch(`http://127.0.0.1:${server.address().port}/student-apps/new`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ name: 'Guidance Counsellor App', client_id: 'client@example.invalid', roles: 'lead-teacher' }),
    redirect: 'manual'
  });
  assert.equal(response.status, 302);
  const assigned = statements.filter(({ sql }) => sql.includes('INSERT INTO user_hub_roles'));
  assert.deepEqual(assigned.map(({ params }) => [params[0], params[3]]), [['builder', 'builder'], ['client', 'lead-teacher']]);
  const mappings = statements.filter(({ sql }) => sql.startsWith('INSERT INTO student_app_role_map'));
  assert.deepEqual(mappings.map(({ params }) => params.slice(1)), [
    ['admin', 'ADMIN'], ['builder', 'AppBuilder'], ['lead-teacher', 'ADMIN'], ['teacher', 'Counsellor'], ['technician', 'Counsellor']
  ]);
});

test('the client can open setup to manage access, while the Builder sees it read-only', async () => {
  for (const user of ['client', 'builder']) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/student-apps/${registered.slug}`, {
      headers: { 'x-test-user': user }
    });
    assert.equal(response.status, 200);
    const model = await response.json();
    assert.equal(model.canEditRoles, user === 'client');
    assert.equal(model.appClient.email, 'client@example.invalid');
    assert.equal(model.builder.email, 'builder@example.invalid');
  }
});

test('Builder cannot enable optional access by posting directly', async () => {
  const response = await saveAs('builder', { map_student: 'ADMIN' });
  assert.equal(response.status, 403);
  assert.equal(statements.some(({ sql }) => /DELETE|INSERT|UPDATE/.test(sql)), false);
});

test('client, administrator and assigned Lead Teacher can configure optional access', async () => {
  for (const user of ['client', 'admin', 'lead']) {
    statements = [];
    const response = await saveAs(user, { map_teacher: 'Counsellor', map_builder: 'ADMIN', map_admin: 'AppBuilder' });
    assert.equal(response.status, 302);
    const inserts = statements.filter(({ sql }) => sql.startsWith('INSERT INTO student_app_role_map'));
    assert.deepEqual(inserts.map(({ params }) => params.slice(1)), [
      ['admin', 'ADMIN'], ['builder', 'AppBuilder'], ['lead-teacher', 'ADMIN'], ['teacher', 'Counsellor'], ['technician', 'Counsellor']
    ]);
    assert.ok(statements.some(({ sql }) => sql === 'COMMIT'));
  }
});

test('unrecognised Guidance app roles are rejected before deleting saved mappings', async () => {
  const response = await saveAs('client', { map_student: 'UnknownRole' });
  assert.equal(response.status, 400);
  assert.equal(statements.some(({ sql }) => sql.startsWith('DELETE')), false);
});

test('Teacher mapping remains configurable and Technician always follows it', async () => {
  let response = await saveAs('lead', { map_teacher: 'AppBuilder', map_technician: 'ADMIN' });
  assert.equal(response.status, 302);
  let inserts = statements.filter(({ sql }) => sql.startsWith('INSERT INTO student_app_role_map'));
  assert.deepEqual(inserts.slice(-2).map(({ params }) => params.slice(1)), [
    ['teacher', 'AppBuilder'], ['technician', 'AppBuilder']
  ]);
  statements = [];
  response = await saveAs('lead', { map_teacher: '', map_technician: 'ADMIN' });
  assert.equal(response.status, 302);
  inserts = statements.filter(({ sql }) => sql.startsWith('INSERT INTO student_app_role_map'));
  assert.deepEqual(inserts.map(({ params }) => params[1]), ['admin', 'builder', 'lead-teacher']);
});

test('saving blank optional roles preserves standard staff defaults and leaves Student disabled', async () => {
  const response = await saveAs('client', {});
  assert.equal(response.status, 302);
  assert.equal(statements.filter(({ sql }) => sql.startsWith('INSERT INTO student_app_role_map')).length, 5);
});

test('a failed save rolls back and releases its database connection', async () => {
  failInsert = true;
  const response = await saveAs('client', { map_teacher: 'Counsellor' });
  assert.equal(response.status, 500);
  assert.ok(statements.some(({ sql }) => sql === 'ROLLBACK'));
  assert.ok(statements.some(({ sql }) => sql === 'RELEASE'));
  assert.equal(statements.some(({ sql }) => sql === 'COMMIT'), false);
});

test('sign-in uses stored role mappings and denies unmapped optional roles', async () => {
  assert.equal(await resolveAppRole(registered, ['admin']), 'ADMIN');
  assert.equal(await resolveAppRole(registered, ['builder']), 'AppBuilder');
  assert.equal(await resolveAppRole(registered, ['lead-teacher']), 'ADMIN');
  assert.equal(await resolveAppRole(registered, ['teacher']), 'Counsellor');
  assert.equal(await resolveAppRole(registered, ['technician']), 'Counsellor');
  assert.equal(await resolveAppRole(registered, ['student']), null);
});

test('app content has a stable hash across repeated requests', () => {
  assert.match(contentHash(registered.slug), /^[a-f0-9]{64}$/);
  assert.equal(contentHash(registered.slug), contentHash(registered.slug));
  assert.throws(() => contentHash('unknown-project'), /Unknown hosted app/);
});

test('footer preserves registration year and changes its update date only for changed app content', async () => {
  registered.hosted_content_hash = null;
  const url = `http://127.0.0.1:${server.address().port}/apps/${registered.slug}/dashboard`;
  for (let i = 0; i < 2; i += 1) {
    const response = await fetch(url, { headers: { 'x-test-user': 'admin' } });
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).footer, {
      registeredAt: '2024-03-01T00:00:00Z', updatedAt: '2026-10-17T00:00:00Z'
    });
  }
  assert.equal(statements.filter(({ sql }) => sql.includes('SET hosted_content_hash = $2')).length, 1);
  registered.hosted_content_hash = 'old-version';
  await fetch(url, { headers: { 'x-test-user': 'admin' } });
  assert.equal(statements.filter(({ sql }) => sql.includes('SET hosted_content_hash = $2')).length, 2);
});
