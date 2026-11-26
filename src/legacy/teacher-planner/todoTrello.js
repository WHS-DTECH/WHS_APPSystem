const express = require('express');
const { cardLink, hasReadOnlyBoardGrant, createTrelloReader } = require('./trelloRead');

const BOARD = 'QsFC8J3m';
const BOARD_URL = 'https://trello.com/b/QsFC8J3m/school-email-todo';
const excludedTestCards = new Set(['6b07a498a5404bae757ab359', '6b07a49a5c7787a43ecd3efc']);
const ID = /^[0-9a-f]{24}$/i;
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const COLOUR = /^(green|yellow|orange|red|purple|blue|sky|lime|pink|black)(_(light|dark))?$/;
const normalize = value => value.normalize('NFKC').trim().replace(/[\u2013\u2014]/g, '-').replace(/\s+/g, ' ').toUpperCase();
const roles = new Map([
  ['URGENT', 'urgent'], ['TO DO', 'todo'], ['DOING', 'doing'],
  ['WAITING / FOLLOW-UP', 'waiting'], ['MEETINGS / APPOINTMENTS', 'meetings'],
  ['MINED - CURRICULUM UPDATES', 'mined'], ['DONE', 'done'],
  ...['HOLA', 'TIMETABLE', 'DTECH', 'WHĀNAU', 'PPTA', 'MODERATION', 'MISCELLANEOUS']
    .map(name => ['DONE - ' + name, 'filed'])
]);
const activeRoles = new Set(['urgent', 'todo', 'doing', 'waiting', 'meetings']);

function writeCredentials(env) {
  const key = env.TEACHER_PLANNER_TRELLO_API_KEY, token = env.TEACHER_PLANNER_TRELLO_WRITE_TOKEN;
  return /^[0-9a-f]{32}$/i.test(key || '') && /^[A-Za-z0-9_-]{32,512}$/.test(token || '') ? { key, token } : null;
}

function hasWriteBoardGrant(grant, board) {
  return Array.isArray(grant?.permissions) && grant.permissions.some(item => item &&
    typeof item.modelType === 'string' && /^boards?$/i.test(item.modelType) &&
    ['*', board].includes(item.idModel) && item.read === true && item.write === true);
}

function writeGrantStatus(grant, board, now = Date.now()) {
  if (!hasWriteBoardGrant(grant, board)) {
    return { writeAvailable: false, writeStatus: 'permission-unavailable', writeExpiresAt: null };
  }
  if (grant.dateExpires === null) {
    return { writeAvailable: true, writeStatus: 'available', writeExpiresAt: null };
  }
  const expiry = typeof grant.dateExpires === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/i.test(grant.dateExpires)
    ? Date.parse(grant.dateExpires) : NaN;
  if (!Number.isFinite(expiry)) {
    return { writeAvailable: true, writeStatus: 'expiry-unknown', writeExpiresAt: null };
  }
  const writeExpiresAt = new Date(expiry).toISOString();
  if (expiry <= now) return { writeAvailable: false, writeStatus: 'expired', writeExpiresAt };
  return { writeAvailable: true, writeStatus: expiry - now <= 7 * 24 * 60 * 60 * 1000 ? 'expiring-soon' : 'available', writeExpiresAt };
}

function validateLists(lists) {
  if (!Array.isArray(lists) || !lists.every(list => list && ID.test(list.id) &&
      typeof list.name === 'string' && typeof list.closed === 'boolean')) throw new Error('Invalid lists.');
  const selected = lists.filter(list => !list.closed && roles.has(normalize(list.name)));
  const names = selected.map(list => normalize(list.name));
  if (new Set(names).size !== names.length || new Set(selected.map(list => list.id)).size !== selected.length) {
    throw new Error('Ambiguous lists.');
  }
  return selected;
}

function validCardState(card, cardId, boardId) {
  return card && card.id === cardId && card.idBoard === boardId && ID.test(card.idList) &&
    typeof card.name === 'string' && typeof card.closed === 'boolean' && typeof card.dueComplete === 'boolean';
}

async function completionToday(read, card, now = new Date()) {
  if (!card.dueComplete) return { completedAt: null, completionActivity: 'unknown' };
  const dateKey = value => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(value);
  const today = dateKey(now);
  for (let page = 0; page < 10; page++) {
    const actions = await read('cards/' + card.id + '/actions', {
      filter: 'updateCard', fields: 'type,date,data', limit: '100', page: String(page)
    });
    if (!Array.isArray(actions) || !actions.every(action => action && action.type === 'updateCard' &&
      typeof action.date === 'string' && Number.isFinite(Date.parse(action.date)) &&
      action.data && action.data.card && action.data.card.id === card.id)) throw new Error('Invalid card activity.');
    for (const action of actions) {
      if (dateKey(new Date(action.date)) !== today) return { completedAt: null, completionActivity: 'unknown' };
      if (action.data.old && Object.hasOwn(action.data.old, 'dueComplete')) {
        return action.data.old.dueComplete === false && action.data.card.dueComplete === true
          ? { completedAt: action.date, completionActivity: 'verified' }
          : { completedAt: null, completionActivity: 'unknown' };
      }
    }
    if (actions.length < 100) break;
  }
  return { completedAt: null, completionActivity: 'unknown' };
}

function createTodoTrelloRouter({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const router = express.Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.get('/', async (req, res) => {
    const owner = env.TEACHER_PLANNER_TRELLO_OWNER_ID;
    if (!UUID.test(owner || '')) {
      console.warn('ToDo Trello owner is not configured.');
      return res.status(503).json({ error: 'Trello ToDo is not configured for an authorised school account.' });
    }
    if (!req.user || req.user.id !== owner) {
      console.warn('ToDo Trello board access denied.');
      return res.status(403).json({ error: 'Trello ToDo is available only to its authorised school account.' });
    }
    const key = env.TEACHER_PLANNER_TRELLO_API_KEY, token = env.TEACHER_PLANNER_TRELLO_TOKEN;
    if (!/^[0-9a-f]{32}$/i.test(key || '') || !/^[A-Za-z0-9_-]{32,512}$/.test(token || '')) {
      console.warn('ToDo Trello credentials are not configured.');
      return res.status(503).json({ error: 'Trello ToDo needs a read-only key and token configured securely in Render.' });
    }
    let failure = 'Trello ToDo is unavailable. Retry shortly.';
    const read = createTrelloReader({ key, token, fetchImpl });
    try {
      const [board, grant] = await Promise.all([
        read('boards/' + BOARD, { fields: 'id,shortLink,closed' }),
        read('tokens/' + encodeURIComponent(token), { fields: 'permissions' })
      ]);
      if (!board || !ID.test(board.id) || board.shortLink !== BOARD || board.closed !== false) throw new Error('Invalid board.');
      if (!hasReadOnlyBoardGrant(grant, board.id)) {
        failure = 'Trello ToDo requires a read-only board token.';
        throw new Error('Invalid grant.');
      }
      const lists = await read('boards/' + BOARD + '/lists', { filter: 'open', fields: 'id,name,closed' });
      let selected;
      try { selected = validateLists(lists); }
      catch (error) {
        if (error.message === 'Ambiguous lists.') failure = 'Trello ToDo has duplicate list names. Resolve the ambiguity in Trello before refreshing.';
        throw error;
      }
      const names = selected.map(list => normalize(list.name));
      if (!['URGENT', 'TO DO', 'DONE'].every(name => names.includes(name))) {
        failure = 'Trello ToDo requires one URGENT, TO DO and DONE list. Check the board list names.';
        throw new Error('Missing lists.');
      }
      const result = [];
      for (const list of selected) {
        const cards = await read('lists/' + list.id + '/cards', {
          filter: 'open', fields: 'id,idList,idBoard,name,desc,due,start,dueComplete,url,closed,labels,pos'
        });
        if (!Array.isArray(cards) || !cards.every(card => card && ID.test(card.id) &&
          card.idList === list.id && card.idBoard === board.id && typeof card.name === 'string' &&
          typeof card.desc === 'string' && typeof card.closed === 'boolean' &&
          typeof card.dueComplete === 'boolean' && Number.isFinite(card.pos) &&
          Array.isArray(card.labels) && card.labels.every(label => label && typeof label.name === 'string' &&
            (label.color === null || typeof label.color === 'string' && COLOUR.test(label.color))) &&
          ['due', 'start'].every(field => card[field] === null ||
            typeof card[field] === 'string' && Number.isFinite(Date.parse(card[field]))))) throw new Error('Invalid cards.');
        const visibleCards = cards.filter(card => !card.closed && !excludedTestCards.has(card.id) &&
          normalize(card.name) !== 'TEST - CHATGPT TRELLO CONNECTION');
        const mappedCards = [];
        for (const card of visibleCards) {
          let completion = { completedAt: null, completionActivity: 'unknown' };
          if (roles.get(normalize(list.name)) === 'done') {
            try { completion = await completionToday(read, card); }
            catch {
              console.warn('ToDo Trello completion activity unavailable.');
              completion = { completedAt: null, completionActivity: 'unavailable' };
            }
          }
          mappedCards.push({ id: card.id, title: card.name, description: card.desc, due: card.due, start: card.start,
            dueComplete: card.dueComplete, position: card.pos, url: cardLink(card.url),
            labels: card.labels.map(label => ({ name: label.name, color: label.color })), ...completion });
        }
        result.push({
          id: list.id, name: list.name, role: roles.get(normalize(list.name)),
          cards: mappedCards
        });
      }
      let writeAvailable = false;
      let writeStatus = env.TEACHER_PLANNER_TRELLO_WRITE_TOKEN ? 'invalid-configuration' : 'not-configured';
      let writeExpiresAt = null;
      const credentials = writeCredentials(env);
      if (credentials) {
        try {
          const writerRead = createTrelloReader({ ...credentials, fetchImpl });
          const writeGrant = await writerRead('tokens/' + encodeURIComponent(credentials.token), { fields: 'permissions,dateExpires' });
          ({ writeAvailable, writeStatus, writeExpiresAt } = writeGrantStatus(writeGrant, board.id));
          if (!writeAvailable) console.warn('ToDo Trello write permission unavailable.');
        } catch (error) {
          writeStatus = error.status === 401 ? 'expired-or-revoked' : 'permission-check-failed';
          console.warn('ToDo Trello write permission check failed.');
        }
      }
      return res.json({ status: 'ok', boardUrl: BOARD_URL, fetchedAt: new Date().toISOString(), writeAvailable, writeStatus, writeExpiresAt, lists: result });
    } catch (error) {
      if ([401, 403].includes(error.status)) failure = 'Trello permission is missing or its read-only token expired.';
      if (error.status === 429) failure = 'Trello is rate-limiting requests. Wait briefly and retry.';
      console.warn('ToDo Trello read failed.');
      return res.status(502).json({ error: failure });
    }
  });

  const inFlight = new Set();
  router.post('/cards/:id/complete', async (req, res) => {
    const owner = env.TEACHER_PLANNER_TRELLO_OWNER_ID;
    if (!UUID.test(owner || '') || !req.user || req.user.id !== owner) {
      return res.status(403).json({ error: 'Trello completion is available only to its authorised school account.' });
    }
    const cardId = req.params.id, expectedList = req.body?.listId;
    if (!ID.test(cardId) || typeof expectedList !== 'string' || !ID.test(expectedList) ||
        Object.keys(req.body || {}).some(key => key !== 'listId')) {
      return res.status(400).json({ error: 'Invalid card or list identifier.' });
    }
    const credentials = writeCredentials(env);
    if (!credentials) return res.status(503).json({ error: 'Trello completion is unavailable; read-only access remains available.' });
    if (inFlight.has(cardId)) return res.status(409).json({ error: 'This card is already being completed. Refresh before retrying.' });
    inFlight.add(cardId);
    const read = createTrelloReader({ ...credentials, fetchImpl });
    let boardId, doneId, actual;
    try {
      const [board, grant, lists] = await Promise.all([
        read('boards/' + BOARD, { fields: 'id,shortLink,closed' }),
        read('tokens/' + encodeURIComponent(credentials.token), { fields: 'permissions,dateExpires' }),
        read('boards/' + BOARD + '/lists', { filter: 'open', fields: 'id,name,closed' })
      ]);
      if (!board || !ID.test(board.id) || board.shortLink !== BOARD || board.closed !== false ||
          !writeGrantStatus(grant, board.id).writeAvailable) {
        return res.status(503).json({ error: 'Trello write permission is unavailable; read-only access remains available.' });
      }
      boardId = board.id;
      const selected = validateLists(lists);
      const source = selected.find(list => list.id === expectedList);
      const done = selected.find(list => normalize(list.name) === 'DONE');
      if (!source || !(activeRoles.has(roles.get(normalize(source.name))) || normalize(source.name) === 'DONE') || !done) {
        return res.status(409).json({ error: 'The original task list or general DONE list is unavailable. Refresh before retrying.' });
      }
      doneId = done.id;
      const getCard = () => read('cards/' + cardId, { fields: 'id,idBoard,idList,name,closed,dueComplete' });
      actual = await getCard();
      if (!validCardState(actual, cardId, boardId) || actual.closed ||
          normalize(actual.name) === 'TEST - CHATGPT TRELLO CONNECTION') {
        return res.status(409).json({ error: 'This card is not an available operational card on the authorised board.' });
      }
      if (actual.idList !== expectedList && actual.idList !== done.id) {
        return res.status(409).json({ error: 'The card moved to another list. Refresh before retrying.' });
      }
      if (normalize(source.name) === 'DONE' && actual.idList !== done.id) {
        return res.status(409).json({ error: 'The card is no longer in DONE. Refresh before retrying.' });
      }
      const update = async fields => {
        const url = 'https://api.trello.com/1/cards/' + cardId;
        const response = await fetchImpl(url, {
          method: 'PUT', redirect: 'error', signal: AbortSignal.timeout(10000),
          headers: { Accept: 'application/json', 'Content-Type': 'application/json',
            Authorization: `OAuth oauth_consumer_key="${credentials.key}", oauth_token="${credentials.token}"` },
          body: JSON.stringify(fields)
        });
        if (!response.ok) throw new Error('Trello update failed.');
      };
      if (!actual.dueComplete) {
        await update({ dueComplete: true });
        actual = await getCard();
        if (!validCardState(actual, cardId, boardId) || actual.closed || !actual.dueComplete ||
            actual.idList !== expectedList && actual.idList !== done.id) throw new Error('Completion was not verified.');
      }
      if (actual.idList !== done.id) {
        await update({ idList: done.id });
      }
      actual = await getCard();
      if (!validCardState(actual, cardId, boardId) || actual.closed ||
          actual.idList !== done.id || !actual.dueComplete) throw new Error('Trello update was not verified.');
      return res.json({ status: 'ok' });
    } catch {
      console.warn('ToDo Trello completion failed or could not be verified.');
      let cardState = 'unavailable';
      if (boardId) {
        try {
          const card = await read('cards/' + cardId, { fields: 'id,idBoard,idList,name,closed,dueComplete' });
          if (validCardState(card, cardId, boardId)) {
            const location = card.idList === doneId ? 'general DONE' :
              card.idList === expectedList ? 'the original list' : 'another list';
            cardState = (card.closed ? 'archived; ' : '') +
              (card.dueComplete ? 'marked complete' : 'not marked complete') + ' in ' + location;
          }
        } catch { console.warn('ToDo Trello card state could not be retrieved.'); }
      }
      return res.status(502).json({ error: 'Completion could not be verified. Actual card state: ' + cardState +
        '. Refresh and check Trello before retrying.' });
    } finally {
      inFlight.delete(cardId);
    }
  });
  return router;
}

module.exports = { createTodoTrelloRouter, completionToday, writeGrantStatus };
