const test = require('node:test');
const assert = require('node:assert');
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://x:x@localhost:1/x';
const { normalise } = require('../src/assessmentStandards');

test('normalise requires a number and name and tidies level and link', () => {
  assert.strictEqual(normalise({ standard_number: '', standard_name: 'x' }), null);
  assert.strictEqual(normalise({ standard_number: '91300', standard_name: '' }), null);
  const row = normalise({ standard_number: ' 91300 ', standard_name: 'Name', level: '2', credits: '4', assessment_type: 'Internal' });
  assert.strictEqual(row.standard_number, '91300');
  assert.strictEqual(row.level, 'Level 2');
  assert.strictEqual(row.credits, 4);
  assert.match(row.nzqa_url, /query=91300$/);
});

test('normalise rejects non-http links', () => {
  const row = normalise({ standard_number: '1', standard_name: 'n', nzqa_url: 'javascript:alert(1)' });
  assert.match(row.nzqa_url, /^https:\/\/www\.nzqa\.govt\.nz\//);
});
