const { Pool } = require('pg');
const config = require('../../config');

// The legacy Food Room tables live in the food_room schema of the app database, so
// names such as classes, permissions and staff_upload never clash with other modules.
const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.isProduction ? { rejectUnauthorized: false } : false
});

pool.on('connect', (client) => {
  client.query('SET search_path TO food_room');
});

pool.on('error', (error) => {
  console.error('[FOOD-ROOM] Idle database client error:', error.message);
});

module.exports = pool;
