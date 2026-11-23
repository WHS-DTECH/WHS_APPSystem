const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const fs = require('node:fs');
const { createModuleRouter } = require('./app');

test('module denies anonymous/student access and accepts a supplied teacher identity', async () => {
  let user;
  const app = express();
  app.use((req, res, next) => { req.user = user; next(); });
  app.use('/module/', createModuleRouter());
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/module/`;
  try {
    assert.equal((await fetch(url)).status, 401);
    user = { roles: ['Student'] };
    assert.equal((await fetch(url)).status, 403);
    user = { roles: ['Teacher'] };
    const response = await fetch(url);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/html/);
    const html = await response.text();
    assert.match(html, /framework\/whs-logo.png/);
    assert.match(html, /href="#\?section=standards">Setup Assessment<\/a>/);
    assert.match(html, /href="#\?section=audit">Audit Standards<\/a>/);
    assert.match(html, /v=audit-standards-1/);
    const script = fs.readFileSync(require.resolve('./public/assessment-manager'), 'utf8');
    assert.match(script, /1ugLHLfv_VtSraRdqG3pUFCevv7udzLLp/);
    assert.match(script, /\/preview/);
    assert.doesNotMatch(html, /href="#\?section=standards">My Standards<\/a>/);
    assert.match(html, /Last Updated:/);
    assert.ok(!html.includes('name="whs-global-control"'));
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
