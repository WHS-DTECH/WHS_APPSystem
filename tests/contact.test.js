const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const { createContactRouter } = require('../src/contact');

async function fixture(t, deliver = async () => ({ ok: true })) {
  let user = { email: 'teacher@westlandhigh.school.nz', roles: ['Teacher'], is_active: true };
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));
  app.use(express.urlencoded({ extended: false }));
  app.use(session({ secret: 'contact-test-only', resave: false, saveUninitialized: false }));
  app.use((req, res, next) => {
    req.user = user;
    res.locals.activeRole = 'Teacher';
    next();
  });
  app.use('/contact', createContactRouter({ deliver }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/contact`;
  const page = await fetch(url);
  const cookie = page.headers.get('set-cookie').split(';')[0];
  const html = await page.text();
  const csrf = html.match(/name="csrf" value="([^"]+)"/)[1];
  return {
    html, setUser(value) { user = value; },
    get: () => fetch(url, { headers: { cookie }, redirect: 'manual' }),
    post: (body = {}) => fetch(url, {
      method: 'POST', redirect: 'manual',
      headers: { cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ csrf, subject: 'Help with Teacher Planner', message: 'Please help.', ...body })
    })
  };
}

test('contact uses the signed-in identity and fixed Web Master recipient through shared email', async (t) => {
  const delivered = [];
  const f = await fixture(t, async (input) => { delivered.push(input); return { ok: true }; });
  assert.match(f.html, /teacher@westlandhigh.school.nz/);
  const response = await f.post({ to: 'attacker@example.test', email: 'forged@example.test', message: '<script>alert(1)</script>' });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), '/contact');
  assert.deepEqual(delivered[0].to, ['tech@westlandhigh.school.nz']);
  assert.equal(delivered[0].replyTo, 'teacher@westlandhigh.school.nz');
  assert.match(delivered[0].subject, /^\[Web Master\] /);
  assert.ok(!delivered[0].html.includes('<script>'));
  assert.match(delivered[0].html, /&lt;script&gt;/);
  assert.match(await (await f.get()).text(), /Your message has been sent/);
  await f.get();
  assert.equal(delivered.length, 1, 'refresh does not resubmit email');
});

test('contact rejects anonymous and inactive users', async (t) => {
  let sent = false;
  const f = await fixture(t, async () => { sent = true; return { ok: true }; });
  f.setUser(null);
  const response = await f.get();
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/auth/google?next=%2Fcontact');
  assert.equal((await f.post()).status, 302);
  f.setUser({ email: 'teacher@example.test', is_active: false });
  assert.equal((await f.get()).status, 403);
  assert.equal(sent, false);
});

test('contact rejects CSRF and malformed fields without sending email', async (t) => {
  let sent = false;
  const f = await fixture(t, async () => { sent = true; return { ok: true }; });
  for (const [body, status] of [
    [{ csrf: 'forged' }, 403],
    [{ subject: 'Header\r\nBcc: evil@example.test' }, 400],
    [{ subject: '' }, 400],
    [{ message: 'a'.repeat(10001) }, 400],
    [{ message: '' }, 400]
  ]) assert.equal((await f.post(body)).status, status);
  assert.equal(sent, false);
});

test('contact explicitly reports unavailable Gmail and retains escaped form values', async (t) => {
  const f = await fixture(t, async () => ({ ok: false, skipped: true }));
  const response = await f.post({ message: '<test>Retry this message</test>' });
  assert.equal(response.status, 503);
  const html = await response.text();
  assert.match(html, /Your message was not sent/);
  assert.match(html, /&lt;test&gt;Retry this message&lt;\/test&gt;/);
  assert.ok(!html.includes('Your message has been sent'));
});

test('contact rate-limits repeated submissions', async (t) => {
  const f = await fixture(t);
  for (let i = 0; i < 5; i++) assert.equal((await f.post()).status, 303);
  const response = await f.post();
  assert.equal(response.status, 429);
  assert.match(await response.text(), /Too many contact attempts/);
});

test('development application links and the module contact footer use the current tab', () => {
  const root = path.join(__dirname, '..');
  const nav = fs.readFileSync(path.join(root, 'public', 'global-nav.js'), 'utf8');
  const section = nav.slice(nav.indexOf("(data.developmentProjects || []).forEach"), nav.indexOf("if (!(data.developmentProjects"));
  assert.ok(!section.includes('_blank'));
  assert.ok(!section.includes('\\u2197'));
  for (const file of ['index.ejs', 'detail.ejs']) {
    const view = fs.readFileSync(path.join(root, 'views', 'module-builder', file), 'utf8');
    assert.match(view, /href="<%= config.appUrl %>">Open (?:development )?app<\/a>/);
  }
});
