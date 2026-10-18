const fs = require('fs/promises');
const path = require('path');
const { Client } = require('pg');

async function migrate() {
  if (!process.env.DATABASE_URL) throw new Error('A separate module DATABASE_URL is required.');
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false }
  });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(1377474881)');
    await client.query('CREATE TABLE IF NOT EXISTS module_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT NOW())');
    const directory = path.join(__dirname, 'db', 'migrations');
    for (const name of (await fs.readdir(directory)).filter((name) => name.endsWith('.sql')).sort()) {
      if ((await client.query('SELECT 1 FROM module_migrations WHERE name=$1', [name])).rows.length) continue;
      await client.query(await fs.readFile(path.join(directory, name), 'utf8'));
      await client.query('INSERT INTO module_migrations(name) VALUES ($1)', [name]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { await client.end(); }
}

if (require.main === module) {
  migrate().catch(() => { console.error('Module migration failed. Check database access and migration files.'); process.exitCode = 1; });
}
module.exports = { migrate };
