const crypto = require('crypto');
const express = require('express');
const { standardDetails } = require('./standardDetails');
const { standards, reflectionGroups, learningTypes } = require('./public/planner-reference');
const { validSettings } = require('./schoolSettings');
const { validTimetableUrl, loadTimetable } = require('./kamarCalendar');
const { createGoogleCalendarRouter } = require('./googleCalendar');
const { pickerConfiguration } = require('./googleDrive');
const { searchNzqaStandards, validateSearch } = require('./nzqaStandards');
const { fields: moderationFields, validModeration, UUID } = require('./moderation');
const { DOCX, renderDocument, importDocument } = require('./moderationDocuments');
const { documents: moderationDocuments } = require('./public/moderation-schema');
const holidayRegions = require('./public/holiday-regions');
const { findNzqaReferences } = require('./nzqaReferences');

const FIELDS = {
  preferences: ['anniversaryRegion'],
  period: ['title', 'priorities', 'activities', 'resources', 'reflection', 'activityLinks'],
  activity: ['title', 'priorities', 'instructions', 'lessonPlans', 'resources', 'reflection'],
  week: ['focus', 'reflection', 'whakatauki', 'vocabulary', 'value', 'notes', 'calls', 'notices', 'todos'],
  year: ['importantDates', 'priorities', 'startOfYear', 'pepeha'],
  term: ['startDate', 'endDate', 'information', 'priorities', 'reflection'],
  goals: ['professional', 'wellbeing', 'standards', 'reflection',
    ...Array.from({ length: 3 }, (_, index) => 'priority' + (index + 1)),
    ...Array.from({ length: 8 }, (_, index) => ['annualDate' + (index + 1), 'annualEvent' + (index + 1)]).flat()],
  standards: [...standards.map((_, index) => 'focus' + (index + 1)),
    ...reflectionGroups.flatMap(group => group.questions.map(question => question[0]))],
  learning: ['entries', 'applications', 'other'],
  assessmentSetup: ['selectedStandards'],
  moderation: moderationFields
};
const SLOTS = ['email', 'whanau', 'p1', 'p2', 'interval', 'p3', 'p4', 'lunch', 'p5', 'meetings', 'away'];
const canManageSettings = user => user.roles.includes('ADMIN') || user.module_roles?.includes('lead-teacher');

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function validKey(year, section, key) {
  if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Object.hasOwn(FIELDS, section)) return false;
  if (section === 'moderation') return key === 'main' || UUID.test(key);
  if (section === 'activity') return UUID.test(key);
  if (section === 'period') {
    const match = /^(\d{4}-\d{2}-\d{2})_(p[1-5])$/.exec(key);
    return Boolean(match && validDate(match[1]) && Number(match[1].slice(0, 4)) === year &&
      [1, 2, 3, 4, 5].includes(new Date(match[1] + 'T00:00:00Z').getUTCDay()));
  }
  if (section === 'week') {
    if (!validDate(key) || new Date(key + 'T00:00:00Z').getUTCDay() !== 1) return false;
    const end = new Date(key + 'T00:00:00Z');
    end.setUTCDate(end.getUTCDate() + 6);
    return Number(key.slice(0, 4)) === year || end.getUTCFullYear() === year;
  }
  return section === 'term' ? /^[1-4]$/.test(key) : key === 'main';
}
function validContent(section, content) {
  if (!content || typeof content !== 'object' || Array.isArray(content)) return false;
  const allowed = FIELDS[section];
  if (!allowed) return false;
  if (section === 'preferences' && content.anniversaryRegion !== undefined && !holidayRegions.includes(content.anniversaryRegion)) return false;
  if (['period', 'activity'].includes(section) && content.title !== undefined &&
      (typeof content.title !== 'string' || content.title.length > 200)) return false;
  if (!Object.keys(content).every((key) => allowed.includes(key) || (section === 'week' && ['cells', 'term', 'weekNumber'].includes(key))
    || (section === 'learning' && key === 'types'))) return false;
  for (const field of allowed) {
    if (content[field] !== undefined && (typeof content[field] !== 'string' || content[field].length > 20000)) return false;
  }
  if (section === 'period' && content.activityLinks !== undefined) {
    let links;
    try { links = JSON.parse(content.activityLinks); } catch { return false; }
    if (!Array.isArray(links) || links.length > 100 ||
        !links.every(link => link && typeof link === 'object' && !Array.isArray(link) &&
          Object.keys(link).every(key => ['id', 'title'].includes(key)) &&
          typeof link.id === 'string' && UUID.test(link.id) &&
          typeof link.title === 'string' && link.title.trim() && link.title.length <= 200) ||
        new Set(links.map(link => link.id)).size !== links.length) return false;
  }
  if (section === 'moderation' && !validModeration(content)) return false;
  if (section === 'learning' && content.types !== undefined) {
    if (!Array.isArray(content.types) || content.types.length > learningTypes.length
      || new Set(content.types).size !== content.types.length
      || !content.types.every(type => learningTypes.some(([id]) => id === type))) return false;
  }
  if (section === 'assessmentSetup' && content.selectedStandards !== undefined) {
    if (content.selectedStandards.length > 20000) return false;
    let selected;
    try { selected = JSON.parse(content.selectedStandards); } catch { return false; }
    if (!Array.isArray(selected) || selected.length > 100 ||
        !selected.every(item => item && typeof item === 'object' && !Array.isArray(item) &&
          Object.keys(item).every(key => ['number', 'subject', 'title', 'credits', 'assessment', 'url', 'level', 'version'].includes(key)) &&
          (item.level === undefined || typeof item.level === 'string' && /^(?:[1-9]|10)?$/.test(item.level)) &&
          (item.version === undefined || typeof item.version === 'string' && /^\d{0,3}$/.test(item.version)) &&
          typeof item.number === 'string' && /^\d{4,8}$/.test(item.number) &&
          typeof item.subject === 'string' && item.subject.length <= 120 &&
          typeof item.title === 'string' && item.title.length <= 300 && typeof item.credits === 'string' &&
          item.credits.length <= 40 && typeof item.assessment === 'string' && item.assessment.length <= 40 &&
          typeof item.url === 'string' && item.url.length <= 1000 && (() => {
            try {
              const url = new URL(item.url);
              return url.protocol === 'https:' && url.hostname === 'www.nzqa.govt.nz' &&
                (url.pathname.startsWith('/nqfdocs/') || url.pathname === '/ncea/assessment/search.do');
            } catch { return false; }
          })()) || new Set(selected.map(item => item?.number)).size !== selected.length) return false;
  }
  if (section === 'term') {
    for (const field of ['startDate', 'endDate']) {
      if (content[field] && !validDate(content[field])) return false;
    }
    if (content.startDate && content.endDate && content.startDate > content.endDate) return false;
  }
  if (section === 'week') {
    if (content.term !== undefined && !['', '1', '2', '3', '4'].includes(content.term)) return false;
    if (content.weekNumber !== undefined && (typeof content.weekNumber !== 'string' || !/^-?\d{0,2}$/.test(content.weekNumber))) return false;
    if (content.cells !== undefined) {
      if (!content.cells || typeof content.cells !== 'object' || Array.isArray(content.cells)) return false;
      for (const [key, value] of Object.entries(content.cells)) {
        if (!SLOTS.some((slot) => new RegExp(`^${slot}:[0-4]$`).test(key)) || typeof value !== 'string' || value.length > 4000) return false;
      }
    }
  }
  return Buffer.byteLength(JSON.stringify(content)) <= 300000;
}
function createPlannerRouter({ query, searchStandards = searchNzqaStandards, loadStaff, loadSchoolCalendar, loadClasses, findReferences = findNzqaReferences, env = process.env }) {
  const router = express.Router();
  router.use('/moderation/import/:type', express.raw({ type: DOCX, limit: '8mb' }));
  router.use(express.json({ limit: '320kb' }));
  router.use((req, res, next) => {
    if (!req.session) return next(new Error('Planner requires the host session middleware.'));
    if (!req.session.plannerCsrf) req.session.plannerCsrf = crypto.randomBytes(32).toString('hex');
    if (req.method !== 'GET') {
      const supplied = Buffer.from(req.get('x-planner-csrf') || '');
      const expected = Buffer.from(req.session.plannerCsrf);
      if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
        console.warn('Planner form token rejected.');
        return res.status(403).json({ error: 'Your form session changed. Reload after copying any unsaved work.' });
      }
    }
    next();
  });
  router.get('/session', (req, res) => res.json({ csrf: req.session.plannerCsrf, userId: req.user.id,
    canManageSchoolSettings: Boolean(canManageSettings(req.user)) }));
  router.use('/duty-roster', require('./dutyRoster').createDutyRosterRouter({ query, loadStaff }));
  router.use('/attendance', require('./attendance').createAttendanceRouter({ query, loadClasses }));
  router.get('/google-drive/config', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    try { res.json(pickerConfiguration(env)); }
    catch (error) { next(error); }
  });
  router.get('/staff', async (req, res) => {
    try {
      if (!loadStaff) throw new Error('The host has not configured its Kamar staff connection.');
      const directory = await loadStaff(req);
      if (!Array.isArray(directory.staff) || !directory.staff.every(person =>
        person && typeof person.id === 'string' && /^\d+$/.test(person.id) &&
        [person.first_name, person.last_name, person.code].every(value => value === null || typeof value === 'string'))) {
        throw new Error('The Kamar staff list returned an invalid response.');
      }
      const usage = await query(`SELECT content->>'teacher' AS teacher,COUNT(*)::integer AS uses
        FROM planner_sections WHERE owner_id=$1 AND section='moderation' AND entry_key<>'main'
        AND NULLIF(TRIM(content->>'teacher'),'') IS NOT NULL
        GROUP BY content->>'teacher'`, [req.user.id]);
      const counts = new Map(usage.rows.map(row => [row.teacher, Number(row.uses)]));
      const staff = directory.staff.map(person => {
        const fullName = [person.first_name?.trim(), person.last_name?.trim()].filter(Boolean).join(' ');
        const name = fullName + (person.code?.trim() ? ' (' + person.code.trim() + ')' : '');
        return { id: person.id, name, uses: (counts.get(name) || 0) + (name === fullName ? 0 : counts.get(fullName) || 0) };
      });
      if (!Array.isArray(directory.departments) || !directory.departments.every(item =>
        item && typeof item.name === 'string' && item.name.length <= 500 &&
        typeof item.teacher === 'string' && item.teacher.length <= 500 && Array.isArray(item.leaders))) {
        throw new Error('The Kamar department list returned an invalid response.');
      }
      res.json({ staff, departments: directory.departments });
    } catch (error) {
      console.error('Planner Kamar staff list failed:', error.message);
      res.status(502).json({ error: 'The Kamar Uploader staff / department lists could not be loaded. Your saved Teacher in Charge is unchanged. Retry shortly or contact your administrator.' });
    }
  });
  router.post('/moderation/import/:type', (req, res) => {
    if (!Object.hasOwn(moderationDocuments, req.params.type) || !Buffer.isBuffer(req.body)) {
      console.warn('Moderation import type rejected.');
      return res.status(400).json({ error: 'Choose a supported Word moderation document.' });
    }
    try {
      const result = importDocument(req.body, req.params.type);
      if (!validContent('moderation', { ...result.common, [req.params.type]: JSON.stringify(result.document) })) {
        throw new Error('Some fields do not match the form limits. Check the document layout, dates and field lengths.');
      }
      res.json(result);
    } catch (error) {
      console.warn('Moderation document import rejected.');
      res.status(400).json({ error: 'The document could not be imported. ' + error.message });
    }
  });
  router.get('/moderation/:year', async (req, res, next) => {
    const year = Number(req.params.year);
    if (!validKey(year, 'moderation', 'main') || !/^\d{4}$/.test(req.params.year)) {
      console.warn('Moderation list year rejected.');
      return res.status(400).json({ error: 'Choose a valid planner year.' });
    }
    try {
      const result = await query(`SELECT entry_key,content->>'title' AS title,
        content->>'standardNumber' AS standard_number,content->>'standardTitle' AS standard_title,
        content->>'studentName' AS student_name,content->>'parentRecord' AS parent_record,updated_at
        FROM planner_sections WHERE owner_id=$1 AND year=$2 AND section='moderation' AND entry_key<>'main'
        ORDER BY updated_at DESC`, [req.user.id, year]);
      res.json({ records: result.rows });
    } catch (error) { next(error); }
  });
  router.delete('/moderation/:year/:record', async (req, res, next) => {
    const { record } = req.params, year = Number(req.params.year);
    if (!/^\d{4}$/.test(req.params.year) || !UUID.test(record) || !validKey(year, 'moderation', record) ||
        !Number.isInteger(req.body?.revision) || req.body.revision < 1) {
      console.warn('Moderation deletion rejected.');
      return res.status(400).json({ error: 'Choose a saved moderation record and its current revision.' });
    }
    try {
      const result = await query(`DELETE FROM planner_sections
        WHERE owner_id=$1 AND year=$2 AND section='moderation' AND entry_key=$3 AND revision=$4
        AND NOT EXISTS (SELECT 1 FROM planner_sections AS child
          WHERE child.owner_id=$1 AND child.year=$2 AND child.section='moderation'
          AND child.content->>'parentRecord'=$3)
        RETURNING entry_key`, [req.user.id, year, record, req.body.revision]);
      if (!result.rows.length) return res.status(409).json({
        error: 'The record changed, is unavailable, or still has student records. Reload and remove its student records before deleting the assessment.'
      });
      return res.json({ deleted: result.rows[0].entry_key });
    } catch (error) { next(error); }
  });
  router.get('/moderation/:year/:record/:type/document', async (req, res, next) => {
    const { record, type } = req.params, year = Number(req.params.year);
    if (!UUID.test(record) || !validKey(year, 'moderation', record) || !Object.hasOwn(moderationDocuments, type)) {
      console.warn('Moderation document address rejected.');
      return res.status(400).json({ error: 'Choose a saved moderation record and document type.' });
    }
    try {
      const result = await query(`SELECT content FROM planner_sections
        WHERE owner_id=$1 AND year=$2 AND section='moderation' AND entry_key=$3`, [req.user.id, year, record]);
      if (!result.rows.length) return res.status(404).json({ error: 'Save this moderation record before creating a document.' });
      const content = { ...result.rows[0].content };
      if (type === 'schedule' && req.query.standardPdfUrl !== undefined) {
        if (typeof req.query.standardPdfUrl !== 'string' || req.query.standardPdfUrl.length > 500) {
          console.warn('Moderation standard PDF link rejected.');
          return res.status(400).json({ error: 'Choose the official NZQA standard PDF link.' });
        }
        content.standardPdfUrl = req.query.standardPdfUrl;
      }
      res.type(DOCX).attachment(type + '.docx').send(renderDocument(type, content, year));
    } catch (error) { next(error); }
  });
  router.get('/standards/search', async (req, res) => {
    let filters;
    try { filters = validateSearch({ query: req.query.q, view: req.query.view, level: req.query.level }); }
    catch (error) { return res.status(400).json({ error: error.message }); }
    try {
      res.set('Cache-Control', 'no-store');
      res.json(await searchStandards(filters));
    } catch (error) {
      console.error('NZQA standards search failed:', error.message);
      return res.status(502).json({ error: 'NZQA standards search is unavailable. Check your connection and retry, or open NZQA search directly.' });
    }
  });
  router.get('/standards/:number/references', async (req, res) => {
    const year = Number(req.query.year);
    if (!/^\d{4,8}$/.test(req.params.number) || !/^\d{4}$/.test(req.query.year || '') || year < 2000 || year > 2100) {
      console.warn('NZQA references request rejected.');
      return res.status(400).json({ error: 'Choose a valid standard number and assessment year.' });
    }
    try { res.json(await findReferences(req.params.number, year)); }
    catch (error) {
      console.error('NZQA reference lookup failed:', error.message);
      res.status(502).json({ error: 'NZQA references could not be verified. Your saved links are unchanged. Retry or enter a reference manually.' });
    }
  });
  router.get('/standards/:number/details', async (req, res) => {
    if (!/^\d{4,8}$/.test(req.params.number)) {
      console.warn('NZQA standard details number rejected.');
      return res.status(400).json({ error: 'Choose a valid NZQA standard number.' });
    }
    try { res.json(await standardDetails(req.params.number)); }
    catch (error) {
      console.error('NZQA standard PDF details failed:', error.message);
      res.status(502).json({ error: 'The NZQA standard PDF details could not be loaded. Your saved version is unchanged. Retry shortly.' });
    }
  });
  router.use('/google-calendar', createGoogleCalendarRouter({ query, loadSchoolCalendar, env }));
  router.use('/kamar-timetable', (req, res, next) => {
    if (typeof req.user.id !== 'string' || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(req.user.id)) {
      return next(new Error('Verified planner identity has no valid user ID.'));
    }
    next();
  });
  router.all('/kamar-timetable', async (req, res, next) => {
    try {
      if (req.method === 'GET') {
        const result = await query('SELECT subscription_url,revision,updated_at FROM teacher_calendar_settings WHERE owner_id=$1', [req.user.id]);
        return res.json(result.rows[0] || { subscription_url: '', revision: 0, updated_at: null });
      }
      if (req.method !== 'PUT') return res.status(405).set('Allow', 'GET, PUT').json({ error: 'Use GET or PUT for your timetable subscription.' });
      if (!Number.isInteger(req.body?.revision) || req.body.revision < 0 || !validTimetableUrl(req.body.subscription_url)) {
        console.warn('Teacher calendar settings rejected.');
        return res.status(400).json({ error: 'Paste your personal HTTPS Calendar Subscription link from Westland High School KAMAR, or clear the link to disconnect.' });
      }
      const values = [req.user.id, req.body.subscription_url];
      const result = req.body.revision === 0
        ? await query(`INSERT INTO teacher_calendar_settings(owner_id,subscription_url) VALUES ($1,$2)
          ON CONFLICT DO NOTHING RETURNING revision,updated_at`, values)
        : await query(`UPDATE teacher_calendar_settings SET subscription_url=$2,revision=revision+1,updated_at=NOW()
          WHERE owner_id=$1 AND revision=$3 RETURNING revision,updated_at`, [...values, req.body.revision]);
      if (!result.rows.length) return res.status(409).json({ error: 'Your timetable link changed in another tab. Copy your draft, then reopen Setup My Planner before saving.' });
      return res.json(result.rows[0]);
    } catch (error) { next(error); }
  });
  router.get('/kamar-timetable/:year/:month', async (req, res, next) => {
    const year = Number(req.params.year), month = Number(req.params.month);
    if (!/^\d{4}$/.test(req.params.year) || year < 2000 || year > 2100 ||
        !/^\d{1,2}$/.test(req.params.month) || month < 1 || month > 12) {
      console.warn('Teacher calendar month rejected.');
      return res.status(400).json({ error: 'Choose a valid timetable year and month.' });
    }
    let result;
    try { result = await query('SELECT subscription_url FROM teacher_calendar_settings WHERE owner_id=$1', [req.user.id]); }
    catch (error) { return next(error); }
    const url = result.rows[0]?.subscription_url;
    if (!url) return res.status(409).json({ error: 'Save your personal KAMAR timetable subscription link first.' });
    try { return res.json(await loadTimetable(url, year, month)); }
    catch {
      // Feed errors can contain the bearer URL; never log the original error.
      console.error('Private KAMAR timetable could not be loaded.');
      return res.status(502).json({ error: 'Your KAMAR timetable could not be loaded. Check your subscription link, then retry.' });
    }
  });
  router.all('/school-settings/:year', async (req, res, next) => {
    const year = Number(req.params.year);
    if (!/^\d{4}$/.test(req.params.year) || year < 2000 || year > 2100) {
      console.warn('School settings year rejected.');
      return res.status(400).json({ error: 'Choose a valid school settings year.' });
    }
    const canEdit = Boolean(canManageSettings(req.user));
    try {
      if (req.method === 'GET') {
        const result = await query('SELECT content,revision,updated_at FROM school_planner_settings WHERE year=$1', [year]);
        return res.json({ ...(result.rows[0] || { content: {}, revision: 0, updated_at: null }), canEdit });
      }
      if (req.method !== 'PUT') return res.status(405).set('Allow', 'GET, PUT').json({ error: 'Use GET or PUT for school settings.' });
      if (!canEdit) {
        console.warn('School-wide planner settings edit denied.');
        return res.status(403).json({ error: 'Only a Teacher Planner Lead Teacher or global administrator can change shared planner dates.' });
      }
      if (!Number.isInteger(req.body.revision) || req.body.revision < 0 || !validSettings(year, req.body.content)) {
        console.warn('School-wide planner settings rejected.');
        return res.status(400).json({ error: 'Check dates belong to the selected year, term dates are ordered, and every event has a date, type and title. Maximum 80 events. Changes were not saved.' });
      }
      const values = [year, JSON.stringify(req.body.content), req.user.id];
      const result = req.body.revision === 0
        ? await query(`INSERT INTO school_planner_settings(year,content,updated_by) VALUES ($1,$2,$3)
          ON CONFLICT DO NOTHING RETURNING revision,updated_at`, values)
        : await query(`UPDATE school_planner_settings SET content=$2,updated_by=$3,revision=revision+1,updated_at=NOW()
          WHERE year=$1 AND revision=$4 RETURNING revision,updated_at`, [...values, req.body.revision]);
      if (!result.rows.length) return res.status(409).json({ error: 'School setup changed in another tab. Copy your changes, then reload before saving again.' });
      res.json(result.rows[0]);
    } catch (error) { next(error); }
  });
  router.get('/activities/:year', async (req, res, next) => {
    const year = Number(req.params.year);
    if (!/^\d{4}$/.test(req.params.year) || year < 2000 || year > 2100) {
      console.warn('Activity list year rejected.');
      return res.status(400).json({ error: 'Choose a valid planner year for activities.' });
    }
    try {
      const result = await query(`SELECT entry_key,content->>'title' AS title FROM planner_sections
        WHERE owner_id=$1 AND year=$2 AND section='activity' ORDER BY updated_at DESC`, [req.user.id, year]);
      return res.json({ activities: result.rows });
    } catch (error) { next(error); }
  });
  router.get('/period-plan-choices/:year', async (req, res, next) => {
    const year = Number(req.params.year);
    if (!/^\d{4}$/.test(req.params.year) || year < 2000 || year > 2100) {
      console.warn('Period plan chooser year rejected.');
      return res.status(400).json({ error: 'Choose a valid planner year for period plans.' });
    }
    try {
      const result = await query(`SELECT entry_key,content->>'title' AS title FROM planner_sections
        WHERE owner_id=$1 AND year=$2 AND section='period' ORDER BY entry_key DESC`, [req.user.id, year]);
      return res.json({ plans: result.rows });
    } catch (error) { next(error); }
  });
  router.get('/period-plans/:week', async (req, res, next) => {
    const week = req.params.week;
    if (!validKey(Math.max(2000, Number(week.slice(0, 4))), 'week', week)) {
      console.warn('Period plan summary week rejected.');
      return res.status(400).json({ error: 'Choose a valid Monday for period plans.' });
    }
    const end = new Date(week + 'T00:00:00Z'); end.setUTCDate(end.getUTCDate() + 5);
    try {
      const result = await query(`SELECT entry_key,content->>'title' AS title,
        content->>'activityLinks' AS "activityLinks" FROM planner_sections
        WHERE owner_id=$1 AND section='period' AND entry_key >= $2 AND entry_key < $3
        ORDER BY entry_key`, [req.user.id, week, end.toISOString().slice(0, 10)]);
      return res.json({ plans: result.rows });
    } catch (error) { next(error); }
  });
  router.all('/:year/:section/:key', async (req, res, next) => {
    const { section, key } = req.params;
    const year = /^\d{4}$/.test(req.params.year) ? Number(req.params.year) : NaN;
    if (!validKey(year, section, key)) {
      console.warn('Planner section address rejected.');
      return res.status(400).json({ error: 'Choose a valid year, section and date.' });
    }
    const owner = req.user.id;
    if (typeof owner !== 'string' || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(owner)) return next(new Error('Verified planner identity has no valid user ID.'));
    try {
      if (req.method === 'GET') {
        const result = await query('SELECT content,revision,updated_at FROM planner_sections WHERE owner_id=$1 AND year=$2 AND section=$3 AND entry_key=$4',
          [owner, year, section, key]);
        return res.json(result.rows[0] || { content: {}, revision: 0, updated_at: null });
      }
      if (req.method !== 'PUT') return res.status(405).set('Allow', 'GET, PUT').json({ error: 'Use GET or PUT for planner entries.' });
      if (!Number.isInteger(req.body.revision) || req.body.revision < 0 || !validContent(section, req.body.content)) {
        console.warn('Planner content rejected.');
        return res.status(400).json({ error: 'Planner data is invalid or too long. Your changes have not been saved.' });
      }
      const values = [owner, year, section, key, JSON.stringify(req.body.content)];
      const result = req.body.revision === 0
        ? await query(`INSERT INTO planner_sections(owner_id,year,section,entry_key,content)
          VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING revision,updated_at`, values)
        : await query(`UPDATE planner_sections SET content=$5,revision=revision+1,updated_at=NOW()
          WHERE owner_id=$1 AND year=$2 AND section=$3 AND entry_key=$4 AND revision=$6 RETURNING revision,updated_at`,
        [...values, req.body.revision]);
      if (!result.rows.length) return res.status(409).json({ error: 'This entry changed in another tab. Copy your changes, then reload before saving again.' });
      return res.json(result.rows[0]);
    } catch (error) { next(error); }
  });
  return router;
}

module.exports = { createPlannerRouter, validKey, validContent };
