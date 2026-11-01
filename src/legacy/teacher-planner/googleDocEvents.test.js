const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { documentRanges, parseDocumentEvents } = require('./googleDocEvents');
const paragraph = text => ({ paragraph: { elements: [{ textRun: { content: text + '\n' } }] } });
const cell = text => ({ content: text.split('\n').map(paragraph) });
const row = (...texts) => ({ tableCells: texts.map(cell) });
const params = {
  year: '2026', studentFirstDay: '2026-01-29',
  term1Start: '2026-01-26', term1End: '2026-04-02',
  term2Start: '2026-04-20', term2End: '2026-07-03',
  term3Start: '2026-07-20', term3End: '2026-09-25',
  term4Start: '2026-10-12', term4End: '2026-12-18'
};
function fixture(rows, heading = 'Term 4, 2026') {
  return { title: 'Fixture meetings', tabs: [{ documentTab: { body: { content: [
    paragraph(heading),
    { table: { tableRows: [row('Week', 'School events', 'Meets/Assemblies'), ...rows] } }
  ] } } }] };
}

test('school term mapping uses teaching weeks and first student day, with strict date validation', () => {
  const mapping = documentRanges(params);
  assert.equal(mapping.ranges[0].weeks[0], '2026-01-26');
  assert.equal(mapping.ranges[1].weeks.length, 11);
  assert.equal(documentRanges({ ...params, studentFirstDay: '2026-02-03' }).ranges[0].weeks[0], '2026-02-02');
  for (const overrides of [
    { year: 'bad' }, { term1Start: '2026-02-30' }, { term4End: '' },
    { term2Start: '2026-04-01' }, { term4End: '2027-01-01' }, { studentFirstDay: '2026-04-03' }
  ]) assert.throws(() => documentRanges({ ...params, ...overrides }));
});

test('merged weekly rows map hui to Tuesday and assemblies to Wednesday while undated events are weekly', () => {
  const doc = fixture([
    row('2', 'Sports photos\n* Open afternoon', 'Staff Hui: Planning'),
    row('Hapū assemblies: Term value\nAdditional assembly details'),
    row('3', '', 'Learning Area Hui: Course outlines'),
    row('', '', 'Year Level Assembly: Confidence')
  ]);
  const result = parseDocumentEvents(doc, documentRanges(params));
  assert.deepEqual(result.warnings, []);
  assert.equal(result.events.length, 6);
  assert.equal(result.events.find(e => e.name === 'Staff Hui: Planning').date, '2026-10-20');
  assert.match(result.events.find(e => e.name === 'Staff Hui: Planning').details, /15:30–16:30/);
  const assembly = result.events.find(e => e.name.startsWith('Hapū'));
  assert.equal(assembly.date, '2026-10-21');
  assert.match(assembly.details, /10:45–11:15/);
  assert.equal(assembly.startTime, '10:45');
  assert.equal(assembly.endTime, '11:15');
  assert.match(assembly.name, /Additional assembly details/);
  assert.equal(result.events.find(e => e.name.includes('Sports photos')).date, '2026-10-19');
  assert.match(result.events.find(e => e.name.includes('Sports photos')).name, /^Week of /);
  assert.match(result.events.find(e => e.name.includes('Sports photos')).details, /not a confirmed event date/);
});

test('explicit dates and days override defaults, including Friday assembly and no-hui notes', () => {
  const doc = fixture([
    row('10', '16th December Prizegiving', 'No Hui this week:'),
    row('Assembly School: On Friday at 8.45')
  ]);
  const result = parseDocumentEvents(doc, documentRanges(params));
  assert.deepEqual(result.warnings, []);
  const assembly = result.events.find(e => e.name.startsWith('Assembly'));
  assert.equal(assembly.date, '2026-12-18');
  assert.match(assembly.details, /08:45/);
  assert.doesNotMatch(assembly.details, /Period 2/);
  assert.equal(result.events.find(e => e.name.includes('No Hui')).date, '2026-12-14');
  assert.equal(result.events.find(e => e.name.includes('Prizegiving')).date, '2026-12-16');
  const term1 = parseDocumentEvents(fixture([
    row('4', '', 'Principal recruitment hui: Monday 16th'), row('Year level assemblies: Elections')
  ], 'Term 1, 2026'), documentRanges(params));
  assert.equal(term1.events[0].date, '2026-02-16');
});

test('document time fields use confirmed defaults only on matching days and preserve explicit time ranges', () => {
  const result = parseDocumentEvents(fixture([
    row('2', 'Photos on Thursday at 8.30', 'HOLA Hui'),
    row('Assembly School'),
    row('3', '', 'Learning Area Hui at 3.30-4.30pm'),
    row('Assembly on Friday'),
    row('4', '', 'Staff meeting: on Monday'),
    row('No Assembly this week')
  ]), documentRanges(params));
  assert.deepEqual(result.warnings, []);
  const byName = name => result.events.find(event => event.name === name);
  assert.equal(byName('HOLA Hui').startTime, '15:30');
  assert.equal(byName('HOLA Hui').endTime, '16:30');
  assert.equal(byName('Assembly School').startTime, '10:45');
  assert.equal(byName('Assembly School').endTime, '11:15');
  assert.equal(byName('Learning Area Hui at 3.30-4.30pm').startTime, '15:30');
  assert.equal(byName('Learning Area Hui at 3.30-4.30pm').endTime, '16:30');
  assert.equal(byName('Assembly on Friday').startTime, '');
  assert.equal(byName('Staff meeting: on Monday').startTime, '');
  assert.equal(byName('Photos on Thursday at 8.30').startTime, '08:30');
  assert.equal(byName('Photos on Thursday at 8.30').endTime, '');
  assert.equal(result.events.find(event => event.name.includes('No Assembly')).startTime, '');
});

test('updates replace source data, duplicates collapse, missing weeks and ambiguous rows are reported', () => {
  const doc = fixture([
    row('2', 'Photos\nPhotos', 'Staff Hui: Planning'),
    row('Assembly: Wednesday 20th'), row('11', 'Out of term', 'HOLA Hui: Planning'),
    row('unexpected format', 'do not guess'), row('Unclassified text')
  ]);
  const result = parseDocumentEvents(doc, documentRanges(params));
  assert.equal(result.events.filter(e => e.name.includes('Photos')).length, 1);
  assert.ok(result.warnings.some(w => w.includes('Day/date')));
  assert.ok(result.warnings.some(w => w.includes('outside')));
  assert.ok(result.warnings.some(w => w.includes('Unrecognised')));
  assert.ok(result.warnings.some(w => w.includes('recognised type')));
  const changed = parseDocumentEvents(fixture([row('2', '', 'Staff Hui: New agenda')]), documentRanges(params));
  assert.equal(changed.events.length, 1);
  assert.equal(changed.events[0].name, 'Staff Hui: New agenda');
  assert.throws(() => parseDocumentEvents(doc, documentRanges({ ...params, year: '2027',
    term1Start: '2027-02-01', term1End: '2027-04-01', term2Start: '2027-04-20', term2End: '2027-07-01',
    term3Start: '2027-07-20', term3End: '2027-09-25', term4Start: '2027-10-12', term4End: '2027-12-18',
    studentFirstDay: '2027-02-01'
  })), /document year/);
  assert.throws(() => parseDocumentEvents({ body: { content: [] } }, documentRanges(params)), /No supported/);
});

test('stated ranges without at preserve AM/PM and invalid ranges warn instead of inventing times', () => {
  const result = parseDocumentEvents(fixture([
    row('2', 'Photos on Thursday 11.30-12.30pm', 'Staff Hui 3.30-4.30pm'),
    row('Assembly 10.45am-11.15am'),
    row('3', '', 'Staff Hui at 13.30pm'),
    row('Assembly at 10.45-10.15am')
  ]), documentRanges(params));
  const photos = result.events.find(event => event.name.includes('Photos'));
  assert.equal(photos.startTime, '11:30');
  assert.equal(photos.endTime, '12:30');
  assert.equal(result.events.find(event => event.name.includes('Staff Hui')).endTime, '16:30');
  assert.equal(result.events.find(event => event.name.includes('Assembly')).startTime, '10:45');
  assert.equal(result.warnings.length, 2);
});

test('document tabs and reverse term order keep each table attached to its own heading', () => {
  const term4 = fixture([row('2', '', 'Staff Hui: Term four')]).tabs[0];
  const term3 = fixture([row('2', '', 'HOLA Hui: Term three')], 'Term 3, 2026').tabs[0];
  const term2 = fixture([row('2', '', 'Learning Area Hui: Term two')], 'Term 2, 2026').tabs[0];
  term3.childTabs = [term2];
  const result = parseDocumentEvents({ title: 'Tabbed source', tabs: [term4, term3] }, documentRanges(params));
  assert.deepEqual(result.events.map(event => event.date), ['2026-04-28', '2026-07-28', '2026-10-20']);
  assert.deepEqual(result.warnings, []);
  const invalid = parseDocumentEvents(fixture([
    row('2', '32/10/2026 Invalid date', 'Staff Hui: on Tuesday at 25.30'),
    row('Assembly: 30 October')
  ]), documentRanges(params));
  assert.equal(invalid.events.length, 0);
  assert.equal(invalid.warnings.length, 3);
});

function uiFixture() {
  const nodes = [];
  const el = (tag, text = '', attrs = {}) => {
    const node = {
      tag, textContent: text, attrs, dataset: {}, children: [], listeners: {}, isConnected: true,
      append(...children) { this.children.push(...children); },
      replaceChildren(...children) { this.children = children; },
      setAttribute(name, value) { this.attrs[name] = value; },
      addEventListener(name, listener) { this.listeners[name] = listener; }
    };
    nodes.push(node); return node;
  };
  const host = el('details'), events = [], requests = [], mutations = [];
  let failure = false, connected = true;
  const popup = { location: {}, close() {} };
  const context = { URLSearchParams, window: { open: () => popup } };
  vm.runInNewContext(fs.readFileSync(require.resolve('./public/google-doc-sync.js'), 'utf8'), context);
  context.plannerGoogleDocSync.mount(host, {
    el, year: 2026, setEvents: value => events.push(value),
    settings: async () => ({ settings: { content: { studentFirstDay: '2026-01-29' } },
      ranges: documentRanges(params).ranges.map(item => ({ term: item.term, startDate: item.start, endDate: item.end })) }),
    request: async path => {
      requests.push(path);
      if (path === 'google-calendar/') return { configured: true, connected, docsEnabled: connected, email: 'fixture@school.test', connectionId: 'fixture' };
      if (failure) throw new Error('Fixture Docs API unavailable');
      return { connectionId: 'fixture', events: [{ date: '2026-10-20', name: 'Hui' }], warnings: [], fetchedAt: '2026-10-18T08:00:00Z' };
    },
    mutate: async (path, body) => { mutations.push({ path, body }); return { url: 'https://accounts.google.com/fixture' }; }
  });
  return { nodes, host, events, requests, mutations, popup,
    fail: () => { failure = true; }, disconnect: () => { connected = false; } };
}

test('Google Doc card syncs on opening, replaces events on refresh and explicitly clears failed sources', async () => {
  const fixture = uiFixture();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(fixture.events.at(-1)[0].name, 'Hui');
  assert.match(fixture.requests[1], /studentFirstDay=2026-01-29/);
  assert.match(fixture.requests[1], /term4Start=2026-10-12/);
  const sync = fixture.nodes.find(node => node.textContent === 'Sync now');
  await sync.listeners.click();
  assert.equal(fixture.events.at(-1).length, 1);
  fixture.fail();
  await sync.listeners.click();
  assert.equal(fixture.events.at(-1).length, 0);
  assert.equal(fixture.host.open, true);
  assert.ok(fixture.nodes.some(node => node.attrs.role === 'alert' && /No document events/.test(node.textContent)));
  assert.equal(sync.disabled, false);
});

test('Google Doc consent requests read-only Docs through existing connection without navigation or saving plans', async () => {
  const fixture = uiFixture();
  await new Promise(resolve => setImmediate(resolve));
  const connect = fixture.nodes.find(node => node.tag === 'button' && node.textContent.includes('Reconnect'));
  await connect.listeners.click();
  assert.equal(fixture.mutations.length, 1);
  assert.equal(fixture.mutations[0].path, 'connect');
  assert.equal(fixture.mutations[0].body.includeDocs, true);
  assert.equal(fixture.popup.location.href, 'https://accounts.google.com/fixture');
  fixture.disconnect();
  await fixture.nodes.find(node => node.textContent === 'Sync now').listeners.click();
  assert.equal(fixture.events.at(-1).length, 0);
  assert.ok(fixture.nodes.some(node => /Enable Google Docs access, complete Google consent/.test(node.textContent)));
});
