const { pool, runMigrations } = require('./db');

runMigrations()
  .then(() => {
    console.log('Database migrations complete.');
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
