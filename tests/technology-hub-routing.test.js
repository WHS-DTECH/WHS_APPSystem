const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { publicRouter } = require('../src/modules/technologyHub');

test('HUB Dashboard Digital Technologies card opens DTECH and old authorised links redirect there', async () => {
  const app = express();
  app.use((req, res, next) => {
    if (req.headers['x-fixture-admin']) req.user = { roles: ['ADMIN'] };
    next();
  });
  app.use('/technology-hub', publicRouter);
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const base = `http://127.0.0.1:${server.address().port}/technology-hub`;
  try {
    for (const page of ['/', '/index.html']) {
      const response = await fetch(`${base}${page}`);
      assert.equal(response.status, 200);
      const html = await response.text();
      assert.match(html, /class="discipline-card digital-technologies" href="\/dtech-hub\/"/);
      assert.ok(!html.includes('href="digital-technologies.html"'));
    }
    const legacy = await fetch(`${base}/digital-technologies.html`, {
      redirect: 'manual', headers: { 'x-fixture-admin': 'true' }
    });
    assert.equal(legacy.status, 302);
    assert.equal(legacy.headers.get('location'), '/dtech-hub/');
    const anonymous = await fetch(`${base}/digital-technologies.html`, { redirect: 'manual' });
    assert.equal(anonymous.headers.get('location'), '/');
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
