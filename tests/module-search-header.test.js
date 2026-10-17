const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function node(tag, attrs = {}, text = '') {
  return {
    tag, attrs, textContent: text, children: [], listeners: {},
    appendChild(child) { this.children.push(child); },
    replaceChildren() { this.children = []; },
    setAttribute(name, value) { this.attrs[name] = value; },
    removeAttribute(name) { delete this.attrs[name]; },
    addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); },
    contains(child) { return child === this || this.children.some((entry) => entry.contains(child)); },
    focus() { this.focused = true; },
    emit(name, event = {}) { (this.listeners[name] || []).forEach((fn) => fn({ preventDefault() {}, ...event })); },
    set innerHTML(_value) { throw new Error('Search must not interpret result content as HTML'); }
  };
}

function header(fetch) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'global-nav.js'), 'utf8');
  const start = source.indexOf('  function buildSearch(');
  const end = source.indexOf('  // Any remaining hub', start);
  assert.ok(start > 0 && end > start);
  const build = new Function('el', 'document', 'fetch', 'location', 'console',
    `return ${source.slice(start, end)}`)(node, node('document'), fetch,
    { pathname: '/dtech-hub/class-training/home', origin: 'https://school.example.test' }, { error() {} });
  const root = node('header');
  build(root, { key: 'training', label: 'Class Training' });
  const [form, panel] = root.children[0].children;
  const [input, submit] = form.children;
  const [, close, status, list] = panel.children;
  return { root, form, input, submit, panel, close, status, list };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));
const response = (results, ok = true) => ({
  ok, headers: new Headers({ 'Content-Type': 'application/json' }),
  json: async () => ok ? { results, truncated: false } : { error: 'Access denied by current role.' }
});
const result = { title: '<img src=x onerror=alert(1)>', kind: 'Lesson', description: '<script>not HTML</script>',
  url: '/dtech-hub/class-training/courses/lessons/1' };

test('shared header submits only the current module, renders text safely, and closes on Escape', async () => {
  const ui = header(async (url, options) => {
    const target = new URL(url, 'https://school.example.test');
    assert.equal(target.pathname, '/module-search');
    assert.equal(target.searchParams.get('path'), '/dtech-hub/class-training/home');
    assert.equal(target.searchParams.get('q'), 'original');
    assert.equal(options.credentials, 'same-origin');
    assert.equal(options.cache, 'no-store');
    return response([result]);
  });
  assert.equal(ui.input.attrs['aria-label'], 'Search Class Training');
  assert.equal(ui.panel.hidden, true);
  ui.input.value = ' original ';
  ui.form.emit('submit');
  assert.equal(ui.submit.disabled, true);
  await tick();
  assert.equal(ui.panel.hidden, false);
  assert.equal(ui.input.attrs['aria-expanded'], 'true');
  assert.equal(ui.list.children[0].children[0].children[0].textContent, result.title);
  assert.equal(ui.status.textContent, '1 result(s) in Class Training.');
  assert.equal(ui.submit.disabled, false);
  ui.root.emit('keydown', { key: 'Escape' });
  assert.equal(ui.panel.hidden, true);
  assert.equal(ui.input.focused, true);
  assert.equal(ui.input.attrs['aria-expanded'], 'false');
});

test('stale requests are aborted and cannot overwrite newer results; errors are not no-match states', async () => {
  let resolveFirst, firstSignal;
  let calls = 0;
  const ui = header(async (_url, options) => {
    calls += 1;
    if (calls === 1) {
      firstSignal = options.signal;
      return new Promise((resolve) => { resolveFirst = resolve; });
    }
    return calls === 2 ? response([]) : response([], false);
  });
  ui.input.value = 'first';
  ui.form.emit('submit');
  ui.input.value = 'second';
  ui.input.emit('input');
  assert.equal(firstSignal.aborted, true);
  ui.form.emit('submit');
  await tick();
  assert.match(ui.status.textContent, /No matching results/);
  resolveFirst(response([result]));
  await tick();
  assert.equal(ui.list.children.length, 0);
  assert.match(ui.status.textContent, /No matching results/);
  ui.form.emit('submit');
  await tick();
  assert.equal(ui.status.attrs.role, 'alert');
  assert.equal(ui.status.textContent, 'Access denied by current role.');
  assert.equal(ui.submit.disabled, false);
});

test('shared header rejects off-site result URLs instead of rendering unsafe links', async () => {
  const ui = header(async () => response([{ ...result, url: '//external.example.test/private' }]));
  ui.input.value = 'original';
  ui.form.emit('submit');
  await tick();
  assert.equal(ui.list.children.length, 0);
  assert.equal(ui.status.attrs.role, 'alert');
  assert.match(ui.status.textContent, /invalid result link/);
});
