const ICAL = require('ical.js');

const SOURCE_URL = 'https://westlandhigh.school.kiwi/ics/school.ics';
const GOOGLE_URL = 'https://calendar.google.com/calendar/u/0/r?cid=' + encodeURIComponent('webcal://westlandhigh.school.kiwi/ics/school.ics');
const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit', day: '2-digit' });

function validTimetableUrl(value) {
  if (typeof value !== 'string' || value.length > 500) return false;
  if (value === '') return true;
  return /^https:\/\/westlandhigh\.school\.kiwi\/ics\/[A-Za-z0-9]+-[A-Za-z0-9]+\.ics$/.test(value);
}
async function fetchCalendarText(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000), redirect: 'error' });
  if (!response.ok) throw new Error('KAMAR calendar returned ' + response.status);
  const text = await response.text();
  if (text.length > 5 * 1024 * 1024) throw new Error('KAMAR calendar is too large.');
  const root = new ICAL.Component(ICAL.parse(text));
  if (root.name !== 'vcalendar') throw new Error('KAMAR did not return an iCalendar document.');
  return text;
}
const pendingTimetables = new Map();
async function loadTimetable(url, year, month) {
  if (!url || !validTimetableUrl(url)) throw new Error('Invalid teacher subscription.');
  let pending = pendingTimetables.get(url);
  if (!pending) {
    pending = fetchCalendarText(url).then(text => {
      pendingTimetables.delete(url);
      return text;
    }, error => {
      pendingTimetables.delete(url);
      throw error;
    });
    pendingTimetables.set(url, pending);
  }
  const text = await pending;
  return { year, month, events: parseCalendar(text, year, month), fetchedAt: new Date().toISOString() };
}
function calendarTime(time) {
  if (time.isDate) return time.toString();
  if (time.zone === ICAL.Timezone.localTimezone) {
    return time.toString();
  }
  return new Date(time.toUnixTime() * 1000).toISOString();
}
function eventDate(value) {
  return value.endsWith('Z') ? localDate.format(new Date(value)) : value.slice(0, 10);
}
function parseCalendar(text, year, month) {
  const root = new ICAL.Component(ICAL.parse(text));
  if (root.name !== 'vcalendar') throw new Error('KAMAR did not return an iCalendar document.');
  for (const zone of root.getAllSubcomponents('vtimezone')) {
    ICAL.TimezoneService.register(new ICAL.Timezone(zone));
  }
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const end = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const components = root.getAllSubcomponents('vevent');
  const exceptions = components.filter(item => item.hasProperty('recurrence-id'));
  const events = [];
  const handled = new Set();
  function append(event, from, to, id) {
    handled.add(event.component);
    if (event.component.getFirstPropertyValue('status') === 'CANCELLED') return;
    const first = calendarTime(from), last = calendarTime(to);
    if (eventDate(first) >= end || eventDate(last) < start || (from.isDate && last <= start)) return;
    events.push({ id, title: event.summary || 'Untitled event', start: first, end: last, allDay: from.isDate,
      location: event.location || '', description: event.description || '' });
  }
  for (const component of components) {
    if (component.hasProperty('recurrence-id')) continue;
    const event = new ICAL.Event(component);
    if (!event.startDate) throw new Error('KAMAR event has no start date.');
    if (event.isRecurring()) {
      for (const exception of exceptions) if (exception.getFirstPropertyValue('uid') === event.uid) event.relateException(new ICAL.Event(exception));
      const iterator = event.iterator();
      let count = 0, next;
      while ((next = iterator.next())) {
        if (++count > 50000) throw new Error('KAMAR recurrence exceeded the supported expansion limit.');
        if (next.toString().slice(0, 10) >= end) break;
        const occurrence = event.getOccurrenceDetails(next);
        append(occurrence.item, occurrence.startDate, occurrence.endDate, event.uid + ':' + next.toString());
      }
    } else append(event, event.startDate, event.endDate, event.uid);
  }
  for (const component of exceptions) {
    if (handled.has(component)) continue;
    const event = new ICAL.Event(component);
    append(event, event.startDate, event.endDate, event.uid + ':' + event.recurrenceId.toString());
  }
  events.sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
  return events;
}

let cached = null;
let pending = null;
async function loadCalendarFeed() {
  if (!cached || Date.now() - cached.at > 5 * 60 * 1000) {
    if (!pending) pending = (async () => {
      const text = await fetchCalendarText(SOURCE_URL);
      cached = { text, at: Date.now() };
    })().finally(() => { pending = null; });
    await pending;
  }
  return cached;
}
async function loadCalendar(year, month) {
  const feed = await loadCalendarFeed();
  return { year, month, events: parseCalendar(feed.text, year, month), sourceUrl: SOURCE_URL,
    googleUrl: GOOGLE_URL, fetchedAt: new Date(feed.at).toISOString() };
}
async function loadCalendarYear(year) {
  const feed = await loadCalendarFeed();
  const events = new Map();
  for (let month = 1; month <= 12; month++) {
    for (const event of parseCalendar(feed.text, year, month)) {
      events.set(JSON.stringify([event.id, event.start, event.end]), event);
    }
  }
  return { year, events: [...events.values()], sourceUrl: SOURCE_URL,
    fetchedAt: new Date(feed.at).toISOString() };
}
function previousSchoolDay(value) {
  const day = new Date(value + 'T00:00:00Z');
  day.setUTCDate(day.getUTCDate() - 1);
  while (day.getUTCDay() === 0 || day.getUTCDay() === 6) day.setUTCDate(day.getUTCDate() - 1);
  return day.toISOString().slice(0, 10);
}
function deriveTermDates(events, year) {
  const yearText = String(year);
  const firstDays = events.filter(event => /first day back at school/i.test(event.title || ''))
    .map(event => eventDate(event.start)).filter(value => value.startsWith(yearText + '-')).sort();
  if (!firstDays.length) {
    throw new Error('The KAMAR School Events feed has no first day back entry for ' + yearText + '.');
  }
  const firstDay = firstDays[0];
  const holidays = events.filter(event => event.allDay && /^school holidays?$/i.test((event.title || '').trim()))
    .map(event => ({ start: event.start, end: event.end }))
    .filter(event => /^\d{4}-\d{2}-\d{2}$/.test(event.start) && /^\d{4}-\d{2}-\d{2}$/.test(event.end) &&
      event.start.startsWith(yearText + '-') && event.start > firstDay && event.end > event.start)
    .sort((left, right) => left.start.localeCompare(right.start));
  if (holidays.length !== 4) {
    throw new Error('The KAMAR School Events feed must contain four School Holidays ranges after the first day back for ' + yearText + '.');
  }
  const dates = { studentFirstDay: firstDay };
  for (let term = 1; term <= 4; term++) {
    const start = term === 1 ? firstDay : holidays[term - 2].end;
    const end = previousSchoolDay(holidays[term - 1].start);
    if (!start.startsWith(yearText + '-') || end < start) {
      throw new Error('The KAMAR School Events feed has incomplete or out-of-order term dates for ' + yearText + '.');
    }
    dates['term' + term + 'Start'] = start;
    dates['term' + term + 'End'] = end;
  }
  return dates;
}

module.exports = { SOURCE_URL, GOOGLE_URL, parseCalendar, loadCalendar, loadCalendarYear,
  deriveTermDates, eventDate, validTimetableUrl, loadTimetable };
