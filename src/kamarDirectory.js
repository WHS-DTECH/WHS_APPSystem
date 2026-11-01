const { query } = require('./legacy/kamar-uploader/db');
const { loadDepartments } = require('./legacy/kamar-uploader/departments');
const { query: coreQuery } = require('./db');

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

async function attendanceClasses(user, year, directoryQuery = query) {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw Object.assign(new Error('Choose a valid attendance year.'), { status: 400 });
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
  const { rows } = await directoryQuery(`SELECT id_number,student_name,${columns.join(',')}
        FROM student_upload WHERE status='Current' AND upload_year=$1
        AND NULLIF(TRIM(id_number),'') IS NOT NULL AND NULLIF(TRIM(student_name),'') IS NOT NULL
        ORDER BY lower(student_name),id_number`, [year]);
  const classes = new Map();
  for (const student of rows) {
    for (const code of new Set(columns.map(key => student[key]?.trim()).filter(Boolean))) {
      const separator = code.indexOf('-');
      if (separator < 1 || !code.slice(0, separator).toUpperCase().split('/').map(value => value.trim()).includes(staffCode)) continue;
      if (!classes.has(code)) classes.set(code, new Map());
      classes.get(code).set(student.id_number, { id: 'k:' + student.id_number.trim(), name: student.student_name.trim() });
    }
  }
  return { staffCode, classes: [...classes].sort(([a], [b]) => a.localeCompare(b))
    .map(([code, students]) => ({ code, students: [...students.values()] })) };
}

module.exports = { currentDirectory, classifyPeople, staffDirectory, attendanceClasses };
