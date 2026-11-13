const { Pool } = require('pg');
const { buildStudentHeaderMap, mapStudentRow } = require('./legacy/kamar-uploader/studentTimetable');
const { classCode } = require('./legacy/teacher-planner/public/attendance');
const reporting = require('./legacy/teacher-planner/public/reporting-schema');
const { loadDepartments } = require('./legacy/kamar-uploader/departments');

const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const columns = ['mon', 'tue', 'wed', 'thu', 'fri']
  .flatMap(day => ['p1_1', 'p1_2', 'p2', 'p3', 'p4', 'p5'].map(period => day + '_' + period));
const error = (message, status = 400) => Object.assign(new Error(message), { status });
function lessons(row) {
  return columns.flatMap(slot => {
    const code = String(row[slot] || '').trim();
    if (!code) return [];
    const match = /^([^-]+)-(.+)-([^-]+)$/.exec(code);
    return [{ slot, code, subject: classCode(code, true),
      staffCodes: match ? match[1].toUpperCase().split('/').map(value => value.trim()) : [] }];
  });
}
function student(row) {
  return { id: 'k:' + String(row.id_number).trim(), name: String(row.student_name).trim(),
    yearLevel: String(row.year_level || '').trim(), whanau: String(row.form_class || '').trim() };
}
function termRows(payload) {
  if (!payload || !Array.isArray(payload.headers) || !Array.isArray(payload.rows)) {
    throw error('A preserved KAMAR timetable is invalid. Ask an administrator to review Dataset History.', 502);
  }
  const map = buildStudentHeaderMap(payload.headers);
  if (!['student_name', 'id_number', 'year_level'].every(key => [...map.values()].includes(key)) ||
      !columns.some(key => [...map.values()].includes(key))) {
    throw error('A preserved KAMAR timetable has missing columns. Review Dataset History.', 502);
  }
  return payload.rows.map(row => {
    if (!Array.isArray(row) || row.length !== payload.headers.length) {
      throw error('A preserved KAMAR timetable has an invalid row.', 502);
    }
    return mapStudentRow(row, map);
  }).filter(row => row.id_number && row.student_name);
}
function createStudentTrackerService({ dbQuery, directoryQuery, plannerQuery, env = process.env,
  today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()) }) {
  let pool;
  const planner = plannerQuery || ((...args) => {
    if (!pool) {
      const { databaseOptions } = require('./modules/teacherPlanner');
      pool = new Pool(databaseOptions(env));
      pool.on('error', () => console.error('Student Tracker Planner database connection failed.'));
    }
    return pool.query(...args);
  });
  async function timetables(year) {
    const [current, snapshots] = await Promise.all([
      directoryQuery(`SELECT id_number,student_name,year_level,form_class,${columns.join(',')}
        FROM student_upload WHERE status='Current' AND upload_year=$1
        AND NULLIF(TRIM(id_number),'') IS NOT NULL AND NULLIF(TRIM(student_name),'') IS NOT NULL`, [year]),
      directoryQuery(`SELECT DISTINCT ON (term) term,payload FROM kamar_datasets
        WHERE school_year=$1 AND dataset_type='student_timetable'
        ORDER BY term DESC,source_date DESC,source_time DESC,created_at DESC,id DESC`, [year])
    ]);
    return [{ term: null, rows: current.rows }, ...snapshots.rows.map(row => ({ term: row.term, rows: termRows(row.payload) }))];
  }
  async function staffRows() {
    return (await directoryQuery(`SELECT upper(trim(code)) AS code,lower(trim(email_school)) AS email,
      first_name,last_name FROM staff_upload WHERE status='Current'`)).rows;
  }
  async function scope(user, year) {
    const [departments, staff, tables] = await Promise.all([
      dbQuery('SELECT id,name,manager_ids,subjects,revision FROM student_tracker_departments ORDER BY name'),
      staffRows(),
      timetables(year)
    ]);
    const staffCodes = staff.filter(row => row.email === user.email.trim().toLowerCase()).map(row => row.code);
    const taught = new Set(tables.flatMap(table => table.rows.flatMap(row => lessons(row)))
      .filter(lesson => lesson.staffCodes.some(code => staffCodes.includes(code))).map(lesson => lesson.subject));
    const admin = user.roles.includes('ADMIN');
    const visible = departments.rows.filter(department => admin || department.manager_ids.includes(user.id) ||
      department.subjects.some(subject => taught.has(subject)));
    return { admin, departments: visible, tables, staff };
  }
  function departmentFor(context, id) {
    const department = context.departments.find(item => item.id === id);
    if (!department) throw error('You do not have access to this Tracker department.', 403);
    return department;
  }
  function selectedStudent(context, department, id) {
    if (typeof id !== 'string' || !/^k:[A-Za-z0-9_-]{1,60}$/.test(id)) throw error('Choose a valid student.');
    const rows = context.tables.flatMap(table => table.rows.filter(row => student(row).id === id)
      .map(row => ({ ...table, row })));
    if (!rows.some(item => lessons(item.row).some(lesson => department.subjects.includes(lesson.subject)))) {
      throw error('This student is not enrolled in the linked subjects for this department and year.', 404);
    }
    return rows;
  }
  async function owners(context) {
    const emails = [...new Set(context.staff.map(row => row.email).filter(Boolean))];
    const users = (await dbQuery(`SELECT id::text,email,display_name FROM users
      WHERE is_active=true AND lower(trim(email))=ANY($1::text[])`, [emails])).rows;
    return users.flatMap(user => {
      const matching = users.filter(item => item.email.trim().toLowerCase() === user.email.trim().toLowerCase());
      if (matching.length !== 1) return [];
      return [{ ...user, codes: context.staff.filter(row => row.email === user.email.trim().toLowerCase()).map(row => row.code) }];
    });
  }
  function teaches(owner, row, department) {
    return lessons(row).some(lesson => department.subjects.includes(lesson.subject) &&
      lesson.staffCodes.some(code => owner.codes.includes(code)));
  }
  async function run(user, input) {
    if (!user?.roles?.some(role => ['ADMIN', 'Teacher'].includes(role))) throw error('Staff access is required.', 403);
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw error('Invalid Student Tracker request.');
    const { action, year } = input;
    if (!Number.isInteger(year) || year < 2000 || year > 2100) throw error('Choose a year from 2000 to 2100.');
    if (!['setup', 'save-setup', 'search', 'profile', 'attendance', 'reports'].includes(action)) {
      throw error('Unknown Student Tracker action.');
    }
    if (action === 'save-setup') {
      const { department } = input;
      if (!department || typeof department.name !== 'string' || !department.name.trim() || department.name.length > 100 ||
          !Array.isArray(department.subjects) || department.subjects.length > 100 ||
          !department.subjects.every(value => typeof value === 'string' && /^[A-Z0-9/ _-]{1,100}$/.test(value)) ||
          new Set(department.subjects).size !== department.subjects.length) throw error('Check the department name and linked subject codes.');
      if (department.id && (typeof department.id !== 'string' || !UUID.test(department.id))) throw error('Invalid department.');
      const existing = department.id ? (await dbQuery('SELECT * FROM student_tracker_departments WHERE id=$1',
        [department.id])).rows[0] : null;
      if (department.id && !existing) throw error('The department no longer exists. Reload setup.', 404);
      const admin = user.roles.includes('ADMIN');
      if (!admin && !existing?.manager_ids.includes(user.id)) throw error('Only Global ADMIN or an authorised department HoLA can change this setup.', 403);
      const choices = await loadDepartments(dbQuery, await staffRows());
      if (!choices.some(item => item.name === department.name.trim()) && department.name.trim() !== existing?.name) {
        throw error('Choose a department from Kamar Uploader. Reload setup if the directory has changed.');
      }
      const managers = admin ? department.managerIds : existing.manager_ids;
      if (!Array.isArray(managers) || managers.length > 30 || !managers.every(id => typeof id === 'string' && UUID.test(id)) ||
          new Set(managers).size !== managers.length) throw error('Choose valid HoLA accounts.');
      if (admin && managers.length) {
        const active = (await dbQuery('SELECT id FROM users WHERE is_active=true AND id=ANY($1::uuid[])', [managers])).rows;
        if (active.length !== managers.length) throw error('Choose active HoLA accounts.');
      }
      const observed = new Set((await timetables(year)).flatMap(table => table.rows.flatMap(row => lessons(row).map(lesson => lesson.subject))));
      if (department.subjects.some(subject => !observed.has(subject) && !existing?.subjects.includes(subject))) {
        throw error('Choose subject codes from the uploaded KAMAR timetables.');
      }
      if (existing) {
        if (!Number.isInteger(department.revision)) throw error('Reload setup before saving.', 409);
        const result = await dbQuery(`UPDATE student_tracker_departments SET name=$2,subjects=$3,manager_ids=$4,
          revision=revision+1,updated_by=$5,updated_at=NOW() WHERE id=$1 AND revision=$6 RETURNING id`,
        [existing.id, department.name.trim(), department.subjects, managers, user.id, department.revision]);
        if (!result.rows.length) throw error('Department setup changed in another window. Reload before saving.', 409);
      } else {
        await dbQuery(`INSERT INTO student_tracker_departments(name,subjects,manager_ids,updated_by) VALUES($1,$2,$3,$4)`,
          [department.name.trim(), department.subjects, managers, user.id]);
      }
      return { saved: true };
    }
    const context = await scope(user, year);
    if (action === 'setup') {
      const subjects = [...new Set(context.tables.flatMap(table => table.rows.flatMap(row => lessons(row).map(lesson => lesson.subject))))].sort();
      const [departmentOptions, users] = await Promise.all([
        loadDepartments(dbQuery, context.staff),
        context.admin ? dbQuery('SELECT id::text,display_name FROM users WHERE is_active=true ORDER BY display_name')
          .then(result => result.rows) : Promise.resolve([])
      ]);
      return { admin: context.admin, subjects, users, departmentOptions, departments: context.departments.map(item => ({
        id: item.id, name: item.name, subjects: item.subjects, revision: item.revision,
        canManage: context.admin || item.manager_ids.includes(user.id),
        ...(context.admin ? { managerIds: item.manager_ids } : {})
      })) };
    }
    const department = departmentFor(context, input.departmentId);
    if (action === 'search') {
      if (typeof input.q !== 'string' || input.q.trim().length < 2 || input.q.length > 100) throw error('Enter at least two characters of the student name.');
      const found = new Map();
      for (const table of context.tables) for (const row of table.rows) {
        const item = student(row);
        if (!item.name.toLowerCase().includes(input.q.trim().toLowerCase()) ||
            !lessons(row).some(lesson => department.subjects.includes(lesson.subject))) continue;
        if (!found.has(item.id)) found.set(item.id, item);
      }
      const students = [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
      return { students: students.slice(0, 50), truncated: students.length > 50 };
    }
    const rows = selectedStudent(context, department, input.studentId);
    if (action === 'profile') {
      return { student: student(rows[0].row), timetables: rows.map(item => ({
        term: item.term, lessons: lessons(item.row).map(lesson => ({
          slot: lesson.slot, code: lesson.code, subject: lesson.subject, linked: department.subjects.includes(lesson.subject)
        }))
      })), availableTerms: rows.filter(item => item.term !== null).map(item => item.term) };
    }
    const teachers = (await owners(context)).filter(owner => rows.some(item => teaches(owner, item.row, department)));
    const ids = teachers.map(owner => owner.id);
    if (action === 'reports') {
      const records = ids.length ? (await planner(`SELECT owner_id::text,content,updated_at FROM planner_sections
        WHERE owner_id=ANY($1::uuid[]) AND year=$2 AND section='reporting' AND entry_key='main' ORDER BY updated_at DESC`,
      [ids, year])).rows : [];
      const reports = records.flatMap(record => {
        if (!reporting.validContent(record.content)) throw error('A Planner reporting draft is invalid. Ask its teacher to review it.', 502);
        const owner = teachers.find(teacher => teacher.id === record.owner_id);
        const relevant = rows.filter(item => lessons(item.row).some(lesson => /DTECH/.test(lesson.subject) &&
          department.subjects.includes(lesson.subject) && lesson.staffCodes.some(code => owner.codes.includes(code))));
        return JSON.parse(record.content.records).filter(row => row.studentId === input.studentId &&
          relevant.some(item => reporting.programmes[row.programme].years.includes(String(item.row.year_level)))).map(row => ({
          teacher: owner.display_name, updatedAt: record.updated_at, year, ...row, studentId: undefined
        }));
      });
      return { reports, notice: 'Teacher Planner private draft judgements shared with authorised department staff. Not official published KAMAR reports. Current Reporting supports JuniorDTECH and MiddleDTECH only.' };
    }
    if (action === 'attendance') {
      const settings = (await planner('SELECT content FROM school_planner_settings WHERE year=$1', [year])).rows[0]?.content;
      const dates = [1, 2, 3, 4].map(term => ({ term, start: settings?.['term' + term + 'Start'], end: settings?.['term' + term + 'End'] }));
      const localDate = today();
      const currentTerm = dates.find(range => range.start && range.end && range.start <= localDate && range.end >= localDate)?.term;
      const term = input.term ?? currentTerm ?? dates.filter(range => range.start && range.end && range.end < localDate)
        .sort((a, b) => b.end.localeCompare(a.end))[0]?.term;
      if (!Number.isInteger(term) || term < 1 || term > 4) throw error('Choose a term from 1 to 4 and publish its dates in Kamar Uploader.');
      const start = settings?.['term' + term + 'Start'], end = settings?.['term' + term + 'End'];
      if (!start || !end) throw error('Publish school term dates in Kamar Uploader before viewing term attendance.', 409);
      const snapshot = rows.find(item => item.term === term);
      const row = snapshot?.row || (term === currentTerm ? rows.find(item => item.term === null)?.row : null);
      if (!row) throw error('No preserved timetable for this student and term. Upload it through Kamar Uploader Dataset History first.', 404);
      const marks = ids.length ? (await planner(`SELECT owner_id::text,to_char(lesson_date,'YYYY-MM-DD') AS date,period,mark
        FROM planner_attendance_marks WHERE owner_id=ANY($1::uuid[]) AND student_id=$2 AND year=$3
        AND lesson_date BETWEEN $4::date AND $5::date AND mark<>'' ORDER BY lesson_date,period,owner_id`,
      [ids, input.studentId, year, start, end])).rows : [];
      const allowed = lessons(row).filter(lesson => department.subjects.includes(lesson.subject));
      return { term, timetableSource: snapshot ? 'Preserved term timetable' : 'Current uploaded timetable (current term only)',
        startDate: start, endDate: end, marks: marks.flatMap(mark => {
        const owner = teachers.find(item => item.id === mark.owner_id);
        const day = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date(mark.date + 'T00:00:00Z').getUTCDay()];
        const matching = allowed.filter(lesson => lesson.slot.replace(/_[12]$/, '') === day + '_' + mark.period &&
          lesson.staffCodes.some(code => owner.codes.includes(code)));
        return [...new Set(matching.map(lesson => lesson.subject))].map(subject => ({
          date: mark.date, period: mark.period, mark: mark.mark, subject, teacher: owner.display_name
        }));
      }), notice: 'Saved Teacher Planner teaching-log marks, not the official KAMAR register. Missing entries are not recorded, not present. No attendance percentage is inferred.' };
    }
    throw error('Unknown Student Tracker action.');
  }
  return { run };
}
module.exports = { createStudentTrackerService, lessons, termRows };
