const crypto = require('crypto');
const express = require('express');
const { query } = require('./db');
const { query: kamarQuery } = require('./legacy/kamar-uploader/db');
const { createDtechRecords, creditFromEmail, githubOwner, normaliseRepoUrl, SCHOOL_EMAIL } = require('./dtechRecords');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BASE = '/admin/student-builders';
const COLUMNS = `id, full_name, school_email, credit_name, github_url, first_year, status, projects,
  permission_recorded_at, notes, created_at, updated_at`;

class BuilderError extends Error {}

const text = (value, max = 200) => String(value || '').trim().slice(0, max);

const repoPath = (url) => String(url || '').replace('https://github.com/', '');
const projectLine = (link) => (link.project ? `${link.project} (${repoPath(link.url)})` : repoPath(link.url));

// Ticked DTECH Hub apps plus one optional project typed by hand, one per line.
function readProjects(body) {
  const ticked = [].concat(body.projects || []).map((value) => text(value, 300));
  const lines = [...new Set([...ticked, text(body.projectsOther, 300)].filter(Boolean))];
  return lines.join('\n').slice(0, 2000);
}

// Student names come from the KAMAR student list, matched on school email.
async function studentNames(emails, directoryQuery) {
  const names = new Map();
  if (!emails.length) return names;
  try {
    const { rows } = await directoryQuery(
      `SELECT lower(trim(email_school)) AS email, first_name, last_name, status FROM student_details_upload
       WHERE lower(trim(email_school)) = ANY($1::text[]) ORDER BY (status = 'Current') DESC`, [emails]
    );
    for (const row of rows) {
      const name = [row.first_name, row.last_name].map((part) => String(part || '').trim()).filter(Boolean).join(' ');
      if (name && !names.has(row.email)) names.set(row.email, name);
    }
  } catch (error) {
    console.warn('[student-builders] KAMAR student names unavailable:', error.message);
  }
  return names;
}

function readForm(body) {
  return {
    fullName: text(body.fullName, 120),
    schoolEmail: text(body.schoolEmail, 200).toLowerCase(),
    githubUrl: text(body.githubUrl, 200),
    firstYear: text(body.firstYear, 4),
    status: body.status === 'left' ? 'left' : 'current',
    projects: readProjects(body),
    permission: body.permission === 'yes',
    notes: text(body.notes, 2000)
  };
}

function validate(form) {
  if (!form.fullName) throw new BuilderError('Enter the student\'s name.');
  if (!SCHOOL_EMAIL.test(form.schoolEmail)) {
    throw new BuilderError('Enter the student\'s Westland school email, for example j_pinkerneil@westlandhigh.school.nz.');
  }
  form.creditName = creditFromEmail(form.schoolEmail);
  if (form.githubUrl) {
    const url = normaliseRepoUrl(form.githubUrl);
    if (!url) throw new BuilderError('Enter the shared GitHub link as https://github.com/owner/repository, or leave it blank.');
    form.githubUrl = url;
  }
  if (form.firstYear) {
    const year = Number(form.firstYear);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new BuilderError('Enter the year they started building, for example 2025.');
  }
}

const params = (form) => [form.fullName, form.schoolEmail, form.creditName, form.githubUrl || null,
  form.firstYear ? Number(form.firstYear) : null, form.status, form.projects, form.permission, form.notes];

function toForm(row) {
  return {
    fullName: row.full_name, schoolEmail: row.school_email || '', githubUrl: row.github_url || '',
    firstYear: row.first_year ? String(row.first_year) : '', status: row.status,
    projects: row.projects, permission: Boolean(row.permission_recorded_at), notes: row.notes
  };
}

async function listBuilders(dbQuery = query) {
  return (await dbQuery(`SELECT ${COLUMNS} FROM student_builders ORDER BY status, lower(full_name)`)).rows;
}

function createStudentBuildersRouter({ dbQuery = query, dtech = createDtechRecords(), directoryQuery = kamarQuery } = {}) {
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

  // Fills a blank GitHub link when the DTECH Hub task lists hold exactly one shared repository.
  async function fillGithub(form) {
    if (form.githubUrl) return;
    const hub = await dtech.githubLinks(form.schoolEmail);
    if (hub.links.length === 1) form.githubUrl = hub.links[0].url;
  }

  async function save(action) {
    try { return await action(); } catch (error) {
      if (error?.code === '23505') throw new BuilderError('That school email is already recorded as a student builder.');
      throw error;
    }
  }

  // All DTECH Hub GitHub links as tick-box rows, this student's first, with ticks for projects already chosen.
  async function hubApps(all, builders, form, email) {
    const names = await studentNames([...new Set(all.links.map((link) => link.email))], directoryQuery);
    const recorded = new Map(builders.map((builder) => [String(builder.school_email || '').toLowerCase(), builder.full_name]));
    const chosen = new Set(String(form.projects || '').split('\n').map((line) => line.trim()).filter(Boolean));
    const apps = all.links.map((link) => {
      const line = projectLine(link);
      return { ...link, line, repo: repoPath(link.url), checked: chosen.delete(line),
        name: names.get(link.email) || link.email.split('@')[0], recordedAs: recorded.get(link.email) || '' };
    });
    apps.sort((a, b) => Number(b.email === email) - Number(a.email === email));
    return { apps, otherProjects: [...chosen] };
  }

  async function renderPage(req, res, { status = 200, error = null, form = null, editing = null, notice = null } = {}) {
    const builders = await listBuilders(dbQuery);
    const values = form || { status: 'current', permission: false };
    const email = editing?.school_email || (SCHOOL_EMAIL.test(values.schoolEmail || '') ? values.schoolEmail : '');
    const all = await dtech.allGithubLinks();
    const { apps, otherProjects } = await hubApps(all, builders, values, email);
    return res.status(status).render('admin/student-builders', {
      title: 'Student Builders', builders, error, notice, editing, form: values,
      creditPreview: email ? creditFromEmail(email) : '',
      hub: email ? { ...all, links: all.links.filter((link) => link.email === email) } : null,
      hubApps: apps, hubUnavailable: all.unavailable, hubReason: all.reason || '', otherProjects,
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
      await fillGithub(form);
      await save(() => dbQuery(
        `INSERT INTO student_builders (id, full_name, school_email, credit_name, github_url, first_year, status, projects,
           permission_recorded_at, notes, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CASE WHEN $9::boolean THEN NOW() END, $10, $11, $11)`,
        [crypto.randomUUID(), ...params(form), req.user.id]
      ));
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
      await fillGithub(form);
      await save(() => dbQuery(
        `UPDATE student_builders SET full_name = $2, school_email = $3, credit_name = $4, github_url = $5, first_year = $6,
           status = $7, projects = $8,
           permission_recorded_at = CASE WHEN $9::boolean THEN COALESCE(permission_recorded_at, NOW()) END,
           notes = $10, updated_by = $11, updated_at = NOW()
         WHERE id = $1`,
        [row.id, ...params(form), req.user.id]
      ));
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

module.exports = { createStudentBuildersRouter, listBuilders, creditFromEmail, githubOwner };
