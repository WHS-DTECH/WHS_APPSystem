const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const express = require('express');
const { query } = require('../db');
const { createArchiveService } = require('../studentAppArchive');
const { createTeachingFileStore } = require('../dtechFiles');
const config = require('../config');
const { sendEmail } = require('../email');
const { readReliefPlanEvents } = require('../legacy/learning-sites/reliefPlan');

const PREFIX = '/dtech-hub';
const SOURCE = path.join(__dirname, '..', 'legacy', 'dtech-hub');
const ROLE_NAMES = { 'lead-teacher': 'Lead Teacher', teacher: 'Teacher', technician: 'Technician', staff: 'Staff', student: 'Student' };
const TEACHER_PAGE = /^(?:teacher-|upload-|browse-(?:lessons|unit-plans|course-outlines)|class-management)/i;
const TEACHER_WORKSPACE = /\/(?:teacher-view|upload-activity|upload-project|upload-menu|teacher-project-allocation|teacher-assessment-allocation|teacher-student-work|teacher-student-work-task|class-management)\.html$/i;
const ADMIN_PAGE = /^(?:admin-|settings\.|supportFiles\/|practical-skills\/(?:admin|teacher-login)|learning-pathways\/(?:admin|comment-bank\.html|curriculum-mapping))/i;
const PUBLIC_EXTENSIONS = new Set(['.html', '.js', '.css', '.json', '.png', '.jpg', '.jpeg', '.svg', '.ico']);
const PUBLIC_DIRECTORIES = new Set(['images', 'ProjectPages', 'learning-pathways', 'practical-skills', 'supportFiles']);
const BACKEND_FILES = new Set(['server.js', 'package.json', 'package-lock.json', 'practical-skills-assessment.js',
  'learning-sites-assessment.js', 'practical-skills-certificate.js', 'research-report.js', 'login-sites-config.js',
  'learning-pathways/library-store.js', 'learning-pathways/activity-progress-store.js',
  'learning-pathways/progression-store.js', 'learning-pathways/comment-bank-store.js']);

function prefixText(text) {
  return text.replaceAll('hub_google_auth_v1', 'whs_dtech_auth_v1')
    .replaceAll('${window.location.origin}/', '${window.location.origin}/dtech-hub/')
    .replace(/(["'`])\/((?:api\/|images\/|TeacherFiles\/|ProjectPages\/|learning-pathways\/|practical-skills\/|supportFiles\/|[A-Za-z0-9_-]+\.(?:html|js|css|ico)(?:[?#]|(?=["'`])))[^"'`\r\n]*?)\1/g,
    (match, quote, value) => `${quote}${PREFIX}/${value}${quote}`)
    .replace(/url\(\s*\/(?!\/|dtech-hub\/)/g, `url(${PREFIX}/`);
}

function prefixData(value) {
  if (typeof value === 'string') {
    if (/^https:\/\/classtrainingsys\.onrender\.com(?:[/?#]|$)/i.test(value)) {
      const url = new URL(value);
      const destination = url.pathname.startsWith('/auth/') || url.pathname.startsWith('/login')
        ? '/home' : url.pathname;
      return `${PREFIX}/class-training${destination}${destination === '/home' ? '' : url.search + url.hash}`;
    }
    if (value.startsWith('/') && !value.startsWith('//') && !value.startsWith(`${PREFIX}/`)) return PREFIX + value;
    return value;
  }
  if (Array.isArray(value)) return value.map(prefixData);
  if (value && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, prefixData(entry)]));
  }
  return value;
}

async function accessForEmail(email, dbQuery = query) {
  const result = await dbQuery(
    `SELECT users.id, users.email,
       EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
         WHERE ur.user_id = users.id AND r.name = 'ADMIN') AS system_admin,
       COALESCE(array_agg(DISTINCT hr.role_key) FILTER (WHERE hr.role_key IS NOT NULL), '{}') AS hub_roles,
       COALESCE(array_agg(DISTINCT hp.permission_key) FILTER (WHERE hp.permission_key IS NOT NULL), '{}') AS permissions
     FROM users
     LEFT JOIN user_hub_roles uhr ON uhr.user_id = users.id
     LEFT JOIN hub_roles hr ON hr.id = uhr.hub_role_id AND hr.hub_key = 'dtech-hub' AND hr.role_key <> 'student-admin'
     LEFT JOIN hub_role_permissions hrp ON hrp.hub_role_id = hr.id
     LEFT JOIN hub_permissions hp ON hp.id = hrp.hub_permission_id AND hp.hub_key = 'dtech-hub'
     WHERE LOWER(users.email) = LOWER($1) AND users.is_active = TRUE GROUP BY users.id`, [email]
  );
  const row = result.rows[0];
  if (!row) return { role: 'Student', teacher: false, admin: false, permissions: [], active: false };
  const roles = row.hub_roles || [];
  const permissions = row.permissions || [];
  const admin = row.system_admin || permissions.includes('admin.manage');
  return {
    active: true,
    role: row.system_admin ? 'Admin' : ROLE_NAMES[Object.keys(ROLE_NAMES).find((key) => roles.includes(key))] || 'Student',
    teacher: Boolean(admin || permissions.includes('teacher.view')),
    admin: Boolean(admin),
    permissions: row.system_admin ? ['*'] : permissions
  };
}

function canWrite(access, url) {
  if (access.admin) return true;
  if (access.permissions.includes('activities.upload') && /^\/api\/(?:activities(?:\/|$)|course-outlines|unit-plans|lessons|learning-pathways\/jobs)/.test(url)) return true;
  if (access.permissions.includes('planning.manage') && /^\/api\/(?:practicals|teacher|student-tracker|external-assessment-allocations|client-projects|template-library)/.test(url)) return true;
  // These routes already check ownership against the authenticated school email.
  return /^\/api\/(?:student\/|practical-skills\/(?:progress\/|research-report\/|minecraft-exports-folder)|integrations\/trello\/|suggestions$|tools-techniques-keywords$|activities\/[^/]+\/(?:interest$|my-|reset-template-use$|interests\/(?:me|[^/]+)\/(?:evidence|trello-link)$)|students\/(?:decomposition-coverage|digimed-efficient-tools)$|learning-pathways\/activity-progress\/)/.test(url);
}

function effectiveDtechView(access, session, currentPath = '') {
  if (!access.teacher) return 'student';
  if (TEACHER_WORKSPACE.test(currentPath)) return 'teacher';
  return session?.dtechView === 'student' ? 'student' : 'teacher';
}

function createDtechRouter({ env = process.env, dbQuery = query, createLegacy, archive = createArchiveService({ env }) } = {}) {
  const router = express.Router({ caseSensitive: true });
  let legacy;
  let ready = false;
  let initialization;
  let initializationError = '';
  const access = (email) => accessForEmail(email, dbQuery);

  async function initialize() {
    if (ready) return;
    if (initialization) return initialization;
    initialization = (async () => {
      if (!env.DTECH_DATABASE_URL) throw new Error('DTECH_DATABASE_URL is not configured. Connect the existing DTECH-DB in Render.');
      if (env.DTECH_DATABASE_URL === env.DATABASE_URL) throw new Error('DTECH must use its separate legacy database, not the WHS APPSystem database.');
      const factory = createLegacy || require('../legacy/dtech-hub/server');
      legacy = factory({
        databaseUrl: env.DTECH_DATABASE_URL,
        databaseSsl: env.DTECH_DATABASE_SSL !== 'false',
        getReliefPlanEvents: () => ({ ok: true, year: 2027, events: readReliefPlanEvents() }),
        emailSender: config.email.gmail.senderEmail,
        mailTransport: config.email.gmail.isConfigured ? {
          async sendMail(options) {
            const result = await sendEmail({ ...options, subject: `[DTECH Hub] ${options.subject || ''}` });
            if (!result.ok) throw new Error(result.error || result.message || 'DTECH email could not be sent.');
            return { messageId: result.messageId };
          }
        } : null,
        getUserRole: async (email) => ({ user_email: email, additional_role: (await access(email)).role }),
        getRolePermissions: async () => {
          const rows = (await dbQuery(`SELECT hr.display_name AS role_name,
            bool_or(hp.permission_key = 'home.view') AS home_page,
            bool_or(hp.permission_key = 'activities.upload') AS upload_activity,
            bool_or(hp.permission_key = 'activities.browse') AS browse_activities,
            bool_or(hp.permission_key = 'planning.manage') AS planning,
            bool_or(hp.permission_key = 'admin.manage') AS admin
            FROM hub_roles hr LEFT JOIN hub_role_permissions rp ON rp.hub_role_id = hr.id
            LEFT JOIN hub_permissions hp ON hp.id = rp.hub_permission_id
            WHERE hr.hub_key = 'dtech-hub' AND hr.role_key <> 'student-admin' GROUP BY hr.id`)).rows;
          return [...rows, { role_name: 'Admin', home_page: true, upload_activity: true, browse_activities: true, planning: true, admin: true }];
        },
        canTeach: async (email) => (await access(email)).teacher,
        emailRecipients: async (kind) => (await dbQuery(`SELECT DISTINCT u.email FROM users u
          WHERE u.is_active AND (
            EXISTS (SELECT 1 FROM user_hub_roles ur JOIN hub_roles hr ON hr.id = ur.hub_role_id
              WHERE ur.user_id = u.id AND hr.hub_key = 'dtech-hub' AND hr.role_key = ANY($1::text[]))
            OR ($2 AND EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
              WHERE ur.user_id = u.id AND r.name = 'ADMIN'))
          )`, [kind === 'certificate' ? ['lead-teacher'] : ['lead-teacher', 'teacher'], kind !== 'certificate'])).rows.map((row) => row.email),
        saveTeachingFile: (...args) => files.save(...args)
      });
      const files = createTeachingFileStore({ pool: legacy.pool, directory: path.join(SOURCE, 'TeacherFiles'), archive });
      await files.initialize();
      await legacy.initialize();
      ready = true;
      initializationError = '';
    })().catch(async (error) => {
      initializationError = error.message;
      console.error('DTECH initialization failed:', error.message);
      if (legacy) await legacy.pool.end();
      legacy = null;
      throw error;
    }).finally(() => { initialization = null; });
    return initialization;
  }

  router.post(['/api/integrations/external-exam-intention', '/api/integrations/external-exam-intentions/sync'], async (req, res, next) => {
    if (!env.EXTERNAL_EXAM_FORM_WEBHOOK_SECRET) return res.status(503).json({ error: 'External exam form sync is not configured.' });
    if (req.get('x-external-exam-webhook-secret') !== env.EXTERNAL_EXAM_FORM_WEBHOOK_SECRET) return res.status(401).json({ error: 'Unauthorized form response sync.' });
    try {
      await initialize();
      return legacy.app(req, res, next);
    } catch (error) { return next(error); }
  });

  router.use(async (req, res, next) => {
    try {
      if (!req.user) {
        if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Sign in with the shared school Google account.' });
        return res.redirect(`/auth/google?next=${encodeURIComponent(PREFIX + req.url)}`);
      }
      const schoolDomain = String(env.GOOGLE_HOSTED_DOMAIN || 'westlandhigh.school.nz').toLowerCase();
      if (!String(req.user.email || '').toLowerCase().endsWith(`@${schoolDomain}`)) {
        return res.status(403).json({ error: 'DTECH requires a school Google account.' });
      }
      req.dtechAccess = await access(req.user.email);
      if (!req.dtechAccess.active) return res.status(403).json({ error: 'This school account is inactive or unavailable.' });
      if (req.dtechAccess.teacher && TEACHER_WORKSPACE.test(req.path)) req.session.dtechView = 'teacher';
      if (req.method === 'GET' && /^\/view\/[^/]+$/.test(req.path)) {
        if (!req.dtechAccess.teacher) return res.status(403).json({ error: 'DTECH teacher access is required to switch views.' });
        const mode = req.path.slice('/view/'.length);
        if (!['teacher', 'student'].includes(mode)) return res.status(400).json({ error: 'Choose Teacher View or Student View.' });
        req.session.dtechView = mode;
        return req.session.save((error) => {
          if (error) return next(error);
          return res.redirect(`${PREFIX}/${mode === 'teacher' ? 'teacher-view.html' : 'index.html'}`);
        });
      }
      if (!req.session.dtechCsrf) req.session.dtechCsrf = crypto.randomBytes(32).toString('hex');
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        if (req.get('x-dtech-csrf') !== req.session.dtechCsrf) return res.status(403).json({ error: 'DTECH form session expired. Reload the page and retry.' });
        if (!canWrite(req.dtechAccess, req.path)) return res.status(403).json({ error: 'Your DTECH role does not permit this change.' });
      }
      if (/^\/api\/admin\/(?:user-roles|role-permissions)(?:\/|$)/.test(req.path)) {
        return res.status(409).json({ error: 'Use Core Administration for DTECH roles and permissions.', url: '/hubs/dtech-hub/roles' });
      }
      if (req.path === '/user-role-management.html') return res.redirect('/hubs/dtech-hub/roles');
      if (req.path === '/role-permissions-management.html') return res.redirect('/admin/roles');
      const name = req.path.slice(1);
      if ((req.path.startsWith('/api/admin/') || ADMIN_PAGE.test(name)) && !req.dtechAccess.admin) {
        return res.status(403).json({ error: 'DTECH administrator access is required.' });
      }
      if ((/^\/api\/(?:teacher\/|staff_upload\/|student_timetable\/|timetable\/|class-management\/)/.test(req.path) || TEACHER_PAGE.test(name)) && !req.dtechAccess.teacher) {
        return res.status(403).json({ error: 'DTECH teacher access is required.' });
      }
      if (!ready) {
        try { await initialize(); } catch {
          return res.status(503).render('error', {
            title: 'DTECH Hub setup required',
            message: req.user.roles?.includes('ADMIN') ? initializationError : 'DTECH Hub is unavailable while its legacy database and private files are connected. Please contact an administrator.'
          });
        }
      }
      req.authenticated_email = req.user.email;
      // Prefix URLs returned by the original APIs, without changing their database values.
      const json = res.json.bind(res);
      res.json = (body) => json(prefixData(body));
      return next();
    } catch (error) { return next(error); }
  });

  router.use(async (req, res, next) => {
    try {
      const name = decodeURIComponent(req.path.endsWith('/') ? `${req.path}index.html` : req.path).slice(1);
      if (name.startsWith('api/') || name === 'health' || name === 'practical-skills/library.json' || name === 'learning-pathways/library.json') return next();
      if (!name || name.split('/').some((part) => !part || part === '.' || part === '..') || /[\\:\x00-\x1f]/.test(name)) {
        return res.status(404).send('DTECH page not found.');
      }
      const teaching = name.startsWith('TeacherFiles/');
      const ext = path.extname(name).toLowerCase();
      if (name.includes('/') && !teaching && !PUBLIC_DIRECTORIES.has(name.split('/')[0])) return res.status(404).send('DTECH file not available.');
      if (BACKEND_FILES.has(name.toLowerCase()) || (!teaching && !PUBLIC_EXTENSIONS.has(ext))
        || (teaching && !['.pdf', '.doc', '.docx', '.pptx', '.jpg', '.png', ...(req.dtechAccess.teacher ? ['.xlsx'] : [])].includes(ext))) {
        return res.status(404).send('DTECH file not available.');
      }
      const filename = path.join(SOURCE, ...name.split('/'));
      let bytes;
      try { bytes = await fs.readFile(filename); } catch (error) {
        if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return res.status(404).send('DTECH file not found.');
        throw error;
      }
      res.set('Cache-Control', 'private, no-store');
      res.type(ext);
      if (teaching) return res.send(bytes);
      if (!['.html', '.js', '.css'].includes(ext)) return res.send(bytes);
      let text = prefixText(bytes.toString('utf8'));
      if (ext === '.html') {
        const context = JSON.stringify({
          profile: { email: req.user.email, name: req.user.display_name, picture: req.user.avatar_url, email_verified: true },
          csrf: req.session.dtechCsrf,
          viewMode: effectiveDtechView(req.dtechAccess, req.session, req.path),
          expiresAt: new Date(req.session.cookie.expires).getTime()
        }).replace(/</g, '\\u003c');
        text = text.replace(/(<meta\s+name="hub-google-client-id"\s+content=")[^"]*(")/gi, `$1${env.GOOGLE_CLIENT_ID || ''}$2`);
        text = text.replace(/<head\b[^>]*>/i, `$&<script>window.whsDtech=${context};</script><script src="/dtech-session.js"></script>`);
      }
      return res.send(text);
    } catch (error) { return next(error); }
  });
  router.use((req, res, next) => legacy.app(req, res, next));
  router.use((error, req, res, next) => {
    console.error('DTECH request failed:', error.message);
    if (res.headersSent) return next(error);
    return res.status(500).json({ error: 'DTECH could not complete this request. Please retry or contact an administrator.' });
  });
  return router;
}

module.exports = { createDtechRouter, accessForEmail, effectiveDtechView, prefixText, prefixData, canWrite };
