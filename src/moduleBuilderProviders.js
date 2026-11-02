const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { developmentPolicyError } = require('./developmentPolicy');

class BuilderError extends Error {
  constructor(message, status = 400, uncertain = false) {
    super(message);
    this.status = status;
    this.uncertain = uncertain;
  }
}

function createBuilderProviders({ env = process.env, fetchImpl = fetch } = {}) {
  const githubOwner = env.MODULE_BUILDER_GITHUB_OWNER || 'WHS-DTECH';
  const ownerId = env.MODULE_BUILDER_RENDER_OWNER_ID || '';
  let sharedGroupId = env.MODULE_BUILDER_RENDER_ENV_GROUP_ID || '';
  const configuration = () => ({
    githubOwner,
    githubConfigured: Boolean(env.MODULE_BUILDER_GITHUB_TOKEN),
    renderConfigured: Boolean(env.MODULE_BUILDER_RENDER_API_KEY && ownerId),
    renderOwnerId: ownerId,
    renderEnvGroupId: sharedGroupId
  });

  async function api(provider, endpoint, method = 'GET', body) {
    const github = provider === 'GitHub';
    const token = github ? env.MODULE_BUILDER_GITHUB_TOKEN : env.MODULE_BUILDER_RENDER_API_KEY;
    if (!token) throw new BuilderError(`${provider} provisioning credential is not configured.`, 503);
    let response;
    try {
      response = await fetchImpl(`${github ? 'https://api.github.com' : 'https://api.render.com/v1'}${endpoint}`, {
        method, redirect: 'error', signal: AbortSignal.timeout(20000),
        headers: {
          Authorization: `Bearer ${token}`, Accept: 'application/json',
          'Content-Type': 'application/json', ...(github ? { 'X-GitHub-Api-Version': '2022-11-28' } : {})
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
    } catch {
      throw new BuilderError(`${provider} request could not be confirmed. Check the provider dashboard before retrying.`, 502, method !== 'GET');
    }
    if (!response.ok) {
      // Provider responses can echo submitted environment values. Never surface or log them.
      throw new BuilderError(`${provider} returned HTTP ${response.status}. Check permissions, resource availability, plan eligibility and provider settings.`,
        502, method !== 'GET' && (response.status >= 500 || response.status === 408));
    }
    try { return await response.json(); } catch {
      throw new BuilderError(`${provider} returned an unreadable response. Check its dashboard.`, 502, method !== 'GET');
    }
  }

  async function repository(project) {
    if (!/^[A-Za-z0-9-]+$/.test(githubOwner)) throw new BuilderError('Configure a valid GitHub account or organisation.');
    const expected = `${githubOwner}/${project.slug}`;
    if (project.repository && project.repository.toLowerCase() !== expected.toLowerCase()) {
      throw new BuilderError('This project already references a repository. It will not be overwritten.');
    }
    const owner = await api('GitHub', `/users/${githubOwner}`);
    let endpoint;
    if (owner.type === 'Organization') {
      endpoint = `/orgs/${githubOwner}/repos`;
    } else if (owner.type === 'User') {
      const authenticated = await api('GitHub', '/user');
      if (authenticated.login?.toLowerCase() !== githubOwner.toLowerCase()) {
        throw new BuilderError('For a personal GitHub account, the provisioning token must belong to the configured repository owner.', 403);
      }
      endpoint = '/user/repos';
    } else {
      throw new BuilderError('GitHub owner type is unsupported. No repository was created.', 502);
    }
    const repo = await api('GitHub', endpoint, 'POST', {
      name: project.slug, description: 'WHS module development sandbox',
      private: true, auto_init: true
    });
    if (repo.full_name?.toLowerCase() !== expected.toLowerCase() || !repo.private) {
      throw new BuilderError('GitHub repository creation requires reconciliation in the provider dashboard.', 502, true);
    }
    return { repository: repo.full_name, branch: repo.default_branch, repositoryManaged: true };
  }

  async function scaffold(project, settings, upgrade = false) {
    if (!project.repository_managed || (upgrade ? !project.framework_commit : project.framework_commit)) throw new BuilderError('Framework installation is only for new, wizard-created repositories.');
    const base = `/repos/${project.repository}`;
    const ref = await api('GitHub', `${base}/git/ref/heads/${encodeURIComponent(project.branch)}`);
    const parent = ref.object?.sha;
    if (upgrade && parent !== project.framework_commit) throw new BuilderError('Repository has changed since framework installation. Update it through a reviewed code change instead.', 409);
    const commit = await api('GitHub', `${base}/git/commits/${parent}`);
    const existing = await api('GitHub', `${base}/git/trees/${commit.tree?.sha}`);
    if (existing.truncated || (!upgrade && existing.tree?.some((entry) => entry.path !== 'README.md'))) {
      throw new BuilderError('Repository contains other work. Framework installation will not overwrite it.', 409);
    }
    const directory = path.join(__dirname, '..', 'module-templates', 'node');
    const files = await fs.readdir(directory);
    const updatedAt = new Date().toISOString();
    const sharedFiles = ['global-nav.js', 'account-controls.css', 'module-shell.css'];
    const logo = await api('GitHub', `${base}/git/blobs`, 'POST', {
      encoding: 'base64',
      content: (await fs.readFile(path.join(__dirname, '..', 'public', 'images', 'whs logo circular reo .png'))).toString('base64')
    });
    const tree = await api('GitHub', `${base}/git/trees`, 'POST', {
      base_tree: commit.tree.sha,
      tree: [{ path: 'public/whs-logo.png', mode: '100644', type: 'blob', sha: logo.sha }, ...await Promise.all([...files, ...sharedFiles].map(async (name) => ({
        path: sharedFiles.includes(name) ? `public/${name}`
          : name === 'ci.yml.template' ? '.github/workflows/ci.yml'
          : name === 'initial.sql.template' ? 'db/migrations/001_initial.sql'
            : name.endsWith('.template') ? name.slice(0, -9) : name,
        mode: '100644', type: 'blob',
        content: (await fs.readFile(sharedFiles.includes(name) ? path.join(__dirname, '..', 'public', name) : path.join(directory, name), 'utf8'))
          .replaceAll('__MODULE_SLUG__', project.slug).replaceAll('__MOUNT_PATH__', project.mount_path)
          .replaceAll('__FRAMEWORK_UPDATED_AT__', updatedAt)
      })))]
    });
    const created = await api('GitHub', `${base}/git/commits`, 'POST', {
      message: upgrade ? 'Update WHS branded framework and Global Control integration' : 'Initial WHS integration-ready development framework', tree: tree.sha, parents: [parent]
    });
    await api('GitHub', `${base}/git/refs/heads/${encodeURIComponent(project.branch)}`, 'PATCH', { sha: created.sha, force: false });
    return { commit: created.sha };
  }

  async function database(project, settings) {
    if (!ownerId) throw new BuilderError('Render workspace ID is not configured.', 503);
    const policyError = developmentPolicyError(settings);
    if (policyError) throw new BuilderError(policyError);
    const result = await api('Render', '/postgres', 'POST', {
      name: settings.databaseName, ownerId, plan: settings.databasePlan,
      region: settings.region, version: '17', ipAllowList: [],
      enableDiskAutoscaling: false, enableHighAvailability: false
    });
    if (!/^dpg-[a-z0-9-]+$/.test(result.id || '')) throw new BuilderError('Database creation needs reconciliation in Render.', 502, true);
    return { databaseId: result.id, databaseStatus: result.status || 'unknown' };
  }

  async function sharedConfiguration() {
    if (!sharedGroupId) {
      const groups = await api('Render', `/env-groups?${new URLSearchParams({ ownerId, name: 'WIZARD-Global-CONTROL', limit: '100' })}`);
      if (!Array.isArray(groups) || groups.length >= 100) throw new BuilderError('Shared group discovery is incomplete. Set MODULE_BUILDER_RENDER_ENV_GROUP_ID explicitly.', 409);
      const matches = groups.map(item => item.envGroup || item)
        .filter(group => group.ownerId === ownerId && group.name === 'WIZARD-Global-CONTROL');
      if (matches.length !== 1) throw new BuilderError('Create one module-safe WIZARD-Global-CONTROL group in the configured Render workspace containing only GLOBAL_CONTROL_URL, or set MODULE_BUILDER_RENDER_ENV_GROUP_ID to its ID. Discovery never creates or modifies groups.', 503);
      if (!/^evg-[a-z0-9]+$/.test(matches[0].id || '')) throw new BuilderError('Render returned an invalid shared group ID. Set MODULE_BUILDER_RENDER_ENV_GROUP_ID explicitly.', 502);
      sharedGroupId = matches[0].id;
    }
    if (!/^evg-[a-z0-9]+$/.test(sharedGroupId)) throw new BuilderError('Configure MODULE_BUILDER_RENDER_ENV_GROUP_ID with the module-safe shared Render group ID before creating a service.', 503);
    const group = await api('Render', `/env-groups/${sharedGroupId}`);
    if (group.ownerId !== ownerId || !Array.isArray(group.envVars) || !Array.isArray(group.secretFiles)
      || group.secretFiles.length || group.envVars.length !== 1 || group.envVars[0].key !== 'GLOBAL_CONTROL_URL') {
      throw new BuilderError('Shared module group must belong to this workspace and contain only GLOBAL_CONTROL_URL, with no secret files.', 409);
    }
    let coreUrl;
    try { coreUrl = new URL(group.envVars[0].value); } catch { throw new BuilderError('Shared GLOBAL_CONTROL_URL must be a valid HTTPS origin.', 409); }
    if (coreUrl.protocol !== 'https:' || coreUrl.username || coreUrl.password || coreUrl.pathname !== '/' || coreUrl.search || coreUrl.hash) {
      throw new BuilderError('Shared GLOBAL_CONTROL_URL must be an HTTPS origin without credentials, path, query or fragment.', 409);
    }
    return { coreUrl: coreUrl.origin };
  }

  async function preflight() {
    if (!configuration().githubConfigured || !configuration().renderConfigured) throw new BuilderError('Configure the Module Builder GitHub and Render credentials/workspace before creating a development app.', 503);
    if (!/^[A-Za-z0-9-]+$/.test(githubOwner)) throw new BuilderError('Configure a valid GitHub owner.');
    const [owner, authenticated] = await Promise.all([api('GitHub', `/users/${githubOwner}`), api('GitHub', '/user')]);
    if (!['User', 'Organization'].includes(owner.type) ||
        owner.type === 'User' && authenticated.login?.toLowerCase() !== githubOwner.toLowerCase()) {
      throw new BuilderError('GitHub token does not match the configured repository owner.', 403);
    }
    await sharedConfiguration();
    return { checked: true };
  }

  async function service(project, settings, checkpoint = async () => {}) {
    const policyError = developmentPolicyError(settings);
    if (policyError) throw new BuilderError(policyError);
    if (!settings.databaseId) throw new BuilderError('Create or record a separate development database first.');
    if (!project.repository) throw new BuilderError('Register a GitHub repository first.');
    if (project.repository_managed && !project.framework_commit) throw new BuilderError('Install the framework before creating its web service.');
    const { coreUrl } = await sharedConfiguration();
    const db = await api('Render', `/postgres/${settings.databaseId}`);
    if (db.owner?.id !== ownerId || db.region !== settings.region) throw new BuilderError('Database must belong to the configured Render workspace and selected region.');
    if (!['basic_256mb', '0.1c-256mb'].includes(db.plan)) throw new BuilderError('The connected development database must use the lowest paid plan. Check its actual plan in Render before creating a service.');
    const connection = await api('Render', `/postgres/${settings.databaseId}/connection-info`);
    const databaseUrl = connection.internalConnectionString;
    if (!databaseUrl || databaseUrl === env.DATABASE_URL) throw new BuilderError('A separate module database connection is required.', 409);
    const result = await api('Render', '/services', 'POST', {
      type: 'web_service', name: settings.serviceName, ownerId,
      repo: `https://github.com/${project.repository}`, branch: project.branch,
      autoDeployTrigger: 'commit',
      envVars: [
        { key: 'NODE_ENV', value: 'production' },
        { key: 'MODULE_ENVIRONMENT', value: 'development' },
        { key: 'MODULE_CLIENT_ID', value: `${project.slug}:development` },
        { key: 'GLOBAL_CONTROL_URL', value: coreUrl },
        { key: 'DATABASE_URL', value: databaseUrl },
        { key: 'SESSION_SECRET', value: crypto.randomBytes(48).toString('hex') }
      ],
      serviceDetails: {
        runtime: 'docker', plan: settings.servicePlan, region: settings.region,
        numInstances: 1, healthCheckPath: settings.healthPath,
        envSpecificDetails: { dockerfilePath: settings.dockerfilePath, dockerContext: '.' }
      }
    });
    const created = result.service;
    if (!/^srv-[a-z0-9]+$/.test(created?.id || '')) throw new BuilderError('Service creation needs reconciliation in Render.', 502, true);
    const recorded = {
      serviceId: created.id, deployId: result.deployId || '',
      appUrl: created.serviceDetails?.url || ''
    };
    // Save the created service before the second external mutation.
    await checkpoint(recorded);
    try {
      const linked = await api('Render', `/env-groups/${sharedGroupId}/services/${created.id}`, 'POST');
      if (!linked.serviceLinks?.some((item) => item.id === created.id)) {
        throw new BuilderError('Render did not confirm the shared group link.', 502, true);
      }
    } catch {
      throw new BuilderError('Service was created and recorded, but its shared group link was not confirmed. Inspect Render, link the configured group if needed, then reconcile. Do not create another service.', 502, true);
    }
    return { ...recorded, sharedEnvGroupId: sharedGroupId };
  }

  async function verify(project, settings) {
    if (!project.repository && !settings.serviceId && !settings.databaseId) throw new BuilderError('Record a repository or resource ID before verification.');
    const result = {};
    if (project.repository) {
      const repo = await api('GitHub', `/repos/${project.repository}`);
      result.repository = { private: Boolean(repo.private), defaultBranch: repo.default_branch };
    }
    if (settings.serviceId) {
      const remote = await api('Render', `/services/${settings.serviceId}`);
      if (remote.ownerId !== ownerId) throw new BuilderError('Service does not belong to the configured Render workspace.');
      result.service = { name: remote.name, suspended: remote.suspended, branch: remote.branch, url: remote.serviceDetails?.url || '' };
      const deployments = await api('Render', `/services/${settings.serviceId}/deploys?limit=1`);
      result.deploy = deployments[0]?.deploy
        ? { status: deployments[0].deploy.status, commit: deployments[0].deploy.commit?.id || '' } : { status: 'unknown' };
      // Values may be returned by Render; retain names only, never persist or render values.
      const names = [];
      let cursor = '';
      for (let page = 0; page < 20; page++) {
        const rows = await api('Render', `/services/${settings.serviceId}/env-vars?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
        if (!Array.isArray(rows)) throw new BuilderError('Render environment-variable response was invalid.', 502);
        names.push(...rows.map((row) => row.envVar?.key).filter(Boolean));
        if (rows.length < 100) break;
        cursor = rows[rows.length - 1].cursor;
        if (!cursor || page === 19) throw new BuilderError('Environment-variable listing could not be fully verified.', 502);
      }
      result.environmentVariableNames = names;
    }
    if (settings.databaseId) {
      const db = await api('Render', `/postgres/${settings.databaseId}`);
      if (db.owner?.id !== ownerId) throw new BuilderError('Database does not belong to the configured Render workspace.');
      result.database = { name: db.name, databaseName: db.databaseName, status: db.status, region: db.region, plan: db.plan };
    }
    return result;
  }

  async function setupStatus(project, settings) {
    const db = await api('Render', `/postgres/${settings.databaseId}`);
    if (db.owner?.id !== ownerId || db.region !== 'oregon' || !['basic_256mb', '0.1c-256mb'].includes(db.plan)) {
      throw new BuilderError('The development database no longer matches the approved workspace, Oregon region or lowest paid tier.', 409);
    }
    if (db.suspended === 'suspended' || ['unavailable', 'failed'].includes(db.status)) {
      throw new BuilderError('Development database is unavailable or suspended. Inspect Render before continuing.', 409);
    }
    if (db.status !== 'available') return { state: 'waiting', message: 'Waiting for the separate Oregon database to become available.' };
    if (!settings.serviceId) return { state: 'database-ready', message: 'Development database is available.' };
    const remote = await api('Render', `/services/${settings.serviceId}`);
    if (remote.ownerId !== ownerId || remote.type !== 'web_service' ||
        remote.serviceDetails?.region !== 'oregon' || !['starter', '0.5c-512mb'].includes(remote.serviceDetails?.plan) ||
        remote.repo?.toLowerCase() !== `https://github.com/${project.repository}`.toLowerCase() ||
        remote.branch !== project.branch) {
      throw new BuilderError('The development service no longer matches the approved repository, branch, workspace, type, region or plan.', 409);
    }
    if (remote.suspended === 'suspended') throw new BuilderError('Development service is suspended. Inspect Render.', 409);
    const deployments = await api('Render', `/services/${settings.serviceId}/deploys?limit=1`);
    if (!Array.isArray(deployments)) throw new BuilderError('Render deployment status could not be read. Inspect Render before continuing.', 502);
    const deployment = deployments[0]?.deploy;
    if (['build_failed', 'update_failed', 'pre_deploy_failed', 'canceled', 'deactivated'].includes(deployment?.status)) {
      throw new BuilderError(`Development deployment is ${deployment.status}. Check Render logs; no resource will be recreated.`, 409);
    }
    const origin = remote.serviceDetails?.url;
    if (typeof origin !== 'string' || !/^https:\/\/[a-z0-9-]+\.onrender\.com\/?$/.test(origin)) {
      throw new BuilderError('Render has not returned a valid default HTTPS service address. Inspect Render.', 409);
    }
    if (deployment?.status !== 'live') return { state: 'waiting', message: 'Waiting for the first Render deployment to become live.', appUrl: origin };
    if (deployment.commit?.id !== project.framework_commit) throw new BuilderError('Repository work has changed since starter setup. Use technical details to verify this deployment; the wizard will not replace your code.', 409);
    const group = await api('Render', `/env-groups/${sharedGroupId}`);
    if (group.ownerId !== ownerId || !Array.isArray(group.serviceLinks) || !group.serviceLinks.some(link => link.id === settings.serviceId)) {
      throw new BuilderError('The recorded Global Control group link could not be verified. Inspect Render; do not create another service.', 409);
    }
    let response;
    try {
      response = await fetchImpl(new URL('/health', origin).href, { redirect: 'error', signal: AbortSignal.timeout(10000) });
    } catch { throw new BuilderError('The development health endpoint could not be reached. Retry the check or inspect Render; resources are unchanged.', 502); }
    if (!response.ok) throw new BuilderError('The development health endpoint is not healthy. Inspect Render logs; no resources were recreated.', 502);
    let health;
    try { health = await response.json(); } catch { throw new BuilderError('The development health response could not be read.', 502); }
    if (health.status !== 'ok' || health.database !== 'connected') throw new BuilderError('The starter did not confirm database connectivity. Inspect Render logs.', 502);
    return { state: 'ready', message: 'Starter is live and its database health check passed. Sign-in, permissions and application behaviour still require acceptance testing.',
      appUrl: origin, deployId: deployment.id || '', commit: deployment.commit.id };
  }

  return { configuration, preflight, setupStatus, repository, scaffold: (project, settings) => scaffold(project, settings), upgrade: (project, settings) => scaffold(project, settings, true), database, service, verify };
}

module.exports = { BuilderError, createBuilderProviders };
