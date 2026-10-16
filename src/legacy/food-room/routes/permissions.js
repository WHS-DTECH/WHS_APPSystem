const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAdmin } = require('../middleware/requireAdmin');

// Default permissions structure
const DEFAULT_ROLES = {
  admin: {
    inventory: true,
    recipes: true,
    browse_practicals: true,
    add_recipes: true,
    shopping: true,
    place_order: true,
    booking: true,
    food_truck: true,
    ft_teacher: true,
    planning: true,
    admin: true
  },
  lead_teacher: {
    inventory: true,
    recipes: true,
    browse_practicals: true,
    add_recipes: true,
    shopping: true,
    place_order: true,
    booking: true,
    food_truck: true,
    ft_teacher: true,
    planning: true,
    admin: false
  },
  teacher: {
    inventory: true,
    recipes: true,
    browse_practicals: true,
    add_recipes: true,
    shopping: true,
    place_order: true,
    booking: true,
    food_truck: true,
    ft_teacher: true,
    planning: false,
    admin: false
  },
  technician: {
    inventory: true,
    recipes: true,
    browse_practicals: true,
    add_recipes: false,
    shopping: true,
    place_order: false,
    booking: false,
    food_truck: false,
    ft_teacher: false,
    planning: false,
    admin: false
  },
  student: {
    inventory: true,
    recipes: true,
    browse_practicals: true,
    add_recipes: false,
    shopping: false,
    place_order: false,
    booking: false,
    food_truck: true,
    ft_teacher: false,
    planning: false,
    admin: false
  },
  staff: {
    inventory: true,
    recipes: true,
    browse_practicals: true,
    add_recipes: false,
    shopping: false,
    place_order: false,
    booking: false,
    food_truck: false,
    ft_teacher: false,
    planning: false,
    admin: false
  },
  public_access: {
    inventory: true,
    recipes: false,
    browse_practicals: false,
    add_recipes: false,
    shopping: false,
    place_order: false,
    booking: false,
    food_truck: false,
    ft_teacher: false,
    planning: false,
    admin: false
  }
};

const ROUTES = ['inventory', 'add_recipes', 'recipes', 'browse_practicals', 'shopping', 'place_order', 'booking', 'food_truck', 'ft_teacher', 'planning', 'admin'];
const ROLE_PERMISSION_COLUMNS = ['recipes', 'browse_practicals', 'add_recipes', 'inventory', 'shopping', 'place_order', 'booking', 'food_truck', 'ft_teacher', 'planning', 'admin'];

function buildDefaultRolesRows() {
  return Object.entries(DEFAULT_ROLES)
    .map(([role_name, values]) => ({ role_name, ...values }));
}

let schemaAvailable = false;
let schemaReadyPromise = null;
let lastSchemaInitAttempt = 0;
const SCHEMA_INIT_RETRY_MS = 60 * 1000;

async function normalizeKnownRoleRows() {
  const knownRoles = Object.keys(DEFAULT_ROLES);

  // Remove obviously invalid role rows early to keep normalization deterministic.
  await pool.query("DELETE FROM role_permissions WHERE trim(COALESCE(role_name, '')) = ''");

  for (const roleName of knownRoles) {
    const mergedResult = await pool.query(
      `SELECT COUNT(*)::int AS count,
              COALESCE(bool_or(recipes), false) AS recipes,
              COALESCE(bool_or(browse_practicals), false) AS browse_practicals,
              COALESCE(bool_or(add_recipes), false) AS add_recipes,
              COALESCE(bool_or(inventory), false) AS inventory,
              COALESCE(bool_or(shopping), false) AS shopping,
              COALESCE(bool_or(place_order), false) AS place_order,
              COALESCE(bool_or(booking), false) AS booking,
              COALESCE(bool_or(food_truck), false) AS food_truck,
              COALESCE(bool_or(ft_teacher), false) AS ft_teacher,
              COALESCE(bool_or(planning), false) AS planning,
              COALESCE(bool_or(admin), false) AS admin
         FROM role_permissions
        WHERE lower(trim(role_name)) = $1`,
      [roleName]
    );

    const merged = mergedResult.rows[0];
    if (!merged || !merged.count) continue;

    await pool.query(
      `INSERT INTO role_permissions (${['role_name'].concat(ROLE_PERMISSION_COLUMNS).join(', ')})
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (role_name) DO UPDATE
         SET recipes = EXCLUDED.recipes,
             browse_practicals = EXCLUDED.browse_practicals,
             add_recipes = EXCLUDED.add_recipes,
             inventory = EXCLUDED.inventory,
             shopping = EXCLUDED.shopping,
             place_order = EXCLUDED.place_order,
             booking = EXCLUDED.booking,
             food_truck = EXCLUDED.food_truck,
             ft_teacher = EXCLUDED.ft_teacher,
             planning = EXCLUDED.planning,
             admin = EXCLUDED.admin,
             updated_at = CURRENT_TIMESTAMP`,
      [
        roleName,
        merged.recipes,
        merged.browse_practicals,
        merged.add_recipes,
        merged.inventory,
        merged.shopping,
        merged.place_order,
        merged.booking,
        merged.food_truck,
        merged.ft_teacher,
        merged.planning,
        merged.admin
      ]
    );

    await pool.query(
      `DELETE FROM role_permissions
        WHERE lower(trim(role_name)) = $1
          AND role_name <> $2`,
      [roleName, roleName]
    );
  }
}

async function initializePermissionsSchema() {
  try {
    // Create table once and preserve existing permission rows across restarts.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS role_permissions (
        id SERIAL PRIMARY KEY,
        role_name VARCHAR(50) UNIQUE NOT NULL,
        recipes BOOLEAN DEFAULT false,
        browse_practicals BOOLEAN DEFAULT false,
        add_recipes BOOLEAN DEFAULT false,
        inventory BOOLEAN DEFAULT false,
        shopping BOOLEAN DEFAULT false,
        place_order BOOLEAN DEFAULT false,
        booking BOOLEAN DEFAULT false,
        food_truck BOOLEAN DEFAULT false,
        ft_teacher BOOLEAN DEFAULT false,
        planning BOOLEAN DEFAULT false,
        admin BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Ensure planning column exists for pre-existing databases.
    await pool.query('ALTER TABLE role_permissions ADD COLUMN IF NOT EXISTS planning BOOLEAN DEFAULT false');
    await pool.query('ALTER TABLE role_permissions ADD COLUMN IF NOT EXISTS food_truck BOOLEAN DEFAULT false');
    await pool.query('ALTER TABLE role_permissions ADD COLUMN IF NOT EXISTS ft_teacher BOOLEAN DEFAULT false');
    await pool.query('ALTER TABLE role_permissions ADD COLUMN IF NOT EXISTS browse_practicals BOOLEAN DEFAULT false');
    await pool.query('ALTER TABLE role_permissions ADD COLUMN IF NOT EXISTS place_order BOOLEAN DEFAULT false');

    // Normalize duplicate/mixed-case role names into canonical role rows.
    await normalizeKnownRoleRows();

    // Keep bootstrap defaults sensible for existing rows.
    await pool.query("UPDATE role_permissions SET food_truck = true, ft_teacher = true WHERE role_name IN ('admin','lead_teacher','teacher')");
    await pool.query("UPDATE role_permissions SET place_order = true WHERE role_name IN ('admin','lead_teacher','teacher')");
    await pool.query("UPDATE role_permissions SET food_truck = true WHERE role_name = 'student'");
    await pool.query("UPDATE role_permissions SET recipes = true WHERE role_name IN ('admin','lead_teacher','teacher','technician','student','staff')");
    await pool.query("UPDATE role_permissions SET browse_practicals = true WHERE role_name IN ('admin','lead_teacher','teacher','technician','student','staff')");

    // Ensure all known roles exist without overwriting custom values.
    for (const [roleName, permissions] of Object.entries(DEFAULT_ROLES)) {
      await pool.query(`
        INSERT INTO role_permissions (role_name, recipes, browse_practicals, add_recipes, inventory, shopping, place_order, booking, food_truck, ft_teacher, planning, admin)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (role_name) DO NOTHING
      `, [
        roleName,
        permissions.recipes,
        permissions.browse_practicals,
        permissions.add_recipes,
        permissions.inventory,
        permissions.shopping,
        permissions.place_order,
        permissions.booking,
        permissions.food_truck,
        permissions.ft_teacher,
        permissions.planning,
        permissions.admin
      ]);
    }

    schemaAvailable = true;
    console.log('[PERMISSIONS] Schema ready');
    return true;
  } catch (err) {
    schemaAvailable = false;
    console.error('[PERMISSIONS] Schema initialization error:', err);
    return false;
  }
}

async function ensureSchemaReady() {
  if (schemaAvailable) return true;

  const now = Date.now();
  const shouldRetry = !schemaReadyPromise || (now - lastSchemaInitAttempt) > SCHEMA_INIT_RETRY_MS;
  if (shouldRetry) {
    lastSchemaInitAttempt = now;
    schemaReadyPromise = initializePermissionsSchema();
  }

  return schemaReadyPromise;
}

// Kick off initialization without crashing startup if DB is temporarily unavailable.
ensureSchemaReady().catch((err) => {
  console.error('[PERMISSIONS] Unexpected schema initialization error:', err);
});

// GET /api/permissions - Fetch all role permissions
router.get('/all', async (req, res) => {
  try {
    const ready = await ensureSchemaReady();
    if (!ready) {
      return res.json({
        success: true,
        degraded: true,
        warning: 'Permissions database is temporarily unavailable. Showing default permissions.',
        roles: buildDefaultRolesRows(),
        routes: ROUTES
      });
    }

    const result = await pool.query(`
      SELECT role_name, recipes, browse_practicals, add_recipes, inventory, shopping, place_order, booking, food_truck, ft_teacher, planning, admin
      FROM role_permissions
      ORDER BY CASE 
        WHEN role_name = 'admin' THEN 1
        WHEN role_name = 'lead_teacher' THEN 2
        WHEN role_name = 'teacher' THEN 3
        WHEN role_name = 'technician' THEN 4
        WHEN role_name = 'staff' THEN 5
        WHEN role_name = 'student' THEN 6
        WHEN role_name = 'public_access' THEN 7
        ELSE 99
      END
    `);

    res.json({ success: true, roles: result.rows, routes: ROUTES });
  } catch (err) {
    console.error('[PERMISSIONS] Error fetching permissions:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/permissions/:roleName - Update permissions for a role
router.put('/:roleName', requireAdmin, async (req, res) => {
  const roleName = req.params.roleName;
  const permissions = req.body;

  if (!DEFAULT_ROLES[roleName]) {
    return res.status(400).json({ success: false, error: 'Invalid role name' });
  }

  try {
    const ready = await ensureSchemaReady();
    if (!ready) {
      return res.status(503).json({
        success: false,
        error: 'Permissions database is temporarily unavailable. Please try again shortly.'
      });
    }
    
    await pool.query(`
      UPDATE role_permissions
      SET recipes = $1, browse_practicals = $2, add_recipes = $3, inventory = $4, shopping = $5, place_order = $6, booking = $7, food_truck = $8, ft_teacher = $9, planning = $10, admin = $11,
          updated_at = CURRENT_TIMESTAMP
      WHERE role_name = $12
    `, [
      permissions.recipes || false,
      permissions.browse_practicals || false,
      permissions.add_recipes || false,
      permissions.inventory || false,
      permissions.shopping || false,
      permissions.place_order || false,
      permissions.booking || false,
      permissions.food_truck || false,
      permissions.ft_teacher || false,
      permissions.planning || false,
      permissions.admin || false,
      roleName
    ]);

    res.json({ success: true, message: `Permissions for ${roleName} updated successfully` });
  } catch (err) {
    console.error('[PERMISSIONS] Error updating permissions:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/permissions/reset - Reset to default permissions
router.post('/reset', requireAdmin, async (req, res) => {
  try {
    const ready = await ensureSchemaReady();
    if (!ready) {
      return res.status(503).json({
        success: false,
        error: 'Permissions database is temporarily unavailable. Please try again shortly.'
      });
    }

    await pool.query('TRUNCATE TABLE role_permissions RESTART IDENTITY');

    for (const [roleName, permissions] of Object.entries(DEFAULT_ROLES)) {
      await pool.query(`
        INSERT INTO role_permissions (role_name, recipes, browse_practicals, add_recipes, inventory, shopping, place_order, booking, food_truck, ft_teacher, planning, admin)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `, [
        roleName,
        permissions.recipes,
        permissions.browse_practicals,
        permissions.add_recipes,
        permissions.inventory,
        permissions.shopping,
        permissions.place_order,
        permissions.booking,
        permissions.food_truck,
        permissions.ft_teacher,
        permissions.planning,
        permissions.admin
      ]);
    }

    res.json({ success: true, message: 'Permissions reset to defaults' });
  } catch (err) {
    console.error('[PERMISSIONS] Error resetting permissions:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
