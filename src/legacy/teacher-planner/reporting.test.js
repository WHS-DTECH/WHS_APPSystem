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
  assert.equal(validContent('reporting', content([{ ...row, whanaungatanga: 'Dem', manaakitanga: 'Exe' }])), true);
  assert.equal(validContent('reporting', content([{ ...row, whanaungatanga: 'invalid' }])), false);
  assert.equal(validContent('reporting', { records: '[]', valuesDefault: 'Dem-v2' }), true);
  assert.equal(validContent('reporting', { records: '[]', juniorSloDefault: '3P' }), true);
  assert.equal(validContent('reporting', { records: '[]', juniorSloDefault: '4A' }), false);
  assert.equal(validContent('reporting', { records: '[]', juniorSloDefault: null }), false);
  assert.equal(schema.complete(row, 'eoy', '3'), true);
  assert.equal(schema.complete(row, 'eoy', '1'), false);
  assert.equal(schema.complete(row, 'earlier', '3'), false);
  assert.equal(schema.complete({ ...row, comment: '   ' }, 'earlier', '3'), false);
  assert.equal(schema.complete({ ...row, comment: 'Progress and next steps.' }, 'earlier', '3'), true);
  assert.equal(schema.complete({ ...row, coding: '' }, 'eoy', '3'), true);
  assert.equal(schema.complete({ ...row, coding: '', design: '' }, 'eoy', '3'), false);
  assert.equal(schema.complete({ ...row, coding: 'UAG' }, 'eoy', '3'), true);
  assert.equal(schema.complete({ ...row, programme: 'middle', coding: '' }, 'eoy', '3'), false);
  assert.equal(schema.complete({ ...row, programme: 'middle', kaitiakitanga: '' }, 'eoy', '3'), false);
  assert.equal(schema.complete({ ...row, programme: 'middle' }, 'eoy', '3'), true);
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
test('Junior SLO overwrite covers all terms and cycles, preserves other fields, and defaults future students', async () => {
  const old = { ...row, coding: '3A', design: '4A', comment: 'Keep', whanaungatanga: 'Exe' };
  const former = { ...row, studentId: 'k:former', cycle: 'earlier', coding: 'UAG', design: '', comment: 'Earlier' };
  const middle = { ...row, studentId: 'k:middle', programme: 'middle', coding: '5A', design: '6B' };
  let newStudent = false;
  const request = async (url, directory) => {
    const classes = [...directory.classes];
    if (url.endsWith('term=1')) classes.push({ code: 'TEST-HIDDEN-DTECH',
      students: [{ id: 'k:hidden', name: 'Hidden Junior', yearLevel: '8' }] });
    if (newStudent) classes.push({ code: 'TEST-NEW-DTECH',
      students: [{ id: 'k:new', name: 'New Junior', yearLevel: '7' },
        { id: 'k:newmiddle', name: 'New Middle', yearLevel: '9' }] });
    return { classes };
  };
  const f = fixture({ records: JSON.stringify([old, former, middle]) }, false, { request });
  await settle();
  await f.click('Set JuniorDTECH SLOs to 3P');
  assert.deepEqual(f.calls.slice(1).sort(), [1, 2, 3, 4].map(term => 'attendance/classes/2026?term=' + term));
  let saved = JSON.parse(f.find(node => node.attrs.name === 'records').value);
  assert.deepEqual(saved.find(entry => entry.studentId === old.studentId && entry.cycle === 'eoy'),
    { ...old, coding: '3P', design: '3P' });
  assert.deepEqual(saved.find(entry => entry.studentId === former.studentId), { ...former, coding: '3P', design: '3P' });
  assert.deepEqual(saved.find(entry => entry.studentId === middle.studentId), middle);
  assert.equal(saved.filter(entry => entry.studentId === 'k:hidden').length, 2);
  assert.ok(saved.filter(entry => entry.studentId === 'k:hidden').every(entry =>
    entry.coding === '3P' && entry.design === '3P' && entry.kaitiakitanga === '' && entry.rangatiratanga === ''));
  assert.equal(saved.filter(entry => entry.studentId === 'k:middle').length, 1);
  assert.equal(f.find(node => node.attrs.name === 'juniorSloDefault').value, '3P');
  assert.equal(f.find(node => node.attrs.name === 'valuesDefault').value, '');
  assert.equal(f.events.length, 1);
  assert.ok(f.find(node => node.textContent.includes('Waiting for Planner autosave')));
  f.enter('Synthetic Junior: Computational Thinking - Coding', '');
  f.enter('Synthetic Junior: Design & Develop a Digital Outcome', '4B');
  newStudent = true;
  f.control('Reporting class list term').value = '4'; f.control('Reporting class list term').events.change();
  await settle();
  saved = JSON.parse(f.find(node => node.attrs.name === 'records').value);
  assert.equal(saved.find(entry => entry.studentId === old.studentId && entry.cycle === 'eoy').coding, '');
  assert.equal(saved.find(entry => entry.studentId === old.studentId && entry.cycle === 'eoy').design, '4B');
  assert.equal(saved.filter(entry => entry.studentId === 'k:new').length, 2);
  assert.ok(saved.filter(entry => entry.studentId === 'k:new').every(entry => entry.coding === '3P' && entry.design === '3P'));
  assert.equal(saved.some(entry => entry.studentId === 'k:newmiddle'), false);
  const restored = fixture({ records: JSON.stringify(saved), juniorSloDefault: '3P' }, false, { request });
  await settle();
  assert.equal(restored.control('Synthetic Junior: Computational Thinking - Coding').value, '');
  assert.equal(restored.control('Synthetic Junior: Design & Develop a Digital Outcome').value, '4B');
  assert.equal(restored.events.length, 0);
});

test('Junior SLO and school value defaults work independently and together', async () => {
  const f = fixture({ valuesDefault: 'Dem-v2' });
  await settle();
  await f.click('Set JuniorDTECH SLOs to 3P');
  const saved = JSON.parse(f.find(node => node.attrs.name === 'records').value);
  assert.ok(saved.filter(entry => entry.programme === 'junior').every(entry =>
    entry.coding === '3P' && entry.design === '3P' && entry.whanaungatanga === 'Dem'));
  assert.ok(saved.filter(entry => entry.programme === 'middle').every(entry =>
    entry.coding === '' && entry.design === '' && entry.kaitiakitanga === 'Dem'));
  f.enter('Synthetic Junior: Computational Thinking - Coding', '');
  await f.click('Default school values to Dem');
  assert.equal(f.find(node => node.attrs.name === 'juniorSloDefault').value, '3P');
  const updated = JSON.parse(f.find(node => node.attrs.name === 'records').value);
  assert.equal(updated.find(entry => entry.studentId === row.studentId && entry.cycle === 'eoy').coding, '');
  assert.equal(updated.find(entry => entry.studentId === row.studentId && entry.cycle === 'eoy').design, '3P');
});

test('Junior SLO setup leaves data unchanged when cancelled or a term cannot load', async () => {
  const initial = JSON.stringify([row]);
  const cancelled = fixture({ records: initial }, false, { confirm: () => false });
  await settle();
  await cancelled.click('Set JuniorDTECH SLOs to 3P');
  assert.equal(cancelled.calls.length, 1);
  assert.equal(cancelled.find(node => node.attrs.name === 'records').value, initial);
  assert.equal(cancelled.events.length, 0);
  const failed = fixture({ records: initial }, false, { request: async (url, directory) => {
    if (url.endsWith('term=2')) throw new Error('Term 2 unavailable');
    return directory;
  } });
  await settle();
  await failed.click('Set JuniorDTECH SLOs to 3P');
  assert.equal(failed.find(node => node.attrs.name === 'records').value, initial);
  assert.equal(failed.find(node => node.attrs.name === 'juniorSloDefault').value, '');
  assert.equal(failed.events.length, 0);
  assert.ok(failed.find(node => node.attrs.role === 'alert' && node.textContent.includes('No SLOs were changed')));
  const many = Array.from({ length: 1000 }, (_, index) => ({ ...row, studentId: 'k:limit' + index }));
  const limited = fixture({ records: JSON.stringify(many) });
  await settle();
  await limited.click('Set JuniorDTECH SLOs to 3P');
  assert.equal(limited.find(node => node.attrs.name === 'records').value, JSON.stringify(many));
  assert.equal(limited.find(node => node.attrs.name === 'juniorSloDefault').value, '');
  assert.equal(limited.events.length, 0);
  assert.ok(limited.find(node => node.attrs.role === 'alert' && node.textContent.includes('storage limit')));
});

test('Reporting combines only the two VP PIDTECH rooms, retaining distinct students once', () => {
  const student = (id, name, yearLevel = '7') => ({ id: 'k:' + id, name, yearLevel });
  const shared = student('shared', 'Shared Student');
  const directory = { classes: [
    { code: 'VP-PIDTECH-05', students: [shared, student('a', 'Student A'), student('middle', 'Middle', '9')] },
    { code: 'VP-PIDTECH-CW', students: [shared, student('b', 'Student B')] },
    { code: 'VP-SRDTECH-CW', students: [student('c', 'Student C')] },
    { code: 'OTHER-PIDTECH-CW', students: [student('d', 'Student D')] },
    { code: 'VP-PIDTECH-OTHER', students: [student('e', 'Student E')] }
  ] };
  const junior = schema.classGroups(directory, 'junior');
  assert.deepEqual(junior.map(group => group.code), ['VP-PIDTECH', 'VP-SRDTECH-CW', 'OTHER-PIDTECH-CW', 'VP-PIDTECH-OTHER']);
  assert.deepEqual(junior[0].students.map(item => item.id), ['k:shared', 'k:a', 'k:b']);
  assert.deepEqual(schema.classGroups(directory, 'middle').map(group => group.code), ['VP-PIDTECH-05']);
  assert.deepEqual(schema.classGroups({ classes: [directory.classes[1]] }, 'junior').map(group => group.code), ['VP-PIDTECH-CW']);
  assert.deepEqual(schema.classGroups({ classes: [directory.classes[0], directory.classes[0]] }, 'junior')
    .map(group => group.code), ['VP-PIDTECH-05', 'VP-PIDTECH-05']);
  assert.deepEqual(directory.classes[0].students.map(item => item.id), ['k:shared', 'k:a', 'k:middle'],
    'Grouping is display-only and does not mutate the source roster');
});

test('combined PIDTECH tab shows union and preserves existing judgements without saving on load', async () => {
  const savedRow = { ...row, comment: 'Existing report comment.' };
  const f = fixture({ records: JSON.stringify([savedRow]) }, false, { request: async () => ({ classes: [
    { code: 'VP-PIDTECH-05', students: [{ id: row.studentId, name: 'Synthetic Junior', yearLevel: '7' }] },
    { code: 'VP-PIDTECH-CW', students: [{ id: row.studentId, name: 'Synthetic Junior', yearLevel: '7' },
      { id: 'k:new', name: 'Another Junior', yearLevel: '8' }] },
    { code: 'VP-SRDTECH-CW', students: [{ id: 'k:other', name: 'Other Junior', yearLevel: '7' }] }
  ] }) });
  await settle();
  assert.ok(f.find(node => node.textContent === 'VP-PIDTECH (1/2)'));
  assert.ok(f.find(node => node.textContent === 'VP-SRDTECH-CW (0/1)'));
  assert.equal(f.control('Synthetic Junior: Computational Thinking - Coding').value, '3P');
  assert.equal(f.events.length, 0);
  f.click('2. School Values');
  assert.equal(f.control('Synthetic Junior: Rangatiratanga').value, 'Exe');
  f.enter('Another Junior: Rangatiratanga', 'Dem');
  f.click('3. Report Comments');
  assert.equal(f.control('Synthetic Junior: Report comment (optional for EOY)').value, savedRow.comment);
  const saved = JSON.parse(f.find(node => node.attrs.name === 'records').value);
  assert.deepEqual(saved.find(entry => entry.studentId === row.studentId), savedRow);
  assert.equal(saved.find(entry => entry.studentId === 'k:new').rangatiratanga, 'Dem');
});

test('Dem defaults do not duplicate students present in both PIDTECH rooms', async () => {
  const shared = { id: row.studentId, name: 'Synthetic Junior', yearLevel: '7' };
  const f = fixture({ records: JSON.stringify([row]), valuesDefault: 'Dem' }, false, {
    request: async () => ({ classes: [
      { code: 'VP-PIDTECH-05', students: [shared] },
      { code: 'VP-PIDTECH-CW', students: [shared, { id: 'k:new', name: 'Another Junior', yearLevel: '8' }] }
    ] })
  });
  await settle();
  const saved = JSON.parse(f.find(node => node.attrs.name === 'records').value);
  assert.equal(saved.length, 4);
  assert.deepEqual(saved.find(entry => entry.studentId === row.studentId && entry.cycle === 'eoy'), row);
  assert.equal(saved.find(entry => entry.studentId === 'k:new' && entry.cycle === 'eoy').kaitiakitanga, 'Dem');
  assert.equal(saved.find(entry => entry.studentId === 'k:new' && entry.cycle === 'earlier').rangatiratanga, 'Dem');
});

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
  assert.equal(f.control('Synthetic Junior: Rangatiratanga'), undefined);
  f.control('Reporting class list term').value = '3';
  f.control('Reporting class list term').events.change();
  await settle();
  f.enter('Synthetic Junior: Rangatiratanga', 'Exe');
  assert.ok(f.find(node => node.textContent.startsWith('1 of 1 students complete')));
  const cycle = f.control('Report cycle'); cycle.value = 'earlier'; cycle.events.change();
  assert.equal(f.control('Synthetic Junior: Rangatiratanga').value, '');
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
  assert.ok(saved.filter(entry => entry.programme === 'junior').every(entry =>
    entry.whanaungatanga === 'Dem' && entry.manaakitanga === 'Dem'));
  assert.equal(f.find(node => node.attrs.name === 'valuesDefault').value, 'Dem-v2');
  assert.equal(f.events.length, 1, 'The entire change is sent to Planner autosave once');
  assert.ok(f.find(node => node.textContent.includes('Waiting for Planner autosave')));
});

test('one-time default fills blanks, preserves choices, and defaults future classes without overwriting edits', async () => {
  const existing = { ...row, kaitiakitanga: '', comment: 'Keep my comment' };
  const middle = { ...row, studentId: 'k:middle', programme: 'middle', coding: '5A', rangatiratanga: '' };
  let includeNew = false;
  const request = async (url, directory) => {
    if (!includeNew) return directory;
    return { classes: [...directory.classes, { code: 'TEST-NEW-DTECH',
      students: [{ id: 'k:new', name: 'New Junior', yearLevel: '8' },
        { id: 'k:newmiddle', name: 'New Middle', yearLevel: '9' }] }] };
  };
  const f = fixture({ records: JSON.stringify([existing, middle]) }, false, { request });
  await settle();
  await f.click('Default school values to Dem');
  assert.deepEqual(f.calls.slice(1).sort(), [1, 2, 3, 4].map(term => 'attendance/classes/2026?term=' + term));
  let saved = JSON.parse(f.find(node => node.attrs.name === 'records').value);
  const junior = saved.find(entry => entry.studentId === row.studentId && entry.cycle === 'eoy');
  assert.deepEqual(junior, { ...existing, kaitiakitanga: 'Dem', whanaungatanga: 'Dem', manaakitanga: 'Dem' });
  assert.deepEqual(saved.find(entry => entry.studentId === middle.studentId && entry.cycle === 'eoy'),
    { ...middle, rangatiratanga: 'Dem' });
  assert.equal(f.find(node => node.attrs.name === 'valuesDefault').value, 'Dem-v2');
  f.click('2. School Values');
  f.enter('Synthetic Junior: Rangatiratanga', '');
  includeNew = true;
  f.control('Reporting class list term').value = '1';
  f.control('Reporting class list term').events.change();
  await settle();
  assert.equal(f.control('Synthetic Junior: Whānaungatanga').value, 'Dem');
  f.enter('Synthetic Junior: Whānaungatanga', 'Exe');
  f.control('Reporting class list term').value = '2';
  f.control('Reporting class list term').events.change();
  await settle();
  assert.equal(f.control('Synthetic Junior: Manaakitanga').value, 'Dem');
  f.enter('Synthetic Junior: Manaakitanga', 'Dev');
  f.control('Reporting class list term').value = '3';
  f.control('Reporting class list term').events.change();
  await settle();
  assert.equal(f.control('Synthetic Junior: Rangatiratanga').value, '');
  f.control('Reporting class list term').value = '4';
  f.control('Reporting class list term').events.change();
  await settle();
  assert.equal(f.control('Synthetic Junior: Kaitiakitanga').value, 'Dem');
  saved = JSON.parse(f.find(node => node.attrs.name === 'records').value);
  const updated = saved.find(entry => entry.studentId === row.studentId && entry.cycle === 'eoy');
  assert.equal(updated.rangatiratanga, '');
  assert.equal(updated.whanaungatanga, 'Exe');
  assert.equal(updated.manaakitanga, 'Dev');
  assert.equal(updated.kaitiakitanga, 'Dem');
  assert.equal(saved.filter(entry => entry.studentId === 'k:new').length, 2);
  assert.ok(saved.filter(entry => entry.studentId === 'k:new').every(entry =>
    schema.juniorValues.every(([key]) => entry[key] === 'Dem')));
  assert.equal(saved.filter(entry => entry.studentId === 'k:newmiddle').length, 2);
  assert.ok(saved.filter(entry => entry.studentId === 'k:newmiddle').every(entry =>
    entry.kaitiakitanga === 'Dem' && entry.rangatiratanga === 'Dem'));
  const restored = fixture({ records: JSON.stringify(saved), valuesDefault: 'Dem-v2' }, false, { request });
  await settle();
  assert.equal(JSON.parse(restored.find(node => node.attrs.name === 'records').value)
    .find(entry => entry.studentId === row.studentId && entry.cycle === 'eoy').rangatiratanga, '');
  assert.equal(restored.events.length, 0);
});

test('completion counts use the selected Junior term and both Middle values and SLOs', async () => {
  const junior = { ...row, design: '', whanaungatanga: 'Dem', manaakitanga: '', rangatiratanga: 'Exe' };
  const middle = { ...row, studentId: 'k:middle', programme: 'middle', coding: '5A', design: '' };
  const f = fixture({ records: JSON.stringify([junior, middle]) });
  await settle();
  assert.ok(f.find(node => node.textContent === 'TEST-JDTECH (1/1)'));
  f.control('Reporting class list term').value = '2';
  f.control('Reporting class list term').events.change();
  await settle();
  assert.ok(f.find(node => node.textContent === 'TEST-JDTECH (0/1)'));
  f.click('2. School Values');
  assert.equal(f.control('Synthetic Junior: Manaakitanga').value, '');
  f.enter('Synthetic Junior: Manaakitanga', 'Dem');
  assert.ok(f.find(node => node.textContent === 'TEST-JDTECH (1/1)'));
  f.control('Report cycle').value = 'earlier'; f.control('Report cycle').events.change();
  assert.ok(f.find(node => node.textContent === 'TEST-JDTECH (0/1)'));
  f.control('Report cycle').value = 'eoy'; f.control('Report cycle').events.change();
  f.click('MiddleDTECH');
  assert.ok(f.find(node => node.textContent === 'TEST-MDTECH (0/1)'));
  assert.ok(f.control('Synthetic Middle: Kaitiakitanga'));
  assert.ok(f.control('Synthetic Middle: Rangatiratanga'));
  f.click('1. Student Learning Objectives');
  f.enter('Synthetic Middle: Design & Develop a Digital Outcome', '5P');
  assert.ok(f.find(node => node.textContent === 'TEST-MDTECH (1/1)'));
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
  await failed.click('Default school values to Dem');
  assert.equal(failed.find(node => node.attrs.name === 'records').value, previous);
  assert.equal(failed.events.length, 0);
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
