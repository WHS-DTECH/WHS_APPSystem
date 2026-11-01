const { searchNzqaStandards, textContent, decodeEntities } = require('./nzqaStandards');
const { officialPdfText } = require('./standardDetails');
const ORIGIN = 'https://www2.nzqa.govt.nz';

function officialUrl(value, base) {
  const url = new URL(decodeEntities(value), base);
  if (url.protocol !== 'https:' || !['www.nzqa.govt.nz', 'www2.nzqa.govt.nz'].includes(url.hostname) ||
      url.username || url.password || url.port) throw new Error('NZQA returned an unsupported resource address.');
  return url.href;
}
function links(html, base) {
  return [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .flatMap(match => {
      try { return [{ url: officialUrl(match[1], base), label: textContent(match[2]) }]; }
      catch { return []; } // External navigation is not an NZQA reference.
    });
}
async function findNzqaReferences(number, year, { search = searchNzqaStandards, fetchImpl = fetch, pdfText = officialPdfText } = {}) {
  if (!/^\d{4,8}$/.test(number) || !Number.isInteger(year) || year < 2000 || year > 2100) throw new Error('Choose a valid standard and assessment year.');
  const found = await search({ query: number, view: 'all', level: 'all' });
  const standard = found.standards.find(item => item.number === number);
  if (!standard) throw new Error('NZQA did not identify this standard.');
  const result = { number, year, subject: standard.subject, checkedAt: new Date().toISOString(), suggestions: [], warnings: [],
    searchUrl: 'https://www.nzqa.govt.nz/ncea/assessment/search.do?query=' + number + '&view=all' };
  if (!standard.subject || /\/units\//.test(standard.url)) {
    result.warnings.push('No NCEA subject resource match was identified for this standard. Unit-standard guidance may be published by its standard-setting body. Use NZQA standard details or enter a verified link manually.');
    return result;
  }
  async function page(url) {
    const response = await fetchImpl(url, { redirect: 'error', signal: AbortSignal.timeout(10000), headers: { Accept: 'text/html' } });
    if (!response.ok) throw new Error('NZQA resource page returned HTTP ' + response.status + '.');
    const html = await response.text();
    if (html.length > 2_000_000) throw new Error('NZQA resource page was too large.');
    return html;
  }
  const slug = standard.subject.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const subjectUrl = ORIGIN + '/ncea/subjects/select-subject/' + slug + '/';
  const html = await page(subjectUrl);
  const heading = textContent(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || '');
  if (heading.toLowerCase() !== standard.subject.toLowerCase()) throw new Error('NZQA subject page could not be verified for this standard.');
  const discovered = links(html, subjectUrl);
  const seen = new Set();
  for (const item of discovered.filter(item => /\/(?:nmr|clarifications)\/?$/.test(new URL(item.url).pathname)).slice(0, 4)) {
    if (seen.has(item.url)) continue;
    seen.add(item.url);
    try {
      const resource = await page(item.url);
      const content = textContent(resource.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] || resource);
      const exact = new RegExp('\\b' + number + '\\b').test(content);
      const title = textContent(resource.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || item.label);
      result.suggestions.push({ target: 'moderatorReportLink', url: item.url, title,
        kind: /\/nmr\/?$/.test(new URL(item.url).pathname) ? 'Moderator report' : 'Clarification',
        scope: exact ? 'Mentions standard ' + number : 'Subject-level guidance; standard ' + number + ' not confirmed',
        year: title.match(/\b20\d{2}\b/)?.[0] || 'Not stated' });
    } catch (error) { result.warnings.push(item.label + ': ' + error.message); }
  }
  const index = discovered.find(item => new URL(item.url).pathname.endsWith('/' + year + '-assessment-specifications/'));
  if (index) {
    try {
      const indexHtml = await page(index.url);
      const headings = [...indexHtml.matchAll(/<h3\b[^>]*>([\s\S]*?)<\/h3>/gi)];
      const subjectIndex = headings.findIndex(item => textContent(item[1]).toLowerCase() === standard.subject.toLowerCase());
      if (subjectIndex >= 0) {
        const heading = headings[subjectIndex];
        discovered.push(...links(indexHtml.slice(heading.index + heading[0].length, headings[subjectIndex + 1]?.index), index.url));
      }
    } catch (error) { result.warnings.push('Year-specific assessment specifications: ' + error.message); }
  }
  const specifications = discovered.filter(item => /specifications|spc-/i.test(item.url) && /\.pdf$/i.test(new URL(item.url).pathname) &&
    new RegExp('(?:/|-)' + year + '(?:/|-|\\.)').test(item.url));
  for (const item of [...new Map(specifications.map(item => [item.url, item])).values()].slice(0, 4)) {
    try {
      const content = await pdfText(item.url, { fetchImpl });
      if (!new RegExp('\\b' + number + '\\b').test(content) || !/assessment specifications?/i.test(content) ||
          !new RegExp('\\b' + year + '\\b').test(content)) continue;
      result.suggestions.push({ target: 'conditionsLink', url: item.url, title: 'Assessment specifications ' + year + ' — ' + standard.subject,
        kind: 'Assessment specifications', scope: 'PDF mentions standard ' + number + '; check the applicable section', year: String(year) });
    } catch (error) { result.warnings.push('Assessment specification could not be verified: ' + error.message); }
  }
  if (!result.suggestions.some(item => item.target === 'conditionsLink')) result.warnings.push('No assessment specification mentioning this standard was verified for ' + year + '. Internal standards may use separate conditions of assessment; enter those manually.');
  return result;
}
module.exports = { findNzqaReferences };
