const express = require('express');
const { pool } = require('../../db');
const store = require('./store');
const { loadDepartments } = require('./departments');

// Legacy Kamar Uploader API, ported from the original server.js. Data routes are unchanged;
// the old cookie login and role tables are replaced by the app's Google session roles.
const router = express.Router();

function hasRole(req, ...roles) {
  return Boolean(req.user?.roles?.some((role) => role === 'ADMIN' || roles.includes(role)));
}

function requireSignedIn(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'You must be signed in.' });
  }

  return next();
}

function requireAdminApi(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'You must be signed in.' });
  }

  if (!hasRole(req)) {
    return res.status(403).json({ success: false, error: 'Admin access is required.' });
  }

  return next();
}

function requireStaffApi(req, res, next) {
  if (!hasRole(req, 'Teacher', 'Staff')) {
    return res.status(req.user ? 403 : 401).json({ success: false, error: 'Staff access is required.' });
  }

  return next();
}

function legacyUser(req) {
  const isAdmin = hasRole(req);
  const isStaff = hasRole(req, 'Teacher', 'Staff');
  const permissions = {
    homepage: true,
    staff_upload: isAdmin,
    student_upload: isAdmin,
    student_timetable: isAdmin,
    staff_timetable: isAdmin,
    admin_menu: isAdmin
  };

  return {
    email: req.user.email,
    name: req.user.display_name || req.user.email,
    role: isAdmin ? 'admin' : (isStaff ? 'staff' : (hasRole(req, 'Student') ? 'student' : 'guest')),
    in_staff_upload: isStaff,
    in_student_upload: hasRole(req, 'Student'),
    permissions
  };
}

router.get('/api/auth/google/config', (req, res) => {
  res.json({ enabled: false, client_id: null });
});

router.get('/api/auth/session', (req, res) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'You must be signed in.' });
  }

  return res.json({ success: true, user: legacyUser(req) });
});

router.post('/api/auth/logout', (req, res, next) => {
  req.logout((error) => (error ? next(error) : res.json({ success: true })));
});

const DATA_API_PATHS = [
  '/api/staff_upload',
  '/api/student_details_upload',
  '/api/student_upload',
  '/api/timetable',
  '/api/upload_timetable'
];

router.use(DATA_API_PATHS, requireAdminApi);
router.use('/api/feed', requireStaffApi);
router.use('/api/projects', requireSignedIn);

router.use(['/api/feed', '/api/projects', ...DATA_API_PATHS], (req, res, next) => {
  store.init().then(() => next(), (error) => {
    console.error('Kamar Uploader init failed:', error.message);
    res.status(500).json({ success: false, error: 'Kamar Uploader database is unavailable.' });
  });
});

router.get('/api/projects/links', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, site_name, site_url, created_by, created_at, updated_at
       FROM app_project_links
       ORDER BY lower(site_name) ASC, id ASC`
    );
    res.json({ success: true, links: rows });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to load project links.' });
  }
});

router.post('/api/projects/links', requireAdminApi, async (req, res) => {
  try {
    const siteName = String(req.body?.site_name || '').trim();
    const siteUrl = normalizeProjectUrl(req.body?.site_url);

    if (!siteName) {
      res.status(400).json({ success: false, error: 'Site name is required.' });
      return;
    }
    if (!siteUrl) {
      res.status(400).json({ success: false, error: 'Provide a valid URL starting with http:// or https://.' });
      return;
    }

    const { rows } = await pool.query(
      `INSERT INTO app_project_links (site_name, site_url, created_by, updated_at)
       VALUES ($1, $2, $3, NOW())
       RETURNING id, site_name, site_url, created_by, created_at, updated_at`,
      [siteName, siteUrl, String(req.user.email || '').toLowerCase() || null]
    );

    res.json({ success: true, link: rows[0] || null });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to add project link.' });
  }
});

router.delete('/api/projects/links/:id', requireAdminApi, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ success: false, error: 'Invalid link id.' });
      return;
    }

    const result = await pool.query('DELETE FROM app_project_links WHERE id = $1', [id]);
    if ((result.rowCount || 0) === 0) {
      res.status(404).json({ success: false, error: 'Project link not found.' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to delete project link.' });
  }
});

const STAFF_FIELDS = {
  code: ['code', 'staffcode'],
  last_name: ['lastname', 'surname', 'familyname'],
  first_name: ['firstname', 'givenname', 'forename'],
  title: ['title'],
  email_school: ['emailschool', 'email', 'schoolemail', 'emailaddress']
};

const STUDENT_DETAILS_FIELDS = {
  id_number: ['studentid', 'student_id', 'idnumber', 'id_number', 'student id', 'id number'],
  last_name: ['lastname', 'last_name', 'last name', 'surname', 'familyname'],
  first_name: ['firstname', 'first_name', 'first name', 'givenname', 'forename'],
  gender: ['gender', 'sex'],
  year_level: ['level', 'yearlevel', 'year_level', 'year'],
  tutor: ['tutor', 'formclass', 'form_class', 'form class'],
  timetable_class: ['timetableclass', 'timetable_class', 'timetable class', 'ttclass'],
  email_school: ['studentemailschool', 'student_email_school', 'student email school', 'studentemail', 'emailschool', 'email_school', 'email']
};

const STUDENT_PERIOD_KEYS = [
  'mon_p1_1', 'mon_p1_2', 'mon_p2', 'mon_i', 'mon_p3', 'mon_p4', 'mon_l', 'mon_p5',
  'tue_p1_1', 'tue_p1_2', 'tue_p2', 'tue_i', 'tue_p3', 'tue_p4', 'tue_l', 'tue_p5',
  'wed_p1_1', 'wed_p1_2', 'wed_p2', 'wed_i', 'wed_p3', 'wed_p4', 'wed_l', 'wed_p5',
  'thu_p1_1', 'thu_p1_2', 'thu_p2', 'thu_i', 'thu_p3', 'thu_p4', 'thu_l', 'thu_p5',
  'fri_p1_1', 'fri_p1_2', 'fri_p2', 'fri_i', 'fri_p3', 'fri_p4', 'fri_l', 'fri_p5'
];

const STUDENT_BASE_KEYS = ['student_name', 'id_number', 'form_class', 'year_level'];
const STUDENT_KEYS = [...STUDENT_BASE_KEYS, ...STUDENT_PERIOD_KEYS];

const STUDENT_ALIASES = {
  student_name: ['studentname', 'name'],
  id_number: ['idnumber', 'studentid', 'id'],
  form_class: ['formclass', 'form', 'class'],
  year_level: ['yearlevel', 'year'],
  email_school: ['studentemailschool', 'studentemail', 'emailschool', 'email', 'schoolemail']
};

const LEGACY_STUDENT_TABLES = [
  'student_upload',
  'student_timetable_upload',
  'student_timetable',
  'student_timetables'
];

const LEGACY_TIMETABLE_TABLES = [
  'timetable_upload',
  'upload_timetable',
  'teacher_timetable_upload',
  'teacher_timetable',
  'timetable'
];


function normalizeKey(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function parseUploadDate(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function buildIndexLookup(headers) {
  const map = new Map();
  headers.forEach((header, index) => {
    map.set(normalizeKey(header), index);
  });
  return map;
}

function pickValueByAliases(row, indexLookup, aliases) {
  for (const alias of aliases) {
    const idx = indexLookup.get(normalizeKey(alias));
    if (idx == null) continue;
    return String(row[idx] || '').trim();
  }
  return '';
}

function mapStaffRow(row, indexLookup) {
  const mapped = {};
  Object.keys(STAFF_FIELDS).forEach((field) => {
    mapped[field] = pickValueByAliases(row, indexLookup, STAFF_FIELDS[field]);
  });
  return mapped;
}

function mapStudentDetailsRow(row, indexLookup) {
  const mapped = {};
  Object.keys(STUDENT_DETAILS_FIELDS).forEach((field) => {
    mapped[field] = pickValueByAliases(row, indexLookup, STUDENT_DETAILS_FIELDS[field]);
  });
  mapped.id_number = String(mapped.id_number || '').trim();
  mapped.email_school = String(mapped.email_school || '').trim().toLowerCase();
  return mapped;
}

function buildStudentHeaderMap(headers) {
  const headerToKey = new Map();
  const normalizedTargets = new Map(STUDENT_KEYS.map((key) => [normalizeKey(key), key]));

  headers.forEach((header, idx) => {
    const normalized = normalizeKey(header);

    if (normalizedTargets.has(normalized)) {
      headerToKey.set(idx, normalizedTargets.get(normalized));
      return;
    }

    for (const [target, aliases] of Object.entries(STUDENT_ALIASES)) {
      if (aliases.includes(normalized)) {
        headerToKey.set(idx, target);
        return;
      }
    }
  });

  return headerToKey;
}

function mapStudentRow(row, headerMap) {
  const mapped = Object.fromEntries(STUDENT_KEYS.map((key) => [key, '']));

  for (const [idx, key] of headerMap.entries()) {
    mapped[key] = String(row[idx] || '').trim();
  }

  return mapped;
}

async function syncStudentEmailsFromStudentUpload() {
  const sourceRows = await pool.query(`
    SELECT id_number, email_school
    FROM student_details_upload
    WHERE status = 'Current';
  `);

  const updates = new Map();
  let skippedMissingFields = 0;

  for (const row of sourceRows.rows || []) {
    const studentId = String(row.id_number || '').trim();
    const email = String(row.email_school || '').trim().toLowerCase();

    if (!studentId || !email) {
      skippedMissingFields += 1;
      continue;
    }

    updates.set(studentId, email);
  }

  const payload = Array.from(updates.entries());
  let updated = 0;
  let notFound = 0;

  await withTransaction(async (client) => {
    for (const [studentId, email] of payload) {
      const result = await client.query(
        `
        UPDATE student_upload
        SET email_school = $2,
            updated_at = NOW()
        WHERE trim(lower(coalesce(id_number, ''))) = trim(lower($1));
        `,
        [studentId, email]
      );

      if ((result.rowCount || 0) > 0) updated += result.rowCount || 0;
      else notFound += 1;
    }
  });

  return {
    processed: payload.length,
    updated,
    not_found_in_student_upload: notFound,
    skipped_missing_fields: skippedMissingFields
  };
}

function getNormalizedRowValue(row, aliases) {
  const normalizedMap = new Map();
  Object.entries(row || {}).forEach(([key, value]) => {
    const normalized = normalizeKey(key);
    if (normalized && !normalizedMap.has(normalized)) {
      normalizedMap.set(normalized, value);
    }
  });

  for (const alias of aliases) {
    const hit = normalizedMap.get(normalizeKey(alias));
    if (hit !== undefined) return hit;
  }

  return null;
}

function normalizeStudentRecord(row) {
  const normalized = {
    id: getNormalizedRowValue(row, ['id']),
    status: getNormalizedRowValue(row, ['status']) || 'Current',
    upload_year: getNormalizedRowValue(row, ['upload_year', 'uploadyear']),
    upload_term: getNormalizedRowValue(row, ['upload_term', 'uploadterm']),
    upload_date: getNormalizedRowValue(row, ['upload_date', 'uploaddate'])
  };

  STUDENT_KEYS.forEach((key) => {
    normalized[key] = getNormalizedRowValue(row, [key]);
  });

  normalized.student_name =
    normalized.student_name || getNormalizedRowValue(row, ['student_name', 'studentname', 'name']);
  normalized.id_number =
    normalized.id_number || getNormalizedRowValue(row, ['id_number', 'idnumber', 'studentid', 'id']);
  normalized.form_class =
    normalized.form_class || getNormalizedRowValue(row, ['form_class', 'formclass', 'form', 'class']);
  normalized.year_level =
    normalized.year_level || getNormalizedRowValue(row, ['year_level', 'yearlevel', 'year']);
  normalized.email_school =
    getNormalizedRowValue(row, ['email_school', 'emailschool', 'student_email_school', 'studentemailschool', 'email']);

  return normalized;
}

function isSafeTableName(tableName) {
  return /^[a-z_][a-z0-9_]*$/.test(tableName);
}

async function tableExists(client, tableName) {
  const { rows } = await client.query('SELECT to_regclass($1) IS NOT NULL AS exists;', [`public.${tableName}`]);
  return Boolean(rows[0]?.exists);
}

async function fetchStudentsWithFallback() {
  const client = await pool.connect();
  try {
    for (const tableName of LEGACY_STUDENT_TABLES) {
      if (!isSafeTableName(tableName)) continue;
      if (!(await tableExists(client, tableName))) continue;

      const { rows } = await client.query(`SELECT * FROM ${tableName};`);
      if (!rows || rows.length === 0) continue;

      const normalizedRows = rows.map(normalizeStudentRecord);
      normalizedRows.sort((a, b) => {
        const aName = String(a.student_name || '').toLowerCase();
        const bName = String(b.student_name || '').toLowerCase();
        return aName.localeCompare(bName);
      });

      return normalizedRows;
    }

    return [];
  } finally {
    client.release();
  }
}

function normalizeTimetableRecord(row) {
  const teacher =
    String(getNormalizedRowValue(row, ['teacher', 'teacher_code', 'teachercode', 'staffcode', 'code']) || '')
      .trim()
      .toLowerCase();

  const teacherName = String(
    getNormalizedRowValue(row, ['teacher_name', 'teachername', 'staffname', 'name']) || ''
  ).trim();

  const status = String(getNormalizedRowValue(row, ['status']) || 'Current').trim();
  const uploadYear = getNormalizedRowValue(row, ['upload_year', 'uploadyear']);
  const uploadTerm = getNormalizedRowValue(row, ['upload_term', 'uploadterm']);
  const uploadDate = getNormalizedRowValue(row, ['upload_date', 'uploaddate']);

  const dataCandidate = getNormalizedRowValue(row, ['data']);
  let data = {};

  if (dataCandidate && typeof dataCandidate === 'object' && !Array.isArray(dataCandidate)) {
    data = dataCandidate;
  } else {
    Object.keys(row || {}).forEach((key) => {
      if (['teacher', 'teacher_name', 'status', 'upload_year', 'upload_term', 'upload_date', 'data'].includes(normalizeKey(key))) {
        return;
      }
      data[key] = row[key];
    });
  }

  return {
    ...data,
    Teacher: teacher,
    Teacher_Name: teacherName || String(data.Teacher_Name || data.teacher_name || '').trim(),
    status,
    upload_year: uploadYear,
    upload_term: uploadTerm,
    upload_date: uploadDate
  };
}

async function fetchTimetableWithFallback() {
  const client = await pool.connect();
  try {
    for (const tableName of LEGACY_TIMETABLE_TABLES) {
      if (!isSafeTableName(tableName)) continue;
      if (!(await tableExists(client, tableName))) continue;

      if (tableName === 'timetable_upload') {
        const { rows } = await client.query(`
          SELECT teacher, teacher_name, data, status, upload_year, upload_term, upload_date
          FROM timetable_upload
          ORDER BY teacher_name ASC NULLS LAST, teacher ASC;
        `);

        if (!rows || rows.length === 0) continue;

        return rows.map((row) => {
          const payload = row.data && typeof row.data === 'object' ? row.data : {};
          return {
            ...payload,
            Teacher: row.teacher,
            Teacher_Name: row.teacher_name || payload.Teacher_Name || payload.teacher_name || '',
            status: row.status,
            upload_year: row.upload_year,
            upload_term: row.upload_term,
            upload_date: row.upload_date
          };
        });
      }

      const { rows } = await client.query(`SELECT * FROM ${tableName};`);
      if (!rows || rows.length === 0) continue;

      const normalizedRows = rows.map(normalizeTimetableRecord).filter((row) => String(row.Teacher || '').trim());
      normalizedRows.sort((a, b) => {
        const aName = String(a.Teacher_Name || '').toLowerCase();
        const bName = String(b.Teacher_Name || '').toLowerCase();
        return aName.localeCompare(bName);
      });

      return normalizedRows;
    }

    return [];
  } finally {
    client.release();
  }
}

function toPositiveIntOrDefault(value, fallback, max) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function includesText(value, q) {
  return String(value || '').toLowerCase().includes(String(q || '').toLowerCase());
}

function normalizeProjectUrl(rawUrl) {
  const text = String(rawUrl || '').trim();
  if (!text) return null;

  try {
    const parsed = new URL(text);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    return parsed.toString();
  } catch (_err) {
    return null;
  }
}

function getTimetableDataColumns(row) {
  return Object.keys(row || {}).filter((key) => {
    const normalized = normalizeKey(key);
    return ![
      'teacher',
      'teachername',
      'status',
      'uploadyear',
      'uploadterm',
      'uploaddate'
    ].includes(normalized);
  });
}

function mapTimetableRow(headers, row) {
  const mapped = {};
  headers.forEach((header, idx) => {
    const key = String(header || '').trim();
    if (!key) return;
    mapped[key] = String(row[idx] || '').trim();
  });
  return mapped;
}

function getTimetableTeacherKey(rowObj) {
  const aliases = ['teacher', 'teachercode', 'code', 'staffcode'];
  const entries = Object.entries(rowObj);

  for (const [key, value] of entries) {
    if (aliases.includes(normalizeKey(key))) {
      return String(value || '').trim();
    }
  }

  return '';
}

function getTimetableTeacherName(rowObj) {
  const aliases = ['teachername', 'teacher_name', 'staffname', 'name'];
  const entries = Object.entries(rowObj);

  for (const [key, value] of entries) {
    if (aliases.includes(normalizeKey(key))) {
      return String(value || '').trim();
    }
  }

  return '';
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

router.get('/api/staff_upload/all', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, code, last_name, first_name, title, email_school, status, upload_year, upload_term, upload_date
      FROM staff_upload
      ORDER BY last_name ASC, first_name ASC;
    `);
    res.json({ staff: rows });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load staff upload data.' });
  }
});

router.post('/api/staff_upload', async (req, res) => {
  const headers = Array.isArray(req.body?.headers) ? req.body.headers : [];
  const uploadedRows = Array.isArray(req.body?.staff) ? req.body.staff : [];

  if (headers.length === 0 || uploadedRows.length === 0) {
    res.status(400).json({ error: 'Missing headers or staff rows.' });
    return;
  }

  const uploadYear = Number.isInteger(Number(req.body?.uploadYear)) ? Number(req.body.uploadYear) : null;
  const uploadTerm = String(req.body?.uploadTerm || '').trim() || null;
  const uploadDate = parseUploadDate(req.body?.uploadDate);

  const indexLookup = buildIndexLookup(headers);
  const deduped = new Map();
  let skippedNoIdentifier = 0;
  let duplicateIdentifiers = 0;
  let duplicateEmails = 0;
  let duplicateCodes = 0;

  for (const row of uploadedRows) {
    if (!Array.isArray(row)) continue;
    const mapped = mapStaffRow(row, indexLookup);
    const emailKey = String(mapped.email_school || '').trim().toLowerCase();
    const codeKey = String(mapped.code || '').trim().toLowerCase();
    const identifier = emailKey ? `email:${emailKey}` : (codeKey ? `code:${codeKey}` : '');

    if (!identifier) {
      skippedNoIdentifier += 1;
      continue;
    }

    if (deduped.has(identifier)) {
      duplicateIdentifiers += 1;
      if (emailKey) duplicateEmails += 1;
      else duplicateCodes += 1;
      continue;
    }

    deduped.set(identifier, mapped);
  }

  const records = Array.from(deduped.values());

  try {
    const result = await withTransaction(async (client) => {
      let inserted = 0;
      let updated = 0;

      for (const record of records) {
        const code = String(record.code || '').trim() || null;
        const email = String(record.email_school || '').trim().toLowerCase() || null;

        let existing = null;
        if (email) {
          const foundByEmail = await client.query(
            `SELECT id FROM staff_upload WHERE lower(coalesce(email_school, '')) = $1 LIMIT 1;`,
            [email]
          );
          existing = foundByEmail.rows[0] || null;
        }
        if (!existing && code) {
          const foundByCode = await client.query(
            `SELECT id FROM staff_upload WHERE lower(coalesce(code, '')) = $1 LIMIT 1;`,
            [code.toLowerCase()]
          );
          existing = foundByCode.rows[0] || null;
        }

        if (existing) {
          await client.query(
            `
            UPDATE staff_upload
            SET code = $2,
                last_name = $3,
                first_name = $4,
                title = $5,
                email_school = COALESCE($6, email_school),
                status = 'Current',
                upload_year = $7,
                upload_term = $8,
                upload_date = $9,
                updated_at = NOW()
            WHERE id = $1;
            `,
            [
              existing.id,
              code,
              record.last_name || null,
              record.first_name || null,
              record.title || null,
              email,
              uploadYear,
              uploadTerm,
              uploadDate
            ]
          );
          updated += 1;
        } else {
          await client.query(
            `
            INSERT INTO staff_upload (
              code, last_name, first_name, title, email_school, status, upload_year, upload_term, upload_date, updated_at
            ) VALUES ($1,$2,$3,$4,$5,'Current',$6,$7,$8,NOW());
            `,
            [
              code,
              record.last_name || null,
              record.first_name || null,
              record.title || null,
              email,
              uploadYear,
              uploadTerm,
              uploadDate
            ]
          );
          inserted += 1;
        }
      }

      let markedNotCurrent = 0;
      const uploadedEmails = records.map((r) => String(r.email_school || '').trim().toLowerCase()).filter(Boolean);
      const uploadedCodes = records.map((r) => String(r.code || '').trim().toLowerCase()).filter(Boolean);

      if (uploadedEmails.length > 0 || uploadedCodes.length > 0) {
        const mark = await client.query(
          `
          UPDATE staff_upload
          SET status = 'Not Current', updated_at = NOW()
          WHERE status <> 'Not Current'
            AND NOT (
              (lower(coalesce(email_school, '')) <> '' AND lower(email_school) = ANY($1::text[]))
              OR
              (lower(coalesce(code, '')) <> '' AND lower(code) = ANY($2::text[]))
            );
          `,
          [uploadedEmails, uploadedCodes]
        );
        markedNotCurrent = mark.rowCount || 0;
      }

      return { inserted, updated, markedNotCurrent };
    });

    res.json({
      success: true,
      processed: records.length,
      inserted: result.inserted,
      updated: result.updated,
      marked_not_current: result.markedNotCurrent,
      skipped_no_email: skippedNoIdentifier,
      skipped_no_identifier: skippedNoIdentifier,
      duplicate_emails_in_upload: duplicateEmails,
      duplicate_identifiers_in_upload: duplicateIdentifiers,
      duplicate_codes_in_upload: duplicateCodes,
      upload_year: uploadYear,
      upload_term: uploadTerm,
      upload_date: uploadDate
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save staff upload data.' });
  }
});

router.get('/api/student_details_upload/all', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, id_number, last_name, first_name, gender, year_level, tutor, timetable_class, email_school,
             status, upload_year, upload_term, upload_date
      FROM student_details_upload
      ORDER BY last_name ASC, first_name ASC;
    `);
    res.json({ students: rows });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load student upload data.' });
  }
});

router.post('/api/student_details_upload', async (req, res) => {
  const headers = Array.isArray(req.body?.headers) ? req.body.headers : [];
  const uploadedRows = Array.isArray(req.body?.students) ? req.body.students : [];

  if (headers.length === 0 || uploadedRows.length === 0) {
    res.status(400).json({ error: 'Missing headers or student rows.' });
    return;
  }

  const uploadYear = Number.isInteger(Number(req.body?.uploadYear)) ? Number(req.body.uploadYear) : null;
  const uploadTerm = String(req.body?.uploadTerm || '').trim() || null;
  const uploadDate = parseUploadDate(req.body?.uploadDate);

  const indexLookup = buildIndexLookup(headers);
  const deduped = new Map();
  let skippedNoIdNumber = 0;
  let duplicateIdNumbers = 0;

  for (const row of uploadedRows) {
    if (!Array.isArray(row)) continue;
    const mapped = mapStudentDetailsRow(row, indexLookup);
    const idNumber = String(mapped.id_number || '').trim().toLowerCase();

    if (!idNumber) {
      skippedNoIdNumber += 1;
      continue;
    }

    if (deduped.has(idNumber)) {
      duplicateIdNumbers += 1;
      continue;
    }

    deduped.set(idNumber, mapped);
  }

  const records = Array.from(deduped.values());

  try {
    const result = await withTransaction(async (client) => {
      let inserted = 0;
      let updated = 0;

      for (const record of records) {
        const upsert = await client.query(
          `
          INSERT INTO student_details_upload (
            id_number, last_name, first_name, gender, year_level, tutor, timetable_class, email_school,
            status, upload_year, upload_term, upload_date, updated_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'Current',$9,$10,$11,NOW())
          ON CONFLICT (id_number)
          DO UPDATE SET
            last_name = EXCLUDED.last_name,
            first_name = EXCLUDED.first_name,
            gender = EXCLUDED.gender,
            year_level = EXCLUDED.year_level,
            tutor = EXCLUDED.tutor,
            timetable_class = EXCLUDED.timetable_class,
            email_school = EXCLUDED.email_school,
            status = 'Current',
            upload_year = EXCLUDED.upload_year,
            upload_term = EXCLUDED.upload_term,
            upload_date = EXCLUDED.upload_date,
            updated_at = NOW()
          RETURNING (xmax = 0) AS inserted;
          `,
          [
            record.id_number || null,
            record.last_name || null,
            record.first_name || null,
            record.gender || null,
            record.year_level || null,
            record.tutor || null,
            record.timetable_class || null,
            record.email_school || null,
            uploadYear,
            uploadTerm,
            uploadDate
          ]
        );

        if (upsert.rows[0]?.inserted) inserted += 1;
        else updated += 1;
      }

      let markedNotCurrent = 0;
      const uploadedIds = records.map((r) => String(r.id_number || '').trim().toLowerCase()).filter(Boolean);
      if (uploadedIds.length > 0) {
        const mark = await client.query(
          `
          UPDATE student_details_upload
          SET status = 'Not Current', updated_at = NOW()
          WHERE status <> 'Not Current'
            AND NOT (lower(id_number) = ANY($1::text[]));
          `,
          [uploadedIds]
        );
        markedNotCurrent = mark.rowCount || 0;
      }

      return { inserted, updated, markedNotCurrent };
    });

    res.json({
      success: true,
      processed: records.length,
      inserted: result.inserted,
      updated: result.updated,
      marked_not_current: result.markedNotCurrent,
      skipped_no_id_number: skippedNoIdNumber,
      duplicate_id_numbers_in_upload: duplicateIdNumbers,
      upload_year: uploadYear,
      upload_term: uploadTerm,
      upload_date: uploadDate
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save student upload data.' });
  }
});

router.get('/api/student_upload/all', async (_req, res) => {
  try {
    const rows = await fetchStudentsWithFallback();
    res.json({ students: rows });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load student timetable data.' });
  }
});

router.post('/api/student_upload/sync-emails', async (req, res) => {
  try {
    const result = await syncStudentEmailsFromStudentUpload();
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Failed to sync student emails.' });
  }
});

router.post('/api/student_upload', async (req, res) => {
  const headers = Array.isArray(req.body?.headers) ? req.body.headers : [];
  const uploadedRows = Array.isArray(req.body?.students) ? req.body.students : [];

  if (headers.length === 0 || uploadedRows.length === 0) {
    res.status(400).json({ error: 'Missing headers or student rows.' });
    return;
  }

  const uploadYear = Number.isInteger(Number(req.body?.uploadYear)) ? Number(req.body.uploadYear) : null;
  const uploadTerm = String(req.body?.uploadTerm || '').trim() || null;
  const uploadDate = parseUploadDate(req.body?.uploadDate);

  const headerMap = buildStudentHeaderMap(headers);
  const deduped = new Map();
  let skippedNoIdNumber = 0;
  let duplicateIdNumbers = 0;

  for (const row of uploadedRows) {
    if (!Array.isArray(row)) continue;
    const mapped = mapStudentRow(row, headerMap);
    const idNumber = String(mapped.id_number || '').trim().toLowerCase();

    if (!idNumber) {
      skippedNoIdNumber += 1;
      continue;
    }

    if (deduped.has(idNumber)) {
      duplicateIdNumbers += 1;
      continue;
    }

    deduped.set(idNumber, mapped);
  }

  const records = Array.from(deduped.values());

  try {
    const result = await withTransaction(async (client) => {
      let inserted = 0;
      let updated = 0;

      for (const record of records) {
        const values = [
          record.student_name || null,
          record.id_number || null,
          record.form_class || null,
          record.year_level || null,
          ...STUDENT_PERIOD_KEYS.map((key) => record[key] || null),
          uploadYear,
          uploadTerm,
          uploadDate
        ];

        const upsert = await client.query(
          `
          INSERT INTO student_upload (
            student_name, id_number, form_class, year_level,
            mon_p1_1, mon_p1_2, mon_p2, mon_i, mon_p3, mon_p4, mon_l, mon_p5,
            tue_p1_1, tue_p1_2, tue_p2, tue_i, tue_p3, tue_p4, tue_l, tue_p5,
            wed_p1_1, wed_p1_2, wed_p2, wed_i, wed_p3, wed_p4, wed_l, wed_p5,
            thu_p1_1, thu_p1_2, thu_p2, thu_i, thu_p3, thu_p4, thu_l, thu_p5,
            fri_p1_1, fri_p1_2, fri_p2, fri_i, fri_p3, fri_p4, fri_l, fri_p5,
            status, upload_year, upload_term, upload_date, updated_at
          ) VALUES (
            $1, $2, $3, $4,
            $5, $6, $7, $8, $9, $10, $11, $12,
            $13, $14, $15, $16, $17, $18, $19, $20,
            $21, $22, $23, $24, $25, $26, $27, $28,
            $29, $30, $31, $32, $33, $34, $35, $36,
            $37, $38, $39, $40, $41, $42, $43, $44,
            'Current', $45, $46, $47, NOW()
          )
          ON CONFLICT (id_number)
          DO UPDATE SET
            student_name = EXCLUDED.student_name,
            form_class = EXCLUDED.form_class,
            year_level = EXCLUDED.year_level,
            mon_p1_1 = EXCLUDED.mon_p1_1, mon_p1_2 = EXCLUDED.mon_p1_2, mon_p2 = EXCLUDED.mon_p2, mon_i = EXCLUDED.mon_i,
            mon_p3 = EXCLUDED.mon_p3, mon_p4 = EXCLUDED.mon_p4, mon_l = EXCLUDED.mon_l, mon_p5 = EXCLUDED.mon_p5,
            tue_p1_1 = EXCLUDED.tue_p1_1, tue_p1_2 = EXCLUDED.tue_p1_2, tue_p2 = EXCLUDED.tue_p2, tue_i = EXCLUDED.tue_i,
            tue_p3 = EXCLUDED.tue_p3, tue_p4 = EXCLUDED.tue_p4, tue_l = EXCLUDED.tue_l, tue_p5 = EXCLUDED.tue_p5,
            wed_p1_1 = EXCLUDED.wed_p1_1, wed_p1_2 = EXCLUDED.wed_p1_2, wed_p2 = EXCLUDED.wed_p2, wed_i = EXCLUDED.wed_i,
            wed_p3 = EXCLUDED.wed_p3, wed_p4 = EXCLUDED.wed_p4, wed_l = EXCLUDED.wed_l, wed_p5 = EXCLUDED.wed_p5,
            thu_p1_1 = EXCLUDED.thu_p1_1, thu_p1_2 = EXCLUDED.thu_p1_2, thu_p2 = EXCLUDED.thu_p2, thu_i = EXCLUDED.thu_i,
            thu_p3 = EXCLUDED.thu_p3, thu_p4 = EXCLUDED.thu_p4, thu_l = EXCLUDED.thu_l, thu_p5 = EXCLUDED.thu_p5,
            fri_p1_1 = EXCLUDED.fri_p1_1, fri_p1_2 = EXCLUDED.fri_p1_2, fri_p2 = EXCLUDED.fri_p2, fri_i = EXCLUDED.fri_i,
            fri_p3 = EXCLUDED.fri_p3, fri_p4 = EXCLUDED.fri_p4, fri_l = EXCLUDED.fri_l, fri_p5 = EXCLUDED.fri_p5,
            status = 'Current',
            upload_year = EXCLUDED.upload_year,
            upload_term = EXCLUDED.upload_term,
            upload_date = EXCLUDED.upload_date,
            updated_at = NOW()
          RETURNING (xmax = 0) AS inserted;
          `,
          values
        );

        if (upsert.rows[0]?.inserted) inserted += 1;
        else updated += 1;
      }

      let markedNotCurrent = 0;
      const uploadedIds = records.map((r) => String(r.id_number || '').trim().toLowerCase()).filter(Boolean);
      if (uploadedIds.length > 0) {
        const mark = await client.query(
          `
          UPDATE student_upload
          SET status = 'Not Current', updated_at = NOW()
          WHERE status <> 'Not Current'
            AND NOT (lower(id_number) = ANY($1::text[]));
          `,
          [uploadedIds]
        );
        markedNotCurrent = mark.rowCount || 0;
      }

      return { inserted, updated, markedNotCurrent };
    });

    res.json({
      success: true,
      processed: records.length,
      inserted: result.inserted,
      updated: result.updated,
      marked_not_current: result.markedNotCurrent,
      skipped_no_id_number: skippedNoIdNumber,
      duplicate_id_numbers_in_upload: duplicateIdNumbers,
      upload_year: uploadYear,
      upload_term: uploadTerm,
      upload_date: uploadDate
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save student upload data.' });
  }
});

router.get('/api/timetable/all', async (_req, res) => {
  try {
    const timetable = await fetchTimetableWithFallback();
    res.json({ timetable });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load timetable data.' });
  }
});

router.get('/api/feed/staff/current', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim().toLowerCase();
    const limit = toPositiveIntOrDefault(req.query.limit, 2000, 10000);

    const params = [];
    let where = "WHERE status = 'Current'";

    if (q) {
      params.push(`%${q}%`);
      where += `\n        AND (
          lower(coalesce(code, '')) LIKE $${params.length}
          OR lower(coalesce(first_name, '')) LIKE $${params.length}
          OR lower(coalesce(last_name, '')) LIKE $${params.length}
          OR lower(coalesce(email_school, '')) LIKE $${params.length}
        )`;
    }

    params.push(limit);

    const { rows } = await pool.query(
      `
      SELECT id, code, last_name, first_name, title, email_school, status, upload_year, upload_term, upload_date
      FROM staff_upload
      ${where}
      ORDER BY last_name ASC, first_name ASC
      LIMIT $${params.length};
      `,
      params
    );

    res.json({
      count: rows.length,
      filters: { q: q || null, limit },
      staff: rows
    });

  } catch (error) {
    res.status(500).json({ error: 'Failed to load current staff feed.' });
  }
});

router.get('/api/feed/departments', async (_req, res) => {
  try {
    const staff = await pool.query("SELECT id::text AS id,code,first_name,last_name FROM staff_upload WHERE status='Current'");
    res.json({ departments: await loadDepartments((sql, params) => pool.query(sql, params), staff.rows) });
  } catch (error) {
    console.error('Kamar department directory failed:', error.message);
    res.status(502).json({ error: 'The shared department directory could not be loaded. Retry or contact your administrator.' });
  }
});

router.get('/api/feed/students/current', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim().toLowerCase();
    const formClass = String(req.query.form_class || '').trim().toLowerCase();
    const yearLevel = String(req.query.year_level || '').trim().toLowerCase();
    const limit = toPositiveIntOrDefault(req.query.limit, 5000, 20000);

    const rows = await fetchStudentsWithFallback();
    const filtered = rows
      .filter((row) => String(row.status || 'Current').toLowerCase() === 'current')
      .filter((row) => {
        if (!formClass) return true;
        return String(row.form_class || '').toLowerCase() === formClass;
      })
      .filter((row) => {
        if (!yearLevel) return true;
        return String(row.year_level || '').toLowerCase() === yearLevel;
      })
      .filter((row) => {
        if (!q) return true;
        return (
          includesText(row.student_name, q) ||
          includesText(row.id_number, q) ||
          includesText(row.form_class, q)
        );
      })
      .slice(0, limit);

    res.json({
      count: filtered.length,
      filters: {
        q: q || null,
        form_class: formClass || null,
        year_level: yearLevel || null,
        limit
      },
      students: filtered
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load current students feed.' });
  }
});

router.get('/api/feed/timetable/by-teacher/:teacherKey', async (req, res) => {
  try {
    const teacherKey = String(req.params.teacherKey || '').trim().toLowerCase();
    if (!teacherKey) {
      res.status(400).json({ error: 'Teacher key is required.' });
      return;
    }

    const rows = await fetchTimetableWithFallback();
    const row = rows.find((item) => String(item.Teacher || item.teacher || '').trim().toLowerCase() === teacherKey);

    if (!row) {
      res.status(404).json({ error: 'Teacher timetable not found.' });
      return;
    }

    res.json({
      teacher: teacherKey,
      timetable: row
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load timetable by teacher.' });
  }
});

router.get('/api/feed/timetable/by-class/:classCode', async (req, res) => {
  try {
    const classCode = String(req.params.classCode || '').trim().toLowerCase();
    if (!classCode) {
      res.status(400).json({ error: 'Class code is required.' });
      return;
    }

    const period = String(req.query.period || '').trim();
    const limit = toPositiveIntOrDefault(req.query.limit, 500, 5000);

    const rows = await fetchTimetableWithFallback();
    const scopedRows = rows.filter((row) => String(row.status || 'Current').toLowerCase() === 'current');
    const matches = [];

    for (const row of scopedRows) {
      const teacher = String(row.Teacher || '').trim();
      const teacherName = String(row.Teacher_Name || '').trim();
      const columns = period ? [period] : getTimetableDataColumns(row);

      for (const column of columns) {
        const value = String(row[column] || '').trim();
        if (!value) continue;
        if (!includesText(value, classCode)) continue;

        matches.push({
          teacher,
          teacher_name: teacherName,
          period: column,
          value,
          upload_year: row.upload_year || null,
          upload_term: row.upload_term || null,
          upload_date: row.upload_date || null
        });

        if (matches.length >= limit) break;
      }

      if (matches.length >= limit) break;
    }

    res.json({
      class_code: classCode,
      period: period || null,
      count: matches.length,
      limit,
      matches
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load timetable by class.' });
  }
});

router.get('/api/feed/timetable/by-period/:periodKey', async (req, res) => {
  try {
    const periodKey = String(req.params.periodKey || '').trim();
    if (!periodKey) {
      res.status(400).json({ error: 'Period key is required.' });
      return;
    }

    const q = String(req.query.q || '').trim().toLowerCase();
    const limit = toPositiveIntOrDefault(req.query.limit, 500, 5000);

    const rows = await fetchTimetableWithFallback();
    const matches = rows
      .filter((row) => String(row.status || 'Current').toLowerCase() === 'current')
      .map((row) => ({
        teacher: String(row.Teacher || '').trim(),
        teacher_name: String(row.Teacher_Name || '').trim(),
        period: periodKey,
        value: String(row[periodKey] || '').trim(),
        upload_year: row.upload_year || null,
        upload_term: row.upload_term || null,
        upload_date: row.upload_date || null
      }))
      .filter((item) => item.value)
      .filter((item) => (q ? includesText(item.value, q) || includesText(item.teacher_name, q) || includesText(item.teacher, q) : true))
      .slice(0, limit);

    res.json({
      period: periodKey,
      q: q || null,
      count: matches.length,
      limit,
      matches
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load timetable by period.' });
  }
});

router.get('/api/feed/summary/current-counts', async (_req, res) => {
  try {
    const [staffCounts, studentCounts, timetableCounts, staffLatest, studentLatest, timetableLatest] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'Current') AS current_count,
          COUNT(*) FILTER (WHERE status = 'Not Current') AS not_current_count,
          COUNT(*) AS total_count
        FROM staff_upload;
      `),
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'Current') AS current_count,
          COUNT(*) FILTER (WHERE status = 'Not Current') AS not_current_count,
          COUNT(*) AS total_count
        FROM student_upload;
      `),
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'Current') AS current_count,
          COUNT(*) FILTER (WHERE status = 'Not Current') AS not_current_count,
          COUNT(*) AS total_count
        FROM timetable_upload;
      `),
      pool.query(`
        SELECT upload_year, upload_term, upload_date, updated_at
        FROM staff_upload
        ORDER BY updated_at DESC NULLS LAST
        LIMIT 1;
      `),
      pool.query(`
        SELECT upload_year, upload_term, upload_date, updated_at
        FROM student_upload
        ORDER BY updated_at DESC NULLS LAST
        LIMIT 1;
      `),
      pool.query(`
        SELECT upload_year, upload_term, upload_date, updated_at
        FROM timetable_upload
        ORDER BY updated_at DESC NULLS LAST
        LIMIT 1;
      `)
    ]);

    const safeCounts = (rows) => {
      const row = rows[0] || {};
      return {
        current: Number(row.current_count || 0),
        not_current: Number(row.not_current_count || 0),
        total: Number(row.total_count || 0)
      };
    };

    const safeLatest = (rows) => {
      const row = rows[0] || null;
      if (!row) return null;
      return {
        upload_year: row.upload_year,
        upload_term: row.upload_term,
        upload_date: row.upload_date,
        updated_at: row.updated_at
      };
    };

    res.json({
      generated_at: new Date().toISOString(),
      staff: {
        counts: safeCounts(staffCounts.rows),
        latest_upload: safeLatest(staffLatest.rows)
      },
      students: {
        counts: safeCounts(studentCounts.rows),
        latest_upload: safeLatest(studentLatest.rows)
      },
      timetable: {
        counts: safeCounts(timetableCounts.rows),
        latest_upload: safeLatest(timetableLatest.rows)
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load upload summary counts.' });
  }
});

router.post('/api/upload_timetable', async (req, res) => {
  const headers = Array.isArray(req.body?.headers) ? req.body.headers : [];
  const uploadedRows = Array.isArray(req.body?.timetable) ? req.body.timetable : [];

  if (headers.length === 0 || uploadedRows.length === 0) {
    res.status(400).json({ error: 'Missing headers or timetable rows.' });
    return;
  }

  const uploadYear = Number.isInteger(Number(req.body?.uploadYear)) ? Number(req.body.uploadYear) : null;
  const uploadTerm = String(req.body?.uploadTerm || '').trim() || null;
  const uploadDate = parseUploadDate(req.body?.uploadDate);

  const deduped = new Map();
  let skippedNoTeacher = 0;
  let duplicateTeachers = 0;

  for (const row of uploadedRows) {
    if (!Array.isArray(row)) continue;

    const mapped = mapTimetableRow(headers, row);
    const teacher = getTimetableTeacherKey(mapped).toLowerCase();

    if (!teacher) {
      skippedNoTeacher += 1;
      continue;
    }

    if (deduped.has(teacher)) {
      duplicateTeachers += 1;
      continue;
    }

    deduped.set(teacher, {
      teacher,
      teacherName: getTimetableTeacherName(mapped),
      data: mapped
    });
  }

  const records = Array.from(deduped.values());

  try {
    const result = await withTransaction(async (client) => {
      let inserted = 0;
      let updated = 0;

      for (const record of records) {
        const upsert = await client.query(
          `
          INSERT INTO timetable_upload (
            teacher, teacher_name, data, status, upload_year, upload_term, upload_date, updated_at
          ) VALUES ($1,$2,$3::jsonb,'Current',$4,$5,$6,NOW())
          ON CONFLICT (teacher)
          DO UPDATE SET
            teacher_name = EXCLUDED.teacher_name,
            data = EXCLUDED.data,
            status = 'Current',
            upload_year = EXCLUDED.upload_year,
            upload_term = EXCLUDED.upload_term,
            upload_date = EXCLUDED.upload_date,
            updated_at = NOW()
          RETURNING (xmax = 0) AS inserted;
          `,
          [
            record.teacher,
            record.teacherName || null,
            JSON.stringify(record.data),
            uploadYear,
            uploadTerm,
            uploadDate
          ]
        );

        if (upsert.rows[0]?.inserted) inserted += 1;
        else updated += 1;
      }

      let markedNotCurrent = 0;
      const uploadedTeachers = records.map((r) => String(r.teacher || '').trim().toLowerCase()).filter(Boolean);
      if (uploadedTeachers.length > 0) {
        const mark = await client.query(
          `
          UPDATE timetable_upload
          SET status = 'Not Current', updated_at = NOW()
          WHERE status <> 'Not Current'
            AND NOT (lower(teacher) = ANY($1::text[]));
          `,
          [uploadedTeachers]
        );
        markedNotCurrent = mark.rowCount || 0;
      }

      return { inserted, updated, markedNotCurrent };
    });

    res.json({
      success: true,
      processed: records.length,
      inserted: result.inserted,
      updated: result.updated,
      marked_not_current: result.markedNotCurrent,
      skipped_no_teacher: skippedNoTeacher,
      duplicate_teachers_in_upload: duplicateTeachers,
      upload_year: uploadYear,
      upload_term: uploadTerm,
      upload_date: uploadDate
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save timetable upload data.' });
  }
});

router.put('/api/upload_timetable/row/:teacherKey', async (req, res) => {
  const teacherKey = String(req.params.teacherKey || '').trim().toLowerCase();
  const row = req.body?.row;

  if (!teacherKey || !row || typeof row !== 'object') {
    res.status(400).json({ success: false, error: 'Missing teacher key or row payload.' });
    return;
  }

  const normalizedRow = { ...row, Teacher: teacherKey };
  const teacherName = getTimetableTeacherName(normalizedRow) || null;

  try {
    const updated = await pool.query(
      `
      UPDATE timetable_upload
      SET teacher_name = $2,
          data = $3::jsonb,
          updated_at = NOW()
      WHERE lower(teacher) = $1
      RETURNING teacher, teacher_name, data, status, upload_year, upload_term, upload_date;
      `,
      [teacherKey, teacherName, JSON.stringify(normalizedRow)]
    );

    if (updated.rowCount === 0) {
      res.status(404).json({ success: false, error: 'Teacher row not found.' });
      return;
    }

    const saved = updated.rows[0];
    res.json({
      success: true,
      row: {
        ...saved.data,
        Teacher: saved.teacher,
        Teacher_Name: saved.teacher_name || saved.data.Teacher_Name || saved.data.teacher_name || '',
        status: saved.status,
        upload_year: saved.upload_year,
        upload_term: saved.upload_term,
        upload_date: saved.upload_date
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to save teacher row.' });
  }
});

module.exports = router;
