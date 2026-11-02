const crypto = require('crypto');
const express = require('express');
const { query } = require('./db');
const { query: kamarQuery } = require('./legacy/kamar-uploader/db');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KAMAR_ID = /^[A-Za-z0-9-]{1,20}$/;
const CREDIT = /^[A-Za-z0-9][A-Za-z0-9.-]{0,39}$/;
const GITHUB = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const BASE = '/admin/student-builders';
const COLUMNS = `id, full_name, credit_name, kamar_student_id, github_username, first_year, status, projects,
  permission_recorded_at, notes, created_at, updated_at`;

class BuilderError extends Error {}

const text = (value, max = 200) => String(value || '').trim().slice(0, max);

function creditFrom(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  const surname = parts.length > 1 ? parts[parts.length - 1] : '';
  return `${parts[0][0].toUpperCase()}${surname}`.replace(/[^A-Za-z0-9-]/g, '').slice(0, 40);
}

async function kamarRecord(kamarDb, id) {
  if (!id) return null;
  try {
    const row = (await kamarDb(
      `SELECT first_name, last_name, status FROM student_details_upload WHERE id_number = $1
       ORDER BY (status = 'Current') DESC LIMIT 1`, [id]
    )).rows[0];
    return row ? { found: true, name: `${row.first_name || ''} ${row.last_name || ''}`.trim(), status: row.status } : { found: false };
  } catch (error) {
    console.warn('[student-builders] Kamar lookup unavailable:', error.message);
    return { unavailable: true };
  }
}

function readForm(body) {
  return {
    fullName: text(body.fullName, 120),
    creditName: text(body.creditName, 40),
    kamarStudentId: text(body.kamarStudentId, 20),
    githubUsername: text(body.githubUsername, 39),
    firstYear: text(body.firstYear, 4),
    status: body.status === 'left' ? 'left' : 'current',
    projects: text(body.projects, 2000),
    permission: body.permission === 'yes',
    notes: text(body.notes, 2000)
  };
}

function validate(form) {
  if (!form.fullName) throw new BuilderError('Enter the student\'s name.');
  if (!form.creditName) form.creditName = creditFrom(form.fullName);
  if (!CREDIT.test(form.creditName)) throw new BuilderError('Use letters, numbers, dots or hyphens for the credit name, for example JPinkerneil.');
  if (form.kamarStudentId && !KAMAR_ID.test(form.kamarStudentId)) throw new BuilderError('Enter the Kamar student ID number, or leave it blank.');
  if (form.githubUsername && !GITHUB.test(form.githubUsername)) throw new BuilderError('Enter a valid GitHub username, or leave it blank.');
  if (form.firstYear) {
    const year = Number(form.firstYear);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new BuilderError('Enter the year they started building, for example 2025.');
  }
}

const params = (form) => [form.fullName, form.creditName, form.kamarStudentId || null, form.githubUsername || null,
  form.firstYear ? Number(form.firstYear) : null, form.status, form.projects, form.permission, form.notes];

function toForm(row) {
  return {
    fullName: row.full_name, creditName: row.credit_name || '', kamarStudentId: row.kamar_student_id || '',
    githubUsername: row.github_username || '', firstYear: row.first_year ? String(row.first_year) : '', status: row.status,
    projects: row.projects, permission: Boolean(row.permission_recorded_at), notes: row.notes
  };
}

async function listBuilders(dbQuery = query) {
  return (await dbQuery(`SELECT ${COLUMNS} FROM student_builders ORDER BY status, lower(full_name)`)).rows;
}

function createStudentBuildersRouter({ dbQuery = query, kamarDb = kamarQuery } = {}) {
  const router = express.Router();

  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!req.user?.roles?.includes('ADMIN')) {
      return res.status(403).render('error', { title: 'Access denied', message: 'Only administrators can manage student builders.' });
    }
    if (!req.session.studentBuildersCsrf) req.session.studentBuildersCsrf = crypto.randomBytes(32).toString('hex');
    res.locals.csrf = req.session.studentBuildersCsrf;
    if (req.method === 'POST') {
      const supplied = Buffer.from(String(req.body.csrf || ''));
      const expected = Buffer.from(req.session.studentBuildersCsrf);
      if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
        return res.status(403).render('error', { title: 'Form expired', message: 'Reload the Student Builders page and try again.' });
      }
    }
    return next();
  });

  async function load(id) {
    if (!UUID.test(id)) return null;
    return (await dbQuery(`SELECT ${COLUMNS} FROM student_builders WHERE id = $1`, [id])).rows[0] || null;
  }

  async function handovers(id) {
    return (await dbQuery(
      `SELECT id, title, source_repository, finished_at, finish_action FROM student_project_handovers
       WHERE builder_id = $1 ORDER BY created_at DESC`, [id]
    )).rows;
  }

  async function renderPage(req, res, { status = 200, error = null, form = null, editing = null, notice = null } = {}) {
    const builders = await listBuilders(dbQuery);
    return res.status(status).render('admin/student-builders', {
      title: 'Student Builders', builders, error, notice, editing,
      form: form || { status: 'current', permission: false },
      kamar: editing ? await kamarRecord(kamarDb, editing.kamar_student_id) : null,
      linked: editing ? await handovers(editing.id) : []
    });
  }

  router.get('/', async (req, res, next) => {
    try {
      return await renderPage(req, res, { notice: { saved: 'Student builder saved.', deleted: 'Student builder removed.' }[req.query.done] || null });
    } catch (error) { return next(error); }
  });

  router.post('/', async (req, res, next) => {
    const form = readForm(req.body);
    try {
      validate(form);
      await dbQuery(
        `INSERT INTO student_builders (id, full_name, credit_name, kamar_student_id, github_username, first_year, status, projects,
           permission_recorded_at, notes, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CASE WHEN $9::boolean THEN NOW() END, $10, $11, $11)`,
        [crypto.randomUUID(), ...params(form), req.user.id]
      );
      return res.redirect(303, `${BASE}?done=saved`);
    } catch (error) {
      if (!(error instanceof BuilderError)) return next(error);
      try { return await renderPage(req, res, { status: 400, error: error.message, form }); } catch (renderError) { return next(renderError); }
    }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const row = await load(req.params.id);
      if (!row) return res.status(404).render('error', { title: 'Not found', message: 'Student builder not found.' });
      return await renderPage(req, res, { editing: row, form: toForm(row) });
    } catch (error) { return next(error); }
  });

  router.post('/:id', async (req, res, next) => {
    const form = readForm(req.body);
    let row;
    try {
      row = await load(req.params.id);
      if (!row) return res.status(404).render('error', { title: 'Not found', message: 'Student builder not found.' });
      validate(form);
      await dbQuery(
        `UPDATE student_builders SET full_name = $2, credit_name = $3, kamar_student_id = $4, github_username = $5, first_year = $6,
           status = $7, projects = $8,
           permission_recorded_at = CASE WHEN $9::boolean THEN COALESCE(permission_recorded_at, NOW()) END,
           notes = $10, updated_by = $11, updated_at = NOW()
         WHERE id = $1`,
        [row.id, ...params(form), req.user.id]
      );
      return res.redirect(303, `${BASE}?done=saved`);
    } catch (error) {
      if (!(error instanceof BuilderError)) return next(error);
      try { return await renderPage(req, res, { status: 400, error: error.message, form, editing: row }); } catch (renderError) { return next(renderError); }
    }
  });

  router.post('/:id/delete', async (req, res, next) => {
    let row;
    try {
      row = await load(req.params.id);
      if (!row) return res.status(404).render('error', { title: 'Not found', message: 'Student builder not found.' });
      if ((await handovers(row.id)).some((item) => !item.finished_at)) {
        throw new BuilderError('This student has a handover in progress. Finish the handover before removing their details.');
      }
      await dbQuery('DELETE FROM student_builders WHERE id = $1', [row.id]);
      return res.redirect(303, `${BASE}?done=deleted`);
    } catch (error) {
      if (!(error instanceof BuilderError)) return next(error);
      try { return await renderPage(req, res, { status: 409, error: error.message, form: toForm(row), editing: row }); } catch (renderError) { return next(renderError); }
    }
  });

  return router;
}

module.exports = { createStudentBuildersRouter, listBuilders, creditFrom };
