const crypto = require('node:crypto');
const { Pool } = require('pg');
const config = require('./config');
const { databaseOptions } = require('./modules/teacherPlanner');
const { validKey } = require('./legacy/teacher-planner/planner');
const { DATE_FIELDS } = require('./legacy/teacher-planner/schoolSettings');
const { loadCalendar, loadTimetable } = require('./legacy/teacher-planner/kamarCalendar');
const { createGoogleCalendarReaders } = require('./legacy/teacher-planner/googleCalendar');
const { documentRanges } = require('./legacy/teacher-planner/googleDocEvents');
const { selectRegionalHolidays } = require('./legacy/teacher-planner/regionalHolidays');
const { loadSchoolCalendar } = require('./schoolCalendar');
const { loadPublicHolidays } = require('./publicHolidays');
const { URL: nzqaUrl, parseCalendar, schoolCalendar } = require('./legacy/assessment-manager/assessmentCalendar');
const { fetchExamTimetable } = require('./legacy/assessment-manager/examTimetable');

const SECTIONS = ['year', 'term', 'week'];
const LABELS = { teacherFirstDay: 'Teacher first day', studentFirstDay: 'First student start date' };
for (let term = 1; term <= 4; term++) {
  LABELS['term' + term + 'Start'] = 'Term ' + term + ' start';
  LABELS['term' + term + 'End'] = 'Term ' + term + ' end';
}
const localDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit', day: '2-digit'
});
function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
function eventDay(value) {
  if (validDate(value)) return value;
  if (!validDate(value.slice(0, 10)) || !Number.isFinite(Date.parse(value))) throw new Error('Invalid calendar timestamp.');
  // KAMAR floating times are NZ-local; do not interpret them in the server's timezone.
  return /(?:Z|[+-]\d\d:\d\d)$/.test(value) ? localDay.format(new Date(value)) : value.slice(0, 10);
}
function plannerLink(origin, year, section = 'year', key = 'main') {
  const params = new URLSearchParams({ section, year: String(year) });
  if (section === 'week') params.set('week', key);
  if (section === 'term') params.set('term', key);
  return origin + '/teacher-planner/#' + params;
}
function recordMetadata(row, origin) {
  if (!SECTIONS.includes(row.section) || !validKey(row.year, row.section, row.entry_key) ||
      !Number.isInteger(row.revision) || row.revision < 1 || !Number.isFinite(Date.parse(row.updated_at))) {
    throw new Error('Invalid saved Planner record metadata.');
  }
  const result = { id: `${row.year}:${row.section}:${row.entry_key}`, year: row.year,
    section: row.section, key: row.entry_key, revision: row.revision,
    updatedAt: new Date(row.updated_at).toISOString(), url: plannerLink(origin, row.year, row.section, row.entry_key) };
  if (row.section === 'week') result.weekStarting = row.entry_key;
  if (row.section === 'term') {
    result.term = Number(row.entry_key);
    for (const name of ['startDate', 'endDate']) {
      const value = row.dates?.[name];
      if (value !== undefined && value !== null && value !== '') {
        if (!validDate(value)) throw new Error('Invalid saved term date.');
        result[name] = value;
      }
    }
  }
  return result;
}

function createTeacherPlannerMcpData({ query: suppliedQuery, env = process.env, fetchImpl = fetch,
  sources = {}, origin = config.appBaseUrl } = {}) {
  let pool;
  const query = suppliedQuery || ((sql, values) => {
    if (!pool) {
      pool = new Pool(databaseOptions(env));
      pool.on('error', () => console.error('Planner MCP database connection failed.'));
    }
    return pool.query(sql, values);
  });
  const metadataSql = `SELECT year,section,entry_key,revision,updated_at,
    CASE WHEN section='term' THEN jsonb_build_object('startDate',content->'startDate','endDate',content->'endDate') END AS dates
    FROM planner_sections WHERE owner_id=$1 AND section IN ('year','term','week')`;
  async function listRecords(owner, year) {
    if (year === undefined) {
      const result = await query(`SELECT DISTINCT year FROM planner_sections
        WHERE owner_id=$1 AND section IN ('year','term','week') ORDER BY year`, [owner]);
      if (result.rows.some(row => !Number.isInteger(row.year) || row.year < 2000 || row.year > 2100)) {
        throw new Error('Invalid saved Planner year.');
      }
      return { years: result.rows.map(row => row.year), records: [] };
    }
    const result = await query(metadataSql + ' AND year=$2 ORDER BY section,entry_key LIMIT 71', [owner, year]);
    if (result.rows.length > 70) throw new Error('Too many saved planning records for this year.');
    return { years: [year], records: result.rows.map(row => recordMetadata(row, origin)) };
  }
  async function getRecord(owner, year, section, key) {
    if (!SECTIONS.includes(section) || !validKey(year, section, key)) throw new Error('Invalid planning record address.');
    const result = await query(metadataSql + ' AND year=$2 AND section=$3 AND entry_key=$4', [owner, year, section, key]);
    return { found: result.rows.length > 0,
      record: result.rows.length ? recordMetadata(result.rows[0], origin) : null,
      contentExcluded: true };
  }
  async function calendarDates(owner, year, month) {
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const end = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const school = (await query(`SELECT content,revision,updated_at FROM school_planner_settings WHERE year=$1`, [year])).rows[0];
    const preferences = (await query(`SELECT content->>'anniversaryRegion' AS region FROM planner_sections
      WHERE owner_id=$1 AND year=2000 AND section='preferences' AND entry_key='main'`, [owner])).rows[0];
    const region = preferences?.region || 'Westland';
    const req = { user: { id: owner } };
    let ministryPromise;
    const ministry = () => {
      ministryPromise ||= (sources.ministry || loadSchoolCalendar)(year);
      return ministryPromise;
    };
    let google;
    const googleReaders = () => {
      google ||= createGoogleCalendarReaders({ query, fetchImpl, env: {
        ...env, APP_BASE_URL: origin, TEACHER_PLANNER_BASE_PATH: '/teacher-planner'
      } });
      return google;
    };
    const link = plannerLink(origin, year);
    const events = [];
    const statuses = [];
    async function collect(source, work, privateLabel) {
      try {
        const result = await work();
        if (!Array.isArray(result.events) || result.events.length > 5000) throw new Error('Invalid calendar event collection.');
        const projected = result.events.map(event => {
          const first = event.start || event.date;
          const last = event.end || event.endDate || first;
          const allDay = event.allDay !== undefined ? event.allDay : !first?.includes('T');
          if (!first || !last || (allDay ? !validDate(first) || !validDate(last) :
            !Number.isFinite(Date.parse(first)) || !Number.isFinite(Date.parse(last))) || last < first) {
            throw new Error('Invalid calendar event date.');
          }
          const day = eventDay(first);
          if (day >= end || eventDay(last) < start ||
              (event.endExclusive && last <= start)) return null;
          const title = privateLabel || event.title || event.name;
          if (typeof title !== 'string' || !title.trim() || title.length > 1000) throw new Error('Invalid public calendar label.');
          return { id: crypto.createHash('sha256').update(JSON.stringify([source, event.id, first, last, title])).digest('hex'),
            source, title, start: first, end: last, allDay, endExclusive: Boolean(event.endExclusive),
            needsConfirmation: Boolean(event.needsConfirmation), weeklyReference: Boolean(event.weeklyReference), url: link };
        }).filter(Boolean);
        events.push(...projected);
        statuses.push({ source, status: result.warning ? 'partial' : 'ok', count: projected.length,
          ...(result.warning ? { warning: 'Some source entries or exact times are unavailable. Review the original calendar in Planner.' } : {}) });
      } catch {
        console.warn('Planner MCP calendar source unavailable:', source);
        statuses.push({ source, status: 'unavailable', count: 0,
          warning: 'This source could not be loaded completely. Check its configuration, permissions and dates in Planner; do not assume no events.' });
      }
    }
    await Promise.all([
      collect('planner-school-setup', async () => {
        const entries = [];
        for (const name of DATE_FIELDS) if (school?.content?.[name]) entries.push({ date: school.content[name], title: LABELS[name] });
        for (const event of school?.content?.events || []) {
          if (!['opening', 'teacherOnly', 'closure'].includes(event.kind)) throw new Error('Invalid saved school event kind.');
          entries.push({ date: event.date, title: { opening: 'School opening event', teacherOnly: 'Teacher-only day', closure: 'School closure' }[event.kind] });
        }
        return { events: entries };
      }),
      collect('ministry', async () => {
        const calendar = await ministry();
        if (!calendar.available) throw new Error('Ministry dates unavailable.');
        return { events: [...calendar.terms.map(item => ({ date: item.startDate, endDate: item.endDate,
          title: 'Ministry guidance: Term ' + item.term, needsConfirmation: true })),
        ...calendar.holidays.map(item => ({ date: item.startDate, endDate: item.endDate, title: 'School holidays' }))] };
      }),
      collect('government-holidays', async () => {
        let calendar;
        try { calendar = await ministry(); }
        catch { calendar = await (sources.holidays || loadPublicHolidays)(year); }
        calendar = selectRegionalHolidays(calendar, region);
        if (!calendar.publicHolidaysAvailable) throw new Error('Public holidays unavailable.');
        return { events: calendar.publicHolidays, warning: calendar.publicHolidaysError };
      }),
      collect('kamar-school', async () => {
        const result = await (sources.kamar || loadCalendar)(year, month);
        return { events: result.events.map(event => ({ ...event, endExclusive: event.allDay })) };
      }, 'School calendar event'),
      collect('kamar-timetable', async () => {
        const row = (await query('SELECT subscription_url FROM teacher_calendar_settings WHERE owner_id=$1', [owner])).rows[0];
        if (!row?.subscription_url) throw new Error('No private timetable configured.');
        const result = await (sources.timetable || loadTimetable)(row.subscription_url, year, month);
        return { events: result.events.map(event => ({ ...event, endExclusive: event.allDay })) };
      }, 'Timetable event'),
      collect('google-calendars', async () => {
        const result = await (sources.googleEvents || ((request, first, last) => googleReaders().events(request, first, last)))(req, start, end);
        return { events: result.events.map(event => ({ ...event, endExclusive: event.allDay })) };
      }, 'Calendar event'),
      collect('school-document', async () => {
        const dates = { ...school?.content, year: String(year) };
        if (DATE_FIELDS.filter(name => /^term/.test(name)).some(name => !dates[name])) {
          const calendar = await ministry();
          for (const term of calendar.terms) {
            dates['term' + term.term + 'Start'] ||= term.startDate;
            dates['term' + term.term + 'End'] ||= term.endDate;
          }
        }
        const result = await (sources.documentEvents || ((request, mapping) => googleReaders().documentEvents(request, mapping)))(req, documentRanges(dates));
        return { events: result.events.map(event => ({ date: event.date, weeklyReference: event.weeklyReference,
          needsConfirmation: event.weeklyReference })), warning: result.warnings?.length };
      }, 'School document event'),
      collect('nzqa-key-dates', async () => {
        if (sources.nzqa) return sources.nzqa(year);
        const response = await fetchImpl(nzqaUrl, { redirect: 'error', signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error('NZQA unavailable.');
        const html = await response.text();
        if (html.length > 2000000) throw new Error('NZQA calendar too large.');
        return { events: parseCalendar(html, year) };
      }),
      collect('nzqa-exams', () => (sources.exams || fetchExamTimetable)(year, fetchImpl)),
      collect('school-assessment-dates', async () => ({ events: schoolCalendar(year).map(event => ({
        ...event, needsConfirmation: event.needsConfirmation || ['whs-term-one', 'whs-dtech-entries'].includes(event.id)
      })) }))
    ]);
    const unique = [...new Map(events.map(event => [event.id, event])).values()];
    if (unique.length > 5000) throw new Error('Too many calendar events. Open the original Planner calendars.');
    return { year, month, timeZone: 'Pacific/Auckland', retrievedAt: new Date().toISOString(),
      complete: statuses.every(source => source.status === 'ok'),
      sources: statuses.sort((a, b) => a.source.localeCompare(b.source)),
      events: unique.sort((a, b) => a.start.localeCompare(b.start) || a.source.localeCompare(b.source)) };
  }
  return { listRecords, getRecord, calendarDates };
}

module.exports = { createTeacherPlannerMcpData, plannerLink };
