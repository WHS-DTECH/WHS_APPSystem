const express = require('express');
const path = require('path');

const router = express.Router();
const legacyFoodRoomDir = path.join(__dirname, '..', '..', 'public', 'food-room');

// Legacy Food Room API (recipes, bookings, shopping plans, orders, uploads, Google planner sync).
// Loaded on first use so the legacy schema checks run after the food_room migration has been applied.
let legacyApi;
router.use((req, res, next) => {
  legacyApi = legacyApi || require('../legacy/food-room/routes');
  return legacyApi(req, res, next);
});
router.use(express.static(legacyFoodRoomDir));

router.get('/', (req, res) => {
  res.redirect('/food-room/index.html');
});

module.exports = router;
