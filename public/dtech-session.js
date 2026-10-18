(() => {
  const context = window.whsDtech;
  if (!context) return;
  document.documentElement.classList.add('whs-dtech-integrated');
  window.getEffectiveHubViewMode = () => context.viewMode;
  const key = 'whs_dtech_auth_v1';
  // Profile hints support the original UI; the server accepts only the signed school session.
  try {
    const previous = localStorage.getItem(key);
    let state = previous ? JSON.parse(previous) : {};
    if (!state || typeof state !== 'object' || Array.isArray(state) || state.profile?.email !== context.profile.email) state = {};
    state.profile = context.profile;
    if (!state.accessToken) state.expiresAt = context.expiresAt;
    localStorage.setItem(key, JSON.stringify(state));
    sessionStorage.setItem(key, JSON.stringify(state));
  } catch (error) {
    console.warn('DTECH profile cache is unavailable; using the school session:', error.message);
  }
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    const url = new URL(input instanceof Request ? input.url : input, location.href);
    const method = String(init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    if (url.origin === location.origin && url.pathname.startsWith('/dtech-hub/')) {
      const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
      if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) headers.set('x-dtech-csrf', context.csrf);
      return originalFetch(input, { ...init, headers });
    }
    return originalFetch(input, init);
  };
  const open = XMLHttpRequest.prototype.open;
  const send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url, ...args) {
    const target = new URL(url, location.href);
    this.whsDtechMutation = target.origin === location.origin && target.pathname.startsWith('/dtech-hub/')
      && !['GET', 'HEAD', 'OPTIONS'].includes(String(method).toUpperCase());
    return open.call(this, method, url, ...args);
  };
  XMLHttpRequest.prototype.send = function (body) {
    if (this.whsDtechMutation) this.setRequestHeader('x-dtech-csrf', context.csrf);
    return send.call(this, body);
  };
})();
