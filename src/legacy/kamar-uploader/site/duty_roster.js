(() => {
  const api = '/teacher-planner/api/planner/';
  const yearInput = document.getElementById('dutyRosterYear');
  const host = document.getElementById('dutyRosterSetup');
  const status = document.getElementById('dutyRosterPageStatus');
  let csrf = '';
  let currentYear;
  let loadId = 0;

  function el(tag, text = '', attrs = {}) {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    return node;
  }
  function setStatus(message, error = false) {
    status.textContent = message;
    status.setAttribute('role', error ? 'alert' : 'status');
  }
  async function request(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    const method = String(options.method || 'GET').toUpperCase();
    if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) headers['x-planner-csrf'] = csrf;
    const response = await fetch(api + path, { ...options, headers, cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Duty Roster request failed.');
    return payload;
  }
  function currentWeek() {
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());
    const monday = new Date(today + 'T00:00:00Z');
    monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
    return monday.toISOString().slice(0, 10);
  }
  async function loadSetup(year) {
    const requestId = ++loadId;
    yearInput.disabled = true;
    setStatus('Loading shared duty setup...');
    host.removeAttribute('data-preferences-busy');
    host.replaceChildren();
    try {
      const session = await request('session');
      if (requestId !== loadId) return;
      csrf = session.csrf;
      if (typeof csrf !== 'string' || csrf.length < 32) throw new Error('The Planner form session is unavailable. Reload this page.');
      if (!globalThis.plannerDutyRoster?.mountSetup) throw new Error('The shared Duty Roster tools could not be loaded. Reload this page.');
      globalThis.plannerDutyRoster.mountSetup(host, {
        el, year, week: currentWeek(), canEdit: session.canManageSchoolSettings === true,
        request,
        mutate: (path, body, method = 'POST') => request(path, {
          method, body: JSON.stringify(body)
        })
      });
      currentYear = year;
      setStatus('Duty Roster setup loaded. Weekly duty assignments remain in Teacher Planner.');
    } catch (error) {
      if (requestId !== loadId) return;
      host.replaceChildren(el('p', error.message, { role: 'alert' }));
      setStatus(error.message, true);
    } finally {
      if (requestId === loadId) yearInput.disabled = false;
    }
  }

  yearInput.value = new Intl.DateTimeFormat('en-NZ', {
    timeZone: 'Pacific/Auckland', year: 'numeric'
  }).format(new Date());
  currentYear = Number(yearInput.value);
  yearInput.addEventListener('change', () => {
    const year = Number(yearInput.value);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      yearInput.value = String(currentYear);
      setStatus('Choose a year from 2000 to 2100.', true);
      return;
    }
    if (host.getAttribute('data-preferences-busy') === 'true' &&
        !window.confirm('Discard unsaved Duty Roster changes and load another year?')) {
      yearInput.value = String(currentYear);
      return;
    }
    currentYear = year;
    loadSetup(year);
  });
  loadSetup(currentYear);
})();
