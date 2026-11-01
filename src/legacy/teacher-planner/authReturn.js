function authReturn(value) {
  return typeof value === 'string' && /^\/#[A-Za-z0-9=&-]{1,180}$/.test(value) ? value : '/';
}

module.exports = { authReturn };
