const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('./public/term-trello.js'), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));
const walk = node => [node, ...node.children.flatMap(walk)];

function fixture() {
  function el(tag, text = '', attrs = {}) {
    return { tag, textContent: text, attrs, children: [], events: {}, isConnected: true, hidden: false, value: '',
      append(...items) { this.children.push(...items); }, replaceChildren(...items) { this.children = items; },
      setAttribute(name, value) { this.attrs[name] = value; }, addEventListener(name, handler) { this.events[name] = handler; } };
  }
  const context = { console: { error() {} } };
  vm.runInNewContext(source, context);
  const host = el('section'), notes = el('div'), area = el('textarea', '', { name: 'information' });
  area.value = 'Unsaved term notes';
  notes.append(area);
  const calls = [];
  let result = { year: 2027, term: 4, status: 'ok', fetchedAt: '2027-10-01T00:00:00Z', cards: [
    { title: '<img onerror=bad()>', summary: 'Umbrella responsibility', due: '2027-11-01T00:00:00Z',
      start: null, url: 'https://trello.com/c/AbCd1234', labels: [] }
  ] }, failure, pending, expanded = 0;
  context.plannerTermTrello.mount(host, { el, notes, year: 2027, term: '4',
    expandNotes: () => expanded++, request: async path => {
      calls.push(path);
      if (failure) throw new Error(failure);
      if (pending) return pending;
      return result;
    } });
  const find = text => walk(host).find(node => node.textContent === text);
  const panel = host.children[2];
  return { host, notes, area, panel, calls, find, expanded: () => expanded,
    setResult: value => { result = value; }, fail: value => { failure = value; }, pend: value => { pending = value; } };
}

test('Notes default and toggling retain the same unsaved form inputs and make only selected-term reads', async () => {
  const f = fixture();
  assert.equal(f.notes.hidden, false);
  assert.equal(f.panel.hidden, true);
  assert.equal(f.calls.length, 0);
  f.find('Trello').events.click(); await flush();
  assert.deepEqual(f.calls, ['trello/2027/4']);
  assert.equal(f.notes.hidden, true);
  assert.equal(f.area.value, 'Unsaved term notes');
  assert.equal(f.area.attrs.name, 'information', 'hidden notes remain successful form controls');
  assert.equal(f.area.disabled, undefined);
  assert.equal(f.find('<img onerror=bad()>').tag, 'h4', 'card text is not interpreted as HTML');
  assert.equal(f.find('Open Trello card').attrs.rel, 'noopener noreferrer');
  f.find('Notes').events.click();
  assert.equal(f.host.children[1], f.notes);
  assert.equal(f.notes.children[0], f.area);
  assert.equal(f.area.value, 'Unsaved term notes');
  assert.equal(f.panel.hidden, true);
  assert.equal(f.expanded(), 1, 'restored notes are resized after being shown');
  f.find('Trello').events.click(); await flush();
  assert.equal(f.calls.length, 2, 'switching back rereads the source without writing either source');
});

test('all labels have separate accents and readable names, while unlabelled cards retain a neutral border', async () => {
  const f = fixture();
  f.setResult({ year: 2027, term: 4, status: 'ok', fetchedAt: '2027-10-01T00:00:00Z', cards: [
    { title: 'Unchanged title', summary: 'Unchanged summary', url: 'https://trello.com/c/AbCd1234', labels: [
      { name: 'Uncoloured category', color: null }, { name: '<img onerror=bad()>', color: 'blue' },
      { name: '   ', color: 'yellow_light' }
    ] },
    { title: 'No labels', url: 'https://trello.com/c/EfGh5678', labels: [] }
  ] });
  f.find('Trello').events.click(); await flush();
  const items = f.panel.children[3].children;
  assert.equal(items[0].attrs['data-trello-colour'], 'blue', 'first coloured label supplies the card accent, not its title');
  assert.equal(items[1].attrs['data-trello-colour'], undefined, 'no label leaves the neutral CSS border');
  const labels = items[0].children[1];
  assert.equal(labels.attrs['aria-label'], 'Trello labels');
  assert.deepEqual(labels.children.map(label => [label.textContent, label.attrs['data-trello-colour']]),
    [['Uncoloured category', undefined], ['<img onerror=bad()>', 'blue'], ['yellow light label', 'yellow_light']]);
  assert.equal(labels.children[1].tag, 'span', 'label names are text, not HTML');
  assert.equal(f.find('Unchanged title').tag, 'h4');
  assert.equal(f.find('Unchanged summary').tag, 'p');
  assert.equal(f.area.value, 'Unsaved term notes');
});

test('missing and empty lists stay distinct from errors and refresh retries without losing notes', async () => {
  const f = fixture();
  for (const state of ['missing', 'empty']) {
    f.setResult({ year: 2027, term: 4, status: state, cards: [] });
    f.find('Trello').events.click(); await flush();
    assert.match(f.panel.children[2].textContent, state === 'missing' ? /No matching.*no list was created/ : /list is empty.*no cards were created/);
  }
  f.fail('Trello token expired.');
  f.find('Refresh Trello').events.click(); await flush();
  assert.equal(f.panel.children[2].attrs.role, 'alert');
  assert.match(f.panel.children[2].textContent, /token expired/);
  assert.equal(f.find('Refresh Trello').disabled, false);
  assert.equal(f.area.value, 'Unsaved term notes');
  f.fail(null);
  f.find('Refresh Trello').events.click(); await flush();
  assert.equal(f.panel.children[2].attrs.role, 'status');
});

test('late Trello responses cannot switch Notes back or populate a different term component', async () => {
  const f = fixture();
  let resolve;
  f.pend(new Promise(done => { resolve = done; }));
  f.find('Trello').events.click();
  f.find('Notes').events.click();
  resolve({ year: 2027, term: 4, status: 'ok', fetchedAt: '2027-10-01T00:00:00Z',
    cards: [{ title: 'Late card', url: 'https://trello.com/c/AbCd1234', labels: [] }] });
  await flush();
  assert.equal(f.notes.hidden, false);
  assert.equal(f.panel.hidden, true);
  assert.equal(f.area.value, 'Unsaved term notes');

  const g = fixture();
  g.pend(new Promise(done => { resolve = done; }));
  g.find('Trello').events.click();
  g.find('Notes').events.click();
  g.panel.isConnected = false;
  resolve({ year: 2027, term: 4, status: 'ok', cards: [{ title: 'Stale card' }] });
  await flush();
  assert.equal(g.notes.hidden, false);
  assert.equal(g.panel.hidden, true);
  assert.equal(g.find('Stale card'), undefined);
  assert.equal(g.area.value, 'Unsaved term notes');
});
