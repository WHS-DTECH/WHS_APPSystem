const express = require('express');
const path = require('path');
const { importLegacyFoodRoom, isImportRunning } = require('../legacyFoodRoomImport');

const router = express.Router();
const legacyFoodRoomDir = path.join(__dirname, '..', '..', 'public', 'food-room');

// The legacy Google login page is replaced by the app's global login, returning to the page the user wanted.
router.get('/google_login.html', (req, res) => {
  let next = '/food-room/index.html';
  try {
    const target = new URL(String(req.query.next || 'index.html'), 'http://local/food-room/');
    if (target.host === 'local') next = target.pathname + target.search;
  } catch (_) { /* keep default */ }
  res.redirect(`/auth/google?next=${encodeURIComponent(next)}`);
});

// Legacy Food Room API (recipes, bookings, shopping plans, orders, uploads, Google planner sync).
// Loaded on first use so the legacy schema checks run after the food_room migration has been applied.
let legacyApi;
router.use(async (req, res, next) => {
  try {
    if (!legacyApi) {
      if (isImportRunning()) {
        if (req.path.startsWith('/api/') || req.path.startsWith('/google/')) {
          return res.status(503).set('Retry-After', '30').json({ error: 'Legacy Food Room data is still being imported. Please retry in a minute.' });
        }
        return next();
      }
      await importLegacyFoodRoom().catch(() => {});
      legacyApi = require('../legacy/food-room/routes');
    }
    return legacyApi(req, res, next);
  } catch (error) {
    return next(error);
  }
});
router.use(express.static(legacyFoodRoomDir));

router.get('/', (req, res) => {
  res.redirect('/food-room/index.html');
});

module.exports = router;
