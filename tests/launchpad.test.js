const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'launchpad.html'), 'utf8');

test('standalone Launchpad links to the six agreed services using absolute HTTPS addresses', () => {
  const cards = [...html.matchAll(/<a class="app" href="([^"]+)">([\s\S]*?)<\/a>/g)];
  assert.equal(cards.length, 6);
  const expected = new Map([
    ['WHS Learning Sites', 'https://whs-appsystem.onrender.com/learning-sites'],
    ['Hub Dashboard', 'https://whs-appsystem.onrender.com/technology-hub/'],
    ['Teacher Planner', 'https://teacher-planner-development.onrender.com'],
    ['Guidance Counsellor App', 'https://whs-appsystem.onrender.com/apps/guidance-counsellor-app/'],
    ['International App', 'https://whs-international.onrender.com'],
    ['Bus Controller App', 'https://whs-buscontroller.onrender.com']
  ]);
  for (const [, url, content] of cards) {
    const title = /<h3>([^<]+)<\/h3>/.exec(content)[1];
    assert.equal(url, expected.get(title));
    assert.equal(new URL(url).protocol, 'https:');
    expected.delete(title);
  }
  assert.equal(expected.size, 0);
});

test('Launchpad is portable and accessible without scripts or external assets', () => {
  assert.match(html, /<html lang="en-NZ">/);
  assert.match(html, /name="viewport"/);
  assert.match(html, /class="skip-link" href="#services"/);
  assert.match(html, /<main id="services"/);
  assert.match(html, /:focus-visible/);
  assert.match(html, /prefers-reduced-motion/);
  assert.doesNotMatch(html, /<script\b|<link\b|<img\b|@import|url\s*\(/i);
  assert.doesNotMatch(html, /target="_blank"/);
  assert.equal([...html.matchAll(/<h1\b/g)].length, 1);
});

test('Launchpad is served before session and shared navigation middleware', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'src', 'server.js'), 'utf8');
  const route = server.indexOf("app.get('/launchpad.html'");
  assert.ok(route > server.indexOf('app.use(helmet('));
  assert.ok(route < server.indexOf('app.use(session('));
  assert.ok(route < server.indexOf('app.use(injectGlobalNav)'));
});
