(() => {
  'use strict';
  const sourceUrl = 'https://docs.google.com/document/d/1CeQsohEKMEwEGpdHHOXbgV_d77MAwGBVYdZZdQ5h0vw/edit';
  async function loadEvents({ request, settings, year, status }) {
    status ||= await request('google-calendar/');
    if (!status.configured || !status.docsEnabled) throw new Error('Enable Google Docs access in Year Overview to include its meeting and assembly events.');
    const dates = await settings();
    const params = new URLSearchParams({ year: String(year) });
    for (const range of dates.ranges) {
      if (range.startDate) params.set('term' + range.term + 'Start', range.startDate);
      if (range.endDate) params.set('term' + range.term + 'End', range.endDate);
    }
    if (dates.settings.content.studentFirstDay) params.set('studentFirstDay', dates.settings.content.studentFirstDay);
    const result = await request('google-calendar/document-events?' + params);
    if (result.connectionId !== status.connectionId) throw new Error('Your Google account changed during sync. Select Sync now again.');
    return result;
  }
  function mount(host, { el, request, mutate, settings, year, setEvents }) {
    host.dataset.googleCalendar = '';
    host.className = 'school-calendar-info planner-hint google-doc-sync';
    host.append(el('summary', 'Google Doc Sync: Meets & Assemblies'));
    const feedback = el('p', 'Checking your private Google connection...', { role: 'status', 'aria-live': 'polite' });
    const account = el('p');
    const actions = el('div', '', { class: 'google-calendar-actions' });
    const connect = el('button', 'Enable Google Docs access', { type: 'button' });
    const sync = el('button', 'Sync now', { type: 'button' });
    const warnings = el('ul');
    actions.append(connect, sync);
    host.append(el('a', 'Open source Google Doc', { href: sourceUrl, target: '_blank', rel: 'noopener noreferrer' }),
      account, feedback, actions,
      el('p', 'Read-only, school-private. Refreshes from Google when Year Overview opens or you select Sync now. Hui: Tuesday 3:30–4:30pm. Assemblies: Wednesday 10:45–11:15am. Explicit document days/times override these. Undated school events are marked “Week of…” on Monday, not treated as confirmed Monday events.'),
      warnings);
    function message(text, error = false) {
      feedback.textContent = text;
      feedback.setAttribute('role', error ? 'alert' : 'status');
      if (error) host.open = true;
    }
    async function load() {
      sync.disabled = connect.disabled = true;
      warnings.replaceChildren();
      setEvents([]);
      message('Syncing the latest document...');
      try {
        const status = await request('google-calendar/');
        if (!host.isConnected) return;
        if (!status.configured) throw new Error('Google connection is not configured. Ask the project owner to complete Google setup.');
        account.textContent = status.connected ? 'Connected as ' + status.email : 'No Google account connected.';
        connect.textContent = status.docsEnabled ? 'Reconnect / change Google account' : 'Enable Google Docs access';
        if (!status.docsEnabled) throw new Error('Enable Google Docs access, complete Google consent in the new tab, then select Sync now. Your Calendar connection and private entries stay separate from document events.');
        const result = await loadEvents({ request, settings, year, status });
        if (!host.isConnected) return;
        if (result.connectionId !== status.connectionId) throw new Error('Your Google account changed during sync. Select Sync now again.');
        setEvents(result.events);
        for (const warning of result.warnings) warnings.append(el('li', warning));
        message(result.events.length + ' document entries synced. Last successful sync: ' +
          new Date(result.fetchedAt).toLocaleString('en-NZ') + '.' +
          (result.warnings.length ? ' Some source items need attention; see the warnings below.' : ''),
        result.warnings.length > 0);
      } catch (error) {
        if (host.isConnected) message(error.message + ' No document events are currently displayed. Other calendar sources and saved entries are unchanged.', true);
      } finally {
        if (host.isConnected) sync.disabled = connect.disabled = false;
      }
    }
    connect.addEventListener('click', async () => {
      const popup = window.open('about:blank', '_blank', 'width=600,height=750');
      if (!popup) { message('Allow pop-ups for this site, then try enabling Google Docs access again.', true); return; }
      popup.opener = null;
      connect.disabled = sync.disabled = true;
      try {
        const result = await mutate('connect', { includeDocs: true });
        popup.location.href = result.url;
        message('Approve the read-only permissions in the Google tab. When it says connected, close it and select Sync now. Your planner edits remain on this page.');
      } catch (error) { popup.close(); message(error.message, true); }
      finally { if (host.isConnected) connect.disabled = sync.disabled = false; }
    });
    sync.addEventListener('click', load);
    load();
  }
  globalThis.plannerGoogleDocSync = { mount, loadEvents };
})();
