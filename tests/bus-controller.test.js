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
  customToken: (uid, claims) => `token-for-${uid}-${claims.busControllerRole}`,
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

test('Lead Teachers get the routes page; testers see every staff page; only ADMIN manages users', async () => {
  assert.equal((await get('/principal.html', 'lead')).status, 200);
  assert.equal((await get('/principal.html', 'tester')).status, 200);
  assert.equal((await get('/principal.html', 'admin')).status, 200);
  assert.equal((await get('/principal.html', 'teacher')).status, 403);
  assert.equal((await get('/admin.html', 'admin')).status, 200);
  assert.equal((await get('/admin.html', 'lead')).status, 403);
  assert.equal((await get('/admin.html', 'tester')).status, 200);
  assert.deepEqual(await staffAccess(users.tester, dbQuery), { principal: 'tester', admin: 'tester', westroad: 'tester' });
  assert.deepEqual(await staffAccess(users.lead, dbQuery), { principal: 'principal' });
});

test('testers get a view-only token for Westroad hazards and user management too', async () => {
  for (const page of ['westroad', 'admin']) {
    updates = [];
    const response = await get(`/api/firebase-token?page=${page}`, 'tester');
    assert.deepEqual(await response.json(), { token: 'token-for-core-t1-tester', viewOnly: true }, page);
    assert.equal(updates[0].record.role, 'tester');
  }
});

test('the public Westroad page leaves non-testers alone', async () => {
  assert.equal((await get('/westroad.html', 'teacher')).status, 200);
  assert.equal((await get('/api/firebase-token?page=westroad')).status, 401);
  assert.equal((await get('/api/firebase-token?page=westroad', 'lead')).status, 403);
  assert.deepEqual(updates, []);
});

test('Firebase token records the Global Control role for Westland High only', async () => {
  const response = await get('/api/firebase-token?page=principal', 'lead');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { token: 'token-for-core-l1-principal', viewOnly: false });
  assert.deepEqual(updates, [{ uid: 'core-l1', record: {
    name: 'Principal', email: 'principal@westlandhigh.school.nz', role: 'principal', schoolId: 'westland high school'
  } }]);

  updates = [];
  assert.deepEqual(await (await get('/api/firebase-token?page=principal', 'tester')).json(), { token: 'token-for-core-t1-tester', viewOnly: true });
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

  const [header, payload, signature] = helper.customToken('core-l1', { busControllerRole: 'tester' }).split('.');
  assert.ok(crypto.verify('RSA-SHA256', Buffer.from(`${header}.${payload}`), publicKey, Buffer.from(signature, 'base64url')));
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
  assert.equal(claims.uid, 'core-l1');
  assert.deepEqual(claims.claims, { busControllerRole: 'tester' });
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
  assert.equal(createFirebase({ env: {} }).setupProblem, 'missing');
  assert.equal(createFirebase({ env: { BUS_CONTROLLER_FIREBASE_SERVICE_ACCOUNT: '-----BEGIN PRIVATE KEY-----' } }).setupProblem, 'not-json');
  assert.equal(createFirebase({ env: { BUS_CONTROLLER_FIREBASE_SERVICE_ACCOUNT: '{"apiKey":"x"}' } }).setupProblem, 'not-service-account');
  assert.equal(createFirebase({ env: { BUS_CONTROLLER_FIREBASE_SERVICE_ACCOUNT: `\n ${JSON.stringify(account, null, 2)}\n` } }).configured, true);
});

async function runCoreSession(viewOnly, { page = 'principal', tokenOk = true, currentUid = 'core-t1' } = {}) {
  const vm = require('vm');
  const writes = [];
  const Reference = function () {};
  ['set', 'update', 'remove', 'setWithPriority', 'setPriority', 'transaction'].forEach((name) => {
    Reference.prototype[name] = function () { writes.push(name); return Promise.resolve(); };
  });
  Reference.prototype.push = function (value) { if (value !== undefined) writes.push('push'); return new Reference(); };
  const alerts = [];
  const links = [];
  let signedInWith;
  let signOuts = 0;
  let redirectedTo;
  const context = {
    location: { pathname: `/bus-controller/${page}.html`, replace(url) { redirectedTo = url; } },
    fetch: async () => (tokenOk ? { ok: true, json: async () => ({ token: 'T', viewOnly }) } : { ok: false, status: 401 }),
    alert: (message) => alerts.push(message),
    encodeURIComponent,
    Promise,
    Date,
    Error,
    firebase: { database: { Reference } },
    auth: {
      signOut: async () => { signOuts += 1; },
      signInWithCustomToken: async (token) => { signedInWith = token; },
      onAuthStateChanged: (callback) => { callback(currentUid ? { uid: currentUid } : null); return () => {}; }
    },
    document: {
      createElement: (tag) => { const node = { tag, style: {}, appendChild() {} }; if (tag === 'a') links.push(node); return node; },
      createTextNode: (text) => ({ text }),
      body: { appendChild() {} }
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(PUBLIC_DIR, 'core-session.js'), 'utf8'), context);
  const ready = await Promise.race([
    new Promise((resolve) => context.auth.onAuthStateChanged(() => resolve(true))),
    new Promise((resolve) => setTimeout(() => resolve(false), 200))
  ]);
  const ref = new Reference();
  const results = await Promise.allSettled([ref.set({}), ref.update({}), ref.remove(), ref.push({ name: 'x' }), ref.transaction(() => 1)]);
  ref.push();
  return { writes, alerts, results, signedInWith, signOuts, redirectedTo, ready, links: links.map((link) => link.href) };
}

test('testers see every staff page but cannot save, with links between them', async () => {
  for (const page of ['principal', 'westroad', 'admin']) {
    const tester = await runCoreSession(true, { page });
    assert.equal(tester.signedInWith, 'T', page);
    assert.deepEqual(tester.writes, [], page);
    assert.ok(tester.results.every((result) => result.status === 'rejected'), page);
    assert.equal(tester.alerts.length, 1, page);
    assert.deepEqual(tester.links, ['principal.html', 'westroad.html', 'admin.html']);
  }

  const lead = await runCoreSession(false);
  assert.deepEqual(lead.writes, ['set', 'update', 'remove', 'push', 'transaction']);
  assert.deepEqual(lead.links, []);
});

test('Westroad keeps its own Firebase login when Global Control says no', async () => {
  const westroad = await runCoreSession(false, { page: 'westroad', tokenOk: false, currentUid: 'firebase-westroad-user' });
  assert.equal(westroad.ready, true);
  assert.equal(westroad.signOuts, 0);
  assert.equal(westroad.signedInWith, undefined);
  assert.equal(westroad.redirectedTo, undefined);

  const oldStaff = await runCoreSession(false, { page: 'westroad', tokenOk: false, currentUid: 'core-t1' });
  assert.equal(oldStaff.signOuts, 1);

  const denied = await runCoreSession(false, { page: 'principal', tokenOk: false });
  assert.equal(denied.ready, false);
  assert.equal(denied.redirectedTo, 'staff?problem=1');
  assert.equal(denied.signOuts, 1);
});

test('Running Firebase page shows the off-site user steps to ADMIN only', async () => {
  const { renderFirebaseUsers } = require('../src/busController');
  const { ensureAuthenticated, ensureRole } = require('../src/middleware');
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));
  app.use((req, res, next) => {
    req.user = users[req.get('x-user')];
    req.isAuthenticated = () => Boolean(req.user);
    res.locals.currentUser = req.user;
    res.locals.isAdmin = Boolean(req.user?.roles.includes('ADMIN'));
    res.locals.activeRole = 'ADMIN';
    next();
  });
  app.get('/admin/firebase-users', ensureAuthenticated, ensureRole('ADMIN'), renderFirebaseUsers);
  const listener = await new Promise((resolve) => { const l = app.listen(0, '127.0.0.1', () => resolve(l)); });
  try {
    const url = `http://127.0.0.1:${listener.address().port}/admin/firebase-users`;
    const page = await fetch(url, { headers: { 'x-user': 'admin' } });
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /Running Firebase &ndash; Off-site Users/);
    assert.match(html, /Add user<\/strong> \(email and password\)/);
    assert.match(html, /<code>role<\/code>: <code>westroad<\/code>/);
    assert.match(html, /console\.firebase\.google\.com\/project\/whsbuscontroller\/authentication\/users/);
    assert.match(html, /console\.firebase\.google\.com\/project\/whsbuscontroller\/database\/whsbuscontroller-default-rtdb\/data/);
    assert.notEqual((await fetch(url, { redirect: 'manual', headers: { 'x-user': 'lead' } })).status, 200);
  } finally {
    await new Promise((resolve) => listener.close(resolve));
  }
});

test('lifted pages stay inside /bus-controller and drop the shared test logins', () => {
  for (const file of fs.readdirSync(PUBLIC_DIR)) {
    const text = fs.readFileSync(path.join(PUBLIC_DIR, file), 'utf8');
    assert.doesNotMatch(text, /\.\.\/index\.html/, file);
    assert.doesNotMatch(text, /par@test\.com|createAccountWithGoogle|GoogleAuthProvider/, file);
  }
  for (const file of ['principal.html', 'admin.html', 'westroad.html']) {
    assert.match(fs.readFileSync(path.join(PUBLIC_DIR, file), 'utf8'), /<script src="app\.js"><\/script>\s*<script src="core-session\.js"><\/script>/, file);
  }
  assert.match(fs.readFileSync(path.join(PUBLIC_DIR, 'admin.html'), 'utf8'), /role === 'admin' \|\| role === 'tester'/);
});
