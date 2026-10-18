const crypto = require('crypto');
const express = require('express');
const config = require('./config');
const { pool, query } = require('./db');
const { sendEmail } = require('./email');
const hostedApps = require('./hostedApps');

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
  ['technician', 'Technician', 'Same access as Teacher for now.'],
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
    `SELECT * FROM (
       SELECT LOWER(staff.email_school) AS email,
              TRIM(CONCAT_WS(' ', NULLIF(staff.title, ''), staff.first_name, staff.last_name)) AS display_name,
              staff.last_name, staff.first_name,
              EXISTS (SELECT 1 FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id
                      WHERE LOWER(u.email) = LOWER(staff.email_school) AND r.name = 'ADMIN') AS is_admin,
              (SELECT COUNT(*) FROM student_apps sa JOIN users u ON u.id = sa.client_user_id
                WHERE LOWER(u.email) = LOWER(staff.email_school))::int AS times_chosen
       FROM staff_upload staff
       WHERE COALESCE(staff.status, 'Current') = 'Current' AND COALESCE(staff.email_school, '') <> ''
     ) ranked
     ORDER BY is_admin DESC, times_chosen DESC, last_name, first_name`
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

async function canConfigureRoles(user, app) {
  if (isAdmin(user) || app.client_user_id === user.id) return true;
  return (await userPlatformRoles(user, app)).includes('lead-teacher');
}

async function canManage(user, app) {
  return app.owner_user_id === user.id || await canConfigureRoles(user, app);
}

async function seedRoleMapping(app) {
  const { defaults } = hostedApps.roleConfig(app.slug);
  for (const [role, appRole] of Object.entries(defaults)) {
    await query(
      `INSERT INTO student_app_role_map (app_id, platform_role, app_role) VALUES ($1, $2, $3)
       ON CONFLICT (app_id, platform_role) DO NOTHING`,
      [app.id, role, appRole]
    );
  }
  if (Object.keys(defaults).length) {
    await query('UPDATE student_apps SET roles_mapped_at = COALESCE(roles_mapped_at, NOW()) WHERE id = $1', [app.id]);
  }
}

function baseFor(req) {
  if (!/localhost|127\.0\.0\.1/.test(config.appBaseUrl)) return config.appBaseUrl;
  return `${req.get('x-forwarded-proto') || req.protocol}://${req.get('host')}`;
}

const escapeHtml = (value) => String(value || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function adminEmails() {
  const result = await query(
    `SELECT DISTINCT users.email FROM users
     JOIN user_roles ON user_roles.user_id = users.id
     JOIN roles ON roles.id = user_roles.role_id
     WHERE roles.name = 'ADMIN' AND users.is_active`
  );
  return result.rows.map((row) => row.email);
}

async function emailAdminNewProject({ app, builder, client, secret, base }) {
  const reviewUrl = `${base}/student-apps/${app.slug}`;
  const lines = [
    `Project: ${app.name}`,
    `Built by: ${builder.display_name} (${builder.email})`,
    `Client (Lead Teacher): ${client.display_name} (${client.email})`,
    `Roles: ${app.app_roles.join(', ')}`,
    `Web address (assigned when registered): ${base}/apps/${app.slug}`,
    `What it does: ${app.description || 'not supplied'}`
  ];
  const hosted = hostedApps.isHosted(app.slug);
  const text = hosted
    ? `${lines.join('\n')}\n\nHosted on the school system. Sign-in is connected automatically; no app secret or pasted code is needed.\nReview and register the project:\n${reviewUrl}`
    : `${lines.join('\n')}\n\nWHS_APP_SECRET:\n${secret}\n\nAdd WHS_APP_SECRET to the project's Render service, then open:\n${reviewUrl}\nand press "Secret loaded - project is registered".`;
  const html = hosted
    ? `<p><strong>New Student Apps project</strong></p><p>${lines.map(escapeHtml).join('<br>')}</p><p>Hosted on the school system. Sign-in is connected automatically; no app secret or pasted code is needed.</p><p><a href="${escapeHtml(reviewUrl)}">Review and register the project</a></p>`
    : `<p><strong>New Student Apps project</strong></p><p>${lines.map(escapeHtml).join('<br>')}</p>`
    + `<p><strong>WHS_APP_SECRET</strong><br><code>${escapeHtml(secret)}</code></p>`
    + `<p>Add it to the project's Render service, then <a href="${escapeHtml(reviewUrl)}">open the project</a> and press <em>Secret loaded - project is registered</em>.</p>`;
  const redacted = (value) => value.split(secret).join('[secret sent by email only]');
  return sendEmail({
    to: await adminEmails(),
    subject: `[Student Apps] New project to register: ${app.name}`,
    text,
    html,
    logText: redacted(text),
    logHtml: redacted(html)
  });
}

function emailBuilderRegistered({ app, builder, base }) {
  const url = `${base}/student-apps/${app.slug}`;
  return sendEmail({
    to: builder.email,
    subject: `[Student Apps] ${app.name} is registered`,
    text: `Your project "${app.name}" is registered.\n\nYour web address: ${app.app_url}\n\nLog in to continue: ${url}`,
    html: `<p>Your project <strong>${escapeHtml(app.name)}</strong> is registered.</p><p>Your web address: <a href="${escapeHtml(app.app_url)}">${escapeHtml(app.app_url)}</a></p><p><a href="${escapeHtml(url)}">Log in to continue</a></p>`
  });
}

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
  const match = platformRoles.map(role => role === 'technician' ? 'teacher' : role).find((role) => byRole.has(role));
  return match ? byRole.get(match) : null;
}

function snippetFor(app, base) {
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
  const { defaults, roles } = hostedApps.roleConfig(app.slug);
  return Promise.all([
    query('SELECT platform_role, app_role FROM student_app_role_map WHERE app_id = $1', [app.id]),
    query(
      `SELECT COUNT(*)::int AS count FROM user_hub_roles JOIN hub_roles ON hub_roles.id = user_hub_roles.hub_role_id
       WHERE hub_roles.hub_key = $1`,
      [app.hub_key]
    ),
    query('SELECT id, display_name, email FROM users WHERE id = $1 OR id = $2', [app.owner_user_id, app.client_user_id]),
    canConfigureRoles(user, app)
  ]).then(([map, assigned, people, canEditRoles]) => ({
    title: `${app.name} - Set up`,
    app,
    hosted: hostedApps.isHosted(app.slug),
    roleDefaults: defaults,
    appRoleChoices: roles.length ? roles : app.app_roles,
    canEditRoles,
    builder: people.rows.find((person) => person.id === app.owner_user_id),
    appClient: people.rows.find((person) => person.id === app.client_user_id),
    mapping: Object.fromEntries(map.rows.map((row) => [row.platform_role, row.app_role])),
    platformRoles: PLATFORM_ROLES,
    assignedCount: assigned.rows[0].count,
    snippet: snippetFor(app, extra.base),
    launchUrl: `/student-apps/${app.slug}/launch`,
    rolesUrl: `/hubs/${app.hub_key}/roles`,
    secret: null,
    saved: false,
    submitted: false,
    activated: false,
    siteAdmin: isAdmin(user),
    ...extra
  }));
}

router.use((req, res, next) => {
  if (req.isAuthenticated()) return next();
  return res.redirect(`/auth/google?next=${encodeURIComponent(req.originalUrl)}`);
});

router.use('/github-import', require('./studentAppImports').createImportRouter());

async function searchableApps(user) {
  return isAdmin(user)
      ? (await query('SELECT * FROM student_apps ORDER BY name')).rows
      : (await query(
        `SELECT apps.* FROM student_apps apps
         WHERE owner_user_id = $1 OR client_user_id = $1 OR EXISTS (
           SELECT 1 FROM user_hub_roles assigned
           JOIN hub_roles roles ON roles.id = assigned.hub_role_id
           WHERE assigned.user_id = $1 AND roles.hub_key = apps.hub_key AND roles.role_key = 'lead-teacher'
         ) ORDER BY name`, [user.id]
      )).rows;
}

router.get('/', async (req, res, next) => {
  try {
    const apps = await searchableApps(req.user);
    res.render('student-apps/index', {
      title: 'APPs Dashboard',
      apps: apps.map((app) => ({ ...app, hosted: hostedApps.isHosted(app.slug) })),
      canImportGithub: isAdmin(req.user)
    });
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
    const url = form.app_url ? cleanUrl(form.app_url) : null;
    const slugBase = slugify(form.name);
    const choices = await clientChoices();
    const client = form.client_id ? choices.find((row) => row.email === form.client_id.toLowerCase()) : null;
    const error = !form.name ? 'Give your project a name.'
      : !slugBase ? 'The name needs some letters or numbers.'
      : form.app_url && !url ? 'The web address must be a full address starting with https://'
      : !client ? 'Choose who your client is.'
      : null;
    if (error) return await renderNew(res, 400, error, form);

    const slug = await uniqueSlug(slugBase);
    const secret = newSecret();
    const roles = chosenRoles(form.roles);
    const clientId = await findOrCreateUser(client.email, client.display_name);
    const created = await query(
      `INSERT INTO student_apps (slug, hub_key, name, description, app_url, app_roles, owner_user_id, client_user_id, secret_hash, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending') RETURNING *`,
      [slug, `app-${slug}`, form.name, form.description || null, url, roles, req.user.id, clientId, hashSecret(secret)]
    );
    const app = created.rows[0];
    await seedAppRoles(app);
    await grantHubRole(app, req.user.id, 'builder', req.user.id);
    await grantHubRole(app, clientId, 'lead-teacher', req.user.id);
    await seedRoleMapping(app);
    const mail = await emailAdminNewProject({ app, builder: req.user, client, secret, base: baseFor(req) });
    if (!mail.ok) console.error('Student Apps: could not email the new project details:', mail.error || mail.message);
    return res.redirect(`/student-apps/${app.slug}?submitted=1`);
  } catch (error) {
    return next(error);
  }
});

router.post('/:slug/activate', async (req, res, next) => {
  try {
    const app = await loadApp(req.params.slug);
    if (!app || !isAdmin(req.user)) return res.status(403).render('error', { title: 'Access denied', message: 'Only an administrator can register a project.' });
    if (app.status !== 'active') {
      app.app_url = app.app_url || `${baseFor(req)}/apps/${app.slug}`;
      await query(
        `UPDATE student_apps SET status = 'active', activated_at = NOW(), app_url = $2,
           login_verified_at = CASE WHEN $3 THEN COALESCE(login_verified_at, NOW()) ELSE login_verified_at END
         WHERE id = $1`,
        [app.id, app.app_url, hostedApps.isHosted(app.slug)]
      );
      await query(
        `INSERT INTO modules (module_key, display_name, description, path) VALUES ($1, $2, $3, $4)
         ON CONFLICT (module_key) DO NOTHING`,
        [`student-app-${app.slug}`, app.name, app.description || 'Student app', `/student-apps/${app.slug}/open`]
      );
      const builder = (await query('SELECT display_name, email FROM users WHERE id = $1', [app.owner_user_id])).rows[0];
      if (builder) {
        const mail = await emailBuilderRegistered({ app, builder, base: baseFor(req) });
        if (!mail.ok) console.error('Student Apps: could not email the builder:', mail.error || mail.message);
      }
    }
    return res.redirect(`/student-apps/${app.slug}?activated=1`);
  } catch (error) {
    return next(error);
  }
});

router.get('/:slug', async (req, res, next) => {
  try {
    const app = await loadApp(req.params.slug);
    if (!app) return res.status(404).render('error', { title: 'Not found', message: 'That app is not registered.' });
    if (!await canManage(req.user, app)) {
      return res.status(403).render('error', { title: 'Access denied', message: 'Only the builder, Lead Teacher or an administrator can set up this app.' });
    }
    return res.render('student-apps/setup', await setupModel(app, req.user, {
      base: baseFor(req),
      saved: req.query.saved === '1',
      submitted: req.query.submitted === '1',
      activated: req.query.activated === '1'
    }));
  } catch (error) {
    return next(error);
  }
});

router.post('/:slug/secret', async (req, res, next) => {
  try {
    const app = await loadApp(req.params.slug);
    if (!app || !isAdmin(req.user)) return res.status(403).render('error', { title: 'Access denied', message: 'Only an administrator can make a new secret.' });
    const secret = newSecret();
    await query('UPDATE student_apps SET secret_hash = $1 WHERE id = $2', [hashSecret(secret), app.id]);
    return res.render('student-apps/setup', await setupModel(app, req.user, { base: baseFor(req), secret }));
  } catch (error) {
    return next(error);
  }
});

router.post('/:slug/roles', async (req, res, next) => {
  try {
    const app = await loadApp(req.params.slug);
    if (!app || !await canConfigureRoles(req.user, app)) return res.status(403).render('error', { title: 'Access denied', message: 'Only an administrator or Lead Teacher can configure app access.' });
    if (!app.login_verified_at && !(hostedApps.isHosted(app.slug) && app.status === 'active')) {
      return res.status(400).render('error', { title: 'Sign-in first', message: 'Test the Google sign-in (step 2) before mapping roles.' });
    }
    const { defaults, roles: allowedRoles } = hostedApps.roleConfig(app.slug);
    const mappings = [];
    for (const role of PLATFORM_ROLES) {
      if (role.key === 'technician') continue;
      const field = `map_${role.key}`;
      const fixedDefault = ['admin', 'builder', 'lead-teacher'].includes(role.key) && defaults[role.key];
      const appRole = fixedDefault || (Object.hasOwn(req.body, field) ? String(req.body[field] || '').trim() : defaults[role.key] || '');
      if (!appRole) continue;
      if (allowedRoles.length && !allowedRoles.includes(appRole)) {
        return res.status(400).render('error', { title: 'Invalid role', message: `Choose one of this app's roles: ${allowedRoles.join(', ')}.` });
      }
      mappings.push([role.key, appRole]);
    }
    const teacherMapping = mappings.find(([key]) => key === 'teacher');
    if (teacherMapping) mappings.push(['technician', teacherMapping[1]]);
    const connection = await pool.connect();
    try {
      await connection.query('BEGIN');
      await connection.query('DELETE FROM student_app_role_map WHERE app_id = $1', [app.id]);
      for (const [role, appRole] of mappings) {
        await connection.query('INSERT INTO student_app_role_map (app_id, platform_role, app_role) VALUES ($1, $2, $3)', [app.id, role, appRole]);
      }
      await connection.query('UPDATE student_apps SET roles_mapped_at = CASE WHEN $2 > 0 THEN NOW() ELSE NULL END WHERE id = $1', [app.id, mappings.length]);
      await connection.query('COMMIT');
    } catch (error) {
      await connection.query('ROLLBACK');
      throw error;
    } finally {
      connection.release();
    }
    return res.redirect(`/student-apps/${app.slug}?saved=1`);
  } catch (error) {
    return next(error);
  }
});

router.post('/:slug/url', async (req, res, next) => {
  try {
    const app = await loadApp(req.params.slug);
    if (!app || !await canManage(req.user, app)) return res.status(403).render('error', { title: 'Access denied', message: 'You cannot change this app.' });
    const raw = String(req.body.app_url || '').trim();
    const url = raw ? cleanUrl(raw) : null;
    if (raw && !url) return res.status(400).render('error', { title: 'Check the address', message: 'The web address must be a full address starting with https://' });
    await query('UPDATE student_apps SET app_url = $1 WHERE id = $2', [url, app.id]);
    return res.redirect(`/student-apps/${app.slug}`);
  } catch (error) {
    return next(error);
  }
});

router.get('/:slug/open', async (req, res, next) => {
  try {
    const app = await loadApp(req.params.slug);
    if (!app) return res.status(404).render('error', { title: 'Not found', message: 'That app is not registered.' });
    if ((app.login_verified_at || hostedApps.isHosted(app.slug)) && app.roles_mapped_at && app.status === 'active') return res.redirect(`/student-apps/${app.slug}/launch`);
    if (await canManage(req.user, app)) return res.redirect(`/student-apps/${app.slug}`);
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
    if (!roles.length && !await canManage(req.user, app)) {
      return res.status(403).render('error', { title: 'No access', message: `You have not been given a role in ${app.name}. Ask its Lead Teacher.` });
    }
    if (hostedApps.isHosted(app.slug) && app.status === 'active') return res.redirect(`/apps/${app.slug}/`);
    if (!app.app_url) return res.status(400).render('error', { title: 'No web address', message: 'Add the app\'s web address on its set-up page first.' });
    if (app.status !== 'active') return res.status(403).render('error', { title: 'Not registered yet', message: 'This project is waiting to be registered by an administrator.' });
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

// Sends /apps/<slug>/... to the hosted Flask app once the person is signed in and has a mapped role.
async function hostedProxy(req, res, next) {
  try {
    const slug = req.params.slug;
    if (!hostedApps.isHosted(slug)) return next();
    if (!req.isAuthenticated()) return res.redirect(`/auth/google?next=${encodeURIComponent(req.originalUrl)}`);
    const app = await loadApp(slug);
    if (!app || app.status !== 'active') {
      return res.status(403).render('error', { title: 'Not registered yet', message: 'This project is waiting to be registered by an administrator.' });
    }
    const roles = await userPlatformRoles(req.user, app);
    let appRole = await resolveAppRole(app, roles);
    if (!appRole) {
      if (await canManage(req.user, app)) return res.redirect(`/student-apps/${slug}`);
      return res.status(403).render('error', { title: 'No access', message: `You have not been given a role in ${app.name}. Ask its Lead Teacher.` });
    }
    const contentHash = hostedApps.contentHash(slug);
    if (app.hosted_content_hash !== contentHash) {
      const updated = await query(
        `UPDATE student_apps SET hosted_content_hash = $2, last_updated_at = NOW()
         WHERE id = $1 AND hosted_content_hash IS DISTINCT FROM $2
         RETURNING last_updated_at`,
        [app.id, contentHash]
      );
      if (updated.rows.length) app.last_updated_at = updated.rows[0].last_updated_at;
      else app.last_updated_at = (await loadApp(slug)).last_updated_at;
    }
    res.locals.studentAppFooter = { registeredAt: app.created_at, updatedAt: app.last_updated_at };
    return hostedApps.proxy(req, res, slug, { email: req.user.email, name: req.user.display_name || req.user.name, role: appRole });
  } catch (error) {
    return next(error);
  }
}

async function datasetManagerUrl(user, slug) {
  if (slug !== 'guidance-counsellor-app') return null;
  const app = await loadApp(slug);
  if (!app || app.status !== 'active') return null;
  const role = await resolveAppRole(app, await userPlatformRoles(user, app));
  return ['ADMIN', 'AppBuilder', 'Counsellor'].includes(role) ? `/apps/${slug}/infrastructure` : null;
}

module.exports = { router, apiRouter, hostedProxy, PLATFORM_ROLES, resolveAppRole, datasetManagerUrl, searchableApps };
