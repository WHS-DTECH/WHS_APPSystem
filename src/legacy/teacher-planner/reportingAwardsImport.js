const pdfParse = require('pdf-parse');

class ReportingAwardsError extends Error {}
const recipientFilename = /^PrintSectionIndexRecipientListbySection_\d{8}_\d{6}\.pdf$/i;
const normalize = text => text.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase();

function parseAwardPage(items, previousSection) {
  const lines = new Map(), rows = [];
  for (const { str, transform: [, , , , x, y] } of items) {
    if (!str.trim()) continue;
    const key = Math.round(y * 10);
    if (!lines.has(key)) lines.set(key, []);
    lines.get(key).push({ x, text: str.trim() });
  }
  const footer = items.find(item => item.transform[5] < 15 && /^\d{2}\/\d{2}\/20\d{2}$/.test(item.str.trim()));
  if (!items.some(item => item.transform[5] > 790 && /^(junior|middle)( school)? awards$/i.test(item.str.trim())) ||
      !footer || !items.some(item => item.transform[5] < 15 && item.str.trim() === 'KAMAR')) {
    throw new ReportingAwardsError('Choose a KAMAR Junior or Middle Awards recipient list, not a criteria PDF.');
  }
  let section = previousSection;
  for (const [y, line] of [...lines].sort(([a], [b]) => b - a)) {
    if (y < 150 || y > 8000) continue;
    const heading = line.find(item => item.x >= 20 && item.x < 29);
    if (heading) {
      section = /^(?:(?:junior|middle)(?: school)? )?kaha (akoranga|mohio)$/.exec(normalize(heading.text))?.[1];
      continue;
    }
    const subject = line.find(item => item.x >= 345 && item.x < 520)?.text;
    if (!subject || !/^digital technolog(?:y|ies)$/i.test(subject)) continue;
    const id = line.find(item => item.x >= 29 && item.x < 45)?.text;
    const yearLevel = line.find(item => item.x >= 270 && item.x < 285)?.text;
    if (!section || !/^\d{1,20}$/.test(id || '') || !/^(?:7|8|9|10)$/.test(yearLevel || '')) {
      throw new ReportingAwardsError('A Digital Technologies row has no verified award heading, Student ID or year level.');
    }
    rows.push({ id: 'k:' + id, yearLevel, award: section });
  }
  return { rows, printYear: Number(footer.str.trim().slice(-4)), section };
}

async function importReportingAwards(buffer) {
  const rows = [], years = new Set();
  let section;
  const pdf = await pdfParse(buffer, {
    max: 20,
    pagerender: async page => {
      const { items } = await page.getTextContent({ normalizeWhitespace: true });
      const result = parseAwardPage(items, section);
      section = result.section;
      years.add(result.printYear);
      rows.push(...result.rows);
      return '';
    }
  });
  if (!pdf.numpages || pdf.numpages > 20 || years.size !== 1 || !rows.length) {
    throw new ReportingAwardsError('No verified Digital Technologies recipients, or the export exceeds 20 pages.');
  }
  return { rows, printYear: [...years][0] };
}

module.exports = { importReportingAwards, ReportingAwardsError, recipientFilename, parseAwardPage };
