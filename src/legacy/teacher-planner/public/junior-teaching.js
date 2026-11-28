(() => {
  function groups(entries) {
    const result = new Map();
    for (const entry of entries) {
      if (entry.kind === 'routine') continue;
      if (!result.has(entry.sequenceKey)) result.set(entry.sequenceKey, []);
      result.get(entry.sequenceKey).push(entry);
    }
    return result;
  }
  function proposedEntries(data, selection, classKey) {
    const chosen = new Set(data.entries.filter(item => item.kind === 'routine').map(item => item.id));
    for (const [key, entries] of groups(data.entries)) {
      if (entries[0].kind === 'kit' && !selection.kits.includes(key)) continue;
      const saved = data.progress.find(row => row.class_key === classKey && row.sequence_key === key);
      const entry = entries.find(item => item.id === saved?.entry_id);
      if (entry) chosen.add(entry.id);
    }
    return data.entries.filter(entry => chosen.has(entry.id));
  }
  function textWithLinks(el, text) {
    const container = el('p', '', { class: 'session-preserved-text' });
    const lines = text.split(/\r?\n/).filter(line => !/^(?:Type|Unit|Lesson|Plan|Activity|Library card):/i.test(line));
    const value = lines.join('\n');
    const pattern = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>()]+)/g;
    let last = 0, match;
    while ((match = pattern.exec(value))) {
      container.append(document.createTextNode(value.slice(last, match.index)));
      const address = match[2] || match[3];
      try {
        const url = new URL(address);
        if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid link');
        container.append(el('a', match[1] || address, { href: url.href, target: '_blank', rel: 'noopener noreferrer' }));
      } catch {
        container.append(document.createTextNode(match[0]));
      }
      last = pattern.lastIndex;
    }
    container.append(document.createTextNode(value.slice(last)));
    return container;
  }
  function preview(el, entry) {
    const details = el('details', '', { class: 'teaching-day-card' });
    details.append(el('summary', entry.title), textWithLinks(el, entry.description),
      el('a', 'Open library card in Trello', { href: entry.url, target: '_blank', rel: 'noopener noreferrer' }));
    return details;
  }
  function warnings(el, host, issues) {
    for (const issue of issues) host.append(el('p', issue.name + ': ' + issue.message, { role: 'alert' }));
  }
  function draftSlot(entry, number) {
    const source = entry.source;
    const details = source.description.split(/\r?\n/)
      .filter(line => !/^(?:Type|Unit|Lesson|Plan|Activity|Scheduling|Library card):/i.test(line)).join('\n').trim();
    const resources = [{ category: 'Web Links', resource: 'Open library card in Trello', resourceUrl: source.url }];
    const links = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>()]+)/g;
    for (const line of details.split('\n')) {
      for (const match of line.matchAll(links)) {
        const label = match[1] || line.slice(0, match.index).replace(/[:\s-]+$/, '').trim() || 'Resource';
        const category = /^unit plan$/i.test(label) ? 'Unit Plan' : /^lesson plan$/i.test(label) ? 'Lesson Plan' :
          /^print resource/i.test(label) ? 'Print Resources' : 'Web Links';
        resources.push({ category, resource: label, resourceUrl: match[2] || match[3] });
      }
    }
    const type = { routine: 'Routine', unit: 'Unit Library', kit: 'Kit' }[entry.kind];
    return { number: String(number), type, colour: { routine: 'routine', unit: 'unit-library', kit: 'kit' }[entry.kind],
      title: entry.title, unit: entry.kind === 'unit' ? entry.sequence : '', lesson: entry.kind === 'unit' ? entry.title : '',
      details, reminder: '', resource: '', resourceUrl: '', resources };
  }
  function isJuniorSession(event) {
    if (!event.classKey || event.source === 'ambiguous' || event.source === 'manual') return false;
    if (/^JuniorDTECH(?:\s|\(|$)/i.test(event.course || '')) return true;
    const match = /^(?:PIDTECH|SRDTECH|JUNIORDTECH)\s*\(([A-Z0-9_-]+)\)$/i.exec(event.title || '');
    return event.source === 'KAMAR' && match?.[1].toUpperCase() === event.classKey;
  }
  function orderEvidence(entries, slots, content, dated) {
    const normal = value => String(value || '').trim().toLocaleLowerCase('en-NZ');
    const address = value => {
      try {
        const url = new URL(value);
        if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
        return url.origin === 'https://trello.com' ? url.origin + url.pathname.split('/').slice(0, 3).join('/') : url.href;
      } catch { return null; }
    };
    const sources = entries.map(entry => ({
      entry, urls: [entry.source.url, /^Source:\s*(https?:\/\/\S+)/im.exec(entry.source.description)?.[1]]
        .map(address).filter(Boolean)
    }));
    const mapped = new Map();
    const occurrences = new Map();
    if (dated) for (const slot of slots) {
      const occurrence = (occurrences.get(slot.title) || 0) + 1;
      occurrences.set(slot.title, occurrence);
      const urls = [slot.resourceUrl, ...(slot.resources || []).filter(resource => resource.category !== 'Unit Plan')
        .map(resource => resource.resourceUrl)].map(address).filter(Boolean);
      const explicit = sources.filter(({ entry }) => entry.kind === 'unit' && slot.type === 'Unit Library' &&
        normal(slot.unit) === normal(entry.sequence) && normal(slot.lesson) === normal(entry.title));
      const linked = sources.filter(source => source.urls.some(url => urls.includes(url)));
      if (explicit.length && linked.length && !explicit.some(item => linked.some(source => source.entry.id === item.entry.id))) continue;
      const routines = sources.filter(({ entry }) => entry.kind === 'routine' && slot.type === 'Routine' &&
        normal(slot.title) === normal(entry.title));
      const matches = explicit.length ? explicit : linked.length ? linked : routines;
      if (matches.length !== 1) continue;
      const key = matches[0].entry.id;
      if (!mapped.has(key)) mapped.set(key, []);
      mapped.get(key).push({ slot, occurrence });
    }
    return entries.map(entry => {
      const planned = mapped.get(entry.id) || [];
      const recorded = planned.map(({ slot, occurrence }) => content.slotOutcomes?.find(outcome =>
        outcome.title === slot.title && outcome.occurrence === occurrence)?.status);
      if (!planned.length && entries.filter(item => item.title === entry.title).length === 1) {
        recorded.push(...(content.slotOutcomes || []).filter(outcome => outcome.title === entry.title).map(outcome => outcome.status));
      }
      const labels = entry.kind === 'routine' ? ['Routine'] : [];
      if (planned.length) labels.push('Planned this period');
      if (recorded.includes('not_taught')) labels.push('Not taught');
      else if (recorded.includes('partial')) labels.push('Partially taught');
      else if (recorded.length && recorded.every(status => status === 'taught')) labels.push('Completed');
      else if (!recorded.some(Boolean)) {
        const activities = (content.activities || []).filter(activity => activity.sourceId === entry.source.id);
        if (activities.length && activities.every(activity => activity.status === 'completed')) labels.push('Completed');
        else if (activities.some(activity => activity.status === 'partial')) labels.push('Partially taught');
      }
      return { entry, planned, labels };
    });
  }
  function mountOrderPanel(host, session, { el, request }) {
    const header = el('div', '', { class: 'session-order-heading' });
    const heading = el('h3', 'JuniorDTECH teaching order');
    const toggle = el('button', 'Hide JuniorDTECH order', { type: 'button', 'aria-expanded': 'true',
      'aria-controls': 'session-junior-sequence' });
    const body = el('div', '', { id: 'session-junior-sequence' });
    const reminder = el('div', '', { class: 'session-order-reminder' });
    const list = el('ol', '', { class: 'session-order-scroll', 'aria-label': 'Shared JuniorDTECH order', tabindex: '0' });
    body.append(reminder, list);
    header.append(heading, toggle); host.append(header, body);
    let catalogue, slots = [], dated = false, planError, orderError, content = session.revision > 0 ? session.content : {};
    function ensureCurrentVisible() {
      const selected = list.querySelector?.('[data-current="true"]');
      if (!selected || body.hidden || !list.clientHeight) return;
      const target = selected.getBoundingClientRect(), bounds = list.getBoundingClientRect();
      if (target.top < bounds.top || target.bottom > bounds.bottom) {
        list.scrollTop += target.top - bounds.top;
      }
    }
    toggle.addEventListener('click', () => {
      body.hidden = !body.hidden;
      toggle.textContent = body.hidden ? 'Show JuniorDTECH order' : 'Hide JuniorDTECH order';
      toggle.setAttribute('aria-expanded', String(!body.hidden));
      ensureCurrentVisible();
    });
    const statuses = { taught: 'Completed', partial: 'Partially taught', not_taught: 'Not taught' };
    function noteSummary(value) {
      return [value?.actualProgress, value?.note].filter(value => typeof value === 'string' && value.trim()).join('\n\n');
    }
    function render() {
      const label = session.event.label || globalThis.plannerSessionSchema.slots.find(slot => slot[0] === session.event.slot)?.[1];
      reminder.replaceChildren(el('strong', session.event.className || session.event.classKey),
        el('p', globalThis.plannerSessionSchema.dateLabel(session.event.date) + ' | ' + label));
      const previous = session.previousClassSession || session.previousSession;
      if (previous) {
        const history = el('details');
        history.append(el('summary', 'Previous saved Notes — ' + String(previous.session_date).slice(0, 10)));
        for (const outcome of previous.content.slotOutcomes || []) {
          history.append(el('p', outcome.title + ': ' + statuses[outcome.status]));
        }
        if (noteSummary(previous.content)) history.append(el('p', noteSummary(previous.content)));
        reminder.append(history);
      }
      const note = noteSummary(content);
      if (note) {
        const notes = el('details');
        notes.append(el('summary', 'Saved Notes for this period'), el('p', note));
        reminder.append(notes);
      }
      list.replaceChildren();
      for (const error of [planError, orderError].filter(Boolean)) reminder.append(el('p', error, { role: 'alert' }));
      if (!catalogue) {
        list.append(el('li', orderError ? 'Shared order unavailable.' : 'Reading shared teaching order...', { role: 'status' }));
        return;
      }
      const evidence = orderEvidence(catalogue.entries, slots, content, dated);
      const current = evidence.find(item => item.entry.kind !== 'routine' && item.planned.length);
      const planned = slots.filter(slot => evidence.some(item => item.entry.kind !== 'routine' &&
        item.planned.some(plan => plan.slot === slot))).map(slot => slot.title);
      if (planned.length) reminder.append(el('p', 'Planned this period: ' + [...new Set(planned)].join('; ')));
      const earlier = (previous?.content.slotOutcomes || []).filter(outcome =>
        !catalogue.entries.some(entry => entry.kind === 'routine' && entry.title === outcome.title)).slice(0, 3);
      if (earlier.length) reminder.append(el('p', 'Previous saved Notes (' + String(previous.session_date).slice(0, 10) +
        '): ' + earlier.map(outcome => outcome.title + ' — ' + statuses[outcome.status]).join('; ')));
      for (const { entry, labels, planned } of evidence) {
        const row = el('li', '', { class: 'session-order-card junior-kind-' + entry.kind,
          'data-current': String(current?.entry.id === entry.id) });
        row.append(el('strong', entry.title), el('small', entry.sequence));
        if (labels.length) row.append(el('span', labels.join(' · '), { class: 'session-order-status' }));
        for (const plan of planned) if (plan.slot.title !== entry.title) {
          row.append(el('small', plan.slot.title));
        }
        list.append(row);
      }
      if (!evidence.length) list.append(el('li', 'No JuniorDTECH teaching order has been set.'));
      if (catalogue.issues.length) {
        const checks = el('details');
        checks.append(el('summary', 'Items to check (' + catalogue.issues.length + ')'));
        warnings(el, checks, catalogue.issues); reminder.append(checks);
      }
      ensureCurrentVisible();
    }
    render();
    request('catalogue').then(data => {
      if (!host.isConnected) return;
      catalogue = data; render();
    }).catch(error => {
      if (!host.isConnected) return;
      orderError = 'JuniorDTECH order unavailable: ' + error.message;
      render();
    });
    return {
      updatePlan: (plan, isDated, error) => { slots = plan; dated = isDated; planError = error; render(); },
      saved: result => { if (result.content) { content = result.content; render(); } },
      ensureCurrentVisible
    };
  }
  function lessonReadiness(source, cards) {
    const labels = { development: 'Needs development', ready: 'Ready to teach', unconfirmed: 'Readiness unconfirmed', routine: 'Routine' };
    const normal = value => String(value || '').trim().toLocaleLowerCase('en-NZ');
    const hubLink = value => typeof value === 'string' &&
      /^\/dtech-hub\/learning-pathways\/[a-z0-9-]+\.html(?:[?#][^\s\\]*)?$/i.test(value) ? value : null;
    const units = (cards || []).filter(card => card.cardType === 'unit' && normal(card.title) === normal(source.sequence));
    const lessons = units.length === 1 ? cards.filter(card => card.cardType === 'lesson' &&
      card.unit === units[0].id && normal(card.title) === normal(source.title)) : [];
    const lesson = lessons.length === 1 ? lessons[0] : null;
    const activities = lesson ? cards.filter(card => card.cardType === 'activity' && card.lesson === lesson.id)
      .map((card, position) => ({ ...card, position, url: hubLink(card.href) }))
      .sort((a, b) => (a.sequence || a.position + 1) - (b.sequence || b.position + 1)) : [];
    const planUrl = lesson && hubLink(lesson.href);
    let status = source.kind === 'routine' ? 'routine' : source.readiness?.status || 'unconfirmed';
    let gap = source.kind === 'unit' ? source.readiness?.gap || '' : '';
    if (source.kind === 'unit') {
      if (lesson && !planUrl) { status = 'development'; gap = 'Lesson plan and activities still to build.'; }
      else if (status === 'ready' && (!planUrl || lesson.status !== 'active' || !activities.length ||
        activities.some(activity => !activity.url || activity.status !== 'active'))) {
        status = 'unconfirmed'; gap = 'Recorded readiness needs verification against the DTECH-HUB plan and activities.';
      }
      else if (status === 'development' && !gap) gap = 'Teaching plan or required activities still to build.';
    } else if (source.kind !== 'routine') status = 'unconfirmed';
    return { status, label: labels[status], gap, unit: units.length === 1 ? units[0] : null, lesson, planUrl, activities };
  }
  function mountOrderEditor(host, { el, request, openTeachingDay, year, readPathways }) {
    const page = el('section', '', { class: 'junior-teaching junior-order-editor', 'data-planner-navigation': '' });
    const tools = el('div', '', { class: 'junior-order-tools' });
    const back = el('button', 'Teaching Day', { type: 'button' });
    const refresh = el('button', 'Refresh from Trello', { type: 'button' });
    const save = el('button', 'Save order', { type: 'button', hidden: '' });
    const status = el('p', 'Reading the teaching order...', { role: 'status', 'aria-live': 'polite' });
    tools.append(back, refresh, save);
    const columns = el('div', '', { class: 'junior-order-columns' });
    const order = el('section', '', { 'aria-label': 'JuniorDTECH teaching order', class: 'junior-order-main' });
    const orderList = el('ol', '', { class: 'junior-order-list' });
    order.append(el('h3', 'Teaching order'), orderList);
    const library = el('section', '', { 'aria-label': 'Add to teaching order', class: 'junior-order-library' });
    library.append(el('h3', 'Add to teaching order'));
    const libraryBody = el('div');
    library.append(libraryBody);
    const selectedDetail = el('section', '', { class: 'teaching-slot-detail junior-selected-detail',
      'aria-label': 'Selected teaching activity', 'aria-live': 'polite' });
    const side = el('aside', '', { class: 'junior-order-side' });
    side.append(selectedDetail, library);
    const checks = el('details', '', { class: 'junior-order-checks', hidden: '' });
    const progress = el('details', '', { class: 'junior-order-progress' });
    const progressBody = el('div');
    progress.append(el('summary', 'Class progress'), progressBody);
    progress.addEventListener('toggle', () => {
      if (progress.open && !progressBody.children.length) {
        mountPage(progressBody, { el, year, request, openTeachingDay, progressOnly: true });
      }
    });
    columns.append(order, side);
    page.append(el('h2', 'JuniorDTECH', { class: 'paper-heading' }), tools, status, columns, checks, progress);
    host.append(page);
    const types = { routine: ['↻', 'Routine'], unit: ['▤', 'Unit lesson'], kit: ['◆', 'Licence Kit activity'] };
    let data, draft = [], busy = false, dirty = false, dragged, addButtons = [], selectedId, selections = [], pathways, pathwayError;
    function announce(message, error = false) {
      status.setAttribute('role', error ? 'alert' : 'status');
      status.textContent = message;
    }
    function updateControls() {
      save.hidden = !dirty; save.disabled = busy;
      refresh.disabled = busy; back.disabled = busy;
      page.setAttribute('data-teaching-order-dirty', String(dirty));
      page.setAttribute('data-preferences-busy', String(busy));
      for (const { button, source } of addButtons) {
        const added = draft.some(entry => entry.source.id === source.id);
        button.disabled = busy || added;
        button.textContent = added ? 'Added' : 'Add';
      }
    }
    function details(source, referencesOnly = false) {
      const control = el('details', '', { class: 'junior-order-details' });
      control.append(el('summary', referencesOnly ? 'Reference documents' : 'Details'));
      const slot = draftSlot({ ...source, source }, 1);
      const urls = new Set();
      for (const resource of slot.resources) {
        if (urls.has(resource.resourceUrl)) continue;
        try {
          const url = new URL(resource.resourceUrl);
          if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) continue;
          if (referencesOnly && (resource.resource === 'Open library card in Trello' ||
            url.origin === globalThis.location?.origin && url.pathname.startsWith('/dtech-hub/'))) continue;
          urls.add(resource.resourceUrl);
          const label = referencesOnly ? resource.category === 'Print Resources' ? 'Worksheet reference' :
            resource.category === 'Unit Plan' ? 'Unit plan reference' :
            resource.resource === 'Source' || resource.category === 'Lesson Plan' ? 'Older lesson document' : 'Reference document' :
            resource.category === 'Print Resources' ? 'Print worksheet' :
            resource.category === 'Unit Plan' ? 'Open unit plan' :
            resource.resource === 'Open library card in Trello' ? 'Open library card' :
            resource.resource === 'Source' || resource.category === 'Lesson Plan' ?
              (source.parent ? 'Open plan' : source.kind === 'unit' ? 'Open lesson' : 'Open activity') : resource.resource;
          control.append(el('a', label, { href: url.href, target: '_blank', rel: 'noopener noreferrer' }));
        } catch { control.append(el('span', 'Resource link needs review.', { role: 'alert' })); }
      }
      return control;
    }
    function badge(kind) {
      const [icon, label] = types[kind];
      return el('span', icon, { class: 'junior-type-icon', 'aria-label': label, title: label });
    }
    function renderSelected() {
      const entry = draft.find(item => item.source.id === selectedId);
      for (const { card, button, id } of selections) {
        button.setAttribute('aria-pressed', String(id === selectedId));
        card.setAttribute('data-selected', String(id === selectedId));
      }
      selectedDetail.replaceChildren();
      if (!entry) { selectedDetail.append(el('p', 'Select an activity to see its teaching resources.')); return; }
      const source = entry.source, evidence = lessonReadiness(source, pathways);
      selectedDetail.append(el('h3', entry.title), el('p', entry.sequence),
        el('p', evidence.label, { class: 'junior-readiness-label', 'data-readiness': evidence.status }));
      if (evidence.gap) selectedDetail.append(el('p', evidence.gap));
      if (pathwayError && source.kind === 'unit') selectedDetail.append(el('p', pathwayError, { role: 'alert' }));
      if (source.kind === 'unit') {
        selectedDetail.append(el('h4', 'DTECH-HUB lesson and activities'));
        if (evidence.lesson) {
          const url = evidence.planUrl || '/dtech-hub/learning-pathways/?type=lesson#card-' + encodeURIComponent(evidence.lesson.id);
          selectedDetail.append(el('a', evidence.planUrl ? 'Open DTECH-HUB teaching plan' : 'Open DTECH-HUB lesson card',
            { href: url, target: '_blank', rel: 'noopener noreferrer' }));
        } else selectedDetail.append(el('p', 'No unique DTECH-HUB lesson link could be verified.'));
        const list = el('ul', '', { class: 'junior-detail-activities' });
        for (const activity of evidence.activities) {
          const row = el('li');
          row.append(activity.url ? el('a', activity.title, { href: activity.url, target: '_blank', rel: 'noopener noreferrer' }) :
            el('span', activity.title + ' — Activity link still to build.'));
          list.append(row);
        }
        if (evidence.activities.length) selectedDetail.append(list);
        else selectedDetail.append(el('p', 'No DTECH-HUB activity links have been verified.'));
        const references = details(source, true);
        if (references.children.length > 1) selectedDetail.append(references);
        selectedDetail.append(el('a', 'Open source library card', { href: source.url, target: '_blank', rel: 'noopener noreferrer' }));
      } else selectedDetail.append(details(source));
    }
    function move(from, to, focusLabel) {
      if (busy || from === to || from < 0 || to < 0 || to >= draft.length) return;
      const [entry] = draft.splice(from, 1);
      draft.splice(to, 0, entry);
      dirty = true; renderOrder(); updateControls();
      announce(entry.title + ' moved to position ' + (to + 1) + '. Save order to apply.');
      if (focusLabel) orderList.querySelector?.('[aria-label="' + focusLabel + '"]')?.focus();
    }
    function renderOrder() {
      orderList.replaceChildren(); selections = [];
      if (!draft.some(entry => entry.source.id === selectedId)) selectedId = draft[0]?.source.id;
      for (const [index, entry] of draft.entries()) {
        const evidence = lessonReadiness(entry.source, pathways);
        const card = el('li', '', { class: 'junior-order-card junior-kind-' + entry.kind, 'data-readiness': evidence.status });
        const handle = el('button', '⠿', { type: 'button', draggable: 'true', class: 'junior-drag-handle',
          'aria-label': 'Drag ' + entry.title + ' to reorder', title: 'Drag to reorder, or use Move up and Move down' });
        handle.disabled = busy;
        handle.addEventListener('dragstart', event => {
          if (busy) { event.preventDefault(); return; }
          dragged = entry.source.id;
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', dragged);
        });
        handle.addEventListener('dragend', () => { dragged = undefined; });
        card.addEventListener('dragover', event => { if (!busy && dragged) event.preventDefault(); });
        card.addEventListener('drop', event => {
          event.preventDefault();
          if (!busy && dragged) move(draft.findIndex(item => item.source.id === dragged), index);
          dragged = undefined;
        });
        const text = el('button', '', { type: 'button', class: 'junior-order-title',
          'aria-label': 'Select ' + entry.title, 'aria-pressed': String(entry.source.id === selectedId) });
        text.append(el('strong', entry.title), el('small', entry.sequence),
          el('span', evidence.label, { class: 'junior-readiness-label' }));
        if (evidence.gap) text.append(el('span', evidence.gap, { class: 'junior-order-gap', title: evidence.gap }));
        text.addEventListener('click', () => { selectedId = entry.source.id; renderSelected(); });
        const actions = el('div', '', { class: 'junior-order-actions' });
        for (const [label, to] of [['Move up', index - 1], ['Move down', index + 1]]) {
          const aria = label + ' activity ' + (index + 1);
          const button = el('button', label, { type: 'button', 'aria-label': aria });
          button.disabled = busy || to < 0 || to >= draft.length;
          button.addEventListener('click', () => move(index, to, label + ' activity ' + (to + 1)));
          actions.append(button);
        }
        card.append(handle, badge(entry.kind), text, actions);
        selections.push({ card, button: text, id: entry.source.id });
        orderList.append(card);
      }
      if (!draft.length) orderList.append(el('li', 'No JuniorDTECH teaching order has been set.'));
      renderSelected();
    }
    function renderLibrary() {
      libraryBody.replaceChildren(); addButtons = [];
      const tabs = el('div', '', { role: 'tablist', 'aria-label': 'Teaching libraries', class: 'junior-library-tabs' });
      const panels = [];
      for (const [index, [label, items]] of [['Unit Plans', data.libraries.units], ['Licence Kits', data.libraries.kits]].entries()) {
        const id = 'junior-library-' + index;
        const tab = el('button', label, { type: 'button', role: 'tab', id: id + '-tab',
          'aria-selected': String(index === 0), 'aria-controls': id, tabindex: index === 0 ? '0' : '-1' });
        const panel = el('div', '', { role: 'tabpanel', id, 'aria-labelledby': id + '-tab' });
        panel.hidden = index !== 0;
        const select = () => {
          for (const item of panels) {
            item.panel.hidden = item.tab !== tab;
            item.tab.setAttribute('aria-selected', String(item.tab === tab));
            item.tab.setAttribute('tabindex', item.tab === tab ? '0' : '-1');
          }
        };
        tab.addEventListener('click', select);
        tab.addEventListener('keydown', event => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const target = event.key === 'Home' ? panels[0] : event.key === 'End' ? panels[panels.length - 1] : panels[1 - index];
          target.tab.click(); target.tab.focus();
        });
        panels.push({ tab, panel }); tabs.append(tab);
        const sets = new Map();
        for (const item of items) {
          if (!sets.has(item.sequence)) sets.set(item.sequence, []);
          sets.get(item.sequence).push(item);
        }
        for (const [name, cards] of sets) {
          const group = el('details', '', { class: 'junior-library-group' });
          const summary = el('summary', '', { class: 'junior-library-tile' });
          const children = cards.filter(card => !card.parent);
          summary.append(badge(cards[0].kind), el('strong', name), el('small', children.length + ' activities'));
          group.append(summary);
          for (const card of cards.filter(card => card.parent)) group.append(details(card));
          for (const source of children) {
            const tile = el('div', '', { class: 'junior-library-item junior-kind-' + source.kind });
            const add = el('button', 'Add', { type: 'button', 'aria-label': 'Add ' + source.title + ' to teaching order' });
            add.addEventListener('click', () => {
              if (busy || draft.some(entry => entry.source.id === source.id)) return;
              draft.push({ ...source, id: null, source }); dirty = true;
              renderOrder(); updateControls();
              announce(source.title + ' added to draft. Save order to apply.');
            });
            addButtons.push({ button: add, source });
            tile.append(el('strong', source.title), add, details(source));
            group.append(tile);
          }
          if (!children.length) group.append(el('p', 'No linked lessons or activities are available yet.'));
          panel.append(group);
        }
        if (!items.length) panel.append(el('p', 'No library items are available.'));
      }
      libraryBody.append(tabs, ...panels.map(item => item.panel));
    }
    function render() {
      renderOrder(); renderLibrary();
      checks.replaceChildren(el('summary', 'Items to check (' + data.issues.length + ')'));
      checks.hidden = data.issues.length === 0;
      warnings(el, checks, data.issues);
      updateControls();
    }
    async function load() {
      if (busy || dirty && !confirm('Refresh Trello and keep your draft? Review any changes before saving.')) return;
      busy = true; updateControls();
      try {
        const [current, hub] = await Promise.all([request('catalogue'), readPathways ? readPathways().then(cards => {
          if (!Array.isArray(cards) || !cards.every(card => card && typeof card.id === 'string' &&
            typeof card.title === 'string' && typeof card.cardType === 'string')) throw new Error('The DTECH-HUB catalogue is invalid.');
          return { cards };
        }).catch(error => ({ error: 'DTECH-HUB resources unavailable: ' + error.message })) :
          Promise.resolve({ error: 'DTECH-HUB resource verification is unavailable.' })]);
        if (!page.isConnected) return;
        pathways = hub.cards; pathwayError = hub.error;
        if (dirty) {
          const sources = [...current.libraries.units, ...current.libraries.kits];
          draft = draft.map(entry => current.entries.find(item => item.source.id === entry.source.id) ||
            { ...entry, source: sources.find(source => source.id === entry.source.id) || entry.source });
          for (const entry of current.entries) if (!draft.some(item => item.source.id === entry.source.id)) draft.push(entry);
        } else draft = [...current.entries];
        data = current; render();
        announce(dirty ? 'Trello refreshed. Your draft is retained; review it before saving.' : 'Live Trello teaching order.');
      } catch (error) { announce(error.message, true); }
      finally { busy = false; renderOrder(); updateControls(); }
    }
    async function saveOrder() {
      if (busy || !dirty) return;
      busy = true; updateControls(); renderOrder(); announce('Saving order to Trello...');
      try {
        const saved = await request('order', { method: 'PUT',
          body: { version: data.orderVersion, sourceIds: draft.map(entry => entry.source.id) } });
        if (!page.isConnected) return;
        data = saved; draft = [...saved.entries]; dirty = false; render();
        progress.open = false; progressBody.replaceChildren();
        announce('Teaching order saved and verified in Trello.');
      } catch (error) {
        if (error.result?.recovery?.orderVersion) data.orderVersion = error.result.recovery.orderVersion;
        announce(error.message + ' Your draft has been kept.', true);
      } finally { busy = false; renderOrder(); updateControls(); }
    }
    back.addEventListener('click', openTeachingDay);
    refresh.addEventListener('click', load);
    save.addEventListener('click', saveOrder);
    load();
  }
  function mountPage(host, { el, year, request, openTeachingDay, readPathways, name = 'JuniorDTECH', semester: initialSemester = 1, loadClasses, progressOnly = false }) {
    if (name === 'JuniorDTECH' && !progressOnly) return mountOrderEditor(host, { el, request, openTeachingDay, year, readPathways });
    const page = el('section', '', { 'data-planner-navigation': '', class: 'junior-teaching' });
    const heading = el('div', '', { class: 'planner-nav-buttons' });
    const back = el('button', 'Teaching Day', { type: 'button' });
    back.addEventListener('click', openTeachingDay);
    const refresh = el('button', 'Refresh from Trello', { type: 'button' });
    if (!progressOnly) heading.append(back);
    heading.append(refresh);
    const middle = name === 'MiddleDTECH';
    const semester = el('select', '', { 'aria-label': 'Semester' });
    if (middle) {
      semester.append(el('option', 'Semester 1', { value: '1' }), el('option', 'Semester 2', { value: '2' }));
      semester.value = String(initialSemester);
      heading.append(semester);
    }
    const status = el('p', 'Loading ' + name + '...', { role: 'status' });
    const body = el('div');
    if (!progressOnly) page.append(el('h2', name + ' teaching order', { class: 'paper-heading' }),
      el('p', 'Add, edit and reorder cards in Trello. Planner progress changes only when you confirm it here.'));
    page.append(heading, status, body);
    host.append(page);
    let data, classes, busy = false, generation = 0;
    const scope = () => String(year) + (middle ? '/' + semester.value : '');
    async function load() {
      const current = ++generation;
      busy = true; refresh.disabled = true; semester.disabled = true;
      status.setAttribute('role', 'status'); status.textContent = 'Reading the teaching board...';
      try {
        const [result, classList] = await Promise.all([
          request(scope()), middle ? loadClasses(year, Number(semester.value)) : Promise.resolve(['JPI', 'JSR'])
        ]);
        if (current !== generation || !page.isConnected) return;
        data = result; classes = classList; render();
        status.textContent = 'Trello order and library content are read-only. Progress is private to your Planner.';
      } catch (error) {
        if (current !== generation || !page.isConnected) return;
        body.replaceChildren(); status.setAttribute('role', 'alert'); status.textContent = error.message;
      } finally { if (current === generation) { busy = false; refresh.disabled = false; semester.disabled = false; } }
    }
    async function change(classKey, sequenceKey, entryId, revision, action) {
      if (busy) return;
      const entry = data.entries.find(item => item.id === entryId);
      if (!entry || !confirm((action === 'advance' ? 'Confirm ' + classKey + ' is ready to move on to ' :
        'Set ' + classKey + ' current activity to ') + entry.title + '?')) return;
      busy = true; page.setAttribute('aria-busy', 'true'); page.setAttribute('data-preferences-busy', 'true');
      semester.disabled = true;
      for (const button of page.querySelectorAll('button')) button.disabled = true;
      try {
        await request(scope() + '/progress', { method: 'PUT', body: { classKey, sequenceKey, entryId, revision, action } });
        await load();
      } catch (error) {
        status.setAttribute('role', 'alert'); status.textContent = error.message + ' Refresh to review the current state.';
      } finally {
        busy = false; page.removeAttribute('aria-busy'); page.removeAttribute('data-preferences-busy');
        semester.disabled = false;
        for (const button of page.querySelectorAll('button')) button.disabled = false;
      }
    }
    function render() {
      body.replaceChildren();
      warnings(el, body, data.issues);
      const columns = el('div', '', { class: 'teaching-dashboard-columns' });
      const order = el('section', '', { 'aria-label': name + ' teaching order' });
      order.append(el('h3', name + ' teaching order'));
      const list = el('ol');
      for (const entry of data.entries) {
        const item = el('li');
        item.append(el('a', entry.name, { href: entry.url, target: '_blank', rel: 'noopener noreferrer' }),
          el('span', ' — ' + (entry.kind === 'routine' ? 'Recurring routine' : entry.sequence)));
        list.append(item);
      }
      order.append(list);
      if (!data.entries.length) order.append(el('p', middle && data.orderCardCount === 0 ?
        'No MiddleDTECH teaching order has been set' : 'No verified order entries are available.'));
      const libraries = el('section', '', { 'aria-label': 'Teaching libraries' });
      for (const [label, items] of [['Unit Plans', data.libraries.units], ['Licence Kit Plans', data.libraries.kits]]) {
        libraries.append(el('h3', label));
        const sets = new Map();
        for (const item of items) {
          if (!sets.has(item.sequence)) sets.set(item.sequence, []);
          sets.get(item.sequence).push(item);
        }
        for (const [name, cards] of sets) {
          const group = el('details');
          group.append(el('summary', name));
          for (const card of cards) group.append(preview(el, card));
          libraries.append(group);
        }
        if (!items.length) libraries.append(el('p', 'No verified library cards are available.'));
      }
      if (!progressOnly) { columns.append(order, libraries); body.append(columns); }
      const progress = el('section', '', { class: 'session-section', 'aria-label': 'Class progress' });
      progress.append(el('h3', 'Class progress'));
      const sequences = groups(data.entries);
      if (!classes.length) progress.append(el('p', 'No MiddleDTECH classes were found in this semester’s timetable.'));
      for (const classKey of classes) {
        progress.append(el('h4', classKey));
        for (const [key, entries] of sequences) {
          const saved = data.progress.find(row => row.class_key === classKey && row.sequence_key === key);
          const index = entries.findIndex(item => item.id === saved?.entry_id);
          const panel = el('div', '', { class: 'teaching-day-card' });
          panel.append(el('strong', entries[0].sequence),
            el('p', !saved ? 'No current activity confirmed.' : index < 0 ?
              'Current activity is missing from the verified order and needs review.' : 'Current: ' + entries[index].title,
              index < 0 && saved ? { role: 'alert' } : {}));
          const choice = el('select', '', { 'aria-label': classKey + ' ' + entries[0].sequence + ' current activity' });
          for (const entry of entries) choice.append(el('option', entry.title, { value: entry.id }));
          if (index >= 0) choice.value = entries[index].id;
          const set = el('button', 'Set current', { type: 'button' });
          set.addEventListener('click', () => change(classKey, key, choice.value, saved?.revision || 0, 'set'));
          panel.append(choice, set);
          if (index >= 0 && data.issues.some(issue => issue.list === name)) {
            panel.append(el('p', 'Review the teaching order before identifying the next activity.', { role: 'alert' }));
          } else if (index >= 0 && entries[index + 1]) {
            const advance = el('button', 'Ready to move on', { type: 'button' });
            advance.addEventListener('click', () => change(classKey, key, entries[index + 1].id, saved.revision, 'advance'));
            panel.append(advance, el('p', 'Next: ' + entries[index + 1].title));
          }
          progress.append(panel);
        }
        for (const row of data.progress.filter(item => item.class_key === classKey && !sequences.has(item.sequence_key))) {
          progress.append(el('p', row.sequence_key + ': saved activity is missing from the teaching order and needs review.', { role: 'alert' }));
        }
      }
      body.append(progress);
    }
    refresh.addEventListener('click', load);
    if (middle) semester.addEventListener('change', load);
    load();
  }
  function mountSession(host, context, { el, request, openPage, name = 'JuniorDTECH', semesterForDate }) {
    let disposed = false, busy = false, data, selection;
    const panel = el('section', '', { 'data-planner-navigation': '', 'aria-label': name + ' shared preparation' });
    const status = el('p', 'Reading ' + name + ' preparation...', { role: 'status' });
    const body = el('div');
    panel.append(el('h3', name + ' shared preparation'), status, body);
    host.append(panel);
    const sessionPath = 'session/' + context.date + '/' + context.slot + '/' + context.classKey;
    async function load() {
      try {
        const semester = semesterForDate ? await semesterForDate(context.date) : null;
        const scope = context.date.slice(0, 4) + (semester ? '/' + semester : '');
        const [catalogue, kits] = await Promise.all([request(scope), request(sessionPath)]);
        if (disposed || !panel.isConnected) return;
        data = catalogue; selection = kits; render();
        status.textContent = 'Read-only Trello content; progress changes only after confirmation.';
      } catch (error) {
        if (disposed || !panel.isConnected) return;
        status.setAttribute('role', 'alert'); status.textContent = error.message + ' Notes remain available.';
      }
    }
    async function toggle(key, enabled) {
      if (busy) return;
      busy = true;
      panel.setAttribute('data-preferences-busy', 'true');
      const kits = enabled ? [...selection.kits, key] : selection.kits.filter(item => item !== key);
      for (const checkbox of panel.querySelectorAll('input')) checkbox.disabled = true;
      try {
        selection = await request(sessionPath, { method: 'PUT', body: { kits, revision: selection.revision } });
        if (!disposed && panel.isConnected) render();
      } catch (error) {
        if (!disposed && panel.isConnected) {
          render(); status.setAttribute('role', 'alert');
          status.textContent = error.message + ' Refresh the session to review the saved kit selection.';
        }
      } finally {
        busy = false;
        panel.removeAttribute('data-preferences-busy');
        for (const checkbox of panel.querySelectorAll('input')) checkbox.disabled = false;
      }
    }
    function render() {
      body.replaceChildren();
      warnings(el, body, data.issues);
      if (name === 'MiddleDTECH' && data.orderCardCount === 0) {
        body.append(el('p', 'No MiddleDTECH teaching order has been set'));
      }
      const sets = groups(data.entries);
      const continuation = [];
      for (const [key, entries] of sets) {
        const first = entries[0], saved = data.progress.find(row => row.class_key === context.classKey && row.sequence_key === key);
        const index = entries.findIndex(item => item.id === saved?.entry_id);
        const section = el('section', '', { class: 'session-section' });
        section.append(el('h4', first.sequence));
        if (first.kind === 'kit') {
          const label = el('label', ' Include this kit in this session');
          const checkbox = el('input', '', { type: 'checkbox', 'aria-label': 'Include ' + first.sequence + ' in this session' });
          checkbox.checked = selection.kits.includes(key);
          checkbox.addEventListener('change', () => toggle(key, checkbox.checked));
          label.prepend(checkbox); section.append(label);
          if (!checkbox.checked) { body.append(section); continue; }
        }
        if (!saved) section.append(el('p', 'No current activity confirmed. Set progress in ' + name + '.'));
        else if (index < 0) section.append(el('p', 'The saved current activity is missing from the verified order and needs review.', { role: 'alert' }));
        else {
          section.append(el('p', 'Current: ' + entries[index].title));
          if (data.issues.some(issue => issue.list === name)) {
            section.append(el('p', 'Review the teaching order before identifying the next activity.', { role: 'alert' }));
          } else if (entries[index + 1]) {
            section.append(el('p', 'Next: ' + entries[index + 1].title));
            continuation.push(first.sequence + ': possible next activity ' + entries[index + 1].title + '.');
          }
        }
        body.append(section);
      }
      for (const row of data.progress.filter(item => item.class_key === context.classKey && !sets.has(item.sequence_key))) {
        body.append(el('p', row.sequence_key + ': saved activity is missing and needs review.', { role: 'alert' }));
      }
      for (const key of selection.kits.filter(item => !sets.has(item))) {
        const warning = el('div', '', { role: 'alert' });
        const remove = el('button', 'Remove unavailable kit from this session', { type: 'button' });
        remove.addEventListener('click', () => toggle(key, false));
        warning.append(el('p', key + ': a kit selected for this session is unavailable and needs review.'), remove);
        body.append(warning);
      }
      const entries = proposedEntries(data, selection, context.classKey);
      if (entries.length) {
        const slot = globalThis.plannerSessionSchema.slots.find(item => item[0] === context.slot);
        const plan = { metadata: { class_key: context.classKey, display_title: name + ' proposed session',
          teaching_date: context.date, start_time: slot[2], room: context.location || '' },
          slots: entries.map((entry, index) => draftSlot(entry, index + 1)),
          preparation: entries.flatMap(entry => entry.source.description.split(/\r?\n/)
            .filter(line => /^Preparation(?: & reminders)?:\s*\S/i.test(line)).map(line => line.replace(/^[^:]+:\s*/, ''))).join('\n'),
          continuation: [...continuation, ...entries.flatMap(entry => entry.source.description.split(/\r?\n/)
            .filter(line => /^Continuation:\s*\S/i.test(line)).map(line => line.replace(/^[^:]+:\s*/, '')))].join('\n') };
        body.prepend(globalThis.plannerTeachingSlots.renderPlan(el, plan,
          { id: 'draft-' + context.date + '-' + context.slot, draft: true }));
      }
      const open = el('button', 'Open ' + name + ' teaching order and progress', { type: 'button' });
      open.addEventListener('click', openPage); body.append(open);
    }
    load();
    return { dispose() { disposed = true; } };
  }
  globalThis.plannerJuniorTeaching = { mountPage, mountSession, proposedEntries, draftSlot, isJuniorSession, orderEvidence, mountOrderPanel, lessonReadiness };
})();
