const crypto = require('crypto');
const fs = require('fs');

const MAX_FILES = 300;
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_TOTAL_BYTES = 15 * 1024 * 1024;
const SHA = /^[a-f0-9]{40}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

class ArchiveError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function repository(value) {
  const input = String(value || '').trim();
  const match = input.match(/^(?:https:\/\/github\.com\/)?([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9_.-]{1,100}?)(?:\.git)?\/?$/);
  if (!match || ['.', '..'].includes(match[2])) {
    throw new ArchiveError('Enter a GitHub repository as owner/repository or https://github.com/owner/repository.');
  }
  return { owner: match[1], name: match[2], fullName: `${match[1]}/${match[2]}` };
}

function pathReason(path, mode) {
  if (path.startsWith('/') || path.includes('\\') || path.split('/').some((part) => !part || part === '.' || part === '..')
    || /[\x00-\x1f\x7f]/.test(path) || path.length > 240) return 'Unsupported or unsafe path';
  if (!['100644', '100755'].includes(mode)) return 'Symbolic link or submodule; separate handover required';
  if (/(^|\/)(?:node_modules|vendor|\.git|\.venv|venv|__pycache__|dist|build|coverage|uploads?|backups?|ClientSS|instance)(\/|$)/i.test(path)) {
    return 'Dependencies, generated files, uploads or runtime data';
  }
  if (/(^|\/)(?:\.env(?:[.-].*)?|credentials[^/]*|secrets?(?:[.-][^/]*)?|id_rsa|id_ed25519|\.npmrc|\.pypirc|\.netrc|_whs-import\.json)$/i.test(path)
    || /\.(?:pem|key|p12|pfx|keystore|db|sqlite3?|sql|dump|bak|csv|xlsx?|ods|log|zip|tar|gz|7z|exe|dll|pyc)$/i.test(path)) {
    return 'Potential credentials, private data or generated/archive file';
  }
  return null;
}

function contentReason(bytes) {
  const text = bytes.toString('utf8');
  if (text.startsWith('version https://git-lfs.github.com/spec/v1')) return 'Git LFS pointer; actual file contents require a separate handover';
  if (/-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----|(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[A-Z0-9]{16})/.test(text)) {
    return 'Potential embedded access token or private key';
  }
  const assignments = text.matchAll(/(?:password|passwd|secret_key|client_secret|api_key|access_token|database_url)\s*[:=]\s*["']([^"'\r\n]{4,})["']/gi);
  for (const [, value] of assignments) {
    if (!/^(?:test|example|dummy|placeholder|change[-_ ]?me|your[-_ ]|<|\$\{|\{\{)/i.test(value)
      && !/^(?:none|null|undefined)$/i.test(value)) return 'Potential hard-coded credential; review and remove it at source';
  }
  if (/(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^:\s/]+:[^@\s]+@/i.test(text)) {
    return 'Potential database connection credential';
  }
  return null;
}

function digest(snapshot) {
  return crypto.createHash('sha256').update(JSON.stringify({
    repository: snapshot.repository, commit: snapshot.commit, tree: snapshot.tree,
    files: snapshot.files, excluded: snapshot.excluded
  })).digest('hex');
}

function createArchiveService({ env = process.env, fetchImpl = fetch, readFile = fs.readFileSync } = {}) {
  function configuration() {
    const missing = ['GITHUB_READER_APP_ID', 'GITHUB_READER_PRIVATE_KEY_FILE',
      'GITHUB_WRITER_APP_ID', 'GITHUB_WRITER_PRIVATE_KEY_FILE'].filter((key) => !env[key]);
    return { ready: !missing.length, missing, destination: env.GITHUB_ARCHIVE_REPOSITORY || 'WHS-DTECH/WHS-TECHArchive' };
  }

  function jwt(kind) {
    const id = env[`GITHUB_${kind}_APP_ID`];
    const filename = env[`GITHUB_${kind}_PRIVATE_KEY_FILE`];
    if (!id || !filename) throw new ArchiveError('GitHub Apps are not configured. Follow the Render setup instructions.', 503);
    try {
      const now = Math.floor(Date.now() / 1000);
      const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({ iat: now - 60, exp: now + 540, iss: id })).toString('base64url');
      const data = `${header}.${payload}`;
      return `${data}.${crypto.sign('RSA-SHA256', Buffer.from(data), readFile(filename)).toString('base64url')}`;
    } catch {
      throw new ArchiveError(`The ${kind.toLowerCase()} App private key could not be loaded or used. Check the Render secret file.`, 503);
    }
  }

  async function api(token, path, method = 'GET', body) {
    try {
      const response = await fetchImpl(`https://api.github.com${path}`, {
        method, redirect: 'error', signal: AbortSignal.timeout(30000),
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'WHS-Student-Archive',
          ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {})
      });
      if (!response.ok) {
        const messages = {
          401: 'GitHub rejected the App credentials. Check the App ID and private key.',
          403: 'GitHub denied access or its rate limit was reached. Check App permissions and try again later.',
          404: 'GitHub repository or installation not found. Check the address and install the correct App on that repository.',
          409: 'GitHub could not update the archive. Initialise its main branch with a README and retry.',
          422: 'GitHub rejected the archive update, possibly because another commit was made. Create a fresh preview and retry.'
        };
        if (response.body) await response.body.cancel();
        throw new ArchiveError(messages[response.status] || `GitHub request failed (HTTP ${response.status}).`, 502);
      }
      const reader = response.body.getReader();
      const parts = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 8 * 1024 * 1024) {
          await reader.cancel();
          throw new ArchiveError('GitHub response exceeds the importer size limit. Arrange a manual handover.');
        }
        parts.push(Buffer.from(value));
      }
      return JSON.parse(Buffer.concat(parts).toString('utf8'));
    } catch (error) {
      if (error instanceof ArchiveError) throw error;
      throw new ArchiveError('GitHub could not be reached or returned an invalid response. Retry the operation.', 502);
    }
  }

  async function access(kind, repo) {
    const appJwt = jwt(kind);
    const installation = await api(appJwt, `/repos/${repo.fullName}/installation`);
    const result = await api(appJwt, `/app/installations/${installation.id}/access_tokens`, 'POST', {
      repositories: [repo.name], permissions: { contents: kind === 'READER' ? 'read' : 'write' }
    });
    if (!result.token) throw new ArchiveError('GitHub did not issue an installation token.', 502);
    return result.token;
  }

  async function destination() {
    const repo = repository(configuration().destination);
    const token = await access('WRITER', repo);
    const info = await api(token, `/repos/${repo.fullName}`);
    if (info.private !== true) throw new ArchiveError('Import blocked: the archive repository must be private.');
    if (info.archived || info.disabled) throw new ArchiveError('The archive repository is read-only or disabled.');
    return { repo, token, info };
  }

  async function collect(source, ref) {
    const repo = repository(source);
    const target = repository(configuration().destination);
    if (repo.fullName.toLowerCase() === target.fullName.toLowerCase()) throw new ArchiveError('The archive cannot be used as a source repository.');
    const token = await access('READER', repo);
    const info = await api(token, `/repos/${repo.fullName}`);
    const revision = ref || info.default_branch;
    if (typeof revision !== 'string' || !revision || revision.length > 200 || /[\x00-\x1f\x7f]/.test(revision)) {
      throw new ArchiveError('Enter a valid branch, tag or commit (up to 200 characters).');
    }
    const commit = await api(token, `/repos/${repo.fullName}/commits/${encodeURIComponent(revision)}`);
    if (!SHA.test(commit.sha) || !SHA.test(commit.commit?.tree?.sha)) throw new ArchiveError('GitHub returned an invalid source commit.', 502);
    const tree = await api(token, `/repos/${repo.fullName}/git/trees/${commit.commit.tree.sha}?recursive=1`);
    if (tree.truncated || !Array.isArray(tree.tree)) throw new ArchiveError('Repository listing is incomplete. Use a manual handover for this project.');
    const entries = tree.tree.filter((entry) => entry.type !== 'tree');
    if (entries.length > MAX_FILES) throw new ArchiveError(`This importer supports up to ${MAX_FILES} repository files. Arrange a manual handover for larger projects.`);
    const files = [];
    const excluded = [];
    const blobs = new Map();
    let total = 0;
    for (const entry of entries.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)) {
      const reason = pathReason(entry.path, entry.mode);
      if (reason) {
        excluded.push({ path: entry.path, reason });
        continue;
      }
      if (!SHA.test(entry.sha) || !Number.isSafeInteger(entry.size) || entry.size < 0) throw new ArchiveError('Invalid source file metadata.', 502);
      if (entry.size > MAX_FILE_BYTES) throw new ArchiveError(`File exceeds the 1 MiB limit: ${entry.path}. Arrange a manual handover.`);
      total += entry.size;
      if (total > MAX_TOTAL_BYTES) throw new ArchiveError('Source exceeds the 15 MiB import limit. Arrange a manual handover.');
      const blob = await api(token, `/repos/${repo.fullName}/git/blobs/${entry.sha}`);
      if (blob.encoding !== 'base64' || typeof blob.content !== 'string') throw new ArchiveError('Unsupported GitHub blob response.', 502);
      const bytes = Buffer.from(blob.content, 'base64');
      const actualSha = crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
      if (bytes.length !== entry.size || actualSha !== entry.sha) throw new ArchiveError('Source file verification failed. Import stopped.', 502);
      const secret = contentReason(bytes);
      if (secret) {
        excluded.push({ path: entry.path, reason: secret });
      } else {
        files.push({ path: entry.path, sha: entry.sha, mode: entry.mode, size: bytes.length });
        blobs.set(entry.sha, bytes);
      }
    }
    if (!files.length) throw new ArchiveError('No eligible source files were found. Review the repository and arrange a manual handover.');
    const snapshot = { repository: repo.fullName, commit: commit.sha, tree: commit.commit.tree.sha,
      ref: revision, files, excluded, bytes: files.reduce((sum, file) => sum + file.size, 0) };
    snapshot.digest = digest(snapshot);
    return { snapshot, blobs };
  }

  async function preview(source, ref) {
    await destination();
    return (await collect(source, ref)).snapshot;
  }

  async function archive(snapshot, slug, importId) {
    if (!SLUG.test(slug) || slug.length > 60 || !SHA.test(snapshot.commit) || digest(snapshot) !== snapshot.digest) {
      throw new ArchiveError('Invalid preview. Create a fresh preview.');
    }
    const { snapshot: current, blobs } = await collect(snapshot.repository, snapshot.commit);
    if (current.digest !== snapshot.digest) throw new ArchiveError('Source review changed. Create a fresh preview.');
    const { repo, token, info } = await destination();
    const base = `/repos/${repo.fullName}`;
    const branch = encodeURIComponent(info.default_branch);
    const head = await api(token, `${base}/git/ref/heads/${branch}`);
    const parent = await api(token, `${base}/git/commits/${head.object.sha}`);
    const folder = `LegacySites/StudentApps/${slug}/snapshots/${snapshot.commit}-${snapshot.digest.slice(0, 12)}`;
    const rootTree = await api(token, `${base}/git/trees/${parent.tree.sha}?recursive=1`);
    if (rootTree.truncated) throw new ArchiveError('Archive listing is too large to verify safely. Arrange a manual handover.');
    if (rootTree.tree.some((entry) => entry.path === folder || entry.path.startsWith(`${folder}/`))) {
      throw new ArchiveError('This reviewed source snapshot is already archived. Existing copies will not be overwritten.');
    }
    const copied = new Map();
    const entries = [];
    for (const file of snapshot.files) {
      if (!copied.has(file.sha)) {
        const blob = await api(token, `${base}/git/blobs`, 'POST', { content: blobs.get(file.sha).toString('base64'), encoding: 'base64' });
        if (blob.sha !== file.sha) throw new ArchiveError('Archive file verification failed. Import stopped.', 502);
        copied.set(file.sha, blob.sha);
      }
      entries.push({ path: `${folder}/${file.path}`, mode: file.mode, type: 'blob', sha: copied.get(file.sha) });
    }
    const manifest = { importId, importedAt: new Date().toISOString(), ...snapshot,
      note: 'Reviewed source snapshot only; not full Git history, databases, external uploads or deployment secrets. Exclusion checks are not a guarantee that all sensitive content was detected.' };
    entries.push({ path: `${folder}/_whs-import.json`, mode: '100644', type: 'blob', content: JSON.stringify(manifest, null, 2) });
    const tree = await api(token, `${base}/git/trees`, 'POST', { base_tree: parent.tree.sha, tree: entries });
    const commit = await api(token, `${base}/git/commits`, 'POST', {
      message: `Archive ${slug} source ${snapshot.commit}\n\nImport: ${importId}`, tree: tree.sha, parents: [head.object.sha]
    });
    const updated = await api(token, `${base}/git/refs/heads/${branch}`, 'PATCH', { sha: commit.sha, force: false });
    if (updated.object?.sha !== commit.sha) {
      throw new ArchiveError('Archive branch update could not be verified. Check GitHub history for this import ID before retrying.', 502);
    }
    return { commit: commit.sha, folder, repository: repo.fullName,
      url: `https://github.com/${repo.fullName}/tree/${commit.sha}/${folder}` };
  }

  return { configuration, preview, archive };
}

module.exports = { createArchiveService, ArchiveError, repository, pathReason, contentReason };
