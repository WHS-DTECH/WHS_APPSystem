const express = require('express');
const crypto = require('crypto');
const { loadTimetable, eventDate } = require('./kamarCalendar');
const { loadTeachingContent } = require('./teachingContent');

const GROUP = 'PIDTECH:JPI';
const ROUTINE = '33455e9a-0354-4663-bee6-d69943c4e24b';
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const STATUSES = ['planned', 'completed', 'partial', 'deferred'];
const INITIAL_NOTE = 'Teacher-reported starting point: Binary Piano attached to exercise books, keys cut out, decoding worksheets attached, and 0/1 and 1-26 written on the worksheets. Decoding was deferred. Confirm or correct this starting point for JPI; it is not a dated teaching-session record.';

function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
function validContent(content) {
  const minutes = value => value === null || typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1440;
  const string = (value, limit) => typeof value === 'string' && value.length <= limit;
  if (!content || Array.isArray(content) || Object.keys(content).sort().join(',') !== 'activities,evaluation,note' ||
      !string(content.note, 20000) || !string(content.evaluation, 20000) ||
      !Array.isArray(content.activities) || content.activities.length > 50) return false;
  return content.activities.every(item => item && !Array.isArray(item) &&
    Object.keys(item).sort().join(',') === 'actualMinutes,id,plannedMinutes,sourceId,status,teachingNote,title' &&
    UUID.test(item.id) && item.sourceId === 'lesson-binary-piano' &&
    string(item.title, 200) && item.title.trim() && minutes(item.plannedMinutes) && minutes(item.actualMinutes) &&
    STATUSES.includes(item.status) && string(item.teachingNote, 4000)) &&
    new Set(content.activities.map(item => item.id)).size === content.activities.length;
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
  async function occurrence(owner, value) {
    const settings = await query('SELECT subscription_url FROM teacher_calendar_settings WHERE owner_id=$1', [owner]);
    if (!settings.rows[0]?.subscription_url) {
      throw Object.assign(new Error('Save your personal KAMAR timetable connection before opening the JPI pilot.'), { status: 409 });
    }
    let feed;
    try { feed = await timetable(settings.rows[0].subscription_url, 2026, Number(value.slice(5, 7))); }
    catch {
      console.error('JPI pilot timetable could not be loaded.');
      throw Object.assign(new Error('The private KAMAR timetable could not be loaded. Retry without changing your plan.'), { status: 502 });
    }
    const candidates = feed.events.filter(event => !event.allDay && eventDate(event.start) === value &&
      /^PIDTECH\s*\(JPI\)$/i.test(event.title.trim()));
    if (candidates.length !== 1) {
      if (!candidates.length) return null;
      throw Object.assign(new Error('More than one JPI occurrence matches this date. No session was selected; check the timetable.'), { status: 409 });
    }
    const event = candidates[0];
    const clock = time => time.endsWith('Z') ? new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Pacific/Auckland', hour: '2-digit', minute: '2-digit'
    }).format(new Date(time)) : time.slice(11, 16);
    if (clock(event.start) !== '10:00' || clock(event.end) !== '11:00') return null;
    return { id: event.id, date: value, start: event.start, end: event.end, location: event.location,
      title: event.title, className: 'JPI', course: 'JuniorDTECH', groupKey: GROUP, type: 'teaching', slot: 'p2' };
  }
  router.put('/context/:year', async (req, res, next) => {
    if (req.params.year !== '2026' || !Number.isInteger(req.body?.revision) || req.body.revision < 0 ||
        typeof req.body?.note !== 'string' || !req.body.note.trim() || req.body.note.length > 20000 ||
        Object.keys(req.body).sort().join(',') !== 'note,revision') {
      console.warn('JPI starting checkpoint rejected.');
      return res.status(400).json({ error: 'Provide a starting checkpoint and its current revision. Nothing was confirmed.' });
    }
    try {
      if (!await routine(req.user.id, 2026) || !await occurrence(req.user.id, '2026-11-23')) {
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
    if (!validDate(value) || value < '2026-11-23' || value > '2026-12-31' || req.params.slot !== 'p2') {
      console.warn('JPI session address rejected.');
      return res.status(400).json({ error: 'This pilot supports JPI Period 2 from 23 November 2026 only.' });
    }
    if (!['GET', 'PUT'].includes(req.method)) return res.status(405).set('Allow', 'GET, PUT').json({ error: 'Use GET or PUT for JPI session plans.' });
    try {
      const owner = req.user.id, existingRoutine = await routine(owner, 2026);
      if (!existingRoutine) {
        if (req.method === 'GET') return res.json({ available: false, reason: 'The JPI pilot requires your existing CW Routine. Original Period notes remain available.' });
        return res.status(403).json({ error: 'The existing owner-private CW Routine is required for this pilot.' });
      }
      const event = await occurrence(owner, value);
      if (!event) {
        if (req.method === 'GET') return res.json({ available: false, reason: 'No JPI Period 2 occurrence matches this date. Original Period notes remain available.' });
        return res.status(403).json({ error: 'Your timetable does not identify one JPI Period 2 session on this date.' });
      }
      if (req.method === 'GET') {
        const [record, checkpoint, history, teaching] = await Promise.all([
          query(`SELECT content,revision,updated_at,confirmed_content,confirmed_at FROM planner_sessions
            WHERE owner_id=$1 AND year=$2 AND session_date=$3 AND group_key=$4 AND slot_key='p2'`, [owner, 2026, value, GROUP]),
          query('SELECT checkpoint_note,revision,confirmed_at FROM planner_class_contexts WHERE owner_id=$1 AND year=$2 AND group_key=$3', [owner, 2026, GROUP]),
          query(`SELECT session_date::text AS session_date,content,confirmed_content,confirmed_at FROM planner_sessions
            WHERE owner_id=$1 AND year=$2 AND group_key=$3 AND session_date < $4
            ORDER BY session_date,occurrence_id`, [owner, 2026, GROUP, value]),
          content()
        ]);
        const row = record.rows[0];
        return res.json({ available: true, event, teaching,
          routine: { id: ROUTINE, ...existingRoutine },
          checkpoint: checkpoint.rows[0] || { checkpoint_note: INITIAL_NOTE, revision: 0, confirmed_at: null },
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

module.exports = { createTeachingSessionsRouter, validContent, draft, nextActivities };
