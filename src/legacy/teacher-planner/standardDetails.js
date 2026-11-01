const parsePdf = require('pdf-parse/lib/pdf-parse');
const { searchNzqaStandards } = require('./nzqaStandards');

function pdfVersion(text, number) {
  const match = text.match(new RegExp('\\b(?:(?:Unit|Achievement)\\s+standard\\s+|Number\\s+AS)' + number + '\\s+version\\s+(\\d{1,3})\\b', 'i'));
  if (!match) throw new Error('The PDF did not identify the expected standard and version.');
  return match[1];
}

async function standardDetails(number, { search = searchNzqaStandards, fetchImpl = fetch, extract = parsePdf } = {}) {
  if (!/^\d{4,8}$/.test(number)) throw new Error('Invalid standard number.');
  const results = await search({ query: number, view: 'all', level: 'all' });
  const standard = results.standards.find(item => item.number === number);
  if (!standard) throw new Error('NZQA did not return the selected standard.');
  const url = new URL(standard.url);
  if (url.protocol !== 'https:' || url.hostname !== 'www.nzqa.govt.nz' ||
      !new RegExp('^/nqfdocs/(?:units/pdf/|ncea-resource/achievements/\\d{4}/as)' + number + '\\.pdf$').test(url.pathname)) {
    throw new Error('NZQA did not return an official standard PDF link.');
  }
  const text = await officialPdfText(url.href, { fetchImpl, extract });
  const kind = text.match(/\b(Unit|Achievement)\s+standard\b/i)?.[1] || (new RegExp('\\bNumber\\s+AS' + number + '\\b', 'i').test(text) ? 'Achievement' : undefined);
  if (!kind) throw new Error('The NZQA PDF did not identify the standard type.');
  return { ...standard, standardType: kind.toLowerCase() === 'unit' ? 'Unit' : 'Achievement', version: pdfVersion(text, number),
    ...(kind.toLowerCase() === 'unit' ? { outcomes: unitOutcomes(text) } : {}) };
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

async function officialPdfText(url, { fetchImpl = fetch, extract = parsePdf, maxPages = 0 } = {}) {
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
  const pdf = await extract(buffer, { max: maxPages });
  return pdf.text;
}

module.exports = { standardDetails, pdfVersion, officialPdfText, unitOutcomes };
