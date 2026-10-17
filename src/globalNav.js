const SCRIPT_TAG = '<script src="/global-nav.js" defer></script>';

// Adds the global left navigation script to every full HTML page, including the static legacy pages.
function injectGlobalNav(req, res, next) {
  if (req.method !== 'GET') return next();

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
    const html = original.toString('utf8');
    const index = html.toLowerCase().lastIndexOf('</body>');
    chunks = null;

    if (index === -1 || html.includes('/global-nav.js')) {
      return end(original, callback);
    }

    const output = Buffer.from(`${html.slice(0, index)}${SCRIPT_TAG}\n${html.slice(index)}`, 'utf8');
    res.setHeader('Content-Length', output.length);
    return end(output, callback);
  };

  return next();
}

function navData(query) {
  return async (req, res, next) => {
    try {
      const user = req.user;
      const modules = user
        ? (await query('SELECT display_name, path FROM modules WHERE is_active = true ORDER BY display_name')).rows
        : [];
      res.set('Cache-Control', 'no-store');
      res.json({
        signedIn: Boolean(user),
        name: user ? user.display_name || user.email : null,
        role: res.locals.activeRole,
        isAdmin: res.locals.isAdmin,
        modules: modules.map((module) => ({ name: module.display_name, path: module.path }))
      });
    } catch (error) {
      next(error);
    }
  };
}

module.exports = { injectGlobalNav, navData };
