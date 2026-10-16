const express = require('express');
const path = require('path');

const router = express.Router();
const legacyWorkshopDir = path.join(__dirname, '..', '..', 'public', 'workshop');

// Legacy Workshop API (worksheets, lesson notes, planners, suggestions, uploads).
router.use(require('../legacy/workshop/routes'));
router.use(express.static(legacyWorkshopDir));

router.get('/', (req, res) => {
  res.redirect('/workshop/index.html');
});

module.exports = router;
