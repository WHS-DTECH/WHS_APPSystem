const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

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
  const sharedGroupId = env.MODULE_BUILDER_RENDER_ENV_GROUP_ID || '';
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
    const tree = await api('GitHub', `${base}/git/trees`, 'POST', {
      base_tree: commit.tree.sha,
      tree: await Promise.all(files.map(async (name) => ({
        path: name === 'ci.yml.template' ? '.github/workflows/ci.yml'
          : name === 'initial.sql.template' ? 'db/migrations/001_initial.sql'
            : name.endsWith('.template') ? name.slice(0, -9) : name,
        mode: '100644', type: 'blob',
        content: (await fs.readFile(path.join(directory, name), 'utf8'))
          .replaceAll('__MODULE_SLUG__', project.slug).replaceAll('__MOUNT_PATH__', project.mount_path)
      })))
    });
    const created = await api('GitHub', `${base}/git/commits`, 'POST', {
      message: upgrade ? 'Use Global Control identity for module development' : 'Initial WHS integration-ready development framework', tree: tree.sha, parents: [parent]
    });
    await api('GitHub', `${base}/git/refs/heads/${encodeURIComponent(project.branch)}`, 'PATCH', { sha: created.sha, force: false });
    return { commit: created.sha };
  }

  async function database(project, settings) {
    if (!ownerId) throw new BuilderError('Render workspace ID is not configured.', 503);
    const result = await api('Render', '/postgres', 'POST', {
      name: settings.databaseName, ownerId, plan: settings.databasePlan,
      region: settings.region, version: '17', ipAllowList: [],
      enableDiskAutoscaling: false, enableHighAvailability: false
    });
    if (!/^dpg-[a-z0-9-]+$/.test(result.id || '')) throw new BuilderError('Database creation needs reconciliation in Render.', 502, true);
    return { databaseId: result.id, databaseStatus: result.status || 'unknown' };
  }

  async function service(project, settings, checkpoint = async () => {}) {
    if (!settings.databaseId) throw new BuilderError('Create or record a separate development database first.');
    if (!project.repository) throw new BuilderError('Register a GitHub repository first.');
    if (project.repository_managed && !project.framework_commit) throw new BuilderError('Install the framework before creating its web service.');
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
    const db = await api('Render', `/postgres/${settings.databaseId}`);
    if (db.owner?.id !== ownerId || db.region !== settings.region) throw new BuilderError('Database must belong to the configured Render workspace and selected region.');
    const connection = await api('Render', `/postgres/${settings.databaseId}/connection-info`);
    const databaseUrl = connection.internalConnectionString;
    if (!databaseUrl || databaseUrl === env.DATABASE_URL) throw new BuilderError('A separate module database connection is required.', 409);
    const result = await api('Render', '/services', 'POST', {
      type: 'web_service', name: settings.serviceName, ownerId,
      repo: `https://github.com/${project.repository}`, branch: project.branch,
      autoDeployTrigger: 'off',
      envVars: [
        { key: 'NODE_ENV', value: 'production' },
        { key: 'MODULE_ENVIRONMENT', value: 'development' },
        { key: 'MODULE_CLIENT_ID', value: `${project.slug}:development` },
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

  return { configuration, repository, scaffold: (project, settings) => scaffold(project, settings), upgrade: (project, settings) => scaffold(project, settings, true), database, service, verify };
}

module.exports = { BuilderError, createBuilderProviders };
