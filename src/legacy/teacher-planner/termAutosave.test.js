const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const vm = require('node:vm');

for (const section of ['term', 'week', 'year', 'goals', 'standards', 'learning', 'period', 'assessmentSetup', 'moderation']) {
test(section + ' autosave debounces edits, serialises in-flight typing and pauses on errors', async () => {
  const source = await fs.readFile(path.join(__dirname, 'public', 'planner.js'), 'utf8');
  const saving = source.slice(source.indexOf('  function expandTermArea('), source.indexOf("  document.querySelectorAll('[data-section]')"));
  const navigation = source.slice(source.indexOf('  function updateWeekNavigation('), source.indexOf('  function renderSelectors('));
  const weekControls = [{}, {}, {}];
  const timers = new Map(), events = {}, documentEvents = {}, requests = [], notices = [];
  let nextTimer = 0, resolveRequest, fail = false;
  const draftField = section === 'period' ? 'title' : 'information';
  const values = new Map([[draftField, 'First draft'], ['priorities', 'My priorities']]);
  if (section === 'term') { values.set('startDate', '2026-10-12'); values.set('endDate', '2026-12-18'); }
  values.getAll = name => name === 'types' ? ['Workshop', 'Reading'] : [];
  if (section === 'week') values.set('p1:0', 'Weekly lesson notes');
  const form = { reportValidity: () => true, addEventListener: (name, handler) => { events[name] = handler; } };
  const context = {
    form, section, year: 2026, dirty: false, busy: false, loaded: true, revision: 3, csrf: 'fixture',
    autosaveTimer: undefined, autosavePaused: false, editVersion: 0, savedTermContent: { reflection: 'Keep this previous reflection' },
    saveInFlight: undefined,
    save: {}, content: { querySelectorAll: () => [], querySelector: () => null },
    selectors: { querySelectorAll: () => weekControls, setAttribute() {} },
    document: { addEventListener: (name, handler) => { documentEvents[name] = handler; } }, window: { addEventListener() {} },
    setTimeout: (fn, delay) => { const id = ++nextTimer; timers.set(id, { fn, delay }); return id; },
    clearTimeout: id => timers.delete(id), FormData: class { constructor() { return values; } },
    address: () => '/api/planner/2026/term/4', refreshSession: async () => {},
    notice: (text, error) => notices.push({ text, error }), console: { error() {} },
    request: async (url, options) => {
      requests.push({ url, data: JSON.parse(options.body) });
      if (fail) throw new Error('School sign-in expired');
      return new Promise(resolve => { resolveRequest = resolve; });
    }
  };
  vm.runInNewContext(navigation + saving, context);
  const change = () => events.input({ target: { closest: () => null } });
  const flush = async () => { await new Promise(resolve => setImmediate(resolve)); };
  const fireTimer = () => { const [id, timer] = [...timers].at(-1); timers.delete(id); timer.fn(); };
  change(); values.set(draftField, 'Latest draft'); change();
  assert.equal(timers.size, 1);
  assert.equal([...timers.values()][0].delay, 800);
  fireTimer(); await flush();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].data.content[draftField], 'Latest draft');
  if (section === 'term') assert.equal(requests[0].data.content.reflection, 'Keep this previous reflection');
  if (section === 'week') assert.equal(requests[0].data.content.cells['p1:0'], 'Weekly lesson notes');
  if (section === 'learning') assert.deepEqual(requests[0].data.content.types, ['Workshop', 'Reading']);
  assert.equal(context.busy, true);
  if (section === 'week') assert.ok(weekControls.every(control => control.disabled));
  assert.equal(typeof context.saveInFlight.then, 'function');
  values.set(draftField, 'Typed while autosave runs'); change();
  fireTimer(); await flush();
  assert.equal(requests.length, 1);
  resolveRequest({ revision: 4, updated_at: '2026-10-18T07:00:00Z' }); await flush();
  assert.equal(context.dirty, true);
  assert.equal(context.revision, 4);
  assert.equal(timers.size, 1);
  fireTimer(); await flush();
  assert.equal(requests[1].data.revision, 4);
  assert.equal(requests[1].data.content[draftField], 'Typed while autosave runs');
  resolveRequest({ revision: 5, updated_at: '2026-10-18T07:00:01Z' }); await flush();
  assert.equal(context.dirty, false);
  assert.equal(context.saveInFlight, undefined);
  assert.ok(notices.at(-1).text.startsWith('Autosaved '));
  assert.equal(context.save.disabled, true);
  if (section === 'week') assert.ok(weekControls.every(control => !control.disabled));
  fail = true; values.set('priorities', 'Unsaved during timeout'); change();
  fireTimer(); await flush();
  assert.equal(context.dirty, true);
  assert.equal(context.autosavePaused, true);
  if (section === 'week') assert.ok(weekControls.every(control => !control.disabled));
  assert.equal(context.revision, 5);
  assert.ok(notices.at(-1).text.includes('NOT saved'));
  assert.equal(notices.at(-1).error, true);
  change();
  assert.equal(timers.size, 0);
  assert.ok(notices.at(-1).text.includes('NOT saved'));
  fail = false;
  events.submit({ preventDefault() {} }); await flush();
  resolveRequest({ revision: 6, updated_at: '2026-10-18T07:00:02Z' }); await flush();
  assert.equal(context.dirty, false);
  assert.equal(context.autosavePaused, false);
  assert.equal(context.savedTermContent.reflection, 'Keep this previous reflection');
  form.reportValidity = () => false;
  change(); fireTimer(); await flush();
  assert.equal(context.autosavePaused, true);
  assert.ok(notices.at(-1).text.includes('Check the highlighted fields'));
  assert.equal(context.dirty, true);
  context.autosavePaused = false; form.reportValidity = () => true;
  events.focusout({ target: { closest: () => null, matches: () => true } });
  assert.equal([...timers.values()][0].delay, 0, 'leaving any private field flushes pending edits');
  context.document.visibilityState = 'hidden'; documentEvents.visibilitychange();
  assert.equal(timers.size, 1);
  assert.equal([...timers.values()][0].delay, 0, 'hiding tab flushes pending edits');
  context.refreshSession = async () => { throw new Error('A different school account is signed in.'); };
  const requestCount = requests.length;
  fireTimer(); await flush();
  assert.equal(requests.length, requestCount, 'owner changes block writes on every page');
  assert.equal(context.dirty, true);
  assert.equal(context.autosavePaused, true);
  assert.match(notices.at(-1).text, /different school account/);
  const area = { style: {}, scrollHeight: 700 };
  context.expandTermArea(area);
  assert.equal(area.style.height, '700px');
});
}

test('shared Setup and external integration controls never trigger private autosave', async () => {
  const source = await fs.readFile(path.join(__dirname, 'public', 'planner.js'), 'utf8');
  const saving = source.slice(source.indexOf('  function expandTermArea('), source.indexOf("  document.querySelectorAll('[data-section]')"));
  const events = {}, timers = [];
  const context = {
    section: 'setup', dirty: false, editVersion: 0, busy: false, loaded: true, autosavePaused: false,
    autosaveTimer: undefined, save: {}, notice() {}, clearTimeout() {}, setTimeout: fn => timers.push(fn),
    form: { addEventListener: (name, handler) => { events[name] = handler; } },
    document: { addEventListener() {} }, window: { addEventListener() {} }
  };
  vm.runInNewContext(saving, context);
  events.input({ target: { closest: () => null } });
  assert.equal(context.dirty, true);
  assert.equal(timers.length, 0, 'shared Setup remains manual');
  context.section = 'week'; context.dirty = false; context.editVersion = 0;
  events.input({ target: { closest: () => ({}) } });
  assert.equal(context.dirty, false, 'Tasks, Calendar and timetable controls retain independent saves');
  assert.equal(context.editVersion, 0);
  assert.equal(timers.length, 0);
  context.section = 'cover';
  assert.equal(context.autosaves(), false);
});

test('term rendering hides reflection without removing its supported saved field, and expands both remaining boxes', async () => {
  const source = await fs.readFile(path.join(__dirname, 'public', 'planner.js'), 'utf8');
  const render = source.slice(source.indexOf('  function render(data)'), source.indexOf('  async function load()'));
  assert.match(render, /section === 'term' && name === 'reflection'\) continue/);
  assert.match(render, /grid\.querySelectorAll\('textarea'\)/);
  assert.match(render, /area\.addEventListener\('input', \(\) => expandTermArea\(area\)\)/);
  const css = await fs.readFile(path.join(__dirname, 'public', 'planner.css'), 'utf8');
  assert.match(css, /\.term-spread \.term-auto-expand \{ overflow: hidden; resize: none; \}/);
});
