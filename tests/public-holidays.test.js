const test = require('node:test');
const assert = require('node:assert/strict');
const { parsePublicHolidays } = require('../src/publicHolidays');
const { loadSchoolCalendar } = require('../src/schoolCalendar');

function fixture(year) {
  return `<table><caption><h3>${year} — National public holidays</h3></caption>` +
    ['1 January','2 January','6 February','3 April','6 April','25 April (Observed Monday 27 April)',
      '1 June','10 July','26 October','25 December','26 December (Observed Monday 28 December)']
      .map((date,index)=>`<tr><td>Holiday ${index}</td><td><time datetime="2026-04-28">${date}</time></td></tr>`).join('') +
    `</table><table><caption>${year} — Regional anniversary days</caption>
    <tr><td>Auckland</td><td>29 January</td><td>26 January</td></tr>
    <tr><td>Westland</td><td>1 December</td><td>Monday 30 November</td></tr></table>`;
}
test('public holidays use visible government dates, isolate years and include only Westland anniversary', () => {
  const html = fixture(2026) + fixture(2027);
  const result = parsePublicHolidays(html,2026);
  assert.equal(result.publicHolidaysAvailable,true);
  assert.equal(result.publicHolidays.length,14);
  assert.ok(result.publicHolidays.some(item=>item.date==='2026-12-28' && item.name==='Holiday 10 (observed)'));
  assert.ok(result.publicHolidays.some(item=>item.date==='2026-04-25' && item.name==='Holiday 5 (actual date)'));
  assert.ok(result.publicHolidays.some(item=>item.date==='2026-04-27' && item.name==='Holiday 5 (observed)'));
  assert.ok(result.publicHolidays.some(item=>item.date==='2026-11-30' && item.name==='Westland Anniversary Day (observed)'));
  assert.ok(result.publicHolidays.every(item=>item.date.startsWith('2026')));
  assert.equal(parsePublicHolidays(html,2030).publicHolidaysAvailable,false);
  assert.throws(()=>parsePublicHolidays('<html>unavailable</html>',2026),/not recognised/);
  assert.throws(()=>parsePublicHolidays(fixture(2026).replace('6 February','30 February'),2026),/Invalid/);
  assert.throws(()=>parsePublicHolidays(fixture(2026).replace('<td>Westland</td>','<td>Unknown</td>'),2026),/incomplete/);
});

test('public holiday source outage preserves school breaks and returns an explicit error', async () => {
  const originalFetch = global.fetch;
  global.fetch = async url => {
    if (String(url).includes('govt.nz/browse/')) throw new Error('Fixture holiday outage');
    const html = '<h2>2026 school terms</h2>' +
      [1,2,3,4].map(n=>`<h3>Term ${n} (10 weeks)</h3><p>1 February to 2 April 2026.</p>`).join('') +
      '<h2>2026 school holidays</h2>' +
      [1,2,3].map(n=>`<h3>Term ${n}</h3><p>3 April to 19 April 2026.</p>`).join('');
    return new Response(html);
  };
  try {
    const result = await loadSchoolCalendar(2026);
    assert.equal(result.available,true);
    assert.equal(result.holidays.length,3);
    assert.equal(result.publicHolidaysAvailable,false);
    assert.match(result.publicHolidaysError,/could not be loaded/);
  } finally { global.fetch = originalFetch; }
});
