const crypto = require('crypto');
const express = require('express');
const { query } = require('./db');
const { createArchiveService, ArchiveError } = require('./studentAppArchive');
const { createHandoverProviders, HandoverError, parseRepository } = require('./studentHandoverProviders');

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const BASE = '/student-apps/handovers';

const text = (value, max = 200) => String(value || '').trim().slice(0, max);
const userName = (user) => user.display_name || user.email || 'Administrator';

function slugFrom(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
}

function nextStep(item) {
  if (item.finished_at) return 'finished';
  if (!item.labelled_at) return 'label';
  if (!item.school_copy_at) return 'school-copy';
  if (!item.backup_at && !item.backup_skipped_reason) return 'backup';
  if (!item.frozen_at) return 'freeze';
  return 'finish';
}

function createHandoverRouter({
  dbQuery = query,
  providers = createHandoverProviders(),
  archiveService = createArchiveService(),
  today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' })
} = {}) {
  const router = express.Router();

  router.use((req, res, next) => {
    if (!req.user?.roles?.includes('ADMIN')) {
      return res.status(403).render('error', { title: 'Access denied', message: 'Only administrators can hand over student projects.' });
    }
    res.set('Cache-Control', 'no-store');
    if (!req.session.handoverCsrf) req.session.handoverCsrf = crypto.randomBytes(32).toString('hex');
    if (req.method === 'POST') {
      const token = Buffer.from(String(req.body.csrf || ''));
      const expected = Buffer.from(req.session.handoverCsrf);
      if (token.length !== expected.length || !crypto.timingSafeEqual(token, expected)) {
        return res.status(403).render('error', { title: 'Form expired', message: 'Reload the handover page and try again.' });
      }
    }
    return next();
  });

  const event = (req, action, detail = '') => JSON.stringify([{ at: new Date().toISOString(), by: userName(req.user), action, detail }]);

  async function load(id) {
    if (!UUID.test(id)) return null;
    return (await dbQuery('SELECT *, review_on::text AS review_date FROM student_project_handovers WHERE id = $1', [id])).rows[0] || null;
  }

  async function claim(id) {
    const row = (await dbQuery(
      `UPDATE student_project_handovers SET busy_until = NOW() + INTERVAL '10 minutes'
       WHERE id = $1 AND finished_at IS NULL AND (busy_until IS NULL OR busy_until < NOW()) RETURNING *`, [id]
    )).rows[0];
    if (row) return row;
    const existing = await load(id);
    if (!existing) throw new HandoverError('Handover not found.', 404);
    if (existing.finished_at) throw new HandoverError('This handover is already finished.', 409);
    throw new HandoverError('Another step is already running for this handover. Wait a few minutes, then reload.', 409);
  }

  async function release(id) {
    await dbQuery('UPDATE student_project_handovers SET busy_until = NULL WHERE id = $1', [id]);
  }

  async function renderList(req, res, { status = 200, error = null, form = {} } = {}) {
    const handovers = (await dbQuery(
      `SELECT id, slug, title, source_repository, student_name, school_year, review_on::text AS review_date, labelled_at, school_copy_at,
              backup_at, backup_skipped_reason, frozen_at, finished_at, finish_action, created_at
       FROM student_project_handovers ORDER BY finished_at IS NOT NULL, review_on, created_at DESC LIMIT 200`
    )).rows;
    const builders = (await dbQuery(
      `SELECT id, full_name, credit_name, github_username, status FROM student_builders ORDER BY status, lower(full_name)`
    )).rows;
    return res.status(status).render('student-apps/handovers', {
      title: 'Handover student project', handovers, builders, configuration: providers.configuration(), today: today(),
      csrf: req.session.handoverCsrf, error, form, nextStep,
      defaultYear: Number(today().slice(0, 4))
    });
  }

  async function renderOne(req, res, item, { status = 200, error = null, notice = null, backupPreview = null } = {}) {
    let github = null;
    let githubError = null;
    if (!item.finished_at || item.finish_action === 'kept') {
      try { github = await providers.status(item.source_repository); } catch (problem) { githubError = problem.message; }
    }
    return res.status(status).render('student-apps/handover', {
      title: `Handover: ${item.title}`, item, github, githubError, configuration: providers.configuration(),
      archiveReady: archiveService.configuration().ready, today: today(), step: nextStep(item),
      csrf: req.session.handoverCsrf, error, notice, backupPreview, userId: req.user.id
    });
  }

  function handle(action) {
    return async (req, res, next) => {
      let item;
      try {
        item = await load(req.params.id);
        if (!item) return res.status(404).render('error', { title: 'Not found', message: 'Handover not found.' });
        return await action(req, res, item);
      } catch (error) {
        if (!(error instanceof HandoverError) && !(error instanceof ArchiveError)) return next(error);
        console.warn('[student-handovers] step rejected:', error.message);
        try {
          const fresh = (await load(req.params.id)) || item;
          return await renderOne(req, res, fresh, { status: error.status || 400, error: error.message });
        } catch (renderError) {
          return next(renderError);
        }
      }
    };
  }

  router.get('/', async (req, res, next) => {
    try { return await renderList(req, res); } catch (error) { return next(error); }
  });

  router.post('/', async (req, res, next) => {
    const form = {
      repository: text(req.body.repository), title: text(req.body.title, 120), builderId: text(req.body.builderId, 36),
      schoolYear: text(req.body.schoolYear, 4), slug: text(req.body.slug, 60)
    };
    try {
      if (req.body.permission !== 'yes') throw new HandoverError('Confirm the school has permission to keep and maintain a copy of this work.');
      const builder = UUID.test(form.builderId)
        ? (await dbQuery('SELECT id, COALESCE(credit_name, full_name) AS credit_name, github_username FROM student_builders WHERE id = $1', [form.builderId])).rows[0]
        : null;
      if (!builder) throw new HandoverError('Choose the student builder. Add them under Administration > Student Builders first.');
      const year = Number(form.schoolYear);
      if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new HandoverError('Enter the school year the work was made, for example 2026.');
      const repo = parseRepository(form.repository);
      const slug = form.slug || slugFrom(repo.name);
      if (!SLUG.test(slug)) throw new HandoverError('Use lower-case letters, numbers and single hyphens for the short name.');
      const info = await providers.inspect(repo.fullName);
      if (!info.schoolOwned) {
        throw new HandoverError(`${info.fullName} belongs to ${info.owner}. Ask the student to transfer it to ${providers.configuration().owner} in GitHub (Settings > Transfer ownership), accept the transfer, then start the handover.`);
      }
      if (info.archived) throw new HandoverError(`${info.fullName} is already archived. Unarchive it in GitHub first, or record it manually.`);
      const id = crypto.randomUUID();
      const inserted = (await dbQuery(
        `INSERT INTO student_project_handovers
           (id, slug, title, source_repository, source_commit, student_name, student_github, school_year, review_on, created_by, history, builder_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12)
         ON CONFLICT DO NOTHING RETURNING id`,
        [id, slug, form.title || repo.name, info.fullName, info.latestCommit, builder.credit_name, builder.github_username || null,
          year, `${year + 1}-02-01`, req.user.id, event(req, 'Started handover', `Pinned ${info.latestCommit}`), builder.id]
      )).rows[0];
      if (!inserted) throw new HandoverError('That short name is in use, or this repository already has an unfinished handover.', 409);
      return res.redirect(303, `${BASE}/${id}`);
    } catch (error) {
      if (!(error instanceof HandoverError)) return next(error);
      try { return await renderList(req, res, { status: error.status, error: error.message, form }); } catch (renderError) { return next(renderError); }
    }
  });

  router.get('/:id', handle((req, res, item) => renderOne(req, res, item)));

  router.post('/:id/label', handle(async (req, res, item) => {
    if (item.frozen_at) throw new HandoverError('The Student Work is frozen and can no longer be relabelled.', 409);
    await claim(item.id);
    try {
      const makePrivate = req.body.makePrivate === 'yes';
      const result = await providers.label(item.source_repository, { studentName: item.student_name, schoolYear: item.school_year, makePrivate });
      await dbQuery(
        `UPDATE student_project_handovers SET labelled_at = NOW(), made_private = $2, busy_until = NULL,
         history = history || $3::jsonb WHERE id = $1`,
        [item.id, result.private, event(req, 'Labelled Student Work', result.private ? 'Repository is private' : 'Repository visibility unchanged')]
      );
    } finally { await release(item.id); }
    return res.redirect(303, `${BASE}/${item.id}`);
  }));

  router.post('/:id/school-copy', handle(async (req, res, item) => {
    if (!item.labelled_at) throw new HandoverError('Label the Student Work first.', 409);
    if (item.school_copy_at) throw new HandoverError('A school copy is already recorded.', 409);
    if (req.body.mode === 'existing') {
      const location = text(req.body.location, 300);
      if (!/^https:\/\/github\.com\/[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+(?:\/[^\s<>"]*)?$/.test(location)) {
        throw new HandoverError('Enter the GitHub address where the school now maintains this project.');
      }
      if (req.body.creditConfirmed !== 'yes') throw new HandoverError('Confirm the new location credits the student and links to the Student Work.');
      await dbQuery(
        `UPDATE student_project_handovers SET school_copy_kind = 'existing', school_copy_url = $2, school_copy_at = NOW(),
         history = history || $3::jsonb WHERE id = $1 AND school_copy_at IS NULL`,
        [item.id, location, event(req, 'Recorded school location', location)]
      );
      return res.redirect(303, `${BASE}/${item.id}`);
    }
    await claim(item.id);
    try {
      const copy = await providers.schoolCopy(item, text(req.body.name, 100), userName(req.user));
      await dbQuery(
        `UPDATE student_project_handovers SET school_copy_kind = 'repository', school_copy_url = $2, school_copy_commit = $3,
         school_copy_at = NOW(), history = history || $4::jsonb WHERE id = $1`,
        [item.id, copy.url, copy.commit, event(req, 'Created private school copy',
          `${copy.repository}: ${copy.copied} files copied, ${copy.excluded.length} withheld`)]
      );
    } finally { await release(item.id); }
    return res.redirect(303, `${BASE}/${item.id}`);
  }));

  router.post('/:id/backup/preview', handle(async (req, res, item) => {
    if (item.backup_at) throw new HandoverError('The backup is already saved.', 409);
    if (item.frozen_at) throw new HandoverError('The Student Work is frozen; back it up from the GitHub Import page instead.', 409);
    const snapshot = await archiveService.preview(item.source_repository, item.source_commit);
    await dbQuery(
      `UPDATE student_project_handovers SET backup_snapshot = $2::jsonb, backup_preview_by = $3,
       backup_preview_expires_at = NOW() + INTERVAL '1 hour' WHERE id = $1`,
      [item.id, JSON.stringify(snapshot), req.user.id]
    );
    return renderOne(req, res, await load(item.id), { backupPreview: snapshot });
  }));

  router.post('/:id/backup/confirm', handle(async (req, res, item) => {
    if (req.body.confirmReview !== 'yes') throw new HandoverError('Review the files, then confirm the backup acknowledgement.');
    if (item.backup_at) throw new HandoverError('The backup is already saved.', 409);
    if (!item.backup_snapshot || item.backup_preview_by !== req.user.id || new Date(item.backup_preview_expires_at) <= new Date()) {
      throw new HandoverError('This backup preview has expired or belongs to another administrator. Preview the backup again.');
    }
    await claim(item.id);
    try {
      const saved = await archiveService.archive(item.backup_snapshot, item.slug, `handover-${item.id}`);
      await dbQuery(
        `UPDATE student_project_handovers SET backup_url = $2, backup_commit = $3, backup_at = NOW(), backup_skipped_reason = NULL,
         backup_preview_expires_at = NULL, history = history || $4::jsonb WHERE id = $1`,
        [item.id, saved.url, saved.commit, event(req, 'Saved backup to school archive', saved.folder)]
      );
    } finally { await release(item.id); }
    return res.redirect(303, `${BASE}/${item.id}`);
  }));

  router.post('/:id/backup/skip', handle(async (req, res, item) => {
    const reason = text(req.body.reason, 300);
    if (item.backup_at) throw new HandoverError('The backup is already saved.', 409);
    if (reason.length < 5) throw new HandoverError('Give a short reason for skipping the archive backup.');
    await dbQuery(
      `UPDATE student_project_handovers SET backup_skipped_reason = $2, history = history || $3::jsonb WHERE id = $1`,
      [item.id, reason, event(req, 'Skipped archive backup', reason)]
    );
    return res.redirect(303, `${BASE}/${item.id}`);
  }));

  router.post('/:id/freeze', handle(async (req, res, item) => {
    if (item.frozen_at) throw new HandoverError('The Student Work is already frozen.', 409);
    if (!item.school_copy_at) throw new HandoverError('Create or record the school copy before freezing the Student Work.', 409);
    if (!item.backup_at && !item.backup_skipped_reason) throw new HandoverError('Save the backup, or record why it is skipped, before freezing.', 409);
    const live = await providers.liveDeployments(item.source_repository);
    if (live === null && req.body.noLiveSite !== 'yes') {
      throw new HandoverError('Render cannot be checked automatically. Confirm no live Render service still deploys from this repository.');
    }
    if (live?.length) {
      throw new HandoverError(`Render still deploys from this repository: ${live.join(', ')}. Move the live site, suspend the old service, then freeze.`, 409);
    }
    await claim(item.id);
    try {
      await providers.freeze(item.source_repository);
      await dbQuery(
        `UPDATE student_project_handovers SET frozen_at = NOW(), history = history || $2::jsonb WHERE id = $1`,
        [item.id, event(req, 'Froze Student Work (archived read-only)', live === null ? 'Render check confirmed manually' : 'No live Render services found')]
      );
    } finally { await release(item.id); }
    return res.redirect(303, `${BASE}/${item.id}`);
  }));

  router.post('/:id/review-date', handle(async (req, res, item) => {
    const date = text(req.body.reviewOn, 10);
    if (!DATE.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) throw new HandoverError('Enter a valid review date.');
    await dbQuery(
      `UPDATE student_project_handovers SET review_on = $2::date, history = history || $3::jsonb WHERE id = $1`,
      [item.id, date, event(req, 'Changed review date', date)]
    );
    return res.redirect(303, `${BASE}/${item.id}`);
  }));

  router.post('/:id/finish', handle(async (req, res, item) => {
    const action = String(req.body.action || '');
    if (!['transferred', 'deleted', 'kept'].includes(action)) throw new HandoverError('Choose what happened to the Student Work.');
    if (!item.frozen_at) throw new HandoverError('Freeze the Student Work before finishing the handover.', 409);
    if (req.body.confirmFinish !== 'yes') throw new HandoverError('Confirm the final step.');
    await claim(item.id);
    let detail;
    try {
      if (action === 'transferred') {
        const newOwner = text(req.body.newOwner, 39) || item.student_github || '';
        await providers.transfer(item.source_repository, newOwner);
        detail = `Transfer to ${newOwner} requested; the student must accept GitHub's email within one day`;
      } else if (action === 'deleted') {
        const status = await providers.status(item.source_repository);
        if (!status.missing) throw new HandoverError(`${item.source_repository} still exists. Delete it in GitHub (Settings > Delete this repository), then finish.`, 409);
        detail = 'Confirmed deleted in GitHub';
      } else {
        detail = 'Kept as frozen Student Work';
      }
      await dbQuery(
        `UPDATE student_project_handovers SET finished_at = NOW(), finish_action = $2, history = history || $3::jsonb WHERE id = $1`,
        [item.id, action, event(req, 'Finished handover', detail)]
      );
    } finally { await release(item.id); }
    return res.redirect(303, `${BASE}/${item.id}`);
  }));

  return router;
}

module.exports = { createHandoverRouter, nextStep, slugFrom };
