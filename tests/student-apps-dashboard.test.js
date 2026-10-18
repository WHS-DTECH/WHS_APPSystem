const test = require('node:test');
const assert = require('node:assert/strict');
const ejs = require('ejs');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const template = path.join(__dirname, '..', 'views', 'student-apps', 'index.ejs');
const app = {
  name: 'Guidance Counsellor App', slug: 'guidance-counsellor-app',
  hosted: true, status: 'active', app_url: null,
  roles_mapped_at: '2026-10-17', login_verified_at: null
};
function render(apps, canImportGithub = false) {
  return ejs.renderFile(template, { title: 'APPs Dashboard', activeRole: 'ADMIN', apps, canImportGithub });
}

test('hosted apps with no external URL have distinct Open app and Set up links', async () => {
  const html = await render([app], true);
  assert.match(html, /<h1>APPs Dashboard<\/h1>/);
  assert.match(html, /href="\/student-apps\/guidance-counsellor-app\/open"/);
  assert.match(html, /href="\/student-apps\/guidance-counsellor-app" aria-label="Set up:/);
  assert.match(html, /Connected automatically/);
  assert.match(html, /GitHub Import \/ Archive/);
  assert.doesNotMatch(html, /Not tested/);
});

test('incomplete apps retain setup but do not advertise launch; verified external apps can open', async () => {
  for (const overrides of [{ status: 'pending' }, { roles_mapped_at: null }, { hosted: false }]) {
    const html = await render([{ ...app, ...overrides }]);
    assert.doesNotMatch(html, /aria-label="Open app:/);
    assert.match(html, /Complete setup to open/);
    assert.match(html, /aria-label="Set up:/);
  }
  const external = await render([{ ...app, hosted: false, login_verified_at: '2026-10-17' }]);
  assert.match(external, /aria-label="Open app:/);
  assert.match(external, /Verified/);
});

test('empty state, import permissions and escaped app descriptions render safely', async () => {
  const empty = await render([]);
  assert.match(empty, /No projects yet/);
  assert.doesNotMatch(empty, /github-import|id="apps-collection"/);
  const html = await render([{ ...app, name: '<script>bad</script>', description: '<img onerror=bad>' }]);
  assert.match(html, /&lt;script&gt;bad&lt;\/script&gt;/);
  assert.match(html, /&lt;img onerror=bad&gt;/);
  assert.doesNotMatch(html, /<img onerror/);
});

test('grid and list controls update layout and accessible pressed states', () => {
  const buttons = ['grid', 'list'].map((view) => ({
    dataset: { appsView: view },
    addEventListener(name, callback) { this.click = callback; },
    setAttribute(name, value) { this[name] = value; }
  }));
  const collection = { dataset: {} };
  const controls = { hidden: true, querySelectorAll: () => buttons };
  const script = fs.readFileSync(path.join(__dirname, '..', 'public', 'student-apps-dashboard.js'), 'utf8');
  vm.runInNewContext(script, {
    document: { getElementById: () => collection, querySelector: () => controls }
  });
  assert.equal(controls.hidden, false);
  buttons[1].click();
  assert.equal(collection.dataset.view, 'list');
  assert.equal(buttons[1]['aria-pressed'], 'true');
  assert.equal(buttons[0]['aria-pressed'], 'false');
  buttons[0].click();
  assert.equal(collection.dataset.view, 'grid');
  assert.equal(buttons[0]['aria-pressed'], 'true');
  vm.runInNewContext(script, {
    document: { getElementById: () => null, querySelector: () => controls }
  });
});
