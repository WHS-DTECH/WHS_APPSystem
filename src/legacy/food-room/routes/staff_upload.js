const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAdmin } = require('../middleware/requireAdmin');

let staffSchemaEnsured = false;
async function ensureStaffSchema() {
  if (staffSchemaEnsured) return;
  await pool.query("ALTER TABLE staff_upload ADD COLUMN IF NOT EXISTS primary_role TEXT DEFAULT 'staff'");
  await pool.query('ALTER TABLE staff_upload ADD COLUMN IF NOT EXISTS upload_year INTEGER');
  await pool.query('ALTER TABLE staff_upload ADD COLUMN IF NOT EXISTS upload_term TEXT');
  await pool.query('ALTER TABLE staff_upload ADD COLUMN IF NOT EXISTS upload_date DATE');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS staff_upload_history (
      id SERIAL PRIMARY KEY,
      email_school TEXT NOT NULL,
      code TEXT,
      first_name TEXT,
      last_name TEXT,
      title TEXT,
      status_snapshot TEXT DEFAULT 'Current',
      upload_year INTEGER,
      upload_term TEXT,
      upload_date DATE,
      source TEXT DEFAULT 'upload',
      recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS staff_upload_history_unique_snapshot
    ON staff_upload_history (lower(trim(email_school)), upload_year, lower(trim(upload_term)), upload_date, status_snapshot)
  `);
  await pool.query("UPDATE staff_upload SET primary_role = 'staff' WHERE primary_role IS NULL OR trim(primary_role) = ''");
  await pool.query(`
    UPDATE staff_upload
    SET upload_year = 2026,
        upload_term = 'Term 1',
        upload_date = DATE '2026-04-01'
    WHERE COALESCE(status, 'Current') = 'Current'
      AND upload_year IS NULL
      AND COALESCE(trim(upload_term), '') = ''
      AND upload_date IS NULL
  `);

  // Backfill history from current table so profile pages can show prior upload snapshots.
  await pool.query(`
    INSERT INTO staff_upload_history (
      email_school, code, first_name, last_name, title,
      status_snapshot, upload_year, upload_term, upload_date, source
    )
    SELECT
      email_school, code, first_name, last_name, title,
      COALESCE(status, 'Current'), upload_year, upload_term, upload_date, 'backfill'
    FROM staff_upload s
    WHERE trim(COALESCE(email_school, '')) <> ''
      AND upload_year IS NOT NULL
      AND trim(COALESCE(upload_term, '')) <> ''
      AND upload_date IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM staff_upload_history h
        WHERE lower(trim(h.email_school)) = lower(trim(s.email_school))
          AND h.upload_year = s.upload_year
          AND lower(trim(COALESCE(h.upload_term, ''))) = lower(trim(COALESCE(s.upload_term, '')))
          AND h.upload_date = s.upload_date
          AND COALESCE(h.status_snapshot, 'Current') = COALESCE(s.status, 'Current')
      )
        ON CONFLICT DO NOTHING
  `);

  // If current records were already moved to Term 2 before history existed,
  // infer a Term 1 baseline so profile pages can show Term 1 + Term 2 continuity for 2026.
  await pool.query(`
    INSERT INTO staff_upload_history (
      email_school, code, first_name, last_name, title,
      status_snapshot, upload_year, upload_term, upload_date, source
    )
    SELECT
      email_school, code, first_name, last_name, title,
      'Current', 2026, 'Term 1', DATE '2026-04-01', 'inferred_baseline'
    FROM staff_upload s
    WHERE COALESCE(status, 'Current') = 'Current'
      AND upload_year = 2026
      AND lower(trim(COALESCE(upload_term, ''))) = 'term 2'
      AND trim(COALESCE(email_school, '')) <> ''
      AND NOT EXISTS (
        SELECT 1
        FROM staff_upload_history h
        WHERE lower(trim(h.email_school)) = lower(trim(s.email_school))
          AND h.upload_year = 2026
          AND lower(trim(COALESCE(h.upload_term, ''))) = 'term 1'
      )
      ON CONFLICT DO NOTHING
  `);
  staffSchemaEnsured = true;
}
// Run once at startup (best-effort, non-blocking)
ensureStaffSchema().catch(err => console.error('[staff_upload] ensureStaffSchema failed on startup:', err.message));

function normalizeHeader(value) {
  return (value || '').toString().trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function getIndexByAliases(headers, aliases) {
  const normalizedHeaders = (headers || []).map(normalizeHeader);
  for (const alias of aliases) {
    const idx = normalizedHeaders.indexOf(normalizeHeader(alias));
    if (idx >= 0) return idx;
  }
  return -1;
}

function parseUploadDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const dmy = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  return null;
}

// Dropdown: Get all staff for dropdown
router.get('/dropdown', async (req, res) => {
  console.log('[DEBUG] /api/staff_upload/dropdown called');
  try {
    const result = await pool.query("SELECT id, code, last_name, first_name, email_school FROM staff_upload WHERE COALESCE(status, 'Current') = 'Current' ORDER BY last_name, first_name");
    console.log('[DEBUG] Staff rows:', result.rows);
    res.json({ staff: result.rows });
  } catch (err) {
    console.error('[DEBUG] Error fetching staff:', err);
    res.status(500).json({ error: 'Failed to fetch staff list.' });
  }
});

// Get all staff_upload rows (admin only)
router.get('/all', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM staff_upload ORDER BY last_name, first_name');
    res.json({ staff: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch staff_upload data.' });
  }
});

// Handle staff CSV upload (admin only)
router.post('/', requireAdmin, async (req, res) => {
  await ensureStaffSchema();
  const staff = req.body.staff;
  const headers = Array.isArray(req.body.headers) ? req.body.headers : [];
  const uploadYearRaw = Number(req.body.uploadYear);
  const uploadYear = Number.isInteger(uploadYearRaw) ? uploadYearRaw : new Date().getFullYear();
  const uploadTerm = String(req.body.uploadTerm || '').trim() || 'Term 1';
  const uploadDate = parseUploadDate(req.body.uploadDate) || new Date().toISOString().slice(0, 10);
  if (!Array.isArray(staff) || staff.length === 0) {
    return res.json({ success: false, error: 'No staff data provided.' });
  }

  const codeIdx = getIndexByAliases(headers, ['code', 'staff_code', 'staff code']);
  const lastNameIdx = getIndexByAliases(headers, ['last_name', 'last name', 'surname', 'family_name']);
  const firstNameIdx = getIndexByAliases(headers, ['first_name', 'first name', 'given_name', 'forename']);
  const titleIdx = getIndexByAliases(headers, ['title']);
  const emailIdx = getIndexByAliases(headers, ['email_school', 'email school', 'email', 'school_email', 'email_address', 'email address']);

  const missingHeaders = [];
  if (codeIdx < 0) missingHeaders.push('Code');
  if (lastNameIdx < 0) missingHeaders.push('Last Name');
  if (firstNameIdx < 0) missingHeaders.push('First Name');
  if (titleIdx < 0) missingHeaders.push('Title');
  if (emailIdx < 0) missingHeaders.push('Email (School)');
  if (missingHeaders.length > 0) {
    return res.json({
      success: false,
      error: `CSV is missing required headers: ${missingHeaders.join(', ')}`
    });
  }

  // If headers are missing or unrecognized, keep legacy positional mapping.
  const useHeaderMapping = headers.length > 0;

  // Keep only rows with email_school and deduplicate by normalized email.
  const byEmail = new Map();
  let skippedNoEmail = 0;
  for (const row of staff) {
    if (!Array.isArray(row)) continue;
    const code = (useHeaderMapping && codeIdx >= 0 ? row[codeIdx] : row[0] || '').toString().trim();
    const lastName = (useHeaderMapping && lastNameIdx >= 0 ? row[lastNameIdx] : row[1] || '').toString().trim();
    const firstName = (useHeaderMapping && firstNameIdx >= 0 ? row[firstNameIdx] : row[2] || '').toString().trim();
    const title = (useHeaderMapping && titleIdx >= 0 ? row[titleIdx] : row[3] || '').toString().trim();
    const email = (useHeaderMapping && emailIdx >= 0 ? row[emailIdx] : row[4] || '').toString().trim();
    if (!email) {
      skippedNoEmail++;
      continue;
    }
    byEmail.set(email.toLowerCase(), {
      code,
      lastName,
      firstName,
      title,
      email
    });
  }

  const dedupedRows = Array.from(byEmail.values());
  const duplicateEmailsInUpload = Math.max(0, staff.length - skippedNoEmail - dedupedRows.length);

  if (dedupedRows.length === 0) {
    return res.json({ success: false, error: 'No valid staff rows with email_school were found.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Reset all to Not Current first; listed rows below are set back to Current.
    await client.query("UPDATE staff_upload SET status = 'Not Current'");

    let inserted = 0;
    let updated = 0;

    for (const row of dedupedRows) {
      const updateResult = await client.query(
        `UPDATE staff_upload
         SET code = $1, last_name = $2, first_name = $3, title = $4, email_school = $5, status = 'Current', primary_role = 'staff',
             upload_year = $6, upload_term = $7, upload_date = $8
         WHERE lower(trim(email_school)) = lower(trim($5))`,
        [row.code, row.lastName, row.firstName, row.title, row.email, uploadYear, uploadTerm, uploadDate]
      );

      if (updateResult.rowCount > 0) {
        updated += updateResult.rowCount;
      } else {
        await client.query(
          'INSERT INTO staff_upload (code, last_name, first_name, title, email_school, status, primary_role, upload_year, upload_term, upload_date) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
          [row.code, row.lastName, row.firstName, row.title, row.email, 'Current', 'staff', uploadYear, uploadTerm, uploadDate]
        );
        inserted++;
      }

      await client.query(
        `INSERT INTO staff_upload_history (
           email_school, code, first_name, last_name, title,
           status_snapshot, upload_year, upload_term, upload_date, source
         )
         SELECT $1, $2, $3, $4, $5, 'Current', $6, $7, $8::date, 'upload'
         WHERE NOT EXISTS (
           SELECT 1
           FROM staff_upload_history h
           WHERE lower(trim(h.email_school)) = lower(trim($1))
             AND h.upload_year = $6
             AND lower(trim(COALESCE(h.upload_term, ''))) = lower(trim($7))
             AND h.upload_date = $8::date
             AND COALESCE(h.status_snapshot, 'Current') = 'Current'
         )
         ON CONFLICT DO NOTHING`,
        [row.email, row.code, row.firstName, row.lastName, row.title, uploadYear, uploadTerm, uploadDate]
      );
    }

    const inactiveResult = await client.query("SELECT COUNT(*)::int AS count FROM staff_upload WHERE status = 'Not Current'");
    const markedNotCurrent = inactiveResult.rows[0]?.count || 0;

    await client.query('COMMIT');
    res.json({
      success: true,
      inserted,
      updated,
      marked_not_current: markedNotCurrent,
      skipped_no_email: skippedNoEmail,
      duplicate_emails_in_upload: duplicateEmailsInUpload,
      processed: dedupedRows.length,
      upload_year: uploadYear,
      upload_term: uploadTerm,
      upload_date: uploadDate
    });
  } catch (err) {
    await client.query('ROLLBACK');
    // Auto-recover from PK sequence mismatch and retry once.
    if (err.code === '23505' && err.constraint === 'staff_upload_pkey') {
      try {
        await pool.query(`SELECT setval(pg_get_serial_sequence('staff_upload','id'), COALESCE((SELECT MAX(id) FROM staff_upload), 0))`);
        return res.json({ success: false, error: 'Sequence was out of sync and has been reset. Please upload again.' });
      } catch (_) {}
    }
    res.json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
