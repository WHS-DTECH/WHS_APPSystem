(() => {
  function dateOf(value) {
    if (typeof value !== 'string') return '';
    return value.endsWith('Z') ?
      new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value)) :
      value.slice(0, 10);
  }
  function minutesOf(value) {
    const clock = value.endsWith('Z') ?
      new Intl.DateTimeFormat('en-GB', { timeZone: 'Pacific/Auckland', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value)) :
      value.slice(11, 16);
    return Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5));
  }
  function classListReferences(sessions) {
    const classKeys = new Set(), names = new Map();
    for (const session of sessions) {
      if (!session.classKey) continue;
      classKeys.add(session.classKey);
      names.set(session.classKey + '=' + session.classKey, true);
      const match = /^(.+?)\s+\(([A-Z0-9_-]+)\)$/i.exec(session.title.trim());
      if (!match || match[2].toUpperCase() !== session.classKey) continue;
      const name = match[1].trim().toUpperCase();
      if (!/^[A-Z0-9][A-Z0-9 _-]{0,39}$/.test(name)) continue;
      names.set(name + '=' + session.classKey, true);
    }
    return {
      classKeys: [...classKeys],
      classLists: [...names.keys()]
    };
  }
  function sessionsForDate(events, value, slots) {
    const weekday = new Date(value + 'T00:00:00Z').getUTCDay();
    if (weekday === 0 || weekday === 6) return [];
    return slots.map(([slot, label, startTime, endTime]) => {
      const start = Number(startTime.slice(0, 2)) * 60 + Number(startTime.slice(3, 5));
      const end = Number(endTime.slice(0, 2)) * 60 + Number(endTime.slice(3, 5));
      const matches = events.filter(event => !event.allDay && dateOf(event.start) === value &&
        minutesOf(event.start) === start && minutesOf(event.end) === end);
      if (!matches.length) return null;
      const event = matches.length === 1 ? matches[0] : null;
      const classKey = event && /^[^(]+\(([A-Z0-9_-]+)\)$/i.exec(event.title.trim())?.[1].toUpperCase() || null;
      return { date: value, slot, label, title: event?.title || 'Multiple timetable entries',
        classKey, source: matches.length > 1 ? 'ambiguous' : 'KAMAR', startTime, endTime };
    }).filter(Boolean);
  }
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
  function dashboard(host, context, { el, request, loadSchedule, select, openNotesSession, openTrelloSession, changeDate, termControl, termError, openJunior, juniorRequest, openMiddle, middleRequest, semesterForDate, defaultView = () => 'trello',
    todayDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()) }) {
    const page = el('section', '', { class: 'teaching-dashboard', 'aria-label': 'Teaching Dashboard' });
    const heading = el('div', '', { class: 'teaching-dashboard-heading', 'data-planner-navigation': '' });
    if (termControl) heading.append(termControl);
    heading.append(el('h2', 'Teaching Dashboard', { class: 'paper-heading' }));
    if (openJunior) {
      const junior = el('button', 'JuniorDTECH', { type: 'button' });
      junior.addEventListener('click', openJunior);
      heading.append(junior);
    }
    if (openMiddle) {
      const middle = el('button', 'MiddleDTECH', { type: 'button' });
      middle.addEventListener('click', openMiddle);
      heading.append(middle);
    }
    if (termError) heading.append(el('p', termError, { role: 'alert' }));
    page.append(heading);
    const columns = el('div', '', { class: 'teaching-dashboard-columns' });
    const left = el('section', '', { 'aria-label': 'Teaching Day', 'data-planner-navigation': '' });
    const workspace = el('div', '', { class: 'teaching-dashboard-workspace' });
    const dateLabel = el('p', globalThis.plannerSessionSchema.dateLabel(context.date));
    const dateInput = el('input', '', { type: 'date', min: '2000-01-01', max: '2100-12-31', 'aria-label': 'Teaching Day date' });
    dateInput.value = context.date;
    const dateControls = el('div', '', { class: 'teaching-day-date-controls', role: 'group', 'aria-label': 'Choose Teaching Day' });
    const previous = el('button', '‹', { type: 'button', 'aria-label': 'Previous day' });
    const next = el('button', '›', { type: 'button', 'aria-label': 'Next day' });
    const today = el('button', 'Today', { type: 'button' });
    const tomorrow = el('button', 'Tomorrow', { type: 'button' });
    dateControls.append(previous, dateInput, next, today, tomorrow);
    const scheduleMessage = el('p', 'Loading the timetable...', { role: 'status' });
    const sessions = el('div', '', { class: 'teaching-day-sessions' });
    const message = el('p', 'Reading Trello...', { role: 'status' });
    const cards = el('div', '', { class: 'teaching-dashboard-cards' });
    const refresh = el('button', 'Refresh Trello information', { type: 'button' });
    left.append(el('h3', 'Teaching Day'), dateLabel, dateControls, scheduleMessage, sessions, refresh, message, cards);
    columns.append(left, workspace); page.append(columns); host.append(page);
    let result, error, scheduleError, selectedHost, juniorSession, generation = 0, switching = false, reading = false, dateChanging = false;
    let scheduledSessions = [];
    function updateControls() {
      const dateDisabled = switching || dateChanging;
      dateInput.disabled = dateDisabled;
      for (const button of left.querySelectorAll('button')) {
        if ([previous, next, today, tomorrow].includes(button)) button.disabled = dateDisabled;
        else if (button === refresh) button.disabled = switching || reading || dateChanging;
        else button.disabled = switching || dateChanging || button.hasAttribute('data-trello-unavailable');
      }
    }
    function renderSchedule() {
      sessions.replaceChildren();
      scheduleMessage.setAttribute('role', scheduleError ? 'alert' : 'status');
      scheduleMessage.textContent = scheduleError || (scheduledSessions.length ?
        'Select a class box to open your saved default view. Notes and Trello buttons open a one-off view.' :
        'No teaching sessions are scheduled for this date.');
      for (const session of scheduledSessions) {
        const card = result?.cards.find(item => item.metadata.session_slot === session.slot &&
          session.classKey && item.metadata.class_key === session.classKey);
        const selected = context.slot === session.slot && context.classKey === session.classKey;
        const item = el('article', '', { class: 'teaching-day-session', 'data-selected': String(selected) });
        const openTrello = () => { if (!switching && !dateChanging) return card ? select(card, true) : openTrelloSession(session); };
        const openNotesView = () => { if (!switching && !dateChanging) return openNotesSession(session); };
        const openDefault = () => defaultView() === 'notes' ? openNotesView() : openTrello();
        const title = el('button', session.title, { type: 'button', class: 'teaching-day-session-title', 'aria-pressed': String(selected) });
        title.addEventListener('click', openDefault);
        item.addEventListener('click', event => {
          if (event.target?.closest?.('button')) return;
          openDefault();
        });
        item.append(title,
          el('p', session.label + ' | ' + session.startTime + '–' + session.endTime + ' NZ'));
        if (session.source === 'ambiguous') {
          item.append(el('p', 'Multiple KAMAR entries match this period. Notes are not assigned to a class.', { role: 'alert' }));
        }
        if (card) {
          item.append(el('p', 'Trello preparation: ' + card.metadata.lesson_title),
            el('p', 'Preparation status: ' + card.metadata.preparation_status));
        } else {
          item.append(el('p', 'No matching Trello preparation. You can still plan in Notes.'));
        }
        const actions = el('div', '', { class: 'teaching-day-session-actions' });
        const openNotes = el('button', 'Open Notes', { type: 'button' });
        openNotes.addEventListener('click', openNotesView);
        actions.append(openNotes);
        const trelloButton = el('button', 'Open Trello preparation', { type: 'button' });
        trelloButton.addEventListener('click', openTrello);
        actions.append(trelloButton);
        item.append(actions); sessions.append(item);
      }
    }
    function selectSession(next) {
      Object.assign(context, next);
      dateInput.value = context.date;
      dateLabel.textContent = globalThis.plannerSessionSchema.dateLabel(context.date);
      for (const button of cards.querySelectorAll('[data-card-id]')) {
        button.setAttribute('aria-pressed', String(context.cardId ?
          button.getAttribute('data-card-id') === context.cardId : button.getAttribute('data-session-slot') === context.slot));
      }
      renderSchedule();
      renderSelected();
    }
    function setBusy(value) {
      switching = value; workspace.inert = value; workspace.setAttribute('aria-busy', String(value));
      updateControls();
    }
    function historical(host, middle) {
      let disposed = false;
      const saved = context.savedSession, content = saved?.revision > 0 ? saved.content : null;
      const legacy = saved?.legacy?.revision > 0 ? saved.legacy.content : null;
      const activities = content?.activities || [];
      const legacyPlan = legacy && ['title', 'priorities', 'activities', 'resources'].some(key => legacy[key]?.trim());
      if (activities.length) {
        const slot = globalThis.plannerSessionSchema.slots.find(item => item[0] === context.slot);
        const plan = { metadata: { class_key: context.classKey, display_title: 'Saved session plan',
          teaching_date: context.date, start_time: slot[2], room: context.location || '' },
          preparation: '', continuation: '', slots: activities.map((item, index) => ({
            number: String(index + 1), type: 'Activity', colour: 'activity', title: item.title,
            details: item.teachingNote || '', reminder: item.status || '', unit: '', lesson: '',
            resource: '', resourceUrl: '', resources: []
          })) };
        host.append(globalThis.plannerTeachingSlots.renderPlan(el, plan, { id: 'saved-' + context.date + '-' + context.slot }));
      } else if (!legacyPlan) host.append(el('p', 'No saved plan for this session', { role: 'status' }));
      if (legacy && ['title', 'priorities', 'activities', 'resources', 'reflection'].some(key => legacy[key]?.trim())) {
        const original = el('section', '', { class: 'session-section', 'aria-label': 'Saved original period plan' });
        original.append(el('h3', legacyPlan ? 'Saved original period plan' : 'Saved original period notes'));
        for (const [key, label] of [['title', 'Title'], ['priorities', 'Priorities'], ['activities', 'Activities'], ['resources', 'Resources'], ['reflection', 'Reflection']]) {
          if (legacy[key]?.trim()) original.append(el('h4', label), el('p', legacy[key], { class: 'session-preserved-text' }));
        }
        host.append(original);
      }
      if (content?.note || content?.evaluation) {
        const notes = el('section', '', { class: 'session-section', 'aria-label': 'Saved session notes' });
        notes.append(el('h3', 'Saved session notes'));
        if (content.note) notes.append(el('p', content.note, { class: 'session-preserved-text' }));
        if (content.evaluation) notes.append(el('h4', 'Evaluation'), el('p', content.evaluation, { class: 'session-preserved-text' }));
        host.append(notes);
      }
      if (middle && middleRequest) {
        const status = el('p', 'Checking the current MiddleDTECH order...', { role: 'status' });
        const open = el('button', 'Open MiddleDTECH teaching order and progress', { type: 'button' });
        open.addEventListener('click', openMiddle);
        host.append(status, open);
        middleRequest('catalogue').then(data => {
          if (disposed || !host.isConnected) return;
          status.textContent = data.orderCardCount === 0 ? 'No MiddleDTECH teaching order has been set' :
            'The current MiddleDTECH order does not establish a past plan.';
        }).catch(error => {
          if (disposed || !host.isConnected) return;
          status.setAttribute('role', 'alert'); status.textContent = error.message + ' Notes remain available.';
        });
      }
      return { dispose() { disposed = true; } };
    }
    function renderSelected() {
      if (!selectedHost?.isConnected) return;
      juniorSession?.dispose(); juniorSession = undefined;
      selectedHost.replaceChildren();
      const verifiedJunior = context.classKey === 'JPI' && /^PIDTECH\s*\(JPI\)$/i.test(context.title || '') ||
        context.classKey === 'JSR' && /^SRDTECH\s*\(JSR\)$/i.test(context.title || '');
      const verifiedMiddle = context.classKey && new RegExp('^MDTECH\\s*\\(' + context.classKey + '\\)$', 'i').test(context.title || '');
      if (error) {
        selectedHost.append(el('p', error + ' Notes remain available.', { role: 'alert' }));
        if ((verifiedJunior || verifiedMiddle) && context.date < todayDate()) juniorSession = historical(selectedHost, verifiedMiddle);
        return;
      }
      if (!result) { selectedHost.append(el('p', 'Reading Trello...', { role: 'status' })); return; }
      const card = result.cards.find(card => (!context.cardId || card.id === context.cardId) &&
        card.metadata.session_slot === context.slot && (card.metadata.class_key === context.classKey ||
          !context.classKey && context.cardId === card.id));
      if (!card) {
        if ((verifiedJunior || verifiedMiddle) && context.date < todayDate()) {
          juniorSession = historical(selectedHost, verifiedMiddle);
          return;
        }
        if ((verifiedJunior && juniorRequest || verifiedMiddle && middleRequest) && globalThis.plannerJuniorTeaching &&
            result.status !== 'not_configured' && !result.issues?.length) {
          juniorSession = globalThis.plannerJuniorTeaching.mountSession(selectedHost, context,
            verifiedMiddle ? { el, request: middleRequest, openPage: openMiddle, name: 'MiddleDTECH', semesterForDate } :
              { el, request: juniorRequest, openPage: openJunior });
        } else {
          selectedHost.append(el('p', 'Trello preparation is unavailable for this session. Notes remain available and unchanged.', { role: 'status' }));
        }
        return;
      }
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
    function setDate(value, schedule = [], failure = '') {
      generation++;
      context.date = value;
      dateInput.value = value;
      dateLabel.textContent = globalThis.plannerSessionSchema.dateLabel(value);
      result = undefined; error = undefined; cards.replaceChildren();
      scheduledSessions = schedule;
      scheduleError = failure;
      renderSchedule(); renderSelected();
    }
    async function readSchedule(value) {
      try {
        const feed = await loadSchedule(value);
        return { sessions: sessionsForDate(feed.events || [], value, globalThis.plannerSessionSchema.slots), error: '' };
      } catch (failure) {
        return { sessions: [], error: failure.message + ' Timetable sessions could not be verified.' };
      }
    }
    function noSessions(value, failure = '') {
      selectedHost = undefined;
      workspace.replaceChildren(el('p', failure ||
        'No teaching sessions are scheduled for this date. Your existing plans and notes are unchanged.', { role: failure ? 'alert' : 'status' }));
    }
    async function load() {
      const current = ++generation; reading = true; updateControls(); result = undefined; error = undefined;
      message.setAttribute('role', 'status'); message.textContent = 'Reading Trello...'; cards.replaceChildren(); renderSelected();
      const schedule = await readSchedule(context.date);
      if (current !== generation || !page.isConnected) {
        if (current === generation) { reading = false; updateControls(); }
        return;
      }
      scheduledSessions = schedule.sessions; scheduleError = schedule.error; renderSchedule();
      try {
        const refs = classListReferences(scheduledSessions);
        const params = refs.classKeys.length ? new URLSearchParams({
          classKeys: refs.classKeys.join(','), classLists: refs.classLists.join(',')
        }).toString() : '';
        const feed = await request(context.date, params);
        if (current !== generation || !page.isConnected) return;
        result = feed;
        cards.replaceChildren();
        message.textContent = feed.status === 'not_configured' ? feed.message :
          feed.cards.length ? 'Read-only preparation. Select a session.' : 'No teaching cards are available for this date.';
        const matched = new Set();
        for (const session of scheduledSessions) {
          const card = feed.cards.find(item => item.metadata.session_slot === session.slot &&
            session.classKey && item.metadata.class_key === session.classKey);
          if (card) matched.add(card.id);
        }
        for (const card of feed.cards) if (!matched.has(card.id)) sessionCard(card);
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
        if (current === generation && page.isConnected) {
          renderSchedule(); reading = false; updateControls(); renderSelected();
        }
      }
    }
    async function chooseDate(value) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) ||
        new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) !== value ||
        Number(value.slice(0, 4)) < 2000 || Number(value.slice(0, 4)) > 2100) {
        dateInput.value = context.date;
        return;
      }
      if (switching || dateChanging) return;
      dateChanging = true; updateControls();
      try {
        const changed = changeDate ? await changeDate(value) : true;
        if (changed === false) { dateInput.value = context.date; return; }
        if (context.date !== value) setDate(value);
        await load();
      } catch (failure) {
        scheduleMessage.setAttribute('role', 'alert');
        scheduleMessage.textContent = failure.message + ' The selected date was not changed.';
        dateInput.value = context.date;
      } finally {
        dateChanging = false; updateControls();
      }
    }
    function moveDate(amount) {
      const value = new Date(dateInput.value + 'T00:00:00Z');
      value.setUTCDate(value.getUTCDate() + amount);
      chooseDate(value.toISOString().slice(0, 10));
    }
    dateInput.addEventListener('change', () => chooseDate(dateInput.value));
    previous.addEventListener('click', () => moveDate(-1));
    next.addEventListener('click', () => moveDate(1));
    today.addEventListener('click', () => chooseDate(new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date())));
    tomorrow.addEventListener('click', () => moveDateFromToday(1));
    function moveDateFromToday(amount) {
      const value = new Date(new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit', day: '2-digit'
      }).format(new Date()) + 'T00:00:00Z');
      value.setUTCDate(value.getUTCDate() + amount);
      chooseDate(value.toISOString().slice(0, 10));
    }
    refresh.addEventListener('click', load); renderSchedule(); load();
    return { get date() { return context.date; }, workspace, selectSession, setBusy,
      setDate, readSchedule, noSessions, refresh: load,
      updateSavedSession: (content, revision) => { if (context.savedSession) Object.assign(context.savedSession, { content, revision }); },
      showTrello: host => { selectedHost = host; renderSelected(); } };
  }
  function mount(host, context, { el, request }) {
    host.replaceChildren();
    const panel = el('section', '', { class: 'session-section teaching-day-trello', 'aria-label': 'Teaching Day' });
    panel.append(el('h3', 'Teaching Day'),
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
      message.setAttribute('role', 'status'); message.textContent = 'Reading Teaching Day from Trello...';
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
  globalThis.plannerTeachingDayTrello = { mount, dashboard, sessionsForDate };
})();
