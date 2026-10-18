'use strict';

const express = require('express');
const crypto = require('crypto');
const https = require('https');
const nodemailer = require('../mailShim');
const pool = require('../db');

const router = express.Router();

let schemaReady = false;

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeHtml(value) {
  return esc(value);
}

function getSiteUrl() {
  return require('../paths').foodRoomSiteUrl();
}

function getFromAddress() {
  return String(process.env.SUGGESTION_EMAIL_FROM || process.env.SMTP_FROM || process.env.SMTP_USER || '').trim();
}

function isLikelyEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function resolveSmtpAuthUser(preferredUser, fallbackFrom) {
  const user = String(preferredUser || '').trim();
  const from = String(fallbackFrom || '').trim();
  if (isLikelyEmail(user)) return user;
  if (isLikelyEmail(from)) return from;
  return user;
}

function parseSmtpSecureFlag(value) {
  const raw = String(value || '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}

function normalizeSmtpPassword(host, rawPassword) {
  const pass = String(rawPassword || '').trim();
  if (!pass) return pass;
  return /(^|\.)gmail\.com$/i.test(String(host || '').trim()) ? pass.replace(/\s+/g, '') : pass;
}

function getResendConfig() {
  const apiKeyCandidates = [
    { name: 'RESEND_API_KEY', value: process.env.RESEND_API_KEY },
    { name: 'RESEND_KEY', value: process.env.RESEND_KEY },
    { name: 'RESEND_TOKEN', value: process.env.RESEND_TOKEN }
  ];
  const selectedApi = apiKeyCandidates.find((entry) => String(entry.value || '').trim());
  const apiKey = String(selectedApi && selectedApi.value ? selectedApi.value : '').trim();
  const fromAddress = String(process.env.RESEND_FROM || process.env.DIGEST_EMAIL_FROM || process.env.SMTP_FROM || process.env.SMTP_USER || '').trim();
  return { apiKey, fromAddress, apiKeySource: selectedApi ? selectedApi.name : '' };
}

function hasResendReady() {
  return false;
}

function getShoppingReviewEmailChannelPreference() {
  return 'smtp';
}

function shouldUseResendChannel() {
  return false;
}

function createMailer() {
  const host = String(process.env.SMTP_HOST || '').trim();
  const user = resolveSmtpAuthUser(process.env.SMTP_USER, getFromAddress());
  const pass = normalizeSmtpPassword(host, process.env.SMTP_PASS || '');
  if (!host || !user || !pass) return null;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = parseSmtpSecureFlag(process.env.SMTP_SECURE);
  return nodemailer.createTransport({
    host,
    port,
    secure,
    connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT_MS || 8000),
    greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT_MS || 8000),
    socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT_MS || 12000),
    auth: { user, pass }
  });
}

async function verifyMailer(mailer, timeoutMs) {
  if (!mailer) {
    return { smtpReady: false, smtpError: 'SMTP settings are incomplete.' };
  }

  const timeout = Math.max(1000, Number(timeoutMs || 12000));
  const verifyPromise = mailer.verify();
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('SMTP verification timed out.')), timeout);
  });

  try {
    await Promise.race([verifyPromise, timeoutPromise]);
    return { smtpReady: true, smtpError: '' };
  } catch (err) {
    return { smtpReady: false, smtpError: err && err.message ? err.message : 'SMTP verification failed.' };
  }
}

function formatSmtpStatusError(err) {
  const message = String(err && err.message ? err.message : '').trim();
  if (!message) return 'SMTP verification failed.';
  if (/invalid login|username and password not accepted|auth/i.test(message)) {
    return 'SMTP authentication failed. Check SMTP_USER and SMTP_PASS in Render.';
  }
  if (/timeout/i.test(message)) {
    return 'SMTP verification timed out.';
  }
  return 'SMTP verification failed. Check the Render environment variables.';
}

async function sendViaResend(payload) {
  const cfg = getResendConfig();
  if (!cfg.apiKey) throw new Error('Resend API key is not configured.');
  if (!cfg.fromAddress) throw new Error('Resend sender address is not configured.');
  const requestBody = {
    from: cfg.fromAddress,
    to: [payload.to],
    subject: payload.subject,
    html: payload.html
  };

  if (typeof fetch === 'function') {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const bodyText = await response.text().catch(() => '');
      throw new Error(`Resend send failed (${response.status} ${response.statusText}) ${String(bodyText || '').trim()}`.trim());
    }

    const responsePayload = await response.json().catch(() => ({}));
    return {
      channel: 'resend',
      fromAddress: cfg.fromAddress,
      acceptedCount: 1,
      rejectedCount: 0,
      messageId: responsePayload && responsePayload.id ? String(responsePayload.id) : ''
    };
  }

  const fallbackResult = await new Promise((resolve, reject) => {
    const body = JSON.stringify(requestBody);
    const req = https.request({
      hostname: 'api.resend.com',
      path: '/emails',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (resp) => {
      let raw = '';
      resp.on('data', (chunk) => { raw += String(chunk || ''); });
      resp.on('end', () => {
        const statusCode = Number(resp.statusCode || 0);
        if (statusCode >= 200 && statusCode < 300) {
          return resolve({ statusCode, body: raw });
        }
        return reject(new Error(`Resend send failed (${statusCode}) ${raw}`.trim()));
      });
    });
    req.on('error', (err) => reject(err));
    req.write(body);
    req.end();
  });

  if (!fallbackResult || !fallbackResult.statusCode) {
    throw new Error('Resend send failed.');
  }

  return { channel: 'resend', fromAddress: cfg.fromAddress, acceptedCount: 1, rejectedCount: 0, messageId: '' };
}

function getBootstrapAdminEmails() {
  const configured = String(process.env.ADMIN_BOOTSTRAP_EMAILS || '')
    .split(',')
    .map((entry) => normalizeEmail(entry))
    .filter(Boolean);

  const preferred = normalizeEmail(process.env.PREFERRED_ADMIN_EMAIL || '');
  if (preferred && !configured.includes(preferred)) configured.push(preferred);
  return new Set(configured);
}

function getRequestEmail(req) {
  return normalizeEmail(
    (req && req.authUserEmail) ||
    (req && req.authUser && req.authUser.email) ||
    (req && req.headers && (req.headers['x-user-email'] || req.headers['x-staff-email'])) ||
    ''
  );
}

function getConfiguredShoppingTestRecipient() {
  return normalizeEmail(process.env.SHOPPING_REVIEW_TEST_RECIPIENT || '');
}

async function getShoppingAdminRecipients() {
  const recipients = new Set();

  const adminRoleResult = await pool.query(
    `SELECT DISTINCT lower(trim(email_school)) AS email
       FROM staff_upload
      WHERE COALESCE(status, 'Current') = 'Current'
        AND lower(trim(COALESCE(primary_role, ''))) = 'admin'
        AND trim(COALESCE(email_school, '')) <> ''`
  );

  adminRoleResult.rows.forEach((row) => {
    const email = normalizeEmail(row.email);
    if (isLikelyEmail(email)) recipients.add(email);
  });

  const additionalRolesResult = await pool.query(
    `SELECT DISTINCT lower(trim(uar.email)) AS email
       FROM user_additional_roles uar
      WHERE lower(trim(uar.user_type)) = 'staff'
        AND lower(trim(uar.role_name)) = 'admin'
        AND trim(COALESCE(uar.email, '')) <> ''`
  );

  additionalRolesResult.rows.forEach((row) => {
    const email = normalizeEmail(row.email);
    if (isLikelyEmail(email)) recipients.add(email);
  });

  return Array.from(recipients);
}

function resolveShoppingRecipient(options = {}) {
  const configuredRecipient = getConfiguredShoppingTestRecipient();
  const requestedRecipient = normalizeEmail(options.recipientEmail);
  const triggerEmail = normalizeEmail(options.triggerEmail);
  const fallbackRecipient = configuredRecipient || triggerEmail;
  const recipientEmail = requestedRecipient || fallbackRecipient;

  if (!recipientEmail) {
    throw new Error('No recipient email is configured for shopping review emails.');
  }

  if (configuredRecipient && recipientEmail !== configuredRecipient) {
    throw new Error(`Test emails are locked to ${configuredRecipient}.`);
  }

  if (!configuredRecipient && triggerEmail && recipientEmail !== triggerEmail) {
    throw new Error(`Test emails are locked to ${triggerEmail}.`);
  }

  return recipientEmail;
}

function isAdminRequest(req) {
  if (req.user) return req.foodRoomAdmin === true;
  const email = getRequestEmail(req);
  return Boolean(email && getBootstrapAdminEmails().has(email));
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function randomToken() {
  return crypto.randomBytes(32).toString('hex');
}

function parseItemsFromState(state) {
  const parsed = state && typeof state === 'object' ? state : {};
  const columns = Array.isArray(parsed.columns) ? parsed.columns : [];
  const out = [];
  for (const col of columns) {
    const categories = Array.isArray(col) ? col : [];
    for (const category of categories) {
      const sections = Array.isArray(category && category.sections) ? category.sections : [];
      for (const section of sections) {
        const items = Array.isArray(section && section.items) ? section.items : [];
        for (const item of items) {
          const clean = String(item || '').trim();
          if (clean) out.push(clean);
        }
      }
    }
  }
  return out;
}

function parseAddedItemsText(value) {
  return String(value || '')
    .split(/\r?\n/)
    .map((line) => String(line || '').trim())
    .filter(Boolean);
}

function ensureCategoryAndSection(parsedState) {
  const next = parsedState && typeof parsedState === 'object' ? parsedState : {};
  if (!Array.isArray(next.columns)) next.columns = [[], []];
  if (!Array.isArray(next.columns[0])) next.columns[0] = [];
  if (!Array.isArray(next.columns[1])) next.columns[1] = [];

  if (!next.columns[0].length) {
    next.columns[0].push({ name: 'Additional Items', sections: [] });
  }

  if (!next.columns[0][0] || typeof next.columns[0][0] !== 'object') {
    next.columns[0][0] = { name: 'Additional Items', sections: [] };
  }

  if (!Array.isArray(next.columns[0][0].sections)) next.columns[0][0].sections = [];
  if (!next.columns[0][0].sections.length) {
    next.columns[0][0].sections.push({ label: 'General', sublabel: 'Email additions', items: [] });
  }

  if (!next.columns[0][0].sections[0] || typeof next.columns[0][0].sections[0] !== 'object') {
    next.columns[0][0].sections[0] = { label: 'General', sublabel: 'Email additions', items: [] };
  }
  if (!Array.isArray(next.columns[0][0].sections[0].items)) next.columns[0][0].sections[0].items = [];

  return next;
}

function mergeEmailAdditionsIntoState(parsedState, addedItems, note) {
  const state = ensureCategoryAndSection(parsedState);
  const existing = new Set(parseItemsFromState(state).map((item) => item.toLowerCase()));

  for (const raw of Array.isArray(addedItems) ? addedItems : []) {
    const item = String(raw || '').trim();
    if (!item) continue;
    const key = item.toLowerCase();
    if (existing.has(key)) continue;
    state.columns[0][0].sections[0].items.push(item);
    existing.add(key);
  }

  if (note && String(note).trim()) {
    if (!Array.isArray(state.email_review_notes)) state.email_review_notes = [];
    state.email_review_notes.push({
      added_at: new Date().toISOString(),
      note: String(note).trim()
    });
  }

  return state;
}

function buildShoppingReviewEmailHtml(payload) {
  const safeTitle = esc(payload.title || 'Shopping List');
  const safeWeekInfo = esc(payload.weekInfo || 'Upcoming week');
  const approveLink = payload.approveLink;
  const requestChangesLink = payload.requestChangesLink;
  const previewItems = Array.isArray(payload.previewItems) ? payload.previewItems.slice(0, 24) : [];

  const itemsHtml = previewItems.length
    ? previewItems.map((item) => `<li style="margin-bottom:4px;">${esc(item)}</li>`).join('')
    : '<li>No items found in this saved shopping list yet.</li>';

  return `
    <div style="font-family:Arial,sans-serif;max-width:760px;margin:0 auto;color:#1f2937;line-height:1.45;">
      <h2 style="margin:0 0 8px;">Weekly Shopping Review</h2>
      <p style="margin:0 0 12px;">Please review and confirm this shopping list for <strong>${safeWeekInfo}</strong>.</p>

      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;margin:0 0 14px;">
        <div style="font-weight:700;margin:0 0 6px;">${safeTitle}</div>
        <div style="font-size:13px;color:#475569;">Week Info: ${safeWeekInfo}</div>
      </div>

      <div style="margin:0 0 12px;">
        <a href="${approveLink}" style="display:inline-block;background:#166534;color:#fff;text-decoration:none;padding:10px 14px;border-radius:8px;font-weight:700;margin-right:8px;">Approve</a>
        <a href="${requestChangesLink}" style="display:inline-block;background:#b45309;color:#fff;text-decoration:none;padding:10px 14px;border-radius:8px;font-weight:700;">Request Changes</a>
      </div>

      <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;margin:0 0 16px;">
        <div style="font-size:14px;font-weight:700;margin:0 0 8px;">Current Known Items (sample)</div>
        <ul style="margin:0;padding-left:18px;font-size:13px;">${itemsHtml}</ul>
      </div>

      <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:12px 14px;">
        <div style="font-size:14px;font-weight:700;margin:0 0 8px;">Add Items / Notes</div>
        <p style="margin:0 0 8px;font-size:12px;color:#7c2d12;">For better deliverability and compatibility, this email uses links instead of embedded forms.</p>
        <a href="${requestChangesLink}" style="display:inline-block;background:#b45309;color:#fff;text-decoration:none;padding:9px 12px;border-radius:7px;font-size:12px;font-weight:700;">Open Request Changes Form</a>
      </div>
    </div>
  `;
}

function buildRespondResultHtml(title, message, type) {
  const colour = type === 'ok' ? '#166534' : '#b91c1c';
  return `
    <div style="font-family:Arial,sans-serif;max-width:620px;margin:36px auto;padding:18px;border:1px solid #e2e8f0;border-radius:10px;background:#fff;">
      <h2 style="margin:0 0 8px;">${esc(title)}</h2>
      <p style="margin:0;color:${colour};">${esc(message)}</p>
    </div>
  `;
}

router.get('/status', async (req, res) => {
  if (!isAdminRequest(req)) {
    return res.status(403).json({ success: false, error: 'Admin access required.' });
  }

  try {
    await ensureSchema();
    const channelPreference = getShoppingReviewEmailChannelPreference();
    const fromAddress = getFromAddress();
    const mailerStatus = await verifyMailer(createMailer(), 12000);
    return res.json({
      success: true,
      smtpReady: Boolean(fromAddress) && Boolean(mailerStatus.smtpReady),
      smtpChannel: 'smtp',
      channelPreference,
      resendReady: false,
      resendApiConfigured: false,
      resendApiSource: '',
      resendFromConfigured: false,
      smtpError: fromAddress ? (mailerStatus.smtpReady ? '' : formatSmtpStatusError({ message: mailerStatus.smtpError })) : 'Email sender is not configured (SMTP_FROM/SMTP_USER).',
      fromAddress: fromAddress || '',
      testRecipient: getConfiguredShoppingTestRecipient() || getRequestEmail(req) || ''
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || 'Unable to load shopping review email status.' });
  }
});

async function ensureSchema() {
  if (schemaReady) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS shopping_email_review_requests (
      id SERIAL PRIMARY KEY,
      saved_list_id INTEGER NOT NULL REFERENCES saved_shopping_lists(id) ON DELETE CASCADE,
      recipient_email TEXT NOT NULL,
      recipient_name TEXT NOT NULL DEFAULT 'Lead Teacher',
      token_hash TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'sent',
      sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      completed_at TIMESTAMPTZ,
      latest_action TEXT,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS shopping_email_review_responses (
      id SERIAL PRIMARY KEY,
      request_id INTEGER NOT NULL REFERENCES shopping_email_review_requests(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      add_items_text TEXT NOT NULL DEFAULT '',
      change_notes TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      source_ip TEXT NOT NULL DEFAULT '',
      user_agent TEXT NOT NULL DEFAULT ''
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS shopping_email_review_schedules (
      id SERIAL PRIMARY KEY,
      saved_list_id INTEGER NOT NULL REFERENCES saved_shopping_lists(id) ON DELETE CASCADE,
      recipient_email TEXT NOT NULL,
      trigger_at TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_by_email TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      sent_at TIMESTAMPTZ,
      request_id INTEGER REFERENCES shopping_email_review_requests(id) ON DELETE SET NULL,
      message_id TEXT NOT NULL DEFAULT '',
      last_error TEXT NOT NULL DEFAULT ''
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS shopping_email_delivery_log (
      id SERIAL PRIMARY KEY,
      event_type TEXT NOT NULL,
      recipient_email TEXT NOT NULL,
      sender_email TEXT NOT NULL DEFAULT '',
      subject TEXT NOT NULL DEFAULT '',
      message_id TEXT NOT NULL DEFAULT '',
      accepted_count INTEGER NOT NULL DEFAULT 0,
      rejected_count INTEGER NOT NULL DEFAULT 0,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Migration: Add message_id column to existing schedules table if not present
  try {
    await pool.query(`
      ALTER TABLE shopping_email_review_schedules
      ADD COLUMN IF NOT EXISTS message_id TEXT NOT NULL DEFAULT ''
    `);
  } catch (migrationErr) {
    // Column may already exist; continue
    console.log('[SHOPPING-REVIEW] Migration check (message_id column): column likely already exists');
  }

  await pool.query('CREATE INDEX IF NOT EXISTS shopping_email_review_requests_status_idx ON shopping_email_review_requests(status, expires_at DESC)');
  await pool.query('CREATE INDEX IF NOT EXISTS shopping_email_review_responses_request_idx ON shopping_email_review_responses(request_id, created_at DESC)');
  await pool.query('CREATE INDEX IF NOT EXISTS shopping_email_review_schedules_status_idx ON shopping_email_review_schedules(status, trigger_at ASC)');
  await pool.query('CREATE INDEX IF NOT EXISTS shopping_email_delivery_log_created_idx ON shopping_email_delivery_log(created_at DESC)');

  schemaReady = true;
}

async function logShoppingDelivery(eventType, recipientEmail, senderEmail, subject, messageId, acceptedCount, rejectedCount, metadata) {
  try {
    await pool.query(
      `INSERT INTO shopping_email_delivery_log (
         event_type, recipient_email, sender_email, subject, message_id, accepted_count, rejected_count, metadata
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
      [
        String(eventType || ''),
        String(recipientEmail || ''),
        String(senderEmail || ''),
        String(subject || ''),
        String(messageId || ''),
        Number(acceptedCount || 0),
        Number(rejectedCount || 0),
        JSON.stringify(metadata && typeof metadata === 'object' ? metadata : {})
      ]
    );
  } catch (err) {
    console.warn('[SHOPPING-REVIEW] Failed to write delivery log:', err && err.message ? err.message : err);
  }
}

async function resolveSavedList(savedListId) {
  if (Number.isInteger(savedListId) && savedListId > 0) {
    const byId = await pool.query(
      `SELECT id, title, week_info, source_filename, parsed_state,
              created_by_name, created_at, updated_at
       FROM saved_shopping_lists
       WHERE id = $1
       LIMIT 1`,
      [savedListId]
    );
    if (byId.rowCount) return byId.rows[0];
  }

  const latest = await pool.query(
    `SELECT id, title, week_info, source_filename, parsed_state,
            created_by_name, created_at, updated_at
     FROM saved_shopping_lists
     ORDER BY updated_at DESC, id DESC
     LIMIT 1`
  );
  return latest.rowCount ? latest.rows[0] : null;
}

async function sendShoppingReviewEmail(options = {}) {
  await ensureSchema();

  const recipientEmail = resolveShoppingRecipient(options);

  const list = await resolveSavedList(Number(options.savedListId));
  if (!list) {
    throw new Error('No saved shopping list found. Upload and save one first.');
  }

  const token = randomToken();
  const tokenHash = hashToken(token);
  const triggerEmail = normalizeEmail(options.triggerEmail);
  const triggerSource = String(options.triggerSource || 'manual').trim();

  const requestInsert = await pool.query(
    `INSERT INTO shopping_email_review_requests (
       saved_list_id, recipient_email, recipient_name, token_hash, status, expires_at, payload
     ) VALUES ($1, $2, $3, $4, 'sent', NOW() + INTERVAL '7 days', $5::jsonb)
     RETURNING id`,
    [
      list.id,
      recipientEmail,
      'Vanessa',
      tokenHash,
      JSON.stringify({
        trigger_email: triggerEmail,
        trigger_source: triggerSource,
        created_at: new Date().toISOString()
      })
    ]
  );

  const requestId = Number(requestInsert.rows[0].id);
  const siteUrl = getSiteUrl();
  const approveLink = `${siteUrl}/api/shopping-workflow-email/respond?action=approve&token=${encodeURIComponent(token)}`;
  const requestChangesLink = `${siteUrl}/api/shopping-workflow-email/review-form?token=${encodeURIComponent(token)}`;
  const respondPostUrl = `${siteUrl}/api/shopping-workflow-email/respond`;

  const previewItems = parseItemsFromState(list.parsed_state || {});
  const html = buildShoppingReviewEmailHtml({
    title: list.title,
    weekInfo: list.week_info,
    approveLink,
    requestChangesLink,
    respondPostUrl,
    token,
    previewItems
  });

  const from = getFromAddress();
  const subject = `Shopping List Review: ${String(list.title || 'Weekly Shopping List')}`;
  let deliveryChannel = 'smtp';
  let deliveryMessageId = '';
  let acceptedCount = 0;
  let rejectedCount = 0;
  if (!from) {
    throw new Error('Email sender is not configured (SMTP_FROM/SMTP_USER).');
  }
  const mailer = createMailer();
  if (!mailer) {
    throw new Error('SMTP is not configured.');
  }
  console.log(`[SHOPPING-REVIEW] Sending to: ${recipientEmail}, from: ${from}, subject: ${subject}`);
  const info = await mailer.sendMail({
    from,
    to: recipientEmail,
    subject,
    text: `Please review the saved shopping list: ${String(list.title || 'Weekly Shopping List')} (${String(list.week_info || 'Upcoming week')}).`,
    html
  });

  const accepted = Array.isArray(info && info.accepted) ? info.accepted : [];
  const rejected = Array.isArray(info && info.rejected) ? info.rejected : [];
  console.log(`[SHOPPING-REVIEW] Send response - accepted: ${accepted.length}, rejected: ${rejected.length}, messageId: ${String(info && (info.messageId || info.response) || '')}`);
  if (!accepted.length) {
    throw new Error('SMTP send was attempted but no recipients were accepted.');
  }

  await logShoppingDelivery(
    'review_send',
    recipientEmail,
    from,
    subject,
    deliveryMessageId,
    acceptedCount,
    rejectedCount,
    {
      savedListId: Number(list.id || 0),
      triggerEmail: triggerEmail || '',
      triggerSource: triggerSource || ''
    }
  );
  acceptedCount = accepted.length;
  rejectedCount = rejected.length;
  deliveryMessageId = String((info && (info.messageId || info.response)) || '');

  return {
    requestId,
    recipientEmail,
    savedListId: list.id,
    deliveryChannel,
    acceptedCount,
    rejectedCount,
    messageId: deliveryMessageId,
    approveLink,
    requestChangesLink
  };
}

async function sendShoppingSmtpTestEmail(options = {}) {
  await ensureSchema();

  const recipientEmail = resolveShoppingRecipient(options);
  const from = getFromAddress();
  if (!from) {
    throw new Error('Email sender is not configured (SMTP_FROM/SMTP_USER).');
  }

  const mailer = createMailer();
  if (!mailer) {
    throw new Error('SMTP is not configured.');
  }

  const sentAtIso = new Date().toISOString();
  const subject = `Shopping SMTP Test ${sentAtIso}`;
  const text = [
    'This is a simple SMTP connectivity test for Shopping Review emails.',
    `Sent at: ${sentAtIso}`,
    `From: ${from}`,
    `To: ${recipientEmail}`
  ].join('\n');
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#1f2937;line-height:1.45;">
      <h2 style="margin:0 0 10px;">Shopping SMTP Test</h2>
      <p style="margin:0 0 8px;">This is a simple SMTP connectivity test for Shopping Review emails.</p>
      <p style="margin:0 0 4px;"><strong>Sent at:</strong> ${esc(sentAtIso)}</p>
      <p style="margin:0 0 4px;"><strong>From:</strong> ${esc(from)}</p>
      <p style="margin:0;"><strong>To:</strong> ${esc(recipientEmail)}</p>
    </div>
  `;

  console.log(`[SHOPPING-REVIEW] SMTP test sending to: ${recipientEmail}, from: ${from}, subject: ${subject}`);
  const info = await mailer.sendMail({ from, to: recipientEmail, subject, text, html });

  const accepted = Array.isArray(info && info.accepted) ? info.accepted : [];
  const rejected = Array.isArray(info && info.rejected) ? info.rejected : [];
  const messageId = String((info && (info.messageId || info.response)) || '');
  console.log(`[SHOPPING-REVIEW] SMTP test response - accepted: ${accepted.length}, rejected: ${rejected.length}, messageId: ${messageId}`);

  if (!accepted.length) {
    throw new Error('SMTP test was attempted but no recipients were accepted.');
  }

  await logShoppingDelivery(
    'smtp_test',
    recipientEmail,
    from,
    subject,
    messageId,
    accepted.length,
    rejected.length,
    { sentAtIso }
  );

  return {
    deliveryChannel: 'smtp',
    recipientEmail,
    acceptedCount: accepted.length,
    rejectedCount: rejected.length,
    messageId
  };
}

function formatEmailDateTime(value) {
  const dt = new Date(value || '');
  if (Number.isNaN(dt.getTime())) return 'N/A';
  const day = String(dt.getDate()).padStart(2, '0');
  const month = String(dt.getMonth() + 1).padStart(2, '0');
  const year = String(dt.getFullYear());
  const hours = String(dt.getHours()).padStart(2, '0');
  const mins = String(dt.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year}, ${hours}:${mins}`;
}

function parseWeekEndingDateForSchedule(text, fallbackYear) {
  const input = String(text || '').trim();
  if (!input) return null;

  const isoMatch = input.match(/(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) {
    const isoDate = new Date(`${isoMatch[1]}T00:00:00`);
    return Number.isNaN(isoDate.getTime()) ? null : isoDate;
  }

  const compact = input.match(/(\d{1,2})\s*([A-Za-z]{3,9})(?:\s+(\d{4}))?/);
  if (!compact) return null;

  const day = Number(compact[1]);
  const monthName = String(compact[2] || '').toLowerCase();
  const monthMap = {
    jan: 0, january: 0,
    feb: 1, february: 1,
    mar: 2, march: 2,
    apr: 3, april: 3,
    may: 4,
    jun: 5, june: 5,
    jul: 6, july: 6,
    aug: 7, august: 7,
    sep: 8, sept: 8, september: 8,
    oct: 9, october: 9,
    nov: 10, november: 10,
    dec: 11, december: 11
  };

  if (!Number.isFinite(day) || monthMap[monthName] == null) return null;

  const year = compact[3] ? Number(compact[3]) : Number(fallbackYear || (new Date()).getFullYear());
  const parsed = new Date(year, monthMap[monthName], day);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function deriveWeekRangeFromSavedList(list) {
  const state = list && list.parsed_state && typeof list.parsed_state === 'object' ? list.parsed_state : {};
  const fallbackYear = (() => {
    const created = new Date(list && list.created_at ? list.created_at : '');
    return Number.isNaN(created.getTime()) ? (new Date()).getFullYear() : created.getFullYear();
  })();

  const endingDate = parseWeekEndingDateForSchedule(
    state.weekDate || list.week_date || list.week_info || '',
    fallbackYear
  );
  if (!endingDate) return null;

  const friday = new Date(endingDate.getFullYear(), endingDate.getMonth(), endingDate.getDate());
  const monday = new Date(friday);
  monday.setDate(friday.getDate() - 4);
  monday.setHours(0, 0, 0, 0);
  friday.setHours(0, 0, 0, 0);
  return { monday, friday };
}

function toIsoDateKey(dateObj) {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatScheduleDayLabel(dateObj) {
  return dateObj.toLocaleDateString('en-NZ', { weekday: 'long' });
}

function formatScheduleDateLabel(dateObj) {
  return dateObj.toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'short' });
}

function sortText(a, b) {
  return String(a || '').localeCompare(String(b || ''), undefined, { sensitivity: 'base' });
}

async function loadRecipeScheduleForSavedList(list) {
  const range = deriveWeekRangeFromSavedList(list);
  if (!range) return [];

  const startIso = toIsoDateKey(range.monday);
  const endIso = toIsoDateKey(range.friday);
  const result = await pool.query(
    `SELECT b.booking_date,
            b.class_name,
            trim(coalesce(r.name, b.recipe, '')) AS recipe_title,
            trim(coalesce(b.recipe_url, '')) AS recipe_url
       FROM bookings b
       LEFT JOIN recipes r
         ON r.id = CAST(
              NULLIF(
                regexp_replace(COALESCE(b.recipe_id::text, ''), '[^0-9]', '', 'g'),
                ''
              ) AS INTEGER
            )
      WHERE b.booking_date >= $1
        AND b.booking_date <= $2
        AND trim(coalesce(r.name, b.recipe, '')) <> ''
      ORDER BY b.booking_date ASC, upper(trim(coalesce(b.class_name, ''))) ASC, upper(trim(coalesce(r.name, b.recipe, ''))) ASC, b.id ASC`,
    [startIso, endIso]
  );

  const byDay = new Map();
  for (let i = 0; i < 5; i += 1) {
    const day = new Date(range.monday);
    day.setDate(range.monday.getDate() + i);
    day.setHours(0, 0, 0, 0);
    byDay.set(toIsoDateKey(day), {
      dateObj: day,
      label: formatScheduleDayLabel(day),
      entries: []
    });
  }

  for (const row of result.rows) {
    const dateKey = String(row && row.booking_date || '').slice(0, 10);
    if (!byDay.has(dateKey)) continue;
    const title = String(row && row.recipe_title || '').trim();
    if (!title) continue;
    byDay.get(dateKey).entries.push({
      className: String(row && row.class_name || '').trim(),
      title,
      url: String(row && row.recipe_url || '').trim()
    });
  }

  return Array.from(byDay.values()).map((day) => {
    day.entries.sort((a, b) => sortText(a.className, b.className) || sortText(a.title, b.title));
    return day;
  });
}

function renderRecipeScheduleHtml(dayRows) {
  if (!Array.isArray(dayRows) || !dayRows.length) {
    return `
      <div style="border:1px solid #dbe4f1;border-radius:10px;background:#ffffff;overflow:hidden;margin:0 0 12px 0;">
        <div style="background:#eef4fb;padding:8px 12px;font-size:13px;font-weight:700;color:#0f3b77;">Recipe Schedule <span style="display:inline-block;margin-left:6px;padding:1px 6px;border-radius:999px;background:#dbeafe;color:#1d4f91;font-size:11px;font-weight:700;text-transform:uppercase;">linked</span></div>
        <div style="padding:12px;font-size:12px;color:#475569;">No recipe schedule found for this week.</div>
      </div>
    `;
  }

  const daysHtml = dayRows.map((day) => {
    const dayLabel = esc(day && day.label ? day.label : 'Day');
    let dateObj = day && day.dateObj ? day.dateObj : new Date();
    // Handle stringified dates (from JSON serialization)
    if (typeof dateObj === 'string') {
      dateObj = new Date(dateObj);
    }
    const dateLabel = esc(formatScheduleDateLabel(dateObj));
    const entries = Array.isArray(day && day.entries) ? day.entries : [];
    const itemsHtml = entries.length
      ? entries.map((entry) => {
        const classHtml = entry.className
          ? `<span style="display:inline-block;min-width:90px;font-weight:700;color:#1d4f91;margin-right:6px;">${esc(entry.className)}</span>`
          : '';
        const title = esc(entry.title || 'Recipe');
        const link = entry.url
          ? `<a href="${esc(entry.url)}" target="_blank" rel="noopener noreferrer" style="color:#1d4f91;text-decoration:underline;">${title}</a>`
          : title;
        return `<li style="margin:0 0 4px 0;">${classHtml}${link}</li>`;
      }).join('')
      : '<li style="margin:0 0 4px 0;color:#64748b;">No recipes for this day.</li>';

    return `
      <div style="padding:10px 12px;border-top:1px solid #e5e7eb;">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline;">
          <div style="font-size:13px;font-weight:700;color:#0f172a;">${dayLabel}</div>
          <div style="font-size:12px;color:#64748b;">${dateLabel}</div>
        </div>
        <ul style="margin:6px 0 0 0;padding-left:18px;font-size:12px;color:#0f172a;line-height:1.4;">${itemsHtml}</ul>
      </div>
    `;
  }).join('');

  return `
    <div style="border:1px solid #dbe4f1;border-radius:10px;background:#ffffff;overflow:hidden;margin:0 0 12px 0;">
      <div style="background:#eef4fb;padding:8px 12px;font-size:13px;font-weight:700;color:#0f3b77;">Recipe Schedule <span style="display:inline-block;margin-left:6px;padding:1px 6px;border-radius:999px;background:#dbeafe;color:#1d4f91;font-size:11px;font-weight:700;text-transform:uppercase;">linked</span></div>
      ${daysHtml}
    </div>
  `;
}

function renderColumnSectionsHtml(parsedState) {
  const state = parsedState && typeof parsedState === 'object' ? parsedState : {};
  const columns = Array.isArray(state.columns) ? state.columns : [];
  const normalizeCategoryKey = (name) => String(name || '').trim().toLowerCase();

  const renderCategory = (category) => {
    if (!category) {
      return '<div style="border:1px solid transparent;border-radius:10px;min-height:8px;"></div>';
    }

    const categoryName = esc(category && category.name ? category.name : 'Items');
    const sections = Array.isArray(category && category.sections) ? category.sections : [];
    const sectionHtml = sections.map((section) => {
      const label = esc(section && section.label ? section.label : 'General');
      const sublabel = esc(section && section.sublabel ? section.sublabel : '');
      const items = Array.isArray(section && section.items) ? section.items : [];
      const itemsHtml = items.length
        ? items.slice(0, 120).map((item) => `<li style="margin:0 0 4px 0;">${esc(item)}</li>`).join('')
        : '<li style="margin:0;">No items</li>';

      return `
        <div style="padding:10px 12px;border-top:1px solid #e5e7eb;">
          <div style="font-size:13px;font-weight:700;color:#1d4f91;">${label}</div>
          ${sublabel ? `<div style="font-size:12px;color:#64748b;margin:2px 0 6px 0;">${sublabel}</div>` : ''}
          <ul style="margin:0;padding-left:18px;font-size:12px;color:#0f172a;line-height:1.4;">${itemsHtml}</ul>
        </div>
      `;
    }).join('');

    return `
      <div style="border:1px solid #dbe4f1;border-radius:10px;background:#ffffff;overflow:hidden;margin:0 0 10px 0;">
        <div style="background:#eef4fb;padding:8px 12px;font-size:13px;font-weight:700;color:#0f3b77;">${categoryName}</div>
        ${sectionHtml || '<div style="padding:10px 12px;font-size:12px;color:#475569;">No items</div>'}
      </div>
    `;
  };

  if (!columns.length) {
    const items = parseItemsFromState(state).slice(0, 120);
    const fallbackItems = items.length
      ? items.map((item) => `<li style="margin:0 0 4px 0;">${esc(item)}</li>`).join('')
      : '<li style="margin:0;">No items found in this saved shopping list yet.</li>';
    return `
      <div style="border:1px solid #dbe4f1;border-radius:10px;background:#ffffff;padding:12px;">
        <div style="font-size:13px;font-weight:700;color:#0f3b77;margin:0 0 8px 0;">Items</div>
        <ul style="margin:0;padding-left:18px;font-size:12px;color:#0f172a;line-height:1.4;">${fallbackItems}</ul>
      </div>
    `;
  }

  const leftColumn = Array.isArray(columns[0]) ? columns[0] : [];
  const rightColumn = Array.isArray(columns[1]) ? columns[1] : [];
  const leftOtherIndex = leftColumn.findIndex((category) => normalizeCategoryKey(category && category.name) === 'other');
  const rightOtherIndex = rightColumn.findIndex((category) => normalizeCategoryKey(category && category.name) === 'other');
  const firstOtherIndex = [leftOtherIndex, rightOtherIndex]
    .filter((index) => index !== -1)
    .sort((a, b) => a - b)[0];
  const otherCategory = leftOtherIndex !== -1
    ? leftColumn[leftOtherIndex]
    : (rightOtherIndex !== -1 ? rightColumn[rightOtherIndex] : null);

  const pairedLeftColumn = leftColumn.filter((category) => normalizeCategoryKey(category && category.name) !== 'other');
  const pairedRightColumn = rightColumn.filter((category) => normalizeCategoryKey(category && category.name) !== 'other');
  const renderLimit = Number.isInteger(firstOtherIndex)
    ? Math.min(firstOtherIndex, Math.max(pairedLeftColumn.length, pairedRightColumn.length))
    : Math.max(pairedLeftColumn.length, pairedRightColumn.length, 1);

  const rowHtml = [];
  for (let idx = 0; idx < renderLimit; idx += 1) {
    rowHtml.push(`
      <tr>
        <td valign="top" width="50%" style="width:50%;">${renderCategory(pairedLeftColumn[idx] || null)}</td>
        <td valign="top" width="50%" style="width:50%;">${renderCategory(pairedRightColumn[idx] || null)}</td>
      </tr>
    `);
  }

  if (otherCategory) {
    rowHtml.push(`
      <tr>
        <td valign="top" colspan="2" style="width:100%;">${renderCategory(otherCategory)}</td>
      </tr>
    `);
  }

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:10px 0;">
      ${rowHtml.join('')}
    </table>
  `;
}

function buildSimpleShoppingListEmailHtml(list, recipeScheduleRows) {
  const safeTitle = esc(list && list.title ? list.title : 'Shopping List');
  const safeWeekInfo = esc(list && list.week_info ? list.week_info : 'Upcoming week');
  const safeSavedBy = esc(list && list.created_by_name ? list.created_by_name : 'Unknown');
  const safeCreatedAt = esc(formatEmailDateTime(list && list.created_at));
  const safeUpdatedAt = esc(formatEmailDateTime(list && list.updated_at));
  const safeSource = esc(list && list.source_filename ? list.source_filename : 'N/A');
  const scheduleHtml = renderRecipeScheduleHtml(recipeScheduleRows);
  const sectionsHtml = renderColumnSectionsHtml((list && list.parsed_state) || {});

  return `
    <div style="font-family:Arial,sans-serif;max-width:980px;margin:0 auto;color:#1f2937;line-height:1.45;background:#f8fafc;padding:12px;">
      <div style="background:#1f4f93;border-radius:12px 12px 0 0;padding:14px 16px;color:#ffffff;">
        <div style="font-size:28px;line-height:1;font-weight:700;color:#7ec2ff;margin:0 0 6px 0;">${safeTitle}</div>
        <div style="font-size:14px;font-weight:700;color:#dbeafe;">${safeWeekInfo}</div>
        <div style="font-size:13px;color:#e2e8f0;margin-top:6px;">This email is sorted in the teacher-facing print order.</div>
      </div>

      <div style="background:#ffffff;border:1px solid #cbd5e1;border-top:0;border-radius:0 0 12px 12px;padding:14px 12px 12px 12px;">
        <div style="border:1px solid #dbe4f1;border-radius:10px;padding:10px 12px;background:#f8fafc;margin:0 0 12px 0;">
          <div style="font-size:22px;font-weight:700;color:#1d4f91;margin:0 0 4px 0;">Teacher Preview</div>
          <div style="font-size:13px;color:#475569;">Layout follows the teacher-facing shopping list format and is sorted before print/export.</div>
        </div>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:10px 0;margin:0 0 12px 0;">
          <tr>
            <td style="border:1px solid #dbe4f1;border-radius:10px;background:#f8fafc;padding:10px;">
              <div style="font-size:11px;color:#64748b;letter-spacing:0.04em;">SAVED BY</div>
              <div style="font-size:13px;font-weight:700;color:#0f172a;">${safeSavedBy}</div>
            </td>
            <td style="border:1px solid #dbe4f1;border-radius:10px;background:#f8fafc;padding:10px;">
              <div style="font-size:11px;color:#64748b;letter-spacing:0.04em;">CREATED</div>
              <div style="font-size:13px;font-weight:700;color:#0f172a;">${safeCreatedAt}</div>
            </td>
            <td style="border:1px solid #dbe4f1;border-radius:10px;background:#f8fafc;padding:10px;">
              <div style="font-size:11px;color:#64748b;letter-spacing:0.04em;">UPDATED</div>
              <div style="font-size:13px;font-weight:700;color:#0f172a;">${safeUpdatedAt}</div>
            </td>
            <td style="border:1px solid #dbe4f1;border-radius:10px;background:#f8fafc;padding:10px;">
              <div style="font-size:11px;color:#64748b;letter-spacing:0.04em;">SOURCE</div>
              <div style="font-size:13px;font-weight:700;color:#0f172a;">${safeSource}</div>
            </td>
          </tr>
        </table>

        ${scheduleHtml}
        ${sectionsHtml}
      </div>
    </div>
  `;
}

async function sendShoppingListNowEmail(options = {}) {
  await ensureSchema();

  const recipientEmail = resolveShoppingRecipient(options);
  const savedListId = Number(options.savedListId);
  const list = await resolveSavedList(savedListId);
  if (!list) {
    throw new Error('No saved shopping list found. Upload and save one first.');
  }

  const from = getFromAddress();
  if (!from) {
    throw new Error('Email sender is not configured (SMTP_FROM/SMTP_USER).');
  }

  const mailer = createMailer();
  if (!mailer) {
    throw new Error('SMTP is not configured.');
  }

  const subject = `Shopping List: ${String(list.title || 'Weekly Shopping List')}`;
  const textItems = parseItemsFromState(list.parsed_state || {}).slice(0, 120);
  const text = [
    `Shopping List: ${String(list.title || 'Weekly Shopping List')}`,
    `Week: ${String(list.week_info || 'Upcoming week')}`,
    '',
    'Items:',
    ...(textItems.length ? textItems.map((item) => `- ${item}`) : ['- No items found'])
  ].join('\n');

  const recipeScheduleRows = await loadRecipeScheduleForSavedList(list);
  const html = buildSimpleShoppingListEmailHtml(list, recipeScheduleRows);

  console.log(`[SHOPPING-REVIEW] List send sending to: ${recipientEmail}, from: ${from}, subject: ${subject}`);
  const info = await mailer.sendMail({ from, to: recipientEmail, replyTo: from, subject, text, html });

  const accepted = Array.isArray(info && info.accepted) ? info.accepted : [];
  const rejected = Array.isArray(info && info.rejected) ? info.rejected : [];
  const messageId = String((info && (info.messageId || info.response)) || '');
  console.log(`[SHOPPING-REVIEW] List send response - accepted: ${accepted.length}, rejected: ${rejected.length}, messageId: ${messageId}`);

  if (!accepted.length) {
    throw new Error('Shopping list email was attempted but no recipients were accepted.');
  }

  await logShoppingDelivery(
    'list_send',
    recipientEmail,
    from,
    subject,
    messageId,
    accepted.length,
    rejected.length,
    { savedListId: Number(list.id || 0) }
  );

  let adminNotificationSent = false;
  let adminNotificationRecipients = [];
  let adminNotificationError = '';
  try {
    adminNotificationRecipients = await getShoppingAdminRecipients();
    if (adminNotificationRecipients.length) {
      const adminSubject = `[Shopping List Sent] ${String(list.title || 'Weekly Shopping List')}`;
      const adminText = [
        'Shopping list email sent successfully.',
        '',
        `List: ${String(list.title || 'Weekly Shopping List')}`,
        `Week: ${String(list.week_info || 'Upcoming week')}`,
        `Recipient: ${recipientEmail}`,
        `Accepted: ${accepted.length}`,
        `Rejected: ${rejected.length}`,
        `Message ID: ${messageId || 'N/A'}`,
        `From: ${from}`,
        `Time: ${new Date().toISOString()}`
      ].join('\n');
      for (const adminRecipient of adminNotificationRecipients) {
        const adminInfo = await mailer.sendMail({
          from,
          to: adminRecipient,
          subject: adminSubject,
          text: adminText
        });
        const adminAccepted = Array.isArray(adminInfo && adminInfo.accepted) ? adminInfo.accepted.length : 0;
        const adminRejected = Array.isArray(adminInfo && adminInfo.rejected) ? adminInfo.rejected.length : 0;
        const adminMessageId = String((adminInfo && (adminInfo.messageId || adminInfo.response)) || '');
        await logShoppingDelivery(
          'admin_receipt',
          adminRecipient,
          from,
          adminSubject,
          adminMessageId,
          adminAccepted,
          adminRejected,
          {
            sourceRecipient: recipientEmail,
            sourceMessageId: messageId || '',
            savedListId: Number(list.id || 0)
          }
        );
      }
      adminNotificationSent = true;
    }
  } catch (err) {
    adminNotificationError = err && err.message ? err.message : String(err || 'Failed to send admin receipt.');
    console.warn('[SHOPPING-REVIEW] Admin receipt email failed:', adminNotificationError);
  }

  return {
    deliveryChannel: 'smtp',
    recipientEmail,
    acceptedCount: accepted.length,
    rejectedCount: rejected.length,
    messageId,
    savedListId: Number(list.id || 0),
    adminNotificationSent,
    adminNotificationRecipients,
    adminNotificationError
  };
}

async function findRequestByToken(rawToken) {
  const token = String(rawToken || '').trim();
  if (!token) return null;

  const tokenHash = hashToken(token);
  const result = await pool.query(
    `SELECT req.id, req.saved_list_id, req.recipient_email, req.recipient_name, req.status, req.expires_at, req.completed_at,
            list.title, list.week_info, list.parsed_state
       FROM shopping_email_review_requests req
       JOIN saved_shopping_lists list ON list.id = req.saved_list_id
      WHERE req.token_hash = $1
      LIMIT 1`,
    [tokenHash]
  );

  if (!result.rowCount) return null;
  return result.rows[0];
}

async function recordResponseAndApplyChanges(requestRow, action, addItemsText, changeNotes, reqMeta) {
  const requestId = Number(requestRow.id);
  const cleanAction = String(action || '').trim().toLowerCase() === 'approve' ? 'approve' : 'request_changes';
  const cleanAddText = String(addItemsText || '').trim();
  const cleanNotes = String(changeNotes || '').trim();

  await pool.query(
    `INSERT INTO shopping_email_review_responses (request_id, action, add_items_text, change_notes, source_ip, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [requestId, cleanAction, cleanAddText, cleanNotes, String(reqMeta.ip || ''), String(reqMeta.userAgent || '')]
  );

  const addedItems = parseAddedItemsText(cleanAddText);
  if (cleanAction === 'request_changes' || addedItems.length || cleanNotes) {
    const nextParsedState = mergeEmailAdditionsIntoState(
      requestRow.parsed_state && typeof requestRow.parsed_state === 'object' ? requestRow.parsed_state : {},
      addedItems,
      cleanNotes
    );

    await pool.query(
      `UPDATE saved_shopping_lists
          SET parsed_state = $2::jsonb,
              updated_at = NOW()
        WHERE id = $1`,
      [requestRow.saved_list_id, JSON.stringify(nextParsedState)]
    );
  }

  const nextStatus = cleanAction === 'approve' ? 'approved' : 'changes_requested';
  await pool.query(
    `UPDATE shopping_email_review_requests
        SET status = $2,
            latest_action = $3,
            completed_at = NOW()
      WHERE id = $1`,
    [requestId, nextStatus, cleanAction]
  );

  return { action: cleanAction, status: nextStatus, addedItemsCount: addedItems.length };
}

router.post('/send-test', async (req, res) => {
  if (!isAdminRequest(req)) {
    return res.status(403).json({ success: false, error: 'Admin access required.' });
  }

  try {
    const sent = await sendShoppingReviewEmail({
      savedListId: Number(req.body && req.body.savedListId),
      recipientEmail: req.body && req.body.recipientEmail,
      triggerEmail: getRequestEmail(req),
      triggerSource: 'manual_api'
    });
    return res.json(Object.assign({ success: true }, sent));
  } catch (err) {
    const status = /not configured|locked/i.test(String(err && err.message || '')) ? 503 : 500;
    return res.status(status).json({ success: false, error: err.message || 'Failed to send shopping review email.' });
  }
});

router.post('/send-smtp-test', async (req, res) => {
  if (!isAdminRequest(req)) {
    return res.status(403).json({ success: false, error: 'Admin access required.' });
  }

  try {
    const sent = await sendShoppingSmtpTestEmail({
      recipientEmail: req.body && req.body.recipientEmail,
      triggerEmail: getRequestEmail(req)
    });
    return res.json(Object.assign({ success: true }, sent));
  } catch (err) {
    const status = /not configured|locked/i.test(String(err && err.message || '')) ? 503 : 500;
    return res.status(status).json({ success: false, error: err.message || 'Failed to send SMTP test email.' });
  }
});

router.post('/send-list-now', async (req, res) => {
  if (!isAdminRequest(req)) {
    return res.status(403).json({ success: false, error: 'Admin access required.' });
  }

  try {
    const sent = await sendShoppingListNowEmail({
      savedListId: Number(req.body && req.body.savedListId),
      recipientEmail: req.body && req.body.recipientEmail,
      triggerEmail: getRequestEmail(req)
    });
    return res.json(Object.assign({ success: true }, sent));
  } catch (err) {
    const status = /not configured|locked/i.test(String(err && err.message || '')) ? 503 : 500;
    return res.status(status).json({ success: false, error: err.message || 'Failed to send shopping list email.' });
  }
});

router.get('/schedules', async (req, res) => {
  if (!isAdminRequest(req)) {
    return res.status(403).json({ success: false, error: 'Admin access required.' });
  }

  try {
    await ensureSchema();
    const result = await pool.query(
      `SELECT s.id, s.saved_list_id, s.recipient_email, s.trigger_at, s.status,
              s.created_by_email, s.created_at, s.updated_at, s.sent_at, s.message_id, s.last_error,
              l.title, l.week_info
       FROM shopping_email_review_schedules s
       LEFT JOIN saved_shopping_lists l ON l.id = s.saved_list_id
       ORDER BY s.trigger_at DESC, s.id DESC
       LIMIT 100`
    );
    return res.json({ success: true, schedules: result.rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || 'Unable to load schedules.' });
  }
});

router.get('/delivery-log', async (req, res) => {
  if (!isAdminRequest(req)) {
    return res.status(403).json({ success: false, error: 'Admin access required.' });
  }

  try {
    await ensureSchema();
    const limitRaw = Number(req.query && req.query.limit);
    const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 200) : 50;
    const result = await pool.query(
      `SELECT id, event_type, recipient_email, sender_email, subject, message_id,
              accepted_count, rejected_count, metadata, created_at
       FROM shopping_email_delivery_log
       ORDER BY created_at DESC, id DESC
       LIMIT $1`,
      [limit]
    );
    return res.json({ success: true, rows: result.rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || 'Unable to load delivery log.' });
  }
});

router.post('/schedules', async (req, res) => {
  if (!isAdminRequest(req)) {
    return res.status(403).json({ success: false, error: 'Admin access required.' });
  }

  try {
    await ensureSchema();

    const creatorEmail = getRequestEmail(req);
    const scheduleRecipient = getConfiguredShoppingTestRecipient() || creatorEmail;
    const savedListId = Number(req.body && req.body.savedListId);
    const triggerAtRaw = String(req.body && req.body.triggerAt || '').trim();
    const triggerDate = new Date(triggerAtRaw);

    if (!Number.isInteger(savedListId) || savedListId <= 0) {
      return res.status(400).json({ success: false, error: 'savedListId is required.' });
    }

    if (!triggerAtRaw || Number.isNaN(triggerDate.getTime())) {
      return res.status(400).json({ success: false, error: 'A valid triggerAt date/time is required.' });
    }

    if (!scheduleRecipient) {
      return res.status(400).json({ success: false, error: 'No recipient email is configured for schedule sends.' });
    }

    if (triggerDate.getTime() <= Date.now() + 30000) {
      return res.status(400).json({ success: false, error: 'Trigger time must be at least 30 seconds in the future.' });
    }

    const list = await resolveSavedList(savedListId);
    if (!list) {
      return res.status(404).json({ success: false, error: 'Saved shopping list not found.' });
    }

    const insert = await pool.query(
      `INSERT INTO shopping_email_review_schedules (
         saved_list_id, recipient_email, trigger_at, status, created_by_email
       ) VALUES ($1, $2, $3::timestamptz, 'pending', $4)
       RETURNING id, saved_list_id, recipient_email, trigger_at, status, created_by_email, created_at`,
      [savedListId, scheduleRecipient, triggerAtRaw, creatorEmail]
    );

    return res.status(201).json({ success: true, schedule: insert.rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || 'Unable to create schedule.' });
  }
});

router.post('/schedules/:id/cancel', async (req, res) => {
  if (!isAdminRequest(req)) {
    return res.status(403).json({ success: false, error: 'Admin access required.' });
  }

  try {
    await ensureSchema();
    const scheduleId = Number(req.params.id);
    if (!Number.isInteger(scheduleId) || scheduleId <= 0) {
      return res.status(400).json({ success: false, error: 'Valid schedule id is required.' });
    }

    const update = await pool.query(
      `UPDATE shopping_email_review_schedules
          SET status = 'cancelled', updated_at = NOW()
        WHERE id = $1 AND status = 'pending'
        RETURNING id, status, updated_at`,
      [scheduleId]
    );

    if (!update.rowCount) {
      return res.status(404).json({ success: false, error: 'Pending schedule not found.' });
    }

    return res.json({ success: true, schedule: update.rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || 'Unable to cancel schedule.' });
  }
});

router.post('/schedules/:id/run-now', async (req, res) => {
  if (!isAdminRequest(req)) {
    return res.status(403).json({ success: false, error: 'Admin access required.' });
  }

  try {
    await ensureSchema();
    const scheduleId = Number(req.params.id);
    if (!Number.isInteger(scheduleId) || scheduleId <= 0) {
      return res.status(400).json({ success: false, error: 'Valid schedule id is required.' });
    }

    const lookup = await pool.query(
      `SELECT * FROM shopping_email_review_schedules WHERE id = $1 LIMIT 1`,
      [scheduleId]
    );
    if (!lookup.rowCount) {
      return res.status(404).json({ success: false, error: 'Schedule not found.' });
    }

    const row = lookup.rows[0];
    if (String(row.status || '').toLowerCase() !== 'pending') {
      return res.status(400).json({ success: false, error: 'Only pending schedules can run now.' });
    }

    const sent = await sendShoppingReviewEmail({
      savedListId: Number(row.saved_list_id),
      recipientEmail: row.recipient_email,
      triggerEmail: getRequestEmail(req),
      triggerSource: 'schedule_run_now'
    });

    await pool.query(
      `UPDATE shopping_email_review_schedules
          SET status = 'sent', sent_at = NOW(), updated_at = NOW(), request_id = $2, message_id = $3, last_error = ''
        WHERE id = $1`,
      [scheduleId, sent.requestId, String(sent.messageId || '')]
    );

    return res.json({ success: true, scheduleId, sent });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || 'Unable to run schedule now.' });
  }
});

async function processDueSchedules(limit = 5) {
  await ensureSchema();

  const dueResult = await pool.query(
    `SELECT *
     FROM shopping_email_review_schedules
     WHERE status = 'pending'
       AND trigger_at <= NOW()
     ORDER BY trigger_at ASC, id ASC
     LIMIT $1`,
    [Math.max(1, Number(limit) || 5)]
  );

  console.log(`[SHOPPING-REVIEW] processDueSchedules: found ${dueResult.rowCount} due schedules`);

  let processed = 0;
  for (const row of dueResult.rows) {
    try {
      console.log(`[SHOPPING-REVIEW] Processing schedule ${row.id}: savedListId=${row.saved_list_id}, recipient=${row.recipient_email}`);
      const sent = await sendShoppingReviewEmail({
        savedListId: Number(row.saved_list_id),
        recipientEmail: row.recipient_email,
        triggerEmail: row.created_by_email,
        triggerSource: 'scheduled'
      });

      await pool.query(
        `UPDATE shopping_email_review_schedules
            SET status = 'sent', sent_at = NOW(), updated_at = NOW(), request_id = $2, message_id = $3, last_error = ''
          WHERE id = $1`,
        [row.id, sent.requestId, String(sent.messageId || '')]
      );
      console.log(`[SHOPPING-REVIEW] Schedule ${row.id} marked as sent with messageId: ${sent.messageId}`);
      processed += 1;
    } catch (err) {
      const errorMsg = String(err && err.message || 'Unknown schedule send error');
      console.error(`[SHOPPING-REVIEW] Failed to send schedule ${row.id}: ${errorMsg}`);
      await pool.query(
        `UPDATE shopping_email_review_schedules
            SET status = 'failed', updated_at = NOW(), last_error = $2
          WHERE id = $1`,
        [row.id, errorMsg]
      );
    }
  }

  return processed;
}

router.get('/review-form', async (req, res) => {
  try {
    await ensureSchema();
    const token = String(req.query && req.query.token || '').trim();
    const requestRow = await findRequestByToken(token);
    if (!requestRow) {
      return res.status(404).send(buildRespondResultHtml('Review Link Invalid', 'This review link is invalid or no longer exists.', 'error'));
    }

    if (new Date(requestRow.expires_at).getTime() < Date.now()) {
      return res.status(410).send(buildRespondResultHtml('Review Link Expired', 'This review link has expired. Please request a new review email.', 'error'));
    }

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:760px;margin:24px auto;padding:14px;border:1px solid #e2e8f0;border-radius:10px;">
        <h2 style="margin:0 0 8px;">Shopping Review Form</h2>
        <p style="margin:0 0 8px;"><strong>List:</strong> ${esc(requestRow.title || 'Shopping List')}</p>
        <p style="margin:0 0 14px;"><strong>Week:</strong> ${esc(requestRow.week_info || 'Upcoming week')}</p>
        <form method="POST" action="/api/shopping-workflow-email/respond">
          <input type="hidden" name="token" value="${esc(token)}">
          <div style="margin-bottom:10px;">
            <label style="display:block;font-weight:700;font-size:13px;margin-bottom:4px;">Add items (one per line)</label>
            <textarea name="add_items" rows="8" style="width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:7px;padding:8px;"></textarea>
          </div>
          <div style="margin-bottom:12px;">
            <label style="display:block;font-weight:700;font-size:13px;margin-bottom:4px;">Change notes</label>
            <textarea name="change_notes" rows="5" style="width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:7px;padding:8px;"></textarea>
          </div>
          <button type="submit" name="action" value="request_changes" style="background:#b45309;color:#fff;border:none;border-radius:7px;padding:9px 12px;font-weight:700;cursor:pointer;margin-right:8px;">Submit Changes</button>
          <button type="submit" name="action" value="approve" style="background:#166534;color:#fff;border:none;border-radius:7px;padding:9px 12px;font-weight:700;cursor:pointer;">Approve</button>
        </form>
      </div>
    `;

    return res.status(200).send(html);
  } catch (err) {
    return res.status(500).send(buildRespondResultHtml('Review Error', err.message || 'Unable to load review form.', 'error'));
  }
});

router.all('/respond', async (req, res) => {
  try {
    await ensureSchema();
    const token = String((req.body && req.body.token) || (req.query && req.query.token) || '').trim();
    const action = String((req.body && req.body.action) || (req.query && req.query.action) || '').trim();
    const addItemsText = String((req.body && req.body.add_items) || (req.query && req.query.add_items) || '').trim();
    const changeNotes = String((req.body && req.body.change_notes) || (req.query && req.query.change_notes) || '').trim();

    const requestRow = await findRequestByToken(token);
    if (!requestRow) {
      return res.status(404).send(buildRespondResultHtml('Review Link Invalid', 'This review link is invalid or no longer exists.', 'error'));
    }

    if (new Date(requestRow.expires_at).getTime() < Date.now()) {
      return res.status(410).send(buildRespondResultHtml('Review Link Expired', 'This review link has expired. Please request a new review email.', 'error'));
    }

    if (String(requestRow.status || '').toLowerCase() === 'approved') {
      return res.status(200).send(buildRespondResultHtml('Already Approved', 'This shopping list has already been approved.', 'ok'));
    }

    const applyResult = await recordResponseAndApplyChanges(requestRow, action, addItemsText, changeNotes, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] || ''
    });

    if (applyResult.action === 'approve') {
      return res.status(200).send(buildRespondResultHtml('Approved', 'Thank you. The shopping list is now marked as approved.', 'ok'));
    }

    return res.status(200).send(buildRespondResultHtml(
      'Changes Saved',
      `Thanks. Your changes were saved to the shopping list (${applyResult.addedItemsCount} new item${applyResult.addedItemsCount === 1 ? '' : 's'} added).`,
      'ok'
    ));
  } catch (err) {
    return res.status(500).send(buildRespondResultHtml('Review Error', err.message || 'Unable to process review response.', 'error'));
  }
});

function getShoppingSmtpConfigSummary() {
  const mailer = createMailer();
  if (!mailer) return 'SMTP not configured';
  const host = String(process.env.SMTP_HOST || '').trim();
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = parseSmtpSecureFlag(process.env.SMTP_SECURE);
  const user = resolveSmtpAuthUser(process.env.SMTP_USER, getFromAddress());
  const fromAddress = getFromAddress();
  return `host=${host} port=${port} secure=${secure} user=${user} from=${fromAddress}`;
}

function formatShoppingSmtpHealthError(err) {
  const message = String(err && err.message ? err.message : err || '').trim();
  if (!message) return 'unknown SMTP error';
  if (/invalid login|username and password not accepted|badcredentials|auth/i.test(message)) {
    return 'gmail authentication failed';
  }
  if (/timed out|timeout/i.test(message)) {
    return 'smtp connection timed out';
  }
  return message;
}

async function sendPreparedShoppingListEmail(options = {}) {
  await ensureSchema();

  const recipientEmail = normalizeEmail(options.recipientEmail);
  const title = String(options.title || 'Shopping List');
  const weekInfo = String(options.weekInfo || 'Upcoming week');
  const scheduleRows = Array.isArray(options.scheduleRows) ? options.scheduleRows : [];
  const ingredientColumns = Array.isArray(options.ingredientColumns) ? options.ingredientColumns : [[], []];
  const ingredientSourceLabel = String(options.ingredientSourceLabel || '').trim();

  if (!isLikelyEmail(recipientEmail)) {
    throw new Error('A valid recipient email is required.');
  }

  const from = getFromAddress();
  if (!from) {
    throw new Error('Email sender is not configured (SMTP_FROM/SMTP_USER).');
  }

  const mailer = createMailer();
  if (!mailer) {
    throw new Error('SMTP is not configured.');
  }

  const subject = `Shopping List: ${title}`;
  const text = [
    `Shopping List: ${title}`,
    `Week: ${weekInfo}`,
    '',
    'Recipes for the week:',
    ...(scheduleRows.length
      ? scheduleRows.flatMap((day) => {
        const dayLabel = String(day && day.label ? day.label : 'Day');
        let dateObj = day && day.dateObj ? day.dateObj : new Date();
        // Handle stringified dates (from JSON serialization)
        if (typeof dateObj === 'string') {
          dateObj = new Date(dateObj);
        }
        const dateLabel = formatScheduleDateLabel(dateObj);
        const entries = Array.isArray(day && day.entries) ? day.entries : [];
        const items = entries.length
          ? entries.map((entry) => {
            const className = String(entry && entry.className ? entry.className : '');
            const titleStr = String(entry && entry.title ? entry.title : 'Recipe');
            return className ? `- ${className}: ${titleStr}` : `- ${titleStr}`;
          })
          : ['- No recipes for this day'];
        return [`${dayLabel}:`, ...items];
      })
      : ['- No recipe schedule available'])
  ].join('\n');

  const mockList = {
    title,
    week_info: weekInfo,
    created_by_name: 'Prepared List',
    created_at: new Date(),
    updated_at: new Date(),
    source_filename: 'Prepared Shopping List',
    parsed_state: {
      columns: ingredientColumns,
      sourceLabel: ingredientSourceLabel
    }
  };

  const html = buildSimpleShoppingListEmailHtml(mockList, scheduleRows);

  console.log(`[SHOPPING-REVIEW] Prepared list send sending to: ${recipientEmail}, from: ${from}, subject: ${subject}`);
  const info = await mailer.sendMail({ from, to: recipientEmail, replyTo: from, subject, text, html });

  const accepted = Array.isArray(info && info.accepted) ? info.accepted : [];
  const rejected = Array.isArray(info && info.rejected) ? info.rejected : [];
  const messageId = String((info && (info.messageId || info.response)) || '');
  console.log(`[SHOPPING-REVIEW] Prepared list send response - accepted: ${accepted.length}, rejected: ${rejected.length}, messageId: ${messageId}`);

  if (!accepted.length) {
    throw new Error('Prepared shopping list email was attempted but no recipients were accepted.');
  }

  await logShoppingDelivery(
    'prepared_list_send',
    recipientEmail,
    from,
    subject,
    messageId,
    accepted.length,
    rejected.length,
    { title, weekInfo }
  );

  let adminNotificationSent = false;
  let adminNotificationRecipients = [];
  let adminNotificationError = '';
  try {
    adminNotificationRecipients = await getShoppingAdminRecipients();
    if (adminNotificationRecipients.length) {
      const adminSubject = `[Prepared Shopping List Sent] ${title}`;
      const adminText = [
        'Prepared shopping list email sent successfully.',
        '',
        `List: ${title}`,
        `Week: ${weekInfo}`,
        `Recipient: ${recipientEmail}`,
        `Accepted: ${accepted.length}`,
        `Rejected: ${rejected.length}`,
        `Message ID: ${messageId || 'N/A'}`,
        `From: ${from}`,
        `Time: ${new Date().toISOString()}`
      ].join('\n');
      for (const adminRecipient of adminNotificationRecipients) {
        const adminInfo = await mailer.sendMail({
          from,
          to: adminRecipient,
          subject: adminSubject,
          text: adminText
        });
        const adminAccepted = Array.isArray(adminInfo && adminInfo.accepted) ? adminInfo.accepted.length : 0;
        const adminRejected = Array.isArray(adminInfo && adminInfo.rejected) ? adminInfo.rejected.length : 0;
        const adminMessageId = String((adminInfo && (adminInfo.messageId || adminInfo.response)) || '');
        await logShoppingDelivery(
          'admin_receipt',
          adminRecipient,
          from,
          adminSubject,
          adminMessageId,
          adminAccepted,
          adminRejected,
          {
            sourcePreparedList: title,
            sourceRecipient: recipientEmail,
            sourceMessageId: messageId || ''
          }
        );
      }
      adminNotificationSent = true;
    }
  } catch (err) {
    adminNotificationError = err && err.message ? err.message : String(err || 'Failed to send admin receipt.');
    console.warn('[SHOPPING-REVIEW] Admin receipt email failed:', adminNotificationError);
  }

  return {
    deliveryChannel: 'smtp',
    recipientEmail,
    acceptedCount: accepted.length,
    rejectedCount: rejected.length,
    messageId,
    adminNotificationSent,
    adminNotificationRecipients
  };
}

async function logShoppingMailerHealthCheck() {
  const mailer = createMailer();
  if (!mailer) {
    console.warn('[SHOPPING-REVIEW] SMTP self-test skipped: missing SMTP_HOST/SMTP_USER/SMTP_PASS.', getShoppingSmtpConfigSummary());
    return;
  }

  try {
    await mailer.verify();
    console.log('[SHOPPING-REVIEW] SMTP self-test passed.', getShoppingSmtpConfigSummary());
  } catch (err) {
    console.error('[SHOPPING-REVIEW] SMTP self-test failed:', formatShoppingSmtpHealthError(err), getShoppingSmtpConfigSummary());
  }
}

router.post('/send-prepared-list', async (req, res) => {
  try {
    const sent = await sendPreparedShoppingListEmail({
      recipientEmail: req.body && req.body.recipientEmail,
      title: req.body && req.body.title,
      weekInfo: req.body && req.body.weekInfo,
      scheduleRows: req.body && req.body.scheduleRows,
      ingredientColumns: req.body && req.body.ingredientColumns,
      ingredientSourceLabel: req.body && req.body.ingredientSourceLabel
    });
    return res.json(Object.assign({ success: true }, sent));
  } catch (err) {
    const status = /not configured|locked/i.test(String(err && err.message || '')) ? 503 : 400;
    return res.status(status).json({ success: false, error: err.message || 'Failed to send prepared shopping list email.' });
  }
});

module.exports = router;
module.exports.processDueSchedules = processDueSchedules;
module.exports.logShoppingMailerHealthCheck = logShoppingMailerHealthCheck;
