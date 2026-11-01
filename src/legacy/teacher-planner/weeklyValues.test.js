const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('./public/planner.js'), 'utf8');
const terms = [{ term: 4, startDate: '2026-10-12', endDate: '2026-12-11' }];
function fixture() {
  const nodes = [];
  function el(tag, text = '', attrs = {}) {
    const node = {
      tag, textContent: text, attrs, children: [], handlers: {},
      append(...children) { this.children.push(...children); },
      replaceChildren(...children) { this.children = children; },
      addEventListener(event, handler) { this.handlers[event] = handler; },
      querySelector() { return null; }, querySelectorAll() { return []; },
      showModal() { this.open = true; }, close() { this.open = false; }
    };
    nodes.push(node); return node;
  }
  const host = el('div'), errors = [];
  const context = {
    year: 2026, assets: '/framework/', el,
    content: { querySelector: selector => { assert.equal(selector, '#weekly-value-resource'); return host; } },
    console: { error: text => errors.push(text) },
    date: value => new Date(value + 'T00:00:00Z'), iso: value => value.toISOString().slice(0, 10)
  };
  vm.runInNewContext(
    source.slice(source.indexOf('  function termRanges('), source.indexOf('  async function loadTermDates(')) +
    source.slice(source.indexOf('  function weeklyTerm('), source.indexOf('  function fillWeeklyPrompts(')), context);
  return { context, nodes, host, errors };
}

test('all nine Term 4 posters use the actual term week, not manual labels or calendar week numbers', () => {
  const { context } = fixture();
  for (let week = 1; week <= 9; week++) {
    const day = new Date('2026-10-12T00:00:00Z'); day.setUTCDate(day.getUTCDate() + 7 * (week - 1));
    const resource = context.weeklyValueResource({}, terms, day.toISOString().slice(0, 10));
    assert.equal(resource.title, 'Kaitiakitanga - Term 4, Week ' + week);
    assert.equal(resource.path, 'values/2026-term-4/week-' + week);
  }
  assert.equal(context.weeklyValueResource({ term4Start: '2026-10-19', term4End: '2026-12-18' }, terms, '2026-10-19').path,
    'values/2026-term-4/week-1', 'published WHS dates take precedence');
  for (const day of ['2026-10-05', '2026-12-14']) assert.equal(context.weeklyValueResource({}, terms, day), null);
  assert.equal(context.weeklyValueResource({}, [], '2026-10-19'), null);
  context.year = 2027;
  assert.equal(context.weeklyValueResource({}, [{ term: 4, startDate: '2027-10-11', endDate: '2027-12-17' }], '2027-10-18'), null);
});

test('every thumbnail and full-resolution poster exists with a distinct correctly sized JPEG', () => {
  const hashes = new Set();
  for (let week = 1; week <= 9; week++) {
    for (const suffix of ['', '-thumb']) {
      const buffer = fs.readFileSync(path.join(__dirname, 'public', 'values', '2026-term-4', 'week-' + week + suffix + '.jpg'));
      assert.equal(buffer.readUInt16BE(0), 0xffd8);
      assert.ok(buffer.length > 10000);
      assert.ok(buffer.length < (suffix ? 80000 : 1200000));
      hashes.add(require('node:crypto').createHash('sha256').update(buffer).digest('hex'));
    }
  }
  assert.equal(hashes.size, 18);
});

test('poster opens on demand in a labelled native dialog with close and full-resolution controls', () => {
  const { context, host, nodes } = fixture();
  context.renderWeeklyValue({}, terms, '2026-10-19');
  assert.equal(host.children.length, 2);
  const [button, dialog] = host.children;
  assert.equal(button.attrs.type, 'button', 'opening cannot submit private planning notes');
  assert.equal(button.attrs['aria-haspopup'], 'dialog');
  assert.equal(button.children[0].attrs.src, '/framework/values/2026-term-4/week-2-thumb.jpg');
  assert.equal(dialog.attrs['aria-labelledby'], 'weekly-value-title');
  const image = dialog.children[1];
  assert.equal(image.src, undefined, 'large image is not loaded with the weekly page');
  button.handlers.click();
  assert.equal(dialog.open, true);
  assert.equal(image.src, '/framework/values/2026-term-4/week-2.jpg');
  const close = nodes.find(node => node.textContent === 'Close poster');
  close.handlers.click();
  assert.equal(dialog.open, false);
  const link = nodes.find(node => node.tag === 'a');
  assert.equal(link.attrs.target, '_blank');
  assert.equal(link.attrs.rel, 'noopener noreferrer');
  context.renderWeeklyValue({}, terms, '2026-10-05');
  assert.equal(host.children.length, 0, 'no stale poster remains in holidays');
});

test('image errors are explicit without changing the editable value field', () => {
  const { context, host, errors } = fixture();
  context.renderWeeklyValue({}, terms, '2026-10-19');
  const [button, dialog] = host.children;
  button.children[0].handlers.error();
  assert.match(host.children[2].textContent, /could not be loaded/);
  dialog.children[1].handlers.error();
  assert.match(dialog.children[2].textContent, /reopen it to retry/);
  assert.equal(errors.length, 2);
  assert.match(source, /valueField\.append\(el\('div', '', \{ id: 'weekly-value-resource' \}\)\)/);
  assert.match(source, /name === 'value' && weeklyValueResource/);
});
