((root) => {
  'use strict';
  const responsibilityNames = ['HOLA', 'TIMETABLE', 'DTECH', 'WHĀNAU', 'PPTA', 'MODERATION', 'MISCELLANEOUS', 'ADMINISTRATION'];
  const labelKey = name => name.trim().toLocaleUpperCase('en-NZ');

  function model(data, today) {
    const { groups, outstanding } = root.plannerTodoTrello.groupCards(data.lists, today);
    const active = ['urgent', 'today', 'upcoming', 'todo', 'doing', 'waiting'].flatMap(key => groups[key]);
    const start = new Date(today + 'T00:00:00Z');
    start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7);
    const end = new Date(start); end.setUTCDate(end.getUTCDate() + 6);
    const weekStart = start.toISOString().slice(0, 10), weekEnd = end.toISOString().slice(0, 10);
    const summary = {
      urgent: active.filter(card => card.role === 'urgent').length, outstanding,
      overdue: active.filter(card => card.dueDate && card.dueDate < today).length,
      today: active.filter(card => card.dueDate === today).length,
      week: active.filter(card => card.dueDate >= weekStart && card.dueDate <= weekEnd).length,
      doing: active.filter(card => card.role === 'doing').length,
      waiting: active.filter(card => card.role === 'waiting').length, doneToday: groups.doneToday.length
    };
    const labels = new Map(responsibilityNames.map(name => [name, { name, color: null, count: 0 }]));
    for (const list of data.lists) {
      for (const card of list.cards) {
        for (const label of card.labels) {
          if (!label.name.trim()) continue;
          const key = labelKey(label.name);
          if (!labels.has(key)) labels.set(key, { name: label.name, color: label.color, count: 0 });
          else if (!labels.get(key).color && label.color) labels.get(key).color = label.color;
        }
      }
    }
    for (const card of active) {
      for (const key of new Set(card.labels.map(label => labelKey(label.name)))) {
        if (labels.has(key)) labels.get(key).count++;
      }
    }
    return { groups, active, summary, labels: [...labels.values()] };
  }

  function mount(host, { api }) {
    const shared = root.plannerTodoTrello;
    const { make, cardNode, dateKey } = shared;
    host.className = 'todo-dashboard';
    host.setAttribute('data-planner-navigation', '');
    const heading = make('h2', 'Trello ToDo Dashboard');
    const info = make('p', 'Live Trello tasks — not a historical snapshot. Read-only; completion is unavailable. Summary and responsibility counts cover the whole board; filters and search apply to cards.');
    const toolbar = make('div', '', { class: 'todo-dashboard-toolbar' });
    const refresh = make('button', 'Refresh', { type: 'button' });
    const board = make('a', 'Open Trello board', { href: 'https://trello.com/b/QsFC8J3m/school-email-todo',
      target: '_blank', rel: 'noopener noreferrer' });
    const status = make('p', 'Connecting to Trello…', { role: 'status', 'aria-live': 'polite', class: 'todo-status' });
    toolbar.append(refresh, board); host.append(heading, info, toolbar, status);
    const body = make('div', '', { class: 'todo-dashboard-body' });
    host.append(body);
    let selected = 'ALL', search = '', sort = 'priority', currentData, disposed = false;
    let selectedCard = null;
    const expandedFiled = new Set();
    const expandedGroups = new Set(['urgent', 'todo', 'doing', 'waiting', 'meetings', 'doneToday', 'upcoming']);

    function render(data) {
      currentData = data;
      const today = dateKey(Date.now()), result = model(data, today);
      const selectedId = selectedCard?.id;
      const allCards = data.lists.flatMap(list => list.cards.map(card => ({
        ...card, dueDate: card.due ? dateKey(card.due) : '', role: list.role
      })));
      selectedCard = allCards.find(card => card.id === selectedId) || null;
      body.replaceChildren();
      const summary = make('div', '', { class: 'todo-dashboard-summary', 'aria-label': 'Task summary' });
      for (const [key, text] of [['urgent', 'Urgent'], ['outstanding', 'Outstanding'], ['overdue', 'Overdue'],
        ['today', 'Due today'], ['week', 'Due this week'], ['doing', 'Doing'], ['waiting', 'Waiting / follow-up'],
        ['doneToday', 'Completed today']]) {
        summary.append(make('div', text + ': ' + result.summary[key]));
      }
      body.append(summary);
      const columns = make('div', '', { class: 'todo-dashboard-columns' });
      const left = make('section', '', { class: 'todo-dashboard-column', 'aria-label': 'Responsibilities' });
      const middle = make('section', '', { class: 'todo-dashboard-column', 'aria-label': 'Active tasks' });
      const right = make('section', '', { class: 'todo-dashboard-column', 'aria-label': 'Progress and details' });
      columns.append(left, middle, right); body.append(columns);
      left.append(make('h3', 'Responsibilities'));
      const filters = make('div', '', { class: 'todo-dashboard-filters term-trello-cards' });
      const filterButton = (key, name, count, color) => {
        const button = make('button', name + ' (' + count + ')', { type: 'button', 'aria-pressed': String(selected === key) });
        if (color) button.setAttribute('data-trello-colour', color);
        button.addEventListener('click', () => {
          selected = key; render(currentData);
          host.querySelector('.todo-dashboard-filters button[aria-pressed="true"]').focus();
        });
        filters.append(button);
      };
      filterButton('ALL', 'All', result.summary.outstanding, null);
      for (const label of result.labels) filterButton(labelKey(label.name), label.name, label.count, label.color);
      left.append(filters);
      middle.append(make('h3', 'Active tasks'));
      const controls = make('div', '', { class: 'todo-dashboard-controls' });
      const searchLabel = make('label', 'Search tasks ');
      const searchInput = make('input', '', { type: 'search', 'aria-label': 'Search task titles and descriptions' });
      searchInput.value = search;
      searchInput.addEventListener('input', () => {
        const position = searchInput.selectionStart;
        search = searchInput.value; render(currentData);
        const replacement = host.querySelector('input[type="search"]');
        replacement.focus(); if (position !== null) replacement.setSelectionRange(position, position);
      });
      searchLabel.append(searchInput);
      const sortLabel = make('label', 'Sort ');
      const sortSelect = make('select', '', { 'aria-label': 'Sort tasks' });
      for (const [value, name] of [['priority', 'Priority'], ['due', 'Due date'], ['responsibility', 'Responsibility'], ['position', 'Trello list order']]) {
        sortSelect.append(make('option', name, { value }));
      }
      sortSelect.value = sort;
      sortSelect.addEventListener('change', () => {
        sort = sortSelect.value; render(currentData);
        host.querySelector('select[aria-label="Sort tasks"]').focus();
      });
      sortLabel.append(sortSelect); controls.append(searchLabel, sortLabel); middle.append(controls);
      const matches = card => (selected === 'ALL' || card.labels.some(label => labelKey(label.name) === selected)) &&
        (card.title + '\n' + card.description).toLocaleLowerCase('en-NZ').includes(search.toLocaleLowerCase('en-NZ').trim());
      const compare = (a, b) => {
        if (sort === 'due') return (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || a.position - b.position;
        if (sort === 'responsibility') return (a.labels[0]?.name || '\uffff').localeCompare(b.labels[0]?.name || '\uffff') || a.position - b.position;
        if (sort === 'priority') return Number(!!(b.dueDate && b.dueDate < today)) - Number(!!(a.dueDate && a.dueDate < today)) ||
          (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || a.position - b.position;
        return a.position - b.position;
      };
      const detail = make('section', '', { class: 'todo-detail', hidden: '', 'aria-label': 'Task details' });
      function group(parent, key, title, cards, openSet, emptyText) {
        const box = make('details', '', { class: 'todo-group' });
        box.open = openSet.has(key);
        box.addEventListener('toggle', () => { if (box.open) openSet.add(key); else openSet.delete(key); });
        box.append(make('summary', title + ' (' + cards.length + ')'));
        const list = make('ul', '', { class: 'todo-cards' });
        for (const card of cards) {
          const item = cardNode(card, today, detail, selected => { selectedCard = selected; }, () => { selectedCard = null; });
          list.append(item);
        }
        if (cards.length) box.append(list);
        else box.append(make('p', emptyText || 'No tasks in this section.'));
        parent.append(box);
      }
      for (const [role, title] of [['urgent', 'URGENT'], ['todo', 'TO DO'], ['doing', 'DOING'],
        ['waiting', 'WAITING / FOLLOW-UP'], ['meetings', 'MEETINGS / APPOINTMENTS — NOT COUNTED']]) {
        if (role === 'doing' && !data.lists.some(list => list.role === role)) continue;
        const cards = (role === 'meetings' ? result.groups.meetings : result.active.filter(card => card.role === role))
          .filter(matches).sort(compare);
        group(middle, role, title, cards, expandedGroups);
      }
      right.append(make('h3', 'Progress and details'));
      group(right, 'doneToday', 'DONE TODAY', result.groups.doneToday.filter(matches), expandedGroups, 'No matching completions verified today.');
      group(right, 'doneOther', 'CURRENTLY IN DONE — OTHER / UNVERIFIED', result.groups.doneOther.filter(matches), expandedGroups);
      group(right, 'completedActive', 'MARKED COMPLETE IN ACTIVE LISTS', result.groups.completedActive.filter(matches), expandedGroups);
      const upcoming = result.active.filter(card => card.dueDate && card.dueDate >= today && matches(card))
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.position - b.position);
      const deadlines = make('details', '', { class: 'todo-group' });
      deadlines.open = expandedGroups.has('upcoming');
      deadlines.addEventListener('toggle', () => { if (deadlines.open) expandedGroups.add('upcoming'); else expandedGroups.delete('upcoming'); });
      deadlines.append(make('summary', 'UPCOMING DEADLINES (' + upcoming.length + ')'));
      const deadlineList = make('ul');
      for (const card of upcoming) {
        const item = make('li');
        item.append(make('span', shared.dateLabel(card.due) + ' — '), make('a', card.title, { href: card.url, target: '_blank', rel: 'noopener noreferrer' }));
        deadlineList.append(item);
      }
      if (upcoming.length) deadlines.append(deadlineList); else deadlines.append(make('p', 'No upcoming deadlines.'));
      right.append(deadlines);
      const filed = make('details', '', { class: 'todo-group' });
      filed.open = expandedGroups.has('filed');
      filed.addEventListener('toggle', () => { if (filed.open) expandedGroups.add('filed'); else expandedGroups.delete('filed'); });
      filed.append(make('summary', 'Completed by Responsibility'));
      for (const list of data.lists.filter(list => list.role === 'filed')) {
        const cards = list.cards.map(card => ({ ...card, role: 'filed', dueDate: card.due ? dateKey(card.due) : '' })).filter(matches).sort(compare);
        group(filed, list.id, list.name, cards, expandedFiled);
      }
      if (!data.lists.some(list => list.role === 'filed')) filed.append(make('p', 'No recognised filed DONE lists are available.'));
      right.append(filed, detail);
      if (selectedCard) shared.showDetail(detail, selectedCard, { focus: false, onClose: () => { selectedCard = null; } });
    }
    const load = () => shared.refreshData(api);
    load();
    const unsubscribe = shared.subscribe(current => {
      if (disposed || !host.isConnected) return;
      refresh.disabled = current.loading;
      if (current.error) {
        body.replaceChildren(); status.setAttribute('role', 'alert');
        status.textContent = 'Trello unavailable: ' + current.error +
          (current.lastRefresh ? ' Last successful refresh: ' + current.lastRefresh + '.' : '');
      } else {
        status.setAttribute('role', 'status');
        status.textContent = current.loading ? 'Refreshing live Trello tasks…' +
          (current.lastRefresh ? ' Last successful refresh: ' + current.lastRefresh : '') :
          current.data ? 'Connected · Last refreshed: ' + current.lastRefresh : 'Connecting to Trello…';
        if (current.loading) body.replaceChildren();
        else if (current.data) render(current.data);
      }
    });
    refresh.addEventListener('click', load);
    const onVisible = () => { if (!host.isConnected) dispose(); else if (!document.hidden) load(); };
    function dispose() { disposed = true; unsubscribe(); document.removeEventListener('visibilitychange', onVisible); }
    document.addEventListener('visibilitychange', onVisible);
    return dispose;
  }
  const api = { mount, model };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.plannerTodoDashboard = api;
})(globalThis);
