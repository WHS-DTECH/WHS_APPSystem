const express = require('express');
const router = express.Router();
const pool = require('../db');

let schemaReady = false;
let plannerUploadSchemaReady = false;

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function getRequestEmail(req) {
  return normalizeEmail(
    (req && req.authUserEmail) ||
    (req && req.headers && (req.headers['x-user-email'] || req.headers['x-staff-email']))
  );
}

function logJsonTransfer(routeLabel, payload, details) {
  let bytes = 0;
  try {
    bytes = Buffer.byteLength(JSON.stringify(payload || {}), 'utf8');
  } catch (_) {
    bytes = 0;
  }
  const suffix = details ? ` ${details}` : '';
  console.log(`[TRANSFER] ${routeLabel} bytes=${bytes}${suffix}`);
}

function requireSignedIn(req, res, next) {
  const email = getRequestEmail(req);
  if (!email) {
    return res.status(401).json({ success: false, error: 'Sign in required.' });
  }
  req.authUserEmail = email;
  return next();
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

async function hasPlanningAccess(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;

  if (getBootstrapAdminEmails().has(normalized)) {
    return true;
  }

  try {
    const additionalRoleResult = await pool.query(
      `SELECT lower(trim(uar.role_name)) AS role_name
         FROM user_additional_roles uar
        WHERE lower(trim(uar.email)) = lower(trim($1))`,
      [normalized]
    );

    if (additionalRoleResult.rows.some((row) => {
      const role = String(row && row.role_name || '').trim().toLowerCase();
      return role === 'admin' || role === 'lead_teacher';
    })) {
      return true;
    }
  } catch (err) {
    if (!err || err.code !== '42P01') {
      throw err;
    }
  }

  try {
    const staffResult = await pool.query(
      `SELECT lower(trim(COALESCE(primary_role, 'staff'))) AS primary_role
         FROM staff_upload
        WHERE lower(trim(email_school)) = lower(trim($1))
          AND COALESCE(status, 'Current') = 'Current'
        LIMIT 1`,
      [normalized]
    );

    if (staffResult.rows.length) {
      const primaryRole = String(staffResult.rows[0].primary_role || '').trim().toLowerCase();
      return primaryRole === 'admin' || primaryRole === 'lead_teacher';
    }
  } catch (err) {
    if (!err || (err.code !== '42P01' && err.code !== '42703')) {
      throw err;
    }
  }

  return false;
}

async function requirePlanningRole(req, res, next) {
  const email = getRequestEmail(req);
  if (!email) {
    return res.status(401).json({ success: false, error: 'Sign in required.' });
  }

  try {
    const allowed = await hasPlanningAccess(email);
    if (!allowed) {
      return res.status(403).json({ success: false, error: 'Planning access requires admin or lead_teacher role.' });
    }
    req.authUserEmail = email;
    return next();
  } catch (err) {
    console.error('[BOOKINGS] requirePlanningRole failed:', err);
    return res.status(500).json({ success: false, error: 'Authorization check failed.' });
  }
}

async function ensureSchema() {
  if (schemaReady) return;
  await pool.query("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS recipe_url TEXT DEFAULT ''");
  await pool.query("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS planner_stream TEXT DEFAULT 'Middle'");
  await pool.query("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cook_mode TEXT");
  await pool.query("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS partner_student_name TEXT");
  await pool.query("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS partner_student_id TEXT");
  await pool.query("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS groups INTEGER");
  await pool.query("UPDATE bookings SET planner_stream='Middle' WHERE planner_stream IS NULL OR planner_stream=''");
  await pool.query("UPDATE bookings SET class_name = regexp_replace(class_name, 'HSOP', 'HOSP', 'gi') WHERE period = 'Planner' AND upper(coalesce(class_name, '')) LIKE '%HSOP%'");
  schemaReady = true;
}

async function ensurePlannerUploadSchema() {
  if (plannerUploadSchemaReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS planner_upload_history (
      id SERIAL PRIMARY KEY,
      file_name TEXT,
      uploaded_by_email TEXT,
      uploaded_by_name TEXT,
      uploaded_by_staff_code TEXT,
      planner_stream TEXT,
      bookings_saved INTEGER DEFAULT 0,
      uploaded_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  plannerUploadSchemaReady = true;
}

const JUNIOR_FOOD_CODES = ['JFOOD', 'VEFOOD', 'MMFOOD', 'SDFOOD', 'PIFOOD', 'SRFOOD', 'JTRFOOD', 'MTRFOOD'];
const JUNIOR_FOOD_RE = new RegExp(JUNIOR_FOOD_CODES.join('|'));

function getLegacyClassNamesForStream(stream) {
  const normalized = String(stream || '').trim().toLowerCase();
  if (normalized === 'middle') return ['MFOOD'];
  if (normalized === 'junior') return [...JUNIOR_FOOD_CODES];
  if (normalized === 'senior') return ['HOSP', '11HOSP', '12HOSP', '13HOSP', '100HOSP', '200HOSP', '300HOSP'];
  return [];
}

function inferPlannerStreamFromCode(code) {
  const value = normalizeHospTypo(String(code || '').trim().toUpperCase());
  if (!value) return 'Other';
  if (JUNIOR_FOOD_RE.test(value)) return 'Junior';
  if (value.includes('HOSP')) return 'Senior';
  if (value.includes('MFOOD')) return 'Middle';
  return 'Other';
}

function toIsoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseIsoDate(value) {
  const match = /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim());
  if (!match) return null;
  const parsed = new Date(`${String(value).trim()}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function weekMondayIso(isoDate) {
  const parsed = parseIsoDate(isoDate);
  if (!parsed) return '';
  const day = parsed.getDay();
  const diff = (day + 6) % 7;
  parsed.setDate(parsed.getDate() - diff);
  return toIsoDate(parsed);
}

function normalizeClassToken(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeHospTypo(value) {
  // Common planner typo: HSOP -> HOSP
  return String(value || '').replace(/HSOP/gi, 'HOSP');
}

function normalizeRecipeId(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function inferStreamFromClassToken(classToken) {
  const value = normalizeHospTypo(normalizeClassToken(classToken));
  if (!value) return '';
  if (value.includes('HOSP')) return 'Senior';
  if (JUNIOR_FOOD_RE.test(value)) return 'Junior';
  if (value.includes('MFOOD') || value.includes('FOOD')) return 'Middle';
  return '';
}

// Extract a planner class code that can uniquely identify stream variants,
// for example 11HOSP vs 13HOSP, or JFOOD vs MFOOD.
function inferPlannerClassCode(classToken) {
  const value = normalizeHospTypo(normalizeClassToken(classToken));
  if (!value) return '';
  const canonical = value
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const hospMatch = canonical.match(/(?:^|[-_])((?:\d{2,3})HOSP)(?:[-_]|$)/);
  if (hospMatch && hospMatch[1]) return hospMatch[1];

  if (canonical.includes('HOSPCOOK')) return 'HOSPCOOK';

  for (const code of JUNIOR_FOOD_CODES) {
    if (canonical.includes(code)) return code;
  }

  if (canonical.includes('MFOOD')) return 'MFOOD';
  if (canonical.includes('HOSP')) return 'HOSP';
  return '';
}

function buildTeacherName(staffRow, fallbackCode) {
  if (!staffRow) return fallbackCode || '';
  const first = String(staffRow.first_name || '').trim();
  const last = String(staffRow.last_name || '').trim();
  const code = String(staffRow.code || fallbackCode || '').trim();
  const joined = [last, first].filter(Boolean).join(', ');
  if (joined && code) return `${joined} (${code})`;
  return joined || code;
}

function splitClasses(rawValues) {
  const seen = new Set();
  const out = [];
  for (const raw of rawValues || []) {
    const parts = String(raw || '')
      .split(/[;|]/g)
      .map((v) => String(v || '').trim())
      .filter(Boolean);
    for (const item of parts) {
      const key = normalizeClassToken(item);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

function classGroupKeyForPrefill(classToken) {
  const normalized = normalizeClassToken(classToken);
  if (!normalized) return '';
  // Some timetable entries include room suffixes per period (for example
  // 82B-MFOOD-22 in P1 and 82B-MFOOD-F in P2). Group them as one class.
  const hyphenCount = (normalized.match(/-/g) || []).length;
  if (hyphenCount >= 2) {
    return normalized.replace(/-[^-]+$/, '');
  }
  return normalized;
}

function defaultGroupCountForStream(stream, classSize) {
  const size = Number(classSize);
  if (!Number.isFinite(size) || size <= 0) return null;
  const normalized = String(stream || '').trim();
  if (normalized === 'Senior') return Math.max(1, Math.ceil(size / 2));
  if (normalized === 'Junior' || normalized === 'Middle') return Math.max(1, Math.ceil(size / 4));
  return null;
}

// Update a booking by ID
router.put('/:id', requireSignedIn, async (req, res) => {
  const { staff_id, staff_name, class_name, booking_date, period, recipe, recipe_url, recipe_id, class_size, planner_stream, cook_mode, partner_student_name, partner_student_id, groups } = req.body;
  try {
    await ensureSchema();
    const updateResult = await pool.query(
      "UPDATE bookings SET staff_id=$1, staff_name=$2, class_name=$3, booking_date=$4, period=$5, recipe=$6, recipe_url=$7, recipe_id=$8, class_size=$9, planner_stream=COALESCE($10, planner_stream, 'Middle'), cook_mode=$11, partner_student_name=$12, partner_student_id=$13, groups=$14 WHERE id=$15",
      [
        staff_id,
        staff_name,
        class_name,
        booking_date,
        period,
        recipe,
        recipe_url,
        recipe_id,
        class_size,
        planner_stream || null,
        cook_mode || null,
        partner_student_name || null,
        partner_student_id || null,
        groups || null,
        req.params.id
      ]
    );
    if (!updateResult.rowCount) {
      return res.status(404).json({ error: 'Booking not found.' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to update booking:', err.message);
    res.status(500).json({ error: 'Failed to update booking.' });
  }
});

// PATCH /api/bookings/:id/groups — lightweight update of just the groups field
router.patch('/:id/groups', requireSignedIn, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ success: false, error: 'Invalid booking id.' });
  }
  const groupsVal = req.body && req.body.groups != null ? Number(req.body.groups) : null;
  if (groupsVal !== null && (!Number.isInteger(groupsVal) || groupsVal <= 0)) {
    return res.status(400).json({ success: false, error: 'groups must be a positive integer.' });
  }
  try {
    await ensureSchema();
    const result = await pool.query('UPDATE bookings SET groups = $1 WHERE id = $2', [groupsVal, id]);
    if (!result.rowCount) return res.status(404).json({ success: false, error: 'Booking not found.' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to update groups.' });
  }
});

// DELETE /api/bookings/clear-planners - Clear planner bookings (admin function)
// Optional query params: stream=Middle|Junior|Senior|All, className=<TT code>
router.delete('/clear-planners', requirePlanningRole, async (req, res) => {
  try {
    await ensureSchema();
    const requestedStream = String(req.query.stream || 'All').trim();
    const normalized = requestedStream.toLowerCase();
    const requestedClassName = String(req.query.className || '').trim().toUpperCase();

    let result;
    let scopeLabel = 'all planners';

    if (requestedClassName) {
      const params = [requestedClassName];
      let sql = `DELETE FROM bookings WHERE period = 'Planner' AND upper(trim(coalesce(class_name, ''))) = $1`;

      if (normalized && normalized !== 'all') {
        const streamLabel = normalized.charAt(0).toUpperCase() + normalized.slice(1);
        const legacyClassNames = getLegacyClassNamesForStream(streamLabel);
        params.push(streamLabel, legacyClassNames);
        sql += `
          AND (
            lower(coalesce(planner_stream, '')) = lower($2)
            OR upper(trim(coalesce(class_name, ''))) = ANY($3::text[])
          )`;
        scopeLabel = `${streamLabel} planner for class ${requestedClassName}`;
      } else {
        scopeLabel = `planner entries for class ${requestedClassName}`;
      }

      result = await pool.query(sql, params);
    } else if (normalized === 'all' || !normalized) {
      result = await pool.query("DELETE FROM bookings WHERE period = 'Planner'");
    } else if (normalized === 'middle' || normalized === 'junior' || normalized === 'senior') {
      const streamLabel = normalized.charAt(0).toUpperCase() + normalized.slice(1);
      scopeLabel = `${streamLabel} planner`;
      const legacyClassNames = getLegacyClassNamesForStream(streamLabel);

      result = await pool.query(
        `DELETE FROM bookings
         WHERE period = 'Planner'
           AND (
             lower(coalesce(planner_stream, '')) = lower($1)
             OR upper(coalesce(class_name, '')) = ANY($2::text[])
           )`,
        [streamLabel, legacyClassNames]
      );
    } else {
      return res.status(400).json({ error: 'Invalid stream. Use All, Middle, Junior, or Senior.' });
    }

    const deletedCount = result.rowCount || 0;
    console.log(`[ADMIN] Cleared ${deletedCount} ${scopeLabel} booking(s)`);
    res.json({
      success: true,
      message: `Deleted ${deletedCount} ${scopeLabel} booking(s).`,
      deleted: deletedCount,
      stream: requestedStream
    });
  } catch (err) {
    console.error('Failed to clear planner bookings:', err.message);
    res.status(500).json({ error: 'Failed to clear planner bookings.' });
  }
});

// Delete a booking by ID
router.delete('/:id', requireSignedIn, async (req, res) => {
  try {
    await pool.query('DELETE FROM bookings WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete booking.' });
  }
});

// Create a new booking
router.post('/', requireSignedIn, async (req, res) => {
  const { staff_id, staff_name, class_name, booking_date, period, recipe, recipe_url, recipe_id, class_size, planner_stream, cook_mode, partner_student_name, partner_student_id, groups } = req.body;
  try {
    await ensureSchema();
    const result = await pool.query(
      "INSERT INTO bookings (staff_id, staff_name, class_name, booking_date, period, recipe, recipe_url, recipe_id, class_size, planner_stream, cook_mode, partner_student_name, partner_student_id, groups) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id",
      [
        staff_id,
        staff_name,
        class_name,
        booking_date,
        period,
        recipe,
        recipe_url,
        recipe_id,
        class_size,
        planner_stream || 'Middle',
        cook_mode || null,
        partner_student_name || null,
        partner_student_id || null,
        groups || null
      ]
    );
    res.json({ success: true, booking_id: result.rows[0].id });
  } catch (err) {
    console.error('Failed to create booking:', err.message);
    res.status(500).json({ error: 'Failed to create booking.' });
  }
});

// Batch create bookings (used by Upload Planners page)
router.post('/batch', requirePlanningRole, async (req, res) => {
  const items = req.body && Array.isArray(req.body.bookings) ? req.body.bookings : null;
  const meta = req.body && req.body.meta ? req.body.meta : {};
  if (!items || !items.length) {
    return res.status(400).json({ error: 'bookings array is required.' });
  }
  try {
    await ensureSchema();
    await ensurePlannerUploadSchema();

    // Upsert planner rows: insert new, update if recipe changed, skip if unchanged.
    // Key: booking_date|planner_stream|class_name (one recipe per class per week per stream).
    const incomingDates = [...new Set(items.map((b) => String(b.booking_date || '').slice(0, 10)).filter(Boolean))];
    // existingPlannerMap: dedupKey -> { id, recipe, recipe_url, recipe_id }
    const existingPlannerMap = new Map();
    if (incomingDates.length) {
      const sortedDates = [...incomingDates].sort();
      const minDate = sortedDates[0];
      const maxDate = sortedDates[sortedDates.length - 1];
      const existingRes = await pool.query(
        `SELECT id, booking_date, planner_stream, class_name, recipe, recipe_url, recipe_id FROM bookings
         WHERE period = 'Planner'
           AND booking_date >= $1
           AND booking_date <= $2`,
        [minDate, maxDate]
      );
      for (const row of existingRes.rows) {
        const key = `${String(row.booking_date || '').slice(0, 10)}|${String(row.planner_stream || '').trim()}|${String(row.class_name || '').trim().toUpperCase()}`;
        existingPlannerMap.set(key, row);
      }
    }

    const ids = [];
    let skipped = 0;
    let updated = 0;
    for (const b of items) {
      const { staff_id, staff_name, class_name, booking_date, period, recipe, recipe_url, recipe_id, class_size, planner_stream } = b;
      const normalizedClassName = normalizeHospTypo(String(class_name || '').trim());
      const streamVal = planner_stream || 'Middle';
      const dateVal = String(booking_date || '').slice(0, 10);
      const classKey = normalizedClassName.toUpperCase();
      const dedupKey = `${dateVal}|${streamVal}|${classKey}`;

      const existing = existingPlannerMap.get(dedupKey);
      if (existing) {
        // Same recipe — nothing to do.
        const sameRecipe = String(existing.recipe || '').trim() === String(recipe || '').trim();
        const sameUrl = String(existing.recipe_url || '').trim() === String(recipe_url || '').trim();
        const sameId = String(existing.recipe_id || '') === String(recipe_id || '');
        const sameClassName = String(existing.class_name || '').trim() === normalizedClassName;
        if (sameRecipe && sameUrl && sameId && sameClassName) {
          skipped += 1;
        } else {
          // Planner details changed — update the existing row so the chip label stays in sync.
          await pool.query(
            `UPDATE bookings SET class_name=$1, recipe=$2, recipe_url=$3, recipe_id=$4 WHERE id=$5`,
            [normalizedClassName, recipe, recipe_url || '', recipe_id || null, existing.id]
          );
          ids.push(existing.id);
          updated += 1;
          existingPlannerMap.set(dedupKey, { ...existing, class_name: normalizedClassName, recipe, recipe_url, recipe_id });
        }
        continue;
      }

      const result = await pool.query(
        "INSERT INTO bookings (staff_id, staff_name, class_name, booking_date, period, recipe, recipe_url, recipe_id, class_size, planner_stream) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id",
        [staff_id, staff_name, normalizedClassName, booking_date, period, recipe, recipe_url, recipe_id, class_size, streamVal]
      );
      ids.push(result.rows[0].id);
      existingPlannerMap.set(dedupKey, { id: result.rows[0].id, recipe, recipe_url, recipe_id }); // prevent dupes within same batch
    }

    // Record this batch upload for planner file explorer/history UI.
    let uploaderEmail = normalizeEmail(req.authUserEmail || meta.uploaded_by_email || '');
    const uploaderName = String(meta.uploaded_by_name || '').trim();
    const fileName = String(meta.file_name || '').trim();
    const stream = String(meta.planner_stream || (items[0] && items[0].planner_stream) || 'Middle').trim() || 'Middle';
    let uploaderStaffCode = '';

    if (!uploaderEmail && items[0] && items[0].staff_id) {
      uploaderStaffCode = String(items[0].staff_id || '').trim();
    }

    if (uploaderEmail) {
      const staffResult = await pool.query(
        `SELECT trim(coalesce(code, '')) AS code
         FROM staff_upload
         WHERE lower(trim(email_school)) = lower(trim($1))
         LIMIT 1`,
        [uploaderEmail]
      );
      uploaderStaffCode = String((staffResult.rows[0] && staffResult.rows[0].code) || '').trim();
    }

    await pool.query(
      `INSERT INTO planner_upload_history
       (file_name, uploaded_by_email, uploaded_by_name, uploaded_by_staff_code, planner_stream, bookings_saved)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        fileName,
        uploaderEmail || null,
        uploaderName || null,
        uploaderStaffCode || null,
        stream,
        ids.length
      ]
    );

    res.json({ success: true, saved: ids.length - updated, updated, skipped, ids });
  } catch (err) {
    console.error('Failed to batch create bookings:', err.message);
    res.status(500).json({ error: 'Failed to save bookings.' });
  }
});

// GET /api/bookings/planner-upload-history
// Optional query params: email=<uploader email>, limit=<n>
router.get('/planner-upload-history', requirePlanningRole, async (req, res) => {
  try {
    await ensurePlannerUploadSchema();
    const email = normalizeEmail(req.query.email || '');
    const limit = Math.max(1, Math.min(500, Number(req.query.limit) || 200));

    let sql = `
      SELECT id, file_name, uploaded_by_email, uploaded_by_name,
             uploaded_by_staff_code, planner_stream, bookings_saved, uploaded_at
      FROM planner_upload_history`;
    const params = [];

    if (email) {
      params.push(email);
      sql += ` WHERE lower(trim(coalesce(uploaded_by_email, ''))) = lower(trim($1))`;
    }

    params.push(limit);
    sql += ` ORDER BY uploaded_at DESC, id DESC LIMIT $${params.length}`;

    const result = await pool.query(sql, params);
    res.json({ success: true, uploads: result.rows });
  } catch (err) {
    console.error('Failed to fetch planner upload history:', err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch planner upload history.' });
  }
});

// GET /api/bookings/planner-class-options - current Upload Subjects TT codes ranked by usage
router.get('/planner-class-options', requirePlanningRole, async (req, res) => {
  try {
    await ensureSchema();
    const result = await pool.query(
      `SELECT
         upper(trim(cu.code)) AS class_code,
         trim(coalesce(cu.class_name, '')) AS class_name,
         trim(coalesce(cu.year_level, '')) AS year_level,
         trim(coalesce(cu.year, '')) AS qualification,
         trim(coalesce(cu.department, '')) AS department,
         count(b.id)::int AS usage_count
       FROM class_upload cu
       LEFT JOIN bookings b
         ON upper(trim(coalesce(b.class_name, ''))) = upper(trim(coalesce(cu.code, '')))
       WHERE coalesce(cu.status, 'Current') = 'Current'
         AND trim(coalesce(cu.code, '')) <> ''
       GROUP BY cu.code, cu.class_name, cu.year_level, cu.year, cu.department
       ORDER BY count(b.id) DESC, upper(trim(cu.code)) ASC`
    );

    const classes = result.rows.map((row) => ({
      code: row.class_code,
      name: row.class_name,
      yearLevel: row.year_level,
      qualification: row.qualification,
      department: row.department,
      usageCount: row.usage_count || 0,
      stream: inferPlannerStreamFromCode(row.class_code)
    }));

    res.json({ success: true, classes });
  } catch (err) {
    console.error('Failed to fetch planner class options:', err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch planner class options.' });
  }
});

// GET /api/bookings/admin/resave-candidates
// Admin-only audit endpoint to find bookings that likely need re-save after SQLite->Postgres migration.
router.get('/admin/resave-candidates', requirePlanningRole, async (req, res) => {
  try {
    await ensureSchema();

    const startDate = parseIsoDate(req.query.startDate) ? String(req.query.startDate).trim() : '';
    const endDate = parseIsoDate(req.query.endDate) ? String(req.query.endDate).trim() : '';
    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(1000, Math.floor(limitRaw))) : 300;

    const params = [];
    const where = ["trim(coalesce(b.recipe, '')) <> ''"];
    if (startDate) {
      params.push(startDate);
      where.push(`b.booking_date >= $${params.length}`);
    }
    if (endDate) {
      params.push(endDate);
      where.push(`b.booking_date <= $${params.length}`);
    }

    params.push(limit);
    const sql = `
      WITH inv AS (
        SELECT recipe_id::text AS recipe_id_text, COUNT(*)::int AS inventory_rows
        FROM ingredients_inventory
        GROUP BY recipe_id::text
      ),
      browse AS (
        SELECT id, lower(trim(name)) AS normalized_name
        FROM recipes
      )
      SELECT
        b.id AS booking_id,
        b.booking_date,
        b.period,
        b.staff_name,
        b.class_name,
        b.recipe,
        b.recipe_id,
        COUNT(dsi.id)::int AS ingredient_rows,
        COUNT(*) FILTER (
          WHERE btrim(coalesce(dsi.recipe_id::text, '')) = btrim(coalesce(b.recipe_id::text, ''))
        )::int AS rows_for_current_recipe,
        COALESCE(inv.inventory_rows, 0)::int AS inventory_rows,
        CASE
          WHEN EXISTS (
            SELECT 1
            FROM browse br
            WHERE btrim(br.id::text) = btrim(coalesce(b.recipe_id::text, ''))
          ) THEN 'id'
          WHEN EXISTS (
            SELECT 1
            FROM browse br
            WHERE br.normalized_name = lower(trim(coalesce(b.recipe, '')))
          ) THEN 'name'
          ELSE 'none'
        END AS browse_match_type
      FROM bookings b
      LEFT JOIN desired_servings_ingredients dsi
        ON dsi.booking_id = b.id
      LEFT JOIN inv
        ON btrim(inv.recipe_id_text) = btrim(coalesce(b.recipe_id::text, ''))
      WHERE ${where.join(' AND ')}
      GROUP BY b.id, b.booking_date, b.period, b.staff_name, b.class_name, b.recipe, b.recipe_id, inv.inventory_rows
      HAVING COUNT(dsi.id) = 0
         OR COUNT(*) FILTER (
              WHERE btrim(coalesce(dsi.recipe_id::text, '')) = btrim(coalesce(b.recipe_id::text, ''))
            ) = 0
      ORDER BY b.booking_date ASC, b.period ASC, b.staff_name ASC, b.class_name ASC
      LIMIT $${params.length}`;

    const result = await pool.query(sql, params);
    const candidates = result.rows.map((row) => ({
      booking_id: row.booking_id,
      booking_date: row.booking_date,
      period: row.period,
      staff_name: row.staff_name,
      class_name: row.class_name,
      recipe: row.recipe,
      recipe_id: row.recipe_id,
      ingredient_rows: row.ingredient_rows,
      rows_for_current_recipe: row.rows_for_current_recipe,
      reason: Number(row.ingredient_rows) === 0
        ? 'missing_desired_servings_rows'
        : 'ingredients_linked_to_other_recipe_only',
      inventory_rows: Number(row.inventory_rows) || 0,
      inventory_status: Number(row.inventory_rows) > 0
        ? 'recipe_has_inventory'
        : 'recipe_missing_inventory',
      browse_match_type: row.browse_match_type || 'none',
      browse_status: (row.browse_match_type && row.browse_match_type !== 'none')
        ? 'recipe_in_browse_list'
        : 'recipe_missing_from_browse_list'
    }));

    const withInventory = candidates.filter((r) => r.inventory_status === 'recipe_has_inventory').length;
    const missingInventory = candidates.filter((r) => r.inventory_status === 'recipe_missing_inventory').length;
    const inBrowseList = candidates.filter((r) => r.browse_status === 'recipe_in_browse_list').length;
    const missingBrowseList = candidates.filter((r) => r.browse_status === 'recipe_missing_from_browse_list').length;

    const plannerTotalsSql = `
      WITH planner_source AS (
        SELECT
          lower(trim(b.recipe)) AS recipe_key,
          upper(trim(coalesce(b.class_name, ''))) AS class_token,
          regexp_replace(upper(trim(coalesce(b.class_name, ''))), '\\s+', '', 'g') AS class_token_compact,
          CASE
            WHEN lower(trim(coalesce(b.planner_stream, ''))) IN ('junior', 'middle', 'senior')
              THEN initcap(lower(trim(coalesce(b.planner_stream, ''))))
            WHEN upper(trim(coalesce(b.class_name, ''))) LIKE '%HOSP%'
              THEN 'Senior'
            WHEN upper(trim(coalesce(b.class_name, ''))) LIKE ANY (ARRAY['%JFOOD%', '%VEFOOD%', '%MMFOOD%', '%SDFOOD%', '%PIFOOD%', '%SRFOOD%', '%JTRFOOD%', '%MTRFOOD%'])
              THEN 'Junior'
            WHEN upper(trim(coalesce(b.class_name, ''))) LIKE '%MFOOD%'
              THEN 'Middle'
            ELSE 'Other'
          END AS resolved_stream
        FROM bookings b
        WHERE b.period = 'Planner'
          AND trim(coalesce(b.recipe, '')) <> ''
      )
      SELECT
        COUNT(*)::int AS planner_recipe_rows_total,
        COUNT(DISTINCT recipe_key)::int AS planner_recipes_distinct_total,
        COUNT(*) FILTER (WHERE resolved_stream = 'Junior')::int AS junior_recipe_rows,
        COUNT(DISTINCT recipe_key) FILTER (WHERE resolved_stream = 'Junior')::int AS junior_recipes_distinct,
        COUNT(*) FILTER (WHERE resolved_stream = 'Middle')::int AS middle_recipe_rows,
        COUNT(DISTINCT recipe_key) FILTER (WHERE resolved_stream = 'Middle')::int AS middle_recipes_distinct,
        COUNT(*) FILTER (WHERE resolved_stream = 'Senior')::int AS senior_recipe_rows,
        COUNT(DISTINCT recipe_key) FILTER (WHERE resolved_stream = 'Senior')::int AS senior_recipes_distinct,
        COUNT(*) FILTER (WHERE class_token_compact LIKE '%11HOSP%')::int AS hosp11_recipe_rows,
        COUNT(DISTINCT recipe_key) FILTER (WHERE class_token_compact LIKE '%11HOSP%')::int AS hosp11_recipes_distinct,
        COUNT(*) FILTER (WHERE class_token_compact LIKE '%12HOSP%')::int AS hosp12_recipe_rows,
        COUNT(DISTINCT recipe_key) FILTER (WHERE class_token_compact LIKE '%12HOSP%')::int AS hosp12_recipes_distinct,
        COUNT(*) FILTER (WHERE class_token_compact LIKE '%13HOSP%')::int AS hosp13_recipe_rows,
        COUNT(DISTINCT recipe_key) FILTER (WHERE class_token_compact LIKE '%13HOSP%')::int AS hosp13_recipes_distinct
      FROM planner_source
    `;
    const plannerTotalsResult = await pool.query(plannerTotalsSql);
    const plannerTotals = plannerTotalsResult.rows[0] || {};

    res.json({
      success: true,
      filters: { startDate: startDate || null, endDate: endDate || null, limit },
      count: candidates.length,
      planner_totals: {
        planner_recipe_rows_total: Number(plannerTotals.planner_recipe_rows_total || 0),
        planner_recipes_distinct_total: Number(plannerTotals.planner_recipes_distinct_total || 0),
        junior_recipe_rows: Number(plannerTotals.junior_recipe_rows || 0),
        junior_recipes_distinct: Number(plannerTotals.junior_recipes_distinct || 0),
        middle_recipe_rows: Number(plannerTotals.middle_recipe_rows || 0),
        middle_recipes_distinct: Number(plannerTotals.middle_recipes_distinct || 0),
        senior_recipe_rows: Number(plannerTotals.senior_recipe_rows || 0),
        senior_recipes_distinct: Number(plannerTotals.senior_recipes_distinct || 0),
        hosp11_recipe_rows: Number(plannerTotals.hosp11_recipe_rows || 0),
        hosp11_recipes_distinct: Number(plannerTotals.hosp11_recipes_distinct || 0),
        hosp12_recipe_rows: Number(plannerTotals.hosp12_recipe_rows || 0),
        hosp12_recipes_distinct: Number(plannerTotals.hosp12_recipes_distinct || 0),
        hosp13_recipe_rows: Number(plannerTotals.hosp13_recipe_rows || 0),
        hosp13_recipes_distinct: Number(plannerTotals.hosp13_recipes_distinct || 0)
      },
      comparison: {
        recipe_has_inventory: withInventory,
        recipe_missing_inventory: missingInventory,
        recipe_in_browse_list: inBrowseList,
        recipe_missing_from_browse_list: missingBrowseList
      },
      candidates
    });
  } catch (err) {
    console.error('Failed to fetch re-save candidates:', err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch re-save candidates.' });
  }
});

// GET /api/bookings/admin/transfer-metrics
// Admin-only endpoint to fetch transfer cost metrics for Dashboard
router.get('/admin/transfer-metrics', requirePlanningRole, async (req, res) => {
  try {
    // Calculate transfer metrics
    const neonMonthlyGB = 1076; // Documented overage from Neon
    const neonRate = 0.09; // $/GB
    const neonFreeAllowance = 100; // GB
    const neonCost = Math.max(0, (neonMonthlyGB - neonFreeAllowance) * neonRate);

    // Railway estimation - with auth guards in place
    const railwayMonthlyGB = 75; // Conservative estimate with auth/bounded queries
    const railwayRate = 0.05; // $/GB
    const railwayFreeAllowance = 10; // GB
    const railwayCost = Math.max(0, (railwayMonthlyGB - railwayFreeAllowance) * railwayRate);

    const monthlySavings = neonCost - railwayCost;
    const yearlySavings = monthlySavings * 12;

    res.json({
      success: true,
      neon: {
        monthlyGB: neonMonthlyGB,
        ratePerGB: neonRate,
        freeAllowance: neonFreeAllowance,
        monthlyCost: parseFloat(neonCost.toFixed(2))
      },
      railway: {
        monthlyGB: railwayMonthlyGB,
        ratePerGB: railwayRate,
        freeAllowance: railwayFreeAllowance,
        monthlyCost: parseFloat(railwayCost.toFixed(2))
      },
      savings: {
        monthlyAmount: parseFloat(monthlySavings.toFixed(2)),
        yearlyAmount: parseFloat(yearlySavings.toFixed(2)),
        percentReduction: parseFloat(((neonCost - railwayCost) / neonCost * 100).toFixed(1))
      }
    });
  } catch (err) {
    console.error('Failed to fetch transfer metrics:', err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch transfer metrics.' });
  }
});

// POST /api/bookings/prefill-from-planner
// Admin-only utility: creates class bookings for Food/HOSP periods from planner recipes (single or double).
// Body (optional): { startDate, endDate, dryRun, force_update_recipe }
router.post('/prefill-from-planner', requirePlanningRole, async (req, res) => {
  try {
    await ensureSchema();

    const body = req.body || {};
    const dryRun = body.dryRun === true || String(body.dryRun || '').toLowerCase() === 'true';
    const forceUpdateRecipe = body.force_update_recipe === true;

    const startDateObj = parseIsoDate(body.startDate) || new Date();
    const yearEnd = new Date(startDateObj.getFullYear(), 11, 31);
    const endDateObj = parseIsoDate(body.endDate) || yearEnd;

    if (startDateObj > endDateObj) {
      return res.status(400).json({ success: false, error: 'startDate must be before endDate.' });
    }

    const startDate = toIsoDate(startDateObj);
    const endDate = toIsoDate(endDateObj);

    const plannerResult = await pool.query(
      `SELECT b.id, b.booking_date, b.class_name, b.planner_stream, b.recipe, b.recipe_url, b.recipe_id
       FROM bookings b
       WHERE b.period = 'Planner'
         AND b.booking_date >= $1
         AND b.booking_date <= $2
         AND trim(coalesce(b.recipe, '')) <> ''
       ORDER BY b.booking_date ASC, b.id ASC`,
      [startDate, endDate]
    );

    const plannerByDateAndStream = new Map();
    const plannerByDateAndClassCode = new Map();
    for (const row of plannerResult.rows) {
      const storedStream = String(row.planner_stream || '').trim();
      const stream = (storedStream && storedStream !== 'Other')
        ? storedStream
        : String(inferStreamFromClassToken(row.class_name) || inferPlannerStreamFromCode(row.class_name) || '').trim();
      if (!stream || stream === 'Other') continue;
      const date = String(row.booking_date || '').slice(0, 10);
      const plannerRow = {
        id: row.id,
        booking_date: row.booking_date,
        class_name: row.class_name,
        planner_stream: row.planner_stream,
        recipe: row.recipe,
        recipe_url: row.recipe_url,
        recipe_id: normalizeRecipeId(row.recipe_id)
      };

      const streamKey = `${date}|${stream}`;
      if (!plannerByDateAndStream.has(streamKey)) {
        plannerByDateAndStream.set(streamKey, plannerRow);
      }

      const classCode = inferPlannerClassCode(row.class_name);
      if (classCode) {
        const classCodeKey = `${date}|${classCode}`;
        if (!plannerByDateAndClassCode.has(classCodeKey)) {
          plannerByDateAndClassCode.set(classCodeKey, plannerRow);
        }
      }
    }

    if (!plannerByDateAndStream.size) {
      return res.json({
        success: true,
        dryRun,
        summary: {
          startDate,
          endDate,
          plannerRecipesFound: 0,
          candidates: 0,
          singlePeriodCandidates: 0,
          multiPeriodCandidates: 0,
          inserted: 0,
          skippedExisting: 0,
          skippedNoPlanner: 0,
          skippedNonFood: 0,
          skippedNotDouble: 0
        }
      });
    }

    const staffResult = await pool.query(
      `SELECT id, code, first_name, last_name
       FROM staff_upload`
    );
    const staffByCode = new Map();
    for (const s of staffResult.rows) {
      const key = normalizeClassToken(s.code);
      if (key) staffByCode.set(key, s);
    }

    const timetableResult = await pool.query(
      `SELECT "Teacher", "D1_P1_1", "D1_P1_2", "D1_P2", "D1_P3", "D1_P4", "D1_P5",
              "D2_P1_1", "D2_P1_2", "D2_P2", "D2_P3", "D2_P4", "D2_P5",
              "D3_P1_1", "D3_P1_2", "D3_P2", "D3_P3", "D3_P4", "D3_P5",
              "D4_P1_1", "D4_P1_2", "D4_P2", "D4_P3", "D4_P4", "D4_P5",
              "D5_P1_1", "D5_P1_2", "D5_P2", "D5_P3", "D5_P4", "D5_P5"
       FROM kamar_timetable
       WHERE coalesce(status, 'Current') = 'Current'`
    );

    const existingResult = await pool.query(
      `SELECT id, booking_date, period, class_name, staff_id, staff_name, class_size, groups, recipe, recipe_url, recipe_id
       FROM bookings
       WHERE booking_date >= $1
         AND booking_date <= $2
         AND period IN ('1','2','3','4','5')`,
      [startDate, endDate]
    );

    // Build class-size lookup from the current student timetable only.
    // This intentionally avoids historical booking sizes.
    const studentPeriodColumns = [
      'mon_p1_1','mon_p1_2','mon_p2','mon_i','mon_p3','mon_p4','mon_l','mon_p5',
      'tue_p1_1','tue_p1_2','tue_p2','tue_i','tue_p3','tue_p4','tue_l','tue_p5',
      'wed_p1_1','wed_p1_2','wed_p2','wed_i','wed_p3','wed_p4','wed_l','wed_p5',
      'thu_p1_1','thu_p1_2','thu_p2','thu_i','thu_p3','thu_p4','thu_l','thu_p5',
      'fri_p1_1','fri_p1_2','fri_p2','fri_i','fri_p3','fri_p4','fri_l','fri_p5'
    ];
    const studentTimetableResult = await pool.query(
      `SELECT id_number, ${studentPeriodColumns.join(', ')}
       FROM student_timetable
       WHERE COALESCE(status, 'Current') = 'Current'`
    );
    const studentIdsByClassToken = new Map();

    function addStudentToken(token, studentId) {
      const key = normalizeClassToken(token);
      const id = String(studentId || '').trim();
      if (!key || !id) return;
      if (!studentIdsByClassToken.has(key)) studentIdsByClassToken.set(key, new Set());
      studentIdsByClassToken.get(key).add(id);
    }

    for (const row of studentTimetableResult.rows) {
      const studentId = row.id_number;
      for (const col of studentPeriodColumns) {
        const parts = String(row[col] || '')
          .split(/[;|]/g)
          .map((v) => String(v || '').trim())
          .filter(Boolean);
        for (const token of parts) addStudentToken(token, studentId);
      }
    }

    function studentCountForToken(token) {
      const set = studentIdsByClassToken.get(normalizeClassToken(token));
      return set ? set.size : 0;
    }

    function resolvePrefillClassSize(className, teacherCode) {
      const classKey = normalizeClassToken(className);
      if (!classKey) return null;

      // Match strategy mirrors the student by-class route token triangulation.
      const firstDash = classKey.indexOf('-');
      const coreSuffix = (firstDash > 0 && firstDash < classKey.length - 1)
        ? classKey.slice(firstDash + 1)
        : null;
      const useCore = coreSuffix && coreSuffix.includes('-') && coreSuffix.length >= 4;
      const normalizedTeacherCode = normalizeClassToken(teacherCode);

      if (normalizedTeacherCode && useCore) {
        const exactStudentToken = `${normalizedTeacherCode}-${coreSuffix}`;
        const exactCount = studentCountForToken(exactStudentToken);
        if (exactCount > 0) return exactCount;
      }

      const fullTokenCount = studentCountForToken(classKey);
      if (fullTokenCount > 0) return fullTokenCount;

      if (useCore) {
        const coreCount = studentCountForToken(coreSuffix);
        if (coreCount > 0) return coreCount;
      }

      const groupedKey = classGroupKeyForPrefill(classKey);
      if (groupedKey && groupedKey !== classKey) {
        const groupedCount = studentCountForToken(groupedKey);
        if (groupedCount > 0) return groupedCount;
      }

      return null;
    }

    const existingSlots = new Set();
    const existingBookingBySlot = new Map();
    const existingBookingsByGroupedSlot = new Map();
    for (const row of existingResult.rows) {
      const rowDateIso = String(row.booking_date || '').slice(0, 10);
      const rowPeriod = String(row.period || '').trim();
      const rowClassToken = normalizeClassToken(row.class_name);
      const slotKey = `${rowDateIso}|${rowPeriod}|${rowClassToken}`;
      existingSlots.add(slotKey);
      if (!existingBookingBySlot.has(slotKey)) existingBookingBySlot.set(slotKey, row);

      const groupedClassKey = classGroupKeyForPrefill(rowClassToken);
      const groupedSlotKey = `${rowDateIso}|${rowPeriod}|${groupedClassKey}`;
      if (!existingBookingsByGroupedSlot.has(groupedSlotKey)) {
        existingBookingsByGroupedSlot.set(groupedSlotKey, []);
      }
      existingBookingsByGroupedSlot.get(groupedSlotKey).push(row);
    }

    const inserts = [];
    const updates = [];
    const groupUpdates = [];
    const recipeUpdates = [];
    const stats = {
      plannerRecipesFound: plannerByDateAndStream.size,
      candidates: 0,
      singlePeriodCandidates: 0,
      multiPeriodCandidates: 0,
      inserted: 0,
      skippedExisting: 0,
      recipesUpdated: 0,
      skippedNoPlanner: 0,
      skippedNonFood: 0,
      skippedNotDouble: 0,
      classSizePrefilled: 0,
      classSizeBackfilled: 0,
      groupsDefaultsApplied: 0
    };

    // Diagnostics collected for dry run
    const diagNotDouble = [];   // retained for compatibility (now expected to be empty)
    const diagExisting = [];    // already-booked slots (sample)
    const diagNoPlanner = [];   // food periods with no planner recipe
    const diagSingleMatches = []; // single-period food classes now matched to planner

    const cursor = new Date(startDateObj);
    cursor.setHours(0, 0, 0, 0);

    while (cursor <= endDateObj) {
      const day = cursor.getDay();
      if (day >= 1 && day <= 5) {
        const dayPrefix = `D${day}`;
        const dateIso = toIsoDate(cursor);

        for (const row of timetableResult.rows) {
          const teacherCode = normalizeClassToken(row.Teacher);
          if (!teacherCode) continue;

          const periodClasses = {
            1: splitClasses([row[`${dayPrefix}_P1_1`], row[`${dayPrefix}_P1_2`]]),
            2: splitClasses([row[`${dayPrefix}_P2`]]),
            3: splitClasses([row[`${dayPrefix}_P3`]]),
            4: splitClasses([row[`${dayPrefix}_P4`]]),
            5: splitClasses([row[`${dayPrefix}_P5`]])
          };

          const classPeriodMap = new Map();
          for (const [period, classes] of Object.entries(periodClasses)) {
            for (const cls of classes) {
              const token = normalizeClassToken(cls);
              if (!token) continue;
              const groupKey = classGroupKeyForPrefill(token);
              if (!groupKey) continue;
              const arr = classPeriodMap.get(groupKey) || [];
              arr.push({ period: Number(period), classToken: token });
              classPeriodMap.set(groupKey, arr);
            }
          }

          for (const [classGroupKey, periodEntries] of classPeriodMap.entries()) {
            const uniquePeriods = Array.from(new Set(periodEntries.map((entry) => Number(entry.period))));
            if (!uniquePeriods.length) continue;

            const stream = inferStreamFromClassToken(classGroupKey);
            if (!stream) {
              stats.skippedNonFood += uniquePeriods.length;
              continue;
            }

            const classCode = inferPlannerClassCode(classGroupKey);
            const isSinglePeriodClass = uniquePeriods.length === 1;
            const isSeniorSingleTheory = isSinglePeriodClass && ['11HOSP', '12HOSP', '13HOSP'].includes(String(classCode || '').toUpperCase());
            const isMiddleSingleTheory = isSinglePeriodClass && String(classCode || '').toUpperCase() === 'MFOOD';
            const seniorPlannerClassCodes = new Set(['11HOSP', '12HOSP', '13HOSP', 'HOSPCOOK', 'HOSP']);
            const isSeniorPlannerClass = seniorPlannerClassCodes.has(String(classCode || '').toUpperCase());
            const classPlannerKey = classCode ? `${dateIso}|${classCode}` : '';
            const classWeekKey = classCode ? `${weekMondayIso(dateIso)}|${classCode}` : '';
            const classSpecificPlanner = classCode
              ? (plannerByDateAndClassCode.get(classPlannerKey) || plannerByDateAndClassCode.get(classWeekKey))
              : null;

            let targetRecipe = '';
            let targetRecipeUrl = '';
            let targetRecipeId = null;

            if (isSeniorSingleTheory && !classSpecificPlanner) {
              targetRecipe = 'No recipe allocated';
              targetRecipeUrl = '';
              targetRecipeId = null;
            } else if (isSeniorSingleTheory || isMiddleSingleTheory) {
              targetRecipe = 'Theory';
            } else {
              const plannerKey = `${dateIso}|${stream}`;
              const weekKey = `${weekMondayIso(dateIso)}|${stream}`;

              // Senior classes must not inherit another class's stream recipe when blank in planner.
              if (isSeniorPlannerClass && !classSpecificPlanner) {
                targetRecipe = 'No recipe allocated';
                targetRecipeUrl = '';
                targetRecipeId = null;
              }

              const planner = classSpecificPlanner ||
                (isSeniorPlannerClass ? null : (plannerByDateAndStream.get(plannerKey) || plannerByDateAndStream.get(weekKey)));
              if (!planner) {
                if (targetRecipe === 'No recipe allocated') {
                  // Keep explicit placeholder for senior classes with blank planner recipe.
                } else {
                stats.skippedNoPlanner += uniquePeriods.length;
                if (dryRun && diagNoPlanner.length < 20) {
                  diagNoPlanner.push({ date: dateIso, teacher: teacherCode, class: classGroupKey, classCode, stream, periods: uniquePeriods });
                }
                continue;
                }
              }

              if (planner) {
                targetRecipe = String(planner.recipe || '').trim();
                targetRecipeUrl = planner.recipe_url || '';
                targetRecipeId = planner.recipe_id || null;
              }
            }

            const staffRow = staffByCode.get(teacherCode);
            const staffId = staffRow ? String(staffRow.id || '') : '';
            const staffName = buildTeacherName(staffRow, teacherCode);

            for (const period of uniquePeriods) {
              const matchingEntry = periodEntries.find((entry) => Number(entry.period) === Number(period));
              const classTokenForBooking = matchingEntry ? matchingEntry.classToken : classGroupKey;
              stats.candidates += 1;
              if (isSinglePeriodClass) {
                stats.singlePeriodCandidates += 1;
              } else {
                stats.multiPeriodCandidates += 1;
              }
              const slotKey = `${dateIso}|${period}|${classTokenForBooking}`;
              const groupedSlotKey = `${dateIso}|${period}|${classGroupKey}`;
              const resolvedClassSize = resolvePrefillClassSize(classTokenForBooking, teacherCode);
              const defaultGroupCount = defaultGroupCountForStream(stream, resolvedClassSize);
              const groupedMatches = existingBookingsByGroupedSlot.get(groupedSlotKey) || [];
              const exactExistingBooking = existingSlots.has(slotKey) ? existingBookingBySlot.get(slotKey) : null;
              const existingBooking = exactExistingBooking || groupedMatches[0] || null;
              if (existingBooking) {
                const hasClassSize = existingBooking && String(existingBooking.class_size || '').trim() !== '';
                if (!hasClassSize && resolvedClassSize) {
                  updates.push({
                    id: Number(existingBooking.id),
                    class_size: resolvedClassSize
                  });
                  stats.classSizeBackfilled += 1;
                }
                const hasGroups = existingBooking && String(existingBooking.groups || '').trim() !== '';
                if (!hasGroups && defaultGroupCount) {
                  groupUpdates.push({
                    id: Number(existingBooking.id),
                    groups: defaultGroupCount
                  });
                  stats.groupsDefaultsApplied += 1;
                }
                if (!dryRun) {
                  const existingRecipe = String(existingBooking && existingBooking.recipe ? existingBooking.recipe : '').trim().toLowerCase();
                  const targetRecipeName = String(targetRecipe || '').trim().toLowerCase();
                  const existingRecipeId = normalizeRecipeId(existingBooking && existingBooking.recipe_id);
                  const desiredRecipeId = normalizeRecipeId(targetRecipeId);

                  const nameChangedWithForce = forceUpdateRecipe && targetRecipeName && existingRecipe !== targetRecipeName;
                  const linkedRecipeChanged = desiredRecipeId && existingRecipeId !== desiredRecipeId;
                  const explicitNoRecipe = targetRecipeName === 'no recipe allocated' && existingRecipe !== targetRecipeName;
                  const clearStaleNoRecipeLink = targetRecipeName === 'no recipe allocated' && (
                    existingRecipeId !== null ||
                    String(existingBooking && existingBooking.recipe_url ? existingBooking.recipe_url : '').trim() !== ''
                  );

                  if (nameChangedWithForce || linkedRecipeChanged || explicitNoRecipe || clearStaleNoRecipeLink) {
                    recipeUpdates.push({
                      id: Number(existingBooking.id),
                      recipe: targetRecipe,
                      recipe_url: targetRecipeUrl,
                      recipe_id: targetRecipeId
                    });
                    stats.recipesUpdated += 1;
                  }
                }
                stats.skippedExisting += 1;
                if (dryRun && diagExisting.length < 30) {
                  diagExisting.push({ date: dateIso, period: String(period), class: classTokenForBooking, teacher: teacherCode, stream, recipe: targetRecipe });
                }
                if (dryRun && isSinglePeriodClass && diagSingleMatches.length < 50) {
                  diagSingleMatches.push({ date: dateIso, period: String(period), class: classTokenForBooking, teacher: teacherCode, stream, recipe: targetRecipe, status: 'already-booked' });
                }
                continue;
              }

              if (dryRun && isSinglePeriodClass && diagSingleMatches.length < 50) {
                diagSingleMatches.push({ date: dateIso, period: String(period), class: classTokenForBooking, teacher: teacherCode, stream, recipe: targetRecipe, status: 'will-book' });
              }

              const booking = {
                staff_id: staffId,
                staff_name: staffName,
                class_name: classTokenForBooking,
                booking_date: dateIso,
                period: String(period),
                recipe: targetRecipe,
                recipe_url: targetRecipeUrl,
                recipe_id: targetRecipeId,
                class_size: resolvedClassSize,
                groups: defaultGroupCount,
                planner_stream: stream
              };
              if (booking.groups) stats.groupsDefaultsApplied += 1;
              if (booking.class_size) stats.classSizePrefilled += 1;
              inserts.push(booking);
              existingSlots.add(slotKey);
            }
          }
        }
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    if (!dryRun && (inserts.length || updates.length || recipeUpdates.length)) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        for (const u of updates) {
          await client.query(
            'UPDATE bookings SET class_size = $1 WHERE id = $2 AND (class_size IS NULL OR trim(class_size::text) = \'\')',
            [u.class_size, u.id]
          );
        }

        for (const u of groupUpdates) {
          await client.query(
            'UPDATE bookings SET groups = $1 WHERE id = $2 AND (groups IS NULL OR trim(groups::text) = \'\')',
            [u.groups, u.id]
          );
        }

        for (const u of recipeUpdates) {
          await client.query(
            'UPDATE bookings SET recipe = $1, recipe_url = $2, recipe_id = $3 WHERE id = $4',
            [u.recipe, u.recipe_url, u.recipe_id, u.id]
          );
        }

        for (const b of inserts) {
          await client.query(
            `INSERT INTO bookings
             (staff_id, staff_name, class_name, booking_date, period, recipe, recipe_url, recipe_id, class_size, groups, planner_stream)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
            [
              b.staff_id,
              b.staff_name,
              b.class_name,
              b.booking_date,
              b.period,
              b.recipe,
              b.recipe_url,
              b.recipe_id,
              b.class_size,
              b.groups,
              b.planner_stream
            ]
          );
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    stats.inserted = inserts.length;
    return res.json({
      success: true,
      dryRun,
      summary: {
        startDate,
        endDate,
        ...stats,
        recipesUpdated: recipeUpdates.length
      },
      preview: inserts.slice(0, 25),
      ...(dryRun ? {
        plannerRecipes: Array.from(plannerByDateAndStream.entries()).map(([key, row]) => {
          const [date, stream] = key.split('|');
          return { date, stream, recipe: row.recipe };
        }).sort((a, b) => a.date.localeCompare(b.date)),
        singlePeriodMatches: diagSingleMatches,
        alreadyExist: diagExisting,
        notDoublePeriod: diagNotDouble,
        noPlanner: diagNoPlanner
      } : {})
    });
  } catch (err) {
    console.error('Failed to prefill bookings from planner:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to prefill bookings from planner.' });
  }
});

// Return the min/max booking_date of all planner entries (period = 'Planner')
// Used by the "Sync from Planner" button to determine the date range to sync
router.get('/planner-range', async (req, res) => {
  try {
    await ensureSchema();
    const result = await pool.query(
      `SELECT MIN(booking_date)::text AS min_date, MAX(booking_date)::text AS max_date
       FROM bookings
       WHERE period = 'Planner' AND trim(coalesce(recipe, '')) <> ''`
    );
    const row = result.rows[0] || {};
    res.json({
      success: true,
      minDate: row.min_date || null,
      maxDate: row.max_date || null
    });
  } catch (err) {
    console.error('Failed to fetch planner range:', err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch planner range.' });
  }
});

// Get all bookings — optional filters:
// ?start=YYYY-MM-DD&end=YYYY-MM-DD (date range)
// ?staff_id=<id> (staff-scoped)
// ?planner_stream=<stream label>
// NOTE: This endpoint is public (read-only) because it now has built-in guards:
//   - Default date window: ±120 days
//   - Row limit: 1500 default, 4000 max
//   - Transfer logging enabled
router.get('/all', requireSignedIn, async (req, res) => {
  try {
    await ensureSchema();
    const { start, end, staff_id, planner_stream } = req.query;
    const fieldsMode = String(req.query.fields || '').trim().toLowerCase();
    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(4000, Math.floor(limitRaw))) : 1500;
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    if ((start && !dateRe.test(start)) || (end && !dateRe.test(end))) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });
    }

    const today = new Date();
    const defaultStartDate = new Date(today);
    defaultStartDate.setDate(defaultStartDate.getDate() - 120);
    const defaultEndDate = new Date(today);
    defaultEndDate.setDate(defaultEndDate.getDate() + 120);

    const hasExplicitDateFilter = Boolean(start || end);
    const boundedStart = start || (!hasExplicitDateFilter ? toIsoDate(defaultStartDate) : '');
    const boundedEnd = end || (!hasExplicitDateFilter ? toIsoDate(defaultEndDate) : '');

    if (boundedStart && boundedEnd) {
      const startDateObj = parseIsoDate(boundedStart);
      const endDateObj = parseIsoDate(boundedEnd);
      if (!startDateObj || !endDateObj) {
        return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });
      }
      const spanMs = endDateObj.getTime() - startDateObj.getTime();
      const maxSpanMs = 370 * 24 * 60 * 60 * 1000;
      if (spanMs > maxSpanMs) {
        return res.status(400).json({ error: 'Date range too large. Limit requests to about one year.' });
      }
    }

    const normalizedStaffId = String(staff_id || '').trim();
    const normalizedPlannerStream = String(planner_stream || '').trim();

    const fieldSet = new Set([
      'id',
      'staff_id',
      'staff_name',
      'class_name',
      'booking_date',
      'period',
      'recipe',
      'recipe_url',
      'recipe_id',
      'class_size',
      'planner_stream',
      'cook_mode',
      'partner_student_name',
      'partner_student_id',
      'groups'
    ]);

    let query = `
      SELECT
        b.id, b.staff_id, b.staff_name, b.class_name, b.booking_date, b.period,
        b.recipe, b.recipe_url, b.recipe_id, b.class_size, b.planner_stream,
        b.cook_mode, b.partner_student_name, b.partner_student_id, b.groups,
        r.name AS linked_recipe_name,
        r.url AS linked_recipe_url
      FROM bookings b
      LEFT JOIN recipes r
        ON r.id = CAST(
          NULLIF(
            regexp_replace(COALESCE(b.recipe_id::text, ''), '[^0-9]', '', 'g'),
            ''
          )
          AS INTEGER
        )`;
    const params = [];
    const where = [];

    if (boundedStart && boundedEnd) {
      where.push(`b.booking_date >= $${params.length + 1} AND b.booking_date <= $${params.length + 2}`);
      params.push(boundedStart, boundedEnd);
    } else if (boundedStart) {
      where.push(`b.booking_date >= $${params.length + 1}`);
      params.push(boundedStart);
    } else if (boundedEnd) {
      where.push(`b.booking_date <= $${params.length + 1}`);
      params.push(boundedEnd);
    }

    if (normalizedStaffId) {
      where.push(`cast(b.staff_id as text) = $${params.length + 1}`);
      params.push(normalizedStaffId);
    }

    if (normalizedPlannerStream) {
      where.push(`lower(coalesce(b.planner_stream, '')) = lower($${params.length + 1})`);
      params.push(normalizedPlannerStream);
    }

    if (where.length) {
      query += ` WHERE ${where.join(' AND ')}`;
    }

    params.push(limit);
    query += ` ORDER BY b.booking_date DESC, b.period LIMIT $${params.length}`;
    const result = await pool.query(query, params);

    let rows = result.rows;
    if (fieldsMode === 'calendar' || fieldsMode === 'summary') {
      rows = result.rows.map((row) => {
        const summaryRow = {
          id: row.id,
          staff_id: row.staff_id,
          staff_name: row.staff_name,
          class_name: row.class_name,
          booking_date: row.booking_date,
          period: row.period,
          recipe: row.recipe,
          recipe_url: row.recipe_url,
          recipe_id: row.recipe_id,
          linked_recipe_name: row.linked_recipe_name,
          linked_recipe_url: row.linked_recipe_url,
          class_size: row.class_size,
          planner_stream: row.planner_stream,
          groups: row.groups
        };
        if (fieldsMode === 'summary') {
          return summaryRow;
        }
        return summaryRow;
      });
    }

    const payload = { bookings: rows };
    const userLabel = req.authUserEmail || 'public';
    logJsonTransfer('GET /api/bookings/all', payload, `rows=${rows.length} user=${userLabel} start=${boundedStart || '-'} end=${boundedEnd || '-'} limit=${limit} fields=${fieldsMode || 'full'}`);
    res.json(payload);
  } catch (err) {
    console.error('[BOOKINGS] Failed to fetch bookings:', err.message, err.stack);
    res.status(500).json({ error: 'Failed to fetch bookings.', details: err.message });
  }
});

// Get one booking by id
router.get('/item/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ success: false, error: 'Invalid booking id.' });
  }
  try {
    await ensureSchema();
    const result = await pool.query('SELECT * FROM bookings WHERE id = $1 LIMIT 1', [id]);
    if (!result.rowCount) {
      return res.status(404).json({ success: false, error: 'Booking not found.' });
    }
    res.json({ success: true, booking: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch booking.' });
  }
});

// iCal feed — only bookings with a teacher allocated
// Subscribe URL: /api/bookings/ical
router.get('/ical', async (req, res) => {
  // NZ school period start/end times (local, NZST/NZDT handled via UTC offset below)
  const PERIOD_TIMES = {
    1: { start: '08:55', end: '09:55' },
    2: { start: '10:00', end: '11:00' },
    3: { start: '11:05', end: '12:05' },
    4: { start: '12:55', end: '13:55' },
    5: { start: '14:00', end: '15:00' }
  };
  const TIMEZONE = 'Pacific/Auckland';

  function escIcal(str) {
    return String(str == null ? '' : str)
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\n/g, '\\n');
  }

  function foldLine(line) {
    // RFC 5545: lines must be folded at 75 octets
    const out = [];
    let remaining = line;
    while (remaining.length > 75) {
      out.push(remaining.slice(0, 75));
      remaining = ' ' + remaining.slice(75);
    }
    out.push(remaining);
    return out.join('\r\n');
  }

  function toIcalDt(dateStr, timeStr) {
    // dateStr = YYYY-MM-DD, timeStr = HH:MM
    // Return a TZID datetime string
    const d = dateStr.replace(/-/g, '');
    const t = timeStr.replace(':', '') + '00';
    return `${d}T${t}`;
  }

  try {
    const result = await pool.query(
      `SELECT * FROM bookings
       ORDER BY booking_date, period`
    );

    const bookings = result.rows;
    const now = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z';

    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//RecipeCalculator//BookingSchedule//EN',
      `X-WR-CALNAME:Food Room Booking Schedule`,
      'X-WR-TIMEZONE:Pacific/Auckland',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VTIMEZONE',
      'TZID:Pacific/Auckland',
      'BEGIN:STANDARD',
      'DTSTART:19700405T030000',
      'RRULE:FREQ=YEARLY;BYDAY=1SU;BYMONTH=4',
      'TZOFFSETFROM:+1300',
      'TZOFFSETTO:+1200',
      'TZNAME:NZST',
      'END:STANDARD',
      'BEGIN:DAYLIGHT',
      'DTSTART:19700927T020000',
      'RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=9',
      'TZOFFSETFROM:+1200',
      'TZOFFSETTO:+1300',
      'TZNAME:NZDT',
      'END:DAYLIGHT',
      'END:VTIMEZONE'
    ];

    // Deduplicate by date + recipe so multiple period bookings for the same recipe
    // on the same day appear as a single all-day event in Google Calendar.
    const seen = new Set();
    for (const b of bookings) {
      const recipe = String(b.recipe || '').trim();
      const stream = String(b.planner_stream || 'Middle').trim();
      const key = `${b.booking_date}|${recipe}|${b.class_name || ''}|${stream}`;
      if (seen.has(key)) continue;
      seen.add(key);

      // Full-day event: DTEND is the following day (RFC 5545 §3.6.1)
      const startDate = String(b.booking_date || '').replace(/-/g, '');
      const nextDay = new Date(b.booking_date);
      nextDay.setDate(nextDay.getDate() + 1);
      const endDate = nextDay.toISOString().slice(0, 10).replace(/-/g, '');

      const summary = [recipe, b.class_name].filter(Boolean).join(' \u2013 ');
      const description = [
        recipe ? `Recipe: ${recipe}` : '',
        stream ? `Planner stream: ${stream}` : '',
        b.class_name ? `Class: ${b.class_name}` : '',
        b.staff_name ? `Teacher: ${b.staff_name}` : '',
        b.class_size ? `Class size: ${b.class_size}` : ''
      ].filter(Boolean).join('\\n');

      lines.push('BEGIN:VEVENT');
      lines.push(foldLine(`UID:planner-${startDate}-${encodeURIComponent(recipe)}-${encodeURIComponent(b.class_name || '')}@recipecalculator`));
      lines.push(`DTSTAMP:${now}`);
      lines.push(`DTSTART;VALUE=DATE:${startDate}`);
      lines.push(`DTEND;VALUE=DATE:${endDate}`);
      lines.push(foldLine(`SUMMARY:${escIcal(summary || 'Year Planner')}`));
      lines.push(foldLine(`DESCRIPTION:${escIcal(description)}`));
      lines.push('END:VEVENT');
    }

    lines.push('END:VCALENDAR');

    const body = lines.join('\r\n');
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="booking_schedule.ics"');
    res.send(body);
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate iCal feed.' });
  }
});

module.exports = router;
