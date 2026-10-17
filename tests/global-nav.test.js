const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { injectGlobalNav, navData, safeNext } = require('../src/globalNav');

test('shared search advertises only the signed-in current module', async () => {
  for (const [page, user, expected] of [
    ['/dtech-hub/class-training/home', { email: 'fixture@example.test' }, 'training'],
    ['/dtech-hub/', { email: 'fixture@example.test' }, 'dtech'],
    ['/unknown', { email: 'fixture@example.test' }, null],
    ['/food-room/', null, null]
  ]) {
    let body;
    await navData(async () => ({ rows: [] }), async () => false, async () => null, async () => false)(
      { user, query: { path: page } },
      { locals: {}, set() {}, json(value) { body = value; } },
      (error) => { throw error; }
    );
    assert.equal(body.searchModule?.key || null, expected);
  }
});

test('Course Management settings are contextual and require current training teacher access', async () => {
  for (const [page, user, allowed, expected] of [
    ['/dtech-hub/class-training/home', { email: 'teacher@example.test' }, true, '/dtech-hub/class-training/admin/'],
    ['/dtech-hub/class-training/admin/', { email: 'teacher@example.test' }, true, '/dtech-hub/class-training/admin/'],
    ['/dtech-hub/class-training/home', { email: 'student@example.test' }, false, null],
    ['/dtech-hub/', { email: 'teacher@example.test' }, true, null],
    ['/apps/guidance-counsellor-app/dashboard', { email: 'teacher@example.test' }, true, null],
    ['/dtech-hub/class-training/home', null, true, null]
  ]) {
    let body;
    await navData(async () => ({ rows: [] }), async () => false, async () => null, async () => allowed)(
      { user, query: { path: page } },
      { locals: {}, set() {}, json(value) { body = value; } },
      (error) => { throw error; }
    );
    assert.equal(body.courseManagementUrl, expected, page);
  }
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'global-nav.js'), 'utf8');
  assert.match(source, /if \(data\.datasetManagerUrl \|\| data\.assignRolesUrl \|\| data\.courseManagementUrl\)/);
  assert.match(source, /link\(settings, 'Course Management', data\.courseManagementUrl\)/);
});

test('HUB Dashboard, DTECH and Class Training use the requested navigation groups', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'global-nav.js'), 'utf8');
  const start = source.indexOf('var modules = data.modules || [];');
  const end = source.indexOf("nav.appendChild(el('div', { 'class': 'gn-spacer' }));", start);
  assert.ok(start !== -1 && end > start);
  const entries = [];
  const modules = [
    { name: 'Guidance Counsellor App', path: '/student-apps/guidance-counsellor-app' },
    { name: 'DTECH Hub', path: '/dtech-hub/' },
    { name: 'Food Room Hub', path: '/food-room/' },
    { name: 'Technology Hub', path: '/technology-hub/' }
  ];
  const renderSections = new Function('data', 'nav', 'el', 'link', source.slice(start, end));
  renderSections({ modules }, { appendChild(node) { entries.push(node); } },
    (tag, attrs, text) => ({ text }),
    (nav, text, href) => entries.push({ text, href }));
  const technology = entries.findIndex((entry) => entry.href === '/technology-hub/');
  assert.equal(entries[technology].text, 'HUB Dashboard');
  assert.equal(entries[technology + 1].href, '/dtech-hub/');
  const hubs = entries.findIndex((entry) => entry.text === 'Hubs');
  const studentApps = entries.findIndex((entry) => entry.text === 'Student Apps');
  const capsules = entries.findIndex((entry) => entry.text === 'CAPSULES');
  const training = entries.findIndex((entry) => entry.href === '/dtech-hub/class-training/');
  assert.ok(capsules > technology && training > capsules && training < studentApps);
  assert.equal(entries[training].text, 'Class Training');
  assert.equal(entries.filter((entry) => entry.href === '/dtech-hub/class-training/').length, 1);
  assert.equal(entries.find((entry) => entry.href === '/student-apps').text, 'APPs Dashboard');
  assert.ok(technology > hubs && technology + 1 < studentApps);
  assert.equal(entries.filter((entry) => entry.href === '/dtech-hub/').length, 1);
  assert.ok(entries.findIndex((entry) => entry.href === '/student-apps/guidance-counsellor-app') > studentApps);

  const html = await require('ejs').renderFile(path.join(__dirname, '..', 'views', 'dashboard.ejs'), {
    title: 'Dashboard', currentUser: { display_name: 'Fixture Admin' }, activeRole: 'ADMIN', isAdmin: true,
    modules: modules.map((module) => ({
      module_key: module.path === '/dtech-hub/' ? 'dtech-hub' : module.path === '/technology-hub/' ? 'technology-hub' : 'other',
      path: module.path, display_name: module.name
    }))
  });
  const technologyCard = html.indexOf('<strong>HUB Dashboard</strong>');
  const dtechCard = html.indexOf('<strong>DTECH Hub</strong>');
  assert.ok(technologyCard !== -1 && dtechCard > technologyCard);
  assert.match(html, /href="\/hubs\/dtech-hub\/roles"/);
});

async function withServer(setup, run) {
  const app = express();
  app.use(injectGlobalNav);
  setup(app);
  const server = app.listen(0);
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.close();
  }
}

test('global nav script is injected into static and rendered html pages only once', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gn-'));
  fs.writeFileSync(path.join(dir, 'legacy.html'), '<html><body><h1>Legacy</h1></body></html>');
  fs.writeFileSync(path.join(dir, 'fragment.html'), '<div>navbar fragment</div>');
  fs.writeFileSync(path.join(dir, 'data.json'), '{"a":1}');

  await withServer((app) => {
    app.use(express.static(dir));
    app.get('/page', (req, res) => res.send('<html><body>Hi</body></html>'));
    app.get('/api', (req, res) => res.json({ ok: true }));
  }, async (base) => {
    const legacy = await (await fetch(`${base}/legacy.html`)).text();
    assert.match(legacy, /<script src="\/global-nav\.js" defer><\/script>\n<\/body>/);
    assert.equal(legacy.match(/global-nav\.js/g).length, 1);

    const page = await fetch(`${base}/page`);
    const pageText = await page.text();
    assert.match(pageText, /global-nav\.js/);
    assert.equal(Number(page.headers.get('content-length')), Buffer.byteLength(pageText));

    assert.equal(await (await fetch(`${base}/fragment.html`)).text(), '<div>navbar fragment</div>');
    assert.deepEqual(await (await fetch(`${base}/data.json`)).json(), { a: 1 });
    assert.deepEqual(await (await fetch(`${base}/api`)).json(), { ok: true });
  });
});

test('cached pages without the script are refetched in full', async () => {
  await withServer((app) => {
    app.get('/page', (req, res) => res.send('<html><body>Hi</body></html>'));
  }, async (base) => {
    const first = await fetch(`${base}/page`, { headers: { Accept: 'text/html' } });
    assert.equal(first.headers.get('etag'), null);
    const again = await fetch(`${base}/page`, { headers: { Accept: 'text/html', 'If-None-Match': 'W/"anything"' } });
    assert.equal(again.status, 200);
    assert.match(await again.text(), /global-nav\.js/);
  });

});

test('all full pages use the shared favicon even with existing legacy icons or navigation', async () => {
  await withServer((app) => {
    app.get('/page', (req, res) => res.send('<html><head><link rel="shortcut icon" href="/old.ico"><link rel=icon href="/another.ico"><link rel="stylesheet" href="/styles.css"></head><body><script src="/global-nav.js" defer></script></body></html>'));
  }, async (base) => {
    const response = await fetch(`${base}/page`);
    const html = await response.text();
    assert.equal((html.match(/rel="icon"/g) || []).length, 1);
    assert.match(html, /href="\/images\/favicon.ico"/);
    assert.doesNotMatch(html, /old.ico|another.ico/);
    assert.match(html, /rel="stylesheet"/);
    assert.equal((html.match(/global-nav.js/g) || []).length, 1);
    assert.equal(Number(response.headers.get('content-length')), Buffer.byteLength(html));
  });
});

test('streamed hosted HTML and POST pages receive the shared favicon', async () => {
  await withServer((app) => {
    app.all('/stream', (req, res) => {
      res.status(200).setHeader('Content-Type', 'text/html');
      res.write('<html><head><title>Hosted app</title>');
      res.end('</head><body>App</body></html>');
    });
  }, async (base) => {
    for (const method of ['GET', 'POST']) {
      const response = await fetch(`${base}/stream`, { method });
      const html = await response.text();
      assert.match(html, /href="\/images\/favicon.ico"/);
      assert.equal(Number(response.headers.get('content-length')), Buffer.byteLength(html));
    }
  });
});

test('script is still injected when a signed-in session refreshes on the response', async () => {
  const session = require('express-session');
  await withServer((app) => {
    app.use(session({ secret: 's', resave: false, saveUninitialized: false, cookie: { maxAge: 60000 } }));
    app.use(injectGlobalNav);
    app.get('/login', (req, res) => { req.session.user = 1; res.send('ok'); });
    app.get('/page', (req, res) => res.send('<html><body>Hi</body></html>'));
  }, async (base) => {
    const login = await fetch(`${base}/login`);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const page = await fetch(`${base}/page`, { headers: { cookie, Accept: 'text/html' } });
    const text = await page.text();
    assert.match(text, /global-nav\.js/);
    assert.equal(Number(page.headers.get('content-length')), Buffer.byteLength(text));
  });
});

test('nav-data returns the module links for a signed in user and none for anonymous visitors', async () => {
  const query = async () => ({ rows: [{ display_name: 'Food Room Hub', path: '/food-room' }] });
  await withServer((app) => {
    app.use((req, res, next) => {
      res.locals.activeRole = 'ADMIN';
      res.locals.isAdmin = true;
      if (req.query.in) req.user = { display_name: 'Vanessa', email: 'v@x.nz', avatar_url: 'https://example.invalid/avatar.png' };
      next();
    });
    app.get('/nav-data', navData(query, async () => false, async () => null));
  }, async (base) => {
    const anon = await (await fetch(`${base}/nav-data`)).json();
    assert.equal(anon.signedIn, false);
    assert.equal(anon.email, null);
    assert.equal(anon.avatarUrl, null);
    assert.deepEqual(anon.modules, []);
    const user = await (await fetch(`${base}/nav-data?in=1`)).json();
    assert.equal(user.name, 'Vanessa');
    assert.equal(user.email, 'v@x.nz');
    assert.equal(user.avatarUrl, 'https://example.invalid/avatar.png');
    assert.equal(user.role, 'ADMIN');
    assert.deepEqual(user.modules, [{ name: 'Food Room Hub', path: '/food-room' }]);
  });

});

test('public pages load the shared account-control assets', async () => {
  await withServer((app) => {
    app.get('/page', (req, res) => res.send('<html><head><title>Hub</title></head><body>Hub</body></html>'));
  }, async (base) => {
    const response = await fetch(`${base}/page`);
    const html = await response.text();
    assert.match(html, /<link rel="stylesheet" href="\/account-controls.css">/);
    assert.match(html, /<script src="\/global-nav.js" defer><\/script>/);
    assert.equal((html.match(/account-controls.css/g) || []).length, 1);
  });
});

test('account role link uses the current app and the global role-management permission', async () => {
  const checks = [];
  const query = async (sql, params) => {
    if (sql.includes('FROM modules')) return { rows: [] };
    assert.match(sql, /SELECT hub_key FROM student_apps WHERE slug = \$1/);
    return { rows: params[0] === 'guidance-counsellor-app' ? [{ hub_key: 'app-guidance-counsellor-app' }] : [] };
  };
  await withServer((app) => {
    app.use((req, res, next) => {
      if (req.query.user) req.user = { id: req.query.user, email: 'test@example.invalid' };
      next();
    });
    app.get('/nav-data', navData(query, async (user, hubKey) => {
      checks.push([user.id, hubKey]);
      return ['admin', 'lead-teacher'].includes(user.id);
    }, async (user, slug) => {
      assert.equal(slug, 'guidance-counsellor-app');
      return user.id === 'student' ? null : '/apps/guidance-counsellor-app/infrastructure';
    }));
  }, async (base) => {
    for (const user of ['admin', 'lead-teacher', 'builder', 'counsellor', 'student', '']) {
      for (const appPath of ['/apps/guidance-counsellor-app/dashboard', '/student-apps/guidance-counsellor-app', '/hubs/app-guidance-counsellor-app/roles']) {
        const data = await (await fetch(`${base}/nav-data?user=${user}&path=${encodeURIComponent(appPath)}`)).json();
        assert.equal(data.assignRolesUrl, ['admin', 'lead-teacher'].includes(user) ? '/hubs/app-guidance-counsellor-app/roles' : null);
        assert.equal(data.datasetManagerUrl, user && user !== 'student' ? '/apps/guidance-counsellor-app/infrastructure' : null);
      }
    }
    for (const appPath of ['/apps/unknown/dashboard', '/profile', '//evil.invalid/apps/guidance-counsellor-app']) {
      const data = await (await fetch(`${base}/nav-data?user=admin&path=${encodeURIComponent(appPath)}`)).json();
      assert.equal(data.assignRolesUrl, null);
      assert.equal(data.datasetManagerUrl, null);
    }
    assert.equal(checks.length, 15);
    assert.ok(checks.every(([, hubKey]) => hubKey === 'app-guidance-counsellor-app'));
  });
});

test('Guidance navigation assets cover app pages, setup and role settings only once', async () => {
  await withServer((app) => {
    app.use((req, res) => res.send('<html><head></head><body><main>Page</main></body></html>'));
  }, async (base) => {
    for (const route of ['/apps/guidance-counsellor-app/dashboard', '/apps/guidance-counsellor-app/infrastructure',
      '/apps/guidance-counsellor-app/students/edit', '/apps/guidance-counsellor-app/students/sync-spreadsheets',
      '/student-apps/guidance-counsellor-app', '/hubs/app-guidance-counsellor-app/roles?q=Teacher']) {
      const html = await (await fetch(base + route)).text();
      assert.equal((html.match(/src="\/guidance-navigation.js"/g) || []).length, 1);
      assert.match(html, /href="\/guidance-navigation.css"/);
      assert.ok(html.indexOf('/guidance-navigation.js') < html.indexOf('/global-nav.js'));
    }
    for (const route of ['/profile', '/apps/another-app/dashboard', '/hubs/food-room/roles']) {
      const html = await (await fetch(base + route)).text();
      assert.doesNotMatch(html, /guidance-navigation/);
    }
  });
});

test('login return path only accepts same-site relative paths', () => {
  assert.equal(safeNext('/food-room/index.html?a=1'), '/food-room/index.html?a=1');
  for (const bad of ['//evil.com', 'https://evil.com', '/\\evil.com', 'food-room', '', null]) assert.equal(safeNext(bad), null);
});

test('hosted student app pages receive a centred footer with persisted dates and a reserved viewport', async () => {
  await withServer((app) => {
    app.all('/hosted', (req, res) => {
      res.locals.studentAppFooter = {
        registeredAt: '2024-03-01T00:00:00Z',
        updatedAt: '2026-10-17T00:00:00Z'
      };
      res.send('<html><head><title>App</title></head><body><main>Student app</main></body></html>');
    });
    app.get('/normal', (req, res) => res.send('<html><head></head><body>Other module</body></html>'));
  }, async (base) => {
    for (const method of ['GET', 'POST']) {
      const response = await fetch(`${base}/hosted`, { method });
      const html = await response.text();
      assert.match(html, /<body><div id="whs-student-app-viewport"><main>Student app<\/main><\/div>/);
      assert.match(html, /href="\/student-app-footer.css"/);
      assert.match(html, /This website was made by a Westland High School student\. &copy; 2024\. Last Updated: October 2026/);
      assert.equal((html.match(/<footer id="whs-student-app-footer"/g) || []).length, 1);
      assert.equal(Number(response.headers.get('content-length')), Buffer.byteLength(html));
    }
    const normal = await (await fetch(`${base}/normal`)).text();
    assert.doesNotMatch(normal, /whs-student-app-footer|student-app-footer.css/);
  });
});
