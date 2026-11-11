const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const express = require('express');
const helmet = require('helmet');
const { pickerConfiguration, pickerPolicy } = require('./googleDrive');
const { createModuleRouter } = require('./app');
const { renderShell } = require('./shell');

const source = fs.readFileSync(require.resolve('./public/google-drive.js'), 'utf8');
const config = { configured: true, clientId: 'drive-client', apiKey: 'restricted-browser-key', appId: '123', scope: 'https://www.googleapis.com/auth/drive.file' };
const flush = () => new Promise(resolve => setImmediate(resolve));
function node(tag = 'div', text = '', attrs = {}) {
  return {
    tag, textContent: text, attrs, children: [], events: {}, value: '', maxLength: 20000,
    isConnected: true, dataset: {},
    append(...children) { for (const child of children) { child.parent = this; this.children.push(child); } },
    before(child) { child.parent = this.parent; this.parent.children.splice(this.parent.children.indexOf(this), 0, child); },
    replaceChildren(...children) { this.children = []; this.append(...children); },
    addEventListener(type, callback) { this.events[type] = callback; },
    dispatchEvent(event) { this.events[event.type]?.(event); if (event.bubbles) this.parent?.dispatchEvent(event); },
    setAttribute(key, value) { this.attrs[key] = value; },
    focus() { this.focused = true; },
    querySelector(selector) {
      for (const child of this.children) {
        if ((selector === 'input' && child.tag === 'input') ||
            (selector === '[name="' + child.attrs.name + '"]' && child.attrs.name)) return child;
        const found = child.querySelector(selector); if (found) return found;
      }
      return null;
    }
  };
}
function fixture({ configured = true, existingLibraries = true } = {}) {
  const host = node(), resources = node('textarea');
  const calls = [], scripts = [], tokenRequests = [];
  let tokenOptions, pickerCallback, builder;
  const google = {
    accounts: { oauth2: { initTokenClient(options) {
      tokenOptions = options;
      return { requestAccessToken(options) { tokenRequests.push(options); } };
    } } },
    picker: {
      Action: { PICKED: 'picked', CANCEL: 'cancel' },
      Feature: { MULTISELECT_ENABLED: 'multi' }, ViewId: { DOCS: 'docs' },
      DocsView: class {
        setLabel(value) { calls.push(['viewLabel', value]); return this; }
        setParent(value) { calls.push(['parent', value]); return this; }
        setIncludeFolders(value) { calls.push(['folders', value]); return this; }
        setSelectFolderEnabled(value) { calls.push(['selectFolders', value]); return this; }
      },
      PickerBuilder: class {
        constructor() { builder = this; }
        setTitle() { return this; }
        setDeveloperKey(value) { calls.push(['key', value]); return this; }
        setAppId(value) { calls.push(['app', value]); return this; }
        setOAuthToken(value) { calls.push(['token', value]); return this; }
        setOrigin(value) { calls.push(['origin', value]); return this; }
        addView() { return this; }
        enableFeature(value) { calls.push(['feature', value]); return this; }
        setCallback(callback) { pickerCallback = callback; return this; }
        build() { return this; }
        setVisible(value) { calls.push(['visible', value]); }
        dispose() { this.disposed = true; }
      }
    }
  };
  const context = {
    URL, Set, Promise, Event, setTimeout, clearTimeout,
    console: { error: () => calls.push(['error']) }, location: { origin: 'https://planner.example.test' },
    document: { createElement: () => ({ remove() { this.removed = true; } }), head: { append: script => scripts.push(script) } }
  };
  if (existingLibraries) {
    context.google = google;
    context.gapi = { load: (_name, options) => options.callback() };
  }
  vm.runInNewContext(source, context);
  const mount = () => context.plannerGoogleDrive.mount(host, {
    el: node, resources, request: async () => configured ? config : { configured: false },
    openSetup: () => calls.push(['setup'])
  });
  return { host, resources, context, calls, scripts, tokenRequests, mount, google,
    get tokenOptions() { return tokenOptions; }, get callback() { return pickerCallback; }, get picker() { return builder; } };
}

test('Drive config contains public identifiers only and rejects partial setup', () => {
  assert.deepEqual(pickerConfiguration({}), { configured: false });
  const env = { GOOGLE_DRIVE_CLIENT_ID: config.clientId, GOOGLE_DRIVE_API_KEY: config.apiKey, GOOGLE_DRIVE_APP_ID: config.appId,
    GOOGLE_CALENDAR_CLIENT_SECRET: 'never-expose', SESSION_SECRET: 'never-expose' };
  assert.deepEqual(pickerConfiguration(env), config);
  for (const invalid of [{ ...env, GOOGLE_DRIVE_API_KEY: '' }, { ...env, GOOGLE_DRIVE_APP_ID: 'project-name' }]) {
    assert.throws(() => pickerConfiguration(invalid), /Set GOOGLE_DRIVE/);
  }
});

test('selected URLs preserve manual text, append multiple files, skip duplicates and enforce the exact storage limit', () => {
  const { appendFiles } = fixture().context.plannerGoogleDrive;
  const first = 'https://docs.google.com/document/d/first/edit';
  const second = 'https://drive.google.com/file/d/second/view?resourcekey=keep';
  const existing = '  https://example.test/resource  \n' + first;
  const result = appendFiles(existing, [{ url: first }, { url: second }, { url: second }]);
  assert.equal(result.value, existing + '\n' + second);
  assert.equal(result.count, 1);
  assert.equal(appendFiles(first + '\n', [{ url: first }]).value, first + '\n');
  const value = 'x'.repeat(20000 - first.length - 1);
  assert.equal(appendFiles(value, [{ url: first }]).value.length, 20000);
  assert.throws(() => appendFiles(value + 'x', [{ url: first }]), /limit/);
  for (const url of ['javascript:alert(1)', 'https://evil.test/file', 'https://docs.google.com.evil.test/file', 'https://user@drive.google.com/file', 'http://drive.google.com/file']) {
    assert.throws(() => appendFiles(existing, [{ url: first }, { url }]), /unsupported/);
  }
  assert.throws(() => appendFiles(existing, [{}]), /valid link/);
  assert.throws(() => appendFiles(existing, []), /no selected files/);
});

test('named resources preserve names, reject duplicate URLs and count names in the storage limit', () => {
  const { appendFiles, resourceLink } = fixture().context.plannerGoogleDrive;
  const url = 'https://docs.google.com/document/d/one/edit';
  const name = '<Lesson> | Drawing\ninstructions';
  const result = appendFiles('', [{ url, name }]);
  assert.equal(result.value, '<Lesson> | Drawing instructions | ' + url);
  assert.equal(resourceLink(result.value).name, '<Lesson> | Drawing instructions');
  assert.equal(resourceLink(result.value).url, url);
  assert.equal(appendFiles(result.value, [{ url, name: 'Duplicate' }]).count, 0);
  assert.equal(appendFiles('', [{ url, name }], result.value.length).value, result.value);
  assert.throws(() => appendFiles('', [{ url, name }], result.value.length - 1), /limit/);
  assert.equal(resourceLink(url).url, url);
});

test('chooser requests only Drive scope on a direct click and dispatches bubbling input for autosave', async () => {
  const f = fixture(); f.mount(); await flush();
  const [button, feedback] = f.host.children;
  assert.equal(button.disabled, false);
  assert.equal(f.tokenRequests.length, 0);
  assert.equal(f.tokenOptions.scope, config.scope);
  assert.equal(f.tokenOptions.include_granted_scopes, false);
  button.events.click();
  assert.equal(f.tokenRequests.length, 1);
  assert.equal(f.tokenRequests[0].prompt, 'select_account');
  f.tokenOptions.callback({ access_token: 'short-lived-token' });
  assert.ok(f.calls.some(([name, value]) => name === 'feature' && value === 'multi'));
  assert.ok(f.calls.some(([name, value]) => name === 'selectFolders' && value === false));
  assert.ok(f.calls.some(([name, value]) => name === 'parent' && value === 'root'));
  assert.ok(f.calls.some(([name, value]) => name === 'viewLabel' && value === 'My Drive'));
  assert.ok(f.calls.some(([name, value]) => name === 'folders' && value === true));
  let input;
  f.resources.addEventListener('input', event => { input = event; });
  f.resources.value = 'https://example.test/typed-while-choosing';
  f.callback({ action: 'picked', docs: [{ url: 'https://drive.google.com/file/d/one/view', name: 'Drawing kit' }, { url: 'https://docs.google.com/presentation/d/two/edit', name: 'Lesson slides' }] });
  assert.equal(f.resources.value, 'https://example.test/typed-while-choosing\nDrawing kit | https://drive.google.com/file/d/one/view\nLesson slides | https://docs.google.com/presentation/d/two/edit');
  assert.equal(input.bubbles, true);
  assert.match(feedback.textContent, /2 file link/);
  assert.equal(button.disabled, false);
  assert.equal(button.focused, true);
  assert.equal(f.picker.disposed, true);
});

test('cancel, denial, blocked popup, malformed selection and stale view never change links', async () => {
  for (const mode of ['cancel', 'denied', 'blocked', 'closed', 'invalid', 'detached', 'oversize']) {
    const f = fixture(); f.mount(); await flush();
    const [button, feedback] = f.host.children;
    const original = mode === 'oversize' ? 'x'.repeat(20000) : 'https://example.test/keep';
    f.resources.value = original;
    button.events.click();
    if (mode === 'denied') f.tokenOptions.callback({ error: 'access_denied' });
    else if (mode === 'blocked' || mode === 'closed') f.tokenOptions.error_callback({ type: mode === 'closed' ? 'popup_closed' : 'popup_failed_to_open' });
    else {
      f.tokenOptions.callback({ access_token: 'temporary' });
      if (mode === 'detached') f.host.isConnected = false;
      f.callback({ action: mode === 'cancel' ? 'cancel' : 'picked',
        docs: [{ url: mode === 'invalid' ? 'https://evil.test' : 'https://drive.google.com/file/d/one/view' }] });
      assert.equal(f.picker.disposed, true);
    }
    assert.equal(f.resources.value, original, mode);
    if (mode !== 'detached') {
      assert.equal(button.disabled, false, mode);
      assert.equal(feedback.attrs.role, ['cancel', 'closed'].includes(mode) ? 'status' : 'alert', mode);
    }
  }
});

test('missing setup and failed external scripts link to setup without blocking manual links', async () => {
  const missing = fixture({ configured: false }); missing.mount(); await flush();
  assert.equal(missing.host.children[0].disabled, false);
  assert.equal(missing.host.children[1].attrs.role, 'alert');
  assert.match(missing.host.children[1].textContent, /still paste/);
  missing.host.children[0].events.click();
  assert.ok(missing.calls.some(([name]) => name === 'setup'));
  const f = fixture({ existingLibraries: false }); f.mount(); await flush();
  assert.equal(f.scripts.length, 2);
  for (const script of f.scripts) script.onerror();
  await flush();
  assert.equal(f.host.children[0].textContent, 'Open Google Drive Setup');
  assert.equal(f.host.children[1].attrs.role, 'alert');
  f.host.children[0].events.click(); await flush();
  assert.equal(f.scripts.length, 2);
  assert.ok(f.calls.some(([name]) => name === 'setup'));
});

test('Drive setup checks status, retries failures and never requests permission', async () => {
  const f = fixture();
  let configured = false;
  f.context.plannerGoogleDrive.mountSetup(f.host, {
    el: node, request: async () => configured ? config : { configured: false }
  });
  await flush();
  const button = f.host.children[2], feedback = f.host.children[3];
  const text = f.host.children.map(child => child.textContent).join(' ');
  assert.doesNotMatch(text, /GOOGLE_DRIVE_|Render|Google Cloud|setup above/);
  assert.equal(feedback.attrs.role, 'alert');
  assert.match(feedback.textContent, /not configured/);
  assert.equal(button.disabled, false);
  configured = true;
  await button.events.click();
  assert.equal(feedback.attrs.role, 'status');
  assert.match(feedback.textContent, /configuration is present/);
  assert.equal(f.tokenRequests.length, 0);
  assert.equal(f.tokenOptions, undefined);
});

test('Drive setup retries library failures on its own tab', async () => {
  const f = fixture({ existingLibraries: false });
  f.context.plannerGoogleDrive.mountSetup(f.host, { el: node, request: async () => config });
  await flush();
  for (const script of f.scripts) script.onerror();
  await flush();
  assert.equal(f.host.children[3].attrs.role, 'alert');
  f.host.children[2].events.click();
  await flush();
  assert.equal(f.scripts.length, 4);
  for (const script of f.scripts.slice(2)) script.onerror();
  await flush();
});

test('setup folder exposes an accessible lazy-loaded Drive tab and keeps school fields in place', () => {
  const planner = fs.readFileSync(require.resolve('./public/planner.js'), 'utf8');
  const save = node(), page = node();
  const mounted = [];
  const context = {
    el: node, year: 2026, setupTab: 0,
    week: '2026-10-26', canManageSchoolSettings: true,
    document: { querySelector: () => save },
    viewFragment: () => '',
    history: { replaceState() {} },
    mountAttendancePage: async () => {},
    plannerGoogleDrive: { mountSetup: host => mounted.push(host) }
  };
  vm.runInNewContext(planner.slice(planner.indexOf('  function setupFolder('), planner.indexOf('  function renderSetup(')), context);
  context.mountHolidayPreferences = () => {};
  const folder = context.setupFolder(page);
  const tabs = folder.children[0].children;
  assert.equal(tabs.length, 6);
  assert.equal(mounted.length, 0);
  assert.equal(tabs[3].textContent, 'Google Drive Setup');
  tabs[3].events.click();
  assert.equal(mounted.length, 1);
  assert.equal(mounted[0], folder.children[4]);
  assert.equal(page.hidden, true);
  assert.equal(save.hidden, true);
  assert.equal(tabs[3].attrs['aria-selected'], 'true');
  assert.equal(tabs[3].attrs['aria-controls'], folder.children[4].id);
  tabs[3].events.keydown({ key: 'Home', preventDefault() {} });
  assert.equal(page.hidden, false);
  assert.equal(save.hidden, false);
  assert.equal(tabs[0].focused, true);
  tabs[0].events.keydown({ key: 'End', preventDefault() {} });
  assert.equal(mounted.length, 1);
  assert.equal(tabs[5].focused, true);
  assert.equal(tabs[5].textContent, 'Two-Week Attendance');
  assert.equal(tabs[4].textContent, 'Public Holidays Setup');
  assert.doesNotMatch(planner, /plannerDutyRoster\.mountSetup/);
  context.setupTab = 3;
  context.setupFolder(node());
  assert.equal(mounted.length, 2);
});

test('moderation setup saves privately to moderation main with revision checks, not school settings', async () => {
  const planner = fs.readFileSync(require.resolve('./public/planner.js'), 'utf8');
  const host = node(), calls = [];
  host.isConnected = true;
  host.querySelectorAll = () => [{ getAttribute: () => 'folderId', value: 'new_folder_123' }, { getAttribute: () => 'folderName', value: 'Private moderation' }];
  let mounted, fail = false;
  const context = { el: node, year: 2026, api: '/api/planner/', csrf: 'test-csrf',
    refreshSession: async () => {}, console,
    request: async (path, options) => {
      calls.push([path, options]);
      if (fail) throw new Error('Revision conflict');
      return options ? { revision: 3 } : { revision: 2, content: { folderId: 'old_folder_123', title: 'Keep existing data' } };
    },
    plannerModeration: { mount: (target, options) => { assert.equal(target, host); mounted = options; } }
  };
  vm.runInNewContext(planner.slice(planner.indexOf('  function mountModerationSetup('), planner.indexOf('  function mountHolidayPreferences(')), context);
  context.mountModerationSetup(host);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(mounted.setupOnly, true);
  assert.equal(await mounted.saveNow(), true);
  assert.equal(calls.at(-1)[0], '/api/planner/2026/moderation/main');
  const body = JSON.parse(calls.at(-1)[1].body);
  assert.equal(body.revision, 2);
  assert.equal(body.content.folderId, 'new_folder_123');
  assert.equal(body.content.title, 'Keep existing data');
  assert.equal(calls.at(-1)[1].headers['x-planner-csrf'], 'test-csrf');
  await mounted.saveNow();
  assert.equal(JSON.parse(calls.at(-1)[1].body).revision, 3);
  fail = true;
  await assert.rejects(mounted.saveNow(), /Revision conflict/);
});
test('shared renderer mounts Drive on all 25 weekly periods and selection refreshes links and autosave', () => {
  const planner = fs.readFileSync(require.resolve('./public/planner.js'), 'utf8');
  const shell = renderShell({ baseUrl: '/', coreUrl: '', standalone: false });
  assert.ok(shell.indexOf('google-drive.js') < shell.indexOf('framework/planner.js'));
  const context = {
    section: 'period', el: node, Intl, URL, mountPlanChooser() {}, date: value => new Date(value + 'T00:00:00Z'),
    fields: { period: [['title', 'Title', 'text'], ['reflection', 'Reflection'], ['resources', 'Resource links']] },
    slots: Array.from({ length: 5 }, (_, i) => ['p' + (i + 1), 'Period ' + (i + 1), 'guide']),
    inputField(name, label, value, type) {
      const wrapper = node(), field = node(type ? 'input' : 'textarea', '', { name });
      field.value = value || ''; wrapper.append(field); return wrapper;
    },
    plannerGoogleDrive: { resourceLink: fixture().context.plannerGoogleDrive.resourceLink,
      mount(host, options) { mounted.push({ host, ...options }); } }
  };
  const mounted = [];
  vm.runInNewContext(planner.slice(planner.indexOf('  function renderPeriod('), planner.indexOf('  function weeklyTable(')), context);
  for (let day = 19; day <= 23; day++) for (let period = 1; period <= 5; period++) {
    context.content = node();
    context.periodDate = '2026-10-' + day; context.periodSlot = 'p' + period;
    context.renderPeriod({ reflection: 'Keep period reflection', resources: 'https://example.test/manual' });
    const reflection = context.content.querySelector('[name="reflection"]');
    assert.equal(reflection.tag, 'input');
    assert.equal(reflection.attrs.type, 'hidden');
    assert.equal(reflection.value, 'Keep period reflection');
    const { resources, host } = mounted.at(-1);
    assert.equal(resources.tag, 'textarea');
    assert.equal(host.parent, resources.parent);
    assert.equal(resources.hidden, true);
    const edit = resources.parent.children.find(child => child.textContent === 'Edit resource links');
    assert.equal(edit.attrs['aria-expanded'], 'false');
    const original = resources.value;
    edit.events.click();
    assert.equal(resources.hidden, false);
    assert.equal(resources.focused, true);
    assert.equal(edit.attrs['aria-expanded'], 'true');
    edit.events.click();
    assert.equal(resources.hidden, true);
    assert.equal(resources.value, original);
    let dirty = false;
    context.content.addEventListener('input', () => { dirty = true; });
    resources.value += '\nDrawing kit | https://drive.google.com/file/d/one/view';
    resources.dispatchEvent(new Event('input', { bubbles: true }));
    assert.equal(dirty, true);
    const links = context.content.children[0].children.at(-1);
    assert.equal(links.children.length, 2);
    assert.equal(links.children[0].children[0].textContent, 'Resource 1');
    assert.equal(links.children[1].children[0].attrs.href, 'https://drive.google.com/file/d/one/view');
    assert.equal(links.children[1].children[0].textContent, 'Drawing kit');
    context.content = node();
    context.renderPeriod({ resources: resources.value });
    const reopened = context.content.children[0].children.at(-1);
    assert.equal(reopened.children[1].children[0].textContent, 'Drawing kit');
    assert.equal(mounted.at(-1).resources.hidden, true);
  }
  assert.equal(mounted.length, 50);
  let loads = 0;
  context.section = 'period';
  context.setupTab = 0;
  context.load = () => { loads++; };
  context.canLeave = () => false;
  mounted[0].openSetup();
  assert.equal(context.section, 'period');
  assert.equal(loads, 0);
  context.canLeave = () => true;
  mounted[0].openSetup();
  assert.equal(context.section, 'setup');
  assert.equal(context.setupTab, 3);
  assert.equal(loads, 1);
  context.section = 'activity';
  context.fields.activity = [['title', 'Activity title', 'text'], ['lessonPlans', 'Lesson plans'], ['reflection', 'Reflection'], ['resources', 'Resource links']];
  context.content = node();
  context.renderPeriod({ title: 'SketchUp', lessonPlans: 'Draw a cube', reflection: 'Keep reflection', resources: 'https://example.test/lesson' });
  assert.equal(context.content.children[0].children[1].textContent, 'Activity details');
  assert.equal(mounted.at(-1).resources.value, 'https://example.test/lesson');
  for (const [name, value] of [['lessonPlans', 'Draw a cube'], ['reflection', 'Keep reflection']]) {
    const preserved = context.content.querySelector('[name="' + name + '"]');
    assert.equal(preserved.tag, 'input');
    assert.equal(preserved.attrs.type, 'hidden');
    assert.equal(preserved.value, value);
  }
  const back = context.content.children[0].children[0];
  assert.equal(back.textContent, 'Back to Period Planner');
  context.busy = false; context.dirty = true;
  context.saveEntry = async () => {};
  return back.events.click().then(async () => {
    assert.equal(context.section, 'activity', 'failed saves keep activity details open');
    context.saveEntry = async () => { context.dirty = false; };
    await back.events.click();
    assert.equal(context.section, 'period');
  });
});

test('Drive endpoint inherits teacher authentication and sends no-store; standalone CSP permits only required Google integration', async t => {
  const app = express();
  app.use(helmet(pickerPolicy(['https://lh3.googleusercontent.com'])));
  app.use((req, _res, next) => {
    if (req.get('x-test-user')) req.user = { id: 'owner', roles: ['Teacher'] };
    req.session = {}; next();
  });
  app.use(createModuleRouter({ query: async () => ({ rows: [] }) }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = 'http://127.0.0.1:' + server.address().port + '/api/planner/google-drive/config';
  assert.equal((await fetch(url)).status, 401);
  const response = await fetch(url, { headers: { 'x-test-user': 'teacher' } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), pickerConfiguration());
  const csp = response.headers.get('content-security-policy');
  assert.match(csp, /script-src 'self' https:\/\/apis.google.com https:\/\/accounts.google.com/);
  assert.match(csp, /frame-src https:\/\/docs.google.com https:\/\/accounts.google.com/);
  assert.match(csp, /script-src-attr 'none'/);
  assert.equal(response.headers.get('cross-origin-opener-policy'), 'same-origin-allow-popups');
  const page = await fetch(url.replace('/api/planner/google-drive/config', '/'), { headers: { 'x-test-user': 'teacher' } });
  assert.equal(page.headers.get('referrer-policy'), 'strict-origin');
});
