const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const config = require('./config');

const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.isProduction ? { rejectUnauthorized: false } : false
});

async function query(text, params = []) {
  return pool.query(text, params);
}

async function runMigrations() {
  await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const migrationsDir = path.join(__dirname, '..', 'migrations');
  const files = fs.readdirSync(migrationsDir).filter((file) => file.endsWith('.sql')).sort();

  for (const file of files) {
    const alreadyApplied = await query('SELECT 1 FROM schema_migrations WHERE id = $1', [file]);

    if (alreadyApplied.rowCount > 0) {
      continue;
    }

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    await query('BEGIN');
    try {
      await query(sql);
      await query('INSERT INTO schema_migrations (id) VALUES ($1)', [file]);
      await query('COMMIT');
      console.log(`Applied migration ${file}`);
    } catch (error) {
      await query('ROLLBACK');
      throw error;
    }
  }
}

module.exports = {
  pool,
  query,
  runMigrations
};
