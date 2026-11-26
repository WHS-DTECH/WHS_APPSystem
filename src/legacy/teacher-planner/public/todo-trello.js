((root) => {
  'use strict';
  const dateKey = value => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date(value));
  const dateLabel = value => new Intl.DateTimeFormat('en-NZ', {
    timeZone: 'Pacific/Auckland', day: 'numeric', month: 'short', year: 'numeric'
  }).format(new Date(value));
  const timeLabel = value => new Intl.DateTimeFormat('en-NZ', {
    timeZone: 'Pacific/Auckland', dateStyle: 'medium', timeStyle: 'short'
  }).format(new Date(value));
  const make = (tag, text, attrs = {}) => {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    return node;
  };
  const state = { data: null, error: '', lastRefresh: '', loading: false,
    meetings: null, meetingError: '', meetingLoading: false, decisionError: '' };
  const listeners = new Set();
  let pending, pendingMeetings, reviewExpanded = false;
  function notify() { for (const listener of listeners) listener(state); }
  function subscribe(listener) {
    listeners.add(listener);
    listener(state);
    return () => listeners.delete(listener);
  }
  async function refreshData(api) {
    if (pending) return pending;
    state.loading = true; state.error = ''; notify();
    pending = Promise.resolve().then(async () => {
      try {
        const response = await fetch(api + 'todo-trello', { credentials: 'same-origin', cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Trello is unavailable.');
        if (data.status !== 'ok' || !Array.isArray(data.lists) || !Number.isFinite(Date.parse(data.fetchedAt))) {
          throw new Error('Trello returned an invalid response.');
        }
        groupCards(data.lists, dateKey(Date.now()));
        state.data = data; state.error = ''; state.lastRefresh = timeLabel(data.fetchedAt);
      } catch (error) {
        console.warn('Trello ToDo refresh failed.');
        state.data = null; state.error = error.message || 'Trello is unavailable.';
      } finally {
        state.loading = false; pending = null; notify();
      }
    });
    return pending;
  }

  async function refreshMeetings(api, loadDocuments) {
    if (pendingMeetings) return pendingMeetings;
    state.meetingLoading = true; state.meetingError = ''; state.meetings = null; notify();
    pendingMeetings = Promise.resolve().then(async () => {
      try {
        if (!root.TodoMeetings) throw new Error('Meeting assets are unavailable.');
        const base = api.replace(/planner\/$/, '');
        const request = async path => {
          const response = await fetch(base + path, { credentials: 'same-origin', cache: 'no-store' });
          if (!response.ok) throw new Error('Meeting source unavailable.');
          return response.json();
        };
        let decisions = null;
        try {
          const owner = document.body.dataset.userId;
          if (!owner) throw new Error('Missing signed-in account.');
          const saved = localStorage.getItem('teacher-planner-meeting-review:' + owner);
          if (saved) decisions = JSON.parse(saved);
          state.decisionError = '';
        } catch {
          state.decisionError = 'Saved meeting classifications could not be read. Check browser storage and refresh.';
        }
        state.meetings = await root.TodoMeetings.load({ request, decisions, loadDocuments,
          expectedOwner: document.body.dataset.userId });
        if (state.meetings.decisionStatus === 'invalid' || state.meetings.decisionStatus === 'scope-mismatch') {
          state.decisionError = 'Saved meeting classifications belong to a different connection or are invalid; review events again.';
        }
      } catch {
        console.warn('Meeting refresh failed.');
        state.meetingError = 'Meeting sources could not be loaded. Refresh to retry.';
      } finally {
        state.meetingLoading = false; pendingMeetings = null; notify();
      }
    });
    return pendingMeetings;
  }

  function saveMeetingDecision(api, loadDocuments, candidate, value) {
    try {
      const scope = state.meetings?.decisionScope;
      if (!scope || scope.ownerId !== document.body.dataset.userId) throw new Error('Account changed.');
      const key = 'teacher-planner-meeting-review:' + scope.ownerId;
      const saved = localStorage.getItem(key);
      const previous = saved ? JSON.parse(saved) : null;
      if (previous && (previous.ownerId !== scope.ownerId || !previous.byId || typeof previous.byId !== 'object' ||
          Array.isArray(previous.byId) || previous.schoolById && (typeof previous.schoolById !== 'object' || Array.isArray(previous.schoolById)))) {
        throw new Error('Invalid saved classifications.');
      }
      const byId = previous?.connectionId === scope.connectionId || candidate.source !== 'google' ? { ...previous?.byId } : {};
      const schoolById = { ...previous?.schoolById };
      if (candidate.source === 'google' && !scope.connectionId) throw new Error('Google connection changed.');
      const choices = candidate.source === 'google' ? byId : schoolById;
      if (value === 'unreviewed') delete choices[candidate.id];
      else if (value === 'meeting' || value === 'not-meeting') choices[candidate.id] = value;
      else throw new Error('Invalid classification.');
      const connectionId = candidate.source !== 'google' ? previous?.connectionId || scope.connectionId : scope.connectionId;
      localStorage.setItem(key, JSON.stringify({ ownerId: scope.ownerId, connectionId, byId, schoolById }));
      refreshMeetings(api, loadDocuments);
    } catch {
      state.decisionError = 'Meeting classification could not be saved. Check browser storage or reload your account.';
      notify();
    }
  }

  function labels(parent, card) {
    if (!card.labels.length) return;
    const container = make('div', '', { class: 'todo-labels term-trello-cards' });
    for (const label of card.labels) {
      const attrs = { class: 'term-trello-label' };
      if (label.color) attrs['data-trello-colour'] = label.color;
      const span = make('span', label.name || (label.color || 'Uncoloured') + ' label', attrs);
      span.title = 'Trello colour: ' + (label.color || 'uncoloured');
      container.append(span);
    }
    parent.append(container);
  }
  function sourceLinks(detail, description) {
    const links = new Set((description.match(/https:\/\/[^\s<>"\])]+/g) || []).map(value => value.replace(/[.,;!?]+$/, '')));
    for (const link of links) {
      try {
        const parsed = new URL(link);
        if (parsed.protocol !== 'https:' || parsed.username || parsed.password) continue;
        const paragraph = make('p', '', { class: 'todo-source-link' });
        paragraph.append(make('a', 'Open source link', { href: parsed.href, target: '_blank', rel: 'noopener noreferrer' }));
        detail.append(paragraph);
      } catch { console.warn('An invalid source link was ignored.'); }
    }
  }
  function showDetail(detail, card, { focus = true, onClose = () => {} } = {}) {
    detail.replaceChildren();
    const heading = make('h3', card.title);
    const close = make('button', 'Close details', { type: 'button' });
    close.addEventListener('click', () => { detail.hidden = true; onClose(); });
    detail.append(heading, close); labels(detail, card);
    if (card.role === 'filed' && card.listName) detail.append(make('p', 'Filed under: ' + card.listName));
    else if (!card.labels.some(label => label.name.trim() && label.name.trim().toLocaleUpperCase('en-NZ') !== 'MEETINGS')) {
      detail.append(make('p', 'Responsibility: not assigned'));
    }
    const status = card.role === 'filed' ? 'Filed as completed' :
      card.role === 'done' ? 'Currently in DONE' : card.dueComplete ? 'Marked complete in an active list' :
        ({ urgent: 'Urgent', todo: 'To do', doing: 'Doing', waiting: 'Waiting / follow-up',
          meetings: 'Meeting — not confirmed complete' }[card.role] || card.role);
    if (status) detail.append(make('p', 'Status: ' + status));
    if (card.start) detail.append(make('p', 'Starts: ' + timeLabel(card.start)));
    if (card.due) detail.append(make('p', 'Due: ' + timeLabel(card.due)));
    if (card.completedAt) detail.append(make('p', 'Completed: ' + timeLabel(card.completedAt)));
    detail.append(make('p', card.description || 'No description.', { class: 'todo-description' }),
      make('a', 'Open original Trello card', { href: card.url, target: '_blank', rel: 'noopener noreferrer' }));
    sourceLinks(detail, card.description);
    detail.hidden = false;
    if (focus) { detail.scrollIntoView({ block: 'nearest' }); close.focus(); }
  }
  function cardNode(card, today, detail, onSelect = () => {}, onClose = () => {}, displayDetail = showDetail) {
    const item = make('li', '', { class: 'todo-card' +
      (['done', 'filed'].includes(card.role) || card.dueComplete ? ' todo-card-completed' :
        card.role === 'urgent' || card.dueDate && card.dueDate < today ? ' todo-card-urgent' :
          card.dueDate ? ' todo-card-due' : '') });
    const row = make('div', '', { class: 'todo-card-heading' });
    const checkbox = make('input', '', { type: 'checkbox', disabled: '', 'aria-label': 'Completion unavailable in read-only mode' });
    checkbox.checked = card.role === 'done' || card.role === 'filed' || card.dueComplete;
    const button = make('button', card.title, { type: 'button', class: 'todo-card-title' });
    button.addEventListener('click', () => { onSelect(card); displayDetail(detail, card, { onClose }); });
    row.append(checkbox, button); item.append(row); labels(item, card);
    const flags = [];
    if (card.role === 'urgent') flags.push('Urgent');
    if (card.role === 'waiting') flags.push('Waiting / follow-up');
    if (card.role === 'doing') flags.push('Doing');
    if (card.due) flags.push((card.dueDate < today && !card.dueComplete && !['done', 'filed'].includes(card.role) ? 'Overdue: ' :
      card.dueDate === today ? 'Due today: ' : 'Due: ') + dateLabel(card.due));
    if (card.role === 'done' && card.completionActivity !== 'verified') flags.push(
      card.completionActivity === 'unavailable' ? 'Completion activity unavailable' : 'Completion date not verified');
    if (card.completedAt) flags.push('Completed ' + timeLabel(card.completedAt));
    if (flags.length) item.append(make('p', flags.join(' · '), { class: 'todo-card-flags' }));
    item.append(make('a', 'Open card', { href: card.url, target: '_blank', rel: 'noopener noreferrer' }));
    return item;
  }

  function todayTasks(groups, today) {
    return [...groups.urgent.filter(card => card.dueDate === today), ...groups.today];
  }

  function urgentReference(card, detail, onSelect = () => {}, onClose = () => {}) {
    const item = make('li', '', { class: 'todo-card' });
    const button = make('button', card.title, { type: 'button', class: 'todo-card-title' });
    button.addEventListener('click', () => { onSelect(card); showDetail(detail, card, { onClose }); });
    item.append(button, make('p', 'Also shown in URGENT.', { class: 'todo-card-flags' }));
    return item;
  }

  function meetingViews(groups, meetingData, today) {
    const meetings = (meetingData?.meetings || []).map(meeting => ({ ...meeting }));
    const endDate = new Date(today + 'T00:00:00Z');
    endDate.setUTCDate(endDate.getUTCDate() + 7);
    const end = meetingData?.window?.end || endDate.toISOString().slice(0, 10);
    const unscheduled = [];
    let conflicts = 0;
    for (const card of groups.meetings) {
      const links = new Set((card.description?.match(/https:\/\/[^\s<>"\])]+/g) || [])
        .map(link => link.replace(/[.,;!?]+$/, '')));
      const eventIds = new Set([...((card.description || '').matchAll(/^\s*(?:google\s+)?calendar\s+event\s+id\s*:\s*([^\s]+)\s*$/gim))]
        .map(match => match[1]));
      const matches = meetings.filter(meeting => meeting.url && links.has(meeting.url) ||
        ['google', 'school'].includes(meeting.source) && meeting.sourceId && eventIds.has(meeting.sourceId));
      if (matches.length === 1 && !matches[0].card) {
        matches[0].card = card;
        continue;
      }
      if (matches.length) conflicts++;
      const start = card.start && Number.isFinite(Date.parse(card.start)) ? card.start : null;
      const day = start ? dateKey(start) : '';
      if (start && (day < today || end && day >= end)) continue;
      const entry = { id: 'trello:' + card.id, source: 'trello', title: card.title, start, date: day, card };
      if (!start) unscheduled.push(entry);
      else meetings.push(entry);
    }
    meetings.sort((a, b) => a.date.localeCompare(b.date) ||
      (a.start || '9999').localeCompare(b.start || '9999') || a.id.localeCompare(b.id));
    return { upcoming: meetings, today: meetings.filter(meeting => meeting.date === today), unscheduled, conflicts };
  }

  function showMeetingDetail(detail, meeting, { focus = true, onClose = () => {}, openSession } = {}) {
    if (meeting.card) {
      showDetail(detail, meeting.card, { focus: false, onClose });
      if (meeting.title !== meeting.card.title) detail.append(make('p', 'Calendar event: ' + meeting.title));
      if (meeting.description && meeting.description !== meeting.card.description) {
        detail.append(make('p', meeting.description, { class: 'todo-description' }));
        sourceLinks(detail, meeting.description);
      }
    } else {
      detail.replaceChildren();
      const close = make('button', 'Close details', { type: 'button' });
      close.addEventListener('click', () => { detail.hidden = true; onClose(); });
      detail.append(make('h3', meeting.title), close, make('p', 'Responsibility: not assigned'));
      if (meeting.description) {
        detail.append(make('p', meeting.description, { class: 'todo-description' }));
        sourceLinks(detail, meeting.description);
      }
    }
    detail.append(make('p', 'Meeting status: ' + (meeting.status === 'elapsed' ? 'Ended; attendance not confirmed' :
      meeting.status === 'in-progress' ? 'In progress; attendance not confirmed' :
        meeting.status === 'upcoming' ? 'Upcoming' : 'Not confirmed complete')));
    if (meeting.allDay) detail.append(make('p', 'Scheduled: ' + meeting.date + ' (all day)'));
    else if (meeting.start) detail.append(make('p', 'Scheduled: ' + timeLabel(meeting.start) +
      (meeting.end ? ' – ' + timeLabel(meeting.end) : '')));
    else if (meeting.date) detail.append(make('p', 'Date: ' + meeting.date + '; time not recorded'));
    if (meeting.location) detail.append(make('p', 'Location: ' + meeting.location));
    if (meeting.dateEstimated || meeting.timeEstimated) detail.append(make('p', 'School document uses a default date or time; confirm with the source.'));
    if (meeting.url || meeting.referenceUrl) detail.append(make('a', 'Open original event', {
      href: meeting.url || meeting.referenceUrl, target: '_blank', rel: 'noopener noreferrer'
    }));
    if (['planner', 'planner-review'].includes(meeting.source) && meeting.slot && openSession) {
      const button = make('button', 'Open Planner record', { type: 'button' });
      button.addEventListener('click', () => openSession(meeting.date, meeting.slot));
      detail.append(button);
    }
    detail.hidden = false;
    if (focus) {
      detail.scrollIntoView({ block: 'nearest' });
      detail.querySelector('button').focus();
    }
  }

  function meetingNode(meeting, today, detail, openSession, onSelect = () => {}, onClose = () => {}) {
    const indicator = () => {
      const line = make('p', '', { class: 'todo-meeting-indicator' });
      const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      icon.setAttribute('viewBox', '0 0 24 24');
      icon.setAttribute('aria-hidden', 'true');
      for (const [tag, attrs] of [['rect', { x: '3', y: '5', width: '18', height: '16', rx: '2' }],
        ['path', { d: 'M3 10h18M8 3v4M16 3v4' }]]) {
        const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
        for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
        icon.append(element);
      }
      line.append(icon, document.createTextNode(' Meeting · ' +
        (meeting.allDay ? meeting.date + ' · All day' : meeting.start ? timeLabel(meeting.start) :
          meeting.date ? meeting.date + ' · Time not recorded' : 'Time not confirmed')));
      return line;
    };
    if (meeting.card) {
      const item = cardNode(meeting.card, today, detail, () => onSelect(meeting), onClose,
        (_detail, _card, options) => showMeetingDetail(detail, meeting, { ...options, openSession }));
      item.classList.add('todo-card-meeting');
      item.prepend(indicator());
      if (meeting.end && !meeting.allDay) item.append(make('p', 'Ends: ' + timeLabel(meeting.end)));
      if (meeting.location) item.append(make('p', meeting.location));
      if (meeting.status === 'elapsed') item.append(make('p', 'Ended — attendance not confirmed.'));
      if (meeting.dateEstimated || meeting.timeEstimated) item.append(make('p', 'School document uses a default date or time; confirm with the source.'));
      if (meeting.url || meeting.referenceUrl) item.append(make('a', 'Open original event', { href: meeting.url || meeting.referenceUrl, target: '_blank', rel: 'noopener noreferrer' }));
      return item;
    }
    const item = make('li', '', { class: 'todo-card todo-card-meeting' });
    const title = make('button', meeting.title, { type: 'button', class: 'todo-card-title' });
    title.addEventListener('click', () => { onSelect(meeting); showMeetingDetail(detail, meeting, { onClose, openSession }); });
    item.append(indicator(), title);
    if (meeting.end && !meeting.allDay) item.append(make('p', 'Ends: ' + timeLabel(meeting.end)));
    if (meeting.location) item.append(make('p', meeting.location));
    if (meeting.status === 'elapsed') item.append(make('p', 'Ended — attendance not confirmed.'));
    if (meeting.dateEstimated || meeting.timeEstimated) item.append(make('p', 'School document uses a default date or time; confirm with the source.'));
    if (meeting.url || meeting.referenceUrl) item.append(make('a', 'Open original event', { href: meeting.url || meeting.referenceUrl, target: '_blank', rel: 'noopener noreferrer' }));
    if (['planner', 'planner-review'].includes(meeting.source) && meeting.slot && openSession) {
      const button = make('button', 'Open Planner record', { type: 'button' });
      button.addEventListener('click', () => openSession(meeting.date, meeting.slot));
      item.append(button);
    }
    return item;
  }

  function meetingStatus(node, current, api, loadDocuments) {
    node.replaceChildren();
    if (current.decisionError) node.append(make('p', current.decisionError, { role: 'alert' }));
    if (current.meetingLoading) { node.textContent = 'Refreshing meeting sources…'; return; }
    if (current.meetingError) { node.append(make('p', current.meetingError)); return; }
    if (!current.meetings) { node.append(make('p', 'Meeting sources have not loaded.')); return; }
    const warnings = Object.entries(current.meetings.sources).filter(([, source]) => source.status !== 'ok');
    if (warnings.length) {
      const box = make('details');
      box.append(make('summary', 'Meeting sources: ' + warnings.length + ' need attention'));
      for (const [name, source] of warnings) box.append(make('p', name + ': ' + (source.message || 'Source unavailable.')));
      node.append(box);
    }
    const candidates = current.meetings.candidates || [];
    if (candidates.length) {
      const review = make('details', '', { class: 'todo-meeting-review' });
      review.open = reviewExpanded;
      review.addEventListener('toggle', () => { reviewExpanded = review.open; });
      const pending = candidates.filter(event => event.classification === 'ambiguous').length;
      review.append(make('summary', 'Review calendar events (' + pending + ' unreviewed)'),
        make('p', 'Only mark professional meetings you attend. Confirm the date and time; exclude classes, duties and personal appointments. Nothing is written to Google Calendar or Trello.'));
      for (const event of candidates) {
        const label = make('label', event.title + ' — ' +
          (event.allDay ? event.date + ' (all day)' : event.start ? timeLabel(event.start) : event.date + ' (time not recorded)') +
          (event.dateEstimated || event.timeEstimated ? ' (document default; confirm)' : '') + ' ');
        const select = make('select', '', { 'aria-label': 'Classification for ' + event.title });
        for (const [value, text] of [['unreviewed', 'Not reviewed'], ['meeting', 'Professional meeting'], ['not-meeting', 'Not a meeting']]) {
          select.append(make('option', text, { value }));
        }
        select.value = event.classification === 'ambiguous' ? 'unreviewed' : event.classification;
        select.addEventListener('change', () => { reviewExpanded = review.open; saveMeetingDecision(api, loadDocuments, event, select.value); });
        label.append(select); review.append(label);
      }
      node.append(review);
    }
  }

  function groupCards(lists, today) {
    const groups = { urgent: [], today: [], upcoming: [], todo: [], doing: [], waiting: [],
      doneToday: [], doneOther: [], completedActive: [], meetings: [] };
    const seen = new Set();
    let outstanding = 0;
    for (const list of lists) {
      if (list.role === 'filed') continue;
      for (const card of list.cards) {
        if (seen.has(card.id)) throw new Error('Trello returned a card in more than one list. Refresh to retry.');
        seen.add(card.id);
        const dueDate = card.due ? dateKey(card.due) : '';
        const entry = { ...card, dueDate, role: list.role };
        if (list.role === 'done') {
          groups[card.completionActivity === 'verified' && card.completedAt && dateKey(card.completedAt) === today
            ? 'doneToday' : 'doneOther'].push(entry);
        } else if (card.dueComplete) groups.completedActive.push(entry);
        else if (list.role === 'meetings') groups.meetings.push(entry);
        else {
          outstanding++;
          const group = list.role === 'urgent' ? 'urgent' : dueDate === today ? 'today' :
            dueDate && dueDate > today ? 'upcoming' : list.role;
          if (!Object.hasOwn(groups, group)) throw new Error('Trello returned an unrecognised task list.');
          groups[group].push(entry);
        }
      }
    }
    return { groups, outstanding };
  }

  function mount(host, { api, week, openSession, loadDocuments }) {
    const storageKey = 'teacher-planner-trello-todo-sidebar';
    const widthKey = 'teacher-planner-trello-todo-width';
    function saved(key) {
      try { return localStorage.getItem(key); }
      catch { console.warn('Trello sidebar preference could not be read.'); return null; }
    }
    function remember(key, value) {
      try { localStorage.setItem(key, value); }
      catch { console.warn('Trello sidebar preference could not be saved.'); }
    }
    const aside = make('aside', '', { class: 'todo-sidebar', 'aria-label': 'Trello ToDo',
      'data-planner-navigation': '' });
    const show = make('button', 'Trello ToDo', { type: 'button', class: 'todo-show', 'aria-controls': 'todo-sidebar-panel',
      'aria-expanded': 'false', 'data-planner-navigation': '' });
    const panel = make('div', '', { id: 'todo-sidebar-panel', class: 'todo-panel' });
    const header = make('div', '', { class: 'todo-header' });
    const title = make('h2', 'Trello ToDo');
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('class', 'todo-trello-icon');
    icon.setAttribute('aria-hidden', 'true');
    for (const [x, height] of [['4', '15'], ['13', '10']]) {
      const bar = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      bar.setAttribute('x', x); bar.setAttribute('y', '4'); bar.setAttribute('width', '7');
      bar.setAttribute('height', height); bar.setAttribute('rx', '1');
      icon.append(bar);
    }
    title.prepend(icon);
    const count = make('span', '', { class: 'todo-count' });
    const hide = make('button', 'Collapse', { type: 'button', 'aria-label': 'Collapse Trello ToDo' });
    header.append(title, count, hide);
    const toolbar = make('div', '', { class: 'todo-toolbar' });
    const refresh = make('button', 'Refresh', { type: 'button' });
    const board = make('a', 'Open Trello board', { href: 'https://trello.com/b/QsFC8J3m/school-email-todo',
      target: '_blank', rel: 'noopener noreferrer' });
    toolbar.append(refresh, board);
    const size = make('label', 'Sidebar width ', { class: 'todo-width' });
    const slider = make('input', '', { type: 'range', min: '280', max: '520', step: '10', 'aria-label': 'Trello sidebar width' });
    const storedWidth = Number(saved(widthKey));
    slider.value = String(storedWidth >= 280 && storedWidth <= 520 ? storedWidth : 340);
    host.style.setProperty('--todo-width', slider.value + 'px');
    slider.addEventListener('input', () => {
      host.style.setProperty('--todo-width', slider.value + 'px');
      remember(widthKey, slider.value);
    });
    size.append(slider);
    const liveNote = make('p', 'Live Trello tasks — not a historical snapshot.', { class: 'todo-live-note' });
    const status = make('p', 'Connecting to Trello…', { role: 'status', 'aria-live': 'polite', class: 'todo-status' });
    const sources = make('div', '', { role: 'status', 'aria-live': 'polite', class: 'todo-meeting-sources' });
    const scroll = make('div', '', { class: 'todo-scroll' });
    const sections = make('div', '', { class: 'todo-sections' });
    const detail = make('section', '', { class: 'todo-detail', hidden: '', 'aria-label': 'Task and meeting details' });
    scroll.append(sources, sections, detail);
    panel.append(header, toolbar, size, liveNote, status, scroll);
    aside.append(panel); host.append(show, aside);
    const open = saved(storageKey) !== 'closed';
    function setOpen(value) {
      aside.hidden = !value; show.hidden = value;
      show.setAttribute('aria-expanded', String(value));
      host.classList.toggle('todo-open', value);
      remember(storageKey, value ? 'open' : 'closed');
    }
    setOpen(open);
    show.addEventListener('click', () => { setOpen(true); hide.focus(); });
    hide.addEventListener('click', () => { setOpen(false); show.focus(); });
    let disposed = false;
    const expanded = new Map([['urgent', true], ['today', true]]);
    function render(data, current) {
      const today = dateKey(Date.now());
      const { groups, outstanding } = groupCards(data?.lists || [], today);
      const meetings = meetingViews(groups, current.meetings, today);
      const incomplete = current.meetingLoading || current.meetingError || current.decisionError || !current.meetings ||
        Object.values(current.meetings.sources).some(source => source.status !== 'ok') ||
        current.meetings.candidates?.some(event => event.classification === 'ambiguous') || meetings.conflicts;
      count.textContent = data ? outstanding + ' outstanding · ' + meetings.upcoming.length + (incomplete ? '+' : '') + ' meetings' : 'Trello unavailable';
      sections.replaceChildren();
      const specs = [
        ['urgent', 'URGENT'], ['today', 'DUE TODAY'], ['meetings', 'MEETINGS'],
        ['upcoming', 'UPCOMING DEADLINES'],
        ['todo', 'TO DO'], ['doing', 'DOING'], ['waiting', 'WAITING / FOLLOW-UP'],
        ['doneToday', 'DONE TODAY'], ['doneOther', 'CURRENTLY IN DONE — OTHER / UNVERIFIED'],
        ['completedActive', 'MARKED COMPLETE IN ACTIVE LISTS']
      ];
      for (const [key, name] of specs) {
        if (key === 'doing' && !data?.lists.some(list => list.role === 'doing')) continue;
        if (['doneOther', 'completedActive'].includes(key) && !groups[key].length) continue;
        const box = make('details', '', { class: 'todo-group' });
        box.open = expanded.get(key) === true;
        box.addEventListener('toggle', () => expanded.set(key, box.open));
        const cards = key === 'today' ? todayTasks(groups, today) : groups[key];
        const eventItems = key === 'today' ? meetings.today : key === 'meetings' ? meetings.upcoming : [];
        const size = key === 'meetings' ? eventItems.length : cards.length + eventItems.length;
        const uncertain = (key === 'today' || key === 'meetings') && incomplete;
        box.append(make('summary', name + ' (' + (data || key === 'meetings' ? size : '?') + (uncertain ? '+' : '') + ')'));
        if (key === 'today') box.append(make('p', (data ? cards.length : '?') + ' tasks · ' + eventItems.length +
          (incomplete ? '+ meetings (sources incomplete)' : ' meetings')));
        const list = make('ul', '', { class: 'todo-cards' });
        if (key !== 'meetings') for (const card of cards) list.append(key === 'today' && card.role === 'urgent'
          ? urgentReference(card, detail) : cardNode(card, today, detail));
        for (const meeting of eventItems) list.append(meetingNode(meeting, today, detail, openSession));
        if (key === 'meetings') for (const meeting of meetings.unscheduled) list.append(meetingNode(meeting, today, detail, openSession));
        if (!list.childNodes.length) box.append(make('p', key === 'doneToday'
          ? 'No completion verified today.' : 'No tasks in this section.'));
        else box.append(list);
        if (key === 'meetings' && meetings.unscheduled.length) box.append(make('p', meetings.unscheduled.length + ' Trello meetings have no confirmed start time and are not included in the upcoming count.'));
        if (key === 'meetings' && meetings.conflicts) box.append(make('p', 'Some calendar links match more than one meeting or card; review them in Trello.'));
        sections.append(box);
      }
      detail.hidden = true;
      liveNote.textContent = 'Live Trello tasks — not a historical snapshot. Urgent tasks due today are referenced in both sections.' +
        (week !== (() => { const d = new Date(today + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7); return d.toISOString().slice(0, 10); })()
          ? ' The selected week is different from the current week.' : '');
    }
    const load = () => { refreshData(api); refreshMeetings(api, loadDocuments); };
    load();
    const unsubscribe = subscribe(current => {
      if (disposed || !aside.isConnected) return;
      refresh.disabled = current.loading || current.meetingLoading;
      meetingStatus(sources, current, api, loadDocuments);
      if (current.error) {
        status.setAttribute('role', 'alert');
        status.textContent = 'Trello unavailable: ' + current.error +
          (current.lastRefresh ? ' Last successful refresh: ' + current.lastRefresh + '.' : '');
      } else {
        status.setAttribute('role', 'status');
        status.textContent = current.loading ? 'Refreshing live Trello tasks…' +
          (current.lastRefresh ? ' Last successful refresh: ' + current.lastRefresh : '') :
          current.data ? 'Connected · Last refreshed: ' + current.lastRefresh : 'Connecting to Trello…';
      }
      if (current.data || current.meetings) render(current.data, current);
    });
    refresh.addEventListener('click', load);
    const onVisible = () => {
      if (!aside.isConnected) { dispose(); return; }
      if (!document.hidden) load();
    };
    function dispose() { disposed = true; unsubscribe(); document.removeEventListener('visibilitychange', onVisible); }
    document.addEventListener('visibilitychange', onVisible);
    return dispose;
  }
  const api = { mount, groupCards, todayTasks, meetingViews, meetingNode, meetingStatus, dateKey, dateLabel, make, cardNode, urgentReference, showDetail, showMeetingDetail, subscribe, refreshData, refreshMeetings };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.plannerTodoTrello = api;
})(globalThis);
