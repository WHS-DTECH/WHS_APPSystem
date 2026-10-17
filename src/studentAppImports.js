const crypto = require('crypto');
const express = require('express');
const { query } = require('./db');
const { createArchiveService, ArchiveError } = require('./studentAppArchive');

function createImportRouter({ dbQuery = query, service = createArchiveService() } = {}) {
  const router = express.Router();
  router.use((req, res, next) => {
    if (!req.user?.roles?.includes('ADMIN')) {
      return res.status(403).render('error', { title: 'Access denied', message: 'Only administrators can archive student projects.' });
    }
    res.set('Cache-Control', 'no-store');
    if (!req.session.githubImportCsrf) req.session.githubImportCsrf = crypto.randomBytes(32).toString('hex');
    if (req.method === 'POST') {
      const token = Buffer.from(String(req.body.csrf || ''));
      const expected = Buffer.from(req.session.githubImportCsrf);
      if (token.length !== expected.length || !crypto.timingSafeEqual(token, expected)) {
        return res.status(403).render('error', { title: 'Form expired', message: 'Reload GitHub Import and try again.' });
      }
    }
    return next();
  });

  async function render(req, res, { status = 200, error = null, preview = null, form = {} } = {}) {
    const apps = (await dbQuery('SELECT id, slug, name FROM student_apps ORDER BY name')).rows;
    const history = (await dbQuery(
      `SELECT imports.id, imports.created_at, imports.status, imports.snapshot->>'repository' AS repository,
              imports.snapshot->>'commit' AS source_commit, imports.archive_url, imports.error_message, apps.name
       FROM student_app_imports imports JOIN student_apps apps ON apps.id = imports.app_id
       ORDER BY imports.created_at DESC LIMIT 30`
    )).rows;
    return res.status(status).render('student-apps/github-import', {
      title: 'GitHub Import', apps, history, configuration: service.configuration(),
      csrf: req.session.githubImportCsrf, error, preview, form
    });
  }

  router.get('/', async (req, res, next) => {
    try {
      return await render(req, res);
    } catch (error) {
      return next(error);
    }
  });

  router.post('/preview', async (req, res, next) => {
    const form = { appId: String(req.body.appId || ''), repository: String(req.body.repository || ''), ref: String(req.body.ref || '').trim() };
    try {
      const app = (await dbQuery('SELECT id, slug, name FROM student_apps WHERE id::text = $1', [form.appId])).rows[0];
      if (!app) throw new ArchiveError('Select a registered student project.');
      if (req.body.reviewConsent !== 'yes') throw new ArchiveError('Confirm you have permission to preserve this project and will review its source.');
      const snapshot = await service.preview(form.repository, form.ref);
      const id = crypto.randomUUID();
      const destination = service.configuration().destination;
      await dbQuery(
        `INSERT INTO student_app_imports (id, app_id, created_by, snapshot, destination_repository)
         VALUES ($1, $2, $3, $4::jsonb, $5)`,
        [id, app.id, req.user.id, JSON.stringify(snapshot), destination]
      );
      return await render(req, res, { form, preview: { id, app, snapshot, destination } });
    } catch (error) {
      if (!(error instanceof ArchiveError)) return next(error);
      console.warn('[student-app-imports] preview rejected:', error.message);
      try {
        return await render(req, res, { status: error.status, error: error.message, form });
      } catch (renderError) {
        return next(renderError);
      }
    }
  });

  router.post('/confirm', async (req, res, next) => {
    let claimed;
    try {
      if (req.body.confirmReview !== 'yes') throw new ArchiveError('Review the source and exclusions, then confirm the handover acknowledgement.');
      const id = String(req.body.importId || '');
      const result = await dbQuery(
        `UPDATE student_app_imports SET status = 'importing'
         WHERE id::text = $1 AND created_by = $2 AND status = 'preview' AND expires_at > NOW()
         RETURNING *`, [id, req.user.id]
      );
      claimed = result.rows[0];
      if (!claimed) throw new ArchiveError('This preview has expired, was already used, or belongs to another administrator. Create a fresh preview.');
      if (claimed.destination_repository !== service.configuration().destination) {
        throw new ArchiveError('The archive destination changed. Create a fresh preview.');
      }
      const app = (await dbQuery('SELECT id, slug, name FROM student_apps WHERE id = $1', [claimed.app_id])).rows[0];
      if (!app) throw new ArchiveError('The registered project no longer exists.');
      const archived = await service.archive(claimed.snapshot, app.slug, claimed.id);
      await dbQuery(
        `UPDATE student_app_imports SET status = 'completed', archive_commit = $2, archive_folder = $3,
         archive_url = $4, completed_at = NOW() WHERE id = $1`,
        [claimed.id, archived.commit, archived.folder, archived.url]
      );
      return res.redirect(303, '/student-apps/github-import');
    } catch (error) {
      console.error('[student-app-imports] confirmation failed:', error instanceof ArchiveError ? error.message : 'Unexpected import or database failure');
      if (claimed) {
        try {
          await dbQuery(
            `UPDATE student_app_imports SET status = 'failed', error_message = $2 WHERE id = $1`,
            [claimed.id, error instanceof ArchiveError ? error.message
              : 'Import interrupted. Check archive Git history for this import ID before retrying; the commit may already have been saved.']
          );
        } catch (recordError) {
          return next(recordError);
        }
      }
      if (!(error instanceof ArchiveError)) return next(error);
      try {
        return await render(req, res, { status: error.status, error: error.message });
      } catch (renderError) {
        return next(renderError);
      }
    }
  });

  return router;
}

module.exports = { createImportRouter };
