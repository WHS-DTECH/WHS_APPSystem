/**
 * Weekly Digest Email — Browse Practicals two-weeks-ahead reminder.
 *
 * POST /api/weekly-digest/send-test   → sends test email to TEST_DIGEST_EMAIL (admin only)
 * POST /api/weekly-digest/send        → sends to all subscribed staff (admin only)
 * GET  /api/weekly-digest/preview     → returns the HTML body (admin only, for preview)
 *
 * Called weekly by the in-process scheduler in server.js (Monday 7 am NZT).
 */

'use strict';

const express = require('express');
const router = express.Router();
const pool = require('../db');
const nodemailer = require('../mailShim');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toLocalIsoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getMondayOfWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = (day + 6) % 7;
  d.setDate(d.getDate() - diff);
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function niceDate(isoDate) {
  try {
    return new Date(isoDate + 'T00:00:00').toLocaleDateString('en-NZ', {
      weekday: 'short', day: 'numeric', month: 'short'
    });
  } catch (_) { return isoDate; }
}

function niceDateLong(date) {
  try {
    return date.toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch (_) { return toLocalIsoDate(date); }
}

function esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function getSiteUrl() {
  return require('../paths').foodRoomSiteUrl();
}

function getFromAddress() {
  return String(process.env.DIGEST_EMAIL_FROM || process.env.SMTP_FROM || process.env.SMTP_USER || '').trim();
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

function createMailer() {
  const host = String(process.env.SMTP_HOST || '').trim();
  const user = resolveSmtpAuthUser(process.env.SMTP_USER, getFromAddress());
  const rawPass = String(process.env.SMTP_PASS || '').trim();
  const pass = /(^|\.)gmail\.com$/i.test(host) ? rawPass.replace(/\s+/g, '') : rawPass;
  if (!host || !user || !pass) return null;
  const port = Number(process.env.SMTP_PORT || 587);
  const secureRaw = String(process.env.SMTP_SECURE || '').trim().toLowerCase();
  const secure = secureRaw === '1' || secureRaw === 'true' || secureRaw === 'yes';
  return nodemailer.createTransport({
    host, port, secure,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    auth: { user, pass }
  });
}

function isPlannerLike(b) {
  const period = String(b.period || '').trim().toLowerCase();
  if (period === 'planner') return true;
  const hasTeacher = Boolean(String(b.staff_id || '').trim() || String(b.staff_name || '').trim());
  if (hasTeacher) return false;
  const cn = String(b.class_name || '').trim().toUpperCase();
  return cn === 'MFOOD' || cn === 'HOSP' ||
    ['JFOOD','VEFOOD','MMFOOD','SDFOOD','PIFOOD','SRFOOD','JTRFOOD','MTRFOOD'].includes(cn);
}

function streamStyle(className, plannerStream) {
  const cn = String(className || '').toUpperCase();
  const ps = String(plannerStream || '').toLowerCase();
  if (ps === 'senior' || cn.includes('HOSP')) return { bg: '#fff7ed', border: '#fdba74', text: '#9a3412', label: 'Senior' };
  if (ps === 'junior' || /JFOOD|VEFOOD|MMFOOD|SDFOOD|PIFOOD|SRFOOD|JTRFOOD|MTRFOOD/.test(cn)) return { bg: '#dcfce7', border: '#86efac', text: '#166534', label: 'Junior' };
  return { bg: '#dbeafe', border: '#93c5fd', text: '#1e40af', label: 'Middle' };
}

// ─── Data Fetchers ────────────────────────────────────────────────────────────

async function fetchBookingsForRange(start, end) {
  const result = await pool.query(
    `SELECT * FROM bookings WHERE booking_date >= $1 AND booking_date <= $2 ORDER BY booking_date, period`,
    [start, end]
  );
  return result.rows;
}

async function fetchCurrentWeekRecipes(start, end) {
  const result = await pool.query(
    `SELECT DISTINCT r.id, r.name, r.url, r.image_url, r.serving_size
     FROM bookings b
     JOIN recipes r ON r.id = b.recipe_id
     WHERE b.booking_date >= $1 AND b.booking_date <= $2
       AND b.period IN (1,2,3,4,5)
       AND b.recipe_id IS NOT NULL
     ORDER BY r.name`,
    [start, end]
  );
  return result.rows;
}

async function fetchDigestRecipients() {
  // Staff who have signed up for weekly digest, or all active teachers if no table
  try {
    const result = await pool.query(
      `SELECT email_school AS email, first_name || ' ' || last_name AS name
       FROM staff_upload
       WHERE COALESCE(status,'Current') = 'Current'
         AND trim(COALESCE(email_school,'')) <> ''
         AND COALESCE(primary_role,'') IN ('lead_teacher','admin','teacher','staff')`
    );
    return result.rows;
  } catch (_) {
    return [];
  }
}

// ─── Email HTML Builder ───────────────────────────────────────────────────────

function buildCalendarHtml(bookings, twoWeekMonday, siteUrl) {
  const days = ['Monday','Tuesday','Wednesday','Thursday','Friday'];
  const periods = [1, 2, 3, 4, 5];
  const weekDates = days.map((_, i) => {
    const d = addDays(twoWeekMonday, i);
    return { iso: toLocalIsoDate(d), label: days[i], short: niceDate(toLocalIsoDate(d)) };
  });

  // Group bookings by date + period
  const grid = {};
  for (const b of bookings) {
    if (isPlannerLike(b)) continue;
    const key = `${String(b.booking_date || '').slice(0,10)}|${b.period}`;
    if (!grid[key]) grid[key] = [];
    grid[key].push(b);
  }

  const colWidth = Math.floor(580 / 5);

  let html = `
  <table width="620" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:12px;margin:0 auto;">
    <tr style="background:#1976d2;color:#fff;">
      <td width="40" style="padding:6px 4px;font-weight:700;font-size:11px;text-align:center;"></td>`;
  for (const day of weekDates) {
    html += `<td width="${colWidth}" style="padding:6px 4px;font-weight:700;font-size:11px;text-align:center;border-left:1px solid #1565c0;">
      ${esc(day.label)}<br/><span style="font-weight:400;font-size:10px;">${esc(day.short)}</span>
    </td>`;
  }
  html += `</tr>`;

  for (const period of periods) {
    html += `<tr style="background:${period % 2 === 0 ? '#f8fafc' : '#fff'};">
      <td style="padding:5px 4px;font-weight:700;font-size:11px;text-align:center;color:#374151;background:#f1f5f9;border-top:1px solid #e5e7eb;">P${period}</td>`;
    for (const day of weekDates) {
      const cells = grid[`${day.iso}|${period}`] || [];
      html += `<td style="padding:4px 3px;vertical-align:top;border-left:1px solid #e5e7eb;border-top:1px solid #e5e7eb;">`;
      for (const b of cells) {
        const st = streamStyle(b.class_name, b.planner_stream);
        const classLabel = esc(String(b.class_name || ''));
        const teacher = esc(String(b.staff_name || ''));
        const recipe = esc(String(b.recipe || ''));
        const groupsInfo = b.groups ? `${b.groups} groups` : '<span style="color:#dc2626;font-weight:700;">⚠ Groups?</span>';
        const csInfo = b.class_size ? `${b.class_size} students` : '';
        const bookingUrl = `${siteUrl}/browse_practicals.html`;
        html += `
          <div style="background:${st.bg};border:1px solid ${st.border};border-radius:5px;padding:4px 5px;margin-bottom:3px;font-size:11px;">
            <div style="font-weight:700;color:${st.text};">${classLabel}</div>
            <div style="color:#4b5563;font-size:10px;">${teacher}</div>
            ${recipe ? `<div style="color:#1e40af;font-size:10px;font-style:italic;">${recipe}</div>` : '<div style="color:#dc2626;font-size:10px;">⚠ No recipe</div>'}
            ${csInfo ? `<div style="color:#6b7280;font-size:10px;">${csInfo}</div>` : ''}
            <div style="margin-top:3px;font-size:10px;">${groupsInfo}</div>
            <div style="margin-top:4px;display:inline-block;">
              <a href="${siteUrl}/browse_practicals.html" style="display:inline-block;padding:2px 7px;background:#1976d2;color:#fff;border-radius:3px;font-size:10px;text-decoration:none;font-weight:700;">View</a>
              ${b.recipe_id ? `<a href="${siteUrl}/browse_recipes.html?highlight=${encodeURIComponent(String(b.recipe_id))}" style="display:inline-block;padding:2px 7px;background:#059669;color:#fff;border-radius:3px;font-size:10px;text-decoration:none;font-weight:700;margin-left:3px;">Recipe</a>` : ''}
            </div>
          </div>`;
      }
      if (!cells.length) html += `<div style="color:#d1d5db;font-size:10px;text-align:center;padding:6px 0;">—</div>`;
      html += `</td>`;
    }
    html += `</tr>`;
  }
  html += `</table>`;
  return html;
}

function buildRecipeCardHtml(recipe, siteUrl) {
  const name = esc(String(recipe.name || ''));
  const url = String(recipe.url || '').trim();
  const imgUrl = String(recipe.image_url || '').trim();
  const serves = recipe.serving_size ? `Serves ${esc(String(recipe.serving_size))}` : '';
  const recipePageUrl = `${siteUrl}/browse_recipes.html?highlight=${encodeURIComponent(String(recipe.id || ''))}`;

  let domain = '';
  if (url) { try { domain = new URL(url).hostname.replace(/^www\./, ''); } catch (_) {} }

  return `
  <td width="185" valign="top" style="padding:6px;">
    <table width="185" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;background:#fff;">
      ${imgUrl ? `<tr><td style="padding:0;"><a href="${esc(recipePageUrl)}"><img src="${esc(imgUrl)}" width="185" height="110" alt="${name}" style="display:block;width:185px;height:110px;object-fit:cover;" /></a></td></tr>` : ''}
      <tr><td style="padding:8px 10px 10px;">
        <div style="font-weight:700;font-size:13px;color:#1f2937;margin-bottom:4px;"><a href="${esc(recipePageUrl)}" style="color:#1f2937;text-decoration:none;">${name}</a></div>
        ${serves ? `<div style="font-size:11px;color:#6b7280;margin-bottom:3px;">${serves}</div>` : ''}
        ${domain ? `<div style="font-size:10px;"><a href="${esc(url)}" style="color:#1976d2;">${esc(domain)}</a></div>` : ''}
        <div style="margin-top:6px;"><a href="${esc(recipePageUrl)}" style="display:inline-block;padding:3px 10px;background:#1976d2;color:#fff;border-radius:4px;font-size:11px;text-decoration:none;font-weight:700;">View Recipe</a></div>
      </td></tr>
    </table>
  </td>`;
}

function buildEmailHtml({ twoWeekMonday, twoWeekFriday, thisWeekMonday, thisWeekFriday, twoWeekBookings, thisWeekRecipes, siteUrl, recipientName }) {
  const twoWeekLabel = `${niceDateLong(twoWeekMonday)} – ${niceDateLong(twoWeekFriday)}`;
  const thisWeekLabel = `${niceDateLong(thisWeekMonday)} – ${niceDateLong(thisWeekFriday)}`;
  const greeting = recipientName ? `Hi ${esc(recipientName.split(' ')[0])}` : 'Hi Team';

  const calHtml = buildCalendarHtml(twoWeekBookings, twoWeekMonday, siteUrl);

  // Missing groups count for urgency
  const missingGroups = twoWeekBookings.filter(b => !isPlannerLike(b) && (b.groups == null || String(b.groups).trim() === '')).length;
  const missingRecipes = twoWeekBookings.filter(b => !isPlannerLike(b) && !b.recipe_id && !String(b.recipe || '').trim()).length;

  // Recipe cards — up to 6, 3 per row
  let recipeSectionHtml = '';
  if (thisWeekRecipes.length) {
    const rows = [];
    for (let i = 0; i < Math.min(thisWeekRecipes.length, 6); i += 3) {
      const chunk = thisWeekRecipes.slice(i, i + 3);
      let row = `<tr>`;
      for (const r of chunk) row += buildRecipeCardHtml(r, siteUrl);
      // Pad if fewer than 3
      for (let p = chunk.length; p < 3; p++) row += `<td width="185"></td>`;
      row += `</tr>`;
      rows.push(row);
    }
    recipeSectionHtml = `
    <table width="620" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:0 auto;">
      ${rows.join('')}
    </table>`;
  } else {
    recipeSectionHtml = `<p style="color:#6b7280;font-style:italic;text-align:center;">No recipes linked to bookings this week yet.</p>`;
  }

  const urgencyBanner = (missingGroups > 0 || missingRecipes > 0) ? `
  <table width="620" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;background:#fef3c7;border:2px solid #f59e0b;border-radius:8px;margin:0 auto 20px;">
    <tr><td style="padding:12px 16px;">
      <div style="font-weight:800;font-size:14px;color:#92400e;margin-bottom:4px;">&#9888;&#65039; Action required before ${esc(twoWeekLabel.split('–')[0].trim())}</div>
      <ul style="margin:4px 0 0 16px;padding:0;color:#78350f;font-size:13px;">
        ${missingGroups > 0 ? `<li><strong>${missingGroups} booking${missingGroups !== 1 ? 's' : ''}</strong> still need the number of groups set.</li>` : ''}
        ${missingRecipes > 0 ? `<li><strong>${missingRecipes} booking${missingRecipes !== 1 ? 's' : ''}</strong> ${missingRecipes !== 1 ? 'have' : 'has'} no recipe confirmed yet.</li>` : ''}
      </ul>
      <div style="margin-top:8px;"><a href="${siteUrl}/browse_practicals.html" style="display:inline-block;padding:6px 16px;background:#d97706;color:#fff;border-radius:5px;font-size:13px;text-decoration:none;font-weight:700;">&#128197; Go to Browse Practicals to confirm</a></div>
    </td></tr>
  </table>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Weekly Food Room Digest</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f4f6;">
    <tr><td align="center" style="padding:24px 10px;">

      <!-- Outer wrapper -->
      <table width="660" cellpadding="0" cellspacing="0" border="0" style="max-width:660px;border-collapse:collapse;">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#1e3a8a 0%,#1976d2 100%);border-radius:12px 12px 0 0;padding:24px 28px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td>
                  <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.7);margin-bottom:4px;">WESTLAND HIGH SCHOOL — FOOD ROOM</div>
                  <div style="font-size:26px;font-weight:900;color:#fff;line-height:1.1;">Weekly Digest</div>
                  <div style="font-size:13px;color:rgba(255,255,255,0.85);margin-top:4px;">Recipes &amp; bookings reminder</div>
                </td>
                <td align="right" valign="top">
                  <a href="${siteUrl}/food_room.html" style="display:inline-block;padding:8px 16px;background:rgba(255,255,255,0.18);color:#fff;border-radius:6px;font-size:12px;text-decoration:none;font-weight:700;border:1px solid rgba(255,255,255,0.3);">&#127968; Food Room</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="background:#fff;padding:24px 28px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">

            <p style="font-size:16px;color:#1f2937;margin:0 0 16px;">${greeting},</p>
            <p style="font-size:14px;color:#374151;margin:0 0 20px;line-height:1.6;">
              This is your weekly reminder to confirm <strong>recipes</strong> and <strong>number of groups</strong> for the week of
              <strong>${esc(twoWeekLabel)}</strong>. The Lead Teacher needs this information at least
              <strong>two weeks ahead</strong> to generate the shopping lists in time.
            </p>

            ${urgencyBanner}

            <!-- Two-weeks-ahead calendar -->
            <h2 style="font-size:16px;color:#1e3a8a;margin:0 0 10px;border-bottom:2px solid #dbeafe;padding-bottom:6px;">
              &#128197; Classes — Week of ${esc(twoWeekLabel)}
            </h2>
            <p style="font-size:12px;color:#6b7280;margin:0 0 10px;">
              Bookings highlighted in <span style="background:#fef3c7;padding:1px 5px;border-radius:3px;color:#92400e;font-weight:700;">amber</span> need groups confirmed.
              Click <strong>View</strong> or <strong>Recipe</strong> buttons to open the live site.
            </p>
            ${calHtml}

            <div style="text-align:center;margin:14px 0 24px;">
              <a href="${siteUrl}/browse_practicals.html" style="display:inline-block;padding:10px 24px;background:#1976d2;color:#fff;border-radius:6px;font-size:14px;text-decoration:none;font-weight:700;">Open Browse Practicals to Confirm &rarr;</a>
            </div>

            <!-- This week's recipes -->
            <h2 style="font-size:16px;color:#065f46;margin:24px 0 10px;border-bottom:2px solid #d1fae5;padding-bottom:6px;">
              &#127869; Recipes Being Cooked This Week (${esc(thisWeekLabel)})
            </h2>
            ${recipeSectionHtml}

            <div style="text-align:center;margin:18px 0 8px;">
              <a href="${siteUrl}/browse_recipes.html" style="display:inline-block;padding:8px 20px;background:#059669;color:#fff;border-radius:6px;font-size:13px;text-decoration:none;font-weight:700;">Browse Recipe Book &rarr;</a>
            </div>

          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:16px 28px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="font-size:11px;color:#9ca3af;">
                  Westland High School Food Room &bull; <a href="${siteUrl}" style="color:#6b7280;">whs-appsystem.onrender.com</a>
                </td>
                <td align="right">
                  <a href="${siteUrl}/browse_practicals.html" style="font-size:11px;color:#1976d2;text-decoration:none;">View calendar</a>
                  &nbsp;&bull;&nbsp;
                  <a href="${siteUrl}/shopping_plan_setup.html" style="font-size:11px;color:#1976d2;text-decoration:none;">Shopping plan</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── Core send function (exported for use by cron scheduler) ─────────────────

async function sendWeeklyDigest({ recipients, isTest = false }) {
  const mailer = createMailer();
  if (!mailer) {
    throw new Error('SMTP not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS in environment.');
  }

  const siteUrl = getSiteUrl();
  const fromAddress = getFromAddress();
  if (!fromAddress) throw new Error('No from address configured (SMTP_FROM / SMTP_USER).');

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const thisWeekMonday = getMondayOfWeek(today);
  const thisWeekFriday = addDays(thisWeekMonday, 4);
  const twoWeekMonday = addDays(thisWeekMonday, 14);
  const twoWeekFriday = addDays(twoWeekMonday, 4);

  const [twoWeekBookings, thisWeekRecipes] = await Promise.all([
    fetchBookingsForRange(toLocalIsoDate(twoWeekMonday), toLocalIsoDate(twoWeekFriday)),
    fetchCurrentWeekRecipes(toLocalIsoDate(thisWeekMonday), toLocalIsoDate(thisWeekFriday))
  ]);

  const results = [];
  for (const recipient of recipients) {
    const html = buildEmailHtml({
      twoWeekMonday, twoWeekFriday, thisWeekMonday, thisWeekFriday,
      twoWeekBookings, thisWeekRecipes,
      siteUrl,
      recipientName: recipient.name || ''
    });

    const subject = `Food Room Weekly Digest — Classes week of ${niceDateLong(twoWeekMonday)}${isTest ? ' [TEST]' : ''}`;
    try {
      await mailer.sendMail({
        from: `"WHS Food Room" <${fromAddress}>`,
        to: recipient.email,
        subject,
        html
      });
      results.push({ email: recipient.email, status: 'sent' });
      console.log(`[DIGEST] Sent to ${recipient.email}`);
    } catch (err) {
      results.push({ email: recipient.email, status: 'failed', error: err.message });
      console.error(`[DIGEST] Failed for ${recipient.email}:`, err.message);
    }
  }
  return results;
}

// ─── Routes (admin-gated) ─────────────────────────────────────────────────────

function isAdminRequest(req) {
  if (req.user) return req.foodRoomAdmin === true;
  const email = String(
    (req.authUser && req.authUser.email) ||
    req.headers['x-user-email'] ||
    req.query.admin_email || ''
  ).trim().toLowerCase();
  if (!email) return false;
  const adminEmails = String(process.env.ADMIN_BOOTSTRAP_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  const preferred = String(process.env.PREFERRED_ADMIN_EMAIL || '').trim().toLowerCase();
  if (preferred) adminEmails.push(preferred);
  return adminEmails.includes(email);
}

// POST /api/weekly-digest/send-test
router.post('/send-test', async (req, res) => {
  if (!isAdminRequest(req)) return res.status(403).json({ success: false, error: 'Admin only.' });

  const testEmail = String(
    process.env.TEST_DIGEST_EMAIL ||
    req.body.to ||
    'vanessapringle@westlandhigh.school.nz'
  ).trim();

  try {
    const results = await sendWeeklyDigest({
      recipients: [{ email: testEmail, name: 'Vanessa' }],
      isTest: true
    });
    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/weekly-digest/send
router.post('/send', async (req, res) => {
  if (!isAdminRequest(req)) return res.status(403).json({ success: false, error: 'Admin only.' });

  try {
    const recipients = await fetchDigestRecipients();
    if (!recipients.length) return res.json({ success: true, message: 'No recipients found.', results: [] });

    const results = await sendWeeklyDigest({ recipients, isTest: false });
    res.json({ success: true, count: results.length, results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/weekly-digest/preview
router.get('/preview', async (req, res) => {
  if (!isAdminRequest(req)) return res.status(403).json({ success: false, error: 'Admin only.' });

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const thisWeekMonday = getMondayOfWeek(today);
    const thisWeekFriday = addDays(thisWeekMonday, 4);
    const twoWeekMonday = addDays(thisWeekMonday, 14);
    const twoWeekFriday = addDays(twoWeekMonday, 4);

    const [twoWeekBookings, thisWeekRecipes] = await Promise.all([
      fetchBookingsForRange(toLocalIsoDate(twoWeekMonday), toLocalIsoDate(twoWeekFriday)),
      fetchCurrentWeekRecipes(toLocalIsoDate(thisWeekMonday), toLocalIsoDate(thisWeekFriday))
    ]);

    const html = buildEmailHtml({
      twoWeekMonday, twoWeekFriday, thisWeekMonday, thisWeekFriday,
      twoWeekBookings, thisWeekRecipes,
      siteUrl: getSiteUrl(),
      recipientName: 'Vanessa'
    });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    res.status(500).send(`<pre>Error: ${err.message}</pre>`);
  }
});

module.exports = router;
module.exports.sendWeeklyDigest = sendWeeklyDigest;
module.exports.fetchDigestRecipients = fetchDigestRecipients;
