const { textContent } = require('./nzqaStandards');

const BSAS_URL = 'https://www2.nzqa.govt.nz/ncea/ncea-for-teachers-and-schools/consent-to-assess-for-secondary-schools/base-scope-of-assessment-for-schools-bsas/';

function standardDomain(html, number) {
  const section = html.split(/<h2[^>]*>\s*Assessment Standards\s*<\/h2>/i);
  if (section.length !== 2) throw new Error('NZQA standard classification could not be identified.');
  const rows = [...section[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi)];
  let domain = '', domainId = '', level = 0;
  const matches = [];
  for (const [, row] of rows) {
    const heading = row.match(/<a\b[^>]*href=["']\/framework\/explore\/domain\.do\?frameworkId=(\d+)#standards["'][^>]*>([\s\S]*?)<\/a>/i);
    if (heading) { domainId = heading[1]; domain = textContent(heading[2]); level = 0; continue; }
    const levelHeading = textContent(row).match(/^Level\s+(\d{1,2})$/i);
    if (levelHeading) { level = Number(levelHeading[1]); continue; }
    const id = row.match(/<span\b[^>]*class=["']itemId["'][^>]*>\s*(\d{4,8})\s*<\/span>/i)?.[1];
    if (id === number) {
      if (!domain || level < 1 || level > 10) throw new Error('NZQA standard domain or level is missing.');
      matches.push({ domain, domainId, level, expired: /\b(?:expired|no longer available)\b/i.test(textContent(row)) });
    }
  }
  if (matches.length !== 1) throw new Error('NZQA standard classification is missing or ambiguous.');
  return matches[0];
}

function domainClassification(html, domain) {
  const breadcrumbs = [...html.matchAll(/<p\b[^>]*class=["']important["'][^>]*>([\s\S]*?)<\/p>/gi)];
  if (breadcrumbs.length !== 1) throw new Error('NZQA domain classification is missing or ambiguous.');
  const field = breadcrumbs[0][1].match(/<a\b[^>]*href=["']\/framework\/explore\/field\.do\?frameworkId=\d+["'][^>]*>([\s\S]*?)<\/a>/i);
  const subfield = breadcrumbs[0][1].match(/<a\b[^>]*href=["']\/framework\/explore\/sub-field\.do\?frameworkId=\d+["'][^>]*>([\s\S]*?)<\/a>/i);
  const parts = textContent(breadcrumbs[0][1]).split('>').map(part => part.trim());
  if (!field || !subfield || parts.length !== 4 || parts[1] !== textContent(field[1]) ||
      parts[2] !== textContent(subfield[1]) || parts[3] !== domain) throw new Error('NZQA domain classification could not be verified.');
  return { field: textContent(field[1]), subfield: textContent(subfield[1]) };
}

const classificationKey = (...parts) => parts.map(value => value.normalize('NFC').toLowerCase()).join('|');

function bsasDomains(html) {
  const tables = [...html.matchAll(/<h3\b[^>]*>\s*Registered domains\s*<\/h3>(?:(?!<h[23]\b)[\s\S])*?<table\b[^>]*>([\s\S]*?)<\/table\s*>/gi)];
  const matching = tables.filter(([, table]) => {
    const header = [...(table.match(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/i)?.[1] || '')
      .matchAll(/<th\b[^>]*>([\s\S]*?)<\/th\s*>/gi)].map(([, cell]) => textContent(cell));
    return header.join('|') === 'Field|Subfield|Domain|BSAS Level';
  });
  if (matching.length !== 1) throw new Error('The NZQA BSAS table could not be identified.');
  const rows = [...matching[0][1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi)];
  const domains = new Map();
  for (const [, row] of rows.slice(1)) {
    const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td\s*>/gi)].map(([, cell]) => textContent(cell));
    if (cells.length !== 4 || !cells[0] || !cells[1] || !cells[2] || !/^[1-9]$/.test(cells[3])) {
      throw new Error('The NZQA BSAS table contains an unsupported row.');
    }
    const key = classificationKey(cells[0], cells[1], cells[2]);
    if (!domains.has(key)) domains.set(key, []);
    domains.get(key).push(Number(cells[3]));
  }
  if (domains.size < 10) throw new Error('The NZQA BSAS table is incomplete.');
  return domains;
}

async function checkBsas(number, { fetchImpl = fetch } = {}) {
  if (!/^\d{4,8}$/.test(number)) throw new Error('Invalid standard number.');
  const frameworkUrl = 'https://www.nzqa.govt.nz/framework/search/results.do?query=' + number;
  const load = async url => {
    const response = await fetchImpl(url, { headers: { Accept: 'text/html' }, redirect: 'error', signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('NZQA returned HTTP ' + response.status + '.');
    const html = await response.text();
    if (html.length > 2000000) throw new Error('The NZQA response was too large.');
    return html;
  };
  const [framework, bsas] = await Promise.all([load(frameworkUrl), load(BSAS_URL)]);
  const standard = standardDomain(framework, number);
  const domainPage = await load('https://www.nzqa.govt.nz/framework/explore/domain.do?frameworkId=' + standard.domainId);
  const classification = domainClassification(domainPage, standard.domain);
  const levels = bsasDomains(bsas).get(classificationKey(classification.field, classification.subfield, standard.domain)) || [];
  if (levels.length > 1) throw new Error('The NZQA BSAS domain is ambiguous.');
  const bsasLevel = levels[0] || null;
  return { number, domain: standard.domain, level: standard.level, bsasLevel,
    eligible: !standard.expired && bsasLevel !== null && standard.level <= bsasLevel,
    expired: standard.expired, sourceUrl: BSAS_URL, standardUrl: frameworkUrl };
}

module.exports = { checkBsas, standardDomain, domainClassification, bsasDomains };
