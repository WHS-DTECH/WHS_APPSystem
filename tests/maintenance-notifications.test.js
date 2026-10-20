const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const session = require('express-session');
const path = require('node:path');
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
  assert.match(content.text, /New Zealand time/);
  assert.match(content.text, /about 30 minutes/);
  assert.match(content.html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(content.html, /<script>/);
  assert.match(formatDate('2027-03-15T20:30:00.000Z'), /16 March 2027/);
});

test('maintenance resumption email includes optional staff update', () => {
  const content = noticeEmail({ module_name: 'Teacher Planner' }, 'resumed', 'Some reports may take a few minutes to refresh.');
  assert.match(content.subject, /complete/);
  assert.match(content.text, /Some reports may take a few minutes to refresh\./);
});

test('staff recipients query filters out invalid email addresses returned by the database', async () => {
  let sql;
  const people = await loadRecipients('teacher-planner', async (text, params) => {
    sql = text;
    assert.deepEqual(params, ['teacher-planner']);
    return { rows: [
      { email: 'planner@westlandhigh.school.nz', display_name: 'Planner Teacher' },
      { email: 'not-an-email', display_name: 'Invalid' }
    ] };
  });

  assert.match(sql, /staff\.status = 'Current'/);
  assert.match(sql, /assigned_role\.hub_key = \$1/);
  assert.match(sql, /assigned_role\.name = 'ADMIN'/);
  assert.deepEqual(people.map(person => person.email), ['planner@westlandhigh.school.nz']);
});

test('warning scheduler BCCs eligible staff and records successful delivery', async () => {
  const calls = [];
  const notice = {
    id: 'cfa89387-7632-4a70-b700-f7142d07e946',
    module_key: 'teacher-planner',
    module_name: 'Teacher Planner',
    scheduled_at: '2027-03-15T20:30:00.000Z',
    expected_duration: 'about 30 minutes',
    impact: 'The planner will be unavailable.',
    details: ''
  };
  let mailed;
  const dbQuery = async (sql, params = []) => {
    calls.push({ sql, params });
    if (sql.includes('SELECT DISTINCT LOWER(TRIM(users.email))')) {
      return { rows: [{ email: 'teacher@westlandhigh.school.nz', display_name: 'Teacher' }] };
    }
    if (sql.includes('RETURNING *')) return { rows: [notice] };
    return { rows: [], rowCount: 1 };
  };

  await sendDueWarnings(dbQuery, async input => {
    mailed = input;
    return { ok: true };
  });

  assert.deepEqual(mailed.bcc, ['teacher@westlandhigh.school.nz']);
  assert.match(mailed.subject, /Teacher Planner maintenance planned/);
  assert.match(calls[1].sql, /FOR UPDATE SKIP LOCKED/);
  assert.match(calls[1].sql, /AT TIME ZONE 'Pacific\/Auckland'/);
  assert.match(calls[3].sql, /warning_sent_at=NOW\(\)/);
});

test('warning scheduler records a delivery failure for an hourly retry', async () => {
  const calls = [];
  const notice = {
    id: 'cfa89387-7632-4a70-b700-f7142d07e946',
    module_key: 'teacher-planner',
    module_name: 'Teacher Planner',
    scheduled_at: '2027-03-15T20:30:00.000Z',
    expected_duration: '',
    impact: 'The planner will be unavailable.',
    details: ''
  };
  const dbQuery = async (sql, params = []) => {
    calls.push({ sql, params });
    if (sql.includes('SELECT DISTINCT LOWER(TRIM(users.email))')) {
      return { rows: [{ email: 'teacher@westlandhigh.school.nz', display_name: 'Teacher' }] };
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

test('admin can schedule a notice only with a valid session form token and eligible recipients', async () => {
  const calls = [];
  let notice;
  let mailed;
  const dbQuery = async (sql, params = []) => {
    calls.push({ sql, params });
    if (sql.includes('FROM hub_roles roles')) {
      return { rows: [{ hub_key: 'teacher-planner', label: 'Teacher Planner' }] };
    }
    if (sql.includes('SELECT * FROM maintenance_notices')) return { rows: notice ? [notice] : [] };
    if (sql.includes('SELECT DISTINCT LOWER(TRIM(users.email))')) {
      return { rows: [{ email: 'teacher@westlandhigh.school.nz', display_name: 'Teacher' }] };
    }
    if (sql.includes('INSERT INTO maintenance_notices')) {
      notice = {
        id: 'cfa89387-7632-4a70-b700-f7142d07e946',
        module_key: params[0],
        module_name: params[1],
        scheduled_at: params[2],
        expected_duration: params[3],
        impact: params[4],
        details: params[5],
        status: 'scheduled'
      };
      return { rows: [{ id: notice.id }], rowCount: 1 };
    }
    if (sql.includes("SET status='resuming'")) {
      if (!notice || !['scheduled', 'in_progress', 'resumption_failed'].includes(notice.status)) return { rows: [], rowCount: 0 };
      notice.status = 'resuming';
      notice.resumption_notes = params[1];
      return { rows: [notice], rowCount: 1 };
    }
    if (sql.includes("SET status='resumed'")) {
      notice.status = 'resumed';
      return { rows: [{ id: notice.id }], rowCount: 1 };
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
    initDirectory: async () => {},
    mail: async input => {
      mailed = input;
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
    const page = await getPage('?module=teacher-planner');
    const html = await page.text();
    assert.equal(page.status, 200);
    assert.match(html, /Current recipients \(1\)/);
    const csrf = /name="csrf" value="([^"]+)"/.exec(html)[1];
    const submit = async token => fetch(base, {
      method: 'POST', redirect: 'manual',
      headers: { cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        csrf: token,
        moduleKey: 'teacher-planner',
        scheduledAt: '2099-02-10T09:30',
        expectedDuration: '30 minutes',
        impact: 'The planner will be unavailable.',
        details: ''
      })
    });
    assert.equal((await submit('invalid-token')).status, 403);
    const created = await submit(csrf);
    assert.equal(created.status, 302, await created.text());
    assert.equal(created.headers.get('location'), '/admin/maintenance-notifications?message=created');
    const insert = calls.find(call => call.sql.includes('INSERT INTO maintenance_notices'));
    assert.match(insert.sql, /AT TIME ZONE 'Pacific\/Auckland'/);
    assert.equal(insert.params[2], '2099-02-10T09:30');

    const resume = await fetch(base + `/${notice.id}/resume`, {
      method: 'POST', redirect: 'manual',
      headers: { cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ csrf, notes: 'Reports may take a few minutes to refresh.' })
    });
    assert.equal(resume.status, 302);
    assert.deepEqual(mailed.bcc, ['teacher@westlandhigh.school.nz']);
    assert.match(mailed.text, /Reports may take a few minutes to refresh\./);
    assert.equal(notice.status, 'resumed');

    const duplicate = await fetch(base + `/${notice.id}/resume`, {
      method: 'POST', redirect: 'manual',
      headers: { cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ csrf, notes: '' })
    });
    assert.equal(duplicate.status, 409);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
