const express = require('express');
const { query } = require('./db');
const { ensureAuthenticated } = require('./middleware');

const router = express.Router();
router.use(ensureAuthenticated);

const isTeacherOrAdmin = (user) => Boolean(user.roles && (user.roles.includes('ADMIN') || user.roles.includes('Teacher')));

// Preferences are stored in the Food Room subscription table, which the recipe and digest emails already read.
async function loadPreferences(user) {
  const result = await query(
    'SELECT is_subscribed, calendar_change_subscribed FROM food_room.recipe_subscriptions WHERE LOWER(user_email) = LOWER($1)',
    [user.email]
  );
  const row = result.rows[0] || {};
  return { recipes: Boolean(row.is_subscribed), calendar: Boolean(row.calendar_change_subscribed) };
}

router.get('/', async (req, res, next) => {
  try {
    res.render('email-preferences', {
      title: 'Email Preferences',
      prefs: await loadPreferences(req.user),
      canCalendar: isTeacherOrAdmin(req.user),
      saved: req.query.saved === '1'
    });
  } catch (error) {
    next(error);
  }
});

router.post('/', express.urlencoded({ extended: false }), async (req, res, next) => {
  try {
    const recipes = req.body.recipes === 'on';
    // Calendar change emails are for teachers only, so other users can never switch them on.
    const calendar = isTeacherOrAdmin(req.user) && req.body.calendar === 'on';
    await query(
      `INSERT INTO food_room.recipe_subscriptions (user_email, user_name, user_type, is_subscribed, calendar_change_subscribed)
       VALUES (LOWER($1), $2, $3, $4, $5)
       ON CONFLICT (user_email) DO UPDATE
       SET is_subscribed = $4, calendar_change_subscribed = $5,
           user_name = COALESCE($2, food_room.recipe_subscriptions.user_name), updated_at = CURRENT_TIMESTAMP`,
      [req.user.email, req.user.display_name || null, isTeacherOrAdmin(req.user) ? 'staff' : 'student', recipes, calendar]
    );
    res.redirect('/profile/email-preferences?saved=1');
  } catch (error) {
    next(error);
  }
});

module.exports = { router, isTeacherOrAdmin };
