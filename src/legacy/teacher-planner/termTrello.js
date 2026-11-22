const express = require('express');
const { cardLink, hasReadOnlyBoardGrant, createTrelloReader } = require('./trelloRead');

const BOARD = 'QsFC8J3m';
const BOARD_URL = 'https://trello.com/b/' + BOARD + '/school-email-todo';
const ID = /^[0-9a-f]{24}$/i;
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const LABEL_COLOUR = /^(green|yellow|orange|red|purple|blue|sky|lime|pink|black)(_(light|dark))?$/;
const listName = (year, term) => `TERM ${term} \u2014 ${year}`;
const normalName = value => value.normalize('NFKC').trim().replace(/[\u2013\u2014]/g, '-').replace(/\s+/g, ' ').toUpperCase();

function createTermTrelloRouter({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const router = express.Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.get('/:year/:term', async (req, res) => {
    const year = Number(req.params.year), term = Number(req.params.term);
    if (!/^\d{4}$/.test(req.params.year) || year < 2000 || year > 2100 || !/^[1-4]$/.test(req.params.term)) {
      console.warn('Term Trello year or term rejected.');
      return res.status(400).json({ error: 'Choose a year from 2000 to 2100 and a term from 1 to 4.' });
    }
    const owner = env.TEACHER_PLANNER_TRELLO_OWNER_ID;
    if (!UUID.test(owner || '')) {
      console.warn('Term Trello owner is not configured.');
      return res.status(503).json({ error: 'Term Trello is not configured. Ask the administrator to configure its authorised school account. Notes are unchanged.' });
    }
    if (!req.user || req.user.id !== owner) {
      console.warn('Term Trello board access denied.');
      return res.status(403).json({ error: 'This Trello board is available only to its authorised school account. Your Notes are unchanged.' });
    }
    const key = env.TEACHER_PLANNER_TRELLO_API_KEY, token = env.TEACHER_PLANNER_TRELLO_TOKEN;
    if (!/^[0-9a-f]{32}$/i.test(key || '') || !/^[A-Za-z0-9_-]{32,512}$/.test(token || '')) {
      console.warn('Term Trello credentials are not configured.');
      return res.status(503).json({ error: 'Term Trello needs a separate read-only Trello key and token configured securely in Render. Notes are unchanged.' });
    }
    let failure = 'Trello could not be loaded. Retry shortly; your Notes are unchanged.';
    const read = createTrelloReader({ key, token, fetchImpl });
    try {
      const [board, grant] = await Promise.all([
        read('boards/' + BOARD, { fields: 'id,shortLink,closed' }),
        read('tokens/' + encodeURIComponent(token), { fields: 'permissions' })
      ]);
      if (!board || !ID.test(board.id) || board.shortLink !== BOARD || board.closed !== false) throw new Error('Invalid Trello board.');
      if (!hasReadOnlyBoardGrant(grant, board.id)) {
        failure = 'Use a Trello token with read permission only, not write or account permissions. Notes are unchanged.';
        throw new Error('Trello token is not read-only.');
      }
      const lists = await read('boards/' + BOARD + '/lists', { filter: 'open', fields: 'id,name,closed' });
      if (!Array.isArray(lists) || !lists.every(item => item && ID.test(item.id) && typeof item.name === 'string' && typeof item.closed === 'boolean')) {
        throw new Error('Invalid Trello lists.');
      }
      const expected = listName(year, term);
      const matches = lists.filter(item => !item.closed && normalName(item.name) === normalName(expected));
      if (matches.length > 1) {
        console.warn('Term Trello matching lists are ambiguous.');
        return res.status(409).json({ error: `More than one active Trello list matches ${expected}. Keep one matching overview list; no list was selected.` });
      }
      const result = { year, term, listName: expected, boardUrl: BOARD_URL, fetchedAt: new Date().toISOString(), cards: [] };
      if (!matches.length) return res.json({ ...result, status: 'missing' });
      const list = matches[0];
      const cards = await read('lists/' + list.id + '/cards', { filter: 'open', fields: 'id,idList,name,desc,due,start,url,closed,labels' });
      if (!Array.isArray(cards) || cards.length > 1000 || !cards.every(card => card && ID.test(card.id) &&
          card.idList === list.id && typeof card.name === 'string' && typeof card.desc === 'string' &&
          typeof card.url === 'string' && typeof card.closed === 'boolean' &&
          Array.isArray(card.labels) && card.labels.every(label => label && typeof label.name === 'string' &&
            (label.color === null || typeof label.color === 'string' && LABEL_COLOUR.test(label.color))) &&
          ['due', 'start'].every(name => card[name] === null || typeof card[name] === 'string' && Number.isFinite(Date.parse(card[name]))))) {
        throw new Error('Invalid Trello cards.');
      }
      result.cards = cards.filter(card => !card.closed).map(card => {
        const description = card.desc.trim().replace(/\s+/g, ' ');
        return { id: card.id, title: card.name, summary: description.length > 400 ? description.slice(0, 397) + '...' : description,
          due: card.due, start: card.start, url: cardLink(card.url),
          labels: card.labels.map(label => ({ name: label.name, color: label.color })) };
      });
      return res.json({ ...result, status: result.cards.length ? 'ok' : 'empty' });
    } catch (error) {
      if ([401, 403].includes(error.status)) failure = 'Trello permission is missing or its token expired. Renew the read-only token in Render; Notes are unchanged.';
      if (error.status === 429) failure = 'Trello is rate-limiting requests. Wait briefly and retry; Notes are unchanged.';
      console.warn('Term Trello read failed.');
      return res.status(502).json({ error: failure });
    }
  });
  return router;
}

module.exports = { createTermTrelloRouter };
