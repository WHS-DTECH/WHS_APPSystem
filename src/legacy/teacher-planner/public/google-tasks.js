(() => {
  'use strict';
  function formatDue(value) {
    return new Intl.DateTimeFormat('en-NZ', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
      .format(new Date(value + 'T00:00:00Z'));
  }
  function visibleTasks(tasks, start, showAll, showCompleted) {
    const end = new Date(start + 'T00:00:00Z'); end.setUTCDate(end.getUTCDate() + 6);
    const last = end.toISOString().slice(0, 10);
    return tasks.filter(task => (showCompleted || task.status !== 'completed') &&
      (showAll || !task.due || task.due <= last)).sort((a, b) =>
      Number(a.status === 'completed') - Number(b.status === 'completed') ||
      (a.due || '9999').localeCompare(b.due || '9999') || a.title.localeCompare(b.title));
  }
  function mount(host, { el, request, mutate, week, setup = false }) {
    host.dataset.googleCalendar = '';
    host.className = 'google-tasks';
    host.setAttribute('aria-label', setup ? 'Google Tasks setup' : 'Google Tasks manager');
    const title = el('h3', setup ? 'Google Tasks connection' : 'Hei mahi māku | Google Tasks');
    const account = el('p'), feedback = el('p', 'Checking your Google Tasks connection...', { role: 'status', 'aria-live': 'polite' });
    const actions = el('div', '', { class: 'google-tasks-actions' });
    const refresh = el('button', setup ? 'Check connection / finish sync' : 'Refresh tasks', { type: 'button' });
    const connect = el('button', 'Enable Google Tasks access', { type: 'button' });
    const body = el('div');
    actions.append(refresh);
    if (setup) actions.prepend(connect);
    host.append(title, account, actions, feedback, body);
    if (setup) host.append(el('p', 'Connect your own Google account and approve Google Tasks access. Calendar and Docs use the same private connection; existing permissions are retained when reconnecting. Switching Google accounts also changes the Calendar and Docs account.'),
      el('p', 'Task management appears only on Weekly planner. Google Tasks changes save immediately to Google, not with the planner Save button. No tasks are shared with other staff. Disconnecting the shared Google connection on a Term Calendar page also disconnects Tasks and Docs.'));
    else host.append(el('p', 'Tasks from all your lists are shown by default: overdue, this week’s and undated tasks. Show all dates also includes future weeks. Choose Add new tasks to before adding a task. Changes save immediately to Google; refresh to see changes made elsewhere. Existing To do text is kept below as Planner notes and still uses Save changes.'));
    let connection, lists = [], tasks = [], selectedList = '', busy = false, needsRefresh = false;
    let sequence = 0;
    const select = el('select', '', { 'aria-label': 'Google task list' });
    const destination = el('select', '', { 'aria-label': 'Add new tasks to' });
    const all = el('input', '', { type: 'checkbox', 'aria-label': 'Show all task dates' });
    const completed = el('input', '', { type: 'checkbox', 'aria-label': 'Show completed tasks' });
    const taskList = el('ul', '', { class: 'google-task-list' });
    const draft = el('div', '', { class: 'google-task-draft' });
    const taskTitle = el('input', '', { type: 'text', maxlength: '1024', 'aria-label': 'New task title', placeholder: 'New task title' });
    // Keep incomplete dates out of the surrounding Planner form's validation.
    const due = el('input', '', { type: 'date', form: '', min: '2000-01-01', max: '2100-12-31', 'aria-label': 'Task due date (optional)' });
    const dueLabel = el('label', 'Due date (optional)');
    const dueSummary = el('small', 'No due date selected.', { 'aria-live': 'polite' });
    dueLabel.append(due);
    const notes = el('textarea', '', { rows: '2', maxlength: '8192', 'aria-label': 'Task notes (optional)', placeholder: 'Task notes (optional)' });
    const add = el('button', 'Add task', { type: 'button' });
    const discard = el('button', 'Discard unsent task draft', { type: 'button' });
    const destinationLabel = el('label', 'Add new tasks to'); destinationLabel.append(destination);
    draft.append(destinationLabel, taskTitle, dueLabel, dueSummary, notes, add, discard);
    function message(text, error = false) {
      feedback.textContent = text; feedback.setAttribute('role', error ? 'alert' : 'status');
    }
    function controls() {
      refresh.disabled = busy;
      connect.disabled = busy;
      for (const control of body.querySelectorAll('button,input,select,textarea')) control.disabled = busy;
      add.disabled = busy || needsRefresh || !selectedList;
      select.disabled = busy || needsRefresh;
      for (const control of taskList.querySelectorAll('input')) control.disabled = busy || needsRefresh || control.dataset.assigned === 'true';
      host.dataset.timetableBusy = String(busy);
    }
    function trackDraft() {
      host.dataset.timetableDirty = String(Boolean(taskTitle.value || notes.value || due.value || due.validity?.badInput));
      dueSummary.textContent = due.validity?.valid === false ? 'Choose a valid date between 2000 and 2100.' :
        due.value ? 'Due ' + formatDue(due.value) : 'No due date selected.';
    }
    for (const input of [taskTitle, due, notes]) input.addEventListener('input', trackDraft);
    due.addEventListener('change', trackDraft);
    function check(result) {
      if (result.connectionId !== connection.connectionId) throw new Error('Your Google account changed. Check the connection in Setup My Planner, then refresh tasks.');
    }
    function renderTasks() {
      taskList.replaceChildren();
      const visible = visibleTasks(tasks.filter(task => !select.value || task.listId === select.value), week, all.checked, completed.checked);
      if (!visible.length) taskList.append(el('li', 'No tasks in this view.'));
      for (const task of visible) {
        const item = el('li', '', { class: 'google-task-card' + (task.status === 'completed' ? ' google-task-completed' : '') });
        const label = el('label');
        const checkbox = el('input', '', { type: 'checkbox', 'aria-label': (task.status === 'completed' ? 'Reopen ' : 'Complete ') + (task.title || '(Untitled task)') });
        checkbox.checked = task.status === 'completed'; checkbox.dataset.assigned = String(task.assigned);
        const text = el('span', (task.parent ? '- ' : '') + (task.title || '(Untitled task)'));
        label.append(checkbox, text); item.append(label);
        item.append(el('small', 'List: ' + task.listTitle, { class: 'google-task-source' }));
        if (task.due) item.append(el('small', 'Due ' + formatDue(task.due)));
        if (task.notes) item.append(el('p', task.notes, { class: 'google-task-notes' }));
        if (task.assigned) item.append(el('small', 'Assigned task: manage completion in the source Google app.'));
        checkbox.addEventListener('change', async () => {
          const desired = checkbox.checked;
          checkbox.checked = task.status === 'completed';
          await change('lists/' + encodeURIComponent(task.listId) + '/tasks/' + encodeURIComponent(task.id), 'PATCH', { completed: desired });
        });
        taskList.append(item);
      }
      controls();
    }
    async function loadTasks() {
      tasks = []; taskList.replaceChildren();
      const combined = [];
      for (const list of lists) {
        if (!host.isConnected) return;
        const result = await request('tasks/lists/' + encodeURIComponent(list.id) + '/tasks?connectionId=' + encodeURIComponent(connection.connectionId));
        check(result);
        if (!host.isConnected) return;
        combined.push(...result.tasks.map(task => ({ ...task, listId: list.id, listTitle: list.title || '(Untitled list)' })));
      }
      tasks = combined; renderTasks();
    }
    function renderManager() {
      const previousView = select.value;
      select.replaceChildren(el('option', 'All task lists', { value: '' }),
        ...lists.map(list => el('option', list.title || '(Untitled list)', { value: list.id })));
      select.value = lists.some(list => list.id === previousView) ? previousView : '';
      destination.replaceChildren(...lists.map(list => el('option', list.title || '(Untitled list)', { value: list.id })));
      destination.value = selectedList;
      const listLabel = el('label', 'Show tasks from'); listLabel.append(select);
      const allLabel = el('label', 'Show all dates'); allLabel.prepend(all);
      const completedLabel = el('label', 'Show completed'); completedLabel.prepend(completed);
      body.replaceChildren(listLabel, allLabel, completedLabel, taskList, draft);
      if (!lists.length) body.prepend(el('p', 'No task lists found. Create a list in Google Tasks, then refresh.'));
    }
    async function load() {
      if (busy) return;
      const ticket = ++sequence;
      busy = true; controls(); message('Refreshing your Google Tasks connection...');
      try {
        const status = await request('');
        if (!host.isConnected || ticket !== sequence) return;
        if (connection && connection.connectionId !== status.connectionId && host.dataset.timetableDirty === 'true') {
          tasks = []; taskList.replaceChildren();
          throw new Error('Your Google account changed. Copy your unsent task draft, then choose Discard unsent task draft before refreshing. Nothing was sent to the new account.');
        }
        if (connection?.connectionId !== status.connectionId) { selectedList = ''; select.value = ''; }
        connection = status;
        account.textContent = status.connected ? 'Connected as ' + status.email : 'No Google account connected.';
        if (!status.configured) throw new Error('Google is not configured. Ask the project owner to complete Google setup.');
        if (!status.tasksEnabled) {
          body.replaceChildren(); tasks = []; selectedList = '';
          message(setup ? 'Enable Google Tasks access, approve consent in the Google tab, then choose Check connection / finish sync.' :
            'Connect Google Tasks on the Google Tasks Setup tab in Setup My Planner. Your Planner notes below remain available.');
          return;
        }
        if (setup) { message('Google Tasks is connected. Open Weekly planner to view, add or complete your tasks.'); return; }
        const result = await request('tasks/lists?connectionId=' + encodeURIComponent(status.connectionId));
        check(result);
        if (!host.isConnected) return;
        lists = result.lists;
        if (!lists.some(list => list.id === selectedList)) selectedList = lists[0]?.id || '';
        renderManager();
        await loadTasks();
        needsRefresh = false;
        message('Google Tasks refreshed. Changes save directly to ' + status.email + '.');
      } catch (error) {
        if (!host.isConnected) return;
        tasks = []; taskList.replaceChildren(); needsRefresh = true;
        message(error.message, true);
      } finally { busy = false; if (host.isConnected) controls(); }
    }
    async function change(path, method, data) {
      if (busy || needsRefresh) return;
      busy = true; controls(); message('Saving task to Google...');
      try {
        const result = await mutate('tasks/' + path, method, { ...data, connectionId: connection.connectionId });
        check(result);
        if (method === 'POST') {
          taskTitle.value = notes.value = due.value = ''; trackDraft();
        }
        if (!host.isConnected) return;
        await loadTasks();
        message('Saved to Google Tasks.');
      } catch (error) {
        if (host.isConnected) {
          needsRefresh = true;
          message(error.message + ' Refresh tasks to check the result before making another change. Your unsent draft is kept; no automatic retry was made.', true);
        }
      } finally { busy = false; if (host.isConnected) controls(); }
    }
    select.addEventListener('change', renderTasks);
    destination.addEventListener('change', () => {
      selectedList = destination.value;
    });
    all.addEventListener('change', renderTasks); completed.addEventListener('change', renderTasks);
    add.addEventListener('click', () => {
      const value = due.value;
      if (!taskTitle.value.trim() || due.validity?.valid === false || (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) ||
          new Date(value).toISOString().slice(0, 10) !== value || value < '2000-01-01' || value > '2100-12-31'))) {
        message('Enter a task title and choose a valid optional due date between 2000 and 2100 using the calendar.', true); return;
      }
      change('lists/' + encodeURIComponent(selectedList) + '/tasks', 'POST', { title: taskTitle.value, notes: notes.value, due: due.value });
    });
    discard.addEventListener('click', () => {
      if (busy || !confirm('Discard this unsent Google task draft? Saved Google tasks and Planner notes will not change.')) return;
      taskTitle.value = notes.value = due.value = ''; trackDraft(); load();
    });
    for (const input of [taskTitle, due]) input.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); add.click(); }
    });
    connect.addEventListener('click', async () => {
      if (busy) return;
      const popup = window.open('about:blank', '_blank', 'width=600,height=750');
      if (!popup) { message('Allow pop-ups for this site, then try connecting again.', true); return; }
      popup.opener = null; busy = true; controls();
      try {
        const result = await mutate('connect', 'POST', { includeTasks: true });
        popup.location.href = result.url;
        message('Approve Google Tasks access in the Google tab. When it says connected, close that tab and choose Check connection / finish sync.');
      } catch (error) { popup.close(); message(error.message, true); }
      finally { busy = false; if (host.isConnected) controls(); }
    });
    refresh.addEventListener('click', load);
    load();
  }
  globalThis.plannerGoogleTasks = { mount, visibleTasks };
})();
