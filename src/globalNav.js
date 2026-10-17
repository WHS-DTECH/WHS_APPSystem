const SCRIPT_TAG = '<script src="/global-nav.js" defer></script>';
const FAVICON_TAG = '<link rel="icon" type="image/x-icon" href="/images/favicon.ico">';

// Adds the global left navigation script to every full HTML page, including the static legacy pages.
function injectGlobalNav(req, res, next) {
  // Pages cached before the script existed would otherwise keep answering 304 Not Modified.
  if (String(req.headers.accept || '').includes('text/html')) {
    delete req.headers['if-none-match'];
    delete req.headers['if-modified-since'];
  }

  const write = res.write.bind(res);
  const end = res.end.bind(res);
  let chunks = null;
  let decided = false;

  const buffering = () => {
    if (!decided) {
      decided = true;
      const type = String(res.getHeader('Content-Type') || '');
      if (!res.headersSent && res.statusCode === 200 && /text\/html/i.test(type) && !res.getHeader('Content-Encoding')) {
        chunks = [];
      }
    }
    return chunks !== null;
  };

  const toBuffer = (chunk, encoding) => (Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), typeof encoding === 'string' ? encoding : 'utf8'));

  res.write = (chunk, encoding, callback) => {
    if (!buffering()) return write(chunk, encoding, callback);
    if (chunk) chunks.push(toBuffer(chunk, encoding));
    const done = typeof encoding === 'function' ? encoding : callback;
    if (typeof done === 'function') done();
    return true;
  };

  res.end = (chunk, encoding, callback) => {
    if (typeof chunk === 'function') return res.end(null, null, chunk);
    if (typeof encoding === 'function') return res.end(chunk, null, encoding);
    if (!buffering()) return end(chunk, encoding, callback);

    if (chunk) chunks.push(toBuffer(chunk, encoding));
    const original = Buffer.concat(chunks);
    let html = original.toString('utf8');
    const pagePath = req.originalUrl.split('?')[0];
    const guidancePage = /^\/(?:apps|student-apps)\/guidance-counsellor-app(?:\/|$)/.test(pagePath)
      || pagePath === '/hubs/app-guidance-counsellor-app/roles';
    if (guidancePage && /<\/head\s*>/i.test(html) && /<\/body>/i.test(html)) {
      html = html.replace(/<\/head\s*>/i, '<link rel="stylesheet" href="/guidance-navigation.css">\n</head>')
        .replace(/<\/body>/i, '<script src="/guidance-navigation.js" defer></script>\n</body>');
    }
    const footer = res.locals.studentAppFooter;
    if (footer && /<body\b[^>]*>/i.test(html) && /<\/body>/i.test(html)) {
      const registered = new Date(footer.registeredAt);
      const updated = new Date(footer.updatedAt);
      if (!Number.isFinite(registered.getTime()) || !Number.isFinite(updated.getTime())) {
        throw new Error('Student app footer requires valid registration and update dates.');
      }
      const year = new Intl.DateTimeFormat('en-NZ', { year: 'numeric', timeZone: 'Pacific/Auckland' }).format(registered);
      const monthYear = new Intl.DateTimeFormat('en-NZ', { month: 'long', year: 'numeric', timeZone: 'Pacific/Auckland' }).format(updated);
      html = html.replace(/<\/head\s*>/i, '<link rel="stylesheet" href="/student-app-footer.css">\n</head>')
        .replace(/<body\b[^>]*>/i, '$&<div id="whs-student-app-viewport">')
        .replace(/<\/body>/i, `</div><footer id="whs-student-app-footer"><span>This website was made by a Westland High School student. &copy; ${year}. Last Updated: ${monthYear}</span></footer></body>`);
    }
    if (/<\/head\s*>/i.test(html)) {
      if (!html.includes('href="/account-controls.css"')) {
        html = html.replace(/<\/head\s*>/i, '<link rel="stylesheet" href="/account-controls.css">\n</head>');
      }
      html = html.replace(/<link\b[^>]*>/gi, (tag) => {
        const rel = tag.match(/\brel\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
        return rel && /^(?:icon|shortcut\s+icon)$/i.test((rel[1] ?? rel[2] ?? rel[3]).trim()) ? '' : tag;
      }).replace(/<\/head\s*>/i, `${FAVICON_TAG}\n</head>`);
    }
    const index = html.toLowerCase().lastIndexOf('</body>');
    chunks = null;

    if (index !== -1 && !html.includes('/global-nav.js')) {
      html = `${html.slice(0, index)}${SCRIPT_TAG}\n${html.slice(index)}`;
    }
    if (html === original.toString('utf8')) {
      return end(original, callback);
    }

    const output = Buffer.from(html, 'utf8');
    res.removeHeader('ETag');
    res.removeHeader('Last-Modified');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Content-Length', output.length);
    return end(output, callback);
  };

  return next();
}

function navData(query, canManageHubRoles, datasetManagerUrl, canManageCourses = async () => false) {
  return async (req, res, next) => {
    try {
      const user = req.user;
      const modules = user
        ? (await query('SELECT display_name, path FROM modules WHERE is_active = true ORDER BY display_name')).rows
        : [];
      let assignRolesUrl = null;
      let datasetUrl = null;
      let courseManagementUrl = null;
      const currentPath = String(req.query.path || '');
      if (user && /^\/dtech-hub\/class-training(?:\/|$)/.test(currentPath) && await canManageCourses(user)) {
        courseManagementUrl = '/dtech-hub/class-training/admin/';
      }
      const appPath = currentPath.match(/^\/(?:apps|student-apps)\/([a-z0-9-]+)(?:\/|$)/)
        || currentPath.match(/^\/hubs\/app-([a-z0-9-]+)\/roles(?:\/|$)/);
      if (user && appPath) {
        const app = (await query('SELECT hub_key FROM student_apps WHERE slug = $1', [appPath[1]])).rows[0];
        if (app && await canManageHubRoles(user, app.hub_key)) {
          assignRolesUrl = `/hubs/${app.hub_key}/roles`;
        }
        if (app) datasetUrl = await datasetManagerUrl(user, appPath[1]);
      }
      if (user && (/^\/dtech-hub(?:\/|$)/.test(currentPath) || currentPath === '/hubs/dtech-hub/roles')
        && await canManageHubRoles(user, 'dtech-hub')) {
        assignRolesUrl = '/hubs/dtech-hub/roles';
      }
      res.set('Cache-Control', 'no-store');
      res.json({
        signedIn: Boolean(user),
        name: user ? user.display_name || user.email : null,
        email: user ? user.email : null,
        avatarUrl: user ? user.avatar_url || null : null,
        assignRolesUrl,
        datasetManagerUrl: datasetUrl,
        courseManagementUrl,
        role: res.locals.activeRole,
        isAdmin: res.locals.isAdmin,
        modules: modules.map((module) => ({ name: module.display_name, path: module.path }))
      });
    } catch (error) {
      next(error);
    }
  };
}

const NEXT_COOKIE = 'whs_next';

// Only same-site relative paths are accepted, so login can't be used as an open redirect.
function safeNext(value) {
  const next = String(value || '');
  if (!next.startsWith('/') || next.startsWith('//') || next.includes('\\') || /[\r\n]/.test(next)) return null;
  return next.slice(0, 500);
}

function readCookie(req, name) {
  const match = String(req.headers.cookie || '').split(/;\s*/).find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

module.exports = { injectGlobalNav, navData, safeNext, readCookie, NEXT_COOKIE };
