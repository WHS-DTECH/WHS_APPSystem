const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const schema = require('./public/reporting-schema');
const { validKey, validContent } = require('./planner');
const { renderShell } = require('./shell');

const row = { studentId: 'k:synthetic', programme: 'junior', cycle: 'eoy',
  coding: '3P', design: '4A', kaitiakitanga: 'Dev', rangatiratanga: 'Exe', comment: '' };
test('reporting validates restricted programme scales, distinct blanks and separate cycles', () => {
  const content = records => ({ records: JSON.stringify(records) });
  assert.equal(validKey(2026, 'reporting', 'main'), true);
  assert.equal(validKey(2026, 'reporting', 'someone-else'), false);
  assert.equal(validContent('reporting', content([row, { ...row, cycle: 'earlier' }])), true);
  assert.equal(validContent('reporting', content([row, row])), false);
  for (const change of [{ programme: '__proto__' }, { coding: '6B' }, { design: '1B' }, { kaitiakitanga: 'A' },
    { cycle: 'unknown' }, { studentId: '../private' }, { comment: 'x'.repeat(2001) }, { owner_id: 'forged' }]) {
    assert.equal(validContent('reporting', content([{ ...row, ...change }])), false);
  }
  assert.equal(validContent('reporting', { records: 'invalid' }), false);
  assert.equal(validContent('reporting', { records: '[]', valuesDefault: 'Dem' }), true);
  assert.equal(validContent('reporting', { records: '[]', valuesDefault: 'Exe' }), false);
  assert.equal(validContent('reporting', { records: '[]', owner_id: 'forged' }), false);
  assert.equal(validContent('reporting', content([{ ...row, programme: 'middle', coding: '6B', design: '5A' }])), true);
  assert.equal(schema.complete(row, 'eoy'), true);
  assert.equal(schema.complete(row, 'earlier'), false);
  assert.equal(schema.complete({ ...row, comment: '   ' }, 'earlier'), false);
  assert.equal(schema.complete({ ...row, comment: 'Progress and next steps.' }, 'earlier'), true);
  assert.equal(schema.complete({ ...row, coding: '' }, 'eoy'), false);
  assert.equal(schema.complete({ ...row, coding: 'UAG' }, 'eoy'), true);
});

function fixture(data = {}, fail = false, options = {}) {
  const events = [];
  function el(tag, text = '', attrs = {}) {
    return {
      tag, textContent: text, attrs, value: attrs.value || '', children: [], events: {}, isConnected: true,
      setAttribute(key, value) { this.attrs[key] = value; },
      append(...nodes) { this.children.push(...nodes); },
      prepend(...nodes) { this.children.unshift(...nodes); },
      replaceChildren(...nodes) { this.children = nodes; },
      addEventListener(type, handler) { this.events[type] = handler; },
      dispatchEvent(event) { events.push(event.type); }
    };
  }
  const directory = { classes: [
    { code: 'TEST-JDTECH', students: [{ id: row.studentId, name: 'Synthetic Junior', yearLevel: '7' }] },
    { code: 'TEST-MDTECH', students: [{ id: 'k:middle', name: 'Synthetic Middle', yearLevel: '9' }] },
    { code: 'TEST-MATH', students: [{ id: 'k:math', name: 'Not DTECH', yearLevel: '7' }] }
  ] };
  const host = el('main'), calls = [];
  const context = vm.createContext({ plannerReportingSchema: schema, Event, console, confirm: options.confirm || (() => true) });
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'public', 'reporting.js'), 'utf8'), context);
  context.plannerReporting.mount(host, { el, data, year: 2026, request: async url => {
    calls.push(url);
    if (fail) throw new Error('School directory unavailable');
    if (options.request) return options.request(url, directory);
    return directory;
  } });
  function all(node = host) { return [node, ...node.children.flatMap(child => all(child))]; }
  const find = predicate => all().find(predicate);
  const click = label => {
    const node = find(node => node.tag === 'button' && node.textContent === label);
    assert.ok(node, 'Missing button: ' + label); return node.events.click();
  };
  const control = label => find(node => node.attrs['aria-label'] === label);
  const enter = (label, value) => {
    const node = control(label); assert.ok(node, 'Missing control: ' + label);
    node.value = value; (node.events.change || node.events.input)({ stopPropagation() {} });
  };
  return { all, find, click, control, enter, calls, events };
}
const settle = () => new Promise(resolve => setImmediate(resolve));
test('reporting grids preserve student, programme and cycle entries and emit autosave edits', async () => {
  const f = fixture();
  await settle();
  assert.deepEqual(f.calls, ['attendance/classes/2026?term=3'], 'No attendance marks or timetable requests');
  assert.equal(f.find(node => node.textContent === 'Not DTECH'), undefined);
  const codingLabel = 'Synthetic Junior: Computational Thinking - Coding';
  assert.deepEqual(f.control(codingLabel).children.map(node => node.attrs.value), ['', ...schema.programmes.junior.levels]);
  f.enter(codingLabel, '3P');
  f.control('Reporting class list term').value = '4';
  f.control('Reporting class list term').events.change();
  await settle();
  assert.equal(f.calls[1], 'attendance/classes/2026?term=4');
  assert.equal(f.control(codingLabel).value, '3P', 'Report judgements are shared across terms within the same cycle');
  f.enter('Synthetic Junior: Design & Develop a Digital Outcome', '4A');
  f.click('2. School Values');
  f.enter('Synthetic Junior: Kaitiakitanga', 'Dev');
  f.enter('Synthetic Junior: Rangatiratanga', 'Exe');
  assert.ok(f.find(node => node.textContent.startsWith('1 of 1 students complete')));
  const cycle = f.control('Report cycle'); cycle.value = 'earlier'; cycle.events.change();
  assert.equal(f.control('Synthetic Junior: Kaitiakitanga').value, '');
  f.click('3. Report Comments');
  f.enter('Synthetic Junior: Report comment (required)', 'Earlier-year comment.');
  f.control('Report cycle').value = 'eoy'; f.control('Report cycle').events.change();
  assert.equal(f.control('Synthetic Junior: Report comment (optional for EOY)').value, '');
  f.click('MiddleDTECH'); f.click('1. Student Learning Objectives');
  assert.deepEqual(f.control('Synthetic Middle: Computational Thinking - Coding').children.map(node => node.attrs.value),
    ['', ...schema.programmes.middle.levels]);
  f.enter('Synthetic Middle: Computational Thinking - Coding', '6B');
  f.click('JuniorDTECH');
  assert.equal(f.control(codingLabel).value, '3P');
  const stored = JSON.parse(f.find(node => node.attrs.name === 'records').value);
  assert.equal(stored.length, 3);
  assert.equal(stored.find(entry => entry.cycle === 'earlier').comment, 'Earlier-year comment.');
  assert.equal(schema.validRecords(stored), true);
  assert.equal(f.events.length, 6);
  const link = f.find(node => node.tag === 'a');
  assert.match(link.attrs.href, /1oA7xHQapbqE3myKKFL6T7oUMGxPbrm2BCE1rJQ51-gw/);
  assert.equal(link.attrs.target, '_blank');
  const filter = f.find(node => node.attrs.type === 'checkbox');
  filter.checked = true; filter.events.change();
  assert.equal(f.control(codingLabel), undefined);
  assert.ok(f.find(node => node.textContent === 'No incomplete students in this class.'));
});

test('bulk school values overwrite both cycles across all terms while retaining SLOs and comments', async () => {
  const previous = { ...row, comment: 'Keep this comment' };
  const hidden = { ...row, studentId: 'k:former', programme: 'middle', coding: '5A', cycle: 'earlier' };
  const f = fixture({ records: JSON.stringify([previous, hidden]) }, false, { request: async (url, directory) => {
    const term = Number(url.slice(-1));
    if (term !== 1) return directory;
    return { classes: [{ code: 'TEST-JDTECH', students: [{ id: 'k:old', name: 'Historical Junior', yearLevel: '8' }] }] };
  } });
  await settle();
  await f.click('Set all school values to Dem');
  assert.deepEqual(f.calls.slice(1).sort(), [1, 2, 3, 4].map(term => 'attendance/classes/2026?term=' + term));
  const saved = JSON.parse(f.find(node => node.attrs.name === 'records').value);
  assert.equal(saved.length, 7);
  assert.ok(saved.every(entry => entry.kaitiakitanga === 'Dem' && entry.rangatiratanga === 'Dem'));
  assert.equal(saved.find(entry => entry.studentId === row.studentId && entry.cycle === 'eoy').coding, '3P');
  assert.equal(saved.find(entry => entry.studentId === row.studentId && entry.cycle === 'eoy').comment, 'Keep this comment');
  assert.equal(saved.find(entry => entry.studentId === 'k:former').coding, '5A');
  assert.deepEqual(saved.filter(entry => entry.studentId === 'k:old').map(entry => entry.cycle).sort(), ['earlier', 'eoy']);
  assert.equal(f.find(node => node.attrs.name === 'valuesDefault').value, 'Dem');
  assert.equal(f.events.length, 1, 'The entire change is sent to Planner autosave once');
  assert.ok(f.find(node => node.textContent.includes('Waiting for Planner autosave')));
});

test('failed or cancelled bulk update leaves all existing records and defaults unchanged', async () => {
  const previous = JSON.stringify([row]);
  const failed = fixture({ records: previous }, false, { request: async (url, directory) => {
    if (url.endsWith('term=2')) throw new Error('Term 2 unavailable');
    return directory;
  } });
  await settle();
  await failed.click('Set all school values to Dem');
  assert.equal(failed.find(node => node.attrs.name === 'records').value, previous);
  assert.equal(failed.find(node => node.attrs.name === 'valuesDefault').value, '');
  assert.equal(failed.events.length, 0);
  assert.ok(failed.find(node => node.attrs.role === 'alert' && node.textContent.includes('No school values were changed')));
  const cancelled = fixture({ records: previous }, false, { confirm: () => false });
  await settle();
  await cancelled.click('Set all school values to Dem');
  assert.equal(cancelled.calls.length, 1);
  assert.equal(cancelled.find(node => node.attrs.name === 'records').value, previous);
  assert.equal(cancelled.events.length, 0);
});

test('Dem default adds later students in both cycles but never overwrites later manual values', async () => {
  const f = fixture({ records: JSON.stringify([{ ...row, kaitiakitanga: 'Exe', rangatiratanga: '' }]), valuesDefault: 'Dem' });
  await settle();
  const entries = JSON.parse(f.find(node => node.attrs.name === 'records').value);
  assert.equal(entries.length, 4);
  assert.equal(entries.find(entry => entry.studentId === row.studentId && entry.cycle === 'eoy').kaitiakitanga, 'Exe');
  assert.equal(entries.find(entry => entry.studentId === row.studentId && entry.cycle === 'eoy').rangatiratanga, '');
  assert.ok(entries.filter(entry => entry.studentId === 'k:middle').every(entry =>
    entry.kaitiakitanga === 'Dem' && entry.rangatiratanga === 'Dem'));
  assert.equal(f.events.length, 1);
  f.control('Reporting class list term').value = '2';
  f.control('Reporting class list term').events.change();
  await settle();
  assert.equal(f.events.length, 1, 'Loading an existing roster does not rewrite it');
});

test('reporting restores saved entries and reports directory failures with retry', async () => {
  const f = fixture({ records: JSON.stringify([row]) });
  await settle();
  assert.equal(f.control('Synthetic Junior: Computational Thinking - Coding').value, '3P');
  assert.equal(f.events.length, 0, 'Reading does not dirty the planner');
  const failed = fixture({}, true);
  await settle();
  assert.ok(failed.find(node => node.attrs.role === 'alert' && node.textContent === 'School directory unavailable'));
  assert.ok(failed.find(node => node.textContent === 'Retry loading classes'));
  const html = renderShell({ baseUrl: '/teacher-planner/', coreUrl: '', standalone: false });
  assert.match(html, /data-section="reporting">Reporting/);
  assert.ok(html.indexOf('reporting-schema.js') < html.indexOf('reporting.js'));
});
