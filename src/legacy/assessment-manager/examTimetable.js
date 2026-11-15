const crypto = require('crypto');
const { textContent, decodeEntities } = require('./nzqaStandards');
const { MONTHS, validDate } = require('./assessmentCalendar');

const URL = 'https://www2.nzqa.govt.nz/ncea/exam-timetable-and-key-assessment-dates/exam-timetable/';
const normalise = value => String(value || '').trim().toLocaleLowerCase('en-NZ').replace(/\s+/g, ' ');
const subjectAliases = {
  DTECH: ['Digital Technologies'], COMP: ['Digital Technologies'], DTONLINE: ['Digital Technologies'],
  MPROG: ['Digital Technologies'], 'DIGITAL TECHNOLOGY': ['Digital Technologies'],
  'DESIGN VISUAL COMMUNICATION': ['Design and Visual Communication'],
  TECH: ['Technology'], DVC: ['Design and Visual Communication'],
  FOOD: ['Home Economics', 'Materials and Processing Technology'], HOSP: ['Home Economics'],
  TEXTILES: ['Materials and Processing Technology', 'Technology'], WOOD: ['Materials and Processing Technology', 'Technology']
};
const departmentSubjects = {
  technology: ['Digital Technologies', 'Design and Visual Communication', 'Materials and Processing Technology', 'Technology']
};
function dateFromText(value, year) {
  const match = textContent(value).match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\b/i);
  if (!match) throw new Error('NZQA timetable contains an unrecognised date.');
  const month = MONTHS.findIndex(item => item.toLowerCase() === match[2].toLowerCase()) + 1;
  const date = year + '-' + String(month).padStart(2, '0') + '-' + match[1].padStart(2, '0');
  if (!validDate(date)) throw new Error('NZQA timetable contains an invalid date.');
  return date;
}
function eventId(kind, level, subject) {
  return 'nzqa-exam-' + crypto.createHash('sha256').update([kind, normalise(level), normalise(subject)].join('|')).digest('hex').slice(0, 24);
}
function event(kind, level, subject, date, details) {
  return { id: eventId(kind, level, subject), title: level + ' ' + subject + (kind === 'exam' ? ' exam' : ' portfolio submission'),
    date, endDate: '', details, needsConfirmation: false, revision: 0, subject, sourceUrl: URL };
}
function rows(section) {
  const starts = [...section.matchAll(/<div\s+class="exam-timetable-page__table-row[^"]*"[^>]*>/g)];
  return starts.map((match, index) => section.slice(match.index, starts[index + 1]?.index ?? section.length));
}
function parseTimetable(html, year) {
  const published = textContent(html.match(/<p class="page-hero__summary">([\s\S]*?)<\/p>/)?.[1] || '')
    .match(/\b(20\d{2})\b/)?.[1];
  if (Number(published) !== year) throw new Error('NZQA has not published the requested year on its exam timetable page.');
  const start = html.indexOf('<form id="ExamTimetableList"'), end = html.indexOf('</form>', start);
  if (start < 0 || end < 0) throw new Error('The NZQA examination timetable layout has changed.');
  const examination = html.slice(start, end);
  const headings = [...examination.matchAll(/<h3 class="exam-timetable-page__exam-list-item-title"[^>]*>([\s\S]*?)<\/h3>/g)];
  if (!headings.length) throw new Error('The NZQA examination timetable contains no exam dates.');
  const events = [];
  for (const [index, heading] of headings.entries()) {
    const date = dateFromText(heading[1], year);
    const section = examination.slice(heading.index + heading[0].length, headings[index + 1]?.index ?? examination.length);
    for (const row of rows(section)) {
      const time = textContent(row.match(/role="rowheader"[^>]*>([\s\S]*?)<\/div>/)?.[1] || '');
      const items = [...row.matchAll(/<div class="exam-timetable-page__exam-list-cell-item checkbox">([\s\S]*?)<\/div>/g)];
      if (items.length && !/^\d{1,2}:\d{2}\s*(?:am|pm)$/i.test(time)) throw new Error('An NZQA exam start time could not be read.');
      for (const item of items) {
        const label = decodeEntities(item[1].match(/aria-label="Select ([^"]+) to add to calendar"/)?.[1] || '');
        const match = label.match(/^(Level [123]|Scholarship)\s+(.+)$/);
        if (!match) throw new Error('An NZQA exam subject could not be read.');
        const scheduled = event('exam', match[1], match[2], date, 'Starts ' + time + ' New Zealand time.' +
          (/class="digitally-assessed"/.test(item[1]) ? ' Digitally assessed.' : ''));
        scheduled.title += ' (' + time + ')';
        events.push(scheduled);
      }
    }
  }
  const submissionStart = html.indexOf('Dates for submitting portfolios and reports', end);
  if (submissionStart < 0) throw new Error('NZQA portfolio submission dates could not be found.');
  const submissionEnd = html.indexOf('<h2', submissionStart);
  const submissions = html.slice(submissionStart, submissionEnd < 0 ? html.length : submissionEnd);
  let submissionCount = 0;
  for (const row of rows(submissions)) {
    const items = [...row.matchAll(/<div class="exam-timetable-page__exam-list-cell-item">([\s\S]*?)<\/div>/g)];
    if (!items.length) continue;
    const date = dateFromText(row.match(/class="exam-timetable-page__table-cell[^"]*"[^>]*>([\s\S]*?)<\/div>/)?.[1] || '', year);
    for (const item of items) {
      const match = textContent(item[1]).match(/^(Level [123]|Scholarship)\s+(.+)$/);
      if (!match) throw new Error('An NZQA portfolio subject could not be read.');
      events.push(event('submission', match[1], match[2], date, 'Final date for schools to submit portfolios or reports to NZQA.'));
      submissionCount++;
    }
  }
  if (!events.length || !submissionCount || new Set(events.map(item => item.id)).size !== events.length) {
    throw new Error('The NZQA timetable could not be read completely.');
  }
  return events;
}
function parseAssessmentPdf(content, year, sourceUrl) {
  if (!new RegExp('NCEA and NZ Scholarship Assessment Timetable\\s+' + year + '\\b', 'i').test(content)) {
    throw new Error('The downloaded NZQA assessment timetable is for a different year.');
  }
  const events = [];
  for (const line of content.split(/\r?\n/)) {
    const match = line.trim().match(/^Term\s+[1-4]\s+(\d{1,2})\s+([A-Za-z]+)\s+(.+?)\s+(L[123](?:,\s*(?:L[123]|NZ Schol))*|NZ Schol)\s+NZC\s+N\/A\s+Submission\s*$/);
    if (!match) {
      if (/\bNZC\s+N\/A\s+Submission\s*$/.test(line)) throw new Error('An NZQA portfolio submission could not be read from the PDF.');
      continue;
    }
    const subject = match[3].replace(/\s+\d\.\d(?:\s+and\s+\d\.\d)?$/, '').trim();
    const date = dateFromText(match[1] + ' ' + match[2], year);
    for (const level of match[4].split(/,\s*/)) {
      const item = event('submission', level === 'NZ Schol' ? 'Scholarship' : 'Level ' + level.slice(1), subject, date,
        'Final date for schools to submit portfolios or reports to NZQA.');
      item.sourceUrl = sourceUrl; events.push(item);
    }
  }
  if (!events.length || new Set(events.map(item => item.id)).size !== events.length) {
    throw new Error('The NZQA assessment timetable PDF could not be read completely.');
  }
  return events;
}
function filterTimetable(events, departments) {
  const available = new Map(events.map(item => [normalise(item.subject), item.subject]));
  const selected = new Set(), unknown = [];
  for (const department of departments) {
    const departmentName = normalise(department.name);
    const direct = available.get(departmentName);
    if (direct) selected.add(normalise(direct));
    for (const subject of departmentSubjects[departmentName] || []) selected.add(normalise(subject));
    for (const code of department.subjects) {
      const mapped = subjectAliases[code.toUpperCase()];
      if (mapped) mapped.forEach(subject => selected.add(normalise(subject)));
      else if (available.has(normalise(code))) selected.add(normalise(code));
      else unknown.push(code);
    }
    if (!direct && !departmentSubjects[departmentName] && !department.subjects.length) unknown.push(department.name);
  }
  return { events: events.filter(item => selected.has(normalise(item.subject))), unknown: [...new Set(unknown)] };
}
async function examTimetable(year, { query, fetchImpl = fetch, now = new Date() }) {
  const cached = (await query('SELECT events,checked_at,warning FROM assessment_exam_timetable_cache WHERE year=$1', [year])).rows[0];
  if (cached && now - new Date(cached.checked_at) < 6 * 60 * 60 * 1000) return { events: cached.events, warning: cached.warning || '' };
  try {
    const response = await fetchImpl(URL, { signal: AbortSignal.timeout(15000), headers: { Accept: 'text/html' } });
    if (!response.ok) throw new Error('NZQA returned HTTP ' + response.status + '.');
    const html = await response.text();
    if (html.length > 2000000) throw new Error('The NZQA timetable response was too large.');
    const published = textContent(html.match(/<p class="page-hero__summary">([\s\S]*?)<\/p>/)?.[1] || '')
      .match(/\b(20\d{2})\b/)?.[1];
    let events, warning = '';
    if (Number(published) === year) events = parseTimetable(html, year);
    else {
      const heading = new RegExp('<h2[^>]*>\\s*' + year + '\\s+NCEA and NZ Scholarship assessment timetable\\s*</h2>', 'i').exec(html);
      const section = heading && html.slice(heading.index + heading[0].length).split(/<h2\b/i)[0];
      const href = section?.match(/href="([^"]+\.pdf)"/i)?.[1];
      if (!href) throw new Error('NZQA has not published the requested year on its exam timetable page.');
      const pdfUrl = new globalThis.URL(decodeEntities(href), URL);
      if (pdfUrl.protocol !== 'https:' || pdfUrl.hostname !== 'www2.nzqa.govt.nz' || !pdfUrl.pathname.startsWith('/assets/')) {
        throw new Error('The NZQA assessment timetable PDF link is invalid.');
      }
      const response = await fetchImpl(pdfUrl.href, { signal: AbortSignal.timeout(15000), headers: { Accept: 'application/pdf' } });
      if (!response.ok) throw new Error('NZQA assessment timetable PDF returned HTTP ' + response.status + '.');
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > 2000000) throw new Error('The NZQA assessment timetable PDF was too large.');
      const pdf = await require('pdf-parse')(buffer);
      events = parseAssessmentPdf(pdf.text, year, pdfUrl.href);
      warning = 'Individual ' + year + ' examination times are not available on the current NZQA timetable page. Portfolio dates are from the published assessment timetable PDF; check NZQA for updates.';
    }
    await query(`INSERT INTO assessment_exam_timetable_cache(year,events,checked_at,warning) VALUES($1,$2::jsonb,$3,$4)
      ON CONFLICT(year) DO UPDATE SET events=EXCLUDED.events,checked_at=EXCLUDED.checked_at,warning=EXCLUDED.warning`, [year, JSON.stringify(events), now.toISOString(), warning]);
    return { events, warning };
  } catch (error) {
    console.error('NZQA exam timetable refresh failed:', error.message);
    return { events: cached?.events || [], warning: error.message + (cached
      ? ' Showing the last saved exam timetable; dates may have changed.' : ' Department exam and portfolio dates are unavailable.') };
  }
}
module.exports = { URL, parseTimetable, parseAssessmentPdf, filterTimetable, examTimetable };
