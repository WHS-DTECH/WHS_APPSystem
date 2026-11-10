const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const session = require('express-session');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { Pool } = require('pg');
const { createHelpdeskRouters, faultInput } = require('../src/helpdesk');
const { faultModules } = require('../src/faultPages');

const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const other = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const admin = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const body = { subject: 'Launchpad will not open', appName: 'Launchpad',
  moduleKey: 'launchpad', pageUrl: '/launchpad', description: 'Clicked the completion email link. The page did not open.' };

async function fixture(t, queryOverride, options = {}) {
  const tickets = new Map(), calls = [], emails = [];
  let failed = false;
  const dbQuery = async (sql, params) => {
    calls.push({ sql, params });
    if (failed) throw new Error('Synthetic database unavailable');
    if (sql.startsWith('INSERT')) {
      const ticket = { id: params[0], reporter_id: params[1], ticket_type: params[2], subject: params[3], app_name: params[4],
        page_url: params[5], description: params[6], ticket_number: String(tickets.size + 1), status: 'open', reply: '',
        revision: 1, created_at: new Date('2026-11-05T01:00:00Z'), updated_at: new Date('2026-11-05T01:00:00Z'),
        reporter_name: 'Synthetic Teacher', reporter_email: 'teacher@example.test' };
      tickets.set(ticket.id, ticket);
      return { rows: [{ id: ticket.id, ticket_number: ticket.ticket_number }] };
    }
    if (sql.startsWith('UPDATE')) {
      assert.match(sql, /WHERE id=\$1 AND revision=\$5/);
      const ticket = tickets.get(params[0]);
      if (!ticket || ticket.revision !== params[4]) return { rows: [] };
      Object.assign(ticket, { status: params[1], reply: params[2], updated_by: params[3], revision: ticket.revision + 1 });
      return { rows: [{ id: ticket.id }] };
    }
    if (sql.includes('WHERE f.id=$1')) {
      assert.match(sql, /\$2::uuid IS NULL OR f.reporter_id=\$2/);
      const ticket = tickets.get(params[0]);
      return { rows: ticket && (params[1] === null || ticket.reporter_id === params[1]) ? [ticket] : [] };
    }
    assert.match(sql, /\$1::uuid IS NULL OR f.reporter_id=\$1/);
    assert.match(sql, /LIMIT 26 OFFSET \$3/);
    return { rows: [...tickets.values()].filter(ticket => (!params[0] || ticket.reporter_id === params[0]) &&
      (!params[1] || ticket.status === params[1])).slice(params[2], params[2] + 26) };
  };
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));
  app.use(express.urlencoded({ extended: false }));
  app.use(session({ secret: 'synthetic-helpdesk-session', resave: false, saveUninitialized: false }));
  app.use((req, res, next) => {
    const id = req.get('x-user');
    req.user = id ? { id, email: 'teacher@example.test', roles: id === admin ? ['ADMIN'] : ['Teacher'],
      is_active: req.get('x-inactive') !== 'true' } : null;
    res.locals.activeRole = id === admin ? 'ADMIN' : 'Teacher';
    next();
  });
  const routers = createHelpdeskRouters({ dbQuery: queryOverride || dbQuery,
    modulesForUser: async user => faultModules(user, async () => ({ rows: [
      { module_key: 'teacher-planner', display_name: 'Teacher Planner', path: '/teacher-planner/',
        is_active: true, has_access: true }
    ] })),
    deliver: async email => { emails.push(email); return { ok: true }; }, ...options });
  app.use('/faults', routers.faults);
  app.use('/admin/helpdesk', routers.helpdesk);
  app.use((error, _req, res, _next) => res.status(500).send(error.message));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = 'http://127.0.0.1:' + server.address().port;
  async function login(id) {
    const page = await fetch(base + '/faults/new', { headers: { 'x-user': id } });
    return { headers: { 'x-user': id, cookie: page.headers.get('set-cookie').split(';')[0] },
      csrf: (await page.text()).match(/name="csrf" value="([^"]+)"/)[1] };
  }
  const get = (url, auth = {}) => fetch(base + url, { headers: auth.headers || {}, redirect: 'manual' });
  const post = (url, values, auth) => fetch(base + url, { method: 'POST', redirect: 'manual',
    headers: { ...auth.headers, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrf: auth.csrf, ...values }) });
  return { get, post, login, tickets, calls, emails, fail() { failed = true; } };
}

test('fault input validates fields and strips page query strings and fragments without allowing credentials', () => {
  assert.equal(faultInput(body).reportType, 'fault');
  assert.equal(faultInput({ ...body, reportType: 'feature' }).reportType, 'feature');
  assert.throws(() => faultInput({ ...body, reportType: 'other' }));
  assert.equal(faultInput({ ...body, pageUrl: '/launchpad?token=private#details' }).pageUrl, '/launchpad');
  assert.equal(faultInput({ ...body, pageUrl: 'https://app.example.test/page?q=secret#private' }).pageUrl, 'https://app.example.test/page');
  assert.equal(faultInput({ ...body, pageUrl: '' }).pageUrl, '');
  for (const change of [
    { subject: '' }, { subject: 'x'.repeat(151) }, { subject: 'bad\nsummary' }, { appName: '' },
    { description: '' }, { description: 'x'.repeat(10001) }, { pageUrl: 'javascript:alert(1)' },
    { pageUrl: '//outside.example.test' }, { pageUrl: '/\\outside.example.test' },
    { pageUrl: 'https://user:password@example.test/' }, { pageUrl: 'not a url' }
  ]) assert.throws(() => faultInput({ ...body, ...change }));
});

test('fault reporting saves verified identity, escapes reports and allows only owner views; ADMIN triages separately', async t => {
  const f = await fixture(t), auth = await f.login(owner), otherAuth = await f.login(other), adminAuth = await f.login(admin);
  const created = await f.post('/faults', { ...body, reporter_id: other, status: 'resolved', description: '<script>private fault</script>' }, auth);
  assert.equal(created.status, 303);
  const ticket = [...f.tickets.values()][0];
  assert.equal(ticket.reporter_id, owner);
  assert.equal(ticket.ticket_type, 'fault');
  assert.equal(ticket.status, 'open');
  assert.equal(ticket.page_url, '/launchpad');
  assert.equal(f.emails.length, 1);
  assert.deepEqual(f.emails[0].to, ['tech@westlandhigh.school.nz']);
  assert.equal(f.emails[0].replyTo, 'teacher@example.test');
  assert.match(f.emails[0].subject, /\[Helpdesk\] Fault #1/);
  assert.match(f.emails[0].text, /Summary: Launchpad will not open/);
  assert.match(f.emails[0].text, /Manage ticket: .*\/admin\/helpdesk\//);
  assert.doesNotMatch(f.emails[0].html, /<script>/);
  assert.match(await (await f.get(created.headers.get('location'), auth)).text(), /Your fault report has been saved to Helpdesk/);
  const page = await f.get('/faults/' + ticket.id, auth);
  assert.equal(page.headers.get('cache-control'), 'no-store');
  const html = await page.text();
  assert.match(html, /&lt;script&gt;private fault&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>private|Save ticket update|reporter_email/);
  assert.match(await (await f.get('/faults', auth)).text(), /Launchpad will not open/);
  assert.doesNotMatch(await (await f.get('/faults', otherAuth)).text(), /Launchpad will not open/);
  assert.equal((await f.get('/faults/' + ticket.id, otherAuth)).status, 404);
  assert.equal((await f.get('/faults/' + crypto.randomUUID(), auth)).status, 404);
  assert.equal((await f.get('/admin/helpdesk', auth)).status, 403);
  assert.equal((await f.post('/admin/helpdesk/' + ticket.id, { status: 'resolved', revision: 1, reply: 'forged' }, auth)).status, 403);
  const adminPage = await (await f.get('/admin/helpdesk/' + ticket.id, adminAuth)).text();
  assert.match(adminPage, /teacher@example.test/);
  assert.match(adminPage, /Save ticket update/);
  assert.equal((await f.post('/admin/helpdesk/' + ticket.id, {
    status: 'in-progress', revision: 1, reply: 'Investigating <test>'
  }, adminAuth)).status, 303);
  assert.equal(ticket.status, 'in-progress');
  assert.equal(ticket.updated_by, admin);
  assert.match(await (await f.get('/faults/' + ticket.id, auth)).text(), /Investigating &lt;test&gt;/);
  const conflict = await f.post('/admin/helpdesk/' + ticket.id, {
    status: 'resolved', revision: 1, reply: 'Old revision'
  }, adminAuth);
  assert.equal(conflict.status, 409);
  assert.match(await conflict.text(), /readonly>Old revision<\/textarea>/);
  assert.equal(ticket.reply, 'Investigating <test>');
  assert.equal((await f.post('/admin/helpdesk/' + ticket.id, {
    status: 'resolved', revision: 2, reply: 'Fixed'
  }, adminAuth)).status, 303);
  assert.match(await (await f.get('/admin/helpdesk?status=resolved', adminAuth)).text(), /Launchpad will not open/);
  assert.doesNotMatch(await (await f.get('/admin/helpdesk?status=open', adminAuth)).text(), /Launchpad will not open/);
});

test('fault module catalogue uses current active assignments and lists only named pages, including planner sections', async () => {
  const rows = [
    { module_key: 'teacher-planner', display_name: 'Teacher Planner', path: '/teacher-planner/', is_active: true, has_access: true },
    { module_key: 'restricted', display_name: 'Restricted', path: '/restricted/', is_active: true, has_access: false },
    { module_key: 'inactive', display_name: 'Inactive', path: '/inactive/', is_active: false, has_access: true },
    { module_key: 'external', display_name: 'External', path: 'https://app.example.test/', is_active: true, has_access: true }
  ];
  const modules = await faultModules({ id: owner, roles: ['Teacher'] }, async (sql, params) => {
    assert.match(sql, /teacher_module_assignments/);
    assert.deepEqual(params, [owner]);
    return { rows };
  });
  assert.deepEqual(modules.map(module => module.key), ['launchpad', 'teacher-planner', 'external']);
  assert.ok(modules[1].pages.some(page => page.name === 'Two-Week Attendance' && page.url === '/teacher-planner/#section=setup&setupTab=6'));
  assert.deepEqual(modules[2].pages, [{ name: 'Module home', url: 'https://app.example.test/' }]);
  assert.ok(!modules[0].pages.some(page => page.url.startsWith('/admin')));
});

test('fault form offers module/page dropdowns and server rejects inaccessible modules or mismatched pages', async t => {
  const f = await fixture(t), auth = await f.login(owner);
  const html = await (await f.get('/faults/new', auth)).text();
  assert.match(html, /<select id="fault-app" name="moduleKey" required/);
  assert.match(html, /<select id="fault-url" name="pageUrl"/);
  assert.match(html, /<select id="fault-type" name="reportType" required/);
  assert.match(html, /Request a feature/);
  assert.match(html, /Feature requests are suggestions for review, not a commitment to implement/);
  assert.match(html, /Two-Week Attendance/);
  assert.doesNotMatch(html, /name="appName"|<input id="fault-url"/);
  for (const change of [
    { moduleKey: 'restricted' }, { moduleKey: 'teacher-planner', pageUrl: '/launchpad' },
    { pageUrl: '/launchpad?private=1' }, { pageUrl: 'https://outside.example.test/' }
  ]) assert.equal((await f.post('/faults', { ...body, ...change }, auth)).status, 400);
  assert.equal(f.tickets.size, 0);
  assert.equal(f.emails.length, 0);
});

test('feature requests are saved, labeled, and emailed distinctly from faults', async t => {
  const f = await fixture(t), auth = await f.login(owner), adminAuth = await f.login(admin);
  const response = await f.post('/faults', { ...body, reportType: 'feature',
    subject: 'Add an awards view', description: 'It would help me see progress across the year.' }, auth);
  assert.equal(response.status, 303);
  const [ticket] = f.tickets.values();
  assert.equal(ticket.ticket_type, 'feature');
  assert.match(f.emails[0].subject, /\[Helpdesk\] Feature request #1: Add an awards view/);
  assert.match(f.emails[0].text, /Type: Feature request/);
  const userDetail = await (await f.get(response.headers.get('location'), auth)).text();
  assert.match(userDetail, /Feature request #1: Add an awards view/);
  assert.match(userDetail, /Feature request details/);
  const userList = await (await f.get('/faults', auth)).text();
  assert.match(userList, /<td>Feature request<\/td>/);
  const adminDetail = await (await f.get('/admin/helpdesk/' + ticket.id, adminAuth)).text();
  assert.match(adminDetail, /Feature request #1/);
});

test('faults preserve approved planner section links and derive module name on the server', async t => {
  const f = await fixture(t), auth = await f.login(owner);
  const response = await f.post('/faults', { ...body, moduleKey: 'teacher-planner',
    appName: 'Forged name', pageUrl: '/teacher-planner/#section=attendance' }, auth);
  assert.equal(response.status, 303);
  const ticket = [...f.tickets.values()][0];
  assert.equal(ticket.app_name, 'Teacher Planner');
  assert.equal(ticket.page_url, '/teacher-planner/#section=attendance');
  assert.match(f.emails[0].text, /Module: Teacher Planner/);
  const saved = await (await f.get(response.headers.get('location'), auth)).text();
  assert.match(saved, /Report details were emailed to tech@westlandhigh.school.nz/);
});

test('fault dropdown choices survive validation/save errors and an unspecified page is allowed', async t => {
  t.mock.method(console, 'error', () => {});
  const f = await fixture(t), auth = await f.login(owner);
  const values = { ...body, reportType: 'feature', moduleKey: 'teacher-planner', pageUrl: '/teacher-planner/#section=week' };
  const invalid = await f.post('/faults', { ...values, subject: '', description: '<retained>' }, auth);
  assert.equal(invalid.status, 400);
  const invalidHtml = await invalid.text();
  assert.match(invalidHtml, /value="teacher-planner" selected/);
  assert.match(invalidHtml, /value="feature" selected/);
  assert.match(invalidHtml, /What would you like to be able to do\?/);
  assert.match(invalidHtml, /value="\/teacher-planner\/#section=week" selected/);
  assert.match(invalidHtml, /&lt;retained&gt;/);
  const unspecified = await f.post('/faults', { ...values, pageUrl: '' }, auth);
  assert.equal(unspecified.status, 303);
  assert.equal([...f.tickets.values()][0].page_url, '');
  f.fail();
  const failed = await f.post('/faults', values, auth);
  assert.equal(failed.status, 503);
  const failedHtml = await failed.text();
  assert.match(failedHtml, /value="teacher-planner" selected/);
  assert.match(failedHtml, /value="\/teacher-planner\/#section=week" selected/);
  assert.equal(f.emails.length, 1);
});

test('failed or thrown email delivery leaves one durable ticket and explicitly warns without suggesting resubmission', async t => {
  t.mock.method(console, 'error', () => {});
  for (const deliver of [async () => ({ ok: false, skipped: true }), async () => { throw new Error('Synthetic email failure'); }]) {
    const f = await fixture(t, undefined, { deliver }), auth = await f.login(owner);
    const response = await f.post('/faults', body, auth);
    assert.equal(response.status, 303);
    assert.equal(f.tickets.size, 1);
    const html = await (await f.get(response.headers.get('location'), auth)).text();
    assert.match(html, /saved to Helpdesk/);
    assert.match(html, /notification email could NOT be sent/);
    assert.match(html, /do not submit it again/);
    assert.doesNotMatch(html, /Fault details were emailed/);
  }
});

test('unavailable module list explicitly blocks submission and retains fault draft', async t => {
  t.mock.method(console, 'error', () => {});
  let unavailable = false;
  const f = await fixture(t, undefined, { modulesForUser: async () => {
    if (unavailable) throw new Error('Synthetic registry failure');
    return [{ key: 'launchpad', name: 'Launchpad', pages: [{ name: 'Launchpad', url: '/launchpad' }] }];
  } });
  const auth = await f.login(owner);
  unavailable = true;
  const response = await f.post('/faults', { ...body, description: '<retain draft>' }, auth);
  assert.equal(response.status, 503);
  const html = await response.text();
  assert.match(html, /module list could not be loaded/);
  assert.match(html, /&lt;retain draft&gt;/);
  assert.match(html, /type="submit" disabled/);
  assert.equal(f.tickets.size, 0);
  assert.equal(f.emails.length, 0);
});

test('faults reject anonymous, inactive, CSRF and invalid requests without writes', async t => {
  const f = await fixture(t), auth = await f.login(owner), adminAuth = await f.login(admin);
  assert.equal((await f.get('/faults/new')).headers.get('location'), '/auth/google?next=%2Ffaults%2Fnew');
  assert.equal((await f.post('/faults', body, { headers: {}, csrf: 'forged' })).status, 302);
  const inactive = { ...auth, headers: { ...auth.headers, 'x-inactive': 'true' } };
  assert.equal((await f.get('/faults/new', inactive)).status, 403);
  assert.equal((await f.post('/faults', body, inactive)).status, 403);
  assert.equal((await f.post('/faults', { ...body, csrf: 'forged' }, auth)).status, 403);
  assert.equal((await f.post('/faults', { ...body, subject: '', description: '<keep my draft>' }, auth)).status, 400);
  assert.equal((await f.get('/faults?status=bad', auth)).status, 400);
  assert.equal((await f.get('/faults?page=0', auth)).status, 400);
  assert.equal((await f.get('/faults/not-a-ticket', auth)).status, 400);
  const id = crypto.randomUUID();
  assert.equal((await f.post('/admin/helpdesk/' + id, { status: 'resolved', revision: 1, reply: '', csrf: 'bad' }, adminAuth)).status, 403);
  assert.equal((await f.post('/admin/helpdesk/' + id, { status: 'bad', revision: 1, reply: '' }, adminAuth)).status, 400);
  assert.equal(f.calls.length, 0);
});

test('fault submission failure explicitly retains draft, never claims success, and repeated submissions are bounded', async t => {
  const logged = t.mock.method(console, 'error', () => {});
  const f = await fixture(t), auth = await f.login(owner);
  f.fail();
  const failed = await f.post('/faults', { ...body, description: '<retain this>' }, auth);
  assert.equal(failed.status, 503);
  const html = await failed.text();
  assert.match(html, /Your fault report was NOT saved/);
  assert.match(html, /&lt;retain this&gt;/);
  assert.equal(logged.mock.calls.length, 1);
  for (let i = 0; i < 4; i++) assert.equal((await f.post('/faults', body, auth)).status, 503);
  assert.equal((await f.post('/faults', body, auth)).status, 429);
  assert.equal(f.tickets.size, 0);
});

test('Helpdesk paginates and filters without exposing other reporters; reporting is mounted before module access guards', async t => {
  const f = await fixture(t), auth = await f.login(owner);
  for (let i = 0; i < 27; i++) {
    const id = crypto.randomUUID();
    f.tickets.set(id, { id, ticket_number: i + 1, reporter_id: i === 26 ? other : owner,
      subject: 'Synthetic fault ' + i, app_name: 'Planner', status: 'open', created_at: new Date(), reporter_name: 'Teacher' });
  }
  const first = await (await f.get('/faults', auth)).text();
  assert.match(first, /Next page/);
  assert.doesNotMatch(first, /Synthetic fault 25/);
  const second = await (await f.get('/faults?page=2', auth)).text();
  assert.match(second, /Synthetic fault 25/);
  assert.doesNotMatch(second, /Synthetic fault 26/);
  assert.doesNotMatch(second, /Next page/);
  const server = fs.readFileSync(path.join(__dirname, '..', 'src', 'server.js'), 'utf8');
  assert.ok(server.indexOf("app.use('/faults', faultReports)") < server.indexOf('app.use(createModuleAccessGuard())'));
  assert.match(server, /app\.use\('\/admin\/helpdesk', helpdesk\)/);
  const nav = fs.readFileSync(path.join(__dirname, '..', 'public', 'global-nav.js'), 'utf8');
  assert.match(nav, /link\(nav, 'My fault reports', '\/faults'\)/);
  assert.match(nav, /if \(data\.isAdmin\) \{[\s\S]*?link\(nav, 'Helpdesk', '\/admin\/helpdesk'\)/);
});

test('Helpdesk migration and complete report/status workflow persist in PostgreSQL', {
  skip: !process.env.MODULE_BUILDER_TEST_DATABASE_URL
}, async t => {
  const pool = new Pool({ connectionString: process.env.MODULE_BUILDER_TEST_DATABASE_URL, ssl: false });
  const client = await pool.connect();
  const schema = 'helpdesk_' + crypto.randomBytes(8).toString('hex');
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}",public`);
    await client.query('CREATE TABLE users(id uuid PRIMARY KEY,display_name text,email text)');
    for (const id of [owner, other, admin]) {
      await client.query('INSERT INTO users(id,display_name,email) VALUES($1,$2,$3)', [id, 'Synthetic User', 'synthetic@example.test']);
    }
    for (const name of ['051_helpdesk_faults.sql', '052_helpdesk_feature_requests.sql']) {
      const migration = fs.readFileSync(path.join(__dirname, '..', 'migrations', name), 'utf8');
      await client.query(migration);
      await client.query(migration);
    }
    const f = await fixture(t, (sql, params) => client.query(sql, params));
    const auth = await f.login(owner), otherAuth = await f.login(other), adminAuth = await f.login(admin);
    const response = await f.post('/faults', body, auth);
    assert.equal(response.status, 303);
    const [ticket] = (await client.query('SELECT * FROM helpdesk_faults')).rows;
    assert.equal(ticket.reporter_id, owner);
    assert.equal(ticket.ticket_type, 'fault');
    assert.equal(ticket.page_url, '/launchpad');
    assert.equal(ticket.ticket_number, '1');
    assert.equal((await f.get('/faults/' + ticket.id, otherAuth)).status, 404);
    assert.doesNotMatch(await (await f.get('/faults', otherAuth)).text(), /Launchpad will not open/);
    assert.match(await (await f.get('/admin/helpdesk', adminAuth)).text(), /Launchpad will not open/);
    assert.equal((await f.post('/admin/helpdesk/' + ticket.id, {
      revision: 1, status: 'resolved', reply: 'Please try again.'
    }, adminAuth)).status, 303);
    assert.equal((await f.post('/admin/helpdesk/' + ticket.id, {
      revision: 1, status: 'open', reply: 'Outdated update'
    }, adminAuth)).status, 409);
    const [updated] = (await client.query('SELECT * FROM helpdesk_faults')).rows;
    assert.equal(updated.status, 'resolved');
    assert.equal(updated.reply, 'Please try again.');
    assert.equal(updated.revision, 2);
    assert.equal(updated.updated_by, admin);
    assert.match(await (await f.get('/faults/' + ticket.id, auth)).text(), /Please try again/);
    assert.match(await (await f.get('/admin/helpdesk?status=open', adminAuth)).text(), /No fault reports match/);
    await assert.rejects(client.query("UPDATE helpdesk_faults SET status='invalid'"), /check constraint/);
  } finally {
    await client.query(`DROP SCHEMA "${schema}" CASCADE`);
    client.release();
    await pool.end();
  }
});
