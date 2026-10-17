const express = require('express');
const path = require('path');
const { query } = require('../db');
const { ensureAuthenticated, ensureRole } = require('../middleware');
const legacyRoutes = require('../legacy/sewing-hub/routes');

const router = express.Router();
const apiRouter = express.Router();
const pageGuards = express.Router();
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

function publicActivityColumns(teacher) {
  return `id, name, year_level, type, activity_category, duration_hours, difficulty,
          description, outcome_image_url, idea_url, color, is_this_week${
  teacher ? ', class_management_notes, class_preparation, assessment_focus' : ''}`;
}

apiRouter.get('/activities', async (req, res, next) => {
  try {
    const canViewTeacherCard = legacyRoutes.userCanViewTeacherCard(req.user);
    const { conditions, params } = activityConditions(req.query);
    const orderBy = sortOptions[String(req.query.sort || '').toLowerCase()] || sortOptions.az;
    const result = await query(
      `SELECT ${publicActivityColumns(canViewTeacherCard)}
       FROM activities
       WHERE ${conditions.join(' AND ')}
       ORDER BY ${orderBy}`,
      params
    );

    res.json(result.rows.map((activity) => ({ ...activity, canViewTeacherCard })));
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

    const canViewTeacherCard = legacyRoutes.userCanViewTeacherCard(req.user);
    const result = await query(
      `SELECT ${publicActivityColumns(canViewTeacherCard)}, instructions, resources, equipment
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

    return res.json({ ...activity, canViewInstructions: Boolean(req.user), canViewTeacherCard });
  } catch (error) {
    return next(error);
  }
});

apiRouter.use(legacyRoutes);

// Role and permission pages are managed by the app's own users/hub access screens.
pageGuards.get(['/admin_user_roles.html', '/admin_role_permissions.html'], ensureAuthenticated, (req, res) => {
  res.redirect(req.path.includes('user_roles') ? '/hubs/sewing-hub/roles' : '/admin/roles');
});

pageGuards.get(
  ['/admin_upload_activity.html', '/admin_upload_url_idea.html', '/admin_upload_assessment_task.html'],
  ensureAuthenticated,
  async (req, res, next) => {
    try {
      if (await legacyRoutes.userCanUploadActivity(req.user)) {
        return res.sendFile(path.join(legacySewingDir, path.basename(req.path)));
      }
      return res.status(403).render('error', { title: 'Access denied', message: 'You do not have permission to upload Sewing Hub activities.' });
    } catch (error) {
      return next(error);
    }
  }
);

pageGuards.get(['/admin_assessment_management.html', '/admin_suggestions.html'], ensureAuthenticated, ensureRole('ADMIN'), (req, res) => {
  res.sendFile(path.join(legacySewingDir, path.basename(req.path)));
});

router.use(express.static(legacySewingDir));

router.get('/', (req, res) => {
  res.redirect('/sewing-hub/index.html');
});

router.get('/activities', (req, res) => {
  res.redirect('/sewing-hub/index.html');
});
// Sewing Hub access is held as hub roles in the Global Control framework.
router.get('/admin', ensureAuthenticated, (req, res) => res.redirect('/hubs/sewing-hub/roles'));

module.exports = router;
module.exports.apiRouter = apiRouter;
module.exports.pageGuards = pageGuards;