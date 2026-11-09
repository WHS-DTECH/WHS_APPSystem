const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const TYPES = ['staff', 'student_details', 'student_timetable', 'teacher_timetable', 'subjects'];
const ROUTES = {
  '/api/staff_upload': ['staff', 'staff'],
  '/api/student_details_upload': ['student_details', 'students'],
  '/api/student_upload': ['student_timetable', 'students'],
  '/api/upload_timetable': ['teacher_timetable', 'timetable']
};
function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
function validate(dataset) {
  const { type, year, term, date, time, name, payload, origin } = dataset;
  if (!TYPES.includes(type) || !Number.isInteger(year) || year < 2000 || year > 2100 ||
    !Number.isInteger(term) || term < 1 || term > 4 || !validDate(date) || Number(date.slice(0, 4)) !== year ||
    typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(time) ||
    typeof name !== 'string' || !name.trim() || name.length > 255 || !['archive', 'upload'].includes(origin) ||
    !payload || !Array.isArray(payload.headers) || !payload.headers.length ||
    payload.headers.some(header => typeof header !== 'string') ||
    !Array.isArray(payload.rows) || !payload.rows.length || payload.rows.length > 20000 ||
    payload.rows.some(row => !Array.isArray(row) || row.length !== payload.headers.length ||
      row.some(value => typeof value !== 'string')) ||
    Buffer.byteLength(JSON.stringify(payload)) > 25 * 1024 * 1024 ||
    (dataset.rawCsv !== undefined && (typeof dataset.rawCsv !== 'string' || Buffer.byteLength(dataset.rawCsv) > 25 * 1024 * 1024))) {
    throw Object.assign(new Error('Choose a nonempty dataset with valid year, term, export date and CSV columns. No data has been changed.'), { status: 400 });
  }
}
function fromRequest(req) {
  const definition = ROUTES[req.path.toLowerCase().replace(/\/$/, '')];
  if (!definition) return null;
  const [type, field] = definition, body = req.body || {};
  const term = /^(?:Term\s+)?([1-4])$/i.exec(String(body.uploadTerm || '').trim());
  const dataset = { type, year: Number(body.uploadYear), term: term ? Number(term[1]) : NaN,
    date: body.uploadDate, time: '00:00:00', name: type + '-upload',
    payload: { headers: body.headers, rows: body[field] }, origin: 'upload' };
  validate(dataset);
  return dataset;
}
async function saveDataset(client, dataset) {
  validate(dataset);
  // Hash source data and export coordinates, not its local path or import time.
  const hash = crypto.createHash('sha256').update(JSON.stringify([
    dataset.type, dataset.year, dataset.term, dataset.date, dataset.time, dataset.name, dataset.payload, dataset.rawCsv ?? null
  ])).digest('hex');
  const result = await client.query(`INSERT INTO kamar_datasets
    (id,dataset_type,school_year,term,source_date,source_time,source_name,content_hash,payload,raw_csv,row_count,origin)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12)
    ON CONFLICT (content_hash) DO NOTHING RETURNING id`,
  [crypto.randomUUID(), dataset.type, dataset.year, dataset.term, dataset.date, dataset.time,
    dataset.name, hash, JSON.stringify(dataset.payload), dataset.rawCsv ?? null, dataset.payload.rows.length, dataset.origin]);
  const id = result.rows[0]?.id || (await client.query('SELECT id FROM kamar_datasets WHERE content_hash=$1', [hash])).rows[0].id;
  return { id, inserted: result.rows.length === 1 };
}
async function migrate(client) {
  await client.query('BEGIN');
  try {
    await client.query('SELECT pg_advisory_xact_lock(1377474882)');
    await client.query(`CREATE TABLE IF NOT EXISTS kamar_history_migrations
      (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
    const name = '001_immutable_datasets';
    if (!(await client.query('SELECT 1 FROM kamar_history_migrations WHERE name=$1', [name])).rows.length) {
      await client.query(await fs.readFile(path.join(__dirname, 'history.sql'), 'utf8'));
      await client.query('INSERT INTO kamar_history_migrations(name) VALUES ($1)', [name]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

module.exports = { TYPES, ROUTES, validate, fromRequest, saveDataset, migrate };
