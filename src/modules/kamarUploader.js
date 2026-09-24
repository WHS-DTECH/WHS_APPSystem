const express = require('express');
const { pool, query } = require('../db');
const { ensureAuthenticated, ensureRole } = require('../middleware');
const { syncKamarRoles } = require('../roleSync');

const router = express.Router();
const MAX_ROWS = 1000;

const STAFF_ALIASES = {
  kamar_code: ['code', 'staffcode'],
  last_name: ['lastname', 'surname', 'familyname'],
  first_name: ['firstname', 'givenname', 'forename'],
  title: ['title'],
  email_school: ['emailschool', 'email', 'schoolemail', 'emailaddress']
};

const STUDENT_ALIASES = {
  kamar_id: ['studentid', 'student_id', 'idnumber', 'id_number', 'student id', 'id number'],
  last_name: ['lastname', 'last_name', 'last name', 'surname', 'familyname'],
  first_name: ['firstname', 'first_name', 'first name', 'givenname', 'forename'],
  gender: ['gender', 'sex'],
  year_level: ['level', 'yearlevel', 'year_level', 'year'],
  tutor: ['tutor', 'formclass', 'form_class', 'form class'],
  timetable_class: ['timetableclass', 'timetable_class', 'timetable class', 'ttclass'],
  email_school: ['studentemailschool', 'student_email_school', 'studentemail', 'emailschool', 'email_school', 'email']
};

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function rowLookup(headers) {
  return new Map(headers.map((header, index) => [normalizeKey(header), index]));
}

function valueByAliases(row, lookup, aliases) {
  for (const alias of aliases) {
    const index = lookup.get(normalizeKey(alias));
    if (index !== undefined) return String(row[index] || '').trim();
  }
  return '';
}

function mapRow(row, lookup, aliases) {
  return Object.fromEntries(Object.entries(aliases).map(([key, names]) => [key, valueByAliases(row, lookup, names)]));
}

function mapTimetableRow(row, headers) {
  return Object.fromEntries(headers.map((header, index) => [String(header || '').trim(), String(row[index] || '').trim()]));
}

function metadata(body) {
  const academicYear = Number(body.academicYear);
  const term = String(body.term || '').trim();

  if (!Number.isInteger(academicYear) || academicYear < 2000 || academicYear > 2100) {
    throw new Error('A valid academic year is required.');
  }
  if (!/^Term [1-4]$/.test(term)) {
    throw new Error('Term must be Term 1, Term 2, Term 3, or Term 4.');
  }

  return { academicYear, term };
}

async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function startRun(client, type, meta, userId, rowCount) {
  const result = await client.query(
    `INSERT INTO kamar.upload_runs (upload_type, academic_year, term, uploaded_by, row_count, status)
     VALUES ($1, $2, $3, $4, $5, 'processing')
     RETURNING id`,
    [type, meta.academicYear, meta.term, userId, rowCount]
  );
  return result.rows[0].id;
}

async function completeRun(client, runId) {
  await client.query(
    `UPDATE kamar.upload_runs SET status = 'completed', completed_at = NOW() WHERE id = $1`,
    [runId]
  );
}

router.use(ensureAuthenticated, ensureRole('ADMIN'));

router.get('/', async (req, res, next) => {
  try {
    const [counts, runs] = await Promise.all([
      query(`
        SELECT
          (SELECT COUNT(*)::int FROM kamar.staff WHERE status = 'Current') AS staff,
          (SELECT COUNT(*)::int FROM kamar.students WHERE status = 'Current') AS students,
          (SELECT COUNT(*)::int FROM kamar.student_timetables WHERE status = 'Current') AS student_timetables,
          (SELECT COUNT(*)::int FROM kamar.staff_timetables WHERE status = 'Current') AS staff_timetables`),
      query(`
        SELECT upload_type, academic_year, term, row_count, status, started_at, completed_at
        FROM kamar.upload_runs
        ORDER BY started_at DESC
        LIMIT 12`)
    ]);

    res.render('modules/kamar-uploader/dashboard', {
      counts: counts.rows[0],
      runs: runs.rows,
      title: 'Kamar Uploader'
    });
  } catch (error) {
    next(error);
  }
});

router.get('/staff', async (req, res, next) => {
  try {
    const requestedStatus = String(req.query.status || 'all');
    const status = ['Current', 'Not Current'].includes(requestedStatus) ? requestedStatus : 'all';
    const search = String(req.query.q || '').trim();
    const staff = (await query(
      `SELECT staff.id, staff.kamar_code, staff.last_name, staff.first_name, staff.title,
              staff.email_school, staff.status, staff.academic_year, staff.term,
              staff.updated_at, runs.started_at AS upload_date
       FROM kamar.staff staff
       INNER JOIN kamar.upload_runs runs ON runs.id = staff.upload_run_id
       WHERE ($1 = 'all' OR staff.status = $1)
         AND ($2 = '' OR CONCAT_WS(' ', staff.first_name, staff.last_name, staff.email_school, staff.kamar_code) ILIKE '%' || $2 || '%')
       ORDER BY CASE WHEN staff.status = 'Current' THEN 0 ELSE 1 END,
                staff.last_name, staff.first_name, staff.email_school`,
      [status, search]
    )).rows;

    res.render('modules/kamar-uploader/staff', {
      search,
      staff,
      status,
      title: 'Kamar Staff Table'
    });
  } catch (error) {
    next(error);
  }
});

router.post('/upload/:type', async (req, res) => {
  const allowedTypes = ['staff', 'students', 'student_timetable', 'staff_timetable'];
  const type = String(req.params.type || '');
  const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
  const headers = Array.isArray(req.body.headers) ? req.body.headers : [];

  if (!allowedTypes.includes(type)) {
    return res.status(400).json({ success: false, error: 'Unsupported Kamar upload type.' });
  }
  if (!headers.length || !rows.length || rows.length > MAX_ROWS) {
    return res.status(400).json({ success: false, error: `Upload must contain between 1 and ${MAX_ROWS} rows.` });
  }

  try {
    const meta = metadata(req.body);
    const lookup = rowLookup(headers);
    const result = await withTransaction(async (client) => {
      const runId = await startRun(client, type, meta, req.user.id, rows.length);

      if (type === 'staff') {
        await client.query("UPDATE kamar.staff SET status = 'Not Current', updated_at = NOW() WHERE status = 'Current'");
        for (const row of rows) {
          const staff = mapRow(row, lookup, STAFF_ALIASES);
          if (!staff.kamar_code) continue;
          await client.query(
            `INSERT INTO kamar.staff (kamar_code, last_name, first_name, title, email_school, status, academic_year, term, upload_run_id)
             VALUES ($1, $2, $3, $4, $5, 'Current', $6, $7, $8)
             ON CONFLICT (kamar_code) DO UPDATE SET last_name = EXCLUDED.last_name, first_name = EXCLUDED.first_name,
               title = EXCLUDED.title, email_school = EXCLUDED.email_school, status = 'Current',
               academic_year = EXCLUDED.academic_year, term = EXCLUDED.term, upload_run_id = EXCLUDED.upload_run_id, updated_at = NOW()`,
            [staff.kamar_code, staff.last_name, staff.first_name, staff.title, staff.email_school.toLowerCase(), meta.academicYear, meta.term, runId]
          );
        }
      } else if (type === 'students') {
        await client.query("UPDATE kamar.students SET status = 'Not Current', updated_at = NOW() WHERE status = 'Current'");
        for (const row of rows) {
          const student = mapRow(row, lookup, STUDENT_ALIASES);
          if (!student.kamar_id) continue;
          await client.query(
            `INSERT INTO kamar.students (kamar_id, last_name, first_name, gender, year_level, tutor, timetable_class, email_school, status, academic_year, term, upload_run_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Current', $9, $10, $11)
             ON CONFLICT (kamar_id) DO UPDATE SET last_name = EXCLUDED.last_name, first_name = EXCLUDED.first_name,
               gender = EXCLUDED.gender, year_level = EXCLUDED.year_level, tutor = EXCLUDED.tutor,
               timetable_class = EXCLUDED.timetable_class, email_school = EXCLUDED.email_school, status = 'Current',
               academic_year = EXCLUDED.academic_year, term = EXCLUDED.term, upload_run_id = EXCLUDED.upload_run_id, updated_at = NOW()`,
            [student.kamar_id, student.last_name, student.first_name, student.gender, student.year_level, student.tutor, student.timetable_class, student.email_school.toLowerCase(), meta.academicYear, meta.term, runId]
          );
        }
      } else if (type === 'student_timetable') {
        for (const row of rows) {
          const timetable = mapTimetableRow(row, headers);
          const studentId = valueByAliases(row, lookup, ['studentid', 'student_id', 'idnumber', 'id_number', 'student id', 'id']);
          if (!studentId) continue;
          await client.query(
            `INSERT INTO kamar.student_timetables (kamar_student_id, student_name, form_class, year_level, timetable, status, academic_year, term, upload_run_id)
             VALUES ($1, $2, $3, $4, $5, 'Current', $6, $7, $8)
             ON CONFLICT (kamar_student_id, academic_year, term) DO UPDATE SET student_name = EXCLUDED.student_name, form_class = EXCLUDED.form_class,
               year_level = EXCLUDED.year_level, timetable = EXCLUDED.timetable, status = 'Current',
               academic_year = EXCLUDED.academic_year, term = EXCLUDED.term, upload_run_id = EXCLUDED.upload_run_id, updated_at = NOW()`,
            [studentId, valueByAliases(row, lookup, ['studentname', 'name']), valueByAliases(row, lookup, ['formclass', 'form']), valueByAliases(row, lookup, ['yearlevel', 'year']), JSON.stringify(timetable), meta.academicYear, meta.term, runId]
          );
        }
      } else {
        for (const row of rows) {
          const timetable = mapTimetableRow(row, headers);
          const staffCode = valueByAliases(row, lookup, ['teacher', 'teachercode', 'code', 'staffcode']);
          if (!staffCode) continue;
          await client.query(
            `INSERT INTO kamar.staff_timetables (kamar_staff_code, staff_name, timetable, status, academic_year, term, upload_run_id)
             VALUES ($1, $2, $3, 'Current', $4, $5, $6)
             ON CONFLICT (kamar_staff_code, academic_year, term) DO UPDATE SET staff_name = EXCLUDED.staff_name, timetable = EXCLUDED.timetable,
               status = 'Current', academic_year = EXCLUDED.academic_year, term = EXCLUDED.term,
               upload_run_id = EXCLUDED.upload_run_id, updated_at = NOW()`,
            [staffCode, valueByAliases(row, lookup, ['teachername', 'teacher_name', 'staffname', 'name']), JSON.stringify(timetable), meta.academicYear, meta.term, runId]
          );
        }
      }

      if (type === 'staff' || type === 'students') {
        const users = await client.query('SELECT id, email FROM users WHERE is_active = true');
        for (const user of users.rows) {
          await syncKamarRoles(client, user.id, user.email);
        }
      }

      await completeRun(client, runId);
      return { runId };
    });

    return res.json({ success: true, ...result, processed: rows.length });
  } catch (error) {
    console.error(error);
    return res.status(400).json({ success: false, error: error.message || 'Kamar upload failed.' });
  }
});

module.exports = router;
