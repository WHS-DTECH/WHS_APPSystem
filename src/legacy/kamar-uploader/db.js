const { Pool } = require('pg');
const config = require('../../config');

function databaseOptions(env = process.env, coreUrl = config.databaseUrl) {
  const connectionString = env.INTEGRATION_KAMAR_DATABASE_URL;
  if (!connectionString) {
    throw new Error('Set INTEGRATION_KAMAR_DATABASE_URL to the existing Kamar Uploader database. No fallback database is used.');
  }
  const target = new URL(connectionString);
  if (!['postgres:', 'postgresql:'].includes(target.protocol) || !target.hostname || target.pathname === '/') {
    throw new Error('INTEGRATION_KAMAR_DATABASE_URL must identify the existing PostgreSQL database.');
  }
  if (coreUrl) {
    const core = new URL(coreUrl);
    if (target.hostname === core.hostname && (target.port || '5432') === (core.port || '5432') &&
        target.pathname === core.pathname) {
      throw new Error('Kamar Uploader must use its own existing database, not Global Control DATABASE_URL.');
    }
  }
  return {
    connectionString,
    ssl: env.KAMAR_DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
    max: 5,
    connectionTimeoutMillis: 10000
  };
}

let database;
function getPool() {
  if (!database) {
    database = new Pool(databaseOptions());
    database.on('error', () => console.error('Kamar Uploader idle database connection failed.'));
  }
  return database;
}

const pool = {
  query: (...args) => getPool().query(...args),
  connect: (...args) => getPool().connect(...args)
};
module.exports = { pool, query: (...args) => pool.query(...args), databaseOptions };
