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
    platformRoles: [{ key: 'builder', label: 'Builder' }],
    ...overrides
  });
}

test('hosted active apps show automatic sign-in and allow mapping without an old verification timestamp', async () => {
  const html = await render();
  assert.match(html, /Connected automatically/);
  assert.match(html, /name="map_builder"/);
  assert.doesNotMatch(html, /EXTERNAL_SIGN_IN_CODE|Make a new secret|Test sign-in/);
});

test('hosted pending apps do not ask administrators to load a secret', async () => {
  const html = await render({ app: { slug: 'guidance-counsellor-app', name: 'Guidance Counsellor App', status: 'pending' } });
  assert.match(html, />Project is registered</);
  assert.doesNotMatch(html, /Make a new secret|Secret loaded|EXTERNAL_SIGN_IN_CODE/);
});

test('external apps retain sign-in code with placement instructions', async () => {
  const html = await render({ hosted: false });
  assert.match(html, /EXTERNAL_SIGN_IN_CODE/);
  assert.match(html, /before any <code>app.run/);
  assert.match(html, /Test sign-in/);
  assert.doesNotMatch(html, /name="map_builder"/);
});
