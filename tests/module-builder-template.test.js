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

test('generated server checks its separate DB and redirects only to Global Control with state and PKCE', {
  skip: !process.env.MODULE_BUILDER_TEST_DATABASE_URL
}, async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'whs-wizard-template-'));
  const template = path.join(__dirname, '..', 'module-templates', 'node');
  const children = [];
  async function start(extra = {}, preload) {
    const child = spawn(process.execPath, [...(preload ? ['--require', preload] : []), path.join(directory, 'server.js')], {
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
      let errors = '';
      child.stderr.on('data', (data) => { errors += data.toString(); });
      const timer = setTimeout(() => reject(new Error('Generated server startup timed out.')), 15000);
      child.on('error', (error) => { clearTimeout(timer); reject(error); });
      child.on('exit', (code) => { if (code) { clearTimeout(timer); reject(new Error(`Generated server exited ${code}: ${errors}`)); } });
      child.stdout.on('data', (data) => {
        output += data.toString();
        const match = output.match(/Module listening on port (\d+)/);
        if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); }
      });
    });
  }
  try {
    for (const name of ['app.js', 'server.js', 'shell.js', 'app.test.js']) {
      await fs.writeFile(path.join(directory, name), (await fs.readFile(path.join(template, `${name}.template`), 'utf8'))
        .replaceAll('__MODULE_SLUG__', 'test-module').replaceAll('__FRAMEWORK_UPDATED_AT__', '2026-10-18T02:00:00.000Z'));
    }
    await fs.mkdir(path.join(directory, 'public'));
    for (const name of ['global-nav.js', 'account-controls.css', 'module-shell.css']) {
      await fs.copyFile(path.join(__dirname, '..', 'public', name), path.join(directory, 'public', name));
    }
    await fs.copyFile(path.join(__dirname, '..', 'public', 'images', 'whs logo circular reo .png'), path.join(directory, 'public', 'whs-logo.png'));
    await promisify(execFile)(process.execPath, ['--test', path.join(directory, 'app.test.js')], {
      env: {PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,NODE_PATH:path.join(__dirname,'..','node_modules')},
      timeout:15000
    });
    let base = await start();
    assert.equal((await fetch(base + '/health')).status, 200);
    let response = await fetch(base);
    assert.equal(response.status, 503);
    assert.match(await response.text(), /TEST DATA ONLY/);
    base = await start({
      SESSION_SECRET: 'isolated-template-session-secret',
      GLOBAL_CONTROL_URL: 'https://core.example.test', MODULE_CLIENT_ID: 'test-module:development',
      RENDER_EXTERNAL_URL: 'https://fixture.onrender.com'
    });
    assert.equal((await fetch(base + '/health')).status, 200);
    response = await fetch(base, { redirect: 'manual' });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), '/auth/global-control');
    response = await fetch(base + '/auth/global-control', { redirect: 'manual' });
    const destination = new URL(response.headers.get('location'));
    assert.equal(destination.hostname, 'core.example.test');
    assert.equal(destination.pathname, '/module-auth/authorize');
    assert.equal(destination.searchParams.get('redirect_uri'), 'https://fixture.onrender.com/auth/global-control/callback');
    assert.equal(destination.searchParams.get('client_id'), 'test-module:development');
    assert.equal(destination.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(destination.searchParams.get('code_challenge').length, 43);
    assert.ok(destination.searchParams.get('state'));
    response = await fetch(base + '/auth/global-control/callback?code=bad&state=bad', { redirect: 'manual' });
    assert.equal(response.status, 403);
    const preload = path.join(directory, 'core-fixture.js');
    await fs.writeFile(preload, `
      let identityChecks = 0;
      global.fetch = async (url, options) => {
        const body = JSON.parse(options.body);
        if (body.client_id !== 'test-module:development') throw new Error('Wrong client.');
        if (String(url).endsWith('/token')) {
          if (!/^[A-Za-z0-9_-]{43}$/.test(body.code_verifier) || body.redirect_uri !== 'https://fixture.onrender.com/auth/global-control/callback') throw new Error('Invalid exchange.');
          return Response.json({access_token:'A'.repeat(43)});
        }
        if (options.headers.Authorization !== 'Bearer ' + 'A'.repeat(43)) throw new Error('Missing token.');
        if (String(url).endsWith('/search')) return Response.json({results:[{title:'Dashboard',url:'/dashboard',kind:'Page'}],truncated:false});
        if (String(url).endsWith('/revoke')) return Response.json({signedOut:true});
        identityChecks++;
        if (identityChecks === 7) return new Response('', {status:503});
        if (identityChecks === 8) return new Response('', {status:401});
        return Response.json({id:'fixture-admin',email:'admin@example.test',display_name:'Fixture Admin',avatar_url:'https://lh3.googleusercontent.com/test',
          roles:process.env.FIXTURE_MODULE_ROLE ? ['Teacher'] : ['ADMIN'],
          module_roles:process.env.FIXTURE_MODULE_ROLE ? [process.env.FIXTURE_MODULE_ROLE] : []});
      };`);
    base = await start({
      SESSION_SECRET: 'isolated-template-session-secret', GLOBAL_CONTROL_URL: 'https://core.example.test',
      MODULE_CLIENT_ID: 'test-module:development', RENDER_EXTERNAL_URL: 'https://fixture.onrender.com'
    }, preload);
    response = await fetch(base + '/auth/global-control', { redirect: 'manual' });
    const pendingCookie = response.headers.get('set-cookie').split(';')[0];
    const authState = new URL(response.headers.get('location')).searchParams.get('state');
    response = await fetch(base + '/auth/global-control/callback?' + new URLSearchParams({code:'C'.repeat(43),state:authState}), {
      redirect:'manual', headers:{cookie:pendingCookie}
    });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), '/');
    const signedInCookie = response.headers.get('set-cookie').split(';')[0];
    assert.notEqual(signedInCookie, pendingCookie);
    response = await fetch(base, {redirect:'manual',headers:{cookie:signedInCookie}});
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /<main class="whs-module-main"/);
    assert.match(html, /framework\/whs-logo.png/);
    assert.match(html, /18 October 2026/);
    assert.match(html, /name="whs-global-control"/);
    assert.match(response.headers.get('content-security-policy'), /https:\/\/core.example.test/);
    response = await fetch(base + '/nav-data',{headers:{cookie:signedInCookie}});
    const account = await response.json();
    assert.equal(account.name,'Fixture Admin');
    assert.equal(account.searchModule.label,'Global Control');
    response = await fetch(base + '/module-search?q=Dashboard',{headers:{cookie:signedInCookie}});
    assert.equal((await response.json()).results[0].url,'/dashboard');
    response = await fetch(base + '/framework/global-nav.js',{headers:{cookie:signedInCookie}});
    assert.equal(response.status,200);
    assert.match(await response.text(),/whs-global-control/);
    response = await fetch(base, {redirect:'manual',headers:{'x-user-email':'admin@example.test','x-user-role':'ADMIN'}});
    assert.equal(response.status, 302);
    response = await fetch(base + '/api/example', {method:'POST',redirect:'manual',headers:{cookie:signedInCookie,origin:'https://evil.example'}});
    assert.equal(response.status, 403);
    response = await fetch(base + '/framework/module-shell.css',{headers:{cookie:signedInCookie}});
    assert.equal(response.status,200);
    response = await fetch(base + '/framework/whs-logo.png',{headers:{cookie:signedInCookie}});
    assert.equal(response.status,200);
    assert.match(response.headers.get('content-type'), /image\/png/);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()),await fs.readFile(path.join(directory,'public','whs-logo.png')));
    response = await fetch(base, {redirect:'manual',headers:{cookie:signedInCookie}});
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {error:'Module request failed. Contact the project owner.'});
    response = await fetch(base, {redirect:'manual',headers:{cookie:signedInCookie}});
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), '/auth/global-control');
    response = await fetch(base + '/logout',{method:'POST',headers:{cookie:signedInCookie,origin:'https://fixture.onrender.com'}});
    assert.equal(response.status,200,'expired local identity can still sign out');
    response = await fetch(base + '/auth/global-control',{redirect:'manual'});
    const renewedCookie = response.headers.get('set-cookie').split(';')[0];
    const renewedState = new URL(response.headers.get('location')).searchParams.get('state');
    response = await fetch(base + '/auth/global-control/callback?' + new URLSearchParams({code:'C'.repeat(43),state:renewedState}), {
      redirect:'manual',headers:{cookie:renewedCookie}
    });
    const logoutCookie = response.headers.get('set-cookie').split(';')[0];
    response = await fetch(base + '/logout',{method:'POST',headers:{cookie:logoutCookie,origin:'https://fixture.onrender.com'}});
    assert.equal(response.status,200);
    assert.deepEqual(await response.json(),{signedOut:true});
    response = await fetch(base, {redirect:'manual',headers:{cookie:logoutCookie}});
    assert.equal(response.status,302);
    for (const role of ['teacher','technician','lead-teacher']) {
      base = await start({
        SESSION_SECRET: 'isolated-module-role-session',
        GLOBAL_CONTROL_URL: 'https://core.example.test', MODULE_CLIENT_ID: 'test-module:development',
        APP_BASE_URL: 'https://fixture.onrender.com', FIXTURE_MODULE_ROLE: role
      }, preload);
      response = await fetch(base + '/auth/global-control', {redirect:'manual'});
      const cookie = response.headers.get('set-cookie').split(';')[0];
      const state = new URL(response.headers.get('location')).searchParams.get('state');
      response = await fetch(base + '/auth/global-control/callback?' + new URLSearchParams({code:'C'.repeat(43),state}), {
        redirect:'manual',headers:{cookie}
      });
      assert.equal(response.status,302);
      const signedIn = response.headers.get('set-cookie').split(';')[0];
      response = await fetch(base + '/nav-data',{headers:{cookie:signedIn}});
      assert.equal(response.status,200);
      const nav = await response.json();
      assert.equal(nav.isAdmin,false);
      assert.equal(nav.assignRolesUrl,role==='lead-teacher' ? 'https://core.example.test/hubs/test-module/roles' : null);
      assert.equal((await fetch(base,{headers:{cookie:signedIn}})).status,200);
    }
  } finally {
    for (const child of children) {
      if (child.exitCode !== null) continue;
      await new Promise((resolve) => { child.once('exit', resolve); child.kill(); });
    }
    await fs.rm(directory, { recursive: true });
  }
});
