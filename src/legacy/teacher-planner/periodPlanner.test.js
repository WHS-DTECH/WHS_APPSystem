const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { DOMParser: XmlParser } = require('@xmldom/xmldom');
class ClipboardParser {
  parseFromString(html) {
    const doc = new XmlParser().parseFromString('<html><body>' + html + '</body></html>', 'text/html');
    return { body: doc.getElementsByTagName('body')[0] };
  }
}
const source = fs.readFileSync(require.resolve('./public/planner.js'), 'utf8');

const flush = () => new Promise(resolve => setImmediate(resolve));
test('period priorities add and continue bullets without replacing saved text', () => {
  const context = { Event };
  vm.runInNewContext(source.slice(source.indexOf('  function bulletPriorities('), source.indexOf('  function renderPeriod(')), context);
  const input = {
    value: '', maxLength: 20000, selectionStart: 0, selectionEnd: 0, events: {}, inputs: [],
    addEventListener(type, handler) { this.events[type] = handler; },
    dispatchEvent(event) { this.inputs.push(event); },
    setRangeText(text, start, end) {
      this.value = this.value.slice(0, start) + text + this.value.slice(end);
      this.selectionStart = this.selectionEnd = start + text.length;
    }
  };
  context.bulletPriorities(input);
  input.events.focus();
  assert.equal(input.value, '\u2022 ');
  assert.equal(input.inputs[0].bubbles, true);
  input.value += 'First intention';
  input.selectionStart = input.selectionEnd = input.value.length;
  const enter = (extra = {}) => {
    let prevented = false;
    input.events.keydown({ key: 'Enter', preventDefault() { prevented = true; }, ...extra });
    return prevented;
  };
  assert.equal(enter(), true);
  assert.equal(input.value, '\u2022 First intention\n\u2022 ');
  enter();
  assert.equal(input.value, '\u2022 First intention\n');
  input.value = 'Previously saved text';
  input.events.focus();
  assert.equal(input.value, 'Previously saved text');
  input.selectionStart = input.selectionEnd = input.value.length;
  assert.equal(enter({ shiftKey: true }), false);
  assert.equal(enter({ isComposing: true }), false);
  enter();
  assert.equal(input.value, 'Previously saved text\n\u2022 ');
  input.value = 'abcdef';
  input.selectionStart = 1; input.selectionEnd = 4;
  enter();
  assert.equal(input.value, 'a\n\u2022 ef');
  input.maxLength = input.value.length;
  input.selectionStart = input.selectionEnd = input.value.length;
  const before = input.value;
  enter();
  assert.equal(input.value, before);
});
function node(tag = 'div', text = '', attrs = {}) {
  return {
    tag, textContent: text, attrs, children: [], events: {}, dataset: {}, isConnected: true,
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; },
    before(...children) { this.beforeNodes = [...(this.beforeNodes || []), ...children]; },
    addEventListener(type, handler) { this.events[type] = handler; },
    setAttribute(key, value) { this.attrs[key] = value; },
    removeAttribute(key) { delete this.attrs[key]; },
    getAttribute(key) { return this.attrs[key]; },
    querySelectorAll() { return []; }
  };
}
test('activity instructions format saved lines as bullets without duplicating markers or changing blank lines', () => {
  const notices = [], field = node();
  const input = {
    value: 'TypingTest.com - AKA Typing Kit\nMinecraft\n\n\u2022 Kits:',
    maxLength: 20000, events: {}, inputs: [],
    addEventListener(type, handler) { this.events[type] = handler; },
    dispatchEvent(event) { this.inputs.push(event); }, focus() { this.focused = true; }
  };
  field.querySelector = () => input;
  const context = { Event, URL, DOMParser: ClipboardParser, el: node, notice: message => notices.push(message) };
  vm.runInNewContext(source.slice(source.indexOf('  function bulletPriorities('), source.indexOf('  function mountActivityPills(')), context);
  const original = input.value;
  context.bulletInstructions(field);
  assert.equal(input.value, original, 'mounting does not modify existing notes');
  field.children[0].events.click();
  assert.equal(input.value, '\u2022 TypingTest.com - AKA Typing Kit\n\u2022 Minecraft\n\n\u2022 Kits:');
  assert.equal(input.inputs.length, 1);
  assert.equal(input.inputs[0].bubbles, true);
  field.children[0].events.click();
  assert.equal(input.inputs.length, 1, 'formatting is idempotent');
  input.value = 'Too long'; input.maxLength = input.value.length;
  field.children[0].events.click();
  assert.equal(input.value, 'Too long');
  assert.equal(notices.length, 1);
  assert.equal(input.hidden, true, 'instructions start in clean reading mode');
  const preview = field.children[1], edit = field.children[2], tools = field.children[3];
  edit.events.click();
  assert.equal(input.hidden, false);
  assert.equal(preview.hidden, true);
  input.value = '\u2022 Typing Kit\n\u2022 Minecraft';
  input.maxLength = 20000;
  input.selectionStart = 2; input.selectionEnd = 12;
  input.setRangeText = function(text, start, end) {
    this.value = this.value.slice(0, start) + text + this.value.slice(end);
    this.selectionStart = this.selectionEnd = start + text.length;
  };
  tools.children[1].value = '';
  tools.children[2].value = 'javascript:alert(1)';
  tools.children[3].events.click();
  assert.match(tools.children[4].textContent, /HTTP or HTTPS/);
  assert.equal(input.value, '\u2022 Typing Kit\n\u2022 Minecraft');
  tools.children[2].value = 'https://typingtest.com/';
  tools.children[3].events.click();
  assert.equal(input.value, '\u2022 [Typing Kit](https://typingtest.com/)\n\u2022 Minecraft');
  edit.events.click();
  assert.equal(input.hidden, true);
  const link = preview.children[0].children.find(child => child.tag === 'a');
  assert.equal(link.textContent, 'Typing Kit');
  assert.equal(link.attrs.href, 'https://typingtest.com/');
  assert.equal(link.attrs.rel, 'noopener noreferrer');
  edit.events.click();
  input.value = 'Before After';
  input.selectionStart = 7; input.selectionEnd = 7;
  let prevented = false;
  input.events.paste({ clipboardData: { getData: () => '<a href="https://example.test/kit">Login Kit</a>' },
    preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(input.value, 'Before [Login Kit](https://example.test/kit)After');
  const saved = input.value;
  input.maxLength = saved.length;
  input.events.paste({ clipboardData: { getData: () => '<p>Too much text</p>' }, preventDefault() {} });
  assert.equal(input.value, saved, 'oversize paste is rejected without changing notes');
  assert.match(tools.children[4].textContent, /exceed the notes limit/);
  input.events.paste({ clipboardData: { getData: () => '' },
    preventDefault() { assert.fail('plain text uses native paste'); } });
  input.value = '\u2022 ';
  input.selectionStart = input.selectionEnd = 2;
  input.maxLength = 20000;
  input.events.paste({ clipboardData: { getData: () => '<ul><li>Kits</li></ul>' }, preventDefault() {} });
  assert.equal(input.value, '\u2022 Kits', 'pasting a list replaces an empty automatic bullet');
  assert.match(source, /if \(activity && name === 'instructions'\) bulletInstructions\(field\)/);
});
test('rich clipboard conversion retains named links and nested lists without importing active HTML', () => {
  const context = { URL, DOMParser: ClipboardParser };
  vm.runInNewContext(source.slice(source.indexOf('  function pastedInstructions('),
    source.indexOf('  function bulletInstructions(')), context);
  const value = context.pastedInstructions('<ul><li>Kits:<ul><li><a href="https://example.test/login?a=1&amp;b=2">Login Kit</a></li>' +
    '<li><a href="https://example.test/search">Search Kit</a></li></ul></li></ul>' +
    '<p>Ordinary notes &amp; text</p><script>doBadThings()</script>' +
    '<a href="javascript:alert(1)">Unsafe link</a><p><strong>Bold text</strong></p>');
  assert.match(value, /\u2022 Kits:/);
  assert.match(value, /  \u2022 \[Login Kit\]\(https:\/\/example.test\/login\?a=1&b=2\)/);
  assert.match(value, /  \u2022 \[Search Kit\]\(https:\/\/example.test\/search\)/);
  assert.match(value, /Ordinary notes & text/);
  assert.match(value, /Unsafe link/);
  assert.match(value, /Bold text/);
  assert.doesNotMatch(value, /javascript:|doBadThings|<strong>/);
});
function fixture() {
  const calls = [];
  const context = {
    el: node, URLSearchParams, Intl, URL, Date, Map, console: { error() {} },
    selectedDay: 0, week: '2026-10-19', section: 'week', year: 2026, term: '4',
    dirty: false, busy: false, saveInFlight: undefined, periodDate: '', periodSlot: 'p1',
    date: value => new Date(value + 'T00:00:00Z'),
    viewFragment: () => 'selected-day', history: { replaceState: (...args) => calls.push(['history', ...args]) },
    alignWeekRows: spread => calls.push(['align', spread]),
    canLeave: () => true, saveEntry: async () => { context.dirty = false; calls.push(['save']); },
    notice: message => calls.push(['notice', message]),
    load: async () => calls.push(['load', context.section, context.periodDate, context.periodSlot]),
    refreshSession: async () => {}, api: '/api/planner/', request: async () => ({ plans: [] })
  };
  vm.runInNewContext(source.slice(source.indexOf('  async function openPeriodPlan('),
    source.indexOf('  function weeklyTable(')), context);
  return { context, calls };
}

test('opening a period saves weekly drafts first, and failed saves retain their view', async () => {
  const { context, calls } = fixture();
  context.dirty = true;
  await context.openPeriodPlan('2026-10-21', 'p2');
  assert.deepEqual(calls.map(call => call[0]), ['save', 'load']);
  assert.deepEqual(calls.at(-1), ['load', 'period', '2026-10-21', 'p2']);
  assert.equal(context.selectedDay, 2);
  context.section = 'week'; context.dirty = true; calls.length = 0;
  context.saveEntry = async () => calls.push(['save-failed']);
  await context.openPeriodPlan('2026-10-22', 'p5');
  assert.equal(context.section, 'week');
  assert.deepEqual(calls, [['save-failed']]);
  context.busy = true;
  await context.openPeriodPlan('2026-10-22', 'p5');
  assert.match(calls.at(-1)[1], /loading or saving/);
});

test('period links respect unrelated unsent drafts rather than discarding them', async () => {
  const { context, calls } = fixture();
  context.canLeave = () => false;
  await context.openPeriodPlan('2026-10-19', 'p3');
  assert.equal(context.section, 'week');
  assert.equal(calls.length, 0);
});

test('period navigation waits for a focusout autosave already running and stays put if it fails', async () => {
  for (const succeeded of [true, false]) {
    const { context, calls } = fixture();
    let resolveSave;
    context.busy = true;
    context.saveInFlight = new Promise(resolve => { resolveSave = resolve; });
    const navigation = context.openPeriodPlan('2026-10-19', 'p2');
    await flush();
    assert.equal(calls.length, 0);
    context.busy = false;
    resolveSave(succeeded);
    await navigation;
    assert.equal(context.section, succeeded ? 'period' : 'week');
    assert.equal(calls.length, succeeded ? 1 : 0);
  }
});

test('period storage uses the actual date year, independent of the returning planner year', () => {
  const context = { section: 'period', year: 2026, week: '2026-12-28', term: '4',
    periodDate: '2027-01-01', periodSlot: 'p2', selectedDay: 4, URLSearchParams, api: '/api/planner/' };
  vm.runInNewContext(source.slice(source.indexOf('  function key()'), source.indexOf('  function offerSignin()')), context);
  assert.equal(context.key(), '2027-01-01_p2');
  assert.equal(context.address(), '/api/planner/2027/period/2027-01-01_p2');
  const fragment = new URLSearchParams(context.viewFragment());
  assert.equal(fragment.get('year'), '2026');
  assert.equal(fragment.get('week'), '2026-12-28');
  assert.equal(fragment.get('date'), '2027-01-01');
  assert.equal(fragment.get('day'), '4');
  const { authReturn } = require('./authReturn');
  assert.equal(authReturn('/#' + fragment), '/#' + fragment);
  context.section = 'week';
  assert.equal(context.address(), '/api/planner/2026/week/2026-12-28');
  context.section = 'activity';
  context.activityRecord = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  assert.equal(context.address(), '/api/planner/2027/activity/' + context.activityRecord);
  const activityFragment = context.viewFragment();
  assert.equal(new URLSearchParams(activityFragment).get('date'), '2027-01-01');
  assert.equal(new URLSearchParams(activityFragment).get('activity'), context.activityRecord);
  assert.equal(authReturn('/#' + activityFragment), '/#' + activityFragment);
});

function activityFixture(data = {}) {
  function element(tag = 'div', text = '', attrs = {}) {
    return {
      tag, textContent: text, attrs, id: attrs.id, value: attrs.value || '', children: [], events: {}, isConnected: true,
      append(...children) { this.children.push(...children); },
      replaceChildren(...children) { this.children = children; },
      addEventListener(type, handler) { this.events[type] = handler; },
      setAttribute(key, value) { this.attrs[key] = value; },
      removeAttribute(key) { delete this.attrs[key]; },
      dispatchEvent(event) { this.dispatched = event; },
      all() { return this.children.flatMap(n => [n, ...n.all()]); }
    };
  }
  const field = element(), calls = [], records = new Map([
    ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', { title: 'SketchUp' }]
  ]);
  let saveSucceeds = true, requestFails = false, confirmResult = true;
  const context = {
    el: element, Event, api: '/api/planner/', periodDate: '2026-10-30', section: 'period',
    activityRecord: '', csrf: 'synthetic', crypto: { randomUUID: () => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
    console: { error() {} },
    ensureSaved: async () => { calls.push(['save']); return saveSucceeds; },
    canLeave: () => true, confirm: () => confirmResult,
    load: async () => calls.push(['load', context.section, context.activityRecord]),
    refreshSession: async () => calls.push(['session']),
    request: async (url, init) => {
      calls.push(['request', url, init]);
      if (requestFails) throw new Error('Activities unavailable');
      if (init) {
        const { content, revision } = JSON.parse(init.body);
        assert.equal(revision, 0); assert.equal(init.headers['x-planner-csrf'], 'synthetic');
        records.set(url.split('/').at(-1), content);
        return { revision: 1 };
      }
      return { activities: [...records].map(([entry_key, content]) => ({ entry_key, title: content.title })) };
    }
  };
  vm.runInNewContext(source.slice(source.indexOf('  function mountActivityPills('), source.indexOf('  function renderPeriod(')), context);
  context.mountActivityPills(field, data);
  return {
    field, records, context, calls,
    find: predicate => field.all().find(predicate),
    click: text => field.all().find(n => n.tag === 'button' && n.textContent === text).events.click(),
    set saveSucceeds(value) { saveSucceeds = value; },
    set requestFails(value) { requestFails = value; },
    set confirmResult(value) { confirmResult = value; }
  };
}
test('activity pills create, persist, reopen and unlink reusable activities without deleting their plans', async () => {
  const f = activityFixture(); await flush();
  const stored = () => f.find(n => n.attrs.name === 'activityLinks');
  assert.equal(stored().value, '[]');
  await f.click('+ Add activity');
  assert.equal(f.find(n => n.id === 'period-activity-picker').hidden, false);
  f.find(n => n.id === 'new-activity-title').value = 'TypingTest.com';
  await f.click('Create activity');
  const id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  assert.deepEqual(JSON.parse(stored().value), [{ id, title: 'TypingTest.com' }]);
  assert.equal(stored().dispatched.bubbles, true);
  assert.equal(f.records.get(id).title, 'TypingTest.com');
  const reopened = activityFixture({ activityLinks: stored().value }); await flush();
  assert.ok(reopened.find(n => n.attrs['aria-label'] === 'Open activity: TypingTest.com'));
  await f.click('TypingTest.com');
  assert.deepEqual(f.calls.at(-1), ['load', 'activity', id]);
  f.context.section = 'period';
  await f.find(n => n.attrs['aria-label'] === 'Unlink activity: TypingTest.com').events.click();
  assert.equal(stored().value, '[]');
  assert.ok(f.records.has(id), 'unlinking never deletes reusable content');
  f.find(n => n.id === 'existing-activity').value = id;
  await f.click('Link selected activity');
  assert.equal(JSON.parse(stored().value)[0].id, id);
});
test('existing activity selection deduplicates links and refreshes renamed pill titles', async () => {
  const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const f = activityFixture(); await flush();
  f.find(n => n.id === 'existing-activity').value = id;
  await f.click('Link selected activity');
  await f.click('Link selected activity');
  assert.equal(JSON.parse(f.find(n => n.attrs.name === 'activityLinks').value).length, 1);
  assert.ok(f.find(n => n.attrs.role === 'alert' && n.textContent.includes('already linked')));
  f.records.get(id).title = 'SketchUp roofs';
  await f.click('Refresh activities');
  assert.ok(f.find(n => n.attrs['aria-label'] === 'Open activity: SketchUp roofs'));
  f.confirmResult = false;
  await f.find(n => n.attrs['aria-label'] === 'Unlink activity: SketchUp roofs').events.click();
  assert.equal(JSON.parse(f.find(n => n.attrs.name === 'activityLinks').value).length, 1);
});
test('activity errors preserve links and failed saves prevent navigation or creation', async () => {
  const f = activityFixture({ activityLinks: JSON.stringify([{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', title: 'SketchUp' }]) });
  await flush();
  f.saveSucceeds = false;
  await f.click('SketchUp');
  assert.equal(f.calls.some(c => c[0] === 'load'), false);
  f.find(n => n.id === 'new-activity-title').value = 'New';
  await f.click('Create activity');
  assert.equal(f.calls.some(c => c[0] === 'request' && c[2]), false);
  assert.equal(JSON.parse(f.find(n => n.attrs.name === 'activityLinks').value).length, 1);
  f.saveSucceeds = true; f.requestFails = true;
  await f.click('Refresh activities');
  assert.ok(f.find(n => n.attrs.role === 'alert' && n.textContent.includes('Refresh activities')));
  await f.click('Create activity');
  assert.equal(JSON.parse(f.find(n => n.attrs.name === 'activityLinks').value).length, 1);
  assert.throws(() => activityFixture({ activityLinks: 'not json' }), /Saved activity links could not be read/);
});

test('period plan chooser fills only empty fields and reuses activity IDs, saving before and after copying', async () => {
  const page = node(), calls = [];
  const names = ['title', 'priorities', 'activities', 'resources', 'reflection', 'activityLinks'];
  const inputs = Object.fromEntries(names.map(name => [name, {
    value: name === 'activities' ? 'Keep my own notes' : name === 'activityLinks' ? '[]' : '',
    dispatchEvent(event) { calls.push(['input', name, event.bubbles]); }
  }]));
  page.querySelector = selector => inputs[selector.match(/"([^"]+)"/)[1]];
  const links = JSON.stringify([{ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', title: 'Routine' }]);
  const context = {
    el: node, Event, console: { error() {} }, periodDate: '2026-10-30', periodSlot: 'p3', api: '/api/planner/',
    fields: { period: names.filter(name => name !== 'activityLinks').map(name => [name]) }, refreshSession: async () => {},
    ensureSaved: async () => { calls.push(['save']); return true; },
    load: async () => calls.push(['reload']),
    request: async url => {
      calls.push(['request', url]);
      if (url.includes('period-plan-choices')) return { plans: [
        { entry_key: '2026-10-30_p3', title: 'Current plan' },
        { entry_key: '2026-10-23_p2', title: 'Class routine' }
      ] };
      return { revision: 1, content: { title: 'Class routine', priorities: 'Learn things', activities: 'Source notes',
        resources: '[Website](https://example.test)', activityLinks: links } };
    }
  };
  vm.runInNewContext(source.slice(source.indexOf('  function mountPlanChooser('), source.indexOf('  function renderPeriod(')), context);
  context.mountPlanChooser(page); await flush();
  const tools = page.children[0], choose = tools.children[1], copy = tools.children[2], info = tools.children[4];
  assert.equal(choose.children.length, 2, 'current period is excluded');
  assert.match(choose.children[1].textContent, /Class routine.*2026-10-23.*P2/);
  choose.value = '2026-10-23_p2';
  await copy.events.click();
  assert.equal(inputs.activities.value, 'Keep my own notes');
  assert.equal(inputs.title.value, 'Class routine');
  assert.equal(inputs.resources.value, '[Website](https://example.test)');
  assert.equal(inputs.activityLinks.value, links);
  assert.ok(calls.some(call => call[0] === 'input' && call[1] === 'activityLinks' && call[2]),
    'hidden activity links are copied even though they are not visible field definitions');
  assert.equal(calls.filter(call => call[0] === 'save').length, 2);
  assert.equal(calls.at(-1)[0], 'reload');
  calls.length = 0;
  await copy.events.click();
  assert.match(info.textContent, /Existing content is unchanged/);
  assert.equal(calls.filter(call => call[0] === 'save').length, 1);
  context.ensureSaved = async () => false;
  inputs.title.value = '';
  await copy.events.click();
  assert.equal(inputs.title.value, '', 'save failure stops copying');
  assert.match(info.textContent, /Save the current period/);
  context.ensureSaved = async () => true;
  context.request = async () => { throw new Error('Offline'); };
  await copy.events.click();
  assert.equal(info.attrs.role, 'alert');
  assert.equal(info.textContent, 'Offline');
  assert.equal(copy.disabled, false);
});

test('weekly summaries replace link labels safely, including blank titles and unplanned periods', async () => {
  const { context } = fixture();
  const spread = node();
  const links = ['2026-10-19_p1', '2026-10-19_p2', '2026-10-19_p3'].map(key =>
    Object.assign(node('a', '+ Plan this period'), { dataset: { periodKey: key } }));
  const host = Object.assign(node('ul'), { dataset: { periodActivities: '2026-10-19_p1' } });
  const id = '12345678-1234-1234-1234-123456789abc';
  spread.querySelectorAll = selector => selector === '[data-period-key]' ? links : [host];
  context.request = async url => {
    assert.equal(url, '/api/planner/period-plans/2026-10-19');
    return { plans: [{ entry_key: '2026-10-19_p1', title: '<script>Private title</script>',
      activityLinks: JSON.stringify([{ id, title: 'Typing Kit' }, { id: '22345678-1234-1234-1234-123456789abc', title: 'Minecraft' }]) },
      { entry_key: '2026-10-19_p2', title: '  ' }] };
  };
  context.mountPeriodLinks(spread, context.week);
  await flush();
  assert.deepEqual(links.map(link => link.textContent),
    ['<script>Private title</script>', 'Untitled period plan', '+ Plan this period']);
  assert.match(links[0].attrs['aria-label'], /Private title/);
  assert.match(spread.beforeNodes[0].children[0].textContent, /private/);
  assert.equal(host.children.length, 2);
  assert.equal(host.children[0].children[0].textContent, 'Typing Kit');
  let destination;
  context.openPeriodPlan = async (...args) => { destination = args; };
  host.children[0].children[0].events.click({ preventDefault() {} });
  assert.deepEqual(destination, ['2026-10-19', 'p1', id]);
});

test('summary failures have explicit retry and detached responses cannot change another week', async () => {
  const { context } = fixture();
  const spread = node();
  let fail = true, resolve;
  context.request = async () => {
    if (fail) throw new Error('Could not read private titles.');
    return new Promise(done => { resolve = done; });
  };
  context.mountPeriodLinks(spread, context.week);
  await flush();
  const [message, retry] = spread.beforeNodes[0].children;
  assert.equal(message.attrs.role, 'alert');
  assert.match(message.textContent, /Could not read/);
  assert.equal(retry.hidden, false);
  fail = false;
  const pending = retry.events.click();
  await flush();
  spread.isConnected = false;
  spread.querySelectorAll = () => { throw new Error('Detached view was accessed'); };
  resolve({ plans: [] }); await pending;
  assert.equal(message.textContent, 'Loading your period plan titles...');
});

test('Day View selects Monday-Friday without replacing or duplicating weekly fields', () => {
  const { context, calls } = fixture();
  const spread = node();
  const originalNotes = node('textarea'); originalNotes.value = 'Keep this weekly draft';
  spread.append(originalNotes);
  context.mountDayView(spread);
  const [previous, choose, next, details] = spread.beforeNodes[0].children;
  assert.equal(choose.children.length, 5);
  assert.match(choose.children[0].textContent, /Monday/);
  assert.equal(previous.disabled, true);
  next.events.click();
  assert.equal(spread.dataset.selectedDay, '1');
  choose.value = '4'; choose.events.change();
  assert.equal(next.disabled, true);
  next.events.click();
  assert.equal(spread.dataset.selectedDay, '4');
  previous.events.click();
  assert.equal(choose.value, '3');
  details.events.click();
  assert.equal(spread.dataset.showDetails, 'true');
  assert.equal(details.attrs['aria-expanded'], 'true');
  assert.deepEqual(spread.children, [originalNotes]);
  assert.equal(originalNotes.value, 'Keep this weekly draft');
  assert.equal(context.dirty, false);
  assert.ok(calls.some(call => call[0] === 'history'));
});

test('period headers are linked only for teaching slots and Day View rules do not hide print columns', () => {
  const table = source.slice(source.indexOf('  function weeklyTable('), source.indexOf('  function renderWeek('));
  assert.match(table, /if \(\/\^p\[1-5\]\$\/\.test\(slot\)\)/);
  assert.match(table, /class: 'period-plan-link'/);
  assert.match(table, /inputField\(slot \+ ':' \+ i/);
  assert.doesNotMatch(table, /No classes listed|Non Contact/);
  const css = fs.readFileSync(require.resolve('./public/planner.css'), 'utf8');
  const screen = css.slice(css.indexOf('@media screen and (max-width: 900px)'), css.indexOf('@media (max-width: 1100px)'));
  assert.match(screen, /data-selected-day="4"/);
  assert.match(screen, /display: table-cell/);
  assert.doesNotMatch(screen, /\.week-sidebar \{ display: none/);
  assert.match(css, /@media print \{\s+\.week-day-controls, \.period-plan-status, \.period-planner > button, \.period-drive-controls \{ display: none; \}/);
  assert.match(source, /addEventListener\('beforeprint', \(\) => \{\s+globalThis\.plannerTextareaAutosize\?\.refresh\(\)/);
});

test('activities form a vertical list visually grouped with the original notes field', () => {
  const css = fs.readFileSync(require.resolve('./public/planner.css'), 'utf8');
  assert.match(css, /\.period-activity-pills\s*\{[^}]*flex-direction:\s*column/);
  assert.match(css, /\.period-planner \.planner-field:has\(> \.period-activity-pills\)\s*\{[^}]*border:\s*1px solid/);
  assert.match(css, /\.period-activity-pill > button:first-child\s*\{[^}]*flex:\s*1/);
  assert.match(source, /field\.append\(stored, pills, tools\)/);
});
