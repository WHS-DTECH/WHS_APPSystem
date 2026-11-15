(() => {
  'use strict';
  const body = document.body;
  const api = body.dataset.api;
  const host = document.getElementById('assessment-manager-content');
  const status = document.getElementById('assessment-manager-status');
  const yearInput = document.getElementById('assessment-year');
  let csrf = '';
  let saveCurrent = async () => true;
  let hasUnsavedChanges = () => false;
  let openSetupYear;
  let renderVersion = 0;

  function el(tag, text = '', attrs = {}) {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    return node;
  }

  function message(text, error = false) {
    status.textContent = text;
    status.setAttribute('role', error ? 'alert' : 'status');
  }

  async function request(path, options = {}) {
    const method = String(options.method || 'GET').toUpperCase();
    const headers = new Headers(options.headers || {});
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) headers.set('x-assessment-csrf', csrf);
    const response = await fetch(api + path, { ...options, method, headers, cache: 'no-store' });
    if (!response.ok) {
      const text = await response.text();
      let detail;
      try { detail = JSON.parse(text); } catch { detail = null; }
      throw new Error(detail?.error || 'Assessment Manager request failed (HTTP ' + response.status + '). Retry shortly.');
    }
    if (options.blobResponse) return response.blob();
    const type = response.headers.get('content-type') || '';
    return type.includes('application/json') ? response.json() : response.text();
  }

  function routeFromHash() {
    const params = new URLSearchParams(location.hash.slice(1));
    const year = Number(params.get('year') || yearInput.value);
    const section = ['home', 'standards', 'moderation', 'setup', 'library', 'suppliers'].includes(params.get('section'))
      ? params.get('section') : 'home';
    return {
      year: Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : Number(yearInput.value),
      section,
      record: params.get('record') || '',
      page: params.get('page') || 'overview'
    };
  }

  async function navigate({ year, section, record = '', page = 'overview' }) {
    await saveCurrent();
    const params = new URLSearchParams({ year: String(year), section, ...(record ? { record } : {}), page });
    location.hash = params.toString();
  }

  function updateNavigation(section) {
    for (const link of document.querySelectorAll('.assessment-manager-nav a')) {
      const selected = new URLSearchParams(link.hash.slice(1)).get('section') === section;
      if (selected) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
  }

  function recordSnapshot(area, initial, setupOnly) {
    const next = { ...initial };
    const selector = setupOnly ? '[data-moderation-setting]' : '[name]';
    for (const input of area.querySelectorAll(selector)) {
      const key = setupOnly ? input.getAttribute('data-moderation-setting') : input.getAttribute('name');
      next[key] = input.value;
    }
    return next;
  }

  async function renderModeration(route, setupOnly, version) {
    const record = route.record || 'main';
    const saved = await request(route.year + '/moderation/' + record);
    if (version !== renderVersion) return;
    host.replaceChildren();
    const area = el('div');
    host.append(area);
    let revision = saved.revision || 0;
    let data = saved.content || {};
    let dirty = false;
    let timer;
    let savePromise;

    async function saveNow() {
      clearTimeout(timer);
      if (savePromise) {
        await savePromise;
        if (dirty) return saveNow();
        return true;
      }
      if (!dirty) return true;
      const snapshot = recordSnapshot(area, data, setupOnly);
      dirty = false;
      savePromise = request(route.year + '/moderation/' + record, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: snapshot, revision })
      });
      try {
        const savedResult = await savePromise;
        revision = savedResult.revision;
        data = snapshot;
        message('Autosaved.');
      } catch (error) {
        dirty = true;
        message(error.message + ' Your draft remains on this page.', true);
        throw error;
      } finally {
        savePromise = undefined;
      }
      if (dirty) return saveNow();
      return true;
    }

    const scheduleSave = () => {
      dirty = true;
      clearTimeout(timer);
      timer = setTimeout(() => saveNow().catch(() => {}), 800);
      message('Saving changes…');
    };
    area.addEventListener('input', scheduleSave);
    area.addEventListener('change', scheduleSave);
    saveCurrent = saveNow;
    hasUnsavedChanges = () => dirty || Boolean(savePromise);

    const moderation = globalThis.plannerModeration.mount(area, {
      el,
      data,
      year: route.year,
      record: route.record,
      page: route.page,
      setupOnly,
      ownerId: body.dataset.userId,
      displayName: body.dataset.plannerName,
      userEmail: body.dataset.userEmail,
      feedbackTemplateUrl: api + 'moderation/templates/feedback',
      scheduleTemplateUrl: api + 'moderation/templates/schedule',
      coversheetTemplateUrl: api + 'moderation/templates/coversheet',
      request,
      mutate: (path, value) => request(path, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(value)
      }),
      binaryRequest: (path, options = {}) => request(path, options),
      saveNow,
      changeYear: nextYear => nextYear === route.year ? renderRoute() : navigate({ ...route, year: nextYear }),
      navigate: (nextRecord, page) => navigate({
        year: route.year, section: 'moderation', record: nextRecord, page
      })
    });
    openSetupYear = setupOnly ? moderation.openYear : undefined;
  }

  async function renderStandards(route, version) {
    const [saved, moderationSetup] = await Promise.all([
      request(route.year + '/assessmentSetup/main'),
      request(route.year + '/moderation/main')
    ]);
    if (version !== renderVersion) return;
    let revision = saved.revision || 0;
    let savingStandards = false;
    let standards = [];
    let topics = [];
    try { standards = JSON.parse(saved.content?.selectedStandards || '[]'); }
    catch { throw new Error('Saved standards could not be read. They have not been changed.'); }
    try { topics = JSON.parse(moderationSetup.content?.folderTopics || '[]'); }
    catch { throw new Error('Saved moderation topics could not be read. They have not been changed.'); }
    if (!Array.isArray(topics)) throw new Error('Saved moderation topics could not be read. They have not been changed.');
    host.replaceChildren();
    saveCurrent = async () => true;
    const page = el('section', '', { class: 'paper-page assessment-standards-page' });
    page.append(el('h2', 'Setup Assessment', { class: 'paper-heading' }),
      el('p', 'Manage your private My Standards list for this year. Add topics in Setup Moderation, then assign each standard to a topic folder.'));
    const form = el('form', '', { class: 'assessment-standard-search' });
    const queryLabel = el('label', 'Search NZQA standards');
    const query = el('input', '', { type: 'search', required: '', minlength: '2', maxlength: '100', autocomplete: 'off' });
    queryLabel.append(query);
    const searchButton = el('button', 'Search', { type: 'submit' });
    form.append(queryLabel, searchButton);
    const searchStatus = el('p', '', { role: 'status', 'aria-live': 'polite' });
    const results = el('ul', '', { class: 'assessment-standard-results-list' });
    const selectedHeading = el('h3', 'Selected standards', { id: 'assessment-selected-heading' });
    const selectedScroll = el('div', '', { class: 'assessment-selected-scroll', tabindex: '0', role: 'region', 'aria-label': 'Selected standards and topic folders' });
    const selectedTable = el('table', '', { class: 'assessment-selected-standards', 'aria-labelledby': 'assessment-selected-heading' });
    const head = el('thead'), headings = el('tr'), selected = el('tbody');
    for (const label of ['Standard', 'Topic Folder', 'Action']) headings.append(el('th', label, { scope: 'col' }));
    head.append(headings); selectedTable.append(head, selected); selectedScroll.append(selectedTable);
    const selectedStatus = el('p', '', { role: 'status', 'aria-live': 'polite' });
    if (!topics.length) selectedStatus.textContent = 'Add topics in Setup Moderation before assigning standards.';
    page.append(form, searchStatus, results, selectedHeading, selectedScroll, selectedStatus);
    host.append(page);

    async function persistStandards() {
      if (standards.length > 100) throw new Error('Select no more than 100 standards.');
      if (savingStandards) throw new Error('Wait for the current standards save to finish.');
      savingStandards = true;
      renderSelected();
      try {
        const result = await request(route.year + '/assessmentSetup/main', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ revision, content: { selectedStandards: JSON.stringify(standards) } })
        });
        revision = result.revision;
        selectedStatus.textContent = 'Standards saved.';
        message('Autosaved.');
      } finally {
        savingStandards = false;
        renderSelected();
      }
    }

    function renderSelected() {
      selected.replaceChildren();
      if (!standards.length) {
        const row = el('tr');
        row.append(el('td', 'No standards selected yet.', { colspan: '3' }));
        selected.append(row);
      }
      for (const item of standards) {
        const row = el('tr'), standardCell = el('th', '', { scope: 'row' });
        standardCell.append(el('strong', item.number), el('span', item.title + (item.subject ? ' (' + item.subject + ')' : '')));
        const topicCell = el('td'), actionCell = el('td');
        const topicId = 'assessment-standard-topic-' + item.number;
        const topic = el('select', '', { id: topicId, 'aria-label': 'Topic folder for standard ' + item.number });
        topic.append(el('option', 'Choose a topic', { value: '' }));
        if (item.topic && !topics.includes(item.topic)) {
          topic.append(el('option', item.topic + ' (not configured for this year)', { value: item.topic }));
        }
        for (const name of topics) topic.append(el('option', name, { value: name }));
        topic.value = item.topic || '';
        topic.disabled = savingStandards || !topics.length && !item.topic;
        topic.addEventListener('change', async () => {
          const previous = item.topic || '';
          item.topic = topic.value;
          try { await persistStandards(); }
          catch (error) {
            item.topic = previous;
            renderSelected();
            selectedStatus.textContent = error.message;
          }
        });
        const remove = el('button', 'Remove', { type: 'button' });
        remove.disabled = savingStandards;
        remove.addEventListener('click', async () => {
          const previous = standards;
          standards = standards.filter(standard => standard.number !== item.number);
          renderSelected();
          try { await persistStandards(); }
          catch (error) {
            standards = previous;
            renderSelected();
            selectedStatus.textContent = error.message;
          }
        });
        topicCell.append(topic); actionCell.append(remove);
        row.append(standardCell, topicCell, actionCell);
        selected.append(row);
      }
    }

    form.addEventListener('submit', async event => {
      event.preventDefault();
      searchButton.disabled = true;
      results.replaceChildren();
      searchStatus.textContent = 'Searching NZQA…';
      try {
        const params = new URLSearchParams({ q: query.value.trim(), view: 'all', level: 'all' });
        const response = await request('standards/search?' + params);
        if (version !== renderVersion) return;
        if (!response.standards.length) searchStatus.textContent = 'No standards matched that search.';
        else searchStatus.textContent = response.truncated ? 'Showing the first 100 matches.' : 'Search results';
        for (const item of response.standards) {
          const row = el('li');
          const details = el('span', item.number + ' — ' + item.title + ' (' + item.subject + ')');
          const add = el('button', 'Add', { type: 'button' });
          const alreadySelected = standards.some(standard => standard.number === item.number);
          add.disabled = alreadySelected;
          if (alreadySelected) add.textContent = 'Added';
          add.addEventListener('click', async () => {
            if (standards.length >= 100) {
              searchStatus.textContent = 'Select no more than 100 standards.';
              return;
            }
            const standard = Object.fromEntries(
              ['number', 'subject', 'title', 'credits', 'assessment', 'url', 'level', 'version']
                .filter(key => item[key] !== undefined).map(key => [key, item[key]])
            );
            standard.topic = '';
            standards.push(standard);
            add.disabled = true;
            add.textContent = 'Added';
            renderSelected();
            try { await persistStandards(); }
            catch (error) {
              standards = standards.filter(value => value.number !== standard.number);
              add.disabled = false;
              add.textContent = 'Add';
              renderSelected();
              selectedStatus.textContent = error.message;
            }
          });
          row.append(details, add);
          results.append(row);
        }
      } catch (error) {
        searchStatus.setAttribute('role', 'alert');
        searchStatus.textContent = error.message;
      } finally { searchButton.disabled = false; }
    });
    renderSelected();
  }

  async function renderRoute() {
    const version = ++renderVersion;
    try {
      await saveCurrent();
    } catch (error) {
      if (version === renderVersion) message(error.message + ' The current form remains open so you can retry.', true);
      return;
    }
    try {
      const route = routeFromHash();
      hasUnsavedChanges = () => false;
      openSetupYear = undefined;
      yearInput.value = String(route.year);
      yearInput.disabled = ['library', 'suppliers'].includes(route.section);
      updateNavigation(route.section);
      message('Loading Assessment Manager…');
      if (route.section === 'home') {
        if (version !== renderVersion) return;
        host.replaceChildren();
        const controller = await globalThis.assessmentHome.mount(host, {
          el, request, year: route.year,
          navigate: (record, page) => page === 'home' ? renderRoute() : navigate({ year: route.year, section: 'moderation', record, page })
        });
        if (version !== renderVersion) return;
        saveCurrent = controller.saveNow;
        hasUnsavedChanges = controller.hasUnsavedChanges;
      } else if (route.section === 'library') {
        const entry = route.record && route.record !== 'new' ? await request('resource-library/' + route.record + '/draft') : undefined;
        if (version !== renderVersion) return;
        host.replaceChildren();
        const controller = await globalThis.assessmentResourceLibrary.mountPage(host, {
          el, request, year: route.year, id: route.record, entry,
          displayName: body.dataset.plannerName, userEmail: body.dataset.userEmail, userId: body.dataset.userId,
          recordCreated: record => {
            const params = new URLSearchParams({ year: String(route.year), section: 'library', record, page: 'overview' });
            history.replaceState(null, '', '#' + params.toString());
          },
          navigate: record => navigate({ year: route.year, section: 'library', record })
        });
        if (version !== renderVersion) return;
        saveCurrent = controller.saveNow;
        hasUnsavedChanges = controller.hasUnsavedChanges || (() => false);
      } else if (route.section === 'suppliers') {
        if (version !== renderVersion) return;
        host.replaceChildren();
        const controller = await globalThis.assessmentSuppliers.mount(host, { el, request });
        if (version !== renderVersion) return;
        saveCurrent = controller.saveNow;
        hasUnsavedChanges = controller.hasUnsavedChanges;
      } else if (route.section === 'standards') await renderStandards(route, version);
      else await renderModeration(route, route.section === 'setup', version);
      if (version === renderVersion && status.textContent === 'Loading Assessment Manager…') message('');
    } catch (error) {
      if (version !== renderVersion) return;
      host.replaceChildren(el('p', error.message, { role: 'alert' }));
      const retry = el('button', 'Retry', { type: 'button' });
      retry.addEventListener('click', () => renderRoute());
      host.append(retry);
      message(error.message, true);
    }
  }

  for (const link of document.querySelectorAll('.assessment-manager-nav a')) {
    link.addEventListener('click', event => {
      event.preventDefault();
      const section = new URLSearchParams(link.hash.slice(1)).get('section');
      navigate({ year: Number(yearInput.value), section }).catch(error => message(error.message, true));
    });
  }

  yearInput.addEventListener('change', () => {
    const year = Number(yearInput.value);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      message('Choose a year from 2000 to 2100.', true);
      return;
    }
    const route = routeFromHash();
    if (route.section === 'setup' && openSetupYear) {
      openSetupYear(year).catch(error => message(error.message, true));
      return;
    }
    navigate({ ...route, year }).catch(error => message(error.message, true));
  });
  window.addEventListener('hashchange', () => renderRoute());
  window.addEventListener('beforeunload', event => {
    if (!hasUnsavedChanges()) return;
    event.preventDefault();
    event.returnValue = '';
  });

  request('session').then(result => {
    csrf = result.csrf;
    return renderRoute();
  }).catch(error => {
    host.replaceChildren(el('p', error.message, { role: 'alert' }));
    message(error.message, true);
  });
})();
