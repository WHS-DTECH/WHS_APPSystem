const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const vm = require('node:vm');

for (const section of ['term', 'week', 'year', 'goals', 'standards', 'learning', 'period', 'assessmentSetup', 'moderation', 'reporting']) {
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

test('term workspace places goals before the heading and dates, with a separate full-width calendar and preserved inputs', async () => {
  const source = await fs.readFile(path.join(__dirname, 'public', 'planner.js'), 'utf8');
  const descendants = node => [node, ...node.children.flatMap(descendants)];
  function el(tag, text = '', attrs = {}) {
    const node = { tag, textContent: text, attrs, dataset: {}, children: [], events: {}, value: '', style: {}, scrollHeight: 350,
      append(...items) { this.children.push(...items); }, replaceChildren(...items) { this.children = items; },
      setAttribute(key, value) { this.attrs[key] = value; }, addEventListener(event, callback) { this.events[event] = callback; },
      querySelector(selector) { return descendants(this).find(item => item.tag === selector); },
      querySelectorAll(selector) { return descendants(this).filter(item => item.tag === selector); },
      classList: { add() {} }
    };
    return node;
  }
  const content = el('main'), selected = [], mounts = [];
  const context = { content, el, section: 'term', term: '4', year: 2026,
    fields: { term: [['startDate', 'Term start date', 'date'], ['endDate', 'Term end date', 'date'],
      ['information', 'Start-of-term information'], ['priorities', 'Term priorities'], ['reflection', 'Term reflection']] },
    coverPage: () => el('section', '', { class: 'planner-cover paper-page' }), expandTermArea: area => { area.style.height = area.scrollHeight + 'px'; },
    navigatePlannerSection: target => selected.push(target), refreshSession: async () => {}, request() {}, api: '/api/planner/',
    renderKamarWeek() {}, kamarSunday() {}, kamarToday() {}, kamarWeekDates() {}, kamarEventsForDay() {},
    kamarHourEvents() {}, kamarHourLabel() {}, date() {}, iso() {},
    plannerGoogleCalendar: { mount: (...args) => mounts.push(args) }
  };
  vm.runInNewContext(
    source.slice(source.indexOf('  function inputField('), source.indexOf('  function updateWeekNavigation(')) +
    source.slice(source.indexOf('  function render(data)'), source.indexOf('  async function loadAttendanceSchedule(')), context);
  context.render({ startDate: '2026-10-12', endDate: '2026-12-18', information: 'Synthetic start notes', priorities: 'Synthetic priorities' });
  const spread = content.children[0], panel = spread.children[1], calendar = spread.children[2];
  assert.equal(spread.attrs.class, 'planner-spread term-spread');
  assert.match(panel.attrs.class, /term-start-panel/);
  assert.equal(panel.children[0].attrs['data-planner-navigation'], '');
  assert.equal(panel.children[0].children[0].textContent, 'Goals and reflection');
  assert.equal(panel.children[1].tag, 'h2');
  assert.equal(panel.children[2].querySelector('input').attrs.name, 'startDate');
  assert.equal(panel.children[3].querySelector('input').attrs.name, 'endDate');
  assert.deepEqual(panel.querySelectorAll('textarea').map(item => [item.attrs.name, item.value, item.style.height]),
    [['information', 'Synthetic start notes', '350px'], ['priorities', 'Synthetic priorities', '350px']]);
  assert.equal(calendar.attrs.class, 'paper-page term-calendar-panel');
  assert.equal(mounts[0][0], calendar.children[0]);
  panel.children[0].children[0].events.click();
  assert.deepEqual(selected, ['goals']);
});

for (const section of ['term', 'week']) {
test(section + ' circular term selector stays first, retains four choices and opens the Term Plan with leave guards', async () => {
  const source = await fs.readFile(path.join(__dirname, 'public', 'planner.js'), 'utf8');
  function el(tag, text = '', attrs = {}) {
    return { tag, textContent: text, attrs, children: [], events: {}, value: '', dataset: {},
      append(...items) { this.children.push(...items); }, replaceChildren(...items) { this.children = items; },
      addEventListener(event, handler) { this.events[event] = handler; }
    };
  }
  let permitted = false, loads = 0;
  const context = { el, selectors: el('section'), section, term: '4', termSelectionPending: true,
    week: '2026-11-02', canLeave: () => permitted, load: () => loads++, updateWeekNavigation() {} };
  vm.runInNewContext(source.slice(source.indexOf('  function renderSelectors('), source.indexOf('  function setCalendarEvents(')), context);
  context.renderSelectors();
  const label = context.selectors.children[0].children[0], select = label.children[0];
  assert.equal(label.attrs.class, 'planner-term-control');
  assert.equal(select.attrs.class, 'planner-term-badge');
  assert.deepEqual(select.children.filter(item => item.attrs.value).map(item => item.attrs.value), ['1', '2', '3', '4']);
  assert.equal(select.value, '4');
  select.value = '3'; select.events.change();
  assert.equal(select.value, '4'); assert.equal(context.term, '4'); assert.equal(loads, 0);
  permitted = true; select.value = '3'; select.events.change();
  assert.equal(context.term, '3'); assert.equal(loads, 1);
  assert.equal(context.section, 'term');
  assert.equal(context.termSelectionPending, false);
});
}

test('term Goals navigation preserves existing leave guards and automatic sync orchestration', async () => {
  const source = await fs.readFile(path.join(__dirname, 'public', 'planner.js'), 'utf8');
  let permitted = false, loads = 0, syncs = 0;
  const context = { section: 'term', loaded: true, attendanceSyncRunning: false, canLeave: () => permitted,
    load: async () => loads++, runAttendanceDriveSync: async () => { syncs++; }, console };
  vm.runInNewContext(source.slice(source.indexOf('  function navigatePlannerSection('), source.indexOf('  function renderSelectors(')), context);
  await context.navigatePlannerSection('goals');
  assert.equal(context.section, 'term'); assert.equal(loads, 0);
  permitted = true;
  await context.navigatePlannerSection('goals');
  assert.equal(context.section, 'goals'); assert.equal(loads, 1); assert.equal(syncs, 1);
});
