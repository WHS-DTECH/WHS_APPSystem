function httpsAppUrl(value) {
  if (typeof value !== 'string' || /[\x00-\x20\x7f\\]/.test(value)) {
    throw new Error('Use an absolute HTTPS app address without spaces or backslashes.');
  }
  const url = new URL(value);
  if (url.protocol !== 'https:' || !url.hostname.includes('.') || url.hostname === 'localhost'
    || url.username || url.password || url.port || url.search || url.hash || url.pathname !== '/') {
    throw new Error('Use an HTTPS app origin without credentials, port, path, query or fragment.');
  }
  return url.href;
}

function appDestination(value) {
  if (typeof value !== 'string' || !value || value.length > 2048 || /[\x00-\x20\x7f\\]/.test(value)) {
    throw new Error('Use a local app path or an absolute HTTPS address.');
  }
  if (value.startsWith('/') && !value.startsWith('//')) {
    const parsed = new URL(value, 'https://global-control.invalid');
    if (parsed.pathname !== value.split(/[?#]/)[0]) throw new Error('Use a canonical local app path without dot segments.');
    return value;
  }
  const url = new URL(value);
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) {
    throw new Error('Use an HTTPS app address without embedded credentials.');
  }
  return url.href;
}

module.exports = { httpsAppUrl, appDestination };
