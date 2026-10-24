const test = require('node:test');
const assert = require('node:assert/strict');
const { parsePublicHolidays } = require('./publicHolidays');

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
