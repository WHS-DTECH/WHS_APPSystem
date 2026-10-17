const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const config = require('./config');

const APPS_DIR = path.join(__dirname, '..', 'hosted-apps');
const HOST_DIR = path.join(APPS_DIR, '_host');
const FIRST_PORT = 5100;
const SLUG = /^[a-z0-9-]+$/;
const PROXY_TOKEN = crypto.randomBytes(24).toString('hex');
const hosted = new Map();

function readManifests() {
  if (!fs.existsSync(APPS_DIR)) return [];
  return fs.readdirSync(APPS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && SLUG.test(entry.name) && fs.existsSync(path.join(APPS_DIR, entry.name, 'app.json')))
    .map((entry) => {
      const manifest = JSON.parse(fs.readFileSync(path.join(APPS_DIR, entry.name, 'app.json'), 'utf8'));
      return { slug: entry.name, dir: path.join(APPS_DIR, entry.name), manifest };
    });
}

const isHosted = (slug) => fs.existsSync(path.join(APPS_DIR, String(slug), 'app.json')) && SLUG.test(String(slug));

function roleConfig(slug) {
  if (!isHosted(slug)) return { defaults: {}, roles: [] };
  const manifest = JSON.parse(fs.readFileSync(path.join(APPS_DIR, slug, 'app.json'), 'utf8'));
  return { defaults: manifest.defaultRoleMap || {}, roles: manifest.roles || [] };
}

// Hosted apps get only what they need. They never see the platform's database or Google secrets.
function appEnvironment(item, port) {
  const env = {
    PATH: process.env.PATH,
    PORT: String(port),
    SCRIPT_NAME: `/apps/${item.slug}`,
    PYTHONPATH: HOST_DIR,
    PYTHONUNBUFFERED: '1',
    WHS_APP_MODULE: item.manifest.module || 'app:app',
    WHS_PROXY_TOKEN: PROXY_TOKEN,
    SECRET_KEY: crypto.createHmac('sha256', config.sessionSecret || 'dev').update(`hosted:${item.slug}`).digest('hex')
  };
  const databaseEnv = item.manifest.databaseEnv;
  if (databaseEnv && process.env[databaseEnv]) env.DATABASE_URL = process.env[databaseEnv];
  Object.entries(item.manifest.env || {}).forEach(([key, value]) => { env[key] = String(value); });
  return env;
}

function launch(item, port, attempt = 0) {
  const python = process.env.PYTHON_BIN;
  const child = spawn(
    python,
    ['-m', 'gunicorn', '--bind', `127.0.0.1:${port}`, '--workers', '2', '--timeout', '60', '--chdir', item.dir, 'whs_host:app'],
    { cwd: item.dir, env: appEnvironment(item, port), stdio: ['ignore', 'inherit', 'inherit'] }
  );
  hosted.set(item.slug, { port, child });
  child.on('exit', (code) => {
    console.error(`[hosted-apps] ${item.slug} stopped (code ${code}).`);
    if (attempt < 5) setTimeout(() => launch(item, port, attempt + 1), 5000 * (attempt + 1));
  });
  child.on('error', (error) => console.error(`[hosted-apps] could not start ${item.slug}:`, error.message));
}

function start() {
  const items = readManifests();
  if (!items.length) return;
  if (!process.env.PYTHON_BIN) {
    console.warn('[hosted-apps] PYTHON_BIN is not set, so hosted Python apps are not started here.');
    return;
  }
  items.forEach((item, index) => launch(item, FIRST_PORT + index));
  console.log(`[hosted-apps] started ${items.map((item) => item.slug).join(', ')}`);
}

function stop() {
  hosted.forEach(({ child }) => child.kill());
}

const STRIPPED_HEADERS = ['host', 'cookie', 'authorization', 'x-whs-token', 'x-whs-user', 'x-whs-role', 'x-whs-name'];

// Forwards the request untouched (uploads included) with the signed-in person's details added.
function proxy(req, res, slug, identity) {
  const target = hosted.get(slug);
  if (!target) {
    return res.status(502).render('error', { title: 'App is starting', message: 'This app is not running yet. Try again in a minute.' });
  }
  const headers = {};
  Object.entries(req.headers).forEach(([key, value]) => { if (!STRIPPED_HEADERS.includes(key)) headers[key] = value; });
  const cookies = String(req.headers.cookie || '').split(';').map((part) => part.trim()).filter((part) => part && !part.startsWith('whs.sid='));
  if (cookies.length) headers.cookie = cookies.join('; ');
  headers['x-whs-token'] = PROXY_TOKEN;
  headers['x-whs-user'] = identity.email;
  headers['x-whs-role'] = identity.role;
  headers['x-whs-name'] = encodeURIComponent(identity.name || '');
  headers['x-forwarded-proto'] = 'https';
  headers['x-forwarded-host'] = req.get('host');

  const upstream = http.request(
    { host: '127.0.0.1', port: target.port, method: req.method, path: req.originalUrl, headers },
    (response) => {
      res.status(response.statusCode);
      Object.entries(response.headers).forEach(([key, value]) => {
        if (value !== undefined) res.setHeader(key, value);
      });
      response.pipe(res);
    }
  );
  upstream.on('error', () => {
    if (!res.headersSent) res.status(502).render('error', { title: 'App is starting', message: 'This app is not running yet. Try again in a minute.' });
  });
  return req.pipe(upstream);
}

module.exports = { start, stop, isHosted, proxy, roleConfig };
