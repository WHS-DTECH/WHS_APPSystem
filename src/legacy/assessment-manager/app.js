const express = require('express');
const path = require('path');
const { renderShell } = require('./shell');
const { createAssessmentRouter } = require('./assessment');

// Embedded hosting supplies req.user from Global Control; never trust identity headers.
function createModuleRouter({ query, loadStaff, loadTeachingSubjects, loadClassSize, loadModerationAccess, loadSeniorAudit, env = process.env } = {}) {
  const router = express.Router();
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!req.user) return res.status(401).json({ error: 'School sign-in required.' });
    if (!req.user.roles?.some((role) => ['ADMIN', 'Teacher'].includes(role))) {
      return res.status(403).json({ error: 'Teacher access required.' });
    }
    next();
  });
  router.use('/api/moderation', createAssessmentRouter({ query, loadStaff, loadTeachingSubjects, loadClassSize, loadModerationAccess, loadSeniorAudit, env }));
  router.use('/framework', express.static(path.join(__dirname, 'public')));
  router.get('/', (req, res) => {
    const standalone = Boolean(req.moduleStandalone);
    const coreUrl = standalone ? new URL(env.GLOBAL_CONTROL_URL).origin : '';
    // Website-restricted Picker keys need the app origin, never private URL details.
    res.set('Referrer-Policy', 'strict-origin');
    res.type('html').send(renderShell({
      baseUrl: req.baseUrl.replace(/\/$/, '') + '/',
      coreUrl,
      standalone,
      displayName: req.user.display_name || '',
      userEmail: req.user.email || '',
      userId: req.user.id || ''
    }));
  });
  return router;
}

module.exports = { createModuleRouter };
