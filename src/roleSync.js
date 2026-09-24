async function syncKamarRoles(db, userId, email) {
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
       AND EXISTS (
         SELECT 1 FROM kamar.staff
         WHERE LOWER(email_school) = LOWER($2) AND status = 'Current'
       )
     ON CONFLICT (user_id, role_id)
     DO UPDATE SET assignment_source = EXCLUDED.assignment_source`,
    [userId, email]
  );

  await db.query(
    `INSERT INTO user_roles (user_id, role_id, assignment_source)
     SELECT $1, roles.id, 'kamar'
     FROM roles
     WHERE roles.name = 'Student'
       AND EXISTS (
         SELECT 1 FROM kamar.students
         WHERE LOWER(email_school) = LOWER($2) AND status = 'Current'
       )
     ON CONFLICT (user_id, role_id)
     DO UPDATE SET assignment_source = EXCLUDED.assignment_source`,
    [userId, email]
  );
}

module.exports = {
  syncKamarRoles
};