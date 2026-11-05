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

function moduleSelection(value) {
  const values = Array.isArray(value) ? value : value === undefined ? [] : [value];
  if (values.some(key => typeof key !== 'string' || !key || key.length > 100)) return [];
  return [...new Set(values)];
}

function noticeEmail(notice, kind, notes = '') {
  const resumed = kind === 'resumed';
  const appNames = notice.module_name || 'Selected apps';
  const source = resumed ? 'Maintenance Completed' : 'Maintenance Req';
  const subject = resumed
    ? `[${source}] [WHS APPSystem] Maintenance work completed: ${appNames}`
    : `[${source}] [WHS APPSystem] ${notice.module_name} maintenance planned`;
  const launchpadUrl = new URL('/launchpad', config.appBaseUrl).href;
  const completionUpdate = String(notes || '').trim();
  const text = resumed
    ? [
      'The maintenance work is complete and the following app(s) are available again:',
      appNames,
      '',
      ...(completionUpdate ? [completionUpdate, ''] : []),
      `Please access the app(s) covered by this notice from the WHS Launchpad: ${launchpadUrl}`,
      'If asked, sign in with your school Google account. If the app is missing or will not open, use Report a fault on the Launchpad.',
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
    ? `<p><strong>The maintenance work is complete and the following app(s) are available again:</strong></p><p>${escapeHtml(appNames)}</p>${completionUpdate ? `<p>${escapeHtml(completionUpdate).replace(/\n/g, '<br>')}</p>` : ''}<p>Please access the app(s) covered by this notice from the <a href="${escapeHtml(launchpadUrl)}">WHS Launchpad</a>.</p><p>If asked, sign in with your school Google account. If the app is missing or will not open, use Report a fault on the Launchpad.</p><p>Thank you for your patience.</p>`
    : `<p><strong>Planned maintenance for ${escapeHtml(notice.module_name)}</strong></p><p><strong>When:</strong> ${escapeHtml(formatDate(notice.scheduled_at))} (New Zealand time)</p>${notice.expected_duration ? `<p><strong>Expected duration:</strong> ${escapeHtml(notice.expected_duration)}</p>` : ''}<p><strong>What to expect:</strong><br>${escapeHtml(notice.impact).replace(/\n/g, '<br>')}</p>${notice.details ? `<p><strong>Additional information:</strong><br>${escapeHtml(notice.details).replace(/\n/g, '<br>')}</p>` : ''}<p>A further email will be sent when the service is available again.</p>`;
  return { subject, text, html };
}

function emailTestSubject(content) {
  const match = /^\[([^\]]+)\]\s*/.exec(content.subject);
  return match ? `[${match[1]}] [TEST] ${content.subject.slice(match[0].length)}` : `[TEST] ${content.subject}`;
}

const TEMPLATE_VERSIONS = { completed: 3 };

function contentHash(kind, moduleKeys, payload) {
  const templateVersion = TEMPLATE_VERSIONS[kind];
  return crypto.createHash('sha256')
    .update(JSON.stringify({ kind, moduleKeys: [...moduleKeys].sort(), payload, ...(templateVersion ? { templateVersion } : {}) }))
    .digest('hex');
}

function draftEmail(draft) {
  return draft.kind === 'completed'
    ? noticeEmail({ module_name: draft.module_name }, 'resumed', draft.payload.notes)
    : noticeEmail({
      module_name: draft.module_name,
      scheduled_at: draft.payload.scheduledTimestamp,
      expected_duration: draft.payload.expectedDuration,
      impact: draft.payload.impact,
      details: draft.payload.details
    }, 'planned');
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

async function loadRecipients(moduleKeys, dbQuery = query) {
  const keys = moduleSelection(moduleKeys);
  if (!keys.length) throw new Error('Select at least one module before loading recipients.');
  const result = await dbQuery(
    `SELECT DISTINCT LOWER(TRIM(users.email)) AS email, users.display_name
     FROM users
     WHERE users.is_active = true
       AND LOWER(TRIM(users.email)) ~ '^[^[:space:]<>@,;]+@[^[:space:]<>@,;]+\\.[^[:space:]<>@,;]+$'
       AND (
         EXISTS (
           SELECT 1
           FROM user_hub_roles assignments
           JOIN hub_roles assigned_role ON assigned_role.id = assignments.hub_role_id
           WHERE assignments.user_id = users.id
             AND assigned_role.hub_key = ANY($1::text[])
         )
         OR EXISTS (
           SELECT 1
           FROM user_roles assignments
           JOIN roles assigned_role ON assigned_role.id = assignments.role_id
           WHERE assignments.user_id = users.id AND assigned_role.name = 'ADMIN'
         )
       )
     ORDER BY email`,
    [keys]
  );
  const recipients = new Map();
  for (const person of result.rows) {
    const email = person.email.trim().toLowerCase();
    if (EMAIL_FORMAT.test(email) && !recipients.has(email)) recipients.set(email, { ...person, email });
  }
  return [...recipients.values()];
}

function createMaintenanceRouter({
  dbQuery = query,
  mail = sendEmail
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
      const requestKeys = moduleSelection(req.query.requestModule ?? req.query.module);
      const completedKeys = moduleSelection(req.query.completedModule);
      if ([requestKeys, completedKeys].some((keys, index) => {
        const parameter = index ? req.query.completedModule : req.query.requestModule ?? req.query.module;
        return (parameter !== undefined && !keys.length) ||
          keys.some(key => !modules.some(module => module.hub_key === key));
      })) {
        return res.status(400).render('error', {
          title: 'Invalid module selection',
          message: 'Choose one or more modules registered for staff roles.'
        });
      }
      const requestDraftId = typeof req.query.requestDraft === 'string' ? req.query.requestDraft : '';
      const completedDraftId = typeof req.query.completedDraft === 'string' ? req.query.completedDraft : '';
      const [notices, requestRecipients, completedRecipients, requestLog, completedLog, requestDraft, completedDraft] = await Promise.all([
        dbQuery(
          `SELECT * FROM maintenance_notices
           ORDER BY CASE status WHEN 'scheduled' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
                    scheduled_at DESC LIMIT 100`
        ),
        requestKeys.length ? loadRecipients(requestKeys, dbQuery) : Promise.resolve([]),
        completedKeys.length ? loadRecipients(completedKeys, dbQuery) : Promise.resolve([]),
        dbQuery(
          `SELECT id,sent_at,status,to_addresses,bcc_addresses,subject,error FROM email_log
           WHERE source=$1 OR subject ILIKE $2
           ORDER BY sent_at DESC,id DESC LIMIT 100`,
          ['Maintenance Req', '%maintenance planned%']
        ),
        dbQuery(
          `SELECT id,sent_at,status,to_addresses,bcc_addresses,subject,error FROM email_log
           WHERE source=$1 OR subject ILIKE $2
           ORDER BY sent_at DESC,id DESC LIMIT 100`,
          ['Maintenance Completed', '%maintenance complete%']
        ),
        requestDraftId && /^[0-9a-f-]{36}$/i.test(requestDraftId)
          ? dbQuery('SELECT * FROM maintenance_email_drafts WHERE id=$1 AND created_by=$2 AND kind=$3', [requestDraftId, req.user.id, 'request']).then(result => result.rows[0] || null)
          : Promise.resolve(null),
        completedDraftId && /^[0-9a-f-]{36}$/i.test(completedDraftId)
          ? dbQuery('SELECT * FROM maintenance_email_drafts WHERE id=$1 AND created_by=$2 AND kind=$3', [completedDraftId, req.user.id, 'completed']).then(result => result.rows[0] || null)
          : Promise.resolve(null)
      ]);
      res.render('admin/maintenance-notifications', {
        csrf: req.session.maintenanceCsrf,
        formatDate,
        message: typeof req.query.message === 'string' ? req.query.message : '',
        activeTab: req.query.tab === 'completed' ? 'completed' : 'request',
        requestKeys,
        completedKeys,
        modules,
        notices: notices.rows,
        requestRecipients,
        completedRecipients,
        requestLog: requestLog.rows,
        completedLog: completedLog.rows,
        requestDraft,
        completedDraft,
        title: 'Maintenance Notifications'
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/test-request', async (req, res, next) => {
    const moduleKeys = moduleSelection(req.body.moduleKey);
    const scheduledAt = typeof req.body.scheduledAt === 'string' ? req.body.scheduledAt : '';
    const expectedDuration = typeof req.body.expectedDuration === 'string' ? req.body.expectedDuration.trim() : '';
    const impact = typeof req.body.impact === 'string' ? req.body.impact.trim() : '';
    const details = typeof req.body.details === 'string' ? req.body.details.trim() : '';
    if (!validLocalDateTime(scheduledAt) || expectedDuration.length > 120 ||
        !impact || impact.length > 2000 || details.length > 3000) {
      return res.status(400).render('error', {
        title: 'Maintenance test email not sent',
        message: 'Choose a valid future New Zealand date and time, provide a short impact description, and keep all fields within their limits.'
      });
    }
    if (!EMAIL_FORMAT.test(req.user.email || '')) {
      return res.status(409).render('error', {
        title: 'Maintenance test email not sent',
        message: 'Your signed-in email address is missing or invalid. Sign in again.'
      });
    }
    try {
      const modules = await loadModules(dbQuery);
      const selected = moduleKeys.map(key => modules.find(module => module.hub_key === key));
      if (!selected.length || selected.some(module => !module)) {
        return res.status(400).render('error', {
          title: 'Maintenance test email not sent',
          message: 'Choose one or more modules registered for staff roles.'
        });
      }
      const recipients = await loadRecipients(moduleKeys, dbQuery);
      if (!recipients.length) {
        return res.status(409).render('error', {
          title: 'Maintenance test email not sent',
          message: 'No eligible users or active Global ADMINs were found for the selected apps.'
        });
      }
      const date = await dbQuery(
        `SELECT ($1::timestamp AT TIME ZONE 'Pacific/Auckland') AS scheduled_at,
                ($1::timestamp AT TIME ZONE 'Pacific/Auckland') > NOW() AS is_future`,
        [scheduledAt]
      );
      if (!date.rows[0]?.is_future) {
        return res.status(400).render('error', {
          title: 'Maintenance test email not sent',
          message: 'The maintenance date must be in the future. Reload the page and choose a later time.'
        });
      }
      const moduleName = selected.map(module => module.label).join(', ');
      const payload = {
        scheduledAt,
        scheduledTimestamp: date.rows[0].scheduled_at,
        expectedDuration,
        impact,
        details
      };
      const hash = contentHash('request', moduleKeys, payload);
      const draft = await dbQuery(
        `INSERT INTO maintenance_email_drafts
           (kind,module_keys,module_name,payload,content_hash,status,created_by)
         VALUES ('request',$1,$2,$3::jsonb,$4,'test_pending',$5) RETURNING id`,
        [moduleKeys, moduleName, JSON.stringify(payload), hash, req.user.id]
      );
      const content = draftEmail({ kind: 'request', module_name: moduleName, payload });
      const result = await mail({
        to: [req.user.email],
        subject: emailTestSubject(content),
        text: content.text,
        html: content.html
      });
      const status = result.ok ? 'tested' : 'test_failed';
      await dbQuery(
        `UPDATE maintenance_email_drafts SET status=$2,test_sent_at=CASE WHEN $2='tested' THEN NOW() ELSE NULL END,
           error=$3,updated_at=NOW() WHERE id=$1`,
        [draft.rows[0].id, status, result.ok ? null : result.message || result.error || 'The test email could not be sent.']
      );
      const selection = moduleKeys.map(key => `requestModule=${encodeURIComponent(key)}`).join('&');
      res.redirect(`/admin/maintenance-notifications?tab=request&requestDraft=${draft.rows[0].id}&${selection}&message=${result.ok ? 'request-test-sent' : 'request-test-failed'}`);
    } catch (error) {
      next(error);
    }
  });

  router.post('/schedule/:id', async (req, res, next) => {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.sendStatus(404);
    try {
      const claimed = await dbQuery(
        `UPDATE maintenance_email_drafts SET status='scheduling',error=NULL,updated_at=NOW()
         WHERE id=$1 AND kind='request' AND created_by=$2 AND status='tested'
           AND test_sent_at IS NOT NULL RETURNING *`,
        [req.params.id, req.user.id]
      );
      const draft = claimed.rows[0];
      if (!draft) {
        return res.status(409).render('error', {
          title: 'Maintenance request not scheduled',
          message: 'A successful test email is required. Send or resend the test email before scheduling this request.'
        });
      }
      if (contentHash('request', draft.module_keys, draft.payload) !== draft.content_hash) {
        await dbQuery(`UPDATE maintenance_email_drafts SET status='test_failed',error=$2,updated_at=NOW() WHERE id=$1`,
          [draft.id, 'The tested request content changed. Send a new test email.']);
        return res.status(409).render('error', {
          title: 'Maintenance request not scheduled',
          message: 'The tested request content changed. Send a new test email before scheduling.'
        });
      }
      try {
        const saved = await dbQuery(
          `INSERT INTO maintenance_notices
             (module_key,module_name,scheduled_at,expected_duration,impact,details,created_by,module_keys,
              warning_test_draft_id,warning_tested_at)
           SELECT $1,$2,($3::timestamp AT TIME ZONE 'Pacific/Auckland'),$4,$5,$6,$7,$8::text[],$9,$10
           WHERE ($3::timestamp AT TIME ZONE 'Pacific/Auckland') > NOW()
           RETURNING id`,
          [draft.module_keys[0], draft.module_name, draft.payload.scheduledAt,
            draft.payload.expectedDuration, draft.payload.impact, draft.payload.details,
            req.user.id, draft.module_keys, draft.id, draft.test_sent_at]
        );
        if (!saved.rowCount) {
          await dbQuery(`UPDATE maintenance_email_drafts SET status='tested',updated_at=NOW() WHERE id=$1`, [draft.id]);
          return res.status(400).render('error', {
            title: 'Maintenance request not scheduled',
            message: 'The maintenance date must still be in the future. Start a new request and test its email.'
          });
        }
        await dbQuery(`UPDATE maintenance_email_drafts SET status='scheduled',scheduled_at=NOW(),updated_at=NOW() WHERE id=$1`, [draft.id]);
      } catch (error) {
        const existing = await dbQuery(
          'SELECT id FROM maintenance_notices WHERE warning_test_draft_id=$1',
          [draft.id]
        );
        if (existing.rowCount) {
          await dbQuery(
            `UPDATE maintenance_email_drafts SET status='scheduled',scheduled_at=COALESCE(scheduled_at,NOW()),updated_at=NOW()
             WHERE id=$1`,
            [draft.id]
          );
          return res.redirect('/admin/maintenance-notifications?tab=request&message=created');
        }
        await dbQuery(`UPDATE maintenance_email_drafts SET status='tested',updated_at=NOW() WHERE id=$1 AND status='scheduling'`, [draft.id]);
        throw error;
      }
      res.redirect('/admin/maintenance-notifications?tab=request&message=created');
    } catch (error) {
      next(error);
    }
  });

  router.post('/test-completed', async (req, res, next) => {
    const moduleKeys = moduleSelection(req.body.moduleKey);
    const notes = typeof req.body.notes === 'string' ? req.body.notes.trim() : '';
    if (notes.length > 3000) {
      return res.status(400).render('error', {
        title: 'Completion test email not sent',
        message: 'Keep the completion update under 3,000 characters.'
      });
    }
    if (!EMAIL_FORMAT.test(req.user.email || '')) {
      return res.status(409).render('error', {
        title: 'Completion test email not sent',
        message: 'Your signed-in email address is missing or invalid. Sign in again.'
      });
    }
    try {
      const modules = await loadModules(dbQuery);
      const selected = moduleKeys.map(key => modules.find(module => module.hub_key === key));
      if (!selected.length || selected.some(module => !module)) {
        return res.status(400).render('error', {
          title: 'Completion test email not sent',
          message: 'Choose one or more modules registered for staff roles.'
        });
      }
      const recipients = await loadRecipients(moduleKeys, dbQuery);
      if (!recipients.length) {
        return res.status(409).render('error', {
          title: 'Completion test email not sent',
          message: 'No eligible users or active Global ADMINs were found for the selected apps.'
        });
      }
      const moduleName = selected.map(module => module.label).join(', ');
      const payload = { notes };
      const hash = contentHash('completed', moduleKeys, payload);
      const draft = await dbQuery(
        `INSERT INTO maintenance_email_drafts
           (kind,module_keys,module_name,payload,content_hash,status,created_by)
         VALUES ('completed',$1,$2,$3::jsonb,$4,'test_pending',$5) RETURNING id`,
        [moduleKeys, moduleName, JSON.stringify(payload), hash, req.user.id]
      );
      const content = draftEmail({ kind: 'completed', module_name: moduleName, payload });
      const result = await mail({
        to: [req.user.email],
        subject: emailTestSubject(content),
        text: content.text,
        html: content.html
      });
      const status = result.ok ? 'tested' : 'test_failed';
      await dbQuery(
        `UPDATE maintenance_email_drafts SET status=$2,test_sent_at=CASE WHEN $2='tested' THEN NOW() ELSE NULL END,
           error=$3,updated_at=NOW() WHERE id=$1`,
        [draft.rows[0].id, status, result.ok ? null : result.message || result.error || 'The test email could not be sent.']
      );
      const selection = moduleKeys.map(key => `completedModule=${encodeURIComponent(key)}`).join('&');
      res.redirect(`/admin/maintenance-notifications?tab=completed&completedDraft=${draft.rows[0].id}&${selection}&message=${result.ok ? 'completed-test-sent' : 'completed-test-failed'}`);
    } catch (error) {
      next(error);
    }
  });

  router.post('/send-completed/:id', async (req, res, next) => {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.sendStatus(404);
    try {
      const claimed = await dbQuery(
        `UPDATE maintenance_email_drafts SET status='sending',error=NULL,updated_at=NOW()
         WHERE id=$1 AND kind='completed' AND created_by=$2 AND status='tested'
           AND test_sent_at IS NOT NULL RETURNING *`,
        [req.params.id, req.user.id]
      );
      const draft = claimed.rows[0];
      if (!draft) {
        return res.status(409).render('error', {
          title: 'Completion notification not sent',
          message: 'A successful test email is required. Send or resend the test email before emailing the selected app users.'
        });
      }
      if (contentHash('completed', draft.module_keys, draft.payload) !== draft.content_hash) {
        await dbQuery(`UPDATE maintenance_email_drafts SET status='test_failed',error=$2,updated_at=NOW() WHERE id=$1`,
          [draft.id, 'The tested completion message changed. Send a new test email.']);
        return res.status(409).render('error', {
          title: 'Completion notification not sent',
          message: 'The tested completion message changed. Send a new test email before notifying staff.'
        });
      }
      try {
        const recipients = await loadRecipients(draft.module_keys, dbQuery);
        if (!recipients.length) {
          await dbQuery(`UPDATE maintenance_email_drafts SET status='test_failed',error=$2,updated_at=NOW() WHERE id=$1`,
            [draft.id, 'No eligible users or active Global ADMINs were found.']);
          return res.status(409).render('error', {
            title: 'Completion notification not sent',
            message: 'No eligible users or active Global ADMINs were found for the selected apps.'
          });
        }
        const content = draftEmail(draft);
        const result = await mail({
          to: [config.email.gmail.senderEmail],
          bcc: recipients.map(person => person.email),
          subject: content.subject,
          text: content.text,
          html: content.html
        });
        if (!result.ok) {
          const error = result.message || result.error || 'The email service could not send the completion message.';
          await dbQuery(`UPDATE maintenance_email_drafts SET status='failed',error=$2,updated_at=NOW() WHERE id=$1`, [draft.id, error]);
          return res.status(502).render('error', { title: 'Completion notification not sent', message: error });
        }
        await dbQuery(`UPDATE maintenance_email_drafts SET status='sent',sent_at=NOW(),error=NULL,updated_at=NOW() WHERE id=$1`, [draft.id]);
      } catch (error) {
        await dbQuery(
          `UPDATE maintenance_email_drafts SET status='failed',error=$2,updated_at=NOW()
           WHERE id=$1 AND status='sending'`,
          [draft.id, 'Delivery may be incomplete. Check the email log before sending another message.']
        );
        throw error;
      }
      res.redirect('/admin/maintenance-notifications?tab=completed&message=completed-sent');
    } catch (error) {
      next(error);
    }
  });

  router.post('/:id/test', async (req, res, next) => {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.sendStatus(404);
    if (!EMAIL_FORMAT.test(req.user.email || '')) {
      return res.status(409).render('error', {
        title: 'Test email not sent',
        message: 'Your signed-in email address is missing or invalid. Sign in again.'
      });
    }
    try {
      const notice = (await dbQuery(
        `SELECT * FROM maintenance_notices
         WHERE id=$1 AND status='scheduled' AND warning_sent_at IS NULL`,
        [req.params.id]
      )).rows[0];
      if (!notice) return res.sendStatus(404);
      const content = noticeEmail(notice, 'planned');
      const payload = {
        scheduledAt: notice.scheduled_at,
        scheduledTimestamp: notice.scheduled_at,
        expectedDuration: notice.expected_duration,
        impact: notice.impact,
        details: notice.details
      };
      const testedDraft = await dbQuery(
        `INSERT INTO maintenance_email_drafts
           (kind,module_keys,module_name,payload,content_hash,status,created_by)
         VALUES ('request',$1,$2,$3::jsonb,$4,'test_pending',$5) RETURNING id`,
        [notice.module_keys, notice.module_name, JSON.stringify(payload),
          contentHash('request', notice.module_keys, payload), req.user.id]
      );
      const result = await mail({
        to: [req.user.email],
        subject: emailTestSubject(content),
        text: content.text,
        html: content.html
      });
      await dbQuery(
        `UPDATE maintenance_email_drafts SET status=$2,test_sent_at=CASE WHEN $2='tested' THEN NOW() ELSE NULL END,
           error=$3,updated_at=NOW() WHERE id=$1`,
        [testedDraft.rows[0].id, result.ok ? 'tested' : 'test_failed',
          result.ok ? null : result.message || result.error || 'The test email could not be sent.']
      );
      if (!result.ok) {
        return res.status(502).render('error', {
          title: 'Test email not sent',
          message: result.message || result.error || 'The email service could not send the test message.'
        });
      }
      await dbQuery(
        `UPDATE maintenance_notices SET warning_test_draft_id=$2,warning_tested_at=NOW()
         WHERE id=$1 AND status='scheduled' AND warning_sent_at IS NULL`,
        [notice.id, testedDraft.rows[0].id]
      );
      await dbQuery(`UPDATE maintenance_email_drafts SET status='scheduled',updated_at=NOW() WHERE id=$1`,
        [testedDraft.rows[0].id]);
      res.redirect('/admin/maintenance-notifications?message=test-sent');
    } catch (error) {
      next(error);
    }
  });

  router.post('/:id/test-completion', async (req, res, next) => {
    return res.status(410).render('error', {
      title: 'Completion notification moved',
      message: 'Use the Maintenance Completed tab to select the apps, test the email, and then notify the selected app users.'
    });
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
    return res.status(410).render('error', {
      title: 'Completion notification moved',
      message: 'Use the Maintenance Completed tab to select the apps, test the email, and then notify the selected app users.'
    });
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
         AND warning_tested_at IS NOT NULL
         AND warning_test_draft_id IS NOT NULL
         AND EXISTS (
           SELECT 1 FROM maintenance_email_drafts tested
           WHERE tested.id=maintenance_notices.warning_test_draft_id
             AND tested.kind='request' AND tested.status='scheduled'
             AND tested.test_sent_at IS NOT NULL
         )
         AND (warning_attempted_at IS NULL OR warning_attempted_at < NOW() - INTERVAL '1 hour')
       ORDER BY scheduled_at
       LIMIT 10
       FOR UPDATE SKIP LOCKED
     )
     RETURNING *`
  );
  for (const notice of claimed.rows) {
    try {
      const recipients = await loadRecipients(notice.module_keys, dbQuery);
      if (!recipients.length) throw new Error('No eligible users or active Global ADMINs were found.');
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
