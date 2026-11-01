const SEARCH_URL = 'https://www.nzqa.govt.nz/ncea/assessment/search.do';
const VIEWS = new Set(['all', 'units', 'skills', 'achievements']);
const LEVELS = new Set(['all', '01', '02', '03', '04']);

function validateSearch({ query, view, level }) {
  const cleanQuery = typeof query === 'string' ? query.trim() : '';
  const cleanView = typeof view === 'string' ? view : 'all';
  const cleanLevel = typeof level === 'string' ? level : 'all';
  if (cleanQuery.length < 2 || cleanQuery.length > 100 || /[\u0000-\u001f]/.test(cleanQuery) ||
      !VIEWS.has(cleanView) || !LEVELS.has(cleanLevel)) {
    const error = new Error('Enter 2–100 search characters and choose a valid standard type and level.');
    error.code = 'INVALID_NZQA_SEARCH';
    throw error;
  }
  return { query: cleanQuery, view: cleanView, level: cleanLevel };
}

function decodeEntities(value) {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|apos|gt|lt|nbsp|quot);/gi, (entity, name) => {
    if (name[0] === '#') {
      const code = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
    }
    return { amp: '&', apos: "'", gt: '>', lt: '<', nbsp: ' ', quot: '"' }[name.toLowerCase()] || entity;
  });
}

function textContent(value) {
  return decodeEntities(value.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ').trim();
}

function searchUrl(query, view, level) {
  const url = new URL(SEARCH_URL);
  url.searchParams.set('query', query);
  url.searchParams.set('view', view);
  if (level !== 'all') url.searchParams.set('level', level);
  return url.href;
}

function parseStandards(html, query, view, level) {
  const resultsUrl = searchUrl(query, view, level);
  const rows = [...html.matchAll(/<tr\b[^>]*class=["'][^"']*\bdataHighlight\b[^"']*["'][^>]*>([\s\S]*?)<\/tr\s*>/gi)];
  const seen = new Set();
  const standards = [];
  let truncated = false;
  for (const [index, row] of rows.entries()) {
    const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td\s*>/gi)].map(cell => textContent(cell[1]));
    const number = cells[0]?.match(/\b\d{4,8}\b/)?.[0];
    if (!number || seen.has(number) || !cells[2]) continue;
    seen.add(number);
    const remaining = html.slice(row.index + row[0].length, rows[index + 1]?.index ?? html.length);
    const archive = decodeEntities(remaining).match(/href=["']([^"']*standardNumber=\d+[^"']*)["']/i)?.[1];
    const metadata = archive ? new URL(archive, 'https://www.nzqa.govt.nz').searchParams : null;
    const standardLevel = metadata?.get('level') || (level !== 'all' ? String(Number(level)) : '');
    const version = metadata?.get('version') || '';
    const standardFile = new RegExp(`href=["']([^"']*/(?:as)?${number}\\.pdf(?:\\?[^"']*)?)["']`, 'i').exec(remaining)?.[1];
    const resource = standardFile ? new URL(decodeEntities(standardFile), 'https://www.nzqa.govt.nz') : new URL(resultsUrl);
    if (resource.protocol !== 'https:' || resource.hostname !== 'www.nzqa.govt.nz') continue;
    standards.push({
      number,
      subject: cells[1] || '',
      title: cells[2],
      credits: cells[3] || '',
      assessment: cells[4] || '',
      url: resource.href,
      ...(standardLevel ? { level: standardLevel } : {}),
      ...(version ? { version } : {})
    });
    if (standards.length === 100) { truncated = index < rows.length - 1; break; }
  }
  // Number searches redirect to the framework layout, whose level headings
  // apply to following itemId rows rather than the assessment result rows.
  if (!standards.length) {
    let currentLevel = '';
    const frameworkRows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi)];
    for (const [index, row] of frameworkRows.entries()) {
      const heading = textContent(row[1]).match(/^Level\s+(\d{1,2})$/i);
      if (heading) { currentLevel = heading[1]; continue; }
      const number = row[1].match(/class=["']itemId["'][^>]*>\s*(\d{4,8})\s*</i)?.[1];
      if (!number || seen.has(number)) continue;
      const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td\s*>/gi)].map(cell => textContent(cell[1]));
      const resource = row[1].match(/href=["']([^"']*\/(?:as)?\d+\.pdf)["']/i)?.[1];
      if (!cells[4] || !resource) continue;
      const url = new URL(decodeEntities(resource), 'https://www.nzqa.govt.nz');
      if (url.protocol !== 'https:' || url.hostname !== 'www.nzqa.govt.nz') continue;
      const following = frameworkRows[index + 1]?.[1] || '';
      const version = textContent(following).match(/^Version\s+(\d+)$/i)?.[1];
      seen.add(number);
      standards.push({ number, subject: '', title: cells[4], credits: cells[5] || '', assessment: '',
        url: url.href, ...(currentLevel ? { level: currentLevel } : {}), ...(version ? { version } : {}) });
      if (standards.length === 100) { truncated = true; break; }
    }
  }
  if (!standards.length && /^\d{4,8}$/.test(query) &&
      new RegExp('<h1>\\s*Standard\\s+' + query + '\\b', 'i').test(html)) {
    const resource = html.match(new RegExp('href=["\\\']([^"\\\']*/as' + query + '\\.pdf)["\\\']', 'i'))?.[1];
    const table = html.match(/<table\b[^>]*class=["']noHover["'][^>]*>([\s\S]*?)<\/table>/i)?.[1];
    const cells = table ? [...table.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)] : [];
    const values = cells[1]?.[1].split(/<br\s*\/?>/i).map(textContent);
    const title = html.match(/<h3>([^<]+)<\/h3>\s*<table\b[^>]*class=["']noHover["']/i)?.[1];
    const archive = decodeEntities(html).match(/href=["']([^"']*standardNumber=\d+[^"']*)["']/i)?.[1];
    const metadata = archive ? new URL(archive, 'https://www.nzqa.govt.nz').searchParams : null;
    if (resource && title && values?.length >= 4) {
      const url = new URL(resource, 'https://www.nzqa.govt.nz');
      if (url.protocol === 'https:' && url.hostname === 'www.nzqa.govt.nz') {
        standards.push({ number: query, subject: values[3], title: textContent(title), credits: values[0] + ' credits',
          assessment: /^(Internal|External)\b/.exec(values[1])?.[1] || '', url: url.href,
          level: metadata?.get('level') || values[2], ...(metadata?.get('version') ? { version: metadata.get('version') } : {}) });
      }
    }
  }
  return { standards, resultsUrl, truncated };
}

async function searchNzqaStandards({ query, view, level }, fetchImpl = fetch) {
  const filters = validateSearch({ query, view, level });
  const url = searchUrl(filters.query, filters.view, filters.level);
  const response = await fetchImpl(url, {
    headers: { Accept: 'text/html' },
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error('NZQA standards search returned HTTP ' + response.status + '.');
  const html = await response.text();
  if (html.length > 2_000_000) throw new Error('NZQA standards search response was too large.');
  return parseStandards(html, filters.query, filters.view, filters.level);
}

module.exports = { parseStandards, searchNzqaStandards, validateSearch, textContent, decodeEntities };
