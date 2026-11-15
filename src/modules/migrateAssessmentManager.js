require('dotenv').config();
const { databaseOptions } = require('./assessmentManager');
const { migrate } = require('../legacy/assessment-manager/migrate');

async function run() {
  const { connectionString, ssl } = databaseOptions();
  await migrate({ connectionString, ssl });
  console.log('Assessment Manager database migrations complete.');
}

run().catch(() => {
  console.error('Assessment Manager migration failed. Check the separate Assessment Manager connection and migration files; Core, KAMAR and Teacher Planner must not be used.');
  process.exitCode = 1;
});
