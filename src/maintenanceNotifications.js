const crypto = require('crypto');
const express = require('express');
const cron = require('node-cron');
const config = require('./config');
const { query } = require('./db');
const { ensureAuthenticated, ensureRole } = require('./middleware');
const { sendEmail } = require('./email');
const { SYSTEM_MODULES } = require('./hubRoles');

const TIME_ZONE = 'Pacific/Auckland';
const EMAIL_FORMAT = /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/;
const dateTimeFormatter = new Intl.DateTimeFormat('en-NZ', {
  dateStyle: 'full',
  timeStyle: 'short',
  timeZone: TIME_ZONE
});

function validLocalDateTime(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value || '');
  if (!match) return false;
  const [, year, month, day, hour, minute] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day && date.getUTCHours() === hour && date.getUTCMinutes() === minute;
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function formatDate(value) {
  return dateTimeFormatter.format(new Date(value));
}

function noticeEmail(notice, kind, notes = '') {
  const resumed = kind === 'resumed';
  const subject = `[WHS APPSystem] ${notice.module_name} maintenance ${resumed ? 'complete' : 'planned'}`;
  const text = resumed
    ? [
      `${notice.module_name} is available again.`,
      '',
      notes ? `Update: ${notes}` : 'The planned maintenance is complete and the service is available again.',
      '',
      'Thank you for your patience.'
    ].join('\n')
    : [
      `Planned maintenance for ${notice.module_name}`,
      '',
      `When: ${formatDate(notice.scheduled_at)} (New Zealand time)`,
      notice.expected_duration ? `Expected duration: ${notice.expected_duration}` : '',
      `What to expect: ${notice.impact}`,
      notice.details ? `Additional information: ${notice.details}` : '',
      '',
      'A further email will be sent when the service is available again.'
    ].filter(Boolean).join('\n');
  const html = resumed
    ? `<p><strong>${escapeHtml(notice.module_name)} is available again.</strong></p><p>${escapeHtml(notes || 'The planned maintenance is complete and the service is available again.')}</p><p>Thank you for your patience.</p>`
    : `<p><strong>Planned maintenance for ${escapeHtml(notice.module_name)}</strong></p><p><strong>When:</strong> ${escapeHtml(formatDate(notice.scheduled_at))} (New Zealand time)</p>${notice.expected_duration ? `<p><strong>Expected duration:</strong> ${escapeHtml(notice.expected_duration)}</p>` : ''}<p><strong>What to expect:</strong><br>${escapeHtml(notice.impact).replace(/\n/g, '<br>')}</p>${notice.details ? `<p><strong>Additional information:</strong><br>${escapeHtml(notice.details).replace(/\n/g, '<br>')}</p>` : ''}<p>A further email will be sent when the service is available again.</p>`;
  return { subject, text, html };
}

async function loadModules(dbQuery = query) {
  const result = await dbQuery(
    `SELECT roles.hub_key,
            COALESCE(
              (SELECT display_name FROM modules WHERE module_key=roles.hub_key LIMIT 1),
              (SELECT name FROM student_apps WHERE hub_key=roles.hub_key LIMIT 1),
              (SELECT name FROM module_builder_projects WHERE slug=roles.hub_key LIMIT 1),
              roles.hub_key
            ) AS label
     FROM hub_roles roles
     WHERE roles.hub_key <> ALL($1::text[])
     GROUP BY roles.hub_key
     ORDER BY label`,
    [SYSTEM_MODULES]
  );
  return result.rows;
}

async function loadRecipients(moduleKey, dbQuery = query) {
  const result = await dbQuery(
    `SELECT DISTINCT LOWER(TRIM(users.email)) AS email, users.display_name
     FROM users
     WHERE users.is_active = true
       AND LOWER(TRIM(users.email)) ~ '^[^[:space:]<>@,;]+@[^[:space:]<>@,;]+\\.[^[:space:]<>@,;]+$'
       AND (
         EXISTS (
           SELECT 1
           FROM staff_upload staff
           JOIN user_hub_roles assignments ON assignments.user_id = users.id
           JOIN hub_roles assigned_role ON assigned_role.id = assignments.hub_role_id
           WHERE LOWER(TRIM(staff.email_school)) = LOWER(TRIM(users.email))
             AND staff.status = 'Current'
             AND assigned_role.hub_key = $1
         )
         OR EXISTS (
           SELECT 1
           FROM user_roles assignments
           JOIN roles assigned_role ON assigned_role.id = assignments.role_id
           WHERE assignments.user_id = users.id AND assigned_role.name = 'ADMIN'
         )
       )
     ORDER BY email`,
    [moduleKey]
  );
  return result.rows.filter(person => EMAIL_FORMAT.test(person.email));
}

function createMaintenanceRouter({
  dbQuery = query,
  mail = sendEmail,
  initDirectory = () => require('./legacy/kamar-uploader/store').init()
} = {}) {
  const router = express.Router();
  router.use(ensureAuthenticated, ensureRole('ADMIN'));
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!req.session.maintenanceCsrf) req.session.maintenanceCsrf = crypto.randomBytes(32).toString('hex');
    if (req.method !== 'GET') {
      const supplied = Buffer.from(typeof req.body.csrf === 'string' ? req.body.csrf : '');
      const expected = Buffer.from(req.session.maintenanceCsrf);
      if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
        console.warn('[maintenance] Form token rejected.');
        return res.status(403).render('error', {
          title: 'Form expired',
          message: 'Reload Maintenance Notifications and try again. No changes were made.'
        });
      }
    }
    next();
  });

  router.get('/', async (req, res, next) => {
    try {
      const modules = await loadModules(dbQuery);
      const moduleKey = typeof req.query.module === 'string' && modules.some(module => module.hub_key === req.query.module)
        ? req.query.module : '';
      const [notices, recipients] = await Promise.all([
        dbQuery(
          `SELECT * FROM maintenance_notices
           ORDER BY CASE status WHEN 'scheduled' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
                    scheduled_at DESC LIMIT 100`
        ),
        moduleKey
          ? initDirectory().then(() => loadRecipients(moduleKey, dbQuery))
          : Promise.resolve([])
      ]);
      res.render('admin/maintenance-notifications', {
        csrf: req.session.maintenanceCsrf,
        formatDate,
        message: req.query.message === 'created' ? 'Maintenance notice scheduled.' : '',
        moduleKey,
        modules,
        notices: notices.rows,
        recipients,
        title: 'Maintenance Notifications'
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/', async (req, res, next) => {
    const moduleKey = typeof req.body.moduleKey === 'string' ? req.body.moduleKey : '';
    const scheduledAt = typeof req.body.scheduledAt === 'string' ? req.body.scheduledAt : '';
    const expectedDuration = typeof req.body.expectedDuration === 'string' ? req.body.expectedDuration.trim() : '';
    const impact = typeof req.body.impact === 'string' ? req.body.impact.trim() : '';
    const details = typeof req.body.details === 'string' ? req.body.details.trim() : '';
    if (!validLocalDateTime(scheduledAt) || expectedDuration.length > 120 ||
        !impact || impact.length > 2000 || details.length > 3000) {
      return res.status(400).render('error', {
        title: 'Maintenance notice not saved',
        message: 'Choose a valid future New Zealand date and time, provide a short impact description, and keep all fields within their limits.'
      });
    }
    try {
      const modules = await loadModules(dbQuery);
      const selected = modules.find(module => module.hub_key === moduleKey);
      if (!selected) {
        return res.status(400).render('error', {
          title: 'Maintenance notice not saved',
          message: 'Choose an app that is registered for staff roles.'
        });
      }
      await initDirectory();
      const recipients = await loadRecipients(moduleKey, dbQuery);
      if (!recipients.length) {
        return res.status(409).render('error', {
          title: 'Maintenance notice not saved',
          message: 'No eligible staff or active administrators were found for this app.'
        });
      }
      const saved = await dbQuery(
        `INSERT INTO maintenance_notices
           (module_key, module_name, scheduled_at, expected_duration, impact, details, created_by)
         SELECT $1, $2, ($3::timestamp AT TIME ZONE 'Pacific/Auckland'), $4, $5, $6, $7
         WHERE ($3::timestamp AT TIME ZONE 'Pacific/Auckland') > NOW()
         RETURNING id`,
        [moduleKey, selected.label, scheduledAt, expectedDuration, impact, details, req.user.id]
      );
      if (!saved.rowCount) {
        return res.status(400).render('error', {
          title: 'Maintenance notice not saved',
          message: 'The maintenance date must be in the future. Reload the page and choose a later time.'
        });
      }
      res.redirect('/admin/maintenance-notifications?message=created');
    } catch (error) {
      next(error);
    }
  });

  router.post('/:id/test', async (req, res, next) => {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.sendStatus(404);
    try {
      const notice = (await dbQuery('SELECT * FROM maintenance_notices WHERE id=$1', [req.params.id])).rows[0];
      if (!notice) return res.sendStatus(404);
      const content = noticeEmail(notice, 'planned');
      const result = await mail({
        to: [req.user.email],
        subject: `[TEST] ${content.subject}`,
        text: content.text,
        html: content.html
      });
      if (!result.ok) {
        return res.status(502).render('error', {
          title: 'Test email not sent',
          message: result.message || result.error || 'The email service could not send the test message.'
        });
      }
      res.redirect('/admin/maintenance-notifications?message=test-sent');
    } catch (error) {
      next(error);
    }
  });

  router.post('/:id/cancel', async (req, res, next) => {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.sendStatus(404);
    try {
      const cancelled = await dbQuery(
        `UPDATE maintenance_notices SET status='cancelled'
         WHERE id=$1 AND status='scheduled' RETURNING id`,
        [req.params.id]
      );
      if (!cancelled.rowCount) {
        return res.status(409).render('error', {
          title: 'Notice not cancelled',
          message: 'This notice has already started, finished or been cancelled.'
        });
      }
      res.redirect('/admin/maintenance-notifications');
    } catch (error) {
      next(error);
    }
  });

  router.post('/:id/resume', async (req, res, next) => {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.sendStatus(404);
    const notes = typeof req.body.notes === 'string' ? req.body.notes.trim() : '';
    if (notes.length > 3000) {
      return res.status(400).render('error', {
        title: 'Resumption email not sent',
        message: 'Keep the resumption update under 3,000 characters.'
      });
    }
    try {
      const claimed = await dbQuery(
        `UPDATE maintenance_notices SET status='resuming', resumption_notes=$2, resumption_error=NULL
         WHERE id=$1 AND status IN ('scheduled','in_progress','resumption_failed')
         RETURNING *`,
        [req.params.id, notes]
      );
      const notice = claimed.rows[0];
      if (!notice) {
        return res.status(409).render('error', {
          title: 'Resumption email not sent',
          message: 'This notice is already completed, cancelled, or has an email delivery in progress.'
        });
      }
      await initDirectory();
      const recipients = await loadRecipients(notice.module_key, dbQuery);
      if (!recipients.length) {
        await dbQuery(
          `UPDATE maintenance_notices SET status='resumption_failed',
             resumption_error='No eligible staff or active administrators were found.'
           WHERE id=$1 AND status='resuming'`,
          [notice.id]
        );
        return res.status(409).render('error', {
          title: 'Resumption email not sent',
          message: 'No eligible staff or active administrators were found for this app.'
        });
      }
      const content = noticeEmail(notice, 'resumed', notes);
      const result = await mail({
        to: [config.email.gmail.senderEmail],
        bcc: recipients.map(person => person.email),
        subject: content.subject,
        text: content.text,
        html: content.html
      });
      if (!result.ok) {
        const error = result.message || result.error || 'The email service could not send the resumption message.';
        await dbQuery(
          `UPDATE maintenance_notices SET status='resumption_failed', resumption_error=$2
           WHERE id=$1 AND status='resuming'`,
          [notice.id, error]
        );
        return res.status(502).render('error', { title: 'Resumption email not sent', message: error });
      }
      await dbQuery(
        `UPDATE maintenance_notices SET status='resumed', resumed_at=NOW(), resumption_error=NULL
         WHERE id=$1 AND status='resuming'`,
        [notice.id]
      );
      res.redirect('/admin/maintenance-notifications');
    } catch (error) {
      next(error);
    }
  });

  router.post('/:id/recover-resumption', async (req, res, next) => {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.sendStatus(404);
    const delivery = req.body.delivery;
    if (!['sent', 'not-sent'].includes(delivery)) {
      return res.status(400).render('error', {
        title: 'Resumption status not updated',
        message: 'Check Email Service and confirm whether the resumption email was sent.'
      });
    }
    try {
      const result = delivery === 'sent'
        ? await dbQuery(
          `UPDATE maintenance_notices
           SET status='resumed', resumed_at=COALESCE(resumed_at,NOW()), resumption_error=NULL
           WHERE id=$1 AND status='resuming' RETURNING id`,
          [req.params.id]
        )
        : await dbQuery(
          `UPDATE maintenance_notices
           SET status='resumption_failed',
               resumption_error='Administrator reviewed Email Service and confirmed no successful delivery.'
           WHERE id=$1 AND status='resuming' RETURNING id`,
          [req.params.id]
        );
      if (!result.rowCount) {
        return res.status(409).render('error', {
          title: 'Resumption status not updated',
          message: 'This notice is no longer waiting for a delivery review.'
        });
      }
      res.redirect('/admin/maintenance-notifications');
    } catch (error) {
      next(error);
    }
  });

  return router;
}

async function sendDueWarnings(dbQuery = query, mail = sendEmail) {
  await dbQuery(
    `UPDATE maintenance_notices SET status='in_progress'
     WHERE status='scheduled' AND scheduled_at <= NOW()`
  );
  const claimed = await dbQuery(
    `UPDATE maintenance_notices SET warning_attempted_at=NOW(), warning_error=NULL
     WHERE id IN (
       SELECT id FROM maintenance_notices
       WHERE status='scheduled' AND scheduled_at > NOW()
         AND scheduled_at <= (((NOW() AT TIME ZONE 'Pacific/Auckland') + INTERVAL '14 days')
           AT TIME ZONE 'Pacific/Auckland')
         AND warning_sent_at IS NULL
         AND (warning_attempted_at IS NULL OR warning_attempted_at < NOW() - INTERVAL '1 hour')
       ORDER BY scheduled_at
       LIMIT 10
       FOR UPDATE SKIP LOCKED
     )
     RETURNING *`
  );
  for (const notice of claimed.rows) {
    try {
      const recipients = await loadRecipients(notice.module_key, dbQuery);
      if (!recipients.length) throw new Error('No eligible staff or active administrators were found.');
      const content = noticeEmail(notice, 'planned');
      const result = await mail({
        to: [config.email.gmail.senderEmail],
        bcc: recipients.map(person => person.email),
        subject: content.subject,
        text: content.text,
        html: content.html
      });
      if (!result.ok) throw new Error(result.message || result.error || 'The email service could not send the warning.');
      await dbQuery(
        `UPDATE maintenance_notices SET warning_sent_at=NOW(), warning_error=NULL
         WHERE id=$1 AND warning_sent_at IS NULL`,
        [notice.id]
      );
    } catch (error) {
      console.error(`[maintenance] Warning delivery failed for notice ${notice.id}:`, error);
      await dbQuery(
        `UPDATE maintenance_notices SET warning_error=$2
         WHERE id=$1 AND warning_sent_at IS NULL`,
        [notice.id, error.message || 'Unknown email delivery error']
      );
    }
  }
}

function startMaintenanceScheduler() {
  const run = async () => {
    try {
      await require('./legacy/kamar-uploader/store').init();
      await sendDueWarnings();
    } catch (error) {
      console.error('[maintenance] Scheduler run failed:', error);
    }
  };
  run();
  return cron.schedule('* * * * *', run, { timezone: TIME_ZONE });
}

module.exports = {
  createMaintenanceRouter,
  formatDate,
  loadModules,
  loadRecipients,
  noticeEmail,
  sendDueWarnings,
  startMaintenanceScheduler,
  validLocalDateTime
};
