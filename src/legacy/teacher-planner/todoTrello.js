const express = require('express');
const { cardLink, hasReadOnlyBoardGrant, createTrelloReader } = require('./trelloRead');

const BOARD = 'QsFC8J3m';
const BOARD_URL = 'https://trello.com/b/QsFC8J3m/school-email-todo';
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
      if (!Array.isArray(lists) || !lists.every(list => list && ID.test(list.id) &&
          typeof list.name === 'string' && typeof list.closed === 'boolean')) throw new Error('Invalid lists.');
      const selected = lists.filter(list => !list.closed && roles.has(normalize(list.name)));
      const names = selected.map(list => normalize(list.name));
      if (new Set(names).size !== names.length || new Set(selected.map(list => list.id)).size !== selected.length) {
        failure = 'Trello ToDo has duplicate list names. Resolve the ambiguity in Trello before refreshing.';
        throw new Error('Ambiguous lists.');
      }
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
        const visibleCards = cards.filter(card => !card.closed && normalize(card.name) !== 'TEST - CHATGPT TRELLO CONNECTION');
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
      return res.json({ status: 'ok', boardUrl: BOARD_URL, fetchedAt: new Date().toISOString(), lists: result });
    } catch (error) {
      if ([401, 403].includes(error.status)) failure = 'Trello permission is missing or its read-only token expired.';
      if (error.status === 429) failure = 'Trello is rate-limiting requests. Wait briefly and retry.';
      console.warn('ToDo Trello read failed.');
      return res.status(502).json({ error: failure });
    }
  });
  return router;
}

module.exports = { createTodoTrelloRouter, completionToday };
