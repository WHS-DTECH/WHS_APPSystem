const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const session = require('express-session');
const path = require('node:path');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const { Pool } = require('pg');
const config = require('../src/config');
const originalBaseUrl = config.appBaseUrl;
test.before(() => { config.appBaseUrl = 'https://whs-appsystem.onrender.com'; });
test.after(() => { config.appBaseUrl = originalBaseUrl; });
const {
  createMaintenanceRouter,
  formatDate,
  loadRecipients,
  noticeEmail,
  sendDueWarnings,
  validLocalDateTime
} = require('../src/maintenanceNotifications');

test('maintenance date-time input accepts real local dates and rejects invalid dates', () => {
  assert.equal(validLocalDateTime('2027-03-15T09:30'), true);
  assert.equal(validLocalDateTime('2027-02-29T09:30'), false);
  assert.equal(validLocalDateTime('2027-13-01T09:30'), false);
  assert.equal(validLocalDateTime('15/03/2027 09:30'), false);
});

test('maintenance email preview includes New Zealand time and escapes user-provided content', () => {
  const content = noticeEmail({
    module_name: 'Teacher Planner',
    scheduled_at: '2027-03-15T20:30:00.000Z',
    expected_duration: 'about 30 minutes',
    impact: '<script>alert(1)</script>',
    details: 'Save your work first.'
  }, 'planned');

  assert.match(content.subject, /Teacher Planner/);
  assert.match(content.subject, /^\[Maintenance Req\]/);
  assert.match(content.text, /New Zealand time/);
  assert.match(content.text, /about 30 minutes/);
  assert.match(content.html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(content.html, /<script>/);
  assert.match(formatDate('2027-03-15T20:30:00.000Z'), /16 March 2027/);
});

test('maintenance resumption email includes optional staff update', () => {
  const content = noticeEmail({ module_name: 'Teacher Planner' }, 'resumed', 'Some reports may take a few minutes to refresh.');
  assert.match(content.subject, /^\[Maintenance Completed\]/);
  assert.match(content.subject, /Maintenance work completed: Teacher Planner$/);
  assert.match(content.text, /Some reports may take a few minutes to refresh\./);
  assert.match(content.text, /WHS Launchpad: https:\/\/whs-appsystem\.onrender\.com\/launchpad/);
  assert.match(content.html, /<a href="https:\/\/whs-appsystem\.onrender\.com\/launchpad">WHS Launchpad<\/a>/);
  assert.match(content.text, /school Google account/);
  assert.match(content.html, /Report a fault on the Launchpad/);
  assert.match(content.text, /following app\(s\) are available again:\r?\nTeacher Planner/);
  assert.match(content.html, /<p>Teacher Planner<\/p>/);
  assert.equal(noticeEmail({ module_name: 'Teacher Planner' }, 'resumed').text.match(/available again/g).length, 1);
});

test('maintenance completion refuses local or insecure destinations and supports a public custom domain', () => {
  const previous = config.appBaseUrl;
  try {
    for (const address of ['http://localhost:10000', 'https://localhost', 'https://127.0.0.1',
      'https://[::1]', 'https://preview.localhost', 'http://school.example', 'https://user:password@school.example']) {
      config.appBaseUrl = address;
      assert.throws(() => noticeEmail({ module_name: 'Teacher Planner' }, 'resumed'), /public HTTPS website address/);
    }
    config.appBaseUrl = 'https://apps.school.example/';
    const email = noticeEmail({ module_name: 'Teacher Planner' }, 'resumed');
    assert.ok(email.text.includes('https://apps.school.example/launchpad'));
    assert.ok(email.html.includes('href="https://apps.school.example/launchpad"'));
    assert.doesNotMatch(email.text + email.html, /localhost/);
  } finally { config.appBaseUrl = previous; }
});

test('active app role holders are recipients even without a current KAMAR staff record', async () => {
  let sql;
  const people = await loadRecipients('teacher-planner', async (text, params) => {
    sql = text;
    assert.deepEqual(params, [['teacher-planner']]);
    return { rows: [
      { email: 'rachel@westlandhigh.school.nz', display_name: 'Current Staff' },
      { email: 'ema@westlandhigh.school.nz', display_name: 'Other Role Holder' },
      { email: 'not-an-email', display_name: 'Invalid' }
    ] };
  });

  assert.match(sql, /assigned_role\.hub_key = ANY\(\$1::text\[\]\)/);
  assert.doesNotMatch(sql, /staff_upload|staffEmails|= ANY\(\$2/);
  assert.match(sql, /assigned_role\.name = 'ADMIN'/);
  assert.match(sql, /users\.is_active = true/);
  assert.deepEqual(people.map(person => person.email), [
    'rachel@westlandhigh.school.nz', 'ema@westlandhigh.school.nz'
  ]);
});

test('combined module recipients are deduplicated by email, including administrators', async () => {
  const people = await loadRecipients(['teacher-planner', 'workshop', 'teacher-planner'], async (sql, params) => {
    assert.deepEqual(params, [['teacher-planner', 'workshop']]);
    return { rows: [
      { email: 'Teacher@westlandhigh.school.nz', display_name: 'Teacher' },
      { email: 'teacher@westlandhigh.school.nz', display_name: 'Other account' },
      { email: 'admin@westlandhigh.school.nz', display_name: 'Admin' },
      { email: 'ADMIN@westlandhigh.school.nz', display_name: 'Admin in both modules' },
      { email: 'workshop@westlandhigh.school.nz', display_name: 'Workshop' }
    ] };
  });
  assert.deepEqual(people.map(person => person.email), [
    'teacher@westlandhigh.school.nz', 'admin@westlandhigh.school.nz', 'workshop@westlandhigh.school.nz'
  ]);
  await assert.rejects(loadRecipients([], async () => assert.fail('Empty scope must not query')), /Select at least one module/);
});

test('warning scheduler BCCs assigned app users and records successful delivery', async () => {
  const calls = [];
  const notice = {
    id: 'cfa89387-7632-4a70-b700-f7142d07e946',
    module_key: 'teacher-planner',
    module_keys: ['teacher-planner', 'workshop'],
    module_name: 'Teacher Planner, Workshop',
    scheduled_at: '2027-03-15T20:30:00.000Z',
    expected_duration: 'about 30 minutes',
    impact: 'The planner will be unavailable.',
    details: ''
  };
  let mailed;
  const dbQuery = async (sql, params = []) => {
    calls.push({ sql, params });
    if (sql.includes('SELECT DISTINCT LOWER(TRIM(users.email))')) {
      assert.deepEqual(params, [['teacher-planner', 'workshop']]);
      return { rows: [
        { email: 'teacher@westlandhigh.school.nz', display_name: 'Teacher' },
        { email: 'other-role@westlandhigh.school.nz', display_name: 'Other role holder' },
        { email: 'teacher@westlandhigh.school.nz', display_name: 'Teacher' }
      ] };
    }
    if (sql.includes('RETURNING *')) return { rows: [notice] };
    return { rows: [], rowCount: 1 };
  };

  await sendDueWarnings(dbQuery, async input => {
    mailed = input;
    return { ok: true };
  });

  assert.deepEqual(mailed.bcc, ['teacher@westlandhigh.school.nz', 'other-role@westlandhigh.school.nz']);
  assert.match(mailed.subject, /^\[Maintenance Req\].*Teacher Planner, Workshop maintenance planned/);
  assert.match(mailed.text, /Planned maintenance for Teacher Planner, Workshop/);
  assert.match(calls[1].sql, /FOR UPDATE SKIP LOCKED/);
  assert.match(calls[1].sql, /warning_test_draft_id IS NOT NULL/);
  assert.match(calls[1].sql, /tested\.test_sent_at IS NOT NULL/);
  assert.match(calls[1].sql, /AT TIME ZONE 'Pacific\/Auckland'/);
  assert.match(calls[3].sql, /warning_sent_at=NOW\(\)/);
});

test('warning scheduler records a delivery failure for an hourly retry', async () => {
  const calls = [];
  const notice = {
    id: 'cfa89387-7632-4a70-b700-f7142d07e946',
    module_key: 'teacher-planner',
    module_keys: ['teacher-planner'],
    module_name: 'Teacher Planner',
    scheduled_at: '2027-03-15T20:30:00.000Z',
    expected_duration: '',
    impact: 'The planner will be unavailable.',
    details: ''
  };
  const dbQuery = async (sql, params = []) => {
    calls.push({ sql, params });
    if (sql.includes('SELECT DISTINCT LOWER(TRIM(users.email))')) {
      return { rows: [
        { email: 'teacher@westlandhigh.school.nz', display_name: 'Teacher' },
        { email: 'other-role@westlandhigh.school.nz', display_name: 'Other role holder' }
      ] };
    }
    if (sql.includes('RETURNING *')) return { rows: [notice] };
    return { rows: [], rowCount: 1 };
  };
  const originalError = console.error;
  console.error = () => {};
  try {
    await sendDueWarnings(dbQuery, async () => ({ ok: false, error: 'Gmail unavailable' }));
  } finally {
    console.error = originalError;
  }

  const failedUpdate = calls.find(call => call.sql.includes('SET warning_error=$2'));
  assert.deepEqual(failedUpdate.params, [notice.id, 'Gmail unavailable']);
});

test('maintenance request and completion notifications require test emails and log separate tabs', async () => {
  const calls = [];
  const drafts = new Map();
  const notices = [];
  const emails = [];
  let mailed;
  let nextId = 0;
  const id = () => `cfa89387-7632-4a70-b700-${String(++nextId).padStart(12, '0')}`;
  const dbQuery = async (sql, params = []) => {
    calls.push({ sql, params });
    if (sql.includes('FROM hub_roles roles')) {
      return { rows: [
        { hub_key: 'teacher-planner', label: 'Teacher Planner' },
        { hub_key: 'workshop', label: 'Workshop' }
      ] };
    }
    if (sql.includes('SELECT DISTINCT LOWER(TRIM(users.email))')) {
      return { rows: [
        { email: 'teacher@westlandhigh.school.nz', display_name: 'Teacher' },
        { email: 'ema@westlandhigh.school.nz', display_name: 'Other role holder' }
      ] };
    }
    if (sql.includes('FROM email_log')) return { rows: [] };
    if (sql.includes('SELECT * FROM maintenance_notices')) return { rows: notices };
    if (sql.includes('SELECT * FROM maintenance_email_drafts WHERE id=$1')) {
      const draft = drafts.get(params[0]);
      return { rows: draft && draft.created_by === params[1] && draft.kind === params[2] ? [draft] : [] };
    }
    if (sql.includes('SELECT ($1::timestamp AT TIME ZONE')) {
      return { rows: [{ scheduled_at: '2099-02-10T20:30:00.000Z', is_future: true }] };
    }
    if (sql.includes('INSERT INTO maintenance_email_drafts')) {
      const draftId = id();
      const draft = {
        id: draftId, kind: sql.includes("VALUES ('request'") ? 'request' : 'completed',
        module_keys: params[0], module_name: params[1], payload: JSON.parse(params[2]),
        content_hash: params[3], status: 'test_pending', created_by: params[4]
      };
      drafts.set(draftId, draft);
      return { rows: [{ id: draftId }], rowCount: 1 };
    }
    if (sql.includes("SET status='scheduling'")) {
      const draft = drafts.get(params[0]);
      if (!draft || draft.kind !== 'request' || draft.created_by !== params[1] || draft.status !== 'tested') return { rows: [] };
      draft.status = 'scheduling';
      return { rows: [draft], rowCount: 1 };
    }
    if (sql.includes("SET status='sending'")) {
      const draft = drafts.get(params[0]);
      if (!draft || draft.kind !== 'completed' || draft.created_by !== params[1] || draft.status !== 'tested') return { rows: [] };
      draft.status = 'sending';
      return { rows: [draft], rowCount: 1 };
    }
    if (sql.includes('INSERT INTO maintenance_notices')) {
      const notice = {
        id: id(), module_key: params[0], module_name: params[1], scheduled_at: params[2],
        expected_duration: params[3], impact: params[4], details: params[5],
        created_by: params[6], module_keys: params[7], warning_test_draft_id: params[8],
        warning_tested_at: params[9], status: 'scheduled'
      };
      notices.push(notice);
      return { rows: [{ id: notice.id }], rowCount: 1 };
    }
    if (sql.includes('SET status=$2,test_sent_at=')) {
      const draft = drafts.get(params[0]);
      draft.status = params[1];
      draft.test_sent_at = params[1] === 'tested' ? new Date() : null;
      draft.error = params[2];
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes("SET status='scheduled',scheduled_at=") || sql.includes("SET status='scheduled',sent_at=") || sql.includes("SET status='sent',sent_at=")) {
      const draft = drafts.get(params[0]);
      draft.status = sql.includes("status='scheduled'") ? 'scheduled' : 'sent';
      draft.sent_at = new Date();
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes("SET status='test_failed',error=$2")) {
      const draft = drafts.get(params[0]);
      if (draft) { draft.status = 'test_failed'; draft.error = params[1]; }
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes("SET status='failed',error=$2")) {
      const draft = drafts.get(params[0]);
      draft.status = 'failed';
      draft.error = params[1];
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('INSERT INTO maintenance_notices')) {
      return { rows: [], rowCount: 0 };
    }
    throw new Error(`Unexpected query: ${sql}`);
  };
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));
  app.use(express.urlencoded({ extended: false }));
  app.use(session({ secret: 'maintenance-test-only', saveUninitialized: false, resave: false }));
  app.use((req, res, next) => {
    req.user = { id: 'admin-id', email: 'admin@westlandhigh.school.nz', roles: ['ADMIN'] };
    req.isAuthenticated = () => true;
    res.locals.activeRole = 'ADMIN';
    next();
  });

  app.use('/admin/maintenance-notifications', createMaintenanceRouter({
    dbQuery,
    mail: async input => {
      mailed = input;
      emails.push(input);
      return { ok: true };
    }
  }));
  app.use((error, req, res, next) => res.status(500).send(error.message));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}/admin/maintenance-notifications`;
    let cookie;
    const getPage = async route => {
      const response = await fetch(base + route, { headers: cookie ? { cookie } : {} });
      if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
      return response;
    };
    const page = await getPage('?tab=request&requestModule=teacher-planner');
    const html = await page.text();
    assert.equal(page.status, 200);
    assert.match(html, /Current recipients \(2\)/);
    assert.match(html, /ema@westlandhigh\.school\.nz/);
    const csrf = /name="csrf" value="([^"]+)"/.exec(html)[1];
    const submitRequestTest = async (token, keys = ['teacher-planner']) => fetch(base + '/test-request', {
      method: 'POST', redirect: 'manual',
      headers: { cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams([
        ['csrf', token],
        ...keys.map(key => ['moduleKey', key]),
        ['scheduledAt', '2099-02-10T09:30'],
        ['expectedDuration', '30 minutes'],
        ['impact', 'The selected modules will be unavailable.'],
        ['details', '']
      ])
    });
    assert.equal((await submitRequestTest('invalid-token')).status, 403);
    assert.equal((await submitRequestTest(csrf, [])).status, 400);
    assert.equal((await submitRequestTest(csrf, ['teacher-planner', 'unknown'])).status, 400);
    assert.equal((await getPage('?tab=request&requestModule=unknown')).status, 400);

    const untestedSchedule = await fetch(base + `/schedule/${id()}`, {
      method: 'POST', redirect: 'manual',
      headers: { cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ csrf })
    });
    assert.equal(untestedSchedule.status, 409);

    const requestTest = await submitRequestTest(csrf, ['teacher-planner', 'workshop', 'teacher-planner']);
    assert.equal(requestTest.status, 302);
    const requestUrl = new URL(requestTest.headers.get('location'), base);
    assert.equal(requestUrl.searchParams.get('tab'), 'request');
    const requestDraftId = requestUrl.searchParams.get('requestDraft');
    const requestDraft = drafts.get(requestDraftId);
    assert.deepEqual(requestDraft.module_keys, ['teacher-planner', 'workshop']);
    assert.equal(requestDraft.status, 'tested');
    assert.deepEqual(mailed.to, ['admin@westlandhigh.school.nz']);
    assert.equal(mailed.bcc, undefined);
    assert.match(mailed.subject, /^\[Maintenance Req\] \[TEST\]/);
    assert.equal(notices.length, 0);

    const testedRequestPage = await getPage(requestUrl.search);
    const testedRequestHtml = await testedRequestPage.text();
    assert.match(testedRequestHtml, /class="maintenance-folder"[\s\S]*class="maintenance-folder-tabs"[\s\S]*class="maintenance-page"/);
    assert.match(testedRequestHtml, /href="\/admin\/maintenance-notifications\?tab=request" aria-current="page"/);
    assert.doesNotMatch(testedRequestHtml, /href="\/admin\/maintenance-notifications\?tab=completed" aria-current="page"/);
    assert.match(testedRequestHtml, /Schedule tested request/);
    assert.match(testedRequestHtml, /Maintenance request email log/);
    const scheduleRequest = await fetch(base + `/schedule/${requestDraftId}`, {
      method: 'POST', redirect: 'manual',
      headers: { cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ csrf })
    });
    assert.equal(scheduleRequest.status, 302);
    assert.equal(notices.length, 1);
    assert.deepEqual(notices[0].module_keys, ['teacher-planner', 'workshop']);
    assert.equal(notices[0].warning_test_draft_id, requestDraftId);
    assert.equal(drafts.get(requestDraftId).status, 'scheduled');

    const completedPage = await getPage('?tab=completed&completedModule=teacher-planner');
    const completedHtml = await completedPage.text();
    assert.equal(completedPage.status, 200);
    assert.match(completedHtml, /Maintenance Completed/);
    assert.match(completedHtml, /href="\/admin\/maintenance-notifications\?tab=completed" aria-current="page"/);
    assert.doesNotMatch(completedHtml, /href="\/admin\/maintenance-notifications\?tab=request" aria-current="page"/);
    assert.match(completedHtml, /Choose apps for this completion notification/);
    assert.match(completedHtml, /Maintenance completed email log/);
    assert.match(completedHtml, /Send completion test email to me/);
    const completedCsrf = /name="csrf" value="([^"]+)"/.exec(completedHtml)[1];
    const premature = await fetch(base + `/send-completed/${id()}`, {
      method: 'POST', redirect: 'manual',
      headers: { cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ csrf: completedCsrf })
    });
    assert.equal(premature.status, 409);
    assert.equal(emails.length, 1);
    const completionTest = await fetch(base + '/test-completed', {
      method: 'POST', redirect: 'manual',
      headers: { cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams([
        ['csrf', completedCsrf], ['moduleKey', 'teacher-planner'],
        ['notes', 'The maintenance work has completed as planned.']
      ])
    });
    assert.equal(completionTest.status, 302);
    const completedUrl = new URL(completionTest.headers.get('location'), base);
    const completedDraftId = completedUrl.searchParams.get('completedDraft');
    const completedDraft = drafts.get(completedDraftId);
    assert.equal(completedDraft.status, 'tested');
    assert.deepEqual(completedDraft.module_keys, ['teacher-planner']);
    assert.deepEqual(mailed.to, ['admin@westlandhigh.school.nz']);
    assert.equal(mailed.bcc, undefined);
    assert.match(mailed.subject, /^\[Maintenance Completed\] \[TEST\]/);
    assert.match(mailed.text, /following app\(s\) are available again:\nTeacher Planner/);
    assert.match(mailed.text, /WHS Launchpad: https:\/\/whs-appsystem\.onrender\.com\/launchpad/);
    assert.match(mailed.subject, /Maintenance work completed: Teacher Planner$/);
    assert.match(mailed.text, /The maintenance work has completed as planned\./);

    const completedDraftPage = await getPage(completedUrl.search);
    assert.match(await completedDraftPage.text(), /Confirm and email selected app users/);
    assert.equal(emails.length, 2);
    const changedDestinationId = crypto.randomUUID();
    drafts.set(changedDestinationId, { ...completedDraft, id: changedDestinationId });
    const testedBaseUrl = config.appBaseUrl;
    try {
      config.appBaseUrl = 'https://new-school.example';
      const stale = await fetch(base + `/send-completed/${changedDestinationId}`, {
        method: 'POST', redirect: 'manual',
        headers: { cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ csrf: completedCsrf })
      });
      assert.equal(stale.status, 409);
      assert.equal(drafts.get(changedDestinationId).status, 'test_failed');
      assert.equal(emails.length, 2, 'changing the public website must require a fresh test before staff delivery');
    } finally { config.appBaseUrl = testedBaseUrl; }
    const sendCompleted = await fetch(base + `/send-completed/${completedDraftId}`, {
      method: 'POST', redirect: 'manual',
      headers: { cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ csrf: completedCsrf })
    });
    assert.equal(sendCompleted.status, 302);
    assert.equal(drafts.get(completedDraftId).status, 'sent');
    assert.deepEqual(mailed.bcc, ['teacher@westlandhigh.school.nz', 'ema@westlandhigh.school.nz']);
    assert.match(mailed.subject, /^\[Maintenance Completed\]/);
    assert.equal(emails.length, 3);
    assert.equal((await fetch(base + `/send-completed/${completedDraftId}`, {
      method: 'POST', redirect: 'manual',
      headers: { cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ csrf: completedCsrf })
    })).status, 409);
    assert.equal(emails.length, 3);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test('database migration preserves old notices and combined scope includes only eligible recipients', {
  skip: !process.env.MODULE_BUILDER_TEST_DATABASE_URL
}, async () => {
  const pool = new Pool({ connectionString: process.env.MODULE_BUILDER_TEST_DATABASE_URL, ssl: false });
  const client = await pool.connect();
  const schema = 'maintenance_' + crypto.randomBytes(8).toString('hex');
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}",public`);
    await client.query(`
      CREATE TABLE users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text, display_name text, is_active boolean DEFAULT true);
      CREATE TABLE staff_upload(email_school text, status text);
      CREATE TABLE hub_roles(id int PRIMARY KEY, hub_key text);
      CREATE TABLE user_hub_roles(user_id uuid, hub_role_id int);
      CREATE TABLE roles(id int PRIMARY KEY, name text);
      CREATE TABLE user_roles(user_id uuid, role_id int);
      INSERT INTO users(email,display_name,is_active) VALUES
        ('both@school.test','Both modules',true),
        ('workshop@school.test','Workshop only',true),
        ('student@school.test','Student',true),
        ('inactive@school.test','Inactive',false),
        ('other@school.test','Other module',true),
        ('admin@school.test','Global ADMIN',true);
      INSERT INTO staff_upload SELECT email,'Current' FROM users WHERE email NOT IN ('student@school.test','admin@school.test');
      INSERT INTO hub_roles VALUES (1,'teacher-planner'),(2,'workshop'),(3,'other');
      INSERT INTO user_hub_roles SELECT id,1 FROM users WHERE email IN ('both@school.test','student@school.test','inactive@school.test');
      INSERT INTO user_hub_roles SELECT id,2 FROM users WHERE email IN ('both@school.test','workshop@school.test');
      INSERT INTO user_hub_roles SELECT id,3 FROM users WHERE email='other@school.test';
      INSERT INTO roles VALUES (1,'ADMIN');
      INSERT INTO user_roles SELECT id,1 FROM users WHERE email='admin@school.test';
    `);
    const migration = name => fs.readFile(path.join(__dirname, '..', 'migrations', name), 'utf8');
    await client.query(await migration('015_email_log.sql'));
    await client.query(await migration('033_maintenance_notifications.sql'));
    await client.query(`INSERT INTO maintenance_notices(module_key,module_name,scheduled_at,impact)
      VALUES ('teacher-planner','Teacher Planner',NOW()+INTERVAL '30 days','Temporarily unavailable')`);
    await client.query(await migration('035_maintenance_multiple_modules.sql'));
    await client.query(await migration('040_maintenance_email_workflow.sql'));
    const notice = (await client.query('SELECT * FROM maintenance_notices')).rows[0];
    assert.deepEqual(notice.module_keys, ['teacher-planner']);
    assert.equal(notice.status, 'scheduled');
    assert.equal(notice.warning_test_draft_id, null);
    await client.query(`INSERT INTO maintenance_email_drafts
      (kind,module_keys,module_name,payload,content_hash,status)
      VALUES ('completed',ARRAY['teacher-planner'],'Teacher Planner','{"notes":""}','hash','tested')`);
    const draft = (await client.query('SELECT kind,status FROM maintenance_email_drafts')).rows[0];
    assert.deepEqual(draft, { kind: 'completed', status: 'tested' });
    const people = await loadRecipients(['teacher-planner', 'workshop'], (...args) => client.query(...args));
    assert.deepEqual(people.map(person => person.email), [
      'admin@school.test', 'both@school.test', 'student@school.test', 'workshop@school.test'
    ]);
    await assert.rejects(client.query(`UPDATE maintenance_notices SET module_keys='{}'`), /maintenance_notice_modules_required/);
  } finally {
    await client.query('SET search_path TO public');
    await client.query(`DROP SCHEMA "${schema}" CASCADE`);
    client.release();
    await pool.end();
  }
});
