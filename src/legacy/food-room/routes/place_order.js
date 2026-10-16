'use strict';

const express = require('express');
const nodemailer = require('../mailShim');
const pool = require('../db');
const { requireAdmin } = require('../middleware/requireAdmin');

const router = express.Router();

const ROLE_PRIORITY = ['admin', 'lead_teacher', 'teacher', 'technician', 'student', 'public_access'];
const PLACE_ORDER_ALLOWED_ROLES = new Set(['admin', 'lead_teacher', 'teacher']);
const DEFAULT_PILOT_RECIPIENT = 'vanessapringle@westlandhigh.school.nz';
const DEFAULT_ADMIN_COPY_RECIPIENT = 'tech@westlandhigh.school.nz';
const DEFAULT_PLACE_ORDER_FROM_ADDRESS = 'tech@westlandhigh.school.nz';
const DEFAULT_GOOGLE_FORM_EDIT_URL = 'https://docs.google.com/forms/d/1BD9mD_tGjrWcujbPfMp7JtDOuSdSpmb97_EWKt6mXyo/edit';
const DEFAULT_GOOGLE_SHEET_RESPONSES_EDIT_URL = 'https://docs.google.com/spreadsheets/d/1dwlodt5NtO13MxB8MDktqJgP9Yvf9oLVajDFSSw-jmM/edit?usp=sharing';

let schemaReady = false;
let schemaReadyPromise = null;

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

function isLikelyEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function getSiteUrl() {
  return String(process.env.SITE_URL || process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || 'https://recipe-calculator-backend.onrender.com').replace(/\/$/, '');
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

function getFromAddress() {
  return String(process.env.PLACE_ORDER_EMAIL_FROM || process.env.SMTP_FROM || DEFAULT_PLACE_ORDER_FROM_ADDRESS).trim();
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

function createMailer() {
  const host = String(process.env.SMTP_HOST || '').trim();
  const user = resolveSmtpAuthUser(process.env.SMTP_USER, getFromAddress());
  const rawPass = String(process.env.SMTP_PASS || '').trim();
  const pass = /(^|\.)gmail\.com$/i.test(host) ? rawPass.replace(/\s+/g, '') : rawPass;
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

function nowInNz() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Pacific/Auckland',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(new Date());

  const map = {};
  parts.forEach((part) => {
    if (part && part.type && part.type !== 'literal') map[part.type] = part.value;
  });

  return {
    year: Number(map.year || 0),
    month: Number(map.month || 1),
    day: Number(map.day || 1),
    hour: Number(map.hour || 0),
    minute: Number(map.minute || 0),
    second: Number(map.second || 0),
    isoDate: `${map.year}-${map.month}-${map.day}`
  };
}

function mondayFromYmd(ymd) {
  const dateOnly = String(ymd || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) return '';
  const d = new Date(`${dateOnly}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  const dow = d.getUTCDay();
  const diffToMonday = (dow + 6) % 7;
  d.setUTCDate(d.getUTCDate() - diffToMonday);
  return d.toISOString().slice(0, 10);
}

function dateOffsetIso(isoDate, offsetDays) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(isoDate || '').trim())) return '';
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Number(offsetDays || 0));
  return d.toISOString().slice(0, 10);
}

function nextMondayAfterIso(isoDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(isoDate || '').trim())) return '';
  const d = new Date(`${isoDate}T00:00:00Z`);
  const dayOfWeek = d.getUTCDay();
  const daysUntilMonday = ((8 - dayOfWeek) % 7) || 7;
  d.setUTCDate(d.getUTCDate() + daysUntilMonday);
  return d.toISOString().slice(0, 10);
}

function longDateLabel(isoDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(isoDate || '').trim())) return String(isoDate || '').trim();
  const d = new Date(`${isoDate}T00:00:00Z`);
  try {
    return d.toLocaleDateString('en-NZ', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'Pacific/Auckland'
    });
  } catch (_) {
    return isoDate;
  }
}

function shortDateLabel(isoDate) {
  const raw = String(isoDate || '').trim();
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return raw;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function parseCsv(text) {
  const raw = String(text || '');
  const lines = raw.split(/\r?\n/).filter((line) => line.trim() !== '');
  if (!lines.length) return { headers: [], rows: [] };

  const headers = parseCsvLine(lines[0]).map((h) => String(h || '').trim());
  const rows = lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row = {};
    headers.forEach((header, idx) => {
      row[header] = String(values[idx] == null ? '' : values[idx]).trim();
    });
    return row;
  });

  return { headers, rows };
}

function findHeaderKey(headers, candidates) {
  const normalized = headers.map((h) => ({ raw: h, norm: String(h || '').trim().toLowerCase() }));
  for (const candidate of candidates) {
    const target = String(candidate || '').trim().toLowerCase();
    const exact = normalized.find((entry) => entry.norm === target);
    if (exact) return exact.raw;
  }
  for (const candidate of candidates) {
    const target = String(candidate || '').trim().toLowerCase();
    const contains = normalized.find((entry) => entry.norm.includes(target));
    if (contains) return contains.raw;
  }
  return '';
}

function splitItems(value) {
  return String(value || '')
    .split(/\r?\n|;|\u2022|\-|,/)
    .map((item) => String(item || '').trim())
    .filter(Boolean);
}

function splitItemsLoose(value) {
  return String(value || '')
    .split(/\r?\n|;|\u2022|,/)
    .map((item) => String(item || '').trim())
    .filter(Boolean);
}

function parseTimestampToIso(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  const m = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!m) return '';
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  const hh = Number(m[4] || 0);
  const mm = Number(m[5] || 0);
  const ss = Number(m[6] || 0);
  const d = new Date(Date.UTC(year, month - 1, day, hh, mm, ss));
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}

function deriveNameFromEmail(email) {
  const local = String(email || '').split('@')[0] || '';
  if (!local) return '';
  return local
    .split(/[._\-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
    .trim();
}

function normalizeFormRows(headers, rows) {
  const timestampKey = findHeaderKey(headers, ['Timestamp', 'Submitted at', 'Date']);
  const emailKey = findHeaderKey(headers, ['Email Address', 'Email', 'Teacher Email']);
  const teacherKey = findHeaderKey(headers, ['Teacher', 'Name']);
  const classKey = findHeaderKey(headers, ['Class', 'Class Name']);
  const dayKey = findHeaderKey(headers, ['Day']);
  const itemsKey = findHeaderKey(headers, ['Items', 'Items Needed', 'Item request', 'What do you need purchased']);

  return rows
    .map((row) => {
      const submittedAtIso = parseTimestampToIso(timestampKey ? row[timestampKey] : '');
      const submittedDate = submittedAtIso ? submittedAtIso.slice(0, 10) : '';
      const email = normalizeEmail(emailKey ? row[emailKey] : '');
      const explicitTeacherName = String(teacherKey ? row[teacherKey] : '').trim();
      const items = splitItems(itemsKey ? row[itemsKey] : '');

      return {
        submitted_at_iso: submittedAtIso,
        submitted_date: submittedDate,
        email,
        teacher_name: explicitTeacherName || deriveNameFromEmail(email),
        class_name: String(classKey ? row[classKey] : '').trim(),
        day_label: String(dayKey ? row[dayKey] : '').trim(),
        items,
        raw_items_text: String(itemsKey ? row[itemsKey] : '').trim()
      };
    })
    .filter((row) => row.email || row.teacher_name || row.items.length > 0)
    .sort((a, b) => String(b.submitted_at_iso || '').localeCompare(String(a.submitted_at_iso || '')));
}

function parseManualImportText(text, fallbackEmail) {
  const raw = String(text || '').trim();
  if (!raw) return [];

  const blocks = raw.split(/\n\s*\n+/).map((b) => b.trim()).filter(Boolean);
  const out = [];

  blocks.forEach((block) => {
    const lines = block.split(/\r?\n/).map((line) => String(line || '').trim()).filter(Boolean);
    if (!lines.length) return;

    let teacherName = '';
    let className = '';
    let dayLabel = '';
    let email = normalizeEmail(fallbackEmail || '');
    const itemLines = [];

    lines.forEach((line) => {
      const lower = line.toLowerCase();
      if (lower.startsWith('teacher:')) {
        teacherName = line.split(':').slice(1).join(':').trim();
        return;
      }
      if (lower.startsWith('name:')) {
        teacherName = teacherName || line.split(':').slice(1).join(':').trim();
        return;
      }
      if (lower.startsWith('email:')) {
        email = normalizeEmail(line.split(':').slice(1).join(':').trim() || email);
        return;
      }
      if (lower.startsWith('class:')) {
        className = line.split(':').slice(1).join(':').trim();
        return;
      }
      if (lower.startsWith('day:')) {
        dayLabel = line.split(':').slice(1).join(':').trim();
        return;
      }
      if (lower.startsWith('items:')) {
        const rest = line.split(':').slice(1).join(':').trim();
        if (rest) itemLines.push(rest);
        return;
      }

      const cleanedBullet = line.replace(/^[-*]\s*/, '').trim();
      if (cleanedBullet) itemLines.push(cleanedBullet);
    });

    const items = splitItemsLoose(itemLines.join('\n'));
    if (!items.length) return;

    out.push({
      submitted_at_iso: new Date().toISOString(),
      submitted_date: new Date().toISOString().slice(0, 10),
      email,
      teacher_name: teacherName,
      class_name: className,
      day_label: dayLabel,
      items,
      raw_items_text: itemLines.join('\n')
    });
  });

  return out;
}

async function ensureSchema() {
  if (schemaReady) return true;
  if (schemaReadyPromise) return schemaReadyPromise;

  schemaReadyPromise = (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS place_order_email_log (
        id SERIAL PRIMARY KEY,
        send_key TEXT UNIQUE NOT NULL,
        recipient_email TEXT NOT NULL,
        subject TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'sent',
        source TEXT NOT NULL DEFAULT 'scheduler',
        message_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS place_order_email_log_recipient_idx ON place_order_email_log(lower(recipient_email), created_at DESC)');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS place_order_recipients (
        id SERIAL PRIMARY KEY,
        recipient_email TEXT UNIQUE NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_by_email TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS place_order_recipients_active_idx ON place_order_recipients(is_active, recipient_email)');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS place_order_bulk_recipients (
        id SERIAL PRIMARY KEY,
        recipient_email TEXT UNIQUE NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_by_email TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS place_order_bulk_recipients_active_idx ON place_order_bulk_recipients(is_active, recipient_email)');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS place_order_manual_imports (
        id SERIAL PRIMARY KEY,
        owner_email TEXT NOT NULL,
        submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        source TEXT NOT NULL DEFAULT 'manual_import',
        teacher_name TEXT,
        class_name TEXT,
        day_label TEXT,
        items_json JSONB NOT NULL DEFAULT '[]'::jsonb,
        raw_text TEXT,
        week_start DATE,
        week_end DATE
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS place_order_manual_imports_owner_idx ON place_order_manual_imports(lower(owner_email), submitted_at DESC)');
    schemaReady = true;
    return true;
  })().catch((err) => {
    schemaReady = false;
    schemaReadyPromise = null;
    throw err;
  });

  return schemaReadyPromise;
}

function getPilotRecipient() {
  return normalizeEmail(process.env.PLACE_ORDER_PILOT_RECIPIENT || DEFAULT_PILOT_RECIPIENT);
}

function getAdminCopyRecipients() {
  const configured = String(process.env.PLACE_ORDER_ADMIN_COPY_RECIPIENTS || process.env.PLACE_ORDER_ADMIN_COPY_RECIPIENT || DEFAULT_ADMIN_COPY_RECIPIENT || '')
    .split(',')
    .map((entry) => normalizeEmail(entry))
    .filter(Boolean)
    .filter((email, index, array) => array.indexOf(email) === index);

  return configured.filter((email) => isLikelyEmail(email));
}

async function getActiveTestRecipients() {
  await ensureSchema();

  const rows = await pool.query(
    `SELECT lower(trim(recipient_email)) AS recipient_email
     FROM place_order_recipients
     WHERE is_active = true
     ORDER BY lower(trim(recipient_email))`
  );

  const recipients = rows.rows
    .map((row) => normalizeEmail(row.recipient_email))
    .filter((email) => isLikelyEmail(email));

  if (recipients.length) return recipients;
  return [getPilotRecipient()].filter((email) => isLikelyEmail(email));
}

async function getActiveBulkRecipients() {
  await ensureSchema();

  const rows = await pool.query(
    `SELECT lower(trim(recipient_email)) AS recipient_email
     FROM place_order_bulk_recipients
     WHERE is_active = true
     ORDER BY lower(trim(recipient_email))`
  );

  return rows.rows
    .map((row) => normalizeEmail(row.recipient_email))
    .filter((email) => isLikelyEmail(email));
}

async function getActiveRecipients() {
  const bulkRecipients = await getActiveBulkRecipients();
  if (bulkRecipients.length) return bulkRecipients;
  return getActiveTestRecipients();
}

function normalizeGoogleFormUrl(rawUrl) {
  const value = String(rawUrl || '').trim();
  if (!value) return '';

  try {
    const parsed = new URL(value);
    const match = parsed.pathname.match(/\/forms\/d\/([^/]+)/i);
    if (match && match[1]) {
      return `https://docs.google.com/forms/d/${match[1]}/viewform`;
    }
  } catch (_) {}

  return value;
}

function normalizeGoogleSheetCsvUrl(rawUrl) {
  const value = String(rawUrl || '').trim();
  if (!value) return '';

  if (/\/export\?/i.test(value) || /[?&]output=csv/i.test(value)) {
    return value;
  }

  try {
    const parsed = new URL(value);
    const match = parsed.pathname.match(/\/spreadsheets\/d\/([^/]+)/i);
    if (!match || !match[1]) return value;
    const gid = String(parsed.searchParams.get('gid') || '0').trim() || '0';
    return `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv&gid=${encodeURIComponent(gid)}`;
  } catch (_) {
    return value;
  }
}

function getGoogleFormUrl() {
  const configured = String(process.env.PLACE_ORDER_GOOGLE_FORM_URL || '').trim();
  return normalizeGoogleFormUrl(configured || DEFAULT_GOOGLE_FORM_EDIT_URL);
}

function getGoogleFormResponsesCsvUrl() {
  const configured = String(process.env.PLACE_ORDER_GOOGLE_FORM_RESPONSES_CSV_URL || process.env.PLACE_ORDER_GOOGLE_SHEET_CSV_URL || '').trim();
  return normalizeGoogleSheetCsvUrl(configured || DEFAULT_GOOGLE_SHEET_RESPONSES_EDIT_URL);
}

function getAuthEmail(req) {
  return normalizeEmail(req && req.authUserEmail ? req.authUserEmail : '');
}

async function resolveEffectiveRoleForEmail(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return 'public_access';

  if (getBootstrapAdminEmails().has(normalizedEmail)) {
    return 'admin';
  }

  const staffResult = await pool.query(
    `SELECT COALESCE(NULLIF(lower(trim(primary_role)), ''), 'staff') AS primary_role
     FROM staff_upload
     WHERE COALESCE(status, 'Current') = 'Current'
       AND lower(trim(email_school)) = lower(trim($1))
     LIMIT 1`,
    [normalizedEmail]
  );

  const roleSet = new Set();
  if (staffResult.rowCount > 0) roleSet.add(String(staffResult.rows[0].primary_role || 'staff').trim().toLowerCase());

  const additionalRolesResult = await pool.query(
    `SELECT lower(trim(role_name)) AS role_name
     FROM user_additional_roles
     WHERE user_type = 'staff'
       AND lower(trim(email)) = lower(trim($1))`,
    [normalizedEmail]
  );

  additionalRolesResult.rows.forEach((row) => {
    const role = String(row.role_name || '').trim().toLowerCase();
    if (role) roleSet.add(role);
  });

  if (!roleSet.size) return 'public_access';
  for (const preferred of ROLE_PRIORITY) {
    if (roleSet.has(preferred)) return preferred;
  }
  return 'public_access';
}

async function isPlaceOrderAllowedForEmail(email) {
  const role = await resolveEffectiveRoleForEmail(email);
  if (!PLACE_ORDER_ALLOWED_ROLES.has(role)) {
    return { allowed: false, role };
  }

  const permissionResult = await pool.query(
    `SELECT place_order
     FROM role_permissions
     WHERE lower(trim(role_name)) = lower(trim($1))
     LIMIT 1`,
    [role]
  );

  if (!permissionResult.rowCount) {
    return { allowed: PLACE_ORDER_ALLOWED_ROLES.has(role), role };
  }

  return { allowed: Boolean(permissionResult.rows[0].place_order), role };
}

function resolveRolePriority(roles) {
  const normalizedRoles = Array.from(new Set((roles || []).map((role) => String(role || '').trim().toLowerCase()).filter(Boolean)));
  if (!normalizedRoles.length) return 'public_access';
  for (const preferred of ROLE_PRIORITY) {
    if (normalizedRoles.includes(preferred)) return preferred;
  }
  return normalizedRoles[0];
}

async function listEligibleBulkTeachers() {
  await ensureSchema();

  const permissionsResult = await pool.query(
    `SELECT lower(trim(role_name)) AS role_name, place_order
     FROM role_permissions`
  );
  const placeOrderByRole = new Map();
  permissionsResult.rows.forEach((row) => {
    const roleName = String(row.role_name || '').trim().toLowerCase();
    if (roleName) placeOrderByRole.set(roleName, Boolean(row.place_order));
  });

  const result = await pool.query(
    `SELECT
       s.code,
       s.first_name,
       s.last_name,
       s.email_school,
       COALESCE(NULLIF(lower(trim(s.primary_role)), ''), 'staff') AS primary_role,
       COALESCE(
         array_remove(array_agg(DISTINCT lower(trim(uar.role_name))), NULL),
         ARRAY[]::text[]
       ) AS additional_roles
     FROM staff_upload s
     LEFT JOIN user_additional_roles uar
       ON uar.user_type = 'staff'
      AND lower(trim(uar.email)) = lower(trim(s.email_school))
     WHERE COALESCE(s.status, 'Current') = 'Current'
       AND trim(COALESCE(s.email_school, '')) <> ''
     GROUP BY s.code, s.first_name, s.last_name, s.email_school, s.primary_role`
  );

  const staff = [];
  result.rows.forEach((row) => {
    const email = normalizeEmail(row.email_school);
    if (!isLikelyEmail(email)) return;

    const roleSet = [];
    if (getBootstrapAdminEmails().has(email)) roleSet.push('admin');
    roleSet.push(String(row.primary_role || '').trim().toLowerCase());
    if (Array.isArray(row.additional_roles)) {
      row.additional_roles.forEach((role) => roleSet.push(String(role || '').trim().toLowerCase()));
    }

    const effectiveRole = resolveRolePriority(roleSet);
    const placeOrderAllowed = placeOrderByRole.has(effectiveRole)
      ? Boolean(placeOrderByRole.get(effectiveRole))
      : PLACE_ORDER_ALLOWED_ROLES.has(effectiveRole);
    if (!placeOrderAllowed) return;

    const firstName = String(row.first_name || '').trim();
    const lastName = String(row.last_name || '').trim();
    const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
    const displayName = fullName || email;
    const roleLabel = effectiveRole.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');

    staff.push({
      code: String(row.code || '').trim(),
      email,
      first_name: firstName,
      last_name: lastName,
      full_name: displayName,
      effective_role: effectiveRole,
      effective_role_label: roleLabel,
      search_label: `${displayName} <${email}>${row.code ? ` - ${String(row.code).trim()}` : ''}`
    });
  });

  staff.sort((a, b) => {
    const nameCompare = String(a.full_name || '').localeCompare(String(b.full_name || ''), undefined, { sensitivity: 'base' });
    if (nameCompare !== 0) return nameCompare;
    return String(a.email || '').localeCompare(String(b.email || ''), undefined, { sensitivity: 'base' });
  });

  return staff;
}

async function requirePlaceOrderAccess(req, res, next) {
  try {
    const email = getAuthEmail(req);
    if (!email) return res.status(401).json({ success: false, error: 'Sign in required.' });

    const allowedInfo = await isPlaceOrderAllowedForEmail(email);
    if (!allowedInfo.allowed) {
      return res.status(403).json({ success: false, error: 'Place Order is available to teachers only.', role: allowedInfo.role });
    }

    req.placeOrderAccess = allowedInfo;
    return next();
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || 'Unable to check access.' });
  }
}

async function fetchTeacherProfileByEmail(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  const result = await pool.query(
    `SELECT id, code, first_name, last_name, email_school
     FROM staff_upload
     WHERE COALESCE(status, 'Current') = 'Current'
       AND lower(trim(email_school)) = lower(trim($1))
     LIMIT 1`,
    [normalizedEmail]
  );

  if (!result.rowCount) return null;

  const staff = result.rows[0];
  const teacherCode = String(staff.code || '').trim();
  const teacherNameGuess = `${String(staff.last_name || '').trim()}, ${String(staff.first_name || '').trim()}`.trim();

  const timetableResult = await pool.query(
    `SELECT *
     FROM kamar_timetable
     WHERE COALESCE(status, 'Current') = 'Current'
       AND (
         (trim($1) <> '' AND upper(trim("Teacher")) = upper(trim($1)))
         OR lower(trim("Teacher_Name")) = lower(trim($2))
       )
     LIMIT 1`,
    [teacherCode, teacherNameGuess]
  );

  const row = timetableResult.rows[0] || null;
  const keys = [
    { day: 'Monday', key: 'D1' },
    { day: 'Tuesday', key: 'D2' },
    { day: 'Wednesday', key: 'D3' },
    { day: 'Thursday', key: 'D4' },
    { day: 'Friday', key: 'D5' }
  ];

  const week = row
    ? keys.map(({ day, key }) => {
        const p1 = [row[`${key}_P1_1`], row[`${key}_P1_2`]].map((v) => String(v || '').trim()).filter(Boolean);
        const p2 = String(row[`${key}_P2`] || '').trim();
        const p3 = String(row[`${key}_P3`] || '').trim();
        const p4 = String(row[`${key}_P4`] || '').trim();
        const p5 = String(row[`${key}_P5`] || '').trim();
        return {
          day,
          periods: {
            P1: p1,
            P2: p2 ? [p2] : [],
            P3: p3 ? [p3] : [],
            P4: p4 ? [p4] : [],
            P5: p5 ? [p5] : []
          }
        };
      })
    : [];

  return {
    first_name: String(staff.first_name || '').trim(),
    last_name: String(staff.last_name || '').trim(),
    email_school: normalizedEmail,
    teacher_code: teacherCode,
    timetable: week
  };
}

function summarizeRunningItems(submissions) {
  const counts = new Map();
  submissions.forEach((row) => {
    const submitter = String(row.teacher_name || row.email || 'Teacher').trim() || 'Teacher';
    (Array.isArray(row.items) ? row.items : []).forEach((item) => {
      const key = String(item || '').trim().toLowerCase();
      if (!key) return;
      const current = counts.get(key) || {
        item: String(item || '').trim(),
        count: 0,
        submitters_map: new Map()
      };
      current.count += 1;
      current.submitters_map.set(submitter, (current.submitters_map.get(submitter) || 0) + 1);
      counts.set(key, current);
    });
  });

  return Array.from(counts.values()).map((entry) => {
    const submitters = Array.from(entry.submitters_map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return a.name.localeCompare(b.name);
      });

    return {
      item: entry.item,
      count: entry.count,
      submitters,
      submitter_names: submitters.map((row) => row.name),
      submitter_summary: submitters.map((row) => `${row.name} (${row.count})`).join(', ')
    };
  }).sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.item.localeCompare(b.item);
  });
}

async function loadGoogleFormSubmissions() {
  const csvUrl = getGoogleFormResponsesCsvUrl();
  if (!csvUrl) {
    return { submissions: [], sourceReady: false, sourceMessage: 'Set PLACE_ORDER_GOOGLE_FORM_RESPONSES_CSV_URL to display Google Form responses.' };
  }

  let response;
  try {
    response = await fetch(csvUrl, { method: 'GET' });
  } catch (err) {
    return { submissions: [], sourceReady: false, sourceMessage: `Unable to fetch Google Form responses: ${err.message}` };
  }

  if (!response.ok) {
    return {
      submissions: [],
      sourceReady: false,
      sourceMessage: `Google Form responses endpoint returned ${response.status} ${response.statusText}.`
    };
  }

  const csvText = await response.text();
  const parsed = parseCsv(csvText);
  const submissions = normalizeFormRows(parsed.headers, parsed.rows);
  return { submissions, sourceReady: true, sourceMessage: '' };
}

async function loadManualImportPreviewForWeek(weekStart) {
  await ensureSchema();
  const normalizedWeekStart = String(weekStart || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedWeekStart)) return [];

  const result = await pool.query(
    `SELECT teacher_name, class_name, day_label, raw_text, items_json, submitted_at
     FROM place_order_manual_imports
     WHERE week_start = $1::date
     ORDER BY submitted_at ASC, id ASC`,
    [normalizedWeekStart]
  );

  return result.rows.map((row) => ({
    teacher_name: String(row.teacher_name || '').trim(),
    class_name: String(row.class_name || '').trim(),
    day_label: String(row.day_label || '').trim(),
    raw_text: String(row.raw_text || '').trim(),
    items: Array.isArray(row.items_json) ? row.items_json.map((item) => String(item || '').trim()).filter(Boolean) : []
  }));
}

async function runLiveSourceCheck() {
  const formUrl = getGoogleFormUrl();
  const csvUrl = getGoogleFormResponsesCsvUrl();

  const result = {
    checked_at: new Date().toISOString(),
    resolved_form_url: formUrl,
    resolved_csv_url: csvUrl,
    csv_fetch_ok: false,
    csv_status: '',
    csv_header_count: 0,
    csv_row_count: 0,
    sample_rows: [],
    message: ''
  };

  if (!csvUrl) {
    result.message = 'No CSV URL configured.';
    return result;
  }

  let response;
  try {
    response = await fetch(csvUrl, { method: 'GET' });
  } catch (err) {
    result.message = err && err.message ? err.message : 'CSV fetch failed.';
    return result;
  }

  result.csv_status = `${response.status} ${response.statusText}`;
  if (!response.ok) {
    result.message = `CSV endpoint returned ${result.csv_status}.`;
    return result;
  }

  const csvText = await response.text();
  const parsed = parseCsv(csvText);
  const normalizedRows = normalizeFormRows(parsed.headers, parsed.rows);

  result.csv_fetch_ok = true;
  result.csv_header_count = parsed.headers.length;
  result.csv_row_count = normalizedRows.length;
  result.sample_rows = normalizedRows.slice(0, 3);
  result.message = 'CSV loaded successfully.';
  return result;
}

function buildPilotEmailHtml(payload) {
  const teacherName = String(payload.teacherName || '').trim();
  const formUrl = String(payload.formUrl || '').trim();
  const weekStart = String(payload.weekStart || '').trim();
  const weekEnd = String(payload.weekEnd || '').trim();
  const deadline = String(payload.deadline || '').trim();
  const plannerPreview = Array.isArray(payload.plannerPreview) ? payload.plannerPreview : [];
  const greeting = teacherName ? `Hi ${esc(teacherName)},` : 'Hi,';
  const subjectWeek = weekStart && weekEnd ? `${shortDateLabel(weekStart)} to ${shortDateLabel(weekEnd)}` : 'this week';
  const deadlineLabel = deadline ? longDateLabel(deadline) : '';
  const plannerHtml = plannerPreview.length
    ? `
      <div style="margin-top:22px;border:1px solid #dbe4f0;border-radius:10px;padding:16px;background:#f8fbff;">
        <h3 style="margin:0 0 10px;color:#0f5da6;font-size:18px;">Planning Snapshot</h3>
        <p style="margin:0 0 12px;color:#475569;">Use the notes below as a reference when completing the form.</p>
        ${plannerPreview.map((entry) => {
          const title = [entry.class_name, entry.teacher_name].filter(Boolean).join(' - ') || 'Planning Notes';
          const meta = entry.day_label ? `<div style="font-size:12px;color:#64748b;margin:0 0 8px;">${esc(entry.day_label)}</div>` : '';
          const rawLines = String(entry.raw_text || '').split(/\r?\n/).map((line) => String(line || '').trim()).filter(Boolean);
          const detailHtml = rawLines.length
            ? `<div style="white-space:pre-wrap;font-size:14px;color:#1f2937;line-height:1.55;">${esc(rawLines.join('\n'))}</div>`
            : `<ul style="margin:0;padding-left:18px;color:#1f2937;">${(Array.isArray(entry.items) ? entry.items : []).map((item) => `<li>${esc(item)}</li>`).join('')}</ul>`;
          return `
            <div style="padding:12px 0;border-top:1px solid #dbe4f0;">
              <div style="font-weight:700;color:#0f172a;margin:0 0 4px;">${esc(title)}</div>
              ${meta}
              ${detailHtml}
            </div>
          `;
        }).join('')}
      </div>
    `
    : '';

  return `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#1f2937;max-width:640px;margin:0 auto;padding:18px;">
      <h2 style="margin:0 0 10px;color:#0f5da6;">Place Order Request</h2>
      <p>${greeting}</p>
      <p>Please submit items your classes need purchased for <strong>${esc(subjectWeek)}</strong>.</p>
      ${deadlineLabel ? `<p><strong>Please complete this by ${esc(deadlineLabel)}.</strong></p>` : ''}
      <p>
        <a href="${esc(formUrl)}" style="display:inline-block;background:#0f5da6;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:700;">Open Place Order Form</a>
      </p>
      <p style="margin-top:14px;color:#475569;">After submission, your requests appear on the Ordering page in Food Room.</p>
      ${plannerHtml}
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:18px 0;">
      <p style="font-size:12px;color:#64748b;">Automated Tuesday reminder from Westland High School Food Room. Submission window closes the following Monday.</p>
    </div>
  `;
}

function buildPilotEmailText(payload) {
  const weekStart = String(payload.weekStart || '').trim();
  const weekEnd = String(payload.weekEnd || '').trim();
  const formUrl = String(payload.formUrl || '').trim();
  const deadline = String(payload.deadline || '').trim();
  const plannerPreview = Array.isArray(payload.plannerPreview) ? payload.plannerPreview : [];

  const lines = [
    'Place Order Request',
    '',
    weekStart && weekEnd
      ? `Please submit items your classes need purchased for ${shortDateLabel(weekStart)} to ${shortDateLabel(weekEnd)}.`
      : 'Please submit items your classes need purchased.',
    deadline ? `Please complete this by ${longDateLabel(deadline)}.` : '',
    '',
    `Open Place Order Form: ${formUrl}`,
    '',
    'After submission, your requests appear on the Ordering page in Food Room.'
  ].filter(Boolean);

  if (plannerPreview.length) {
    lines.push('', 'Planning Snapshot');
    plannerPreview.forEach((entry) => {
      const title = [entry.class_name, entry.teacher_name].filter(Boolean).join(' - ') || 'Planning Notes';
      lines.push('', title);
      if (entry.day_label) lines.push(entry.day_label);
      const rawText = String(entry.raw_text || '').trim();
      if (rawText) {
        lines.push(rawText);
      } else {
        (Array.isArray(entry.items) ? entry.items : []).forEach((item) => {
          lines.push(`- ${item}`);
        });
      }
    });
  }

  lines.push('', 'Automated Tuesday reminder from Westland High School Food Room. Submission window closes the following Monday.');
  return lines.join('\n');
}

async function sendReminderToRecipient(recipientEmail, options = {}) {
  await ensureSchema();

  const normalizedRecipient = normalizeEmail(recipientEmail);
  if (!normalizedRecipient) throw new Error('No pilot recipient is configured.');

  const formUrl = getGoogleFormUrl();
  if (!formUrl) throw new Error('PLACE_ORDER_GOOGLE_FORM_URL is not configured.');

  const nz = nowInNz();
  const sendDateIso = String(options.sendDate || nz.isoDate).trim() || nz.isoDate;
  const mondayIso = mondayFromYmd(sendDateIso);
  const fridayIso = dateOffsetIso(mondayIso, 4);
  const deadlineIso = nextMondayAfterIso(sendDateIso);
  const plannerPreview = await loadManualImportPreviewForWeek(mondayIso);
  const sendKeyDate = options.sendKeyDate || sendDateIso;
  const sendKey = `${sendKeyDate}|${normalizedRecipient}|place-order-tuesday`;

  const existing = await pool.query('SELECT id FROM place_order_email_log WHERE send_key = $1 LIMIT 1', [sendKey]);
  if (existing.rowCount > 0) {
    return { success: true, skipped: true, reason: 'already-sent', recipientEmail: normalizedRecipient, sendKey };
  }

  const mailer = createMailer();
  const verified = await verifyMailer(mailer, 12000);
  if (!verified.smtpReady) throw new Error(verified.smtpError || 'SMTP is not ready.');

  const profile = await fetchTeacherProfileByEmail(normalizedRecipient);
  const teacherName = profile
    ? `${String(profile.first_name || '').trim()} ${String(profile.last_name || '').trim()}`.trim()
    : '';

  const subject = deadlineIso
    ? `Place Order Request - Due ${shortDateLabel(deadlineIso)}`
    : `Place Order Request - Week ${shortDateLabel(mondayIso)} to ${shortDateLabel(fridayIso)}`;
  const emailPayload = {
    teacherName,
    formUrl,
    weekStart: mondayIso,
    weekEnd: fridayIso,
    deadline: deadlineIso,
    plannerPreview
  };
  const html = buildPilotEmailHtml(emailPayload);
  const text = buildPilotEmailText(emailPayload);

  const adminCopyRecipients = getAdminCopyRecipients().filter((email) => email !== normalizedRecipient);
  const bcc = adminCopyRecipients.length ? adminCopyRecipients : undefined;

  const result = await mailer.sendMail({
    from: getFromAddress(),
    to: normalizedRecipient,
    bcc,
    subject,
    html,
    text
  });

  await pool.query(
    `INSERT INTO place_order_email_log (send_key, recipient_email, subject, status, source, message_id)
     VALUES ($1, $2, $3, 'sent', $4, $5)`,
    [sendKey, normalizedRecipient, subject, String(options.source || 'manual'), String(result && result.messageId ? result.messageId : '')]
  );

  return {
    success: true,
    skipped: false,
    recipientEmail: normalizedRecipient,
    adminCopyRecipients,
    sendKey,
    messageId: String(result && result.messageId ? result.messageId : '')
  };
}

async function sendPilotReminderEmail(options = {}) {
  const recipients = Array.isArray(options.recipients) && options.recipients.length
    ? options.recipients
    : (options.listType === 'test'
      ? await getActiveTestRecipients()
      : options.listType === 'bulk'
        ? await getActiveBulkRecipients()
        : await getActiveRecipients());

  const results = [];
  for (const recipient of recipients) {
    try {
      const sent = await sendReminderToRecipient(recipient, options);
      results.push(sent);
    } catch (err) {
      results.push({ success: false, skipped: false, recipientEmail: normalizeEmail(recipient), error: err.message || 'send-failed' });
    }
  }

  return {
    success: true,
    recipients: recipients.length,
    sent: results.filter((r) => r && r.success && !r.skipped).length,
    skipped: results.filter((r) => r && r.success && r.skipped).length,
    failed: results.filter((r) => !r || !r.success).length,
    results
  };
}

router.get('/dashboard', requirePlaceOrderAccess, async (req, res) => {
  try {
    const requestEmail = getAuthEmail(req);
    const requestedWeekStart = String(req.query.week_start || '').trim();
    const now = nowInNz();
    const activeWeekStart = /^\d{4}-\d{2}-\d{2}$/.test(requestedWeekStart)
      ? mondayFromYmd(requestedWeekStart)
      : mondayFromYmd(now.isoDate);
    const activeWeekEnd = dateOffsetIso(activeWeekStart, 6);
    const timelineStart = dateOffsetIso(activeWeekStart, 1);
    const timelineEnd = dateOffsetIso(activeWeekStart, 7);
    const profile = await fetchTeacherProfileByEmail(requestEmail);
    const isAdmin = String(req.placeOrderAccess && req.placeOrderAccess.role || '') === 'admin';

    const source = await loadGoogleFormSubmissions();
    const ownSubmissions = source.submissions.filter((row) => {
      if (!row.email) return true;
      return row.email === requestEmail;
    });

    const manualImportsResult = await pool.query(
      `SELECT id, submitted_at, teacher_name, class_name, day_label, items_json, raw_text
       FROM place_order_manual_imports
       WHERE lower(owner_email) = lower($1)
         AND week_start = $2::date
       ORDER BY submitted_at DESC`,
      [requestEmail, activeWeekStart]
    );

    const manualSubmissions = manualImportsResult.rows.map((row) => {
      const submittedAtIso = row.submitted_at ? new Date(row.submitted_at).toISOString() : new Date().toISOString();
      return {
        submitted_at_iso: submittedAtIso,
        submitted_date: submittedAtIso.slice(0, 10),
        email: requestEmail,
        teacher_name: String(row.teacher_name || '').trim(),
        class_name: String(row.class_name || '').trim(),
        day_label: String(row.day_label || '').trim(),
        manual_import_id: Number(row.id),
        items: Array.isArray(row.items_json) ? row.items_json.map((v) => String(v || '').trim()).filter(Boolean) : [],
        raw_items_text: String(row.raw_text || '').trim(),
        source: 'manual_import'
      };
    });

    const combinedSubmissions = ownSubmissions.concat(manualSubmissions);

    const weekSubmissions = combinedSubmissions.filter((row) => {
      const d = String(row.submitted_date || '').trim();
      if (!d) return false;
      return d >= timelineStart && d <= timelineEnd;
    });

    const runningItems = summarizeRunningItems(weekSubmissions);

    return res.json({
      success: true,
      role: req.placeOrderAccess ? req.placeOrderAccess.role : 'teacher',
      is_admin: isAdmin,
      week_start: activeWeekStart,
      week_end: activeWeekEnd,
      timeline_start: timelineStart,
      timeline_end: timelineEnd,
      today_date: now.isoDate,
      form_url: getGoogleFormUrl(),
      resolved_form_url: getGoogleFormUrl(),
      resolved_csv_url: getGoogleFormResponsesCsvUrl(),
      responses_source_ready: source.sourceReady,
      responses_source_message: source.sourceMessage,
      active_recipients: isAdmin ? await getActiveTestRecipients() : [],
      bulk_recipients: isAdmin ? await getActiveBulkRecipients() : [],
      eligible_bulk_teachers: isAdmin ? await listEligibleBulkTeachers() : [],
      teacher: profile || {
        first_name: '',
        last_name: '',
        email_school: requestEmail,
        teacher_code: '',
        timetable: []
      },
      submissions: weekSubmissions,
      all_submissions: combinedSubmissions.slice(0, 200),
      running_items: runningItems
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || 'Unable to load dashboard.' });
  }
});

router.post('/send-now', requirePlaceOrderAccess, async (req, res) => {
  try {
    if (String(req.placeOrderAccess && req.placeOrderAccess.role || '') !== 'admin') {
      return res.status(403).json({ success: false, error: 'Only admin can trigger send now.' });
    }

    const recipients = await getActiveTestRecipients();
    const sent = await sendPilotReminderEmail({
      recipients,
      listType: 'test',
      source: 'manual'
    });
    return res.json({ success: true, result: sent });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || 'Unable to send pilot email.' });
  }
});

router.post('/send-bulk-now', requirePlaceOrderAccess, async (req, res) => {
  try {
    if (String(req.placeOrderAccess && req.placeOrderAccess.role || '') !== 'admin') {
      return res.status(403).json({ success: false, error: 'Only admin can trigger bulk send.' });
    }

    const recipients = await getActiveBulkRecipients();
    if (!recipients.length) {
      return res.status(400).json({ success: false, error: 'No bulk recipients are configured.' });
    }

    const sent = await sendPilotReminderEmail({
      recipients,
      listType: 'bulk',
      source: 'manual-bulk'
    });
    return res.json({ success: true, result: sent });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || 'Unable to send bulk email.' });
  }
});

router.get('/status', requirePlaceOrderAccess, async (req, res) => {
  try {
    await ensureSchema();
    const pilotRecipient = getPilotRecipient();
    const recent = await pool.query(
      `SELECT recipient_email, subject, status, source, message_id, created_at
       FROM place_order_email_log
       WHERE lower(recipient_email) = lower($1)
       ORDER BY created_at DESC
       LIMIT 20`,
      [pilotRecipient]
    );

    return res.json({
      success: true,
      pilot_recipient: pilotRecipient,
      active_recipients: await getActiveTestRecipients(),
      bulk_recipients: await getActiveBulkRecipients(),
      form_url: getGoogleFormUrl(),
      resolved_form_url: getGoogleFormUrl(),
      resolved_csv_url: getGoogleFormResponsesCsvUrl(),
      responses_csv_url_configured: Boolean(getGoogleFormResponsesCsvUrl()),
      history: recent.rows
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || 'Unable to load status.' });
  }
});

router.get('/recipients', requireAdmin, async (req, res) => {
  try {
    await ensureSchema();
    const rows = await pool.query(
      `SELECT recipient_email, is_active, created_by_email, created_at, updated_at
       FROM place_order_recipients
       ORDER BY lower(recipient_email)`
    );

    return res.json({
      success: true,
      fallback_recipient: getPilotRecipient(),
      recipients: rows.rows
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || 'Unable to load recipients.' });
  }
});

router.post('/recipients', requireAdmin, async (req, res) => {
  try {
    await ensureSchema();
    const recipientEmail = normalizeEmail(req.body && req.body.email);
    if (!isLikelyEmail(recipientEmail)) {
      return res.status(400).json({ success: false, error: 'A valid email is required.' });
    }

    const creator = normalizeEmail(req.authUserEmail || '');
    const upsert = await pool.query(
      `INSERT INTO place_order_recipients (recipient_email, is_active, created_by_email, updated_at)
       VALUES ($1, true, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (recipient_email) DO UPDATE
         SET is_active = true,
             updated_at = CURRENT_TIMESTAMP
       RETURNING recipient_email, is_active, created_by_email, created_at, updated_at`,
      [recipientEmail, creator]
    );

    return res.status(201).json({ success: true, recipient: upsert.rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || 'Unable to add recipient.' });
  }
});

router.get('/bulk-recipients', requireAdmin, async (req, res) => {
  try {
    await ensureSchema();
    const rows = await pool.query(
      `SELECT recipient_email, is_active, created_by_email, created_at, updated_at
       FROM place_order_bulk_recipients
       ORDER BY lower(recipient_email)`
    );

    return res.json({
      success: true,
      recipients: rows.rows,
      eligible_teachers: await listEligibleBulkTeachers()
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || 'Unable to load bulk recipients.' });
  }
});

router.post('/bulk-recipients', requireAdmin, async (req, res) => {
  try {
    await ensureSchema();
    const recipientEmail = normalizeEmail(req.body && req.body.email);
    if (!isLikelyEmail(recipientEmail)) {
      return res.status(400).json({ success: false, error: 'A valid email is required.' });
    }

    const eligibleTeachers = await listEligibleBulkTeachers();
    const eligibleMatch = eligibleTeachers.find((teacher) => teacher.email === recipientEmail);
    if (!eligibleMatch) {
      return res.status(400).json({ success: false, error: 'Only current staff with Place Order teacher access can be added to the bulk list.' });
    }

    const creator = normalizeEmail(req.authUserEmail || '');
    const upsert = await pool.query(
      `INSERT INTO place_order_bulk_recipients (recipient_email, is_active, created_by_email, updated_at)
       VALUES ($1, true, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (recipient_email) DO UPDATE
         SET is_active = true,
             updated_at = CURRENT_TIMESTAMP
       RETURNING recipient_email, is_active, created_by_email, created_at, updated_at`,
      [recipientEmail, creator]
    );

    return res.status(201).json({ success: true, recipient: upsert.rows[0], teacher: eligibleMatch });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || 'Unable to add bulk recipient.' });
  }
});

router.delete('/bulk-recipients/:email', requireAdmin, async (req, res) => {
  try {
    await ensureSchema();
    const recipientEmail = normalizeEmail(decodeURIComponent(req.params.email || ''));
    if (!recipientEmail) {
      return res.status(400).json({ success: false, error: 'Recipient email is required.' });
    }

    const update = await pool.query(
      `UPDATE place_order_bulk_recipients
       SET is_active = false,
           updated_at = CURRENT_TIMESTAMP
       WHERE lower(recipient_email) = lower($1)
       RETURNING recipient_email, is_active, updated_at`,
      [recipientEmail]
    );

    if (!update.rowCount) {
      return res.status(404).json({ success: false, error: 'Bulk recipient not found.' });
    }

    return res.json({ success: true, recipient: update.rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || 'Unable to remove bulk recipient.' });
  }
});

router.delete('/recipients/:email', requireAdmin, async (req, res) => {
  try {
    await ensureSchema();
    const recipientEmail = normalizeEmail(decodeURIComponent(req.params.email || ''));
    if (!recipientEmail) {
      return res.status(400).json({ success: false, error: 'Recipient email is required.' });
    }

    const update = await pool.query(
      `UPDATE place_order_recipients
       SET is_active = false,
           updated_at = CURRENT_TIMESTAMP
       WHERE lower(recipient_email) = lower($1)
       RETURNING recipient_email, is_active, updated_at`,
      [recipientEmail]
    );

    if (!update.rowCount) {
      return res.status(404).json({ success: false, error: 'Recipient not found.' });
    }

    return res.json({ success: true, recipient: update.rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || 'Unable to remove recipient.' });
  }
});

router.get('/admin/live-check', requireAdmin, async (req, res) => {
  try {
    await ensureSchema();
    const check = await runLiveSourceCheck();
    return res.json({ success: true, check });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || 'Unable to run live check.' });
  }
});

router.post('/manual-import', requirePlaceOrderAccess, async (req, res) => {
  try {
    await ensureSchema();
    const ownerEmail = getAuthEmail(req);
    const weekStart = String(req.body && req.body.week_start || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
      return res.status(400).json({ success: false, error: 'week_start is required.' });
    }

    const weekEnd = dateOffsetIso(weekStart, 6);
    const text = String(req.body && req.body.text || '').trim();
    if (!text) {
      return res.status(400).json({ success: false, error: 'Paste text is required.' });
    }

    let parsedRows = [];
    const maybeCsv = parseCsv(text);
    if (Array.isArray(maybeCsv.headers) && maybeCsv.headers.length > 1 && Array.isArray(maybeCsv.rows) && maybeCsv.rows.length) {
      parsedRows = normalizeFormRows(maybeCsv.headers, maybeCsv.rows);
    }
    if (!parsedRows.length) {
      parsedRows = parseManualImportText(text, ownerEmail);
    }
    if (!parsedRows.length) {
      return res.status(400).json({ success: false, error: 'Unable to detect items in pasted text.' });
    }

    for (const row of parsedRows) {
      const items = Array.isArray(row.items) ? row.items.map((item) => String(item || '').trim()).filter(Boolean) : [];
      if (!items.length) continue;

      await pool.query(
        `INSERT INTO place_order_manual_imports (owner_email, source, teacher_name, class_name, day_label, items_json, raw_text, week_start, week_end)
         VALUES ($1, 'manual_import', $2, $3, $4, $5::jsonb, $6, $7::date, $8::date)`,
        [
          ownerEmail,
          String(row.teacher_name || '').trim(),
          String(row.class_name || '').trim(),
          String(row.day_label || '').trim(),
          JSON.stringify(items),
          String(row.raw_items_text || '').trim(),
          weekStart,
          weekEnd
        ]
      );
    }

    return res.status(201).json({ success: true, imported: parsedRows.length });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || 'Unable to import manual text.' });
  }
});

router.delete('/manual-import/:id', requirePlaceOrderAccess, async (req, res) => {
  try {
    await ensureSchema();
    const ownerEmail = getAuthEmail(req);
    const manualImportId = Number(req.params.id);
    if (!Number.isInteger(manualImportId) || manualImportId <= 0) {
      return res.status(400).json({ success: false, error: 'A valid manual import id is required.' });
    }

    const deleted = await pool.query(
      `DELETE FROM place_order_manual_imports
       WHERE id = $1
         AND lower(owner_email) = lower($2)
       RETURNING id`,
      [manualImportId, ownerEmail]
    );

    if (!deleted.rowCount) {
      return res.status(404).json({ success: false, error: 'Manual import entry not found.' });
    }

    return res.json({ success: true, deleted_id: manualImportId });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || 'Unable to remove manual import entry.' });
  }
});

router.logPlaceOrderMailerHealthCheck = async function logPlaceOrderMailerHealthCheck() {
  try {
    const mailer = createMailer();
    const status = await verifyMailer(mailer, 8000);
    if (!status.smtpReady) {
      console.warn(`[PLACE-ORDER] SMTP not ready: ${status.smtpError}`);
      return false;
    }
    console.log('[PLACE-ORDER] SMTP verified.');
    return true;
  } catch (err) {
    console.warn(`[PLACE-ORDER] SMTP verify failed: ${err.message}`);
    return false;
  }
};

router.runTuesdayPilotReminder = async function runTuesdayPilotReminder(source) {
  return sendPilotReminderEmail({ source: source || 'scheduler', listType: 'bulk' });
};

module.exports = router;
