const { Pool } = require('pg');
const { buildStudentHeaderMap, mapStudentRow } = require('./legacy/kamar-uploader/studentTimetable');
const { classCode } = require('./legacy/teacher-planner/public/attendance');
const reporting = require('./legacy/teacher-planner/public/reporting-schema');
const { loadDepartments, normaliseDirectoryName } = require('./legacy/kamar-uploader/departments');
const { JUNIOR_DTECH_CLASS_CODES } = require('./legacy/dtech-hub/learning-sites-assessment');
const { loadCalendarYear, deriveTermDates } = require('./legacy/teacher-planner/kamarCalendar');
const { loadLearningSiteUnits } = require('./learningSiteUnits');

const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const columns = ['mon', 'tue', 'wed', 'thu', 'fri']
  .flatMap(day => ['p1_1', 'p1_2', 'p2', 'p3', 'p4', 'p5'].map(period => day + '_' + period));
const error = (message, status = 400) => Object.assign(new Error(message), { status });
const technologyPrograms = new Set(['DTECH', 'COMP', 'DVC', 'FOOD', 'TEXTILES', 'WOOD']);
const disciplineGroups = [
  { id: 'digital_technologies', label: 'Digital Technologies', subjects: ['DTECH', 'COMP', 'DTONLINE', 'MPROG', 'TECH'] },
  { id: 'textiles', label: 'Textiles', subjects: ['TEXTILES'] },
  { id: 'food_hospitality', label: 'Food & Hospitality', subjects: ['FOOD', 'HOSP'] },
  { id: 'wood_furniture', label: 'Wood & Furniture', subjects: ['WOOD'] },
  { id: 'dvc', label: 'Design Visual Communication', subjects: ['DVC'] }
];
const days = ['mon', 'tue', 'wed', 'thu', 'fri'];
const classGroup = /^(?:\d+|\d{1,2}[A-Z]|J[A-Z]{2}|MTR)$/;
const seniorSubject = /^(?:11|12|13)(?:DTECH|COMP)$/;
function seniorLine(code) {
  return /^(\d+|JSR)-(?:11|12|13|SR)(?:DTECH|COMP)$/.exec(code)?.[1];
}
function subjectCode(code) {
  const parts = code.split('-');
  const grouped = classGroup.test(parts[0]) ||
    (parts.length > 1 && /^\d{1,2}[A-Z]+$/.test(parts[0]) && /^\d/.test(parts[1]));
  return parts.length > 1 && grouped ? parts.slice(1).join('-') : code;
}
function subjectFamily(code) {
  let subject = subjectCode(code);
  const junior = /^J([A-Z]{2})-/.exec(code);
  const prefix = junior?.[1] || (code.startsWith('MTR-') ? 'MTR' : null);
  if (prefix && subject.startsWith(prefix)) subject = subject.slice(prefix.length);
  subject = subject.replace(/-/g, '');
  if (subject === 'HOSPCOOK') return 'FOOD';
  const technology = /(DTECH|COMP|DVC|FOOD|HOSP|TEXT|WOOD|FURN)\d*[A-Z]?$/.exec(subject);
  if (technology) return { HOSP: 'FOOD', TEXT: 'TEXTILES', FURN: 'WOOD' }[technology[1]] || technology[1];
  return subject.replace(/^\d+/, '').replace(/\d+[A-Z]?$/, '') || subject;
}
function discipline(code) {
  const subject = subjectCode(code).replace(/-/g, '');
  if (subject.includes('HOSP')) return 'HOSP';
  return subjectFamily(code);
}
function linkDisciplines(code, department) {
  const family = discipline(code);
  return normaliseDirectoryName(department.name) === normaliseDirectoryName('Technology') && seniorLine(code)
    ? ['DTECH', 'COMP'] : [...new Set([family, discipline(subjectCode(code))])];
}
function sortedDisciplines(disciplines) {
  const order = ['DTECH', 'COMP', 'DVC', 'FOOD', 'HOSP', 'TEXTILES', 'WOOD', 'DTONLINE'];
  return [...disciplines].sort((a, b) => {
    const first = order.indexOf(a), second = order.indexOf(b);
    return (first < 0 ? order.length : first) - (second < 0 ? order.length : second) || a.localeCompare(b);
  });
}
function departmentDisciplineGroups(subjects) {
  return disciplineGroups.filter(group => group.subjects.some(subject => subjects.has(subject)));
}
function teacherClassCodes(value, staff, courses) {
  const codes = [], excluded = [];
  const hospCook = { studentIds: [], unrestricted: false };
  for (const cell of String(value || '').toUpperCase().split(/[;\r\n]+/)) {
    let code = cell.trim();
    if (!code) continue;
    const prefix = code.slice(0, code.indexOf('-'));
    if (prefix && prefix.split('/').every(part => staff.some(person => person.code === part.trim()))) code = code.slice(code.indexOf('-') + 1);
    const cooking = /^(?:(\d+)-)?HOSPCOOK(?:-[A-Z0-9]*)?$/.exec(code.replace(/^-+/, ''));
    if (cooking) {
      codes.push('HOSPCOOK');
      if (cooking[1]) hospCook.studentIds.push(cooking[1]);
      else hospCook.unrestricted = true;
      continue;
    }
    const emptyGroup = /^-([A-Z0-9]+)(?:-[A-Z0-9]*)?$/.exec(code);
    if (emptyGroup && courses.some(course => course.course_code.toUpperCase() === emptyGroup[1])) code = code.slice(1);
    const parts = code.split('-');
    const exact = courses.some(course => course.course_code.toUpperCase() === code);
    if (!exact && (parts.length > 2 || (parts.length === 2 &&
        (!classGroup.test(parts[0]) || !/[A-Z]/.test(parts[1]))))) code = parts.slice(0, -1).join('-');
    if (!/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(code) || !/[A-Z]/.test(code) ||
        /(?:^|-)(?:WHANAU|HAPU|ASSEMBLY|HUI|FREE|DUTY|(?:\d+)?STUDY[A-Z0-9]*)(?:-|$)/.test(code)) {
      excluded.push(cell.trim()); continue;
    }
    codes.push(code);
  }
  return { codes, excluded, hospCook };
}
function savedClassLinks(department, year) {
  const stored = department.class_links || {};
  if (typeof stored !== 'object' || Array.isArray(stored) || Object.values(stored).some(links =>
    !Array.isArray(links) || links.some(link => !link || typeof link.teacherEmail !== 'string' || typeof link.code !== 'string'))) {
    throw error('Stored class links are invalid. Ask an administrator to review Student Tracker setup.', 502);
  }
  return year === undefined ? stored : stored[String(year)] || [];
}
function mixedSeniorLesson(department, link, lesson) {
  return normaliseDirectoryName(department.name) === normaliseDirectoryName('Technology') &&
    seniorLine(link.code) && seniorSubject.test(lesson.subject);
}
function possibleLinkedLesson(department, link, lesson) {
  if (mixedSeniorLesson(department, link, lesson)) {
    return lesson.classCode === lesson.subject || seniorLine(lesson.classCode) === seniorLine(link.code);
  }
  return subjectCode(link.code) === lesson.subject &&
    (lesson.classCode === lesson.subject || lesson.classCode === link.code);
}
function lessonSourceMatches(link, lesson, term) {
  return link.sources.some(source => source.term === term && source.slot === lesson.slot &&
    (!source.studentIds || source.unrestricted || source.studentIds.includes(lesson.studentId)));
}
function seniorLessonMatch(department, link, lesson, term, allowCombined) {
  const line = seniorLine(link.code);
  if (!mixedSeniorLesson(department, link, lesson) || !lesson.staffCodes.includes(link.staffCode) ||
      !lessonSourceMatches(link, lesson, term)) return null;
  if (lesson.classCode !== lesson.subject) return seniorLine(lesson.classCode) === line ? 'matched' : null;
  if (link.seniorAmbiguousSources.some(source => source.term === term && source.slot === lesson.slot)) {
    return allowCombined && !link.seniorUnselectedSources.some(source => source.term === term && source.slot === lesson.slot)
      ? 'matched' : 'ambiguous';
  }
  return 'matched';
}
function linkedLessonMatch(department, link, lesson, term) {
  if (mixedSeniorLesson(department, link, lesson)) return seniorLessonMatch(department, link, lesson, term, true);
  if (link.subject !== lesson.subject || (lesson.classCode !== lesson.subject && link.code !== lesson.classCode) ||
      !lesson.staffCodes.includes(link.staffCode) || !lessonSourceMatches(link, lesson, term)) return null;
  return lesson.classCode === lesson.subject && link.ambiguousSources.some(other => other.term === term && other.slot === lesson.slot)
    ? 'ambiguous' : 'matched';
}
function linkedLesson(department, lesson, term = null, owner) {
  return department.classLinks.some(link => (!owner || owner.codes.includes(link.staffCode)) &&
    linkedLessonMatch(department, link, lesson, term) === 'matched');
}
function classLessonMatch(department, lesson, term, code) {
  const senior = department.classLinks.filter(link => link.code === code)
    .map(link => seniorLessonMatch(department, link, lesson, term, false));
  if (senior.includes('matched')) return 'matched';
  if (senior.includes('ambiguous')) return 'ambiguous';
  const links = department.classLinks.filter(link => !mixedSeniorLesson(department, link, lesson) &&
    link.subject === lesson.subject &&
    lesson.staffCodes.includes(link.staffCode) && lessonSourceMatches(link, lesson, term));
  if (lesson.classCode !== lesson.subject) {
    return lesson.classCode === code && links.some(link => link.code === code) ? 'matched' : null;
  }
  const selected = links.filter(link => link.code === code);
  if (!selected.length) return null;
  if (new Set(links.map(link => link.code)).size > 1 || selected.some(link =>
    link.ambiguousSources.some(source => source.term === term && source.slot === lesson.slot))) return 'ambiguous';
  return 'matched';
}
function matchingCourses(code, courses) {
  const normal = value => value.toUpperCase().replace(/[\s_-]/g, '');
  const raw = code.toUpperCase();
  const junior = /^J(PI|SR|SD|MM|VE)-\1(DTECH|FOOD|WOOD)$/.exec(raw);
  const bareJuniorDtech = !raw.includes('-') && JUNIOR_DTECH_CLASS_CODES.test(raw);
  code = subjectCode(code);
  const value = normal(code);
  return courses.filter(course => {
    if ((bareJuniorDtech || junior?.[2] === 'DTECH') && course.course_code.toUpperCase() === 'JDTECH') return true;
    if (junior?.[2] === 'FOOD' && course.course_code.toUpperCase() === 'JFOOD') return true;
    if (junior?.[2] === 'WOOD' && course.course_code.toUpperCase() === 'JWOOD') return true;
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
  return columns.flatMap(slot => String(row[slot] || '').split(/[;\r\n]+/).flatMap(value => {
    const code = value.trim();
    if (!code) return [];
    const match = /^([^-]+)-(.+)-([^-]*)$/.exec(code);
    const rawClass = match ? classCode(match[2]) : classCode(code, true);
    return [{ slot, code, classCode: rawClass, subject: subjectCode(rawClass),
      studentId: String(row.id_number || '').trim(),
      staffCodes: match ? match[1].toUpperCase().split('/').map(value => value.trim()) : [] }];
  }));
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
  loadKamarTermDates = async year => deriveTermDates((await loadCalendarYear(year)).events, year),
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
      return { teacher: row.teacher, headers: Object.keys(row.data), values: Object.values(row.data), term: null };
    });
    for (const snapshot of history.rows) {
      const { headers, rows: values } = snapshot.payload || {};
      if (!Array.isArray(headers) || !Array.isArray(values)) throw error('A preserved teacher timetable is invalid. Review Kamar Uploader Dataset History.', 502);
      const index = headers.findIndex(header => ['teacher', 'teachercode', 'staffcode', 'code'].includes(String(header).toLowerCase().replace(/[^a-z0-9]/g, '')));
      if (index < 0) throw error('A preserved teacher timetable has no teacher code.', 502);
      for (const value of values) {
        if (!Array.isArray(value) || value.length !== headers.length) throw error('A preserved teacher timetable row is invalid.', 502);
        rows.push({ teacher: value[index], headers, values: value, term: Number(snapshot.term) });
      }
    }
    const courses = catalogue.rows;
    return staff.map(person => {
      const mine = rows.filter(row => String(row.teacher).trim().toUpperCase().split('/').map(code => code.trim()).includes(person.code));
      const classes = new Map(), excluded = new Set();
      for (const row of mine) {
        const map = buildStudentHeaderMap(row.headers);
        const indexes = row.headers.flatMap((header, index) => columns.includes(map.get(index)) ||
          /^d[1-5]p[1-5](?:[12])?$/.test(String(header).toLowerCase().replace(/[^a-z0-9]/g, '')) ? [index] : []);
        if (!indexes.length) throw error('A teacher timetable has no recognised period columns. Review Kamar Uploader.', 502);
        for (const index of indexes) {
          const parsed = teacherClassCodes(row.values[index], staff, courses);
          parsed.excluded.forEach(code => excluded.add(code));
          const numbered = /^d([1-5])p([1-5])(?:[12])?$/.exec(String(row.headers[index]).toLowerCase().replace(/[^a-z0-9]/g, ''));
          const slot = numbered ? days[Number(numbered[1]) - 1] + '_p' + numbered[2] : map.get(index);
          const slots = /_p1(?:_[12])?$/.test(slot) ? [slot.slice(0, 3) + '_p1_1', slot.slice(0, 3) + '_p1_2'] : [slot];
          for (const code of parsed.codes) {
            if (!classes.has(code)) {
              const matches = matchingCourses(code, courses);
              classes.set(code, { code, subject: subjectCode(code), family: subjectFamily(code),
                courses: matches.map(course => course.course_code),
                programmes: [...new Set(matches.map(course => course.subject_code.toUpperCase()))],
                suggestedDepartment: matches.some(course => technologyPrograms.has(course.subject_code.toUpperCase())) ? 'Technology' : null,
                sources: [] });
            }
            const item = classes.get(code);
            slots.forEach(slot => {
              let source = item.sources.find(source => source.term === row.term && source.slot === slot);
              if (!source) {
                source = { term: row.term, slot };
                item.sources.push(source);
              }
              if (code === 'HOSPCOOK') {
                if (!source.studentIds) source.studentIds = [];
                source.unrestricted = source.unrestricted || parsed.hospCook.unrestricted;
                parsed.hospCook.studentIds.forEach(id => {
                  if (!source.studentIds.includes(id)) source.studentIds.push(id);
                });
              }
            });
          }
        }
      }
      const choices = [...classes.values()].sort((a, b) => a.family.localeCompare(b.family) || a.code.localeCompare(b.code, undefined, { numeric: true }));
      return { ...person, timetableAvailable: mine.length > 0, timetableCurrent: mine.some(row => row.term === null),
        timetableTerms: [...new Set(mine.map(row => row.term).filter(term => term !== null))],
        classes: choices, excludedCodes: [...excluded].sort(),
        links: choices.filter(item => item.suggestedDepartment).map(item => ({ ...item, department: item.suggestedDepartment })),
        unmatchedCodes: choices.filter(item => !item.courses.length).map(item => item.code) };
    });
  }
  function availableLinks(staff, emails, links) {
    return links.flatMap(link => {
      const person = staff.find(person => person.email === link.teacherEmail && emails.includes(person.email));
      const lesson = person?.classes.find(item => item.code === link.code);
      if (!lesson) return [];
      const ambiguousSources = lesson.sources.filter(source => person.classes.some(other =>
        other.code !== lesson.code && other.subject === lesson.subject &&
        !links.some(selected => selected.teacherEmail === person.email && selected.code === other.code) &&
        other.sources.some(slot => slot.term === source.term && slot.slot === source.slot)));
      const line = seniorLine(lesson.code);
      const seniorLines = source => person.classes.filter(other => seniorLine(other.code) &&
        other.sources.some(slot => slot.term === source.term && slot.slot === source.slot));
      const seniorAmbiguousSources = line ? lesson.sources.filter(source =>
        seniorLines(source).some(other => seniorLine(other.code) !== line)) : [];
      const seniorUnselectedSources = seniorAmbiguousSources.filter(source => seniorLines(source).some(other =>
        !links.some(selected => selected.teacherEmail === person.email &&
          seniorLine(selected.code) === seniorLine(other.code) && person.classes.some(available =>
            available.code === selected.code && available.sources.some(slot => slot.term === source.term)))));
      return [{ ...link, ...lesson, ambiguousSources, seniorAmbiguousSources, seniorUnselectedSources,
        staffCode: person.code, teacherName: person.name }];
    });
  }
  function validateTeachers(emails, candidates) {
    if (!Array.isArray(emails) || emails.length > 100 || new Set(emails).size !== emails.length ||
        !emails.every(email => typeof email === 'string' && candidates.some(person => person.email === email))) {
      throw error('Choose current staff from the teacher list. Students and ambiguous staff records cannot be authorised.');
    }
  }
  async function learningAreas(user, { year } = {}) {
    if (!user?.roles?.some(role => ['ADMIN', 'Teacher'].includes(role))) throw error('Staff access is required.', 403);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) throw error('Choose a year from 2000 to 2100.');
    const [departments, staff] = await Promise.all([
      dbQuery('SELECT id,name,manager_ids,subjects,revision,teacher_emails,class_links FROM student_tracker_departments ORDER BY name'),
      staffRows()
    ]);
    const leaders = await leadership(staff);
    if (!user.roles.includes('ADMIN') && !leaders.staffIds.includes(user.id)) {
      throw error('Learning Area Profiles are staff-only. Your account must match one current KAMAR staff record and must not be a student account.', 403);
    }
    const candidates = await teacherLinks(leaders.candidates, year);
    const profiles = leaders.departmentOptions.map(choice => {
      const configured = departments.rows.filter(item => normaliseDirectoryName(item.name) === normaliseDirectoryName(choice.name));
      if (configured.length > 1) throw error('Duplicate Tracker department setup. Ask an administrator to review ' + choice.name + '.', 409);
      const department = configured[0];
      const emails = department ? [...new Set([
        ...automaticTeachers(leaders, department.name), ...(department.teacher_emails || [])
      ])].filter(email => candidates.some(person => person.email === email)) : [];
      const saved = department ? savedClassLinks(department, year) : [];
      const links = availableLinks(candidates, emails, saved);
      const leader = choice.leaders.find(item => item.name === choice.teacher && !item.onLeave &&
        ['HOL', 'HOLA'].includes(item.role) && item.source && item.reviewedOn && item.staffCode);
      return {
        id: normaliseDirectoryName(choice.name), name: choice.name,
        leader: leader ? { name: leader.name, staffCode: leader.staffCode, acting: leader.acting,
          role: leader.role, reviewedOn: leader.reviewedOn } : null,
        teachers: candidates.filter(person => emails.includes(person.email))
          .map(person => ({ name: person.name, staffCode: person.code })),
        classes: links.map(link => {
          const subject = discipline(link.code);
          const group = disciplineGroups.find(group => group.subjects.includes(subject));
          return { disciplineId: group?.id || 'subject_' + subject, discipline: group?.label || subject,
            subject, course: link.subject, classCode: link.code, teacher: link.teacherName, staffCode: link.staffCode,
            learningSiteCodes: link.courses,
            sources: [...new Set(link.sources.map(source => source.term))] };
        }),
        warnings: [
          ...(!department ? ['This department has not been configured in Student Tracker; teaching assignments are unavailable.'] : []),
          ...(saved.length > links.length ? ["Some saved class links could not be confirmed against the selected year's staff timetables."] : []),
          ...(department && !saved.length ? ['No teaching groups are linked for this department and school year.'] : [])
        ]
      };
    });
    const learningSites = await loadLearningSiteUnits(profiles.flatMap(profile =>
      profile.classes.flatMap(item => item.learningSiteCodes)), { dbQuery });
    return { year, departments: profiles, learningSites,
      notice: 'Department leadership comes from the reviewed shared directory. Teaching groups use approved Student Tracker class links and KAMAR staff timetables for the selected year. Learning Site units reflect listed content only; missing listings are not generated. No student records are included.' };
  }
  async function scope(user, year) {
    const [departments, staff, tables] = await Promise.all([
      dbQuery('SELECT id,name,manager_ids,subjects,revision,teacher_emails,class_links FROM student_tracker_departments ORDER BY name'),
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
      const saved = savedClassLinks(department, year);
      const classLinks = availableLinks(candidates, teacherEmails, saved);
      return { ...department, teacher_emails: approved, teacherEmails, manager_ids: managersFor(leaders, department.name),
        classLinks, unavailableClassCount: saved.length - classLinks.length,
        subjects: [...new Set(classLinks.map(link => link.subject))].sort() };
    }).filter(department => admin || department.manager_ids.includes(user.id) || department.teacherEmails.includes(user.email.trim().toLowerCase()));
    return { admin, departments: visible, tables, staff, ...leaders, candidates };
  }
  function departmentFor(context, id) {
    const department = context.departments.find(item => item.id === id);
    if (!department) throw error('You do not have access to this Tracker department.', 403);
    if (!department.classLinks.length) throw error('No classes are linked for this department and year. Ask its HoLA to use Link Subject Classes.', 409);
    return department;
  }
  function selectedStudent(context, department, id) {
    if (typeof id !== 'string' || !/^k:[A-Za-z0-9_-]{1,60}$/.test(id)) throw error('Choose a valid student.');
    const rows = context.tables.flatMap(table => table.rows.filter(row => student(row).id === id)
      .map(row => ({ ...table, row })));
    if (!rows.some(item => lessons(item.row).some(lesson => linkedLesson(department, lesson, item.term)))) {
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
  function teaches(owner, item, department) {
    return lessons(item.row).some(lesson => linkedLesson(department, lesson, item.term, owner));
  }
  function incompleteLesson(context, department, year, term, lesson) {
    return savedClassLinks(department, year).some(link => {
      if (!department.teacherEmails.includes(link.teacherEmail)) return false;
      const person = context.candidates.find(candidate => candidate.email === link.teacherEmail);
      const available = department.classLinks.find(item => item.teacherEmail === link.teacherEmail && item.code === link.code);
      const hasTimetable = person && (term === null ? person.timetableCurrent : person.timetableTerms.includes(term));
      if ((!person || !lesson.staffCodes.length || lesson.staffCodes.includes(person.code)) &&
          possibleLinkedLesson(department, link, lesson)) {
        return !available || !hasTimetable || !department.classLinks.some(item =>
          item.teacherEmail === link.teacherEmail && linkedLessonMatch(department, item, lesson, term) === 'matched');
      }
      return false;
    }) || department.classLinks.some(link => linkedLessonMatch(department, link, lesson, term) === 'ambiguous');
  }
  async function run(user, input) {
    if (!user?.roles?.some(role => ['ADMIN', 'Teacher'].includes(role))) throw error('Staff access is required.', 403);
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw error('Invalid Student Tracker request.');
    const { action, year } = input;
    if (!Number.isInteger(year) || year < 2000 || year > 2100) throw error('Choose a year from 2000 to 2100.');
    if (!['setup', 'save-setup', 'save-classes', 'search', 'profile', 'attendance', 'attendance-overview', 'reports'].includes(action)) {
      throw error('Unknown Student Tracker action.');
    }
    if (action === 'save-setup' || action === 'save-classes') {
      const { department } = input;
      if (!department || typeof department.name !== 'string' || !department.name.trim() || department.name.length > 100 ||
          (action === 'save-setup' && !Array.isArray(department.teacherEmails))) throw error('Choose a department and its authorised teachers.');
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
      if (action === 'save-classes') {
        if (!existing || department.name.trim() !== existing.name) throw error('Save the department and authorised teachers before linking classes.', 409);
        if (!Number.isInteger(department.revision)) throw error('Reload setup before linking classes.', 409);
        const links = department.classLinks;
        if (!Array.isArray(links) || links.length > 1000 || links.some(link => !link ||
            typeof link.teacherEmail !== 'string' || typeof link.code !== 'string') ||
            new Set(links.map(link => link.teacherEmail + ':' + link.code)).size !== links.length) {
          throw error('Choose unique teacher classes from the uploaded timetable list.');
        }
        const emails = [...(existing.teacher_emails || []), ...automaticTeachers(leaders, existing.name)];
        const sources = await teacherLinks(leaders.candidates, year);
        if (availableLinks(sources, emails, links).length !== links.length) throw error('A selected class is not in an authorised teacher timetable. Reload setup.');
        const result = await dbQuery(`UPDATE student_tracker_departments SET
          class_links=jsonb_set(class_links,ARRAY[$4::text],$3::jsonb,true),
          revision=revision+1,updated_by=$5,updated_at=NOW() WHERE id=$1 AND revision=$2 RETURNING id`,
        [existing.id, department.revision, JSON.stringify(links.map(({ teacherEmail, code }) => ({ teacherEmail, code }))), String(year), user.id]);
        if (!result.rows.length) throw error('Department setup changed in another window. Reload before linking classes.', 409);
        return { saved: true };
      }
      if (department.managerIds !== undefined && (!Array.isArray(department.managerIds) ||
          department.managerIds.length !== managers.length || !managers.every(id => department.managerIds.includes(id)))) {
        throw error('HoLA access is automatic from verified staff, Lead Teacher roles and website leadership. Reload setup; manual assignments are not accepted.');
      }
      validateTeachers(department.teacherEmails, leaders.candidates);
      const automatic = automaticTeachers(leaders, department.name);
      const teachers = department.teacherEmails.filter(email => !automatic.includes(email));
      if (department.subjects !== undefined) {
        throw error('Use Link Subject Classes to select classes separately from teacher authorisation.');
      }
      const effective = [...teachers, ...automatic];
      const kept = existing && existing.name === department.name.trim() ? Object.fromEntries(
        Object.entries(savedClassLinks(existing)).map(([year, links]) => [year, links.filter(link => effective.includes(link.teacherEmail))])) : {};
      if (existing) {
        if (!Number.isInteger(department.revision)) throw error('Reload setup before saving.', 409);
        const result = await dbQuery(`UPDATE student_tracker_departments SET name=$2,subjects=$3,manager_ids=$4,
          teacher_emails=$7,class_links=$8::jsonb,revision=revision+1,updated_by=$5,updated_at=NOW() WHERE id=$1 AND revision=$6 RETURNING id`,
        [existing.id, department.name.trim(), [], managers, user.id, department.revision, teachers, JSON.stringify(kept)]);
        if (!result.rows.length) throw error('Department setup changed in another window. Reload before saving.', 409);
      } else {
        await dbQuery(`INSERT INTO student_tracker_departments(name,subjects,manager_ids,updated_by,teacher_emails) VALUES($1,$2,$3,$4,$5)`,
          [department.name.trim(), [], managers, user.id, teachers]);
      }
      return { saved: true };
    }
    const context = await scope(user, year);
    if (action === 'setup') {
      const manageable = context.admin || context.departments.some(item => item.manager_ids.includes(user.id));
      const publicClass = lesson => ({ ...lesson, sources: lesson.sources.map(({ term, slot }) => ({ term, slot })) });
      const staff = manageable ? context.candidates.map(person => ({ ...person,
        classes: person.classes.map(publicClass), links: person.links.map(publicClass) })) : [];
      return { admin: context.admin, staff, users: context.users,
        departmentOptions: context.departmentOptions.map(choice => ({ ...choice,
          canManage: context.admin || choice.managerIds.includes(user.id), automaticTeachers: automaticTeachers(context, choice.name) })),
        automaticHolaAccess: true, teacherApprovalAccess: true, classSelection: true, classBrowse: true, yearLevelBrowse: true, termBrowse: true,
        disciplineBrowse: true, disciplineGroupBrowse: true,
        departments: context.departments.map(item => ({
        id: item.id, name: item.name, subjects: item.subjects, revision: item.revision, unavailableClassCount: item.unavailableClassCount,
        disciplines: sortedDisciplines(new Set(savedClassLinks(item, year).flatMap(link => linkDisciplines(link.code, item)))),
        disciplineGroups: departmentDisciplineGroups(new Set(savedClassLinks(item, year).flatMap(link => linkDisciplines(link.code, item))))
          .map(({ id, label }) => ({ id, label })),
        ambiguousClassCount: item.classLinks.filter(link => link.ambiguousSources.length).length,
        canManage: context.admin || item.manager_ids.includes(user.id),
        managerIds: item.manager_ids, teacherEmails: manageable ? item.teacher_emails : [],
        classLinks: item.classLinks.map(link => ({ code: link.code, teacherName: link.teacherName,
          teacherEmail: manageable ? link.teacherEmail : undefined })),
        teacherNames: context.candidates.filter(person => item.teacherEmails.includes(person.email)).map(person => person.name)
      })) };
    }
    const department = departmentFor(context, input.departmentId);
    if (action === 'search') {
      if (input.q !== undefined && (typeof input.q !== 'string' || input.q.length > 100)) throw error('Enter a student name of at most 100 characters.');
      if (input.classCode !== undefined && typeof input.classCode !== 'string') throw error('Choose a linked class.');
      const classCode = input.classCode || '';
      if (classCode && !department.classLinks.some(link => link.code === classCode)) throw error('Choose a class linked to this department and year.');
      if (input.subject !== undefined && typeof input.subject !== 'string') throw error('Choose a linked subject.');
      if (input.discipline !== undefined && typeof input.discipline !== 'string') throw error('Choose a linked discipline.');
      const saved = savedClassLinks(department, year);
      const disciplines = new Set(saved.flatMap(link => linkDisciplines(link.code, department)));
      const legacySubject = input.subject === undefined && input.discipline && disciplines.has(input.discipline);
      const selectedSubject = input.subject || (legacySubject ? input.discipline : '');
      const selectedGroup = legacySubject ? '' : input.discipline || '';
      if (selectedSubject && !disciplines.has(selectedSubject)) throw error('Choose a subject linked to this department and year.');
      const group = selectedGroup && departmentDisciplineGroups(disciplines).find(item => item.id === selectedGroup);
      if (selectedGroup && !group) throw error('Choose a discipline linked to this department and year.');
      const filters = [
        ...(selectedSubject ? [{ kind: 'subject', matches: family => family === selectedSubject, excluded: new Set() }] : []),
        ...(group ? [{ kind: 'discipline', matches: family => group.subjects.includes(family), excluded: new Set() }] : [])
      ];
      if (input.yearLevel !== undefined && (typeof input.yearLevel !== 'string' ||
          (input.yearLevel && !/^(?:7|8|9|10|11|12|13)$/.test(input.yearLevel)))) throw error('Choose a student year level from 7 to 13.');
      const yearLevel = input.yearLevel || '';
      if (input.term !== undefined && (!Number.isInteger(input.term) || input.term < 1 || input.term > 4)) throw error('Choose a term from 1 to 4.');
      const term = input.term;
      const query = (input.q || '').trim().toLowerCase();
      if (!classCode && !filters.length && !yearLevel && !term && query.length < 2) {
        throw error('Enter at least two characters of the student name, or choose a class, subject, discipline, year level or term.');
      }
      let tables = context.tables;
      if (term) {
        const snapshot = tables.find(table => table.term === term);
        if (!snapshot) throw error('No preserved student timetable for Term ' + term + ' in ' + year +
          '. Upload it through Kamar Uploader Dataset History before browsing this term.', 409);
        const selected = saved.filter(link => department.teacherEmails.includes(link.teacherEmail) &&
          ((!classCode && !filters.length) || link.code === classCode ||
            filters.some(filter => linkDisciplines(link.code, department).some(filter.matches))));
        if (selected.some(link => !department.classLinks.some(available =>
          available.teacherEmail === link.teacherEmail && available.code === link.code))) {
          throw error('Some linked classes are unavailable. Ask the department manager to review class links before browsing this term.', 409);
        }
        const studentLessons = snapshot.rows.flatMap(row => {
          const item = student(row);
          return (!yearLevel || item.yearLevel === yearLevel) && item.name.toLowerCase().includes(query) ? lessons(row) : [];
        });
        const missing = context.candidates.filter(person => !person.timetableTerms.includes(term) &&
          selected.some(link => link.teacherEmail === person.email && studentLessons.some(lesson =>
            (!lesson.staffCodes.length || lesson.staffCodes.includes(person.code)) &&
            possibleLinkedLesson(department, link, lesson))));
        if (missing.length) throw error('No preserved teacher timetable for Term ' + term + ' in ' + year + ' for ' +
          missing.map(person => person.name).join(', ') + '. Upload it through Kamar Uploader Dataset History before browsing this term.', 409);
        tables = [snapshot];
      }
      const unavailableByTerm = new Map(tables.map(table => [table.term, saved.flatMap(link => {
        const person = context.candidates.find(candidate => candidate.email === link.teacherEmail);
        const available = department.classLinks.some(item => item.teacherEmail === link.teacherEmail && item.code === link.code);
        return !available || !person || (table.term === null ? !person.timetableCurrent : !person.timetableTerms.includes(table.term))
          ? [{ link, person }] : [];
      })]));
      const missingLesson = (term, lesson) => unavailableByTerm.get(term).some(({ link, person }) =>
        (!person || !lesson.staffCodes.length || lesson.staffCodes.includes(person.code)) &&
        possibleLinkedLesson(department, link, lesson));
      const found = new Map();
      let ambiguous = false;
      for (const table of tables) for (const row of table.rows) {
        const item = student(row);
        if ((yearLevel && item.yearLevel !== yearLevel) || !item.name.toLowerCase().includes(query)) continue;
        const rowLessons = lessons(row);
        if (classCode) {
          const matches = rowLessons.map(lesson => classLessonMatch(department, lesson, table.term, classCode));
          if (matches.includes('ambiguous')) ambiguous = true;
          if (!matches.includes('matched')) continue;
        } else if (!rowLessons.some(lesson => linkedLesson(department, lesson, table.term))) {
          if (rowLessons.some(lesson => department.classLinks.some(link =>
            seniorLessonMatch(department, link, lesson, table.term, true) === 'ambiguous'))) ambiguous = true;
          for (const filter of filters) {
            if (rowLessons.some(lesson => filter.matches(discipline(lesson.subject)) &&
              (missingLesson(table.term, lesson) || department.classLinks.some(link =>
                linkedLessonMatch(department, link, lesson, table.term) === 'ambiguous')))) filter.excluded.add(item.id);
          }
          continue;
        }
        if (!found.has(item.id)) found.set(item.id, item);
      }
      const browse = classCode || filters.length || yearLevel || term;
      const foundStudents = [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
      const candidates = browse ? foundStudents : foundStudents.slice(0, 50);
      const breakdowns = new Map(candidates.map(item => [item.id, { subjects: new Map(), uncertain: new Map() }]));
      for (const table of tables) for (const row of table.rows) {
        const breakdown = breakdowns.get(student(row).id);
        if (!breakdown) continue;
        for (const lesson of lessons(row)) {
          const matches = department.classLinks.map(link => linkedLessonMatch(department, link, lesson, table.term));
          const family = discipline(lesson.subject);
          const missing = missingLesson(table.term, lesson);
          if (matches.includes('matched')) {
            disciplines.add(family);
            breakdown.subjects.set(lesson.subject, { code: lesson.subject, discipline: family });
          } else if (missing || matches.includes('ambiguous')) {
            disciplines.add(family);
            breakdown.uncertain.set(lesson.subject, family);
          }
        }
      }
      const withSubjects = candidates.map(item => {
        const breakdown = breakdowns.get(item.id);
        return { ...item, subjects: [...breakdown.subjects.values()].sort((a, b) => a.code.localeCompare(b.code)),
          uncertainDisciplines: [...new Set([...breakdown.uncertain].filter(([code]) => !breakdown.subjects.has(code))
            .map(([, family]) => family))].sort() };
      });
      const matches = (item, filter) => item.subjects.some(subject => filter.matches(subject.discipline));
      const students = withSubjects.filter(item => filters.every(filter => matches(item, filter)));
      const uncertain = filter => [...filter.excluded].some(id => !withSubjects.some(item => item.id === id && matches(item, filter))) ||
        withSubjects.some(item => item.uncertainDisciplines.some(filter.matches) && !matches(item, filter));
      const subjectFilter = filters.find(filter => filter.kind === 'subject');
      const groupFilter = filters.find(filter => filter.kind === 'discipline');
      const subjectAmbiguous = Boolean(subjectFilter && uncertain(subjectFilter));
      const disciplineAmbiguous = Boolean(groupFilter && uncertain(groupFilter)) || Boolean(legacySubject && subjectAmbiguous);
      return { students, truncated: !browse && foundStudents.length > 50, ambiguous, subjectAmbiguous, disciplineAmbiguous,
        disciplines: sortedDisciplines(disciplines) };
    }
    const rows = selectedStudent(context, department, input.studentId);
    if (action === 'profile') {
      const classes = new Map(), uncertainSources = new Set();
      for (const item of rows) for (const lesson of lessons(item.row)) {
        if (incompleteLesson(context, department, year, item.term, lesson)) {
          uncertainSources.add(item.term === null ? 'current timetable' : 'Term ' + item.term);
        }
        for (const link of department.classLinks) {
          if (linkedLessonMatch(department, link, lesson, item.term) !== 'matched') continue;
          const family = discipline(lesson.subject);
          const group = disciplineGroups.find(group => group.subjects.includes(family));
          const code = classLessonMatch(department, lesson, item.term, link.code) === 'matched'
            ? link.code : 'Class group not distinguishable';
          if (code !== link.code) uncertainSources.add(item.term === null ? 'current timetable' : 'Term ' + item.term);
          const key = JSON.stringify([lesson.subject, code, link.teacherEmail]);
          if (!classes.has(key)) classes.set(key, {
            discipline: group?.label || family, subject: lesson.subject, classCode: code,
            teacher: link.teacherName, sources: []
          });
          const entry = classes.get(key);
          if (!entry.sources.includes(item.term)) entry.sources.push(item.term);
        }
      }
      return { student: student(rows[0].row), subjectClasses: [...classes.values()].sort((a, b) =>
        a.discipline.localeCompare(b.discipline) || a.subject.localeCompare(b.subject) ||
        a.classCode.localeCompare(b.classCode) || a.teacher.localeCompare(b.teacher)),
      subjectClassesWarnings: uncertainSources.size ? ['Some linked subjects or class groups could not be confirmed in: ' +
        [...uncertainSources].join(', ') + '. Review the student and teacher timetables and class links.'] : [],
      timetables: rows.map(item => ({
        term: item.term, lessons: lessons(item.row).map(lesson => ({
          slot: lesson.slot, code: lesson.code, subject: lesson.subject, linked: linkedLesson(department, lesson, item.term)
        }))
      })), availableTerms: rows.filter(item => item.term !== null).map(item => item.term) };
    }
    const teachers = (await owners(context)).filter(owner => department.teacherEmails.includes(owner.email.trim().toLowerCase()) &&
      rows.some(item => teaches(owner, item, department)));
    const ids = teachers.map(owner => owner.id);
    if (action === 'attendance-overview') {
      const settings = (await planner('SELECT content FROM school_planner_settings WHERE year=$1', [year])).rows[0]?.content;
      const validDate = value => typeof value === 'string' && value.startsWith(year + '-') && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
        !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
      const configured = [1, 2, 3, 4].map(term => ({
        term, start: settings?.['term' + term + 'Start'], end: settings?.['term' + term + 'End']
      }));
      let kamarDates;
      if (configured.some(item => !item.start || !item.end)) {
        try { kamarDates = await loadKamarTermDates(year); }
        catch (error) {
          console.warn('Student Tracker KAMAR term dates unavailable:', error.message);
        }
      }
      const dates = configured.map(item => {
        if (item.start && item.end) return { ...item, dateSource: 'Published school term dates' };
        const start = kamarDates?.['term' + item.term + 'Start'], end = kamarDates?.['term' + item.term + 'End'];
        if (!validDate(start) || !validDate(end) || start > end) return item;
        if ((item.start && item.start !== start) || (item.end && item.end !== end)) {
          return { ...item, conflict: true };
        }
        return { ...item, start, end, dateSource: 'KAMAR school calendar (derived)' };
      });
      const localDate = today();
      const currentTerm = dates.find(range => !range.conflict && validDate(range.start) && validDate(range.end) &&
        range.start <= localDate && range.end >= localDate)?.term;
      const terms = [];
      for (const { term, start, end, dateSource, conflict } of dates) {
        const snapshot = rows.find(item => item.term === term);
        const source = snapshot || (term === currentTerm ? rows.find(item => item.term === null) : null);
        if (!source) {
          terms.push({ term, status: 'unavailable', message: 'No student timetable is available for this term. Upload the preserved timetable in Kamar Uploader.' });
          continue;
        }
        const studentLessons = lessons(source.row);
        const allowed = studentLessons.filter(lesson => linkedLesson(department, lesson, source.term));
        const incomplete = studentLessons.some(lesson => incompleteLesson(context, department, year, source.term, lesson));
        if (!allowed.length) {
          terms.push(incomplete
            ? { term, status: 'unavailable', message: 'Linked subjects could not be confirmed. Review the teacher timetables and class links for this term.' }
            : { term, status: 'not_enrolled' });
          continue;
        }
        if (conflict || !validDate(start) || !validDate(end) || start > end) {
          terms.push({ term, status: 'unavailable', message: conflict
            ? 'The incomplete published dates disagree with the KAMAR calendar. Review school term dates in Kamar Uploader.'
            : 'School term dates are unavailable. Review the KAMAR calendar or publish dates in Kamar Uploader.' });
          continue;
        }
        const marks = ids.length ? (await planner(`SELECT owner_id::text,to_char(lesson_date,'YYYY-MM-DD') AS date,period,mark
          FROM planner_attendance_marks WHERE owner_id=ANY($1::uuid[]) AND student_id=$2 AND year=$3
          AND lesson_date BETWEEN $4::date AND $5::date AND mark<>'' ORDER BY lesson_date,period,owner_id`,
        [ids, input.studentId, year, start, end])).rows : [];
        const missingOwners = department.classLinks.some(link =>
          allowed.some(lesson => linkedLessonMatch(department, link, lesson, source.term) === 'matched') &&
          !teachers.some(owner => owner.email.trim().toLowerCase() === link.teacherEmail));
        let sharedPeriod = false;
        const savedMarks = marks.flatMap(mark => {
          const owner = teachers.find(item => item.id === mark.owner_id);
          const day = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date(mark.date + 'T00:00:00Z').getUTCDay()];
          const matching = allowed.filter(lesson => lesson.slot.replace(/_[12]$/, '') === day + '_' + mark.period &&
            linkedLesson(department, lesson, source.term, owner));
          const subjects = [...new Set(matching.map(lesson => lesson.subject))].sort();
          if (!subjects.length) return [];
          if (subjects.length > 1) sharedPeriod = true;
          return [{ date: mark.date, period: mark.period, mark: mark.mark,
            subject: subjects.join(' / '), teacher: owner.display_name,
            teacherCode: owner.codes.filter(code => matching.some(lesson => lesson.staffCodes.includes(code))).sort().join(' / ') }];
        });
        const warnings = [];
        if (incomplete || missingOwners) warnings.push('Some linked lessons or teacher records could not be confirmed; attendance may be incomplete.');
        if (sharedPeriod) warnings.push('A saved period mark coincides with multiple linked subjects and cannot be assigned to either subject separately.');
        terms.push({ term, status: 'available', startDate: start, endDate: end, dateSource,
          timetableSource: snapshot ? 'Preserved term timetable' : 'Current uploaded timetable (current term only)',
          ...(warnings.length ? { message: warnings.join(' ') } : {}), marks: savedMarks });
      }
      return { terms, notice: 'Saved Teacher Planner teaching-log marks, not the official KAMAR register. Missing entries are not recorded, not present. No attendance percentage is inferred.' };
    }
    if (action === 'reports') {
      const records = ids.length ? (await planner(`SELECT owner_id::text,content,updated_at FROM planner_sections
        WHERE owner_id=ANY($1::uuid[]) AND year=$2 AND section='reporting' AND entry_key='main' ORDER BY updated_at DESC`,
      [ids, year])).rows : [];
      const reports = records.flatMap(record => {
        if (!reporting.validContent(record.content)) throw error('A Planner reporting draft is invalid. Ask its teacher to review it.', 502);
        const owner = teachers.find(teacher => teacher.id === record.owner_id);
        const dtechCodes = context.candidates.filter(person => person.email === owner.email.trim().toLowerCase())
          .flatMap(person => person.classes.filter(link => link.programmes.includes('DTECH') || link.family === 'DTECH').map(link => link.subject));
        const relevant = rows.filter(item => lessons(item.row).some(lesson => dtechCodes.includes(lesson.subject) &&
          linkedLesson(department, lesson, item.term, owner)));
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
      const linkedForTerm = (lesson, owner) => linkedLesson(department, lesson, term, owner) ||
        (term === currentTerm && linkedLesson(department, lesson, null, owner));
      const allowed = lessons(row).filter(lesson => linkedForTerm(lesson));
      if (!allowed.length) throw error('No linked teacher class timetable matches this student and term. Review class links and preserved teacher timetables.', 404);
      return { term, timetableSource: snapshot ? 'Preserved term timetable' : 'Current uploaded timetable (current term only)',
        startDate: start, endDate: end, marks: marks.flatMap(mark => {
        const owner = teachers.find(item => item.id === mark.owner_id);
        const day = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date(mark.date + 'T00:00:00Z').getUTCDay()];
        const matching = allowed.filter(lesson => lesson.slot.replace(/_[12]$/, '') === day + '_' + mark.period &&
          linkedForTerm(lesson, owner));
        return [...new Set(matching.map(lesson => lesson.subject))].map(subject => ({
          date: mark.date, period: mark.period, mark: mark.mark, subject, teacher: owner.display_name
        }));
      }), notice: 'Saved Teacher Planner teaching-log marks, not the official KAMAR register. Missing entries are not recorded, not present. No attendance percentage is inferred.' };
    }
    throw error('Unknown Student Tracker action.');
  }
  return { run, learningAreas };
}
module.exports = { createStudentTrackerService, lessons, termRows, approvedTrackerUser, matchingCourses, teacherClassCodes, subjectFamily };
