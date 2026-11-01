const express = require('express');
const helmet = require('helmet');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const crypto = require('crypto');
const { Pool } = require('pg');
const { createModuleRouter } = require('./app');
const { authReturn } = require('./authReturn');
const { pickerPolicy } = require('./googleDrive');
const { selectRegionalHolidays } = require('./regionalHolidays');

const env = process.env;
const appBaseUrl = env.APP_BASE_URL || env.RENDER_EXTERNAL_URL;
if (!env.DATABASE_URL) throw new Error('Set a separate module DATABASE_URL.');
const pool = new Pool({ connectionString: env.DATABASE_URL, ssl: env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false } });
const app = express();
app.set('trust proxy', 1);
const imageOrigins = ['https://lh3.googleusercontent.com'];
if (env.GLOBAL_CONTROL_URL) imageOrigins.push(new URL(env.GLOBAL_CONTROL_URL).origin);
app.use(helmet(pickerPolicy(imageOrigins)));
app.get('/health', async (req, res) => {
  try { await pool.query('SELECT 1'); res.json({ status: 'ok', database: 'connected' }); }
  catch { console.error('Module database health check failed.'); res.status(503).json({ status: 'error' }); }
});
const required = ['SESSION_SECRET', 'GLOBAL_CONTROL_URL', 'MODULE_CLIENT_ID'];
const missing = required.filter((key) => !env[key]);
if (!appBaseUrl) missing.push('APP_BASE_URL or RENDER_EXTERNAL_URL');
if (missing.length) {
  console.warn('Sign-in setup required:', missing.join(', '));
  app.use((req, res) => res.status(503).type('text').send('DEVELOPMENT - TEST DATA ONLY\nFramework deployed. Configure Global Control sign-in in Render before use.'));
} else {
  const core = new URL(env.GLOBAL_CONTROL_URL);
  const base = new URL(appBaseUrl);
  if (core.protocol !== 'https:' || base.protocol !== 'https:' || core.username || core.password
    || core.pathname !== '/' || core.search || core.hash || base.username || base.password || base.pathname !== '/' || base.search || base.hash) {
    throw new Error('Global Control and app URLs must be HTTPS origins.');
  }
  const callback = new URL('/auth/global-control/callback', base).href;
  const save = (req) => new Promise((resolve, reject) => req.session.save((error) => error ? reject(error) : resolve()));
  const regenerate = (req) => new Promise((resolve, reject) => req.session.regenerate((error) => error ? reject(error) : resolve()));
  const wrap = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
  async function coreRequest(route, body, token) {
    return fetch(new URL('/module-auth/' + route, core), {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ client_id: env.MODULE_CLIENT_ID, ...body })
    });
  }
  app.use((req, res, next) => { res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }); next(); });
  app.use(session({
    name: 'teacher-planner.sid', secret: env.SESSION_SECRET, resave: false, saveUninitialized: false,
    store: new PgSession({ pool, createTableIfMissing: true }),
    cookie: { httpOnly: true, secure: env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 8 * 60 * 60 * 1000 }
  }));
  app.get('/auth/global-control', wrap(async (req, res) => {
    const state = crypto.randomBytes(32).toString('base64url');
    const verifier = crypto.randomBytes(32).toString('base64url');
    req.session.handoff = { state, verifier, started: Date.now(), returnTo: authReturn(req.query.next) };
    await save(req);
    const target = new URL('/module-auth/authorize', core);
    for (const [key, value] of Object.entries({
      client_id: env.MODULE_CLIENT_ID, redirect_uri: callback, state,
      code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256'
    })) target.searchParams.set(key, value);
    res.redirect(target.href);
  }));
  app.get('/auth/global-control/callback', wrap(async (req, res) => {
    const pending = req.session.handoff;
    delete req.session.handoff;
    await save(req);
    if (!pending || Date.now() - pending.started > 10 * 60 * 1000
      || typeof req.query.state !== 'string' || req.query.state !== pending.state
      || typeof req.query.code !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(req.query.code)) {
      console.warn('Global Control handoff state was invalid or expired.');
      return res.status(403).type('text').send('Sign-in expired or invalid. Start again at /auth/global-control.');
    }
    const response = await coreRequest('token', { code: req.query.code, code_verifier: pending.verifier, redirect_uri: callback });
    if (!response.ok) {
      console.warn('Global Control code exchange was rejected.');
      return res.status(403).type('text').send('Global Control sign-in was rejected. Start again at /auth/global-control.');
    }
    const result = await response.json();
    if (typeof result.access_token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(result.access_token)) throw new Error('Invalid Global Control response.');
    await regenerate(req);
    req.session.moduleToken = result.access_token;
    await save(req);
    res.redirect(authReturn(pending.returnTo));
  }));
  app.use((req, res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('origin') !== base.origin) {
      console.warn('Cross-origin module mutation was rejected.');
      return res.status(403).json({ error: 'Use the module site to submit changes.' });
    }
    next();
  });
  app.post('/logout', wrap(async (req, res) => {
    if (req.session.moduleToken) {
      const response = await coreRequest('revoke', {}, req.session.moduleToken);
      if (!response.ok) throw new Error('Global Control sign-out failed.');
    }
    await new Promise((resolve, reject) => req.session.destroy((error) => error ? reject(error) : resolve()));
    res.clearCookie('teacher-planner.sid');
    res.json({ signedOut: true });
  }));
  app.use(wrap(async (req, res, next) => {
    if (!req.session.moduleToken) {
      if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Sign-in expired. Copy unsaved work, sign in again in another tab, then retry.' });
      return res.redirect('/auth/global-control');
    }
    const response = await coreRequest('identity', {}, req.session.moduleToken);
    if (response.status === 401 || response.status === 403) {
      delete req.session.moduleToken;
      await save(req);
      if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Sign-in expired. Copy unsaved work, sign in again in another tab, then retry.' });
      return res.redirect('/auth/global-control');
    }
    if (!response.ok) throw new Error('Global Control identity check failed.');
    const user = await response.json();
    if (typeof user.id !== 'string' || typeof user.email !== 'string' || !Array.isArray(user.roles)
      || !user.roles.some(role => ['ADMIN', 'Teacher'].includes(role))) {
      throw new Error('Global Control returned an invalid identity.');
    }
    req.user = user;
    req.moduleStandalone = true;
    next();
  }));
  app.get('/nav-data', (req, res) => res.json({
    signedIn: true, name: req.user.display_name, email: req.user.email, avatarUrl: req.user.avatar_url,
    assignRolesUrl: req.user.roles.includes('ADMIN') || req.user.module_roles?.includes('lead-teacher')
      ? new URL('/hubs/teacher-planner/roles', core).href : null,
    isAdmin: req.user.roles.includes('ADMIN'), searchModule: { key: 'core', label: 'Global Control' }
  }));
  app.get('/api/school-calendar/:year', wrap(async (req, res) => {
    const year = Number(req.params.year);
    if (!/^\d{4}$/.test(req.params.year) || year < 2000 || year > 2100) {
      console.warn('School calendar year rejected.');
      return res.status(400).json({ error: 'Choose a valid calendar year.' });
    }
    const response = await coreRequest('school-calendar', { year }, req.session.moduleToken);
    if (!response.ok) {
      console.warn('Shared school calendar request failed:', response.status);
      return res.status(response.status).json({ error: 'School holiday highlights could not be loaded from Global Control. Please retry.' });
    }
    const preferences = await pool.query("SELECT content FROM planner_sections WHERE owner_id=$1 AND year=2000 AND section='preferences' AND entry_key='main'", [req.user.id]);
    res.json(selectRegionalHolidays(await response.json(), preferences.rows[0]?.content.anniversaryRegion || 'Westland'));
  }));
  app.get('/module-search', wrap(async (req, res) => {
    const response = await coreRequest('search', { q: req.query.q }, req.session.moduleToken);
    if (!response.ok) {
      console.warn('Global Control search request failed.');
      return res.status(response.status).json({ error: 'Global Control search could not be loaded. Please retry.' });
    }
    res.json(await response.json());
  }));
  app.use('/', createModuleRouter({
    query: (sql, values) => pool.query(sql, values),
    loadClasses: async (req, year) => {
      const response = await coreRequest('attendance-classes', { year }, req.session.moduleToken);
      if (!response.ok) {
        if (response.headers.get('content-type')?.includes('application/json')) {
          const result = await response.json();
          if (typeof result.error === 'string') throw new Error(result.error);
        }
        throw new Error('School class-list request returned HTTP ' + response.status + '. Check the Global Control deployment and student upload.');
      }
      return response.json();
    },
    loadSchoolCalendar: async (req, year) => {
      const response = await coreRequest('school-calendar', { year }, req.session.moduleToken);
      if (!response.ok) throw new Error('School term dates could not be loaded from Global Control. Please retry.');
      return response.json();
    },
    loadStaff: async (req, options = {}) => {
      const response = await coreRequest('staff', options, req.session.moduleToken);
      if (!response.ok) throw new Error('Global Control staff request returned HTTP ' + response.status + '.');
      return response.json();
    }
  }));
}
app.use((error, req, res, next) => {
  console.error('Module request failed.');
  if (res.headersSent) return next(error);
  res.status(500).json({ error: 'Module request failed. Contact the project owner.' });
});
const server = app.listen(Number(env.PORT || 3000), '0.0.0.0', () => console.log(`Module listening on port ${server.address().port}`));
process.on('SIGTERM', () => server.close(() => pool.end().then(() => process.exit(0))));
