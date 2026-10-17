const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { injectGlobalNav, navData } = require('../src/globalNav');

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
