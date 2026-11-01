const DOCUMENT_ID = '1CeQsohEKMEwEGpdHHOXbgV_d77MAwGBVYdZZdQ5h0vw';
const DOCUMENT_URL = 'https://docs.google.com/document/d/' + DOCUMENT_ID + '/edit';
const DOCS_SCOPE = 'https://www.googleapis.com/auth/documents.readonly';
const DAY = 86400000;
const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const iso = day => new Date(day).toISOString().slice(0, 10);
function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && iso(Date.parse(value)) === value;
}
function documentRanges(params) {
  const year = Number(params.year);
  if (!/^\d{4}$/.test(params.year) || year < 2000 || year > 2100) throw new Error('Choose a valid planner year.');
  const ranges = [];
  for (let term = 1; term <= 4; term++) {
    let start = params['term' + term + 'Start'], end = params['term' + term + 'End'];
    if (!validDate(start) || !validDate(end) || !start.startsWith(year + '-') || !end.startsWith(year + '-') || start > end) {
      throw new Error('Set valid dates for all four terms in Setup My Planner before syncing.');
    }
    if (term === 1 && params.studentFirstDay) {
      if (!validDate(params.studentFirstDay) || params.studentFirstDay > end) throw new Error('Check the first student day in Setup My Planner.');
      if (params.studentFirstDay > start) start = params.studentFirstDay;
    }
    if (ranges.length && ranges.at(-1).end >= start) throw new Error('School terms overlap. Check Setup My Planner before syncing.');
    const weeks = [];
    for (let day = Date.parse(start); day <= Date.parse(end); day += DAY) {
      const weekday = new Date(day).getUTCDay();
      if (weekday === 0 || weekday === 6) continue;
      const monday = iso(day - (weekday - 1) * DAY);
      if (weeks.at(-1) !== monday) weeks.push(monday);
    }
    ranges.push({ term, start, end, weeks });
  }
  return { year, ranges };
}
function paragraphText(element) {
  return (element.paragraph?.elements || []).map(run => run.textRun?.content || '').join('').trim();
}
function cellText(cell) {
  return (cell.content || []).map(paragraphText).filter(Boolean).join('\n').trim();
}
function parseDocumentEvents(document, mapping) {
  const events = [], warnings = [], seen = new Set();
  let recognised = 0, documentYear;
  function add(text, kind, range, week) {
    text = text.replace(/^[*\u2022]\s*/, '').trim();
    if (!text || text === '*') return;
    const monday = range.weeks[week - 1];
    if (!monday) { warnings.push('Term ' + range.term + ' Week ' + week + ' is outside the configured teaching weeks.'); return; }
    const noHui = /^no (?:hui|meetings?|assembl(?:y|ies))\b/i.test(text);
    const weekly = kind === 'school' || noHui;
    let day = Date.parse(monday) + (weekly ? 0 : kind === 'hui' ? 1 : 2) * DAY;
    let explicit = false;
    const namedDate = /\b(\d{1,2})(?:st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\b/i.exec(text);
    const numericDate = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/.exec(text);
    const namedDay = /\b(?:on\s+)?(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b(?:\s+(\d{1,2})(?:st|nd|rd|th))?/i.exec(text);
    if (namedDate || numericDate) {
      const number = Number((namedDate || numericDate)[1]);
      const month = namedDate ? months.indexOf(namedDate[2].toLowerCase()) + 1 : Number(numericDate[2]);
      const year = numericDate?.[3] ? Number(numericDate[3]) : mapping.year;
      const date = year + '-' + String(month).padStart(2, '0') + '-' + String(number).padStart(2, '0');
      if (!validDate(date)) { warnings.push('Invalid date in: ' + text); return; }
      day = Date.parse(date); explicit = true;
    } else if (namedDay) {
      day = Date.parse(monday) + ((weekdays.indexOf(namedDay[1].toLowerCase()) + 6) % 7) * DAY;
      if (namedDay[2] && new Date(day).getUTCDate() !== Number(namedDay[2])) {
        warnings.push('Day/date does not match Term ' + range.term + ' Week ' + week + ': ' + text); return;
      }
      explicit = true;
    }
    const date = iso(day);
    if (day < Date.parse(monday) || day >= Date.parse(monday) + 7 * DAY || date < range.start || date > range.end) {
      warnings.push('Date falls outside its teaching week or term: ' + text); return;
    }
    const weekday = new Date(day).getUTCDay();
    let startTime = !weekly && kind === 'hui' && weekday === 2 ? '15:30' :
      !weekly && kind === 'assembly' && weekday === 3 ? '10:45' : '';
    let endTime = startTime === '15:30' ? '16:30' : startTime === '10:45' ? '11:15' : '';
    let time = startTime ? startTime + '–' + endTime : '';
    const statedTime = /\b(?:at\s+)?(\d{1,2})[.:](\d{2})\s*(am|pm)?\b/i.exec(text);
    if (statedTime && !noHui) {
      let hour = Number(statedTime[1]);
      const minute = Number(statedTime[2]);
      const finish = /^\s*(?:-|–|to)\s*(\d{1,2})[.:](\d{2})\s*(am|pm)?\b/i.exec(text.slice(statedTime.index + statedTime[0].length));
      let startMeridiem = statedTime[3] || finish?.[3];
      if (!statedTime[3] && finish?.[3]?.toLowerCase() === 'pm' && hour < 12 &&
          (Number(finish[1]) === 12 || hour > Number(finish[1]))) startMeridiem = 'am';
      if (startMeridiem && (hour < 1 || hour > 12)) { warnings.push('Invalid time in: ' + text); return; }
      if (startMeridiem) hour = hour % 12 + (startMeridiem.toLowerCase() === 'pm' ? 12 : 0);
      if (hour > 23 || minute > 59) { warnings.push('Invalid time in: ' + text); return; }
      time = String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0') + ' (document time)';
      startTime = time.slice(0, 5); endTime = '';
      if (finish) {
        let endHour = Number(finish[1]);
        const endMinute = Number(finish[2]), meridiem = finish[3] || statedTime[3];
        if (meridiem && (endHour < 1 || endHour > 12)) { warnings.push('Invalid finish time in: ' + text); return; }
        if (meridiem) endHour = endHour % 12 + (meridiem.toLowerCase() === 'pm' ? 12 : 0);
        if (endHour > 23 || endMinute > 59) { warnings.push('Invalid finish time in: ' + text); return; }
        endTime = String(endHour).padStart(2, '0') + ':' + String(endMinute).padStart(2, '0');
        if (endTime <= startTime) { warnings.push('Finish time must follow start time in: ' + text); return; }
        time = startTime + '–' + endTime + ' (document time)';
      }
    }
    const name = (weekly && !explicit ? 'Week of ' + monday + ': ' : '') + text;
    const key = date + ':' + name;
    if (seen.has(key)) return;
    seen.add(key);
    events.push({ date, name, startTime, endTime, weeklyReference: weekly && !explicit,
      source: 'Google Doc: ' + (document.title || 'Meets, Assemblies'),
      details: 'Term ' + range.term + ', Week ' + week + (time ? ' | ' + time + ' NZ time' : '') +
        (weekly && !explicit ? ' | Whole-week information; Monday is a reference, not a confirmed event date.' : '') });
  }
  function walk(elements) {
    let current;
    for (const element of elements || []) {
      const heading = /^Term\s+([1-4])\s*,?\s*(20\d{2})$/i.exec(paragraphText(element));
      if (heading) { current = { term: Number(heading[1]), year: Number(heading[2]) }; documentYear = current.year; }
      if (!element.table) continue;
      const rows = element.table.tableRows || [];
      if (!/week/i.test(cellText(rows[0]?.tableCells?.[0] || {}))) continue;
      if (!current) throw new Error('A weekly table has no Term/year heading. Check the source document.');
      if (current.year !== mapping.year) continue;
      recognised++;
      const range = mapping.ranges.find(item => item.term === current.term);
      let week;
      for (const row of rows.slice(1)) {
        const cells = (row.tableCells || []).map(cellText);
        if (/^\d{1,2}$/.test(cells[0]) && cells.length >= 3) {
          week = Number(cells[0]);
          for (const line of cells[1].split('\n')) add(line, 'school', range, week);
          for (const text of cells.slice(2)) addMeeting(text);
        } else if (week && cells.length > 0 && cells.slice(0, -1).every(text => !text)) {
          addMeeting(cells.at(-1));
        } else if (cells.some(text => text.replace(/[*\s]/g, ''))) {
          warnings.push('Unrecognised row in Term ' + current.term + ': ' + cells.join(' | '));
        }
      }
      function addMeeting(line) {
        if (!line.trim()) return;
        if (/assembl/i.test(line)) add(line, 'assembly', range, week);
        else if (/hui|meet/i.test(line)) add(line, 'hui', range, week);
        else warnings.push('Meeting/assembly text has no recognised type: ' + line);
      }
    }
  }
  function tabs(items) {
    for (const tab of items || []) { walk(tab.documentTab?.body?.content); tabs(tab.childTabs); }
  }
  if (document.tabs?.length) tabs(document.tabs);
  else walk(document.body?.content);
  if (!recognised) throw new Error('No supported Term/week tables found for ' + mapping.year +
    (documentYear ? ' (document year: ' + documentYear + ')' : '') + '. No document events were synced.');
  events.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
  return { events, warnings: [...new Set(warnings)], sourceUrl: DOCUMENT_URL, title: document.title, fetchedAt: new Date().toISOString() };
}
module.exports = { DOCUMENT_ID, DOCUMENT_URL, DOCS_SCOPE, documentRanges, parseDocumentEvents };
