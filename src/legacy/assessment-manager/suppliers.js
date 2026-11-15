const express = require('express');
const { UUID } = require('./public/resource-library-schema');

const text = (value, limit) => typeof value === 'string' && value.length <= limit &&
  !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value);
function validWebsite(value) {
  if (!value) return true;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; }
  catch { return false; }
}
function validDate(value) {
  return value === '' || typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
function validSupplier(value) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).sort().join(',') === 'email,name,notes,phone,website' &&
    text(value.name, 200) && Boolean(value.name.trim()) && value.name === value.name.trim() &&
    text(value.website, 500) && validWebsite(value.website) &&
    text(value.email, 254) && (!value.email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)) &&
    text(value.phone, 100) && text(value.notes, 8000);
}

function createSuppliersRouter({ query }) {
  const router = express.Router();
  const wrap = handler => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!req.user?.roles?.some(role => ['ADMIN', 'Teacher'].includes(role)) || !UUID.test(req.user.id || '')) {
      return res.status(403).json({ error: 'Signed-in staff access is required for suppliers.' });
    }
    if (typeof query !== 'function') return res.status(503).json({ error: 'Supplier storage is not configured.' });
    next();
  });
  router.param('id', (req, res, next, id) => {
    if (!UUID.test(id)) return res.status(400).json({ error: 'Choose a valid supplier.' });
    next();
  });
  router.param('reminder', (req, res, next, id) => {
    if (!UUID.test(id)) return res.status(400).json({ error: 'Choose a valid reminder.' });
    next();
  });
  router.get('/', wrap(async (req, res) => {
    const result = await query(`SELECT id,name,website,email,phone,notes,source_url,source_checked::text,revision,updated_at
      FROM assessment_suppliers ORDER BY lower(name),id`);
    res.json({ suppliers: result.rows });
  }));
  router.get('/reminders', wrap(async (req, res) => {
    const result = await query(`SELECT m.id,m.details,m.source,m.due_date::text,
      s.name AS supplier_name,r.content->>'title' AS resource_title,(r.deleted_at IS NOT NULL) AS resource_deleted
      FROM assessment_supplier_reminders m JOIN assessment_suppliers s ON s.id=m.supplier_id
      JOIN assessment_resource_library r ON r.id=m.resource_id
      WHERE NOT m.completed ORDER BY m.due_date NULLS LAST,m.updated_at DESC LIMIT 201`);
    res.json({ reminders: result.rows.slice(0, 200), more: result.rows.length > 200 });
  }));
  router.put('/:id', wrap(async (req, res) => {
    const { supplier, revision } = req.body || {};
    if (!validSupplier(supplier) || !Number.isInteger(revision) || revision < 0 || revision > 2147483646) {
      return res.status(400).json({ error: 'Enter a supplier name, valid HTTPS website and valid contact details.' });
    }
    const params = [req.params.id, supplier.name, supplier.website, supplier.email, supplier.phone, supplier.notes, req.user.id, revision];
    let result;
    try {
      result = revision === 0
        ? await query(`INSERT INTO assessment_suppliers(id,name,website,email,phone,notes,updated_by)
            VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO NOTHING RETURNING id,revision`, params.slice(0, 7))
        : await query(`UPDATE assessment_suppliers SET name=$2,website=$3,email=$4,phone=$5,notes=$6,
            updated_by=$7,revision=revision+1,updated_at=NOW() WHERE id=$1 AND revision=$8 RETURNING id,revision`, params);
    } catch (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'A supplier with this name already exists.' });
      throw error;
    }
    if (!result.rows.length) return res.status(409).json({ error: 'This supplier changed in another window. Reload before saving.' });
    res.json(result.rows[0]);
  }));
  router.get('/:id/resources', wrap(async (req, res) => {
    const result = await query(`SELECT r.id,r.content->>'title' AS title,r.content->'standards' AS standards
      FROM assessment_resource_library r JOIN assessment_suppliers s ON s.id=$1
      WHERE r.deleted_at IS NULL AND COALESCE(r.content->'origin'->>'type','Commercial')='Commercial' AND (r.content->>'supplierId'=s.id::text OR
        (COALESCE(r.content->>'supplierId','')='' AND lower(btrim(r.content->>'supplier'))=lower(btrim(s.name))))
      ORDER BY lower(r.content->>'title'),r.id LIMIT 501`, [req.params.id]);
    res.json({ resources: result.rows.slice(0, 500), more: result.rows.length > 500 });
  }));
  router.get('/:id/reminders', wrap(async (req, res) => {
    const result = await query(`SELECT m.id,m.resource_id,m.details,m.source,m.due_date::text,m.completed,m.revision,
      r.content->>'title' AS resource_title,r.content->'standards' AS standards,(r.deleted_at IS NOT NULL) AS resource_deleted
      FROM assessment_supplier_reminders m JOIN assessment_resource_library r ON r.id=m.resource_id
      WHERE m.supplier_id=$1 ORDER BY m.completed,m.due_date NULLS LAST,m.updated_at DESC LIMIT 201`, [req.params.id]);
    res.json({ reminders: result.rows.slice(0, 200), more: result.rows.length > 200 });
  }));
  router.put('/:id/reminders/:reminder', wrap(async (req, res) => {
    const { revision, resourceId, details, source, dueDate, completed } = req.body || {};
    if (!Number.isInteger(revision) || revision < 0 || revision > 2147483646) {
      return res.status(400).json({ error: 'Reload this reminder before saving.' });
    }
    let result;
    if (revision === 0) {
      if (typeof resourceId !== 'string' || !UUID.test(resourceId) || !text(details, 2000) || !details.trim() ||
          !text(source, 1000) || !source.trim() || !validDate(dueDate)) {
        return res.status(400).json({ error: 'Choose an assessment and enter update details, a source and an optional valid reminder date.' });
      }
      result = await query(`INSERT INTO assessment_supplier_reminders(id,supplier_id,resource_id,details,source,due_date,created_by,updated_by)
        SELECT $1,s.id,r.id,$4,$5,NULLIF($6,'')::date,$7,$7
        FROM assessment_suppliers s JOIN assessment_resource_library r ON r.id=$3 AND r.deleted_at IS NULL
        WHERE s.id=$2 AND COALESCE(r.content->'origin'->>'type','Commercial')='Commercial' AND (r.content->>'supplierId'=s.id::text OR
          (COALESCE(r.content->>'supplierId','')='' AND lower(btrim(r.content->>'supplier'))=lower(btrim(s.name))))
        ON CONFLICT(id) DO NOTHING RETURNING id,revision`,
      [req.params.reminder, req.params.id, resourceId, details.trim(), source.trim(), dueDate, req.user.id]);
      if (!result.rows.length) return res.status(409).json({ error: 'The assessment is unavailable or no longer belongs to this supplier. Refresh and retry.' });
    } else {
      if (typeof completed !== 'boolean') return res.status(400).json({ error: 'Choose whether this reminder is complete.' });
      result = await query(`UPDATE assessment_supplier_reminders SET completed=$3,revision=revision+1,updated_by=$4,updated_at=NOW()
        WHERE id=$1 AND supplier_id=$2 AND revision=$5 RETURNING id,revision`,
      [req.params.reminder, req.params.id, completed, req.user.id, revision]);
      if (!result.rows.length) return res.status(409).json({ error: 'This reminder changed in another window. Refresh and retry.' });
    }
    res.json(result.rows[0]);
  }));
  return router;
}

module.exports = { createSuppliersRouter, validSupplier };
