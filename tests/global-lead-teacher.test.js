const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { ensureRole } = require('../src/middleware');

test('Global Lead Teacher inherits Teacher access on each session load, without hub or global administration', async () => {
  let deserialize;
  let storedRoles = ['Lead Teacher'];
  const passport = {
    serializeUser() {},
    deserializeUser(callback) { deserialize = callback; }
  };
  const auth = fs.readFileSync(path.join(__dirname, '..', 'src', 'auth.js'), 'utf8');
  vm.runInNewContext(auth, {
    module: { exports: {} },
    require(name) {
      if (name === 'passport') return passport;
      if (name === 'passport-google-oauth20') return { Strategy: class {} };
      if (name === './config') return { google: { isConfigured: false } };
      if (name === './roleSync') return {};
      if (name === './db') return { query: async () => ({
        rows: storedRoles === null ? [] : [{ id: 'fixture', roles: [...storedRoles] }]
      }) };
      throw new Error('Unexpected auth dependency: ' + name);
    }
  });
  const load = () => new Promise((resolve, reject) => deserialize('fixture', (error, user) => error ? reject(error) : resolve(user)));
  let user = await load();
  assert.deepEqual([...user.roles], ['Lead Teacher', 'Teacher']);
  assert.deepEqual(storedRoles, ['Lead Teacher']);
  let allowed = false;
  ensureRole('Teacher')({ user }, {}, () => { allowed = true; });
  assert.equal(allowed, true);
  let denied;
  const response = { status(code) { denied = code; return this; }, render() {} };
  ensureRole('ADMIN')({ user }, response, () => assert.fail('Lead Teacher must not be ADMIN'));
  assert.equal(denied, 403);
  denied = undefined;
  let lookedUp = false;
  const middleware = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'middleware.js'), 'utf8'), {
    module: middleware,
    require(name) {
      assert.equal(name, './db');
      return { query: async (sql, params) => {
        lookedUp = true;
        assert.deepEqual([...params], ['fixture', 'dtech-hub', 'admin.manage']);
        return { rowCount: 0 };
      } };
    }
  });
  await middleware.exports.ensureHubPermission('dtech-hub', 'admin.manage')({ user }, response,
    () => assert.fail('Global Lead Teacher must not grant hub administration'));
  assert.equal(lookedUp, true);
  assert.equal(denied, 403);
  storedRoles = ['Lead Teacher', 'Teacher'];
  user = await load();
  assert.equal(user.roles.filter(role => role === 'Teacher').length, 1);
  storedRoles = ['Staff'];
  user = await load();
  assert.deepEqual([...user.roles], ['Staff']);
  storedRoles = ['Teacher'];
  assert.deepEqual([...(await load()).roles], ['Teacher']);
  storedRoles = null;
  assert.equal(await load(), false);
});
