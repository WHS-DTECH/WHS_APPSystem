const { query } = require('./legacy/kamar-uploader/db');

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

module.exports = { currentDirectory, classifyPeople };
