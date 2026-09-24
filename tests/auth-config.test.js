const test = require('node:test');
const assert = require('node:assert/strict');

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

process.env.GOOGLE_CLIENT_ID = originalClientId;
process.env.GOOGLE_CLIENT_SECRET = originalClientSecret;
