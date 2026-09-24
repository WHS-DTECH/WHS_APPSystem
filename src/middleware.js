function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }

  return res.redirect('/');
}

function ensureRole(roleName) {
  return (req, res, next) => {
    if (req.user?.roles?.includes('ADMIN') || req.user?.roles?.includes(roleName)) {
      return next();
    }

    return res.status(403).render('error', {
      title: 'Access denied',
      message: 'You do not have permission to access this page.'
    });
  };
}

function ensureHubPermission(hubKey, permissionKey) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.redirect('/');
    }

    if (req.user.roles?.includes('ADMIN')) {
      return next();
    }

    try {
      const { query } = require('./db');
      const result = await query(
        `SELECT 1
         FROM user_hub_roles assignments
         INNER JOIN hub_roles roles ON roles.id = assignments.hub_role_id
         INNER JOIN hub_role_permissions role_permissions ON role_permissions.hub_role_id = roles.id
         INNER JOIN hub_permissions permissions ON permissions.id = role_permissions.hub_permission_id
         WHERE assignments.user_id = $1
           AND roles.hub_key = $2
           AND permissions.permission_key = $3
         LIMIT 1`,
        [req.user.id, hubKey, permissionKey]
      );

      if (result.rowCount > 0) {
        return next();
      }
    } catch (error) {
      return next(error);
    }

    return res.status(403).render('error', {
      title: 'Access denied',
      message: 'You do not have permission to perform this action in this hub.'
    });
  };
}

module.exports = {
  ensureAuthenticated,
  ensureHubPermission,
  ensureRole
};
