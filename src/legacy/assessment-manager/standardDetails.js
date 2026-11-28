const parsePdf = require('pdf-parse/lib/pdf-parse');
const { searchNzqaStandards } = require('./nzqaStandards');

function pdfVersion(text, number) {
  const match = text.match(new RegExp('\\b(?:(?:Unit|Achievement)\\s+standard\\s+|Number\\s+AS)' + number + '\\s+version\\s+(\\d{1,3})\\b', 'i'));
  if (!match) throw new Error('The PDF did not identify the expected standard and version.');
  return match[1];
}

async function standardDetails(number, { search = searchNzqaStandards, fetchImpl = fetch, extract = parsePdf, achievementPreview = false, unitPreview = false } = {}) {
  if (!/^\d{4,8}$/.test(number)) throw new Error('Invalid standard number.');
  const results = await search({ query: number, view: 'all', level: 'all' });
  const standard = results.standards.find(item => item.number === number);
  if (!standard) throw new Error('NZQA did not return the selected standard.');
  const url = new URL(standard.url);
  if (url.protocol !== 'https:' || url.hostname !== 'www.nzqa.govt.nz' ||
      !new RegExp('^/nqfdocs/(?:units/pdf/|ncea-resource/achievements/\\d{4}/as)' + number + '\\.pdf$').test(url.pathname)) {
    throw new Error('NZQA did not return an official standard PDF link.');
  }
  const pages = [];
  const pagerender = achievementPreview ? async page => {
    const content = await page.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false });
    pages.push({ items: content.items, height: page.view[3] - page.view[1] });
    let text = '', lastY;
    for (const item of content.items) {
      if (lastY !== undefined && lastY !== item.transform[5]) text += '\n';
      text += item.str;
      lastY = item.transform[5];
    }
    return text;
  } : undefined;
  const text = await officialPdfText(url.href, { fetchImpl, extract, pagerender });
  const kind = text.match(/\b(Unit|Achievement)\s+standard\b/i)?.[1] || (new RegExp('\\bNumber\\s+AS' + number + '\\b', 'i').test(text) ? 'Achievement' : undefined);
  if (!kind) throw new Error('The NZQA PDF did not identify the standard type.');
  const version = pdfVersion(text, number);
  if (achievementPreview && kind.toLowerCase() !== 'achievement') throw new Error('This is not an Achievement Standard.');
  if (unitPreview && kind.toLowerCase() !== 'unit') throw new Error('This is not a Unit Standard.');
  return { ...standard, standardType: kind.toLowerCase() === 'unit' ? 'Unit' : 'Achievement', version,
    ...(achievementPreview ? achievementDetails(pages) : {}),
    ...(unitPreview ? { criteria: { achieved: unitOutcomes(text).join('\n\n') }, requirements: unitPerformanceCriteria(text) } : {}),
    ...(kind.toLowerCase() === 'unit' ? { outcomes: unitOutcomes(text) } : {}) };
}

function achievementDetails(pages) {
  const items = pages[0]?.items || [];
  const x = item => item.transform[4], y = item => item.transform[5];
  const title = items.find(item => /^\s*Achievement Criteria\s*$/i.test(item.str));
  const notes = items.find(item => /^\s*Explanatory Notes\s*$/i.test(item.str) && title && y(item) < y(title));
  if (!title || !notes) throw new Error('The Achievement Criteria table could not be located on the first PDF page.');
  const table = items.filter(item => y(item) < y(title) && y(item) > y(notes) && item.str.trim());
  const headings = table.filter(item => /^Achievement(?:\s+with(?:\s+(?:Merit|Excellence))?)?$/i.test(item.str.trim()));
  headings.sort((a, b) => x(a) - x(b));
  if (headings.length !== 3 || !/^Achievement$/i.test(headings[0].str.trim()) ||
      !/Merit/i.test(headings[1].str) || x(headings[1]) - x(headings[0]) < 50 || x(headings[2]) - x(headings[1]) < 50 ||
      Math.max(...headings.map(y)) - Math.min(...headings.map(y)) > 2 ||
      !(/Excellence/i.test(headings[2].str) || table.some(item => /^Excellence$/i.test(item.str.trim()) &&
        Math.abs(x(item) - x(headings[2])) < 5 && y(item) < y(headings[2]) && y(item) > y(headings[2]) - 25))) {
    throw new Error('The Achievement Criteria columns are ambiguous; enter the criteria manually from the official PDF.');
  }
  const bullet = /^[\u2022\u25cf\uf0b7]$/;
  const criteria = {};
  for (let i = 0; i < 3; i++) {
    const left = x(headings[i]) - 3, right = i < 2 ? x(headings[i + 1]) - 3 : Infinity;
    const column = table.filter(item => x(item) >= left && x(item) < right && y(item) < y(headings[i]) - 15);
    const markers = column.filter(item => bullet.test(item.str.trim()));
    if (!markers.length) throw new Error('The Achievement Criteria rows could not be identified reliably.');
    const top = Math.max(...markers.map(y));
    if (column.some(item => y(item) <= top + 1 && (!Number.isFinite(item.width) || x(item) + item.width > right + 3))) {
      throw new Error('The Achievement Criteria overlap adjacent columns.');
    }
    const lines = new Map();
    for (const item of column.filter(item => y(item) <= top + 1)) {
      const row = Math.round(y(item));
      if (!lines.has(row)) lines.set(row, []);
      lines.get(row).push(item);
    }
    let result = '';
    for (const row of [...lines.keys()].sort((a, b) => b - a)) {
      const parts = lines.get(row).sort((a, b) => x(a) - x(b));
      let line = '', end = 0;
      for (const item of parts) {
        const value = bullet.test(item.str.trim()) ? '\u2022 ' : item.str;
        if (line && x(item) - end > 2 && !/\s$/.test(line) && !/^[\s.,;:!?)]/.test(value)) line += ' ';
        line += value; end = x(item) + item.width;
      }
      line = line.trim();
      if (line) result += (result ? (line.startsWith('\u2022') ? '\n' : ' ') : '') + line;
    }
    if (!result.startsWith('\u2022 ') || result.length > 8000 || /[\ue000-\uf8ff]/.test(result)) {
      throw new Error('The Achievement Criteria could not be extracted reliably.');
    }
    criteria[['achieved', 'merit', 'excellence'][i]] = result;
  }
  const requirements = [];
  for (const lines of explanatoryParagraphs(pages, notes)) {
    if (/[\ue000-\uf8ff]/.test(lines.join(' ').replace(/\uf0b7/g, ''))) continue;
    const firstBullet = lines.findIndex(line => /^[\u2022\u25cf\uf0b7]/.test(line));
    if (firstBullet < 1 || !/\binvolves\s*:/i.test(lines.slice(0, firstBullet).join(' '))) continue;
    const introduction = lines.slice(0, firstBullet).join(' ').replace(/^\d+\s+/, '').trim();
    if (introduction.length < 20 || /\b(?:NZQA|standard\s+\d+\s+version|page\s+\d+)\b/i.test(introduction)) continue;
    const statements = [];
    for (const line of lines.slice(firstBullet)) {
      if (/^[\u2022\u25cf\uf0b7]/.test(line)) statements.push(line.slice(1).trim());
      else if (statements.length) statements[statements.length - 1] += ' ' + line;
    }
    if (statements.length && /[.!?]$/.test(statements[statements.length - 1]) &&
        statements.every(value => value && value.length < 7000 && !/\b(?:NZQA|standard\s+\d+\s+version|page\s+\d+)\b/i.test(value))) {
      requirements.push(...statements.map(value => introduction + '\n\u2022 ' + value));
    }
  }
  return { criteria, requirements };
}

function explanatoryParagraphs(pages, notesHeading) {
  const paragraphs = [];
  let paragraph = [], previous;
  for (const [pageIndex, page] of pages.entries()) {
    const lines = new Map();
    for (const item of page.items) {
      const position = item.transform[5];
      const y = [...lines.keys()].find(value => Math.abs(value - position) < 1) ?? position;
      if (pageIndex === 0 && y >= notesHeading.transform[5] - 1) continue;
      if (!lines.has(y)) lines.set(y, []);
      lines.get(y).push(item);
    }
    for (const y of [...lines.keys()].sort((a, b) => b - a)) {
      const items = lines.get(y).sort((a, b) => a.transform[4] - b.transform[4]);
      let text = '', end = 0;
      for (const item of items) {
        if (text && item.transform[4] - end > 2 && !/\s$/.test(text) && !/^[\s.,;:!?)]/.test(item.str)) text += ' ';
        text += item.str;
        end = item.transform[4] + item.width;
      }
      text = text.trim();
      if (!text) continue;
      const x = items[0].transform[4];
      if (y > page.height - 50 && /\bversion\b.*\bpage\s+\d+\b/i.test(text) || y < 40 && x >= 300) continue;
      const pageBreak = previous && previous.page !== pageIndex;
      const newParagraph = previous && (!pageBreak && previous.y - y > 20 ||
        pageBreak && (/^\d+\s/.test(text) || /[.!?]$/.test(previous.text) && !/^[\u2022\u25cf\uf0b7]/.test(text)));
      if (newParagraph && paragraph.length) {
        paragraphs.push(paragraph);
        paragraph = [];
      }
      paragraph.push(text);
      previous = { page: pageIndex, y, text };
    }
  }
  if (paragraph.length) paragraphs.push(paragraph);
  return paragraphs;
}

function unitOutcomes(text) {
  const section = text.split(/Outcomes and performance criteria/i)[1];
  if (!section) return [];
  const outcomes = [];
  const pattern = /(?:^|\n)\s*Outcome\s+(\d+)\s*\n([\s\S]*?)(?=\n\s*(?:Range\b|Performance criteria\b|Outcome\s+\d+\b|NZQA\b|Replacement information\b|Planned review date\b)|$)/gi;
  for (const match of section.matchAll(pattern)) {
    const statement = match[2].replace(/\s+/g, ' ').trim();
    if (statement) outcomes.push('Outcome ' + match[1] + ': ' + statement);
  }
  if (outcomes.join('\n\n').length > 8000) throw new Error('The Unit Standard outcomes exceed the criteria field limit.');
  return outcomes;
}

function unitPerformanceCriteria(text) {
  const section = text.split(/Outcomes and performance criteria/i)[1];
  if (!section || !/Performance criteria/i.test(section)) throw new Error('The Unit Standard performance criteria could not be located.');
  const content = section.split(/\n\s*(?:Replacement information|Planned review date|Status information|Consent and Moderation Requirements|Comments on this unit standard)\b/i)[0]
    .replace(/\n\s*NZQA unit standard\s+\d+\s+version\s+\d+[^\n]*\n[\s\S]*?©[^\n]*(?:\n|$)/gi, '\n');
  if (/NZQA unit standard|[\ue000-\uf8ff]/i.test(content)) throw new Error('The Unit Standard performance criteria could not be extracted reliably.');
  const outcomes = [...content.matchAll(/(?:^|\n)\s*Outcome\s+(\d{1,2})[ \t]*(?=\n)/gi)];
  if (!outcomes.length || new Set(outcomes.map(item => item[1])).size !== outcomes.length) {
    throw new Error('The Unit Standard outcomes are ambiguous.');
  }
  const requirements = [];
  for (const [index, outcome] of outcomes.entries()) {
    const block = content.slice(outcome.index, outcomes[index + 1]?.index);
    const heading = /(?:^|\n)\s*Performance criteria\s*(?=\n)/i.exec(block);
    if (!heading) throw new Error('The Unit Standard performance criteria could not be located.');
    const criteria = block.slice(heading.index + heading[0].length);
    const pattern = /(?:^|\n)\s*(\d{1,2})\.(\d{1,2})[ \t]+([\s\S]*?)(?=\n\s*\d{1,2}\.\d{1,2}[ \t]+|$)/g;
    const matches = [...criteria.matchAll(pattern)];
    if (!matches.length || criteria.slice(0, matches[0].index).trim()) throw new Error('The Unit Standard performance criteria are ambiguous.');
    for (const [position, match] of matches.entries()) {
      const [statement, ...range] = match[3].split(/\n\s*Range\s+/i);
      const value = match[1] + '.' + match[2] + ' ' + statement.replace(/\s+/g, ' ').trim() +
        (range.length === 1 ? '\nRange: ' + range[0].replace(/\s+/g, ' ').trim() : '');
      if (match[1] !== outcome[1] || Number(match[2]) !== position + 1 || range.length > 1 ||
          !statement.trim() || value.length > 8000 || value.length < 10) {
        throw new Error('The Unit Standard performance criteria are ambiguous.');
      }
      requirements.push(value);
    }
  }
  if (!requirements.length || requirements.length > 50) throw new Error('The Unit Standard performance criteria could not be extracted reliably.');
  return requirements;
}

async function officialPdfText(url, { fetchImpl = fetch, extract = parsePdf, maxPages = 0, pagerender } = {}) {
  const resource = new URL(url);
  if (resource.protocol !== 'https:' || !['www.nzqa.govt.nz', 'www2.nzqa.govt.nz'].includes(resource.hostname) ||
      resource.username || resource.password || resource.port || !resource.pathname.endsWith('.pdf')) {
    throw new Error('Choose an official NZQA PDF.');
  }
  const response = await fetchImpl(resource.href, { redirect: 'error', signal: AbortSignal.timeout(15000), headers: { Accept: 'application/pdf' } });
  if (!response.ok) throw new Error('NZQA PDF returned HTTP ' + response.status + '.');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8 * 1024 * 1024) throw new Error('The NZQA PDF exceeded the size limit.');
      chunks.push(Buffer.from(value));
    }
  } finally { await reader.cancel(); }
  const buffer = Buffer.concat(chunks);
  if (buffer.subarray(0, 5).toString() !== '%PDF-') throw new Error('NZQA did not return a PDF.');
  const pdf = await extract(buffer, { max: maxPages, ...(pagerender ? { pagerender } : {}) });
  return pdf.text;
}

module.exports = { standardDetails, pdfVersion, officialPdfText, unitOutcomes, unitPerformanceCriteria, achievementDetails };
