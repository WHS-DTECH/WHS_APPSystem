const express = require('express');
const path = require('path');

const router = express.Router();
const legacyWorkshopDir = path.join(__dirname, '..', '..', 'OldSystem - dont push to GIT', 'Workshop');

router.use(express.static(legacyWorkshopDir));

router.get('/', (req, res) => {
  res.redirect('/workshop/index.html');
});

router.get('/index.html', (req, res) => {
  res.sendFile(path.join(legacyWorkshopDir, 'index.html'));
});

module.exports = router;
