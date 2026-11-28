const express = require('express');
const helmet = require('helmet');
const { query: coreQuery } = require('../db');
const { authorisedModuleUser } = require('../moduleIdentity');
const { createModuleRouter } = require('../legacy/relief-library/app');

const PREFIX = '/relief-plan';
const MODULE_KEY = 'relief-plan';

function createReliefLibraryRouter({ dbQuery = coreQuery } = {}) {
  const router = express.Router();
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!req.user) {
      if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'School sign-in required.' });
      return res.redirect('/auth/google?next=' + encodeURIComponent(req.originalUrl));
    }
    next();
  });
  router.use(async (req, res, next) => {
    try {
      const user = await authorisedModuleUser(req.user.id, MODULE_KEY, dbQuery);
      if (!user) return res.status(403).json({ error: 'Relief Library must be active and assigned to your active school account.' });
      req.user = user;
      next();
    } catch (error) { next(error); }
  });
  router.use(helmet({ contentSecurityPolicy: { directives: { imgSrc: ["'self'", 'data:', 'https://lh3.googleusercontent.com'] } } }));
  router.use(createModuleRouter());
  return router;
}

module.exports = { createReliefLibraryRouter, PREFIX };
