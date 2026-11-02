const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const express = require('express');
const session = require('express-session');
const { createStudentBuildersRouter } = require('../src/studentBuilders');
const { createDtechRecords, creditFromEmail, githubOwner, normaliseRepoUrl } = require('../src/dtechRecords');

let server;
let base;
let rows;
let handovers;
let hubLinks;
let hubDown;

const dtech = {
  githubLinks: async (email) => {
    if (hubDown) return { unavailable: true, links: [] };
    return { unavailable: false, links: hubLinks[email] || [] };
  },
  allGithubLinks: async () => {
    if (hubDown) return { unavailable: true, reason: 'ECONNREFUSED: test', links: [] };
    return { unavailable: false, links: Object.entries(hubLinks).flatMap(([email, links]) => links.map((link) => ({ ...link, email }))) };
  }
};

const directoryQuery = async (sql, params) => {
  assert.match(sql, /FROM student_details_upload/);
  assert.doesNotMatch(sql, /id_number/);
  return { rows: params[0].filter((email) => email === 's_example@westlandhigh.school.nz')
    .map((email) => ({ email, first_name: 'Sam', last_name: 'Example', status: 'Current' })) };
};

async function dbQuery(sql, params = []) {
  if (sql.startsWith('DELETE FROM student_builders')) { rows.delete(params[0]); return { rows: [] }; }
  if (sql.includes('FROM student_builders ORDER BY')) return { rows: [...rows.values()] };
  if (sql.includes('FROM student_builders WHERE id')) return { rows: rows.has(params[0]) ? [rows.get(params[0])] : [] };
  if (sql.includes('FROM student_project_handovers')) return { rows: handovers.filter((item) => item.builder_id === params[0]) };
  const record = (p) => ({ full_name: p[0], school_email: p[1], credit_name: p[2], github_url: p[3], first_year: p[4],
    status: p[5], projects: p[6], notes: p[8] });
  if (sql.startsWith('INSERT INTO student_builders')) {
    if ([...rows.values()].some((row) => row.school_email === params[2])) throw Object.assign(new Error('duplicate'), { code: '23505' });
    rows.set(params[0], { id: params[0], ...record(params.slice(1)), permission_recorded_at: params[8] ? new Date() : null });
    return { rows: [] };
  }
  if (sql.startsWith('UPDATE student_builders')) {
    const row = rows.get(params[0]);
    Object.assign(row, record(params.slice(1)), { permission_recorded_at: params[8] ? (row.permission_recorded_at || new Date()) : null });
    return { rows: [] };
  }
  throw new Error(`Unexpected SQL: ${sql}`);
}

test.before(async () => {
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));
  app.use(express.urlencoded({ extended: false }));
  app.use(session({ secret: 'test-only', resave: false, saveUninitialized: false }));
  app.use((req, res, next) => {
    req.user = { id: 'admin', display_name: 'Test Admin', roles: req.get('x-role') === 'teacher' ? ['TEACHER'] : ['ADMIN'] };
    res.locals.activeRole = 'ADMIN';
    next();
  });
  app.use('/admin/student-builders', createStudentBuildersRouter({ dbQuery, dtech, directoryQuery }));
  app.use((error, req, res, next) => res.status(500).send(error.message));
  server = await new Promise((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  base = `http://127.0.0.1:${server.address().port}/admin/student-builders`;
});
test.after(() => new Promise((resolve) => server.close(resolve)));
test.beforeEach(() => { rows = new Map(); handovers = []; hubLinks = {}; hubDown = false; });

async function formSession() {
  const response = await fetch(base);
  const html = await response.text();
  return { cookie: response.headers.get('set-cookie').split(';')[0], csrf: html.match(/name="csrf" value="([^"]+)"/)[1] };
}

const post = (route, data, cookie) => fetch(base + route, { method: 'POST', redirect: 'manual',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
  body: new URLSearchParams(Object.entries(data).flatMap(([key, value]) => [].concat(value).map((item) => [key, item]))) });

const sam = { fullName: 'Sam <Example>', schoolEmail: 'S_Example@westlandhigh.school.nz', status: 'left',
  projects: 'WHS-DTECH/example-app', permission: 'yes' };

test('credit names come from the school username without underscores', () => {
  assert.equal(creditFromEmail('j_pinkerneil@westlandhigh.school.nz'), 'JPinkerneil');
  assert.equal(creditFromEmail('v_pringle2@westlandhigh.school.nz'), 'VPringle2');
  assert.equal(githubOwner('https://github.com/student-one/app'), 'student-one');
  assert.equal(normaliseRepoUrl('https://www.github.com/a/b.git/'), 'https://github.com/a/b');
  assert.equal(normaliseRepoUrl('https://example.com/a/b'), null);
});

test('only administrators can view or record student builders', async () => {
  for (const method of ['GET', 'POST']) {
    const response = await fetch(base, { method, headers: { 'x-role': 'teacher' } });
    assert.equal(response.status, 403);
  }
});

test('forms require a valid CSRF token', async () => {
  const form = await formSession();
  const response = await post('', { csrf: 'wrong', ...sam }, form.cookie);
  assert.equal(response.status, 403);
  assert.equal(rows.size, 0);
});

test('the form asks for a school email, not a student ID or personal email', async () => {
  const html = await (await fetch(base)).text();
  assert.match(html, /name="schoolEmail"/);
  assert.match(html, /name="githubUrl"/);
  assert.doesNotMatch(html, /kamarStudentId|contactEmail|creditName|githubUsername/);
});

test('saving derives the credit name and fills the single shared GitHub link from the DTECH Hub', async () => {
  hubLinks['s_example@westlandhigh.school.nz'] = [{ url: 'https://github.com/sample-dev/example-app', project: 'Senior App', yearLevel: '12' }];
  const form = await formSession();
  const response = await post('', { csrf: form.csrf, ...sam }, form.cookie);
  assert.equal(response.status, 303);
  const [row] = rows.values();
  assert.equal(row.school_email, 's_example@westlandhigh.school.nz');
  assert.equal(row.credit_name, 'SExample');
  assert.equal(row.github_url, 'https://github.com/sample-dev/example-app');
  assert.ok(row.permission_recorded_at);

  const html = await (await fetch(base, { headers: { cookie: form.cookie } })).text();
  assert.match(html, /Sam &lt;Example&gt;/);
  assert.match(html, /SExample/);
  assert.match(html, new RegExp(`action="/admin/student-builders/${row.id}/delete"`));
  assert.match(html, /confirm\('Delete the student builder record for Sam &lt;Example&gt;\?'\)/);

  const edit = await (await fetch(`${base}/${row.id}`, { headers: { cookie: form.cookie } })).text();
  assert.match(edit, /Senior App, 12/);
});

test('several Hub links are offered rather than guessed, and a typed link wins', async () => {
  hubLinks['s_example@westlandhigh.school.nz'] = [
    { url: 'https://github.com/sample-dev/one', project: 'One', yearLevel: '' },
    { url: 'https://github.com/sample-dev/two', project: 'Two', yearLevel: '' }];
  const form = await formSession();
  await post('', { csrf: form.csrf, ...sam }, form.cookie);
  const [row] = rows.values();
  assert.equal(row.github_url, null);
  const edit = await (await fetch(`${base}/${row.id}`, { headers: { cookie: form.cookie } })).text();
  assert.match(edit, /sample-dev\/one/);
  assert.match(edit, /sample-dev\/two/);

  await post(`/${row.id}`, { csrf: form.csrf, ...sam, githubUrl: 'https://github.com/sample-dev/two/', permission: '' }, form.cookie);
  assert.equal(rows.get(row.id).github_url, 'https://github.com/sample-dev/two');
  assert.equal(rows.get(row.id).permission_recorded_at, null);
});

test('an unavailable DTECH Hub does not stop saving', async () => {
  hubDown = true;
  const form = await formSession();
  const response = await post('', { csrf: form.csrf, ...sam }, form.cookie);
  assert.equal(response.status, 303);
  const [row] = rows.values();
  const edit = await (await fetch(`${base}/${row.id}`, { headers: { cookie: form.cookie } })).text();
  assert.match(edit, /could not be checked/);
  assert.match(edit, /ECONNREFUSED: test/);
});

test('DTECH Hub apps are listed with tick boxes, KAMAR names and saved as projects', async () => {
  hubLinks['s_example@westlandhigh.school.nz'] = [{ url: 'https://github.com/sample-dev/bus-app', project: 'Bus App', yearLevel: '13' }];
  hubLinks['o_other@westlandhigh.school.nz'] = [{ url: 'https://github.com/other-dev/quiz', project: 'Quiz', yearLevel: '10' }];
  const form = await formSession();
  const html = await (await fetch(base, { headers: { cookie: form.cookie } })).text();
  assert.match(html, /name="projects" value="Bus App \(sample-dev\/bus-app\)" data-email="s_example@westlandhigh.school.nz" data-name="Sam Example"/);
  assert.match(html, /data-name="o_other"/);
  assert.doesNotMatch(html, /<textarea name="projects"/);

  await post('', { csrf: form.csrf, ...sam, projects: ['Bus App (sample-dev/bus-app)', 'Quiz (other-dev/quiz)'], projectsOther: 'Typed project' }, form.cookie);
  const [row] = rows.values();
  assert.equal(row.projects, 'Bus App (sample-dev/bus-app)\nQuiz (other-dev/quiz)\nTyped project');

  const edit = await (await fetch(`${base}/${row.id}`, { headers: { cookie: form.cookie } })).text();
  assert.match(edit, /value="Bus App \(sample-dev\/bus-app\)"[^>]*checked/);
  assert.match(edit, /value="Typed project" checked/);
  assert.ok(edit.indexOf('sample-dev/bus-app') < edit.indexOf('other-dev/quiz'));
});

test('invalid details and duplicate school emails are rejected', async () => {
  const form = await formSession();
  for (const bad of [{ fullName: '' }, { schoolEmail: 'sam@gmail.com' }, { schoolEmail: '' }, { githubUrl: 'https://example.com/x/y' }, { firstYear: '99' }]) {
    const response = await post('', { csrf: form.csrf, ...sam, ...bad }, form.cookie);
    assert.equal(response.status, 400);
  }
  assert.equal(rows.size, 0);
  await post('', { csrf: form.csrf, ...sam }, form.cookie);
  const again = await post('', { csrf: form.csrf, ...sam, fullName: 'Someone Else' }, form.cookie);
  assert.equal(again.status, 400);
  assert.match(await again.text(), /already recorded/);
  assert.equal(rows.size, 1);
});

test('details cannot be removed while a handover is in progress', async () => {
  const form = await formSession();
  await post('', { csrf: form.csrf, ...sam }, form.cookie);
  const [row] = rows.values();
  handovers = [{ id: 'h1', builder_id: row.id, title: 'App', source_repository: 'WHS-DTECH/example-app', finished_at: null }];
  let response = await post(`/${row.id}/delete`, { csrf: form.csrf }, form.cookie);
  assert.equal(response.status, 409);
  assert.ok(rows.has(row.id));
  handovers[0].finished_at = new Date();
  handovers[0].finish_action = 'transferred';
  response = await post(`/${row.id}/delete`, { csrf: form.csrf }, form.cookie);
  assert.equal(response.status, 303);
  assert.equal(rows.size, 0);
});

test('DTECH Hub lookup reads shared GitHub links from task-list evidence', async () => {
  const pool = {
    query: async (sql, params) => {
      assert.match(sql, /FROM project_interests/);
      assert.equal(params[0], 's_example@westlandhigh.school.nz');
      return { rows: [
        { project_id: 'p1', name: 'Senior App', year_level: '12', evidence: JSON.stringify([{ standard: 'x', steps: [{ text: 'GITHUB_REPO_URL|https://github.com/sample-dev/app' }] }]) },
        { project_id: 'p2', name: null, year_level: null, evidence: JSON.stringify([{ standard: 'y', steps: [{ text: 'GITHUB_REPO_URL|https://github.com/Sample-Dev/App' }, { text: 'no link' }] }]) }
      ] };
    }
  };
  const result = await createDtechRecords({ pool }).githubLinks('s_example@westlandhigh.school.nz');
  assert.deepEqual(result, { unavailable: false, links: [{ url: 'https://github.com/sample-dev/app', project: 'Senior App', yearLevel: '12' }] });
  const missing = await createDtechRecords({ env: {} }).githubLinks('x');
  assert.equal(missing.unavailable, true);
  assert.match(missing.reason, /DTECH_DATABASE_URL/);
});

test('DTECH Hub lookup can list every shared GitHub link with the student email', async () => {
  const pool = {
    query: async (sql, params) => {
      assert.match(sql, /GITHUB_REPO_URL/);
      assert.deepEqual(params, []);
      return { rows: [
        { project_id: 'p1', student_email: 'A_One@westlandhigh.school.nz', name: 'App', year_level: '12', evidence: '[{"text":"GITHUB_REPO_URL|https://github.com/a/app"}]' },
        { project_id: 'p1', student_email: 'b_two@westlandhigh.school.nz', name: 'App', year_level: '12', evidence: '[{"text":"GITHUB_REPO_URL|https://github.com/a/app"}]' }
      ] };
    }
  };
  const result = await createDtechRecords({ pool }).allGithubLinks();
  assert.deepEqual(result.links.map((link) => link.email), ['a_one@westlandhigh.school.nz', 'b_two@westlandhigh.school.nz']);
  const broken = await createDtechRecords({ pool: { query: async () => { throw Object.assign(new Error('no route'), { code: 'EHOSTUNREACH' }); } } }).allGithubLinks();
  assert.equal(broken.reason, 'EHOSTUNREACH: no route');
});
