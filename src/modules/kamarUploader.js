const express = require('express');
const path = require('path');
const { ensureAuthenticated, ensureRole } = require('../middleware');

const siteDir = path.join(__dirname, '..', 'legacy', 'kamar-uploader', 'site');

// The original Kamar Uploader pages, served unchanged behind the Google ADMIN role.
// Its API lives in src/legacy/kamar-uploader/routes.js and is mounted at /api.
const router = express.Router();

router.use(ensureAuthenticated, ensureRole('ADMIN'));
router.use(express.static(siteDir));

module.exports = router;
