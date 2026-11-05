const PUBLIC_HOLIDAYS_URL = 'https://www.govt.nz/browse/work-and-tax/public-holidays-and-work/dates-for-public-holidays-and-anniversary-days/';
const EMPLOYMENT_HOLIDAYS_URL = 'https://www.employment.govt.nz/leave-and-holidays/public-holidays/public-holidays-and-anniversary-dates';
const months = ['january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december'];
const text = html => html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/g, ' ')
  .replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

function parsePublicHolidays(html, year) {
  const tables = [...html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)];
  if (!tables.some(table => /National public holidays/i.test(text(table[1])))) throw new Error('Government holiday tables were not recognised.');
  const holidays = [], regionalAnniversaries = [];
  let national = 0, westland = 0;
  for (const [, table] of tables) {
    const caption = text(table.match(/<caption\b[^>]*>([\s\S]*?)<\/caption>/i)?.[1] || '');
    const isNational = caption === `${year} — National public holidays`;
    const isRegional = caption === `${year} — Regional anniversary days`;
    if (!isNational && !isRegional) continue;
    for (const [, row] of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(cell => text(cell[1]));
      if (!cells.length) continue;
      const description = isNational ? cells[1] : cells[2];
      if (!description) throw new Error('Government holiday date column was missing.');
      // Parse visible dates: source datetime attributes can disagree with the displayed date.
      const dates = [...description.matchAll(/(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)/gi)];
      if (!dates.length || dates.length > 2) throw new Error('Government holiday date was not recognised.');
      dates.forEach((match, index) => {
        const date = `${year}-${String(months.indexOf(match[2].toLowerCase()) + 1).padStart(2, '0')}-${match[1].padStart(2, '0')}`;
        const parsed = new Date(date + 'T00:00:00Z');
        if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw new Error('Invalid government holiday date.');
        if (isRegional) {
          regionalAnniversaries.push({ region: cells[0], date, name: cells[0] + ' Anniversary Day (observed)' });
          if (cells[0] === 'Westland') holidays.push({ date, name: 'Westland Anniversary Day (observed)' });
        } else holidays.push({ date, name: cells[0] + (dates.length > 1 ? index ? ' (observed)' : ' (actual date)' : '') });
      });
      if (isNational) national++;
      else if (cells[0] === 'Westland') westland++;
    }
  }
  if (!national && !westland) return { publicHolidaysAvailable: false, publicHolidays: [], publicHolidaysSourceUrl: PUBLIC_HOLIDAYS_URL };
  if (national !== 11 || westland !== 1) throw new Error('Government holiday dates were incomplete.');
  return { publicHolidaysAvailable: true, publicHolidays: holidays, regionalAnniversaries, publicHolidaysSourceUrl: PUBLIC_HOLIDAYS_URL };
}
function parseEmploymentPublicHolidays(html, year) {
  const sections = [...html.matchAll(/(?:<h[2-4]\b[^>]*>\s*|<v-accordion\b[^>]*\btitle=")(\d{4}) public holiday and anniversary dates(?:\s*<\/h[2-4]>|")/gi)];
  if (!sections.length) throw new Error('Employment NZ holiday year sections were not recognised.');
  const index = sections.findIndex(section => Number(section[1]) === year);
  if (index < 0) return { publicHolidaysAvailable: false, publicHolidays: [], publicHolidaysSourceUrl: EMPLOYMENT_HOLIDAYS_URL };
  const section = sections[index];
  const tables = [...html.slice(section.index + section[0].length, sections[index + 1]?.index ?? html.length)
    .matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)];
  if (tables.length !== 2) throw new Error('Employment NZ holiday tables were incomplete.');
  const headings = table => [...table.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map(cell => text(cell[1]).toLowerCase()).join('|');
  if (headings(tables[0][1]) !== 'holiday|actual date|observed date' ||
    headings(tables[1][1]) !== 'province|actual date|observed date') {
    throw new Error('Employment NZ holiday columns were not recognised.');
  }
  const nationalRows = [...tables[0][1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(([, row]) => {
    const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)];
    if (!cells.length) return '';
    if (cells.length !== 3) throw new Error('Employment NZ holiday date column was missing.');
    return `<tr><td>${cells[0][1]}</td><td>${cells[2][1]}</td></tr>`;
  }).join('');
  const result = parsePublicHolidays(`<table><caption>${year} — National public holidays</caption>${nationalRows}</table>` +
    `<table><caption>${year} — Regional anniversary days</caption>${tables[1][1]}</table>`, year);
  return { ...result, publicHolidaysSourceUrl: EMPLOYMENT_HOLIDAYS_URL };
}
async function loadPublicHolidays(year, fetchSource = fetch) {
  try {
    const response = await fetchSource(PUBLIC_HOLIDAYS_URL, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('Government public holiday source returned ' + response.status);
    const result = parsePublicHolidays(await response.text(), year);
    if (result.publicHolidaysAvailable) return result;
  } catch (error) {
    console.warn('Government holiday source unavailable; checking Employment NZ:', error.name);
  }
  const response = await fetchSource(EMPLOYMENT_HOLIDAYS_URL, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('Government public holiday source returned ' + response.status);
  return parseEmploymentPublicHolidays(await response.text(), year);
}
module.exports = { parsePublicHolidays, parseEmploymentPublicHolidays, loadPublicHolidays };
