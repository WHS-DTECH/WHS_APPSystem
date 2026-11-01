const { query: kamarQuery } = require('./legacy/kamar-uploader/db');

async function syncKamarRoles(db, userId, email, directoryQuery = kamarQuery) {
  // Read both lists before changing Core roles; a directory outage must not remove access.
  const [staff, students] = await Promise.all([
    directoryQuery("SELECT 1 FROM staff_upload WHERE LOWER(TRIM(email_school))=LOWER(TRIM($1)) AND status='Current' LIMIT 1", [email]),
    directoryQuery("SELECT 1 FROM student_details_upload WHERE LOWER(TRIM(email_school))=LOWER(TRIM($1)) AND status='Current' LIMIT 1", [email])
  ]);
  await db.query(
    `DELETE FROM user_roles
     WHERE user_id = $1 AND assignment_source = 'kamar'`,
    [userId]
  );

  await db.query(
    `INSERT INTO user_roles (user_id, role_id, assignment_source)
     SELECT $1, roles.id, 'kamar'
     FROM roles
     WHERE roles.name = 'Staff'
       AND $2::boolean
     ON CONFLICT (user_id, role_id)
     DO NOTHING`,
    [userId, staff.rows.length > 0]
  );

  await db.query(
    `INSERT INTO user_roles (user_id, role_id, assignment_source)
     SELECT $1, roles.id, 'kamar'
     FROM roles
     WHERE roles.name = 'Student'
       AND $2::boolean
     ON CONFLICT (user_id, role_id)
     DO NOTHING`,
    [userId, students.rows.length > 0]
  );
}

module.exports = {
  syncKamarRoles
};