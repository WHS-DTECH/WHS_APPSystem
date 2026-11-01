const { query } = require('./db');
const { appDestination } = require('./appAddresses');
const path = require('node:path');

async function registeredModules(user, dbQuery = query) {
  const { rows } = await dbQuery(`SELECT m.*,
    (u.is_active=true AND (
      EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=u.id AND r.name='ADMIN')
      OR (m.module_key NOT IN ('core','kamar-uploader','module-builder') AND (
        EXISTS (SELECT 1 FROM teacher_module_assignments t WHERE t.user_id=u.id AND t.module_id=m.id)
        OR EXISTS (SELECT 1 FROM user_hub_roles a JOIN hub_roles r ON r.id=a.hub_role_id
          JOIN hub_role_permissions rp ON rp.hub_role_id=r.id
          JOIN hub_permissions p ON p.id=rp.hub_permission_id AND p.hub_key=r.hub_key
          WHERE a.user_id=u.id AND a.area_key IS NULL AND p.permission_key='home.view'
            AND r.hub_key=COALESCE(s.hub_key,m.module_key))
      ))
    )) AS has_access
    FROM modules m
    LEFT JOIN student_apps s ON m.module_key=s.hub_key OR m.module_key='student-app-'||s.slug
    LEFT JOIN users u ON u.id=$1
    ORDER BY m.display_name`, [user?.id || null]);
  return rows;
}

async function accessibleModules(user, dbQuery = query) {
  if (!user || user.is_active === false) return [];
  return (await registeredModules(user, dbQuery)).filter(module => module.is_active && module.has_access);
}

function createModuleAccessGuard({ dbQuery = query } = {}) {
  return async (req, res, next) => {
    try {
      let requestPath;
      try { requestPath = decodeURIComponent(req.path); }
      catch {
        console.warn('[module-access] Invalid encoded request path.');
        return res.status(400).render('error', { title: 'Invalid address', message: 'Use a valid app address from your Launchpad.' });
      }
      if (/[\x00-\x1f\x7f\\]/.test(requestPath)) {
        console.warn('[module-access] Unsafe request path rejected.');
        return res.status(400).render('error', { title: 'Invalid address', message: 'Use a valid app address from your Launchpad.' });
      }
      requestPath = path.posix.normalize(requestPath).toLowerCase();
      const modules = await registeredModules(req.user, dbQuery);
      const matching = modules.filter(module => {
        if (!module.path?.startsWith('/') || module.path.startsWith('//')) return false;
        const root = path.posix.normalize(decodeURIComponent(appDestination(module.path).split(/[?#]/)[0])).replace(/\/+$/, '').toLowerCase();
        return root && (requestPath === root || requestPath.startsWith(root + '/'));
      }).sort((a, b) => b.path.length - a.path.length);
      const module = matching[0];
      if (!module) return next();
      res.set('Cache-Control', 'no-store');
      const plannerApi = /^\/teacher-planner\/api(?:\/|$)/.test(requestPath);
      if (!req.user && plannerApi) return res.status(401).json({ error: 'School sign-in required. Copy unsaved work before signing in again.' });
      if (!req.user) return res.redirect('/auth/google?next=' + encodeURIComponent(req.originalUrl));
      if ((!module.is_active && module.module_key !== 'core') || !module.has_access || req.user.is_active === false) {
        if (plannerApi) return res.status(403).json({ error: 'Teacher Planner is inactive or has not been assigned to your active school account.' });
        return res.status(403).render('error', { title: 'App access denied', message: 'This app is inactive or has not been assigned to your active school account.' });
      }
      next();
    } catch (error) { next(error); }
  };
}

module.exports = { registeredModules, accessibleModules, createModuleAccessGuard };
