const express = require('express');
const path = require('path');
const { renderShell } = require('./shell');
const events = require('./data/events.json');

function createModuleRouter({ reliefEvents = events } = {}) {
  const router = express.Router();
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!req.user) return res.status(401).json({ error: 'School sign-in required.' });
    if (!req.user.roles?.some((role) => ['ADMIN', 'Teacher'].includes(role))) {
      return res.status(403).json({ error: 'Teacher access required.' });
    }
    next();
  });
  router.use('/framework', express.static(path.join(__dirname, 'public')));
  router.get('/api/relief-plan/events', (req, res) => {
    res.json({
      ok: true,
      year: 2027,
      role: req.user.roles.includes('ADMIN') ? 'ADMIN' : 'Teacher',
      events: reliefEvents
    });
  });
  router.get('/', (req, res) => {
    const standalone = Boolean(req.moduleStandalone);
    const coreUrl = standalone ? new URL(process.env.GLOBAL_CONTROL_URL).origin : '';
    res.type('html').send(renderShell({ baseUrl: req.baseUrl.replace(/\/$/, '') + '/', coreUrl, standalone }));
  });
  return router;
}

module.exports = { createModuleRouter };
