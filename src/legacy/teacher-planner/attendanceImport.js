const parsePdf = require('pdf-parse/lib/pdf-parse');

class AttendancePdfError extends Error {}

const columns = [199, 258, 317, 376, 435, 495, 554, 613, 672, 731];
const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const iso = value => value.toISOString().slice(0, 10);
function headerDate(value) {
  const match = /^(\d{1,2}) ([A-Z][a-z]{2}) (20\d{2})$/.exec(value);
  if (!match || !months.includes(match[2])) throw new AttendancePdfError('The PDF week headings were not recognised.');
  const valueIso = `${match[3]}-${String(months.indexOf(match[2]) + 1).padStart(2, '0')}-${match[1].padStart(2, '0')}`;
  const parsed = new Date(valueIso + 'T00:00:00Z');
  if (!Number.isFinite(parsed.getTime()) || iso(parsed) !== valueIso || parsed.getUTCDay() !== 1) {
    throw new AttendancePdfError('The PDF must contain valid Monday week headings.');
  }
  return valueIso;
}
function parseAttendancePage(items, view) {
  if (items.some(item => /^Attendance Rates for \d{4} from\s+term \d, week \d+\s+to\s+term \d, week \d+$/.test(item.str))) {
    throw new AttendancePdfError('This is a Half Days attendance statistics report, not a Two Week Overview. ' +
      'It contains summary rates, not daily period marks. Export Student Attendance - Two Week Overview for attendance sync, or move this statistics PDF out of the sync folder.');
  }
  if (Math.abs(view[2] - 842) > 2 || Math.abs(view[3] - 595) > 2 ||
      !items.some(item => item.str === 'Student Attendance - Two Week Overview')) {
    throw new AttendancePdfError('Choose a landscape KAMAR Student Attendance - Two Week Overview PDF.');
  }
  const at = (x, y) => items.find(item => Math.abs(item.transform[4] - x) < 1 && Math.abs(item.transform[5] - y) < 1);
  const weeks = [headerDate(at(209, 518)?.str || ''), headerDate(at(505, 518)?.str || '')];
  if (new Date(weeks[1]) - new Date(weeks[0]) !== 7 * 86400000) throw new AttendancePdfError('The PDF weeks must be consecutive.');
  const headers = items.filter(item => Math.abs(item.transform[5] - 505) < 1).sort((a, b) => a.transform[4] - b.transform[4]);
  if (headers.length !== 10 || headers.some((item, index) => item.str !== weekdays[index % 5] ||
      Math.abs(item.transform[4] + item.width / 2 - columns[index] - 29) > 1)) {
    throw new AttendancePdfError('The PDF day columns have changed. No marks were imported.');
  }
  const names = items.filter(item => Math.abs(item.transform[4] - 33) < 1 && item.transform[5] < 500 && item.transform[5] > 70);
  if (!names.length || names.some(item => !item.str.includes(',') || item.str.length > 160)) {
    throw new AttendancePdfError('The PDF student rows were not recognised.');
  }
  const rows = names.map(item => ({ name: item.str.trim(), y: item.transform[5],
    days: columns.map((_, index) => {
      const day = new Date(weeks[index < 5 ? 0 : 1] + 'T00:00:00Z');
      day.setUTCDate(day.getUTCDate() + index % 5);
      return { date: iso(day), slots: Array(8).fill('') };
    }) }));
  const seen = new Set();
  const lastRowY = Math.min(...rows.map(row => row.y));
  for (const item of items.filter(item => item.transform[4] >= 198 && item.transform[4] < 790 &&
      item.transform[5] < 500 && item.transform[5] > 70)) {
    const total = /^Students: ([1-9]\d*)$/.exec(item.str);
    // Continued class lists show the whole-class total on their final page.
    if (total && Number(total[1]) >= rows.length && Math.abs(item.transform[4] - 648) < 1 &&
        Math.abs(item.transform[5] - (lastRowY - 19)) < 1) continue;
    const rowIndex = rows.findIndex(row => Math.abs(row.y - 1 - item.transform[5]) < 0.5);
    const column = columns.findIndex(x => Math.abs(x - item.transform[4]) < 0.5);
    if (rowIndex < 0 || column < 0 || !/^[*A-Z? ]{1,8}$/.test(item.str) ||
        Math.abs(item.width - item.str.length * 5.4) > 0.5 || seen.has(rowIndex + ':' + column)) {
      throw new AttendancePdfError('The PDF attendance positions were not recognised. No marks were imported.');
    }
    seen.add(rowIndex + ':' + column);
    // Keep break slots and leading blanks in position; never collapse whitespace.
    for (let slot = 0; slot < item.str.length; slot++) {
      const code = item.str[slot];
      if ([3, 6].includes(slot) && code !== ' ') throw new AttendancePdfError('The PDF contains attendance in a break slot. Check the export layout.');
      rows[rowIndex].days[column].slots[slot] = code === ' ' ? '' : code === '*' ? 'P' : code === 'L' ? 'L' : 'A';
    }
  }
  return { weeks, rows: rows.map(({ name, days }) => ({ name, days })) };
}
async function importAttendancePdf(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length > 5 * 1024 * 1024 || buffer.subarray(0, 5).toString() !== '%PDF-') {
    throw new AttendancePdfError('Choose a PDF no larger than 5 MB.');
  }
  let weeks, pages = 0, pageError;
  const rows = [];
  const document = await parsePdf(Uint8Array.from(buffer), { max: 31, pagerender: async page => {
    pages++;
    // pdf-parse swallows page-render errors, so propagate them after it releases the document.
    try {
      if (pages > 30) throw new AttendancePdfError('Use an attendance export of at most 30 pages.');
      const content = await page.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: true });
      const parsed = parseAttendancePage(content.items, page.view);
      if (weeks && weeks.join() !== parsed.weeks.join()) throw new AttendancePdfError('PDF pages contain different week headings.');
      weeks = parsed.weeks;
      rows.push(...parsed.rows);
    } catch (error) { pageError ||= error; }
    return '';
  } });
  if (pageError) throw pageError;
  if (document.numpages > 30 || pages !== document.numpages) throw new AttendancePdfError('Not all PDF pages could be read. Use an export of at most 30 pages.');
  if (!rows.length) throw new AttendancePdfError('No student attendance rows were found.');
  return { weeks, rows };
}
module.exports = { AttendancePdfError, importAttendancePdf, parseAttendancePage };
