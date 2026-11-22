function cardLink(value) {
  const url = new URL(value);
  if (url.origin !== 'https://trello.com' || url.username || url.password || url.search || url.hash ||
    !/^\/c\/[A-Za-z0-9]+(?:\/[^/]+)?$/.test(url.pathname)) throw new Error('Invalid Trello card link.');
  const slug = url.pathname.split('/')[3];
  if (slug && /[/\\\u0000-\u001f\u007f]/.test(decodeURIComponent(slug))) throw new Error('Invalid Trello card link.');
  return url.href;
}

function hasReadOnlyBoardGrant(grant, board) {
  const permissions = grant?.permissions;
  return Array.isArray(permissions) && permissions.length > 0 &&
    permissions.every(item => item && item.write === false) &&
    permissions.some(item => typeof item.modelType === 'string' && /^boards?$/i.test(item.modelType) &&
      ['*', board].includes(item.idModel) && item.read === true);
}

function createTrelloReader({ key, token, fetchImpl = globalThis.fetch }) {
  return async (path, fields) => {
    const url = new URL('https://api.trello.com/1/' + path);
    for (const [name, value] of Object.entries(fields)) url.searchParams.set(name, value);
    const response = await fetchImpl(url.href, {
      method: 'GET', redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: { Accept: 'application/json', Authorization: `OAuth oauth_consumer_key="${key}", oauth_token="${token}"` }
    });
    if (!response.ok) throw Object.assign(new Error('Trello read failed.'), { status: response.status });
    return response.json();
  };
}

module.exports = { cardLink, hasReadOnlyBoardGrant, createTrelloReader };
