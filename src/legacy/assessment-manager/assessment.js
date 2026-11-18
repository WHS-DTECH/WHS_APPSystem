const crypto = require('node:crypto');
const express = require('express');
const { fields, validModeration, validTopicName, UUID } = require('./moderation');
const { DOCX, renderDocument, importDocument } = require('./moderationDocuments');
const { documents } = require('./public/moderation-schema');
const { searchNzqaStandards, validateSearch } = require('./nzqaStandards');
const { checkBsas } = require('./nzqaConsent');
const { standardDetails } = require('./standardDetails');
const { findNzqaReferences } = require('./nzqaReferences');
const { pickerConfiguration } = require('./googleDrive');
const { createResourceLibraryRouter } = require('./resourceLibrary');
const { createSuppliersRouter } = require('./suppliers');
const { createAssessmentHomeRouter } = require('./assessmentHome');
const { createVerifiersRouter } = require('./verifiers');

const FIELD_SET = new Set(fields);
const DOCUMENT_TYPES = new Set(Object.keys(documents));
const OWNERSHIP_ERROR = 'The saved record changed or is no longer available. Reload before trying again.';

function validYear(value) {
  return Number.isInteger(value) && value >= 2000 && value <= 2100;
}

function validModerationContent(content) {
  return Boolean(content && typeof content === 'object' && !Array.isArray(content) &&
    Object.keys(content).every(key => FIELD_SET.has(key)) &&
    validModeration(content) && Buffer.byteLength(JSON.stringify(content)) <= 300000);
}

function validSelectedStandards(value) {
  if (typeof value !== 'string' || value.length > 20000) return false;
  let selected;
  try { selected = JSON.parse(value || '[]'); } catch { return false; }
  return Array.isArray(selected) && selected.length <= 100 &&
    selected.every(item => item && typeof item === 'object' && !Array.isArray(item) &&
      Object.keys(item).every(key => ['number', 'subject', 'title', 'credits', 'assessment', 'url', 'level', 'version', 'topic'].includes(key)) &&
      (item.level === undefined || typeof item.level === 'string' && /^(?:[1-9]|10)?$/.test(item.level)) &&
      (item.version === undefined || typeof item.version === 'string' && /^\d{0,3}$/.test(item.version)) &&
      (item.topic === undefined || item.topic === '' || validTopicName(item.topic)) &&
      typeof item.number === 'string' && /^\d{4,8}$/.test(item.number) &&
      typeof item.subject === 'string' && item.subject.length <= 120 &&
      typeof item.title === 'string' && item.title.length <= 300 &&
      typeof item.credits === 'string' && item.credits.length <= 40 &&
      typeof item.assessment === 'string' && item.assessment.length <= 40 &&
      typeof item.url === 'string' && item.url.length <= 1000 && (() => {
        try {
          const url = new URL(item.url);
          return url.protocol === 'https:' && url.hostname === 'www.nzqa.govt.nz' &&
            (url.pathname.startsWith('/nqfdocs/') || url.pathname === '/ncea/assessment/search.do');
        } catch { return false; }
      })()) && new Set(selected.map(item => item.number)).size === selected.length;
}

function validSettings(content) {
  return Boolean(content && typeof content === 'object' && !Array.isArray(content) &&
    Object.keys(content).every(key => key === 'selectedStandards') &&
    (content.selectedStandards === undefined || validSelectedStandards(content.selectedStandards)) &&
    Buffer.byteLength(JSON.stringify(content)) <= 30000);
}

function validDocumentAddress(year, record, allowMain = true) {
  return validYear(year) && (allowMain && record === 'main' || UUID.test(record));
}

function safeOwnerId(req) {
  return typeof req.user?.id === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(req.user.id)
    ? req.user.id : null;
}

function createAssessmentRouter({ query, loadStaff, loadTeachingSubjects, loadClassSize, loadModerationAccess, checkConsent = checkBsas, env = process.env } = {}) {
  const router = express.Router();
  router.use('/moderation/import/:type', express.raw({ type: DOCX, limit: '8mb' }));
  router.use(express.json({ limit: '320kb' }));
  router.use((req, res, next) => {
    if (!req.session) return res.status(503).json({ error: 'Assessment Manager requires a signed module session.' });
    if (!req.session.assessmentManagerCsrf) req.session.assessmentManagerCsrf = crypto.randomBytes(32).toString('hex');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const supplied = Buffer.from(req.get('x-assessment-csrf') || '');
      const expected = Buffer.from(req.session.assessmentManagerCsrf);
      if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
        return res.status(403).json({ error: 'Your form session changed. Reload before saving.' });
      }
    }
    next();
  });

  function requireDatabase(req, res) {
    if (typeof query === 'function') return true;
    res.status(503).json({ error: 'Assessment Manager storage is not configured.' });
    return false;
  }

  router.get('/session', (req, res) => {
    res.json({ csrf: req.session.assessmentManagerCsrf, userId: req.user.id });
  });
  router.use('/resource-library', createResourceLibraryRouter({ query }));
  router.use('/suppliers', createSuppliersRouter({ query }));
  router.use('/verifiers', createVerifiersRouter({ query, loadModerationAccess }));
  router.use('/home', createAssessmentHomeRouter({ query, loadTeachingSubjects }));

  router.get('/google-drive/config', (_req, res, next) => {
    try { res.json(pickerConfiguration(env)); }
    catch (error) { next(error); }
  });

  router.get('/staff', async (req, res, next) => {
    if (!requireDatabase(req, res)) return;
    const owner = safeOwnerId(req);
    if (!owner) return res.status(403).json({ error: 'A valid signed-in staff identity is required.' });
    if (typeof loadStaff !== 'function') {
      return res.status(503).json({ error: 'The current KAMAR staff and department directory is not available.' });
    }
    try {
      const directory = await loadStaff(req);
      if (!Array.isArray(directory?.staff) || !directory.staff.every(person =>
        person && typeof person.id === 'string' && /^\d+$/.test(person.id) &&
        [person.first_name, person.last_name, person.code].every(value => value === null || typeof value === 'string')) ||
        !Array.isArray(directory.departments) || !directory.departments.every(item =>
          item && typeof item.name === 'string' && item.name.length <= 500 &&
          typeof item.teacher === 'string' && item.teacher.length <= 500 && Array.isArray(item.leaders))) {
        throw new Error('The KAMAR staff directory returned invalid data.');
      }
      const usage = await query(`SELECT content->>'teacher' AS teacher, COUNT(*)::integer AS uses
        FROM assessment_records WHERE owner_id=$1 AND NULLIF(TRIM(content->>'teacher'),'') IS NOT NULL
        GROUP BY content->>'teacher'`, [owner]);
      const counts = new Map(usage.rows.map(row => [row.teacher, Number(row.uses)]));
      const staff = directory.staff.map(person => {
        const fullName = [person.first_name?.trim(), person.last_name?.trim()].filter(Boolean).join(' ');
        const name = fullName + (person.code?.trim() ? ' (' + person.code.trim() + ')' : '');
        return { id: person.id, name, uses: (counts.get(name) || 0) + (name === fullName ? 0 : counts.get(fullName) || 0) };
      });
      res.json({ staff, departments: directory.departments });
    } catch (error) {
      console.error('Assessment Manager KAMAR staff list failed:', error.message);
      res.status(502).json({ error: 'The current KAMAR staff and department list could not be loaded. Existing records are unchanged; retry shortly.' });
    }
  });

  router.get('/teaching-subjects/:year', async (req, res) => {
    const year = Number(req.params.year);
    if (!/^\d{4}$/.test(req.params.year) || year < 2000 || year > 2100) return res.status(400).json({ error: 'Choose a valid school year.' });
    if (!safeOwnerId(req)) return res.status(403).json({ error: 'A valid signed-in staff identity is required.' });
    if (typeof loadTeachingSubjects !== 'function') return res.status(503).json({ error: 'Teaching subjects are not available.' });
    try {
      const result = await loadTeachingSubjects(req, year);
      const valid = value => typeof value === 'string' && value.trim() && value.length <= 80;
      if (!Array.isArray(result?.classes) || result.classes.length > 500 ||
          !result.classes.every(item => item && valid(item.subject) && valid(item.course))) {
        throw new Error('Global Control returned invalid teaching subjects.');
      }
      const departments = result.departments ?? [];
      const name = value => typeof value === 'string' && value.trim() && value.length <= 200;
      if (!Array.isArray(departments) || departments.length > 200 || !departments.every(item => item && name(item.name) &&
          Array.isArray(item.teachers) && item.teachers.length <= 500 && item.teachers.every(name))) {
        throw new Error('Global Control returned invalid department members.');
      }
      res.json({ classes: result.classes.map(({ subject, course }) => ({ subject, course })),
        departments: departments.map(({ name, teachers }) => ({ name, teachers })) });
    } catch (error) {
      console.error('Assessment Manager teaching subjects failed:', error.message);
      res.status(502).json({ error: 'Your teaching subjects could not be loaded from the WHS Unit Library class links. Type Subject and Course Code instead.' });
    }
  });

  router.get('/class-size/:year', async (req, res) => {
    const year = Number(req.params.year), course = typeof req.query.course === 'string' ? req.query.course.trim() : '';
    if (!/^\d{4}$/.test(req.params.year) || year < 2000 || year > 2100) return res.status(400).json({ error: 'Choose a valid school year.' });
    if (!/^[A-Za-z0-9]{2,20}$/.test(course)) return res.status(400).json({ error: 'Enter a course code such as 13DTECH.' });
    if (!safeOwnerId(req)) return res.status(403).json({ error: 'A valid signed-in staff identity is required.' });
    if (typeof loadClassSize !== 'function') return res.status(503).json({ error: 'Student Tracker class sizes are not available.' });
    try {
      const result = await loadClassSize(req, year, course);
      if (!Number.isInteger(result?.students) || result.students < 0 || result.students > 5000 ||
          typeof result.linked !== 'boolean' || typeof result.ambiguous !== 'boolean' ||
          !(result.term === null || [1, 2, 3, 4].includes(result.term))) throw new Error('Global Control returned an invalid class size.');
      res.json({ course: course.toUpperCase(), students: result.students, term: result.term, linked: result.linked, ambiguous: result.ambiguous });
    } catch (error) {
      console.error('Assessment Manager class size failed:', error.message);
      res.status(502).json({ error: 'The class size could not be loaded from Student Tracker.' });
    }
  });

  router.get('/standards/search', async (req, res) => {
    let filters;
    try { filters = validateSearch({ query: req.query.q, view: req.query.view, level: req.query.level }); }
    catch (error) { return res.status(400).json({ error: error.message }); }
    try {
      res.set('Cache-Control', 'no-store');
      res.json(await searchNzqaStandards(filters));
    } catch (error) {
      console.error('Assessment Manager NZQA standards search failed:', error.message);
      res.status(502).json({ error: 'NZQA standards search is unavailable. Retry shortly; saved standards are unchanged.' });
    }
  });

  router.get('/standards/:number/details', async (req, res) => {
    if (!/^\d{4,8}$/.test(req.params.number)) return res.status(400).json({ error: 'Choose a valid NZQA standard number.' });
    try { res.json(await standardDetails(req.params.number)); }
    catch (error) {
      console.error('Assessment Manager NZQA standard details failed:', error.message);
      res.status(502).json({ error: 'NZQA standard details could not be loaded. Existing records are unchanged; retry shortly.' });
    }
  });

  router.get('/standards/:number/consent-scope', async (req, res) => {
    if (!/^\d{4,8}$/.test(req.params.number)) return res.status(400).json({ error: 'Choose a valid NZQA standard number.' });
    try {
      res.set('Cache-Control', 'no-store');
      res.json(await checkConsent(req.params.number));
    } catch (error) {
      console.error('Assessment Manager NZQA consent check failed:', error.message);
      res.status(502).json({ error: 'NZQA consent could not be verified. Check the school’s consent manually or retry.' });
    }
  });

  router.get('/standards/:number/achievement-preview', async (req, res) => {
    if (!/^\d{4,8}$/.test(req.params.number)) return res.status(400).json({ error: 'Choose a valid NZQA standard number.' });
    try {
      res.set('Cache-Control', 'no-store');
      res.json(await standardDetails(req.params.number, { achievementPreview: true }));
    } catch (error) {
      console.error('Assessment Manager Achievement Standard preview failed:', error.message);
      res.status(502).json({ error: 'The Achievement Standard could not be extracted reliably. Review the official PDF and enter its details manually.' });
    }
  });

  router.get('/standards/:number/references', async (req, res) => {
    const year = Number(req.query.year);
    if (!/^\d{4,8}$/.test(req.params.number) || !/^\d{4}$/.test(req.query.year || '') || !validYear(year)) {
      return res.status(400).json({ error: 'Choose a valid standard number and assessment year.' });
    }
    try { res.json(await findNzqaReferences(req.params.number, year)); }
    catch (error) {
      console.error('Assessment Manager NZQA references failed:', error.message);
      res.status(502).json({ error: 'NZQA references could not be verified. Your saved links are unchanged; retry or enter a reference manually.' });
    }
  });

  router.get('/moderation/templates/:type', (req, res, next) => {
    const filenames = {
      feedback: 'confirmation-feedback-template.docx',
      schedule: 'marking-schedule-template.docx',
      coversheet: 'whs-coversheet-template.docx'
    };
    const filename = filenames[req.params.type];
    if (!filename) return res.status(400).json({ error: 'Choose a supported Word moderation template.' });
    try { res.type(DOCX).attachment(filename).send(renderDocument(req.params.type, {}, '')); }
    catch (error) { next(error); }
  });

  router.post('/moderation/import/:type', (req, res) => {
    const { type } = req.params;
    if (!DOCUMENT_TYPES.has(type) || !Buffer.isBuffer(req.body)) {
      return res.status(400).json({ error: 'Choose a supported Word moderation document.' });
    }
    try {
      const result = importDocument(req.body, type);
      if (!validModerationContent({ ...result.common, [type]: JSON.stringify(result.document) })) {
        throw new Error('Some fields do not match the form limits. Check the document layout, dates and field lengths.');
      }
      res.json(result);
    } catch (error) {
      console.warn('Assessment Manager moderation document import rejected.');
      res.status(400).json({ error: 'The document could not be imported. ' + error.message });
    }
  });

  router.get('/moderation/:year', async (req, res, next) => {
    if (!requireDatabase(req, res)) return;
    const owner = safeOwnerId(req), year = Number(req.params.year);
    if (!owner || !/^\d{4}$/.test(req.params.year) || !validYear(year)) {
      return res.status(400).json({ error: 'Choose a valid assessment year.' });
    }
    try {
      const result = await query(`SELECT entry_key,content->>'title' AS title,
        content->>'standardNumber' AS standard_number,content->>'standardTitle' AS standard_title,
        content->>'studentName' AS student_name,content->>'parentRecord' AS parent_record,updated_at
        FROM assessment_records WHERE owner_id=$1 AND year=$2 AND entry_key<>'main' ORDER BY updated_at DESC`, [owner, year]);
      res.json({ records: result.rows });
    } catch (error) { next(error); }
  });

  router.all('/:year/assessmentSetup/main', async (req, res, next) => {
    if (!requireDatabase(req, res)) return;
    const owner = safeOwnerId(req), year = Number(req.params.year);
    if (!owner || !/^\d{4}$/.test(req.params.year) || !validYear(year)) {
      return res.status(400).json({ error: 'Choose a valid assessment year.' });
    }
    try {
      if (req.method === 'GET') {
        const result = await query('SELECT content,revision,updated_at FROM assessment_settings WHERE owner_id=$1 AND year=$2', [owner, year]);
        return res.json(result.rows[0] || { content: {}, revision: 0, updated_at: null });
      }
      if (req.method !== 'PUT') return res.status(405).set('Allow', 'GET, PUT').json({ error: 'Use GET or PUT for assessment standards.' });
      if (!Number.isInteger(req.body?.revision) || req.body.revision < 0 || !validSettings(req.body.content)) {
        return res.status(400).json({ error: 'Check the selected NZQA standards and retry. No changes were saved.' });
      }
      const result = req.body.revision === 0
        ? await query(`WITH saved AS (
            INSERT INTO assessment_settings(owner_id,year,content) VALUES ($1,$2,$3)
            ON CONFLICT DO NOTHING RETURNING revision,updated_at
          ), audited AS (
            INSERT INTO assessment_audit(owner_id,year,entry_key,action,revision)
            SELECT $1,$2,'standards','settings-updated',revision FROM saved RETURNING id
          ) SELECT saved.revision,saved.updated_at FROM saved JOIN audited ON true`,
        [owner, year, JSON.stringify(req.body.content)])
        : await query(`WITH saved AS (
            UPDATE assessment_settings SET content=$3,revision=revision+1,updated_at=NOW()
            WHERE owner_id=$1 AND year=$2 AND revision=$4 RETURNING revision,updated_at
          ), audited AS (
            INSERT INTO assessment_audit(owner_id,year,entry_key,action,revision)
            SELECT $1,$2,'standards','settings-updated',revision FROM saved RETURNING id
          ) SELECT saved.revision,saved.updated_at FROM saved JOIN audited ON true`,
        [owner, year, JSON.stringify(req.body.content), req.body.revision]);
      if (!result.rows.length) return res.status(409).json({ error: 'Assessment standards changed in another tab. Reload and review before saving.' });
      return res.json(result.rows[0]);
    } catch (error) { next(error); }
  });

  router.all('/:year/moderation/:record', async (req, res, next) => {
    if (!requireDatabase(req, res)) return;
    const owner = safeOwnerId(req), year = Number(req.params.year), { record } = req.params;
    if (!owner || !/^\d{4}$/.test(req.params.year) || !validDocumentAddress(year, record)) {
      return res.status(400).json({ error: 'Choose a valid assessment year and record.' });
    }
    try {
      if (req.method === 'GET') {
        const result = await query(`SELECT content,revision,updated_at FROM assessment_records
          WHERE owner_id=$1 AND year=$2 AND entry_key=$3`, [owner, year, record]);
        const saved = result.rows[0] || { content: {}, revision: 0, updated_at: null };
        if (record === 'main' && !saved.content.folderId) {
          const previous = await query(`SELECT content->>'folderId' AS folder_id,content->>'folderName' AS folder_name
            FROM assessment_records WHERE owner_id=$1 AND year<>$2 AND entry_key='main'
              AND NULLIF(TRIM(content->>'folderId'),'') IS NOT NULL
            ORDER BY year DESC LIMIT 1`, [owner, year]);
          const folder = previous.rows[0];
          if (folder) return res.json({ ...saved, content: {
            ...saved.content, folderId: folder.folder_id, folderName: folder.folder_name || ''
          } });
        }
        return res.json(saved);
      }
      if (req.method !== 'PUT') return res.status(405).set('Allow', 'GET, PUT').json({ error: 'Use GET or PUT for moderation records.' });
      if (!Number.isInteger(req.body?.revision) || req.body.revision < 0 || !validModerationContent(req.body.content) ||
          record === 'main' && req.body.content.parentRecord) {
        return res.status(400).json({ error: 'Moderation data is invalid or too long. Your changes have not been saved.' });
      }
      const parentRecord = req.body.content.parentRecord || null;
      if (parentRecord && (!UUID.test(parentRecord) || parentRecord === record)) {
        return res.status(400).json({ error: 'Choose a valid parent assessment record.' });
      }
      if (parentRecord) {
        const parent = await query(`SELECT 1 FROM assessment_records
          WHERE owner_id=$1 AND year=$2 AND entry_key=$3 AND parent_record IS NULL`, [owner, year, parentRecord]);
        if (!parent.rows.length) return res.status(400).json({ error: 'The parent assessment record is unavailable. No changes were saved.' });
      }
      const action = req.body.revision === 0 ? 'created' : 'updated';
      const result = req.body.revision === 0
        ? await query(`WITH saved AS (
            INSERT INTO assessment_records(owner_id,year,entry_key,parent_record,content)
            VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING revision,updated_at
          ), audited AS (
            INSERT INTO assessment_audit(owner_id,year,entry_key,action,revision)
            SELECT $1,$2,$3,$6,revision FROM saved RETURNING id
          ) SELECT saved.revision,saved.updated_at FROM saved JOIN audited ON true`,
        [owner, year, record, parentRecord, JSON.stringify(req.body.content), action])
        : await query(`WITH saved AS (
            UPDATE assessment_records SET parent_record=$4,content=$5,revision=revision+1,updated_at=NOW()
            WHERE owner_id=$1 AND year=$2 AND entry_key=$3 AND revision=$6 RETURNING revision,updated_at
          ), audited AS (
            INSERT INTO assessment_audit(owner_id,year,entry_key,action,revision)
            SELECT $1,$2,$3,$7,revision FROM saved RETURNING id
          ) SELECT saved.revision,saved.updated_at FROM saved JOIN audited ON true`,
        [owner, year, record, parentRecord, JSON.stringify(req.body.content), req.body.revision, action]);
      if (!result.rows.length) return res.status(409).json({ error: OWNERSHIP_ERROR });
      return res.json(result.rows[0]);
    } catch (error) { next(error); }
  });

  router.delete('/moderation/:year/:record', async (req, res, next) => {
    if (!requireDatabase(req, res)) return;
    const owner = safeOwnerId(req), year = Number(req.params.year), { record } = req.params;
    if (!owner || !/^\d{4}$/.test(req.params.year) || !validDocumentAddress(year, record, false) ||
        !Number.isInteger(req.body?.revision) || req.body.revision < 1) {
      return res.status(400).json({ error: 'Choose a saved moderation record and its current revision.' });
    }
    try {
      const result = await query(`WITH deleted AS (
          DELETE FROM assessment_records
          WHERE owner_id=$1 AND year=$2 AND entry_key=$3 AND revision=$4
            AND NOT EXISTS (SELECT 1 FROM assessment_records child
              WHERE child.owner_id=$1 AND child.year=$2 AND child.parent_record=$3)
          RETURNING entry_key,revision
        ), audited AS (
          INSERT INTO assessment_audit(owner_id,year,entry_key,action,revision)
          SELECT $1,$2,entry_key,'deleted',revision FROM deleted RETURNING id
        ) SELECT deleted.entry_key FROM deleted JOIN audited ON true`,
      [owner, year, record, req.body.revision]);
      if (!result.rows.length) return res.status(409).json({
        error: 'The record changed, is unavailable, or still has student records. Reload and remove its student records before deleting the assessment.'
      });
      return res.json({ deleted: result.rows[0].entry_key });
    } catch (error) { next(error); }
  });

  router.get('/moderation/:year/:record/:type/document', async (req, res, next) => {
    if (!requireDatabase(req, res)) return;
    const owner = safeOwnerId(req), year = Number(req.params.year), { record, type } = req.params;
    if (!owner || !/^\d{4}$/.test(req.params.year) || !validDocumentAddress(year, record, false) || !DOCUMENT_TYPES.has(type)) {
      return res.status(400).json({ error: 'Choose a valid saved moderation record and document type.' });
    }
    try {
      const result = await query(`SELECT content FROM assessment_records
        WHERE owner_id=$1 AND year=$2 AND entry_key=$3`, [owner, year, record]);
      if (!result.rows.length) return res.status(404).json({ error: 'Save this moderation record before creating a document.' });
      const content = { ...result.rows[0].content };
      if (type === 'schedule' && req.query.standardPdfUrl !== undefined) {
        let url;
        try { url = new URL(req.query.standardPdfUrl); } catch { url = null; }
        if (!url || url.protocol !== 'https:' || url.hostname !== 'www.nzqa.govt.nz' || !url.pathname.startsWith('/nqfdocs/') ||
            url.username || url.password) {
          return res.status(400).json({ error: 'Choose the official NZQA standard PDF link.' });
        }
        content.standardPdfUrl = url.href;
      }
      res.type(DOCX).attachment(type + '.docx').send(renderDocument(type, content, year));
    } catch (error) { next(error); }
  });

  return router;
}

module.exports = {
  createAssessmentRouter,
  validModerationContent,
  validSelectedStandards,
  validSettings,
  validDocumentAddress
};
