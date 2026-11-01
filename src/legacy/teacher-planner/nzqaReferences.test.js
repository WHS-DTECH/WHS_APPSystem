const test = require('node:test');
const assert = require('node:assert/strict');
const { findNzqaReferences } = require('./nzqaReferences');
const { officialPdfText } = require('./standardDetails');
const express = require('express');
const session = require('express-session');
const { createPlannerRouter } = require('./planner');
const base = 'https://www2.nzqa.govt.nz/ncea/subjects/select-subject/biology/';
function fixture({ subject = 'Biology', unit = false, badPage = false, missing = false, pdfFailure = false } = {}) {
  const calls = [];
  return { calls, options: {
    search: async () => ({ standards: [{ number: '99999', subject, url: unit ?
      'https://www.nzqa.govt.nz/nqfdocs/units/pdf/99999.pdf' : 'https://www.nzqa.govt.nz/nqfdocs/ncea-resource/achievements/2026/as99999.pdf' }] }),
    fetchImpl: async (url, init) => {
      calls.push(url); assert.equal(init.redirect, 'error');
      if (badPage) return new Response('missing', { status: 404 });
      if (url === base) return new Response(`<h1>${subject}</h1>
        <a href="nmr/">Moderator report</a><a href="clarifications/">Clarifications</a>
        <a href="https://evil.test/nmr/">Bad report</a>
        <a href="https://www.nzqa.govt.nz/nqfdocs/ncea-resource/specifications/2026/99990-spc-2026.pdf">Level 3</a>
        <a href="https://www.nzqa.govt.nz/nqfdocs/ncea-resource/specifications/2025/99999-spc-2025.pdf">Old year</a>`);
      return new Response('<h1>Biology report 2025</h1><main>' + (missing ? 'Other standards only' : 'Standard 99999 guidance') + '</main>');
    },
    pdfText: async url => {
      calls.push(url);
      if (pdfFailure) throw new Error('PDF unavailable');
      return 'Assessment specifications 2026: ' + (missing ? '99990' : '99999 and 99990');
    }
  } };
}
test('cross-subject discovery follows published links and verifies specification contents, not filenames', async () => {
  const f = fixture();
  const result = await findNzqaReferences('99999', 2026, f.options);
  assert.equal(result.subject, 'Biology');
  assert.equal(result.suggestions.length, 3);
  assert.equal(result.suggestions[0].year, '2025', 'report year is not assumed to be assessment year');
  assert.match(result.suggestions[0].scope, /Mentions standard 99999/);
  assert.equal(result.suggestions[2].target, 'conditionsLink');
  assert.match(result.suggestions[2].url, /99990-spc/, 'combined specification can cover a different filename standard');
  assert.ok(f.calls.every(url => !url.includes('evil.test') && !url.includes('/2025/')));
  assert.ok(Number.isFinite(Date.parse(result.checkedAt)));
});
test('unit standards and unverified resources do not silently match unrelated reports or specifications', async () => {
  const unit = fixture({ unit: true });
  assert.deepEqual((await findNzqaReferences('99999', 2026, unit.options)).suggestions, []);
  assert.equal(unit.calls.length, 0);
  const missing = await findNzqaReferences('99999', 2026, fixture({ missing: true }).options);
  assert.equal(missing.suggestions.length, 2);
  assert.match(missing.suggestions[0].scope, /Subject-level.*not confirmed/);
  assert.match(missing.warnings.join(' '), /No assessment specification/);
  const failed = await findNzqaReferences('99999', 2026, fixture({ pdfFailure: true }).options);
  assert.match(failed.warnings.join(' '), /PDF unavailable/);
  await assert.rejects(findNzqaReferences('99999', 2026, fixture({ badPage: true }).options), /404/);
  await assert.rejects(findNzqaReferences('bad', 2026), /valid standard/);
  await assert.rejects(findNzqaReferences('99999', 1900), /valid standard/);
});
test('year-specific specification indexes are restricted to the verified subject section', async () => {
  const f = fixture();
  const fetched = [];
  f.options.fetchImpl = async url => {
    if (url === base) return new Response('<h1>Biology</h1><a href="../2027-assessment-specifications/">2027 specifications</a>');
    return new Response('<h3>Accounting</h3><a href="/assets/ACCN-spc-2027.pdf">Accounting</a>' +
      '<h3>Biology</h3><a href="/assets/BIOL-L3-spc-2027.pdf">Biology level 3</a>' +
      '<h3>Chemistry</h3><a href="/assets/CHEM-spc-2027.pdf">Chemistry</a>');
  };
  f.options.pdfText = async url => { fetched.push(url); return 'Assessment specifications 2027 99999'; };
  const result = await findNzqaReferences('99999', 2027, f.options);
  assert.equal(fetched.length, 1);
  assert.match(fetched[0], /BIOL/);
  assert.equal(result.suggestions[0].target, 'conditionsLink');
  assert.equal(result.suggestions[0].year, '2027');
});
test('official PDF helper rejects external hosts and unsafe URLs before fetching', async () => {
  for (const url of ['https://evil.test/a.pdf', 'http://www.nzqa.govt.nz/a.pdf', 'https://user@www.nzqa.govt.nz/a.pdf']) {
    await assert.rejects(officialPdfText(url), /official NZQA/);
  }
});

test('references API validates inputs and surfaces lookup failures without modifying records', async t => {
  const calls = [];
  const app = express();
  app.use(session({ secret: 'synthetic-reference-test-secret', resave: false, saveUninitialized: false }));
  app.use((req, res, next) => { req.user = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }; next(); });
  app.use(createPlannerRouter({ query: async () => { throw new Error('Reference lookup must not write or read records'); },
    findReferences: async (number, year) => {
      calls.push([number, year]);
      if (number === '88888') throw new Error('NZQA unavailable');
      return { number, year, suggestions: [] };
    }
  }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = 'http://127.0.0.1:' + server.address().port;
  const valid = await fetch(base + '/standards/99999/references?year=2026');
  assert.equal(valid.status, 200);
  assert.deepEqual(calls, [['99999', 2026]]);
  for (const path of ['/standards/bad/references?year=2026', '/standards/99999/references?year=1900', '/standards/99999/references']) {
    assert.equal((await fetch(base + path)).status, 400);
  }
  assert.equal(calls.length, 1);
  const failed = await fetch(base + '/standards/88888/references?year=2026');
  assert.equal(failed.status, 502);
  assert.match((await failed.json()).error, /saved links are unchanged/);
});
