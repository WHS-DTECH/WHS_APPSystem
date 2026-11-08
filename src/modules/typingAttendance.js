const crypto = require('node:crypto');
const express = require('express');
const { Pool } = require('pg');
const { query: coreQuery } = require('../db');
const { query: kamarQuery } = require('../legacy/kamar-uploader/db');
const { attendanceClasses } = require('../kamarDirectory');
const { authorisedModuleUser } = require('../moduleIdentity');
const { databaseOptions } = require('./teacherPlanner');
const { loadSchoolCalendar } = require('../schoolCalendar');
const { loadTimetable, eventDate } = require('../legacy/teacher-planner/kamarCalendar');
const { scheduledPeriods } = require('../legacy/teacher-planner/public/attendance');
const { selectRegionalHolidays } = require('../legacy/teacher-planner/regionalHolidays');

const addDays = (start, days) => {
  const date = new Date(start + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const periodTimes = { p1: [540, 600], p2: [600, 660], p3: [680, 740], p4: [740, 800], p5: [840, 900] };
const nzTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Pacific/Auckland', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
});
const sourceError = code => Object.assign(new Error('Planner attendance source needs confirmation.'), { code });
function lessonEntries(events, weekStart) {
  const entries = {};
  const minutes = value => {
    const clock = value.endsWith('Z') ? nzTimeFormatter.format(new Date(value)) : value.slice(11, 16);
    return Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5));
  };
  for (let day = 0; day < 5; day++) {
    const date = addDays(weekStart, day);
    for (const [period, [start, end]] of Object.entries(periodTimes)) {
      entries[period + ':' + day] = events.filter(event => !event.allDay && eventDate(event.start) === date &&
        minutes(event.start) < end && minutes(event.end) > start).map(event => ({ title: event.title }));
    }
  }
  return entries;
}

function attendanceWeeks(startDate, contexts, codes, events, marks, weeklyEntries) {
  return Array.from({ length: 7 }, (_, index) => {
    const weekStart = addDays(startDate, index * 7);
    const schedules = scheduledPeriods({ classes: codes[Number(weekStart.slice(0, 4))] },
      weeklyEntries ? weeklyEntries.get(weekStart) : lessonEntries(events, weekStart));
    const lessons = [];
    let confirmed = true;
    for (let day = 0; day < 5; day++) {
      const date = addDays(weekStart, day), context = contexts[Number(date.slice(0, 4))];
      const terms = Array.from({ length: 4 }, (_, index) => {
        const fallback = context.dates.terms?.find(term => term.term === index + 1);
        return { start: context.school['term' + (index + 1) + 'Start'] || fallback?.startDate,
          end: context.school['term' + (index + 1) + 'End'] || fallback?.endDate };
      });
      if (!terms.some(term => term.start && term.end && date >= term.start && date <= term.end)) { confirmed = false; continue; }
      if (context.school.events?.some(event => event.date === date && ['closure', 'teacherOnly'].includes(event.kind)) ||
        context.dates.publicHolidays?.some(event => event.date === date)) continue;
      for (const period of schedules[day]) {
        const found = marks.filter(mark => mark.date === date && mark.period === period);
        lessons.push({ date, period, mark: found.length === 1 && ['P', 'A', 'L'].includes(found[0].mark) ? found[0].mark : '' });
      }
    }
    return { weekStart, confirmed: confirmed && lessons.length > 0, lessons };
  });
}

function lessonEntriesByWeek(events, startDate) {
  return new Map(Array.from({ length: 7 }, (_, index) => {
    const weekStart = addDays(startDate, index * 7);
    return [weekStart, lessonEntries(events, weekStart)];
  }));
}

function createTypingAttendanceRouter({ env = process.env, dbQuery = coreQuery, directoryQuery = kamarQuery,
  plannerQuery, calendar = loadSchoolCalendar, timetable = loadTimetable, classes = attendanceClasses,
  authorize = authorisedModuleUser, now = () => new Date() } = {}) {
  const router = express.Router();
  let database;
  const query = plannerQuery || ((...args) => {
    if (!database) {
      database = new Pool(databaseOptions(env));
      database.on('error', () => console.error('[typing-attendance] Planner database connection failed.'));
    }
    return database.query(...args);
  });
  router.use((req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    const key = env.DTECH_TYPING_ATTENDANCE_KEY;
    const owner = env.DTECH_TYPING_ATTENDANCE_OWNER_EMAIL;
    if (!key || key.length < 32 || !owner) {
      return res.status(503).json({ error: 'Typing attendance integration is not configured.' });
    }
    const token = String(req.headers.authorization || '').match(/^Bearer (\S+)$/)?.[1] || '';
    const hash = value => crypto.createHash('sha256').update(value).digest();
    if (!crypto.timingSafeEqual(hash(token), hash(key))) {
      console.warn('[typing-attendance] Unauthorised integration request.');
      return res.status(401).json({ error: 'Attendance integration authentication failed.' });
    }
    next();
  });
  router.post('/', express.json({ limit: '2kb' }), async (req, res) => {
    const { studentEmail, startDate } = req.body || {};
    const start = typeof startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? new Date(startDate + 'T00:00:00Z') : null;
    if (!req.body || Object.keys(req.body).some(key => !['studentEmail', 'startDate'].includes(key)) ||
      typeof studentEmail !== 'string' || studentEmail.length > 254 || !/^[^@\s]+@westlandhigh\.school\.nz$/.test(studentEmail) ||
      !start || !Number.isFinite(start.getTime()) || start.toISOString().slice(0, 10) !== startDate ||
      start.getUTCDay() !== 1 || startDate < '2000-01-03' || startDate > '2100-12-27') {
      return res.status(400).json({ error: 'Provide one school student email and a valid Typing Kit Monday.' });
    }
    try {
      const ownerRows = (await dbQuery('SELECT id FROM users WHERE lower(email)=lower($1) AND is_active=true',
        [env.DTECH_TYPING_ATTENDANCE_OWNER_EMAIL])).rows;
      if (ownerRows.length !== 1) throw sourceError('owner-not-unique');
      const owner = await authorize(ownerRows[0].id, 'teacher-planner', dbQuery);
      if (!owner) throw sourceError('owner-access-unavailable');
      const ids = (await directoryQuery(`SELECT DISTINCT trim(id_number) AS id FROM student_details_upload
        WHERE status='Current' AND lower(trim(email_school))=$1 AND NULLIF(trim(id_number),'') IS NOT NULL`, [studentEmail])).rows;
      if (ids.length !== 1) throw sourceError('student-not-unique');
      const studentId = 'k:' + ids[0].id;
      const preferences = (await query("SELECT content FROM planner_sections WHERE owner_id=$1 AND year=2000 AND section='preferences' AND entry_key='main'", [owner.id])).rows[0]?.content;
      const years = [...new Set([Number(startDate.slice(0, 4)), Number(addDays(startDate, 48).slice(0, 4))])];
      const contexts = {};
      for (const year of years) {
        const [directory, groups, school, rawDates, subscription] = await Promise.all([
          classes(owner, year, directoryQuery),
          query('SELECT content FROM planner_attendance_groups WHERE owner_id=$1 AND year=$2', [owner.id, year]),
          query('SELECT content FROM school_planner_settings WHERE year=$1', [year]),
          calendar(year),
          query('SELECT subscription_url FROM teacher_calendar_settings WHERE owner_id=$1', [owner.id])
        ]);
        const dates = selectRegionalHolidays(rawDates, preferences?.anniversaryRegion || 'Westland');
        if (dates.publicHolidaysAvailable === false || dates.available === false) throw sourceError('school-calendar-unavailable');
        const saved = (groups.rows[0]?.content.groups || []).filter(group => /DTECH/i.test(group.name) &&
          group.scheduleMode !== 'manual' && group.students.some(student => student.id === studentId));
        const codes = new Set(saved.flatMap(group => group.classes));
        const studentClasses = directory.classes.filter(group => codes.has(group.code) &&
          group.students.some(student => student.id === studentId));
        if (!studentClasses.length) throw sourceError('student-dtech-class-unavailable');
        if (!subscription.rows[0]?.subscription_url) throw sourceError('teacher-timetable-unavailable');
        contexts[year] = { codes: studentClasses.map(group => group.code), school: school.rows[0]?.content || {},
          dates, subscription: subscription.rows[0].subscription_url };
      }
      const months = [...new Set(Array.from({ length: 49 }, (_, day) => addDays(startDate, day).slice(0, 7)))];
      const feeds = await Promise.all(months.map(month => timetable(contexts[Number(month.slice(0, 4))].subscription,
        Number(month.slice(0, 4)), Number(month.slice(5, 7)))));
      const events = feeds.flatMap(feed => feed.events);
      const marks = (await query(`SELECT to_char(lesson_date,'YYYY-MM-DD') AS date,period,mark FROM planner_attendance_marks
        WHERE owner_id=$1 AND student_id=$2 AND lesson_date >= $3::date AND lesson_date <= $4::date
        AND year = ANY($5::int[])`,
      [owner.id, studentId, startDate, addDays(startDate, 48), years])).rows;
      const codes = Object.fromEntries(years.map(year => [year, contexts[year].codes]));
      const weeks = attendanceWeeks(startDate, contexts, codes, events, marks);
      res.json({ version: 1, studentEmail, startDate, fetchedAt: now().toISOString(), weeks });
    } catch (error) {
      console.error('[typing-attendance] Read failed:', error.code || 'source-unavailable');
      res.status(502).json({ error: 'Teacher Planner attendance is unavailable or needs confirmation. No attendance or typing records have been changed.' });
    }
  });
  router.post('/batch', express.json({ limit: '8kb' }), async (req, res) => {
    const { studentEmails, startDate } = req.body || {};
    const start = typeof startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? new Date(startDate + 'T00:00:00Z') : null;
    if (!req.body || Object.keys(req.body).some(key => !['studentEmails', 'startDate'].includes(key)) ||
      !Array.isArray(studentEmails) || !studentEmails.length || studentEmails.length > 20 ||
      new Set(studentEmails).size !== studentEmails.length || studentEmails.some(email => typeof email !== 'string' ||
        email.length > 254 || !/^[^@\s]+@westlandhigh\.school\.nz$/.test(email)) ||
      !start || !Number.isFinite(start.getTime()) || start.toISOString().slice(0, 10) !== startDate ||
      start.getUTCDay() !== 1 || startDate < '2000-01-03' || startDate > '2100-12-27') {
      return res.status(400).json({ error: 'Provide up to 20 distinct school student emails and a valid Typing Kit Monday.' });
    }
    try {
      const startedAt = process.hrtime.bigint();
      const checkpoint = phase => {
        const memory = process.memoryUsage();
        console.info('[typing-attendance] Batch checkpoint:', phase,
          `elapsedMs=${Math.round(Number(process.hrtime.bigint() - startedAt) / 1e6)}`,
          `rssBytes=${memory.rss}`, `heapUsedBytes=${memory.heapUsed}`);
      };
      checkpoint('start');
      const ownerRows = (await dbQuery('SELECT id FROM users WHERE lower(email)=lower($1) AND is_active=true',
        [env.DTECH_TYPING_ATTENDANCE_OWNER_EMAIL])).rows;
      if (ownerRows.length !== 1) throw sourceError('owner-not-unique');
      const owner = await authorize(ownerRows[0].id, 'teacher-planner', dbQuery);
      if (!owner) throw sourceError('owner-access-unavailable');
      checkpoint('owner');
      const ids = (await directoryQuery(`SELECT DISTINCT lower(trim(email_school)) AS email,trim(id_number) AS id
        FROM student_details_upload WHERE status='Current' AND lower(trim(email_school))=ANY($1::text[])
        AND NULLIF(trim(id_number),'') IS NOT NULL`, [studentEmails])).rows;
      checkpoint('student-directory');
      const preferences = (await query("SELECT content FROM planner_sections WHERE owner_id=$1 AND year=2000 AND section='preferences' AND entry_key='main'", [owner.id])).rows[0]?.content;
      const years = [...new Set([Number(startDate.slice(0, 4)), Number(addDays(startDate, 48).slice(0, 4))])];
      const contexts = {};
      for (const year of years) {
        const [directory, groups, school, rawDates, subscription] = await Promise.all([
          classes(owner, year, directoryQuery),
          query('SELECT content FROM planner_attendance_groups WHERE owner_id=$1 AND year=$2', [owner.id, year]),
          query('SELECT content FROM school_planner_settings WHERE year=$1', [year]),
          calendar(year),
          query('SELECT subscription_url FROM teacher_calendar_settings WHERE owner_id=$1', [owner.id])
        ]);
        checkpoint('year-context');
        const dates = selectRegionalHolidays(rawDates, preferences?.anniversaryRegion || 'Westland');
        if (dates.publicHolidaysAvailable === false || dates.available === false) throw sourceError('school-calendar-unavailable');
        if (!subscription.rows[0]?.subscription_url) throw sourceError('teacher-timetable-unavailable');
        contexts[year] = { directory, groups: groups.rows[0]?.content.groups || [],
          school: school.rows[0]?.content || {}, dates, subscription: subscription.rows[0].subscription_url };
      }
      const months = [...new Set(Array.from({ length: 49 }, (_, day) => addDays(startDate, day).slice(0, 7)))];
      checkpoint('timetable-start');
      const feeds = await Promise.all(months.map(month => timetable(contexts[Number(month.slice(0, 4))].subscription,
        Number(month.slice(0, 4)), Number(month.slice(5, 7)))));
      checkpoint('timetable-complete');
      const events = feeds.flatMap(feed => feed.events);
      const weeklyEntries = lessonEntriesByWeek(events, startDate);
      const studentIds = ids.map(row => 'k:' + row.id);
      const marks = studentIds.length ? (await query(`SELECT student_id,to_char(lesson_date,'YYYY-MM-DD') AS date,period,mark
        FROM planner_attendance_marks WHERE owner_id=$1 AND student_id=ANY($2::text[])
        AND lesson_date >= $3::date AND lesson_date <= $4::date AND year = ANY($5::int[])`,
      [owner.id, studentIds, startDate, addDays(startDate, 48), years])).rows : [];
      checkpoint('marks');
      const fetchedAt = now().toISOString();
      const students = studentEmails.map(studentEmail => {
        const matches = ids.filter(row => row.email === studentEmail);
        if (matches.length !== 1) return { studentEmail, error: 'Student identity could not be confirmed.' };
        const studentId = 'k:' + matches[0].id, codes = {};
        for (const year of years) {
          const context = contexts[year];
          const saved = context.groups.filter(group => /DTECH/i.test(group.name) &&
            group.scheduleMode !== 'manual' && group.students.some(student => student.id === studentId));
          const keys = new Set(saved.flatMap(group => group.classes));
          codes[year] = context.directory.classes.filter(group => keys.has(group.code) &&
            group.students.some(student => student.id === studentId)).map(group => group.code);
          if (!codes[year].length) return { studentEmail, error: 'Student DTECH class membership could not be confirmed.' };
        }
        const ownMarks = marks.filter(mark => mark.student_id === studentId);
        const weeks = attendanceWeeks(startDate, contexts, codes, events, ownMarks, weeklyEntries);
        return { version: 1, studentEmail, startDate, fetchedAt, weeks };
      });
      checkpoint('response-ready');
      res.json({ students });
    } catch (error) {
      console.error('[typing-attendance] Batch read failed:', error.code || 'source-unavailable');
      res.status(502).json({ error: 'Teacher Planner attendance is unavailable or needs confirmation. No attendance or typing records have been changed.' });
    }
  });
  return router;
}

module.exports = { createTypingAttendanceRouter, lessonEntries, lessonEntriesByWeek };
