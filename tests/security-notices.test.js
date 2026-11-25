const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const express = require('express');
const session = require('express-session');
const { createSecurityNoticesRouter, validateNotice } = require('../src/securityNotices');

const notice = { title: 'Example', reference: 'CVE-example', receivedOn: '2026-11-26', severity: 'high',
  status: 'verification-required', notice: 'Advisory text', remediation: '', verification: '', sourceUrl: 'https://example.test/advisory' };

test('security notice validation requires evidence to close and safe source URLs', () => {
  assert.equal(validateNotice(notice).status, 'verification-required');
  assert.throws(() => validateNotice({ ...notice, status: 'resolved' }), /verification evidence/);
  assert.throws(() => validateNotice({ ...notice, status: 'not-affected' }), /verification evidence/);
  assert.equal(validateNotice({ ...notice, status: 'resolved', verification: 'Verified runtime' }).status, 'resolved');
  for (const sourceUrl of ['javascript:alert(1)', 'https://user:pass@example.test', 'http://example.test']) {
    assert.throws(() => validateNotice({ ...notice, sourceUrl }), /HTTPS/);
  }
  assert.throws(() => validateNotice({ ...notice, receivedOn: '2026-02-29' }), /valid received date/);
});

test('admin notice forms enforce authorization, CSRF, conflict checks and escaped content', async () => {
  const calls = [];
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));
  app.use(express.urlencoded({ extended: false }));
  app.use(session({ secret: 'test-secret', resave: false, saveUninitialized: false }));
  app.use((req, res, next) => {
    const role = req.get('x-test-role');
    req.isAuthenticated = () => Boolean(role);
    req.user = role ? { email: 'admin@example.test', display_name: 'Admin', roles: [role] } : null;
    res.locals.currentUser = req.user; res.locals.isAdmin = role === 'ADMIN'; res.locals.activeRole = role;
    next();
  });
  app.use('/admin/security-notices', createSecurityNoticesRouter({ dbQuery: async (sql, params) => {
    calls.push({ sql, params });
    if (sql.startsWith('SELECT')) return { rows: [{ id: 1, version: 1, details: { ...notice, title: '<script>bad</script>' },
      history: [], updated_at: new Date('2026-11-26T00:00:00Z'), updated_by: 'system' }] };
    if (sql.startsWith('UPDATE')) return { rows: [] };
    return { rows: [] };
  } }));
  const server = await new Promise(resolve => { const s = app.listen(0, () => resolve(s)); });
  try {
    const base = `http://127.0.0.1:${server.address().port}/admin/security-notices`;
    assert.equal((await fetch(base, { redirect: 'manual' })).status, 302);
    assert.equal((await fetch(base, { headers: { 'x-test-role': 'TEACHER' }, redirect: 'manual' })).status, 403);
    assert.equal((await fetch(base + '/render-notice', { redirect: 'manual' })).status, 302);
    assert.equal((await fetch(base + '/render-notice', { headers: { 'x-test-role': 'TEACHER' }, redirect: 'manual' })).status, 403);
    const get = await fetch(base, { headers: { 'x-test-role': 'ADMIN' } });
    assert.equal(get.status, 200);
    assert.match(get.headers.get('cache-control'), /no-store/);
    const html = await get.text(), cookie = get.headers.get('set-cookie').split(';')[0];
    assert.match(html, /&lt;script&gt;bad&lt;\/script&gt;/);
    assert.doesNotMatch(html, /<script>bad<\/script>/);
    const csrf = html.match(/name="csrf" value="([^"]+)"/)[1];
    const image = await fetch(base + '/render-notice', { headers: { cookie, 'x-test-role': 'ADMIN' } });
    assert.equal(image.status, 200);
    assert.match(image.headers.get('content-type'), /image\/png/);
    assert.match(image.headers.get('cache-control'), /no-store/);
    const post = (body, route = '') => fetch(base + route, { method: 'POST', redirect: 'manual',
      headers: { cookie, 'x-test-role': 'ADMIN', 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body) });
    assert.equal((await post({ ...notice, csrf: 'wrong' })).status, 403);
    assert.equal((await post({ ...notice, csrf, status: 'resolved' })).status, 400);
    assert.equal((await post({ ...notice, csrf })).status, 302);
    assert.equal((await post({ ...notice, csrf, version: '1' }, '/1')).status, 409);
    const update = calls.find(call => call.sql.startsWith('UPDATE'));
    assert.match(update.sql, /WHERE id = \$3 AND version = \$4/);
    assert.match(update.sql, /history = history/);
    assert.equal(update.params[1], 'admin@example.test');
  } finally { await new Promise(resolve => server.close(resolve)); }
});
