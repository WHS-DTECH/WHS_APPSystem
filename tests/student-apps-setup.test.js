const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const ejs = require('ejs');

const template = path.join(__dirname, '..', 'views', 'student-apps', 'setup.ejs');

function render(overrides = {}) {
  return ejs.renderFile(template, {
    title: 'Set up',
    activeRole: 'Student',
    app: {
      id: 1, slug: 'guidance-counsellor-app', name: 'Guidance Counsellor App',
      status: 'active', app_url: null, login_verified_at: null,
      roles_mapped_at: null, app_roles: ['Counsellor']
    },
    hosted: true,
    roleDefaults: { admin: 'ADMIN', builder: 'AppBuilder', 'lead-teacher': 'ADMIN' },
    appRoleChoices: ['ADMIN', 'AppBuilder', 'Counsellor'],
    canEditRoles: true,
    builder: { display_name: 'Student Builder', email: 'builder@example.invalid' },
    appClient: { display_name: 'Client Teacher', email: 'client@example.invalid' },
    siteAdmin: true,
    submitted: false,
    activated: false,
    saved: false,
    secret: null,
    snippet: 'EXTERNAL_SIGN_IN_CODE',
    launchUrl: '/launch',
    rolesUrl: '/roles',
    assignedCount: 1,
    mapping: {},
    platformRoles: [
      { key: 'admin', label: 'Administrator (platform ADMIN)' },
      { key: 'builder', label: 'Builder' },
      { key: 'lead-teacher', label: 'Lead Teacher' },
      { key: 'teacher', label: 'Teacher' },
      { key: 'technician', label: 'Technician' },
      { key: 'student', label: 'Student' }
    ],
    ...overrides
  });
}

test('hosted active apps show automatic sign-in and allow mapping without an old verification timestamp', async () => {
  const html = await render();
  assert.match(html, /Connected automatically/);
  assert.match(html, /AppBuilder<\/strong> &mdash; automatic/);
  assert.match(html, /<strong>ADMIN<\/strong> &mdash; automatic/);
  assert.equal((html.match(/<strong>ADMIN<\/strong> &mdash; automatic/g) || []).length, 1);
  assert.match(html, /<strong>Lead Teacher<\/strong> &mdash; automatic/);
  assert.match(html, /Full app management \(internal app role: ADMIN\)/);
  assert.doesNotMatch(html, /name="map_builder"/);
  assert.doesNotMatch(html, /EXTERNAL_SIGN_IN_CODE|Make a new secret|Test sign-in/);
});

test('hosted pending apps do not ask administrators to load a secret', async () => {
  const html = await render({ app: { slug: 'guidance-counsellor-app', name: 'Guidance Counsellor App', status: 'pending' } });
  assert.match(html, />Project is registered</);
  assert.doesNotMatch(html, /Make a new secret|Secret loaded|EXTERNAL_SIGN_IN_CODE/);
});

test('external apps retain sign-in code with placement instructions', async () => {
  const html = await render({ hosted: false, roleDefaults: {}, appRoleChoices: ['Builder'] });
  assert.match(html, /EXTERNAL_SIGN_IN_CODE/);
  assert.match(html, /before any <code>app.run/);
  assert.match(html, /Test sign-in/);
  assert.doesNotMatch(html, /name="map_builder"/);
});

test('builders see assigned people and automatic roles but cannot configure or assign access', async () => {
  const html = await render({ canEditRoles: false });
  assert.match(html, /Student Builder \(builder@example.invalid\)/);
  assert.match(html, /Client Teacher \(client@example.invalid\)/);
  assert.match(html, /client manages all settings/);
  assert.doesNotMatch(html, /name="map_|Save access|Assign user roles|<details/);
});

test('Lead Teachers can reveal optional access without changing automatic core roles', async () => {
  const html = await render({ siteAdmin: false, canEditRoles: true });
  assert.match(html, /<details>\s*<summary>Optional access/);
  assert.doesNotMatch(html, /<details open|name="map_admin"|name="map_builder"|name="map_lead-teacher"/);
  assert.match(html, /name="map_teacher"/);
  assert.match(html, /name="map_technician"/);
  assert.match(html, /name="map_student"/);
  assert.match(html, /class="sa-role-form"/);
  assert.doesNotMatch(html, /class="module-form"/);
});

test('Step 3 contains assignments and Step 4 contains the app launch button', async () => {
  const html = await render({
    app: {
      id: 1, slug: 'guidance-counsellor-app', name: 'Guidance Counsellor App',
      status: 'active', roles_mapped_at: '2026-10-17', app_roles: []
    }
  });
  const panel = html.match(/<section class="panel">\s*<h2>[^\n]*Step 3 &mdash; App access(?:(?!<\/section>)[\s\S])*<\/section>/);
  assert.ok(panel);
  assert.match(panel[0], /<h3>Who can use it<\/h3>/);
  assert.match(panel[0], /2 role assignment|1 role assignment/);
  assert.match(panel[0], /Assign user roles/);
  assert.doesNotMatch(panel[0], />Open the app<\/a>/);
  const launchPanel = html.match(/<section class="panel">\s*<h2>Step 4 &mdash; Open the app(?:(?!<\/section>)[\s\S])*<\/section>/);
  assert.ok(launchPanel);
  assert.match(launchPanel[0], /href="\/student-apps\/guidance-counsellor-app\/launch">Open the app<\/a>/);
});

test('Step 4 waits for sign-in and role setup before offering launch', async () => {
  const html = await render();
  assert.match(html, /Finish steps 2 and 3 before opening the app/);
  assert.doesNotMatch(html, />Open the app<\/a>/);
});
