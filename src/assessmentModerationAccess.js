const { loadDepartments, normaliseDirectoryName } = require('./legacy/kamar-uploader/departments');

async function assessmentModerationAccess(user, directoryQuery, dbQuery) {
  if (user.roles?.includes('ADMIN')) return { all: true, departments: [] };
  const [staff, accounts] = await Promise.all([
    directoryQuery(`SELECT code,first_name,last_name,email_school FROM staff_upload WHERE status='Current'`),
    dbQuery(`SELECT u.id::text,u.display_name,
      EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id
        WHERE ur.user_id=u.id AND lower(r.name)='student') AS student_account
      FROM users u WHERE u.is_active=true AND lower(trim(u.email))=lower(trim($1))`, [user.email])
  ]);
  const matches = staff.rows.filter(person => person.email_school?.trim().toLowerCase() === user.email?.trim().toLowerCase());
  const account = accounts.rows[0], person = matches[0], normal = normaliseDirectoryName;
  if (accounts.rows.length !== 1 || account.id !== user.id || account.student_account || matches.length !== 1 ||
      !person.code?.trim() || staff.rows.filter(other => other.code?.trim().toUpperCase() === person.code.trim().toUpperCase()).length !== 1 ||
      !normal(account.display_name) || normal(account.display_name) !== normal([person.first_name, person.last_name].filter(Boolean).join(' '))) {
    return { all: false, departments: [] };
  }
  const departments = await loadDepartments(dbQuery, staff.rows);
  return { all: false, departments: departments.filter(department => department.leaders.some(leader =>
    leader.name === department.teacher && ['HOL', 'HOLA'].includes(leader.role) && !leader.onLeave &&
    leader.source && leader.reviewedOn && leader.staffCode === person.code.trim().toUpperCase())).map(department => department.name) };
}

module.exports = { assessmentModerationAccess };
