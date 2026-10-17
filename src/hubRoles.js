const express = require('express');
const { query } = require('./db');
const { ensureAuthenticated } = require('./middleware');

const HUBS = {
  'sewing-hub': { label: 'Sewing Hub', home: '/sewing-hub/' },
  'technology-hub': { label: 'Technology Hub', home: '/technology-hub/' },
  workshop: { label: 'Workshop', home: '/workshop/' },
  'food-room': { label: 'Food Room Hub', home: '/food-room/' }
};

const isAdmin = (user) => Boolean(user && user.roles && user.roles.includes('ADMIN'));

async function userHasHubPermission(user, hubKey, permissionKey) {
  if (!user) return false;
  if (isAdmin(user)) return true;
  const result = await query(
    `SELECT 1
     FROM user_hub_roles assignments
     JOIN hub_roles roles ON roles.id = assignments.hub_role_id
     JOIN hub_role_permissions rp ON rp.hub_role_id = roles.id
     JOIN hub_permissions permissions ON permissions.id = rp.hub_permission_id
     WHERE assignments.user_id = $1 AND roles.hub_key = $2 AND permissions.permission_key = $3
     LIMIT 1`,
    [user.id, hubKey, permissionKey]
  );
  return result.rowCount > 0;
}

const canManageHubRoles = (user, hubKey) => userHasHubPermission(user, hubKey, 'admin.manage');

// Lead Teachers can assign every hub role except Lead Teacher itself, which only an ADMIN can grant.
const isAssignable = (user, roleKey) => isAdmin(user) || roleKey !== 'lead-teacher';

const router = express.Router();

router.use(ensureAuthenticated);

router.get('/', async (req, res, next) => {
  try {
    const manageable = [];
    for (const [key, hub] of Object.entries(HUBS)) {
      if (await canManageHubRoles(req.user, key)) manageable.push({ key, ...hub });
    }
    res.render('hub-roles-index', { title: 'Assign User Roles', hubs: manageable });
  } catch (error) {
    next(error);
  }
});

router.param('hubKey', (req, res, next, hubKey) => {
  if (!HUBS[hubKey]) return res.status(404).render('error', { title: 'Not found', message: 'Unknown hub.' });
  req.hub = { key: hubKey, ...HUBS[hubKey] };
  return next();
});

router.use('/:hubKey', async (req, res, next) => {
  try {
    if (await canManageHubRoles(req.user, req.hub.key)) return next();
    return res.status(403).render('error', {
      title: 'Access denied',
      message: `Only an administrator or a ${req.hub.label} Lead Teacher can assign roles in this hub.`
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/:hubKey/roles', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim().slice(0, 80);
    const type = ['staff', 'student'].includes(req.query.type) ? req.query.type : '';
    const roles = (await query(
      `SELECT id, role_key, display_name, description FROM hub_roles WHERE hub_key = $1
       ORDER BY CASE role_key WHEN 'lead-teacher' THEN 1 WHEN 'teacher' THEN 2 WHEN 'technician' THEN 3 ELSE 4 END, display_name`,
      [req.hub.key]
    )).rows;
    const params = [req.hub.key];
    const where = [];
    if (q) { params.push(`%${q.toLowerCase()}%`); where.push(`(LOWER(users.email) LIKE $${params.length} OR LOWER(users.display_name) LIKE $${params.length})`); }
    const users = (await query(
      `SELECT * FROM (
         SELECT users.id, users.display_name, users.email,
                EXISTS (SELECT 1 FROM staff_upload s WHERE LOWER(s.email_school) = LOWER(users.email) AND s.status = 'Current') AS is_staff,
                EXISTS (SELECT 1 FROM student_details_upload d WHERE LOWER(d.email_school) = LOWER(users.email) AND d.status = 'Current') AS is_student,
                COALESCE(array_agg(DISTINCT assignments.hub_role_id::text) FILTER (WHERE assignments.hub_role_id IS NOT NULL), '{}') AS hub_role_ids
         FROM users
         LEFT JOIN user_hub_roles assignments ON assignments.user_id = users.id AND assignments.area_key IS NULL
           AND assignments.hub_role_id IN (SELECT id FROM hub_roles WHERE hub_key = $1)
         ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
         GROUP BY users.id
       ) listed
       ${type === 'staff' ? 'WHERE is_staff' : type === 'student' ? 'WHERE is_student AND NOT is_staff' : ''}
       ORDER BY (cardinality(hub_role_ids) = 0), email
       LIMIT 300`,
      params
    )).rows;

    res.render('hub-roles', {
      title: `${req.hub.label} - Assign User Roles`,
      hub: req.hub,
      roles: roles.map((role) => ({ ...role, assignable: isAssignable(req.user, role.role_key) })),
      users,
      filter: { q, type },
      saved: req.query.saved === '1'
    });
  } catch (error) {
    next(error);
  }
});

router.post('/:hubKey/roles/:userId', async (req, res, next) => {
  try {
    const wanted = [].concat(req.body.hubRoleIds || []).map(String);
    const roles = (await query('SELECT id, role_key FROM hub_roles WHERE hub_key = $1', [req.hub.key])).rows;
    const manageable = roles.filter((role) => isAssignable(req.user, role.role_key));

    for (const role of manageable) {
      if (wanted.includes(String(role.id))) {
        await query(
          `INSERT INTO user_hub_roles (user_id, hub_role_id, granted_by)
           SELECT $1, $2, $3 WHERE EXISTS (SELECT 1 FROM users WHERE id = $1)
           AND NOT EXISTS (SELECT 1 FROM user_hub_roles WHERE user_id = $1 AND hub_role_id = $2 AND area_key IS NULL)`,
          [req.params.userId, role.id, req.user.id]
        );
      } else {
        await query('DELETE FROM user_hub_roles WHERE user_id = $1 AND hub_role_id = $2 AND area_key IS NULL', [req.params.userId, role.id]);
      }
    }

    const back = new URLSearchParams({ saved: '1' });
    if (req.body.q) back.set('q', String(req.body.q).slice(0, 80));
    if (req.body.type) back.set('type', String(req.body.type).slice(0, 10));
    res.redirect(`/hubs/${req.hub.key}/roles?${back}`);
  } catch (error) {
    next(error);
  }
});

module.exports = { router, HUBS, userHasHubPermission, canManageHubRoles, isAssignable };
