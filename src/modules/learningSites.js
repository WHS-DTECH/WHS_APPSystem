const express = require('express');
const path = require('path');
const fs = require('fs');
const { formidable } = require('formidable');
const { ensureAuthenticated } = require('../middleware');
const { userHasHubPermission } = require('../hubRoles');
const store = require('../legacy/learning-sites/adminStore');
const drive = require('../legacy/learning-sites/driveSync');
const { readReliefPlanEvents } = require('../legacy/learning-sites/reliefPlan');

const pagesDir = path.join(__dirname, '..', 'legacy', 'learning-sites', 'pages');

// The legacy site served /ADMIN/ and /ReleverPlan/ with exact casing, so keep those URLs.
const pagesRouter = express.Router({ caseSensitive: true });
const apiRouter = express.Router();
const router = express.Router();

async function hasRole(req, ...roles) {
  return Boolean(req.user?.roles?.some((role) => role === 'ADMIN' || roles.includes(role))) ||
    await userHasHubPermission(req.user, 'learning-sites', roles.includes('Teacher') ? 'teacher.view' : 'admin.manage');
}

function requireLearningRole(...roles) {
  return async (req, res, next) => {
    try {
      if (await hasRole(req, ...roles)) return next();
      return res.status(403).render('error', { title: 'Access denied', message: 'You do not have the required Learning Sites role.' });
    } catch (error) { next(error); }
  };
}

function actorName(req) {
  return req.user.display_name || req.user.email || 'Unknown staff';
}

function handler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch((error) => {
    res.status(error.status || 500).json({ ok: false, error: error.message || 'Server error' });
  });
}

async function requireAdminApi(req, res, next) {
  try {
    if (!await hasRole(req)) return res.status(401).json({ ok: false, error: 'Unauthorized' });
    return next();
  } catch (error) { next(error); }
}

function readMultipartBody(req) {
  return new Promise((resolve, reject) => {
    formidable({ multiples: false, maxFileSize: 10 * 1024 * 1024, allowEmptyFiles: false })
      .parse(req, (error, fields, files) => (error ? reject(error) : resolve({ fields, files })));
  });
}

function sendLegacyPage(fileName) {
  return (req, res) => res.sendFile(path.join(pagesDir, fileName));
}

pagesRouter.get('/ADMIN', ensureAuthenticated, requireLearningRole(), sendLegacyPage('ADMIN.html'));
pagesRouter.get('/ReleverPlan', ensureAuthenticated, requireLearningRole('Teacher'), sendLegacyPage('ReleverPlan.html'));

router.get('/', (req, res) => res.redirect('/learning-sites-public.html'));
router.get('/relief-planning', (req, res) => res.redirect('/ReleverPlan/'));
router.get('/admin', (req, res) => res.redirect('/ADMIN/'));

// Admin API: same routes as the legacy server, now behind the Google ADMIN session.
apiRouter.post('/admin/login', (req, res) => {
  res.status(410).json({ ok: false, error: 'Sign in with Google to access the dashboard.' });
});

apiRouter.post('/admin/logout', (req, res, next) => {
  req.logout((error) => (error ? next(error) : res.json({ ok: true })));
});

apiRouter.get('/admin/session', handler(async (req, res) => {
  const authenticated = await hasRole(req);
  res.json({ ok: true, authenticated, user: authenticated ? actorName(req) : null });
}));

// Record the signed-in Google user on every write instead of trusting the browser.
apiRouter.post('/admin/*', async (req, res, next) => {
  try {
    if (await hasRole(req)) req.body = { ...(req.body || {}), updatedBy: actorName(req) };
    next();
  } catch (error) { next(error); }
});

apiRouter.use('/admin', requireAdminApi);

apiRouter.use('/admin', handler(async (req, res, next) => {
  await store.initAdminSchema();
  next();
}));

apiRouter.get('/admin/health', (req, res) => res.json({ ok: true, db: 'connected' }));

apiRouter.get('/admin/course-content-targets', handler(async (req, res) => {
  res.json({ ok: true, courses: await store.getCourseContentTargets() });
}));

apiRouter.get('/admin/google-drive-pdfs', handler(async (req, res) => {
  const data = await drive.fetchPublicDriveFolderPdfs();
  res.json({ ok: true, folderUrl: drive.getGoogleDriveFolderUrl(), ...data });
}));

apiRouter.get('/admin/course-content/:courseCode', handler(async (req, res) => {
  res.json({ ok: true, ...(await store.getCourseContent(req.params.courseCode)) });
}));

apiRouter.post('/admin/course-content/:courseCode/statement/google-drive', handler(async (req, res) => {
  const { fileId, fileName, updatedBy } = req.body || {};

  if (!fileId || !fileName) {
    throw new Error('fileId and fileName are required');
  }

  const driveFile = await drive.fetchPublicDrivePdfFile(fileId);
  res.json(await store.saveCourseStatementPdf({
    courseCode: req.params.courseCode,
    fileName,
    mimeType: driveFile.mimeType,
    fileBuffer: driveFile.fileBuffer,
    updatedBy: updatedBy || 'Google Drive sync',
    activityDetail: `Google Drive: ${fileName}`
  }));
}));

apiRouter.post('/admin/course-content/:courseCode/statement', handler(async (req, res) => {
  const { fields, files } = await readMultipartBody(req);
  const file = Array.isArray(files.statementPdf) ? files.statementPdf[0] : files.statementPdf;

  if (!file || !file.filepath) {
    throw new Error('statementPdf file is required');
  }

  const fileBuffer = await fs.promises.readFile(file.filepath);
  await fs.promises.unlink(file.filepath).catch(() => {});

  res.json(await store.saveCourseStatementPdf({
    courseCode: req.params.courseCode,
    fileName: file.originalFilename,
    mimeType: file.mimetype,
    fileBuffer,
    updatedBy: actorName(req)
  }));
}));

apiRouter.post('/admin/course-content/:courseCode', handler(async (req, res) => {
  const body = req.body || {};

  res.json(await store.upsertCourseContent({
    courseCode: req.params.courseCode,
    assessments: body.assessments,
    assessmentLinks: body.assessmentLinks,
    updatedBy: body.updatedBy || 'ADMIN uploader'
  }));
}));

apiRouter.get('/admin/dashboard', handler(async (req, res) => {
  const year = Number.parseInt(req.query.year, 10);
  const data = await store.getDashboard({
    year: Number.isInteger(year) ? year : undefined,
    term: req.query.term || 'T1'
  });
  res.json({ ok: true, ...data });
}));

apiRouter.get('/admin/courses', handler(async (req, res) => {
  const year = Number.parseInt(req.query.year, 10);
  const data = await store.getCourseStatus({
    year: Number.isInteger(year) ? year : undefined,
    term: req.query.term || 'T1',
    subject: req.query.subject || undefined,
    status: req.query.status || undefined
  });
  res.json({ ok: true, ...data });
}));

apiRouter.post('/admin/courses/status', handler(async (req, res) => {
  res.json(await store.updateCourseRequirement(req.body || {}));
}));

apiRouter.all('/admin/*', (req, res) => {
  res.status(404).json({ ok: false, error: 'API route not found' });
});

// Public course content API used by the course pages.
apiRouter.get('/course-content/:courseCode/statement.pdf', handler(async (req, res) => {
  await store.initAdminSchema();
  const statement = await store.getCourseStatementPdf(req.params.courseCode);

  if (!statement) {
    return res.status(404).json({ ok: false, error: 'Statement PDF not found' });
  }

  res.setHeader('Content-Type', statement.mimeType || 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${String(statement.fileName).replace(/"/g, '')}"`);
  return res.send(statement.fileBuffer);
}));

apiRouter.get('/course-content/:courseCode', handler(async (req, res) => {
  await store.initAdminSchema();
  const content = await store.getCourseContent(req.params.courseCode);

  res.json({
    ok: true,
    courseCode: content.courseCode,
    assessments: content.assessments,
    assessmentLinks: content.assessmentLinks,
    hasStatementPdf: content.hasStatementPdf,
    statementUrl: content.hasStatementPdf ? `/api/course-content/${content.courseCode}/statement.pdf` : null,
    statementFilename: content.statementFilename
  });
}));

// Relief Plan API: Google-authenticated Teachers and ADMINs.
apiRouter.post('/relief-plan/login', (req, res) => {
  res.status(410).json({ ok: false, error: 'Sign in with Google to access the Relief Plan.' });
});

apiRouter.post('/relief-plan/logout', (req, res, next) => {
  req.logout((error) => (error ? next(error) : res.json({ ok: true })));
});

apiRouter.get('/relief-plan/session', handler(async (req, res) => {
  const role = req.user?.roles?.includes('ADMIN') ? 'ADMIN' : (await hasRole(req, 'Teacher') ? 'Teacher' : null);
  res.json({ ok: true, authenticated: Boolean(role), role });
}));

apiRouter.get('/relief-plan/events', handler(async (req, res) => {
  if (!await hasRole(req, 'Teacher')) {
    return res.status(401).json({ ok: false, error: 'Relief Plan access is restricted to ADMINs and Teachers' });
  }

  return res.json({
    ok: true,
    year: 2027,
    role: req.user.roles.includes('ADMIN') ? 'ADMIN' : 'Teacher',
    events: readReliefPlanEvents()
  });
}));

router.apiRouter = apiRouter;
router.pagesRouter = pagesRouter;

module.exports = router;
