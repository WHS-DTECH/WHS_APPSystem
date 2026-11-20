const parsePdf = require('pdf-parse/lib/pdf-parse');
const schema = require('./public/reporting-schema');

class ReportingPdfError extends Error {}
const valueCodes = { developing: 'Dev', demonstrates: 'Dem', exemplifies: 'Exe' };

function parseReportingPage(items, view) {
  const reject = message => { throw new ReportingPdfError(message); };
  const at = (item, x, y) => Math.abs(item.transform[4] - x) < 1 &&
    (y === undefined || Math.abs(item.transform[5] - y) < 1);
  const header = (x, y) => items.find(item => at(item, x, y))?.str.trim() || '';
  const juniorSchool = items.some(item => item.str === 'Junior School');
  const middleSchool = items.some(item => item.str === 'Middle School');
  if (Math.abs(view[2] - 842) > 2 || Math.abs(view[3] - 595) > 2 ||
    !(juniorSchool || middleSchool) || !items.some(item => item.str === 'KAMAR')) {
    reject('Choose a landscape Junior or Middle School KAMAR report PDF.');
  }
  const slo = items.some(item => item.str === 'Computational Thinking - Coding') &&
    items.some(item => item.str === 'Design & Develop a Digital Outcome');
  const values = /^(?:Term\s*|T)([1-4])\s+([\p{L}]+)$/iu.exec(header(46, 494));
  const field = values?.[2].toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  const classCode = header(slo ? 24 : 49, slo ? 555 : 530).toUpperCase();
  if (!/^[A-Z0-9]+DTECH$/.test(classCode) || (!slo && !schema.juniorValues.some(([key]) => key === field))) {
    reject('The teaching class or School Value heading was not recognised.');
  }
  let year = null, programme = 'junior';
  if (slo) {
    const coding = /^G\.([JM])DTECH02\.(\d{2})$/.exec(header(349, 501));
    const design = /^G\.([JM])DTECH01\.(\d{2})$/.exec(header(631, 501));
    if (!coding || !design || coding[1] !== design[1] || coding[2] !== design[2] ||
        (coding[1] === 'J' && !juniorSchool)) reject('The two DTECH assessment codes, programme, or years could not be verified.');
    programme = coding[1] === 'M' ? 'middle' : 'junior';
    year = 2000 + Number(coding[2]);
  } else if (!juniorSchool) reject('School Values PDF matching is supported for JuniorDTECH only.');
  const start = slo ? 462 : 450, spacing = slo ? 23 : 36;
  const names = items.filter(item => at(item, slo ? 24 : 49) && item.transform[5] <= start + 0.1 &&
    item.transform[5] >= (slo ? 48 : 85) && !/^Male: \d+, Female: \d+, Students: \d+$/.test(item.str))
    .sort((a, b) => b.transform[5] - a.transform[5]).map(item => {
      const [x, y] = item.transform.slice(4);
      const parts = items.filter(part => part.transform[4] >= x && part.transform[4] < 170 &&
        Math.abs(part.transform[5] - y) < 0.6).sort((a, b) => a.transform[4] - b.transform[4]);
      return { ...item, str: parts.map(part => part.str.trim()).join(' ') };
    });
  if (!names.length || names.some((item, index) => Math.abs(item.transform[5] - (start - index * spacing)) > 0.6 ||
    !/^[^,\d:]{1,85},\s*[^,\d:]{1,85}$/.test(item.str.trim()))) reject('The student rows were not recognised.');
  const fields = slo ? ['coding', 'design'] : [field];
  const rows = names.map(item => ({ name: item.str.trim(), grades: Object.fromEntries(fields.map(key => [key, ''])) }));
  const seen = new Set();
  for (const item of items) {
    const [x, y] = item.transform.slice(4);
    if (!(x > (slo ? 300 : 360) && x < (slo ? 760 : 650) && y > (slo ? 45 : 75) && y < (slo ? 480 : 455))) continue;
    const index = names.findIndex(name => Math.abs(y - name.transform[5] - (slo ? 1 : -9.5)) < 0.6);
    const key = slo ? (x < 510 ? 'coding' : 'design') : field;
    const text = item.str.trim().toLowerCase();
    const judgment = /^(\w+)\s+([\p{L}]+)$/iu.exec(text);
    const grade = text === 'not entered' ? '' : slo ? text.toUpperCase() :
      judgment?.[2].normalize('NFD').replace(/\p{M}/gu, '') === field ? valueCodes[judgment[1]] : undefined;
    if (index < 0 || seen.has(index + ':' + key) ||
      !(slo ? ['', ...schema.programmes[programme].levels] : ['', ...schema.values]).includes(grade)) {
      reject('A judgement or its position was not recognised. No grades were changed.');
    }
    seen.add(index + ':' + key);
    rows[index].grades[key] = grade;
  }
  return { classCode, programme, year, fields, valueTerm: values ? Number(values[1]) : null, rows,
    totals: items.map(item => /^Male: \d+, Female: \d+, Students: (\d+)$/.exec(item.str)).filter(Boolean).map(match => Number(match[1])) };
}

async function importReportingPdf(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.subarray(0, 5).toString() !== '%PDF-' || buffer.length > 5 * 1024 * 1024) {
    throw new ReportingPdfError('Choose a PDF no larger than 5 MB.');
  }
  const pages = [];
  let error;
  const doc = await parsePdf(Uint8Array.from(buffer), { max: 21, pagerender: async page => {
    try { pages.push(parseReportingPage((await page.getTextContent({ normalizeWhitespace: true })).items, page.view)); }
    catch (failure) { error = failure; }
    return '';
  } });
  if (error) throw error;
  const first = pages[0];
  if (!first || doc.numpages !== pages.length || pages.length > 20 || pages.some(page =>
    page.classCode !== first.classCode || page.programme !== first.programme || page.year !== first.year || page.valueTerm !== first.valueTerm ||
    page.fields.join() !== first.fields.join())) throw new ReportingPdfError('The PDF must contain one consistent class report, at most 20 pages.');
  const rows = pages.flatMap(page => page.rows), totals = pages.flatMap(page => page.totals);
  if (totals.length !== 1 || totals[0] !== rows.length ||
    new Set(rows.map(row => row.name.normalize('NFC').toLowerCase())).size !== rows.length) {
    throw new ReportingPdfError('The PDF student count or names could not be verified.');
  }
  return { classCode: first.classCode, programme: first.programme, year: first.year, fields: first.fields, valueTerm: first.valueTerm, rows };
}

module.exports = { importReportingPdf, parseReportingPage, ReportingPdfError };
