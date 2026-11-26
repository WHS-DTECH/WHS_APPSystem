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
  const state = { data: null, error: '', lastRefresh: '', loading: false };
  const listeners = new Set();
  let pending;
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

  function meetingMetadata(card) {
    const fields = new Map(), errors = [];
    for (const line of (card.description || '').split(/\r?\n/)) {
      const match = /^(start|end|location|source):\s*(.*?)\s*$/i.exec(line.trim());
      if (!match) continue;
      const key = match[1].toLowerCase();
      if (fields.has(key)) { errors.push('Duplicate ' + key + ' field'); fields.set(key, null); }
      else fields.set(key, match[2]);
    }
    function timestamp(key) {
      const value = fields.get(key);
      if (!value || /^(unspecified|unconfirmed)$/i.test(value)) return null;
      const match = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/i.exec(value);
      const date = match && new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
      if (!match || date.getUTCFullYear() !== Number(match[1]) || date.getUTCMonth() !== Number(match[2]) - 1 ||
          date.getUTCDate() !== Number(match[3]) || !Number.isFinite(Date.parse(value))) {
        errors.push('Invalid ' + key + ' timestamp'); return null;
      }
      return value;
    }
    const start = timestamp('start');
    let end = timestamp('end');
    if (end && (!start || Date.parse(end) < Date.parse(start))) {
      errors.push('End requires a valid earlier start'); end = null;
    }
    let url = null;
    const source = fields.get('source');
    if (source && !/^unspecified$/i.test(source)) {
      try {
        const parsed = new URL(source);
        if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('Invalid source');
        url = parsed.href;
      } catch { errors.push('Invalid source URL'); }
    }
    return { start, end, location: fields.get('location') || '', url, errors };
  }

  function meetingViews(groups, today) {
    const all = groups.meetings.map(card => {
      const metadata = meetingMetadata(card);
      return { id: card.id, card, ...metadata, date: metadata.start ? dateKey(metadata.start) : '' };
    }).sort((a, b) => a.start && b.start ? Date.parse(a.start) - Date.parse(b.start) || a.card.position - b.card.position :
      a.start ? -1 : b.start ? 1 : a.card.position - b.card.position);
    return { all, upcoming: all.filter(meeting => meeting.date >= today),
      today: all.filter(meeting => meeting.date === today) };
  }

  function showMeetingDetail(detail, meeting, { focus = true, onClose = () => {} } = {}) {
    showDetail(detail, meeting.card, { focus: false, onClose });
    detail.append(make('p', meeting.start ? 'Scheduled: ' + timeLabel(meeting.start) +
      (meeting.end ? ' – ' + timeLabel(meeting.end) : '') : 'Meeting time not confirmed.'));
    if (meeting.location) detail.append(make('p', 'Location: ' + meeting.location));
    if (meeting.errors.length) detail.append(make('p', 'Meeting metadata needs review: ' + meeting.errors.join('; ') + '.'));
    if (meeting.url) detail.append(make('a', 'Open original event', {
      href: meeting.url, target: '_blank', rel: 'noopener noreferrer'
    }));
    detail.hidden = false;
    if (focus) {
      detail.scrollIntoView({ block: 'nearest' });
      detail.querySelector('button').focus();
    }
  }

  function meetingNode(meeting, today, detail, onSelect = () => {}, onClose = () => {}) {
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
        (meeting.start ? timeLabel(meeting.start) : 'Time not confirmed')));
      return line;
    };
    const item = cardNode(meeting.card, today, detail, () => onSelect(meeting), onClose,
      (_detail, _card, options) => showMeetingDetail(detail, meeting, options));
    item.classList.add('todo-card-meeting');
    item.prepend(indicator());
    if (meeting.end) item.append(make('p', 'Ends: ' + timeLabel(meeting.end)));
    if (meeting.location) item.append(make('p', meeting.location));
    if (meeting.end && Date.parse(meeting.end) < Date.now()) item.append(make('p', 'Ended — attendance not confirmed.'));
    if (meeting.errors.length) item.append(make('p', 'Meeting metadata needs review: ' + meeting.errors.join('; ') + '.'));
    if (meeting.url) item.append(make('a', 'Open original event', { href: meeting.url, target: '_blank', rel: 'noopener noreferrer' }));
    return item;
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

  function mount(host, { api, week }) {
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
    const scroll = make('div', '', { class: 'todo-scroll' });
    const sections = make('div', '', { class: 'todo-sections' });
    const detail = make('section', '', { class: 'todo-detail', hidden: '', 'aria-label': 'Task and meeting details' });
    scroll.append(sections, detail);
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
    function render(data) {
      const today = dateKey(Date.now());
      const { groups, outstanding } = groupCards(data?.lists || [], today);
      const meetings = meetingViews(groups, today);
      const hasMeetings = data?.lists.some(list => list.role === 'meetings');
      count.textContent = data ? outstanding + ' outstanding · ' +
        (hasMeetings ? meetings.upcoming.length : '?') + ' upcoming meetings' : 'Trello unavailable';
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
        const eventItems = key === 'today' ? meetings.today : key === 'meetings' ? meetings.all : [];
        const size = key === 'meetings' ? eventItems.length : cards.length + eventItems.length;
        const sizeLabel = !data || key === 'meetings' && !hasMeetings ? '?' :
          key === 'today' && !hasMeetings ? cards.length + '+?' : size;
        box.append(make('summary', name + ' (' + sizeLabel + ')'));
        if (key === 'today') box.append(make('p', (data ? cards.length : '?') + ' tasks · ' +
          (hasMeetings ? eventItems.length : '?') + ' meetings' +
          (data && !hasMeetings ? ' (Trello meeting list unavailable)' : '')));
        const list = make('ul', '', { class: 'todo-cards' });
        if (key !== 'meetings') for (const card of cards) list.append(key === 'today' && card.role === 'urgent'
          ? urgentReference(card, detail) : cardNode(card, today, detail));
        for (const meeting of eventItems) list.append(meetingNode(meeting, today, detail));
        if (!list.childNodes.length && !data) box.append(make('p', 'Trello data unavailable.'));
        else if (!list.childNodes.length && (key !== 'meetings' || hasMeetings)) box.append(make('p', key === 'doneToday'
          ? 'No completion verified today.' : key === 'meetings' ? 'No meetings in this section.' : 'No tasks in this section.'));
        else box.append(list);
        if (key === 'meetings' && data && !hasMeetings) box.append(make('p', 'MEETINGS / APPOINTMENTS list unavailable in Trello.'));
        sections.append(box);
      }
      detail.hidden = true;
      liveNote.textContent = 'Live Trello tasks — not a historical snapshot. Urgent tasks due today are referenced in both sections.' +
        (week !== (() => { const d = new Date(today + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7); return d.toISOString().slice(0, 10); })()
          ? ' The selected week is different from the current week.' : '');
    }
    const load = () => refreshData(api);
    load();
    const unsubscribe = subscribe(current => {
      if (disposed || !aside.isConnected) return;
      refresh.disabled = current.loading;
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
      if (current.data || !current.loading) render(current.data);
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
  const api = { mount, groupCards, todayTasks, meetingMetadata, meetingViews, meetingNode, dateKey, dateLabel, make, cardNode, urgentReference, showDetail, showMeetingDetail, subscribe, refreshData };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.plannerTodoTrello = api;
})(globalThis);
