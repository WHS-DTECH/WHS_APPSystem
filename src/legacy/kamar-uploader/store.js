const { Pool } = require('pg');
const { pool } = require('../../db');
const appConfig = require('../../config');

const IMPORT_TABLES = [
  'staff_upload',
  'student_details_upload',
  'student_upload',
  'timetable_upload',
  'app_project_links'
];

const PERIODS = ['p1_1', 'p1_2', 'p2', 'i', 'p3', 'p4', 'l', 'p5'];
const STUDENT_PERIOD_COLUMNS = ['mon', 'tue', 'wed', 'thu', 'fri']
  .flatMap((day) => PERIODS.map((period) => `${day}_${period} TEXT`))
  .join(',\n    ');

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS staff_upload (
    id BIGSERIAL PRIMARY KEY,
    code TEXT,
    last_name TEXT,
    first_name TEXT,
    title TEXT,
    email_school TEXT UNIQUE,
    status TEXT NOT NULL DEFAULT 'Current',
    upload_year INTEGER,
    upload_term TEXT,
    upload_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS student_details_upload (
    id BIGSERIAL PRIMARY KEY,
    id_number TEXT UNIQUE,
    last_name TEXT,
    first_name TEXT,
    gender TEXT,
    year_level TEXT,
    tutor TEXT,
    timetable_class TEXT,
    email_school TEXT,
    status TEXT NOT NULL DEFAULT 'Current',
    upload_year INTEGER,
    upload_term TEXT,
    upload_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS student_upload (
    id BIGSERIAL PRIMARY KEY,
    student_name TEXT,
    id_number TEXT UNIQUE,
    email_school TEXT,
    form_class TEXT,
    year_level TEXT,
    ${STUDENT_PERIOD_COLUMNS},
    status TEXT NOT NULL DEFAULT 'Current',
    upload_year INTEGER,
    upload_term TEXT,
    upload_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS timetable_upload (
    teacher TEXT PRIMARY KEY,
    teacher_name TEXT,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'Current',
    upload_year INTEGER,
    upload_term TEXT,
    upload_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS app_project_links (
    id BIGSERIAL PRIMARY KEY,
    site_name TEXT NOT NULL,
    site_url TEXT NOT NULL,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS kamar_legacy_import (
    source TEXT PRIMARY KEY,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    details JSONB
  );
`;

let initPromise = null;

function legacyDatabaseUrl() {
  return appConfig.legacyKamarDatabaseUrl || appConfig.legacyLearningSitesDatabaseUrl || null;
}

function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function toParam(value) {
  if (value && typeof value === 'object' && !(value instanceof Date) && !Buffer.isBuffer(value)) {
    return JSON.stringify(value);
  }

  return value;
}

async function copyTable(source, client, table) {
  const exists = await source.query('SELECT to_regclass($1) IS NOT NULL AS present', [`public.${table}`]);
  if (!exists.rows[0].present) return 0;

  const { rows } = await source.query(`SELECT * FROM ${quoteIdent(table)}`);
  const target = await client.query(
    'SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1',
    [table]
  );
  const targetColumns = new Set(target.rows.map((row) => row.column_name));

  for (const row of rows) {
    const columns = Object.keys(row).filter((column) => targetColumns.has(column) && column !== 'id');
    if (!columns.length) continue;

    await client.query(
      `INSERT INTO ${quoteIdent(table)} (${columns.map(quoteIdent).join(', ')})
       VALUES (${columns.map((_, index) => `$${index + 1}`).join(', ')})
       ON CONFLICT DO NOTHING`,
      columns.map((column) => toParam(row[column]))
    );
  }

  return rows.length;
}

// One-time copy of the legacy Term 1-3 Kamar data. New uploads only go to the unified database.
async function importLegacyData() {
  const url = legacyDatabaseUrl();
  if (!url) return;

  const done = await pool.query("SELECT 1 FROM kamar_legacy_import WHERE source = 'kamar-uploader'");
  if (done.rowCount > 0) return;

  const source = new Pool({
    connectionString: url,
    ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
    max: 2
  });

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const details = {};
      for (const table of IMPORT_TABLES) {
        details[table] = await copyTable(source, client, table);
      }
      await client.query(
        "INSERT INTO kamar_legacy_import (source, details) VALUES ('kamar-uploader', $1::jsonb)",
        [JSON.stringify(details)]
      );
      await client.query('COMMIT');
      console.log('Kamar legacy import complete:', JSON.stringify(details));
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Kamar legacy import failed; will retry on next start:', error.message);
  } finally {
    await source.end().catch(() => {});
  }
}

function init() {
  if (!initPromise) {
    initPromise = (async () => {
      await pool.query(SCHEMA_SQL);
      await importLegacyData();
    })().catch((error) => {
      initPromise = null;
      throw error;
    });
  }

  return initPromise;
}

module.exports = { init };
