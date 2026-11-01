const express = require('express');

const TASKS_SCOPE = 'https://www.googleapis.com/auth/tasks';
const validId = value => typeof value === 'string' && value.length > 0 && value.length <= 1024 &&
  !['.', '..'].includes(value) && !/[\x00-\x20\x7f]/.test(value);
const validDue = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  value >= '2000-01-01' && value <= '2100-12-31' &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

function createGoogleTasksRouter({ ensureConnected, access, unchanged, hasScope, fetchImpl, ErrorType }) {
  const router = express.Router();
  const wrap = handler => async (req, res) => {
    try { await handler(req, res); }
    catch (error) {
      console.error('Private Google Tasks request failed.');
      res.status(error instanceof ErrorType ? error.status : 500).json({
        error: error instanceof ErrorType ? error.message : 'Google Tasks request failed. Refresh tasks before trying again; a change may already have reached Google.'
      });
    }
  };
  async function connection(req) {
    const row = await ensureConnected(req);
    if (!hasScope(row, TASKS_SCOPE)) throw new ErrorType('Enable Google Tasks access in Setup My Planner, then approve the additional permission.', 409);
    const expected = req.method === 'GET' ? req.query.connectionId : req.body?.connectionId;
    if (expected !== row.connection_id) throw new ErrorType('Your Google account changed. Refresh the task connection before continuing.', 409);
    return row;
  }
  async function provider(path, token, { method = 'GET', body, etag } = {}) {
    let response;
    const mutation = method !== 'GET';
    const uncertain = ' Refresh tasks before trying again; the change may already have reached Google. No automatic retry was made.';
    try {
      response = await fetchImpl('https://tasks.googleapis.com/tasks/v1/' + path, {
        method, redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}), ...(etag ? { 'If-Match': etag } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {})
      });
    } catch { throw new ErrorType('Google Tasks could not be reached.' + (mutation ? uncertain : ' Refresh to retry.')); }
    if (!response.ok) {
      if (response.status === 403) throw new ErrorType('Google denied Tasks access. Check Tasks API setup, consent and school administrator approval.', 403);
      if (response.status === 401) throw new ErrorType('Google Tasks access expired or was revoked. Reconnect from Setup My Planner.', 409);
      if (response.status === 404) throw new ErrorType('This task or list is no longer available. Refresh your task lists.', 404);
      if (response.status === 412) throw new ErrorType('This task changed in Google. Refresh tasks before updating it again.', 409);
      if (response.status === 400) throw new ErrorType('Google rejected this task. Check the title, notes and date, then refresh tasks.', 400);
      throw new ErrorType('Google Tasks is temporarily unavailable or its request limit was reached.' + (mutation ? uncertain : ' Refresh to retry.'));
    }
    try { return await response.json(); }
    catch { throw new ErrorType('Google Tasks returned an unreadable response.' + (mutation ? uncertain : ' Refresh to retry.')); }
  }
  async function pages(path, token) {
    const items = [];
    let pageToken;
    for (let page = 0; page < 20; page++) {
      const separator = path.includes('?') ? '&' : '?';
      const result = await provider(path + separator + 'maxResults=100' + (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : ''), token);
      if (result.items !== undefined && !Array.isArray(result.items)) throw new ErrorType('Google returned an invalid Tasks list. Refresh to retry.');
      items.push(...(result.items || []));
      if (!result.nextPageToken) return items;
      pageToken = result.nextPageToken;
    }
    throw new ErrorType('This Google Tasks list is too large to load completely. Choose a smaller list; no partial list is displayed.');
  }
  const listPath = req => {
    if (!validId(req.params.listId)) throw new ErrorType('Choose a valid Google task list.', 400);
    return 'lists/' + encodeURIComponent(req.params.listId) + '/tasks';
  };
  router.get('/lists', wrap(async (req, res) => {
    const row = await connection(req);
    const items = await pages('users/@me/lists', await access(row));
    if (!items.every(item => validId(item.id) && typeof item.title === 'string')) throw new ErrorType('Google returned an invalid task list.');
    await unchanged(row);
    res.json({ connectionId: row.connection_id, lists: items.map(({ id, title }) => ({ id, title })) });
  }));
  router.get('/lists/:listId/tasks', wrap(async (req, res) => {
    const path = listPath(req);
    const row = await connection(req);
    const items = await pages(path + '?showCompleted=true&showHidden=true&showDeleted=false', await access(row));
    const tasks = items.filter(item => !item.deleted).map(item => {
      if (!validId(item.id) || typeof item.title !== 'string' || !['needsAction', 'completed'].includes(item.status) ||
          (item.due && !validDue(item.due.slice(0, 10)))) throw new ErrorType('Google returned an invalid task. Refresh to retry.');
      return { id: item.id, title: item.title, notes: item.notes || '', due: item.due?.slice(0, 10) || '',
        status: item.status, parent: item.parent || '', assigned: Boolean(item.assignmentInfo) };
    });
    await unchanged(row);
    res.json({ connectionId: row.connection_id, tasks, fetchedAt: new Date().toISOString() });
  }));
  router.post('/lists/:listId/tasks', wrap(async (req, res) => {
    const path = listPath(req);
    const { title, notes = '', due = '' } = req.body || {};
    if (typeof title !== 'string' || !title.trim() || title.length > 1024 ||
        typeof notes !== 'string' || notes.length > 8192 || (due !== '' && !validDue(due))) {
      throw new ErrorType('Enter a task title (up to 1024 characters), optional notes (up to 8192 characters) and a valid due date.', 400);
    }
    const row = await connection(req), token = await access(row);
    await unchanged(row);
    const created = await provider(path, token, { method: 'POST', body: { title: title.trim(), notes, ...(due ? { due: due + 'T00:00:00.000Z' } : {}) } });
    if (!validId(created.id)) throw new ErrorType('Google did not confirm the new task. Refresh tasks before adding it again; no automatic retry was made.');
    await unchanged(row);
    res.status(201).json({ connectionId: row.connection_id, created: true });
  }));
  router.patch('/lists/:listId/tasks/:taskId', wrap(async (req, res) => {
    if (!validId(req.params.taskId) || typeof req.body?.completed !== 'boolean') throw new ErrorType('Choose a task and whether it is completed.', 400);
    const path = listPath(req) + '/' + encodeURIComponent(req.params.taskId);
    const row = await connection(req), token = await access(row);
    const task = await provider(path, token);
    if (typeof task.etag !== 'string' || !task.etag || /[\r\n]/.test(task.etag)) throw new ErrorType('Google returned no task version. Refresh before changing it.');
    if (task.assignmentInfo) throw new ErrorType('Complete this assigned task in its source Google app. This panel changes only ordinary Google Tasks.', 409);
    await unchanged(row);
    const updated = await provider(path, token, { method: 'PATCH', etag: task.etag, body: req.body.completed ?
      { status: 'completed' } : { status: 'needsAction', completed: null } });
    if (updated.id !== req.params.taskId || updated.status !== (req.body.completed ? 'completed' : 'needsAction')) {
      throw new ErrorType('Google did not confirm the task status. Refresh tasks before changing it again; no automatic retry was made.');
    }
    await unchanged(row);
    res.json({ connectionId: row.connection_id, updated: true });
  }));
  return router;
}

module.exports = { TASKS_SCOPE, createGoogleTasksRouter };
