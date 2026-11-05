const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const originalClientId = process.env.GOOGLE_CLIENT_ID;
const originalClientSecret = process.env.GOOGLE_CLIENT_SECRET;

delete process.env.GOOGLE_CLIENT_ID;
delete process.env.GOOGLE_CLIENT_SECRET;

const authModulePath = require.resolve('../src/auth');

delete require.cache[authModulePath];

const passport = require('../src/auth');

test('auth setup does not throw when Google OAuth config is missing', () => {
  assert.ok(passport);
  assert.equal(typeof passport.authenticate, 'function');
});

test('Core public address uses explicit website, then Render URL, with localhost only for local development', () => {
  const source = fs.readFileSync(require.resolve('../src/config'), 'utf8');
  for (const [env, expected] of [
    [{ APP_BASE_URL: 'https://apps.school.example/', RENDER_EXTERNAL_URL: 'https://service.onrender.com' }, 'https://apps.school.example'],
    [{ RENDER_EXTERNAL_URL: 'https://service.onrender.com/', PORT: '10000' }, 'https://service.onrender.com'],
    [{ APP_BASE_URL: ' ', RENDER_EXTERNAL_URL: 'https://service.onrender.com/' }, 'https://service.onrender.com'],
    [{ PORT: '3000' }, 'http://localhost:3000']
  ]) {
    const context = { process: { env }, module: { exports: {} }, require: () => ({ config() {} }) };
    vm.runInNewContext(source, context);
    assert.equal(context.module.exports.appBaseUrl, expected);
    assert.equal(context.module.exports.google.callbackUrl, expected + '/auth/google/callback');
  }
});

process.env.GOOGLE_CLIENT_ID = originalClientId;
process.env.GOOGLE_CLIENT_SECRET = originalClientSecret;
