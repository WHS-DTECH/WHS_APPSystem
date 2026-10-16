const express = require('express');
const router = express.Router();
const pool = require('../db');

const STUDENT_COLUMNS = [
  'student_name', 'id_number', 'form_class', 'year_level',
  'mon_p1_1', 'mon_p1_2', 'mon_p2', 'mon_i', 'mon_p3', 'mon_p4', 'mon_l', 'mon_p5',
  'tue_p1_1', 'tue_p1_2', 'tue_p2', 'tue_i', 'tue_p3', 'tue_p4', 'tue_l', 'tue_p5',
  'wed_p1_1', 'wed_p1_2', 'wed_p2', 'wed_i', 'wed_p3', 'wed_p4', 'wed_l', 'wed_p5',
  'thu_p1_1', 'thu_p1_2', 'thu_p2', 'thu_i', 'thu_p3', 'thu_p4', 'thu_l', 'thu_p5',
  'fri_p1_1', 'fri_p1_2', 'fri_p2', 'fri_i', 'fri_p3', 'fri_p4', 'fri_l', 'fri_p5'
];

const PERIOD_COLUMNS = STUDENT_COLUMNS.slice(4);

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_timetable (
      id SERIAL PRIMARY KEY,
      student_name TEXT,
      id_number TEXT,
      form_class TEXT,
      year_level TEXT,
      upload_year INTEGER,
      upload_term TEXT,
      upload_date DATE,
      mon_p1_1 TEXT,
      mon_p1_2 TEXT,
      mon_p2 TEXT,
      mon_i TEXT,
      mon_p3 TEXT,
      mon_p4 TEXT,
      mon_l TEXT,
      mon_p5 TEXT,
      tue_p1_1 TEXT,
      tue_p1_2 TEXT,
      tue_p2 TEXT,
      tue_i TEXT,
      tue_p3 TEXT,
      tue_p4 TEXT,
      tue_l TEXT,
      tue_p5 TEXT,
      wed_p1_1 TEXT,
      wed_p1_2 TEXT,
      wed_p2 TEXT,
      wed_i TEXT,
      wed_p3 TEXT,
      wed_p4 TEXT,
      wed_l TEXT,
      wed_p5 TEXT,
      thu_p1_1 TEXT,
      thu_p1_2 TEXT,
      thu_p2 TEXT,
      thu_i TEXT,
      thu_p3 TEXT,
      thu_p4 TEXT,
      thu_l TEXT,
      thu_p5 TEXT,
      fri_p1_1 TEXT,
      fri_p1_2 TEXT,
      fri_p2 TEXT,
      fri_i TEXT,
      fri_p3 TEXT,
      fri_p4 TEXT,
      fri_l TEXT,
      fri_p5 TEXT,
      status TEXT DEFAULT 'Current'
    )
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS student_timetable_id_number_unique_idx
    ON student_timetable (lower(trim(id_number)))
    WHERE id_number IS NOT NULL AND trim(id_number) <> ''
  `);

  await pool.query("ALTER TABLE student_timetable ADD COLUMN IF NOT EXISTS primary_role TEXT DEFAULT 'student'");
  await pool.query('ALTER TABLE student_timetable ADD COLUMN IF NOT EXISTS upload_year INTEGER');
  await pool.query('ALTER TABLE student_timetable ADD COLUMN IF NOT EXISTS upload_term TEXT');
  await pool.query('ALTER TABLE student_timetable ADD COLUMN IF NOT EXISTS upload_date DATE');
  await pool.query("UPDATE student_timetable SET primary_role = 'student' WHERE primary_role IS NULL OR trim(primary_role) = ''");
  await pool.query(`
    UPDATE student_timetable
    SET upload_year = 2026,
        upload_term = 'Term 1',
        upload_date = DATE '2026-01-01'
    WHERE COALESCE(status, 'Current') = 'Current'
      AND upload_year IS NULL
      AND COALESCE(trim(upload_term), '') = ''
      AND upload_date IS NULL
  `);
}

function parseUploadDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const dmy = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  return null;
}

function normalizeCsvHeader(value) {
  return (value || '').toString().trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function getIndexByAliases(headers, aliases) {
  const normalizedHeaders = (headers || []).map(normalizeCsvHeader);
  for (const alias of aliases) {
    const idx = normalizedHeaders.indexOf(normalizeCsvHeader(alias));
    if (idx >= 0) return idx;
  }
  return -1;
}

function mapRowToRecord(row, headers) {
  const hasHeaders = Array.isArray(headers) && headers.length > 0;

  // Prefer header mapping for core fields, fallback to positional for Kamar exports.
  const idxStudentName = hasHeaders ? getIndexByAliases(headers, ['Student Name', 'student_name']) : 0;
  const idxIdNumber = hasHeaders ? getIndexByAliases(headers, ['ID Number', 'id_number']) : 1;
  const idxFormClass = hasHeaders ? getIndexByAliases(headers, ['Form Class', 'form_class']) : 2;
  const idxYearLevel = hasHeaders ? getIndexByAliases(headers, ['Year Level', 'year_level']) : 3;

  const record = {
    student_name: (row[idxStudentName >= 0 ? idxStudentName : 0] || '').toString().trim(),
    id_number: (row[idxIdNumber >= 0 ? idxIdNumber : 1] || '').toString().trim(),
    form_class: (row[idxFormClass >= 0 ? idxFormClass : 2] || '').toString().trim(),
    year_level: (row[idxYearLevel >= 0 ? idxYearLevel : 3] || '').toString().trim()
  };

  // Timetable periods are positionally stable in Kamar export.
  const start = 4;
  for (let i = 0; i < 40; i++) {
    record[STUDENT_COLUMNS[start + i]] = (row[start + i] || '').toString().trim();
  }

  return record;
}

router.get('/all', async (req, res) => {
  try {
    await ensureSchema();
    const result = await pool.query('SELECT * FROM student_timetable ORDER BY student_name, id_number');
    res.json({ students: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch student timetable data.' });
  }
});

router.get('/by-class/:ttcode', async (req, res) => {
  const ttcode = (req.params.ttcode || '').trim();
  if (!ttcode) return res.json({ students: [] });

  // Triangulate between teacher and student timetable token formats.
  // Teacher tokens use a line-number prefix: 82B-MFOOD-F
  // Student tokens use a teacher-code prefix:  RR-MFOOD-F
  // If staffCode is provided, construct the precise student token: {staffCode}-{subjectRoom}
  // e.g. staffCode=RR + 82B-MFOOD-F => search for RR-MFOOD-F exactly.
  const staffCode = (req.query.staffCode || '').trim().toUpperCase();
  const firstDash = ttcode.indexOf('-');
  const coreSuffix = (firstDash > 0 && firstDash < ttcode.length - 1)
    ? ttcode.slice(firstDash + 1)
    : null;
  const useCore = coreSuffix && coreSuffix.includes('-') && coreSuffix.length >= 4;

  // Precise 3-way token: staffCode + subject + room, e.g. RR-MFOOD-F
  const exactStudentToken = (staffCode && useCore) ? `${staffCode}-${coreSuffix}` : null;
  const compactToken = String(ttcode || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const compactCore = String(coreSuffix || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const compactExactStudent = String(exactStudentToken || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();

  function buildExactConditions(token) {
    const params = [];
    const colConditions = PERIOD_COLUMNS.map(col => {
      params.push(token);
      return `upper(COALESCE(${col}, '')) LIKE '%' || upper($${params.length}) || '%'`;
    });
    return { params, colConditions };
  }

  try {
    await ensureSchema();

    // Phase 1: if we have an exact student token, try that first.
    if (exactStudentToken) {
      const { params, colConditions } = buildExactConditions(exactStudentToken);
      const exact = await pool.query(
        `SELECT id, student_name, id_number, form_class, year_level
         FROM student_timetable
         WHERE COALESCE(status, 'Current') = 'Current'
           AND (${colConditions.join(' OR ')})
         ORDER BY student_name, id_number`,
        params
      );
      if (exact.rows.length > 0) {
        return res.json({ students: exact.rows });
      }
      // Exact token matched nothing — fall through to suffix/full-token search.
    }

    // Phase 2 (fallback): search by full ttcode OR coreSuffix.
    const params2 = [];
    const colConditions2 = PERIOD_COLUMNS.map(col => {
      params2.push(ttcode);
      const idx = params2.length;
      if (useCore) {
        params2.push(coreSuffix);
        const idx2 = params2.length;
        return `(upper(COALESCE(${col}, '')) LIKE '%' || upper($${idx}) || '%' OR upper(COALESCE(${col}, '')) LIKE '%' || upper($${idx2}) || '%')`;
      }
      return `upper(COALESCE(${col}, '')) LIKE '%' || upper($${idx}) || '%'`;
    });

    const result = await pool.query(
      `SELECT id, student_name, id_number, form_class, year_level
       FROM student_timetable
       WHERE COALESCE(status, 'Current') = 'Current'
         AND (${colConditions2.join(' OR ')})
       ORDER BY student_name, id_number`,
      params2
    );
    if (result.rows.length > 0) {
      return res.json({ students: result.rows });
    }

    // Phase 3: normalized compact fallback for token format variations
    // (e.g. RR-HOSP-COOK-F vs RR-HOSPCOOK-F, punctuation differences).
    const compactCandidates = [compactExactStudent, compactCore, compactToken].filter(Boolean);
    if (!compactCandidates.length) {
      return res.json({ students: [] });
    }

    const compactParams = [];
    const compactConditions = PERIOD_COLUMNS.map((col) => {
      const normalizedCol = `upper(regexp_replace(coalesce(${col}, ''), '[^A-Za-z0-9]', '', 'g'))`;
      const perCol = compactCandidates.map((candidate) => {
        compactParams.push(candidate);
        return `${normalizedCol} LIKE '%' || $${compactParams.length} || '%'`;
      });
      return `(${perCol.join(' OR ')})`;
    });

    const compactResult = await pool.query(
      `SELECT id, student_name, id_number, form_class, year_level
       FROM student_timetable
       WHERE COALESCE(status, 'Current') = 'Current'
         AND (${compactConditions.join(' OR ')})
       ORDER BY student_name, id_number`,
      compactParams
    );
    return res.json({ students: compactResult.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch students for class.' });
  }
});

router.get('/student-day', async (req, res) => {
  const idNumber = String(req.query.idNumber || '').trim();
  const date = String(req.query.date || '').trim();

  if (!idNumber || !date) {
    return res.status(400).json({ success: false, error: 'idNumber and date are required.' });
  }

  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) {
    return res.status(400).json({ success: false, error: 'Invalid date format.' });
  }

  const day = parsed.getDay();
  const dayMap = {
    1: 'mon',
    2: 'tue',
    3: 'wed',
    4: 'thu',
    5: 'fri'
  };
  const dayPrefix = dayMap[day];

  if (!dayPrefix) {
    return res.json({ success: true, periods: [] });
  }

  try {
    await ensureSchema();
    const result = await pool.query(
      `SELECT student_name, id_number,
              ${dayPrefix}_p1_1, ${dayPrefix}_p1_2,
              ${dayPrefix}_p2, ${dayPrefix}_p3, ${dayPrefix}_p4, ${dayPrefix}_p5
       FROM student_timetable
       WHERE COALESCE(status, 'Current') = 'Current'
         AND lower(trim(id_number)) = lower(trim($1))
       LIMIT 1`,
      [idNumber]
    );

    if (!result.rowCount) {
      return res.status(404).json({ success: false, error: 'Student not found.' });
    }

    const row = result.rows[0];
    const splitVals = (values) => {
      const seen = new Set();
      const out = [];
      for (const raw of values) {
        const parts = String(raw || '').split(/[;|]/g).map(v => v.trim()).filter(Boolean);
        for (const p of parts) {
          const key = p.toUpperCase();
          if (seen.has(key)) continue;
          seen.add(key);
          out.push(p);
        }
      }
      return out;
    };

    const periods = [
      { period: 'P1', classes: splitVals([row[`${dayPrefix}_p1_1`], row[`${dayPrefix}_p1_2`]]) },
      { period: 'P2', classes: splitVals([row[`${dayPrefix}_p2`]]) },
      { period: 'P3', classes: splitVals([row[`${dayPrefix}_p3`]]) },
      { period: 'P4', classes: splitVals([row[`${dayPrefix}_p4`]]) },
      { period: 'P5', classes: splitVals([row[`${dayPrefix}_p5`]]) }
    ];

    return res.json({
      success: true,
      student: {
        student_name: row.student_name || '',
        id_number: row.id_number || ''
      },
      date,
      periods
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || 'Failed to fetch student day timetable.' });
  }
});

router.post('/', async (req, res) => {
  const { students, headers = [] } = req.body;
  const uploadYearRaw = Number(req.body.uploadYear);
  const uploadYear = Number.isInteger(uploadYearRaw) ? uploadYearRaw : 2026;
  const uploadTerm = String(req.body.uploadTerm || '').trim() || 'Term 1';
  const uploadDate = parseUploadDate(req.body.uploadDate) || '2026-01-01';
  if (!Array.isArray(students) || students.length === 0) {
    return res.status(400).json({ success: false, error: 'No student data provided.' });
  }

  try {
    await ensureSchema();
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }

  const byIdNumber = new Map();
  let skippedNoId = 0;
  for (const row of students) {
    if (!Array.isArray(row)) continue;
    const mapped = mapRowToRecord(row, headers);
    if (!mapped.id_number) {
      skippedNoId++;
      continue;
    }
    byIdNumber.set(mapped.id_number.toLowerCase(), mapped);
  }

  const dedupedRows = Array.from(byIdNumber.values());
  const duplicateIdsInUpload = Math.max(0, students.length - skippedNoId - dedupedRows.length);
  if (dedupedRows.length === 0) {
    return res.status(400).json({ success: false, error: 'No valid rows with ID Number were found.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("UPDATE student_timetable SET status = 'Not Current'");

    let inserted = 0;
    let updated = 0;

    const updateSql = `
      UPDATE student_timetable
      SET student_name = $1,
          form_class = $2,
          year_level = $3,
          mon_p1_1 = $4,
          mon_p1_2 = $5,
          mon_p2 = $6,
          mon_i = $7,
          mon_p3 = $8,
          mon_p4 = $9,
          mon_l = $10,
          mon_p5 = $11,
          tue_p1_1 = $12,
          tue_p1_2 = $13,
          tue_p2 = $14,
          tue_i = $15,
          tue_p3 = $16,
          tue_p4 = $17,
          tue_l = $18,
          tue_p5 = $19,
          wed_p1_1 = $20,
          wed_p1_2 = $21,
          wed_p2 = $22,
          wed_i = $23,
          wed_p3 = $24,
          wed_p4 = $25,
          wed_l = $26,
          wed_p5 = $27,
          thu_p1_1 = $28,
          thu_p1_2 = $29,
          thu_p2 = $30,
          thu_i = $31,
          thu_p3 = $32,
          thu_p4 = $33,
          thu_l = $34,
          thu_p5 = $35,
          fri_p1_1 = $36,
          fri_p1_2 = $37,
          fri_p2 = $38,
          fri_i = $39,
          fri_p3 = $40,
          fri_p4 = $41,
          fri_l = $42,
          fri_p5 = $43,
          upload_year = $44,
          upload_term = $45,
          upload_date = $46,
          status = 'Current',
          primary_role = 'student'
      WHERE lower(trim(id_number)) = lower(trim($47))
    `;

    const insertSql = `
      INSERT INTO student_timetable (
        student_name, id_number, form_class, year_level,
        mon_p1_1, mon_p1_2, mon_p2, mon_i, mon_p3, mon_p4, mon_l, mon_p5,
        tue_p1_1, tue_p1_2, tue_p2, tue_i, tue_p3, tue_p4, tue_l, tue_p5,
        wed_p1_1, wed_p1_2, wed_p2, wed_i, wed_p3, wed_p4, wed_l, wed_p5,
        thu_p1_1, thu_p1_2, thu_p2, thu_i, thu_p3, thu_p4, thu_l, thu_p5,
        fri_p1_1, fri_p1_2, fri_p2, fri_i, fri_p3, fri_p4, fri_l, fri_p5,
        upload_year, upload_term, upload_date,
        status, primary_role
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7, $8, $9, $10, $11, $12,
        $13, $14, $15, $16, $17, $18, $19, $20,
        $21, $22, $23, $24, $25, $26, $27, $28,
        $29, $30, $31, $32, $33, $34, $35, $36,
        $37, $38, $39, $40, $41, $42, $43, $44,
        $45, $46, $47,
        'Current', 'student'
      )
    `;

    for (const row of dedupedRows) {
      const values = [
        row.student_name,
        row.form_class,
        row.year_level,
        row.mon_p1_1,
        row.mon_p1_2,
        row.mon_p2,
        row.mon_i,
        row.mon_p3,
        row.mon_p4,
        row.mon_l,
        row.mon_p5,
        row.tue_p1_1,
        row.tue_p1_2,
        row.tue_p2,
        row.tue_i,
        row.tue_p3,
        row.tue_p4,
        row.tue_l,
        row.tue_p5,
        row.wed_p1_1,
        row.wed_p1_2,
        row.wed_p2,
        row.wed_i,
        row.wed_p3,
        row.wed_p4,
        row.wed_l,
        row.wed_p5,
        row.thu_p1_1,
        row.thu_p1_2,
        row.thu_p2,
        row.thu_i,
        row.thu_p3,
        row.thu_p4,
        row.thu_l,
        row.thu_p5,
        row.fri_p1_1,
        row.fri_p1_2,
        row.fri_p2,
        row.fri_i,
        row.fri_p3,
        row.fri_p4,
        row.fri_l,
        row.fri_p5,
        uploadYear,
        uploadTerm,
        uploadDate,
        row.id_number
      ];

      const updateResult = await client.query(updateSql, values);
      if (updateResult.rowCount > 0) {
        updated += updateResult.rowCount;
      } else {
        await client.query(insertSql, [
          row.student_name,
          row.id_number,
          row.form_class,
          row.year_level,
          row.mon_p1_1,
          row.mon_p1_2,
          row.mon_p2,
          row.mon_i,
          row.mon_p3,
          row.mon_p4,
          row.mon_l,
          row.mon_p5,
          row.tue_p1_1,
          row.tue_p1_2,
          row.tue_p2,
          row.tue_i,
          row.tue_p3,
          row.tue_p4,
          row.tue_l,
          row.tue_p5,
          row.wed_p1_1,
          row.wed_p1_2,
          row.wed_p2,
          row.wed_i,
          row.wed_p3,
          row.wed_p4,
          row.wed_l,
          row.wed_p5,
          row.thu_p1_1,
          row.thu_p1_2,
          row.thu_p2,
          row.thu_i,
          row.thu_p3,
          row.thu_p4,
          row.thu_l,
          row.thu_p5,
          row.fri_p1_1,
          row.fri_p1_2,
          row.fri_p2,
          row.fri_i,
          row.fri_p3,
          row.fri_p4,
          row.fri_l,
          row.fri_p5,
          uploadYear,
          uploadTerm,
          uploadDate
        ]);
        inserted++;
      }
    }

    const inactiveResult = await client.query("SELECT COUNT(*)::int AS count FROM student_timetable WHERE status = 'Not Current'");
    const markedNotCurrent = inactiveResult.rows[0]?.count || 0;

    await client.query('COMMIT');
    res.json({
      success: true,
      inserted,
      updated,
      marked_not_current: markedNotCurrent,
      upload_year: uploadYear,
      upload_term: uploadTerm,
      upload_date: uploadDate,
      skipped_no_id_number: skippedNoId,
      duplicate_id_numbers_in_upload: duplicateIdsInUpload,
      processed: dedupedRows.length
    });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
