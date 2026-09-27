const express = require('express');
const path = require('path');
const { query } = require('../db');
const { ensureAuthenticated, ensureRole } = require('../middleware');

const router = express.Router();
const apiRouter = express.Router();
const legacySewingDir = path.join(__dirname, '..', '..', 'public', 'sewing-hub');
const sewingHubKey = 'SEWING-HUB';

const categoryAliases = {
  assessment: 'Assessment',
  practice: 'Practice',
  skill: 'Skill',
  'url-idea': 'URL Idea',
  url_idea: 'URL Idea',
  'url idea': 'URL Idea',
  urlidea: 'URL Idea'
};

const sortOptions = {
  az: 'name ASC',
  za: 'name DESC',
  level: 'year_level ASC, name ASC',
  duration: 'duration_hours ASC, name ASC'
};

apiRouter.get('/me', (req, res) => {
  const isAdmin = Boolean(req.user?.roles?.includes('ADMIN'));
  res.json({
    authenticated: Boolean(req.user),
    user: req.user
      ? {
          initials: req.user.display_name?.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'U',
          isAdmin,
          canBrowseActivities: true,
          canUploadActivity: isAdmin
        }
      : null
  });
});

function activityConditions(queryParams) {
  const params = [sewingHubKey];
  const conditions = ['hub_site = $1'];

  if (queryParams.week === 'true') {
    conditions.push('is_this_week = TRUE');
  }

  for (const [column, value] of [['year_level', queryParams.year], ['type', queryParams.type]]) {
    if (value) {
      params.push(String(value));
      conditions.push(`${column} = $${params.length}`);
    }
  }

  const category = categoryAliases[String(queryParams.category || '').toLowerCase()];
  if (category) {
    params.push(category);
    conditions.push(`activity_category = $${params.length}`);
  }

  return { conditions, params };
}

function publicActivityColumns() {
  return `id, name, year_level, type, activity_category, duration_hours, difficulty,
          description, outcome_image_url, idea_url, color, is_this_week`;
}

apiRouter.get('/activities', async (req, res, next) => {
  try {
    const { conditions, params } = activityConditions(req.query);
    const orderBy = sortOptions[String(req.query.sort || '').toLowerCase()] || sortOptions.az;
    const result = await query(
      `SELECT ${publicActivityColumns()}
       FROM activities
       WHERE ${conditions.join(' AND ')}
       ORDER BY ${orderBy}`,
      params
    );

    res.json(result.rows.map((activity) => ({ ...activity, canViewTeacherCard: false })));
  } catch (error) {
    next(error);
  }
});

apiRouter.get('/activities/:id', async (req, res, next) => {
  try {
    const activityId = Number(req.params.id);
    if (!Number.isInteger(activityId) || activityId < 1) {
      return res.status(400).json({ error: 'Invalid activity id' });
    }

    const result = await query(
      `SELECT ${publicActivityColumns()}, instructions, resources, equipment
       FROM activities
       WHERE id = $1 AND hub_site = $2
       LIMIT 1`,
      [activityId, sewingHubKey]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Activity not found' });
    }

    const activity = result.rows[0];
    if (!req.user) {
      activity.instructions = null;
    }

    return res.json({ ...activity, canViewInstructions: Boolean(req.user), canViewTeacherCard: false });
  } catch (error) {
    return next(error);
  }
});

router.use(express.static(legacySewingDir));

router.get('/', (req, res) => {
  res.redirect('/sewing-hub/index.html');
});

router.get('/index.html', (req, res) => {
  res.sendFile(path.join(legacySewingDir, 'index.html'));
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
module.exports.apiRouter = apiRouter;