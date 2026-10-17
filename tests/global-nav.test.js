const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { injectGlobalNav, navData, safeNext } = require('../src/globalNav');

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
      if (req.query.in) req.user = { display_name: 'Vanessa', email: 'v@x.nz' };
      next();
    });
    app.get('/nav-data', navData(query));
  }, async (base) => {
    const anon = await (await fetch(`${base}/nav-data`)).json();
    assert.equal(anon.signedIn, false);
    assert.deepEqual(anon.modules, []);
    const user = await (await fetch(`${base}/nav-data?in=1`)).json();
    assert.equal(user.name, 'Vanessa');
    assert.deepEqual(user.modules, [{ name: 'Food Room Hub', path: '/food-room' }]);
  });
});

test('login return path only accepts same-site relative paths', () => {
  assert.equal(safeNext('/food-room/index.html?a=1'), '/food-room/index.html?a=1');
  for (const bad of ['//evil.com', 'https://evil.com', '/\\evil.com', 'food-room', '', null]) assert.equal(safeNext(bad), null);
});
