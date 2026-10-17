const crypto = require('crypto');
const express = require('express');
const config = require('./config');
const { query } = require('./db');

const router = express.Router();
const apiRouter = express.Router();

const PLATFORM_ROLES = [
  { key: 'admin', label: 'Administrator (platform ADMIN)' },
  { key: 'builder', label: 'Builder' },
  { key: 'lead-teacher', label: 'Lead Teacher' },
  { key: 'teacher', label: 'Teacher' },
  { key: 'technician', label: 'Technician' },
  { key: 'student', label: 'Student' }
];
const CHOOSABLE_ROLES = PLATFORM_ROLES.filter((role) => !['admin', 'builder'].includes(role.key));
const ROLE_PRIORITY = PLATFORM_ROLES.map((role) => role.key);
const BASE_HUB_ROLES = [
  ['builder', 'Builder', 'The student who built the app.'],
  ['lead-teacher', 'Lead Teacher', 'Manages the app and who holds roles in it.'],
  ['teacher', 'Teacher', 'Uses the app as a teacher.'],
  ['technician', 'Technician', 'Uses assigned technical features in the app.'],
  ['student', 'Student', 'Uses the app as a student.']
];
const CODE_LIFETIME_SECONDS = 120;

const isAdmin = (user) => Boolean(user && user.roles && user.roles.includes('ADMIN'));
const hashSecret = (secret) => crypto.createHash('sha256').update(secret).digest('hex');
const newSecret = () => crypto.randomBytes(24).toString('hex');

function slugify(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

function cleanUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.origin + url.pathname.replace(/\/+$/, '');
  } catch (error) {
    return null;
  }
}

function chosenRoles(value) {
  const picked = [].concat(value || []);
  return ['Builder'].concat(CHOOSABLE_ROLES.filter((role) => picked.includes(role.key)).map((role) => role.label));
}

// Kamar staff list: admins first (the first one is the default), then teachers already chosen as a client, then everyone else.
async function clientChoices() {
  const result = await query(
    `SELECT LOWER(staff.email_school) AS email,
            TRIM(CONCAT_WS(' ', NULLIF(staff.title, ''), staff.first_name, staff.last_name)) AS display_name,
            EXISTS (SELECT 1 FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id
                    WHERE LOWER(u.email) = LOWER(staff.email_school) AND r.name = 'ADMIN') AS is_admin,
            (SELECT COUNT(*) FROM student_apps sa JOIN users u ON u.id = sa.client_user_id
              WHERE LOWER(u.email) = LOWER(staff.email_school))::int AS times_chosen
     FROM kamar.staff staff
     WHERE staff.status = 'Current' AND COALESCE(staff.email_school, '') <> ''
     ORDER BY is_admin DESC, (times_chosen > 0) DESC, times_chosen DESC, staff.last_name, staff.first_name`
  );
  return result.rows;
}

async function findOrCreateUser(email, displayName) {
  const found = await query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);
  if (found.rowCount) return found.rows[0].id;
  const created = await query(
    'INSERT INTO users (email, display_name) VALUES ($1, $2) ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email RETURNING id',
    [email, displayName]
  );
  return created.rows[0].id;
}

async function grantHubRole(app, userId, roleKey, grantedBy) {
  await query(
    `INSERT INTO user_hub_roles (user_id, hub_role_id, granted_by)
     SELECT $1, id, $3 FROM hub_roles WHERE hub_key = $2 AND role_key = $4
     ON CONFLICT DO NOTHING`,
    [userId, app.hub_key, grantedBy, roleKey]
  );
}

async function uniqueSlug(base) {
  let slug = base || 'app';
  for (let n = 2; n < 100; n += 1) {
    const taken = await query('SELECT 1 FROM student_apps WHERE slug = $1', [slug]);
    if (!taken.rowCount) return slug;
    slug = `${base}-${n}`;
  }
  return `${base}-${Date.now()}`;
}

async function seedAppRoles(app) {
  for (const [roleKey, name, description] of BASE_HUB_ROLES) {
    await query(
      `INSERT INTO hub_roles (hub_key, role_key, display_name, description) VALUES ($1, $2, $3, $4)
       ON CONFLICT (hub_key, role_key) DO NOTHING`,
      [app.hub_key, roleKey, name, description]
    );
  }
  await query(
    `INSERT INTO hub_permissions (hub_key, permission_key, label, description) VALUES
       ($1, 'home.view', 'Open the app', 'Sign in to the app.'),
       ($1, 'admin.manage', 'Manage app roles', 'Assign roles to staff and students in this app.')
     ON CONFLICT (hub_key, permission_key) DO NOTHING`,
    [app.hub_key]
  );
  await query(
    `INSERT INTO hub_role_permissions (hub_role_id, hub_permission_id)
     SELECT roles.id, permissions.id
     FROM hub_roles roles
     JOIN hub_permissions permissions ON permissions.hub_key = roles.hub_key
     WHERE roles.hub_key = $1
       AND (roles.role_key = 'lead-teacher' OR permissions.permission_key = 'home.view')
     ON CONFLICT DO NOTHING`,
    [app.hub_key]
  );
}

async function loadApp(slug) {
  const result = await query('SELECT * FROM student_apps WHERE slug = $1', [slug]);
  return result.rows[0] || null;
}

const canManage = (user, app) => isAdmin(user) || (app.owner_user_id && app.owner_user_id === user.id);

async function userPlatformRoles(user, app) {
  const roles = new Set();
  if (isAdmin(user)) roles.add('admin');
  const result = await query(
    `SELECT hub_roles.role_key FROM user_hub_roles
     JOIN hub_roles ON hub_roles.id = user_hub_roles.hub_role_id
     WHERE user_hub_roles.user_id = $1 AND hub_roles.hub_key = $2`,
    [user.id, app.hub_key]
  );
  result.rows.forEach((row) => roles.add(row.role_key));
  return ROLE_PRIORITY.filter((role) => roles.has(role));
}

async function resolveAppRole(app, platformRoles) {
  const map = await query('SELECT platform_role, app_role FROM student_app_role_map WHERE app_id = $1', [app.id]);
  const byRole = new Map(map.rows.map((row) => [row.platform_role, row.app_role]));
  const match = platformRoles.find((role) => byRole.has(role));
  return match ? byRole.get(match) : null;
}

function snippetFor(app) {
  const base = config.appBaseUrl;
  return `import json
import os
import urllib.error
import urllib.request

from flask import redirect, request, session

WHS_EXCHANGE_URL = "${base}/api/student-apps/exchange"


@app.route("/auth/whs")
def auth_whs():
    code = request.args.get("code", "")
    req = urllib.request.Request(
        WHS_EXCHANGE_URL,
        data=json.dumps({"code": code}).encode("utf-8"),
        headers={"Content-Type": "application/json", "X-App-Secret": os.environ["WHS_APP_SECRET"]},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req) as response:
            user = json.load(response)
    except urllib.error.HTTPError:
        return "Sign-in was refused. Ask your teacher to give you a role in this app.", 403

    session["user"] = user["email"]
    session["name"] = user["name"]
    session["role"] = user["role"]  # the role you mapped in step 3
    return redirect("/dashboard")
`;
}

function setupModel(app, user, extra = {}) {
  return Promise.all([
    query('SELECT platform_role, app_role FROM student_app_role_map WHERE app_id = $1', [app.id]),
    query(
      `SELECT COUNT(*)::int AS count FROM user_hub_roles JOIN hub_roles ON hub_roles.id = user_hub_roles.hub_role_id
       WHERE hub_roles.hub_key = $1`,
      [app.hub_key]
    )
  ]).then(([map, assigned]) => ({
    title: `${app.name} - Set up`,
    app,
    mapping: Object.fromEntries(map.rows.map((row) => [row.platform_role, row.app_role])),
    platformRoles: PLATFORM_ROLES,
    assignedCount: assigned.rows[0].count,
    snippet: snippetFor(app),
    launchUrl: `/student-apps/${app.slug}/launch`,
    rolesUrl: `/hubs/${app.hub_key}/roles`,
    secret: null,
    saved: false,
    ...extra
  }));
}

router.use((req, res, next) => {
  if (req.isAuthenticated()) return next();
  return res.redirect(`/auth/google?next=${encodeURIComponent(req.originalUrl)}`);
});

router.get('/', async (req, res, next) => {
  try {
    const apps = isAdmin(req.user)
      ? (await query('SELECT * FROM student_apps ORDER BY name')).rows
      : (await query('SELECT * FROM student_apps WHERE owner_user_id = $1 ORDER BY name', [req.user.id])).rows;
    res.render('student-apps/index', { title: 'Student Apps', apps });
  } catch (error) {
    next(error);
  }
});

async function renderNew(res, status, error, form) {
  res.status(status).render('student-apps/new', {
    title: 'Register a project', error, form, clients: await clientChoices(), roleChoices: CHOOSABLE_ROLES
  });
}

router.get('/new', async (req, res, next) => {
  try {
    await renderNew(res, 200, null, { roles: ['lead-teacher'] });
  } catch (error) {
    next(error);
  }
});

router.post('/new', async (req, res, next) => {
  try {
    const form = {
      name: String(req.body.name || '').trim(),
      description: String(req.body.description || '').trim(),
      app_url: String(req.body.app_url || '').trim(),
      roles: [].concat(req.body.roles || []),
      client_id: String(req.body.client_id || '').trim()
    };
    const url = cleanUrl(form.app_url);
    const slugBase = slugify(form.name);
    const choices = await clientChoices();
    const client = form.client_id ? choices.find((row) => row.email === form.client_id.toLowerCase()) : null;
    const error = !form.name ? 'Give your project a name.'
      : !slugBase ? 'The name needs some letters or numbers.'
      : !url ? 'Enter the full web address of your app, starting with https://'
      : !client ? 'Choose who your client is.'
      : null;
    if (error) return await renderNew(res, 400, error, form);

    const slug = await uniqueSlug(slugBase);
    const secret = newSecret();
    const roles = chosenRoles(form.roles);
    const clientId = await findOrCreateUser(client.email, client.display_name);
    const created = await query(
      `INSERT INTO student_apps (slug, hub_key, name, description, app_url, app_roles, owner_user_id, client_user_id, secret_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [slug, `app-${slug}`, form.name, form.description || null, url, roles, req.user.id, clientId, hashSecret(secret)]
    );
    const app = created.rows[0];
    await seedAppRoles(app);
    await grantHubRole(app, req.user.id, 'builder', req.user.id);
    await grantHubRole(app, clientId, 'lead-teacher', req.user.id);
    await query(
      `INSERT INTO modules (module_key, display_name, description, path) VALUES ($1, $2, $3, $4)
       ON CONFLICT (module_key) DO NOTHING`,
      [`student-app-${slug}`, app.name, app.description || 'Student app', `/student-apps/${slug}/open`]
    );
    return res.render('student-apps/setup', await setupModel(app, req.user, { secret }));
  } catch (error) {
    return next(error);
  }
});

router.get('/:slug', async (req, res, next) => {
  try {
    const app = await loadApp(req.params.slug);
    if (!app) return res.status(404).render('error', { title: 'Not found', message: 'That app is not registered.' });
    if (!canManage(req.user, app)) {
      return res.status(403).render('error', { title: 'Access denied', message: 'Only the builder or an administrator can set up this app.' });
    }
    return res.render('student-apps/setup', await setupModel(app, req.user, { saved: req.query.saved === '1' }));
  } catch (error) {
    return next(error);
  }
});

router.post('/:slug/secret', async (req, res, next) => {
  try {
    const app = await loadApp(req.params.slug);
    if (!app || !canManage(req.user, app)) return res.status(403).render('error', { title: 'Access denied', message: 'You cannot change this app.' });
    const secret = newSecret();
    await query('UPDATE student_apps SET secret_hash = $1 WHERE id = $2', [hashSecret(secret), app.id]);
    return res.render('student-apps/setup', await setupModel(app, req.user, { secret }));
  } catch (error) {
    return next(error);
  }
});

router.post('/:slug/roles', async (req, res, next) => {
  try {
    const app = await loadApp(req.params.slug);
    if (!app || !canManage(req.user, app)) return res.status(403).render('error', { title: 'Access denied', message: 'You cannot change this app.' });
    if (!app.login_verified_at) {
      return res.status(400).render('error', { title: 'Sign-in first', message: 'Test the Google sign-in (step 2) before mapping roles.' });
    }
    await query('DELETE FROM student_app_role_map WHERE app_id = $1', [app.id]);
    let mapped = 0;
    for (const role of PLATFORM_ROLES) {
      const appRole = String(req.body[`map_${role.key}`] || '').trim();
      if (!appRole) continue;
      await query('INSERT INTO student_app_role_map (app_id, platform_role, app_role) VALUES ($1, $2, $3)', [app.id, role.key, appRole]);
      mapped += 1;
    }
    await query('UPDATE student_apps SET roles_mapped_at = CASE WHEN $2 > 0 THEN NOW() ELSE NULL END WHERE id = $1', [app.id, mapped]);
    return res.redirect(`/student-apps/${app.slug}?saved=1`);
  } catch (error) {
    return next(error);
  }
});

router.get('/:slug/open', async (req, res, next) => {
  try {
    const app = await loadApp(req.params.slug);
    if (!app) return res.status(404).render('error', { title: 'Not found', message: 'That app is not registered.' });
    if (app.login_verified_at && app.roles_mapped_at) return res.redirect(`/student-apps/${app.slug}/launch`);
    if (canManage(req.user, app)) return res.redirect(`/student-apps/${app.slug}`);
    return res.status(403).render('error', { title: 'Not ready', message: 'This app is still being set up.' });
  } catch (error) {
    return next(error);
  }
});

router.get('/:slug/launch', async (req, res, next) => {
  try {
    const app = await loadApp(req.params.slug);
    if (!app) return res.status(404).render('error', { title: 'Not found', message: 'That app is not registered.' });
    const roles = await userPlatformRoles(req.user, app);
    if (!roles.length && !canManage(req.user, app)) {
      return res.status(403).render('error', { title: 'No access', message: `You have not been given a role in ${app.name}. Ask its Lead Teacher.` });
    }
    const code = crypto.randomBytes(24).toString('hex');
    await query(
      `INSERT INTO student_app_login_codes (code, app_id, user_id, expires_at)
       VALUES ($1, $2, $3, NOW() + ($4 || ' seconds')::interval)`,
      [code, app.id, req.user.id, String(CODE_LIFETIME_SECONDS)]
    );
    return res.redirect(`${app.app_url}/auth/whs?code=${code}`);
  } catch (error) {
    return next(error);
  }
});

apiRouter.post('/exchange', async (req, res, next) => {
  try {
    const secret = String(req.get('x-app-secret') || '');
    const code = String((req.body && req.body.code) || '');
    if (!secret || !code) return res.status(400).json({ error: 'code and X-App-Secret are required' });

    const claimed = await query(
      `UPDATE student_app_login_codes SET used_at = NOW()
       WHERE code = $1 AND used_at IS NULL AND expires_at > NOW() RETURNING app_id, user_id`,
      [code]
    );
    if (!claimed.rowCount) return res.status(400).json({ error: 'invalid or expired code' });

    const app = (await query('SELECT * FROM student_apps WHERE id = $1', [claimed.rows[0].app_id])).rows[0];
    const given = Buffer.from(hashSecret(secret));
    const expected = Buffer.from(app.secret_hash);
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
      return res.status(401).json({ error: 'wrong app secret' });
    }

    const userRow = (await query(
      `SELECT users.id, users.email, users.display_name,
              COALESCE(array_agg(roles.name) FILTER (WHERE roles.name IS NOT NULL), '{}') AS roles
       FROM users
       LEFT JOIN user_roles ON user_roles.user_id = users.id
       LEFT JOIN roles ON roles.id = user_roles.role_id
       WHERE users.id = $1 AND users.is_active = true
       GROUP BY users.id`,
      [claimed.rows[0].user_id]
    )).rows[0];
    if (!userRow) return res.status(403).json({ error: 'user not active' });

    await query('UPDATE student_apps SET login_verified_at = COALESCE(login_verified_at, NOW()) WHERE id = $1', [app.id]);
    const platformRoles = await userPlatformRoles(userRow, app);
    const role = await resolveAppRole(app, platformRoles);
    if (app.roles_mapped_at && !role) return res.status(403).json({ error: 'no role in this app' });

    return res.json({
      email: userRow.email,
      name: userRow.display_name,
      role,
      platform_roles: platformRoles
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = { router, apiRouter, PLATFORM_ROLES, resolveAppRole };
