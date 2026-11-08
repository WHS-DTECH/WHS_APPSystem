const express = require('express');
const { importAttendancePdf } = require('./attendanceImport');
const { folderId } = require('./attendanceDrive');
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const STUDENT = /^(?:k:[A-Za-z0-9_-]{1,60}|m:[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})$/;
const PERIODS = ['p1', 'p2', 'p3', 'p4', 'p5'];
const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const keys = (value, allowed) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).every(key => allowed.includes(key));
const unique = values => new Set(values).size === values.length;
const student = item => keys(item, ['id', 'name']) && typeof item.id === 'string' &&
  STUDENT.test(item.id) && text(item.name, 160);
const directoryStudent = item => keys(item, ['id', 'name', 'yearLevel', 'whanau']) &&
  student({ id: item.id, name: item.name }) &&
  ['yearLevel', 'whanau'].every(key => item[key] === undefined ||
    typeof item[key] === 'string' && item[key].length <= 120);
function validGroups(content) {
  return keys(content, ['groups']) && Buffer.byteLength(JSON.stringify(content)) <= 300000 &&
    Array.isArray(content.groups) && content.groups.length <= 30 &&
    unique(content.groups.map(group => group?.id)) && content.groups.every(group =>
      keys(group, ['id', 'name', 'classes', 'students', 'periods', 'scheduleMode']) &&
      (group.scheduleMode === undefined || ['auto', 'manual'].includes(group.scheduleMode)) &&
      typeof group.id === 'string' && UUID.test(group.id) &&
      text(group.name, 100) && Array.isArray(group.classes) && group.classes.length <= 30 &&
      group.classes.every(code => text(code, 120)) && unique(group.classes) &&
      Array.isArray(group.students) && group.students.length <= 200 && group.students.every(student) &&
      unique(group.students.map(item => item.id)) && Array.isArray(group.periods) &&
      group.periods.length > 0 && group.periods.every(period => PERIODS.includes(period)) && unique(group.periods));
}
function validDay(value, year) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) !== year) return false;
  const day = new Date(value + 'T00:00:00Z');
  return Number.isFinite(day.getTime()) && day.toISOString().slice(0, 10) === value &&
    day.getUTCDay() >= 1 && day.getUTCDay() <= 5;
}
function validWeek(value, year) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const day = new Date(value + 'T00:00:00Z');
  return Number.isFinite(day.getTime()) && day.toISOString().slice(0, 10) === value && day.getUTCDay() === 1 &&
    [day.getUTCFullYear(), new Date(day.getTime() + 4 * 86400000).getUTCFullYear()].includes(year);
}
function createAttendanceRouter({ query, loadClasses }) {
  const router = express.Router();
  function reject(res, message, status = 400) {
    console.warn('Attendance request rejected:', message);
    return res.status(status).json({ error: message });
  }
  router.get('/classes/:year', async (req, res, next) => {
    const year = Number(req.params.year);
    if (!/^\d{4}$/.test(req.params.year) || year < 2000 || year > 2100) return reject(res, 'Choose a valid attendance year.');
    try {
      if (!loadClasses) throw new Error('The school class-list connection is not configured.');
      const directory = await loadClasses(req, year);
      if (!text(directory?.staffCode, 60)) {
        throw new Error('The school class-list connection has no matched staff code. Deploy the updated Global Control staff matching bridge, then retry.');
      }
      if (!keys(directory, ['classes', 'staffCode']) || !Array.isArray(directory.classes) ||
        !directory.classes.every(group => keys(group, ['code', 'students', 'slots']) && text(group.code, 120) &&
          Array.isArray(group.students) && group.students.every(directoryStudent) &&
          (group.slots === undefined || Array.isArray(group.slots) && unique(group.slots) &&
            group.slots.every(slot => /^(mon|tue|wed|thu|fri)_p(1_[12]|[2-5])$/.test(slot))))) {
        throw new Error('The school class list returned invalid data.');
      }
      res.json(directory);
    } catch (error) {
      console.error('Attendance class list failed:', error.message);
      res.status(502).json({ error: error.message + ' Saved registers are unchanged; manual students can still be used.' });
    }
  });
  router.use('/:year', (req, res, next) => {
    const year = Number(req.params.year);
    if (!/^\d{4}$/.test(req.params.year) || year < 2000 || year > 2100) return reject(res, 'Choose a valid attendance year.');
    if (!UUID.test(req.user.id)) return next(new Error('Verified attendance owner is invalid.'));
    req.attendanceYear = year; next();
  });
  router.post('/:year/import-preview', express.raw({ type: 'application/pdf', limit: '5mb' }), async (req, res) => {
    try {
      const result = await importAttendancePdf(req.body);
      if (!result.rows[0].days.some(day => Number(day.date.slice(0, 4)) === req.attendanceYear)) {
        return reject(res, 'The PDF dates do not match this attendance year.');
      }
      res.json(result);
    } catch (error) {
      console.warn('Attendance PDF preview rejected:', error.message);
      res.status(400).json({ error: 'The attendance PDF could not be read. ' + error.message });
    }
  });
  router.get('/:year/imports', async (req, res, next) => {
    try {
      const groups = await query('SELECT content FROM planner_attendance_groups WHERE owner_id=$1 AND year=$2',
        [req.user.id, req.attendanceYear]);
      const marks = await query(`SELECT DISTINCT student_id,to_char(date_trunc('week',lesson_date),'YYYY-MM-DD') AS week
        FROM planner_attendance_marks WHERE owner_id=$1 AND year=$2 AND mark<>''`, [req.user.id, req.attendanceYear]);
      res.json({ imports: groups.rows[0]?.content.imports || {}, markedWeeks: marks.rows });
    } catch (error) { next(error); }
  });
  router.get('/:year/drive-sync', async (req, res, next) => {
    try {
      const saved = (await query('SELECT content,revision FROM planner_attendance_groups WHERE owner_id=$1 AND year=$2',
        [req.user.id, req.attendanceYear])).rows[0];
      res.json({ enabled: false, folderId: '', processed: {}, ...saved?.content.driveSync, revision: saved?.revision || 0 });
    } catch (error) { next(error); }
  });
  router.put('/:year/drive-sync', async (req, res, next) => {
    const id = folderId(req.body.folder);
    if (!keys(req.body, ['folder', 'enabled']) || !id || typeof req.body.enabled !== 'boolean') {
      return reject(res, 'Choose a Google Drive folder URL and whether to enable attendance sync.');
    }
    try {
      const saved = await query(`UPDATE planner_attendance_groups SET content=jsonb_set(content,'{driveSync}',
        CASE WHEN content->'driveSync'->>'folderId'=$3 THEN content->'driveSync'
        ELSE '{"processed":{}}'::jsonb END || jsonb_build_object('folderId',$3::text,'enabled',$4::boolean)),updated_at=NOW()
        WHERE owner_id=$1 AND year=$2 RETURNING revision`, [req.user.id, req.attendanceYear, id, req.body.enabled]);
      if (!saved.rows.length) return reject(res, 'Save your Attendance class tabs before enabling Drive sync.');
      res.json({ folderId: id, enabled: req.body.enabled });
    } catch (error) { next(error); }
  });
  router.put('/:year/drive-sync/file', async (req, res, next) => {
    const value = req.body;
    if (!keys(value, ['folderId', 'fileId', 'version', 'accountId', 'revision', 'retryOn', 'contextKey']) ||
        folderId(value.folderId) !== value.folderId || folderId(value.fileId) !== value.fileId ||
        !text(value.version, 500) || !value.version.startsWith(value.fileId + ':') ||
        !text(value.accountId, 200) || !Number.isInteger(value.revision) || value.revision < 1 ||
        typeof value.contextKey !== 'string' || !/^[a-f0-9]{64}$/.test(value.contextKey) ||
        (value.retryOn !== null && !validDay(value.retryOn, req.attendanceYear))) {
      return reject(res, 'Invalid Drive attendance file checkpoint.');
    }
    try {
      const saved = await query(`UPDATE planner_attendance_groups SET content=jsonb_set(content,
        ARRAY['driveSync','processed',$3::text],$4::jsonb),updated_at=NOW()
        WHERE owner_id=$1 AND year=$2 AND revision=$5 AND content->'driveSync'->>'folderId'=$6
        AND content->'driveSync'->>'enabled'='true' RETURNING revision`,
      [req.user.id, req.attendanceYear, value.fileId, JSON.stringify({
        version: value.version, accountId: value.accountId, revision: value.revision,
        retryOn: value.retryOn, contextKey: value.contextKey, completedAt: new Date().toISOString()
      }), value.revision, value.folderId]);
      if (!saved.rows.length) return reject(res, 'Attendance classes or sync folder changed. Retry Drive sync.', 409);
      res.json({ completed: true });
    } catch (error) { next(error); }
  });
  router.put('/:year/imports', async (req, res, next) => {
    const entries = req.body.entries;
    if (!keys(req.body, ['entries']) || !Array.isArray(entries) || !entries.length || entries.length > 60 ||
        !entries.every(item => keys(item, ['groupId', 'week', 'expected', 'recorded', 'conflicts', 'unresolved']) &&
          typeof item.groupId === 'string' && UUID.test(item.groupId) && validWeek(item.week, req.attendanceYear) &&
          Number.isInteger(item.expected) && item.expected > 0 && item.expected <= 5000 &&
          Number.isInteger(item.recorded) && item.recorded > 0 && item.recorded <= item.expected &&
          Number.isInteger(item.conflicts) && item.conflicts >= 0 && item.conflicts <= item.recorded &&
          typeof item.unresolved === 'boolean')) return reject(res, 'Invalid attendance import history.');
    try {
      const groups = await query('SELECT content FROM planner_attendance_groups WHERE owner_id=$1 AND year=$2',
        [req.user.id, req.attendanceYear]);
      if (!entries.every(item => groups.rows[0]?.content.groups.some(group => group.id === item.groupId))) {
        return reject(res, 'Import history must belong to your saved class tabs.');
      }
      const importedAt = new Date().toISOString();
      const history = Object.fromEntries(entries.map(item => [item.groupId + ':' + item.week, { ...item, importedAt }]));
      // Metadata is independent of class revisions; class edits preserve it atomically.
      const saved = await query(`UPDATE planner_attendance_groups
        SET content=jsonb_set(content,'{imports}',COALESCE(content->'imports','{}'::jsonb) || $3::jsonb),updated_at=NOW()
        WHERE owner_id=$1 AND year=$2 RETURNING revision`, [req.user.id, req.attendanceYear, JSON.stringify(history)]);
      if (!saved.rows.length) return reject(res, 'Class tabs changed. Reload before recording import history.', 409);
      res.json({ importedAt });
    } catch (error) { next(error); }
  });
  router.get('/:year/groups', async (req, res, next) => {
    try {
      const result = await query('SELECT content,revision FROM planner_attendance_groups WHERE owner_id=$1 AND year=$2',
        [req.user.id, req.attendanceYear]);
      res.json(result.rows[0] || { content: { groups: [] }, revision: 0 });
    } catch (error) { next(error); }
  });
  router.put('/:year/groups', async (req, res, next) => {
    if (!validGroups(req.body.content) || !Number.isInteger(req.body.revision) || req.body.revision < 0) {
      return reject(res, 'Check the class tab name, students and periods. Attendance setup was not saved.');
    }
    try {
      const values = [req.user.id, req.attendanceYear, JSON.stringify(req.body.content)];
      const result = req.body.revision === 0 ?
        await query(`INSERT INTO planner_attendance_groups(owner_id,year,content) VALUES ($1,$2,$3)
          ON CONFLICT DO NOTHING RETURNING revision`, values) :
        await query(`UPDATE planner_attendance_groups SET content=$3::jsonb ||
          jsonb_build_object('imports',COALESCE(content->'imports','{}'::jsonb)) ||
          CASE WHEN content ? 'driveSync' THEN jsonb_build_object('driveSync',content->'driveSync') ELSE '{}'::jsonb END,
          revision=revision+1,updated_at=NOW()
          WHERE owner_id=$1 AND year=$2 AND revision=$4 RETURNING revision`, [...values, req.body.revision]);
      if (!result.rows.length) return reject(res, 'Attendance tabs changed in another window. Copy your edits, then reload before saving.', 409);
      res.json(result.rows[0]);
    } catch (error) { next(error); }
  });
  router.get('/:year/student/:studentId', async (req, res, next) => {
    const { studentId } = req.params;
    const { groupId, start, end } = req.query;
    const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      value.startsWith(req.attendanceYear + '-') && Number.isFinite(Date.parse(value + 'T00:00:00Z')) &&
      new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
    if (!STUDENT.test(studentId) || typeof groupId !== 'string' || !UUID.test(groupId) ||
      !validDate(start) || !validDate(end) || start > end ||
      (Date.parse(end) - Date.parse(start)) / 86400000 > 150) {
      return reject(res, 'Choose a saved class student and valid term dates in this attendance year.');
    }
    try {
      const saved = await query('SELECT content FROM planner_attendance_groups WHERE owner_id=$1 AND year=$2',
        [req.user.id, req.attendanceYear]);
      if (!saved.rows[0]?.content.groups.some(group => group.id === groupId &&
        group.students.some(item => item.id === studentId))) {
        return reject(res, 'This student is not in your selected saved class tab.', 403);
      }
      const result = await query(`SELECT student_id,to_char(lesson_date,'YYYY-MM-DD') AS date,period,mark,revision
        FROM planner_attendance_marks WHERE owner_id=$1 AND year=$2 AND student_id=$3
        AND lesson_date >= $4::date AND lesson_date <= $5::date ORDER BY lesson_date,period`,
      [req.user.id, req.attendanceYear, studentId, start, end]);
      res.json({ marks: result.rows });
    } catch (error) { next(error); }
  });
  router.get('/:year/week/:week', async (req, res, next) => {
    const week = req.params.week;
    if (!validWeek(week, req.attendanceYear)) {
      return reject(res, 'Choose a valid Monday in this attendance year.');
    }
    try {
      const result = await query(`SELECT student_id,student_name,to_char(lesson_date,'YYYY-MM-DD') AS date,period,mark,revision
        FROM planner_attendance_marks WHERE owner_id=$1 AND year=$2 AND lesson_date >= $3::date
        AND lesson_date < $3::date + 5 ORDER BY lesson_date,period,student_id`, [req.user.id, req.attendanceYear, week]);
      res.json({ marks: result.rows });
    } catch (error) { next(error); }
  });
  router.put('/:year/import-marks', async (req, res, next) => {
    const values = req.body?.marks;
    if (!keys(req.body, ['marks']) || !Array.isArray(values) || !values.length || values.length > 200 ||
      !values.every(value => keys(value, ['studentId', 'date', 'period', 'mark', 'revision']) &&
        typeof value.studentId === 'string' && STUDENT.test(value.studentId) &&
        validDay(value.date, req.attendanceYear) && PERIODS.includes(value.period) &&
        ['P', 'A', 'L'].includes(value.mark) && Number.isInteger(value.revision) && value.revision >= 0) ||
      !unique(values.map(value => [value.studentId, value.date, value.period].join('|')))) {
      return reject(res, 'Choose up to 200 distinct valid blank attendance marks to import.');
    }
    try {
      const groups = await query('SELECT content,revision FROM planner_attendance_groups WHERE owner_id=$1 AND year=$2',
        [req.user.id, req.attendanceYear]);
      const named = values.map(value => {
        const group = groups.rows[0]?.content.groups.find(group => group.students.some(item => item.id === value.studentId) &&
          (group.periods.includes(value.period) || group.scheduleMode !== 'manual' && group.classes.length > 0));
        return group && { ...value, name: group.students.find(item => item.id === value.studentId).name };
      });
      if (named.some(value => !value)) return reject(res, 'This student and period are not in your saved class tabs. Save class setup first.');
      const result = await query(`WITH input AS (
          SELECT * FROM jsonb_to_recordset($3::jsonb)
            AS x("studentId" text, date date, period text, mark text, revision integer, name text)
        ), inserted AS (
          INSERT INTO planner_attendance_marks(owner_id,year,student_id,lesson_date,period,mark,student_name)
          SELECT $1,$2,"studentId",date,period,mark,name FROM input WHERE revision=0
          ON CONFLICT DO NOTHING RETURNING 1
        ), updated AS (
          UPDATE planner_attendance_marks AS m SET mark=i.mark,student_name=i.name,
            revision=m.revision+1,updated_at=NOW()
          FROM input AS i WHERE i.revision>0 AND m.owner_id=$1 AND m.year=$2
            AND m.student_id=i."studentId" AND m.lesson_date=i.date AND m.period=i.period
            AND m.revision=i.revision AND m.mark='' RETURNING 1
        )
        SELECT (SELECT count(*) FROM inserted) + (SELECT count(*) FROM updated) AS saved`,
      [req.user.id, req.attendanceYear, JSON.stringify(named)]);
      const saved = Number(result.rows[0].saved);
      if (saved !== values.length) return reject(res, saved + ' of ' + values.length +
        ' marks in this batch were saved; other marks changed in another window. Re-preview the PDF to retry safely.', 409);
      res.json({ saved });
    } catch (error) { next(error); }
  });
  router.put('/:year/mark', async (req, res, next) => {
    const value = req.body;
    if (!keys(value, ['studentId', 'date', 'period', 'mark', 'revision', 'fillOnly']) || typeof value.studentId !== 'string' ||
      !STUDENT.test(value.studentId) || !validDay(value.date, req.attendanceYear) || !PERIODS.includes(value.period) ||
      (value.fillOnly !== undefined && value.fillOnly !== true) ||
      !['', 'P', 'A', 'L'].includes(value.mark) || !Number.isInteger(value.revision) || value.revision < 0) {
      return reject(res, 'Choose a valid student, school day, period and blank/P/A/L mark.');
    }
    try {
      const groups = await query('SELECT content,revision FROM planner_attendance_groups WHERE owner_id=$1 AND year=$2',
        [req.user.id, req.attendanceYear]);
      const group = groups.rows[0]?.content.groups.find(group => group.students.some(item => item.id === value.studentId) &&
        (group.periods.includes(value.period) || group.scheduleMode !== 'manual' && group.classes.length > 0));
      if (!group) {
        return reject(res, 'This student and period are not in your saved class tabs. Save class setup first.');
      }
      const name = group.students.find(item => item.id === value.studentId).name;
      const values = [req.user.id, req.attendanceYear, value.studentId, value.date, value.period, value.mark, name];
      const result = value.revision === 0 ?
        await query(`INSERT INTO planner_attendance_marks(owner_id,year,student_id,lesson_date,period,mark,student_name)
          VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING RETURNING revision`, values) :
        await query(`UPDATE planner_attendance_marks SET mark=$6,student_name=$7,revision=revision+1,updated_at=NOW()
          WHERE owner_id=$1 AND year=$2 AND student_id=$3 AND lesson_date=$4 AND period=$5 AND revision=$8${value.fillOnly ? " AND mark=''" : ''} RETURNING revision`,
        [...values, value.revision]);
      if (!result.rows.length) return reject(res, 'This attendance mark changed in another window. Note your intended mark, then reload the week before retrying.', 409);
      res.json(result.rows[0]);
    } catch (error) { next(error); }
  });
  return router;
}
module.exports = { createAttendanceRouter, validGroups, validDay };
