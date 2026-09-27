const express = require('express');
const path = require('path');

const router = express.Router();
const legacyFoodRoomDir = path.join(__dirname, '..', '..', 'public', 'food-room');

router.use(express.static(legacyFoodRoomDir));

router.get('/', (req, res) => {
  res.redirect('/food-room/index.html');
});

router.get('/index.html', (req, res) => {
  res.sendFile(path.join(legacyFoodRoomDir, 'index.html'));
});

module.exports = router;
