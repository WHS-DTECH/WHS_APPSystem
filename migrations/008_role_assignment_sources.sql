ALTER TABLE user_roles
  ADD COLUMN IF NOT EXISTS assignment_source TEXT NOT NULL DEFAULT 'manual';

ALTER TABLE user_roles
  DROP CONSTRAINT IF EXISTS user_roles_assignment_source_check;

ALTER TABLE user_roles
  ADD CONSTRAINT user_roles_assignment_source_check
  CHECK (assignment_source IN ('kamar', 'manual', 'system'));

DELETE FROM user_roles assignments
USING roles
WHERE assignments.role_id = roles.id
  AND roles.name = 'Staff'
  AND NOT EXISTS (
    SELECT 1
    FROM kamar.staff
    JOIN users ON users.id = assignments.user_id
    WHERE LOWER(kamar.staff.email_school) = LOWER(users.email)
      AND kamar.staff.status = 'Current'
  );

DELETE FROM user_roles assignments
USING roles
WHERE assignments.role_id = roles.id
  AND roles.name = 'Student'
  AND NOT EXISTS (
    SELECT 1
    FROM kamar.students
    JOIN users ON users.id = assignments.user_id
    WHERE LOWER(kamar.students.email_school) = LOWER(users.email)
      AND kamar.students.status = 'Current'
  );

INSERT INTO user_roles (user_id, role_id, assignment_source)
SELECT users.id, roles.id, 'kamar'
FROM users
JOIN kamar.staff
  ON LOWER(kamar.staff.email_school) = LOWER(users.email)
 AND kamar.staff.status = 'Current'
JOIN roles ON roles.name = 'Staff'
ON CONFLICT (user_id, role_id)
DO UPDATE SET assignment_source = EXCLUDED.assignment_source;

INSERT INTO user_roles (user_id, role_id, assignment_source)
SELECT users.id, roles.id, 'kamar'
FROM users
JOIN kamar.students
  ON LOWER(kamar.students.email_school) = LOWER(users.email)
 AND kamar.students.status = 'Current'
JOIN roles ON roles.name = 'Student'
ON CONFLICT (user_id, role_id)
DO UPDATE SET assignment_source = EXCLUDED.assignment_source;

CREATE INDEX IF NOT EXISTS user_roles_assignment_source_idx
  ON user_roles (user_id, assignment_source);