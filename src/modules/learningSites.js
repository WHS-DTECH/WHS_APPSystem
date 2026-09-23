const express = require('express');
const { ensureAuthenticated, ensureRole } = require('../middleware');

const router = express.Router();

router.get('/', (req, res) => {
  res.render('modules/learning-sites/index', { title: 'WHS Learning Sites' });
});

router.get('/relief-planning', ensureAuthenticated, ensureRole('Teacher'), (req, res) => {
  res.render('modules/learning-sites/relief-planning', { title: 'Relief Planning' });
});

router.get('/admin', ensureAuthenticated, ensureRole('ADMIN'), (req, res) => {
  res.render('modules/learning-sites/admin', { title: 'Learning Sites Administration' });
});

module.exports = router;
