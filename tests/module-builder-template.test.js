const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { Pool } = require('pg');
const crypto = require('crypto');

test('generated migrations are repeatable and failed changes roll back', {
  skip: !process.env.MODULE_BUILDER_TEST_DATABASE_URL
}, async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'whs-wizard-migration-'));
  const schema = `wizard_${crypto.randomUUID().replaceAll('-', '')}`;
  const admin = new Pool({ connectionString: process.env.MODULE_BUILDER_TEST_DATABASE_URL, ssl: false });
  const url = new URL(process.env.MODULE_BUILDER_TEST_DATABASE_URL);
  url.searchParams.set('options', `-c search_path=${schema},public`);
  const pool = new Pool({ connectionString: url.toString(), ssl: false });
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    await fs.mkdir(path.join(directory, 'db', 'migrations'), { recursive: true });
    const template = path.join(__dirname, '..', 'module-templates', 'node');
    await fs.copyFile(path.join(template, 'migrate.js.template'), path.join(directory, 'migrate.js'));
    await fs.copyFile(path.join(template, 'initial.sql.template'), path.join(directory, 'db', 'migrations', '001_initial.sql'));
    const run = () => promisify(execFile)(process.execPath, [path.join(directory, 'migrate.js')], {
      env: {
        PATH: process.env.PATH, SystemRoot: process.env.SystemRoot,
        NODE_PATH: path.join(__dirname, '..', 'node_modules'),
        DATABASE_URL: url.toString(), DATABASE_SSL: 'false'
      }, timeout: 15000
    });
    await run();
    await run();
    assert.equal((await pool.query('SELECT * FROM module_migrations')).rows.length, 1);
    await fs.writeFile(path.join(directory, 'db', 'migrations', '002_invalid.sql'),
      'CREATE TABLE should_rollback(id integer); SELECT * FROM nonexistent_table_for_test;');
    await assert.rejects(run(), /Module migration failed/);
    assert.equal((await pool.query("SELECT to_regclass('should_rollback') AS name")).rows[0].name, null);
    assert.equal((await pool.query('SELECT * FROM module_migrations')).rows.length, 1);
  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
    await fs.rm(directory, { recursive: true });
  }
});

test('generated standalone server checks its separate DB and fails closed until Google is configured', {
  skip: !process.env.MODULE_BUILDER_TEST_DATABASE_URL
}, async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'whs-wizard-template-'));
  const template = path.join(__dirname, '..', 'module-templates', 'node');
  const children = [];
  async function start(extra = {}) {
    const child = spawn(process.execPath, [path.join(directory, 'server.js')], {
      cwd: directory,
      env: {
        PATH: process.env.PATH, SystemRoot: process.env.SystemRoot,
        NODE_PATH: path.join(__dirname, '..', 'node_modules'),
        PORT: '0', DATABASE_URL: process.env.MODULE_BUILDER_TEST_DATABASE_URL, DATABASE_SSL: 'false',
        ...extra
      }, stdio: ['ignore', 'pipe', 'pipe']
    });
    children.push(child);
    return new Promise((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(new Error('Generated server startup timed out.')), 15000);
      child.on('error', (error) => { clearTimeout(timer); reject(error); });
      child.on('exit', (code) => { if (code) { clearTimeout(timer); reject(new Error(`Generated server exited ${code}.`)); } });
      child.stdout.on('data', (data) => {
        output += data.toString();
        const match = output.match(/Module listening on port (\d+)/);
        if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); }
      });
    });
  }
  try {
    for (const name of ['app.js', 'server.js']) {
      await fs.writeFile(path.join(directory, name), (await fs.readFile(path.join(template, `${name}.template`), 'utf8')).replaceAll('__MODULE_SLUG__', 'test-module'));
    }
    let base = await start();
    assert.equal((await fetch(base + '/health')).status, 200);
    let response = await fetch(base);
    assert.equal(response.status, 503);
    assert.match(await response.text(), /TEST DATA ONLY/);
    base = await start({
      SESSION_SECRET: 'isolated-template-session-secret',
      GOOGLE_CLIENT_ID: 'fixture-google-client', GOOGLE_CLIENT_SECRET: 'fixture-google-secret',
      APP_BASE_URL: 'https://fixture.onrender.com', GOOGLE_HOSTED_DOMAIN: 'westlandhigh.school.nz'
    });
    assert.equal((await fetch(base + '/health')).status, 200);
    response = await fetch(base, { redirect: 'manual' });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), '/auth/google');
    response = await fetch(base + '/auth/google', { redirect: 'manual' });
    const destination = new URL(response.headers.get('location'));
    assert.equal(destination.hostname, 'accounts.google.com');
    assert.equal(destination.searchParams.get('redirect_uri'), 'https://fixture.onrender.com/auth/google/callback');
    assert.ok(destination.searchParams.get('state'));
  } finally {
    for (const child of children) {
      if (child.exitCode !== null) continue;
      await new Promise((resolve) => { child.once('exit', resolve); child.kill(); });
    }
    await fs.rm(directory, { recursive: true });
  }
});
