const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { parseStandards, searchNzqaStandards } = require('./nzqaStandards');
const { createModuleRouter } = require('./app');

const sample = `
<table>
<tr class="dataHighlight"><td><strong>92004</strong></td><td><strong>Digital Technologies</strong></td>
<td><strong>Create a computer program</strong></td><td><strong>5 credits</strong></td><td><strong>Internal</strong></td></tr>
<tr><td>Achievement standard 2024</td><td><a href="/nqfdocs/ncea-resource/achievements/2024/as92004.pdf">View standard</a></td></tr>
<tr class="dataHighlight"><td><strong>92005</strong></td><td>Digital Technologies &amp; Media</td>
<td>Create a multimedia outcome</td><td>4 credits</td><td>Internal</td></tr>
</table>`;
const currentNzqaLayout = `
<p>Matched the following keywords:</p>
<p><a href="/ncea/assessment/search.do?query=Generic+Computing&amp;view=units&amp;level=03">Generic Computing</a></p>
<table class="tableData noHover">
<tr class="dataHighlight"><td><a name="units"></a><strong>5968</strong></td><td colspan="2"></td>
<td colspan="2"><strong>Discuss the social implications of information technology</strong></td>
<td><strong>3 credits</strong></td><td><strong>Internal</strong></td></tr>
<tr><td colspan="5">Unit standard</td><td colspan="4">
<a href="/nqfdocs/units/pdf/5968.pdf" class="download pdf"> (37KB)</a></td></tr>
</table>`;

test('NZQA search results parse standards metadata and official resource links', () => {
  const result = parseStandards(sample, 'Digital Technologies', 'all', '01');
  assert.equal(result.standards.length, 2);
  assert.equal(result.truncated, false);
  assert.deepEqual(result.standards[0], {
    number: '92004', subject: 'Digital Technologies', title: 'Create a computer program',
    credits: '5 credits', assessment: 'Internal', level: '1',
    url: 'https://www.nzqa.govt.nz/nqfdocs/ncea-resource/achievements/2024/as92004.pdf'
  });
  assert.equal(result.standards[1].subject, 'Digital Technologies & Media');
  assert.equal(result.standards[1].url,
    'https://www.nzqa.govt.nz/ncea/assessment/search.do?query=Digital+Technologies&view=all&level=01');
  assert.match(result.resultsUrl, /level=01/);
  assert.doesNotMatch(parseStandards(sample, 'Digital Technologies', 'all', 'all').resultsUrl, /level=/);
});

test('NZQA search parses current unit-standard rows with blank subject cells and unit PDF links', () => {
  const result = parseStandards(currentNzqaLayout, 'Generic Computing', 'units', '03');
  assert.equal(result.standards.length, 1);
  assert.deepEqual(result.standards[0], {
    number: '5968',
    subject: '',
    title: 'Discuss the social implications of information technology',
    credits: '3 credits', level: '3',
    assessment: 'Internal',
    url: 'https://www.nzqa.govt.nz/nqfdocs/units/pdf/5968.pdf'
  });
});

test('level and version come from per-standard archive metadata rather than the search filter', () => {
  const html = currentNzqaLayout.replace('</table>', `<tr><td><a href="/bin/ncea/assessment/zip/nzqa-ncea-files.zip?standardNumber=5968&amp;level=3&amp;version=6">Download</a></td></tr></table>`);
  const standard = parseStandards(html, 'Computing', 'units', 'all').standards[0];
  assert.equal(standard.level, '3'); assert.equal(standard.version, '6');
});
test('standard number searches parse framework rows with level headings and version', () => {
  const html = `<table><tr class="dataHighlight"><td></td><td colspan="7"><strong>Level 3</strong></td></tr>
    <tr valign="top"><td></td><td></td><td><span class="itemId">29785</span></td><td>Unit</td>
    <td>Use a word processing application<br/></td><td>5&nbsp;Credits</td><td></td>
    <td><a href="/nqfdocs/units/pdf/29785.pdf">View</a></td></tr>
    <tr><td></td><td>Version 2</td></tr></table>`;
  assert.deepEqual(parseStandards(html, '29785', 'all', 'all').standards[0], {
    number: '29785', subject: '', title: 'Use a word processing application', credits: '5 Credits', assessment: '',
    url: 'https://www.nzqa.govt.nz/nqfdocs/units/pdf/29785.pdf', level: '3', version: '2'
  });
  test('achievement number searches parse the single-standard detail page', () => {
    const html = `<h1>Standard 92004</h1><h3>Create a computer program</h3>
      <table class="noHover"><tr><td>Credits: Assessment: Level: Belongs to:</td><td>5<br/>Internal<br/>1<br/>Digital Technologies</td></tr></table>
      <a href="/nqfdocs/ncea-resource/achievements/2024/as92004.pdf">PDF</a>
      <a href="/bin/ncea/assessment/zip/nzqa-ncea-files.zip?standardNumber=92004&amp;level=1&amp;version=2">ZIP</a>`;
    const standard = parseStandards(html, '92004', 'all', 'all').standards[0];
    assert.equal(standard.number, '92004'); assert.equal(standard.level, '1'); assert.equal(standard.version, '2');
    assert.equal(standard.subject, 'Digital Technologies'); assert.equal(standard.assessment, 'Internal');
  });
});

test('NZQA search validates filters and fetches only the fixed official search host', async () => {
  let requested;
  const result = await searchNzqaStandards({ query: 'Digital Technologies', view: 'achievements', level: '02' },
    async (url, options) => {
      requested = { url, options };
      return { ok: true, text: async () => sample };
    });
  assert.match(requested.url, /^https:\/\/www\.nzqa\.govt\.nz\/ncea\/assessment\/search\.do\?/);
  assert.match(requested.url, /view=achievements/);
  assert.match(requested.url, /level=02/);
  assert.equal(requested.options.headers.Accept, 'text/html');
  assert.ok(requested.options.signal instanceof AbortSignal);
  assert.equal(result.standards.length, 2);
  for (const filters of [
    { query: 'x', view: 'all', level: 'all' },
    { query: 'valid query', view: 'anything', level: 'all' },
    { query: 'valid query', view: 'all', level: '05' },
    { query: 'bad\nquery', view: 'all', level: 'all' }
  ]) await assert.rejects(searchNzqaStandards(filters, async () => { throw new Error('Should not fetch invalid filters.'); }), /Enter 2–100/);
});

test('authenticated standards endpoint forwards validated search parameters and exposes failures clearly', async t => {
  const searches = [];
  const app = express();
  app.use((req, res, next) => { req.user = { id: 'teacher', roles: ['Teacher'] }; req.session = {}; next(); });
  app.use(createModuleRouter({
    query: async () => ({ rows: [] }),
    searchStandards: async filters => {
      searches.push(filters);
      if (filters.query === 'unavailable') throw new Error('NZQA is offline.');
      return { standards: [], resultsUrl: 'https://www.nzqa.govt.nz/ncea/assessment/search.do?query=test' };
    }
  }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = 'http://127.0.0.1:' + server.address().port + '/api/planner/standards/search';
  const response = await fetch(base + '?q=Digital+Technologies&view=all&level=01');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), {
    standards: [], resultsUrl: 'https://www.nzqa.govt.nz/ncea/assessment/search.do?query=test'
  });
  assert.deepEqual(searches[0], { query: 'Digital Technologies', view: 'all', level: '01' });
  const failed = await fetch(base + '?q=unavailable');
  assert.equal(failed.status, 502);
  assert.match((await failed.json()).error, /unavailable/);
  const invalid = await fetch(base + '?q=x');
  assert.equal(invalid.status, 400);
});
