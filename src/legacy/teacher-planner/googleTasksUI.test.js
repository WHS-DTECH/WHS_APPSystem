const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { renderShell } = require('./shell');
const source = fs.readFileSync(require.resolve('./public/google-tasks.js'), 'utf8');
const planner = fs.readFileSync(require.resolve('./public/planner.js'), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));
const walk = node => [node, ...node.children.flatMap(walk)];
function fixture(setup = false, initialTasks, extraLists = []) {
  const nodes = [];
  function el(tag, text = '', attrs = {}) {
    const node = {
      tag, textContent: text, attrs, dataset: {}, children: [], handlers: {}, isConnected: true,
      value: attrs.value || '', checked: false, disabled: false,
      append(...children) { this.children.push(...children); }, prepend(...children) { this.children.unshift(...children); },
      replaceChildren(...children) { this.children = children; },
      setAttribute(key, value) { this.attrs[key] = value; },
      addEventListener(event, handler) { this.handlers[event] = handler; },
      querySelectorAll(selector) { return walk(this).slice(1).filter(node => selector.split(',').includes(node.tag)); },
      click() { return this.handlers.click?.(); }
    };
    nodes.push(node); return node;
  }
  const context = { confirm: () => true, window: { open: () => ({ opener: {}, location: {}, close() {} }) } };
  vm.runInNewContext(source, context);
  const host = el('section'), requests = [], mutations = [];
  let status = { configured: true, connected: true, tasksEnabled: true, email: 'teacher@fixture.test', connectionId: 'one' };
  let tasks = initialTasks || [
    { id: 'overdue', title: '<img onerror=bad()>', status: 'needsAction', due: '2026-10-01', notes: 'Private note' },
    { id: 'week', title: 'This week', status: 'needsAction', due: '2026-10-23' },
    { id: 'undated', title: 'No date', status: 'needsAction', due: '' },
    { id: 'future', title: 'Future', status: 'needsAction', due: '2026-10-26' },
    { id: 'done', title: 'Done', status: 'completed', due: '' },
    { id: 'assigned', title: 'Assigned', status: 'needsAction', due: '', assigned: true }
  ];
  let failure = false, failedList = '', changedList = '';
  const request = async path => {
    requests.push(path);
    if (!path) return { ...status };
    if (path.startsWith('tasks/lists?')) return { connectionId: status.connectionId, lists: [{ id: 'list', title: 'My tasks' }, ...extraLists] };
    const listId = decodeURIComponent(path.split('/')[2]);
    if (failedList === listId) throw new Error('Task list unavailable.');
    const extra = extraLists.find(list => list.id === listId);
    if (extra) return { connectionId: changedList === listId ? 'different-account' : status.connectionId, tasks: extra.tasks };
    return { connectionId: status.connectionId, tasks };
  };
  context.plannerGoogleTasks.mount(host, {
    el, setup, week: '2026-10-19', request,
    mutate: async (path, method, body) => {
      mutations.push({ path, method, body: JSON.parse(JSON.stringify(body)) });
      if (failure) throw new Error('Uncertain delivery.');
      if (path === 'connect') return { url: 'https://accounts.google.com/fixture' };
      if (method === 'POST') tasks.push({ id: 'new', title: body.title, notes: body.notes, due: body.due, status: 'needsAction' });
      else tasks = tasks.map(task => task.id === path.split('/').pop() ? { ...task, status: body.completed ? 'completed' : 'needsAction' } : task);
      return { connectionId: status.connectionId };
    }
  });
  const byText = text => nodes.find(node => node.textContent === text);
  const byLabel = label => nodes.find(node => node.attrs['aria-label'] === label);
  return { host, context, nodes, requests, mutations, byText, byLabel,
    setStatus: value => { status = value; }, fail: value => { failure = value; },
    failList: value => { failedList = value; }, changeListAccount: value => { changedList = value; } };
}

test('Setup only checks connection and requests optional Tasks consent, never loads a task manager', async () => {
  const f = fixture(true); await flush();
  assert.deepEqual(f.requests, ['']);
  assert.equal(f.byText('Add task').children.length, 0);
  assert.ok(!walk(f.host).some(node => node.textContent === 'Add task'));
  await f.byText('Enable Google Tasks access').handlers.click();
  assert.deepEqual(f.mutations, [{ path: 'connect', method: 'POST', body: { includeTasks: true } }]);
  assert.match(walk(f.host).find(node => node.attrs.role === 'status').textContent, /Check connection/);
});

test('week filtering includes weekend due dates but excludes the next week', () => {
  const f = fixture();
  const tasks = [
    { id: 'sat', title: 'Saturday', due: '2026-10-24', status: 'needsAction' },
    { id: 'sun', title: 'Sunday', due: '2026-10-25', status: 'needsAction' },
    { id: 'next', title: 'Next Monday', due: '2026-10-26', status: 'needsAction' }
  ];
  assert.deepEqual(Array.from(f.context.plannerGoogleTasks.visibleTasks(tasks, '2026-10-19', false, false), task => task.id), ['sat', 'sun']);
});

test('all lists default combines weekly tasks, labels sources and writes to the correct list despite overlapping task IDs', async () => {
  const f = fixture(false, [{ id: 'same', title: 'First list task', due: '2026-10-21', status: 'needsAction' }], [
    { id: 'other/list', title: 'School work', tasks: [
      { id: 'same', title: 'Second list task', due: '2026-10-22', status: 'needsAction' },
      { id: 'future', title: 'Next week task', due: '2026-10-26', status: 'needsAction' }
    ] }
  ]); await flush();
  const list = f.nodes.find(node => node.tag === 'ul'), view = f.byLabel('Google task list');
  assert.equal(view.value, '');
  assert.equal(list.children.length, 2);
  assert.ok(f.byText('List: My tasks'));
  assert.ok(f.byText('List: School work'));
  assert.ok(f.requests.includes('tasks/lists/other%2Flist/tasks?connectionId=one'));
  const second = f.byLabel('Complete Second list task'); second.checked = true;
  await second.handlers.change();
  assert.equal(f.mutations[0].path, 'tasks/lists/other%2Flist/tasks/same');
  view.value = 'list'; view.handlers.change();
  assert.equal(list.children.length, 1);
  const destination = f.byLabel('Add new tasks to');
  destination.value = 'other/list'; destination.handlers.change();
  f.byLabel('New task title').value = 'New school task';
  f.byText('Add task').handlers.click(); await flush();
  assert.equal(f.mutations[1].path, 'tasks/lists/other%2Flist/tasks');
  assert.equal(view.value, 'list', 'new task destination does not change the display filter');
  view.value = ''; view.handlers.change();
  f.byLabel('Show all task dates').checked = true;
  f.byLabel('Show all task dates').handlers.change();
  assert.ok(walk(list).some(node => node.textContent === 'Next week task'));
});

test('a failed or account-mismatched list never presents a partial all-lists view as successful', async () => {
  const f = fixture(false, undefined, [{ id: 'other', title: 'Other', tasks: [
    { id: 'other', title: 'Other task', due: '', status: 'needsAction' }
  ] }]); await flush();
  f.byLabel('New task title').value = 'Keep draft'; f.byLabel('New task title').handlers.input();
  f.failList('other');
  await f.byText('Refresh tasks').handlers.click();
  assert.equal(f.nodes.find(node => node.tag === 'ul').children.length, 0);
  assert.equal(f.byText('Add task').disabled, true);
  assert.match(walk(f.host).find(node => node.attrs.role === 'alert').textContent, /unavailable/);
  assert.equal(f.byLabel('New task title').value, 'Keep draft');
  f.failList(''); f.changeListAccount('other');
  await f.byText('Refresh tasks').handlers.click();
  assert.equal(f.nodes.find(node => node.tag === 'ul').children.length, 0);
  assert.match(walk(f.host).find(node => node.attrs.role === 'alert').textContent, /account changed/);
  f.changeListAccount('');
  await f.byText('Refresh tasks').handlers.click();
  assert.equal(f.byText('Add task').disabled, false);
  assert.ok(f.byLabel('Complete Other task'));
});

test('Weekly panel filters overdue/week/undated tasks, supports all dates and completed, and renders text safely', async () => {
  const f = fixture(); await flush();
  assert.equal(f.mutations.length, 0);
  assert.equal(f.host.dataset.googleCalendar, '');
  assert.ok(f.nodes.some(node => node.tag === 'span' && node.textContent === '<img onerror=bad()>'));
  const list = f.nodes.find(node => node.tag === 'ul');
  assert.equal(list.children.length, 4);
  assert.ok(list.children.every(node => node.attrs.class === 'google-task-card'));
  assert.equal(f.byLabel('Complete Assigned').disabled, true);
  f.byLabel('Show all task dates').checked = true; f.byLabel('Show all task dates').handlers.change();
  assert.equal(list.children.length, 5);
  f.byLabel('Show completed tasks').checked = true; f.byLabel('Show completed tasks').handlers.change();
  assert.equal(list.children.length, 6);
  assert.ok(list.children.some(node => node.attrs.class === 'google-task-card google-task-completed'));
  assert.equal(f.host.dataset.timetableDirty, undefined, 'filters do not dirty Planner notes');
});

test('task cards have distinct active and completed colours without colouring empty messages', async () => {
  const css = fs.readFileSync(require.resolve('./public/planner.css'), 'utf8');
  const active = css.match(/\.google-task-list \.google-task-card \{([^}]+)\}/)[1];
  const completed = css.match(/\.google-task-list \.google-task-card\.google-task-completed \{([^}]+)\}/)[1];
  assert.match(active, /background: #eaf4fc/);
  assert.match(active, /border-left: 4px solid #39749c/);
  assert.match(completed, /background: #f0f4f1/);
  assert.match(css, /\.google-task-completed label span \{ text-decoration: line-through; \}/);
  const f = fixture(false, []); await flush();
  assert.equal(f.byText('No tasks in this view.').attrs.class, undefined);
});

test('adding and completing tasks writes immediately with connection guard, but never submits the planner form', async () => {
  const f = fixture(); await flush();
  f.byLabel('New task title').value = 'Prepare lesson';
  f.byLabel('New task title').handlers.input();
  assert.equal(f.host.dataset.timetableDirty, 'true');
  f.byLabel('Task due date (optional)').value = '2026-10-21';
  f.byLabel('Task notes (optional)').value = 'Bring worksheets';
  f.byText('Add task').handlers.click(); await flush();
  assert.deepEqual(f.mutations[0], { path: 'tasks/lists/list/tasks', method: 'POST',
    body: { connectionId: 'one', title: 'Prepare lesson', due: '2026-10-21', notes: 'Bring worksheets' } });
  assert.equal(f.byLabel('New task title').value, '');
  assert.equal(f.host.dataset.timetableDirty, 'false');
  assert.equal(f.byLabel('New task title').attrs.name, undefined);
  assert.equal(f.byLabel('Task due date (optional)').attrs.type, 'date');
  assert.equal(f.byLabel('Task due date (optional)').attrs.form, '', 'invalid task draft dates cannot block saving unrelated Planner notes');
  const checkbox = f.byLabel('Complete This week'); checkbox.checked = true;
  await checkbox.handlers.change();
  assert.deepEqual(f.mutations[1], { path: 'tasks/lists/list/tasks/week', method: 'PATCH', body: { connectionId: 'one', completed: true } });
  assert.equal(f.byText('Add task').attrs.type, 'button');
});

test('due dates use a calendar, show unambiguous NZ dates and retain ISO dates for Google', async () => {
  const f = fixture(); await flush();
  const due = f.byLabel('Task due date (optional)');
  assert.equal(due.attrs.min, '2000-01-01');
  assert.equal(due.attrs.max, '2100-12-31');
  assert.ok(f.byText('Due 23 October 2026'));
  due.value = '2026-11-04'; due.handlers.change();
  assert.ok(f.byText('Due 4 November 2026'));
  assert.equal(f.host.dataset.timetableDirty, 'true');
  f.byLabel('New task title').value = 'Calendar task';
  f.byText('Add task').handlers.click(); await flush();
  assert.equal(f.mutations[0].body.due, '2026-11-04');
  assert.ok(f.byText('No due date selected.'));
  due.value = '2026-12-05'; due.handlers.input();
  await f.byText('Discard unsent task draft').handlers.click();
  assert.equal(due.value, '');
  assert.ok(f.byText('No due date selected.'));
});

test('incomplete or out-of-range calendar dates stay dirty and cannot be sent to Google', async () => {
  const f = fixture(); await flush();
  const due = f.byLabel('Task due date (optional)');
  due.validity = { valid: false, badInput: true };
  due.handlers.input();
  assert.equal(f.host.dataset.timetableDirty, 'true');
  f.byLabel('New task title').value = 'Incomplete date';
  f.byText('Add task').handlers.click(); await flush();
  assert.equal(f.mutations.length, 0);
  assert.match(walk(f.host).find(node => node.attrs.role === 'alert').textContent, /valid optional due date/);
  due.value = '2101-01-01'; due.validity = { valid: false, badInput: false };
  due.handlers.change();
  assert.ok(f.byText('Choose a valid date between 2000 and 2100.'));
  f.byText('Add task').handlers.click(); await flush();
  assert.equal(f.mutations.length, 0);
});

test('failed task creation retains the draft and disables further mutations until explicit refresh', async () => {
  const f = fixture(); await flush();
  f.byLabel('New task title').value = 'Keep this draft';
  f.byLabel('New task title').handlers.input();
  f.byLabel('Task due date (optional)').value = '2026-11-04';
  f.byLabel('Task due date (optional)').handlers.change();
  f.fail(true); f.byText('Add task').handlers.click(); await flush();
  assert.equal(f.mutations.length, 1);
  assert.equal(f.byText('Add task').disabled, true);
  assert.equal(f.byLabel('New task title').value, 'Keep this draft');
  assert.equal(f.byLabel('Task due date (optional)').value, '2026-11-04');
  assert.ok(f.byText('Due 4 November 2026'));
  assert.match(walk(f.host).find(node => node.attrs.role === 'alert').textContent, /no automatic retry/);
  f.byText('Add task').handlers.click(); await flush();
  assert.equal(f.mutations.length, 1);
  f.fail(false); await f.byText('Refresh tasks').handlers.click();
  assert.equal(f.byText('Add task').disabled, false);
  assert.equal(f.byLabel('New task title').value, 'Keep this draft');
});

test('account switching blocks an unsent draft instead of sending it to another Google account', async () => {
  const f = fixture(); await flush();
  f.byLabel('New task title').value = 'Private original-account draft'; f.byLabel('New task title').handlers.input();
  f.setStatus({ configured: true, connected: true, tasksEnabled: true, email: 'other@fixture.test', connectionId: 'two' });
  await f.byText('Refresh tasks').handlers.click();
  assert.equal(f.byText('Add task').disabled, true);
  assert.equal(f.byLabel('New task title').value, 'Private original-account draft');
  assert.match(walk(f.host).find(node => node.attrs.role === 'alert').textContent, /account changed/);
  await f.byText('Refresh tasks').handlers.click();
  assert.equal(f.byText('Add task').disabled, true);
  f.byText('Discard unsent task draft').handlers.click(); await flush();
  assert.equal(f.byLabel('New task title').value, '');
  assert.equal(f.byText('Add task').disabled, false);
  assert.equal(f.mutations.length, 0);
});

test('shell loads Tasks before planner, manager is weekly-only, and old To do notes retain their saved field', () => {
  const html = renderShell({ baseUrl: '/', coreUrl: '', standalone: false });
  assert.ok(html.indexOf('google-tasks.js') < html.indexOf('framework/planner.js'));
  const week = planner.slice(planner.indexOf('  function renderWeek('), planner.indexOf('  function weeklyTimetableEntries('));
  assert.match(week, /mountGoogleTasks\(taskManager, false\)/);
  assert.match(week, /field\('todos', data\)/);
  assert.match(week, /Planner notes \| Previous To do/);
  const setup = planner.slice(planner.indexOf('  function setupFolder('), planner.indexOf('  function renderSetup('));
  assert.match(setup, /Google Tasks Setup/); assert.match(setup, /mountGoogleTasks\(connection, true\)/);
});
