const express = require('express');
const { query } = require('../db');
const { ensureAuthenticated, ensureRole } = require('../middleware');

const router = express.Router();

router.get('/', (req, res) => {
  res.render('modules/sewing-hub/index', { title: 'Sewing Hub' });
});

router.get('/activities', ensureAuthenticated, async (req, res, next) => {
  try {
    if (req.user.roles.includes('ADMIN')) {
      return res.render('modules/sewing-hub/activities', { legacyUrl: 'https://tech-sewing.onrender.com/index.html', title: 'Sewing Hub Activities' });
    }

    const access = (await query(
      `SELECT access_level FROM sewing_hub_access WHERE user_id = $1`,
      [req.user.id]
    )).rows;

    if (!access.length || !req.user.roles.some((role) => ['Student', 'Teacher'].includes(role))) {
      return res.status(403).render('error', {
        title: 'Sewing Hub access denied',
        message: 'Your Google account has not been assigned Sewing Hub access.'
      });
    }

    const allowedAccess = access
      .map((entry) => entry.access_level)
      .filter((level) => (level === 'student' && req.user.roles.includes('Student')) || (level === 'teacher' && req.user.roles.includes('Teacher')));

    if (!allowedAccess.length) {
      return res.status(403).render('error', {
        title: 'Sewing Hub role access denied',
        message: 'Your assigned Sewing Hub access does not match your current Google role.'
      });
    }

    return res.render('modules/sewing-hub/activities', {
      access: allowedAccess,
      legacyUrl: 'https://tech-sewing.onrender.com/index.html',
      title: 'Sewing Hub Activities'
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/admin', ensureAuthenticated, ensureRole('ADMIN'), async (req, res, next) => {
  try {
    const users = (await query(
      `SELECT users.id, users.display_name, users.email,
              COALESCE(array_agg(access.access_level) FILTER (WHERE access.access_level IS NOT NULL), '{}') AS access_levels,
              COALESCE(array_agg(DISTINCT roles.name) FILTER (WHERE roles.name IS NOT NULL), '{}') AS roles
       FROM users
       LEFT JOIN sewing_hub_access access ON access.user_id = users.id
       LEFT JOIN user_roles ON user_roles.user_id = users.id
       LEFT JOIN roles ON roles.id = user_roles.role_id
       GROUP BY users.id
       ORDER BY users.email`
    )).rows;

    res.render('admin/sewing-hub', { title: 'Sewing Hub Access', users });
  } catch (error) {
    next(error);
  }
});

router.post('/admin/:userId', ensureAuthenticated, ensureRole('ADMIN'), async (req, res, next) => {
  try {
    const levels = Array.isArray(req.body.accessLevels)
      ? req.body.accessLevels
      : req.body.accessLevels ? [req.body.accessLevels] : [];
    const valid = levels.filter((level) => ['student', 'teacher'].includes(level));

    await query('DELETE FROM sewing_hub_access WHERE user_id = $1', [req.params.userId]);
    for (const level of valid) {
      await query(
        `INSERT INTO sewing_hub_access (user_id, access_level, granted_by)
         VALUES ($1, $2, $3) ON CONFLICT (user_id, access_level) DO UPDATE SET granted_by = EXCLUDED.granted_by`,
        [req.params.userId, level, req.user.id]
      );
    }

    res.redirect('/sewing-hub/admin');
  } catch (error) {
    next(error);
  }
});

module.exports = router;