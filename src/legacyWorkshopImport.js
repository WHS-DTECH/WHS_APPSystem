const { Pool } = require('pg');
const { pool } = require('./db');
const config = require('./config');

// Order matters: worksheets reference lesson notes.
const tables = [
  'activity_suggestions',
  'uploaded_activities',
  'uploaded_url_ideas',
  'uploaded_assessment_tasks',
  'year_planner_templates',
  'uploaded_lesson_notes',
  'uploaded_worksheets'
];
const userColumns = ['created_by', 'imported_by'];

async function importTable(sourcePool, client, table, userIdMap) {
  const source = await sourcePool.query(`SELECT * FROM ${table}`).catch(() => ({ rows: [] }));
  if (!source.rows.length) return 0;

  const target = await client.query(
    `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
    [table]
  );
  const targetTypes = new Map(target.rows.map((column) => [column.column_name, column.data_type]));
  const columns = Object.keys(source.rows[0]).filter((column) => targetTypes.has(column));

  for (const row of source.rows) {
    const values = columns.map((column) => {
      const value = row[column];
      if (userColumns.includes(column)) return userIdMap.get(value) || null;
      if (targetTypes.get(column) === 'jsonb' && value !== null) return JSON.stringify(value);
      return value;
    });

    await client.query(
      `INSERT INTO ${table} (${columns.join(', ')})
       VALUES (${columns.map((column, index) => `$${index + 1}`).join(', ')})
       ON CONFLICT DO NOTHING`,
      values
    );
  }

  if (columns.includes('id')) {
    await client.query(
      `SELECT setval(pg_get_serial_sequence($1, 'id'), GREATEST((SELECT COALESCE(MAX(id), 0) FROM ${table}), 1))`,
      [table]
    );
  }

  return source.rows.length;
}

async function importLegacyWorkshop() {
  const done = await pool.query('SELECT 1 FROM workshop_legacy_import');
  if (done.rowCount) return;

  if (!config.legacyWorkshopDatabaseUrl) {
    console.warn('Legacy Workshop import skipped: INTEGRATION_WORKSHOP_DATABASE_URL is not configured.');
    return;
  }

  const sourcePool = new Pool({ connectionString: config.legacyWorkshopDatabaseUrl, ssl: { rejectUnauthorized: false }, max: 1 });
  const client = await pool.connect();

  try {
    const legacyUsers = await sourcePool.query('SELECT id, LOWER(email) AS email FROM users').catch(() => ({ rows: [] }));
    const appUsers = await client.query('SELECT id, LOWER(email) AS email FROM users');
    const idByEmail = new Map(appUsers.rows.map((user) => [user.email, user.id]));
    const userIdMap = new Map(legacyUsers.rows.map((user) => [user.id, idByEmail.get(user.email)]));

    await client.query('BEGIN');
    const summary = {};
    for (const table of tables) {
      summary[table] = await importTable(sourcePool, client, table, userIdMap);
    }
    await client.query('INSERT INTO workshop_legacy_import (summary) VALUES ($1)', [JSON.stringify(summary)]);
    await client.query('COMMIT');
    console.log(`Imported legacy Workshop data: ${JSON.stringify(summary)}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await sourcePool.end();
  }
}

module.exports = { importLegacyWorkshop };
