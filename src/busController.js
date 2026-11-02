const crypto = require('crypto');
const path = require('path');
const express = require('express');
const { query } = require('./db');

const HUB = 'bus-controller-app';
const SCHOOL_ID = 'westland high school';
const DATABASE_URL = 'https://whsbuscontroller-default-rtdb.firebaseio.com';
const PUBLIC_DIR = path.join(__dirname, 'legacy', 'bus-controller', 'public');
const STAFF_PAGES = { principal: 'principal.html', admin: 'admin.html' };
// westroad.html stays public for Westroad's own Firebase login; Global Control staff may also get a token there.
const TOKEN_PAGES = { ...STAFF_PAGES, westroad: 'westroad.html' };
const CUSTOM_TOKEN_AUDIENCE = 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit';

function serviceAccount(env = process.env) {
  const raw = env.BUS_CONTROLLER_FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;
  try {
    const account = JSON.parse(raw);
    if (account.client_email && account.private_key) return account;
  } catch { /* reported below */ }
  console.warn('[bus-controller] BUS_CONTROLLER_FIREBASE_SERVICE_ACCOUNT is not a valid service account key.');
  return null;
}

function signJwt(account, payload) {
  const part = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const body = `${part({ alg: 'RS256', typ: 'JWT' })}.${part(payload)}`;
  return `${body}.${crypto.sign('RSA-SHA256', Buffer.from(body), account.private_key).toString('base64url')}`;
}

function createFirebase({ env = process.env, fetchImpl = (...args) => fetch(...args), now = () => Date.now() } = {}) {
  const account = serviceAccount(env);
  let cached = null;

  async function accessToken() {
    if (cached && cached.expires > now() + 60000) return cached.token;
    const iat = Math.floor(now() / 1000);
    const assertion = signJwt(account, {
      iss: account.client_email, aud: 'https://oauth2.googleapis.com/token', iat, exp: iat + 3600,
      scope: 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email'
    });
    const response = await fetchImpl('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString()
    });
    if (!response.ok) throw new Error(`Google sign-in for the Firebase service account failed (${response.status}).`);
    const data = await response.json();
    cached = { token: data.access_token, expires: now() + Number(data.expires_in || 3600) * 1000 };
    return cached.token;
  }

  return {
    configured: Boolean(account),
    customToken(uid, claims) {
      const iat = Math.floor(now() / 1000);
      // Custom claims are readable in Firebase rules as auth.token.busControllerRole.
      return signJwt(account, { iss: account.client_email, sub: account.client_email, aud: CUSTOM_TOKEN_AUDIENCE, iat, exp: iat + 3600, uid, ...(claims ? { claims } : {}) });
    },
    async updateUser(uid, record) {
      const response = await fetchImpl(`${DATABASE_URL}/users/${encodeURIComponent(uid)}.json`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(record)
      });
      if (!response.ok) throw new Error(`Updating the Bus Controller user record failed (${response.status}).`);
    }
  };
}

// Maps Global Control access to the Bus Controller page and Firebase role it may use.
async function staffAccess(user, dbQuery = query) {
  if (!user || !user.id || user.is_active === false) return {};
  const roles = (await dbQuery(
    `SELECT r.role_key FROM user_hub_roles a JOIN hub_roles r ON r.id = a.hub_role_id
     WHERE a.user_id = $1 AND r.hub_key = $2 AND a.area_key IS NULL`, [user.id, HUB]
  )).rows.map((row) => row.role_key);
  const access = {};
  if (user.roles?.includes('ADMIN')) Object.assign(access, { admin: 'admin', principal: 'principal' });
  if (roles.includes('lead-teacher')) access.principal = 'principal';
  // Testers see every staff page, including Westroad hazards, view only.
  if (roles.includes('tester')) {
    for (const page of Object.keys(TOKEN_PAGES)) access[page] = access[page] || 'tester';
  }
  return access;
}

const firebaseUid = (user) => `core-${user.id}`;

function createBusControllerRouter({ dbQuery = query, firebase = createFirebase() } = {}) {
  const router = express.Router();
  const problem = (res, status, message) => res.status(status).render('error', { title: 'Bus Controller', message });
  const signIn = (req, res) => res.redirect(`/auth/google?next=${encodeURIComponent(req.originalUrl)}`);

  router.get('/staff', async (req, res, next) => {
    try {
      if (!req.user) return signIn(req, res);
      res.set('Cache-Control', 'no-store');
      if (!firebase.configured) return problem(res, 503, 'Bus Controller staff sign-in is not set up yet. An administrator needs to add the Firebase service account key.');
      if (req.query.problem) return problem(res, 502, 'Bus Controller could not sign you in to its map database. Try again shortly, or contact the administrator.');
      const access = await staffAccess(req.user, dbQuery);
      if (access.principal && !req.user.roles?.includes('ADMIN')) return res.redirect(STAFF_PAGES.principal);
      if (access.admin) return res.redirect(STAFF_PAGES.admin);
      return problem(res, 403, 'Your school account does not have Bus Controller access. Ask a Bus Controller Lead Teacher.');
    } catch (error) { return next(error); }
  });

  router.get(Object.values(STAFF_PAGES).map((file) => `/${file}`), async (req, res, next) => {
    try {
      if (!req.user) return signIn(req, res);
      const page = Object.keys(STAFF_PAGES).find((key) => `/${STAFF_PAGES[key]}` === req.path);
      if (!(await staffAccess(req.user, dbQuery))[page]) return problem(res, 403, 'Your school account does not have access to this Bus Controller page.');
      res.set('Cache-Control', 'no-store');
      return next();
    } catch (error) { return next(error); }
  });

  router.get('/api/firebase-token', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!req.user) return res.status(401).json({ error: 'School sign-in required.' });
    if (!firebase.configured) return res.status(503).json({ error: 'Bus Controller staff sign-in is not set up yet.' });
    const page = String(req.query.page || '');
    const uid = firebaseUid(req.user);
    try {
      const role = TOKEN_PAGES[page] ? (await staffAccess(req.user, dbQuery))[page] : null;
      if (!role) {
        // Removing access in Global Control also removes it from any earlier Firebase session.
        // The public Westroad page only asks in case the visitor is staff, so a "no" there changes nothing.
        if (page !== 'westroad') await firebase.updateUser(uid, { role: 'none' }).catch(() => {});
        return res.status(403).json({ error: 'No Bus Controller access for this page.' });
      }
      const record = { name: req.user.display_name || req.user.email, email: req.user.email, role };
      if (role !== 'admin') record.schoolId = SCHOOL_ID;
      await firebase.updateUser(uid, record);
      return res.json({ token: firebase.customToken(uid, { busControllerRole: role }), viewOnly: role === 'tester' });
    } catch (error) {
      console.error('[bus-controller] staff sign-in failed:', error.message);
      return res.status(502).json({ error: 'Bus Controller could not sign you in to its map database.' });
    }
  });

  router.use(express.static(PUBLIC_DIR, { index: 'index.html' }));
  return router;
}

module.exports = { createBusControllerRouter, createFirebase, staffAccess, HUB, SCHOOL_ID };
