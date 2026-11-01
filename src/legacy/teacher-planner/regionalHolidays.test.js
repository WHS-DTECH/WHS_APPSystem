const test = require('node:test');
const assert = require('node:assert/strict');
const { selectRegionalHolidays } = require('./regionalHolidays');
const { validContent, validKey } = require('./planner');
const regions = require('./public/holiday-regions');
const fs = require('node:fs');
const vm = require('node:vm');

test('personal anniversary selection retains national dates and includes only the chosen regional observed date', () => {
  const national = { date: '2026-10-26', name: 'Labour Day' };
  const calendar = { publicHolidays: [national, { date: '2026-11-30', name: 'Westland Anniversary Day (observed)' }],
    regionalAnniversaries: [
      { region: 'Westland', date: '2026-11-30', name: 'Westland Anniversary Day (observed)' },
      { region: 'Canterbury', date: '2026-11-13', name: 'Canterbury Anniversary Day (observed)' }
    ] };
  assert.deepEqual(selectRegionalHolidays(calendar, 'Canterbury').publicHolidays, [national,
    { date: '2026-11-13', name: 'Canterbury Anniversary Day (observed)' }]);
  assert.equal(selectRegionalHolidays(calendar, 'Westland').publicHolidays[1].date, '2026-11-30');
  assert.equal(calendar.publicHolidays[1].date, '2026-11-30', 'shared calendar is not mutated');
  const missing = selectRegionalHolidays({ publicHolidays: calendar.publicHolidays }, 'Otago');
  assert.deepEqual(missing.publicHolidays, [national]);
  assert.match(missing.publicHolidaysError, /Otago.*unavailable/);
  assert.deepEqual(selectRegionalHolidays({ publicHolidays: calendar.publicHolidays }, 'Westland').publicHolidays, calendar.publicHolidays);
  assert.throws(() => selectRegionalHolidays(calendar, 'Unknown'), /invalid/);
});

test('private cross-year preferences accept only recognised anniversary regions', () => {
  assert.equal(validKey(2000, 'preferences', 'main'), true);
  for (const region of regions) assert.equal(validContent('preferences', { anniversaryRegion: region }), true);
  for (const value of ['Unknown', '', null, [], {}]) assert.equal(validContent('preferences', { anniversaryRegion: value }), false);
  assert.equal(validContent('preferences', { extra: 'bad' }), false);
});

test('holiday setup loads and saves a personal region with revision/CSRF and reports failures', async () => {
  const nodes = [];
  const el = (tag, text = '', attrs = {}) => {
    const node = { tag, textContent: text, attrs, dataset: {}, children: [], events: {}, isConnected: true,
      append(...items) { this.children.push(...items); },
      setAttribute(key, value) { this.attrs[key] = value; },
      addEventListener(key, callback) { this.events[key] = callback; }
    };
    nodes.push(node); return node;
  };
  const calls = [];
  let fail = false;
  const source = fs.readFileSync(require.resolve('./public/planner.js'), 'utf8');
  const context = { el, plannerHolidayRegions: regions, api: '/api/planner/', csrf: 'synthetic-csrf',
    refreshSession: async () => {}, console: { error() {} },
    request: async (path, options) => {
      calls.push([path, options]);
      if (fail) throw new Error('Database unavailable');
      return options ? { revision: 3 } : { content: { anniversaryRegion: 'Canterbury' }, revision: 2 };
    }
  };
  vm.runInNewContext(source.slice(source.indexOf('  function mountHolidayPreferences('), source.indexOf('  function renderAssessmentSetup(')), context);
  const host = el('section');
  context.mountHolidayPreferences(host);
  await new Promise(resolve => setImmediate(resolve));
  const select = nodes.find(node => node.tag === 'select');
  const save = nodes.find(node => node.textContent === 'Save anniversary region');
  assert.equal(select.value, 'Canterbury');
  assert.equal(host.attrs['data-planner-navigation'], '', 'region edits do not dirty school-wide settings');
  assert.equal(select.children.length, 12);
  select.value = 'Otago';
  await save.events.click();
  assert.equal(calls.at(-1)[0], '/api/planner/2000/preferences/main');
  assert.deepEqual(JSON.parse(calls.at(-1)[1].body), { content: { anniversaryRegion: 'Otago' }, revision: 2 });
  assert.equal(calls.at(-1)[1].headers['x-planner-csrf'], 'synthetic-csrf');
  assert.equal(host.dataset.preferencesBusy, 'false');
  fail = true;
  await save.events.click();
  const status = nodes.find(node => node.attrs['aria-live']);
  assert.equal(status.attrs.role, 'alert');
  assert.equal(status.textContent, 'Database unavailable');
  assert.equal(save.disabled, false);
});
