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
    const make = (tag, text, attrs = {}) => {
      const node = document.createElement(tag);
      if (text) node.textContent = text;
      for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
      return node;
    };
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
    const detail = make('section', '', { class: 'todo-detail', hidden: '', 'aria-label': 'Task details' });
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
    let lastRefresh = '', running = false, disposed = false;
    const expanded = new Map([['urgent', true], ['today', true]]);
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
    function showDetail(card) {
      detail.replaceChildren();
      const heading = make('h3', card.title);
      const close = make('button', 'Close details', { type: 'button' });
      close.addEventListener('click', () => { detail.hidden = true; });
      detail.append(heading, close); labels(detail, card);
      if (card.start) detail.append(make('p', 'Starts: ' + timeLabel(card.start)));
      if (card.due) detail.append(make('p', 'Due: ' + timeLabel(card.due)));
      if (card.completedAt) detail.append(make('p', 'Completed: ' + timeLabel(card.completedAt)));
      detail.append(make('p', card.description || 'No description.', { class: 'todo-description' }),
        make('a', 'Open original Trello card', { href: card.url, target: '_blank', rel: 'noopener noreferrer' }));
      const links = new Set((card.description.match(/https:\/\/[^\s<>"\])]+/g) || []).map(value => value.replace(/[.,;!?]+$/, '')));
      for (const link of links) {
        try {
          const parsed = new URL(link);
          if (parsed.protocol !== 'https:' || parsed.username || parsed.password) continue;
          detail.append(make('p', '', { class: 'todo-source-link' }));
          detail.lastChild.append(make('a', 'Open source link', { href: parsed.href, target: '_blank', rel: 'noopener noreferrer' }));
        } catch { console.warn('An invalid Trello source link was ignored.'); }
      }
      detail.hidden = false;
      detail.scrollIntoView({ block: 'nearest' });
      close.focus();
    }
    function cardNode(card, today) {
      const item = make('li', '', { class: 'todo-card' });
      const row = make('div', '', { class: 'todo-card-heading' });
      const checkbox = make('input', '', { type: 'checkbox', disabled: '', 'aria-label': 'Completion unavailable in read-only mode' });
      checkbox.checked = card.role === 'done' || card.dueComplete;
      const button = make('button', card.title, { type: 'button', class: 'todo-card-title' });
      button.addEventListener('click', () => showDetail(card));
      row.append(checkbox, button); item.append(row); labels(item, card);
      const flags = [];
      if (card.role === 'urgent') flags.push('Urgent');
      if (card.role === 'waiting') flags.push('Waiting / follow-up');
      if (card.role === 'doing') flags.push('Doing');
      if (card.due) flags.push((card.dueDate < today && !card.dueComplete && card.role !== 'done' ? 'Overdue: ' :
        card.dueDate === today ? 'Due today: ' : 'Due: ') + dateLabel(card.due));
      if (card.role === 'done' && card.completionActivity !== 'verified') flags.push(
        card.completionActivity === 'unavailable' ? 'Completion activity unavailable' : 'Completion date not verified');
      if (card.completedAt) flags.push('Completed ' + timeLabel(card.completedAt));
      if (flags.length) item.append(make('p', flags.join(' · '), { class: 'todo-card-flags' }));
      item.append(make('a', 'Open card', { href: card.url, target: '_blank', rel: 'noopener noreferrer' }));
      return item;
    }
    function render(data) {
      const today = dateKey(Date.now());
      const { groups, outstanding } = groupCards(data.lists, today);
      count.textContent = outstanding + ' outstanding';
      sections.replaceChildren();
      const specs = [
        ['urgent', 'URGENT'], ['today', 'DUE TODAY'], ['upcoming', 'UPCOMING DEADLINES'],
        ['todo', 'TO DO'], ['doing', 'DOING'], ['waiting', 'WAITING / FOLLOW-UP'],
        ['doneToday', 'DONE TODAY'], ['doneOther', 'CURRENTLY IN DONE — OTHER / UNVERIFIED'],
        ['completedActive', 'MARKED COMPLETE IN ACTIVE LISTS'], ['meetings', 'MEETINGS / APPOINTMENTS — NOT COUNTED']
      ];
      for (const [key, name] of specs) {
        if (key === 'doing' && !data.lists.some(list => list.role === 'doing')) continue;
        if (['doneOther', 'completedActive', 'meetings'].includes(key) && !groups[key].length) continue;
        const box = make('details', '', { class: 'todo-group' });
        box.open = expanded.get(key) === true;
        box.addEventListener('toggle', () => expanded.set(key, box.open));
        box.append(make('summary', name + ' (' + groups[key].length + ')'));
        const list = make('ul', '', { class: 'todo-cards' });
        for (const card of groups[key]) list.append(cardNode(card, today));
        if (!groups[key].length) box.append(make('p', key === 'doneToday'
          ? 'No completion verified today.' : 'No tasks in this section.'));
        else box.append(list);
        sections.append(box);
      }
      detail.hidden = true;
      liveNote.textContent = 'Live Trello tasks — not a historical snapshot. Cards appear once; urgent takes priority.' +
        (week !== (() => { const d = new Date(today + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7); return d.toISOString().slice(0, 10); })()
          ? ' The selected week is different from the current week.' : '');
    }
    async function load() {
      if (running || disposed) return;
      running = true; refresh.disabled = true;
      status.setAttribute('role', 'status');
      status.textContent = 'Refreshing live Trello tasks…' + (lastRefresh ? ' Last successful refresh: ' + lastRefresh : '');
      try {
        const response = await fetch(api + 'todo-trello', { credentials: 'same-origin', cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Trello is unavailable.');
        if (data.status !== 'ok' || !Array.isArray(data.lists) || !Number.isFinite(Date.parse(data.fetchedAt))) {
          throw new Error('Trello returned an invalid response.');
        }
        if (!aside.isConnected || disposed) return;
        render(data);
        lastRefresh = timeLabel(data.fetchedAt);
        status.textContent = 'Connected · Last refreshed: ' + lastRefresh;
      } catch (error) {
        console.warn('Trello ToDo refresh failed.');
        if (!aside.isConnected || disposed) return;
        count.textContent = 'Unavailable'; sections.replaceChildren(); detail.hidden = true;
        status.setAttribute('role', 'alert');
        status.textContent = 'Trello unavailable: ' + error.message +
          (lastRefresh ? ' Last successful refresh: ' + lastRefresh + '.' : '');
      } finally { running = false; refresh.disabled = false; }
    }
    refresh.addEventListener('click', load);
    const onVisible = () => {
      if (!aside.isConnected) { disposed = true; document.removeEventListener('visibilitychange', onVisible); return; }
      if (!document.hidden) load();
    };
    document.addEventListener('visibilitychange', onVisible);
    load();
  }
  const api = { mount, groupCards, dateKey };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.plannerTodoTrello = api;
})(globalThis);
