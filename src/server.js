const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const path = require('path');
const config = require('./config');
const passport = require('./auth');
const { pool, query, runMigrations } = require('./db');
const { ensureAuthenticated, ensureRole } = require('./middleware');
const kamarUploader = require('./modules/kamarUploader');
const learningSites = require('./modules/learningSites');
const { adminRouter: technologyHubAdmin, publicRouter: technologyHubPublic } = require('./modules/technologyHub');
const sewingHub = require('./modules/sewingHub');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));
app.set('trust proxy', 1);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 300 }));
app.use(express.urlencoded({ extended: false }));
app.use(express.json({ limit: '25mb' }));
app.use(session({
  cookie: {
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 8,
    sameSite: 'lax',
    secure: config.isProduction
  },
  name: 'whs.sid',
  resave: false,
  saveUninitialized: false,
  secret: config.sessionSecret,
  store: new PgSession({
    createTableIfMissing: true,
    pool,
    tableName: 'user_sessions'
  })
}));
app.use(passport.initialize());
app.use(passport.session());

app.use((req, res, next) => {
  res.locals.currentUser = req.user;
  res.locals.isAdmin = req.user?.roles?.includes('ADMIN') || false;
  res.locals.activeRole = req.user?.roles?.includes('ADMIN')
    ? (req.query.view === 'student' ? 'Student' : req.query.view === 'teacher' ? 'Teacher' : 'ADMIN')
    : req.user?.roles?.find((role) => ['Teacher', 'Student', 'Staff'].includes(role)) || 'Staff';
  next();
});

app.get('/healthz', (req, res) => {
  res.status(200).json({ ok: true });
});

app.use('/admin/kamar-uploader', kamarUploader);
app.use('/learning-sites', learningSites);
app.use('/technology-hub', technologyHubPublic);
app.use('/admin/technology-hub', technologyHubAdmin);
app.use('/sewing-hub', sewingHub);
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/', async (req, res, next) => {
  try {
    const modules = req.user
      ? (await query('SELECT * FROM modules WHERE is_active = true ORDER BY display_name')).rows
      : [];

    res.render('home', { modules, title: 'WHS APPSystem' });
  } catch (error) {
    next(error);
  }
});

app.get('/auth/google', (req, res, next) => {
  if (!config.google.isConfigured) {
    return res.status(503).render('error', {
      title: 'Google login not configured',
      message: 'Google OAuth is not configured yet. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET before attempting to sign in.'
    });
  }

  return passport.authenticate('google', {
    hd: config.google.hostedDomain,
    prompt: 'select_account',
    scope: ['profile', 'email']
  })(req, res, next);
});

app.get('/auth/google/callback', (req, res, next) => {
  if (!config.google.isConfigured) {
    return res.status(503).render('error', {
      title: 'Google login not configured',
      message: 'Google OAuth is not configured yet. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET before attempting to sign in.'
    });
  }

  return passport.authenticate('google', {
    failureRedirect: '/?login=failed',
    successRedirect: '/dashboard'
  })(req, res, next);
});

app.post('/logout', ensureAuthenticated, (req, res, next) => {
  req.logout((error) => {
    if (error) {
      return next(error);
    }

    return res.redirect('/');
  });
});

app.get('/dashboard', ensureAuthenticated, async (req, res, next) => {
  try {
    const activeRole = res.locals.activeRole;
    let modules;

    if (activeRole === 'ADMIN') {
      modules = (await query('SELECT * FROM modules WHERE is_active = true ORDER BY display_name')).rows;
    } else if (activeRole === 'Teacher') {
      modules = (await query(
        `SELECT modules.*
         FROM modules
         INNER JOIN teacher_module_assignments assignments ON assignments.module_id = modules.id
         WHERE modules.is_active = true AND assignments.user_id = $1
         ORDER BY modules.display_name`,
        [req.user.id]
      )).rows;
    } else {
      modules = (await query(
        `SELECT DISTINCT modules.*
         FROM modules
         INNER JOIN role_modules ON role_modules.module_id = modules.id
         INNER JOIN roles ON roles.id = role_modules.role_id
         WHERE modules.is_active = true AND roles.name = $1
         ORDER BY modules.display_name`,
        [activeRole]
      )).rows;
    }

    res.render('dashboard', { modules, title: 'Dashboard' });
  } catch (error) {
    next(error);
  }
});

app.get('/profile', ensureAuthenticated, (req, res) => {
  res.render('profile', { title: 'User Profile' });
});

app.get('/admin', ensureAuthenticated, ensureRole('ADMIN'), async (req, res, next) => {
  try {
    const [users, roles, modules] = await Promise.all([
      query('SELECT COUNT(*)::int AS count FROM users'),
      query('SELECT COUNT(*)::int AS count FROM roles'),
      query('SELECT COUNT(*)::int AS count FROM modules')
    ]);

    res.render('admin/index', {
      modules: modules.rows[0].count,
      roles: roles.rows[0].count,
      title: 'Administrator Dashboard',
      users: users.rows[0].count
    });
  } catch (error) {
    next(error);
  }
});

app.get('/admin/users', ensureAuthenticated, ensureRole('ADMIN'), async (req, res, next) => {
  try {
    const users = (await query(
      `SELECT users.*, COALESCE(array_agg(roles.name) FILTER (WHERE roles.name IS NOT NULL), '{}') AS roles
       FROM users
       LEFT JOIN user_roles ON user_roles.user_id = users.id
       LEFT JOIN roles ON roles.id = user_roles.role_id
       GROUP BY users.id
       ORDER BY users.email`
    )).rows;
    const roles = (await query('SELECT * FROM roles ORDER BY name')).rows;

    res.render('admin/users', { roles, title: 'Assign User Roles', users });
  } catch (error) {
    next(error);
  }
});

app.get('/admin/teachers', ensureAuthenticated, ensureRole('ADMIN'), async (req, res, next) => {
  try {
    const teachers = (await query(
      `SELECT users.id, users.display_name, users.email,
              COALESCE(array_agg(assignments.module_id) FILTER (WHERE assignments.module_id IS NOT NULL), '{}') AS module_ids
       FROM users
       INNER JOIN user_roles ON user_roles.user_id = users.id
       INNER JOIN roles ON roles.id = user_roles.role_id AND roles.name = 'Teacher'
       LEFT JOIN teacher_module_assignments assignments ON assignments.user_id = users.id
       GROUP BY users.id
       ORDER BY users.email`
    )).rows;
    const modules = (await query('SELECT * FROM modules WHERE is_active = true ORDER BY display_name')).rows;

    res.render('admin/teachers', { modules, teachers, title: 'Assign Teacher Modules' });
  } catch (error) {
    next(error);
  }
});

app.post('/admin/teachers/:userId/modules', ensureAuthenticated, ensureRole('ADMIN'), async (req, res, next) => {
  try {
    const moduleIds = Array.isArray(req.body.moduleIds)
      ? req.body.moduleIds
      : req.body.moduleIds
        ? [req.body.moduleIds]
        : [];

    await query('DELETE FROM teacher_module_assignments WHERE user_id = $1', [req.params.userId]);

    for (const moduleId of moduleIds) {
      await query(
        'INSERT INTO teacher_module_assignments (user_id, module_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [req.params.userId, moduleId]
      );
    }

    res.redirect('/admin/teachers');
  } catch (error) {
    next(error);
  }
});

app.post('/admin/users/:userId/roles', ensureAuthenticated, ensureRole('ADMIN'), async (req, res, next) => {
  try {
    const roleIds = Array.isArray(req.body.roleIds)
      ? req.body.roleIds
      : req.body.roleIds
        ? [req.body.roleIds]
        : [];

    await query('DELETE FROM user_roles WHERE user_id = $1', [req.params.userId]);

    for (const roleId of roleIds) {
      await query('INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.params.userId, roleId]);
    }

    res.redirect('/admin/users');
  } catch (error) {
    next(error);
  }
});

app.get('/admin/roles', ensureAuthenticated, ensureRole('ADMIN'), async (req, res, next) => {
  try {
    const roles = (await query(
      `SELECT roles.*, COALESCE(array_agg(permissions.key) FILTER (WHERE permissions.key IS NOT NULL), '{}') AS permissions
       FROM roles
       LEFT JOIN role_permissions ON role_permissions.role_id = roles.id
       LEFT JOIN permissions ON permissions.id = role_permissions.permission_id
       GROUP BY roles.id
       ORDER BY roles.name`
    )).rows;
    const permissions = (await query('SELECT * FROM permissions ORDER BY module_key, key')).rows;

    res.render('admin/roles', { permissions, roles, title: 'Role Permission Management' });
  } catch (error) {
    next(error);
  }
});

app.post('/admin/roles/:roleId/permissions', ensureAuthenticated, ensureRole('ADMIN'), async (req, res, next) => {
  try {
    const permissionIds = Array.isArray(req.body.permissionIds)
      ? req.body.permissionIds
      : req.body.permissionIds
        ? [req.body.permissionIds]
        : [];

    await query('DELETE FROM role_permissions WHERE role_id = $1', [req.params.roleId]);

    for (const permissionId of permissionIds) {
      await query('INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.params.roleId, permissionId]);
    }

    res.redirect('/admin/roles');
  } catch (error) {
    next(error);
  }
});

app.get('/admin/modules', ensureAuthenticated, ensureRole('ADMIN'), async (req, res, next) => {
  try {
    const modules = (await query('SELECT * FROM modules ORDER BY display_name')).rows;
    res.render('admin/modules', { modules, title: 'App Module Management' });
  } catch (error) {
    next(error);
  }
});

app.post('/admin/modules', ensureAuthenticated, ensureRole('ADMIN'), async (req, res, next) => {
  try {
    await query(
      `INSERT INTO modules (module_key, display_name, description, path, is_active)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (module_key)
       DO UPDATE SET display_name = EXCLUDED.display_name, description = EXCLUDED.description, path = EXCLUDED.path, is_active = EXCLUDED.is_active, updated_at = NOW()`,
      [req.body.moduleKey, req.body.displayName, req.body.description || null, req.body.path || '#', req.body.isActive === 'on']
    );

    res.redirect('/admin/modules');
  } catch (error) {
    next(error);
  }
});

app.use((req, res) => {
  res.status(404).render('error', { title: 'Page not found', message: 'The page you requested could not be found.' });
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).render('error', { title: 'Server error', message: 'Something went wrong.' });
});

async function start() {
  for (const key of config.required) {
    if (key === 'SESSION_SECRET' && !config.sessionSecret) {
      console.warn('Missing environment variable: SESSION_SECRET or SECRET_KEY');
      continue;
    }

    if (!process.env[key]) {
      console.warn(`Missing environment variable: ${key}`);
    }
  }

  if (!config.google.isConfigured) {
    console.warn('Google OAuth is not configured: set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET');
  }

  if (config.databaseUrl) {
    await runMigrations();
  }

  app.listen(config.port, () => {
    console.log(`WHS APPSystem listening on port ${config.port}`);
  });
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
