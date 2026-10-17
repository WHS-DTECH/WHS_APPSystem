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
