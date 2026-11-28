const express = require('express');
const { createHash } = require('node:crypto');
const { cardLink, hasReadOnlyBoardGrant, createTrelloReader } = require('./trelloRead');
const { writeGrantStatus } = require('./todoTrello');

const ID = /^[0-9a-f]{24}$/;
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const MIDDLE_LIST_ID = '6b09e4b9be7e645cfc6b9650';
const JUNIOR_LIST_ID = '6b08c7950c803f3d6de1804f';
const TYPES = { Routine: 'routine', 'Unit lesson': 'unit', 'Licence Kit activity': 'kit' };
const publicFailure = (status, message) => Object.assign(new Error(message), { status, juniorPublic: true });

function metadata(description, parentName) {
  const result = Object.create(null);
  for (const line of description.split(/\r?\n/)) {
    const match = /^(Type|Unit|Lesson|Plan|Activity|Library card|Source|Teaching readiness|Development gap):\s*(.*?)\s*$/i.exec(line);
    if (!match) continue;
    const key = match[1].toLowerCase();
    if (Object.hasOwn(result, key)) throw new Error('Duplicate ' + key + ' field.');
    result[key] = match[2];
  }
  const parent = /^(?:Unit Plan|Licence Kit Plan)$/i.test(result.type || '');
  const type = parent ? (/^Unit Plan$/i.test(result.type) ? 'unit' : 'kit') :
    Object.entries(TYPES).find(([label]) => label.toLowerCase() === result.type?.toLowerCase())?.[1];
  const sequence = (type === 'unit' ? result.unit : result.plan) || (parent ? parentName : '');
  const title = parent ? sequence : type === 'unit' ? result.lesson : result.activity;
  if (!type || !sequence || !title || sequence.length > 200 || title.length > 200) {
    throw new Error('A valid Type, Unit or Plan, and Lesson or Activity are required.');
  }
  const readiness = { 'needs development': 'development', 'ready to teach': 'ready', 'readiness unconfirmed': 'unconfirmed' };
  const recorded = result['teaching readiness']?.toLowerCase();
  if (recorded && !Object.hasOwn(readiness, recorded)) throw new Error('Teaching readiness must be Needs development, Ready to teach or Readiness unconfirmed.');
  if ((result['development gap'] || '').length > 500) throw new Error('Development gap must be at most 500 characters.');
  result.readiness = { status: recorded ? readiness[recorded] : 'unconfirmed', gap: result['development gap'] || '' };
  return { ...result, kind: type, sequence, title, sequenceKey: type + ':' + sequence, parent };
}
function shortLink(url) {
  return new URL(cardLink(url)).pathname.split('/')[2];
}
function catalogueFromLists(lists, orderName = 'JuniorDTECH') {
  const issues = [], libraries = { units: [], kits: [] }, lookup = new Map(), duplicates = new Set();
  for (const [name, key] of [['Unit Plans', 'units'], ['Licence Kit Plans', 'kits']]) {
    for (const card of lists[name]) {
      try {
        const info = metadata(card.desc, card.name);
        if (key === 'units' ? info.kind !== 'unit' : !['routine', 'kit'].includes(info.kind)) {
          throw new Error('The Type does not belong in this library.');
        }
        const link = shortLink(card.url);
        const item = { id: card.id, name: card.name, url: cardLink(card.url), description: card.desc,
          kind: info.kind, sequence: info.sequence, sequenceKey: info.sequenceKey, title: info.title, parent: info.parent,
          readiness: info.readiness };
        libraries[key].push(item);
        if (info.parent) continue;
        if (lookup.has(link)) duplicates.add(link);
        lookup.set(link, item);
      } catch (error) {
        issues.push({ list: name, cardId: card.id, name: card.name, message: error.message });
      }
    }
  }
  const entries = [];
  for (const card of lists[orderName]) {
    try {
      const info = metadata(card.desc);
      if (info.parent) throw new Error('Teaching order entries must identify a lesson or activity, not a parent plan.');
      const sourceLink = info['library card'] || info.source;
      if (!sourceLink) throw new Error('A Trello library card reference is required.');
      let link;
      try { link = shortLink(sourceLink); }
      catch { throw new Error('The library card reference must be a valid Trello card link.'); }
      const source = lookup.get(link);
      if (!source || duplicates.has(link) || source.kind !== info.kind ||
          source.sequence !== info.sequence || source.title !== info.title) {
        throw new Error('The linked library card is missing, ambiguous or does not match this entry.');
      }
      entries.push({ id: card.id, name: card.name, url: cardLink(card.url), kind: info.kind,
        sequence: info.sequence, sequenceKey: info.sequenceKey, title: info.title, source });
    } catch (error) {
      issues.push({ list: orderName, cardId: card.id, name: card.name, message: error.message });
    }
  }
  const counts = new Map();
  for (const entry of entries) counts.set(entry.source.id, (counts.get(entry.source.id) || 0) + 1);
  const unique = entries.filter(entry => {
    if (counts.get(entry.source.id) === 1) return true;
    issues.push({ list: orderName, cardId: entry.id, name: entry.name, message: 'This library card appears more than once in the teaching order.' });
    return false;
  });
  return { entries: unique, libraries, issues, orderCardCount: lists[orderName].length };
}

function createJuniorTeachingRouter({ query, env = process.env, fetchImpl = globalThis.fetch, middle = false }) {
  const router = express.Router();
  const orderName = middle ? 'MiddleDTECH' : 'JuniorDTECH';
  const listNames = [orderName, 'Unit Plans', 'Licence Kit Plans'];
  const progressTable = middle ? 'planner_middle_progress' : 'planner_junior_progress';
  const sessionTable = middle ? 'planner_middle_session_kits' : 'planner_junior_session_kits';
  let savingOrder = false;
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    const owner = env.TEACHER_PLANNER_TRELLO_OWNER_ID;
    if (!UUID.test(owner || '')) return res.status(503).json({ error: 'The teaching-board owner is not configured.' });
    if (req.user?.id !== owner) return res.status(403).json({ error: 'This teaching board is available only to its authorised account.' });
    next();
  });
  async function catalogue() {
    const board = env.TEACHER_PLANNER_TEACHING_TRELLO_BOARD_ID;
    const key = env.TEACHER_PLANNER_TRELLO_API_KEY, token = env.TEACHER_PLANNER_TRELLO_TOKEN;
    if (!ID.test(board || '') || !/^[0-9a-f]{32}$/i.test(key || '') ||
        !/^[A-Za-z0-9_-]{32,512}$/.test(token || '')) {
      throw publicFailure(503, 'Read-only teaching-board access is not configured.');
    }
    const read = createTrelloReader({ key, token, fetchImpl });
    const [boardData, grant] = await Promise.all([
      read('boards/' + board, { fields: 'id,closed' }),
      read('tokens/' + encodeURIComponent(token), { fields: 'permissions' })
    ]);
    if (boardData?.id !== board || boardData.closed !== false || !hasReadOnlyBoardGrant(grant, board)) {
      throw publicFailure(403, 'The teaching board needs its authorised read-only Trello grant.');
    }
    const allLists = await read('boards/' + board + '/lists', { filter: 'open', fields: 'id,idBoard,name,closed' });
    if (!Array.isArray(allLists) || allLists.length > 500 || !allLists.every(list =>
      list && ID.test(list.id) && list.idBoard === board && typeof list.name === 'string' &&
      list.name.length <= 200 && typeof list.closed === 'boolean')) {
      throw new Error('Invalid teaching-board list response.');
    }
    const selected = listNames.map(name => {
      const matches = allLists.filter(list => !list.closed && list.name.trim().toLowerCase() === name.toLowerCase());
      if (matches.length !== 1) throw publicFailure(409, 'Expected one ' + name + ' list on the teaching board.');
      if (middle && name === orderName && matches[0].id !== MIDDLE_LIST_ID) {
        throw publicFailure(409, 'The MiddleDTECH teaching order list ID does not match the configured list.');
      }
      return matches[0];
    });
    const responses = await Promise.all(selected.map(list =>
      read('lists/' + list.id + '/cards', { filter: 'open', fields: 'id,idList,name,desc,url,closed,pos' })));
    const lists = {};
    const seen = new Set();
    for (let i = 0; i < selected.length; i++) {
      const cards = responses[i], list = selected[i];
      if (!Array.isArray(cards) || cards.length > 200 || !cards.every(card => card &&
        ID.test(card.id) && card.idList === list.id && card.closed === false &&
        typeof card.name === 'string' && card.name.length <= 1000 &&
        typeof card.desc === 'string' && card.desc.length <= 64000 && typeof card.url === 'string' &&
        Number.isFinite(card.pos) && !seen.has(card.id) && seen.add(card.id))) {
        throw new Error('Invalid teaching-board card response.');
      }
      lists[listNames[i]] = [...cards].sort((a, b) => a.pos - b.pos);
    }
    return { ...catalogueFromLists(lists, orderName), orderListId: selected[0].id,
      orderVersion: createHash('sha256').update(JSON.stringify(lists[orderName])).digest('hex') };
  }
  function failure(error, res, next) {
    if (error.juniorPublic) return res.status(error.status).json({ error: error.message });
    if (error.code === '42P01') return res.status(503).json({ error: orderName + ' needs the Teacher Planner database migration before it can load.' });
    console.error(orderName + ' data could not be read or saved.');
    return res.status(502).json({ error: orderName + ' Trello data or saved progress could not be verified. Refresh to check the saved state; Notes are separate.' });
  }
  const validYear = value => /^\d{4}$/.test(value) && Number(value) >= 2000 && Number(value) <= 2100;
  const validClass = value => middle ? typeof value === 'string' && /^[A-Z0-9][A-Z0-9_-]{0,39}$/.test(value) : ['JPI', 'JSR'].includes(value);
  const progressPath = middle ? '/:year/:semester' : '/:year';
  const validScope = req => validYear(req.params.year) && (!middle || ['1', '2'].includes(req.params.semester));
  router.get('/catalogue', async (req, res, next) => {
    try { return res.json(await catalogue()); }
    catch (error) { return failure(error, res, next); }
  });
  if (!middle) router.put('/order', async (req, res, next) => {
    const { version, sourceIds } = req.body || {};
    if (!/^[0-9a-f]{64}$/.test(version || '') || !Array.isArray(sourceIds) || sourceIds.length > 200 ||
        !sourceIds.every(id => typeof id === 'string' && ID.test(id)) || new Set(sourceIds).size !== sourceIds.length ||
        Object.keys(req.body || {}).sort().join(',') !== 'sourceIds,version') {
      return res.status(400).json({ error: 'The teaching order is invalid. Your draft has not been saved.' });
    }
    if (savingOrder) return res.status(409).json({ error: 'Another teaching order save is in progress. Keep your draft and retry.' });
    savingOrder = true;
    let original, started = false;
    try {
      original = await catalogue();
      if (original.orderListId !== JUNIOR_LIST_ID) {
        throw publicFailure(409, 'The JuniorDTECH list does not match the authorised list. No order was saved.');
      }
      if (original.orderVersion !== version) {
        throw publicFailure(409, 'The Trello order changed. Refresh and review your draft before saving.');
      }
      const sources = [...original.libraries.units, ...original.libraries.kits].filter(item => !item.parent);
      if (original.issues.some(issue => issue.list === orderName) ||
          original.entries.some(entry => !sourceIds.includes(entry.source.id)) ||
          !sourceIds.every(id => sources.filter(item => item.id === id).length === 1)) {
        throw publicFailure(409, 'The order contains missing, duplicate or unverified activities. No order was saved.');
      }
      const key = env.TEACHER_PLANNER_TRELLO_API_KEY, token = env.TEACHER_PLANNER_TRELLO_WRITE_TOKEN;
      if (!/^[0-9a-f]{32}$/i.test(key || '') || !/^[A-Za-z0-9_-]{32,512}$/.test(token || '')) {
        throw publicFailure(503, 'Trello order saving needs the server-side write credential. Your draft remains available.');
      }
      const read = createTrelloReader({ key, token, fetchImpl });
      const grant = await read('tokens/' + encodeURIComponent(token), { fields: 'permissions,dateExpires' });
      if (!writeGrantStatus(grant, env.TEACHER_PLANNER_TEACHING_TRELLO_BOARD_ID).writeAvailable) {
        throw publicFailure(403, 'The Trello write credential is not authorised for the teaching board. Your draft remains available.');
      }
      const write = async (path, method, body) => {
        const response = await fetchImpl('https://api.trello.com/1/' + path, {
          method, redirect: 'error', signal: AbortSignal.timeout(10000),
          headers: { Accept: 'application/json', 'Content-Type': 'application/json',
            Authorization: `OAuth oauth_consumer_key="${key}", oauth_token="${token}"` },
          body: JSON.stringify(body)
        });
        if (!response.ok) throw new Error('Trello order write failed.');
        return response.json();
      };
      const targetIds = [];
      for (const [index, sourceId] of sourceIds.entries()) {
        const source = sources.find(item => item.id === sourceId);
        let entry = original.entries.find(item => item.source.id === sourceId);
        const pos = (index + 1) * 16384;
        if (entry) {
          const actual = await read('cards/' + entry.id, { fields: 'id,idBoard,idList,closed' });
          if (actual.id !== entry.id || actual.idList !== JUNIOR_LIST_ID || actual.closed !== false ||
              actual.idBoard !== env.TEACHER_PLANNER_TEACHING_TRELLO_BOARD_ID) {
            throw new Error('Teaching order card membership changed.');
          }
          started = true;
          await write('cards/' + entry.id, 'PUT', { pos });
        } else {
          started = true;
          const desc = source.description.split(/\r?\n/).filter(line => !/^Library card:/i.test(line)).join('\n') +
            '\nLibrary card: ' + source.url;
          entry = await write('cards', 'POST', { idList: JUNIOR_LIST_ID, name: source.name, desc, pos });
          if (!ID.test(entry?.id || '') || entry.idList !== JUNIOR_LIST_ID) throw new Error('New order card could not be verified.');
        }
        targetIds.push(entry.id);
      }
      const saved = await catalogue();
      if (saved.issues.some(issue => issue.list === orderName) ||
          JSON.stringify(saved.entries.map(entry => entry.id)) !== JSON.stringify(targetIds) ||
          JSON.stringify(saved.entries.map(entry => entry.source.id)) !== JSON.stringify(sourceIds)) {
        throw new Error('Saved Trello order could not be verified.');
      }
      return res.json(saved);
    } catch (error) {
      if (!started) return failure(error, res, next);
      console.error('JuniorDTECH order save failed or could not be verified.');
      let recovery;
      try {
        const current = await catalogue();
        if (current.orderListId === JUNIOR_LIST_ID && !current.issues.some(issue => issue.list === orderName) &&
            original.entries.every(entry => current.entries.some(item => item.id === entry.id && item.source.id === entry.source.id)) &&
            current.entries.every(entry => sourceIds.includes(entry.source.id))) {
          recovery = { orderVersion: current.orderVersion };
        }
      } catch { console.error('JuniorDTECH partial order state could not be read.'); }
      return res.status(502).json({ error: 'Trello did not confirm the complete order. Your draft is still visible; ' +
        (recovery ? 'retry Save order to complete it.' : 'refresh and review before retrying.'), recovery });
    } finally { savingOrder = false; }
  });
  router.get(progressPath, async (req, res, next) => {
    if (!validScope(req)) return res.status(400).json({ error: 'Choose a valid Planner year and semester.' });
    try {
      const [data, result] = await Promise.all([catalogue(), query(`SELECT class_key,sequence_key,entry_id,revision
        FROM ${progressTable} WHERE owner_id=$1 AND year=$2 ${middle ? 'AND semester=$3' : ''} ORDER BY class_key,sequence_key`,
      middle ? [req.user.id, Number(req.params.year), Number(req.params.semester)] :
      [req.user.id, Number(req.params.year)])]);
      return res.json({ ...data, progress: result.rows });
    } catch (error) { return failure(error, res, next); }
  });
  router.put(progressPath + '/progress', async (req, res, next) => {
    const { classKey, sequenceKey, entryId, revision, action } = req.body || {};
    if (!validScope(req) || !validClass(classKey) || typeof sequenceKey !== 'string' ||
        sequenceKey.length > 205 || !ID.test(entryId || '') || !Number.isInteger(revision) || revision < 0 ||
        !['set', 'advance'].includes(action) || Object.keys(req.body || {}).sort().join(',') !== 'action,classKey,entryId,revision,sequenceKey') {
      return res.status(400).json({ error: 'The requested progress action is invalid.' });
    }
    try {
      const data = await catalogue();
      const entries = data.entries.filter(entry => entry.sequenceKey === sequenceKey && entry.kind !== 'routine');
      const target = entries.find(entry => entry.id === entryId);
      if (!target) return res.status(409).json({ error: 'The selected entry is unavailable or needs review. No progress changed.' });
      const params = [req.user.id, Number(req.params.year), classKey, sequenceKey];
      const semester = Number(req.params.semester);
      const current = (await query(`SELECT entry_id,revision FROM ${progressTable}
        WHERE owner_id=$1 AND year=$2 AND class_key=$3 AND sequence_key=$4 ${middle ? 'AND semester=$5' : ''}`,
      middle ? [...params, semester] : params)).rows[0];
      if ((current?.revision || 0) !== revision) {
        return res.status(409).json({ error: 'Progress changed in another tab. Refresh before trying again.' });
      }
      if (action === 'advance') {
        if (data.issues.some(issue => issue.list === orderName)) {
          return res.status(409).json({ error: 'The teaching order contains entries that need review. No progress changed.' });
        }
        const index = entries.findIndex(entry => entry.id === current?.entry_id);
        if (index < 0 || entries[index + 1]?.id !== entryId) {
          return res.status(409).json({ error: 'The current entry or next teaching-order entry needs review. No progress changed.' });
        }
      }
      const result = revision === 0
        ? await query(`INSERT INTO ${progressTable}(owner_id,year,class_key,sequence_key,entry_id${middle ? ',semester' : ''})
          VALUES ($1,$2,$3,$4,$5${middle ? ',$6' : ''}) ON CONFLICT DO NOTHING RETURNING entry_id,revision`,
        middle ? [...params, entryId, semester] : [...params, entryId])
        : await query(`UPDATE ${progressTable} SET entry_id=$5,revision=revision+1,updated_at=NOW()
          WHERE owner_id=$1 AND year=$2 AND class_key=$3 AND sequence_key=$4 AND revision=$6 ${middle ? 'AND semester=$7' : ''}
          RETURNING entry_id,revision`, middle ? [...params, entryId, revision, semester] : [...params, entryId, revision]);
      if (!result.rows.length) return res.status(409).json({ error: 'Progress changed in another tab. Refresh before trying again.' });
      return res.json(result.rows[0]);
    } catch (error) { return failure(error, res, next); }
  });
  function validSession(req) {
    const value = req.params.date;
    return /^\d{4}-\d{2}-\d{2}$/.test(value) && validYear(value.slice(0, 4)) &&
      Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value &&
      /^p[1-5]$/.test(req.params.slot) && validClass(req.params.classKey);
  }
  router.get('/session/:date/:slot/:classKey', async (req, res, next) => {
    if (!validSession(req)) return res.status(400).json({ error: 'Invalid ' + orderName + ' session.' });
    try {
      const result = await query(`SELECT kits,revision FROM ${sessionTable}
        WHERE owner_id=$1 AND session_date=$2 AND slot_key=$3 AND class_key=$4`,
      [req.user.id, req.params.date, req.params.slot, req.params.classKey]);
      return res.json(result.rows[0] || { kits: [], revision: 0 });
    } catch (error) { return next(error); }
  });
  router.put('/session/:date/:slot/:classKey', async (req, res, next) => {
    const { kits, revision } = req.body || {};
    if (!validSession(req) || !Array.isArray(kits) || kits.length > 50 ||
        !kits.every(key => typeof key === 'string' && key.length <= 205) ||
        new Set(kits).size !== kits.length || !Number.isInteger(revision) || revision < 0 ||
        Object.keys(req.body || {}).sort().join(',') !== 'kits,revision') {
      return res.status(400).json({ error: 'Invalid session kit selection.' });
    }
    try {
      const data = await catalogue();
      const params = [req.user.id, req.params.date, req.params.slot, req.params.classKey];
      const current = (await query(`SELECT kits,revision FROM ${sessionTable}
        WHERE owner_id=$1 AND session_date=$2 AND slot_key=$3 AND class_key=$4`, params)).rows[0];
      if ((current?.revision || 0) !== revision) {
        return res.status(409).json({ error: 'This session changed in another tab. Refresh before trying again.' });
      }
      if (!kits.every(key => current?.kits.includes(key) ||
        data.entries.some(entry => entry.kind === 'kit' && entry.sequenceKey === key))) {
        return res.status(409).json({ error: 'A selected kit is unavailable or needs review. Nothing was saved.' });
      }
      params.push(JSON.stringify(kits));
      const result = revision === 0
        ? await query(`INSERT INTO ${sessionTable}(owner_id,session_date,slot_key,class_key,kits)
          VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING kits,revision`, params)
        : await query(`UPDATE ${sessionTable} SET kits=$5,revision=revision+1,updated_at=NOW()
          WHERE owner_id=$1 AND session_date=$2 AND slot_key=$3 AND class_key=$4 AND revision=$6
          RETURNING kits,revision`, [...params, revision]);
      if (!result.rows.length) return res.status(409).json({ error: 'This session changed in another tab. Refresh before trying again.' });
      return res.json(result.rows[0]);
    } catch (error) { return failure(error, res, next); }
  });
  return router;
}

module.exports = { createJuniorTeachingRouter, catalogueFromLists, metadata };
