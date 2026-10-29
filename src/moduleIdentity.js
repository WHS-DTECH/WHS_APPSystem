const crypto = require('crypto');
const express = require('express');
const { query } = require('./db');
const { createModuleSearch } = require('./moduleSearch');
const { loadSchoolCalendar } = require('./schoolCalendar');
const { loadDepartments } = require('./legacy/kamar-uploader/departments');

const hash = (value) => crypto.createHash('sha256').update(value).digest('base64url');
const opaque = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
const GRANT_SECONDS = 8 * 60 * 60;

function createModuleIdentityRouter({ dbQuery = query, schoolCalendar = loadSchoolCalendar } = {}) {
  const router = express.Router();
  const search = createModuleSearch({ dbQuery });
  router.use((req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
    next();
  });
  const wrap = (handler) => async (req, res, next) => {
    try { await handler(req, res); } catch (error) { next(error); }
  };
  function deny(res, message, status = 403) {
    console.warn('[module-identity]', message);
    return res.status(status).json({ error: message });
  }
  async function client(id) {
    if (typeof id !== 'string' || !/^[a-z][a-z0-9-]{2,59}:(development|staging|production)$/.test(id)) return null;
    const [slug, kind] = id.split(':');
    const row = (await dbQuery(`SELECT p.id,p.slug, e.kind, e.config->>'appUrl' AS app_url
      FROM module_builder_projects p JOIN module_builder_environments e ON e.project_id=p.id
      WHERE p.slug=$1 AND e.kind=$2 AND p.stage<>'archived'`, [slug, kind])).rows[0];
    if (!row?.app_url) return null;
    const url = new URL(row.app_url);
    if (url.protocol !== 'https:' || !/^[a-z0-9-]+\.onrender\.com$/.test(url.hostname)
      || url.username || url.password || url.port || url.search || url.hash) return null;
    return { ...row, callback: new URL('/auth/global-control/callback', url.origin).href };
  }
  async function authorisedUser(registered, userId) {
    return (await dbQuery(`SELECT u.id,u.email,u.display_name,u.avatar_url,
      CASE WHEN EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id
        WHERE ur.user_id=u.id AND r.name='ADMIN') THEN ARRAY['ADMIN']::text[]
        ELSE ARRAY['Teacher']::text[] END AS roles
      ,ARRAY(SELECT r.role_key FROM user_hub_roles ur JOIN hub_roles r ON r.id=ur.hub_role_id
        WHERE ur.user_id=u.id AND ur.area_key IS NULL AND r.hub_key=$2
          AND r.role_key IN ('lead-teacher','teacher','technician')) AS module_roles
      FROM users u WHERE u.id=$1 AND u.is_active=true AND (
        EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id
          WHERE ur.user_id=u.id AND r.name='ADMIN')
        OR ($2 NOT IN ('core','kamar-uploader','module-builder') AND EXISTS (
          SELECT 1 FROM user_hub_roles ur JOIN hub_roles r ON r.id=ur.hub_role_id
          WHERE ur.user_id=u.id AND ur.area_key IS NULL
            AND r.hub_key=$2 AND r.role_key IN ('lead-teacher','teacher','technician')
        )))`, [userId, registered.slug])).rows[0];
  }
  router.get('/authorize', wrap(async (req, res) => {
    const registered = await client(req.query.client_id);
    if (!registered || req.query.redirect_uri !== registered.callback || !opaque(req.query.state)
      || !opaque(req.query.code_challenge) || req.query.code_challenge_method !== 'S256') {
      return deny(res, 'Invalid module sign-in request.', 400);
    }
    if (!req.user) return res.redirect('/auth/google?next=' + encodeURIComponent(req.originalUrl));
    if (!await authorisedUser(registered, req.user.id)) {
      return deny(res, 'Ask an administrator to assign you a role in this module. System administration modules require Global ADMIN.');
    }
    const code = crypto.randomBytes(32).toString('base64url');
    await dbQuery("DELETE FROM module_identity_codes WHERE expires_at < NOW()");
    await dbQuery(`INSERT INTO module_identity_codes(code_hash,project_id,kind,user_id,challenge,callback_url)
      VALUES ($1,$2,$3,$4,$5,$6)`, [hash(code), registered.id, registered.kind, req.user.id, req.query.code_challenge, registered.callback]);
    const target = new URL(registered.callback);
    target.searchParams.set('code', code);
    target.searchParams.set('state', req.query.state);
    res.redirect(target.href);
  }));
  router.post('/token', wrap(async (req, res) => {
    const registered = await client(req.body.client_id);
    if (!registered || !opaque(req.body.code) || !opaque(req.body.code_verifier)
      || req.body.redirect_uri !== registered.callback) return deny(res, 'Invalid module code exchange.', 400);
    const grant = (await dbQuery(`DELETE FROM module_identity_codes
      WHERE code_hash=$1 AND project_id=$2 AND kind=$3 AND challenge=$4 AND callback_url=$5 AND expires_at>NOW()
      RETURNING user_id`, [hash(req.body.code), registered.id, registered.kind, hash(req.body.code_verifier), registered.callback])).rows[0];
    if (!grant) return deny(res, 'Module code expired, invalid or already used.', 401);
    if (!await authorisedUser(registered, grant.user_id)) return deny(res, 'Module access is no longer authorised.', 401);
    const token = crypto.randomBytes(32).toString('base64url');
    await dbQuery('DELETE FROM module_identity_grants WHERE expires_at < NOW()');
    await dbQuery(`INSERT INTO module_identity_grants(token_hash,project_id,kind,user_id,callback_url,expires_at)
      VALUES ($1,$2,$3,$4,$5,NOW()+make_interval(secs => $6))`,
    [hash(token), registered.id, registered.kind, grant.user_id, registered.callback, GRANT_SECONDS]);
    res.json({ access_token: token, token_type: 'Bearer', expires_in: GRANT_SECONDS });
  }));
  async function identity(req, res) {
    const registered = await client(req.body.client_id);
    const token = req.get('authorization')?.replace(/^Bearer /, '');
    if (!registered || !opaque(token)) { deny(res, 'Invalid module identity request.', 401); return null; }
    const grant = (await dbQuery(`SELECT g.user_id FROM module_identity_grants g
      WHERE g.token_hash=$1 AND g.project_id=$2 AND g.kind=$3 AND g.callback_url=$4 AND g.expires_at>NOW()`,
    [hash(token), registered.id, registered.kind, registered.callback])).rows[0];
    const user = grant ? await authorisedUser(registered, grant.user_id) : null;
    if (!user) { deny(res, 'Module access expired or no longer authorised.', 401); return null; }
    return user;
  }
  router.post('/identity', wrap(async (req, res) => {
    const user = await identity(req, res);
    if (user) res.json(user);
  }));
  router.post('/search', wrap(async (req, res) => {
    const user = await identity(req, res);
    if (!user) return;
    req.user = user;
    req.query = { path: '/dashboard', q: req.body.q };
    await search(req, res);
  }));
  router.post('/school-calendar', wrap(async (req, res) => {
    const user = await identity(req, res);
    if (!user) return;
    if (!Number.isInteger(req.body.year) || req.body.year < 2000 || req.body.year > 2100) {
      return deny(res, 'Choose a valid calendar year.', 400);
    }
    try { res.json(await schoolCalendar(req.body.year)); }
    catch (error) {
      console.error('Shared school calendar load failed:', error);
      res.status(502).json({ error: 'School terms and holidays could not be loaded from the Ministry. Calendar highlights are unavailable; retry shortly.' });
    }
  }));
  router.post('/staff', wrap(async (req, res) => {
    const user = await identity(req, res);
    if (!user) return;
    if (req.body.includeEmails !== undefined && typeof req.body.includeEmails !== 'boolean') {
      return deny(res, 'Choose whether staff school emails are required.', 400);
    }
    const includeEmails = req.body.includeEmails === true;
    if (includeEmails && !user.roles?.includes('ADMIN') && !user.module_roles?.includes('lead-teacher')) {
      return deny(res, 'Only administrators and module Lead Teachers can request staff school email mappings.');
    }
    try {
      const result = await dbQuery(`SELECT id::text AS id,code,first_name,last_name${includeEmails ? ',email_school' : ''}
        FROM staff_upload WHERE status='Current'
        AND (NULLIF(TRIM(first_name),'') IS NOT NULL OR NULLIF(TRIM(last_name),'') IS NOT NULL)
        ORDER BY lower(trim(last_name)) NULLS LAST,lower(trim(first_name)) NULLS LAST,id`);
      res.json({ staff: result.rows, departments: await loadDepartments(dbQuery, result.rows) });
    } catch (error) {
      console.error('Shared Kamar staff directory load failed.');
      res.status(502).json({ error: 'The current Kamar Uploader staff list could not be loaded. Check the staff upload and retry.' });
    }
  }));
  router.post('/attendance-classes', wrap(async (req, res) => {
    const user = await identity(req, res);
    if (!user) return;
    if (req.body.client_id?.split(':')[0] !== 'teacher-planner') {
      return deny(res, 'Student class lists are available only to Teacher Planner.');
    }
    if (!Number.isInteger(req.body.year) || req.body.year < 2000 || req.body.year > 2100) {
      return deny(res, 'Choose a valid attendance year.', 400);
    }
    const columns = ['mon', 'tue', 'wed', 'thu', 'fri']
      .flatMap(day => ['p1_1', 'p1_2', 'p2', 'p3', 'p4', 'p5'].map(period => day + '_' + period));
    try {
      const staff = await dbQuery(`SELECT DISTINCT upper(trim(code)) AS code FROM staff_upload
        WHERE status='Current' AND lower(trim(email_school))=lower(trim($1))
        AND NULLIF(TRIM(code),'') IS NOT NULL`, [user.email]);
      if (staff.rows.length !== 1) {
        return deny(res, staff.rows.length ?
          'Your school sign-in email matches multiple current staff codes. Ask an administrator to correct the Staff List.' :
          'Your school sign-in email has no current Staff List code. Ask an administrator to check your school email and staff code.', 409);
      }
      const staffCode = staff.rows[0].code;
      const { rows } = await dbQuery(`SELECT id_number,student_name,${columns.join(',')}
        FROM student_upload WHERE status='Current' AND upload_year=$1
        AND NULLIF(TRIM(id_number),'') IS NOT NULL AND NULLIF(TRIM(student_name),'') IS NOT NULL
        ORDER BY lower(student_name),id_number`, [req.body.year]);
      const classes = new Map();
      for (const student of rows) {
        for (const code of new Set(columns.map(key => student[key]?.trim()).filter(Boolean))) {
          const separator = code.indexOf('-');
          if (separator < 1 || !code.slice(0, separator).toUpperCase().split('/').map(value => value.trim()).includes(staffCode)) continue;
          if (!classes.has(code)) classes.set(code, new Map());
          classes.get(code).set(student.id_number, { id: 'k:' + student.id_number.trim(), name: student.student_name.trim() });
        }
      }
      res.json({ staffCode, classes: [...classes].sort(([a], [b]) => a.localeCompare(b))
        .map(([code, students]) => ({ code, students: [...students.values()] })) });
    } catch (error) {
      console.error('Attendance class directory load failed.');
      res.status(502).json({ error: 'School class lists could not be loaded. Check the current student timetable upload for this year.' });
    }
  }));
  router.post('/revoke', wrap(async (req, res) => {
    const token = req.get('authorization')?.replace(/^Bearer /, '');
    if (!opaque(token)) return deny(res, 'Invalid module sign-out request.', 401);
    await dbQuery('DELETE FROM module_identity_grants WHERE token_hash=$1', [hash(token)]);
    res.json({ signedOut: true });
  }));
  return router;
}

module.exports = { createModuleIdentityRouter };
