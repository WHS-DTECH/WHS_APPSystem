const config = require('./config');
const { query } = require('./db');
const { userHasHubPermission } = require('./hubRoles');

const LIMIT = 50;
const scopes = [
  { key: 'training', label: 'Class Training', pattern: /^\/dtech-hub\/class-training(?:\/|$)/ },
  { key: 'guidance', label: 'Guidance Counsellor App', pattern: /^\/(?:(?:apps|student-apps)\/guidance-counsellor-app|hubs\/app-guidance-counsellor-app\/roles)(?:\/|$)/ },
  { key: 'dtech', label: 'DTECH Hub', pattern: /^\/(?:dtech-hub|hubs\/dtech-hub\/roles)(?:\/|$)/ },
  { key: 'food', label: 'Food Room Hub', pattern: /^\/(?:food-room|hubs\/food-room\/roles)(?:\/|$)/ },
  { key: 'sewing', label: 'Sewing Hub', pattern: /^\/(?:sewing-hub|hubs\/sewing-hub\/roles)(?:\/|$)/ },
  { key: 'workshop', label: 'Workshop Hub', pattern: /^\/(?:workshop|hubs\/workshop\/roles)(?:\/|$)/ },
  { key: 'technology', label: 'HUB Dashboard', pattern: /^\/(?:technology-hub|admin\/technology-hub|hubs\/technology-hub\/roles)(?:\/|$)/ },
  { key: 'kamar', label: 'Kamar Uploader', pattern: /^\/admin\/kamar-uploader(?:\/|$)/ },
  { key: 'learning', label: 'WHS Learning Sites', pattern: /^\/(?:learning-sites(?:\/|$)|learning-sites-public\.html$|hubs\/learning-sites\/roles(?:\/|$)|ADMIN(?:\/|$)|ReleverPlan(?:\/|$)|(?:DTECH|COMP|Food|Textiles|WOOD|DVC)(?:\/|$))/ },
  { key: 'apps', label: 'APPs Dashboard', pattern: /^\/student-apps(?:\/|$)/ },
  { key: 'core', label: 'Core Administration', pattern: /^\/(?:admin(?:\/|$)|hubs(?:\/|$)|dashboard$|profile(?:\/|$)|$)/ }
];

function moduleForPath(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\?#\x00-\x1f]/.test(value)) return null;
  const scope = scopes.find((item) => item.pattern.test(value));
  return scope ? { key: scope.key, label: scope.label } : null;
}

class SearchError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// Read only fixed, local endpoints through their normal session/role middleware.
const sources = {
  dtechActivities: '/dtech-hub/api/activities',
  dtechLessons: '/dtech-hub/api/lessons',
  dtechUnits: '/dtech-hub/api/unit-plans',
  sewing: '/api/activities',
  food: '/food-room/api/recipes',
  worksheets: '/workshop/api/worksheets',
  lessonNotes: '/workshop/api/lesson-notes',
  kamarStaff: '/api/staff_upload/all',
  kamarStudents: '/api/student_details_upload/all'
};

async function readSource(req, name) {
  const pathname = sources[name];
  if (!pathname) throw new Error('Unknown module search source.');
  const cookie = String(req.headers.cookie || '').split(';').map((part) => part.trim())
    .filter((part) => part.startsWith('whs.sid=')).join('; ');
  if (!cookie) throw new SearchError(401, 'Your school session has expired. Please sign in again.');
  const response = await fetch(`http://127.0.0.1:${config.port}${pathname}`, {
    headers: { cookie }, redirect: 'manual', signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403 || response.status === 302) {
      throw new SearchError(403, 'Your current role cannot search this module.');
    }
    throw new SearchError(503, 'This module could not be searched. Please retry or contact an administrator.');
  }
  if (!String(response.headers.get('content-type')).includes('application/json')) throw new Error('Module search source did not return JSON.');
  return response.json();
}

function rows(data, property) {
  const value = property ? data?.[property] : data;
  if (!Array.isArray(value)) throw new Error('Module search source returned an invalid record list.');
  return value;
}

function item(title, url, kind, description = '') {
  return { title: String(title || ''), url, kind, description: String(description || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ') };
}

function createModuleSearch({ dbQuery = query, read = readSource,
  dtechAccess = (email) => require('./modules/dtechHub').accessForEmail(email),
  learningStore = () => require('./legacy/learning-sites/adminStore'),
  appRecords = (user) => require('./studentApps').searchableApps(user)
} = {}) {
  return async (req, res) => {
    res.set('Cache-Control', 'private, no-store').set('Vary', 'Cookie');
    try {
      if (!req.user) throw new SearchError(401, 'Sign in with your school account to search.');
      if (req.user.is_active === false) throw new SearchError(403, 'This school account is inactive.');
      const scope = moduleForPath(req.query.path);
      if (!scope) throw new SearchError(400, 'Search is not available for this module.');
      if (typeof req.query.q !== 'string' || req.query.q.trim().length < 2 || req.query.q.length > 100) {
        throw new SearchError(400, 'Enter between 2 and 100 characters to search this module.');
      }
      const q = req.query.q.trim();
      const admin = req.user.roles?.includes('ADMIN');
      const teacher = admin || req.user.roles?.includes('Teacher');
      const encoded = encodeURIComponent(q);
      if (scope.key === 'training') return res.redirect(`/dtech-hub/class-training/api/school-search?q=${encoded}`);
      if (scope.key === 'guidance') return res.redirect(`/apps/guidance-counsellor-app/api/school-search?q=${encoded}`);
      const home = {
        dtech: '/dtech-hub/', food: '/food-room/', sewing: '/sewing-hub/', workshop: '/workshop/',
        learning: '/learning-sites-public.html', technology: '/technology-hub/', kamar: '/admin/kamar-uploader/',
        apps: '/student-apps'
      };
      let results = home[scope.key] ? [item(scope.label, home[scope.key], 'Page')] : [];
      if (scope.key === 'dtech') {
        const domain = config.google.hostedDomain || 'westlandhigh.school.nz';
        if (!String(req.user.email).toLowerCase().endsWith(`@${domain.toLowerCase()}`)) throw new SearchError(403, 'Use your school Google account to search DTECH.');
        const access = await dtechAccess(req.user.email);
        if (!access.active) throw new SearchError(403, 'This school account is inactive.');
        results.push(...rows(await read(req, 'dtechActivities')).map((record) => item(
          record.name, `/dtech-hub/ProjectPages/custom-activity.html?id=${encodeURIComponent(record.id)}`,
          record.activity_category || 'Activity', record.description
        )));
        if (access.teacher) {
          const [lessons, units] = await Promise.all([read(req, 'dtechLessons'), read(req, 'dtechUnits')]);
          results.push(...rows(lessons).map((record) => item(record.lesson_title || record.title,
            '/dtech-hub/browse-lessons.html', 'Lesson', record.description)));
          results.push(...rows(units).map((record) => item(record.unit_title || record.title,
            '/dtech-hub/browse-unit-plans.html', 'Unit plan', record.description)));
          results.push(item('Lessons library', '/dtech-hub/browse-lessons.html', 'Page'),
            item('Unit plans library', '/dtech-hub/browse-unit-plans.html', 'Page'));
        }
        if (access.admin) results.push(item('Admin Menu', '/dtech-hub/admin-menu.html', 'Page'));
      } else if (scope.key === 'sewing') {
        results.push(...rows(await read(req, 'sewing')).map((record) => item(record.name,
          `/sewing-hub/activity_detail.html?id=${encodeURIComponent(record.id)}`, record.activity_category || 'Activity', record.description)));
      } else if (scope.key === 'food') {
        results.push(...rows(await read(req, 'food')).map((record) => item(record.name,
          `/food-room/recipe_display.html?id=${encodeURIComponent(record.id)}`, 'Recipe', record.description)));
      } else if (scope.key === 'workshop') {
        const [worksheets, notes] = await Promise.all([read(req, 'worksheets'), read(req, 'lessonNotes')]);
        results.push(
          ...rows(worksheets, 'worksheets').map((record) => item(record.worksheet_title,
            `/workshop/api/worksheets/${encodeURIComponent(record.id)}/file`, 'Worksheet', record.strand_title)),
          ...rows(notes, 'lessonNotes').map((record) => item(record.lesson_note_title,
            `/workshop/api/lesson-notes/${encodeURIComponent(record.id)}/file`, 'Lesson notes', record.strand_title))
        );
      } else if (scope.key === 'learning') {
        const store = learningStore();
        await store.initAdminSchema();
        const courses = await store.getCourseContentTargets();
        const subjects = { TEXTILES: 'Textiles', FOOD: 'Food' };
        const contents = await Promise.all(courses.map((course) => store.getCourseContent(course.courseCode)));
        courses.forEach((course, index) => {
          const url = `/${subjects[course.subjectCode] || course.subjectCode}/${encodeURIComponent(course.courseCode)}/`;
          results.push(item(course.courseName, url, 'Course', course.courseCode));
          const content = contents[index];
          for (const assessment of content.assessments || []) {
            results.push(item(assessment, url, 'Assessment', course.courseName));
          }
        });
        if (teacher || await userHasHubPermission(req.user, 'learning-sites', 'teacher.view', dbQuery)) {
          results.push(item('Relief Plan', '/ReleverPlan/', 'Page'));
        }
        if (admin || await userHasHubPermission(req.user, 'learning-sites', 'admin.manage', dbQuery)) {
          results.push(item('HOD Update Dashboard', '/ADMIN/', 'Page'));
        }
      } else if (scope.key === 'technology') {
        const areas = await require('./modules/technologyHub').searchableAreas(req.user, dbQuery);
        results.push(...areas.map((area) => item(area.label, `/technology-hub/${area.file}`, 'Learning space')));
      } else if (scope.key === 'kamar') {
        if (!admin) throw new SearchError(403, 'Kamar Uploader requires administrator access.');
        const [staff, students] = await Promise.all([read(req, 'kamarStaff'), read(req, 'kamarStudents')]);
        results.push(...rows(staff, 'staff').map((record) => item(`${record.first_name || ''} ${record.last_name || ''}`,
          '/admin/kamar-uploader/', 'Staff', record.email_school)),
        ...rows(students, 'students').map((record) => item(`${record.first_name || ''} ${record.last_name || ''}`,
          '/admin/kamar-uploader/', 'Student', record.id_number)));
      } else if (scope.key === 'apps') {
        results.push(...(await appRecords(req.user)).map((record) => item(record.name,
          `/student-apps/${encodeURIComponent(record.slug)}`, 'Student App', record.description)));
      } else if (scope.key === 'core') {
        results = [item('Dashboard', '/dashboard', 'Page'), item('Profile', '/profile', 'Page'),
          item('Email preferences', '/profile/email-preferences', 'Page')];
        if (admin) {
          results.push(...[
            ['Users', '/admin/users'], ['Roles and permissions', '/admin/roles'], ['Hub access', '/admin/hub-access'],
            ['School terms', '/admin/school-terms'], ['Email log', '/admin/emails'], ['Modules', '/admin/modules']
          ].map(([title, url]) => item(title, url, 'Administration')));
          const users = await dbQuery(
            `SELECT display_name, email FROM users WHERE is_active = true
             AND (STRPOS(LOWER(COALESCE(display_name, '')), LOWER($1)) > 0 OR STRPOS(LOWER(email), LOWER($1)) > 0)
             ORDER BY email LIMIT 51`, [q]);
          results.push(...users.rows.map((record) => item(record.display_name || record.email, '/admin/users', 'School account', record.email)));
        }
      }
      const needle = q.toLocaleLowerCase();
      const matches = results.filter((result) => `${result.title} ${result.description} ${result.kind}`.toLocaleLowerCase().includes(needle));
      const unique = [...new Map(matches.map((result) => [`${result.kind}:${result.url}:${result.title}`, result])).values()];
      unique.sort((a, b) => a.title.localeCompare(b.title));
      return res.json({ module: scope.label,
        results: unique.slice(0, LIMIT).map((result) => ({ ...result, description: result.description.slice(0, 240) })),
        truncated: unique.length > LIMIT });
    } catch (error) {
      console.error('Module search failed:', error.message);
      return res.status(error.status || 503).json({ error: error.status ? error.message : 'Search is temporarily unavailable. Please retry or contact an administrator.' });
    }
  };
}

module.exports = { moduleForPath, createModuleSearch, readSource };
