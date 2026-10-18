const PUBLIC_HOLIDAYS_URL = 'https://www.govt.nz/browse/work-and-tax/public-holidays-and-work/dates-for-public-holidays-and-anniversary-days/';
const months = ['january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december'];
const text = html => html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/g, ' ')
  .replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

function parsePublicHolidays(html, year) {
  const tables = [...html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)];
  if (!tables.some(table => /National public holidays/i.test(text(table[1])))) throw new Error('Government holiday tables were not recognised.');
  const holidays = [];
  let national = 0, westland = 0;
  for (const [, table] of tables) {
    const caption = text(table.match(/<caption\b[^>]*>([\s\S]*?)<\/caption>/i)?.[1] || '');
    const isNational = caption === `${year} — National public holidays`;
    const isRegional = caption === `${year} — Regional anniversary days`;
    if (!isNational && !isRegional) continue;
    for (const [, row] of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(cell => text(cell[1]));
      if (!cells.length || (isRegional && cells[0] !== 'Westland')) continue;
      const description = isNational ? cells[1] : cells[2];
      if (!description) throw new Error('Government holiday date column was missing.');
      // Parse visible dates: source datetime attributes can disagree with the displayed date.
      const dates = [...description.matchAll(/(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)/gi)];
      if (!dates.length || dates.length > 2) throw new Error('Government holiday date was not recognised.');
      dates.forEach((match, index) => {
        const date = `${year}-${String(months.indexOf(match[2].toLowerCase()) + 1).padStart(2, '0')}-${match[1].padStart(2, '0')}`;
        const parsed = new Date(date + 'T00:00:00Z');
        if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw new Error('Invalid government holiday date.');
        holidays.push({ date, name: isRegional ? 'Westland Anniversary Day (observed)' :
          cells[0] + (dates.length > 1 ? index ? ' (observed)' : ' (actual date)' : '') });
      });
      if (isNational) national++;
      else westland++;
    }
  }
  if (!national && !westland) return { publicHolidaysAvailable: false, publicHolidays: [], publicHolidaysSourceUrl: PUBLIC_HOLIDAYS_URL };
  if (national !== 11 || westland !== 1) throw new Error('Government holiday dates were incomplete.');
  return { publicHolidaysAvailable: true, publicHolidays: holidays, publicHolidaysSourceUrl: PUBLIC_HOLIDAYS_URL };
}
async function loadPublicHolidays(year) {
  const response = await fetch(PUBLIC_HOLIDAYS_URL, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('Government public holiday source returned ' + response.status);
  return parsePublicHolidays(await response.text(), year);
}
module.exports = { parsePublicHolidays, loadPublicHolidays };
