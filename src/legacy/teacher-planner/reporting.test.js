const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const schema = require('./public/reporting-schema');
const { validKey, validContent } = require('./planner');
const { renderShell } = require('./shell');
const { importReportingAttendance } = require('./reportingAttendance');
const { parseAwardPage } = require('./reportingAwardsImport');
const { parseReportingPage } = require('./reportingImport');

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
  const context = vm.createContext({ plannerReportingSchema: schema, Event, URLSearchParams, console, localStorage: options.localStorage, confirm: options.confirm || (() => true) });
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'public', 'reporting.js'), 'utf8'), context);
  const mountOptions = { el, data, year: options.year ?? 2026, ownerId: 'test-owner', ensureSaved: options.ensureSaved || (async () => true), request: async url => {
    calls.push(url);
    if (fail) throw new Error('School directory unavailable');
    if (options.request) return options.request(url, directory);
    return directory;
  } };
  const remount = () => { host.replaceChildren(); context.plannerReporting.mount(host, mountOptions); };
  remount();
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
  return { all, find, click, control, enter, calls, events, remount };
}
const settle = () => new Promise(resolve => setImmediate(resolve));
function selectAwardPdf(f, name) {
  const pick = f.control(`Select award PDF: ${name}`);
  assert.ok(pick && !pick.disabled);
  pick.checked = true;
  pick.events.change();
}
test('Junior award guide uses the exact year-level thresholds and ignores missing, UAG and unknown levels', () => {
  for (const [year, level, expected] of [
    ['7', '', false], ['7', 'UAG', false], ['7', '3P', false], ['7', '4B', false],
    ['7', '4P', true], ['7', '4A', true], ['8', '4P', false], ['8', '4A', true],
    ['8', '6B', false], ['9', '4A', false], ['7', 'invalid', false]
  ]) assert.equal(schema.juniorAwardMeetsGuide(year, level), expected, year + ' ' + level);
});

test('Reporting retains editable SLOs without extra roster requests', async () => {
  const entries = [{ ...row, coding: '4P', design: '4A' }];
  const f = fixture({ records: JSON.stringify(entries) });
  await settle();
  assert.ok(f.control('Synthetic Junior: Computational Thinking - Coding'));
  assert.ok(f.control('Report cycle'));
  assert.deepEqual(f.calls, ['attendance/classes/2026?term=3&view=junior-audit']);
  assert.equal(f.find(node => node.attrs.name === 'records').value, JSON.stringify(entries));
  assert.equal(f.events.length, 0);
});

test('End of Year JuniorDTECH shows read-only homerooms alongside editable teaching classes', async () => {
  const f = fixture({ records: JSON.stringify([row]) }, false, { request: async (url, directory) => ({
    ...directory, homerooms: url.includes('term=4') ? [{ code: '8S', students: [
      { id: 'k:other', name: 'Student Not Taught', yearLevel: '8' }
    ] }] : [{ code: '7S', students: [...directory.classes[0].students,
      { id: 'k:other', name: 'Student Not Taught', yearLevel: '7' }] }]
  }) });
  await settle();
  assert.ok(f.control('Synthetic Junior: Computational Thinking - Coding'));
  const teaching = f.control('Teaching classes').children[0];
  const audit = f.control('Homeroom audit').children[0];
  assert.notEqual(teaching.attrs.class, audit.attrs.class);
  f.click('7S (1/2)');
  assert.equal(f.control('Synthetic Junior: Computational Thinking - Coding'), undefined);
  assert.ok(f.find(node => node.tag === 'td' && node.textContent === '4A'));
  assert.ok(f.find(node => node.tag === 'th' && node.textContent === 'Student Not Taught'));
  assert.ok(f.find(node => node.tag === 'td' && node.textContent === 'Not entered'));
  f.enter('Report cycle', 'earlier');
  assert.equal(f.control('Homeroom audit'), undefined);
  f.enter('Report cycle', 'eoy');
  f.click('MiddleDTECH');
  assert.equal(f.control('Homeroom audit'), undefined);
  f.click('JuniorDTECH');
  f.enter('Reporting class list term', '4');
  await settle();
  assert.equal(f.control('Homeroom audit').children[0].textContent, '8S (0/1)');
  assert.equal(f.find(node => node.attrs.name === 'records').value, JSON.stringify([row]));
  assert.equal(f.events.length, 0);
});

test('Reporting Drive confirms individual matches without replacing differences and clears confirmation on manual edit', async () => {
  const existing = { ...row, whanaungatanga: 'Exe' };
  let canSave = false;
  const f = fixture({ records: JSON.stringify([existing]) }, false, { ensureSaved: async () => canSave, request: async (url, directory) => {
    if (url.startsWith('google-calendar/reporting-drive/files?')) return { files: [{ id: 'example_file', name: 'Report.pdf', label: 'SLOs', version: 'v1' }] };
    if (url.startsWith('google-calendar/reporting-drive/file/')) return { classCode: 'JDTECH', programme: 'junior', year: 2026, rows: [
      { name: 'Synthetic Junior', grades: { coding: '4B', design: '4A' } },
      { name: 'Unknown Student', grades: { coding: '4A', design: '4A' } }
    ] };
    return { ...directory, homerooms: [{ code: 'PI', students: directory.classes[2].students }] };
  } });
  await settle();
  f.click('PI (0/1)');
  f.control('Google Drive Reports folder').value = 'https://drive.google.com/drive/folders/example_test_folder';
  await f.click('List Drive PDFs');
  f.enter('KAMAR report PDF', 'example_file');
  await f.click('Preview PDF');
  assert.ok(f.find(node => node.textContent === 'Unknown Student: Not matched — unchanged'));
  assert.equal(f.events.length, 0);
  await f.click('Confirm matching grades only');
  const saved = () => JSON.parse(f.find(node => node.attrs.name === 'records').value);
  const codingLabel = 'Synthetic Junior: Computational Thinking - Coding';
  const designLabel = 'Synthetic Junior: Design & Develop a Digital Outcome';
  const confirmation = ' (confirmed against KAMAR PDF)';
  assert.deepEqual(saved(), [{ ...existing, pdfConfirmed: { design: '4A' } }]);
  assert.ok(f.control(codingLabel));
  assert.ok(f.control(designLabel + confirmation));
  assert.equal(f.all().filter(node => node.attrs.class === 'reporting-pdf-confirmed').length, 1);
  assert.ok(f.find(node => node.attrs.role === 'status' && node.textContent.startsWith('Not saved to Planner.')));
  f.enter(designLabel + confirmation, '4P');
  assert.deepEqual(saved(), [{ ...existing, design: '4P' }]);
  assert.equal(f.all().filter(node => node.attrs.class === 'reporting-pdf-confirmed').length, 0);
  await f.click('Preview PDF');
  canSave = true;
  await f.click('Apply matched grades');
  assert.deepEqual(saved(), [{ ...existing, coding: '4B', pdfConfirmed: { coding: '4B', design: '4A' } }]);
  assert.ok(f.find(node => node.attrs.role === 'status' && node.textContent.includes('Saved to Planner.')));
  assert.deepEqual(f.events, ['input', 'input', 'input']);
  f.enter(codingLabel + confirmation, '3P');
  assert.deepEqual(saved(), [{ ...existing, pdfConfirmed: { design: '4A' } }]);
});

test('Reporting Awards shows separate Junior/Middle and Senior criteria links without changing drafts', async () => {
  const f = fixture({ records: JSON.stringify([row]) });
  await settle();
  f.click('4. Awards');
  const links = f.all().filter(node => node.tag === 'a' && node.textContent.includes('(PDF)'));
  assert.deepEqual(links.map(node => node.textContent), [
    'Junior/Middle (Years 7–10) — 2025 award criteria (PDF)',
    'Senior — 2026 Kaha Akoranga and Kaha Mohio criteria (PDF)'
  ]);
  assert.equal(new Set(links.map(node => node.attrs.href)).size, 2);
  assert.ok(links.every(node => /^https:\/\/drive\.google\.com\/file\/d\/[\w-]+\/view$/.test(node.attrs.href)));
  assert.equal(f.control('Class report entries'), undefined);
  assert.equal(f.events.length, 0);
});

test('Awards attendance CSV preserves zero, ignores duplicate identical rows and rejects conflicting or invalid percentages', () => {
  const csv = rows => Buffer.from('\ufeffStudent ID,Attendance - Percentage  (Half-Days),Name\n' + rows);
  assert.deepEqual(importReportingAttendance(csv('001,0,"Test, One"\n001,0%,Duplicate\nk:2,92.5%,Two\n3,,Three')),
    [{ id: 'k:001', percentage: 0 }, { id: 'k:2', percentage: 92.5 }, { id: 'k:3', percentage: null }]);
  assert.throws(() => importReportingAttendance(csv('1,90,A\n1,91,A')), /conflicting/);
  assert.throws(() => importReportingAttendance(csv('1,101,A')), /invalid/);
  assert.equal(validContent('reporting', { records: '[]', awards: '{"k:one":{"mohio":true,"attendance":0}}' }), true);
  assert.equal(validContent('reporting', { records: '[]', awards: '{"k:one":{"akoranga":"yes","attendance":101}}' }), false);
});

test('Awards roster edits in homerooms, filters recipients and imports attendance by ID without touching ticks or grades', async () => {
  const data = { records: JSON.stringify([row]) };
  const f = fixture(data, false, { request: async (url, directory) => {
    if (url.startsWith('google-calendar/reporting-awards/files?')) return { files: [{ id: 'csv', name: 'Attendance.csv', version: 'v1' }] };
    if (url.startsWith('google-calendar/reporting-awards/files/')) return { entries: [
      { id: 'k:synthetic', percentage: 0 }, { id: 'k:audit', percentage: 94.5 }, { id: 'k:other', percentage: 100 }
    ] };
    return { ...directory, homerooms: [{ code: 'PI', students: [directory.classes[0].students[0],
      { id: 'k:audit', name: 'Audit Student', yearLevel: '8' }] }] };
  } });
  await settle();
  f.click('4. Awards');
  assert.equal(f.control('Filter awards').value, 'any');
  assert.equal(f.control('Audit Student: Mohio'), undefined);
  f.enter('Filter awards', 'all');
  assert.ok(f.control('Audit Student: Mohio'));
  f.click('PI (2)');
  const tick = f.control('Audit Student: Mohio');
  assert.equal(tick.checked, false);
  tick.checked = true; tick.events.change({ stopPropagation() {} });
  f.enter('Filter awards', 'mohio');
  assert.equal(f.control('Synthetic Junior: Mohio'), undefined);
  assert.equal(f.control('Audit Student: Mohio').checked, true);
  f.enter('Filter awards', 'akoranga');
  assert.equal(f.control('Audit Student: Mohio'), undefined);
  f.enter('Filter awards', 'all');
  f.control('Awards attendance Drive folder').value = 'https://drive.google.com/drive/folders/example_attendance_folder';
  await f.click('List attendance CSVs');
  f.enter('Awards attendance CSV', 'csv');
  await f.click('Preview attendance');
  assert.equal(f.events.length, 1);
  await f.click('Apply attendance for 2026');
  data.awards = f.find(node => node.attrs.name === 'awards').value;
  assert.deepEqual(JSON.parse(data.awards), { 'k:audit': { mohio: true, attendance: 94.5 }, 'k:synthetic': { attendance: 0 } });
  assert.equal(f.find(node => node.attrs.name === 'records').value, data.records);
  f.remount(); await settle();
  assert.equal(f.control('Audit Student: Mohio').checked, true);
  f.enter('Filter awards', 'all');
  assert.ok(f.find(node => node.tag === 'td' && node.textContent === '0%'));
  f.click('1. Student Learning Objectives');
});

test('KAMAR recipient PDF parsing uses the award heading, Student ID and Digital Technologies subject', () => {
  const item = (x, y, str) => ({ str, transform: [1, 0, 0, 1, x, y] });
  const rows = [
    item(240, 818, 'Junior Awards'), item(25, 785, 'Junior School Kaha Mōhio'),
    item(31, 766, '00123'), item(102, 766, 'Student, Test'), item(273, 766, '7'), item(352, 766, 'Digital Technologies'),
    item(31, 749, '12345'), item(273, 749, '7'), item(352, 749, 'Mathematics'),
    item(25, 730, 'Junior School Kaha Akoranga'), item(31, 710, '23456'), item(273, 710, '8'), item(352, 710, 'Digital Technology'),
    item(19, 7, 'KAMAR'), item(526, 5, '21/11/2026')
  ];
  assert.deepEqual(parseAwardPage(rows), { printYear: 2026, section: 'akoranga', rows: [
    { id: 'k:00123', yearLevel: '7', award: 'mohio' }, { id: 'k:23456', yearLevel: '8', award: 'akoranga' }
  ] });
  assert.throws(() => parseAwardPage(rows.filter(row => row.str !== '00123')), /no verified/);
});

test('Awards PDF confirms only matched eligible ticks and keeps manual entries and attendance', async () => {
  const data = { records: JSON.stringify([row]), awards: JSON.stringify({ [row.studentId]: { attendance: 93, akoranga: true } }) };
  const outside = { id: 'k:outside', name: 'Other School', yearLevel: '7' };
  const selection = [
    { id: row.studentId, yearLevel: '7', award: 'mohio' },
    { id: outside.id, yearLevel: '7', award: 'akoranga' },
    { id: row.studentId, yearLevel: '8', award: 'akoranga' }
  ];
  const f = fixture(data, false, { request: async (url, directory) => {
    if (url.startsWith('google-calendar/reporting-award-pdfs?')) return { ignored: 2, reports: [
      { name: 'One.pdf', printYear: 2026, rows: selection }, { name: 'Copy.pdf', printYear: 2026, rows: selection }
    ] };
    return { ...directory, homerooms: [{ code: '7S', students: [outside] }] };
  } });
  await settle();
  f.click('4. Awards');
  assert.equal(f.find(node => node.tag === 'button' && node.textContent === '7S (1)').disabled, true);
  f.enter('Filter awards', 'all');
  assert.equal(f.control('Other School: Akoranga').disabled, true);
  f.control('Award recipient PDF folder').value = 'https://drive.google.com/drive/folders/example_awards_folder';
  await f.click('Preview award PDFs');
  assert.equal(f.events.length, 0);
  selectAwardPdf(f, 'One.pdf');
  selectAwardPdf(f, 'Copy.pdf');
  assert.ok(f.find(node => node.textContent.includes('1 unique award ticks matched; 1 ineligible')));
  await f.click('Apply verified awards for 2026');
  const stored = () => JSON.parse(f.find(node => node.attrs.name === 'awards').value);
  assert.deepEqual(stored(), { [row.studentId]: { attendance: 93, akoranga: true, mohio: true, pdfConfirmed: { mohio: true } } });
  assert.equal(f.all().filter(node => node.attrs.class === 'reporting-pdf-confirmed').length, 1);
  const tick = f.control('Synthetic Junior: Mohio (confirmed against a KAMAR award PDF)');
  tick.checked = false; tick.events.change({ stopPropagation() {} });
  assert.deepEqual(stored(), { [row.studentId]: { attendance: 93, akoranga: true } });
  assert.equal(f.all().filter(node => node.attrs.class === 'reporting-pdf-confirmed').length, 0);
  f.click('1. Student Learning Objectives');
});

test('Awards preview selects the newest export batch for the programme without applying it', async () => {
  const name = stamp => `PrintSectionIndexRecipientListbySection_${stamp}.pdf`;
  const reports = [
    ['20261121_093959', '7'], ['20261121_100000', '7'], ['20261121_095000', '7'],
    ['20261121_101500', '9'], ['20261131_102000', '7'], ['20261121_103000', '7', 2025],
    ['20261121_095003', '7']
  ];
  const f = fixture({}, false, { request: async (url, directory) =>
    url.startsWith('google-calendar/reporting-award-pdfs?') ? { ignored: 0, reports: reports.map(([stamp, yearLevel, printYear = 2026]) => ({
      name: name(stamp), printYear, rows: [{ id: row.studentId, yearLevel, award: 'mohio' }]
    })) } : directory });
  await settle();
  f.click('4. Awards');
  f.control('Award recipient PDF folder').value = 'https://drive.google.com/drive/folders/example_awards_folder';
  await f.click('Preview award PDFs');
  const selected = () => reports.filter(([stamp]) => f.control(`Select award PDF: ${name(stamp)}`)?.checked).map(([stamp]) => stamp);
  assert.deepEqual(selected(), ['20261121_100000', '20261121_095000', '20261121_095003']);
  const pick = f.control(`Select award PDF: ${name('20261121_100000')}`);
  pick.checked = false;
  pick.events.change();
  assert.deepEqual(selected(), ['20261121_095000', '20261121_095003']);
  assert.equal(f.events.length, 0);
});

test('Replacing awards uses only selected corrected lists and reconciles ticks and red flags', async () => {
  const [kept, restored, removed, resolved, mismatched, outside, middle] =
    ['kept', 'restored', 'removed', 'resolved', 'mismatched', 'outside', 'middle'].map(name =>
      ({ id: `k:${name}`, name, yearLevel: name === 'middle' ? '9' : '7' }));
  const initial = {
    [kept.id]: { mohio: true },
    [restored.id]: { mohioCorrection: 'below-slo' },
    [removed.id]: { mohio: true, pdfConfirmed: { mohio: true } },
    [resolved.id]: { attendance: 87, akorangaCorrection: 'below-attendance' },
    [mismatched.id]: { akoranga: true },
    [outside.id]: { mohio: true },
    [middle.id]: { akoranga: true }
  };
  const recipient = (student, award, yearLevel = student.yearLevel) => ({ id: student.id, yearLevel, award });
  let confirmed = false;
  const f = fixture({ awards: JSON.stringify(initial) }, false, { confirm: () => confirmed, request: async url => {
    if (url.startsWith('google-calendar/reporting-award-pdfs?')) return { ignored: 0, reports: [
      { name: 'Old.pdf', printYear: 2026, rows: [recipient(removed, 'mohio'), recipient(resolved, 'akoranga')] },
      { name: 'Corrected.pdf', printYear: 2026, rows: [recipient(kept, 'mohio'), recipient(restored, 'mohio'),
        recipient(mismatched, 'akoranga', '8'), recipient(outside, 'mohio')] }
    ] };
    return { classes: [{ code: 'TEST-MDTECH', students: [middle] }], homerooms: [
      { code: 'PI', students: [kept, restored, removed, resolved, mismatched] }, { code: '7S', students: [outside] }
    ] };
  } });
  await settle();
  f.click('4. Awards');
  f.control('Award recipient PDF folder').value = 'https://drive.google.com/drive/folders/example_awards_folder';
  await f.click('Preview award PDFs');
  assert.ok(!f.find(node => node.textContent === 'Replace with selected PDFs'));
  selectAwardPdf(f, 'Corrected.pdf');
  assert.ok(f.find(node => node.textContent.includes('1 ticks to add, 1 ticks to remove, 2 red flags to clear')));
  await f.click('Replace with selected PDFs');
  assert.equal(f.events.length, 0);
  confirmed = true;
  await f.click('Replace with selected PDFs');
  assert.deepEqual(JSON.parse(f.find(node => node.attrs.name === 'awards').value), {
    [kept.id]: { mohio: true, pdfConfirmed: { mohio: true } },
    [restored.id]: { mohio: true, pdfConfirmed: { mohio: true } },
    [resolved.id]: { attendance: 87 },
    [mismatched.id]: initial[mismatched.id],
    [outside.id]: initial[outside.id],
    [middle.id]: initial[middle.id]
  });
  assert.equal(f.control('resolved: Akoranga'), undefined);
  assert.equal(f.control('restored: Mohio (confirmed against a KAMAR award PDF)').checked, true);
  f.enter('Filter awards', 'all');
  assert.equal(f.control('resolved: Akoranga').checked, false);
});

test('Attendance criteria use whole homerooms, red-flag removals and leave cutoff ties to the teacher', async () => {
  const learners = (prefix, length) => Array.from({ length }, (_, index) =>
    ({ id: `k:${prefix}${index}`, name: `${prefix}${index}`, yearLevel: '7' }));
  const pi = learners('PI', 13), sr = learners('SR', 4), external = learners('External', 1), unassigned = learners('Unknown', 1);
  const initial = Object.fromEntries([99, 95, 95, 95, 94, 89.99, undefined].map((attendance, index) =>
    [pi[index].id, { attendance, akoranga: true, ...(index === 5 ?
      { mohio: true, pdfConfirmed: { mohio: true, akoranga: true } } : {}) }]));
  initial[sr[0].id] = { attendance: 90, akoranga: true };
  initial[sr[1].id] = { attendance: 96 };
  initial[external[0].id] = { attendance: 74, akoranga: true };
  initial[unassigned[0].id] = { attendance: 91, akoranga: true };
  const data = { records: JSON.stringify([row]), awards: JSON.stringify(initial) };
  let confirmed = false;
  const options = { confirm: () => confirmed, request: async (url, directory) => {
    if (url.startsWith('google-calendar/reporting-award-pdfs?')) return { ignored: 0, reports: [
      { name: 'PI.pdf', printYear: 2026, rows: [pi[5], pi[0]].map(student =>
        ({ id: student.id, yearLevel: '7', award: 'akoranga' })) }
    ] };
    return { ...directory, homerooms: [{ code: 'PI', students: pi }, { code: 'SR', students: sr },
      { code: '7S', students: external }, { code: 'Unassigned', students: unassigned }] };
  } };
  const f = fixture(data, false, options);
  await settle();
  f.click('4. Awards');
  f.click('SR (4)');
  await f.click('Calculate Attendance Criteria');
  assert.equal(f.events.length, 0, 'Cancelling does not edit the draft');
  confirmed = true;
  await f.click('Calculate Attendance Criteria');
  const store = f.find(node => node.attrs.name === 'awards');
  const saved = () => JSON.parse(store.value);
  assert.deepEqual(saved()[pi[5].id], { attendance: 89.99, mohio: true, pdfConfirmed: { mohio: true },
    akorangaCorrection: 'below-attendance' });
  assert.equal(saved()[pi[6].id].akorangaCorrection, 'missing-attendance');
  assert.equal(saved()[pi[4].id].akorangaCorrection, 'homeroom-cap');
  assert.ok(pi.slice(0, 4).every(student => saved()[student.id].akoranga === true));
  assert.equal(saved()[sr[0].id].akoranga, true, 'Exactly 90% is eligible');
  assert.equal(saved()[sr[1].id].akoranga, undefined, 'Never adds a nomination');
  assert.equal(saved()[external[0].id].akoranga, true);
  assert.equal(saved()[unassigned[0].id].akoranga, true);
  assert.equal(f.all().filter(node => node.attrs.class === 'reporting-award-correction').length, 3);
  assert.ok(f.find(node => node.textContent.includes('Untick 1 of the 3 students')));
  const tie = f.control('PI2: Akoranga');
  tie.checked = false; tie.events.change({ stopPropagation() {} });
  assert.equal(saved()[pi[2].id].akorangaCorrection, 'homeroom-cap');
  assert.ok(!f.find(node => node.textContent.includes('Akoranga cutoff tie')));
  f.control('Award recipient PDF folder').value = 'https://drive.google.com/drive/folders/example_awards_folder';
  await f.click('Preview award PDFs');
  selectAwardPdf(f, 'PI.pdf');
  await f.click('Apply verified awards for 2026');
  assert.equal(saved()[pi[5].id].akoranga, undefined, 'An older PDF cannot restore a red correction');
  assert.equal(saved()[pi[0].id].pdfConfirmed.akoranga, true);
  const restored = fixture({ ...data, awards: store.value }, false, options);
  await settle();
  restored.click('4. Awards');
  const red = restored.control('PI5: Akoranga (Attendance below 90%)');
  assert.equal(red.checked, false);
  red.checked = true; red.events.change({ stopPropagation() {} });
  assert.equal(restored.control('PI5: Akoranga').checked, true, 'A manual re-tick clears the correction');
  assert.equal(f.find(node => node.attrs.name === 'records').value, data.records);
});

test('End of Year Mohio check uses both SLOs and the year minimum across both programme rosters', async () => {
  const learner = (id, yearLevel) => ({ id: `k:${id}`, name: id, yearLevel });
  const [y7, y8, y9, y10, uag, missing, excluded, unticked] = [
    learner('Y7', '7'), learner('Y8', '8'), learner('Y9', '9'), learner('Y10', '10'),
    learner('UAG', '10'), learner('Missing', '8'), learner('OtherSchool', '7'), learner('Unticked', '9')
  ];
  const grade = (student, programme, coding, design, cycle = 'eoy') =>
    ({ ...row, studentId: student.id, programme, cycle, coding, design });
  const records = JSON.stringify([
    grade(y7, 'junior', '4B', '4A'), grade(y8, 'junior', '4A', '4B'), grade(y9, 'middle', '4A', '6B'),
    grade(y10, 'middle', '5A', '6B'), grade(uag, 'middle', '6B', 'UAG'),
    grade(missing, 'junior', '4A', '4A', 'earlier'), grade(unticked, 'middle', '6B', '6B')
  ]);
  const awards = Object.fromEntries([y7, y8, y9, y10, uag, missing, excluded].map(student => [student.id, { mohio: true }]));
  awards[y8.id] = { mohio: true, akoranga: true, attendance: 94, pdfConfirmed: { mohio: true, akoranga: true } };
  let accept = false;
  const f = fixture({ records, awards: JSON.stringify(awards) }, false, { confirm: () => accept, request: async url => {
    if (url.startsWith('google-calendar/reporting-award-pdfs?')) return { ignored: 0, reports: [{
      name: 'Report.pdf', printYear: 2026, rows: [{ id: y8.id, yearLevel: '8', award: 'mohio' }]
    }] };
    return { classes: [{ code: 'TEST-JDTECH', students: [y7, y8] },
      { code: 'TEST-MDTECH', students: [y9, y10, uag, unticked] }], homerooms: [
      { code: 'PI', students: [y7, y8, missing] }, { code: '7S', students: [excluded] }
    ] };
  } });
  await settle();
  f.click('4. Awards');
  f.enter('Report cycle', 'earlier');
  assert.equal(f.find(node => node.textContent === 'Check Grade criteria').disabled, true);
  f.enter('Report cycle', 'eoy');
  f.click('TEST-JDTECH (2)');
  await f.click('Check Grade criteria');
  assert.equal(f.events.length, 0, 'Cancelling does not edit the draft');
  accept = true;
  await f.click('Check Grade criteria');
  const saved = () => JSON.parse(f.find(node => node.attrs.name === 'awards').value);
  assert.deepEqual(saved()[y8.id], { akoranga: true, attendance: 94, pdfConfirmed: { akoranga: true }, mohioCorrection: 'below-slo' });
  assert.equal(saved()[y9.id].mohioCorrection, 'below-slo');
  for (const student of [uag, missing]) assert.equal(saved()[student.id].mohioCorrection, 'missing-slo');
  for (const student of [y7, y10, excluded]) assert.equal(saved()[student.id].mohio, true);
  assert.equal(saved()[unticked.id], undefined);
  assert.equal(f.find(node => node.attrs.name === 'records').value, records);
  assert.equal(f.control('Y8: Mohio (SLO below 4P)').checked, false);
  f.control('Award recipient PDF folder').value = 'https://drive.google.com/drive/folders/example_awards_folder';
  await f.click('Preview award PDFs');
  selectAwardPdf(f, 'Report.pdf');
  await f.click('Apply verified awards for 2026');
  assert.equal(saved()[y8.id].mohio, undefined, 'A stale KAMAR PDF cannot restore the removed tick');
  f.click('MiddleDTECH');
  f.enter('Filter awards', 'mohio');
  assert.equal(f.control('UAG: Mohio (SLO missing or UAG)').checked, false);
  const tick = f.control('Y9: Mohio (SLO below 5B)');
  tick.checked = true; tick.events.change({ stopPropagation() {} });
  assert.deepEqual(saved()[y9.id], { mohio: true });
  assert.equal(f.control('Y9: Mohio').checked, true);
});

test('Reporting batch remembers folders and applies cross-term grades without choosing between disagreeing PDFs', async () => {
  const folders = new Map(), term1 = { id: 'k:term1', name: 'Term One', yearLevel: '7' };
  const sloFolder = 'https://drive.google.com/drive/folders/example_slo_folder';
  const valuesFolder = 'https://drive.google.com/drive/folders/example_value_folder';
  const original = { ...row, pdfConfirmed: { design: '4A' } };
  const f = fixture({ records: JSON.stringify([original]) }, false, {
    localStorage: { getItem: key => folders.get(key), setItem: (key, value) => folders.set(key, value) },
    request: async (url, directory) => {
      if (url.startsWith('attendance/classes/')) {
        return url.endsWith('?term=1') ? { classes: [{ code: 'TEST-VEDTECH', students: [term1] }] } : directory;
      }
      if (url.startsWith('google-calendar/reporting-drive/files?')) {
        const values = new URLSearchParams(url.split('?')[1]).get('folder') === valuesFolder;
        return { files: (values ? ['values'] : ['first', 'second', 'term1']).map(id => ({ id, name: `${id}.pdf`, version: 'v1' })) };
      }
      const id = /file\/([^?]+)/.exec(url)[1];
      if (id === 'values') return { classCode: 'VEDTECH', programme: 'junior', year: null, valueTerm: 4, fields: ['rangatiratanga'],
        rows: [{ name: term1.name, grades: { rangatiratanga: 'Exe' } }] };
      return { classCode: id === 'term1' ? 'VEDTECH' : 'JDTECH', programme: 'junior', year: 2026, valueTerm: null,
        rows: [{ name: id === 'term1' ? term1.name : 'Synthetic Junior', grades: { coding: '4B', design: id === 'second' ? '4P' : '4A' } }] };
    }
  });
  await settle();
  const folder = () => f.control('Google Drive Reports folder');
  folder().value = sloFolder;
  await f.click('Preview all PDFs');
  assert.equal(f.events.length, 0);
  assert.ok(f.find(node => node.textContent.includes('PDFs disagree')));
  await f.click('Apply batch to Planner');
  const saved = () => JSON.parse(f.find(node => node.attrs.name === 'records').value);
  const { pdfConfirmed, ...untouched } = original;
  assert.deepEqual(saved()[0], { ...untouched, coding: '4B', pdfConfirmed: { coding: '4B' }, pdfPrevious: { coding: '3P' } });
  assert.equal(saved()[1].studentId, term1.id);
  assert.equal(saved()[1].coding, '4B');
  assert.equal(f.all().filter(node => node.attrs.class === 'reporting-pdf-replaced').length, 1);
  f.click('2. School Values');
  assert.equal(folder().value, '');
  folder().value = valuesFolder;
  await f.click('Preview all PDFs');
  await f.click('Apply batch to Planner');
  assert.equal(saved()[1].rangatiratanga, 'Exe');
  assert.equal(saved()[1].kaitiakitanga, '');
  f.click('1. Student Learning Objectives');
  assert.equal(folder().value, sloFolder);
  await f.click('Preview all PDFs');
  await f.click('Apply batch to Planner');
  assert.equal(saved()[0].pdfPrevious.coding, '3P');
  assert.deepEqual(f.events, ['input', 'input']);
  f.enter('Synthetic Junior: Computational Thinking - Coding (updated from 3P using KAMAR PDF)', '3A');
  assert.equal(saved()[0].pdfPrevious, undefined);
  f.remount(); await settle();
  assert.equal(folder().value, sloFolder);
  assert.ok(f.find(node => node.attrs.class === 'reporting-folder-status' && node.textContent === 'Folder link saved in this browser'));
  f.enter('Google Drive Reports folder', sloFolder + '?changed=1');
  assert.ok(f.find(node => node.attrs.class === 'reporting-folder-status' && node.textContent === 'Folder link not saved yet'));
  f.click('2. School Values');
  assert.equal(folder().value, valuesFolder);
  f.click('1. Student Learning Objectives');
});

test('default panels follow the selected report part without changing saved data', async () => {
  const f = fixture({ records: JSON.stringify([row]) });
  const values = f.control('School values defaults');
  const slo = f.control('JuniorDTECH SLO defaults');
  assert.equal(values.hidden, true);
  assert.equal(slo.hidden, false);
  await settle();
  f.click('2. School Values');
  assert.equal(values.hidden, false);
  assert.equal(slo.hidden, true);
  f.click('MiddleDTECH');
  assert.equal(values.hidden, false);
  assert.equal(slo.hidden, true);
  f.control('Reporting class list term').value = '4';
  f.control('Reporting class list term').events.change();
  await settle();
  assert.equal(values.hidden, false);
  assert.equal(slo.hidden, true);
  f.click('3. Report Comments');
  assert.equal(values.hidden, true);
  assert.equal(slo.hidden, true);
  f.click('1. Student Learning Objectives');
  assert.equal(values.hidden, true);
  assert.equal(slo.hidden, false);
  assert.equal(f.find(node => node.attrs.name === 'records').value, JSON.stringify([row]));
  assert.equal(f.events.length, 0);
});

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
  assert.deepEqual(f.calls, ['attendance/classes/2026?term=3&view=junior-audit'], 'No attendance marks or timetable requests');
  assert.equal(f.find(node => node.textContent === 'Not DTECH'), undefined);
  const codingLabel = 'Synthetic Junior: Computational Thinking - Coding';
  assert.deepEqual(f.control(codingLabel).children.map(node => node.attrs.value), ['', ...schema.programmes.junior.levels]);
  f.enter(codingLabel, '3P');
  f.control('Reporting class list term').value = '4';
  f.control('Reporting class list term').events.change();
  await settle();
  assert.equal(f.calls[1], 'attendance/classes/2026?term=4&view=junior-audit');
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

test('school value default fills blanks across all terms while retaining choices, SLOs and comments', async () => {
  const previous = { ...row, comment: 'Keep this comment' };
  const hidden = { ...row, studentId: 'k:former', programme: 'middle', coding: '5A', cycle: 'earlier' };
  const f = fixture({ records: JSON.stringify([previous, hidden]) }, false, { request: async (url, directory) => {
    const term = Number(url.slice(-1));
    if (term !== 1) return directory;
    return { classes: [{ code: 'TEST-JDTECH', students: [{ id: 'k:old', name: 'Historical Junior', yearLevel: '8' }] }] };
  } });
  await settle();
  assert.equal(f.find(node => node.tag === 'button' && node.textContent === 'Set all school values to Dem'), undefined);
  assert.ok(f.find(node => node.textContent.includes('Other teachers’ reports are not changed.')));
  await f.click('Default school values to Dem');
  assert.deepEqual(f.calls.slice(1).sort(), [1, 2, 3, 4].map(term => 'attendance/classes/2026?term=' + term));
  const saved = JSON.parse(f.find(node => node.attrs.name === 'records').value);
  assert.equal(saved.length, 7);
  assert.equal(saved.find(entry => entry.studentId === row.studentId && entry.cycle === 'eoy').kaitiakitanga, 'Dev');
  assert.equal(saved.find(entry => entry.studentId === row.studentId && entry.cycle === 'eoy').rangatiratanga, 'Exe');
  assert.equal(saved.find(entry => entry.studentId === 'k:former').rangatiratanga, 'Exe');
  assert.ok(saved.filter(entry => entry.studentId === 'k:old').every(entry =>
    entry.kaitiakitanga === 'Dem' && entry.rangatiratanga === 'Dem'));
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
    { ...middle, rangatiratanga: 'Dem', whanaungatanga: 'Dem', manaakitanga: 'Dem' });
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

test('completion counts use the selected Junior term and both Middle semester values and SLOs', async () => {
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
  assert.ok(f.control('Synthetic Middle: Whānaungatanga'));
  assert.ok(f.control('Synthetic Middle: Manaakitanga'));
  assert.equal(f.control('Synthetic Middle: Kaitiakitanga'), undefined);
  f.click('1. Student Learning Objectives');
  f.enter('Synthetic Middle: Design & Develop a Digital Outcome', '5P');
  assert.ok(f.find(node => node.textContent === 'TEST-MDTECH (0/1)'));
  f.click('2. School Values');
  f.enter('Synthetic Middle: Whānaungatanga', 'Dem');
  f.enter('Synthetic Middle: Manaakitanga', 'Exe');
  assert.ok(f.find(node => node.textContent === 'TEST-MDTECH (1/1)'));
  f.enter('Reporting class list term', '4');
  await settle();
  assert.equal(f.control('Synthetic Middle: Kaitiakitanga').value, 'Dev');
  assert.equal(f.control('Synthetic Middle: Rangatiratanga').value, 'Exe');
  f.click('JuniorDTECH');
  f.click('1. Student Learning Objectives');
});

test('MiddleDTECH Markbook Summary parser verifies the programme, year and grade scale', () => {
  const items = (coding = 'G.MDTECH01.26', grade = '6B') => [
    ['Middle School', 24, 575], ['KAMAR', 24, 20], ['MDTECH', 24, 555],
    ['Computational Thinking - Coding', 310, 520], ['Design & Develop a Digital Outcome', 550, 520],
    [coding, 347.695312, 501], ['G.MDTECH02.26', 629.195312, 501], ['Learner, Synthetic', 24, 462],
    [grade, 349, 463], ['5A', 631, 463], ['Male: 0, Female: 1, Students: 1', 24, 100]
  ].map(([str, x, y]) => ({ str, transform: [1, 0, 0, 1, x, y] }));
  const parse = data => parseReportingPage(data, [0, 0, 842, 595]);
  assert.deepEqual(parse(items()), { programme: 'middle', classCode: 'MDTECH', year: 2026, valueTerm: null,
    fields: ['coding', 'design'], rows: [{ name: 'Learner, Synthetic', grades: { coding: '6B', design: '5A' } }], totals: [1] });
  assert.throws(() => parse(items('G.JDTECH02.26')), /programme/);
  assert.throws(() => parse(items('G.MDTECH01.25')), /years/);
  assert.throws(() => parse(items('G.MDTECH02.26')), /assessment codes/);
  assert.throws(() => parse(items('G.MDTECH01.26', '3P')), /judgement/);
  const duplicate = items();
  duplicate.push({ str: 'G.MDTECH01.26', transform: [1, 0, 0, 1, 355, 501] });
  assert.throws(() => parse(duplicate), /assessment codes/);
  const wrongSchool = items();
  wrongSchool[0].str = 'Junior School';
  assert.throws(() => parse(wrongSchool), /programme/);
});

test('SLO parser accepts a year-level header in the KAMAR class heading when it matches the assessment programme', () => {
  const items = (year, y = 542) => [
    [`Year ${year}`, 24, y], ['KAMAR', 21, 25], ['PIDTECH', 24, 555],
    ['Computational Thinking - Coding', 310, 520], ['Design & Develop a Digital Outcome', 550, 520],
    ['G.JDTECH02.26', 349.11, 501], ['G.JDTECH01.26', 630.61, 501], ['Learner, Synthetic', 24, 462],
    ['4B', 349, 463], ['4P', 631, 463], ['Male: 0, Female: 1, Students: 1', 25, 348]
  ].map(([str, x, y]) => ({ str, transform: [1, 0, 0, 1, x, y] }));
  const parse = data => parseReportingPage(data, [0, 0, 842, 595]);
  assert.deepEqual(parse(items(7)), { programme: 'junior', classCode: 'PIDTECH', year: 2026, valueTerm: null,
    fields: ['coding', 'design'], rows: [{ name: 'Learner, Synthetic', grades: { coding: '4B', design: '4P' } }], totals: [1] });
  assert.throws(() => parse(items(9)), /programme/);
  assert.throws(() => parse(items(7, 300)), /landscape/);
});

test('Values parser accepts a Year 7 heading but rejects a MiddleDTECH year level', () => {
  const parse = level => parseReportingPage([
    [`Year ${level}`, 49, 517], ['KAMAR', 46, 49], ['PIDTECH', 49, 530],
    ['Term 4 Kaitiakitanga', 46, 494], ['Learner, Synthetic', 49, 450],
    ['Demonstrates Kaitiakitanga', 400, 440.5], ['Male: 0, Female: 1, Students: 1', 50, 376]
  ].map(([str, x, y]) => ({ str, transform: [1, 0, 0, 1, x, y] })), [0, 0, 842, 595]);
  assert.deepEqual(parse(7), { programme: 'junior', classCode: 'PIDTECH', year: null, valueTerm: 4,
    fields: ['kaitiakitanga'], rows: [{ name: 'Learner, Synthetic', grades: { kaitiakitanga: 'Dem' } }], totals: [1] });
  assert.throws(() => parse(9), /JuniorDTECH only/);
});

test('MiddleDTECH SLO sync skips Junior PDFs and tracks students with both SLOs confirmed', async () => {
  const first = { ...row, studentId: 'k:middle', programme: 'middle', coding: '5A', design: '5P' };
  const second = { ...first, studentId: 'k:second', pdfConfirmed: { coding: '5A' } };
  const third = { ...first, studentId: 'k:third', pdfConfirmed: { coding: '5A', design: '5P' } };
  const f = fixture({ records: JSON.stringify([row, first, second, third]) }, false, { request: async (url, directory) => {
    if (url.startsWith('google-calendar/reporting-drive/files?')) return { files: ['junior', 'middle'].map(id => ({
      id, name: `${id}.pdf`, label: 'SLOs', version: 'v1'
    })) };
    if (url.startsWith('google-calendar/reporting-drive/file/')) {
      const programme = url.includes('/file/middle?') ? 'middle' : 'junior';
      return { classCode: 'MDTECH', programme, year: 2026, valueTerm: null, rows: [
        { name: 'Synthetic Middle', grades: { coding: '6B', design: '5P' } }
      ] };
    }
    directory.classes[1].students = [directory.classes[1].students[0],
      { id: second.studentId, name: 'Middle Two', yearLevel: '10' }, { id: third.studentId, name: 'Middle Three', yearLevel: '10' }];
    return directory;
  } });
  await settle();
  f.click('MiddleDTECH');
  const progress = count => f.control(`TEST-MDTECH: PDF matched, ${count}/3 students`);
  assert.equal(progress(1).checked, false);
  assert.equal(progress(1).attrs.class, 'reporting-progress-tick');
  assert.ok(Object.hasOwn(progress(1).attrs, 'disabled'));
  f.enter('Google Drive Reports folder', 'https://drive.google.com/drive/folders/example_middle_folder');
  await f.click('List Drive PDFs');
  const picker = f.control('KAMAR report PDF');
  picker.value = 'junior';
  await f.click('Preview PDF');
  assert.ok(f.find(node => node.textContent.includes('PDF programme does not match')));
  assert.equal(f.events.length, 0);
  picker.value = 'middle';
  await f.click('Preview PDF');
  await f.click('Confirm matching grades only');
  assert.equal(progress(1).checked, false, 'Only one matching grade is not enough for MiddleDTECH');
  await f.click('Preview all PDFs');
  assert.ok(f.find(node => node.textContent.includes('1 PDFs matched; 1 skipped')));
  await f.click('Apply batch to Planner');
  assert.equal(progress(2).checked, true);
  const saved = JSON.parse(f.find(node => node.attrs.name === 'records').value);
  assert.deepEqual(saved.find(entry => entry.studentId === first.studentId), {
    ...first, coding: '6B', pdfConfirmed: { design: '5P', coding: '6B' }, pdfPrevious: { coding: '5A' }
  });
  assert.deepEqual(saved.find(entry => entry.programme === 'junior'), row);
  f.enter('Synthetic Middle: Computational Thinking - Coding (updated from 5A using KAMAR PDF)', '5P');
  assert.equal(progress(1).checked, false);
});

test('SLO progress requires a strict student majority of PDF confirmations and refreshes on edit', async () => {
  const second = { id: 'k:second', name: 'Student Two', yearLevel: '7' };
  const third = { id: 'k:third', name: 'Student Three', yearLevel: '7' };
  const f = fixture({ records: JSON.stringify([
    { ...row, pdfConfirmed: { coding: '3P', design: '4A' }, pdfPrevious: { coding: '3B' } },
    { ...row, studentId: second.id, pdfConfirmed: { design: '4A' } },
    { ...row, studentId: third.id }
  ]) }, false, { request: async (url, directory) => {
    const [first] = directory.classes[0].students;
    return { ...directory, homerooms: [{ code: 'VE', students: [first, second, third] },
      { code: 'PI', students: [first, third] }] };
  } });
  await settle();
  assert.equal(f.control('VE: PDF matched, 2/3 students').checked, true);
  assert.equal(f.control('PI: PDF matched, 1/2 students').checked, false);
  assert.equal(f.events.length, 0);
  f.enter('Synthetic Junior: Computational Thinking - Coding (updated from 3B using KAMAR PDF)', '3A');
  assert.equal(f.control('VE: PDF matched, 2/3 students').checked, true, 'Design still confirms this student');
  f.enter('Synthetic Junior: Design & Develop a Digital Outcome (confirmed against KAMAR PDF)', '4P');
  assert.equal(f.control('VE: PDF matched, 1/3 students').checked, false);
});

test('Award progress counts confirmed recipients only and excludes 7S/8S', async () => {
  const learner = id => ({ id: `k:${id}`, name: id, yearLevel: '7' });
  const [a, b, c, d, other] = ['a', 'b', 'c', 'd', 'other'].map(learner);
  const f = fixture({ awards: JSON.stringify({
    [a.id]: { mohio: true, akoranga: true, pdfConfirmed: { mohio: true, akoranga: true } },
    [b.id]: { akoranga: true, pdfConfirmed: { akoranga: true } },
    [c.id]: { mohio: true, pdfConfirmed: { mohio: true } },
    [d.id]: { akoranga: true },
    [other.id]: { mohio: true, akoranga: true, pdfConfirmed: { mohio: true, akoranga: true } }
  }) }, false, { request: async (url, directory) => ({ ...directory, homerooms: [
    { code: 'VE', students: [a] }, { code: 'PI', students: [c] },
    { code: 'SR', students: [b] }, { code: 'MM', students: [d] },
    { code: '7S', students: [other] }, { code: '8S', students: [] }
  ] }) });
  await settle();
  f.click('4. Awards');
  assert.equal(f.control('VE: PDF matched, 1 Mohio · 1 Akoranga').checked, true);
  assert.equal(f.control('PI: PDF matched, 1 Mohio · 0 Akoranga').checked, true);
  assert.equal(f.control('SR: PDF matched, 0 Mohio · 1 Akoranga').checked, true);
  assert.equal(f.control('MM: PDF matched, 0 Mohio · 0 Akoranga').checked, false);
  for (const room of ['7S', '8S']) assert.equal(f.control(`${room}: PDF matched, Not eligible`).checked, false);
  assert.equal(f.events.length, 0);
});

test('Junior progress boxes put VE below SR and omit TR checkboxes until 2027', async () => {
  for (const year of [2026, 2027]) {
    const f = fixture({}, false, { year, request: async (url, directory) => ({
      ...directory, homerooms: ['7S', 'SR', 'TR', 'Unassigned', 'VE'].map(code => ({ code, students: [] }))
    }) });
    await settle();
    for (const [tab, title] of [
      ['1. Student Learning Objectives', 'SLO PDF progress'],
      ['2. School Values', 'School Value allocation'],
      ['4. Awards', 'Awards PDF progress']
    ]) {
      f.click(tab);
      await settle();
      const rows = f.all(f.control(title)).filter(node => node.tag === 'tr').slice(1);
      assert.deepEqual(rows.map(node => node.children[0].textContent), ['7S', 'SR', 'VE', 'TR', 'Unassigned']);
      const hasTick = node => f.all(node).some(child => child.attrs.type === 'checkbox');
      assert.equal(hasTick(rows[2]), true);
      assert.equal(hasTick(rows[3]), year === 2027);
      assert.equal(hasTick(rows[4]), false);
      if (year === 2026) assert.ok(rows[3].children.some(cell => cell.textContent === 'Starts in 2027'));
    }
    assert.equal(f.events.length, 0);
  }
});

test('Values audit follows the verified homeroom teaching term, not the class list term', async () => {
  const sd = { id: 'k:sd', name: 'SD Student', yearLevel: '7' };
  const saved = { ...row, whanaungatanga: 'Exe', kaitiakitanga: 'Dev', pdfConfirmed: { whanaungatanga: 'Exe' } };
  const wrongTerm = { ...saved, studentId: sd.id, pdfConfirmed: { kaitiakitanga: 'Dev' } };
  const f = fixture({ records: JSON.stringify([saved, wrongTerm]) }, false, { request: async (url, directory) => {
    const students = directory.classes[0].students;
    return {
      classes: url.includes('term=1') ? [{ code: 'TEST-VEDTECH-CW', students }] :
        url.includes('term=4') ? [{ code: 'TEST-PIDTECH-CW', students }] :
          url.includes('term=3') ? [{ code: 'TEST-SDTECH-CW', students: [sd] }] : [],
      homerooms: [{ code: 'VE', students }, { code: 'SD', students: [sd] },
        { code: 'TR', students: [{ id: 'k:other', name: 'Other', yearLevel: '7' }] }]
    };
  } });
  await settle();
  f.enter('Reporting class list term', '4');
  await settle();
  f.click('2. School Values');
  await settle();
  const allocation = f.control('School Value allocation');
  assert.ok(f.all(allocation).some(node => node.tag === 'tr' &&
    node.children.slice(0, 3).map(cell => cell.textContent).join('|') === 'VE|Term 1|Whānaungatanga'));
  assert.ok(f.all(allocation).some(node => node.tag === 'tr' &&
    node.children.slice(0, 3).map(cell => cell.textContent).join('|') === 'SD|Term 3|Rangatiratanga'));
  assert.ok(f.all(allocation).some(node => node.tag === 'tr' &&
    node.children.slice(0, 3).map(cell => cell.textContent).join('|') === 'TR|Not verified|—'));
  assert.equal(f.control('VE: PDF matched, 1/1 students').checked, true);
  assert.equal(f.control('SD: PDF matched, 0/1 students').checked, false);
  f.click('VE (1/1)');
  const grid = f.control('Class report entries');
  assert.ok(f.all(grid).some(node => node.tag === 'th' && node.textContent === 'Whānaungatanga'));
  assert.ok(f.all(grid).some(node => node.tag === 'td' && node.textContent === 'Exe'));
  f.click('TR (—/1)');
  assert.ok(f.find(node => node.textContent.includes('No single DTECH teaching term')));
  assert.equal(f.events.length, 0);
  f.click('1. Student Learning Objectives');
});

test('failed or cancelled school values default leaves all existing records and defaults unchanged', async () => {
  const previous = JSON.stringify([row]);
  const failed = fixture({ records: previous }, false, { request: async (url, directory) => {
    if (url.endsWith('term=2')) throw new Error('Term 2 unavailable');
    return directory;
  } });
  await settle();
  await failed.click('Default school values to Dem');
  assert.equal(failed.find(node => node.attrs.name === 'records').value, previous);
  assert.equal(failed.find(node => node.attrs.name === 'valuesDefault').value, '');
  assert.equal(failed.events.length, 0);
  assert.ok(failed.find(node => node.attrs.role === 'alert' && node.textContent.includes('No school values were changed')));
  const cancelled = fixture({ records: previous }, false, { confirm: () => false });
  await settle();
  await cancelled.click('Default school values to Dem');
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
