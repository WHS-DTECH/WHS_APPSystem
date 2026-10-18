const crypto = require('crypto');
const express = require('express');
const { query } = require('./db');
const { ensureAuthenticated, ensureRole } = require('./middleware');
const { HUBS } = require('./hubRoles');

const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
const directorySql = type => type === 'staff'
  ? `SELECT LOWER(TRIM(email_school)) AS email,
       TRIM(CONCAT_WS(' ', first_name, last_name)) AS display_name, code::text AS reference
     FROM staff_upload WHERE status='Current'`
  : `SELECT LOWER(TRIM(email_school)) AS email,
       TRIM(CONCAT_WS(' ', first_name, last_name)) AS display_name, id_number::text AS reference
     FROM student_details_upload WHERE status='Current'`;

function createAdminUsersRouter({ dbQuery = query, initDirectory = () => require('./legacy/kamar-uploader/store').init() } = {}) {
  const router = express.Router();
  router.use(ensureAuthenticated, ensureRole('ADMIN'));
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!req.session.adminUsersCsrf) req.session.adminUsersCsrf = crypto.randomBytes(32).toString('hex');
    if (req.method !== 'GET') {
      const supplied = Buffer.from(typeof req.body.csrf === 'string' ? req.body.csrf : '');
      const expected = Buffer.from(req.session.adminUsersCsrf);
      if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
        console.warn('User role form token rejected.');
        return res.status(403).render('error', { title: 'Form expired', message: 'Reload Assign User Roles and try again. No roles were changed.' });
      }
    }
    next();
  });
  const invalid = (res, message, status = 400) => {
    console.warn('User role change rejected:', message);
    return res.status(status).render('error', { title: 'Role change not saved', message });
  };
  const scopeKey = value => value === undefined ? 'global' : value;
  const validScope = value => typeof value === 'string' && (value === 'global' || Object.hasOwn(HUBS, value));
  const scopeUrl = module => '/admin/users?' + new URLSearchParams({ module });
  router.get('/', async (req, res, next) => {
    const module = scopeKey(req.query.module);
    if (!validScope(module)) return invalid(res, 'Choose Global Control or an available role-enabled hub.');
    const global = module === 'global';
    try {
      await initDirectory();
      const [modules, roles, assignments] = await Promise.all([
        dbQuery('SELECT DISTINCT hub_key FROM hub_roles WHERE hub_key = ANY($1::text[]) ORDER BY hub_key', [Object.keys(HUBS)]),
        global ? dbQuery("SELECT id,name,description FROM roles WHERE name NOT IN ('Staff','Student') ORDER BY name") :
          dbQuery('SELECT id,display_name AS name,description FROM hub_roles WHERE hub_key=$1 ORDER BY display_name', [module]),
        dbQuery(`SELECT u.id,u.display_name,u.email,r.id AS role_id,r.name AS role_name,ur.assignment_source,
          EXISTS (SELECT 1 FROM staff_upload s WHERE LOWER(TRIM(s.email_school))=LOWER(u.email) AND s.status='Current') AS is_staff,
          EXISTS (SELECT 1 FROM student_details_upload s WHERE LOWER(TRIM(s.email_school))=LOWER(u.email) AND s.status='Current') AS is_student
          FROM users u JOIN ${global ? 'user_roles' : "(SELECT user_id,hub_role_id AS role_id,'manual'::text AS assignment_source FROM user_hub_roles WHERE area_key IS NULL)"} ur ON ur.user_id=u.id
          JOIN ${global ? 'roles' : '(SELECT id,display_name AS name,hub_key FROM hub_roles)'} r ON r.id=ur.role_id
          WHERE ${global ? "r.name NOT IN ('Staff','Student')" : 'r.hub_key=$1'} ORDER BY LOWER(u.email),r.name`, global ? [] : [module])
      ]);
      const grouped = new Map();
      for (const row of assignments.rows) {
        if (!grouped.has(row.id)) grouped.set(row.id, { ...row, assignments: [] });
        grouped.get(row.id).assignments.push({ id: row.role_id, name: row.role_name, source: row.assignment_source });
      }
      res.render('admin/users', { title: 'Assign User Roles', roles: roles.rows, users: [...grouped.values()],
        module, moduleLabel: global ? 'Global Control' : HUBS[module].label,
        modules: modules.rows.map(row => ({ key: row.hub_key, label: HUBS[row.hub_key].label })),
        csrf: req.session.adminUsersCsrf, saved: ['added', 'removed'].includes(req.query.saved) ? req.query.saved : '' });
    } catch (error) { next(error); }
  });
  router.get('/directory', async (req, res, next) => {
    if (!['staff', 'student'].includes(req.query.type) || typeof req.query.q !== 'string' ||
        req.query.q.trim().length < 2 || req.query.q.length > 80) {
      console.warn('User role directory search rejected.');
      return res.status(400).json({ error: 'Choose staff or student and enter 2–80 search characters.' });
    }
    try {
      await initDirectory();
      const term = '%' + req.query.q.trim().toLowerCase().replace(/[\\%_]/g, '\\$&') + '%';
      const result = await dbQuery(`SELECT DISTINCT email,display_name,reference FROM (${directorySql(req.query.type)}) directory
        WHERE email<>'' AND (email LIKE $1 OR LOWER(display_name) LIKE $1 OR LOWER(reference) LIKE $1)
        ORDER BY display_name,email LIMIT 21`, [term]);
      res.json({ people: result.rows.slice(0, 20), more: result.rows.length > 20 });
    } catch (error) { next(error); }
  });
  router.post('/add', async (req, res, next) => {
    const { type, roleId } = req.body;
    const module = scopeKey(req.body.module);
    if (!validScope(module)) return invalid(res, 'Choose Global Control or an available role-enabled hub.');
    const global = module === 'global';
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (!['staff', 'student'].includes(type) || !uuid(roleId) || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return invalid(res, 'Choose a staff/student type, valid school email and an additional role.');
    }
    try {
      await initDirectory();
      const person = (await dbQuery(`SELECT * FROM (${directorySql(type)}) directory WHERE email=$1 LIMIT 1`, [email])).rows[0];
      if (!person) return invalid(res, 'That email is not on the selected current KAMAR list. Check the type, email and uploaded directory.');
      const role = (await (global ?
        dbQuery("SELECT id FROM roles WHERE id=$1 AND name NOT IN ('Staff','Student')", [roleId]) :
        dbQuery('SELECT id FROM hub_roles WHERE id=$1 AND hub_key=$2', [roleId, module]))).rows[0];
      if (!role) return invalid(res, 'Choose an available role for the selected module.');
      const result = await dbQuery(`WITH target AS (
        INSERT INTO users(email,display_name) VALUES ($1,$2)
        ON CONFLICT(email) DO UPDATE SET email=EXCLUDED.email WHERE users.is_active=true
        RETURNING id
      ), assigned AS (
        ${global ? `INSERT INTO user_roles(user_id,role_id,assignment_source)
        SELECT id,$3,'manual' FROM target ON CONFLICT(user_id,role_id) DO NOTHING` :
        `INSERT INTO user_hub_roles(user_id,hub_role_id,granted_by)
        SELECT id,$3,$4 FROM target ON CONFLICT DO NOTHING`}
      ) SELECT id FROM target`, global ? [email, person.display_name || email, roleId] :
        [email, person.display_name || email, roleId, req.user.id]);
      if (!result.rows.length) return invalid(res, 'This account is inactive. Reactivate it before assigning roles.', 409);
      res.redirect(scopeUrl(module) + '&saved=added');
    } catch (error) { next(error); }
  });
  router.post('/remove', async (req, res, next) => {
    const { userId, roleId } = req.body;
    const module = scopeKey(req.body.module);
    if (!validScope(module)) return invalid(res, 'Choose Global Control or an available role-enabled hub.');
    if (!uuid(userId) || !uuid(roleId)) return invalid(res, 'Choose a valid user and role to remove.');
    try {
      const removed = module === 'global' ? await dbQuery(`DELETE FROM user_roles ur USING roles r
        WHERE ur.user_id=$1 AND ur.role_id=$2 AND r.id=ur.role_id
        AND r.name NOT IN ('Staff','Student') AND ur.assignment_source='manual' RETURNING ur.role_id`, [userId, roleId]) :
        await dbQuery(`DELETE FROM user_hub_roles ur USING hub_roles r
          WHERE ur.user_id=$1 AND ur.hub_role_id=$2 AND r.id=ur.hub_role_id AND r.hub_key=$3
          AND ur.area_key IS NULL RETURNING ur.hub_role_id`, [userId, roleId, module]);
      if (!removed.rows.length) return invalid(res, 'That role is no longer assigned in this scope or is protected. KAMAR, system-managed and area-specific access cannot be removed here.', 409);
      res.redirect(scopeUrl(module) + '&saved=removed');
    } catch (error) { next(error); }
  });
  return router;
}
module.exports = { createAdminUsersRouter };
