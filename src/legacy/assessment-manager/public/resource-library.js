(() => {
  'use strict';
  const schema = globalThis.assessmentLibrarySchema;
  const { normaliseStaffName, staffLeadershipPositions } = globalThis.plannerModerationSchema;
  const { fileGroups, detailGroups, critiqueChecks, yesNo, driveUrl } = schema;

  function tools(el, request, status) {
    let access;
    function report(error) {
      console.error('Resource Library operation failed.');
      status.textContent = error.message;
      status.setAttribute('role', 'alert');
    }
    function button(label, work, parent) {
      const control = el('button', label, { type: 'button' });
      control.addEventListener('click', async () => {
        control.disabled = true;
        try { await work(); }
        catch (error) { report(error); }
        finally { control.disabled = false; }
      });
      parent.append(control);
      return control;
    }
    async function drive() {
      if (!access) access = await globalThis.plannerGoogleDrive.prepareDocumentAccess(() => request('google-drive/config'));
      await access.authorize();
      return access;
    }
    return { button, drive, report };
  }

  function field(el, parent, definition, value, change, prefix) {
    const [key, label, type] = definition, id = prefix + key;
    const wrapper = el('div', '', { class: 'planner-field' });
    const control = el(Array.isArray(type) ? 'select' : type === 'area' ? 'textarea' : 'input', '', { id });
    if (Array.isArray(type)) for (const option of type) control.append(el('option', option || 'Not recorded', { value: option }));
    else if (type !== 'area') control.setAttribute('type', ['date', 'url'].includes(type) ? type : 'text');
    if (!Array.isArray(type)) control.setAttribute('maxlength', type === 'area' ? '8000' : '500');
    if (type === 'money') control.setAttribute('inputmode', 'decimal');
    control.value = value || '';
    control.addEventListener(Array.isArray(type) ? 'change' : 'input', () => change(control.value.trim()));
    wrapper.append(el('label', label, { for: id }), control);
    parent.append(wrapper);
    return control;
  }

  function fileLink(el, file) {
    return el('a', file.name, { href: driveUrl(file), target: '_blank', rel: 'noopener noreferrer' });
  }

  async function mountPage(host, { el, request, year, id = '', entry, navigate, recordCreated = () => {}, displayName = '', userEmail = '', userId = '' }) {
    const page = el('section', '', { class: 'moderation-page resource-library-page' });
    const status = el('p', '', { role: 'status', 'aria-live': 'polite' });
    page.append(el('h2', 'Assessment Resource Library', { class: 'paper-heading' }),
      el('p', 'Shared by signed-in staff across all assessment years. All teachers can edit. Drive permissions and supplier licences still apply. Purchased originals are never overwritten.'), status);
    host.append(page);
    const { button, drive, report } = tools(el, request, status);
    if (!id) {
      button('Add assessment', () => navigate('new'), page);
      const form = el('form', '', { class: 'assessment-standard-search' });
      const search = field(el, form, ['search', 'Search title, standard, department, subject or supplier'], '', () => {}, 'library-');
      form.append(el('button', 'Search', { type: 'submit' }));
      const drafts = el('section'), list = el('div'), paging = el('div', '', { class: 'moderation-actions' }), deleted = el('details');
      deleted.append(el('summary', 'Deleted library entries'));
      const deletedList = el('div'); deleted.append(deletedList);
      page.append(form, drafts, list, paging, deleted);
      let offset = 0, searchVersion = 0;
      async function load() {
        const version = ++searchVersion;
        status.textContent = 'Loading shared resources...';
        status.setAttribute('role', 'status');
        const [result, draftResult, deletedResult] = await Promise.all([
          request('resource-library?q=' + encodeURIComponent(search.value.trim()) + '&offset=' + offset),
          request('resource-library/drafts'), request('resource-library/deleted')
        ]);
        if (version !== searchVersion || !page.isConnected) return;
        list.replaceChildren(); paging.replaceChildren(); drafts.replaceChildren(); deletedList.replaceChildren();
        if (draftResult.drafts.length) drafts.append(el('h3', 'Your saved drafts'));
        for (const draft of draftResult.drafts) {
          const row = el('div', '', { class: 'moderation-panel' });
          button((draft.title || 'Untitled assessment') + ' (draft)', () => navigate(draft.id), row);
          button('Discard draft', async () => {
            if (!confirm('Discard this saved draft? The shared library entry, if any, will remain unchanged.')) return;
            await request('resource-library/' + draft.id + '/draft', { method: 'DELETE', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ draftRevision: draft.revision }) });
            await load();
          }, row);
          drafts.append(row);
        }
        if (!deletedResult.records.length) deletedList.append(el('p', 'No deleted entries.'));
        for (const item of deletedResult.records) {
          const row = el('div', '', { class: 'moderation-panel' });
          row.append(el('span', item.title || 'Untitled assessment'));
          button('Restore', async () => {
            await request('resource-library/' + item.id + '/restore', { method: 'POST' });
            await load();
          }, row);
          deletedList.append(row);
        }
        status.textContent = result.total ? result.total + ' matching resource editions.' : 'No matching resources. Add your first assessment.';
        for (const item of result.records) {
          const card = el('section', '', { class: 'moderation-panel' }), header = el('div', '', { class: 'library-card-header' });
          button(item.title + (item.edition ? ' - ' + item.edition : ''), () => navigate(item.id), header);
          const remove = button('Delete', async () => {
            if (!confirm('Delete "' + item.title + '" from the shared library? It can be restored. Moderation sheets and Drive files will not be deleted. Saved drafts for this entry will be hidden until it is restored.')) return;
            await request('resource-library/' + item.id, { method: 'DELETE', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ revision: item.revision }) });
            await load();
          }, header);
          remove.setAttribute('class', 'library-delete');
          remove.setAttribute('aria-label', 'Delete ' + item.title);
          card.append(header, el('p', [item.source_type && item.source_type !== 'Commercial' ? item.source_type : item.supplier, item.department, item.subject, item.status].filter(Boolean).join(' | ')),
            el('p', item.standards.map(standard => standard.number + ' v' + standard.version).join(', ')));
          list.append(card);
        }
        if (offset) button('Previous resources', async () => { offset -= 50; await load(); }, paging);
        if (offset + result.records.length < result.total) button('More resources', async () => { offset += 50; await load(); }, paging);
      }
      form.addEventListener('submit', event => { event.preventDefault(); offset = 0; load().catch(error => {
        console.error('Resource Library search failed.'); status.textContent = error.message; status.setAttribute('role', 'alert');
      }); });
      await load();
      return { saveNow: async () => true };
    }

    const resourceId = id === 'new' ? crypto.randomUUID() : id;
    let revision = entry?.revision || 0, draftRevision = entry?.draftRevision || 0;
    const content = entry ? JSON.parse(JSON.stringify(entry.content)) : schema.emptyContent();
    if (content.classCodes === undefined) content.classCodes = [];
    let dirty = false, saving, choosing = false, loadingMetadata = 0, timer;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (choosing || loadingMetadata) return;
        saveNow().catch(report);
      }, 800);
    };
    const mark = () => { dirty = true; status.setAttribute('role', 'status'); status.textContent = 'Saving library changes...'; schedule(); };
    const actions = el('div', '', { class: 'moderation-actions' });
    page.append(actions);
    if (draftRevision) {
      status.textContent = 'Your private draft is loaded. Changes autosave; use Save now to retry sharing.';
    }
    async function saveNow() {
      clearTimeout(timer);
      if (choosing) throw new Error('Finish choosing Google Drive resources before saving or leaving this entry.');
      if (loadingMetadata) throw new Error('Wait for standard details to finish loading before saving or leaving this entry.');
      if (saving) { await saving; if (dirty) return saveNow(); return true; }
      if (!dirty) return true;
      const snapshot = JSON.stringify(content);
      saving = request('resource-library/' + resourceId + '/draft', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: JSON.parse(snapshot), revision, draftRevision })
      });
      try {
        const result = await saving;
        draftRevision = result.draftRevision;
        dirty = JSON.stringify(content) !== snapshot;
        if (id === 'new') recordCreated(resourceId);
      } finally { saving = undefined; }
      if (dirty) return saveNow();
      const problem = schema.validate(content);
      if (problem) {
        status.setAttribute('role', 'status'); status.textContent = 'Draft autosaved privately. Complete the entry to share it: ' + problem;
        return true;
      }
      saving = request('resource-library/' + resourceId, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: JSON.parse(snapshot), revision, draftRevision })
      });
      try {
        const result = await saving;
        revision = result.revision; draftRevision = 0;
        status.setAttribute('role', 'status'); status.textContent = 'Library entry autosaved (revision ' + revision + ').';
      } catch (error) {
        status.setAttribute('role', 'alert'); status.textContent = 'Your private draft is saved but could not be shared: ' + error.message +
          ' Use Save now to retry. If another teacher changed the entry, copy your edits and discard this draft before reopening the latest shared entry.';
      } finally { saving = undefined; }
      if (dirty) return saveNow();
      return true;
    }
    button('Back to resource library', async () => { await saveNow(); await navigate(''); }, actions);
    button('Save now', async () => { dirty = true; await saveNow(); }, actions);
    button('Discard draft', async () => {
      if (saving || choosing || loadingMetadata) throw new Error('Wait for the current save, standard details or Drive selection to finish.');
      if (!confirm('Discard your draft? Previously shared library revisions will be kept.')) return;
      if (draftRevision) await request('resource-library/' + resourceId + '/draft', { method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftRevision }) });
      clearTimeout(timer); draftRevision = 0;
      dirty = false;
      await navigate('');
    }, actions);
    page.append(el('p', 'Use a separate entry for a new assessment edition. If you change its source or assessment links, add or remove standards, change standard versions or change the edition, supersede old approved critiques before saving. Existing moderation snapshots will not change.'));
    let setupStandards = [], records = [], classes = [], teachingDepartments = [], staffDepartments = [], staffPeople = [], staffAvailable = false, suppliers = [];
    const sourceStatus = el('p', '', { role: 'status', 'aria-live': 'polite' });
    async function loadSources() {
      const failures = [];
      staffAvailable = false;
      await Promise.all([
        [year + '/assessmentSetup/main', 'Setup Assessment', result => {
          const selected = JSON.parse(result.content.selectedStandards || '[]');
          if (!Array.isArray(selected)) throw new Error('Saved standards could not be read.');
          setupStandards = selected;
        }],
        ['moderation/' + year, 'Existing moderation records', result => {
          if (!Array.isArray(result.records)) throw new Error('The moderation record list could not be read.');
          records = result.records.filter(item => !item.parent_record && schema.UUID.test(item.entry_key));
        }],
        ['teaching-subjects/' + year, 'Confirmed teaching classes', result => {
          if (!Array.isArray(result.classes) || !Array.isArray(result.departments)) throw new Error('Teaching classes could not be read.');
          classes = result.classes; teachingDepartments = result.departments;
        }],
        ['staff', 'Staff department directory', result => {
          if (!Array.isArray(result.departments) || !Array.isArray(result.staff)) throw new Error('The staff and department directory could not be read.');
          staffDepartments = result.departments; staffPeople = result.staff; staffAvailable = true;
        }],
        ['suppliers', 'Supplier directory', result => {
          if (!Array.isArray(result.suppliers)) throw new Error('The supplier directory could not be read.');
          suppliers = result.suppliers;
        }]
      ].map(async ([path, label, apply]) => {
        try { apply(await request(path)); }
        catch (error) {
          console.error('Resource Library metadata source failed: ' + label);
          failures.push(label + ': ' + error.message);
        }
      }));
      sourceStatus.setAttribute('role', failures.length ? 'alert' : 'status');
      sourceStatus.textContent = failures.length ? failures.join(' ') + ' Available sources and manual entry can still be used. Retry to reload unavailable sources.' :
        'Suggestions use Setup Assessment, your matching moderation records, confirmed teaching classes and the staff department directory for ' + year + '.';
    }
    await loadSources();
    const controls = {}, standardMessages = new Map();
    let subjectOther, classList, departmentList, supplierChoice;
    const same = (a, b) => a.trim().toLocaleLowerCase('en-NZ') === b.trim().toLocaleLowerCase('en-NZ');
    const unique = values => [...new Set(values.filter(value => typeof value === 'string' && value.trim()).map(value => value.trim()))];
    const only = values => { const options = unique(values); return options.length === 1 ? options[0] : ''; };
    const departments = () => unique([...teachingDepartments, ...staffDepartments].map(item => item.name));
    function renderSuggestions() {
      const subjects = unique([content.subject, ...setupStandards.map(item => item.subject), ...classes.map(item => item.subject)]);
      controls.subject.replaceChildren(el('option', 'Choose Subject', { value: '' }),
        ...subjects.map(value => el('option', value, { value })),
        el('option', 'Other subject (type a name)...', { value: '__other' }));
      controls.subject.value = content.subject;
      subjectOther.hidden = true;
      departmentList.replaceChildren(...departments().map(value => el('option', '', { value })));
      classList.replaceChildren();
      const codes = unique([...content.classCodes, ...classes.map(item => item.course.toUpperCase())]).sort((a, b) => a.localeCompare(b, 'en-NZ', { numeric: true }));
      if (!codes.length) classList.append(el('p', 'No confirmed class codes are available. Add a class code below.'));
      for (const code of codes) {
        const label = el('label', '', { class: 'library-class-choice' });
        const check = el('input', '', { type: 'checkbox', value: code });
        check.checked = content.classCodes.some(value => same(value, code));
        check.addEventListener('change', () => {
          const next = content.classCodes.filter(value => !same(value, code));
          if (check.checked) next.push(code);
          if (!schema.validClassCodes(next)) {
            check.checked = !check.checked;
            report(new Error('Choose up to 100 unique class codes.'));
            return;
          }
          content.classCodes = next; mark();
        });
        label.append(check, el('span', code)); classList.append(label);
      }
    }
    function renderSupplierOptions() {
      supplierChoice.replaceChildren(el('option', 'Select a saved supplier (optional)', { value: '' }),
        ...suppliers.map(supplier => el('option', supplier.name, { value: supplier.id })));
      supplierChoice.value = content.supplierId || '';
    }
    const standards = el('fieldset', '', { class: 'moderation-panel library-standards' });
    standards.append(el('legend', 'Standards covered'),
      el('p', 'One assessment can cover multiple standards. Choose standards from Setup Assessment individually or together below, or add them manually. Fill missing details checks NZQA and matching moderation records without replacing existing entries. Only matching NZQA versions are offered to moderation.'),
      el('a', 'Manage My Standards in Setup Assessment', { href: '#year=' + year + '&section=standards' }), sourceStatus);
    const setupSelect = field(el, standards, ['setup-standard', 'Choose standard from Setup Assessment', []], '', () => {}, 'library-');
    function renderSetupOptions() {
      setupSelect.replaceChildren(el('option', 'Choose from My Standards (' + year + ')', { value: '' }));
      for (const item of setupStandards) setupSelect.append(el('option', item.number + ' - ' + item.title, { value: item.number }));
      setupSelect.value = '';
    }
    const bulkStandards = el('details', '', { class: 'moderation-panel' });
    const bulkList = el('div', '', { class: 'library-class-options' });
    let bulkChoices = [];
    bulkStandards.append(el('summary', 'Choose multiple standards from Setup Assessment'),
      el('p', 'Select all standards covered by this assessment, then add them together. Already listed standards are not duplicated.'), bulkList);
    function renderBulkStandards() {
      bulkList.replaceChildren();
      bulkChoices = [];
      if (!setupStandards.length) bulkList.append(el('p', 'No standards are available in Setup Assessment. Add standards there or enter them manually.'));
      for (const item of setupStandards) {
        const label = el('label', '', { class: 'library-class-choice' });
        const check = el('input', '', { type: 'checkbox' });
        label.append(check, el('span', item.number + ' - ' + item.title));
        bulkList.append(label);
        bulkChoices.push({ check, item });
      }
    }
    button('Refresh metadata sources', async () => {
      await loadSources(); renderSetupOptions(); renderBulkStandards(); renderSuggestions(); renderSupplierOptions(); fillExistingCritiquePositions(); renderCritiques();
    }, standards);
    standards.append(bulkStandards);
    const standardList = el('div'); standards.append(standardList);
    async function fillStandard(standard) {
      const number = standard.number, originalVersion = standard.version;
      if (!/^\d{4,8}$/.test(number)) throw new Error('Enter a valid standard number before loading details.');
      loadingMetadata++;
      const warnings = [], previous = [];
      let metadata;
      try {
        await Promise.all([
          (async () => {
            try {
              const details = await request('standards/' + number + '/details');
              if (details.number !== number || !/^\d{1,3}$/.test(details.version)) throw new Error('NZQA did not verify the standard number and version.');
              metadata = details;
            } catch (error) { console.error('Resource Library NZQA details failed.'); warnings.push('NZQA: ' + error.message); }
          })(),
          ...records.filter(item => item.standard_number === number).map(async item => {
            try {
              const result = await request(year + '/moderation/' + item.entry_key);
              if (!result.content || result.content.standardNumber !== number) throw new Error('The record no longer matches this standard.');
              previous.push(result.content);
            } catch (error) { console.error('Resource Library moderation metadata failed.'); warnings.push('Moderation record: ' + error.message); }
          })
        ]);
        if (!page.isConnected || !content.standards.includes(standard)) return;
        if (standard.number !== number || standard.version !== originalVersion) throw new Error('The standard number or version changed while loading. Retry Fill missing details.');
        const saved = setupStandards.find(item => item.number === number);
        let changed = false;
        const fill = (target, key, value) => {
          if (!(target[key] || '').trim() && typeof value === 'string' && value.trim()) { target[key] = value.trim(); changed = true; }
        };
        fill(standard, 'version', saved?.version || only(previous.map(item => item.version)) || metadata?.version);
        const matching = previous.filter(item => item.version === standard.version);
        const official = metadata?.version === standard.version ? metadata : undefined;
        const selected = saved?.version === standard.version ? saved : undefined;
        if (metadata && !official) warnings.push('NZQA currently lists version ' + metadata.version + '; this edition keeps version ' + standard.version + '. Details from that different version were not copied.');
        for (const key of ['title', 'subject', 'credits', 'level']) {
          const recordKey = key === 'title' ? 'standardTitle' : key;
          let value = official?.[key] || selected?.[key] || only(matching.map(item => item[recordKey]));
          if (key === 'credits' && typeof value === 'string') value = value.replace(/\s*credits?$/i, '').trim();
          if (key === 'credits' && !/^\d{1,3}$/.test(value || '') || key === 'level' && !/^(?:[1-9]|10)$/.test(value || '')) value = '';
          fill(standard, key, value);
        }
        for (const [key, fallback] of [['subject', standard.subject || only(classes.map(item => item.subject))], ['department', only(departments())]]) {
          const recorded = unique(matching.map(item => item[key]));
          fill(content, key, recorded.length ? only(recorded) : fallback);
          if (recorded.length > 1 && !content[key]) warnings.push('Matching moderation records have different ' + key + ' values. Choose the correct value.');
        }
        if (!content.classCodes.length) {
          const courses = unique(matching.flatMap(item => typeof item.course === 'string' ? item.course.toUpperCase().split(',') : []));
          if (courses.length && schema.validClassCodes(courses)) { content.classCodes = courses; changed = true; }
        }
        for (const key of ['title', 'subject', 'department']) controls[key].value = content[key];
        renderSuggestions();
        if (changed) mark();
        standardMessages.set(standard, { text: (changed ? 'Missing details filled. Review before saving. ' : 'No additional unambiguous details were available for the empty fields. ') + warnings.join(' '), error: Boolean(warnings.length) });
      } finally { loadingMetadata--; renderStandards(); if (!loadingMetadata && dirty) schedule(); }
    }
    const matchingStandard = (items, selected) => items.find(item =>
      item.number === selected.number && (!selected.version || !item.version || item.version === selected.version));
    const emptyStandard = items => items.find(item =>
      ['number', 'version', 'credits', 'level', 'title', 'subject'].every(key => !(item[key] || '').trim()));
    function addSetupStandard(items, selected) {
      let standard = matchingStandard(items, selected);
      if (standard) return standard;
      standard = emptyStandard(items);
      if (standard) { standard.number = selected.number; standard.version = selected.version || ''; }
      else {
        if (items.length >= 30) throw new Error('An edition can cover at most 30 standards.');
        standard = { number: selected.number, version: selected.version || '' };
        items.push(standard);
      }
      return standard;
    }
    async function addSelectedStandard(selected) {
      const before = JSON.stringify(content.standards);
      const standard = addSetupStandard(content.standards, selected);
      if (JSON.stringify(content.standards) !== before) { mark(); renderStandards(); }
      await fillStandard(standard);
    }
    setupSelect.addEventListener('change', async () => {
      const selected = setupStandards.find(item => item.number === setupSelect.value);
      if (!selected) return;
      try { await addSelectedStandard(selected); }
      catch (error) { report(error); }
      finally { setupSelect.value = ''; }
    });
    button('Add selected standards', async () => {
      if (loadingMetadata) throw new Error('Wait for the current standard details to finish loading.');
      const selected = bulkChoices.filter(({ check }) => check.checked);
      if (!selected.length) throw new Error('Select at least one standard to add.');
      const projected = content.standards.map(item => ({ ...item }));
      for (const { item } of selected) addSetupStandard(projected, item);
      const before = JSON.stringify(content.standards);
      const targets = selected.map(({ item }) => addSetupStandard(content.standards, item));
      if (JSON.stringify(content.standards) !== before) { mark(); renderStandards(); }
      for (let i = 0; i < selected.length; i++) {
        await fillStandard(targets[i]);
        selected[i].check.checked = false;
      }
    }, bulkStandards);
    const sourcePanel = el('fieldset', '', { class: 'moderation-detail-block' }), originFields = el('div', '', { class: 'moderation-fields' });
    const authorNote = el('p'), originActions = el('div', '', { class: 'moderation-actions' }), originControls = {}, originLinks = {};
    const additionalLinks = el('div'), originalList = el('div'), finalList = el('div');
    let supplierBlock;
    const purchaseBlocks = [];
    const emptyOrigin = type => ({ type, authorId: '', authorName: '', originalUrl: '', linkedDate: '', modificationNotes: '', finalUrl: '' });
    const originType = () => content.origin?.type || 'Commercial';
    const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    sourcePanel.append(el('legend', 'Assessment source'));
    const sourceSelect = field(el, sourcePanel, ['source-type', 'Assessment source', schema.sourceTypes], originType(), value => {
      if (value === originType()) return;
      if (choosing) { sourceSelect.value = originType(); report(new Error('Finish the current Google Drive selection before changing the source.')); return; }
      if (value === 'Own' && (!schema.UUID.test(userId) || !displayName.trim() || displayName.includes('@') || displayName.trim() === 'My planner')) {
        sourceSelect.value = originType(); report(new Error('A signed-in name and identity are required to record an Own assessment.')); return;
      }
      if (value === 'Own' && !confirm('Confirm that you wrote this assessment entirely yourself.')) { sourceSelect.value = originType(); return; }
      if (content.origin && content.origin.type !== 'Commercial' &&
          !confirm('Changing the source will clear the current source-specific details. Previously saved revisions remain available. Continue?')) {
        sourceSelect.value = originType(); return;
      }
      content.origin = emptyOrigin(value);
      if (value === 'Own') { content.origin.authorId = userId; content.origin.authorName = displayName.trim(); }
      renderOrigin(); mark();
    }, 'library-');
    sourcePanel.append(authorNote, originFields, additionalLinks, originActions); page.append(sourcePanel);
    for (const definition of [['originalUrl', 'Original TKI / NZQA link', 'url'], ['linkedDate', 'Date original linked', 'date'],
      ['modificationNotes', 'Modification Notes', 'area'], ['finalUrl', 'Final assessment Google link', 'url']]) {
      const key = definition[0];
      originControls[key] = field(el, originFields, definition, content.origin?.[key] || '', value => {
        if (key === 'originalUrl' && content.origin.originalUrl !== value) {
          content.origin.linkedDate = value ? today() : '';
          originControls.linkedDate.value = content.origin.linkedDate;
        }
        content.origin[key] = value; renderOriginLink(key); mark();
      }, 'library-origin-');
      if (key === 'originalUrl' || key === 'finalUrl') {
        originLinks[key] = el('a', key === 'originalUrl' ? 'Open original assessment' : 'Open final assessment',
          { target: '_blank', rel: 'noopener noreferrer' });
        originControls[key].parentElement.append(originLinks[key]);
      }
    }
    function updateLink(link, value) {
      try {
        const parsed = new URL(value);
        if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('Invalid link');
        link.setAttribute('href', value); link.hidden = false;
      } catch { link.removeAttribute('href'); link.hidden = true; }
    }
    function renderOriginLink(key) {
      if (originLinks[key]) updateLink(originLinks[key], content.origin?.[key] || '');
    }
    additionalLinks.append(originalList, finalList);
    function renderAdditionalLinks() {
      originalList.replaceChildren();
      finalList.replaceChildren();
      for (const [index, item] of (content.origin?.additionalOriginals || []).entries()) {
        const row = el('div', '', { class: 'moderation-fields' });
        const link = el('a', 'Open original assessment ' + (index + 2), { target: '_blank', rel: 'noopener noreferrer' });
        let dateControl;
        const urlControl = field(el, row, ['url', 'Original link ' + (index + 2), 'url'], item.url, value => {
          if (item.url !== value) { item.linkedDate = value ? today() : ''; dateControl.value = item.linkedDate; }
          item.url = value; updateLink(link, value); mark();
        }, 'library-origin-original-' + index + '-');
        urlControl.parentElement.append(link);
        dateControl = field(el, row, ['date', 'Date original ' + (index + 2) + ' linked', 'date'], item.linkedDate,
          value => { item.linkedDate = value; mark(); }, 'library-origin-original-' + index + '-');
        updateLink(link, item.url);
        button('Remove original link ' + (index + 2), () => {
          content.origin.additionalOriginals.splice(index, 1); mark(); renderAdditionalLinks();
        }, row);
        originalList.append(row);
      }
      for (const [index, value] of (content.origin?.additionalFinals || []).entries()) {
        const row = el('div', '', { class: 'moderation-fields' });
        const link = el('a', 'Open final assessment ' + (index + 2), { target: '_blank', rel: 'noopener noreferrer' });
        const control = field(el, row, ['url', 'Final assessment Google link ' + (index + 2), 'url'], value, next => {
          content.origin.additionalFinals[index] = next; updateLink(link, next); mark();
        }, 'library-origin-final-' + index + '-');
        control.parentElement.append(link); updateLink(link, value);
        button('Remove final link ' + (index + 2), () => {
          content.origin.additionalFinals.splice(index, 1); mark(); renderAdditionalLinks();
        }, row);
        finalList.append(row);
      }
    }
    button('Add another original link', () => {
      const links = content.origin.additionalOriginals || (content.origin.additionalOriginals = []);
      if (links.length >= 19) throw new Error('Choose no more than 20 original links.');
      links.push({ url: '', linkedDate: '' }); mark(); renderAdditionalLinks();
    }, originActions);
    button('Add another final link', () => {
      const links = content.origin.additionalFinals || (content.origin.additionalFinals = []);
      if (links.length >= 19) throw new Error('Choose no more than 20 final links.');
      links.push(''); mark(); renderAdditionalLinks();
    }, originActions);
    for (const [key, label] of [['originalUrl', 'Choose original from Google Drive'], ['finalUrl', 'Choose final assessment from Google Drive']]) {
      button(label, async () => {
        const origin = content.origin, additional = key === 'originalUrl' ? 'additionalOriginals' : 'additionalFinals';
        const before = JSON.stringify([origin[key], key === 'originalUrl' ? origin.linkedDate : '', origin[additional] || []]);
        const files = await chooseFiles(key, 20);
        if (!files) return;
        if (content.origin !== origin || JSON.stringify([origin[key], key === 'originalUrl' ? origin.linkedDate : '', origin[additional] || []]) !== before) {
          throw new Error('The source link or linked date changed while choosing a file. Retry without replacing your edit.');
        }
        const existing = key === 'originalUrl' ? [origin[key], ...(origin[additional] || []).map(item => item.url)] :
          [origin[key], ...(origin[additional] || [])];
        const values = [...new Set(files.map(driveUrl))].filter(value => !existing.includes(value));
        const links = origin[additional] || [];
        const emptySlots = key === 'originalUrl' ? links.filter(item => !item.url && !item.linkedDate).length :
          links.filter(value => !value).length;
        if (values.length > (origin[key] ? 0 : 1) + emptySlots + 19 - links.length) {
          throw new Error('Choose no more than 20 links in this group.');
        }
        if (!values.length) throw new Error('The selected files are already linked in this group.');
        if (!origin[key]) {
          origin[key] = values.shift(); originControls[key].value = origin[key];
          if (key === 'originalUrl') { origin.linkedDate = today(); originControls.linkedDate.value = origin.linkedDate; }
        }
        for (let index = 0; index < links.length && values.length; index++) {
          if (key === 'originalUrl' && !links[index].url && !links[index].linkedDate) links[index] = { url: values.shift(), linkedDate: today() };
          else if (key === 'finalUrl' && !links[index]) links[index] = values.shift();
        }
        if (values.length) {
          if (!origin[additional]) origin[additional] = links;
          if (key === 'originalUrl') links.push(...values.map(url => ({ url, linkedDate: today() })));
          else links.push(...values);
        }
        renderOriginLink(key); renderAdditionalLinks(); mark();
      }, originActions);
    }
    function renderOrigin() {
      const type = originType(), external = ['TKI', 'NZQA'].includes(type);
      originFields.hidden = !external; additionalLinks.hidden = !external; originActions.hidden = !external;
      authorNote.hidden = type !== 'Own';
      authorNote.textContent = type === 'Own' ? 'Written entirely by ' + content.origin.authorName + '.' : '';
      for (const key of Object.keys(originControls)) originControls[key].value = content.origin?.[key] || '';
      renderOriginLink('originalUrl'); renderOriginLink('finalUrl');
      renderAdditionalLinks();
      if (supplierBlock) supplierBlock.hidden = type !== 'Commercial';
      for (const block of purchaseBlocks) block.hidden = type !== 'Commercial';
    }
    const orderedGroups = [...detailGroups.filter(([title]) => title === 'Supplier and purchase'),
      ...detailGroups.filter(([title]) => title !== 'Supplier and purchase')];
    for (const [title, fields] of orderedGroups) {
      const block = el('fieldset', '', { class: 'moderation-detail-block' });
      const grid = el('div', '', { class: 'moderation-fields' + (title === 'Assessment edition' ? ' library-edition-fields' : '') });
      let classBox;
      block.append(el('legend', title));
      if (title === 'Supplier and purchase') supplierBlock = block;
      if (title === 'Assessment edition') block.append(standards);
      if (title === 'Supplier and purchase') {
        supplierChoice = field(el, block, ['saved-supplier', 'Choose a saved supplier', []], '', value => {
          const supplier = suppliers.find(item => item.id === value);
          if (!supplier) return;
          if ((content.supplier && content.supplier !== supplier.name || content.supplierWebsite && content.supplierWebsite !== supplier.website) &&
              !confirm('Replace the supplier name and website with the selected supplier details? Purchase and product fields will not change.')) {
            supplierChoice.value = content.supplierId || ''; return;
          }
          content.supplierId = supplier.id; content.supplier = supplier.name; content.supplierWebsite = supplier.website;
          controls.supplier.value = supplier.name; controls.supplierWebsite.value = supplier.website; mark();
        }, 'library-');
      }
      block.append(grid); page.append(block);
      for (const definition of fields) {
        const key = definition[0];
        if (key === 'edition') continue;
        const control = field(el, grid, key === 'subject' ? ['subject', 'Subject', []] : definition, content[key], value => {
          if (key === 'subject' && value === '__other') { subjectOther.hidden = false; subjectOther.value = content.subject; subjectOther.focus?.(); return; }
          if (key === 'supplier' && content.supplier !== value && content.supplierId) { delete content.supplierId; supplierChoice.value = ''; }
          content[key] = value; mark();
          if (key === 'subject') subjectOther.hidden = true;
        }, 'library-');
        if (title === 'Assessment edition') control.parentElement.setAttribute('class', 'planner-field library-edition-' + key);
        controls[key] = control;
        if (key === 'department') {
          departmentList = el('datalist', '', { id: 'library-department-options' });
          control.setAttribute('list', 'library-department-options'); control.parentElement.append(departmentList);
        }
        if (key === 'subject') {
          subjectOther = el('input', '', { type: 'text', 'aria-label': 'Other subject', maxlength: '500' });
          subjectOther.hidden = true;
          subjectOther.addEventListener('input', () => { content.subject = subjectOther.value.trim(); mark(); });
          classBox = el('fieldset', '', { class: 'library-class-box' });
          classBox.append(el('legend', 'Class Codes'), el('p', 'Choose all classes using this edition. Choices are not restricted by standard level and apply to the whole edition across years.'));
          classList = el('div', '', { class: 'library-class-options' }); classBox.append(classList);
          const manual = field(el, classBox, ['class-code', 'Add another class code'], '', () => {}, 'library-');
          manual.setAttribute('maxlength', '80');
          button('Add class code', () => {
            const code = manual.value.trim().toUpperCase();
            if (content.classCodes.some(value => same(value, code))) throw new Error('This class code is already selected.');
            const next = [...content.classCodes, code];
            if (!schema.validClassCodes(next)) throw new Error('Enter a class code of 1-80 characters; select at most 100 codes.');
            content.classCodes = next; manual.value = ''; mark(); renderSuggestions();
          }, classBox);
          control.parentElement.append(subjectOther);
        }
      }
      if (classBox) grid.append(classBox);
    }
    renderSupplierOptions();
    function renderStandards() {
      standardList.replaceChildren();
      content.standards.forEach((standard, i) => {
        const block = el('section', '', { class: 'library-standard-entry' });
        if (standard.title) block.append(el('p', standard.title));
        const row = el('div', '', { class: 'moderation-fields library-standard-row' });
        for (const definition of [['number', 'Standard number'], ['version', 'NZQA version'], ['credits', 'Credits'],
          ['level', 'Level', ['', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10']]]) {
          field(el, row, definition, standard[definition[0]], value => { standard[definition[0]] = value; mark(); }, 'library-standard-' + i + '-');
        }
        const actions = el('div', '', { class: 'moderation-actions' });
        const fill = button('Fill missing details for standard ' + (i + 1), () => fillStandard(standard), actions);
        fill.disabled = Boolean(loadingMetadata);
        button('Remove standard ' + (i + 1), () => { content.standards.splice(i, 1); mark(); renderStandards(); }, actions);
        const message = standardMessages.get(standard);
        block.append(row, actions);
        if (message) block.append(el('p', message.text, { role: message.error ? 'alert' : 'status' }));
        standardList.append(block);
      });
    }
    button('Add standard', () => {
      if (content.standards.length >= 30) throw new Error('An edition can cover at most 30 standards.');
      content.standards.push({ number: '', version: '' }); mark(); renderStandards();
    }, standards);
    renderSetupOptions(); renderBulkStandards(); renderStandards(); renderSuggestions();

    async function chooseFiles(key, maximum) {
      if (choosing) throw new Error('Finish the current Google Drive selection first.');
      choosing = true;
      try {
        const access = await drive();
        const chosen = key === 'resourceFolder' ? await access.choose(true) : await access.chooseFiles(maximum > 1);
        if (!chosen) return null;
        const files = await Promise.all((Array.isArray(chosen) ? chosen : [chosen]).map(async file => {
          const metadata = await access.metadata(file.id);
          if (metadata.trashed) throw new Error('A selected file is in the Drive bin.');
          return { id: metadata.id, name: metadata.name, mimeType: metadata.mimeType, modifiedTime: metadata.modifiedTime || '' };
        }));
        if (!files.every(schema.validFile)) throw new Error('A filename or file type is unsupported. Rename files to remove vertical bars or line breaks, then retry.');
        if (key === 'resourceFolder' && files.some(file => file.mimeType !== 'application/vnd.google-apps.folder')) throw new Error('Choose a resource folder.');
        if (key === 'purchaseZip' && files.some(file => !/\.zip$/i.test(file.name))) throw new Error('Choose a ZIP file for the original purchase.');
        if (key !== 'resourceFolder' && files.some(file => file.mimeType === 'application/vnd.google-apps.folder')) throw new Error('Choose files, not folders, for this field.');
        return files;
      } finally { choosing = false; if (dirty) schedule(); }
    }
    const resources = el('section', '', { class: 'moderation-panel' });
    resources.append(el('h3', 'Google Drive resources'),
      el('p', 'Link the original purchase ZIP, unpacked resource folder and individual teaching documents separately. ZIPs stay intact. Refresh checks these links; it does not extract ZIPs, import folder contents or change sharing permissions.'));
    page.append(resources);
    for (const [key, title, maximum] of fileGroups) {
      const block = el('section', '', { class: 'moderation-panel' }), list = el('ul');
      if (['purchaseZip', 'purchaseDocuments'].includes(key)) purchaseBlocks.push(block);
      block.append(el('h4', title), list); resources.append(block);
      function renderFiles() {
        list.replaceChildren();
        if (!content[key].length) list.append(el('li', 'No ' + title.toLowerCase() + ' linked.'));
        content[key].forEach((file, i) => {
          const row = el('li');
          row.append(fileLink(el, file));
          button('Remove ' + file.name, () => { content[key].splice(i, 1); mark(); renderFiles(); }, row);
          list.append(row);
        });
      }
      button('Choose ' + title + ' from Google Drive', async () => {
        const files = await chooseFiles(key, maximum);
        if (!files) return;
        const merged = maximum === 1 ? files : [...new Map([...content[key], ...files].map(file => [file.id, file])).values()];
        if (merged.length > maximum) throw new Error('Choose no more than ' + maximum + ' files for ' + title + '.');
        content[key] = merged; mark(); renderFiles();
      }, block);
      button('Refresh ' + title + ' links', async () => {
        if (!content[key].length) throw new Error('Choose a file or folder first.');
        const files = content[key], access = await drive();
        const refreshed = await Promise.all(files.map(async file => {
          const metadata = await access.metadata(file.id);
          if (metadata.trashed) throw new Error(file.name + ' is in the Drive bin. No links in this group were changed.');
          const current = { id: metadata.id, name: metadata.name, mimeType: metadata.mimeType, modifiedTime: metadata.modifiedTime || '' };
          if (!schema.validFile(current) || current.mimeType !== file.mimeType ||
              key === 'purchaseZip' && !/\.zip$/i.test(current.name)) throw new Error('A linked file changed type or has an unsupported name. Re-select it.');
          return current;
        }));
        if (content[key] !== files) throw new Error('The file list changed while refreshing. Retry the refresh.');
        content[key] = refreshed; mark(); renderFiles();
        status.textContent = 'Drive links checked. Save the library entry to keep refreshed metadata. File contents and permissions were not changed.';
      }, block).setAttribute('class', 'library-refresh');
      renderFiles();
    }
    renderOrigin();

    const critiques = el('section', '', { class: 'moderation-panel' }), critiqueList = el('div');
    const critiqueStatus = el('p', '', { role: 'status', 'aria-live': 'polite' });
    const automaticPositions = new Map(), positionControls = new Map();
    const signedInName = displayName.trim().includes('@') || displayName.trim() === 'My planner' ? '' : displayName.trim();
    function currentPosition() {
      if (!signedInName) return { position: '', note: 'Your signed-in name is unavailable; enter the critiquer position.' };
      if (!staffAvailable) return { position: '', note: 'The current staff directory is unavailable; enter the critiquer position or refresh metadata sources.' };
      const person = normaliseStaffName(signedInName);
      const matches = staffPeople.filter(item => normaliseStaffName(String(item.name || '').replace(/\s*\([^)]*\)\s*$/, '')) === person);
      if (matches.length !== 1) return { position: '', note: 'Your name does not have a unique match in the staff directory; enter the critiquer position.' };
      const positions = staffLeadershipPositions(staffDepartments, signedInName, content.department);
      return positions.length === 1 ? { position: positions[0], note: '' } :
        { position: '', note: 'No single current leadership position could be identified; enter the critiquer position.' };
    }
    function fillExistingCritiquePositions() {
      const { position, note } = currentPosition();
      let filled = 0;
      if (position) for (const critique of content.critiques) {
        if (!critique.positionAutofillDisabled && !(critique.position || '').trim() &&
            normaliseStaffName(critique.name) === normaliseStaffName(signedInName)) {
          critique.position = position; automaticPositions.set(critique.id, position); filled++;
        }
      }
      if (filled) mark();
      critiqueStatus.textContent = filled ? 'Filled your current position on ' + filled + ' existing critique' + (filled === 1 ? '.' : 's.') :
        note || 'New critiques use your current leadership position when available.';
    }
    critiques.append(el('h3', 'Critique history for this resource edition'),
      el('p', 'New critiques use your signed-in name and, for a Westland High School email, school. Your current verified leadership position fills blank positions on your own critiques. Check it is appropriate for the critique date; all details remain editable. Record the checks you have completed. Approved critiques need the person, school and actual critique date. When you select an approved critique in moderation, its recorded checks can fill empty answers after confirmation. Keep earlier critiques and mark them Superseded when replaced.'), critiqueStatus, critiqueList);
    page.append(critiques);
    function renderCritiques() {
      critiqueList.replaceChildren();
      content.critiques.forEach((critique, i) => {
        const block = el('fieldset', '', { class: 'moderation-panel' }), grid = el('div', '', { class: 'moderation-fields' });
        block.append(el('legend', 'Critique ' + (i + 1)), grid); critiqueList.append(block);
        for (const definition of [['name', "Critiquer's name"], ['school', "Critiquer's school"], ['position', "Critiquer's position"], ['date', 'Critique date', 'date'],
          ['outcome', 'Outcome', ['Not critiqued', 'Changes required', 'Approved', 'Superseded']], ['changes', 'Notes / required changes', 'area']]) {
          const key = definition[0];
          const control = field(el, grid, definition, critique[key], value => {
            critique[key] = value;
            if (key === 'position') {
              if (value) delete critique.positionAutofillDisabled;
              else critique.positionAutofillDisabled = true;
              automaticPositions.delete(critique.id);
            }
            if (key === 'name' && automaticPositions.has(critique.id) &&
                normaliseStaffName(value) !== normaliseStaffName(signedInName)) {
              if (critique.position === automaticPositions.get(critique.id)) {
                critique.position = ''; critique.positionAutofillDisabled = true; positionControls.get(critique.id).value = '';
              }
              automaticPositions.delete(critique.id);
            }
            mark();
          }, 'library-critique-' + i + '-');
          if (key === 'position') positionControls.set(critique.id, control);
        }
        const checks = el('fieldset', '', { class: 'moderation-panel' }), checkGrid = el('div', '', { class: 'moderation-fields' });
        checks.append(el('legend', 'Critique checks'), el('p', 'Leave unreviewed checks as Not recorded.'), checkGrid);
        for (const [key, label] of critiqueChecks) {
          field(el, checkGrid, [key, label, yesNo], critique.checks?.[key], value => {
            if (!critique.checks) critique.checks = {};
            critique.checks[key] = value; mark();
          }, 'library-critique-' + i + '-check-');
        }
        block.append(checks);
        if (critique.evidence) {
          block.append(fileLink(el, critique.evidence));
          button('Remove critique evidence ' + (i + 1), () => { critique.evidence = null; mark(); renderCritiques(); }, block);
        }
        button('Choose critique evidence ' + (i + 1), async () => {
          const files = await chooseFiles('evidence', 1);
          if (files) { critique.evidence = files[0]; mark(); renderCritiques(); }
        }, block);
      });
    }
    button('Add critique', () => {
      if (content.critiques.length >= 50) throw new Error('An edition can hold at most 50 critiques.');
      const { position, note } = currentPosition(), id = crypto.randomUUID();
      content.critiques.push({ id, name: signedInName,
        school: /^[^@\s]+@westlandhigh\.school\.nz$/i.test(userEmail.trim()) ? 'Westland High School' : '',
        position, date: '', outcome: 'Not critiqued', changes: '', evidence: null });
      if (position) automaticPositions.set(id, position);
      critiqueStatus.textContent = note || 'Current leadership position filled. Check it is appropriate for this critique.';
      mark(); renderCritiques();
    }, critiques);
    fillExistingCritiquePositions();
    renderCritiques();
    const moderationLinks = el('section', '', { class: 'moderation-panel' });
    const linkStatus = el('p', '', { role: 'status', 'aria-live': 'polite' });
    const linkTools = tools(el, request, linkStatus);
    const yearControl = el('input', '', { id: 'library-moderation-year', type: 'number', min: '2000', max: '2100' });
    yearControl.value = String(year);
    const recordSelect = el('select', '', { id: 'library-moderation-record', 'aria-label': 'Your internal moderation record' });
    const openRecord = el('a', 'Open selected internal moderation record');
    const linkFields = el('div', '', { class: 'moderation-fields' });
    const yearField = el('div', '', { class: 'planner-field' }), recordField = el('div', '', { class: 'planner-field' });
    const linkActions = el('div', '', { class: 'moderation-actions' });
    openRecord.hidden = true;
    yearField.append(el('label', 'Assessment year', { for: 'library-moderation-year' }), yearControl);
    recordField.append(el('label', 'Your moderation record', { for: 'library-moderation-record' }), recordSelect);
    linkFields.append(yearField, recordField);
    const manualLinks = el('details');
    manualLinks.append(el('summary', 'Link or unlink a moderation record manually'),
      el('p', 'Use this when a standard matches more than one assessment, or to share an evaluation with signed-in staff. Linking does not change the evaluation, critique or other sheet details.'),
      linkFields, linkActions, linkStatus);
    moderationLinks.append(el('h3', 'Internal moderation records'),
      el('p', 'Your evaluations appear automatically when the standard and version match one library assessment. Check that the assessment is correct; other staff cannot see these automatic matches.'), manualLinks);
    page.append(moderationLinks);
    let listedYear = 0, listedRecords = [];
    function selectedRecord() {
      const selectedYear = Number(yearControl.value);
      if (!/^\d{4}$/.test(yearControl.value) || selectedYear < 2000 || selectedYear > 2100 || selectedYear !== listedYear) {
        throw new Error('Choose a year and refresh the moderation records first.');
      }
      const selected = listedRecords.find(item => item.entry_key === recordSelect.value);
      if (!selected) throw new Error('Choose one of your moderation records.');
      return selected;
    }
    function updateRecordLink() {
      openRecord.hidden = true;
      if (Number(yearControl.value) !== listedYear) return;
      const selected = listedRecords.find(item => item.entry_key === recordSelect.value);
      if (!selected) return;
      const params = new URLSearchParams({ year: String(listedYear), section: 'moderation', record: selected.entry_key, page: 'internal' });
      openRecord.setAttribute('href', '#' + params.toString());
      openRecord.hidden = false;
    }
    yearControl.addEventListener('input', updateRecordLink);
    recordSelect.addEventListener('change', updateRecordLink);
    async function loadModerationRecords() {
      const selectedYear = Number(yearControl.value);
      if (!/^\d{4}$/.test(yearControl.value) || selectedYear < 2000 || selectedYear > 2100) throw new Error('Choose an assessment year from 2000 to 2100.');
      linkStatus.setAttribute('role', 'status'); linkStatus.textContent = 'Loading your moderation records...';
      const result = await request('moderation/' + selectedYear);
      if (!Array.isArray(result.records)) throw new Error('Your moderation records could not be read.');
      if (!page.isConnected || Number(yearControl.value) !== selectedYear) return;
      listedYear = selectedYear;
      const matching = item => content.standards.some(standard => standard.number === item.standard_number);
      listedRecords = result.records.filter(item => !item.parent_record && schema.UUID.test(item.entry_key))
        .sort((a, b) => Number(matching(b)) - Number(matching(a)));
      recordSelect.replaceChildren(el('option', 'Choose a moderation record', { value: '' }),
        ...listedRecords.map(item => el('option', [item.standard_number, item.title || item.standard_title || 'Untitled assessment'].join(' - ') +
          (matching(item) ? '' : ' (different standard)'), { value: item.entry_key })));
      updateRecordLink();
      linkStatus.textContent = listedRecords.length ? 'Matching standards appear first. The standard and version are checked before linking.' :
        'No moderation records found for this year. Change the year or create a moderation record first.';
    }
    linkTools.button('Refresh moderation records', loadModerationRecords, linkActions);
    async function changeLink(unlink) {
      const selected = selectedRecord(), selectedYear = listedYear;
      await saveNow();
      if (draftRevision || !revision) throw new Error('Finish and share this library entry before linking moderation records.');
      const path = selectedYear + '/moderation/' + selected.entry_key;
      const record = await request(path);
      if (!record.revision || !record.content || record.content.parentRecord) throw new Error('This moderation record is no longer available.');
      let snapshot = null;
      try { if (record.content.resourceLibrary) snapshot = JSON.parse(record.content.resourceLibrary); }
      catch { throw new Error('The saved library selection could not be read. No changes were made.'); }
      if (snapshot && !schema.validSnapshot(snapshot)) throw new Error('The saved library selection is invalid. No changes were made.');
      const currentId = record.content.resourceLibraryId || snapshot?.resourceId || '';
      if (currentId && currentId.toLowerCase() !== resourceId.toLowerCase()) {
        throw new Error('This moderation record is already linked to a different library entry. No changes were made.');
      }
      if (unlink) {
        if (snapshot) throw new Error('This record has a saved library selection. It cannot be unlinked without changing that snapshot.');
        if (!currentId) throw new Error('This record is not linked to this library entry.');
        if (!confirm('Unlink "' + (selected.title || selected.standard_number) + '" (' + selectedYear + ')? Its evaluation will no longer be shared in this library entry; the moderation record will not be changed otherwise.')) return;
        delete record.content.resourceLibraryId;
      } else {
        const published = await request('resource-library/' + resourceId);
        if (!published.content.standards.some(standard => standard.number === record.content.standardNumber && standard.version === record.content.version)) {
          throw new Error('The saved moderation standard and version do not match this library entry. No changes were made.');
        }
        if (currentId) {
          linkStatus.setAttribute('role', 'status'); linkStatus.textContent = 'This record is already linked to this library entry.';
          await loadEvaluations(); return;
        }
        if (!confirm('Link "' + (selected.title || selected.standard_number) + '" (' + selectedYear + ')? Its saved evaluation will be visible to signed-in staff in this library entry.')) return;
        record.content.resourceLibraryId = resourceId;
      }
      await request(path, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: record.content, revision: record.revision }) });
      linkStatus.setAttribute('role', 'status');
      linkStatus.textContent = unlink ? 'Record unlinked. Its details are unchanged; it may still appear as a private automatic match.' : 'Record linked. Its saved evaluation is now shared below.';
      await loadEvaluations();
    }
    linkTools.button('Link selected record', () => changeLink(false), linkActions);
    linkTools.button('Unlink selected record', () => changeLink(true), linkActions);
    linkActions.append(openRecord);
    const evaluations = el('section', '', { class: 'moderation-panel' });
    const evaluationStatus = el('p', '', { role: 'status', 'aria-live': 'polite' }), evaluationList = el('div');
    evaluations.append(el('h3', 'Assessment evaluations'),
      el('p', 'Your uniquely matched evaluations appear privately; explicitly linked evaluations are shared with signed-in staff. Identical evaluator details are shown once for their standards. Changes to moderation records update this live copy.'),
      evaluationStatus, evaluationList);
    page.append(evaluations);
    async function loadEvaluations() {
      evaluationList.replaceChildren();
      evaluationStatus.setAttribute('role', 'status');
      if (!revision) { evaluationStatus.textContent = 'Save this assessment before loading evaluations.'; return; }
      evaluationStatus.textContent = 'Loading evaluations...';
      try {
        const result = await request('resource-library/' + resourceId + '/evaluations');
        if (!Array.isArray(result.standards) || !Array.isArray(result.evaluations) || typeof result.more !== 'boolean') throw new Error('The saved evaluations could not be read.');
        if (!page.isConnected) return;
        evaluationStatus.textContent = result.more ? 'Showing the latest 100 evaluations; more are available.' :
          result.evaluations.length ? '' : 'No evaluations are available to show. Ambiguous matches can be linked manually above.';
        const groups = new Map(), shownStandards = new Set();
        for (const item of result.evaluations) {
          const key = JSON.stringify([item.name || '', item.position || '', item.date || '', item.name ? '' : item.comments || '']);
          if (!groups.has(key)) groups.set(key, { item, labels: [], comments: new Map() });
          const label = [item.year, item.standardNumber ? 'Standard ' + item.standardNumber +
            (item.standardVersion ? ' v' + item.standardVersion : '') : ''].filter(Boolean).join(' - ') +
            (item.match === 'standard' ? ' (private automatic match)' : '');
          const group = groups.get(key);
          if (!group.labels.includes(label)) group.labels.push(label);
          const comment = item.comments || '';
          if (!group.comments.has(comment)) group.comments.set(comment, []);
          if (!group.comments.get(comment).includes(label)) group.comments.get(comment).push(label);
          if (item.standardNumber) shownStandards.add(item.standardNumber + ':' + (item.standardVersion || ''));
        }
        for (const { item, labels, comments } of groups.values()) {
          const block = el('section', '', { class: 'moderation-panel' });
          const details = el('dl', '', { class: 'library-evaluation-details' }), commentDetails = el('dl');
          block.append(el('h4', labels.join('; ')));
          for (const [label, value] of [['Evaluator name', item.name], ['Evaluator position', item.position], ['Evaluation date', item.date]]) {
            const field = el('div');
            field.append(el('dt', label), el('dd', value || 'Not recorded')); details.append(field);
          }
          for (const [comment, commentLabels] of comments) {
            commentDetails.append(el('dt', 'Evaluation comments' + (comments.size > 1 ? ' - ' + commentLabels.join('; ') : '')),
              el('dd', comment || 'Not recorded', { class: 'library-evaluation-comments' }));
          }
          block.append(details, commentDetails); evaluationList.append(block);
        }
        for (const standard of result.standards) {
          if (!standard.number || !standard.ambiguous && shownStandards.has(standard.number + ':' + standard.version)) continue;
          const block = el('section', '', { class: 'moderation-panel' });
          block.append(el('h4', 'Standard ' + standard.number + (standard.version ? ' v' + standard.version : '')),
            el('p', standard.ambiguous ? 'Multiple library assessments match this standard and version. Link your moderation record manually above to show and share its evaluation.' :
              result.more ? 'No evaluation shown in the first 100 results.' : 'No evaluation available to show for this standard.'));
          evaluationList.append(block);
        }
      } catch (error) {
        console.error('Resource Library evaluations could not be loaded.');
        evaluationStatus.setAttribute('role', 'alert');
        evaluationStatus.textContent = error.message + ' Retry loading evaluations.';
      }
    }
    if (revision) button('Refresh evaluations', loadEvaluations, evaluations);
    try { await loadModerationRecords(); } catch (error) { linkTools.report(error); }
    await loadEvaluations();
    if (revision) button('View saved revision history', async () => {
      const result = await request('resource-library/' + resourceId + '/history');
      history.replaceChildren(el('p', result.notice));
      for (const saved of result.revisions) {
        const item = el('details', '', { class: 'moderation-panel' });
        item.append(el('summary', 'Revision ' + saved.revision + ' - ' + new Date(saved.updated_at).toLocaleString('en-NZ')));
        const details = el('dl');
        for (const [, fields] of detailGroups) for (const [key, label] of fields) {
          details.append(el('dt', label), el('dd', saved.content[key] || 'Not recorded'));
        }
        const origin = saved.content.origin;
        details.append(el('dt', 'Assessment source'), el('dd', origin?.type || 'Commercial'));
        if (origin?.type === 'Own') details.append(el('dt', 'Written by'), el('dd', origin.authorName || 'Not recorded'));
        if (origin && ['TKI', 'NZQA'].includes(origin.type)) for (const [key, label] of [
          ['originalUrl', 'Original link'], ['linkedDate', 'Date original linked'],
          ['modificationNotes', 'Modification Notes'], ['finalUrl', 'Final assessment Google link']
        ]) details.append(el('dt', label), el('dd', origin[key] || 'Not recorded'));
        if (origin && ['TKI', 'NZQA'].includes(origin.type)) {
          for (const [index, item] of (origin.additionalOriginals || []).entries()) {
            details.append(el('dt', 'Original link ' + (index + 2)), el('dd', item.url || 'Not recorded'),
              el('dt', 'Date original ' + (index + 2) + ' linked'), el('dd', item.linkedDate || 'Not recorded'));
          }
          for (const [index, value] of (origin.additionalFinals || []).entries()) {
            details.append(el('dt', 'Final assessment link ' + (index + 2)), el('dd', value || 'Not recorded'));
          }
        }
        details.append(el('dt', 'Class Codes'), el('dd', (saved.content.classCodes || []).join(', ') || 'Not recorded'));
        item.append(details, el('p', saved.content.standards.map(standard => standard.number + ' v' + standard.version +
          (standard.level ? ' | Level ' + standard.level : '') + (standard.credits ? ' | ' + standard.credits + ' credits' : '')).join('; ')));
        for (const [key, label] of fileGroups) {
          item.append(el('h4', label));
          for (const file of saved.content[key]) item.append(fileLink(el, file), el('br'));
        }
        for (const critique of saved.content.critiques) {
          item.append(el('p', [critique.name, critique.school, critique.position, critique.date, critique.outcome, critique.changes].filter(Boolean).join(' | ')));
          for (const [key, label] of critiqueChecks) if (critique.checks?.[key]) {
            item.append(el('p', label + ': ' + critique.checks[key]));
          }
        }
        history.append(item);
      }
    }, page);
    const history = el('section', '', { 'aria-label': 'Saved library revisions' }); page.append(history);
    return { saveNow, hasUnsavedChanges: () => dirty || Boolean(saving) || choosing || Boolean(loadingMetadata) };
  }

  function mountPicker(host, { el, request, standardNumber, version, apply }) {
    const panel = el('section', '', { class: 'moderation-panel library-picker' });
    const status = el('p', '', { role: 'status', 'aria-live': 'polite' });
    panel.append(el('h4', 'Choose from Resource Library'),
      el('p', 'Only active editions matching standard ' + standardNumber + ' v' + version + ' are listed. Applying fills empty fields only. ZIPs, resource folders and purchase details are not copied to sheets.'), status);
    host.replaceChildren(panel);
    const { button } = tools(el, request, status);
    const search = el('input', '', { type: 'search', 'aria-label': 'Filter matching library editions' });
    const select = el('select', '', { 'aria-label': 'Resource edition', id: 'moderation-library-entry' });
    const critique = el('select', '', { 'aria-label': 'Approved critique', id: 'moderation-library-critique' });
    const preview = el('section', '', { class: 'library-preview' });
    panel.append(search, select, critique, preview);
    let entry, loadVersion = 0;
    async function load() {
      const token = ++loadVersion; entry = undefined; select.disabled = true;
      const result = await request('resource-library?active=1&standard=' + encodeURIComponent(standardNumber) +
        '&version=' + encodeURIComponent(version) + '&q=' + encodeURIComponent(search.value.trim()));
      if (token !== loadVersion || !panel.isConnected) return;
      select.replaceChildren(el('option', 'Choose an assessment edition', { value: '' }));
      critique.replaceChildren(); preview.replaceChildren();
      for (const item of result.records) select.append(el('option', item.title + (item.edition ? ' - ' + item.edition : '') + ' (' +
        (item.source_type && item.source_type !== 'Commercial' ? item.source_type : item.supplier) + ')', { value: item.id }));
      select.disabled = false;
      status.textContent = result.total ? 'Showing ' + result.records.length + ' of ' + result.total + ' matches. Narrow the search if needed.' : 'No matching editions. Add the assessment and matching NZQA version in Resource Library first.';
    }
    button('Search matching library editions', load, panel);
    select.addEventListener('change', async () => {
      entry = undefined; preview.replaceChildren();
      if (!select.value) return;
      const selectedId = select.value;
      try {
        const selected = await request('resource-library/' + selectedId);
        if (!panel.isConnected || select.value !== selectedId) return;
        entry = selected;
        critique.replaceChildren(el('option', 'Do not copy critique details', { value: '' }));
        const approved = entry.content.critiques.filter(item => item.outcome === 'Approved');
        for (const item of approved) critique.append(el('option', item.name + ' - ' + item.school + ' - ' + item.date, { value: item.id }));
        critique.value = approved.length === 1 ? approved[0].id : '';
        renderPreview();
      } catch (error) { status.textContent = error.message; status.setAttribute('role', 'alert'); }
    });
    function renderPreview() {
      if (!entry) return;
      const selected = schema.snapshot(entry, standardNumber, version, critique.value);
      preview.replaceChildren(el('p', 'Source: ' + selected.source), el('p',
        selected.critiqueName ? 'Critiquer: ' + [selected.critiqueName, selected.critiqueSchool, selected.critiqueDate].join(' | ') : 'No critique details will be copied.'));
      if (selected.classCodes?.length) preview.append(el('p', 'Class codes: ' + selected.classCodes.join(', ')));
      for (const [key, label] of critiqueChecks) if (selected.critiqueChecks?.[key]) {
        preview.append(el('p', label + ': ' + selected.critiqueChecks[key]));
      }
      for (const key of ['assessmentFiles', 'topicBriefFiles']) for (const file of entry.content[key]) preview.append(fileLink(el, file), el('br'));
      preview.append(el('p', 'Licence: ' + (entry.content.licence || 'Not recorded. Check permitted use before distributing resources.')));
    }
    critique.addEventListener('change', () => {
      try { renderPreview(); } catch (error) { status.textContent = error.message; status.setAttribute('role', 'alert'); }
    });
    button('Fill missing from library', async () => {
      if (!entry) throw new Error('Choose a resource edition first.');
      const selected = schema.snapshot(entry, standardNumber, version, critique.value);
      if (!confirm('Fill empty course code, source, assessment links and selected critique details and recorded checks from this edition? Existing values and student marking are kept. Drive documents will not be changed.')) return;
      await apply(selected); host.replaceChildren();
    }, panel);
    button('Close library chooser', () => host.replaceChildren(), panel);
    load().catch(error => { console.error('Resource Library choices failed.'); status.textContent = error.message; status.setAttribute('role', 'alert'); });
  }
  globalThis.assessmentResourceLibrary = { mountPage, mountPicker };
})();
