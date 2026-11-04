const express = require('express');
const { importAttendancePdf } = require('./attendanceImport');
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const STUDENT = /^(?:k:[A-Za-z0-9_-]{1,60}|m:[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})$/;
const PERIODS = ['p1', 'p2', 'p3', 'p4', 'p5'];
const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const keys = (value, allowed) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).every(key => allowed.includes(key));
const unique = values => new Set(values).size === values.length;
const student = item => keys(item, ['id', 'name']) && typeof item.id === 'string' &&
  STUDENT.test(item.id) && text(item.name, 160);
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
        !directory.classes.every(group => keys(group, ['code', 'students']) && text(group.code, 120) &&
          Array.isArray(group.students) && group.students.every(student))) {
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
        await query(`UPDATE planner_attendance_groups SET content=$3,revision=revision+1,updated_at=NOW()
          WHERE owner_id=$1 AND year=$2 AND revision=$4 RETURNING revision`, [...values, req.body.revision]);
      if (!result.rows.length) return reject(res, 'Attendance tabs changed in another window. Copy your edits, then reload before saving.', 409);
      res.json(result.rows[0]);
    } catch (error) { next(error); }
  });
  router.get('/:year/week/:week', async (req, res, next) => {
    const week = req.params.week, day = new Date(week + 'T00:00:00Z');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(week) || !Number.isFinite(day.getTime()) ||
      day.toISOString().slice(0, 10) !== week || day.getUTCDay() !== 1 ||
      ![day.getUTCFullYear(), new Date(day.getTime() + 4 * 86400000).getUTCFullYear()].includes(req.attendanceYear)) {
      return reject(res, 'Choose a valid Monday in this attendance year.');
    }
    try {
      const result = await query(`SELECT student_id,student_name,to_char(lesson_date,'YYYY-MM-DD') AS date,period,mark,revision
        FROM planner_attendance_marks WHERE owner_id=$1 AND year=$2 AND lesson_date >= $3::date
        AND lesson_date < $3::date + 5 ORDER BY lesson_date,period,student_id`, [req.user.id, req.attendanceYear, week]);
      res.json({ marks: result.rows });
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
