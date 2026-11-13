const { Pool } = require('pg');
const { buildStudentHeaderMap, mapStudentRow } = require('./legacy/kamar-uploader/studentTimetable');
const { classCode } = require('./legacy/teacher-planner/public/attendance');
const reporting = require('./legacy/teacher-planner/public/reporting-schema');
const { loadDepartments, normaliseDirectoryName } = require('./legacy/kamar-uploader/departments');
const { JUNIOR_DTECH_CLASS_CODES } = require('./legacy/dtech-hub/learning-sites-assessment');

const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const columns = ['mon', 'tue', 'wed', 'thu', 'fri']
  .flatMap(day => ['p1_1', 'p1_2', 'p2', 'p3', 'p4', 'p5'].map(period => day + '_' + period));
const error = (message, status = 400) => Object.assign(new Error(message), { status });
const technologyPrograms = new Set(['DTECH', 'COMP', 'DVC', 'FOOD', 'TEXTILES', 'WOOD']);
function matchingCourses(code, courses) {
  const normal = value => value.toUpperCase().replace(/[\s_-]/g, '');
  const value = normal(code);
  return courses.filter(course => {
    if (JUNIOR_DTECH_CLASS_CODES.test(code) && course.course_code.toUpperCase() === 'JDTECH') return true;
    const base = normal(course.course_code.replace(/-S[12]$/i, ''));
    const candidate = /^[78]/.test(value) ? value.replace(/^[78]J?/, 'J') :
      /^(9|10)/.test(value) ? value.replace(/^(9|10)M?/, 'M') : value;
    const source = normal(course.course_code);
    return [source, base].some(target => candidate.startsWith(target) &&
      /^(?:\d+[A-Z]?|[A-Z]\d*)?$/.test(candidate.slice(target.length)));
  });
}
async function approvedTrackerUser(userId, dbQuery) {
  return (await dbQuery(`SELECT u.id,u.email,u.display_name,u.avatar_url,
    ARRAY['Teacher']::text[] AS roles,ARRAY[]::text[] AS module_roles
    FROM users u WHERE u.id=$1 AND u.is_active=true
    AND NOT EXISTS (SELECT 1 FROM modules WHERE module_key='whs-techstudent-tracker' AND is_active=false)
    AND NOT EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id
      WHERE ur.user_id=u.id AND lower(r.name)='student')
    AND EXISTS (SELECT 1 FROM student_tracker_departments d
      WHERE lower(trim(u.email))=ANY(d.teacher_emails))`, [userId])).rows[0];
}
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
  async function leadership(staff) {
    const emails = [...new Set(staff.map(person => person.email).filter(Boolean))];
    const [choices, accounts] = await Promise.all([
      loadDepartments(dbQuery, staff),
      dbQuery(`SELECT u.id::text,u.email,u.display_name,
        EXISTS (SELECT 1 FROM user_hub_roles ur JOIN hub_roles r ON r.id=ur.hub_role_id
          WHERE ur.user_id=u.id AND ur.area_key IS NULL
          AND r.hub_key='whs-techstudent-tracker' AND r.role_key='lead-teacher') AS lead_teacher,
        EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id
          WHERE ur.user_id=u.id AND lower(r.name)='student') AS student_account
        FROM users u WHERE u.is_active=true AND lower(trim(u.email))=ANY($1::text[])
        ORDER BY u.display_name`, [emails])
    ]);
    const staffAccounts = accounts.rows.flatMap(account => {
      const email = account.email.trim().toLowerCase();
      const matches = staff.filter(person => person.email === email);
      if (account.student_account || matches.length !== 1 ||
          accounts.rows.filter(other => other.email.trim().toLowerCase() === email).length !== 1) return [];
      return [{ ...account, staff: matches[0] }];
    });
    const verified = staffAccounts.flatMap(account => {
      if (!account.lead_teacher) return [];
      const person = account.staff, name = normaliseDirectoryName([person.first_name, person.last_name].filter(Boolean).join(' '));
      if (!person.code || !name || name !== normaliseDirectoryName(account.display_name) ||
          staff.filter(other => other.code === person.code).length !== 1) return [];
      return [{ id: account.id, display_name: account.display_name, staffCode: person.code, staffEmail: person.email }];
    });
    const departmentOptions = choices.map(choice => {
      const leader = choice.leaders.find(item => item.name === choice.teacher && !item.onLeave &&
        ['HOL', 'HOLA'].includes(item.role) && item.source && item.reviewedOn && item.staffCode);
      return { ...choice, managerIds: leader ? verified.filter(person => person.staffCode === leader.staffCode).map(person => person.id) : [] };
    });
    const ids = new Set(departmentOptions.flatMap(choice => choice.managerIds));
    const candidates = staff.filter(person => person.email && person.code &&
      staff.filter(other => other.email === person.email).length === 1 &&
      staff.filter(other => other.code === person.code).length === 1 &&
      accounts.rows.filter(account => account.email.trim().toLowerCase() === person.email).length <= 1 &&
      !accounts.rows.some(account => account.email.trim().toLowerCase() === person.email && account.student_account))
      .map(person => ({ email: person.email, code: person.code,
        name: [person.first_name, person.last_name].filter(Boolean).join(' ').trim() }))
      .filter(person => person.name).sort((a, b) => a.name.localeCompare(b.name));
    return { departmentOptions, candidates, verified, staffIds: staffAccounts.map(account => account.id), users: verified.filter(person => ids.has(person.id))
      .map(({ id, display_name }) => ({ id, display_name })) };
  }
  function managersFor(leadership, name) {
    return leadership.departmentOptions.find(choice => normaliseDirectoryName(choice.name) === normaliseDirectoryName(name))?.managerIds || [];
  }
  function automaticTeachers(leaders, name) {
    const ids = managersFor(leaders, name);
    return leaders.verified.filter(person => ids.includes(person.id)).map(person => person.staffEmail);
  }
  async function teacherLinks(staff, year) {
    const [current, history, catalogue] = await Promise.all([
      directoryQuery("SELECT teacher,data FROM timetable_upload WHERE status='Current' AND upload_year=$1", [year]),
      directoryQuery(`SELECT DISTINCT ON(term) term,payload FROM kamar_datasets
        WHERE school_year=$1 AND dataset_type='teacher_timetable'
        ORDER BY term DESC,source_date DESC,source_time DESC,created_at DESC,id DESC`, [year]),
      dbQuery(`SELECT c.course_code,c.subject_code FROM admin_courses c
        JOIN admin_subjects s ON s.code=c.subject_code WHERE c.is_active=true ORDER BY c.course_code`)
    ]);
    const rows = current.rows.map(row => {
      if (!row.data || typeof row.data !== 'object' || Array.isArray(row.data)) throw error('An uploaded teacher timetable is invalid. Review Kamar Uploader.', 502);
      return { teacher: row.teacher, headers: Object.keys(row.data), values: Object.values(row.data) };
    });
    for (const snapshot of history.rows) {
      const { headers, rows: values } = snapshot.payload || {};
      if (!Array.isArray(headers) || !Array.isArray(values)) throw error('A preserved teacher timetable is invalid. Review Kamar Uploader Dataset History.', 502);
      const index = headers.findIndex(header => ['teacher', 'teachercode', 'staffcode', 'code'].includes(String(header).toLowerCase().replace(/[^a-z0-9]/g, '')));
      if (index < 0) throw error('A preserved teacher timetable has no teacher code.', 502);
      for (const value of values) {
        if (!Array.isArray(value) || value.length !== headers.length) throw error('A preserved teacher timetable row is invalid.', 502);
        rows.push({ teacher: value[index], headers, values: value });
      }
    }
    const courses = catalogue.rows.filter(course => technologyPrograms.has(course.subject_code.toUpperCase()));
    return staff.map(person => {
      const mine = rows.filter(row => String(row.teacher).trim().toUpperCase().split('/').map(code => code.trim()).includes(person.code));
      const codes = new Set();
      for (const row of mine) {
        const map = buildStudentHeaderMap(row.headers);
        const indexes = row.headers.flatMap((header, index) => columns.includes(map.get(index)) ||
          /^d[1-5]p[1-5](?:[12])?$/.test(String(header).toLowerCase().replace(/[^a-z0-9]/g, '')) ? [index] : []);
        if (!indexes.length) throw error('A teacher timetable has no recognised period columns. Review Kamar Uploader.', 502);
        for (const index of indexes) {
          let value = String(row.values[index] || '').trim().toUpperCase();
          if (!value) continue;
          const prefix = value.slice(0, value.indexOf('-'));
          if (prefix && prefix.split('/').every(code => staff.some(item => item.code === code))) value = value.slice(value.indexOf('-') + 1);
          const exactCourse = courses.some(course => course.course_code.toUpperCase() === value);
          if (!exactCourse && value.includes('-')) value = value.slice(0, value.lastIndexOf('-'));
          if (value) codes.add(value);
        }
      }
      return { ...person, timetableAvailable: mine.length > 0, links: [...codes].sort().flatMap(code => {
        const matches = matchingCourses(code, courses);
        return matches.length ? [{ code, courses: matches.map(course => course.course_code),
          programmes: [...new Set(matches.map(course => course.subject_code.toUpperCase()))], department: 'Technology' }] : [];
      }), unmatchedCodes: [...codes].filter(code => !matchingCourses(code, courses).length).sort() };
    });
  }
  function linkedSubjects(staff, name, emails) {
    return [...new Set(staff.filter(person => emails.includes(person.email)).flatMap(person =>
      person.links.filter(link => normaliseDirectoryName(link.department) === normaliseDirectoryName(name)).map(link => link.code)))].sort();
  }
  function validateTeachers(emails, candidates) {
    if (!Array.isArray(emails) || emails.length > 100 || new Set(emails).size !== emails.length ||
        !emails.every(email => typeof email === 'string' && candidates.some(person => person.email === email))) {
      throw error('Choose current staff from the teacher list. Students and ambiguous staff records cannot be authorised.');
    }
  }
  async function scope(user, year) {
    const [departments, staff, tables] = await Promise.all([
      dbQuery('SELECT id,name,manager_ids,subjects,revision,teacher_emails FROM student_tracker_departments ORDER BY name'),
      staffRows(),
      timetables(year)
    ]);
    const leaders = await leadership(staff);
    if (!user.roles.includes('ADMIN') && !leaders.staffIds.includes(user.id)) {
      throw error('Student Tracker is staff-only. Your account must match one current KAMAR staff record and must not be a student account.', 403);
    }
    const candidates = await teacherLinks(leaders.candidates, year);
    const admin = user.roles.includes('ADMIN');
    const visible = departments.rows.map(department => {
      const automatic = automaticTeachers(leaders, department.name);
      const approved = (department.teacher_emails || []).filter(email => candidates.some(person => person.email === email));
      const teacherEmails = [...new Set([...automatic, ...approved])];
      return { ...department, teacher_emails: approved, teacherEmails, manager_ids: managersFor(leaders, department.name),
        subjects: linkedSubjects(candidates, department.name, teacherEmails) };
    }).filter(department => admin || department.manager_ids.includes(user.id) || department.teacherEmails.includes(user.email.trim().toLowerCase()));
    return { admin, departments: visible, tables, staff, ...leaders, candidates };
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
          !Array.isArray(department.teacherEmails)) throw error('Choose a department and its authorised teachers.');
      if (department.id && (typeof department.id !== 'string' || !UUID.test(department.id))) throw error('Invalid department.');
      const existing = department.id ? (await dbQuery('SELECT * FROM student_tracker_departments WHERE id=$1',
        [department.id])).rows[0] : null;
      if (department.id && !existing) throw error('The department no longer exists. Reload setup.', 404);
      const admin = user.roles.includes('ADMIN');
      const leaders = await leadership(await staffRows());
      if (!admin && (!existing || !managersFor(leaders, existing.name).includes(user.id))) {
        throw error('Only Global ADMIN or a verified website HoLA with the Student Tracker Lead Teacher role can change this setup.', 403);
      }
      if (!leaders.departmentOptions.some(item => item.name === department.name.trim()) && department.name.trim() !== existing?.name) {
        throw error('Choose a department from Kamar Uploader. Reload setup if the directory has changed.');
      }
      const managers = managersFor(leaders, department.name.trim());
      if (!admin && !managers.includes(user.id)) throw error('You cannot move this setup to a department you do not lead.', 403);
      if (department.managerIds !== undefined && (!Array.isArray(department.managerIds) ||
          department.managerIds.length !== managers.length || !managers.every(id => department.managerIds.includes(id)))) {
        throw error('HoLA access is automatic from verified staff, Lead Teacher roles and website leadership. Reload setup; manual assignments are not accepted.');
      }
      validateTeachers(department.teacherEmails, leaders.candidates);
      const automatic = automaticTeachers(leaders, department.name);
      const teachers = department.teacherEmails.filter(email => !automatic.includes(email));
      const sources = await teacherLinks(leaders.candidates, year);
      const subjects = linkedSubjects(sources, department.name, [...teachers, ...automatic]);
      if (department.subjects !== undefined && (!Array.isArray(department.subjects) ||
          JSON.stringify([...department.subjects].sort()) !== JSON.stringify(subjects))) {
        throw error('Subject codes are matched automatically from authorised teachers and Learning Site courses. Reload setup before saving.');
      }
      if (existing) {
        if (!Number.isInteger(department.revision)) throw error('Reload setup before saving.', 409);
        const result = await dbQuery(`UPDATE student_tracker_departments SET name=$2,subjects=$3,manager_ids=$4,
          teacher_emails=$7,revision=revision+1,updated_by=$5,updated_at=NOW() WHERE id=$1 AND revision=$6 RETURNING id`,
        [existing.id, department.name.trim(), subjects, managers, user.id, department.revision, teachers]);
        if (!result.rows.length) throw error('Department setup changed in another window. Reload before saving.', 409);
      } else {
        await dbQuery(`INSERT INTO student_tracker_departments(name,subjects,manager_ids,updated_by,teacher_emails) VALUES($1,$2,$3,$4,$5)`,
          [department.name.trim(), subjects, managers, user.id, teachers]);
      }
      return { saved: true };
    }
    const context = await scope(user, year);
    if (action === 'setup') {
      const manageable = context.admin || context.departments.some(item => item.manager_ids.includes(user.id));
      return { admin: context.admin, staff: manageable ? context.candidates : [], users: context.users,
        departmentOptions: context.departmentOptions.map(choice => ({ ...choice,
          canManage: context.admin || choice.managerIds.includes(user.id), automaticTeachers: automaticTeachers(context, choice.name) })),
        automaticHolaAccess: true, teacherApprovalAccess: true, departments: context.departments.map(item => ({
        id: item.id, name: item.name, subjects: item.subjects, revision: item.revision,
        canManage: context.admin || item.manager_ids.includes(user.id),
        managerIds: item.manager_ids, teacherEmails: manageable ? item.teacher_emails : [],
        teacherNames: context.candidates.filter(person => item.teacherEmails.includes(person.email)).map(person => person.name)
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
    const teachers = (await owners(context)).filter(owner => department.teacherEmails.includes(owner.email.trim().toLowerCase()) &&
      rows.some(item => teaches(owner, item.row, department)));
    const ids = teachers.map(owner => owner.id);
    if (action === 'reports') {
      const records = ids.length ? (await planner(`SELECT owner_id::text,content,updated_at FROM planner_sections
        WHERE owner_id=ANY($1::uuid[]) AND year=$2 AND section='reporting' AND entry_key='main' ORDER BY updated_at DESC`,
      [ids, year])).rows : [];
      const reports = records.flatMap(record => {
        if (!reporting.validContent(record.content)) throw error('A Planner reporting draft is invalid. Ask its teacher to review it.', 502);
        const owner = teachers.find(teacher => teacher.id === record.owner_id);
        const dtechCodes = context.candidates.filter(person => person.email === owner.email.trim().toLowerCase())
          .flatMap(person => person.links.filter(link => link.programmes.includes('DTECH')).map(link => link.code));
        const relevant = rows.filter(item => lessons(item.row).some(lesson => dtechCodes.includes(lesson.subject) &&
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
module.exports = { createStudentTrackerService, lessons, termRows, approvedTrackerUser, matchingCourses };
