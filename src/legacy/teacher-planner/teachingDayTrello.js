const express = require('express');
const { slots } = require('./public/session-schema');
const { cardLink, hasReadOnlyBoardGrant, createTrelloReader } = require('./trelloRead');
const ID = /^[0-9a-f]{24}$/;
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const FIELDS = ['schema_version', 'teaching_date', 'session_slot', 'class_key', 'session_type',
  'display_name', 'start_time', 'end_time', 'lesson_title', 'preparation_status', 'home_list'];
const MONDAY_CARDS = {
  '6b02861f8bb8cb32f08f0cc4': { session_slot: 'whanau', class_key: '9WHAU', session_type: 'whanau',
    display_name: '9WHAU - Whanau', start_time: '08:45', end_time: '09:00', lesson_title: 'Whanau' },
  '6b02862264674aeee7f041cb': { session_slot: 'p2', class_key: 'JPI', session_type: 'teaching',
    display_name: 'JPI - JuniorDTECH', start_time: '10:00', end_time: '11:00', lesson_title: 'Binary Piano decoding' }
};

function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    value >= '2000-01-01' && value <= '2100-12-31' &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
function parseMetadata(description) {
  const fail = message => { throw new Error(message); };
  const starts = description.match(/^```whs-teaching-session[^\r\n]*\r?$/gm) || [];
  if (starts.length !== 1) fail('Exactly one versioned session metadata block is required.');
  const block = /^```whs-teaching-session-v1\r?\n([\s\S]*?)^```[ \t]*\r?$/m.exec(description);
  if (!block) fail('Use the whs-teaching-session-v1 fenced block.');
  let metadata;
  try { metadata = JSON.parse(block[1]); }
  catch { fail('The metadata block is not valid JSON.'); }
  if (!metadata || Array.isArray(metadata) || Object.keys(metadata).sort().join(',') !== [...FIELDS].sort().join(',') ||
    metadata.schema_version !== 1) fail('Use schema_version 1 and exactly the documented fields.');
  if (!validDate(metadata.teaching_date)) fail('teaching_date must be a valid YYYY-MM-DD date.');
  if (!slots.some(slot => slot[0] === metadata.session_slot)) fail('session_slot must be whanau or p1-p5.');
  if (!['teaching', 'whanau'].includes(metadata.session_type) ||
    (metadata.session_slot === 'whanau') !== (metadata.session_type === 'whanau')) fail('Only teaching and Whanau sessions with matching slots are supported.');
  if (typeof metadata.class_key !== 'string' || !/^[A-Z0-9][A-Z0-9_-]{0,39}$/.test(metadata.class_key)) fail('class_key must be the exact uppercase timetable class reference.');
  for (const field of ['display_name', 'lesson_title', 'preparation_status']) {
    if (typeof metadata[field] !== 'string' || !metadata[field].trim() || metadata[field].length > 200) fail(field + ' must contain at most 200 characters.');
  }
  const time = value => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
  if (!time(metadata.start_time) || !time(metadata.end_time) || metadata.start_time >= metadata.end_time) fail('Use increasing NZ-local start_time/end_time values in HH:mm format.');
  if (typeof metadata.home_list !== 'string' || !ID.test(metadata.home_list)) fail('home_list must be a Trello list ID.');
  return { metadata, description: (description.slice(0, block.index) + description.slice(block.index + block[0].length)).trim() };
}
function resourceLinks(description) {
  return [...description.matchAll(/\[([^\]\r\n]{1,200})\]\((https:\/\/[^\s)]+)\)/g)].flatMap(match => {
    try {
      const url = new URL(match[2]);
      if (url.username || url.password || url.href.length > 2048) throw new Error('Unsafe resource link.');
      return [{ name: match[1], url: url.href }];
    } catch { console.warn('Teaching Day Trello ignored an invalid resource link.'); return []; }
  });
}
function createTeachingDayTrelloRouter({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const router = express.Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.get('/:date', async (req, res) => {
    if (!validDate(req.params.date)) {
      console.warn('Teaching Day Trello date rejected.');
      return res.status(400).json({ error: 'Choose a valid teaching date from 2000 to 2100.' });
    }
    const owner = env.TEACHER_PLANNER_TRELLO_OWNER_ID;
    if (!UUID.test(owner || '')) {
      console.warn('Teaching Day Trello owner is not configured.');
      return res.status(503).json({ error: 'Current Teaching Day is not configured. Planner Notes are unchanged.' });
    }
    if (req.user?.id !== owner) {
      console.warn('Teaching Day Trello access denied.');
      return res.status(403).json({ error: 'This teaching board is available only to its authorised school account.' });
    }
    const boardId = env.TEACHER_PLANNER_TEACHING_TRELLO_BOARD_ID, listId = env.TEACHER_PLANNER_TEACHING_TRELLO_LIST_ID;
    if (!boardId && !listId) return res.json({ status: 'not_configured', cards: [], issues: [],
      message: 'Current Teaching Day is not configured. Planner Notes are unchanged.' });
    if (!ID.test(boardId || '') || !ID.test(listId || '')) {
      console.warn('Teaching Day Trello source IDs are invalid.');
      return res.status(503).json({ error: 'Configure both Teaching Planner board and CURRENT TEACHING DAY list IDs in Render.' });
    }
    const key = env.TEACHER_PLANNER_TRELLO_API_KEY, token = env.TEACHER_PLANNER_TRELLO_TOKEN;
    if (!/^[0-9a-f]{32}$/i.test(key || '') || !/^[A-Za-z0-9_-]{32,512}$/.test(token || '')) {
      console.warn('Teaching Day Trello read credentials are not configured.');
      return res.status(503).json({ error: 'Current Teaching Day needs server-side, read-only Trello credentials.' });
    }
    try {
      const read = createTrelloReader({ key, token, fetchImpl });
      const [board, grant] = await Promise.all([
        read('boards/' + boardId, { fields: 'id,closed' }),
        read('tokens/' + encodeURIComponent(token), { fields: 'permissions' })
      ]);
      if (board?.id !== boardId || board.closed !== false) throw new Error('The configured teaching board is unavailable.');
      if (!hasReadOnlyBoardGrant(grant, boardId)) return res.status(403).json({ error: 'A read-only token authorised for this teaching board is required. Write-capable tokens are rejected.' });
      const list = await read('lists/' + listId, { fields: 'id,idBoard,name,closed' });
      if (list?.id !== listId || list.idBoard !== boardId || list.closed !== false ||
        typeof list.name !== 'string' || list.name.trim().toUpperCase() !== 'CURRENT TEACHING DAY') {
        return res.status(409).json({ error: 'The configured active list must be CURRENT TEACHING DAY on the configured Teaching Planner board. No other list was selected.' });
      }
      const source = await read('lists/' + listId + '/cards', { filter: 'open', fields: 'id,idList,name,desc,url,closed,dateLastActivity' });
      if (!Array.isArray(source) || source.length > 200 || !source.every(card =>
        card && ID.test(card.id) && card.idList === listId && typeof card.closed === 'boolean' &&
        typeof card.name === 'string' && card.name.length <= 1000 &&
        typeof card.desc === 'string' && card.desc.length <= 64000 &&
        typeof card.url === 'string' && typeof card.dateLastActivity === 'string' && Number.isFinite(Date.parse(card.dateLastActivity)))) {
        throw new Error('The teaching list returned invalid card data.');
      }
      const issues = [], candidates = [];
      for (const card of source.filter(card => !card.closed)) {
        const url = cardLink(card.url);
        let parsed;
        try { parsed = parseMetadata(card.desc); }
        catch (error) {
          const monday = req.params.date === '2026-11-23' &&
            boardId === '6b0286099da18b3599a6940e' && listId === '6b02860d27edaa3359a950a5' && MONDAY_CARDS[card.id];
          if (!monday) { issues.push({ cardId: card.id, message: error.message }); continue; }
          parsed = { metadata: { schema_version: 1, teaching_date: '2026-11-23', ...monday,
            preparation_status: 'See card preparation', home_list: listId }, description: card.desc };
        }
        if (parsed.metadata.teaching_date !== req.params.date) continue;
        candidates.push({ id: card.id, name: card.name, url, ...parsed,
          location: parsed.metadata.class_key === 'JPI' ||
            req.params.date === '2026-11-23' && parsed.metadata.class_key === '9WHAU' ? 'CW' : null,
          resources: resourceLinks(parsed.description), updatedAt: card.dateLastActivity });
      }
      const reference = card => [card.metadata.teaching_date, card.metadata.session_slot, card.metadata.class_key].join('|');
      const counts = new Map();
      for (const card of candidates) counts.set(reference(card), (counts.get(reference(card)) || 0) + 1);
      const cards = candidates.filter(card => {
        if (counts.get(reference(card)) === 1) return true;
        issues.push({ cardId: card.id, message: 'Duplicate class/session reference. No corresponding card was guessed.' }); return false;
      }).sort((a, b) => slots.findIndex(slot => slot[0] === a.metadata.session_slot) -
        slots.findIndex(slot => slot[0] === b.metadata.session_slot) || a.metadata.start_time.localeCompare(b.metadata.start_time));
      if (issues.length) console.warn('Teaching Day Trello ignored cards with invalid or ambiguous session metadata.');
      return res.json({ status: cards.length ? 'ok' : 'empty', date: req.params.date,
        listName: list.name, fetchedAt: new Date().toISOString(), cards, issues });
    } catch (error) {
      console.warn('Teaching Day Trello read failed.');
      const message = [401, 403].includes(error.status) ? 'Trello permission is missing or its read-only token expired.' :
        error.status === 429 ? 'Trello is rate-limiting requests. Wait briefly and refresh.' :
          'Current Teaching Day could not be loaded. Retry shortly.';
      return res.status(502).json({ error: message + ' Planner Notes and confirmed progress are unchanged.' });
    }
  });
  router.all('/:date', (_req, res) => res.status(405).set('Allow', 'GET').json({ error: 'Current Teaching Day is read-only. Use GET.' }));
  return router;
}
module.exports = { createTeachingDayTrelloRouter, parseMetadata };
