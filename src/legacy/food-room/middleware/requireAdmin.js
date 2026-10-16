const pool = require('../db');
const { pool: appPool } = require('../../../db');

const SYNC_TTL_MS = 60 * 1000;
const lastSynced = new Map();

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const isAdminUser = (user) => Boolean(user && user.roles && user.roles.includes('ADMIN'));

async function hasFoodRoomHubRole(userId, roleKey) {
  const result = await appPool.query(
    `SELECT 1
     FROM user_hub_roles assignments
     INNER JOIN hub_roles roles ON roles.id = assignments.hub_role_id
     WHERE assignments.user_id = $1 AND roles.hub_key = 'food-room' AND roles.role_key = $2
     LIMIT 1`,
    [userId, roleKey]
  );
  return result.rowCount > 0;
}

// Maps the app's roles onto the legacy Food Room role names (admin, lead_teacher, teacher, technician, student).
async function legacyRolesFor(user) {
  const roles = new Set();
  if (isAdminUser(user)) roles.add('admin');
  if (await hasFoodRoomHubRole(user.id, 'lead-teacher')) roles.add('lead_teacher');
  if (await hasFoodRoomHubRole(user.id, 'technician')) roles.add('technician');
  if (user.roles.includes('Teacher') || user.roles.includes('Staff')) roles.add('teacher');
  if (user.roles.includes('Student')) roles.add('student');
  return [...roles];
}

// The legacy pages and queries resolve roles from user_additional_roles, so the app's roles are
// mirrored there (rows flagged app_synced). Roles carried over from the legacy database are untouched.
async function syncRoles(user, email) {
  const cached = lastSynced.get(email);
  if (cached && Date.now() - cached < SYNC_TTL_MS) return;

  const roles = await legacyRolesFor(user);
  const userType = user.roles.includes('Student') && !user.roles.includes('Teacher') && !user.roles.includes('Staff') && !isAdminUser(user)
    ? 'student'
    : 'staff';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM user_additional_roles WHERE app_synced = TRUE AND lower(email) = $1', [email]);
    for (const role of roles) {
      await client.query(
        `INSERT INTO user_additional_roles (email, role_name, user_type, app_synced)
         VALUES ($1, $2, $3, TRUE)
         ON CONFLICT (email, role_name) DO NOTHING`,
        [email, role, userType]
      );
    }
    await client.query('COMMIT');
    lastSynced.set(email, Date.now());
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

// Replaces the legacy JWT cookie: the signed-in Google user comes from the app session, and the
// identity headers the legacy code used to trust are overwritten so they cannot be spoofed.
async function attachAuthUser(req, res, next) {
  const email = normalizeEmail(req.user && req.user.email);

  delete req.headers['x-user-email'];
  delete req.headers['x-staff-email'];
  if (req.query) delete req.query.userEmail;
  if (req.body && typeof req.body === 'object') delete req.body.userEmail;

  if (!email) {
    req.authUser = null;
    req.authUserEmail = '';
    return next();
  }

  req.authUser = { email, name: req.user.display_name || email, picture: '' };
  req.authUserEmail = email;
  req.headers['x-user-email'] = email;

  try {
    await syncRoles(req.user, email);
  } catch (error) {
    console.error('[FOOD-ROOM] Role sync failed:', error.message);
  }
  return next();
}

function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Sign in required.' });
  }
  if (isAdminUser(req.user)) {
    return next();
  }
  return res.status(403).json({ success: false, error: 'Admin access required.' });
}

module.exports = { attachAuthUser, requireAdmin };
