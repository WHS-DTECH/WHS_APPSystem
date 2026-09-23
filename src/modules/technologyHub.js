const express = require('express');
const path = require('path');
const { query } = require('../db');
const { ensureAuthenticated, ensureRole } = require('../middleware');

const publicDir = path.join(__dirname, '..', '..', 'public', 'technology-hub');
const areas = [
  { key: 'digital-technologies', label: 'Digital Technologies', file: 'digital-technologies.html' },
  { key: 'food-hospitality', label: 'Food and Hospitality', file: 'food-hospitality.html' },
  { key: 'textiles', label: 'Textiles', file: 'textiles.html' },
  { key: 'woodwork-furniture', label: 'Woodwork and Furniture', file: 'woodwork-furniture.html' }
];

function isAdmin(req) {
  return req.user?.roles?.includes('ADMIN');
}

function areaForFile(file) {
  return areas.find((area) => area.file === file);
}

async function canViewArea(req, areaKey) {
  if (isAdmin(req)) return true;
  if (!req.user?.roles?.some((role) => ['Student', 'Teacher'].includes(role))) return false;

  const result = await query(
    'SELECT 1 FROM technology_hub_access WHERE user_id = $1 AND area_key = $2',
    [req.user.id, areaKey]
  );
  return result.rowCount > 0;
}

const publicRouter = express.Router();

publicRouter.get(['/', '/index.html'], (req, res) => {
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

    return res.sendFile(path.join(publicDir, area.file));
  } catch (error) {
    return next(error);
  }
});

publicRouter.use(express.static(publicDir));

const adminRouter = express.Router();

adminRouter.get('/', ensureAuthenticated, ensureRole('ADMIN'), async (req, res, next) => {
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

adminRouter.post('/:userId', ensureAuthenticated, ensureRole('ADMIN'), async (req, res, next) => {
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

module.exports = { adminRouter, publicRouter };