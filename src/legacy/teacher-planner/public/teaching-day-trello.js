(() => {
  function renderCard(el, card, matched, expanded = false, programme) {
    let malformed = false;
    if (expanded && globalThis.plannerTeachingSlots) {
      try {
        const structured = globalThis.plannerTeachingSlots.render(el, card, programme);
        if (structured) return structured;
      } catch (error) {
        if (!(error instanceof globalThis.plannerTeachingSlots.FormatError)) throw error;
        console.warn('Teaching slot format is invalid; displaying the original read-only card.');
        malformed = true;
      }
    }
    const metadata = card.metadata;
    const article = el('article', '', { class: 'teaching-day-card' + (matched ? ' teaching-day-card-current' : '') });
    if (matched) article.append(el('p', 'This session', { class: 'teaching-day-current-label' }));
    if (malformed) article.append(el('p', 'Slot format could not be read. Showing the original Trello card.', { role: 'alert' }));
    article.append(el('h4', card.name || metadata.display_name),
      el('p', metadata.start_time + '-' + metadata.end_time + ' NZ | ' + metadata.session_slot.toUpperCase()),
      el('p', metadata.lesson_title), el('p', 'Trello preparation status: ' + metadata.preparation_status));
    if (card.description) {
      const details = el('details'); details.open = expanded;
      details.append(el('summary', 'Preparation, activities and planning notes'),
        el('p', card.description, { class: 'session-preserved-text' })); article.append(details);
    }
    if (card.resources.length) {
      const resources = el('ul');
      for (const resource of card.resources) {
        const item = el('li');
        item.append(el('a', resource.name, { href: resource.url, target: '_blank', rel: 'noopener noreferrer' }));
        resources.append(item);
      }
      article.append(resources);
    }
    article.append(el('p', 'Trello updated ' + globalThis.plannerSessionSchema.timestampLabel(card.updatedAt)),
      el('a', 'Open in Trello', { href: card.url, target: '_blank', rel: 'noopener noreferrer' }));
    return article;
  }
  function dashboard(host, context, { el, request, select, termControl, termError }) {
    const page = el('section', '', { class: 'teaching-dashboard', 'aria-label': 'Teaching Dashboard' });
    const heading = el('div', '', { class: 'teaching-dashboard-heading', 'data-planner-navigation': '' });
    if (termControl) heading.append(termControl);
    heading.append(el('h2', 'Teaching Dashboard', { class: 'paper-heading' }));
    if (termError) heading.append(el('p', termError, { role: 'alert' }));
    page.append(heading);
    const columns = el('div', '', { class: 'teaching-dashboard-columns' });
    const left = el('section', '', { 'aria-label': 'Current Teaching Day', 'data-planner-navigation': '' });
    const workspace = el('div', '', { class: 'teaching-dashboard-workspace' });
    const message = el('p', 'Reading Trello...', { role: 'status' }), cards = el('div');
    const refresh = el('button', 'Refresh Trello information', { type: 'button' });
    left.append(el('h3', 'Current Teaching Day'), el('p', globalThis.plannerSessionSchema.dateLabel(context.date)), refresh, message, cards);
    columns.append(left, workspace); page.append(columns); host.append(page);
    let result, error, selectedHost, generation = 0, switching = false, reading = false;
    function selectSession(next) {
      Object.assign(context, next);
      for (const button of cards.querySelectorAll('[data-card-id]')) {
        button.setAttribute('aria-pressed', String(context.cardId ?
          button.getAttribute('data-card-id') === context.cardId : button.getAttribute('data-session-slot') === context.slot));
      }
      renderSelected();
    }
    function setBusy(value) {
      switching = value; workspace.inert = value; workspace.setAttribute('aria-busy', String(value));
      for (const button of left.querySelectorAll('button')) button.disabled = value || button.hasAttribute('data-trello-unavailable');
      refresh.disabled = value || reading;
    }
    function renderSelected() {
      if (!selectedHost?.isConnected) return;
      selectedHost.replaceChildren();
      if (error) { selectedHost.append(el('p', error + ' Notes remain available.', { role: 'alert' })); return; }
      if (!result) { selectedHost.append(el('p', 'Reading Trello...', { role: 'status' })); return; }
      const card = result.cards.find(card => (!context.cardId || card.id === context.cardId) &&
        card.metadata.session_slot === context.slot && (card.metadata.class_key === context.classKey ||
          !context.classKey && context.cardId === card.id));
      if (!card) { selectedHost.append(el('p', 'No Trello card is selected for this session. Notes are unchanged.', { role: 'status' })); return; }
      selectedHost.append(renderCard(el, card, false, true, context.programme));
    }
    function sessionCard(card, unavailable = false) {
      const item = el('article', '', { class: 'teaching-dashboard-card' });
      const button = el('button', '', { type: 'button', class: 'teaching-dashboard-card-open',
        'aria-pressed': String(context.cardId ? card.id === context.cardId : card.metadata.session_slot === context.slot),
        'data-card-id': card.id, 'data-session-slot': card.metadata.session_slot });
      const title = [card.metadata.start_time, card.metadata.class_key || card.metadata.display_name].filter(Boolean).join(' - ');
      let lessonTitle = card.metadata.lesson_title;
      if (card.description?.includes('[TEACHING_DASHBOARD_V1]') && globalThis.plannerTeachingSlots) {
        try {
          const metadata = globalThis.plannerTeachingSlots.parse(card.description).metadata;
          if (['teaching_date', 'session_slot', 'class_key', 'session_type'].every(key => metadata[key] === card.metadata[key])) {
            lessonTitle = metadata.display_title;
          } else console.warn('Teaching card title does not match its session; retaining the verified feed label.');
        } catch (error) {
          if (!(error instanceof globalThis.plannerTeachingSlots.FormatError)) throw error;
          console.warn('Teaching card title could not be read; retaining the verified feed label.');
        }
      }
      button.append(el('strong', title), el('span', lessonTitle));
      if (card.location) button.append(el('span', 'Room ' + card.location));
      if (unavailable) button.setAttribute('data-trello-unavailable', '');
      else {
        button.append(el('span', card.metadata.preparation_status));
        button.addEventListener('click', event => { event.stopPropagation(); select(card, true); });
        item.addEventListener('click', () => { if (!switching) select(card, true); });
      }
      button.disabled = switching || unavailable;
      const notes = el('button', 'Notes', { type: 'button', class: 'teaching-dashboard-card-notes',
        'aria-label': 'Notes for ' + title, 'data-session-notes': card.metadata.session_slot });
      notes.disabled = switching;
      notes.addEventListener('click', event => { event.stopPropagation(); select(card, false); });
      item.append(button, notes); cards.append(item);
    }
    function unavailableSessions() {
      for (const [slot, name] of globalThis.plannerSessionSchema.slots.filter(item => ['whanau', 'p2'].includes(item[0]))) {
        sessionCard({ id: '', metadata: { teaching_date: context.date, session_slot: slot, display_name: name,
          lesson_title: 'Trello preparation unavailable. Open Notes for this session.' } }, true);
      }
    }
    async function load() {
      const current = ++generation; reading = true; refresh.disabled = true; result = undefined; error = undefined;
      message.setAttribute('role', 'status'); message.textContent = 'Reading Trello...'; cards.replaceChildren(); unavailableSessions(); renderSelected();
      try {
        const feed = await request(context.date);
        if (current !== generation || !page.isConnected) return;
        result = feed;
        cards.replaceChildren();
        message.textContent = feed.status === 'not_configured' ? feed.message :
          feed.cards.length ? 'Read-only preparation. Select a session.' : 'No teaching cards are available for this date.';
        for (const card of feed.cards) sessionCard(card);
        if (!feed.cards.length) unavailableSessions();
        if (feed.unassigned?.length) {
          cards.append(el('h3', 'Other cards in CURRENT TEACHING DAY'),
            el('p', 'Dates and sessions are not verified for these cards. They are shown read-only, not assigned to this day or class.'));
          for (const card of feed.unassigned) {
            const details = el('details', '', { class: 'teaching-day-card' });
            details.append(el('summary', card.name || 'Untitled Trello card'),
              el('p', card.description, { class: 'session-preserved-text' }),
              el('a', 'Open in Trello', { href: card.url, target: '_blank', rel: 'noopener noreferrer' }));
            cards.append(details);
          }
        }
        for (const issue of feed.issues) cards.append(el('p', 'Card ' + issue.cardId + ': ' + issue.message, { role: 'alert' }));
      } catch (failure) {
        if (current !== generation || !page.isConnected) return;
        error = failure.message; message.setAttribute('role', 'alert'); message.textContent = error + ' Notes remain available.';
      } finally {
        if (current === generation && page.isConnected) { reading = false; refresh.disabled = switching; renderSelected(); }
      }
    }
    refresh.addEventListener('click', load); load();
    return { date: context.date, workspace, selectSession, setBusy,
      showTrello: host => { selectedHost = host; renderSelected(); } };
  }
  function mount(host, context, { el, request }) {
    host.replaceChildren();
    const panel = el('section', '', { class: 'session-section teaching-day-trello', 'aria-label': 'Current Teaching Day' });
    panel.append(el('h3', 'Current Teaching Day'),
      el('p', 'Read-only Trello information for ' + globalThis.plannerSessionSchema.dateLabel(context().date) + '. Trello tasks are not confirmed classroom progress.'));
    const refresh = el('button', 'Refresh Trello information', { type: 'button' });
    const message = el('p', '', { role: 'status', 'aria-live': 'polite' }), cards = el('div'), warnings = el('div');
    panel.append(refresh, message, cards, warnings); host.append(panel);
    let cached, loading = false;
    function render() {
      if (!cached) return;
      cards.replaceChildren(); warnings.replaceChildren();
      const current = context();
      let matches = 0;
      for (const card of cached.cards) {
        const metadata = card.metadata;
        const matched = metadata.teaching_date === current.date && metadata.session_slot === current.slot &&
          metadata.class_key === current.classKey && metadata.session_type === current.sessionType;
        if (matched) matches++;
        cards.append(renderCard(el, card, matched));
      }
      for (const issue of cached.issues) warnings.append(el('p',
        'Card ' + issue.cardId + ': ' + issue.message, { class: 'session-warning' }));
      message.setAttribute('role', cached.issues.length ? 'alert' : 'status');
      message.textContent = cached.status === 'not_configured' ? cached.message :
        !cached.cards.length ? 'No valid student-facing teaching cards are available for this date.' :
          matches === 1 ? 'The corresponding class/session card is highlighted.' :
            'No card matches this session reference. No card was guessed.';
    }
    async function load() {
      if (loading) return;
      loading = true; refresh.disabled = true;
      cards.replaceChildren(); warnings.replaceChildren(); cached = undefined;
      message.setAttribute('role', 'status'); message.textContent = 'Reading Current Teaching Day from Trello...';
      try {
        const result = await request(context().date);
        if (!panel.isConnected) return;
        cached = result; render();
      } catch (error) {
        if (!panel.isConnected) return;
        message.setAttribute('role', 'alert');
        message.textContent = error.message + ' Return to Notes to continue using the Planner.';
      } finally { loading = false; refresh.disabled = false; }
    }
    refresh.addEventListener('click', load); load();
    return { refreshContext: render };
  }
  globalThis.plannerTeachingDayTrello = { mount, dashboard };
})();
