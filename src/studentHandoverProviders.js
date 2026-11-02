const crypto = require('crypto');
const { pathReason, contentReason } = require('./studentAppArchive');

const MAX_FILES = 300;
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_TOTAL_BYTES = 15 * 1024 * 1024;
const SHA = /^[a-f0-9]{40}$/;
const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const NAME = /^[A-Za-z0-9_.-]{1,100}$/;

class HandoverError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function parseRepository(value) {
  const input = String(value || '').trim();
  const match = input.match(/^(?:https:\/\/github\.com\/)?([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9_.-]{1,100}?)(?:\.git)?\/?$/);
  if (!match || ['.', '..'].includes(match[2])) {
    throw new HandoverError('Enter the repository as owner/repository or https://github.com/owner/repository.');
  }
  return { owner: match[1], name: match[2], fullName: `${match[1]}/${match[2]}` };
}

function handoverMarkdown({ source, commit, studentName, schoolYear, adminName, excluded, copiedAt }) {
  const withheld = excluded.length
    ? excluded.map((file) => `- \`${file.path}\`: ${file.reason}`).join('\n')
    : '- None';
  return `# Student Work handover

This private repository is Westland High School's working copy of a student project.
All further school changes happen here; the original Student Work is kept unchanged.

- **Original Student Work:** https://github.com/${source}
- **Student:** ${studentName} (${schoolYear})
- **Copied from commit:** ${commit}
- **Copied:** ${copiedAt} by ${adminName}

Original design and code by ${studentName}. Keep this file, and any licence or
attribution files, with the project.

## Files not copied

These were withheld automatically because they may contain credentials, private
data or generated files. Review the original before re-adding anything.

${withheld}
`;
}

function createHandoverProviders({ env = process.env, fetchImpl = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const owner = env.MODULE_BUILDER_GITHUB_OWNER || 'WHS-DTECH';
  const githubToken = env.STUDENT_HANDOVER_GITHUB_TOKEN || env.MODULE_BUILDER_GITHUB_TOKEN || '';
  const renderKey = env.MODULE_BUILDER_RENDER_API_KEY || '';

  function configuration() {
    return {
      owner,
      githubConfigured: Boolean(githubToken),
      renderConfigured: Boolean(renderKey),
      tokenSetting: env.STUDENT_HANDOVER_GITHUB_TOKEN ? 'STUDENT_HANDOVER_GITHUB_TOKEN' : 'MODULE_BUILDER_GITHUB_TOKEN'
    };
  }

  async function request(base, token, endpoint, { method = 'GET', body, messages = {}, allow404 = false } = {}) {
    if (!token) throw new HandoverError('GitHub handover credential is not configured on the Render service.', 503);
    let response;
    try {
      response = await fetchImpl(`${base}${endpoint}`, {
        method, redirect: 'error', signal: AbortSignal.timeout(30000),
        headers: {
          Authorization: `Bearer ${token}`, Accept: base.includes('github') ? 'application/vnd.github+json' : 'application/json',
          'User-Agent': 'WHS-Student-Handover',
          ...(base.includes('github') ? { 'X-GitHub-Api-Version': '2022-11-28' } : {}),
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
    } catch {
      throw new HandoverError('The provider could not be reached. Check GitHub before retrying; the change may already have been made.', 502);
    }
    if (allow404 && response.status === 404) {
      if (response.body) await response.body.cancel();
      return null;
    }
    if (!response.ok) {
      if (response.body) await response.body.cancel();
      const defaults = {
        401: 'GitHub rejected the handover credential. Check the token on the Render service.',
        403: `The GitHub token is not allowed to do this. It needs Administration and Contents: Read and write for ${owner}'s repositories.`,
        404: 'GitHub repository not found, or the token cannot see it.'
      };
      throw new HandoverError(messages[response.status] || defaults[response.status] || `Provider request failed (HTTP ${response.status}).`, 502);
    }
    if (response.status === 204) return {};
    try { return await response.json(); } catch {
      throw new HandoverError('The provider returned an unreadable response.', 502);
    }
  }

  const github = (endpoint, options) => request('https://api.github.com', githubToken, endpoint, options);
  const render = (endpoint, options) => request('https://api.render.com/v1', renderKey, endpoint, options);

  async function inspect(input) {
    const repo = parseRepository(input);
    const info = await github(`/repos/${repo.fullName}`);
    const head = await github(`/repos/${info.full_name}/commits/${encodeURIComponent(info.default_branch)}`);
    if (!SHA.test(head.sha || '')) throw new HandoverError('GitHub returned an invalid latest commit.', 502);
    return {
      fullName: info.full_name,
      owner: info.owner?.login,
      schoolOwned: info.owner?.login?.toLowerCase() === owner.toLowerCase(),
      private: Boolean(info.private),
      archived: Boolean(info.archived),
      description: info.description || '',
      defaultBranch: info.default_branch,
      htmlUrl: info.html_url,
      latestCommit: head.sha
    };
  }

  async function status(fullName) {
    const info = await github(`/repos/${parseRepository(fullName).fullName}`, { allow404: true });
    if (!info) return { missing: true };
    return { fullName: info.full_name, owner: info.owner?.login, private: Boolean(info.private),
      archived: Boolean(info.archived), description: info.description || '', htmlUrl: info.html_url };
  }

  async function label(fullName, { studentName, schoolYear, makePrivate }) {
    const description = `Student Work: ${studentName}, ${schoolYear}. Kept unchanged; Westland High School maintains a separate copy.`.slice(0, 350);
    const info = await github(`/repos/${parseRepository(fullName).fullName}`, {
      method: 'PATCH', body: { description, ...(makePrivate ? { private: true } : {}) },
      messages: { 422: 'GitHub rejected the update. If the repository is archived, it can no longer be relabelled.' }
    });
    return { description: info.description, private: Boolean(info.private) };
  }

  async function sourceFiles(fullName, commit) {
    const repo = parseRepository(fullName).fullName;
    const data = await github(`/repos/${repo}/git/commits/${commit}`);
    if (!SHA.test(data.tree?.sha || '')) throw new HandoverError('GitHub returned an invalid source commit.', 502);
    const tree = await github(`/repos/${repo}/git/trees/${data.tree.sha}?recursive=1`);
    if (tree.truncated || !Array.isArray(tree.tree)) throw new HandoverError('Repository listing is incomplete. This project needs a manual handover.');
    const entries = tree.tree.filter((entry) => entry.type !== 'tree')
      .sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    if (entries.length > MAX_FILES) throw new HandoverError(`Handover supports up to ${MAX_FILES} files. This project needs a manual handover.`);
    const files = [];
    const excluded = [];
    let total = 0;
    for (const entry of entries) {
      const reason = pathReason(entry.path, entry.mode);
      if (reason) { excluded.push({ path: entry.path, reason }); continue; }
      if (!SHA.test(entry.sha) || !Number.isSafeInteger(entry.size)) throw new HandoverError('Invalid source file metadata.', 502);
      if (entry.size > MAX_FILE_BYTES) throw new HandoverError(`File exceeds the 1 MiB limit: ${entry.path}. This project needs a manual handover.`);
      total += entry.size;
      if (total > MAX_TOTAL_BYTES) throw new HandoverError('Source exceeds the 15 MiB limit. This project needs a manual handover.');
      const blob = await github(`/repos/${repo}/git/blobs/${entry.sha}`);
      if (blob.encoding !== 'base64' || typeof blob.content !== 'string') throw new HandoverError('Unsupported GitHub file response.', 502);
      const bytes = Buffer.from(blob.content, 'base64');
      const sha = crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
      if (sha !== entry.sha) throw new HandoverError('Source file verification failed. Nothing was copied.', 502);
      const secret = contentReason(bytes);
      if (secret) excluded.push({ path: entry.path, reason: secret });
      else files.push({ path: entry.path, mode: entry.mode, bytes });
    }
    if (!files.length) throw new HandoverError('No eligible source files were found. This project needs a manual handover.');
    return { files, excluded };
  }

  async function schoolCopy(handover, targetName, adminName) {
    if (!NAME.test(targetName) || ['.', '..'].includes(targetName)) {
      throw new HandoverError('Enter a repository name using letters, numbers, hyphens, underscores or dots.');
    }
    const target = `${owner}/${targetName}`;
    if (target.toLowerCase() === handover.source_repository.toLowerCase()) throw new HandoverError('The school copy must be a different repository from the Student Work.');
    if (!OWNER.test(owner)) throw new HandoverError('Configure a valid GitHub owner.', 503);
    if (await github(`/repos/${target}`, { allow404: true })) {
      throw new HandoverError(`${target} already exists. Existing repositories are never overwritten; choose another name.`, 409);
    }
    const { files, excluded } = await sourceFiles(handover.source_repository, handover.source_commit);
    const account = await github(`/users/${owner}`);
    let endpoint = `/orgs/${owner}/repos`;
    if (account.type === 'User') {
      const me = await github('/user');
      if (me.login?.toLowerCase() !== owner.toLowerCase()) throw new HandoverError(`The GitHub token must belong to ${owner}.`, 403);
      endpoint = '/user/repos';
    }
    const repo = await github(endpoint, {
      method: 'POST',
      body: { name: targetName, private: true, auto_init: true,
        description: `School copy of Student Work by ${handover.student_name} (${handover.school_year}).`.slice(0, 350) },
      messages: { 422: `GitHub could not create ${target}. The name may already be taken.` }
    });
    if (repo.full_name?.toLowerCase() !== target.toLowerCase() || repo.private !== true) {
      throw new HandoverError('GitHub created an unexpected repository. Check GitHub before retrying.', 502);
    }
    const base = `/repos/${repo.full_name}`;
    const branch = encodeURIComponent(repo.default_branch);
    let head = null;
    for (let attempt = 0; attempt < 5 && !head; attempt += 1) {
      head = await github(`${base}/git/ref/heads/${branch}`, { allow404: true, messages: { 409: '' } }).catch(() => null);
      if (!head) await sleep(1000 * (attempt + 1));
    }
    if (!SHA.test(head?.object?.sha || '')) throw new HandoverError(`${repo.full_name} was created but is not ready. Check GitHub, then delete it before retrying.`, 502);
    const entries = [];
    for (const file of files) {
      const blob = await github(`${base}/git/blobs`, { method: 'POST', body: { content: file.bytes.toString('base64'), encoding: 'base64' } });
      entries.push({ path: file.path, mode: file.mode, type: 'blob', sha: blob.sha });
    }
    if (!files.some((file) => file.path === 'HANDOVER.md')) {
      entries.push({ path: 'HANDOVER.md', mode: '100644', type: 'blob', content: handoverMarkdown({
        source: handover.source_repository, commit: handover.source_commit, studentName: handover.student_name,
        schoolYear: handover.school_year, adminName, excluded, copiedAt: new Date().toISOString().slice(0, 10)
      }) });
    }
    const tree = await github(`${base}/git/trees`, { method: 'POST', body: { tree: entries } });
    const commit = await github(`${base}/git/commits`, { method: 'POST', body: {
      message: `Copy Student Work from ${handover.source_repository}@${handover.source_commit.slice(0, 12)}\n\nOriginal design and code by ${handover.student_name}.`,
      tree: tree.sha, parents: [head.object.sha]
    } });
    await github(`${base}/git/refs/heads/${branch}`, { method: 'PATCH', body: { sha: commit.sha, force: true } });
    return { repository: repo.full_name, url: repo.html_url, commit: commit.sha, copied: files.length, excluded };
  }

  async function liveDeployments(fullName) {
    if (!renderKey) return null;
    const wanted = `https://github.com/${parseRepository(fullName).fullName}`.toLowerCase();
    const found = [];
    let cursor = '';
    for (let page = 0; page < 20; page += 1) {
      const params = new URLSearchParams({ limit: '100', ...(cursor ? { cursor } : {}) });
      const items = await render(`/services?${params}`);
      if (!Array.isArray(items)) throw new HandoverError('Render returned an unexpected service list.', 502);
      for (const item of items) {
        const service = item.service || item;
        const repo = String(service.repo || '').toLowerCase().replace(/\.git$/, '').replace(/\/$/, '');
        if (repo === wanted && service.suspended !== 'suspended') found.push(service.name || service.id);
      }
      if (items.length < 100) return found;
      cursor = items[items.length - 1].cursor;
      if (!cursor) return found;
    }
    throw new HandoverError('Render service list is too long to check safely. Confirm manually.', 409);
  }

  async function freeze(fullName) {
    const info = await github(`/repos/${parseRepository(fullName).fullName}`, { method: 'PATCH', body: { archived: true } });
    if (!info.archived) throw new HandoverError('GitHub did not confirm the repository is archived. Check GitHub.', 502);
    return { archived: true };
  }

  async function transfer(fullName, newOwner) {
    if (!OWNER.test(newOwner)) throw new HandoverError('Enter the student\'s GitHub username.');
    await github(`/users/${newOwner}`, { messages: { 404: `GitHub user ${newOwner} was not found.` } });
    await github(`/repos/${parseRepository(fullName).fullName}/transfer`, {
      method: 'POST', body: { new_owner: newOwner },
      messages: { 422: 'GitHub rejected the transfer. If the repository is archived, unarchive it in GitHub settings first; the student may also already have a repository with this name.' }
    });
    return { newOwner };
  }

  return { configuration, inspect, status, label, schoolCopy, liveDeployments, freeze, transfer };
}

module.exports = { createHandoverProviders, HandoverError, parseRepository, handoverMarkdown };
