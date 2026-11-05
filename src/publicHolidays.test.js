const test = require('node:test');
const assert = require('node:assert/strict');
const { parsePublicHolidays, parseEmploymentPublicHolidays, loadPublicHolidays } = require('./publicHolidays');

function fixture(year) {
  return `<table><caption>${year} — National public holidays</caption>` +
    Array.from({ length: 11 }, (_, i) => `<tr><td>Holiday ${i}</td><td>Monday ${i + 1} January</td></tr>`).join('') +
    `</table><table><caption>${year} — Regional anniversary days</caption>` +
    '<tr><td>Canterbury</td><td>16 December</td><td>Friday 13 November</td></tr>' +
    '<tr><td>Westland</td><td>1 December</td><td>Monday 30 November</td></tr></table>';
}

test('shared calendar exposes regional observed dates and preserves default Westland consumers', () => {
  const result = parsePublicHolidays(fixture(2026), 2026);
  assert.equal(result.publicHolidays.length, 12);
  assert.equal(result.publicHolidays.at(-1).name, 'Westland Anniversary Day (observed)');
  assert.deepEqual(result.regionalAnniversaries.map(({ region, date }) => ({ region, date })), [
    { region: 'Canterbury', date: '2026-11-13' }, { region: 'Westland', date: '2026-11-30' }
  ]);
  assert.equal(result.publicHolidaysAvailable, true);
  assert.equal(parsePublicHolidays(fixture(2026), 2030).publicHolidaysAvailable, false);
  assert.throws(() => parsePublicHolidays(fixture(2026).replace('Monday 30 November', 'Unknown'), 2026), /recognised/);
});

function employmentFixture(year, accordion = false) {
  const heading = `${year} public holiday and anniversary dates`;
  return (accordion ? `<v-accordion title="${heading}">` : `<h2>${heading}</h2>`) +
    '<table><tr><th>Holiday</th><th>Actual Date</th><th>Observed date</th></tr>' +
    Array.from({ length: 11 }, (_, i) => `<tr><td>Holiday ${i}</td><td>1 January</td><td>Monday ${i + 1} January</td></tr>`).join('') +
    '</table><table><tr><th>Province</th><th>Actual date</th><th>Observed date</th></tr>' +
    '<tr><td>Westland</td><td>1 December</td><td>Monday 30 November</td></tr></table>' +
    (accordion ? '</v-accordion>' : '');
}

test('Employment NZ fallback isolates published years and uses observed columns', () => {
  const html = employmentFixture(2026) + employmentFixture(2027, true);
  for (const year of [2026, 2027]) {
    const result = parseEmploymentPublicHolidays(html, year);
    assert.equal(result.publicHolidaysAvailable, true);
    assert.equal(result.publicHolidays.length, 12);
    assert.equal(result.publicHolidays[1].date, `${year}-01-02`);
    assert.equal(result.publicHolidays.at(-1).date, `${year}-11-30`);
    assert.match(result.publicHolidaysSourceUrl, /^https:\/\/www\.employment\.govt\.nz\//);
  }
  assert.equal(parseEmploymentPublicHolidays(html, 2028).publicHolidaysAvailable, false);
  assert.throws(() => parseEmploymentPublicHolidays(html.replace('<th>Observed date</th>', '<th>Unknown</th>'), 2026), /columns/);
  assert.throws(() => parseEmploymentPublicHolidays(html.replace('Monday 30 November', 'Unknown'), 2026), /recognised/);
  assert.throws(() => parseEmploymentPublicHolidays('<html>Request unsuccessful</html>', 2026), /recognised/);
});

test('loading preserves the original source and validates fallback failures', async t => {
  t.mock.method(console, 'warn', () => {});
  const requests = [];
  const fetchSource = async url => {
    requests.push(url);
    return { ok: true, text: async () => requests.length === 1 ? '<html>Request unsuccessful</html>' : employmentFixture(2026) };
  };
  assert.equal((await loadPublicHolidays(2026, fetchSource)).publicHolidaysAvailable, true);
  assert.equal(requests.length, 2);
  requests.length = 0;
  assert.equal((await loadPublicHolidays(2026, async url => {
    requests.push(url);
    return { ok: true, text: async () => fixture(2026) };
  })).publicHolidaysAvailable, true);
  assert.equal(requests.length, 1);
  await assert.rejects(loadPublicHolidays(2026, async () => ({ ok: false, status: 503 })), /503/);
});
