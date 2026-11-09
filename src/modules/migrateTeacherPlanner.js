require('dotenv').config();
const { databaseOptions } = require('./teacherPlanner');
const { migrate } = require('../legacy/teacher-planner/migrate');

async function run() {
  const { connectionString, ssl } = databaseOptions();
  await migrate({ connectionString, ssl });
  console.log('Teacher Planner database migrations complete.');
}

run().catch(() => {
  console.error('Teacher Planner migration failed. Check the separate Planner connection and migration files; Core and Kamar must not be used.');
  process.exitCode = 1;
});
