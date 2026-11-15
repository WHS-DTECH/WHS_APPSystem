(() => {
  'use strict';
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const pretty = date => new Intl.DateTimeFormat('en-NZ', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(date + 'T12:00:00Z'));
  const overlaps = (event, first, last) => event.date <= last && (event.endDate || event.date) >= first;
  async function mount(host, { el, request, year, navigate }) {
    const data = await request('home/' + year);
    const today = data.today, currentYear = Number(today.slice(0, 4)), currentMonth = Number(today.slice(5, 7)) - 1;
    const page = el('section', '', { class: 'assessment-home' });
    const status = el('p', '', { role: 'status', 'aria-live': 'polite' });
    const progress = el('p', '', { class: 'home-progress', 'aria-live': 'polite' });
    const hero = el('header', '', { class: 'home-hero' });
    hero.append(el('span', '', { class: 'home-sparkle', 'aria-hidden': 'true' }),
      el('h2', 'Your assessment year, at a glance'), el('p', 'One clear calendar. One task at a time.'), progress);
    const actions = el('div', '', { class: 'home-actions' }), editor = el('section', '', { class: 'home-editor' });
    editor.hidden = true;
    page.append(hero, status, actions,
      el('p', 'Your task list and personal calendar changes are private. Shared school dates are visible to staff. Print the calendar to share dates with your team.', { class: 'home-privacy' }), editor);
    host.append(page);
    let tasks = data.tasks, events = data.events, schoolEvents = data.schoolEvents, pending, draft = false, editorKind = '', editorControls = {};
    function report(error) { console.error('Assessment homepage operation failed.'); status.textContent = error.message; status.setAttribute('role', 'alert'); }
    function button(label, work, parent, attrs = {}) {
      const control = el('button', label, { type: 'button', ...attrs });
      control.addEventListener('click', async () => {
        control.disabled = true;
        try { await work(); } catch (error) { report(error); } finally { control.disabled = false; }
      });
      parent.append(control); return control;
    }
    async function write(path, body, targetYear = year) {
      if (pending) throw new Error('Wait for the current change to finish saving.');
      pending = request('home/' + targetYear + '/' + path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      try { return await pending; } finally { pending = undefined; }
    }
    function input(parent, key, label, value, type = 'text') {
      const wrapper = el('div', '', { class: 'planner-field' }), id = 'home-' + key;
      const control = el(type === 'textarea' ? 'textarea' : 'input', '', { id, ...(type === 'textarea' ? {} : { type }) });
      control.value = value || '';
      if (type === 'checkbox') control.checked = Boolean(value);
      control.addEventListener('input', () => { draft = true; });
      wrapper.append(el('label', label, { for: id }), control); parent.append(wrapper); editorControls[key] = control;
      return control;
    }
    function closeEditor() { editor.replaceChildren(); editor.hidden = true; draft = false; editorKind = ''; }
    function startEditor(kind) {
      if (draft) throw new Error('Save or cancel the open draft first.');
      editor.replaceChildren(); editor.hidden = false; editorControls = {}; editorKind = kind;
    }
    function openTask(task, event) {
      startEditor('task');
      editor.append(el('h3', task ? 'Edit task' : 'Add a task'));
      input(editor, 'title', 'Task', task?.content.title || event?.title || '').setAttribute('maxlength', '600');
      input(editor, 'due', 'Due date (optional)', task?.content.dueDate || event?.endDate || event?.date || '', 'date');
      input(editor, 'notes', 'Notes (optional)', task?.content.notes || '', 'textarea').setAttribute('maxlength', '8000');
      button('Save task', async () => {
        const content = { title: editorControls.title.value.trim(), dueDate: editorControls.due.value, notes: editorControls.notes.value.trim(),
          completed: Boolean(task?.completed_at), eventId: task?.content.eventId || event?.id || '' };
        const saved = await write('tasks/' + (task?.task_key || crypto.randomUUID()), { content, revision: task?.revision || 0 });
        tasks = [...tasks.filter(item => item.task_key !== saved.task_key), saved]; closeEditor(); renderTasks(); renderHighlights(); renderTimelines(); renderReconciliation();
        status.textContent = 'Task saved.'; status.setAttribute('role', 'status');
      }, editor);
      button('Cancel', closeEditor, editor);
      editorControls.title.focus?.();
    }
    function openEvent(event, shared = false) {
      startEditor(shared ? 'shared school date' : 'date');
      editor.append(el('h3', shared ? (event ? 'Update shared school date' : 'Add shared school date') :
        (event ? 'Update this date' : 'Add a calendar date')));
      if (shared) editor.append(el('p', 'This changes the shared school calendar for everyone. Private changes remain in each person\'s calendar.'));
      input(editor, 'title', 'What needs to happen?', event?.title || '').setAttribute('maxlength', '600');
      input(editor, 'date', 'Date', event?.date || '', 'date');
      input(editor, 'end', 'End date (optional)', event?.endDate || '', 'date');
      input(editor, 'details', 'Instructions (optional)', event?.details || '', 'textarea').setAttribute('maxlength', '8000');
      input(editor, 'confirm', 'Date awaiting confirmation', event?.needsConfirmation || false, 'checkbox');
      if (shared) {
        input(editor, 'source-document', 'Source document (optional)', event?.sourceDocument || '').setAttribute('maxlength', '600');
        input(editor, 'source-deadline', 'Deadline extracted from source (optional)', event?.sourceDeadline || '', 'textarea').setAttribute('maxlength', '2000');
      }
      button('Save date', async () => {
        const content = { title: editorControls.title.value.trim(), date: editorControls.date.value, endDate: editorControls.end.value,
          details: editorControls.details.value.trim(), needsConfirmation: editorControls.confirm.checked,
          ...(shared ? { sourceDocument: editorControls['source-document'].value.trim(),
            sourceDeadline: editorControls['source-deadline'].value.trim() } : {}) };
        const id = event?.id || (shared ? 'whs-' : '') + crypto.randomUUID();
        const saved = await write((shared ? 'school-calendar/' : 'calendar/') + id, { content, revision: event?.revision || 0 },
          event ? Number(event.date.slice(0, 4)) : year);
        const updated = { ...content, id, revision: saved.revision };
        if (shared) schoolEvents = [...schoolEvents.filter(item => item.id !== id), updated].sort((a, b) => a.date.localeCompare(b.date));
        if (!shared || !events.some(item => item.id === id && item.privateOverride)) {
          events = [...events.filter(item => item.id !== id),
            { ...updated, ...(shared ? { revision: 0 } : {}),
              ...(!shared && id.startsWith('whs-') ? { privateOverride: true } : {}) }].sort((a, b) => a.date.localeCompare(b.date));
        }
        closeEditor(); renderCalendar(); renderHighlights(); renderTimelines(); renderReconciliation();
        status.textContent = shared ? 'Shared school date saved.' :
          'Calendar date saved for you. Task dates you set yourself can be edited in your task list.';
        status.setAttribute('role', 'status');
        await navigate('', 'home');
      }, editor);
      button('Cancel', closeEditor, editor);
      editorControls.title.focus?.();
      if (shared) editor.scrollIntoView?.({ block: 'start' });
    }
    function print(mode) {
      const details = [...page.querySelectorAll('details')], open = details.map(item => item.open);
      details.forEach(item => { item.open = true; });
      document.body.classList.add('home-print-' + mode);
      try { globalThis.print(); }
      finally { document.body.classList.remove('home-print-' + mode); details.forEach((item, i) => { item.open = open[i]; }); }
    }
    button('Add a task', () => openTask(), actions);
    button('Add a calendar date', () => openEvent(), actions);
    button('Refresh calendar & tasks', async () => {
      if (draft) throw new Error('Save or cancel your draft before refreshing.');
      await navigate('', 'home');
    }, actions);
    button('Print calendar', () => print('calendar'), actions);
    button('Print task list', () => print('tasks'), actions);
    if (data.warning) {
      const warning = el('p', data.warning, { role: 'alert', class: 'home-warning' });
      page.append(warning);
    }
    const highlights = el('section', '', { class: 'home-highlights', 'aria-label': 'This month and next month' });
    const taskPanel = el('section', '', { class: 'home-tasks', 'aria-label': 'My task list' });
    const calendar = el('section', '', { class: 'home-calendar', 'aria-label': 'Full year calendar' });
    const dayPanel = el('section', '', { class: 'home-day-details', tabindex: '-1', 'aria-live': 'polite' });
    const historyPanel = el('section', '', { class: 'home-history' });
    const sources = el('section', '', { class: 'home-source-links', 'aria-label': 'Assessment timelines' });
    const reconciliation = el('section', '', { class: 'home-reconciliation', 'aria-label': 'Deadline reconciliation' });
    const bottom = el('div', '', { class: 'home-bottom' });
    const overview = el('div', '', { class: 'home-overview' });
    overview.append(taskPanel, highlights);
    bottom.append(historyPanel, sources);
    page.append(overview, calendar, dayPanel, bottom, reconciliation);
    let nextYearEvents = [];
    if (year === currentYear && currentMonth === 11 && year < 2100) {
      const next = await request('home/' + (year + 1) + '/calendar');
      nextYearEvents = next.events;
      if (next.warning) highlights.append(el('p', next.warning, { role: 'alert' }));
      data.nextWarning = next.warning;
    }
    function eventCard(event, parent, showTaskStar = false) {
      const tracked = tasks.some(task => task.kind === 'manual' && task.content.eventId === event.id);
      const card = el('article', '', { class: 'home-event' + (event.id.startsWith('whs-') ? ' home-event-school' : '') +
        (event.needsConfirmation ? ' home-event-check' : '') });
      const heading = el('div', '', { class: 'home-event-heading' });
      heading.append(el('strong', pretty(event.date) + (event.endDate ? ' - ' + pretty(event.endDate) : '')));
      if (showTaskStar && tracked) heading.append(el('span', '\u2605', { class: 'home-event-star', role: 'img',
        'aria-label': 'On my task list', title: 'On my task list' }));
      card.append(heading, el('p', event.title));
      if (event.needsConfirmation) card.append(el('p', 'Awaiting confirmation', { class: 'home-date-note' }));
      if (event.privateOverride) card.append(el('p', 'Your private change overrides the shared school date.', { class: 'home-date-note' }));
      if (event.endDate && event.date <= today && event.endDate >= today) card.append(el('span', 'In progress', { class: 'home-chip' }));
      const detail = el('details'), summary = el('summary', 'Details');
      detail.append(summary);
      if (event.details) detail.append(el('p', event.details));
      button('Update date', () => openEvent(event), detail);
      const add = button(tracked ? 'On my task list' : 'Add to my tasks', () => openTask(undefined, event), detail);
      add.disabled = tracked;
      card.append(detail); parent.append(card);
    }
    function renderHighlights() {
      highlights.replaceChildren(el('h3', 'Key dates coming up'));
      if (year !== currentYear) {
        highlights.append(el('p', 'You are viewing ' + year + '. Choose ' + currentYear + ' to see this month and next month.')); return;
      }
      const grid = el('div', '', { class: 'home-highlight-grid' });
      for (const offset of [0, 1]) {
        const month = (currentMonth + offset) % 12, eventYear = currentYear + (currentMonth + offset > 11 ? 1 : 0);
        const first = eventYear + '-' + String(month + 1).padStart(2, '0') + '-01';
        const last = eventYear + '-' + String(month + 1).padStart(2, '0') + '-' + new Date(Date.UTC(eventYear, month + 1, 0)).getUTCDate();
        const panel = el('section', '', { class: 'home-month-focus home-focus-' + offset });
        panel.append(el('h4', (offset ? 'Next month: ' : 'This month: ') + months[month] + ' ' + eventYear));
        const matching = [...events, ...nextYearEvents].filter(event => overlaps(event, first, last));
        const upcoming = matching.filter(event => (event.endDate || event.date) >= today);
        if (!upcoming.length) panel.append(el('p', 'No upcoming dates recorded for this month.'));
        for (const event of upcoming) eventCard(event, panel, true);
        const earlier = matching.filter(event => (event.endDate || event.date) < today);
        if (earlier.length) {
          const past = el('details', '', { class: 'home-earlier' }); past.append(el('summary', 'Earlier this month (' + earlier.length + ')'));
          for (const event of earlier) eventCard(event, past, true);
          panel.append(past);
        }
        grid.append(panel);
      }
      highlights.append(grid);
      if (data.nextWarning) highlights.append(el('p', data.nextWarning, { role: 'alert' }));
    }
    function renderTasks() {
      const completed = tasks.filter(task => task.completed_at), remaining = tasks.filter(task => !task.completed_at);
      progress.textContent = tasks.length ? completed.length + ' of ' + tasks.length + ' tasks done. ' + (remaining.length ? 'Keep going, one at a time.' : 'Your list is complete!') : 'Your next step starts with one small task.';
      taskPanel.replaceChildren(el('h3', 'My task list'), el('p', 'Internal moderation ticks itself off when you record moderation. Other tasks are yours to tick.'));
      const todo = el('ul', '', { class: 'home-task-list' }), done = el('ul', '', { class: 'home-task-list' });
      function row(task, parent) {
        const item = el('li', '', { class: 'home-task' + (task.completed_at ? ' home-task-done' : '') });
        const label = el('label'), check = el('input', '', { type: 'checkbox', 'aria-label': task.content.title });
        check.checked = Boolean(task.completed_at); check.disabled = task.kind === 'moderation';
        label.append(check, el('span', task.content.title)); item.append(label);
        if (task.content.dueDate) {
          const overdue = task.content.dueDate < today && !task.completed_at;
          item.append(el('span', (overdue ? 'Date passed: ' : 'Due ') + pretty(task.content.dueDate),
            { class: 'home-task-date' + (overdue ? ' home-task-overdue' : '') }));
        }
        if (task.kind === 'moderation') {
          item.append(el('small', task.completed_at ? 'Automatically ticked' : 'Updates from your moderation sheet'));
          button('Open moderation', () => navigate(task.content.recordId, 'internal'), item);
        } else {
          if (task.content.notes) item.append(el('p', task.content.notes));
          button('Edit task', () => openTask(task), item);
          check.addEventListener('change', async () => {
            const checked = check.checked; check.disabled = true;
            try {
              const saved = await write('tasks/' + task.task_key, { revision: task.revision,
                content: { ...task.content, completed: checked } });
              tasks = tasks.map(item => item.task_key === saved.task_key ? saved : item);
              renderTasks(); renderReconciliation(); status.textContent = checked ? 'Done! Your completion is recorded.' : 'Task reopened. Earlier completion remains in your history.'; status.setAttribute('role', 'status');
            } catch (error) { check.checked = !checked; report(error); }
            finally { check.disabled = false; }
          });
        }
        if (task.completed_at) item.append(el('small', 'Recorded ' + new Date(task.completed_at).toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland' })));
        parent.append(item);
      }
      for (const task of remaining.sort((a, b) => (a.content.dueDate || '9999').localeCompare(b.content.dueDate || '9999'))) row(task, todo);
      if (!remaining.length) todo.append(el('li', tasks.length ? 'Nothing left on your list. Enjoy that ticked-off feeling.' : 'Add a task, or open a moderation record to get started.'));
      taskPanel.append(todo);
      const finished = el('details', '', { class: 'home-completed' }); finished.append(el('summary', 'Completed (' + completed.length + ')'));
      for (const task of completed) row(task, done);
      finished.append(done); taskPanel.append(finished);
    }
    function renderCalendar() {
      calendar.replaceChildren(el('h3', 'Your full-year calendar - ' + year));
      const grid = el('div', '', { class: 'home-year-grid' });
      for (let month = 0; month < 12; month++) {
        const card = el('section', '', { class: 'home-calendar-month' + (year === currentYear && month === currentMonth ? ' home-current-month' : '') +
          (year === currentYear && month === currentMonth + 1 ? ' home-next-month' : ''), 'aria-label': months[month] + ' ' + year });
        card.append(el('h4', months[month]));
        const table = el('table', '', { 'aria-label': months[month] + ' ' + year });
        const head = el('thead'), headings = el('tr');
        for (const day of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) headings.append(el('th', day, { scope: 'col' }));
        head.append(headings); table.append(head);
        const body = el('tbody'), offset = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
        const count = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
        const first = year + '-' + String(month + 1).padStart(2, '0') + '-01';
        const last = first.slice(0, 8) + count;
        const monthEvents = events.filter(event => overlaps(event, first, last));
        for (let week = 0; week < 6; week++) {
          const row = el('tr');
          for (let weekday = 0; weekday < 7; weekday++) {
            const day = week * 7 + weekday - offset + 1, cell = el('td');
            if (day > 0 && day <= count) {
              const date = first.slice(0, 8) + String(day).padStart(2, '0'), matching = monthEvents.filter(event => overlaps(event, date, date));
              if (matching.length) button(String(day), () => {
                dayPanel.replaceChildren(el('h3', pretty(date) + ' ' + year));
                for (const event of matching) eventCard(event, dayPanel);
                dayPanel.focus?.();
              }, cell, { class: 'home-calendar-day home-has-dates' + (date === today ? ' home-today' : ''), 'aria-label': pretty(date) + ': ' + matching.map(event => event.title).join('; ') });
              else cell.append(el('span', String(day), { class: 'home-calendar-day' + (date === today ? ' home-today' : '') }));
            }
            row.append(cell);
          }
          body.append(row);
        }
        table.append(body); card.append(table);
        const list = el('details', '', { class: 'home-month-events' });
        list.append(el('summary', monthEvents.length + (monthEvents.length === 1 ? ' date' : ' dates')));
        for (const event of monthEvents) eventCard(event, list);
        card.append(list); grid.append(card);
      }
      calendar.append(grid);
      if (data.checkedAt) calendar.append(el('p', 'Assessment dates last checked ' + new Date(data.checkedAt).toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland' }), { class: 'home-privacy' }));
    }
    historyPanel.append(el('h3', 'My completion & change history'));
    const history = el('ol'), historyPaging = el('div');
    historyPanel.append(history, historyPaging);
    let historyOffset = 0;
    async function loadHistory(reset = false) {
      if (reset) { historyOffset = 0; history.replaceChildren(); }
      const result = await request('home/' + year + '/history?offset=' + historyOffset);
      for (const entry of result.entries) history.append(el('li',
        new Date(entry.created_at).toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland' }) + ' - ' +
        entry.action.replace(/-/g, ' ') + ': ' + entry.content.title + (entry.content.automatic ? ' (automatic)' : ' (you)')));
      if (!result.entries.length && !historyOffset) history.append(el('li', 'Your saved completions and changes will appear here.'));
      historyOffset += result.entries.length; historyPaging.replaceChildren();
      if (result.more) button('Earlier history', () => loadHistory(), historyPaging);
    }
    button('View / refresh my history', () => loadHistory(true), historyPanel);
    sources.append(el('h3', 'Assessment timelines'));
    const nationalTimeline = el('details', '', { class: 'home-source-timeline' });
    nationalTimeline.append(el('summary', 'NZQA national assessment timeline'));
    const nationalBody = el('div');
    nationalTimeline.append(nationalBody);
    const schoolTimeline = el('details', '', { class: 'home-source-timeline' });
    schoolTimeline.append(el('summary', 'WHS assessment and moderation deadlines'));
    const schoolBody = el('div');
    schoolTimeline.append(schoolBody);
    sources.append(nationalTimeline, schoolTimeline);
    function renderTimelines() {
      nationalBody.replaceChildren(el('p', 'National dates in your ' + year + ' calendar, including your private changes.'));
      nationalBody.append(el('a', 'Open the official NZQA key dates', { href: data.nationalUrl, target: '_blank', rel: 'noopener noreferrer' }));
      if (data.examUrl) {
        const examLink = el('p');
        examLink.append(el('a', 'Open the official NZQA exam and portfolio timetable', { href: data.examUrl, target: '_blank', rel: 'noopener noreferrer' }));
        nationalBody.append(examLink);
      }
      if (data.warning) nationalBody.append(el('p', data.warning, { role: 'alert', class: 'home-warning' }));
      const national = events.filter(event => event.id.startsWith('nzqa-'));
      if (!national.length) nationalBody.append(el('p', 'No national dates are available for this year.'));
      for (const event of national) eventCard(event, nationalBody);
      schoolBody.replaceChildren(el('p', 'Shared school dates for ' + year + '. Your private changes may override these in your calendar.'));
      if (data.canEditSchool) button('Add shared school date', () => openEvent(undefined, true), schoolBody);
      else schoolBody.append(el('p', 'Shared dates are managed by Assessment Manager Lead Teachers and global administrators.'));
      if (!schoolEvents.length) schoolBody.append(el('p', 'No shared school dates have been entered for this year.'));
      for (const event of schoolEvents) {
        const card = el('article', '', { class: 'home-event home-school-source-event' });
        card.append(el('strong', pretty(event.date) + (event.endDate ? ' - ' + pretty(event.endDate) : '')), el('p', event.title));
        if (event.needsConfirmation) card.append(el('p', 'Awaiting confirmation', { class: 'home-date-note' }));
        if (event.details) card.append(el('p', event.details));
        if (events.some(item => item.id === event.id && item.privateOverride)) {
          card.append(el('p', 'Your calendar uses a private change instead of this shared date.', { class: 'home-date-note' }));
        }
        if (data.canEditSchool) button('Edit shared date', () => openEvent(event, true), card);
        schoolBody.append(card);
      }
    }
    function renderReconciliation() {
      reconciliation.replaceChildren(el('h3', 'Deadline reconciliation - ' + year),
        el('p', 'Initial WHS source references come from the supplied 2026 summary and have not been independently verified. Shared dates may also have sources recorded by staff. Tasks are matched only when added from a calendar date.'));
      if (data.warning) reconciliation.append(el('p', data.warning, { role: 'alert', class: 'home-warning' }));
      const wrapper = el('div', '', { class: 'home-reconciliation-scroll', tabindex: '0', 'aria-label': 'Deadline reconciliation table' });
      const table = el('table', '', { class: 'home-reconciliation-table' });
      table.append(el('caption', 'Source deadlines, calendar dates and your linked tasks'));
      const head = el('thead'), headings = el('tr');
      for (const title of ['Source document', 'Deadline extracted', 'Calendar event', 'Classification', 'Personal task status']) {
        headings.append(el('th', title, { scope: 'col' }));
      }
      head.append(headings); table.append(head);
      const body = el('tbody'), national = new Map(data.nationalEvents.map(event => [event.id, event]));
      const school = new Map(schoolEvents.map(event => [event.id, event]));
      const relevant = events.filter(event => event.id.startsWith('nzqa-') || event.id.startsWith('whs-'));
      if (!relevant.length) {
        const row = el('tr'); row.append(el('td', 'No national or school dates are available for this year.', { colspan: '5' })); body.append(row);
      }
      for (const event of relevant) {
        const isNational = event.id.startsWith('nzqa-'), source = (isNational ? national : school).get(event.id);
        const row = el('tr'), documentCell = el('td'), deadlineCell = el('td'), eventCell = el('td');
        if (isNational && source) documentCell.append(el('a', source.sourceUrl ? 'NZQA exam and portfolio timetable' : 'NZQA key assessment dates', {
          href: source.sourceUrl || data.nationalUrl, target: '_blank', rel: 'noopener noreferrer'
        }));
        else documentCell.textContent = isNational ? 'Source not available in the current import' : source?.sourceDocument || 'Not recorded';
        if (isNational && source) {
          deadlineCell.append(el('strong', pretty(source.date) + (source.endDate ? ' - ' + pretty(source.endDate) : '')), el('p', source.title));
        } else deadlineCell.textContent = isNational ? 'Not available' : source?.sourceDeadline || 'Not recorded';
        eventCell.append(el('strong', pretty(event.date) + (event.endDate ? ' - ' + pretty(event.endDate) : '')), el('p', event.title));
        if (event.needsConfirmation) eventCell.append(el('p', 'Awaiting confirmation', { class: 'home-date-note' }));
        if (event.privateOverride || isNational && event.revision > 0) eventCell.append(el('p', 'Personal calendar change', { class: 'home-date-note' }));
        const linked = tasks.filter(task => task.kind === 'manual' && task.content.eventId === event.id);
        const complete = linked.filter(task => task.completed_at).length, remaining = linked.length - complete;
        const taskStatus = linked.length ? [remaining ? remaining + ' to do' : '', complete ? complete + ' completed' : ''].filter(Boolean).join('; ') : 'No linked task';
        row.append(documentCell, deadlineCell, eventCell, el('td', isNational ? 'NZQA' : 'WHS'), el('td', taskStatus));
        body.append(row);
      }
      table.append(body); wrapper.append(table); reconciliation.append(wrapper);
    }
    renderTasks(); renderHighlights(); renderCalendar(); renderTimelines(); renderReconciliation();
    return { saveNow: async () => {
      if (pending) await pending;
      if (draft) throw new Error('Save or cancel your ' + editorKind + ' draft before leaving Home.');
      return true;
    }, hasUnsavedChanges: () => draft || Boolean(pending) };
  }
  globalThis.assessmentHome = { mount };
})();
