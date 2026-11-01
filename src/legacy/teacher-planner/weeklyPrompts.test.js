const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const prompts = require('./public/weekly-prompts');
const { renderShell } = require('./shell');
const source = fs.readFileSync(require.resolve('./public/planner.js'), 'utf8');

test('document prompts contain every supplied week and no invented weeks', () => {
  assert.equal(Object.keys(prompts).length, 36);
  for (const [term, count] of [[1, 11], [2, 10], [3, 10], [4, 5]]) {
    for (let week = 1; week <= count; week++) {
      const entry = prompts[term + '-' + week];
      assert.deepEqual(Object.keys(entry).sort(), ['focus', 'reflection', 'value', 'vocabulary', 'whakatauki']);
      for (const value of Object.values(entry)) assert.ok(value.trim().length > 0);
    }
    assert.equal(prompts[term + '-' + (count + 1)], undefined);
  }
  assert.equal(prompts['2-2'].focus, 'Small steps count');
  assert.equal(prompts['4-1'].reflection, 'What is one thing I have learned this year that could help someone else?');
  assert.equal(prompts['4-2'].focus, 'Lead by example');
  assert.equal(prompts['4-2'].whakatauki, 'He rangatira mō āpōpō. | A leader for tomorrow.');
  assert.equal(prompts['4-2'].vocabulary, 'Arataki (lead)');
  const html = renderShell({ baseUrl: '/', coreUrl: '', standalone: false });
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(match => match[1]);
  const dataScript = scripts.findIndex(url => url.includes('weekly-prompts.js'));
  const plannerScript = scripts.findIndex(url => /\/planner\.js(?:[?"]|$)/.test(url));
  assert.ok(dataScript >= 0 && plannerScript > dataScript);
});

function fixture() {
  const nodes = Object.fromEntries(Object.keys(prompts['4-1']).map(name => [name, { value: '', dataset: { autoWeeklyPrompt: 'true' } }]));
  const context = {
    year: 2026,
    plannerWeeklyPrompts: prompts,
    date: value => new Date(value + 'T00:00:00Z'),
    iso: value => value.toISOString().slice(0, 10),
    content: { querySelector: selector => nodes[selector.match(/name="([^"]+)"/)[1]] }
  };
  vm.runInNewContext(
    source.slice(source.indexOf('  function termRanges('), source.indexOf('  async function loadTermDates(')) +
    source.slice(source.indexOf('  function weeklyTerm('), source.indexOf('  async function loadSharedDates(')), context);
  return { nodes, context };
}
const terms = [
  { term: 1, startDate: '2026-01-26', endDate: '2026-04-02' },
  { term: 2, startDate: '2026-04-20', endDate: '2026-07-03' },
  { term: 3, startDate: '2026-07-20', endDate: '2026-09-25' },
  { term: 4, startDate: '2026-10-12', endDate: '2026-12-18' }
];

test('date-derived term weeks fill prompts without saved labels affecting selection and leave poster-week value notes blank', () => {
  for (const [week, key] of [['2026-01-26', '1-1'], ['2026-04-27', '2-2'], ['2026-07-20', '3-1'], ['2026-10-19', '4-2']]) {
    const { context, nodes } = fixture();
    assert.equal(context.fillWeeklyPrompts({ term: '1' }, terms, week), key.startsWith('4-') ? 4 : 5);
    for (const [name, value] of Object.entries(prompts[key])) {
      assert.equal(nodes[name].value, key.startsWith('4-') && name === 'value' ? '' : value);
    }
  }
});

test('saved content, saved blanks and in-flight edits are never overwritten', () => {
  const { context, nodes } = fixture();
  nodes.focus = { value: 'My private focus', dataset: { autoWeeklyPrompt: 'false' } };
  nodes.reflection = { value: '', dataset: { autoWeeklyPrompt: 'false' } };
  nodes.value = { value: 'Typed while loading', dataset: { autoWeeklyPrompt: 'true' } };
  assert.equal(context.fillWeeklyPrompts({}, terms, '2026-10-19'), 2);
  assert.equal(nodes.focus.value, 'My private focus');
  assert.equal(nodes.reflection.value, '');
  assert.equal(nodes.value.value, 'Typed while loading');
  assert.equal(nodes.vocabulary.value, prompts['4-2'].vocabulary);
  const render = source.slice(source.indexOf('  function renderWeek('), source.indexOf('  function bilingualRow('));
  assert.match(render, /Object\.hasOwn\(data, name\)/);
  assert.match(render, /\['input', 'change'\]/);
});

test('holidays, missing dates, pre-student weeks and unsupplied weeks stay blank', () => {
  for (const [settings, ranges, week] of [
    [{}, terms, '2026-04-13'], [{}, [], '2026-10-19'],
    [{ studentFirstDay: '2026-02-03' }, terms, '2026-01-26'],
    [{}, terms, '2026-06-29'], [{}, terms, '2026-11-16']
  ]) {
    const { context, nodes } = fixture();
    assert.equal(context.fillWeeklyPrompts(settings, ranges, week), -1, week);
    assert.ok(Object.values(nodes).every(input => input.value === ''));
  }
});

test('async school-date fill makes new defaults saveable but leaves existing entries clean', async () => {
  const { context, nodes } = fixture();
  const meta = {
    '#week-term': { dataset: { autoTerm: 'false' }, value: '1' },
    '#term-week-number': {}, '#school-year-week-number': {}, '#week-number-help': {}
  };
  const settings = Object.fromEntries(terms.flatMap(range => [
    ['term' + range.term + 'Start', range.startDate], ['term' + range.term + 'End', range.endDate]
  ]));
  const changes = [], errors = [];
  Object.assign(context, {
    year: 2026, section: 'week', week: '2026-10-19',
    api: '/api/planner/', setupDates: [], eventKinds: {},
    el: () => ({ isConnected: true, children: [], append(...items) { this.children.push(...items); }, addEventListener() {} }),
    request: async () => ({ revision: 1, content: settings }),
    changed: event => changes.push(event.target),
    console: { error: (...args) => errors.push(args) }
  });
  context.content = {
    prepend() {}, querySelectorAll: () => [],
    querySelector: selector => meta[selector] || nodes[selector.match(/name="([^"]+)"/)?.[1]]
  };
  vm.runInNewContext(source.slice(source.indexOf('  async function loadSharedDates('), source.indexOf('  function render(data)')), context);
  await context.loadSharedDates();
  assert.deepEqual(errors, []);
  assert.equal(changes.length, 1);
  assert.equal(nodes.focus.value, prompts['4-2'].focus);
  assert.equal(meta['#week-term'].value, '1');
  await context.loadSharedDates();
  assert.equal(changes.length, 1);
});
