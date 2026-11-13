const fs = require('node:fs/promises');
const path = require('node:path');
const { parseDocument, DomUtils } = require('htmlparser2');

const publicRoot = path.join(__dirname, '..', 'public');
const directories = ['DTECH', 'COMP', 'DVC', 'Food', 'Textiles', 'WOOD'];
const placeholder = /^(?:replace with\b|placeholder\b|tbd\b|to be (?:added|confirmed)\b)/i;
const resource = /^(?:course overview|assessment statement|workshop tools|project checklist|health\s*&\s*safety|(?:\w+\s+)?practical skills)$/i;
const failure = message => Object.assign(new Error(message), { status: 502 });
const clean = value => value.replace(/\s+/g, ' ').trim();
const standard = value => /^(\d{4,6})(?=\s|[-:])/.exec(value)?.[1];

function unitUrl(value, pagePath) {
  if (!value || value === '#') return null;
  const url = new URL(value, 'https://learning-sites.invalid' + pagePath);
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw failure('An unsafe unit link is configured in Learning Sites. Review ' + pagePath);
  }
  return url.origin === 'https://learning-sites.invalid' ? url.pathname + url.search + url.hash : url.href;
}

function listedUnits(assessments, links, pagePath) {
  if (!Array.isArray(assessments) || !assessments.every(item => typeof item === 'string') ||
      !Array.isArray(links) || !links.every(item => item && typeof item.label === 'string' && typeof item.url === 'string')) {
    throw failure('Invalid Learning Site unit listing. Review ' + pagePath);
  }
  const actual = assessments.map(clean).filter(item => item && !placeholder.test(item));
  const units = links.map(item => ({ label: clean(item.label), url: item.url.trim() }))
    .filter(item => item.label && !placeholder.test(item.label) && !resource.test(item.label))
    .map(item => ({ title: item.label,
      description: actual.find(value => standard(item.label) ? standard(value) === standard(item.label) : value === item.label) || '',
      url: unitUrl(item.url, pagePath) }));
  const extra = units.length ? actual.filter(item => standard(item) &&
    !units.some(unit => standard(unit.title) === standard(item))) : actual;
  extra.forEach(title => units.push({ title, description: '', url: null }));
  return units.filter((unit, index) => units.findIndex(other => other.title === unit.title && other.url === unit.url) === index);
}

async function loadLearningSiteUnits(codes, { dbQuery, readFile = fs.readFile } = {}) {
  const pages = await Promise.all([...new Set(codes)].sort().map(async code => {
    if (typeof code !== 'string' || !/^[A-Z0-9][A-Z0-9-]{0,59}$/.test(code)) throw failure('Invalid Learning Site course mapping.');
    const matches = (await Promise.all(directories.map(async directory => {
      try {
        return { html: await readFile(path.join(publicRoot, directory, code, 'index.html'), 'utf8'),
          pagePath: '/' + directory + '/' + code + '/' };
      } catch (error) {
        if (error.code === 'ENOENT') return null;
        throw error;
      }
    }))).filter(Boolean);
    if (matches.length > 1) throw failure('Ambiguous Learning Site course pages for ' + code + '.');
    if (!matches.length) return { code, path: null, units: [], status: 'missing' };
    const { html, pagePath } = matches[0];
    const document = parseDocument(html);
    const elements = DomUtils.getElementsByTagName('*', document.children);
    const list = elements.find(node => node.attribs?.id === 'course-assessments-list');
    const assessments = list ? DomUtils.getElementsByTagName('li', list.children).map(node => DomUtils.textContent(node)) : [];
    const links = elements.filter(node => node.name === 'a' &&
      node.attribs?.class?.split(/\s+/).includes('course-chip-assessment'))
      .map(node => ({ label: DomUtils.textContent(node), url: node.attribs.href || '#' }));
    const scripts = elements.filter(node => node.name === 'script').map(node => DomUtils.textContent(node)).join('\n');
    const configured = /const configuredCourseCode\s*=\s*"([^"]*)"/.exec(scripts)?.[1];
    if (configured && configured !== code) throw failure('Learning Site content configuration does not match ' + code + '.');
    return { code, path: pagePath, units: configured ? [] : listedUnits(assessments, links, pagePath),
      status: 'loaded', configured: Boolean(configured) };
  }));
  const configured = pages.filter(page => page.configured).map(page => page.code);
  if (configured.length) {
    const rows = (await dbQuery(`SELECT course_code,assessments,assessment_links FROM admin_course_content
      WHERE course_code=ANY($1::text[])`, [configured])).rows;
    for (const page of pages.filter(page => page.configured)) {
      const saved = rows.filter(row => row.course_code === page.code);
      if (saved.length > 1) throw failure('Duplicate Learning Site content for ' + page.code + '.');
      if (saved[0]) {
        const links = saved[0].assessment_links;
        if (!Array.isArray(links)) throw failure('Invalid saved Learning Site links for ' + page.code + '.');
        page.units = listedUnits(saved[0].assessments, links.slice(1, -1), page.path);
      }
    }
  }
  return pages.map(({ configured, ...page }) => page);
}

module.exports = { loadLearningSiteUnits };
