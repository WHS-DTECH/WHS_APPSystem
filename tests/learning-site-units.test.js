const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { loadLearningSiteUnits } = require('../src/learningSiteUnits');

test('Learning Site units use actual course listings, omit template resources, and report missing pages', async () => {
  const pages = await loadLearningSiteUnits(['11DTECH', '11DTECH', '11HOSP', 'MWOOD-S2', 'NOT-A-COURSE']);
  const digital = pages.find(page => page.code === '11DTECH');
  assert.equal(pages.length, 4);
  assert.equal(digital.path, '/DTECH/11DTECH/');
  assert.deepEqual(digital.units.map(unit => unit.title), ['29777 - Database', '92004 - Programming',
    '91893 - Digital Media', '91897 - Process', '92005 - Outcome', '92006 - Usability']);
  assert.match(digital.units[0].description, /Use the main features/);
  assert.ok(digital.units.every(unit => unit.url === null));
  assert.deepEqual(pages.find(page => page.code === '11HOSP').units, []);
  const wood = pages.find(page => page.code === 'MWOOD-S2');
  assert.deepEqual(wood.units.map(unit => unit.title), ['Woodwork Principles', 'Wordwork Tools', 'Woodwork Project']);
  assert.ok(wood.units.every(unit => unit.url.startsWith('https://sites.google.com/')));
  assert.deepEqual(pages.find(page => page.code === 'NOT-A-COURSE'),
    { code: 'NOT-A-COURSE', path: null, units: [], status: 'missing' });
});

test('configured Learning Sites read saved content without generated defaults or stale static units', async () => {
  let saved = [{ course_code: '11TEXT', assessments: ['A synthetic stitching unit'], assessment_links: [
    { label: 'Health & Safety', url: '/Health-Safety/' },
    { label: 'A synthetic stitching unit', url: '/Textiles/unit/' },
    { label: 'Practical Skills', url: '#' }
  ] }];
  const dbQuery = async (sql, params) => {
    assert.match(sql, /FROM admin_course_content/);
    assert.deepEqual(params, [['11TEXT']]);
    return { rows: saved };
  };
  const [page] = await loadLearningSiteUnits(['11TEXT'], { dbQuery });
  assert.deepEqual(page.units, [{ title: 'A synthetic stitching unit', description: 'A synthetic stitching unit', url: '/Textiles/unit/' }]);
  saved = [{ course_code: '11TEXT', assessments: [], assessment_links: [] }];
  assert.deepEqual((await loadLearningSiteUnits(['11TEXT'], { dbQuery }))[0].units, []);
  saved = [];
  assert.deepEqual((await loadLearningSiteUnits(['11TEXT'], { dbQuery }))[0].units, []);
});

test('Learning Site errors are explicit, and unsafe links or invalid mappings cannot reach the Library', async () => {
  await assert.rejects(loadLearningSiteUnits(['../11DTECH']), /Invalid Learning Site course mapping/);
  await assert.rejects(loadLearningSiteUnits(['11TEXT'], { dbQuery: async () => { throw new Error('Content unavailable'); } }),
    /Content unavailable/);
  await assert.rejects(loadLearningSiteUnits(['11DTECH'], { readFile: async (...args) =>
    (await fs.readFile(...args)).replace(/(class="course-chip course-chip-assessment"\s+href=")#/, '$1javascript:alert(1)')
  }), /unsafe unit link/);
  await assert.rejects(loadLearningSiteUnits(['11DTECH'], { readFile: async () => {
    throw Object.assign(new Error('File access denied'), { code: 'EACCES' });
  } }), /File access denied/);
});
