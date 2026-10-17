const express = require('express');
const path = require('path');
const { importLegacyFoodRoom, isImportRunning } = require('../legacyFoodRoomImport');

const router = express.Router();
const legacyFoodRoomDir = path.join(__dirname, '..', '..', 'public', 'food-room');

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
