const crypto = require('crypto');
const express = require('express');
const { query } = require('./db');
const { BuilderError, createBuilderProviders } = require('./moduleBuilderProviders');
const { httpsAppUrl } = require('./appAddresses');
const { developmentPolicyError } = require('./developmentPolicy');
const { newAppInput, newAppApproval, setupFingerprint, nextSetupAction } = require('./newDevelopmentApp');
const { currentDirectory, classifyPeople } = require('./kamarDirectory');

const ROOT = '/module-builder';
const KINDS = ['development', 'staging', 'production'];
const STAGES = ['draft', 'development', 'staging', 'released', 'archived'];
const REGIONS = ['singapore', 'oregon', 'ohio', 'virginia', 'frankfurt'];
const SERVICE_PLANS = ['free', 'starter', '0.5c-512mb'];
const DATABASE_PLANS = ['free', 'basic_256mb', '0.1c-256mb'];
const ACTIONS = {
  repository: 'Create private GitHub repository',
  scaffold: 'Install Node/Express framework',
  upgrade: 'Update untouched module framework',
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
  if (typeof value === 'string' && /[\x00-\x1f\x7f]/.test(value)) throw new BuilderError('Use an HTTPS app address without control characters.');
  const raw = text(value, 'app URL', 300);
  if (!raw) return '';
  try { return httpsAppUrl(raw); } catch (error) { throw new BuilderError(error.message); }
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

function createModuleBuilderRouter({ dbQuery = query, providers = createBuilderProviders(),
  loadDirectory = async () => {
    await require('./legacy/kamar-uploader/store').init();
    return currentDirectory();
  }
} = {}) {
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
      if (req.path.endsWith('/setup/step')) return res.status(error.status).json({ error: error.message, uncertain: error.uncertain });
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
    if (['database', 'service'].includes(action)) {
      const policyError = developmentPolicyError(settings);
      if (policyError) throw new BuilderError(policyError);
    }
    if (action === 'repository' && project.repository) throw new BuilderError('A repository is already registered. It will not be replaced.', 409);
    if (action === 'scaffold' && (!project.repository_managed || project.framework_commit)) throw new BuilderError('Framework installation is only for new wizard-created repositories.');
    if (action === 'upgrade' && (!project.repository_managed || !project.framework_commit)) throw new BuilderError('Framework updates require an untouched wizard-created framework.');
    if (action === 'database' && settings.databaseId) throw new BuilderError('A database is already recorded. No duplicate will be created.', 409);
    if (action === 'service' && settings.serviceId) throw new BuilderError('A web service is already recorded. No duplicate will be created.', 409);
    if (action === 'service' && !settings.databaseManaged) throw new BuilderError('Automatic connection is limited to a database created by this wizard. Existing databases can be recorded and configured manually in Render.');
    const configuration = providers.configuration();
    if (['repository', 'scaffold', 'upgrade'].includes(action) && !configuration.githubConfigured) throw new BuilderError('Configure Module Builder GitHub credentials on the Global Control service first.', 503);
    if (['database', 'service'].includes(action) && !configuration.renderConfigured) throw new BuilderError('Configure Module Builder Render credentials and workspace ID first.', 503);
    if (action === 'service' && !/^evg-[a-z0-9]+$/.test(configuration.renderEnvGroupId || '')) throw new BuilderError('Configure MODULE_BUILDER_RENDER_ENV_GROUP_ID for automatic shared Global Control group linking first.', 503);
    return { action, project: { id: project.id, slug: project.slug, revision: project.revision, repository: project.repository, branch: project.branch,
      mountPath: project.mount_path, frameworkCommit: project.framework_commit }, settings, configuration };
  }

  router.get('/', wrap(async (req, res) => {
    const projects = (await dbQuery(`SELECT p.*, e.config, e.verification, e.checked_at
      FROM module_builder_projects p LEFT JOIN module_builder_environments e
      ON e.project_id = p.id AND e.kind = 'development' ORDER BY p.name`)).rows;
    res.render('module-builder/index', { title: 'Module Builder', projects, configuration: providers.configuration() });
  }));
  async function selectedTesters(ids) {
    const testers = (await dbQuery(`SELECT id, display_name, email FROM users
      WHERE is_active=true AND id=ANY($1::uuid[]) ORDER BY display_name, email`, [ids])).rows;
    if (testers.length !== ids.length) throw new BuilderError('A selected tester is no longer active. Review the access list again.', 409);
    return testers;
  }
  async function availableKey(slug) {
    const existing = (await dbQuery(`SELECT 1 FROM module_builder_projects WHERE slug=$1
      UNION ALL SELECT 1 FROM modules WHERE module_key=$1
      UNION ALL SELECT 1 FROM hub_roles WHERE hub_key=$1
      UNION ALL SELECT 1 FROM student_apps WHERE hub_key=$1 OR 'student-app-'||slug=$1 LIMIT 1`, [slug])).rows;
    if (existing.length) throw new BuilderError('That app key is already in use. Choose a different app name; existing apps are never replaced.', 409);
  }
  router.get('/new', wrap(async (req, res) => {
    const [accounts, directory] = await Promise.all([
      dbQuery('SELECT id, display_name, email FROM users WHERE is_active=true ORDER BY display_name, email'),
      loadDirectory()
    ]);
    const testers = classifyPeople(accounts.rows, directory);
    res.render('module-builder/new', { title: 'New Development App', testers, configuration: providers.configuration() });
  }));
  router.post('/new/review', wrap(async (req, res) => {
    const input = newAppInput(req.body);
    await availableKey(input.slug);
    const testers = await selectedTesters(input.testers);
    await providers.preflight();
    const configuration = providers.configuration();
    const approval = newAppApproval(input, configuration);
    req.session.newAppReview = { input, approval, expiresAt: Date.now() + 30 * 60 * 1000 };
    res.render('module-builder/new-review', { title: 'Review New Development App', input, testers, configuration, approval });
  }));
  router.post('/new/create', wrap(async (req, res) => {
    const pending = req.session.newAppReview;
    if (!pending || pending.expiresAt < Date.now() || req.body.approval !== pending.approval ||
        req.body.confirm !== pending.input.slug || req.body.consent !== 'yes' ||
        pending.approval !== newAppApproval(pending.input, providers.configuration())) {
      throw new BuilderError('Review the app again, approve the costs and access, and type its key to confirm.', 409);
    }
    const { input } = pending;
    await availableKey(input.slug);
    await selectedTesters(input.testers);
    await providers.preflight();
    const settings = { region: 'oregon', servicePlan: '0.5c-512mb', databasePlan: '0.1c-256mb',
      serviceName: input.slug + '-development', databaseName: input.slug + '-development-db',
      healthPath: '/health', dockerfilePath: './Dockerfile' };
    const setup = { testers: input.testers, approvedBy: req.user.id, approvedAt: new Date().toISOString(),
      fingerprint: setupFingerprint({ ...input, branch: 'main', mount_path: `/${input.slug}/`, deployment_type: 'independent' }, settings, providers.configuration()) };
    const project = (await dbQuery(`INSERT INTO module_builder_projects
      (name,slug,description,mount_path,deployment_type,created_by,updated_by,new_app_setup)
      VALUES ($1,$2,$3,$4,'independent',$5,$5,$6::jsonb) ON CONFLICT (slug) DO NOTHING RETURNING id`,
    [input.name, input.slug, input.description, `/${input.slug}/`, req.user.id, JSON.stringify(setup)])).rows[0];
    if (!project) throw new BuilderError('This app is already registered. Open its existing setup; do not create duplicate resources.', 409);
    delete req.session.newAppReview;
    res.redirect(`${ROOT}/${project.id}/setup`);
  }));
  router.get('/:id/setup', wrap(async (req, res) => {
    const data = await load(req.params.id);
    if (!data.project.new_app_setup) throw new BuilderError('This project uses the existing technical setup workflow.', 409);
    const history = (await dbQuery(`SELECT kind,status,message,created_at FROM module_builder_operations
      WHERE project_id=$1 ORDER BY created_at DESC LIMIT 20`, [data.project.id])).rows;
    res.render('module-builder/setup', { ...data, history, title: 'Development App Setup', actions: ACTIONS });
  }));
  router.post('/:id/setup/step', wrap(async (req, res) => {
    const { project, environment } = await load(req.params.id);
    await ensureIdle(project.id);
    if (!providers.configuration().renderEnvGroupId) await providers.preflight();
    const setup = project.new_app_setup, settings = environment.config;
    if (!setup || !['development', 'draft'].includes(project.stage) ||
        setup.fingerprint !== setupFingerprint(project, settings, providers.configuration())) {
      throw new BuilderError('Approved setup settings have changed or this project is not in development. Use technical details to review each action; automatic setup is stopped.', 409);
    }
    await selectedTesters(setup.testers);
    const action = nextSetupAction(project, settings);
    if (action) {
      if ((await dbQuery(`SELECT 1 FROM module_builder_operations WHERE project_id=$1 AND kind=$2 AND status='succeeded'`, [project.id, action])).rows.length) {
        throw new BuilderError('This step already succeeded but its resource record is missing. Inspect operation history and reconcile; no duplicate will be created.', 409);
      }
      if (action === 'service') {
        const status = await providers.setupStatus(project, settings);
        if (status.state !== 'database-ready') return res.json(status);
      }
      await executePlan(project, environment, reviewData(project, environment, action), req.user.id);
      return res.json({ state: 'progress', message: ACTIONS[action] + ' completed and recorded.' });
    }
    const status = await providers.setupStatus(project, settings);
    if (status.state !== 'ready') return res.json(status);
    if (setup.readyAt) return res.json(status);
    const saved = await dbQuery(`WITH completed AS (
      UPDATE module_builder_projects SET
        new_app_setup=new_app_setup || jsonb_build_object('readyAt',$2::text), updated_by=$6, updated_at=NOW()
      WHERE id=$1 AND revision=$3 AND active_operation IS NULL
        AND (SELECT COUNT(*) FROM users WHERE id=ANY($4::uuid[]) AND is_active=true)=cardinality($4::uuid[])
        AND EXISTS (SELECT 1 FROM hub_roles WHERE hub_key=$5 AND role_key='teacher')
      RETURNING id
    ), granted AS (
      INSERT INTO user_hub_roles(user_id,hub_role_id,area_key,granted_by)
      SELECT u.id,r.id,NULL,$6 FROM completed CROSS JOIN users u CROSS JOIN hub_roles r
      WHERE u.id=ANY($4::uuid[]) AND u.is_active=true AND r.hub_key=$5 AND r.role_key='teacher'
      ON CONFLICT DO NOTHING RETURNING user_id
    ) SELECT id FROM completed`,
    [project.id, new Date().toISOString(), project.revision, setup.testers, project.slug, req.user.id]);
    if (!saved.rows.length) throw new BuilderError('Project changed during the final checks. Reload setup before continuing.', 409);
    res.json(status);
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
    if (req.body.action === 'service' && !providers.configuration().renderEnvGroupId) await providers.preflight();
    const plan = reviewData(project, environment, req.body.action);
    res.render('module-builder/confirm', { title: 'Confirm development resources', project, plan,
      actionLabel: ACTIONS[plan.action], digest: digest(plan) });
  }));
  async function executePlan(project, environment, plan, actorId) {
    let operation;
    try {
      const id = crypto.randomUUID();
      operation = (await dbQuery(`WITH claimed AS (
        UPDATE module_builder_projects SET active_operation=$5
        WHERE id=$1 AND active_operation IS NULL AND revision=$6 RETURNING id)
        INSERT INTO module_builder_operations(id, project_id, kind, status, actor_id, request_summary)
        SELECT $5,claimed.id,$2,'running',$3,$4::jsonb FROM claimed RETURNING id`,
      [project.id, plan.action, actorId, JSON.stringify(plan), id, project.revision])).rows[0];
    } catch (error) {
      if (error.code === '23505') throw new BuilderError('Another operation already started. Refresh the project.', 409);
      throw error;
    }
    if (!operation) throw new BuilderError('The project changed or an operation already started. Refresh, review and reconcile any unconfirmed outcome before provisioning.', 409);
    let result;
    let externalCompleted = false;
    try {
      result = await providers[plan.action](project, environment.config, async (created) => {
        externalCompleted = true;
        await dbQuery(`UPDATE module_builder_operations SET result_summary=$2::jsonb WHERE id=$1`, [operation.id, JSON.stringify(created)]);
        await dbQuery(`UPDATE module_builder_environments SET config=config || $2::jsonb, verification='{}', checked_at=NULL
          WHERE project_id=$1 AND kind='development'`, [project.id, JSON.stringify(created)]);
      });
      externalCompleted = true;
      // Persist resource identifiers before updating the dashboard; never roll back/delete provider resources.
      await dbQuery(`UPDATE module_builder_operations SET result_summary=$2::jsonb WHERE id=$1`, [operation.id, JSON.stringify(result)]);
      if (plan.action === 'repository') {
        const approved = project.new_app_setup?.fingerprint === setupFingerprint(project, environment.config, providers.configuration());
        const fingerprint = approved ? setupFingerprint({ ...project, branch: result.branch }, environment.config, providers.configuration()) : null;
        await dbQuery(`UPDATE module_builder_projects SET repository=$2, branch=$3, repository_managed=true,
          new_app_setup=CASE WHEN $4::text IS NULL THEN new_app_setup
            ELSE jsonb_set(new_app_setup,'{fingerprint}',to_jsonb($4::text)) END WHERE id=$1`,
          [project.id, result.repository, result.branch, fingerprint]);
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
        WHERE id IN (SELECT project_id FROM completed)`, [operation.id, actorId]);
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
    return result;
  }
  router.post('/:id/provision', wrap(async (req, res) => {
    const { project, environment } = await load(req.params.id);
    if (req.body.action === 'service' && !providers.configuration().renderEnvGroupId) await providers.preflight();
    const plan = reviewData(project, environment, req.body.action);
    if (req.body.confirm !== project.slug || req.body.consent !== 'yes' || req.body.digest !== digest(plan)) {
      throw new BuilderError('Review the current settings, acknowledge costs/access and type the project key to confirm.', 409);
    }
    await executePlan(project, environment, plan, req.user.id);
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
