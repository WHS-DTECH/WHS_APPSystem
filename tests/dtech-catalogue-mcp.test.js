const test = require('node:test');
const assert = require('node:assert/strict');
const { createDtechCatalogueData, inputSchema, outputSchema } = require('../src/dtechCatalogueMcp');

const origin = 'https://school.example.test';
const env = { APP_BASE_URL: origin };
const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const kit = (id, title, yearLevel = 'All Years') => ({
  id, title, status: 'active', yearLevel, href: '/practical-skills/kit-worksheet.html?kit=' + id,
  privateStudentRecords: ['must not leave'],
  activities: [0, 2].map(index => ({ title: title + ' activity ' + index, yearLevel,
    href: '/practical-skills/kit-worksheet.html?kit=' + id + '&activity=' + index, completion: 'private' }))
});
const source = {
  kits: [kit('kit-login', 'Login Kit'), kit('kit-google-search', 'Search Kit', 'Junior DTECH'),
    kit('kit-files-folders-kit-word-processing', 'Files & Folders Kit (Word Processing)'),
    kit('kit-google-drawings-kit', 'Google Drawings Kit'),
    { ...kit('kit-planning', 'Unpublished Kit'), status: 'planning' }],
  pathways: [
    { id: 'binary-and-data', title: 'Binary & Data', status: 'active', cardType: 'unit', yearLevel: 'Junior DTECH',
      href: '/learning-pathways/binary-and-data.html' },
    { id: 'lesson-binary-piano', title: 'Binary Piano', status: 'active', cardType: 'lesson', yearLevel: 'Junior DTECH',
      href: '/learning-pathways/lesson-binary-piano.html', unit: 'binary-and-data', sequence: 1 },
    { id: 'lesson-future', title: 'Future lesson', status: 'planning', cardType: 'lesson', href: '' },
    { id: 'lesson-no-page', title: 'Catalogue card only', status: 'active', cardType: 'lesson', href: '', sequence: 2 }
  ]
};
function fixture() {
  const state = { allowed: true, reads: 0 };
  const data = createDtechCatalogueData({ env,
    getUser: async id => id === owner && state.allowed ? { id, email: 'teacher@westlandhigh.school.nz' } : undefined,
    hubAccess: async () => ({ active: true, teacher: true }),
    readCatalogue: async () => { state.reads++; return structuredClone(source); }
  });
  return { data, state };
}
const args = value => inputSchema.parse(value);

test('search finds the four published kits and preserves activity order and direct links', async () => {
  const { data } = fixture();
  for (const [query, id] of [['Login Kit', 'kit-login'], ['Search Kit', 'kit-google-search'],
    ['Files & Folders Kit', 'kit-files-folders-kit-word-processing'], ['Google Drawing Kit', 'kit-google-drawings-kit']]) {
    const result = outputSchema.parse(await data.read(owner, args({ query, type: 'kit' })));
    assert.equal(result.total, 1);
    const found = result.resources[0];
    assert.equal(found.id, id);
    assert.equal(found.url, origin + '/dtech-hub/practical-skills/kit-worksheet.html?kit=' + id);
    assert.deepEqual(found.activities.map(activity => activity.sequence), [1, 2]);
    assert.deepEqual(found.activities.map(activity => activity.sourceActivityIndex), [0, 2]);
    assert.ok(found.activities[1].url.endsWith('activity=2'));
    assert.equal(found.activities[0].yearOrCourse, found.yearOrCourse);
    assert.doesNotMatch(JSON.stringify(result), /privateStudentRecords|must not leave|completion/);
  }
  assert.equal((await data.read(owner, args({ query: 'Unpublished Kit' }))).total, 0);
});

test('published units and lessons retain official linked plans and distinguish catalogue-only cards', async () => {
  const { data } = fixture();
  const result = await data.read(owner, args({ type: 'lesson' }));
  assert.equal(result.total, 2);
  const piano = result.resources.find(item => item.id === 'lesson-binary-piano');
  assert.equal(piano.unitPlanUrl, origin + '/dtech-hub/learning-pathways/binary-and-data.html#learning-sequence');
  assert.equal(piano.url, origin + '/dtech-hub/learning-pathways/lesson-binary-piano.html');
  const card = result.resources.find(item => item.id === 'lesson-no-page');
  assert.equal(card.hasLinkedPage, false);
  assert.match(card.url, /learning-pathways\/\?type=lesson#card-lesson-no-page$/);
  assert.equal(card.unitPlanUrl, null);
  const paged = await data.read(owner, args({ limit: 1, offset: 1 }));
  assert.equal(paged.resources.length, 1);
  assert.equal(paged.hasMore, true);
});

test('revoked or non-school access and invalid source data fail closed', async () => {
  const { data, state } = fixture();
  state.allowed = false;
  await assert.rejects(() => data.read(owner, args({})), /teaching access/);
  assert.equal(state.reads, 0);
  const external = createDtechCatalogueData({ env, readCatalogue: async () => source,
    getUser: async () => ({ email: 'user@other.example' }), hubAccess: async () => ({ active: true, teacher: true }) });
  assert.equal(await external.authorizeUser(owner), undefined);
  const unavailable = createDtechCatalogueData({ env, readCatalogue: async () => { throw new Error('source failed'); },
    getUser: async () => ({ email: 'teacher@westlandhigh.school.nz' }), hubAccess: async () => ({ active: true, teacher: true }) });
  await assert.rejects(() => unavailable.read(owner, args({})), /source failed/);
});

test('Hub catalogue reader uses only SELECTs and the same visible activity builder as the library', async t => {
  const app = require('../src/legacy/dtech-hub/server')({ databaseUrl: 'postgres://synthetic.invalid/dtech', databaseSsl: false });
  t.after(() => app.pool.end());
  const sql = [];
  app.pool.query = async (text, params) => {
    sql.push(text);
    assert.match(text.trim(), /^SELECT /i, 'catalogue reads never write or query student data');
    assert.doesNotMatch(text, /student|progress/i);
    if (text.includes('practical_skills_library_store')) return { rows: [{ cards: [kit('kit-google-drawings-kit', 'Google Drawings Kit')] }] };
    if (text.includes("content ->> 'customKit'")) return { rows: [{ kit_id: 'kit-google-drawings-kit' }] };
    if (text.includes('learning_pathways_library_store')) return { rows: [{ cards: [
      { id: 'unit', title: 'Unit', summary: 'Unit summary', cardType: 'unit', status: 'active', href: '/learning-pathways/unit.html' }
    ] }] };
    if (text.includes('SELECT content FROM practical_skills_kit_content')) {
      assert.equal(params[0], 'kit-google-drawings-kit');
      return { rows: [{ content: { customKit: true, worksheets: [{ activity: 'First' }, { activity: 'Hidden', hidden: true },
        { activity: 'Third' }], activities: [{ title: 'First' }, {}, { title: 'Third' }] } }] };
    }
    assert.fail('Unexpected catalogue query: ' + text);
  };
  const result = await app.readPublishedCatalogue();
  assert.deepEqual(result.kits[0].activities.map(item => item.title), ['First', 'Third']);
  assert.ok(result.kits[0].activities[1].href.endsWith('activity=2'));
  assert.equal(result.pathways[0].title, 'Unit');
  assert.ok(sql.length >= 4);
});
