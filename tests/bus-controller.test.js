const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const { createBusControllerRouter, createFirebase, staffAccess } = require('../src/busController');

const PUBLIC_DIR = path.join(__dirname, '..', 'src', 'legacy', 'bus-controller', 'public');
let server;
let base;
let hubRoles;
let updates;
let configured;

const dbQuery = async (sql, params) => {
  assert.match(sql, /FROM user_hub_roles/);
  assert.deepEqual(params.slice(1), ['bus-controller-app']);
  return { rows: (hubRoles[params[0]] || []).map((role_key) => ({ role_key })) };
};

const firebase = {
  get configured() { return configured; },
  customToken: (uid) => `token-for-${uid}`,
  updateUser: async (uid, record) => { updates.push({ uid, record }); }
};

const users = {
  admin: { id: 'a1', email: 'admin@westlandhigh.school.nz', display_name: 'Admin', roles: ['ADMIN'] },
  lead: { id: 'l1', email: 'principal@westlandhigh.school.nz', display_name: 'Principal', roles: ['TEACHER'] },
  tester: { id: 't1', email: 'j_leaf@westlandhigh.school.nz', display_name: 'J Leaf', roles: ['STUDENT'] },
  teacher: { id: 'p1', email: 'teacher@westlandhigh.school.nz', display_name: 'Teacher', roles: ['TEACHER'] }
};

test.before(async () => {
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));
  app.use((req, res, next) => {
    req.user = users[req.get('x-user')];
    res.locals.activeRole = 'Staff';
    next();
  });
  app.use('/bus-controller', createBusControllerRouter({ dbQuery, firebase }));
  app.use((error, req, res, next) => res.status(500).send(error.message));
  server = await new Promise((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  base = `http://127.0.0.1:${server.address().port}/bus-controller`;
});
test.after(() => new Promise((resolve) => server.close(resolve)));
test.beforeEach(() => {
  hubRoles = { l1: ['lead-teacher'], t1: ['tester'], p1: ['teacher'] };
  updates = [];
  configured = true;
});

const get = (route, user) => fetch(base + route, { redirect: 'manual', headers: user ? { 'x-user': user } : {} });

test('parent map, Westroad sign-in and shared files are public', async () => {
  for (const route of ['/', '/parent.html', '/westroad.html', '/app.js', '/style.css', '/core-session.js']) {
    assert.equal((await get(route)).status, 200, route);
  }
});

test('staff pages need a Global Control sign-in', async () => {
  for (const route of ['/staff', '/principal.html', '/admin.html']) {
    const response = await get(route);
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), `/auth/google?next=${encodeURIComponent(`/bus-controller${route}`)}`);
  }
  assert.equal((await get('/api/firebase-token?page=principal')).status, 401);
});

test('staff sign-in sends each Global Control role to its own page', async () => {
  assert.equal((await get('/staff', 'admin')).headers.get('location'), 'admin.html');
  assert.equal((await get('/staff', 'lead')).headers.get('location'), 'principal.html');
  assert.equal((await get('/staff', 'tester')).headers.get('location'), 'principal.html');
  assert.equal((await get('/staff', 'teacher')).status, 403);
  configured = false;
  assert.equal((await get('/staff', 'lead')).status, 503);
});

test('Lead Teachers and testers get the routes page only; only ADMIN gets user management', async () => {
  assert.equal((await get('/principal.html', 'lead')).status, 200);
  assert.equal((await get('/principal.html', 'tester')).status, 200);
  assert.equal((await get('/principal.html', 'admin')).status, 200);
  assert.equal((await get('/principal.html', 'teacher')).status, 403);
  assert.equal((await get('/admin.html', 'admin')).status, 200);
  assert.equal((await get('/admin.html', 'lead')).status, 403);
  assert.equal((await get('/admin.html', 'tester')).status, 403);
});

test('Firebase token records the Global Control role for Westland High only', async () => {
  const response = await get('/api/firebase-token?page=principal', 'lead');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { token: 'token-for-core-l1' });
  assert.deepEqual(updates, [{ uid: 'core-l1', record: {
    name: 'Principal', email: 'principal@westlandhigh.school.nz', role: 'principal', schoolId: 'westland high school'
  } }]);

  updates = [];
  await get('/api/firebase-token?page=principal', 'tester');
  assert.equal(updates[0].record.role, 'tester');

  updates = [];
  await get('/api/firebase-token?page=admin', 'admin');
  assert.deepEqual(updates[0].record, { name: 'Admin', email: 'admin@westlandhigh.school.nz', role: 'admin' });
});

test('removed access also removes the Firebase role', async () => {
  const response = await get('/api/firebase-token?page=admin', 'lead');
  assert.equal(response.status, 403);
  assert.deepEqual(updates, [{ uid: 'core-l1', record: { role: 'none' } }]);
  assert.equal((await get('/api/firebase-token?page=other', 'admin')).status, 403);
});

test('access ignores inactive users and area-only roles', async () => {
  assert.deepEqual(await staffAccess({ ...users.lead, is_active: false }, dbQuery), {});
  let sql = '';
  await staffAccess(users.lead, async (text, params) => { sql = text; return dbQuery(text, params); });
  assert.match(sql, /area_key IS NULL/);
});

test('Firebase helper signs custom tokens and writes users with a cached service token', async () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const account = { client_email: 'bus@whsbuscontroller.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) };
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.startsWith('https://oauth2.googleapis.com')) return { ok: true, json: async () => ({ access_token: 'service-token', expires_in: 3600 }) };
    return { ok: true, json: async () => ({}) };
  };
  const helper = createFirebase({ env: { BUS_CONTROLLER_FIREBASE_SERVICE_ACCOUNT: JSON.stringify(account) }, fetchImpl, now: () => 1700000000000 });
  assert.equal(helper.configured, true);

  const [header, payload, signature] = helper.customToken('core-l1').split('.');
  assert.ok(crypto.verify('RSA-SHA256', Buffer.from(`${header}.${payload}`), publicKey, Buffer.from(signature, 'base64url')));
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
  assert.equal(claims.uid, 'core-l1');
  assert.equal(claims.iss, account.client_email);
  assert.equal(claims.exp - claims.iat, 3600);
  assert.match(claims.aud, /identitytoolkit/);

  await helper.updateUser('core-l1', { role: 'principal' });
  await helper.updateUser('core-l1', { role: 'none' });
  assert.equal(calls.filter((call) => call.url.startsWith('https://oauth2')).length, 1);
  const write = calls.at(-1);
  assert.equal(write.url, 'https://whsbuscontroller-default-rtdb.firebaseio.com/users/core-l1.json');
  assert.equal(write.options.method, 'PATCH');
  assert.equal(write.options.headers.Authorization, 'Bearer service-token');

  assert.equal(createFirebase({ env: {} }).configured, false);
});

test('lifted pages stay inside /bus-controller and drop the shared test logins', () => {
  for (const file of fs.readdirSync(PUBLIC_DIR)) {
    const text = fs.readFileSync(path.join(PUBLIC_DIR, file), 'utf8');
    assert.doesNotMatch(text, /\.\.\/index\.html/, file);
    assert.doesNotMatch(text, /par@test\.com|createAccountWithGoogle|GoogleAuthProvider/, file);
  }
  for (const file of ['principal.html', 'admin.html']) {
    assert.match(fs.readFileSync(path.join(PUBLIC_DIR, file), 'utf8'), /<script src="app\.js"><\/script>\s*<script src="core-session\.js"><\/script>/, file);
  }
});
