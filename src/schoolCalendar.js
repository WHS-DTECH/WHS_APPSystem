const SOURCE_URL = 'https://www.education.govt.nz/school-terms-and-holidays-dates';
const { loadPublicHolidays } = require('./publicHolidays');
const months = ['january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december'];

function text(html) {
  return html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}
function parseSchoolCalendar(html, year) {
  const headings = [...html.matchAll(/<h([2-4])\b[^>]*>([\s\S]*?)<\/h\1>/gi)];
  if (!headings.some(heading => /^\d{4} school terms\b/i.test(text(heading[2])))) {
    throw new Error('Ministry calendar year headings were not recognised.');
  }
  const result = { year, terms: [], holidays: [], notes: [] };
  let mode = null;
  for (let i = 0; i < headings.length; i++) {
    const heading = text(headings[i][2]).replace(/#$/, '').trim();
    const group = heading.match(/^(\d{4}) school (terms|holidays)$/i);
    if (group) { mode = Number(group[1]) === year ? group[2].toLowerCase() : null; continue; }
    if (!mode) continue;
    const term = heading.match(/^Term ([1-4])(?:\s*\(|$)/i);
    if (!term && !/^Summer holidays$/i.test(heading)) { mode = null; continue; }
    const body = html.slice(headings[i].index + headings[i][0].length, headings[i + 1]?.index ?? html.length);
    const paragraph = body.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i);
    if (!paragraph) throw new Error('Ministry date paragraph was not found.');
    const description = text(paragraph[1]);
    if (!term) { result.notes.push(description); continue; }
    const dates = [...description.matchAll(/(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)(?:\s+(20\d{2}))?/gi)].map(match => {
      const value = `${match[3] || year}-${String(months.indexOf(match[2].toLowerCase()) + 1).padStart(2, '0')}-${match[1].padStart(2, '0')}`;
      const date = new Date(value + 'T00:00:00Z');
      if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value || Number(value.slice(0, 4)) !== year) {
        throw new Error('Ministry calendar contained an invalid date.');
      }
      return value;
    });
    if (dates.length < 2 || dates[0] > dates.at(-1)) throw new Error('Ministry calendar date range was not recognised.');
    result[mode].push({ term: Number(term[1]), startDate: dates[0], endDate: dates.at(-1), description });
  }
  if (!result.terms.length && !result.holidays.length) return { ...result, available: false };
  if (result.terms.length !== 4 || result.holidays.length !== 3
    || new Set(result.terms.map(item => item.term)).size !== 4
    || new Set(result.holidays.map(item => item.term)).size !== 3) throw new Error('Ministry calendar was incomplete.');
  return { ...result, available: true };
}

async function loadSchoolCalendar(year) {
  const publicHolidays = loadPublicHolidays(year).catch(error => {
    console.error('Public holiday source failed:', error);
    return { publicHolidaysAvailable: false, publicHolidays: [], publicHolidaysError: 'Public holiday dates could not be loaded from govt.nz. Retry shortly.' };
  });
  const response = await fetch(SOURCE_URL, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('Ministry calendar source returned ' + response.status);
  return { ...parseSchoolCalendar(await response.text(), year), ...await publicHolidays,
    sourceUrl: SOURCE_URL, fetchedAt: new Date().toISOString() };
}

module.exports = { loadSchoolCalendar, parseSchoolCalendar };
