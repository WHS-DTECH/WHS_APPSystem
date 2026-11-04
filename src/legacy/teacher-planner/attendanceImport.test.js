const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const session = require('express-session');
const { parseAttendancePage, importAttendancePdf } = require('./attendanceImport');
const { createModuleRouter } = require('./app');

const columns = [199, 258, 317, 376, 435, 495, 554, 613, 672, 731];
function fixture() {
  const item = (str, x, y) => ({ str, transform: [9, 0, 0, 9, x, y], width: str.length * 5.4 });
  return [
    item('Student Attendance - Two Week Overview', 220, 540),
    item('26 Oct 2026', 209, 518), item('2 Nov 2026', 505, 518),
    ...columns.map((x, i) => {
      const name = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'][i % 5];
      return item(name, x + 29 - name.length * 5.4 / 2, 505);
    }),
    item('Example, Alex', 33, 490), item('10', 139, 488),
    item('L*? ** N', 258, 489), item('EE* ** *', 317, 489),
    item(' ** **', 554, 489), item('*** ** L', 613, 489), item('**', 672, 489)
  ];
}
function pdfBuffer(items = fixture()) {
  const stream = items.map(item => `BT /F1 9 Tf ${item.transform[4]} ${item.transform[5]} Td (${item.str}) Tj ET`).join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`
  ];
  let text = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((value, i) => { offsets.push(Buffer.byteLength(text)); text += `${i + 1} 0 obj\n${value}\nendobj\n`; });
  const xref = Buffer.byteLength(text);
  text += 'xref\n0 6\n0000000000 65535 f \n' + offsets.slice(1).map(offset => String(offset).padStart(10, '0') + ' 00000 n \n').join('');
  return Buffer.from(text + `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
}
test('PDF extraction preserves eight slot positions, blank days and partial rows', async () => {
  const result = await importAttendancePdf(pdfBuffer());
  assert.deepEqual(result.weeks, ['2026-10-26', '2026-11-02']);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].name, 'Example, Alex');
  const days = result.rows[0].days;
  assert.deepEqual(days[0].slots, ['', '', '', '', '', '', '', '']);
  assert.deepEqual(days[1].slots, ['L', 'P', 'A', '', 'P', 'P', '', 'A']);
  assert.deepEqual(days[2].slots, ['A', 'A', 'P', '', 'P', 'P', '', 'P']);
  assert.deepEqual(days[6].slots, ['', 'P', 'P', '', 'P', 'P', '', '']);
  assert.deepEqual(days[8].slots, ['P', 'P', '', '', '', '', '', '']);
});
test('changed layouts, break codes, malformed headings and non-PDF input are rejected', async () => {
  for (const change of [
    items => { items[0].str = 'Other report'; },
    items => { items[1].str = '27 Oct 2026'; },
    items => { items[2].str = '9 Nov 2026'; },
    items => { items[3].transform[4] += 5; },
    items => { items.at(-1).transform[4] += 3; },
    items => { items.at(-1).str = '***A** *'; items.at(-1).width = 43.2; },
    items => { items.at(-1).str = '**-'; },
    items => { items.push({ ...items.at(-1) }); }
  ]) {
    const items = fixture(); change(items);
    assert.throws(() => parseAttendancePage(items, [0, 0, 842, 595]));
  }
  await assert.rejects(importAttendancePdf(Buffer.from('not a PDF')), /Choose a PDF/);
  await assert.rejects(importAttendancePdf(Buffer.alloc(5 * 1024 * 1024 + 1)), /5 MB/);
  const changed = fixture();
  changed[0].str = 'Other report';
  await assert.rejects(importAttendancePdf(pdfBuffer(changed)), /landscape KAMAR/);
});
test('KAMAR student-count footer is not attendance and preserves every row and slot', async () => {
  for (const count of [1, 2, 7]) {
    const items = fixture();
    for (let index = 1; index < count; index++) {
      const y = 490 - index * 16;
      items.push({ str: 'Synthetic, Student ' + index, transform: [9, 0, 0, 9, 33, y], width: 100 },
        { str: '*L* ** *', transform: [9, 0, 0, 9, 199, y - 1], width: 43.2 });
    }
    const expected = await importAttendancePdf(pdfBuffer(items));
    const footer = { str: 'Students: ' + count, transform: [8, 0, 0, 8, 648, 490 - (count - 1) * 16 - 19], width: 40.584 };
    items.push(footer);
    assert.deepEqual(await importAttendancePdf(pdfBuffer(items)), expected);
    for (const changed of [
      { ...footer, str: 'Students: ' + (count + 1) },
      { ...footer, str: 'Unknown footer' },
      { ...footer, transform: [8, 0, 0, 8, 199, footer.transform[5]] },
      { ...footer, transform: [8, 0, 0, 8, 648, 489] }
    ]) {
      await assert.rejects(importAttendancePdf(pdfBuffer([...items.slice(0, -1), changed])), /attendance positions/);
    }
  }
});
test('PDF preview requires teacher sign-in and CSRF, validates year, and never writes to the database', async t => {
  const app = express();
  app.use(session({ secret: 'synthetic-import-session', resave: false, saveUninitialized: false }));
  app.use((req, _res, next) => {
    if (req.get('x-user')) req.user = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', roles: [req.get('x-role') || 'Teacher'] };
    next();
  });
  app.use(createModuleRouter({ query: async () => { throw new Error('Preview must not access the database'); } }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = 'http://127.0.0.1:' + server.address().port + '/api/planner/';
  const headers = { 'x-user': 'test', 'Content-Type': 'application/pdf' };
  const login = await fetch(base + 'session', { headers });
  headers.cookie = login.headers.get('set-cookie').split(';')[0];
  headers['x-planner-csrf'] = (await login.json()).csrf;
  const post = (year, auth = headers, body = pdfBuffer()) => fetch(base + 'attendance/' + year + '/import-preview',
    { method: 'POST', headers: auth, body });
  assert.equal((await post(2026, {})).status, 401);
  assert.equal((await post(2026, { ...headers, 'x-role': 'Student' })).status, 403);
  assert.equal((await post(2026, { ...headers, 'x-planner-csrf': 'bad' })).status, 403);
  const response = await post(2026);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await response.json()).rows[0].days.length, 10);
  assert.equal((await post(2027)).status, 400);
  assert.equal((await post(2026, headers, Buffer.from('not PDF'))).status, 400);
});
