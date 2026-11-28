const express = require('express');
const crypto = require('crypto');
const { loadTimetable, eventDate } = require('./kamarCalendar');
const { loadTeachingContent } = require('./teachingContent');
const { slots, types, validSlot } = require('./public/session-schema');

const GROUP = 'PIDTECH:JPI';
const ROUTINE = '33455e9a-0354-4663-bee6-d69943c4e24b';
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const STATUSES = ['planned', 'completed', 'partial', 'deferred'];
const SLOT_STATUSES = ['taught', 'partial', 'not_taught'];
const INITIAL_NOTE = 'Teacher-reported starting point: Binary Piano attached to exercise books, keys cut out, decoding worksheets attached, and 0/1 and 1-26 written on the worksheets. Decoding was deferred. Confirm or correct this starting point for JPI; it is not a dated teaching-session record.';

function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
function validSlotOutcomes(value) {
  return value === undefined || Array.isArray(value) && value.length <= 500 &&
    value.every(item => item && !Array.isArray(item) &&
      Object.keys(item).sort().join(',') === 'occurrence,status,title' &&
      typeof item.title === 'string' && item.title.trim() && item.title.length <= 2000 &&
      Number.isInteger(item.occurrence) && item.occurrence >= 1 && item.occurrence <= 50 &&
      SLOT_STATUSES.includes(item.status)) &&
    new Set(value.map(item => JSON.stringify([item.title, item.occurrence]))).size === value.length;
}
function validContent(content) {
  const minutes = value => value === null || typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1440;
  const string = (value, limit) => typeof value === 'string' && value.length <= limit;
  if (!content || Array.isArray(content) ||
      !['activities,evaluation,note', 'activities,actualProgress,evaluation,note',
        'activities,evaluation,note,slotOutcomes', 'activities,actualProgress,evaluation,note,slotOutcomes'].includes(Object.keys(content).sort().join(',')) ||
      !validSlotOutcomes(content.slotOutcomes) ||
      !string(content.note, 40002) || !string(content.evaluation, 20000) ||
      (content.actualProgress !== undefined && !string(content.actualProgress, 20000)) ||
      !Array.isArray(content.activities) || content.activities.length > 50) return false;
  return content.activities.every(item => item && !Array.isArray(item) &&
    Object.keys(item).sort().join(',') === 'actualMinutes,id,plannedMinutes,sourceId,status,teachingNote,title' &&
    UUID.test(item.id) && item.sourceId === 'lesson-binary-piano' &&
    string(item.title, 200) && item.title.trim() && minutes(item.plannedMinutes) && minutes(item.actualMinutes) &&
    STATUSES.includes(item.status) && string(item.teachingNote, 4000)) &&
    new Set(content.activities.map(item => item.id)).size === content.activities.length;
}
function validSessionContent(content, slot) {
  const time = value => typeof value === 'string' && (value === '' || /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value));
  const session = content?.session;
  return Boolean(content && ['activities,evaluation,note,session', 'activities,actualProgress,evaluation,note,session',
    'activities,evaluation,note,session,slotOutcomes', 'activities,actualProgress,evaluation,note,session,slotOutcomes'].includes(Object.keys(content).sort().join(',')) &&
    validSlotOutcomes(content.slotOutcomes) &&
    typeof content.note === 'string' && content.note.length <= 40002 &&
    (content.actualProgress === undefined || typeof content.actualProgress === 'string' && content.actualProgress.length <= 20000) &&
    typeof content.evaluation === 'string' && content.evaluation.length <= 20000 &&
    Array.isArray(content.activities) && content.activities.length === 0 &&
    session && ['endTime,startTime,title,type', 'classKey,endTime,startTime,title,type'].includes(Object.keys(session).sort().join(',')) &&
    (session.classKey === undefined || typeof session.classKey === 'string' && /^[A-Z0-9][A-Z0-9_-]{0,39}$/.test(session.classKey)) &&
    typeof session.title === 'string' && session.title.trim() && session.title.length <= 200 &&
    types.includes(session.type) && (slot !== 'whanau' || session.type === 'whanau') &&
    time(session.startTime) && time(session.endTime) &&
    (!session.startTime || !session.endTime || session.startTime < session.endTime));
}
function clock(time) {
  return time.endsWith('Z') ? new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Pacific/Auckland', hour: '2-digit', minute: '2-digit'
  }).format(new Date(time)) : time.slice(11, 16);
}
function progressContent(content) {
  return content?.activities || [];
}
function sessionDay(value) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}
function nextActivities(history) {
  const latest = new Map();
  for (const session of history) {
    if (session.confirmed_content) {
      for (const activity of session.confirmed_content.activities) latest.set(activity.id, activity);
    }
  }
  return [...latest.values()].filter(item => item.status !== 'completed').map(item => ({
    ...item, status: 'planned', actualMinutes: null, teachingNote: ''
  }));
}
function draft(history) {
  const activities = history.some(row => row.confirmed_content) ? nextActivities(history) :
    ['Review Binary Piano and prepared worksheets', 'Introduce binary decoding', 'Guided decoding; continue as readiness allows'].map(title => ({
      id: crypto.randomUUID(), sourceId: 'lesson-binary-piano', title,
      plannedMinutes: null, actualMinutes: null, status: 'planned', teachingNote: ''
    }));
  return { note: '', evaluation: '', activities };
}
function createTeachingSessionsRouter({ query, timetable = loadTimetable, content = loadTeachingContent,
  now = () => new Date() }) {
  const router = express.Router();
  const timetableCache = new Map();
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!UUID.test(req.user?.id || '')) return next(new Error('Verified planner identity has no valid user ID.'));
    next();
  });
  async function routine(owner, year) {
    const result = await query(`SELECT content FROM planner_sections
      WHERE owner_id=$1 AND year=$2 AND section='activity' AND entry_key=$3`, [owner, year, ROUTINE]);
    return result.rows[0]?.content;
  }
  async function timetableEvents(owner, value, fresh = false) {
    const settings = await query('SELECT subscription_url FROM teacher_calendar_settings WHERE owner_id=$1', [owner]);
    if (!settings.rows[0]?.subscription_url) return null;
    const key = [owner, settings.rows[0].subscription_url, value.slice(0, 7)].join('|');
    const at = now().getTime();
    for (const [key, cached] of timetableCache) {
      if (at - cached.at < 0 || at - cached.at >= 30000) timetableCache.delete(key);
    }
    if (fresh) timetableCache.delete(key);
    let feed = timetableCache.get(key)?.feed;
    try {
      if (!feed) {
        feed = await timetable(settings.rows[0].subscription_url, Number(value.slice(0, 4)), Number(value.slice(5, 7)));
        if (!Array.isArray(feed?.events)) throw new Error('Invalid session timetable feed.');
        if (timetableCache.size >= 8) timetableCache.delete(timetableCache.keys().next().value);
        timetableCache.set(key, { feed, at: now().getTime() });
      }
    }
    catch {
      console.error('Session timetable could not be loaded.');
      throw Object.assign(new Error('The private KAMAR timetable could not be loaded. Retry without changing your plan.'), { status: 502 });
    }
    return feed.events.filter(event => !event.allDay && eventDate(event.start) === value);
  }
  async function occurrence(owner, value, events, fresh = false) {
    const candidates = (events ?? await timetableEvents(owner, value, fresh) ?? []).filter(event =>
      /^PIDTECH\s*\(JPI\)$/i.test(event.title.trim()));
    if (candidates.length !== 1) {
      if (!candidates.length) return null;
      throw Object.assign(new Error('More than one JPI occurrence matches this date. No session was selected; check the timetable.'), { status: 409 });
    }
    const event = candidates[0];
    if (clock(event.start) !== '10:00' || clock(event.end) !== '11:00') return null;
    return { id: event.id, date: value, start: event.start, end: event.end, location: 'CW',
      title: event.title, className: 'JPI', classKey: 'JPI', course: 'JuniorDTECH', groupKey: GROUP, type: 'teaching', slot: 'p2' };
  }
  async function previousJpiSession(owner, year, value, slot) {
    const slotOrder = slots.map(item => item[0]);
    const groups = slotOrder.map(key => 'session:' + key + ':JPI');
    const result = await query(`SELECT session_date::text AS session_date,slot_key,content,confirmed_content
      FROM planner_sessions WHERE owner_id=$1 AND year=$2 AND (group_key=$3 OR group_key=ANY($4::text[])
        OR (group_key=ANY($8::text[]) AND upper(trim(content->'session'->>'title'))='PIDTECH (JPI)'))
        AND (session_date<$5 OR (session_date=$5 AND array_position($6::text[],slot_key)<array_position($6::text[],$7)))
      ORDER BY session_date DESC,array_position($6::text[],slot_key) DESC LIMIT 1`,
    [owner, year, GROUP, groups, value, slotOrder, slot, slotOrder.map(key => 'session:' + key)]);
    return result.rows[0] || null;
  }
  async function previousNamedClassSession(owner, year, value, slot, classKey) {
    const order = slots.map(item => item[0]);
    const result = await query(`SELECT session_date::text AS session_date,slot_key,content,revision
      FROM planner_sessions WHERE owner_id=$1 AND year=$2 AND group_key=ANY($3::text[])
        AND (session_date<$4 OR (session_date=$4 AND array_position($5::text[],slot_key)<array_position($5::text[],$6)))
      ORDER BY session_date DESC,array_position($5::text[],slot_key) DESC LIMIT 1`,
    [owner, year, order.map(key => 'session:' + key + ':' + classKey), value, order, slot]);
    return result.rows[0] || null;
  }
  async function genericPlan(req, res) {
    const { date: value, slot } = req.params, owner = req.user.id, year = Number(value.slice(0, 4));
    const legacyGroup = 'session:' + slot, legacyId = 'session:' + value + ':' + slot;
    const definition = slots.find(item => item[0] === slot);
    if (req.method === 'GET') {
      const events = definition ? await timetableEvents(owner, value) : null;
      const matches = definition ? (events || []).filter(event => clock(event.start) === definition[2] && clock(event.end) === definition[3]) : [];
      const ambiguous = matches.length > 1;
      const event = ambiguous ? null : matches[0];
      const classKey = event && /^[^(]+\(([A-Z0-9][A-Z0-9_-]{0,39})\)$/i.exec(event.title.trim())?.[1].toUpperCase() || null;
      const group = classKey ? legacyGroup + ':' + classKey : legacyGroup;
      const record = await query(`SELECT content,revision,updated_at FROM planner_sessions
        WHERE owner_id=$1 AND year=$2 AND session_date=$3 AND group_key=$4 AND slot_key=$5`, [owner, year, value, group, slot]);
      const legacy = classKey ? await query(`SELECT content,revision,updated_at FROM planner_sessions
        WHERE owner_id=$1 AND year=$2 AND session_date=$3 AND group_key=$4 AND slot_key=$5`, [owner, year, value, legacyGroup, slot]) : null;
      const otherClasses = await query(`SELECT group_key,content FROM planner_sessions
        WHERE owner_id=$1 AND year=$2 AND session_date=$3 AND LEFT(group_key,LENGTH($4))=$4 AND slot_key=$5
        ORDER BY group_key`, [owner, year, value, legacyGroup + ':', slot]);
      const previousSession = classKey === 'JPI' ? await previousJpiSession(owner, year, value, slot) : null;
      const previousClassSession = classKey && event && /^(?:PIDTECH|SRDTECH|JUNIORDTECH)\s*\(/i.test(event.title.trim()) ?
        classKey === 'JPI' ? previousSession : await previousNamedClassSession(owner, year, value, slot, classKey) : null;
      const old = legacy?.rows[0];
      const adopted = old && old.content.session?.title.trim().toUpperCase() === event.title.trim().toUpperCase();
      const row = record.rows[0] || (adopted ? old : null);
      const session = row?.content.session || {
        title: event?.title || definition?.[1] || 'Manual commitment',
        type: slot === 'whanau' ? 'whanau' : event ? 'teaching' : 'meeting',
        startTime: event ? clock(event.start) : definition?.[2] || '',
        endTime: event ? clock(event.end) : definition?.[3] || ''
      };
      return res.json({ available: true, event: { date: value, slot, label: definition?.[1] || 'Manual session',
        title: event?.title || session.title,
        location: /^PIDTECH\s*\(JPI\)$/i.test(event?.title || '') ||
          value === '2026-11-23' && slot === 'whanau' && /^WHANAU\s*\(9WHAU\)$/i.test(event?.title || '') ? 'CW' : event?.location || '',
        classKey,
        source: ambiguous ? 'ambiguous' : event ? 'KAMAR' : 'manual' },
        content: { ...(row?.content || { note: '', evaluation: '', activities: [], session }),
          session: { ...session, ...(classKey ? { classKey } : {}) } },
        unassignedNotes: old && (!adopted || record.rows.length) ? old.content : null,
        otherClassNotes: otherClasses.rows.filter(item => item.group_key !== group)
          .map(item => ({ classKey: item.group_key.slice((legacyGroup + ':').length), content: item.content })),
        previousSession, previousClassSession,
        revision: row?.revision || 0, updated_at: row?.updated_at || null });
    }
    const body = req.body;
    if (!body || Object.keys(body).sort().join(',') !== 'content,revision' ||
      !Number.isInteger(body.revision) || body.revision < 0 || !validSessionContent(body.content, slot) ||
      Object.keys(req.query).length) {
      console.warn('Session notes rejected.');
      return res.status(400).json({ error: 'Check the session title, type, times and notes. Class-progress confirmation is available only in the verified JPI teaching pilot.' });
    }
    const classKey = body.content.session.classKey;
    if (classKey) {
      const events = definition ? await timetableEvents(owner, value, true) : [];
      const matches = events.filter(event => clock(event.start) === definition[2] && clock(event.end) === definition[3]);
      const match = matches.length === 1 && /^[^(]+\(([A-Z0-9][A-Z0-9_-]{0,39})\)$/i.exec(matches[0].title.trim());
      if (!match || match[1].toUpperCase() !== classKey) {
        return res.status(409).json({ error: 'The timetable class has changed or is ambiguous. Your draft was not saved; copy it and reload.' });
      }
    }
    const group = classKey ? legacyGroup + ':' + classKey : legacyGroup;
    const id = classKey ? legacyId + ':' + classKey : legacyId;
    const params = [owner, year, id, value, group, JSON.stringify(body.content), slot, body.content.session.type];
    if (classKey && body.revision > 0) {
      const current = await query(`SELECT content,revision,updated_at FROM planner_sessions
        WHERE owner_id=$1 AND year=$2 AND session_date=$3 AND group_key=$4 AND slot_key=$5`, [owner, year, value, group, slot]);
      if (!current.rows.length) {
        const old = await query(`SELECT content,revision,updated_at FROM planner_sessions
          WHERE owner_id=$1 AND year=$2 AND session_date=$3 AND group_key=$4 AND slot_key=$5`, [owner, year, value, legacyGroup, slot]);
        const events = await timetableEvents(owner, value);
        const event = events.find(item => clock(item.start) === definition[2] && clock(item.end) === definition[3]);
        if (old.rows[0]?.content.session?.title.trim().toUpperCase() === event?.title.trim().toUpperCase()) {
          const moved = await query(`UPDATE planner_sessions SET content=$6,occurrence_id=$3,group_key=$5,session_type=$8,revision=revision+1,updated_at=NOW()
            WHERE owner_id=$1 AND year=$2 AND session_date=$4 AND group_key=$10 AND slot_key=$7 AND revision=$9
            RETURNING content,revision,updated_at`, [...params, body.revision, legacyGroup]);
          if (!moved.rows.length) return res.status(409).json({ error: 'This session changed in another tab. Your draft is retained; copy it and reload before saving.' });
          return res.json(moved.rows[0]);
        }
      }
    }
    const result = body.revision === 0
      ? await query(`INSERT INTO planner_sessions(owner_id,year,occurrence_id,session_date,group_key,content,slot_key,session_type)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING RETURNING content,revision,updated_at`, params)
      : await query(`UPDATE planner_sessions SET content=$6,occurrence_id=$3,session_type=$8,revision=revision+1,updated_at=NOW()
        WHERE owner_id=$1 AND year=$2 AND session_date=$4 AND group_key=$5 AND slot_key=$7 AND revision=$9
        RETURNING content,revision,updated_at`, [...params, body.revision]);
    if (!result.rows.length) return res.status(409).json({ error: 'This session changed in another tab. Your draft is retained; copy it and reload before saving.' });
    return res.json(result.rows[0]);
  }
  router.get('/:date', async (req, res, next) => {
    if (!validDate(req.params.date) || Number(req.params.date.slice(0, 4)) < 2000 ||
      Number(req.params.date.slice(0, 4)) > 2100) {
      console.warn('Session listing date rejected.');
      return res.status(400).json({ error: 'Choose a valid session date from 2000 to 2100.' });
    }
    try {
      const result = await query(`SELECT slot_key,session_type,content->'session'->>'title' AS title
        FROM planner_sessions WHERE owner_id=$1 AND session_date=$2 AND slot_key LIKE 'manual-%'
        ORDER BY occurrence_id`, [req.user.id, req.params.date]);
      res.json({ sessions: result.rows });
    } catch (error) { next(error); }
  });
  router.put('/context/:year', async (req, res, next) => {
    if (req.params.year !== '2026' || !Number.isInteger(req.body?.revision) || req.body.revision < 0 ||
        typeof req.body?.note !== 'string' || !req.body.note.trim() || req.body.note.length > 20000 ||
        Object.keys(req.body).sort().join(',') !== 'note,revision') {
      console.warn('JPI starting checkpoint rejected.');
      return res.status(400).json({ error: 'Provide a starting checkpoint and its current revision. Nothing was confirmed.' });
    }
    try {
      if (!await routine(req.user.id, 2026) || !await occurrence(req.user.id, '2026-11-23', undefined, true)) {
        return res.status(403).json({ error: 'This pilot requires your existing CW Routine and verified JPI timetable occurrence.' });
      }
      const params = [req.user.id, 2026, GROUP, req.body.note.trim()];
      const result = req.body.revision === 0
        ? await query(`INSERT INTO planner_class_contexts(owner_id,year,group_key,checkpoint_note)
          VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING revision,confirmed_at`, params)
        : await query(`UPDATE planner_class_contexts SET checkpoint_note=$4,confirmed_at=NOW(),revision=revision+1
          WHERE owner_id=$1 AND year=$2 AND group_key=$3 AND revision=$5 RETURNING revision,confirmed_at`, [...params, req.body.revision]);
      if (!result.rows.length) return res.status(409).json({ error: 'The JPI checkpoint changed in another tab. Copy your text and reload before confirming.' });
      res.json(result.rows[0]);
    } catch (error) { next(error); }
  });
  router.all('/:date/:slot', async (req, res, next) => {
    const value = req.params.date;
    if (!validDate(value) || Number(value.slice(0, 4)) < 2000 || Number(value.slice(0, 4)) > 2100 ||
      ![1, 2, 3, 4, 5].includes(new Date(value).getUTCDay()) || !validSlot(req.params.slot)) {
      console.warn('Session address rejected.');
      return res.status(400).json({ error: 'Choose a weekday session: Whanau, P1-P5, or a manual commitment.' });
    }
    if (!['GET', 'PUT'].includes(req.method)) return res.status(405).set('Allow', 'GET, PUT').json({ error: 'Use GET or PUT for session plans.' });
    try {
      const owner = req.user.id;
      const pilotDate = req.params.slot === 'p2' && value >= '2026-11-23' && value <= '2026-12-31';
      const existingRoutine = pilotDate ? await routine(owner, 2026) : null;
      const event = existingRoutine ? await occurrence(owner, value, undefined, req.method === 'PUT') : null;
      if (!event) return await genericPlan(req, res);
      if (req.method === 'GET') {
        const [record, checkpoint, history, teaching, previousSession, oldSession, otherClasses] = await Promise.all([
          query(`SELECT content,revision,updated_at,confirmed_content,confirmed_at FROM planner_sessions
            WHERE owner_id=$1 AND year=$2 AND session_date=$3 AND group_key=$4 AND slot_key='p2'`, [owner, 2026, value, GROUP]),
          query('SELECT checkpoint_note,revision,confirmed_at FROM planner_class_contexts WHERE owner_id=$1 AND year=$2 AND group_key=$3', [owner, 2026, GROUP]),
          query(`SELECT session_date::text AS session_date,content,confirmed_content,confirmed_at FROM planner_sessions
            WHERE owner_id=$1 AND year=$2 AND group_key=$3 AND session_date < $4
              AND session_type='teaching' AND slot_key='p2' AND unit_id='binary-and-data' AND lesson_id='lesson-binary-piano'
            ORDER BY session_date,occurrence_id`, [owner, 2026, GROUP, value]),
          content(),
          previousJpiSession(owner, 2026, value, 'p2'),
          query(`SELECT content,revision,updated_at FROM planner_sessions
            WHERE owner_id=$1 AND year=$2 AND session_date=$3 AND group_key=$4 AND slot_key=$5`,
          [owner, 2026, value, 'session:p2', 'p2']),
          query(`SELECT group_key,content FROM planner_sessions
            WHERE owner_id=$1 AND year=$2 AND session_date=$3 AND LEFT(group_key,LENGTH($4))=$4 AND slot_key=$5
            ORDER BY group_key`, [owner, 2026, value, 'session:p2:', 'p2'])
        ]);
        const row = record.rows[0];
        return res.json({ available: true, event, teaching,
          routine: { id: ROUTINE, ...existingRoutine },
          checkpoint: checkpoint.rows[0] || { checkpoint_note: INITIAL_NOTE, revision: 0, confirmed_at: null },
          unassignedNotes: oldSession.rows[0]?.content || null,
          otherClassNotes: otherClasses.rows.map(item => ({ classKey: item.group_key.slice('session:p2:'.length), content: item.content })),
          previousSession, previousClassSession: previousSession,
          previous: history.rows.filter(item => item.confirmed_content).map(item => ({ ...item, session_date: sessionDay(item.session_date) })),
          awaitingConfirmation: history.rows.filter(item => !item.confirmed_content ||
            JSON.stringify(progressContent(item.content)) !== JSON.stringify(progressContent(item.confirmed_content))).map(item => sessionDay(item.session_date)),
          content: row?.content || draft(history.rows), revision: row?.revision || 0,
          updated_at: row?.updated_at || null, confirmed_content: row?.confirmed_content || null,
          confirmed_at: row?.confirmed_at || null, canConfirm: value <= eventDate(now().toISOString()) });
      }
      const body = req.body;
      if (!body || Object.keys(body).sort().join(',') !== 'content,revision' ||
          !Number.isInteger(body.revision) || body.revision < 0 || !validContent(body.content) ||
          (req.query.confirm !== undefined && req.query.confirm !== 'true')) {
        console.warn('JPI session content rejected.');
        return res.status(400).json({ error: 'Check activity titles, unique IDs, statuses and durations (0-1440 minutes or blank). Your changes were not saved.' });
      }
      const confirm = req.query.confirm === 'true';
      if (confirm && (value > eventDate(now().toISOString()) || !body.content.activities.some(item => item.status !== 'planned'))) {
        return res.status(400).json({ error: 'Confirm only an actual session on or before today, with at least one completed, partial or deferred activity. Planned work is not completed learning.' });
      }
      const params = [owner, 2026, event.id, value, GROUP, JSON.stringify(body.content), confirm];
      const result = body.revision === 0
        ? await query(`INSERT INTO planner_sessions(owner_id,year,occurrence_id,session_date,group_key,slot_key,session_type,unit_id,lesson_id,content,confirmed_content,confirmed_at)
          VALUES ($1,$2,$3,$4,$5,'p2','teaching','binary-and-data','lesson-binary-piano',$6,CASE WHEN $7 THEN $6::jsonb ELSE NULL END,CASE WHEN $7 THEN NOW() ELSE NULL END)
          ON CONFLICT DO NOTHING RETURNING content,revision,updated_at,confirmed_content,confirmed_at`, params)
        : await query(`UPDATE planner_sessions SET content=$6,occurrence_id=$3,revision=revision+1,updated_at=NOW(),
          confirmed_content=CASE WHEN $7 THEN $6::jsonb ELSE confirmed_content END,
          confirmed_at=CASE WHEN $7 THEN NOW() ELSE confirmed_at END
          WHERE owner_id=$1 AND year=$2 AND session_date=$4 AND group_key=$5 AND slot_key='p2' AND revision=$8
          RETURNING content,revision,updated_at,confirmed_content,confirmed_at`, [...params, body.revision]);
      if (!result.rows.length) return res.status(409).json({ error: 'This session changed in another tab. Your draft is retained; copy it and reload before saving. No progress was overwritten.' });
      return res.json(result.rows[0]);
    } catch (error) {
      if (error.status) return res.status(error.status).json({ error: error.message });
      next(error);
    }
  });
  return router;
}

module.exports = { createTeachingSessionsRouter, validContent, validSessionContent, draft, nextActivities };
