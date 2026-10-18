const crypto = require('crypto');
const express = require('express');
const { query } = require('./db');
const { BuilderError, createBuilderProviders } = require('./moduleBuilderProviders');

const ROOT = '/module-builder';
const KINDS = ['development', 'staging', 'production'];
const STAGES = ['draft', 'development', 'staging', 'released', 'archived'];
const REGIONS = ['singapore', 'oregon', 'ohio', 'virginia', 'frankfurt'];
const SERVICE_PLANS = ['free', 'starter', '0.5c-512mb'];
const DATABASE_PLANS = ['free', 'basic_256mb', '0.1c-256mb'];
const ACTIONS = {
  repository: 'Create private GitHub repository',
  scaffold: 'Install Node/Express framework',
  upgrade: 'Update untouched framework to Global Control sign-in',
  database: 'Create separate Render development database',
  service: 'Create Render development web service'
};

function text(value, name, max = 200, required = false) {
  if (typeof value !== 'string' && value !== undefined) throw new BuilderError(`${name} must be text.`);
  const result = (value || '').trim();
  if ((required && !result) || result.length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(result)) throw new BuilderError(`Check ${name}.`);
  if (/postgres(?:ql)?:\/\/|-----BEGIN .*PRIVATE KEY|github_pat_|gh[pousr]_/i.test(result)) throw new BuilderError('Do not store secrets in project records. Use provider environment settings.');
  return result;
}
function option(value, choices, name) {
  if (!choices.includes(value)) throw new BuilderError(`Choose a valid ${name}.`);
  return value;
}
function repositoryName(value) {
  const repository = text(value, 'repository', 160).replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '');
  if (repository && !/^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new BuilderError('Use an owner/repository GitHub name.');
  return repository;
}
function appUrl(value) {
  const raw = text(value, 'development URL', 300);
  if (!raw) return '';
  let url;
  try { url = new URL(raw); } catch { throw new BuilderError('Enter a valid HTTPS Render app URL.'); }
  if (url.protocol !== 'https:' || !/^[a-z0-9-]+\.onrender\.com$/.test(url.hostname)
    || url.username || url.password || url.port || url.search || url.hash) {
    throw new BuilderError('Use an HTTPS *.onrender.com app URL without credentials, port, query or fragment.');
  }
  return url.href;
}
function environmentInput(body) {
  const result = {};
  for (const key of ['serviceName', 'databaseName']) {
    result[key] = text(body[key], key, 63, true);
    if (!/^[a-z][a-z0-9-]{2,62}$/.test(result[key])) throw new BuilderError(`${key} needs 3-63 lowercase letters, digits or hyphens.`);
  }
  for (const [key, prefix] of [['serviceId', 'srv'], ['databaseId', 'dpg']]) {
    result[key] = text(body[key], key, 80);
    if (result[key] && !new RegExp(`^${prefix}-[a-z0-9-]+$`).test(result[key])) throw new BuilderError(`Check ${key}.`);
  }
  result.appUrl = appUrl(body.appUrl);
  result.region = option(body.region, REGIONS, 'region');
  result.servicePlan = option(body.servicePlan, SERVICE_PLANS, 'web service plan');
  result.databasePlan = option(body.databasePlan, DATABASE_PLANS, 'database plan');
  result.healthPath = text(body.healthPath, 'health path', 100, true);
  if (!/^\/[A-Za-z0-9/_-]*$/.test(result.healthPath)) throw new BuilderError('Use a relative health path such as /health.');
  result.dockerfilePath = './Dockerfile';
  const lines = text(body.environmentVariables, 'environment variable checklist', 5000).split(/\r?\n/).filter((line) => line.trim());
  const names = new Set();
  result.environmentVariables = lines.map((line) => {
    const match = line.match(/^([A-Z][A-Z0-9_]*)\s*\|\s*(required|optional)\s*\|\s*(.{1,200})$/);
    if (!match || names.has(match[1])) throw new BuilderError('Use one unique NAME | required/optional | purpose per line. Never include values.');
    names.add(match[1]);
    return { name: match[1], required: match[2] === 'required', purpose: match[3] };
  });
  return result;
}
const digest = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

function createModuleBuilderRouter({ dbQuery = query, providers = createBuilderProviders() } = {}) {
  const router = express.Router();
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!req.user?.roles?.includes('ADMIN')) return res.status(403).render('error', { title: 'Access denied', message: 'Module Builder is available only to global administrators.' });
    if (!req.session.moduleBuilderCsrf) req.session.moduleBuilderCsrf = crypto.randomBytes(32).toString('hex');
    if (req.method === 'POST') {
      const supplied = Buffer.from(String(req.body.csrf || ''));
      const expected = Buffer.from(req.session.moduleBuilderCsrf);
      if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
        return res.status(403).render('error', { title: 'Form expired', message: 'Reload Module Builder and try again.' });
      }
    }
    res.locals.csrf = req.session.moduleBuilderCsrf;
    next();
  });

  const wrap = (handler) => async (req, res, next) => {
    try { await handler(req, res, next); } catch (error) {
      if (!(error instanceof BuilderError)) return next(error);
      console.warn('[module-builder]', error.message);
      return res.status(error.status).render('error', { title: 'Module Builder action not completed', message: error.message });
    }
  };
  async function load(id) {
    const project = (await dbQuery('SELECT * FROM module_builder_projects WHERE id::text = $1', [id])).rows[0];
    if (!project) throw new BuilderError('Development project not found.', 404);
    const environments = (await dbQuery('SELECT * FROM module_builder_environments WHERE project_id = $1 ORDER BY kind', [project.id])).rows;
    const environment = environments.find((item) => item.kind === 'development');
    return { project, environments, environment };
  }
  async function ensureIdle(id) {
    if ((await dbQuery("SELECT 1 FROM module_builder_operations WHERE project_id = $1 AND status IN ('running', 'uncertain')", [id])).rows.length) {
      throw new BuilderError('An operation is running or unconfirmed. Inspect the provider and reconcile it before further changes.', 409);
    }
  }
  function reviewData(project, environment, action) {
    option(action, Object.keys(ACTIONS), 'provisioning action');
    if (project.stage === 'archived' || project.stage === 'released') throw new BuilderError('Archived/released projects cannot be provisioned by the development wizard.');
    const settings = environment.config;
    if (action === 'repository' && project.repository) throw new BuilderError('A repository is already registered. It will not be replaced.', 409);
    if (action === 'scaffold' && (!project.repository_managed || project.framework_commit)) throw new BuilderError('Framework installation is only for new wizard-created repositories.');
    if (action === 'upgrade' && (!project.repository_managed || !project.framework_commit)) throw new BuilderError('Framework updates require an untouched wizard-created framework.');
    if (action === 'database' && settings.databaseId) throw new BuilderError('A database is already recorded. No duplicate will be created.', 409);
    if (action === 'service' && settings.serviceId) throw new BuilderError('A web service is already recorded. No duplicate will be created.', 409);
    if (action === 'service' && !settings.databaseManaged) throw new BuilderError('Automatic connection is limited to a database created by this wizard. Existing databases can be recorded and configured manually in Render.');
    const configuration = providers.configuration();
    if (['repository', 'scaffold', 'upgrade'].includes(action) && !configuration.githubConfigured) throw new BuilderError('Configure Module Builder GitHub credentials on the Global Control service first.', 503);
    if (['database', 'service'].includes(action) && !configuration.renderConfigured) throw new BuilderError('Configure Module Builder Render credentials and workspace ID first.', 503);
    return { action, project: { id: project.id, slug: project.slug, revision: project.revision, repository: project.repository, branch: project.branch,
      mountPath: project.mount_path, frameworkCommit: project.framework_commit }, settings, configuration };
  }

  router.get('/', wrap(async (req, res) => {
    const projects = (await dbQuery(`SELECT p.*, e.config, e.verification, e.checked_at
      FROM module_builder_projects p LEFT JOIN module_builder_environments e
      ON e.project_id = p.id AND e.kind = 'development' ORDER BY p.name`)).rows;
    res.render('module-builder/index', { title: 'Module Builder', projects, configuration: providers.configuration() });
  }));
  router.post('/projects', wrap(async (req, res) => {
    const name = text(req.body.name, 'project name', 100, true);
    const slug = text(req.body.slug, 'project key', 60, true);
    if (!/^[a-z][a-z0-9-]{2,59}$/.test(slug)) throw new BuilderError('Use a unique lowercase project key of 3-60 letters, digits and hyphens.');
    const mountPath = `/${slug}/`;
    const project = (await dbQuery(`INSERT INTO module_builder_projects
      (name, slug, description, repository, mount_path, deployment_type, created_by, updated_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$7) ON CONFLICT (slug) DO NOTHING RETURNING id`,
    [name, slug, text(req.body.description, 'description', 1500), repositoryName(req.body.repository),
      mountPath, option(req.body.deploymentType, ['embedded', 'independent'], 'deployment type'), req.user.id])).rows[0];
    if (!project) throw new BuilderError('That project key is already registered.', 409);
    // Environment rows are created by a database trigger, atomically with the project.
    res.redirect(`${ROOT}/${project.id}`);
  }));
  router.get('/:id', wrap(async (req, res) => {
    const data = await load(req.params.id);
    const history = (await dbQuery(`SELECT o.*, u.display_name AS actor_name FROM module_builder_operations o
      JOIN users u ON u.id = o.actor_id WHERE project_id = $1 ORDER BY created_at DESC LIMIT 30`, [data.project.id])).rows;
    res.render('module-builder/detail', { ...data, history, title: data.project.name, kinds: KINDS,
      stages: STAGES, regions: REGIONS, servicePlans: SERVICE_PLANS, databasePlans: DATABASE_PLANS,
      configuration: providers.configuration(), actions: ACTIONS });
  }));
  router.post('/:id/project', wrap(async (req, res) => {
    const { project } = await load(req.params.id);
    await ensureIdle(project.id);
    const repository = repositoryName(req.body.repository);
    if (project.repository_managed && repository !== project.repository) throw new BuilderError('A wizard-created repository cannot be replaced in project records.');
    const branch = text(req.body.branch, 'branch', 100, true);
    if (!/^[A-Za-z0-9][A-Za-z0-9/_-]*$/.test(branch)) throw new BuilderError('Use a simple GitHub branch name.');
    const saved = await dbQuery(`UPDATE module_builder_projects SET name=$2, description=$3, repository=$4,
      branch=$5, deployment_type=$6, stage=$7, updated_by=$8, updated_at=NOW(), revision=revision+1 WHERE id=$1 AND active_operation IS NULL RETURNING id`,
    [project.id, text(req.body.name, 'name', 100, true), text(req.body.description, 'description', 1500),
      repository, branch, option(req.body.deploymentType, ['embedded', 'independent'], 'deployment type'),
      option(req.body.stage, STAGES, 'stage'), req.user.id]);
    if (!saved.rows.length) throw new BuilderError('Project is locked by an operation. Refresh before editing.', 409);
    res.redirect(`${ROOT}/${project.id}`);
  }));
  router.post('/:id/environment/:kind', wrap(async (req, res) => {
    const { project, environments } = await load(req.params.id);
    await ensureIdle(project.id);
    const kind = option(req.params.kind, KINDS, 'environment');
    const previous = environments.find((item) => item.kind === kind).config;
    const settings = environmentInput(req.body);
    settings.databaseManaged = Boolean(previous.databaseManaged && previous.databaseId === settings.databaseId);
    const saved = await dbQuery(`WITH editable AS (
      UPDATE module_builder_projects SET updated_by=$4, updated_at=NOW(), revision=revision+1
      WHERE id=$1 AND active_operation IS NULL RETURNING id)
      UPDATE module_builder_environments SET config=$3::jsonb, verification='{}', checked_at=NULL
      WHERE project_id IN (SELECT id FROM editable) AND kind=$2 RETURNING project_id`,
    [project.id, kind, JSON.stringify(settings), req.user.id]);
    if (!saved.rows.length) throw new BuilderError('Project is locked by an operation. Refresh before editing.', 409);
    res.redirect(`${ROOT}/${project.id}`);
  }));
  router.post('/:id/review', wrap(async (req, res) => {
    const { project, environment } = await load(req.params.id);
    await ensureIdle(project.id);
    const plan = reviewData(project, environment, req.body.action);
    res.render('module-builder/confirm', { title: 'Confirm development resources', project, plan,
      actionLabel: ACTIONS[plan.action], digest: digest(plan) });
  }));
  router.post('/:id/provision', wrap(async (req, res) => {
    const { project, environment } = await load(req.params.id);
    const plan = reviewData(project, environment, req.body.action);
    if (req.body.confirm !== project.slug || req.body.consent !== 'yes' || req.body.digest !== digest(plan)) {
      throw new BuilderError('Review the current settings, acknowledge costs/access and type the project key to confirm.', 409);
    }
    let operation;
    try {
      const id = crypto.randomUUID();
      operation = (await dbQuery(`WITH claimed AS (
        UPDATE module_builder_projects SET active_operation=$5
        WHERE id=$1 AND active_operation IS NULL AND revision=$6 RETURNING id)
        INSERT INTO module_builder_operations(id, project_id, kind, status, actor_id, request_summary)
        SELECT $5,claimed.id,$2,'running',$3,$4::jsonb FROM claimed RETURNING id`,
      [project.id, plan.action, req.user.id, JSON.stringify(plan), id, project.revision])).rows[0];
    } catch (error) {
      if (error.code === '23505') throw new BuilderError('Another operation already started. Refresh the project.', 409);
      throw error;
    }
    if (!operation) throw new BuilderError('The project changed or an operation already started. Refresh, review and reconcile any unconfirmed outcome before provisioning.', 409);
    let result;
    let externalCompleted = false;
    try {
      result = await providers[plan.action](project, environment.config);
      externalCompleted = true;
      // Persist resource identifiers before updating the dashboard; never roll back/delete provider resources.
      await dbQuery(`UPDATE module_builder_operations SET result_summary=$2::jsonb WHERE id=$1`, [operation.id, JSON.stringify(result)]);
      if (plan.action === 'repository') {
        await dbQuery(`UPDATE module_builder_projects SET repository=$2, branch=$3, repository_managed=true WHERE id=$1`,
          [project.id, result.repository, result.branch]);
      } else if (['scaffold', 'upgrade'].includes(plan.action)) {
        await dbQuery('UPDATE module_builder_projects SET framework_commit=$2 WHERE id=$1', [project.id, result.commit]);
      } else {
        const settings = { ...environment.config, ...result, ...(plan.action === 'database' ? { databaseManaged: true } : {}) };
        if (settings.appUrl) settings.appUrl = appUrl(settings.appUrl);
        await dbQuery(`UPDATE module_builder_environments SET config=$2::jsonb, verification='{}', checked_at=NULL
          WHERE project_id=$1 AND kind='development'`, [project.id, JSON.stringify(settings)]);
      }
      await dbQuery(`WITH completed AS (
        UPDATE module_builder_operations SET status='succeeded', completed_at=NOW(),
        message='Provider completed the operation. Verify deployment separately.' WHERE id=$1 RETURNING project_id)
        UPDATE module_builder_projects SET active_operation=NULL, updated_by=$2, updated_at=NOW(), revision=revision+1
        WHERE id IN (SELECT project_id FROM completed)`, [operation.id, req.user.id]);
    } catch (error) {
      const uncertain = externalCompleted || !(error instanceof BuilderError) || error.uncertain;
      const message = error instanceof BuilderError ? error.message : 'Could not persist provider outcome. Inspect provider resources and reconcile before retrying.';
      await dbQuery(`WITH completed AS (
        UPDATE module_builder_operations SET status=$2, message=$3, completed_at=NOW() WHERE id=$1 RETURNING project_id)
        UPDATE module_builder_projects SET active_operation=CASE WHEN $4 THEN active_operation ELSE NULL END
        WHERE id IN (SELECT project_id FROM completed)`,
      [operation.id, uncertain ? 'uncertain' : 'failed', message, uncertain]);
      throw new BuilderError(message, 502, uncertain);
    }
    res.redirect(`${ROOT}/${project.id}`);
  }));
  router.post('/:id/verify/:kind', wrap(async (req, res) => {
    const { project, environments } = await load(req.params.id);
    await ensureIdle(project.id);
    const kind = option(req.params.kind, KINDS, 'environment');
    const environment = environments.find((item) => item.kind === kind);
    try {
      const verification = await providers.verify(project, environment.config);
      const saved = await dbQuery(`UPDATE module_builder_environments SET verification=$3::jsonb, checked_at=NOW()
        WHERE project_id=$1 AND kind=$2 AND config=$4::jsonb
        AND EXISTS (SELECT 1 FROM module_builder_projects WHERE id=$1 AND revision=$5 AND active_operation IS NULL)
        RETURNING project_id`, [project.id, kind, JSON.stringify(verification), JSON.stringify(environment.config), project.revision]);
      if (!saved.rows.length) throw new BuilderError('Configuration changed during verification. Refresh and verify again.', 409);
    } catch (error) {
      await dbQuery(`UPDATE module_builder_environments SET verification=$3::jsonb, checked_at=NOW()
        WHERE project_id=$1 AND kind=$2 AND config=$4::jsonb
        AND EXISTS (SELECT 1 FROM module_builder_projects WHERE id=$1 AND revision=$5 AND active_operation IS NULL)`,
      [project.id, kind, JSON.stringify({ error: 'Verification failed. Provider status is unknown; check credentials and resource IDs.' }), JSON.stringify(environment.config), project.revision]);
      throw error;
    }
    res.redirect(`${ROOT}/${project.id}`);
  }));
  router.post('/:id/reconcile/:operation', wrap(async (req, res) => {
    const { project } = await load(req.params.id);
    if (req.body.confirm !== project.slug || req.body.inspected !== 'yes') throw new BuilderError('Inspect GitHub/Render, record any created resources, and confirm reconciliation.');
    const updated = await dbQuery(`WITH resolved AS (UPDATE module_builder_operations SET status='resolved', completed_at=NOW(),
      message=$4, result_summary=result_summary || jsonb_build_object('resolvedBy', $3::text)
      WHERE id::text=$2 AND project_id=$1 AND
      (status='uncertain' OR (status='running' AND created_at < NOW()-INTERVAL '5 minutes')) RETURNING id)
      UPDATE module_builder_projects SET active_operation=NULL, updated_at=NOW(), revision=revision+1
      WHERE id=$1 AND active_operation IN (SELECT id FROM resolved) RETURNING id`,
    [project.id, req.params.operation, req.user.id, text(req.body.note, 'reconciliation note', 1000, true)]);
    if (!updated.rows.length) throw new BuilderError('Only unconfirmed or running operations older than five minutes can be reconciled.', 409);
    res.redirect(`${ROOT}/${project.id}`);
  }));
  return router;
}

module.exports = { createModuleBuilderRouter, environmentInput, appUrl, repositoryName };
