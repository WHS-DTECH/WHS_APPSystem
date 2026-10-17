const { Pool } = require('pg');
const { pool } = require('./db');
const config = require('./config');

// Parents first; rows rejected by a foreign key are retried once after every table has loaded.
const tables = [
  'aisle_category', 'aisle_keywords', 'aisle_master_keywords', 'aisle_master_keyword_categories',
  'aisle_master_keyword_members', 'food_brands', 'department', 'classes', 'staff_upload',
  'staff_upload_history', 'student_timetable', 'kamar_timetable', 'mfood_class_students', 'class_upload',
  'planner_upload_history', 'user_additional_roles', 'role_permissions', 'recipes', 'recipe_display',
  'uploads', 'ingredients_inventory', 'suggestions', 'recipe_subscriptions', 'subscription_notifications',
  'bookings', 'booking_slot_lists', 'booking_slot_assignments', 'booking_recipes',
  'desired_servings_ingredients', 'shopping_plan', 'shopping_plan_classes', 'shopping_plan_items',
  'shopping_plan_item_audit', 'shopping_extras', 'shopping_lists', 'saved_shopping_lists',
  'google_oauth_tokens', 'google_planner_sync_history'
];

const columnTypes = {
  integer: 'integer', bigint: 'bigint', smallint: 'smallint', boolean: 'boolean', numeric: 'numeric',
  real: 'real', 'double precision': 'double precision', date: 'date', json: 'jsonb', jsonb: 'jsonb',
  'timestamp without time zone': 'timestamp', 'timestamp with time zone': 'timestamptz'
};

async function connectSource(url) {
  for (const ssl of [{ rejectUnauthorized: false }, false]) {
    const source = new Pool({ connectionString: url, ssl, max: 1,     connectionTimeoutMillis: 15000, query_timeout: 30000 });
    try {
      await source.query('SELECT 1');
      return source;
    } catch (error) {
          console.warn(`Legacy Food Room import: connection attempt (ssl=${Boolean(ssl)}) failed: ${error.message}`);
      await source.end().catch(() => {});
      if (ssl === false) throw error;
    }
  }
  return null;
}

async function targetColumns(client, table) {
  const result = await client.query(
    `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'food_room' AND table_name = $1`,
    [table]
  );
  return new Map(result.rows.map((column) => [column.column_name, column.data_type]));
}

// The legacy app added columns at runtime, so any column the migration lacks is created here.
async function addMissingColumns(source, client, table, known) {
  const result = await source.query(
    `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
    [table]
  );
  for (const column of result.rows) {
    if (known.has(column.column_name)) continue;
    const type = columnTypes[column.data_type] || 'text';
    await client.query(`ALTER TABLE food_room.${table} ADD COLUMN IF NOT EXISTS "${column.column_name}" ${type}`);
    known.set(column.column_name, type === 'jsonb' ? 'jsonb' : column.data_type);
  }
}

async function insertRow(client, table, columns, types, row) {
  const values = columns.map((column) => {
    const value = row[column];
    if (value !== null && value !== undefined && typeof value === 'object' && /json/.test(types.get(column)) && !(value instanceof Date)) {
      return JSON.stringify(value);
    }
    return value;
  });

  await client.query('SAVEPOINT food_row');
  try {
    await client.query(
      `INSERT INTO food_room.${table} (${columns.map((column) => `"${column}"`).join(', ')})
       VALUES (${columns.map((column, index) => `$${index + 1}`).join(', ')})
       ON CONFLICT DO NOTHING`,
      values
    );
    await client.query('RELEASE SAVEPOINT food_row');
    return true;
  } catch (error) {
    await client.query('ROLLBACK TO SAVEPOINT food_row');
    return false;
  }
}

async function runImport() {
  const done = await pool.query('SELECT summary FROM food_room.food_room_legacy_import');
  const imported = done.rows.some((row) => {
    const summary = typeof row.summary === 'string' ? JSON.parse(row.summary) : row.summary || {};
    return Object.values(summary).some((count) => Number(count) > 0);
  });
  if (imported) {
    console.log('Legacy Food Room import: already imported earlier, nothing to do.');
    return;
  }
  if (done.rowCount) await pool.query('DELETE FROM food_room.food_room_legacy_import');

  if (!config.legacyFoodRoomDatabaseUrl) {
    console.warn('Legacy Food Room import skipped: INTEGRATION_FOOD_ROOM_DATABASE_URL is not configured.');
    return;
  }

  console.log('Legacy Food Room import: connecting to legacy database...');
  const source = await connectSource(config.legacyFoodRoomDatabaseUrl);
  console.log('Legacy Food Room import: connected, copying tables...');
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const summary = {};
    const retry = [];

    for (const table of tables) {
      const rows = await source.query(`SELECT * FROM public."${table}"`).catch((error) => {
        console.warn(`Legacy Food Room import: could not read ${table}: ${error.message}`);
        return { rows: [] };
      });
      summary[table] = 0;
      console.log(`Legacy Food Room import: ${table} has ${rows.rows.length} rows`);
      if (!rows.rows.length) continue;

      const types = await targetColumns(client, table);
      await addMissingColumns(source, client, table, types);
      const columns = Object.keys(rows.rows[0]).filter((column) => types.has(column));

      for (const row of rows.rows) {
        if (await insertRow(client, table, columns, types, row)) summary[table] += 1;
        else retry.push({ table, columns, types, row });
      }
      console.log(`Legacy Food Room import: ${table} done (${summary[table]}/${rows.rows.length})`);
    }

    let skipped = 0;
    for (const item of retry) {
      if (await insertRow(client, item.table, item.columns, item.types, item.row)) summary[item.table] += 1;
      else skipped += 1;
    }

    for (const table of tables) {
      const hasId = await client.query(
        `SELECT 1 FROM information_schema.columns WHERE table_schema = 'food_room' AND table_name = $1 AND column_name = 'id'`,
        [table]
      );
      if (!hasId.rowCount) continue;
      const idColumn = await client.query(
        `SELECT pg_get_serial_sequence($1, 'id') AS sequence`,
        [`food_room.${table}`]
      );
      const sequence = idColumn.rows[0] && idColumn.rows[0].sequence;
      if (sequence) {
        await client.query(
          `SELECT setval($1, GREATEST((SELECT COALESCE(MAX(id), 0) FROM food_room.${table}), 1), (SELECT MAX(id) IS NOT NULL FROM food_room.${table}))`,
          [sequence]
        );
      }
    }

    await client.query('INSERT INTO food_room.food_room_legacy_import (summary) VALUES ($1)', [JSON.stringify(summary)]);
    await client.query('COMMIT');
    console.log(`Imported legacy Food Room data (${skipped} rows skipped): ${JSON.stringify(summary)}`);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
    await source.end().catch(() => {});
  }
}

// Memoised so the legacy routes and schedulers can wait for it instead of racing its transaction.
let importPromise;
function importLegacyFoodRoom() {
  importPromise = importPromise || runImport();
  return importPromise;
}

module.exports = { importLegacyFoodRoom };
