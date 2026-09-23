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

module.exports = {
  ensureAuthenticated,
  ensureRole
};
