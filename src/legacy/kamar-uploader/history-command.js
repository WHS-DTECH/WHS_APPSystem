require('dotenv').config();
const { Client } = require('pg');
const { databaseOptions } = require('./db');
const { migrate } = require('./history');
const { planArchive, importArchive } = require('./archive');

async function run(args) {
  const [command, ...options] = args;
  const allowed = command === 'migrate' ? [] : ['--root', '--year', '--term', '--apply'];
  const flags = new Map();
  for (let index = 0; index < options.length; index++) {
    const option = options[index];
    if (!allowed.includes(option) || flags.has(option)) throw new Error('Unknown or repeated command option.');
    if (option === '--apply') flags.set(option, true);
    else {
      if (!options[index + 1] || options[index + 1].startsWith('--')) throw new Error('Missing option value.');
      flags.set(option, options[++index]);
    }
  }
  if (!['migrate', 'import'].includes(command)) throw new Error('Use migrate, or import --root <folder> --year <year> [--term 1-4] [--apply].');
  let plan;
  if (command === 'import') {
    const year = Number(flags.get('--year')), term = flags.has('--term') ? Number(flags.get('--term')) : undefined;
    if (!flags.get('--root') || !Number.isInteger(year) || year < 2000 || year > 2100 ||
      term !== undefined && (!Number.isInteger(term) || term < 1 || term > 4)) throw new Error('Choose a root folder, valid year and optional term (1-4).');
    plan = await planArchive(flags.get('--root'), year, term);
    console.log(JSON.stringify({ mode: flags.has('--apply') ? 'apply' : 'dry-run',
      datasets: plan.datasets.map(({ dataset, warnings }) => ({ name: dataset.name, type: dataset.type,
        year: dataset.year, term: dataset.term, date: dataset.date, time: dataset.time, rows: dataset.payload.rows.length, warnings })),
      excluded: plan.excluded }, null, 2));
    if (!flags.has('--apply')) return;
  }
  const client = new Client(databaseOptions());
  await client.connect();
  try {
    if (command === 'migrate') {
      await migrate(client);
      console.log('Kamar immutable dataset history is ready. Existing rows were preserved; current feeds are unchanged.');
    } else {
      const results = await importArchive(client, plan);
      console.log(`Archived ${results.filter(result => result.inserted).length} new datasets; ${results.filter(result => !result.inserted).length} already stored. Current feeds and statuses were not changed.`);
    }
  } finally { await client.end(); }
}
if (require.main === module) run(process.argv.slice(2)).catch(error => {
  // Provider errors can contain private row values or connection details.
  console.error(error.code ? 'Kamar history operation failed (' + error.code + '). Check migration/access; no current datasets were replaced.' :
    error.message);
  process.exitCode = 1;
});
module.exports = { run };
