const express = require('express');
const path = require('path');
const { renderShell } = require('./shell');
const { createPlannerRouter } = require('./planner');
const { loadCalendar } = require('./kamarCalendar');

// Embedded hosting supplies req.user from Global Control; never trust identity headers.
function createModuleRouter({ query, searchStandards, loadStaff, loadSchoolCalendar, loadClasses,
  loadAdminTeachers, authorizeAttendanceTarget, env = process.env } = {}) {
  const router = express.Router();
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!req.user) return res.status(401).json({ error: 'School sign-in required.' });
    if (req.user.is_active === false || !req.user.roles?.some((role) => ['ADMIN', 'Teacher'].includes(role))) {
      return res.status(403).json({ error: 'Teacher access required.' });
    }
    next();
  });
  router.use('/framework', express.static(path.join(__dirname, 'public')));
  router.get('/api/kamar-calendar/:year/:month', async (req, res) => {
    const year = Number(req.params.year), month = Number(req.params.month);
    if (!/^\d{4}$/.test(req.params.year) || !/^\d{1,2}$/.test(req.params.month) ||
        !Number.isInteger(year) || year < 2000 || year > 2100 || month < 1 || month > 12) {
      return res.status(400).json({ error: 'Choose a calendar year from 2000 to 2100 and month from 1 to 12.' });
    }
    try { res.json(await loadCalendar(year, month)); }
    catch (error) {
      console.error('KAMAR school calendar failed:', error);
      res.status(502).json({ error: 'The KAMAR School Events calendar could not be loaded. Please retry shortly.' });
    }
  });
  if (query) router.use('/api/planner', createPlannerRouter({ query, searchStandards, loadStaff,
    loadSchoolCalendar, loadClasses, loadAdminTeachers, authorizeAttendanceTarget, env }));
  router.get('/', (req, res) => {
    const standalone = Boolean(req.moduleStandalone);
    const coreUrl = standalone ? new URL(process.env.GLOBAL_CONTROL_URL).origin : '';
    // Restricted Google browser keys need the site origin, not private URLs.
    res.set('Referrer-Policy', 'strict-origin');
    res.type('html').send(renderShell({ baseUrl: req.baseUrl.replace(/\/$/, '') + '/', coreUrl, standalone,
      displayName: req.user.display_name || req.user.email || 'My planner', userId: req.user.id, userEmail: req.user.email || '' }));
  });
  return router;
}

module.exports = { createModuleRouter };
