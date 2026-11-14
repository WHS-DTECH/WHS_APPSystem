const crypto = require('crypto');
const express = require('express');
const { query } = require('./db');
const { createModuleSearch } = require('./moduleSearch');
const { loadSchoolCalendar } = require('./schoolCalendar');
const { staffDirectory, attendanceClasses } = require('./kamarDirectory');
const { httpsAppUrl } = require('./appAddresses');
const { query: kamarQuery } = require('./legacy/kamar-uploader/db');
const { userHasHubPermission } = require('./hubRoles');

const hash = (value) => crypto.createHash('sha256').update(value).digest('base64url');
const opaque = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
const GRANT_SECONDS = 8 * 60 * 60;

async function authorisedModuleUser(userId, moduleKey, dbQuery = query) {
  const user = (await dbQuery(`SELECT u.id,u.email,u.display_name,u.avatar_url,
      CASE WHEN EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id
        WHERE ur.user_id=u.id AND r.name='ADMIN') THEN ARRAY['ADMIN']::text[]
        ELSE ARRAY['Teacher']::text[] END AS roles
      ,ARRAY(SELECT r.role_key FROM user_hub_roles ur JOIN hub_roles r ON r.id=ur.hub_role_id
        WHERE ur.user_id=u.id AND ur.area_key IS NULL AND r.hub_key=$2
          AND r.role_key IN ('lead-teacher','teacher','technician')) AS module_roles
      FROM users u WHERE u.id=$1 AND u.is_active=true
      AND NOT EXISTS (SELECT 1 FROM modules m WHERE m.module_key=$2 AND m.is_active=false) AND (
        EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id
          WHERE ur.user_id=u.id AND r.name='ADMIN')
        OR ($2 NOT IN ('core','kamar-uploader','module-builder') AND (
          EXISTS (
            SELECT 1 FROM user_hub_roles ur JOIN hub_roles r ON r.id=ur.hub_role_id
            JOIN hub_role_permissions rp ON rp.hub_role_id=r.id
            JOIN hub_permissions p ON p.id=rp.hub_permission_id AND p.hub_key=r.hub_key
            WHERE ur.user_id=u.id AND ur.area_key IS NULL AND r.hub_key=$2
              AND r.role_key IN ('lead-teacher','teacher','technician') AND p.permission_key='home.view'
          ) OR EXISTS (
            SELECT 1 FROM teacher_module_assignments t JOIN modules m ON m.id=t.module_id
            WHERE t.user_id=u.id AND m.module_key=$2 AND m.is_active=true
          )
        )))`, [userId, moduleKey])).rows[0];
  return user || (moduleKey === 'whs-techstudent-tracker' ?
    await require('./studentTracker').approvedTrackerUser(userId, dbQuery) : undefined);
}

function createModuleIdentityRouter({
  dbQuery = query,
  directoryQuery = kamarQuery,
  schoolCalendar = loadSchoolCalendar,
  trackerService,
  loadMyStandards,
  learningSitesSyncService
} = {}) {
  const router = express.Router();
  const tracker = trackerService || require('./studentTracker').createStudentTrackerService({ dbQuery, directoryQuery });
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
    let url;
    try { url = new URL(httpsAppUrl(row.app_url)); }
    catch (error) { console.warn('[module-identity] Invalid registered app URL:', error.message); return null; }
    return { ...row, callback: new URL('/auth/global-control/callback', url.origin).href };
  }
  async function authorisedUser(registered, userId) {
    return authorisedModuleUser(userId, registered.slug, dbQuery);
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
      res.json(await staffDirectory(user, { includeEmails }, directoryQuery, dbQuery));
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
    if (req.body.term !== undefined && (!Number.isInteger(req.body.term) || req.body.term < 1 || req.body.term > 4)) {
      return deny(res, 'Choose a valid attendance term.', 400);
    }
    try {
      res.json(await attendanceClasses(user, req.body.year, directoryQuery, req.body.term));
    } catch (error) {
      if ([400, 404, 409].includes(error.status)) return deny(res, error.message, error.status);
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
  router.post('/student-tracker', wrap(async (req, res) => {
    const user = await identity(req, res);
    if (!user) return;
    if (req.body.client_id?.split(':')[0] !== 'whs-techstudent-tracker') {
      return deny(res, 'Student Tracker records are restricted to the registered Student Tracker app.');
    }
    try { res.json(await tracker.run(user, req.body)); }
    catch (error) {
      console.error('Student Tracker request failed:', error.status ? error.message : 'Data source unavailable.');
      res.status(error.status || 502).json({ error: error.status ? error.message :
        'Student Tracker data could not be loaded. Check the Kamar Uploader, Tracker setup and Planner database, then retry.' });
    }
  }));
  router.post('/learning-area-profiles', wrap(async (req, res) => {
    const user = await identity(req, res);
    if (!user) return;
    if (req.body.client_id?.split(':')[0] !== 'whs-unit-library') {
      return deny(res, 'Learning Area Profiles are restricted to the registered WHS Unit Library app.');
    }
    try { res.json(await tracker.learningAreas(user, { year: req.body.year })); }
    catch (error) {
      console.error('Learning Area Profiles request failed:', error.status ? error.message : 'Data source unavailable.');
      res.status(error.status || 502).json({ error: error.status ? error.message :
        'Learning Area Profiles could not be loaded. Check the department directory, KAMAR staff timetables, Student Tracker setup and Learning Sites content, then retry.' });
    }
  }));
  router.post('/teaching-subjects', wrap(async (req, res) => {
    const user = await identity(req, res);
    if (!user) return;
    if (req.body.client_id?.split(':')[0] !== 'whs-assessment-manager') {
      return deny(res, 'Teaching subjects are available only to the registered WHS Assessment Manager app.');
    }
    try { res.json(await tracker.teachingSubjects(user, { year: req.body.year })); }
    catch (error) {
      console.error('Teaching subjects request failed:', error.status ? error.message : 'Data source unavailable.');
      res.status(error.status || 502).json({ error: error.status ? error.message :
        'Your teaching subjects could not be loaded. Check KAMAR staff timetables and Student Tracker class links, then retry.' });
    }
  }));
  router.post('/class-size', wrap(async (req, res) => {
    const user = await identity(req, res);
    if (!user) return;
    if (req.body.client_id?.split(':')[0] !== 'whs-assessment-manager') {
      return deny(res, 'Class sizes are available only to the registered WHS Assessment Manager app.');
    }
    try { res.json(await tracker.courseSize(user, { year: req.body.year, course: req.body.course })); }
    catch (error) {
      console.error('Class size request failed:', error.status ? error.message : 'Data source unavailable.');
      res.status(error.status || 502).json({ error: error.status ? error.message :
        'The class size could not be loaded from Student Tracker. Check KAMAR timetables and Tracker class links, then retry.' });
    }
  }));
  router.post('/learning-area-sync', wrap(async (req, res) => {
    const user = await identity(req, res);
    if (!user) return;
    if (req.body.client_id?.split(':')[0] !== 'whs-unit-library') {
        return deny(res, 'Learning Sites sync is restricted to the registered WHS Unit Library app.');
    }

    try {
        const canSync = await userHasHubPermission(user, 'learning-sites', 'admin.manage', dbQuery);
        if (req.body.action === 'access') {
          return res.json({ canSync });
        }
        if (!canSync) {
          return deny(res, 'Learning Sites administrator access is required to manage or sync course content.');
        }
        if (req.body.action === 'standards') {
          const year = req.body.year;
          if (!Number.isInteger(year) || year < 2000 || year > 2100) {
            return deny(res, 'Choose a valid school year.', 400);
          }
          if (!await authorisedModuleUser(user.id, 'teacher-planner', dbQuery)) {
            return deny(res, 'Teacher Planner access is required to use My Standards.', 403);
          }
          if (typeof loadMyStandards !== 'function') {
            return res.status(503).json({ error: 'Teacher Planner My Standards are unavailable.' });
          }
          return res.json({ standards: await loadMyStandards(user.id, year) });
        }

        if (!['preview', 'apply'].includes(req.body.action)) {
          return deny(res, 'Choose a valid Learning Sites sync action.', 400);
        }
        const store = learningSitesSyncService || require('./legacy/learning-sites/adminStore');
        await store.initAdminSchema();
        const result = req.body.action === 'preview'
          ? await store.previewCourseAssessmentsMerge(req.body.entries)
          : await store.mergeCourseAssessments(req.body.entries, user.display_name || user.email);
        return res.json(result);
    } catch (error) {
        console.error('Learning Sites sync request failed:', error.status ? error.message : 'A required data source is unavailable.');
        return res.status(error.status || 502).json({
          error: error.status ? error.message : 'Learning Sites sync is unavailable. Check the Learning Sites and Teacher Planner data sources, then retry.'
        });
    }
  }));
  return router;
}

module.exports = { createModuleIdentityRouter, authorisedModuleUser };
