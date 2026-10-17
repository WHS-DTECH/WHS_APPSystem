const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const ejs = require('ejs');
const { describeModules } = require('../src/moduleDocs');

test('module docs report which variables are set without exposing their values', () => {
  const docs = describeModules({ INTEGRATION_FOOD_ROOM_DATABASE_URL: 'postgres://secret-value' });
  const legacy = docs['food-room'].env.find((item) => item.name === 'INTEGRATION_FOOD_ROOM_DATABASE_URL');
  assert.equal(legacy.isSet, true);
  assert.equal(docs['food-room'].env.find((item) => item.name === 'GOOGLE_GMAIL_CLIENT_ID').isSet, false);
  assert.equal(JSON.stringify(docs).includes('secret-value'), false);
  assert.equal(docs['technology-hub'].legacyDatabase.used, false);
});

test('app module page renders the setup details for each module', async () => {
  const modules = [
    { display_name: 'Food Room Hub', module_key: 'food-room', path: '/food-room', is_active: true },
    { display_name: 'Technology Hub', module_key: 'technology-hub', path: '/technology-hub', is_active: true },
    { display_name: 'Custom', module_key: 'custom', path: '/custom', is_active: true }
  ];
  const html = await ejs.renderFile(path.join(__dirname, '..', 'views', 'admin', 'modules.ejs'), {
    modules,
    moduleDocs: describeModules({}),
    title: 'App Module Management',
    currentUser: null,
    isAdmin: false,
    activeRole: 'ADMIN'
  });
  assert.match(html, /INTEGRATION_FOOD_ROOM_DATABASE_URL/);
  assert.match(html, /One-time import/);
  assert.match(html, /No environment variables of its own/);
  assert.equal((html.match(/module-doc"/g) || []).length, 2);
});
