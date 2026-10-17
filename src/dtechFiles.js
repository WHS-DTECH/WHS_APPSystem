const fs = require('fs/promises');
const path = require('path');

const MAX_FILE_BYTES = 25 * 1024 * 1024;

function safeFile(value) {
  if (typeof value !== 'string' || !value || value.length > 500 || /[\\:\x00-\x1f]/.test(value)
    || value.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error('Invalid DTECH teaching file path.');
  }
  return value;
}

function createTeachingFileStore({ pool, directory, archive }) {
  async function cache(name, bytes) {
    const filename = path.join(directory, ...safeFile(name).split('/'));
    await fs.mkdir(path.dirname(filename), { recursive: true });
    await fs.writeFile(filename, bytes);
  }

  async function initialize() {
    await pool.query(`CREATE TABLE IF NOT EXISTS whs_teaching_files (
      path TEXT PRIMARY KEY, content BYTEA NOT NULL, content_type TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    let count = 0;
    for await (const file of archive.teachingFiles()) {
      await cache(file.path, file.bytes);
      count++;
    }
    // New uploads take precedence over the original archive at the same path.
    const listing = await pool.query('SELECT path FROM whs_teaching_files ORDER BY path');
    for (const row of listing.rows) {
      const file = (await pool.query('SELECT content FROM whs_teaching_files WHERE path = $1', [row.path])).rows[0];
      if (!file) throw new Error('DTECH upload changed during restore; retry initialization.');
      await cache(row.path, file.content);
    }
    return count;
  }

  async function save(name, bytes, contentType = 'application/octet-stream') {
    safeFile(name);
    if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > MAX_FILE_BYTES) {
      throw new Error('DTECH uploads must contain between 1 byte and 25 MiB.');
    }
    await pool.query(`INSERT INTO whs_teaching_files (path, content, content_type) VALUES ($1, $2, $3)
      ON CONFLICT (path) DO UPDATE SET content = EXCLUDED.content, content_type = EXCLUDED.content_type, updated_at = NOW()`,
    [name, bytes, contentType]);
    await cache(name, bytes);
  }

  return { initialize, save };
}

module.exports = { createTeachingFileStore, safeFile, MAX_FILE_BYTES };
