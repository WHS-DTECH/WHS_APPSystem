const test = require('node:test');
const assert = require('node:assert/strict');
const { parseStudentsAuditEnrolments } = require('../src/studentsAuditEnrolments');

const item = (text, x, y) => ({ text, x, y, width: 20 });
const headings = () => [
  item('NZQA Enrolments by Subject', 262, 562), item('Students', 604, 566),
  item('Enrolled', 672, 566), item('Published', 728, 566), item('25/11/2026', 718, 21)
];
const course = code => [item(code, 24, 500), item('Digital Technology', 109, 500), item('Technology', 638, 500)];
const standard = (number, enrolled, published, y = 470) => [
  item('A.S. ' + number + ' v2', 26, y), item('17', 633, y),
  ...(enrolled === null ? [] : [item(String(enrolled), 702, y)]),
  ...(published === null ? [] : [item(String(published), 766, y)])
];

test('enrolment summary keeps course, standard version, blank counts and explicit zero distinct across pages', () => {
  const pages = [
    { items: [...headings(), ...course('11DTECH'), ...standard('92004', 5, 5), ...standard('92005', 13, null, 450)] },
    { items: [...headings(), ...standard('92006', 0, 0, 530), ...course('9DTECH'), ...standard('99999', 1, 1, 430)] }
  ];
  const rows = parseStudentsAuditEnrolments({ pages }, 2026);
  assert.equal(parseStudentsAuditEnrolments({ pages }, 2026, 'TopicsSubjectEntries_20261125_112207.pdf').length, 3);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map(row => [row.course, row.number, row.version, row.students, row.enrolled, row.published]),
    [['11DTECH', '92004', '2', 17, 5, 5], ['11DTECH', '92005', '2', 17, 13, null],
      ['11DTECH', '92006', '2', 17, 0, 0]]);
  assert.throws(() => parseStudentsAuditEnrolments({ pages }, 2025), /year/);
  assert.throws(() => parseStudentsAuditEnrolments({ pages }, 2026, 'TopicsSubjectEntries_20261124_112207.pdf'), /filename/);
  assert.throws(() => parseStudentsAuditEnrolments({ pages: [pages[0], pages[0]] }, 2026), /duplicate/);
  const malformed = structuredClone(pages[0]);
  malformed.items.push(item('5', 700, 470));
  assert.throws(() => parseStudentsAuditEnrolments({ pages: [malformed] }, 2026), /count/);
});

test('enrolment summary accepts 26 pages but rejects more than 60 and missing verified headings', () => {
  const pages = Array.from({ length: 26 }, (_, index) => ({
    items: [...headings(), ...course('11DTECH'), ...standard(String(10000 + index), 2, 1)]
  }));
  assert.equal(parseStudentsAuditEnrolments({ pages }, 2026).length, 26);
  assert.throws(() => parseStudentsAuditEnrolments({ pages: Array(61).fill(pages[0]) }, 2026), /60 pages/);
  assert.throws(() => parseStudentsAuditEnrolments({ pages: [{ items: [] }] }, 2026), /headings/);
});

test('enrolment summary reads External only from the assessment column, including its one-point baseline offset', () => {
  const page = { items: [...headings(), ...course('11DTECH'),
    ...standard('92006', 5, null), item('External', 539.5, 471),
    ...standard('92005', 13, 13, 450), item('External design title', 215, 450),
    ...standard('92004', 5, 5, 430), item('Internal', 539.5, 431)] };
  const rows = parseStudentsAuditEnrolments({ pages: [page] }, 2026);
  assert.deepEqual(rows.map(row => [row.number, row.external]), [['92006', true], ['92005', false], ['92004', false]]);
  const duplicate = structuredClone(page);
  duplicate.items.push(item('Internal', 550, 471));
  assert.throws(() => parseStudentsAuditEnrolments({ pages: [duplicate] }, 2026), /assessment type/);
  const unreadable = structuredClone(page);
  unreadable.items.find(item => item.text === 'External').text = 'Externl';
  assert.throws(() => parseStudentsAuditEnrolments({ pages: [unreadable] }, 2026), /assessment type/);
});
