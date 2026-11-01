const express = require('express');

const DEFAULT_DOCUMENT_ID = '1ju9srfpyV7b61vR8hq2ZPF9ye-PWovRQPhZIZ-NN0_8';
const canManage = user => user.roles?.includes('ADMIN') || user.module_roles?.includes('lead-teacher');
const validYearTerm = (year, term) => /^\d{4}$/.test(String(year)) && Number(year) >= 2000 &&
  Number(year) <= 2100 && /^[1-4]$/.test(String(term));
const normalCode = value => value.trim().toUpperCase();

function validDutySettings(content) {
  return content && typeof content === 'object' && !Array.isArray(content) &&
    Object.keys(content).every(key => ['documentId', 'mappings', 'enabled'].includes(key)) &&
    typeof content.enabled === 'boolean' &&
    typeof content.documentId === 'string' && /^[A-Za-z0-9_-]{20,150}$/.test(content.documentId) &&
    Array.isArray(content.mappings) && content.mappings.length <= 250 &&
    content.mappings.every(item => item && Object.keys(item).every(key => ['code', 'email'].includes(key)) &&
      typeof item.code === 'string' && /^[A-Z][A-Z0-9 .'-]{0,59}$/.test(item.code) &&
      typeof item.email === 'string' && item.email.length <= 254 &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item.email) && item.email === item.email.toLowerCase()) &&
    new Set(content.mappings.map(item => item.code)).size === content.mappings.length;
}

function staffDutyMappings(staff) {
  if (!Array.isArray(staff) || !staff.length) throw new Error('The Staff List is empty or unavailable. Check the current staff upload.');
  if (!staff.some(person => person && Object.hasOwn(person, 'email_school'))) {
    throw new Error('The Staff List connection does not include school emails yet. Deploy the updated Global Control staff bridge, then retry.');
  }
  const aliases = new Map(), warnings = [];
  for (const person of staff) {
    if (!person || !['code', 'first_name', 'last_name', 'email_school'].every(key => person[key] == null || typeof person[key] === 'string')) {
      throw new Error('The Staff List returned an invalid staff record. No mappings were generated.');
    }
    const email = person.email_school?.trim().toLowerCase();
    const name = [person.first_name, person.last_name].filter(Boolean).join(' ').trim() || person.code || 'Unnamed staff member';
    const validEmail = email && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!validEmail) warnings.push(name + ': missing or invalid school email; review this staff record.');
    for (const alias of new Set([person.code, person.first_name].filter(value => value?.trim()).map(normalCode))) {
      if (!/^[A-Z][A-Z0-9 .'-]{0,59}$/.test(alias)) {
        warnings.push(name + ': code/name cannot be used as a duty identifier. Map the roster identifier manually.'); continue;
      }
      if (!aliases.has(alias)) aliases.set(alias, []);
      aliases.get(alias).push({ email, validEmail, id: person.id });
    }
  }
  const mappings = [];
  for (const [code, candidates] of aliases) {
    const emails = new Set(candidates.map(person => person.email));
    if (candidates.some(person => !person.validEmail) || emails.size !== 1) {
      warnings.push(code + ': ambiguous staff identifier or missing email; no automatic mapping was added.');
    } else mappings.push({ code, email: candidates[0].email });
  }
  if (mappings.length > 250) throw new Error('Staff List suggestions exceed the 250-mapping limit. Map only the identifiers used by the duty roster.');
  mappings.sort((a, b) => a.code.localeCompare(b.code));
  return { mappings, warnings };
}

function createDutyRosterRouter({ query, loadStaff }) {
  const router = express.Router();
  router.get('/staff-mappings', async (req, res) => {
    if (!canManage(req.user)) return res.status(403).json({ error: 'Only a Planner Lead Teacher or administrator can build staff email mappings.' });
    try {
      if (!loadStaff) throw new Error('The host has not configured its Staff List connection.');
      const directory = await loadStaff(req, { includeEmails: true });
      return res.json(staffDutyMappings(directory.staff));
    } catch (error) {
      console.error('Duty staff mapping build failed:', error.message);
      return res.status(502).json({ error: error.message + ' Existing duty mappings have not been changed.' });
    }
  });
  router.get('/active/:year', async (req, res, next) => {
    if (!validYearTerm(req.params.year, 1)) return res.status(400).json({ error: 'Choose a valid duty roster year.' });
    try {
      const result = await query("SELECT term FROM school_duty_rosters WHERE year=$1 AND content->>'enabled'='true' ORDER BY term", [req.params.year]);
      return res.json({ terms: result.rows.map(row => row.term) });
    } catch (error) { next(error); }
  });
  router.all('/:year/:term', async (req, res, next) => {
    const { year, term } = req.params;
    if (!validYearTerm(year, term)) {
      console.warn('Duty roster year/term rejected.');
      return res.status(400).json({ error: 'Choose a valid duty roster year and term.' });
    }
    if (!canManage(req.user)) return res.status(403).json({ error: 'Only a Planner Lead Teacher or administrator can configure the shared duty roster.' });
    try {
      if (req.method === 'GET') {
        const result = await query('SELECT content,revision,updated_at FROM school_duty_rosters WHERE year=$1 AND term=$2', [year, term]);
        return res.json(result.rows[0] || { content: { enabled: false, documentId: DEFAULT_DOCUMENT_ID, mappings: [] }, revision: 0 });
      }
      if (req.method !== 'PUT') return res.status(405).set('Allow', 'GET, PUT').json({ error: 'Use GET or PUT for duty roster setup.' });
      if (!Number.isInteger(req.body.revision) || req.body.revision < 0 || !validDutySettings(req.body.content)) {
        console.warn('Duty roster configuration rejected.');
        return res.status(400).json({ error: 'Check the Google Doc ID and unique duty codes mapped to valid staff account email addresses.' });
      }
      const values = [year, term, JSON.stringify(req.body.content), req.user.id];
      const result = req.body.revision === 0 ?
        await query(`INSERT INTO school_duty_rosters(year,term,content,updated_by) VALUES ($1,$2,$3,$4)
          ON CONFLICT DO NOTHING RETURNING revision,updated_at`, values) :
        await query(`UPDATE school_duty_rosters SET content=$3,updated_by=$4,revision=revision+1,updated_at=NOW()
          WHERE year=$1 AND term=$2 AND revision=$5 RETURNING revision,updated_at`, [...values, req.body.revision]);
      if (!result.rows.length) return res.status(409).json({ error: 'Duty setup changed in another tab. Copy your mappings, then reload before saving.' });
      return res.json(result.rows[0]);
    } catch (error) { next(error); }
  });
  return router;
}

const textOf = elements => (elements || []).map(element => element.paragraph ?
  (element.paragraph.elements || []).map(run => run.textRun?.content || '').join('') :
  element.table ? element.table.tableRows.map(row => row.tableCells.map(cell => textOf(cell.content)).join('\t')).join('\n') : '').join('\n').trim();

function parseDutyDocument(document, year, term) {
  const sections = [];
  function collect(elements) {
    for (const element of elements || []) {
      if (element.paragraph) sections.push({ text: textOf([element]) });
      if (element.table) for (const row of element.table.tableRows || []) {
        sections.push({ cells: (row.tableCells || []).map(cell => textOf(cell.content)) });
      }
    }
  }
  if (document.tabs?.length) {
    function tabs(items) {
      for (const tab of items) {
        collect(tab.documentTab?.body?.content);
        tabs(tab.childTabs || []);
      }
    }
    tabs(document.tabs);
  } else collect(document.body?.content);
  const heading = sections.map(section => section.cells ? section.cells.join(' ') : section.text).join('\n');
  if (!new RegExp('DUTY\\s+ROSTER\\s+' + year + '\\s*\\(?\\s*Term\\s+' + term + '\\b', 'i').test(heading)) {
    throw new Error('The duty document heading does not match ' + year + ' Term ' + term + '. No duties were displayed.');
  }
  if ((heading.match(/DUTY\s+ROSTER\s+20\d{2}/gi) || []).length !== 1) {
    throw new Error('Use a source document containing one term duty roster, so older rosters cannot be mixed into current duties.');
  }
  const duties = [], codes = new Set(), zones = new Set();
  const zoneTimes = {};
  let zone;
  function times(text, afternoon, slot) {
    const match = /(\d{1,2})[:.](\d{2})\s*(?:am|pm)?\s*[-–]\s*(\d{1,2})[:.](\d{2})/i.exec(text);
    if (!match) throw new Error('A duty zone has no readable start and finish time. Check the source document.');
    const clocks = [[match[1], match[2]], [match[3], match[4]]].map(([hour, minute]) => {
      hour = Number(hour); minute = Number(minute);
      if (hour < 12 && afternoon) hour += 12;
      if (hour > 23 || minute > 59) throw new Error('A duty zone contains an invalid time.');
      return String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0');
    });
    if (clocks[1] <= clocks[0]) throw new Error('A duty zone finish time must follow its start time.');
    return [...clocks, slot];
  }
  for (const section of sections) {
    const cells = section.cells;
    const text = cells ? cells.join(' ') : section.text;
    const zoneHeading = cells?.[0] || text;
    if (/ZONE\s*1.*Before\s+School/i.test(text)) { zone = 'before'; zoneTimes[zone] = times(zoneHeading, false, 'email'); }
    else if (/ZONE\s*2.*Morning\s+Tea/i.test(text)) {
      zone = 'morning'; zoneTimes[zone] = times(zoneHeading, false, 'interval');
      zoneTimes.wednesday = /\d[:.]\d{2}/.test(cells?.[3] || '') ? times(cells[3], false, 'interval') : ['11:15', '11:35', 'interval'];
    }
    else if (/ZONE\s*3.*Lunch/i.test(text)) { zone = 'lunch1'; zoneTimes[zone] = times(zoneHeading, true, 'lunch'); }
    else if (/ZONE\s*4.*Lunch/i.test(text)) { zone = 'lunch2'; zoneTimes[zone] = times(zoneHeading, true, 'lunch'); }
    else if (/ZONE\s*1.*After\s*school/i.test(text)) { zone = 'after'; zoneTimes[zone] = times(zoneHeading, true, 'meetings'); }
    else if (cells?.length === 6 && cells[0] && !/^Duty zone$|^Monday$/i.test(cells[0].trim())) {
      const role = /^(Duty Leader|Restorative Room)$/i.test(cells[0].trim());
      if (!zone && !role) throw new Error('A duty row appears before its zone heading. Check the source document layout.');
      const location = cells[0].replace(/\s+/g, ' ').trim();
      for (let day = 0; day < 5; day++) {
        const raw = cells[day + 1].trim();
        if (!raw || /^[-–—]$/.test(raw)) continue;
        if (/^(Monday|Tuesday|Wednesday|Thursday|Friday)$/i.test(raw)) throw new Error('The duty table weekday headings are not recognised.');
        const assignments = raw.split(/[\n,;/]+/).map(normalCode).filter(Boolean);
        for (const code of assignments) {
          if (!/^[A-Z][A-Z0-9 .'-]{0,59}$/.test(code)) throw new Error('Unrecognised staff code in the duty document: ' + code);
          codes.add(code);
          const [startTime, endTime, slot] = role ? ['', '', 'email'] : zoneTimes[zone === 'morning' && day === 2 ? 'wednesday' : zone];
          duties.push({ day, code, location, startTime, endTime, slot });
        }
      }
      if (!role) zones.add(zone);
    } else if (cells && cells.some(cell => cell.trim()) && !/ZONE\s*\d|Duty zone|Monday|Tuesday|Wednesday|Thursday|Friday/i.test(text)) {
      throw new Error('The duty table layout has changed. Check its six weekday columns before syncing.');
    }
  }
  if (zones.size !== 5 || !duties.length) throw new Error('Not all five duty zones could be read. Check the source document; no partial roster was used.');
  return { duties, codes: [...codes].sort() };
}

function dutyEvents(roster, codeMappings, email, settings, year, term, week) {
  const start = settings['term' + term + 'Start'], end = settings['term' + term + 'End'];
  if (!start || !end) throw new Error('Publish the Term ' + term + ' start and end dates in Planner Setup before displaying duties.');
  const codes = new Set(codeMappings.filter(item => item.email === email?.toLowerCase()).map(item => item.code));
  const events = [];
  for (const duty of roster.duties) {
    if (!codes.has(duty.code)) continue;
    const day = new Date(week + 'T00:00:00Z'); day.setUTCDate(day.getUTCDate() + duty.day);
    const date = day.toISOString().slice(0, 10);
    if (!date.startsWith(year + '-') || date < start || date > end ||
      settings.events?.some(event => event.date === date && ['closure', 'teacherOnly'].includes(event.kind))) continue;
    events.push({ ...duty, date });
  }
  return { events, mapped: codes.size > 0 };
}

module.exports = { DEFAULT_DOCUMENT_ID, validYearTerm, validDutySettings, staffDutyMappings, createDutyRosterRouter, parseDutyDocument, dutyEvents, canManage };
