const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('./public/planner.js'), 'utf8');
const event = (id, day, start, end, title = id) => ({
  id, title, start: day + 'T' + start + ':00', end: day + 'T' + end + ':00', allDay: false
});

function fixture(request = async () => ({ subscription_url: '' })) {
  const nodes = [];
  const el = (tag, text = '', attrs = {}) => {
    const node = {
      tag, textContent: text, attrs, dataset: {}, children: [], handlers: {},
      append(...items) { this.children.push(...items); },
      replaceChildren(...items) { this.children = items; },
      setAttribute(key, value) { this.attrs[key] = value; },
      removeAttribute(key) { delete this.attrs[key]; },
      addEventListener(name, handler) { this.handlers[name] = handler; }
    };
    nodes.push(node); return node;
  };
  const slots = source.slice(source.indexOf('  const slots ='), source.indexOf('  const fields ='));
  const errors = [];
  const context = {
    el, api: '/api/planner/', request, refreshSession: async () => {}, console: { error: message => errors.push(message) },
    date: value => new Date(value + 'T00:00:00Z'), iso: value => value.toISOString().slice(0, 10),
    alignWeekRows: () => {}, Intl
  };
  vm.runInNewContext(slots +
    source.slice(source.indexOf('  function overviewSchoolEvents('), source.indexOf('  function weeklyTimetableEntries(')) +
    source.slice(source.indexOf('  function weeklyTimetableEntries('), source.indexOf('  function alignWeekRows(')) +
    source.slice(source.indexOf('  function kamarEventDate('), source.indexOf('  function renderKamarWeek(')), context);
  const hosts = Array.from({ length: 5 }, (_, i) => ['whanau', 'p1', 'p2', 'p3', 'p4', 'p5'].map(slot => {
    const host = el('div'); host.dataset.weeklyClasses = slot + ':' + i; return host;
  })).flat();
  const notes = { value: 'Private notes and unsaved edits' };
  const spread = {
    isConnected: true, before(panel) { this.panel = panel; },
    querySelectorAll(selector) {
      assert.equal(selector, '[data-weekly-classes]', 'loader must never query or write editable note fields');
      return hosts;
    }
  };
  return { context, spread, hosts, notes, nodes, errors };
}
const plain = value => JSON.parse(JSON.stringify(value));
const flush = () => new Promise(resolve => setImmediate(resolve));
test('attendance scheduling can use every timetable class without the weekly four-class display limit', () => {
  const { context } = fixture();
  const events = Array.from({ length: 6 }, (_, index) =>
    event('class-' + index, '2026-10-19', '09:00', '10:00', 'CLASS' + index));
  assert.equal(context.weeklyTimetableEntries(events, '2026-10-19')['p1:0'].length, 4);
  assert.equal(context.weeklyTimetableEntries(events, '2026-10-19', Infinity)['p1:0'].length, 6);
});

test('school events use exact NZ dates, every overlapping block, and all-day notices including weekends', () => {
  const { context } = fixture();
  const allDay = { id: 'clinic', title: 'Dental clinic', start: '2026-10-19', end: '2026-10-26', allDay: true };
  const events = [
    allDay, allDay,
    event('assembly', '2026-10-19', '10:45', '11:30', '<img onerror=bad()>'),
    event('late', '2026-10-19', '14:30', '16:00'),
    event('gap', '2026-10-20', '08:00', '08:45'),
    event('weekend', '2026-10-24', '10:00', '11:00'),
    { id: 'utc', title: 'NZ morning', start: '2026-10-18T20:00:00Z', end: '2026-10-18T21:00:00Z', allDay: false },
    event('next', '2026-10-26', '09:00', '10:00')
  ];
  const result = plain(context.weeklySchoolEntries(events, '2026-10-19'));
  assert.equal(result.notices.length, 7);
  assert.ok(result.notices.every(day => day.entries.length === 1));
  assert.equal(result.notices[6].date, '2026-10-25');
  for (const slot of ['p2', 'interval', 'p3']) assert.equal(result.cells[slot + ':0'][0].title, '<img onerror=bad()>');
  assert.equal(result.cells['p1:0'][0].time, '09:00 - 10:00');
  assert.equal(result.cells['p5:0'][0].title, 'late');
  assert.equal(result.cells['meetings:0'][0].title, 'late');
  assert.deepEqual(result.outside.map(day => day.date), ['2026-10-19', '2026-10-20', '2026-10-24']);
  assert.equal(result.outside[0].entries[0].title, 'late', '15:00-15:10 gap remains explicitly visible');
  assert.ok(!JSON.stringify(result).includes('"next"'));
  assert.equal(context.weeklySchoolEntries(events, '2026-10-26').notices.length, 0, 'all-day end is exclusive');
});

test('school events retain all entries, span midnight correctly and respect winter NZ time', () => {
  const { context } = fixture();
  const many = Array.from({ length: 5 }, (_, i) => event('event-' + i, '2026-06-08', '09:00', '10:00'));
  many.push({ id: 'winter', title: 'Winter NZ', start: '2026-06-07T21:00:00Z', end: '2026-06-07T22:00:00Z', allDay: false },
    { id: 'overnight', title: 'Overnight', start: '2026-06-08T23:00:00', end: '2026-06-09T00:00:00', allDay: false });
  const result = plain(context.weeklySchoolEntries(many, '2026-06-08'));
  assert.equal(result.cells['p1:0'].length, 6, 'school events are not limited to the three-class limit');
  assert.equal(result.cells['p1:0'].find(entry => entry.title === 'Winter NZ').time, '09:00 - 10:00');
  assert.equal(result.outside.length, 1);
  assert.equal(result.outside[0].entries[0].time, '2026-06-08 23:00 - 2026-06-09 00:00');
});

test('after-work row uses 15:10-22:00 and moves covered evening events out of Notices with exact boundaries', () => {
  const { context } = fixture();
  const result = plain(context.weeklySchoolEntries([
    event('before', '2026-10-19', '15:00', '15:10'),
    event('start', '2026-10-19', '15:10', '15:30'),
    event('evening', '2026-10-19', '17:00', '19:00'),
    event('finish', '2026-10-19', '21:30', '22:00'),
    event('after', '2026-10-19', '22:00', '22:30'),
    event('partial', '2026-10-20', '21:30', '22:30'),
    event('weekend', '2026-10-24', '17:00', '19:00'),
    { id: 'all-day', title: 'All day', start: '2026-10-19', end: '2026-10-20', allDay: true }
  ], '2026-10-19'));
  assert.deepEqual(result.cells['meetings:0'].map(entry => entry.title), ['start', 'evening', 'finish']);
  assert.deepEqual(result.cells['meetings:1'].map(entry => entry.title), ['partial']);
  assert.deepEqual(result.outside.flatMap(day => day.entries.map(entry => entry.title)), ['before', 'after', 'partial', 'weekend']);
  assert.equal(result.notices[0].entries[0].title, 'All day');
  assert.match(source, /\['meetings', 'I muri i ngā hui mahi \| after work meetings', '15:10-22:00'\]/);
});

function schoolFixture(request) {
  const f = fixture(request);
  f.overviewSources = f.context.weeklyOverviewSources;
  f.context.weeklyOverviewSources = async () => [];
  const notices = f.context.el('div');
  const hosts = Array.from({ length: 5 }, (_, i) => ['email', 'whanau', 'p1', 'p2', 'interval', 'p3', 'p4', 'lunch', 'p5', 'meetings'].map(slot => {
    const host = f.context.el('div'); host.dataset.weeklySchoolEvents = slot + ':' + i; return host;
  })).flat();
  f.spread.querySelector = selector => {
    assert.equal(selector, '.weekly-school-notices'); return notices;
  };
  f.spread.querySelectorAll = selector => {
    if (selector === '[data-week-day]') return [];
    assert.equal(selector, '[data-weekly-school-events]', 'school loader never accesses editable notes');
    return hosts;
  };
  return { ...f, notices, schoolHosts: hosts };
}

test('public holiday highlighting shades every cell in only the matching day and clears on retry', () => {
  const f = fixture();
  const cells = Array.from({ length: 5 }, (_, i) => Array.from({ length: 12 }, () => {
    const cell = f.context.el('td');
    cell.dataset.weekDay = String(i);
    return cell;
  })).flat();
  const spread = { querySelectorAll: () => cells };
  f.context.highlightWeeklyPublicHolidays(spread, '2026-10-26', [{ date: '2026-10-26', name: 'Labour Day' }]);
  assert.equal(cells.filter(cell => Object.hasOwn(cell.attrs, 'data-public-holiday')).length, 12);
  assert.equal(cells[0].attrs.title, 'Labour Day');
  assert.equal(cells[12].attrs.title, undefined);
  f.context.highlightWeeklyPublicHolidays(spread, '2026-10-26', []);
  assert.ok(cells.every(cell => !Object.hasOwn(cell.attrs, 'data-public-holiday') && !Object.hasOwn(cell.attrs, 'title')));
});

test('Year Overview timed entries use meetings and assembly blocks; duplicate sources collapse without hiding distinct events or days', () => {
  const { context } = fixture();
  const overview = context.overviewSchoolEvents([
    { date: '2026-10-20', name: 'Staff Hui', startTime: '15:30', endTime: '16:30' },
    { date: '2026-10-21', name: 'Assembly School', startTime: '10:45', endTime: '11:15' },
    { date: '2026-10-19', name: 'School holidays' },
    { date: '2026-10-20', name: 'School holidays' },
    { date: '2026-10-20', name: 'Photos', startTime: '08:30', endTime: '' },
    { date: '2026-10-19', name: 'Week of 2026-10-19: Sports', weeklyReference: true }
  ]);
  const result = plain(context.weeklySchoolEntries([
    event('staff', '2026-10-20', '15:30', '16:30', 'Staff Meeting'),
    event('assembly', '2026-10-21', '10:45', '11:15', 'School Assembly'),
    event('separate', '2026-10-21', '12:00', '12:30', 'School Assembly'),
    { id: 'holiday', title: 'School holidays', start: '2026-10-19', end: '2026-10-22', allDay: true },
    ...overview
  ], '2026-10-19'));
  assert.equal(result.cells['meetings:1'].length, 1);
  assert.equal(result.cells['meetings:1'][0].time, '15:30 - 16:30');
  assert.equal(result.cells['p2:2'].length, 1);
  assert.equal(result.cells['interval:2'].length, 1);
  assert.equal(result.cells['p3:2'][0].time, '12:00 - 12:30', 'distinct times retained');
  assert.equal(result.notices.filter(day => day.entries.some(entry => entry.title === 'School holidays')).length, 3);
  assert.ok(result.notices.every(day => day.entries.filter(entry => entry.title === 'School holidays').length <= 1));
  assert.ok(result.notices[0].entries.some(entry => entry.title.startsWith('Week of ')));
  assert.equal(result.outside[0].entries[0].time, '08:30 (finish not specified)');
});

test('a timed entry replaces only its matching all-day occurrence, not remaining days of a multi-day notice', () => {
  const { context } = fixture();
  const result = plain(context.weeklySchoolEntries([
    { id: 'days', title: 'School photos', start: '2026-10-19', end: '2026-10-22', allDay: true },
    event('timed', '2026-10-20', '09:00', '10:00', 'school photos')
  ], '2026-10-19'));
  assert.equal(result.cells['p1:1'].length, 1);
  assert.deepEqual(result.notices.map(day => day.date), ['2026-10-19', '2026-10-21']);
});

test('start-only duplicate prefers confirmed duration; undated weekly references never become Monday appointments', () => {
  const { context } = fixture();
  const result = plain(context.weeklySchoolEntries([
    ...context.overviewSchoolEvents([
      { date: '2026-10-20', name: 'Photos', startTime: '09:00' },
      { date: '2026-10-19', name: 'Week of 2026-10-19: Training at 9.00', startTime: '09:00', weeklyReference: true }
    ]),
    event('photos', '2026-10-20', '09:00', '10:00', 'Photos')
  ], '2026-10-19'));
  assert.equal(result.cells['p1:1'].length, 1);
  assert.equal(result.cells['p1:1'][0].time, '09:00 - 10:00');
  assert.equal(result.cells['p1:0'], undefined);
  assert.ok(result.notices[0].entries[0].title.startsWith('Week of '));
});

test('weekly overview sources read shared dates, holidays and private Docs for both years', async () => {
  const calls = [], docs = [];
  const f = schoolFixture(async url => {
    calls.push(url);
    const y = Number(url.split('/').pop());
    if (url.includes('school-settings/')) return { content: { studentFirstDay: y + '-01-29',
      events: [{ date: y + '-01-01', label: 'School closed' }] } };
    return { year: y, available: true, publicHolidays: [{ date: y + '-01-01', name: 'New Year' }],
      holidays: [], publicHolidaysError: '' };
  });
  f.context.setupDates = [['studentFirstDay', 'First student day']];
  f.context.loadTermDates = async y => ({ fixtureYear: y });
  f.context.plannerGoogleDocSync = { loadEvents: async options => {
    docs.push([options.year, (await options.settings()).fixtureYear]);
    return { events: [{ date: options.year + '-01-01', name: 'Document event' }], warnings: [] };
  } };
  const sources = await f.overviewSources('2026-12-28');
  assert.equal(sources.length, 6);
  const results = await Promise.all(sources.map(source => source.load()));
  assert.deepEqual(docs, [[2026, 2026], [2027, 2027]]);
  assert.ok(calls.includes('/api/planner/school-settings/2026'));
  assert.ok(calls.includes('/api/school-calendar/2027'));
  assert.equal(results[0].events.length, 2);
  assert.equal(results[2].events[0].title, 'Document event');
});

test('overview source failure is explicit while successful KAMAR events remain visible; retry merges without duplicates', async () => {
  const f = schoolFixture(async () => ({ events: [event('staff', '2026-10-20', '15:30', '16:30', 'Staff Hui')] }));
  let fail = true;
  f.context.weeklyOverviewSources = async () => [{ name: 'Year Overview meetings', load: async () => {
    if (fail) throw new Error('Docs consent required.');
    return { events: f.context.overviewSchoolEvents([
      { date: '2026-10-20', name: 'Staff Meeting', startTime: '15:30', endTime: '16:30' }
    ]), warnings: ['Source row needs attention.'] };
  } }];
  f.context.mountWeeklySchoolEvents(f.spread, '2026-10-19'); await flush();
  const [message, retry] = f.notices.children;
  const host = f.schoolHosts.find(node => node.dataset.weeklySchoolEvents === 'meetings:1');
  assert.equal(host.children.length, 1);
  assert.equal(message.attrs.role, 'alert');
  assert.match(message.textContent, /Year Overview meetings: Docs consent required/);
  fail = false; await retry.handlers.click();
  assert.equal(host.children.length, 1);
  assert.match(message.textContent, /Source row needs attention/);
  assert.equal(retry.hidden, false);
  assert.equal(f.notes.value, 'Private notes and unsaved edits');
});

test('school loader fetches both months including Sunday, deduplicates, and renders text without editing notes', async () => {
  const calls = [];
  const f = schoolFixture(async url => {
    calls.push(url);
    return { events: [event('school', '2026-08-31', '09:00', '10:00', '<script>literal title</script>'),
      { id: 'day', title: 'Sunday notice', start: '2026-09-06', end: '2026-09-07', allDay: true }] };
  });
  f.context.mountWeeklySchoolEvents(f.spread, '2026-08-31'); await flush();
  assert.deepEqual(calls, ['/api/kamar-calendar/2026/8', '/api/kamar-calendar/2026/9']);
  const cell = f.schoolHosts.find(host => host.dataset.weeklySchoolEvents === 'p1:0');
  assert.equal(cell.children.length, 1);
  assert.equal(cell.children[0].textContent, '<script>literal title</script>');
  assert.equal(cell.children[0].children[0].textContent, '09:00 - 10:00 NZ');
  assert.ok(f.nodes.some(node => node.textContent === new Intl.DateTimeFormat('en-NZ', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC'
  }).format(new Date('2026-09-06T00:00:00Z'))));
  assert.equal(f.notes.value, 'Private notes and unsaved edits');
  assert.match(f.notices.children[0].textContent, /Your own notices/);
});

test('school loader reports failure, allows retry, clears empty results and ignores detached responses', async () => {
  let fail = true;
  const f = schoolFixture(async () => {
    if (fail) throw new Error('School feed unavailable.');
    return { events: [] };
  });
  f.context.mountWeeklySchoolEvents(f.spread, '2026-10-19'); await flush();
  const [message, retry] = f.notices.children;
  assert.equal(message.attrs.role, 'alert');
  assert.equal(retry.hidden, false);
  assert.equal(f.errors.length, 1);
  fail = false; await retry.handlers.click();
  assert.equal(retry.hidden, true);
  assert.match(message.textContent, /No school events/);
  let finish;
  const stale = schoolFixture(() => new Promise(resolve => { finish = resolve; }));
  stale.context.mountWeeklySchoolEvents(stale.spread, '2026-10-19'); await flush();
  stale.spread.isConnected = false;
  finish({ events: [event('stale', '2026-10-19', '09:00', '10:00')] }); await flush();
  assert.ok(stale.schoolHosts.every(host => !host.children.length));
});

test('weekly classes match dated periods, show up to four and deduplicate cross-month feeds', () => {
  const { context } = fixture();
  const events = ['11COMP', '11DTECH', '12DTECH', '13COMP'].map((title, i) =>
    event('class' + i, '2026-10-19', '09:00', '10:00', title));
  events.push(events[0], event('other week', '2026-10-12', '09:00', '10:00'),
    event('Tuesday', '2026-10-20', '10:00', '11:00'));
  const cells = plain(context.weeklyTimetableEntries(events, '2026-10-19'));
  assert.deepEqual(cells['p1:0'].map(item => item.title), ['11DTECH', '12DTECH', '11COMP', '13COMP']);
  assert.equal(cells['p2:0'].length, 0, 'end boundary is exclusive');
  assert.deepEqual(cells['p2:1'], [{ title: 'Tuesday', schoolGroup: '', time: '10:00-11:00' }]);
  assert.equal(cells['p1:2'].length, 0);
  assert.ok(!JSON.stringify(cells).includes('+ more'));
});

test('mixed weekly classes put Junior and Middle School before seniors before applying the four-class limit', () => {
  const { context } = fixture();
  for (const junior of ['SRDTECH', 'PIDTECH (JPI)', '9DTECH', '10DTECH', 'MDTECH (81D)']) {
    const titles = ['11COMP (4)', '12COMP (4)', '13COMP (4)', junior, '13DTECH'];
    const events = titles.map((title, i) => event(String(i), '2026-10-30', '11:20', '12:20', title));
    const cells = plain(context.weeklyTimetableEntries(events, '2026-10-26'));
    assert.deepEqual(cells['p3:4'].map(item => item.title), [junior, '13DTECH', '11COMP (4)', '12COMP (4)']);
    assert.equal(cells['p3:4'][0].schoolGroup, /^(9|10|M)/.test(junior) ? 'middle' : 'junior');
    assert.ok(cells['p3:4'].slice(1).every(item => !item.schoolGroup));
    assert.ok(cells['p3:4'].every(item => item.time === '11:20-12:20'));
  }
  const events = ['11COMP', 'SRDTECH', '12COMP', 'PIDTECH', '13COMP'].map((title, i) =>
    event(String(i), '2026-10-30', '11:20', '12:20', title));
  assert.deepEqual(plain(context.weeklyTimetableEntries(events, '2026-10-26'))['p3:4'].map(item => item.title),
    ['SRDTECH', 'PIDTECH', '11COMP', '12COMP'], 'relative order within each group stays unchanged');
});

test('Friday mixed period shows SRDTECH and three DTECH levels ahead of online entries and other seniors', () => {
  const { context } = fixture();
  const titles = ['DTonline (4)', '11COMP (4)', '12COMP (4)', '13COMP (4)', 'DTonline (student)',
    '13DTECH (4)', '12DTECH (4)', '11DTECH (4)', 'SRDTECH', 'Pathways (4)', 'TIMETABLE (VP)'];
  const events = titles.map((title, i) => event(String(i), '2026-10-30', '11:20', '12:20', title));
  const cells = plain(context.weeklyTimetableEntries(events, '2026-10-26'));
  assert.deepEqual(cells['p3:4'].map(item => item.title),
    ['SRDTECH', '11DTECH (4)', '12DTECH (4)', '13DTECH (4)']);
  const noJunior = events.filter(item => item.title !== 'SRDTECH');
  assert.deepEqual(plain(context.weeklyTimetableEntries(noJunior, '2026-10-26'))['p3:4'].map(item => item.title),
    ['11DTECH (4)', '12DTECH (4)', '13DTECH (4)', '11COMP (4)']);
});

test('term-specific times come from actual dates, not a repeating weekday template', () => {
  const { context } = fixture();
  const events = [
    event('Term 1', '2026-02-02', '09:00', '10:00'),
    event('Term 4', '2026-10-19', '09:10', '10:10'),
    event('Whanau', '2026-10-19', '08:45', '09:00')
  ];
  const cells = context.weeklyTimetableEntries(events, '2026-10-19');
  assert.equal(cells['whanau:0'][0].title, 'Whanau');
  assert.deepEqual(plain(cells['p1:0']), [{ title: 'Term 4', schoolGroup: '', time: '09:10-10:10' }]);
  assert.equal(cells['p2:0'][0].title, 'Term 4', 'overlapping class appears in both periods');
  assert.equal(context.weeklyTimetableEntries(events, '2026-02-02')['p1:0'][0].time, '09:00-10:00');
});

test('NZ standard/daylight time is respected and all-day, breaks and after-school events stay out', () => {
  const { context } = fixture();
  const summer = { id: 'summer', title: '<script>not HTML</script>', start: '2026-10-18T20:00:00Z', end: '2026-10-18T21:00:00Z', allDay: false };
  const winter = { id: 'winter', title: 'Winter', start: '2026-06-07T21:00:00Z', end: '2026-06-07T22:00:00Z', allDay: false };
  const events = [summer, winter, { id: 'all day', title: 'All day', start: '2026-10-19', end: '2026-10-20', allDay: true },
    event('Interval', '2026-10-19', '11:00', '11:20'), event('Lunch', '2026-10-19', '13:20', '14:00'),
    event('Meeting', '2026-10-19', '15:00', '16:00')];
  assert.deepEqual(plain(context.weeklyTimetableEntries(events, '2026-10-19')['p1:0']),
    [{ title: summer.title, schoolGroup: '', time: '09:00-10:00' }]);
  assert.deepEqual(plain(context.weeklyTimetableEntries(events, '2026-06-08')['p1:0']),
    [{ title: 'Winter', schoolGroup: '', time: '09:00-10:00' }]);
});

test('loader requests both months across year boundary and adds read-only labels without touching notes', async () => {
  const calls = [];
  const shared = event('shared', '2026-12-31', '09:00', '10:00', '<img onerror=bad()>');
  const f = fixture(async url => {
    calls.push(url);
    if (url.endsWith('kamar-timetable')) return { subscription_url: 'private-fixture' };
    return { events: [shared, event('Friday', '2027-01-01', '14:00', '15:00')] };
  });
  f.context.mountWeeklyTimetable(f.spread, '2026-12-28'); await flush();
  assert.deepEqual(calls, ['/api/planner/kamar-timetable', '/api/planner/kamar-timetable/2026/12', '/api/planner/kamar-timetable/2027/1']);
  const host = f.hosts.find(host => host.dataset.weeklyClasses === 'p1:3');
  assert.equal(host.children.length, 1);
  assert.equal(host.children[0].textContent, shared.title, 'title uses textContent, never HTML');
  assert.equal(host.children[0].children[0].textContent, '09:00-10:00');
  assert.equal(f.notes.value, 'Private notes and unsaved edits');
  assert.match(f.spread.panel.children[0].textContent, /Your notes are unchanged/);
});

test('loader highlights only Junior and Middle School class labels without altering notes', async () => {
  const f = fixture(async url => url.endsWith('kamar-timetable') ? { subscription_url: 'private-fixture' } :
    { events: ['11DTECH', 'SRDTECH (JSR)', 'MDTECH (81D)', 'DTonline (student)'].map((title, i) =>
      event(String(i), '2026-10-30', '11:20', '12:20', title)) });
  f.context.mountWeeklyTimetable(f.spread, '2026-10-26'); await flush();
  const host = f.hosts.find(host => host.dataset.weeklyClasses === 'p3:4');
  assert.equal(host.children[0].textContent, 'SRDTECH (JSR)');
  assert.equal(host.children[0].attrs.class, 'weekly-class-junior');
  assert.equal(host.children[1].textContent, 'MDTECH (81D)');
  assert.equal(host.children[1].attrs.class, 'weekly-class-middle');
  assert.ok(host.children.slice(2).every(line => line.attrs.class === ''));
  assert.equal(f.notes.value, 'Private notes and unsaved edits');
});

test('no subscription, empty weeks and failed feed have explicit states; retry preserves notes', async () => {
  const missing = fixture();
  missing.context.mountWeeklyTimetable(missing.spread, '2026-10-19'); await flush();
  assert.match(missing.spread.panel.children[0].textContent, /Setup My Planner/);
  let fail = true;
  const f = fixture(async url => {
    if (url.endsWith('kamar-timetable')) return { subscription_url: 'private-fixture' };
    if (fail) throw new Error('Timetable unavailable.');
    return { events: [] };
  });
  f.context.mountWeeklyTimetable(f.spread, '2026-10-19'); await flush();
  const [message, retry] = f.spread.panel.children;
  assert.equal(message.attrs.role, 'alert');
  assert.equal(retry.hidden, false);
  assert.equal(f.errors.length, 1);
  assert.match(message.textContent, /continue editing and saving/);
  fail = false; await retry.handlers.click();
  assert.equal(retry.hidden, true);
  assert.equal(message.attrs.role, 'status');
  assert.match(message.textContent, /No KAMAR classes/);
  assert.equal(f.notes.value, 'Private notes and unsaved edits');
});

test('late feed responses cannot populate a week that has been navigated away from', async () => {
  let finish, started;
  const waiting = new Promise(resolve => { started = resolve; });
  const f = fixture(async url => {
    if (url.endsWith('kamar-timetable')) return { subscription_url: 'private-fixture' };
    started(); return new Promise(resolve => { finish = resolve; });
  });
  f.context.mountWeeklyTimetable(f.spread, '2026-10-19');
  await waiting; f.spread.isConnected = false;
  finish({ events: [event('stale', '2026-10-19', '09:00', '10:00')] }); await flush();
  assert.ok(f.hosts.every(host => host.children.length === 0));
});

test('retry verifies the signed-in owner before requesting private timetable data', async () => {
  const calls = [];
  const f = fixture(async url => { calls.push(url); return { subscription_url: '' }; });
  f.context.refreshSession = async () => { throw new Error('A different school account is signed in.'); };
  f.context.mountWeeklyTimetable(f.spread, '2026-10-19'); await flush();
  assert.deepEqual(calls, []);
  assert.match(f.spread.panel.children[0].textContent, /different school account/);
  assert.equal(f.notes.value, 'Private notes and unsaved edits');
});

test('weekly rendering reserves a separate class label above each note field and mounts the live feed', () => {
  const table = source.slice(source.indexOf('  function weeklyTable('), source.indexOf('  function renderWeek('));
  assert.match(table, /'data-weekly-classes': slot \+ ':' \+ i/);
  assert.ok(table.indexOf('data-weekly-classes') < table.indexOf('cell.append(inputField'));
  const render = source.slice(source.indexOf('  function renderWeek('), source.indexOf('  function weeklyTimetableEntries('));
  assert.match(render, /mountWeeklyTimetable\(spread, week\)/);
});
