const crypto = require('node:crypto');
const express = require('express');

const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const HASH = /^[0-9a-f]{64}$/;
const STATUS = new Set(['unknown', 'not_entered', 'not_yet_assessed', 'result', 'external', 'other']);

function text(value, max, required = false) {
  return typeof value === 'string' && value.length <= max && (!required || Boolean(value.trim())) &&
    !/[\u0000-\u001f\u007f]/.test(value);
}
function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
function validate(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      !(input.year === null || Number.isInteger(input.year) && input.year >= 2000 && input.year <= 2100) ||
      !(input.observedOn === null || validDate(input.observedOn)) ||
      !((input.sourceName === null && input.imageHash === null) ||
        (text(input.sourceName, 255, true) && typeof input.imageHash === 'string' && HASH.test(input.imageHash))) ||
      !(input.supersedesId === null || typeof input.supersedesId === 'string' && UUID.test(input.supersedesId)) ||
      input.reviewed !== true || !input.assessment || typeof input.assessment !== 'object' ||
      !text(input.assessment.standardNumber, 12) || !/^\d*$/.test(input.assessment.standardNumber) ||
      !text(input.assessment.code, 80) || !text(input.assessment.title, 500) ||
      !text(input.assessment.version, 20) || !text(input.assessment.credits, 20) ||
      !text(input.assessment.level, 20) || !text(input.assessment.className, 120) ||
      !Array.isArray(input.rows) || !input.rows.length || input.rows.length > 200) {
    throw new Error('Review the entered details and at least one student before saving.');
  }
  const ids = new Set();
  for (const row of input.rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row) || row.reviewed !== true ||
        !text(row.visibleName, 200, true) || !text(row.studentId, 80) ||
        !text(row.yearLevel, 30) || !text(row.tutor, 120) || !text(row.course, 120) ||
        !STATUS.has(row.status) || !text(row.result, 100) || !text(row.derivedGrade, 100) ||
        ![null, true, false].includes(row.entered) || ![null, true, false].includes(row.published) ||
        ![null, true, false].includes(row.notify) ||
        (row.studentId && row.matchConfirmed !== true) || (row.status === 'result' && !row.result.trim())) {
      throw new Error('Review each student, matching decision and visible result before saving.');
    }
    if (row.studentId) {
      if (ids.has(row.studentId)) throw new Error('A student cannot be linked twice in one screenshot.');
      ids.add(row.studentId);
    }
  }
}

function createAssessmentRouter({ pool, appBaseUrl }) {
  const router = express.Router();
  router.use((req, res, next) => {
    if (!req.session) return res.status(503).json({ error: 'A signed-in session is required.' });
    if (!req.session.kamarAssessmentCsrf) req.session.kamarAssessmentCsrf = crypto.randomBytes(32).toString('hex');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const actual = Buffer.from(req.get('x-kamar-assessment-csrf') || '');
      const expected = Buffer.from(req.session.kamarAssessmentCsrf);
      if (req.get('origin') !== new URL(appBaseUrl).origin || actual.length !== expected.length ||
          !crypto.timingSafeEqual(actual, expected)) {
        return res.status(403).json({ error: 'Your review session expired or came from another site. Reload before saving.' });
      }
    }
    next();
  });
  router.get('/session', (req, res) => res.json({ csrf: req.session.kamarAssessmentCsrf }));
  router.get('/students', async (_req, res) => {
    try {
      const result = await pool.query(`SELECT id_number,first_name,last_name,year_level,tutor,status
        FROM student_details_upload WHERE NULLIF(TRIM(id_number),'') IS NOT NULL
        ORDER BY lower(last_name),lower(first_name),id_number`);
      res.json({ students: result.rows });
    } catch {
      console.error('KAMAR assessment Student List read failed.');
      res.status(503).json({ error: 'The KAMAR Student List is unavailable. No data has been changed.' });
    }
  });
  router.get('/snapshots', async (req, res) => {
    const year = Number(req.query.year);
    if (!/^\d{4}$/.test(String(req.query.year)) || year < 2000 || year > 2100) {
      return res.status(400).json({ error: 'Choose a valid school year.' });
    }
    try {
      const result = await pool.query(`SELECT s.id,s.school_year,s.observed_on::text,s.source_name,s.created_at,
        s.data->'assessment' AS assessment,jsonb_array_length(s.data->'rows') AS row_count,
        NOT EXISTS (SELECT 1 FROM kamar_assessment_snapshots newer WHERE newer.supersedes_id=s.id) AS is_current
        FROM kamar_assessment_snapshots s WHERE s.school_year=$1 OR s.school_year IS NULL
        ORDER BY s.observed_on DESC NULLS LAST,s.created_at DESC,s.id`, [year]);
      res.json({ snapshots: result.rows });
    } catch {
      console.error('KAMAR assessment snapshots read failed.');
      res.status(503).json({ error: 'Assessment snapshots are unavailable. Run the KAMAR history migration and retry.' });
    }
  });
  router.get('/snapshots/:id', async (req, res) => {
    if (!UUID.test(req.params.id)) return res.status(400).json({ error: 'Choose a valid snapshot.' });
    try {
      const result = await pool.query(`SELECT s.id,s.school_year,s.observed_on::text,s.source_name,s.image_hash,s.data,s.created_at,
        NOT EXISTS (SELECT 1 FROM kamar_assessment_snapshots newer WHERE newer.supersedes_id=s.id) AS is_current
        FROM kamar_assessment_snapshots s WHERE s.id=$1`, [req.params.id]);
      if (!result.rows.length) return res.status(404).json({ error: 'Snapshot not found.' });
      res.json({ snapshot: result.rows[0] });
    } catch {
      console.error('KAMAR assessment snapshot read failed.');
      res.status(503).json({ error: 'Assessment snapshot is unavailable. Retry or check the KAMAR history migration.' });
    }
  });
  router.post('/snapshots', async (req, res) => {
    try { validate(req.body); }
    catch (error) { return res.status(400).json({ error: error.message }); }
    if (!UUID.test(req.user.id || '')) return res.status(403).json({ error: 'A verified school account is required.' });
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      if (req.body.supersedesId) {
        const previous = await client.query(`SELECT id,image_hash FROM kamar_assessment_snapshots WHERE id=$1 FOR SHARE`, [req.body.supersedesId]);
        if (!previous.rows.length) {
          await client.query('ROLLBACK');
          return res.status(409).json({ error: 'The original snapshot was not found. Reload before saving.' });
        }
        if (previous.rows[0].image_hash && previous.rows[0].image_hash !== req.body.imageHash) {
          await client.query('ROLLBACK');
          return res.status(409).json({ error: 'A correction must refer to the same screenshot. Start a new snapshot for a different image.' });
        }
      }
      const ids = req.body.rows.map(row => row.studentId).filter(Boolean);
      if (ids.length) {
        const found = await client.query('SELECT id_number FROM student_details_upload WHERE id_number = ANY($1::text[])', [ids]);
        if (found.rows.length !== ids.length) {
          await client.query('ROLLBACK');
          return res.status(409).json({ error: 'The Student List changed. Reload and review student matches.' });
        }
      }
      const id = crypto.randomUUID();
      const { standardNumber, code, title, version, credits, level, className } = req.body.assessment;
      const data = {
        assessment: { standardNumber, code, title, version, credits, level, className },
        rows: req.body.rows.map(({ visibleName, studentId, yearLevel, tutor, course, status, result,
          derivedGrade, entered, published, notify, reviewed, matchConfirmed }) =>
          ({ visibleName, studentId, yearLevel, tutor, course, status, result,
            derivedGrade, entered, published, notify, reviewed, matchConfirmed: studentId ? matchConfirmed : false }))
      };
      await client.query(`INSERT INTO kamar_assessment_snapshots
        (id,school_year,observed_on,source_name,image_hash,data,supersedes_id,created_by)
        VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8)`,
      [id, req.body.year, req.body.observedOn, req.body.sourceName, req.body.imageHash,
        JSON.stringify(data), req.body.supersedesId, req.user.id]);
      await client.query('COMMIT');
      res.status(201).json({ id });
    } catch (error) {
      if (client) {
        try { await client.query('ROLLBACK'); }
        catch { console.error('KAMAR assessment transaction rollback failed.'); }
      }
      if (error.code === '23505') return res.status(409).json({ error: 'This snapshot has already been corrected. Reload the latest version.' });
      console.error('KAMAR assessment snapshot save failed.');
      res.status(503).json({ error: 'Assessment snapshot was not saved. Check the KAMAR history migration and retry.' });
    } finally { if (client) client.release(); }
  });
  return router;
}

module.exports = { createAssessmentRouter, validate };
