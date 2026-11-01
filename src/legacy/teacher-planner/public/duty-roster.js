(() => {
  'use strict';
  const documentUrl = 'https://docs.google.com/document/d/1ju9srfpyV7b61vR8hq2ZPF9ye-PWovRQPhZIZ-NN0_8/edit';
  function mountSetup(host, { el, request, mutate, year, canEdit, week }) {
    host.setAttribute('data-planner-navigation', '');
    const sourceLink = el('a', 'Open source duty document', { href: documentUrl, target: '_blank', rel: 'noopener noreferrer' });
    host.append(el('h2', 'Duty Roster — ' + year, { class: 'paper-heading' }),
      el('p', 'Live read-only Google Doc sync. Each staff member sees their own duties using administrator-managed duty code to school-account email mappings. No duty is copied into private notes.'), sourceLink);
    const feedback = el('p', '', { class: 'duty-roster-feedback', role: 'status', 'aria-live': 'polite' });
    const connect = el('button', 'Enable / reconnect Google Docs access', { type: 'button' });
    host.append(connect);
    connect.addEventListener('click', async () => {
      const popup = window.open('about:blank', '_blank', 'width=600,height=750');
      if (!popup) { feedback.textContent = 'Allow pop-ups to connect Google Docs.'; feedback.setAttribute('role', 'alert'); return; }
      popup.opener = null;
      try {
        const result = await mutate('google-calendar/connect', { includeDocs: true });
        popup.location.href = result.url;
        feedback.textContent = 'Approve read-only Google Docs access, return here, then select Sync / preview or Refresh duties in the Weekly Planner.';
      } catch (error) { popup.close(); feedback.textContent = error.message; feedback.setAttribute('role', 'alert'); }
    });
    if (!canEdit) {
      host.append(feedback);
      host.append(el('p', 'A Planner Lead Teacher or administrator configures the shared document and maps your duty codes to your school sign-in email. Once mapped, your weekly duties refresh from Google when you open the week.'));
      return;
    }
    const term = el('select', '', { 'aria-label': 'Duty roster term' });
    for (let i = 1; i <= 4; i++) term.append(el('option', 'Term ' + i, { value: String(i) }));
    term.value = '4';
    const enabled = el('input', '', { type: 'checkbox' });
    const enabledLabel = el('label', 'Enable live duty sync for this term '); enabledLabel.append(enabled);
    const source = el('input', '', { type: 'text', 'aria-label': 'Duty Google Doc URL or ID' });
    const mappings = el('textarea', '', { 'aria-label': 'Duty code to staff account email mappings', rows: '12',
      placeholder: 'VP = staff-account@school.nz\nSR = another-account@school.nz' });
    const save = el('button', 'Save duty setup', { type: 'button' });
    const reload = el('button', 'Reload saved setup', { type: 'button' });
    const sync = el('button', 'Sync / preview source roster', { type: 'button' });
    const build = el('button', 'Build map from Staff List', { type: 'button' });
    const mappingWarnings = el('ul', '', { 'aria-label': 'Staff mapping warnings' });
    const preview = el('div', '', { class: 'duty-roster-preview' });
    host.append(term, enabledLabel, el('p', 'Google Doc URL or ID (source must have the selected year and term heading):'), source,
      el('p', 'Map each source duty code or name to the exact email used to sign into this Planner, one per line: CODE = email. These are shared administrator settings.'),
      build, el('p', 'Build suggestions from current Staff List codes and unique first names using school emails. Existing mappings are preserved. Review warnings, then Save duty setup to publish.'), mappings, mappingWarnings,
      el('p', 'Times are read from the source zone headings. Morning tea is interpreted as AM, including the current “pm” typo. Wednesday uses its source exception or 11:15–11:35. Lunch and after-school times are PM. The configured term dates, school closures and public holidays limit weekly duties.'),
      save, reload, sync, feedback, preview);
    let revision = 0, pending = false, draft = false, loadedTerm = '';
    [source, mappings, enabled].forEach(input => input.addEventListener('input', () => {
      draft = true; preview.replaceChildren(); host.setAttribute('data-preferences-busy', 'true');
    }));
    async function act(callback) {
      if (pending) return;
      pending = true; [save, reload, sync, build, term, source, mappings, enabled].forEach(input => input.disabled = true);
      host.setAttribute('data-preferences-busy', 'true');
      try { await callback(); }
      catch (error) { feedback.setAttribute('role', 'alert'); feedback.textContent = error.message; }
      finally {
        pending = false; [save, reload, sync, build, term, source, mappings, enabled].forEach(input => input.disabled = false);
        if (!draft) host.removeAttribute('data-preferences-busy');
      }
    }
    async function load() {
      const result = await request('duty-roster/' + year + '/' + term.value);
      revision = result.revision;
      loadedTerm = term.value;
      source.value = result.content.documentId; enabled.checked = result.content.enabled;
      sourceLink.setAttribute('href', 'https://docs.google.com/document/d/' + result.content.documentId + '/edit');
      mappings.value = result.content.mappings.map(item => item.code + ' = ' + item.email).join('\n');
      feedback.setAttribute('role', 'status'); feedback.textContent = 'Saved duty setup loaded. ' +
        (enabled.checked ? 'Live duty sync is enabled. Select Sync / preview source roster to check the document.' :
          'Live duty sync is disabled. Enable it and save to display weekly duties.');
      draft = false; preview.replaceChildren(); mappingWarnings.replaceChildren();
    }
    function readMappings() {
      const values = mappings.value.split('\n').filter(line => line.trim()).map(line => {
        const parts = /^\s*([^=]+?)\s*=\s*(\S+)\s*$/.exec(line);
        if (!parts) throw new Error('Use CODE = staff-account@school.nz on every nonblank mapping line.');
        return { code: parts[1].trim().toUpperCase(), email: parts[2].toLowerCase() };
      });
      if (new Set(values.map(item => item.code)).size !== values.length) throw new Error('Each duty code/name must appear only once. Remove duplicate mappings first.');
      return values;
    }
    build.addEventListener('click', () => act(async () => {
      if (loadedTerm !== term.value) throw new Error('Reload the saved setup for this term before building mappings.');
      const current = readMappings();
      const result = await request('duty-roster/staff-mappings');
      const existing = new Map(current.map(item => [item.code, item.email]));
      const warnings = [...result.warnings];
      let added = 0;
      for (const item of result.mappings) {
        if (existing.has(item.code)) {
          if (existing.get(item.code) !== item.email) warnings.push(item.code + ': existing mapping differs from the Staff List. Existing email preserved; review manually.');
        } else { current.push(item); existing.set(item.code, item.email); added++; }
      }
      if (current.length > 250) throw new Error('The combined map exceeds 250 entries. Remove unused identifiers before building again.');
      if (added) {
        mappings.value = current.map(item => item.code + ' = ' + item.email).join('\n');
        mappings.dispatchEvent(new Event('input', { bubbles: true }));
      }
      mappingWarnings.replaceChildren(...warnings.map(text => el('li', text)));
      feedback.setAttribute('role', warnings.length ? 'alert' : 'status');
      feedback.textContent = added + ' code/name mappings added from the Staff List. Existing mappings preserved.' +
        (warnings.length ? ' Review the warnings below.' : '') + (added ? ' Select Save duty setup to publish.' : ' No changes made.');
    }));
    let savedTerm = term.value;
    term.addEventListener('change', () => {
      if (draft && !confirm('Discard unsaved duty setup changes?')) { term.value = savedTerm; return; }
      savedTerm = term.value; act(load);
    });
    reload.addEventListener('click', () => { if (!draft || confirm('Discard unsaved duty setup changes?')) act(load); });
    save.addEventListener('click', () => act(async () => {
      if (loadedTerm !== term.value) throw new Error('Reload the saved setup for this term before making changes.');
      const match = /^(?:https:\/\/docs\.google\.com\/document\/d\/)?([A-Za-z0-9_-]{20,150})(?:\/.*)?$/.exec(source.value.trim());
      if (!match) throw new Error('Paste a Google Docs document link or ID.');
      const values = readMappings();
      const result = await mutate('duty-roster/' + year + '/' + term.value,
        { revision, content: { enabled: enabled.checked, documentId: match[1], mappings: values } }, 'PUT');
      revision = result.revision; draft = false;
      sourceLink.setAttribute('href', 'https://docs.google.com/document/d/' + match[1] + '/edit');
      feedback.setAttribute('role', 'status'); feedback.textContent = 'Duty setup saved. Weekly planners will read the current source document.';
    }));
    sync.addEventListener('click', () => act(async () => {
      if (loadedTerm !== term.value) throw new Error('Reload the saved setup for this term first.');
      if (draft) throw new Error('Save the duty setup before previewing the source.');
      preview.replaceChildren();
      const result = await request('google-calendar/duty-events/' + year + '/' + term.value + '?week=' + week + '&preview=true');
      if (!result.enabled) throw new Error('Enable and save duty sync for this term first.');
      feedback.setAttribute('role', result.unmapped.length ? 'alert' : 'status');
      feedback.textContent = 'Synced ' + new Date(result.fetchedAt).toLocaleString('en-NZ') +
        '. Unmapped source codes: ' + (result.unmapped.join(', ') || 'none') + '.';
      const table = el('table'); const heading = el('tr');
      ['Day', 'Time', 'Duty', 'Code'].forEach(text => heading.append(el('th', text))); table.append(heading);
      for (const duty of result.duties) {
        const row = el('tr');
        [['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'][duty.day],
          duty.startTime ? duty.startTime + '–' + duty.endTime : 'All day', duty.location, duty.code]
          .forEach(text => row.append(el('td', text)));
        table.append(row);
      }
      preview.append(table);
    }));
    act(load);
  }
  function mountWeek(spread, { el, request, week, align, refreshButton }) {
    const panel = el('div', '', { class: 'weekly-duty-status', 'data-planner-navigation': '' });
    const message = el('p', '', { role: 'status' });
    const refresh = refreshButton || el('button', 'Refresh duties', { type: 'button' });
    refresh.hidden = false;
    panel.append(message);
    if (!refreshButton) panel.append(refresh);
    spread.before(panel);
    async function load() {
      refresh.disabled = true;
      for (const host of spread.querySelectorAll('[data-weekly-duties]')) host.replaceChildren();
      message.textContent = 'Checking the latest duty roster...'; message.setAttribute('role', 'status');
      try {
        const dates = Array.from({ length: 5 }, (_, i) => {
          const date = new Date(week + 'T00:00:00Z'); date.setUTCDate(date.getUTCDate() + i); return date.toISOString().slice(0, 10);
        });
        const events = []; let enabled = false, mapped = false, fetchedAt;
        for (const year of new Set(dates.map(date => date.slice(0, 4)))) {
          const active = await request('duty-roster/active/' + year);
          if (!active.terms.length) continue;
          const school = await request('school-settings/' + year);
          const holidays = await request('../school-calendar/' + year);
          if (holidays.publicHolidaysError) throw new Error(holidays.publicHolidaysError);
          const applicable = active.terms.filter(term => {
            const fallback = holidays.terms?.find(item => item.term === Number(term));
            const start = school.content['term' + term + 'Start'] || fallback?.startDate;
            const end = school.content['term' + term + 'End'] || fallback?.endDate;
            if (!start || !end) throw new Error('School and Ministry term dates are unavailable. Publish term dates in Planner Setup, then refresh duties.');
            return dates.some(date => date >= start && date <= end);
          });
          if (!applicable.length) continue;
          for (const term of applicable) {
            const result = await request('google-calendar/duty-events/' + year + '/' + term + '?week=' + week);
            enabled ||= result.enabled; mapped ||= result.mapped; fetchedAt = result.fetchedAt || fetchedAt;
            events.push(...result.events.filter(event => !(holidays.publicHolidays || []).some(holiday => holiday.date === event.date)));
          }
        }
        if (!spread.isConnected) return;
        for (const host of spread.querySelectorAll('[data-weekly-duties]')) {
          const [slot, day] = host.dataset.weeklyDuties.split(':');
          for (const duty of events.filter(event => event.slot === slot && event.date === dates[Number(day)])) {
            host.append(el('p', 'Duty: ' + duty.location + ' · ' + (duty.startTime ? duty.startTime + '–' + duty.endTime : 'All day'),
              { class: 'weekly-duty-label' }));
          }
        }
        message.textContent = !enabled ? 'No duty roster enabled for this week.' : !mapped ?
          'No duty code is mapped to your school sign-in email. Ask a Planner administrator to map it in Duty Roster setup.' :
          events.length + ' duties from the live roster. Synced ' + new Date(fetchedAt).toLocaleString('en-NZ') + '.';
        align(spread);
      } catch (error) {
        if (spread.isConnected) { message.setAttribute('role', 'alert'); message.textContent = error.message + ' No duties are displayed. Check Duty Roster setup, then Refresh duties. Notes and activities are unchanged.'; }
      } finally { refresh.disabled = false; }
    }
    refresh.onclick = load;
    load();
  }
  globalThis.plannerDutyRoster = { mountSetup, mountWeek };
})();
