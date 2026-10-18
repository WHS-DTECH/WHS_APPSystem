const express = require('express');
const { query } = require('./db');
const { HUBS, userHasHubPermission } = require('./hubRoles');

const router = express.Router();
router.use(express.json({ limit: '1mb' }));

const clean = (value, max = 500) => String(value == null ? '' : value).trim().slice(0, max);

function normalise(input) {
  const number = clean(input.standard_number, 20);
  const name = clean(input.standard_name, 500);
  if (!number || !name) return null;
  const credits = parseInt(input.credits, 10);
  const levelRaw = clean(input.level, 20);
  const level = /^\d$/.test(levelRaw) ? `Level ${levelRaw}` : levelRaw;
  const url = clean(input.nzqa_url, 500);
  return {
    standard_number: number,
    standard_name: name,
    subject_set: clean(input.subject_set, 120) || null,
    level: level || null,
    credits: Number.isFinite(credits) ? credits : null,
    assessment_type: clean(input.assessment_type, 40) || null,
    nzqa_url: /^https?:\/\//i.test(url) ? url : `https://www.nzqa.govt.nz/ncea/assessment/search.do?query=${encodeURIComponent(number)}`
  };
}

async function access(req, res, next) {
  try {
    if (!req.isAuthenticated || !req.isAuthenticated()) return res.status(401).json({ error: 'Sign in required.' });
    const hubKey = req.params.hubKey;
    if (!HUBS[hubKey]) return res.status(404).json({ error: 'Unknown hub.' });
    const manage = await userHasHubPermission(req.user, hubKey, 'admin.manage');
    const roles = req.user.roles || [];
    const canView = manage || roles.includes('Teacher') || await userHasHubPermission(req.user, hubKey, 'teacher.view');
    if (!canView) return res.status(403).json({ error: 'Only administrators, Lead Teachers and teachers can view assessment standards.' });
    req.hub = { key: hubKey, ...HUBS[hubKey] };
    req.canManage = manage;
    return next();
  } catch (error) {
    return next(error);
  }
}

const requireManage = (req, res, next) => (req.canManage ? next() : res.status(403).json({ error: 'Only administrators and Lead Teachers can change standards.' }));

router.get('/:hubKey/assessment-standards', access, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT id, standard_number, standard_name, subject_set, level, credits, assessment_type, nzqa_url
       FROM hub_assessment_standards WHERE hub_key = $1
       ORDER BY level NULLS LAST, standard_number`,
      [req.hub.key]
    );
    res.json({ hub: { key: req.hub.key, label: req.hub.label, home: req.hub.home }, canManage: req.canManage, standards: result.rows });
  } catch (error) {
    next(error);
  }
});

const UPSERT = `INSERT INTO hub_assessment_standards
  (hub_key, standard_number, standard_name, subject_set, level, credits, assessment_type, nzqa_url)
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
  ON CONFLICT (hub_key, standard_number) DO UPDATE SET
    standard_name = EXCLUDED.standard_name, subject_set = EXCLUDED.subject_set, level = EXCLUDED.level,
    credits = EXCLUDED.credits, assessment_type = EXCLUDED.assessment_type, nzqa_url = EXCLUDED.nzqa_url`;

// Accepts one standard or an array (used by the paste/import box).
router.post('/:hubKey/assessment-standards', access, requireManage, async (req, res, next) => {
  try {
    const items = Array.isArray(req.body.standards) ? req.body.standards : [req.body];
    if (items.length > 500) return res.status(400).json({ error: 'Import up to 500 standards at a time.' });
    let saved = 0;
    let skipped = 0;
    for (const item of items) {
      const row = normalise(item || {});
      if (!row) { skipped += 1; continue; }
      await query(UPSERT, [req.hub.key, row.standard_number, row.standard_name, row.subject_set, row.level, row.credits, row.assessment_type, row.nzqa_url]);
      saved += 1;
    }
    if (!saved) return res.status(400).json({ error: 'Each standard needs a number and a name.', skipped });
    return res.json({ saved, skipped });
  } catch (error) {
    return next(error);
  }
});

router.delete('/:hubKey/assessment-standards/:id', access, requireManage, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id.' });
    await query('DELETE FROM hub_assessment_standards WHERE id = $1 AND hub_key = $2', [id, req.hub.key]);
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

module.exports = { router, normalise };
