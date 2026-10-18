const test = require('node:test');
const assert = require('node:assert/strict');
const { parseSchoolCalendar } = require('../src/schoolCalendar');

function fixture(year) {
  return `<h2>${year} school terms</h2>` +
    [1,2,3,4].map(term => `<h3>Term ${term} (10 weeks)</h3><p>${term === 1 ? 'Starts between Monday 26 January and Monday 9 February and ends Thursday 2 April' : `Monday 20 April to Friday 3 July`} ${year}.</p><p>Public holiday 6 February.</p>`).join('') +
    `<h2>${year} school holidays</h2>` +
    [1,2,3].map(term => `<h3>Term ${term}</h3><p>Friday 3 April to Sunday 19 April ${year}.</p>`).join('') +
    `<h3>Summer holidays</h3><p>Start no later than 19 December ${year}.</p>`;
}
test('shared calendar isolates selected year, preserves variable term descriptions and explicit school breaks', () => {
  const html = fixture(2026) + fixture(2027);
  const result = parseSchoolCalendar(html,2027);
  assert.equal(result.available,true);
  assert.equal(result.terms.length,4);
  assert.equal(result.terms[0].startDate,'2027-01-26');
  assert.equal(result.terms[0].endDate,'2027-04-02');
  assert.match(result.terms[0].description,/Starts between/);
  assert.equal(result.holidays.length,3);
  assert.equal(result.holidays[0].startDate,'2027-04-03');
  assert.equal(result.holidays[0].endDate,'2027-04-19');
  assert.equal(result.notes.length,1);
  assert.equal(parseSchoolCalendar(html,2030).available,false);
  assert.throws(()=>parseSchoolCalendar('<h2>Source changed</h2>',2026),/headings/);
  assert.throws(()=>parseSchoolCalendar(html.replace('3 April to Sunday 19 April 2027','30 February to Sunday 19 April 2027'),2027),/invalid date/);
  assert.throws(()=>parseSchoolCalendar(fixture(2026).replace('<h3>Term 3</h3>','<h3>Unknown</h3>'),2026),/incomplete/);
});
