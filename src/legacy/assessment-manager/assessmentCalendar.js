const { textContent } = require('./nzqaStandards');
const URL = 'https://www2.nzqa.govt.nz/ncea/exam-timetable-and-key-assessment-dates/key-dates-for-secondary-assessment/';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
function parseCalendar(html, year) {
  const published = textContent(html).match(/Key business dates\s+(20\d\d)/)?.[1];
  if (Number(published) !== year) throw new Error('NZQA has not published the requested year on its current calendar page.');
  const months = [...html.matchAll(/class="key-dates-page__month-english"[^>]*>([^<]+)</g)];
  if (new Set(months.map(match => match[1].trim())).size !== 12) throw new Error('The NZQA calendar month layout has changed.');
  const events = new Map();
  for (const [i, match] of months.entries()) {
    const month = MONTHS.indexOf(match[1].trim()) + 1;
    if (!month) throw new Error('NZQA returned an unknown calendar month.');
    const section = html.slice(match.index, months[i + 1]?.index ?? html.length);
    const entries = [...section.matchAll(/class="key-dates-page__key-date-numeric"[^>]*>(\d{1,2})<[\s\S]*?class="key-dates-page__key-date-summary"[^>]*>([\s\S]*?)<div\s+class="key-dates-page__calendar-link-wrapper"[\s\S]*?href="\/key-date\/download\/(\d+)"/g)];
    if (!entries.length) throw new Error('NZQA calendar dates could not be read for ' + MONTHS[month - 1] + '.');
    for (const [, day, summary, id] of entries) {
      const date = year + '-' + String(month).padStart(2, '0') + '-' + day.padStart(2, '0');
      const title = textContent(summary);
      if (!validDate(date) || !title) throw new Error('NZQA returned an invalid assessment date.');
      if (/ANNIVERSARY|SCHOOL HOLIDAYS|NEW YEAR|DAY AFTER NEW YEAR|WAITANGI DAY|ANZAC DAY|KING'S BIRTHDAY|MATARIKI|LABOUR DAY|CHRISTMAS DAY|BOXING DAY/.test(title)) continue;
      events.set('nzqa-' + id, { id: 'nzqa-' + id, title, date, endDate: '', details: '', needsConfirmation: false, revision: 0 });
    }
  }
  const values = [...events.values()];
  const examStart = values.find(event => /NCEA AND NZ SCHOLARSHIP EXAMS COMMENCE/i.test(event.title));
  const examEnd = values.find(event => /NCEA AND NZ SCHOLARSHIP EXAMINATIONS END/i.test(event.title));
  if (examStart && examEnd) examStart.endDate = examEnd.date;
  return values;
}
function schoolCalendar(year) {
  if (year !== 2026) return [];
  const sources = {
    'term-one': ['23 April 2026 school email', "Term 1 2026: enter the year's assessment programme in KAMAR."],
    'dtech-entries': ['23 April 2026 school email', 'End of May 2026: complete Senior Digital Technologies external entries. A specific 31 May deadline was not stated.'],
    'external-check': ['June 2026 WHS Key Assessment Dates slideshow', '30 August 2026: final check and confirmation of external assessment entries.'],
    'derived-exams': ['June 2026 WHS Key Assessment Dates slideshow', '14-17 September 2026: school derived-grade examinations.'],
    '91906-moderation': ['10 September 2026 school email; 2026 WHS moderation plan', '20 October 2026: AS 91906 external moderation submission. The supplied summary reports it was submitted on 25 September.'],
    'student-hand-in': ['June 2026 WHS Key Assessment Dates slideshow', '29 October 2026: final student hand-in for internal assessments.'],
    'publish-results': ['June 2026 WHS Key Assessment Dates slideshow; 11 November 2026 school email', '22 November 2026: publish internal results after marking and moderation.'],
    'markbooks': ['11 November 2026 school email', '1 December 2026: finalise and clean up KAMAR markbooks.']
  };
  return [
    ['term-one', '2026-01-26', "Term 1: enter the year's assessment programme in KAMAR", '2026-04-02', 'Timing was supplied as Term 1, not a specific day.'],
    ['dtech-entries', '2026-05-31', 'Complete Senior Digital Technologies external entries in KAMAR'],
    ['external-check', '2026-08-30', 'Final check and confirmation of external assessment entries'],
    ['derived-exams', '2026-09-14', 'School derived-grade examinations', '2026-09-17'],
    ['91906-moderation', '2026-10-20', 'AS 91906 external moderation: confirm the submission arrangement', '', 'The supplied standard-specific date differs from the published 19 October external-moderation deadline. Confirm the arrangement before relying on 20 October.', true],
    ['student-hand-in', '2026-10-29', 'Final student hand-in for internal assessments'],
    ['publish-results', '2026-11-22', 'Finish marking and moderation, then publish internal results'],
    ['markbooks', '2026-12-01', 'Finalise and clean up KAMAR markbooks']
  ].map(([key, date, title, endDate = '', details = '', needsConfirmation = false]) =>
    ({ id: 'whs-' + key, date, title, endDate, details, needsConfirmation, revision: 0,
      sourceDocument: sources[key][0], sourceDeadline: sources[key][1] }));
}
async function nationalCalendar(year, { query, fetchImpl = fetch, now = new Date() }) {
  const cached = (await query('SELECT events,checked_at FROM assessment_calendar_cache WHERE year=$1', [year])).rows[0];
  if (cached && now - new Date(cached.checked_at) < 6 * 60 * 60 * 1000) return { events: cached.events, checkedAt: cached.checked_at, warning: '' };
  try {
    const response = await fetchImpl(URL, { signal: AbortSignal.timeout(15000), headers: { Accept: 'text/html' } });
    if (!response.ok) throw new Error('NZQA returned HTTP ' + response.status + '.');
    const html = await response.text();
    if (html.length > 2000000) throw new Error('The NZQA calendar response was too large.');
    const events = parseCalendar(html, year);
    await query(`INSERT INTO assessment_calendar_cache(year,events,checked_at) VALUES($1,$2::jsonb,$3)
      ON CONFLICT(year) DO UPDATE SET events=EXCLUDED.events,checked_at=EXCLUDED.checked_at`, [year, JSON.stringify(events), now.toISOString()]);
    return { events, checkedAt: now.toISOString(), warning: '' };
  } catch (error) {
    console.error('Assessment calendar refresh failed:', error.message);
    return { events: cached?.events || [], checkedAt: cached?.checked_at || null,
      warning: error.message + (cached ? ' Showing the last saved calendar; its dates may have changed.' : ' National dates are unavailable. School and personal dates are still shown.') };
  }
}
module.exports = { URL, MONTHS, validDate, parseCalendar, schoolCalendar, nationalCalendar };
