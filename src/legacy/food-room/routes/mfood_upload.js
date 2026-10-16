const express = require('express');
const router = express.Router();
const pool = require('../db');

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS mfood_class_students (
      id SERIAL PRIMARY KEY,
      class_code TEXT NOT NULL,
      student_id TEXT NOT NULL,
      last_name TEXT,
      first_name TEXT,
      gender TEXT,
      level TEXT,
      tutor TEXT,
      timetable_class TEXT,
      upload_year INTEGER,
      upload_term TEXT,
      upload_date DATE,
      status TEXT DEFAULT 'Current',
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      CONSTRAINT mfood_class_students_unique UNIQUE (class_code, student_id)
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS mfood_class_students_code_status_idx
    ON mfood_class_students (upper(trim(class_code)), status)
  `);
}

function normalizeClassCode(value) {
  return String(value || '').trim().toUpperCase();
}

router.get('/all', async (req, res) => {
  try {
    await ensureSchema();
    const result = await pool.query(
      `SELECT class_code, COUNT(*)::int AS student_count,
              MAX(upload_date) AS upload_date,
              MAX(updated_at) AS updated_at
       FROM mfood_class_students
       WHERE COALESCE(status, 'Current') = 'Current'
       GROUP BY class_code
       ORDER BY class_code`
    );
    res.json({ classes: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch MFOOD class uploads.' });
  }
});

router.post('/', async (req, res) => {
  const { rows, classCode, uploadYear, uploadTerm, uploadDate } = req.body || {};
  const normalizedClassCode = normalizeClassCode(classCode);

  if (!normalizedClassCode) {
    return res.status(400).json({ success: false, error: 'Class code is required.' });
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ success: false, error: 'No CSV rows were provided.' });
  }

  const year = Number(uploadYear);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return res.status(400).json({ success: false, error: 'Upload Year must be a valid year.' });
  }

  const term = String(uploadTerm || '').trim();
  const date = String(uploadDate || '').trim();
  if (!term || !date) {
    return res.status(400).json({ success: false, error: 'Upload Term and Upload Date are required.' });
  }

  try {
    await ensureSchema();

    const cleaned = rows
      .map((r) => ({
        student_id: String(r.student_id || '').trim(),
        last_name: String(r.last_name || '').trim(),
        first_name: String(r.first_name || '').trim(),
        gender: String(r.gender || '').trim(),
        level: String(r.level || '').trim(),
        tutor: String(r.tutor || '').trim(),
        timetable_class: String(r.timetable_class || '').trim()
      }))
      .filter((r) => r.student_id);

    if (!cleaned.length) {
      return res.status(400).json({ success: false, error: 'No valid rows found. Student ID is required.' });
    }

    const uniqueById = new Map();
    cleaned.forEach((row) => {
      uniqueById.set(row.student_id.toUpperCase(), row);
    });
    const deduped = Array.from(uniqueById.values());

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `UPDATE mfood_class_students
         SET status = 'Not Current', updated_at = NOW()
         WHERE upper(trim(class_code)) = upper(trim($1))`,
        [normalizedClassCode]
      );

      let upserted = 0;
      for (const row of deduped) {
        await client.query(
          `INSERT INTO mfood_class_students
             (class_code, student_id, last_name, first_name, gender, level, tutor, timetable_class,
              upload_year, upload_term, upload_date, status, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'Current',NOW())
           ON CONFLICT (class_code, student_id)
           DO UPDATE SET
             last_name = EXCLUDED.last_name,
             first_name = EXCLUDED.first_name,
             gender = EXCLUDED.gender,
             level = EXCLUDED.level,
             tutor = EXCLUDED.tutor,
             timetable_class = EXCLUDED.timetable_class,
             upload_year = EXCLUDED.upload_year,
             upload_term = EXCLUDED.upload_term,
             upload_date = EXCLUDED.upload_date,
             status = 'Current',
             updated_at = NOW()`,
          [
            normalizedClassCode,
            row.student_id,
            row.last_name,
            row.first_name,
            row.gender,
            row.level,
            row.tutor,
            row.timetable_class,
            year,
            term,
            date
          ]
        );
        upserted += 1;
      }

      const classSize = deduped.length;
      const bookingUpdate = await client.query(
        `UPDATE bookings
         SET class_size = $2
         WHERE period IN ('1','2','3','4','5')
           AND (
             CASE
               WHEN (length(upper(trim(class_name))) - length(replace(upper(trim(class_name)), '-', ''))) >= 2
                 THEN regexp_replace(regexp_replace(upper(trim(class_name)), '^[^-]+-', ''), '-[^-]+$', '')
               ELSE upper(trim(class_name))
             END
           ) = upper(trim($1))`,
        [normalizedClassCode, classSize]
      );

      await client.query('COMMIT');

      return res.json({
        success: true,
        class_code: normalizedClassCode,
        class_size: classSize,
        processed: cleaned.length,
        deduped: deduped.length,
        upserted,
        bookings_updated: bookingUpdate.rowCount || 0,
        upload_year: year,
        upload_term: term,
        upload_date: date
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || 'Failed to import MFOOD class CSV.' });
  }
});

module.exports = router;
