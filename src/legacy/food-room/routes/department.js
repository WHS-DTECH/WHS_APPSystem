const express = require('express');
const router = express.Router();
const pool = require('../db');

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

function buildStaffName(lastName, firstName) {
  const last = (lastName || '').trim();
  const first = (firstName || '').trim();
  return [last, first].filter(Boolean).join(', ');
}

function firstDepartmentFromList(departmentsComma) {
  const text = String(departmentsComma || '').trim();
  if (!text) return '';
  return (
    text
      .split(',')
      .map(item => item.trim())
      .filter(Boolean)[0] || ''
  );
}

const schemaReady = (async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS department (
        id SERIAL PRIMARY KEY,
        code TEXT,
        last_name TEXT,
        first_name TEXT,
        title TEXT,
        departments_comma TEXT,
        staff_name TEXT,
        staff_email TEXT,
        department TEXT,
        classes TEXT
      )
    `);

    await pool.query("ALTER TABLE department ADD COLUMN IF NOT EXISTS code TEXT");
    await pool.query("ALTER TABLE department ADD COLUMN IF NOT EXISTS last_name TEXT");
    await pool.query("ALTER TABLE department ADD COLUMN IF NOT EXISTS first_name TEXT");
    await pool.query("ALTER TABLE department ADD COLUMN IF NOT EXISTS title TEXT");
    await pool.query("ALTER TABLE department ADD COLUMN IF NOT EXISTS departments_comma TEXT");
    await pool.query("ALTER TABLE department ADD COLUMN IF NOT EXISTS staff_name TEXT");
    await pool.query("ALTER TABLE department ADD COLUMN IF NOT EXISTS staff_email TEXT");
    await pool.query("ALTER TABLE department ADD COLUMN IF NOT EXISTS department TEXT");
    await pool.query("ALTER TABLE department ADD COLUMN IF NOT EXISTS classes TEXT");
    
    // Reset the sequence to the max(id) + 1 to avoid duplicate key errors
    await pool.query(`SELECT setval(pg_get_serial_sequence('department', 'id'), COALESCE((SELECT MAX(id) FROM department), 0) + 1)`);
    console.log('[DEPARTMENT] Schema ready');
    return true;
  } catch (err) {
    console.error('[DEPARTMENT] Schema initialization error:', err);
    return false;
  }
})();

// Upload Kamar Department CSV: Code, Last Name, First Name, Title, Departments (Comma)
router.post('/upload-csv', async (req, res) => {
  try {
    console.log('[DEPARTMENT] POST /upload-csv - Starting upload');
    await schemaReady;
    console.log('[DEPARTMENT] POST /upload-csv - Schema ready');

    const rows = Array.isArray(req.body?.staff) ? req.body.staff : [];
    const headers = Array.isArray(req.body?.headers) ? req.body.headers : [];

    console.log(`[DEPARTMENT] POST /upload-csv - Headers: ${JSON.stringify(headers)}, Rows: ${rows.length}`);

    if (!rows.length) {
      return res.status(400).json({ success: false, error: 'No department CSV data provided.' });
    }

    const codeIdx = getIndexByAliases(headers, ['Code']);
    const lastNameIdx = getIndexByAliases(headers, ['Last Name', 'Last_Name', 'Surname']);
    const firstNameIdx = getIndexByAliases(headers, ['First Name', 'First_Name']);
    const titleIdx = getIndexByAliases(headers, ['Title']);
    const departmentsIdx = getIndexByAliases(headers, ['Departments (Comma)', 'Departments', 'Department']);

    const useHeaderMapping = headers.length > 0 && lastNameIdx >= 0 && firstNameIdx >= 0;

    const byKey = new Map();
    let skipped = 0;

    for (const row of rows) {
      if (!Array.isArray(row)) continue;

      const code = (useHeaderMapping && codeIdx >= 0 ? row[codeIdx] : row[0] || '').toString().trim();
      const lastName = (useHeaderMapping && lastNameIdx >= 0 ? row[lastNameIdx] : row[1] || '').toString().trim();
      const firstName = (useHeaderMapping && firstNameIdx >= 0 ? row[firstNameIdx] : row[2] || '').toString().trim();
      const title = (useHeaderMapping && titleIdx >= 0 ? row[titleIdx] : row[3] || '').toString().trim();
      const departmentsComma = (useHeaderMapping && departmentsIdx >= 0 ? row[departmentsIdx] : row[4] || '').toString().trim();

      if (!lastName && !firstName && !code) {
        skipped++;
        continue;
      }

      const key = code
        ? `code:${code.toLowerCase()}`
        : `name:${lastName.toLowerCase()}|${firstName.toLowerCase()}`;

      byKey.set(key, {
        code,
        lastName,
        firstName,
        title,
        departmentsComma,
        staffName: buildStaffName(lastName, firstName),
        department: firstDepartmentFromList(departmentsComma)
      });
    }

    const dedupedRows = Array.from(byKey.values());
    if (!dedupedRows.length) {
      return res.status(400).json({ success: false, error: 'No valid rows found in CSV.' });
    }

    const client = await pool.connect();
    let inserted = 0;
    let updated = 0;

    try {
      await client.query('BEGIN');

      for (const row of dedupedRows) {
        let updateResult = { rowCount: 0 };

        if (row.code) {
          updateResult = await client.query(
            `UPDATE department
             SET last_name = $1,
                 first_name = $2,
                 title = $3,
                 departments_comma = $4,
                 staff_name = $5,
                 department = $6
             WHERE lower(trim(code)) = lower(trim($7))`,
            [
              row.lastName,
              row.firstName,
              row.title,
              row.departmentsComma,
              row.staffName,
              row.department,
              row.code
            ]
          );
        }

        if (updateResult.rowCount === 0 && (row.lastName || row.firstName)) {
          updateResult = await client.query(
            `UPDATE department
             SET code = COALESCE(NULLIF($1, ''), code),
                 title = $2,
                 departments_comma = $3,
                 staff_name = $4,
                 department = $5
             WHERE lower(trim(last_name)) = lower(trim($6))
               AND lower(trim(first_name)) = lower(trim($7))`,
            [
              row.code,
              row.title,
              row.departmentsComma,
              row.staffName,
              row.department,
              row.lastName,
              row.firstName
            ]
          );
        }

        if (updateResult.rowCount > 0) {
          updated += updateResult.rowCount;
          continue;
        }

        await client.query(
          `INSERT INTO department
            (code, last_name, first_name, title, departments_comma, staff_name, department)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            row.code,
            row.lastName,
            row.firstName,
            row.title,
            row.departmentsComma,
            row.staffName,
            row.department
          ]
        );
        inserted++;
      }

      await client.query('COMMIT');
      return res.json({
        success: true,
        processed: dedupedRows.length,
        inserted,
        updated,
        skipped
      });
    } catch (err) {
      console.error('[DEPARTMENT] Transaction error:', err);
      try {
        await client.query('ROLLBACK');
      } catch (rollbackErr) {
        console.error('[DEPARTMENT] Rollback error:', rollbackErr);
      }
      return res.status(500).json({ success: false, error: `Database error: ${err.message}` });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[DEPARTMENT] Outer error:', err);
    return res.status(500).json({ success: false, error: `Error: ${err.message}` });
  }
});

// Assign a single primary department from dropdown for existing staff record.
router.post('/assign', async (req, res) => {
  const { staffId, department } = req.body;
  if (!staffId || !department) {
    return res.status(400).json({ success: false, error: 'Missing staffId or department.' });
  }

  try {
    await schemaReady;

    const staffResult = await pool.query(
      'SELECT code, last_name, first_name, title, email_school FROM staff_upload WHERE id = $1',
      [staffId]
    );

    if (staffResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Staff not found.' });
    }

    const staffRow = staffResult.rows[0];
    const staffName = buildStaffName(staffRow.last_name, staffRow.first_name);

    let depResult;
    if (staffRow.code) {
      depResult = await pool.query('SELECT id FROM department WHERE lower(trim(code)) = lower(trim($1)) LIMIT 1', [staffRow.code]);
    } else {
      depResult = await pool.query(
        'SELECT id FROM department WHERE lower(trim(last_name)) = lower(trim($1)) AND lower(trim(first_name)) = lower(trim($2)) LIMIT 1',
        [staffRow.last_name, staffRow.first_name]
      );
    }

    if (depResult.rows.length > 0) {
      await pool.query(
        `UPDATE department
         SET department = $1,
             departments_comma = CASE
               WHEN departments_comma IS NULL OR trim(departments_comma) = '' THEN $1
               ELSE departments_comma
             END,
             staff_email = $2,
             staff_name = $3,
             title = COALESCE(NULLIF(title, ''), $4)
         WHERE id = $5`,
        [department, staffRow.email_school || null, staffName, staffRow.title || null, depResult.rows[0].id]
      );
    } else {
      await pool.query(
        `INSERT INTO department
          (code, last_name, first_name, title, departments_comma, staff_name, staff_email, department)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          staffRow.code || null,
          staffRow.last_name || null,
          staffRow.first_name || null,
          staffRow.title || null,
          department,
          staffName,
          staffRow.email_school || null,
          department
        ]
      );
    }

    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to assign/update department.' });
  }
});

router.get('/all', async (req, res) => {
  try {
    await schemaReady;
    const result = await pool.query(`
      SELECT
        d.id,
        d.code,
        d.last_name,
        d.first_name,
        d.title,
        d.departments_comma,
        d.staff_name,
        COALESCE(s.email_school, d.staff_email) as staff_email,
        d.department,
        d.classes
      FROM department d
      LEFT JOIN staff_upload s 
        ON (d.code IS NOT NULL AND LOWER(TRIM(d.code)) = LOWER(TRIM(s.code)))
           OR (d.code IS NULL AND d.last_name IS NOT NULL AND d.first_name IS NOT NULL 
               AND LOWER(TRIM(d.last_name)) = LOWER(TRIM(s.last_name))
               AND LOWER(TRIM(d.first_name)) = LOWER(TRIM(s.first_name)))
      WHERE s.id IS NULL OR COALESCE(s.status, 'Current') = 'Current'
      ORDER BY d.last_name NULLS LAST, d.first_name NULLS LAST, d.id DESC
    `);
    res.json({ department: result.rows });
  } catch (err) {
    console.error('[DEPARTMENT] Error fetching all:', err);
    res.status(500).json({ error: 'Failed to fetch department data.' });
  }
});

router.post('/delete-all', async (req, res) => {
  try {
    await schemaReady;
    await pool.query('TRUNCATE TABLE department RESTART IDENTITY');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/timetable/by-staff/:staffId', async (req, res) => {
  const staffId = Number(req.params.staffId);
  if (!Number.isInteger(staffId) || staffId <= 0) {
    return res.status(400).json({ classes: [], error: 'Invalid staff id.' });
  }

  try {
    const staffResult = await pool.query(
      'SELECT last_name, first_name FROM staff_upload WHERE id = $1 LIMIT 1',
      [staffId]
    );

    if (staffResult.rows.length === 0) {
      return res.json({ classes: [] });
    }

    const { last_name: lastName, first_name: firstName } = staffResult.rows[0];

    const classResult = await pool.query(
      `SELECT DISTINCT "Form_Class", "Teacher_Name"
       FROM kamar_timetable
       WHERE COALESCE(status, 'Current') = 'Current'
         AND (
           "Teacher_Name" ILIKE $1
           OR "Teacher_Name" ILIKE $2
           OR "Teacher_Name" ILIKE $3
         )
       ORDER BY "Form_Class"`,
      [
        `%${lastName || ''}%${firstName || ''}%`,
        `%${firstName || ''}%${lastName || ''}%`,
        `%${lastName || ''}%`
      ]
    );

    return res.json({ classes: classResult.rows });
  } catch (err) {
    return res.status(500).json({ classes: [], error: err.message });
  }
});

module.exports = router;
