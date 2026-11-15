const express = require('express');
const { UUID, validate, validateDraft, critiqueBasis } = require('./public/resource-library-schema');

function createResourceLibraryRouter({ query }) {
  const router = express.Router();
  const wrap = handler => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!req.user?.roles?.some(role => ['ADMIN', 'Teacher'].includes(role)) || !UUID.test(req.user.id || '')) {
      return res.status(403).json({ error: 'Signed-in staff access is required for the resource library.' });
    }
    if (typeof query !== 'function') return res.status(503).json({ error: 'Resource Library storage is not configured.' });
    next();
  });
  router.get('/', wrap(async (req, res) => {
    const { q = '', standard = '', version = '', active = '', offset = '0' } = req.query;
    if (![q, standard, version, active, offset].every(value => typeof value === 'string') || q.length > 100 ||
        standard && !/^\d{4,8}$/.test(standard) || version && !/^\d{1,3}$/.test(version) ||
        !['', '1'].includes(active) || !/^\d{1,7}$/.test(offset)) {
      return res.status(400).json({ error: 'Choose valid library search filters.' });
    }
    const result = await query(`SELECT id,revision,updated_at,content->>'title' AS title,
      content->>'supplier' AS supplier,content->>'edition' AS edition,content->>'department' AS department,
      COALESCE(content->'origin'->>'type','Commercial') AS source_type,
      content->>'subject' AS subject,content->>'status' AS status,content->'standards' AS standards,
      COUNT(*) OVER()::integer AS total
      FROM assessment_resource_library
      WHERE deleted_at IS NULL AND ($1='' OR strpos(lower(concat_ws(' ',content->>'title',content->>'supplier',
        content->>'department',content->>'subject',content->>'edition',content->'standards')),lower($1))>0)
      AND ($2='' OR EXISTS (SELECT 1 FROM jsonb_array_elements(content->'standards') s
        WHERE s->>'number'=$2 AND ($3='' OR s->>'version'=$3)))
      AND ($4='' OR content->>'status'='Active')
      ORDER BY lower(content->>'title'),id LIMIT 50 OFFSET $5`, [q.trim(), standard, version, active, Number(offset)]);
    res.json({ records: result.rows.map(({ total, ...record }) => record), total: result.rows[0]?.total || 0 });
  }));
  router.get('/drafts', wrap(async (req, res) => {
    const result = await query(`SELECT d.resource_id AS id,d.content->>'title' AS title,d.revision,d.updated_at
      FROM assessment_resource_library_drafts d LEFT JOIN assessment_resource_library r ON r.id=d.resource_id
      WHERE d.owner_id=$1 AND (r.id IS NULL OR r.deleted_at IS NULL)
      ORDER BY d.updated_at DESC LIMIT 100`, [req.user.id]);
    res.json({ drafts: result.rows });
  }));
  router.get('/deleted', wrap(async (req, res) => {
    const result = await query(`SELECT id,revision,content->>'title' AS title,deleted_at
      FROM assessment_resource_library WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 100`);
    res.json({ records: result.rows });
  }));
  router.param('id', (req, res, next, id) => {
    if (!UUID.test(id)) return res.status(400).json({ error: 'Choose a valid library entry.' });
    next();
  });
  router.get('/:id/draft', wrap(async (req, res) => {
    const draft = (await query(`SELECT d.content,d.base_revision,d.revision
      FROM assessment_resource_library_drafts d LEFT JOIN assessment_resource_library r ON r.id=d.resource_id
      WHERE d.resource_id=$1 AND d.owner_id=$2 AND (r.id IS NULL OR r.deleted_at IS NULL)`,
    [req.params.id, req.user.id])).rows[0];
    if (draft) return res.json({ id: req.params.id, content: draft.content, revision: draft.base_revision, draftRevision: draft.revision });
    const current = (await query('SELECT id,content,revision,updated_at FROM assessment_resource_library WHERE id=$1 AND deleted_at IS NULL', [req.params.id])).rows[0];
    if (!current) return res.status(404).json({ error: 'This library entry or your draft is no longer available.' });
    res.json(current);
  }));
  router.put('/:id/draft', wrap(async (req, res) => {
    const { content, revision, draftRevision } = req.body || {};
    if (!Number.isInteger(revision) || revision < 0 || !Number.isInteger(draftRevision) || draftRevision < 0) {
      return res.status(400).json({ error: 'Reload the library draft before saving.' });
    }
    const problem = validateDraft(content);
    if (problem) return res.status(400).json({ error: problem });
    const params = [req.params.id, req.user.id, JSON.stringify(content), revision, draftRevision];
    const result = draftRevision === 0
      ? await query(`INSERT INTO assessment_resource_library_drafts(resource_id,owner_id,content,base_revision,revision)
          SELECT $1,$2,$3::jsonb,$4,1 WHERE
            (($4=0 AND NOT EXISTS (SELECT 1 FROM assessment_resource_library WHERE id=$1))
            OR ($4>0 AND EXISTS (SELECT 1 FROM assessment_resource_library WHERE id=$1 AND deleted_at IS NULL)))
          ON CONFLICT DO NOTHING RETURNING revision`, params.slice(0, 4))
      : await query(`UPDATE assessment_resource_library_drafts SET content=$3::jsonb,revision=revision+1,updated_at=NOW()
          WHERE resource_id=$1 AND owner_id=$2 AND base_revision=$4 AND revision=$5
          AND (($4=0 AND NOT EXISTS (SELECT 1 FROM assessment_resource_library WHERE id=$1))
            OR ($4>0 AND EXISTS (SELECT 1 FROM assessment_resource_library WHERE id=$1 AND deleted_at IS NULL)))
          RETURNING revision`, params);
    if (!result.rows.length) return res.status(409).json({ error: 'This draft changed in another window or the entry was deleted. Your changes remain on this page.' });
    res.json({ draftRevision: result.rows[0].revision });
  }));
  router.delete('/:id/draft', wrap(async (req, res) => {
    const { draftRevision } = req.body || {};
    if (!Number.isInteger(draftRevision) || draftRevision < 1) return res.status(400).json({ error: 'Reload the draft before discarding it.' });
    const result = await query(`DELETE FROM assessment_resource_library_drafts WHERE resource_id=$1 AND owner_id=$2 AND revision=$3 RETURNING resource_id`,
      [req.params.id, req.user.id, draftRevision]);
    if (!result.rows.length) return res.status(409).json({ error: 'This draft changed in another window. Reload before discarding it.' });
    res.json({ deleted: true });
  }));
  router.delete('/:id', wrap(async (req, res) => {
    const { revision } = req.body || {};
    if (!Number.isInteger(revision) || revision < 1) return res.status(400).json({ error: 'Reload the entry before deleting it.' });
    const result = await query(`UPDATE assessment_resource_library SET deleted_at=NOW()
      WHERE id=$1 AND revision=$2 AND deleted_at IS NULL RETURNING id`, [req.params.id, revision]);
    if (!result.rows.length) return res.status(409).json({ error: 'This entry changed or was already deleted. Refresh the library before deleting it.' });
    res.json({ deleted: true });
  }));
  router.post('/:id/restore', wrap(async (req, res) => {
    const result = await query(`UPDATE assessment_resource_library SET deleted_at=NULL
      WHERE id=$1 AND deleted_at IS NOT NULL RETURNING id`, [req.params.id]);
    if (!result.rows.length) return res.status(409).json({ error: 'This entry is no longer in the deleted list. Refresh and retry.' });
    res.json({ restored: true });
  }));
  router.get('/:id/evaluations', wrap(async (req, res) => {
    const standards = await query(`SELECT standard->>'number' AS number,standard->>'version' AS version,
      (SELECT COUNT(*) > 1 FROM assessment_resource_library candidate
        WHERE candidate.deleted_at IS NULL AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(candidate.content->'standards') other
          WHERE other->>'number'=standard->>'number' AND other->>'version'=standard->>'version')) AS ambiguous
      FROM assessment_resource_library lib CROSS JOIN LATERAL jsonb_array_elements(lib.content->'standards') standard
      WHERE lib.id=$1::uuid AND lib.deleted_at IS NULL`, [req.params.id]);
    if (!standards.rows.length) return res.status(404).json({ error: 'This library entry is no longer available.' });
    const result = await query(`SELECT r.year,r.content->>'standardNumber' AS standard_number,r.content->>'version' AS standard_version,
      evaluation->>'evaluationName' AS name,evaluation->>'evaluationPosition' AS position,
      evaluation->>'evaluationDate' AS date,evaluation->>'evaluationComments' AS comments,
      CASE WHEN lower(selection->>'resourceId')=lower($1) OR lower(NULLIF(r.content->>'resourceLibraryId',''))=lower($1)
        THEN 'linked' ELSE 'standard' END AS match
      FROM assessment_records r
      CROSS JOIN LATERAL (SELECT NULLIF(r.content->>'internal','')::jsonb AS evaluation,
        NULLIF(r.content->>'resourceLibrary','')::jsonb AS selection) details
      WHERE r.entry_key<>'main' AND r.parent_record IS NULL
        AND (lower(selection->>'resourceId')=lower($1) OR (
          lower(NULLIF(r.content->>'resourceLibraryId',''))=lower($1) AND EXISTS (
            SELECT 1 FROM assessment_resource_library lib,
              jsonb_array_elements(lib.content->'standards') standard
            WHERE lib.id=$1::uuid AND lib.deleted_at IS NULL
              AND standard->>'number'=r.content->>'standardNumber'
              AND standard->>'version'=r.content->>'version'
          )) OR (
          r.owner_id=$2::uuid AND NULLIF(selection->>'resourceId','') IS NULL
          AND NULLIF(r.content->>'resourceLibraryId','') IS NULL
          AND EXISTS (SELECT 1 FROM assessment_resource_library lib,
              jsonb_array_elements(lib.content->'standards') standard
            WHERE lib.id=$1::uuid AND lib.deleted_at IS NULL
              AND standard->>'number'=r.content->>'standardNumber'
              AND standard->>'version'=r.content->>'version')
          AND (SELECT COUNT(*) FROM assessment_resource_library lib
            WHERE lib.deleted_at IS NULL AND EXISTS (
              SELECT 1 FROM jsonb_array_elements(lib.content->'standards') standard
              WHERE standard->>'number'=r.content->>'standardNumber'
                AND standard->>'version'=r.content->>'version'))=1
        ))
        AND (NULLIF(BTRIM(evaluation->>'evaluationName'),'') IS NOT NULL
          OR NULLIF(BTRIM(evaluation->>'evaluationPosition'),'') IS NOT NULL
          OR NULLIF(BTRIM(evaluation->>'evaluationDate'),'') IS NOT NULL
          OR NULLIF(BTRIM(evaluation->>'evaluationComments'),'') IS NOT NULL)
      ORDER BY r.updated_at DESC,r.year DESC,r.entry_key LIMIT 101`, [req.params.id, req.user.id]);
    res.json({ standards: standards.rows, evaluations: result.rows.slice(0, 100).map(row => ({
      year: row.year, standardNumber: row.standard_number, standardVersion: row.standard_version || '', name: row.name || '',
      position: row.position || '', date: row.date || '', comments: row.comments || '', match: row.match
    })), more: result.rows.length > 100 });
  }));
  router.get('/:id/history', wrap(async (req, res) => {
    const result = await query(`SELECT revision,updated_at,content FROM assessment_resource_library_history
      WHERE resource_id=$1 ORDER BY revision DESC LIMIT 50`, [req.params.id]);
    res.json({ revisions: result.rows, notice: 'Showing the latest 50 saved revisions. Earlier revisions remain stored.' });
  }));
  router.get('/:id', wrap(async (req, res) => {
    const result = await query('SELECT id,content,revision,updated_at FROM assessment_resource_library WHERE id=$1 AND deleted_at IS NULL', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'This library entry is no longer available.' });
    res.json(result.rows[0]);
  }));
  router.put('/:id', wrap(async (req, res) => {
    const { content, revision, draftRevision = 0 } = req.body || {};
    if (!Number.isInteger(revision) || revision < 0 || revision > 2147483646) return res.status(400).json({ error: 'Reload the library entry before saving.' });
    if (!Number.isInteger(draftRevision) || draftRevision < 0) return res.status(400).json({ error: 'Reload the draft before saving.' });
    const problem = validate(content);
    if (problem) return res.status(400).json({ error: problem });
    let current;
    if (revision) {
      current = (await query('SELECT id,content,revision,updated_at FROM assessment_resource_library WHERE id=$1 AND deleted_at IS NULL', [req.params.id])).rows[0];
      if (!current || current.revision !== revision) return res.status(409).json({ error: 'Another teacher changed this library entry. Your draft is still on this page; reload the entry before saving again.' });
      if (critiqueBasis(current.content) !== critiqueBasis(content) &&
          content.critiques.some(item => item.outcome === 'Approved' && current.content.critiques.some(old => old.id === item.id && old.outcome === 'Approved'))) {
        return res.status(400).json({ error: 'The edition, standards or assessment links changed. Mark the earlier approved critiques Superseded and add a new critique before reusing approval.' });
      }
    }
    if (content.origin?.type === 'Own') {
      const previous = current?.content.origin;
      const unchanged = previous?.type === 'Own' && previous.authorId === content.origin.authorId && previous.authorName === content.origin.authorName;
      if (!unchanged && (content.origin.authorId !== req.user.id || content.origin.authorName !== (req.user.display_name || '').trim())) {
        return res.status(403).json({ error: 'An Own assessment must be attributed to the signed-in author.' });
      }
    }
    const params = [req.params.id, JSON.stringify(content), req.user.id, revision, draftRevision];
    const result = revision === 0
      ? await query(`WITH guard AS MATERIALIZED (
          SELECT revision FROM assessment_resource_library_drafts WHERE resource_id=$1 AND owner_id=$3 AND revision=$5 FOR UPDATE
        ), saved AS (
          INSERT INTO assessment_resource_library(id,content,created_by,updated_by,revision)
          SELECT $1,$2::jsonb,$3,$3,1 WHERE $4::integer=0 AND ($5=0 OR EXISTS (SELECT 1 FROM guard))
          ON CONFLICT DO NOTHING
          RETURNING id,content,revision,updated_by,updated_at
        ), history AS (
          INSERT INTO assessment_resource_library_history(resource_id,content,revision,updated_by,updated_at)
          SELECT id,content,revision,updated_by,updated_at FROM saved
        ), cleared AS (
          DELETE FROM assessment_resource_library_drafts WHERE resource_id=$1 AND owner_id=$3 AND revision=$5 AND EXISTS (SELECT 1 FROM saved)
        ) SELECT id,revision,updated_at FROM saved`, params)
      : await query(`WITH guard AS MATERIALIZED (
          SELECT revision FROM assessment_resource_library_drafts WHERE resource_id=$1 AND owner_id=$3 AND revision=$5 FOR UPDATE
        ), saved AS (
          UPDATE assessment_resource_library SET content=$2::jsonb,updated_by=$3,
          revision=revision+1,updated_at=NOW() WHERE id=$1 AND revision=$4 AND deleted_at IS NULL
          AND ($5=0 OR EXISTS (SELECT 1 FROM guard))
          RETURNING id,content,revision,updated_by,updated_at
        ), history AS (
          INSERT INTO assessment_resource_library_history(resource_id,content,revision,updated_by,updated_at)
          SELECT id,content,revision,updated_by,updated_at FROM saved
        ), cleared AS (
          DELETE FROM assessment_resource_library_drafts WHERE resource_id=$1 AND owner_id=$3 AND revision=$5 AND EXISTS (SELECT 1 FROM saved)
        ) SELECT id,revision,updated_at FROM saved`, params);
    if (!result.rows.length) return res.status(409).json({ error: 'This library entry changed in another window. Reload before saving; your draft remains on this page.' });
    res.json(result.rows[0]);
  }));
  return router;
}

module.exports = { createResourceLibraryRouter };
