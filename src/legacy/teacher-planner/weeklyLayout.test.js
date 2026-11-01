const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('./public/planner.js'), 'utf8');

test('textareas expand saved text, shrink edits, reveal hidden content and release detached controls', () => {
  const areas = [];
  const events = {}, windowEvents = {}, observed = new Set();
  let mutations, resize;
  const area = (height, visible = true) => ({
    style: {}, scrollHeight: height, isConnected: true, visible, classList: { add() {} },
    getClientRects() { return this.visible ? [{}] : []; }, matches: () => true
  });
  areas.push(area(500), area(700, false));
  const context = {
    document: { getElementById: () => ({ querySelectorAll: () => areas, addEventListener: (event, handler) => { events[event] = handler; } }) },
    window: { addEventListener: (event, handler) => { windowEvents[event] = handler; } },
    getComputedStyle: () => ({ borderTopWidth: '1px', borderBottomWidth: '1px' }),
    ResizeObserver: class {
      constructor(handler) { resize = handler; }
      observe(node) { observed.add(node); } unobserve(node) { observed.delete(node); }
    },
    MutationObserver: class { constructor(handler) { mutations = handler; } observe() {} }
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('./public/textarea-autosize.js'), 'utf8'), context);
  assert.equal(areas[0].style.height, '502px');
  assert.equal(areas[1].style.height, undefined);
  areas[0].scrollHeight = 80; events.input({ target: areas[0] });
  assert.equal(areas[0].style.height, '82px');
  areas[1].visible = true; mutations();
  assert.equal(areas[1].style.height, '702px');
  areas[0].scrollHeight = 900;
  resize([{ target: areas[0], contentRect: { width: 100 } }]);
  assert.equal(areas[0].style.height, '902px');
  windowEvents.afterprint();
  const removed = areas.shift(); removed.isConnected = false; mutations();
  assert.equal(observed.has(removed), false);
  const css = fs.readFileSync(require.resolve('./public/planner.css'), 'utf8');
  assert.match(css, /textarea\.planner-auto-expand \{ overflow: hidden; resize: none; flex: none; max-height: none; \}/);
});

test('weekly notices start compact and tasks follow content rather than stretching to the timetable', () => {
  const css = fs.readFileSync(require.resolve('./public/planner.css'), 'utf8');
  const sidebar = css.match(/\.week-sidebar \{([^}]+)\}/)[1];
  assert.match(sidebar, /grid-template-rows: auto auto auto/);
  assert.match(sidebar, /align-content: start/);
  const notices = css.match(/\.week-sidebar textarea\[name="notices"\] \{([^}]+)\}/)[1];
  assert.match(notices, /min-height: 60px/);
  assert.match(notices, /height: 60px/);
  assert.match(notices, /flex: none/);
  for (const rule of css.matchAll(/\.week-sidebar \{([^}]+)\}/g)) {
    assert.doesNotMatch(rule[1], /grid-template-rows:[^;]*\b\d*\.?\d+fr\b/);
  }
});

test('Planner headings and labels are bold while entered content keeps normal weight', () => {
  const css = fs.readFileSync(require.resolve('./public/planner.css'), 'utf8');
  assert.match(css, /\.planner-main :is\(h1, h2, h3, h4, h5, h6, label, legend, th, \.annual-band, \.kamar-week-heading, \.kamar-week-extra-label\) \{ font-weight: 700; \}/);
  assert.match(css, /\.planner-main input, \.planner-main textarea, \.planner-main select \{ font: inherit; font-weight: 400;/);
});

test('weekly date headers use larger readable labels and bold dates with wrapping', () => {
  const css = fs.readFileSync(require.resolve('./public/planner.css'), 'utf8');
  const heading = css.match(/\.planner-week thead th \{([^}]+)\}/)[1];
  const date = css.match(/\.week-date \{([^}]+)\}/)[1];
  assert.match(heading, /font-size: 14px/);
  assert.match(heading, /overflow-wrap: anywhere/);
  assert.match(date, /font-size: 18px/);
  assert.match(date, /font-weight: 700/);
});

function fixture(stacked = false) {
  const box = height => ({
    naturalHeight: height,
    style: {},
    getBoundingClientRect() {
      return { height: Math.max(this.naturalHeight, parseFloat(this.style.height || this.style.minHeight) || 0) };
    }
  });
  const tops = [box(290), box(240)];
  const labels = [[box(19), box(19), box(38)], [box(19), box(19)]];
  const tables = [{ rows: [box(55), box(65), box(90)] }, { rows: [box(65), box(65), box(75)] }]
    .map((table, index) => ({ ...table, querySelectorAll: () => labels[index] }));
  const pages = [0, stacked ? 0 : 600].map(left => ({ getBoundingClientRect: () => ({ left }) }));
  const spread = { querySelectorAll: selector => ({ '.week-top': tops, '.planner-week': tables, '.paper-page': pages })[selector] };
  const context = {};
  vm.runInNewContext(source.slice(source.indexOf('  function alignWeekRows('), source.indexOf('  function bilingualRow(')), context);
  return { tops, tables, spread, context, pages, labels };
}

test('weekday labels share the tallest wrapped height so all five dates align and shrink after reflow', () => {
  const { spread, context, labels } = fixture();
  assert.match(source, /day\.append\(el\('span', bilingual\[i\], \{ class: 'week-day-name' \}\)\)/);
  context.alignWeekRows(spread);
  assert.ok(labels.flat().every(label => label.style.minHeight === '38px'));
  labels[0][2].naturalHeight = 19;
  context.alignWeekRows(spread);
  assert.ok(labels.flat().every(label => label.style.minHeight === '19px'));
});

test('stacked pages align dates within each table without carrying desktop label heights', () => {
  const { spread, context, labels, pages } = fixture();
  context.alignWeekRows(spread);
  pages[1].getBoundingClientRect = () => ({ left: 0 });
  context.alignWeekRows(spread);
  assert.ok(labels[0].every(label => label.style.minHeight === '38px'));
  assert.ok(labels[1].every(label => label.style.minHeight === '19px'));
});

test('side-by-side weekly headers and each corresponding row take the taller height', () => {
  const { tops, tables, spread, context } = fixture();
  context.alignWeekRows(spread);
  assert.deepEqual(tops.map(top => top.style.minHeight), ['290px', '290px']);
  assert.deepEqual(tables.map(table => table.rows.map(row => row.style.height)),
    [['65px', '65px', '90px'], ['65px', '65px', '90px']]);
  context.alignWeekRows(spread);
  assert.deepEqual(tops.map(top => top.style.minHeight), ['290px', '290px']);
});

test('resizing either half recomputes heights and shrinking does not retain stale sizes', () => {
  const { tops, tables, spread, context } = fixture();
  context.alignWeekRows(spread);
  tops[1].naturalHeight = 420;
  tables[1].rows[2].naturalHeight = 180;
  context.alignWeekRows(spread);
  assert.deepEqual(tops.map(top => top.style.minHeight), ['420px', '420px']);
  assert.deepEqual(tables.map(table => table.rows[2].style.height), ['180px', '180px']);
  tops[1].naturalHeight = 240;
  tables[1].rows[2].naturalHeight = 75;
  context.alignWeekRows(spread);
  assert.deepEqual(tops.map(top => top.style.minHeight), ['290px', '290px']);
  assert.deepEqual(tables.map(table => table.rows[2].style.height), ['90px', '90px']);
});

test('stacked pages clear synchronized heights rather than retaining desktop gaps', () => {
  const { tops, tables, spread, context, pages } = fixture();
  context.alignWeekRows(spread);
  pages[1].getBoundingClientRect = () => ({ left: 0 });
  context.alignWeekRows(spread);
  assert.ok(tops.every(top => top.style.minHeight === ''));
  assert.ok(tables.every(table => table.rows.every(row => row.style.height === '')));
  context.alignWeekRows(null);
});
