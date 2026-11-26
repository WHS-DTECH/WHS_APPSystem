((root) => {
  'use strict';
  const responsibilityNames = ['HOLA', 'TIMETABLE', 'DTECH', 'WHĀNAU', 'PPTA', 'MODERATION', 'MISCELLANEOUS', 'ADMINISTRATION'];
  const labelKey = name => name.trim().toLocaleUpperCase('en-NZ');
  const allFilter = '@all', unclassifiedFilter = '@unclassified';

  function responsibilities(card) {
    const keys = new Set((card?.labels || []).map(label => labelKey(label.name)).filter(key => key && key !== 'MEETINGS'));
    if (card?.role === 'meetings') {
      const primary = root.plannerTodoTrello.meetingMetadata(card).responsibility;
      if (primary) keys.add(labelKey(primary));
    }
    if (card?.role === 'filed' && typeof card.listName === 'string') {
      const name = labelKey(card.listName).replace(/[\u2013\u2014]/g, '-').replace(/\s+/g, ' ');
      const match = /^DONE - (.+)$/.exec(name);
      if (match && responsibilityNames.includes(match[1])) keys.add(match[1]);
    }
    return keys;
  }

  function matchesResponsibility(card, selected) {
    if (selected === allFilter) return true;
    const keys = responsibilities(card);
    return selected === unclassifiedFilter ? keys.size === 0 : keys.has(selected);
  }

  function matchesCompletionDate(card, from, to) {
    if (!from && !to) return true;
    if (from && to && from > to) return false;
    if (card.completionActivity !== 'verified' || !card.completedAt || !Number.isFinite(Date.parse(card.completedAt))) return false;
    const day = root.plannerTodoTrello.dateKey(card.completedAt);
    return (!from || day >= from) && (!to || day <= to);
  }

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
      upcoming: groups.upcoming.length,
      week: active.filter(card => card.dueDate >= weekStart && card.dueDate <= weekEnd).length,
      doing: active.filter(card => card.role === 'doing').length,
      waiting: active.filter(card => card.role === 'waiting').length, doneToday: groups.doneToday.length
    };
    const labels = new Map(responsibilityNames.map(name => [name, { name, color: null, count: 0 }]));
    for (const list of data.lists) {
      for (const card of list.cards) {
        if (list.role === 'meetings') {
          const primary = root.plannerTodoTrello.meetingMetadata(card).responsibility;
          if (primary && !labels.has(labelKey(primary))) labels.set(labelKey(primary), { name: primary, color: null, count: 0 });
        }
        for (const label of card.labels) {
          if (!label.name.trim()) continue;
          const key = labelKey(label.name);
          if (key === 'MEETINGS') continue;
          if (!labels.has(key)) labels.set(key, { name: label.name, color: label.color, count: 0 });
          else if (!labels.get(key).color && label.color) labels.get(key).color = label.color;
        }
      }
    }
    for (const card of active) {
      for (const key of responsibilities(card)) {
        if (labels.has(key)) labels.get(key).count++;
      }
    }
    return { groups, active, summary, labels: [...labels.values()],
      unclassified: active.filter(card => responsibilities(card).size === 0).length };
  }

  function mount(host, { api, getCsrf }) {
    const shared = root.plannerTodoTrello;
    shared.configureCompletion(api, getCsrf);
    const { make, cardNode, dateKey } = shared;
    host.className = 'todo-dashboard';
    host.setAttribute('data-planner-navigation', '');
    const heading = make('h2', 'Trello ToDo Dashboard');
    const info = make('p', 'Live Trello tasks — not a historical snapshot. Completion moves cards to general DONE. Responsibility counts show outstanding tasks; filters and search also apply to meetings, MINED alerts and completed work.');
    const toolbar = make('div', '', { class: 'todo-dashboard-toolbar' });
    const refresh = make('button', 'Refresh', { type: 'button' });
    const board = make('a', 'Open Trello board', { href: 'https://trello.com/b/QsFC8J3m/school-email-todo',
      target: '_blank', rel: 'noopener noreferrer' });
    const status = make('p', 'Connecting to Trello…', { role: 'status', 'aria-live': 'polite', class: 'todo-status' });
    toolbar.append(refresh, board); host.append(heading, info, toolbar, status);
    const body = make('div', '', { class: 'todo-dashboard-body' });
    host.append(body);
    let selected = allFilter, search = '', sort = 'priority', currentData, disposed = false;
    let completedFrom = '', completedTo = '', selectedItem = null;
    const expandedFiled = new Set();
    const expandedGroups = new Set(['urgent', 'today']);

    function render(data, current) {
      currentData = data;
      const today = dateKey(Date.now()), result = model(data || { lists: [] }, today);
      const meetings = shared.meetingViews(result.groups, today);
      const hasMeetings = data?.lists.some(list => list.role === 'meetings');
      const hasMined = data?.lists.some(list => list.role === 'mined');
      const allCards = (data?.lists || []).flatMap(list => list.cards.map(card => ({
        ...card, dueDate: card.due ? dateKey(card.due) : '', role: list.role, listName: list.name
      })));
      const selectedCard = selectedItem?.kind === 'card' ? allCards.find(card => card.id === selectedItem.id) : null;
      const selectedMeeting = selectedItem?.kind === 'meeting'
        ? meetings.all.find(event => event.id === selectedItem.id) : null;
      if (selectedItem && !selectedCard && !selectedMeeting) selectedItem = null;
      body.replaceChildren();
      const summary = make('div', '', { class: 'todo-dashboard-summary', 'aria-label': 'Task summary' });
      for (const [key, text] of [['urgent', 'Urgent'], ['outstanding', 'Outstanding'], ['overdue', 'Overdue'],
        ['today', 'Due today'], ['upcoming', 'Upcoming deadlines'], ['week', 'Due this week'],
        ['doing', 'Doing'], ['waiting', 'Waiting / follow-up'],
        ['doneToday', 'Completed today']]) {
        let value = data ? result.summary[key] : 'unavailable';
        if (data && key === 'today') {
          value = result.summary.today + meetings.today.length + result.groups.minedToday.length +
            (hasMeetings && hasMined ? '' : '+?') +
            ' (' + result.summary.today + ' tasks · ' + (hasMeetings ? meetings.today.length : '?') +
            ' meetings · ' + (hasMined ? result.groups.minedToday.length : '?') + ' MINED alerts)';
        } else if (data && key === 'upcoming') {
          value = result.summary.upcoming + result.groups.minedUpcoming.length + (hasMined ? '' : '+?');
        }
        summary.append(make('div', text + ': ' + value));
      }
      summary.append(make('div', 'Upcoming meetings: ' + (hasMeetings ? meetings.upcoming.length : 'unavailable')));
      body.append(summary);
      const columns = make('div', '', { class: 'todo-dashboard-columns' });
      const left = make('section', '', { class: 'todo-dashboard-column', 'aria-label': 'Responsibilities' });
      const middle = make('section', '', { class: 'todo-dashboard-column', 'aria-label': 'Active tasks' });
      const right = make('section', '', { class: 'todo-dashboard-column', 'aria-label': 'Progress and details' });
      columns.append(left, middle, right); body.append(columns);
      left.append(make('h3', 'Responsibilities'));
      const filters = make('div', '', { class: 'todo-dashboard-filters term-trello-cards' });
      const filterButton = (key, name, count, color) => {
        const button = make('button', name + ' (' + (data ? count : '?') + ')', { type: 'button', 'aria-pressed': String(selected === key) });
        if (color) button.setAttribute('data-trello-colour', color);
        button.addEventListener('click', () => {
          selected = key; render(currentData, current);
          host.querySelector('.todo-dashboard-filters button[aria-pressed="true"]').focus();
        });
        filters.append(button);
      };
      filterButton(allFilter, 'All', result.summary.outstanding, null);
      for (const label of result.labels) filterButton(labelKey(label.name), label.name, label.count, label.color);
      filterButton(unclassifiedFilter, 'Unclassified', result.unclassified, null);
      left.append(filters);
      middle.append(make('h3', 'Active tasks'));
      const controls = make('div', '', { class: 'todo-dashboard-controls' });
      const searchLabel = make('label', 'Search tasks ');
      const searchInput = make('input', '', { type: 'search', 'aria-label': 'Search task titles and descriptions' });
      searchInput.value = search;
      searchInput.addEventListener('input', () => {
        const position = searchInput.selectionStart;
        search = searchInput.value; render(currentData, current);
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
        sort = sortSelect.value; render(currentData, current);
        host.querySelector('select[aria-label="Sort tasks"]').focus();
      });
      sortLabel.append(sortSelect); controls.append(searchLabel, sortLabel); middle.append(controls);
      const matches = card => matchesResponsibility(card, selected) &&
        (card.title + '\n' + card.description).toLocaleLowerCase('en-NZ').includes(search.toLocaleLowerCase('en-NZ').trim());
      const listOrder = new Map((data?.lists || []).map((list, index) => [list.role, index]));
      const trelloOrder = (a, b) => (listOrder.get(a.role) ?? 9999) - (listOrder.get(b.role) ?? 9999) ||
        a.position - b.position;
      const compare = (a, b) => {
        if (sort === 'due') return (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || trelloOrder(a, b);
        if (sort === 'responsibility') return (a.labels[0]?.name || '\uffff').localeCompare(b.labels[0]?.name || '\uffff') || trelloOrder(a, b);
        if (sort === 'priority') return Number(!!(b.dueDate && b.dueDate < today)) - Number(!!(a.dueDate && a.dueDate < today)) ||
          (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || trelloOrder(a, b);
        return trelloOrder(a, b);
      };
      const detail = make('section', '', { class: 'todo-detail', hidden: '', 'aria-label': 'Task and meeting details' });
      function group(parent, key, title, cards, openSet, emptyText, events = [], alerts = []) {
        const box = make('details', '', { class: 'todo-group' });
        box.open = openSet.has(key);
        box.addEventListener('toggle', () => { if (box.open) openSet.add(key); else openSet.delete(key); });
        const total = cards.length + events.length + alerts.length;
        const partial = key === 'today' && (!hasMeetings || !hasMined) || key === 'upcoming' && !hasMined;
        const size = !data || key === 'meetings' && !hasMeetings ? '?' : partial ? total + '+?' : total;
        box.append(make('summary', title + ' (' + size + ')'));
        if (key === 'today') box.append(make('p', (data ? cards.length : '?') + ' tasks · ' +
          (hasMeetings ? events.length : '?') + ' meetings · ' + (hasMined ? alerts.length : '?') + ' MINED alerts'));
        const list = make('ul', '', { class: 'todo-cards' });
        for (const card of cards) {
          const onSelect = selected => { selectedItem = { kind: 'card', id: selected.id }; };
          const onClose = () => { selectedItem = null; };
          const item = key === 'today' && card.role === 'urgent'
            ? shared.urgentReference(card, detail, onSelect, onClose) : cardNode(card, today, detail, onSelect, onClose);
          list.append(item);
        }
        const eventNode = event => shared.meetingNode(event, today, detail,
          selected => { selectedItem = { kind: 'meeting', id: selected.id }; }, () => { selectedItem = null; });
        for (const event of events) list.append(eventNode(event));
        if (key === 'meetings' && data && !hasMeetings) box.append(make('p', 'MEETINGS / APPOINTMENTS list unavailable in Trello.'));
        if (list.childNodes.length) box.append(list);
        else if (!data) box.append(make('p', 'Trello data unavailable.'));
        else if (!alerts.length && (key !== 'meetings' || hasMeetings)) box.append(make('p', emptyText ||
          (key === 'meetings' ? 'No meetings in this section.' : 'No tasks in this section.')));
        if (key === 'today' || key === 'upcoming') shared.appendMinedAlerts(box, alerts, hasMined);
        parent.append(box);
      }
      const meetingMatches = event => matchesResponsibility(event.card, selected) &&
        (event.card.title + '\n' + event.card.description + '\n' + event.location)
          .toLocaleLowerCase('en-NZ').includes(search.toLocaleLowerCase('en-NZ').trim());
      for (const [role, title] of [['urgent', 'URGENT'], ['today', 'DUE TODAY'],
        ['meetings', 'MEETINGS'], ['upcoming', 'UPCOMING DEADLINES'],
        ['todo', 'TO DO'], ['doing', 'DOING'], ['waiting', 'WAITING / FOLLOW-UP']]) {
        if (role === 'doing' && !data?.lists.some(list => list.role === role)) continue;
        const cards = (role === 'today' ? shared.todayTasks(result.groups, today) :
          role === 'meetings' ? [] : role === 'upcoming' ? result.groups.upcoming :
          result.active.filter(card => card.role === role && (role === 'urgent' || !['today', 'upcoming'].some(key => result.groups[key].includes(card)))))
          .filter(matches).sort(compare);
        const events = (role === 'today' ? meetings.today : role === 'meetings' ? meetings.all : []).filter(meetingMatches);
        const alerts = (role === 'today' ? result.groups.minedToday :
          role === 'upcoming' ? result.groups.minedUpcoming : []).filter(matches);
        group(middle, role, title, cards, expandedGroups, undefined, events, alerts);
      }
      right.append(make('h3', 'Progress and details'));
      const dateControls = make('div', '', { class: 'todo-dashboard-controls' });
      for (const [name, value] of [['from', completedFrom], ['to', completedTo]]) {
        const label = make('label', 'Completed ' + name + ' ');
        const input = make('input', '', { type: 'date', 'aria-label': 'Completed ' + name });
        input.value = value;
        input.addEventListener('change', () => {
          if (name === 'from') completedFrom = input.value; else completedTo = input.value;
          render(currentData, current);
          host.querySelector('input[aria-label="Completed ' + name + '"]').focus();
        });
        label.append(input); dateControls.append(label);
      }
      right.append(dateControls);
      if (completedFrom || completedTo) {
        right.append(make('p', completedFrom && completedTo && completedFrom > completedTo
          ? 'The completion start date must not be after the end date.'
          : 'Only verified completion dates are included; cards without a verified date are omitted.',
        { role: completedFrom && completedTo && completedFrom > completedTo ? 'alert' : 'status' }));
      }
      const matchesCompleted = card => matches(card) && matchesCompletionDate(card, completedFrom, completedTo);
      group(right, 'doneToday', 'DONE TODAY', result.groups.doneToday.filter(matchesCompleted), expandedGroups, 'No matching completions verified today.');
      group(right, 'doneOther', 'CURRENTLY IN DONE — OTHER / UNVERIFIED', result.groups.doneOther.filter(matchesCompleted), expandedGroups);
      group(right, 'completedActive', 'MARKED COMPLETE IN ACTIVE LISTS', result.groups.completedActive.filter(matchesCompleted), expandedGroups);
      const filed = make('details', '', { class: 'todo-group' });
      filed.open = expandedGroups.has('filed');
      filed.addEventListener('toggle', () => { if (filed.open) expandedGroups.add('filed'); else expandedGroups.delete('filed'); });
      filed.append(make('summary', 'Completed by Responsibility'));
      for (const list of (data?.lists || []).filter(list => list.role === 'filed')) {
        const cards = list.cards.map(card => ({ ...card, role: 'filed', listName: list.name, dueDate: card.due ? dateKey(card.due) : '' })).filter(matchesCompleted).sort(compare);
        group(filed, list.id, list.name, cards, expandedFiled);
      }
      if (!data?.lists.some(list => list.role === 'filed')) filed.append(make('p', data
        ? 'No recognised filed DONE lists are available.' : 'Trello data unavailable.'));
      right.append(filed, detail);
      if (selectedCard && matches(selectedCard) &&
          (!['done', 'filed'].includes(selectedCard.role) && !selectedCard.dueComplete ||
            matchesCompletionDate(selectedCard, completedFrom, completedTo))) {
        shared.showDetail(detail, selectedCard, { focus: false, onClose: () => { selectedItem = null; } });
      } else if (selectedMeeting && meetingMatches(selectedMeeting)) shared.showMeetingDetail(detail, selectedMeeting, {
        focus: false, onClose: () => { selectedItem = null; }
      });
      else if (selectedItem) selectedItem = null;
    }
    const load = () => shared.refreshData(api);
    load();
    const unsubscribe = shared.subscribe(current => {
      if (disposed || !host.isConnected) return;
      refresh.disabled = current.loading;
      if (current.actionError) {
        status.setAttribute('role', 'alert');
        status.textContent = current.actionError + (current.error ? ' Trello refresh unavailable: ' + current.error : '');
      } else if (current.error) {
        status.setAttribute('role', 'alert');
        status.textContent = 'Trello unavailable: ' + current.error +
          (current.lastRefresh ? ' Last successful refresh: ' + current.lastRefresh + '.' : '');
      } else {
        status.setAttribute('role', 'status');
        status.textContent = current.loading ? 'Refreshing live Trello tasks…' +
          (current.lastRefresh ? ' Last successful refresh: ' + current.lastRefresh : '') :
          current.data ? 'Connected · Last refreshed: ' + current.lastRefresh +
            shared.writeConnectionMessage(current.data) : 'Connecting to Trello…';
      }
      if (current.data || !current.loading) render(current.data, current);
    });
    refresh.addEventListener('click', () => { shared.clearActionError(); load(); });
    const onVisible = () => { if (!host.isConnected) dispose(); else if (!document.hidden) load(); };
    function dispose() { disposed = true; unsubscribe(); document.removeEventListener('visibilitychange', onVisible); }
    document.addEventListener('visibilitychange', onVisible);
    return dispose;
  }
  const api = { mount, model, responsibilities, matchesResponsibility, matchesCompletionDate, allFilter, unclassifiedFilter };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.plannerTodoDashboard = api;
})(globalThis);
