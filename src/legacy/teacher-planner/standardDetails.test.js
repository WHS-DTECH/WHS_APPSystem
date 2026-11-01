const test = require('node:test');
const assert = require('node:assert/strict');
const { pdfVersion, standardDetails, unitOutcomes } = require('./standardDetails');

test('Unit outcomes collect all statements without performance criteria or Range details', () => {
  const text = `NZQA unit standard 29785 version 2
Outcomes and performance criteria
Outcome 1
Use a word processing application to integrate images, and spreadsheet and database
data into documents.
Range at least three integrated documents.
Performance criteria
1.1 Produce documents.
Outcome 2
Review and present
documents accurately.
Performance criteria
2.1 Review documents.
Replacement information
Old standard.`;
  assert.deepEqual(unitOutcomes(text), [
    'Outcome 1: Use a word processing application to integrate images, and spreadsheet and database data into documents.',
    'Outcome 2: Review and present documents accurately.'
  ]);
  assert.deepEqual(unitOutcomes('No outcome section'), []);
  assert.throws(() => unitOutcomes('Outcomes and performance criteria\nOutcome 1\n' + 'x'.repeat(8001)), /field limit/);
});

test('version parsing verifies the standard number in unit and achievement PDF headers', () => {
  assert.equal(pdfVersion('NZQA unit standard 29785 version 2 Page 1 of 4', '29785'), '2');
  assert.equal(pdfVersion('Number AS92004 Version 2 Page 1 of 2', '92004'), '2');
  assert.equal(pdfVersion('Achievement standard 91901\nversion 4', '91901'), '4');
  assert.throws(() => pdfVersion('NZQA unit standard 29786 version 2', '29785'), /expected standard/);
  assert.throws(() => pdfVersion('Date version published March 2023', '29785'), /expected standard/);
});
test('standard details fetches only official bounded PDFs and takes the version from the PDF, not stale search metadata', async () => {
  const standard = { number: '29785', level: '3', version: '1', url: 'https://www.nzqa.govt.nz/nqfdocs/units/pdf/29785.pdf' };
  let called = 0;
  const options = {
    search: async () => ({ standards: [standard] }),
    fetchImpl: async (url, init) => {
      called++; assert.equal(url, standard.url); assert.equal(init.redirect, 'error');
      return new Response('%PDF-synthetic');
    },
    extract: async (_buffer, options) => {
      assert.equal(options.max, 0, 'read outcomes beyond the first page');
      return { text: 'NZQA unit standard 29785 version 2\nOutcomes and performance criteria\nOutcome 1\nIntegrate documents.\nPerformance criteria\n1.1 Work.' };
    }
  };
  assert.equal((await standardDetails('29785', options)).version, '2'); assert.equal(called, 1);
  assert.deepEqual((await standardDetails('29785', options)).outcomes, ['Outcome 1: Integrate documents.']);
  await assert.rejects(standardDetails('bad', options), /Invalid/);
  await assert.rejects(standardDetails('29785', { ...options, search: async () => ({ standards: [] }) }), /did not return/);
  await assert.rejects(standardDetails('29785', { ...options, search: async () => ({ standards: [{ ...standard, url: 'https://evil.test/29785.pdf' }] }) }), /official/);
  await assert.rejects(standardDetails('29785', { ...options, fetchImpl: async () => new Response('bad', { status: 503 }) }), /503/);
  await assert.rejects(standardDetails('29785', { ...options, fetchImpl: async () => new Response('not PDF') }), /did not return a PDF/);
  await assert.rejects(standardDetails('29785', { ...options, fetchImpl: async () => new Response(Buffer.alloc(8 * 1024 * 1024 + 1)) }), /size limit/);
});
