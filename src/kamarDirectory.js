const { query } = require('./legacy/kamar-uploader/db');
const { loadDepartments } = require('./legacy/kamar-uploader/departments');
const { query: coreQuery } = require('./db');
const { buildStudentHeaderMap, mapStudentRow } = require('./legacy/kamar-uploader/studentTimetable');

async function currentDirectory(dbQuery = query) {
  const [staff, students] = await Promise.all([
    dbQuery("SELECT code,first_name,last_name,title,email_school FROM staff_upload WHERE status='Current'"),
    dbQuery("SELECT id_number,first_name,last_name,email_school FROM student_details_upload WHERE status='Current'")
  ]);
  const emails = rows => [...new Set(rows.map(person => String(person.email_school || '').trim().toLowerCase()).filter(Boolean))];
  return { staff: staff.rows, students: students.rows, staffEmails: emails(staff.rows), studentEmails: emails(students.rows) };
}

function classifyPeople(rows, directory) {
  const staff = new Set(directory.staffEmails);
  const students = new Set(directory.studentEmails);
  return rows.map(person => {
    const email = String(person.email || '').trim().toLowerCase();
    return { ...person, is_staff: staff.has(email), is_student: students.has(email) };
  });
}

async function staffDirectory(user, { includeEmails = false } = {}, directoryQuery = query, dbQuery = coreQuery) {
  if (typeof includeEmails !== 'boolean') {
    throw Object.assign(new Error('Choose whether staff school emails are required.'), { status: 400 });
  }
  if (includeEmails && !user.roles?.includes('ADMIN') && !user.module_roles?.includes('lead-teacher')) {
    throw Object.assign(new Error('Only administrators and module Lead Teachers can request staff school email mappings.'), { status: 403 });
  }
  const result = await directoryQuery(`SELECT id::text AS id,code,first_name,last_name${includeEmails ? ',email_school' : ''}
        FROM staff_upload WHERE status='Current'
        AND (NULLIF(TRIM(first_name),'') IS NOT NULL OR NULLIF(TRIM(last_name),'') IS NOT NULL)
        ORDER BY lower(trim(last_name)) NULLS LAST,lower(trim(first_name)) NULLS LAST,id`);
  return { staff: result.rows, departments: await loadDepartments(dbQuery, result.rows) };
}

async function attendanceClasses(user, year, directoryQuery = query, term) {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw Object.assign(new Error('Choose a valid attendance year.'), { status: 400 });
  }
  if (term !== undefined && (!Number.isInteger(term) || term < 1 || term > 4)) {
    throw Object.assign(new Error('Choose a valid attendance term.'), { status: 400 });
  }
  const columns = ['mon', 'tue', 'wed', 'thu', 'fri']
    .flatMap(day => ['p1_1', 'p1_2', 'p2', 'p3', 'p4', 'p5'].map(period => day + '_' + period));
  const staff = await directoryQuery(`SELECT DISTINCT upper(trim(code)) AS code FROM staff_upload
        WHERE status='Current' AND lower(trim(email_school))=lower(trim($1))
        AND NULLIF(TRIM(code),'') IS NOT NULL`, [user.email]);
  if (staff.rows.length !== 1) {
    throw Object.assign(new Error(staff.rows.length ?
      'Your school sign-in email matches multiple current staff codes. Ask an administrator to correct the Staff List.' :
      'Your school sign-in email has no current Staff List code. Ask an administrator to check your school email and staff code.'), { status: 409 });
  }
  const staffCode = staff.rows[0].code;
  let rows;
  if (term === undefined) {
    ({ rows } = await directoryQuery(`SELECT id_number,student_name,year_level,form_class,${columns.join(',')}
        FROM student_upload WHERE status='Current' AND upload_year=$1
        AND NULLIF(TRIM(id_number),'') IS NOT NULL AND NULLIF(TRIM(student_name),'') IS NOT NULL
        ORDER BY lower(student_name),id_number`, [year]));
  } else {
    const snapshot = await directoryQuery(`SELECT payload FROM kamar_datasets
      WHERE school_year=$1 AND term=$2 AND dataset_type='student_timetable'
      ORDER BY source_date DESC,source_time DESC,created_at DESC,id DESC LIMIT 1`, [year, term]);
    if (!snapshot.rows.length) {
      throw Object.assign(new Error('No preserved student timetable was found for ' + year + ' Term ' + term + '. Import or upload that term before loading classes.'), { status: 404 });
    }
    const payload = snapshot.rows[0].payload;
    if (!payload || !Array.isArray(payload.headers) || !Array.isArray(payload.rows)) throw new Error('Preserved student timetable is invalid.');
    const map = buildStudentHeaderMap(payload.headers);
    if (!['student_name', 'id_number', 'year_level'].every(key => [...map.values()].includes(key)) ||
        !columns.some(key => [...map.values()].includes(key))) throw new Error('Preserved student timetable is missing required columns.');
    rows = payload.rows.map(row => {
      if (!Array.isArray(row) || row.length !== payload.headers.length) throw new Error('Preserved student timetable contains an invalid row.');
      return mapStudentRow(row, map);
    }).filter(row => row.id_number && row.student_name)
      .sort((a, b) => a.student_name.localeCompare(b.student_name) || a.id_number.localeCompare(b.id_number));
  }
  const classes = new Map();
  const classSlots = new Map();
  for (const student of rows) {
    for (const key of columns) {
      const code = student[key]?.trim();
      if (!code) continue;
      const separator = code.indexOf('-');
      if (separator < 1 || !code.slice(0, separator).toUpperCase().split('/').map(value => value.trim()).includes(staffCode)) continue;
      if (!classes.has(code)) { classes.set(code, new Map()); classSlots.set(code, new Set()); }
      classSlots.get(code).add(key);
      classes.get(code).set(student.id_number, { id: 'k:' + student.id_number.trim(), name: student.student_name.trim(),
        yearLevel: String(student.year_level || '').trim(), whanau: String(student.form_class || '').trim() });
    }
  }
  return { staffCode, classes: [...classes].sort(([a], [b]) => a.localeCompare(b))
    .map(([code, students]) => ({ code, students: [...students.values()], slots: [...classSlots.get(code)].sort() })) };
}

module.exports = { currentDirectory, classifyPeople, staffDirectory, attendanceClasses };
