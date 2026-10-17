const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { v2: cloudinary } = require('cloudinary');
const { query } = require('../../db');
const { sendEmail } = require('../../email');

// Legacy Sewing Room API, ported from the original TECH-SEWING server.js. Login and roles come
// from the app's Google session (ADMIN, or Teachers granted Sewing Hub "teacher" access).
const router = express.Router();

const HUB_SITE_KEY = 'SEWING-HUB';
const env = (name, fallback = '') => (process.env[name] || fallback).trim();
const CLOUDINARY_UPLOAD_FOLDER = env('CLOUDINARY_UPLOAD_FOLDER', 'sewing-room-activities');
const OBJECT_STORAGE_BUCKET = env('OBJECT_STORAGE_BUCKET');
const OBJECT_STORAGE_PUBLIC_BASE_URL = env('OBJECT_STORAGE_PUBLIC_BASE_URL');
const uploadsDir = path.join(__dirname, '..', '..', '..', 'public', 'sewing-hub', 'images', 'uploads');

const cloudinaryEnabled = Boolean(env('CLOUDINARY_CLOUD_NAME') && env('CLOUDINARY_API_KEY') && env('CLOUDINARY_API_SECRET'));
const objectStorageEnabled = Boolean(
  env('OBJECT_STORAGE_ENDPOINT') && OBJECT_STORAGE_BUCKET && env('OBJECT_STORAGE_ACCESS_KEY_ID')
  && env('OBJECT_STORAGE_SECRET_ACCESS_KEY') && OBJECT_STORAGE_PUBLIC_BASE_URL
);

if (cloudinaryEnabled) {
  cloudinary.config({
    cloud_name: env('CLOUDINARY_CLOUD_NAME'),
    api_key: env('CLOUDINARY_API_KEY'),
    api_secret: env('CLOUDINARY_API_SECRET'),
    secure: true
  });
}

const s3Client = objectStorageEnabled
  ? new S3Client({
    region: 'auto',
    endpoint: env('OBJECT_STORAGE_ENDPOINT'),
    forcePathStyle: true,
    credentials: {
      accessKeyId: env('OBJECT_STORAGE_ACCESS_KEY_ID'),
      secretAccessKey: env('OBJECT_STORAGE_SECRET_ACCESS_KEY')
    }
  })
  : null;

const NZQA_MPT_LEVEL1_STANDARDS = [
  ['92012', 'Develop a Materials and Processing Technology outcome in an authentic context', 6, 'Internal'],
  ['92013', 'Experiment with different materials to develop a Materials and Processing Technology outcome', 6, 'Internal'],
  ['92014', 'Demonstrate understanding of sustainable practices in the development of a Materials and Processing Technology design', 4, 'External'],
  ['92015', 'Demonstrate understanding of techniques selected for a feasible Materials and Processing Technology outcome', 4, 'External']
].map(([standardNumber, name, credits, type]) => ({
  standard_number: standardNumber,
  subject_set: 'Materials and Processing Technology (MPT)',
  standard_name: name,
  level: 'Level 1',
  credits,
  assessment_type: type,
  nzqa_search_url: 'https://www.nzqa.govt.nz/ncea/assessment/search.do?query=Materials+and+Processing+Technology&view=achievements&level=01'
}));

const allowedColors = new Set(['color-rose', 'color-teal', 'color-sage', 'color-lavender', 'color-coral', 'color-gold']);
const allowedYearLevels = new Set(['Year 9', 'Year 10', 'Year 11', 'Year 12']);
const allowedTypes = new Set(['Hand Sewing', 'Machine Sewing', 'Embroidery', 'Pattern Making', 'Construction', 'Finishing']);
const categoryMap = {
  assessment: 'Assessment',
  practice: 'Practice',
  skill: 'Skill',
  'url idea': 'URL Idea',
  url_idea: 'URL Idea',
  'url-idea': 'URL Idea',
  urlidea: 'URL Idea'
};

const { userHasHubPermission, canManageHubRoles } = require('../../hubRoles');
const isAdmin = (user) => Boolean(user?.roles?.includes('ADMIN'));
const isTeacher = (user) => Boolean(user?.roles?.includes('Teacher'));

async function userCanUploadActivity(user) {
  if (!user) return false;
  if (isAdmin(user)) return true;
  return userHasHubPermission(user, 'sewing-hub', 'activities.upload');
}

const userCanViewTeacherCard = (user) => isAdmin(user) || isTeacher(user);

function requireAuth(req, res, next) {
  if (req.user) return next();
  if (req.originalUrl.startsWith('/api/')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  return res.redirect('/');
}

function requireAdmin(req, res, next) {
  if (isAdmin(req.user)) return next();
  return res.status(403).json({ error: 'Admin access required' });
}

async function requireUploadPermission(req, res, next) {
  try {
    if (await userCanUploadActivity(req.user)) return next();
    return res.status(403).json({ error: 'Access denied' });
  } catch (error) {
    return next(error);
  }
}

function fileExtFromMime(mimeType) {
  return { 'image/jpeg': '.jpg', 'image/jpg': '.jpg', 'image/png': '.png' }[String(mimeType || '').toLowerCase()] || null;
}

function createImageFileName(mimeType) {
  return `activity-${Date.now()}-${crypto.randomUUID()}${fileExtFromMime(mimeType) || '.jpg'}`;
}

function normalizeHttpUrl(value) {
  const raw = String(value || '').trim();
  if (!/^https?:\/\//i.test(raw)) return '';

  try {
    return new URL(raw).toString();
  } catch (error) {
    return '';
  }
}

function resolveHttpUrl(candidate, baseUrl) {
  const raw = String(candidate || '').trim();
  if (!raw || /^data:/i.test(raw)) return '';

  try {
    const url = new URL(raw, baseUrl);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
  } catch (error) {
    return '';
  }
}

function extractRepresentativeImageCandidates(html, pageUrl) {
  const out = [];
  const seen = new Set();
  const pushCandidate = (value) => {
    const resolved = resolveHttpUrl(value, pageUrl);
    if (!resolved || seen.has(resolved.toLowerCase())) return;
    seen.add(resolved.toLowerCase());
    out.push(resolved);
  };

  for (const [tag] of String(html || '').matchAll(/<meta\s+[^>]*>/gi)) {
    const key = (tag.match(/\bproperty\s*=\s*["']([^"']+)["']/i)?.[1] || tag.match(/\bname\s*=\s*["']([^"']+)["']/i)?.[1] || '').toLowerCase();
    if (['og:image', 'og:image:url', 'twitter:image', 'twitter:image:src'].includes(key)) {
      pushCandidate(tag.match(/\bcontent\s*=\s*["']([^"']+)["']/i)?.[1]);
    }
  }

  for (const [tag] of String(html || '').matchAll(/<link\s+[^>]*>/gi)) {
    const rel = (tag.match(/\brel\s*=\s*["']([^"']+)["']/i)?.[1] || '').toLowerCase();
    if (rel.includes('image_src') || rel.includes('icon')) {
      pushCandidate(tag.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1]);
    }
  }

  [...String(html || '').matchAll(/<img\s+[^>]*src\s*=\s*["']([^"']+)["'][^>]*>/gi)]
    .slice(0, 8)
    .forEach((match) => pushCandidate(match[1]));

  return out;
}

async function scrapeRepresentativeImageUrl(pageUrl) {
  const safeUrl = normalizeHttpUrl(pageUrl);
  if (!safeUrl) return null;
  if (/\.(png|jpe?g|webp|gif|bmp|svg)(?:[?#].*)?$/i.test(safeUrl)) return safeUrl;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(safeUrl, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; SewingRoomBot/1.0; +https://westlandhigh.school.nz)',
        accept: 'text/html,application/xhtml+xml,image/avif,image/webp,image/apng,*/*;q=0.8'
      }
    });
    if (!response.ok) return null;

    const finalUrl = normalizeHttpUrl(response.url) || safeUrl;
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    if (contentType.startsWith('image/')) return finalUrl;
    if (!contentType.includes('text/html')) return null;

    return extractRepresentativeImageCandidates(await response.text(), finalUrl)[0] || null;
  } catch (error) {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function uploadToCloudinary(fileBuffer, mimeType) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: CLOUDINARY_UPLOAD_FOLDER,
        resource_type: 'image',
        public_id: `activity-${Date.now()}-${crypto.randomUUID()}`,
        format: fileExtFromMime(mimeType)?.replace('.', '') || 'jpg',
        use_filename: false,
        unique_filename: false,
        overwrite: false
      },
      (error, result) => {
        if (error) return reject(error);
        if (!result?.secure_url) return reject(new Error('Cloudinary did not return a secure URL'));
        return resolve(result.secure_url);
      }
    );
    stream.end(fileBuffer);
  });
}

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!['image/png', 'image/jpeg', 'image/jpg'].includes((file.mimetype || '').toLowerCase())) {
      return cb(new Error('Only PNG and JPG files are allowed'));
    }
    return cb(null, true);
  }
});

function optionalText(value) {
  return value ? String(value).trim() : null;
}

// Validates the activity form exactly as the legacy server did; returns { error } or { values }.
async function parseActivityBody(body, existingImage) {
  const { name, year_level: yearLevel, type, activity_category: category, duration_hours: duration, difficulty, color } = body;

  if (!name || !yearLevel || !type || !duration || !difficulty) return { error: 'Missing required fields' };
  if (!['Beginner', 'Intermediate', 'Advanced'].includes(String(difficulty))) return { error: 'Invalid difficulty' };

  const safeYearLevel = String(yearLevel).trim();
  const safeType = String(type).trim();
  if (!allowedYearLevels.has(safeYearLevel)) return { error: 'Invalid year level for Sewing Room (use Year 9-12).' };
  if (!allowedTypes.has(safeType)) return { error: 'Invalid activity type for Sewing Room.' };

  const hours = Number(duration);
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) return { error: 'Duration must be between 0 and 24 hours' };

  const safeCategory = categoryMap[String(category || 'Practice').trim().toLowerCase()] || 'Practice';
  const safeIdeaUrl = body.idea_url ? normalizeHttpUrl(body.idea_url) : '';
  let safeImage = body.outcome_image_url ? normalizeHttpUrl(body.outcome_image_url) : '';

  if (safeCategory === 'URL Idea' && safeIdeaUrl && !safeImage) {
    safeImage = (await scrapeRepresentativeImageUrl(safeIdeaUrl)) || normalizeHttpUrl(existingImage) || '';
  }

  return {
    values: [
      String(name).trim(), safeYearLevel, safeType, safeCategory, hours, String(difficulty).trim(),
      optionalText(body.description), allowedColors.has(String(color)) ? color : 'color-rose', Boolean(body.is_this_week),
      safeImage || null, safeIdeaUrl || null, optionalText(body.resources), optionalText(body.equipment),
      optionalText(body.instructions), optionalText(body.class_management_notes),
      optionalText(body.class_preparation), optionalText(body.assessment_focus)
    ]
  };
}

function parseId(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: 'Invalid activity id' });
    return null;
  }
  return id;
}

router.get('/me', async (req, res, next) => {
  try {
    if (!req.user) return res.json({ authenticated: false });

    return res.json({
      authenticated: true,
      user: {
        email: req.user.email,
        displayName: req.user.display_name,
        initials: req.user.display_name?.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'U',
        isAdmin: isAdmin(req.user),
        canBrowseActivities: true,
        canUploadActivity: await userCanUploadActivity(req.user),
        canViewTeacherCard: userCanViewTeacherCard(req.user),
        canManageRoles: await canManageHubRoles(req.user, 'sewing-hub')
      }
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/admin/assessment-standards', requireAuth, requireAdmin, (req, res) => {
  res.json({ standards: NZQA_MPT_LEVEL1_STANDARDS });
});

router.post('/admin/activities', requireAuth, requireUploadPermission, async (req, res) => {
  try {
    const parsed = await parseActivityBody(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });

    const result = await query(
      `INSERT INTO activities (
         name, year_level, type, activity_category, duration_hours, difficulty, description, color,
         is_this_week, outcome_image_url, idea_url, resources, equipment, instructions,
         class_management_notes, class_preparation, assessment_focus, hub_site
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       RETURNING id`,
      [...parsed.values, HUB_SITE_KEY]
    );
    return res.json({ success: true, id: result.rows[0].id });
  } catch (error) {
    console.error('POST /api/admin/activities error:', error.message);
    return res.status(500).json({ error: 'Database error', detail: error.message });
  }
});

router.put('/admin/activities/:id', requireAuth, requireUploadPermission, async (req, res) => {
  try {
    const id = parseId(req, res);
    if (!id) return null;

    const existing = await query(
      'SELECT outcome_image_url FROM activities WHERE id = $1 AND hub_site = $2 LIMIT 1',
      [id, HUB_SITE_KEY]
    );
    if (!existing.rowCount) return res.status(404).json({ error: 'Activity not found' });

    const parsed = await parseActivityBody(req.body, existing.rows[0].outcome_image_url);
    if (parsed.error) return res.status(400).json({ error: parsed.error });

    await query(
      `UPDATE activities
       SET name = $2, year_level = $3, type = $4, activity_category = $5, duration_hours = $6,
           difficulty = $7, description = $8, color = $9, is_this_week = $10, outcome_image_url = $11,
           idea_url = $12, resources = $13, equipment = $14, instructions = $15,
           class_management_notes = $16, class_preparation = $17, assessment_focus = $18
       WHERE id = $1 AND hub_site = $19`,
      [id, ...parsed.values, HUB_SITE_KEY]
    );
    return res.json({ success: true, id });
  } catch (error) {
    console.error('PUT /api/admin/activities/:id error:', error.message);
    return res.status(500).json({ error: 'Database error', detail: error.message });
  }
});

router.delete('/admin/activities/:id', requireAuth, requireUploadPermission, async (req, res) => {
  try {
    const id = parseId(req, res);
    if (!id) return null;

    const result = await query('DELETE FROM activities WHERE id = $1 AND hub_site = $2', [id, HUB_SITE_KEY]);
    if (!result.rowCount) return res.status(404).json({ error: 'Activity not found' });
    return res.json({ success: true, id });
  } catch (error) {
    console.error('DELETE /api/admin/activities/:id error:', error.message);
    return res.status(500).json({ error: 'Database error', detail: error.message });
  }
});

router.post('/admin/url-ideas', requireAuth, requireUploadPermission, async (req, res) => {
  try {
    const { name, type, color, description, idea_url: ideaUrl } = req.body;
    if (!name || !type || !ideaUrl) {
      return res.status(400).json({ error: 'Missing required fields: name, type, idea_url' });
    }

    const safeUrl = normalizeHttpUrl(ideaUrl);
    if (!safeUrl) return res.status(400).json({ error: 'URL must start with http:// or https://' });

    const result = await query(
      `INSERT INTO activities (
         name, year_level, type, activity_category, duration_hours, difficulty, description,
         color, is_this_week, outcome_image_url, idea_url, hub_site
       ) VALUES ($1,'Year 9',$2,'URL Idea',1,'Beginner',$3,$4,FALSE,$5,$6,$7)
       RETURNING id`,
      [
        String(name).trim(),
        String(type).trim(),
        optionalText(description),
        allowedColors.has(String(color)) ? color : 'color-teal',
        (await scrapeRepresentativeImageUrl(safeUrl)) || null,
        safeUrl,
        HUB_SITE_KEY
      ]
    );
    return res.json({ success: true, id: result.rows[0].id });
  } catch (error) {
    console.error('POST /api/admin/url-ideas error:', error.message);
    return res.status(500).json({ error: 'Database error' });
  }
});

async function storeImage(file) {
  if (cloudinaryEnabled) {
    return uploadToCloudinary(file.buffer, file.mimetype);
  }

  const fileName = createImageFileName(file.mimetype);
  if (objectStorageEnabled) {
    const key = `activities/${fileName}`;
    await s3Client.send(new PutObjectCommand({
      Bucket: OBJECT_STORAGE_BUCKET, Key: key, Body: file.buffer, ContentType: file.mimetype
    }));
    return `${OBJECT_STORAGE_PUBLIC_BASE_URL.replace(/\/$/, '')}/${key}`;
  }

  fs.mkdirSync(uploadsDir, { recursive: true });
  fs.writeFileSync(path.join(uploadsDir, fileName), file.buffer);
  return `/sewing-hub/images/uploads/${fileName}`;
}

router.post('/admin/upload-image', requireAuth, requireUploadPermission, (req, res) => {
  imageUpload.single('image')(req, res, async (uploadError) => {
    if (uploadError) return res.status(400).json({ error: uploadError.message || 'Upload failed' });
    if (!req.file) return res.status(400).json({ error: 'No image file received' });

    try {
      return res.json({ success: true, imageUrl: await storeImage(req.file) });
    } catch (error) {
      console.error('Image upload error:', error.message);
      return res.status(500).json({ error: 'Could not store uploaded image' });
    }
  });
});

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Notifies all ADMIN users through the framework's Google Gmail API (replaces the legacy EmailJS step).
async function notifySuggestion({ activityName, suggestedBy, email, url, reason }) {
  const admins = await query(
    `SELECT DISTINCT u.email FROM users u
     JOIN user_roles ur ON ur.user_id = u.id
     JOIN roles r ON r.id = ur.role_id
     WHERE r.name = 'ADMIN' AND u.email IS NOT NULL`
  );
  const to = admins.rows.map((row) => row.email).filter(Boolean);
  if (!to.length) return;
  const siteUrl = process.env.SITE_URL || 'https://whs-appsystem.onrender.com';
  const link = `${siteUrl}/sewing-hub/admin_suggestions.html`;
  const html = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
  <div style="background:#6b2d8f;padding:22px 28px;border-radius:8px 8px 0 0">
    <p style="color:rgba(255,255,255,0.75);font-size:11px;letter-spacing:1px;text-transform:uppercase;margin:0 0 4px">SEWING HUB</p>
    <h2 style="color:#fff;margin:0;font-size:22px">New Activity Suggestion</h2>
  </div>
  <div style="padding:24px 28px;border:1px solid #ddd;border-top:none;border-radius:0 0 8px 8px">
    <p><strong>Activity:</strong> ${escapeHtml(activityName)}</p>
    <p><strong>Suggested by:</strong> ${escapeHtml(suggestedBy || 'Not provided')}</p>
    <p><strong>Email:</strong> ${escapeHtml(email)}</p>
    <p><strong>URL:</strong> ${escapeHtml(url || 'N/A')}</p>
    <p><strong>Reason:</strong><br>${escapeHtml(reason).replace(/\n/g, '<br>')}</p>
    <p><a href="${escapeHtml(link)}">Open Suggestions List</a></p>
  </div>
</div>`;
  const sent = await sendEmail({ to, subject: `[Sewing Hub] Activity Suggestion: ${activityName}`, html });
  if (!sent.ok) throw new Error(sent.error || sent.message || 'Gmail API send failed');
}

router.get('/suggestions', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await query('SELECT * FROM sewing_hub_suggestions ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (error) {
    console.error('GET /api/suggestions error:', error.message);
    res.status(500).json({ error: 'Database error' });
  }
});

router.post('/suggestions', async (req, res) => {
  try {
    const { date, activity_name: activityName, suggested_by: suggestedBy, email, url, reason } = req.body;

    if (!activityName || !email || !reason) {
      return res.status(400).json({ error: 'Missing required fields: activity_name, email, reason' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }
    if (activityName.length > 255 || email.length > 255) {
      return res.status(400).json({ error: 'Input too long' });
    }

    const result = await query(
      `INSERT INTO sewing_hub_suggestions (date, activity_name, suggested_by, email, url, reason)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [
        date || new Date().toISOString().split('T')[0],
        activityName.trim(),
        suggestedBy ? suggestedBy.trim() : null,
        email.trim().toLowerCase(),
        url ? url.trim() : null,
        reason.trim()
      ]
    );
    notifySuggestion({ activityName: activityName.trim(), suggestedBy, email: email.trim(), url, reason: reason.trim() })
      .catch((error) => console.error('Sewing suggestion email failed:', error.message));
    return res.json({ success: true, id: result.rows[0].id });
  } catch (error) {
    console.error('POST /api/suggestions error:', error.message);
    return res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
module.exports.userCanUploadActivity = userCanUploadActivity;
module.exports.userCanViewTeacherCard = userCanViewTeacherCard;
module.exports.requireUploadPermission = requireUploadPermission;
