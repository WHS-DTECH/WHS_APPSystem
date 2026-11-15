const express = require('express');
const { UUID } = require('./moderation');
const { URL: nationalUrl, validDate, schoolCalendar, nationalCalendar } = require('./assessmentCalendar');
const { URL: examUrl, examTimetable, filterTimetable } = require('./examTimetable');
const EVENT_ID = /^(?:nzqa-\d+|nzqa-exam-[0-9a-f]{24}|whs-[a-z0-9-]+|[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})$/i;
const SCHOOL_EVENT_ID = /^whs-[a-z0-9-]+$/;
const canEditSchool = user => user.roles.includes('ADMIN') ||
  Array.isArray(user.module_roles) && user.module_roles.includes('lead-teacher');
const text = (value, max) => typeof value === 'string' && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value);
function validEvent(value, year) {
  return value && Object.keys(value).every(key => ['title', 'date', 'endDate', 'details', 'needsConfirmation'].includes(key)) &&
    text(value.title, 600) && value.title.trim() && validDate(value.date) && Number(value.date.slice(0, 4)) === year &&
    (value.endDate === '' || validDate(value.endDate) && value.endDate >= value.date && Number(value.endDate.slice(0, 4)) === year) &&
    text(value.details, 8000) && typeof value.needsConfirmation === 'boolean';
}
function validSchoolEvent(value, year) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const { sourceDocument, sourceDeadline, ...event } = value;
  return validEvent(event, year) && (sourceDocument === undefined || text(sourceDocument, 600)) &&
    (sourceDeadline === undefined || text(sourceDeadline, 2000));
}
function validTask(value) {
  return value && Object.keys(value).every(key => ['title', 'dueDate', 'notes', 'completed', 'eventId'].includes(key)) &&
    text(value.title, 600) && value.title.trim() && (value.dueDate === '' || validDate(value.dueDate)) &&
    text(value.notes, 8000) && typeof value.completed === 'boolean' &&
    (value.eventId === '' || typeof value.eventId === 'string' && EVENT_ID.test(value.eventId));
}
function moderationTask(record, dueDate) {
  const content = record.content;
  if (!content.standardNumber && !content.internal) return null;
  let internal = {};
  if (content.internal) {
    internal = JSON.parse(content.internal);
    if (!internal || typeof internal !== 'object' || Array.isArray(internal)) throw new Error('A saved internal moderation sheet could not be read.');
  }
  const moderatedDate = internal.verificationDate || internal.samples?.find(row => row.moderatedDate)?.moderatedDate || '';
  return { task_key: 'moderation:' + record.entry_key, done: Boolean(moderatedDate),
    content: { title: 'Moderate ' + [content.standardNumber, content.title || content.standardTitle].filter(Boolean).join(' - '),
      dueDate, recordId: record.entry_key, moderatedDate } };
}
async function syncModerationTasks(query, owner, year, tasks) {
  await query(`WITH desired AS (
      SELECT * FROM jsonb_to_recordset($3::jsonb) AS d(task_key text,content jsonb,done boolean)
    ), previous AS MATERIALIZED (
      SELECT * FROM assessment_home_tasks WHERE owner_id=$1 AND year=$2 AND kind='moderation' FOR UPDATE
    ), saved AS (
      INSERT INTO assessment_home_tasks(owner_id,year,task_key,kind,content,completed_at)
      SELECT $1,$2,d.task_key,'moderation',d.content,CASE WHEN d.done THEN NOW() END
      FROM desired d CROSS JOIN (SELECT COUNT(*) FROM previous) locked WHERE true
      ON CONFLICT(owner_id,year,task_key) DO UPDATE SET content=EXCLUDED.content,
        completed_at=CASE WHEN EXCLUDED.completed_at IS NOT NULL THEN COALESCE(assessment_home_tasks.completed_at,NOW()) END,
        active=true,revision=assessment_home_tasks.revision+1,updated_at=NOW()
      WHERE assessment_home_tasks.content IS DISTINCT FROM EXCLUDED.content
        OR (assessment_home_tasks.completed_at IS NOT NULL) IS DISTINCT FROM (EXCLUDED.completed_at IS NOT NULL)
        OR NOT assessment_home_tasks.active
      RETURNING *
    ), removed AS (
      UPDATE assessment_home_tasks SET active=false,revision=revision+1,updated_at=NOW()
      WHERE owner_id=$1 AND year=$2 AND kind='moderation' AND active
        AND task_key IN (SELECT task_key FROM previous)
        AND NOT EXISTS (SELECT 1 FROM desired WHERE desired.task_key=assessment_home_tasks.task_key)
      RETURNING *
    ), audited AS (
      INSERT INTO assessment_home_audit(owner_id,year,entry_key,action,content)
      SELECT $1,$2,s.task_key,CASE
        WHEN s.completed_at IS NOT NULL AND p.completed_at IS NULL THEN 'auto-completed'
        WHEN s.completed_at IS NULL AND p.completed_at IS NOT NULL THEN 'reopened'
        WHEN p.task_key IS NULL THEN 'task-created' ELSE 'task-updated' END,
        jsonb_build_object('title',s.content->>'title','task',s.content,'completed',s.completed_at IS NOT NULL,'automatic',true)
      FROM saved s LEFT JOIN previous p USING(task_key)
      UNION ALL SELECT $1,$2,task_key,'record-removed',jsonb_build_object('title',content->>'title','automatic',true) FROM removed
      RETURNING id
    ) SELECT COUNT(*) AS changes FROM audited`, [owner, year, JSON.stringify(tasks)]);
}
function createAssessmentHomeRouter({ query, loadTeachingSubjects, fetchImpl, now = () => new Date() }) {
  const router = express.Router(), wrap = work => (req, res, next) => Promise.resolve(work(req, res)).catch(next);
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!UUID.test(req.user?.id || '') || !req.user?.roles?.some(role => ['ADMIN', 'Teacher'].includes(role))) {
      return res.status(403).json({ error: 'Signed-in teacher access is required.' });
    }
    if (typeof query !== 'function') return res.status(503).json({ error: 'Homepage storage is not configured.' });
    next();
  });
  router.param('year', (req, res, next, value) => {
    if (!/^\d{4}$/.test(value) || Number(value) < 2000 || Number(value) > 2100) return res.status(400).json({ error: 'Choose a valid calendar year.' });
    next();
  });
  async function departments(req, year) {
    try {
      if (typeof loadTeachingSubjects !== 'function') throw new Error('Department information is unavailable.');
      const result = await loadTeachingSubjects(req, year);
      if (!Array.isArray(result?.myDepartments) || result.myDepartments.length > 200 ||
          !result.myDepartments.every(item => item && text(item.name, 200) && item.name.trim() &&
            Array.isArray(item.subjects) && item.subjects.length <= 500 &&
            item.subjects.every(subject => text(subject, 200) && subject.trim()))) throw new Error('Verified department information is unavailable.');
      return { departments: result.myDepartments, warning: result.myDepartments.length ? '' :
        'No verified department is associated with your account. Department exam dates are not shown; check your Student Tracker department setup.' };
    } catch (error) {
      console.error('Assessment Manager department calendar lookup failed:', error.message);
      return { departments: [], warning: 'Your verified departments could not be loaded. Department exam and portfolio dates are not shown; retry shortly.' };
    }
  }
  async function calendar(req, year) {
    const owner = req.user.id;
    const [national, timetable, membership, overrides, shared] = await Promise.all([
      nationalCalendar(year, { query, fetchImpl, now: now() }),
      examTimetable(year, { query, fetchImpl, now: now() }),
      departments(req, year),
      query('SELECT event_key,content,revision FROM assessment_home_calendar WHERE owner_id=$1 AND year=$2', [owner, year]),
      query('SELECT event_key,content,revision FROM assessment_school_calendar WHERE year=$1', [year])
    ]);
    const selected = filterTimetable(timetable.events, membership.departments);
    const nationalEvents = [...national.events, ...selected.events];
    const warnings = [national.warning, timetable.warning, membership.warning,
      timetable.events.length && selected.unknown.length ? 'Some linked department subjects could not be matched to the NZQA timetable: ' +
        selected.unknown.join(', ') + '. Check the official timetable for additional dates.' : ''].filter(Boolean);
    const school = new Map(schoolCalendar(year).map(event => [event.id, event]));
    for (const row of shared.rows) {
      const original = school.get(row.event_key);
      school.set(row.event_key, { ...row.content,
        sourceDocument: row.content.sourceDocument ?? original?.sourceDocument ?? '',
        sourceDeadline: row.content.sourceDeadline ?? original?.sourceDeadline ?? '',
        id: row.event_key, revision: row.revision });
    }
    const events = new Map([...nationalEvents, ...[...school.values()].map(event => ({ ...event, revision: 0 }))]
      .map(event => [event.id, event]));
    for (const row of overrides.rows) {
      if (row.event_key.startsWith('nzqa-exam-') && !events.has(row.event_key)) continue;
      events.set(row.event_key, { ...row.content, id: row.event_key, revision: row.revision,
        ...(row.event_key.startsWith('whs-') ? { privateOverride: true } : {}) });
    }
    const sortEvents = (a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title);
    return { events: [...events.values()].sort(sortEvents),
      schoolEvents: [...school.values()].sort(sortEvents), nationalEvents,
      nationalUrl, examUrl, checkedAt: national.checkedAt, warning: warnings.join(' ') };
  }
  router.get('/:year/calendar', wrap(async (req, res) => res.json({
    ...await calendar(req, Number(req.params.year)), canEditSchool: canEditSchool(req.user)
  })));
  router.get('/:year', wrap(async (req, res) => {
    const owner = req.user.id, year = Number(req.params.year);
    const [dates, records] = await Promise.all([
      calendar(req, year),
      query(`SELECT entry_key,content FROM assessment_records
        WHERE owner_id=$1 AND year=$2 AND entry_key<>'main' AND parent_record IS NULL`, [owner, year])
    ]);
    const due = dates.events.find(event => event.id === 'whs-publish-results')?.date || '';
    await syncModerationTasks(query, owner, year, records.rows.map(record => moderationTask(record, due)).filter(Boolean));
    const tasks = await query(`SELECT task_key,kind,content,completed_at,revision FROM assessment_home_tasks
      WHERE owner_id=$1 AND year=$2 AND active ORDER BY completed_at NULLS FIRST,updated_at DESC,task_key`, [owner, year]);
    res.json({ ...dates, canEditSchool: canEditSchool(req.user), tasks: tasks.rows, today: new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(now()) });
  }));
  router.get('/:year/history', wrap(async (req, res) => {
    const offset = req.query.offset || '0';
    if (typeof offset !== 'string' || !/^\d{1,7}$/.test(offset)) return res.status(400).json({ error: 'Choose a valid audit page.' });
    const result = await query(`SELECT id,entry_key,action,content,created_at FROM assessment_home_audit
      WHERE owner_id=$1 AND year=$2 ORDER BY id DESC LIMIT 101 OFFSET $3`, [req.user.id, Number(req.params.year), Number(offset)]);
    res.json({ entries: result.rows.slice(0, 100), more: result.rows.length > 100 });
  }));
  router.put('/:year/school-calendar/:id', wrap(async (req, res) => {
    if (!canEditSchool(req.user)) return res.status(403).json({ error: 'Only Assessment Manager Lead Teachers and global administrators can edit shared school dates.' });
    const { content, revision } = req.body || {}, year = Number(req.params.year);
    if (!SCHOOL_EVENT_ID.test(req.params.id) || !Number.isInteger(revision) || revision < 0 ||
        revision > 2147483646 || !validSchoolEvent(content, year)) {
      return res.status(400).json({ error: 'Enter a title, valid dates within this year and valid school calendar details.' });
    }
    const result = await query(`WITH saved AS (
      INSERT INTO assessment_school_calendar(year,event_key,content,revision,updated_by)
      SELECT $1,$2,$3::jsonb,1,$4 WHERE $5=0
      ON CONFLICT(year,event_key) DO NOTHING RETURNING *
    ), updated AS (
      UPDATE assessment_school_calendar SET content=content || $3::jsonb,revision=revision+1,updated_by=$4,updated_at=NOW()
      WHERE year=$1 AND event_key=$2 AND revision=$5 AND $5>0 RETURNING *
    ), changed AS (SELECT * FROM saved UNION ALL SELECT * FROM updated), history AS (
      INSERT INTO assessment_school_calendar_history(year,event_key,content,revision,updated_by,updated_at)
      SELECT year,event_key,content,revision,updated_by,updated_at FROM changed RETURNING revision
    ) SELECT changed.revision FROM changed CROSS JOIN history`,
    [year, req.params.id, JSON.stringify(content), req.user.id, revision]);
    if (!result.rows.length) return res.status(409).json({ error: 'This shared date changed in another tab. Your draft is still here; refresh before saving again.' });
    res.json(result.rows[0]);
  }));
  router.put('/:year/calendar/:id', wrap(async (req, res) => {
    const { content, revision } = req.body || {}, year = Number(req.params.year);
    if (!EVENT_ID.test(req.params.id) || !Number.isInteger(revision) || revision < 0 || !validEvent(content, year)) {
      return res.status(400).json({ error: 'Enter a title, valid dates within this year and valid calendar details.' });
    }
    const result = await query(`WITH saved AS (
      INSERT INTO assessment_home_calendar(owner_id,year,event_key,content,revision)
      SELECT $1,$2,$3,$4::jsonb,1 WHERE $5=0
      ON CONFLICT(owner_id,year,event_key) DO NOTHING RETURNING *
    ), updated AS (
      UPDATE assessment_home_calendar SET content=$4::jsonb,revision=revision+1,updated_at=NOW()
      WHERE owner_id=$1 AND year=$2 AND event_key=$3 AND revision=$5 AND $5>0 RETURNING *
    ), changed AS (SELECT * FROM saved UNION ALL SELECT * FROM updated), audited AS (
      INSERT INTO assessment_home_audit(owner_id,year,entry_key,action,content)
      SELECT $1,$2,$3,'calendar-updated',jsonb_build_object('title',content->>'title','event',content,'revision',revision) FROM changed RETURNING id
    ) SELECT changed.revision FROM changed CROSS JOIN audited`, [req.user.id, year, req.params.id, JSON.stringify(content), revision]);
    if (!result.rows.length) return res.status(409).json({ error: 'This date changed in another tab. Your draft is still here; refresh before saving again.' });
    res.json(result.rows[0]);
  }));
  router.put('/:year/tasks/:id', wrap(async (req, res) => {
    const { content, revision } = req.body || {}, year = Number(req.params.year);
    if (!UUID.test(req.params.id) || !Number.isInteger(revision) || revision < 0 || !validTask(content)) {
      return res.status(400).json({ error: 'Enter a task title and valid task details.' });
    }
    const { completed, ...details } = content;
    const result = await query(`WITH previous AS MATERIALIZED (
      SELECT task_key,completed_at FROM assessment_home_tasks
      WHERE owner_id=$1 AND year=$2 AND task_key=$3 AND kind='manual' FOR UPDATE
    ), saved AS (
      INSERT INTO assessment_home_tasks(owner_id,year,task_key,kind,content,completed_at)
      SELECT $1,$2,$3,'manual',$4::jsonb,CASE WHEN $6 THEN NOW() END WHERE $5=0
      ON CONFLICT(owner_id,year,task_key) DO NOTHING RETURNING *
    ), updated AS (
      UPDATE assessment_home_tasks SET content=$4::jsonb,
        completed_at=CASE WHEN $6 THEN COALESCE(completed_at,NOW()) END,revision=revision+1,updated_at=NOW()
      WHERE owner_id=$1 AND year=$2 AND task_key=$3 AND kind='manual' AND revision=$5 AND $5>0
        AND task_key IN (SELECT task_key FROM previous) RETURNING *
    ), changed AS (SELECT * FROM saved UNION ALL SELECT * FROM updated), audited AS (
      INSERT INTO assessment_home_audit(owner_id,year,entry_key,action,content)
      SELECT $1,$2,$3,CASE
        WHEN completed_at IS NOT NULL AND NOT EXISTS (SELECT 1 FROM previous WHERE completed_at IS NOT NULL) THEN 'completed'
        WHEN $5=0 THEN 'task-created'
        WHEN completed_at IS NULL AND EXISTS (SELECT 1 FROM previous WHERE completed_at IS NOT NULL) THEN 'reopened'
        ELSE 'task-updated' END,
        jsonb_build_object('title',content->>'title','task',content,'completed',completed_at IS NOT NULL,'automatic',false,'revision',revision)
      FROM changed RETURNING id
    ) SELECT changed.task_key,changed.kind,changed.content,changed.completed_at,changed.revision FROM changed CROSS JOIN audited`,
    [req.user.id, year, req.params.id, JSON.stringify(details), revision, completed]);
    if (!result.rows.length) return res.status(409).json({ error: 'This task changed in another tab. Your changes have not been saved; refresh and try again.' });
    res.json(result.rows[0]);
  }));
  return router;
}
module.exports = { createAssessmentHomeRouter, moderationTask, syncModerationTasks, validEvent, validTask };
