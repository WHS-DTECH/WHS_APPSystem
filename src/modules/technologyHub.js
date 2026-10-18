const express = require('express');
const path = require('path');
const { query } = require('../db');
const { ensureAuthenticated } = require('../middleware');
const { userHasHubPermission } = require('../hubRoles');

const publicDir = path.join(__dirname, '..', '..', 'public', 'technology-hub');
const areas = [
  { key: 'digital-technologies', label: 'Digital Technologies', file: 'digital-technologies.html' },
  { key: 'food-hospitality', label: 'Food and Hospitality', file: 'food-hospitality.html' },
  { key: 'textiles', label: 'Textiles', file: 'textiles.html' },
  { key: 'woodwork-furniture', label: 'Woodwork and Furniture', file: 'woodwork-furniture.html' }
];

function areaForFile(file) {
  return areas.find((area) => area.file === file);
}

async function searchableAreas(user, dbQuery = query) {
  if (!user || user.is_active === false) return [];
  if (user?.roles?.includes('ADMIN')) return areas;
  if (!user.id) return [];
  if (await userHasHubPermission(user, 'technology-hub', 'admin.manage', dbQuery)) return areas;
  const teacher = await userHasHubPermission(user, 'technology-hub', 'teacher.view', dbQuery);
  const hasGeneralAccess = teacher || user.roles?.some((role) => ['Student', 'Teacher'].includes(role)) || false;

  const result = await dbQuery(
    `SELECT area_key FROM technology_hub_access WHERE user_id = $1 AND $2::boolean
     UNION SELECT ur.area_key FROM user_hub_roles ur JOIN hub_roles r ON r.id=ur.hub_role_id
     JOIN hub_role_permissions rp ON rp.hub_role_id=r.id
     JOIN hub_permissions p ON p.id=rp.hub_permission_id AND p.hub_key=r.hub_key
     WHERE ur.user_id=$1 AND r.hub_key='technology-hub'
       AND p.permission_key IN ('home.view','teacher.view') AND ur.area_key IS NOT NULL`,
    [user.id, hasGeneralAccess]
  );
  return areas.filter((area) => result.rows.some((row) => row.area_key === area.key));
}

async function canViewArea(req, areaKey) {
  return (await searchableAreas(req.user)).some((area) => area.key === areaKey);
}

const publicRouter = express.Router();

publicRouter.get('/', (req, res) => {
  if (req.originalUrl.endsWith('/')) {
    return res.sendFile(path.join(publicDir, 'index.html'));
  }

  return res.redirect('/technology-hub/');
});

publicRouter.get('/index.html', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

publicRouter.get('/:file', async (req, res, next) => {
  const area = areaForFile(req.params.file);

  if (!area) return next();
  if (!req.user) return res.redirect('/');

  try {
    if (!(await canViewArea(req, area.key))) {
      return res.status(403).render('error', {
        title: 'Technology Hub access denied',
        message: 'Your Google account has not been assigned to this Technology Hub area.'
      });
    }

    if (area.key === 'digital-technologies') return res.redirect('/dtech-hub/');
    return res.sendFile(path.join(publicDir, area.file));
  } catch (error) {
    return next(error);
  }
});

publicRouter.use(express.static(publicDir));

const adminRouter = express.Router();

const requireTechnologyAdmin = async (req, res, next) => {
  try {
    if (await userHasHubPermission(req.user, 'technology-hub', 'admin.manage')) return next();
    return res.status(403).render('error', { title: 'Access denied', message: 'Technology Hub administration access required.' });
  } catch (error) { next(error); }
};

adminRouter.get('/', ensureAuthenticated, requireTechnologyAdmin, async (req, res, next) => {
  try {
    const [users, assignments] = await Promise.all([
      query(
        `SELECT users.id, users.display_name, users.email,
          COALESCE(array_agg(DISTINCT roles.name) FILTER (WHERE roles.name IS NOT NULL), '{}') AS roles,
          COALESCE(array_agg(access.area_key) FILTER (WHERE access.area_key IS NOT NULL), '{}') AS area_keys
         FROM users
         LEFT JOIN user_roles ON user_roles.user_id = users.id
         LEFT JOIN roles ON roles.id = user_roles.role_id
         LEFT JOIN technology_hub_access access ON access.user_id = users.id
         GROUP BY users.id
         ORDER BY users.email`
      ),
      query('SELECT COUNT(*)::int AS count FROM technology_hub_access')
    ]);

    res.render('admin/technology-hub', {
      areas,
      assignments: assignments.rows[0].count,
      title: 'Technology Hub Access',
      users: users.rows
    });
  } catch (error) {
    next(error);
  }
});

adminRouter.post('/:userId', ensureAuthenticated, requireTechnologyAdmin, async (req, res, next) => {
  try {
    const areaKeys = Array.isArray(req.body.areaKeys)
      ? req.body.areaKeys
      : req.body.areaKeys
        ? [req.body.areaKeys]
        : [];

    await query('DELETE FROM technology_hub_access WHERE user_id = $1', [req.params.userId]);

    for (const areaKey of areaKeys.filter((key) => areas.some((area) => area.key === key))) {
      await query(
        `INSERT INTO technology_hub_access (user_id, area_key, granted_by)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, area_key) DO UPDATE SET granted_by = EXCLUDED.granted_by`,
        [req.params.userId, areaKey, req.user.id]
      );
    }

    res.redirect('/admin/technology-hub');
  } catch (error) {
    next(error);
  }
});

module.exports = { adminRouter, publicRouter, searchableAreas };