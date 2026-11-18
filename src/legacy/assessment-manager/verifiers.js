const express = require('express');
const { UUID } = require('./moderation');
const { validDate } = require('./assessmentCalendar');

const text = (value, limit) => typeof value === 'string' && value.length <= limit && !/[\u0000-\u001f\u007f]/.test(value);
const multiline = (value, limit) => typeof value === 'string' && value.length <= limit && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
function validVerifier(value) {
  return value && Object.keys(value).sort().join(',') === 'email,name,notes,nzqaExpert,position,school' &&
    text(value.name, 200) && Boolean(value.name.trim()) && value.name === value.name.trim() &&
    text(value.school, 200) && text(value.position, 200) && text(value.email, 254) &&
    (!value.email || /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(value.email)) &&
    typeof value.nzqaExpert === 'boolean' && multiline(value.notes, 2000);
}
function validHistory(value) {
  return value && Object.keys(value).sort().join(',') === 'department,moderatedDate,notes,standardNumber,title,year' &&
    Number.isInteger(value.year) && value.year >= 2000 && value.year <= 2100 &&
    text(value.department, 200) && Boolean(value.department.trim()) &&
    text(value.standardNumber, 8) && /^(?:\d{4,8})?$/.test(value.standardNumber) &&
    text(value.title, 500) && Boolean(value.title.trim()) &&
    (value.moderatedDate === '' || validDate(value.moderatedDate)) && multiline(value.notes, 8000);
}
const columns = 'id,name,school,position,email,nzqa_expert,notes,revision,updated_at';
const visible = "(owner_id=$1 OR $3 OR lower(btrim(department))=ANY($2::text[]))";

function createVerifiersRouter({ query, loadModerationAccess }) {
  const router = express.Router();
  const wrap = handler => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
  router.use((req, res, next) => {
    if (!req.user?.roles?.some(role => ['ADMIN', 'Teacher'].includes(role)) || !UUID.test(req.user.id || '')) {
      return res.status(403).json({ error: 'Signed-in staff access is required for verifiers.' });
    }
    if (typeof query !== 'function') return res.status(503).json({ error: 'Verifier storage is not configured.' });
    next();
  });
  async function access(req) {
    if (typeof loadModerationAccess !== 'function') throw new Error('Current HoLA authority is not configured.');
    const result = await loadModerationAccess(req);
    if (!result || typeof result.all !== 'boolean' || result.all && !req.user.roles.includes('ADMIN') ||
        !Array.isArray(result.departments) || !result.departments.every(name => text(name, 200) && name.trim())) {
      throw new Error('Current HoLA authority returned invalid data.');
    }
    return [req.user.id, result.departments.map(name => name.trim().toLowerCase()), result.all];
  }
  router.param('id', (req, res, next, id) => {
    if (!UUID.test(id)) return res.status(400).json({ error: 'Choose a valid verifier.' });
    next();
  });
  router.get('/', wrap(async (req, res) => {
    res.json({ verifiers: (await query(`SELECT ${columns} FROM assessment_verifiers ORDER BY lower(name),id`)).rows });
  }));
  router.put('/:id', wrap(async (req, res) => {
    const { verifier, revision } = req.body || {};
    if (!validVerifier(verifier) || !Number.isInteger(revision) || revision < 0 || revision > 2147483646) {
      return res.status(400).json({ error: 'Enter a verifier name, valid contact details and designation.' });
    }
    const values = [req.params.id, verifier.name, verifier.school, verifier.position, verifier.email,
      verifier.nzqaExpert, verifier.notes, req.user.id, revision];
    const result = revision === 0
      ? await query(`INSERT INTO assessment_verifiers(id,name,school,position,email,nzqa_expert,notes,updated_by)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO NOTHING RETURNING ${columns}`, values.slice(0, 8))
      : await query(`UPDATE assessment_verifiers SET name=$2,school=$3,position=$4,email=$5,nzqa_expert=$6,
          notes=$7,updated_by=$8,revision=revision+1,updated_at=NOW() WHERE id=$1 AND revision=$9 RETURNING ${columns}`, values);
    if (!result.rows.length) return res.status(409).json({ error: 'This verifier changed in another window. Reload before saving.' });
    res.json(result.rows[0]);
  }));
  router.get('/:id/history', wrap(async (req, res) => {
    const scope = await access(req);
    const records = await query(`SELECT owner_id::text,year,entry_key,content,revision FROM assessment_records
      WHERE entry_key<>'main' AND parent_record IS NULL
      AND (owner_id=$1 OR $3 OR lower(btrim(content->>'department'))=ANY($2::text[]))
      AND ((content->>'internal')::jsonb)->>'verifierId'=$4 ORDER BY year DESC,updated_at DESC`, [...scope, req.params.id]);
    const manual = await query(`SELECT id,owner_id::text,year,department,standard_number,title,moderated_date::text,notes,revision
      FROM assessment_verifier_history WHERE ${visible} AND verifier_id=$4 ORDER BY year DESC,updated_at DESC`, [...scope, req.params.id]);
    res.json({ linked: records.rows.map(row => {
      const internal = JSON.parse(row.content.internal);
      const dates = [internal.verificationDate, ...(internal.samples || []).filter(sample => sample.student?.trim()).map(sample => sample.moderatedDate)].filter(Boolean).sort();
      return { ownerId: row.owner_id, year: row.year, record: row.entry_key, title: row.content.title,
        department: row.content.department || '', standardNumber: row.content.standardNumber || '',
        moderatedDate: dates.at(-1) || '', pending: !dates.length, own: row.owner_id === req.user.id };
    }), manual: manual.rows.map(row => ({ ...row, own: row.owner_id === req.user.id })) });
  }));
  router.put('/:id/history/:entry', wrap(async (req, res) => {
    const { entry, revision } = req.body || {};
    if (!UUID.test(req.params.entry) || !validHistory(entry) || !Number.isInteger(revision) || revision < 0 || revision > 2147483646) {
      return res.status(400).json({ error: 'Enter a valid year, department, standard/title and optional moderation date.' });
    }
    const values = [req.params.entry, req.params.id, req.user.id, entry.year, entry.department.trim(),
      entry.standardNumber, entry.title.trim(), entry.moderatedDate, entry.notes, revision];
    const result = revision === 0
      ? await query(`INSERT INTO assessment_verifier_history(id,verifier_id,owner_id,year,department,standard_number,title,moderated_date,notes)
          SELECT $1,id,$3,$4,$5,$6,$7,NULLIF($8,'')::date,$9 FROM assessment_verifiers WHERE id=$2
          ON CONFLICT(id) DO NOTHING RETURNING id,revision`, values.slice(0, 9))
      : await query(`UPDATE assessment_verifier_history SET year=$4,department=$5,standard_number=$6,title=$7,
          moderated_date=NULLIF($8,'')::date,notes=$9,revision=revision+1,updated_at=NOW()
          WHERE id=$1 AND verifier_id=$2 AND owner_id=$3 AND revision=$10 RETURNING id,revision`, values);
    if (!result.rows.length) return res.status(409).json({ error: 'This history entry changed or is unavailable. Reload before saving.' });
    res.json(result.rows[0]);
  }));
  router.get('/records/:owner/:year/:record', wrap(async (req, res) => {
    if (!UUID.test(req.params.owner) || !UUID.test(req.params.record) || !/^(?:20\d\d|2100)$/.test(req.params.year)) {
      return res.status(400).json({ error: 'Choose a valid moderation record.' });
    }
    const scope = await access(req);
    const record = (await query(`SELECT content,revision FROM assessment_records WHERE owner_id=$1 AND year=$2 AND entry_key=$3 AND parent_record IS NULL`,
      [req.params.owner, Number(req.params.year), req.params.record])).rows[0];
    if (!record || req.params.owner !== req.user.id && !scope[2] &&
        !scope[1].includes(String(record.content.department || '').trim().toLowerCase())) {
      return res.status(404).json({ error: 'This moderation record is unavailable to your account.' });
    }
    const children = await query(`SELECT entry_key,content,revision FROM assessment_records
      WHERE owner_id=$1 AND year=$2 AND parent_record=$3 ORDER BY entry_key`,
    [req.params.owner, Number(req.params.year), req.params.record]);
    res.json({ content: record.content, children: children.rows });
  }));
  return router;
}

module.exports = { createVerifiersRouter, validVerifier, validHistory };
