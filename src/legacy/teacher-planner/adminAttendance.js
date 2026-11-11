const crypto = require('node:crypto');
const express = require('express');
const { folderId: parseFolderId } = require('./attendanceDrive');
const { saveAttendanceGroups, saveAttendanceImports, saveAttendanceImportMarks, validWeek } = require('./attendance');
const attendance = require('./public/attendance');
const { importAttendancePdf } = require('./attendanceImport');

const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const YEAR = /^(?:20\d{2}|2100)$/;
const DAY_INDEX = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4 };
const own = (value, allowed) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).every(key => allowed.includes(key));

function termRanges(settings, terms) {
  return [1, 2, 3, 4].map(number => {
    const fallback = terms.find(item => item.term === number);
    return { term: String(number), startDate: settings['term' + number + 'Start'] || fallback?.startDate,
      endDate: settings['term' + number + 'End'] || fallback?.endDate };
  });
}

function timetableEntries(directory) {
  const entries = {};
  for (const group of directory.classes) {
    const title = attendance.classCode(group.code, true);
    for (const slot of group.slots || []) {
      const match = /^(mon|tue|wed|thu|fri)_(p[1-5])(?:_[12])?$/.exec(slot);
      if (!match) continue;
      const key = match[2] + ':' + DAY_INDEX[match[1]];
      (entries[key] ||= []).push({ title });
    }
  }
  return entries;
}

function localDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
}

function createAdminAttendanceRouter({ query, loadTeachers, authorizeTarget, loadClasses, loadSchoolCalendar,
  driveService, driveStatus, parsePdf = importAttendancePdf, today = localDate }) {
  const router = express.Router();
  const jobs = new Map();
  const pdfPreviews = new Map();
  const activeTargets = new Set();
  function reject(res, message, status = 400) {
    return res.status(status).json({ error: message });
  }
  function wrap(handler) {
    return async (req, res, next) => {
      try { await handler(req, res); }
      catch (error) {
        if (error.status) return reject(res, error.message, error.status);
        next(error);
      }
    };
  }
  function clearExpiredPreviews() {
    const now = Date.now();
    for (const [id, preview] of pdfPreviews) if (preview.expiresAt <= now) pdfPreviews.delete(id);
    while (pdfPreviews.size >= 30) {
      const oldest = [...pdfPreviews.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt)[0];
      if (!oldest) break;
      pdfPreviews.delete(oldest[0]);
    }
  }
  function pdfWeekContainsYear(pdf, week, year) {
    const end = new Date(week + 'T00:00:00Z');
    end.setUTCDate(end.getUTCDate() + 5);
    const endDate = end.toISOString().slice(0, 10);
    return pdf.rows.some(row => row.days.some(day => day.date.startsWith(year + '-') &&
      day.date >= week && day.date < endDate));
  }
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!req.user?.roles?.includes('ADMIN')) return reject(res, 'Global ADMIN access is required.', req.user ? 403 : 401);
    next();
  });
  async function settings(adminId, year) {
    return (await query(`SELECT folder_id,enabled,processed,revision FROM planner_attendance_admin_sync
      WHERE admin_id=$1 AND year=$2`, [adminId, year])).rows[0] ||
      { folder_id: '', enabled: false, processed: {}, revision: 0 };
  }
  router.get('/teachers', wrap(async (_req, res) => {
    const teachers = await loadTeachers();
    res.json({ teachers: teachers.map(({ id, name, staffCode }) => ({ id, name, staffCode })) });
  }));
  router.get('/settings/:year', wrap(async (req, res) => {
    if (!YEAR.test(req.params.year)) return reject(res, 'Choose a valid attendance year.');
    const [saved, drive] = await Promise.all([settings(req.user.id, Number(req.params.year)), driveStatus(req)]);
    res.json({ folderId: saved.folder_id, enabled: saved.enabled, connected: drive.connected,
      driveAccess: drive.driveAccess, googleEmail: drive.email || '' });
  }));
  router.put('/settings/:year', wrap(async (req, res) => {
    if (!YEAR.test(req.params.year) || !own(req.body, ['folder', 'enabled']) ||
        typeof req.body.folder !== 'string' || typeof req.body.enabled !== 'boolean') {
      return reject(res, 'Choose a valid year, Google Drive folder and enabled setting.');
    }
    const folder = parseFolderId(req.body.folder);
    if (!folder) return reject(res, 'Paste a valid Google Drive folder URL.');
    const year = Number(req.params.year);
    const result = await query(`INSERT INTO planner_attendance_admin_sync(admin_id,year,folder_id,enabled)
      VALUES ($1,$2,$3,$4)
      ON CONFLICT(admin_id,year) DO UPDATE SET
        processed=CASE WHEN planner_attendance_admin_sync.folder_id=EXCLUDED.folder_id
          THEN planner_attendance_admin_sync.processed ELSE '{}'::jsonb END,
        folder_id=EXCLUDED.folder_id,enabled=EXCLUDED.enabled,
        revision=planner_attendance_admin_sync.revision+1,updated_at=NOW()
      RETURNING folder_id,enabled,revision`,
    [req.user.id, year, folder, req.body.enabled]);
    res.json({ folderId: result.rows[0].folder_id, enabled: result.rows[0].enabled,
      revision: result.rows[0].revision });
  }));
  router.post('/sync', wrap(async (req, res) => {
    const year = req.body?.year;
    const teacherId = req.body?.teacherId;
    if (!own(req.body, ['year', 'teacherId']) || !Number.isInteger(year) || year < 2000 || year > 2100 ||
        typeof teacherId !== 'string' || !UUID.test(teacherId)) {
      return reject(res, 'Choose a valid attendance year and teacher.');
    }
    const teachers = await loadTeachers();
    const selected = teachers.find(item => item.id === teacherId);
    if (!selected) return reject(res, 'Choose a current teacher with an active school account.', 404);
    const key = year + ':' + teacherId;
    if (activeTargets.has(key)) return reject(res, 'An attendance import is already running for this teacher and year.', 409);
    const saved = await settings(req.user.id, year);
    if (!saved.enabled || !saved.folder_id) return reject(res, 'Save and enable the admin Google Drive folder first.', 409);
    const drive = await driveStatus(req);
    if (!drive.connected || !drive.driveAccess) return reject(res, 'Connect Google with read-only Drive attendance access before syncing.', 409);
    const job = { id: crypto.randomUUID(), adminId: req.user.id, teacherId, teacherName: selected.name,
      year, createdAt: Date.now(), status: 'running', progress: 'Preparing attendance sync...',
      summary: null, error: null };
    jobs.set(job.id, job);
    activeTargets.add(key);
    for (const [id, old] of jobs) {
      if (old.status !== 'running' && Date.now() - old.createdAt > 60 * 60 * 1000) jobs.delete(id);
    }
    const admin = req.user;
    runJob(job, admin, selected, saved, { query, authorizeTarget, loadClasses, loadSchoolCalendar, driveService })
      .then(summary => { job.summary = summary; job.status = 'complete'; job.progress = 'Attendance import complete.'; })
      .catch(error => {
        console.error('Admin attendance import failed:', error.message);
        job.error = error.message || 'Attendance import failed. Check the folder and retry.';
        job.status = 'failed';
      })
      .finally(() => activeTargets.delete(key));
    res.status(202).json({ jobId: job.id });
  }));
  router.post('/pdf-preview/:year/:teacherId',
    express.raw({ type: 'application/pdf', limit: '5mb' }), wrap(async (req, res) => {
      const year = Number(req.params.year), teacherId = req.params.teacherId;
      if (!YEAR.test(req.params.year) || !UUID.test(teacherId)) {
        return reject(res, 'Choose a valid attendance year and teacher.');
      }
      if (!Buffer.isBuffer(req.body) || !req.body.length) {
        return reject(res, 'Choose a KAMAR attendance PDF no larger than 5 MB.');
      }
      const teachers = await loadTeachers();
      const selected = teachers.find(item => item.id === teacherId);
      if (!selected) return reject(res, 'Choose a current teacher with an active school account.', 404);
      const target = await authorizeTarget(teacherId);
      if (!target) return reject(res, 'This teacher does not have active access to Teacher Planner.', 409);

      let pdf;
      try { pdf = await parsePdf(req.body); }
      catch (error) { return reject(res, 'The attendance PDF could not be read. ' + error.message); }
      if (!pdf?.rows?.length || !pdf.rows.some(row => row.days.some(day =>
        Number(day.date.slice(0, 4)) === year))) {
        return reject(res, 'The PDF dates do not match this attendance year.');
      }
      const weeks = pdf.weeks.filter(week => validWeek(week, year) && pdfWeekContainsYear(pdf, week, year));
      if (!weeks.length) return reject(res, 'The PDF has no valid attendance week in this year.');
      const schoolRow = (await query('SELECT content FROM school_planner_settings WHERE year=$1', [year])).rows[0];
      if (!schoolRow) return reject(res, 'Publish school term dates in Kamar Uploader or Planner Setup before importing attendance.', 409);
      let calendar;
      try { calendar = await loadSchoolCalendar(year); }
      catch (error) { calendar = { terms: [], publicHolidays: [], publicHolidaysError: error.message }; }
      const ranges = termRanges(schoolRow.content, calendar.terms || []);
      if (!ranges.some(range => range.startDate && range.endDate)) {
        return reject(res, 'Publish school term dates in Kamar Uploader or Planner Setup before importing attendance.', 409);
      }
      const targetRequest = { user: target };
      const directory = await loadClasses(targetRequest, year);
      const saved = (await query('SELECT content,revision FROM planner_attendance_groups WHERE owner_id=$1 AND year=$2',
        [target.id, year])).rows[0] || { content: { groups: [] }, revision: 0 };
      const groups = attendance.timetableGroups(saved.content.groups, directory);
      if (JSON.stringify(groups) !== JSON.stringify(saved.content.groups)) {
        await saveAttendanceGroups(query, target.id, year, saved.revision, { groups });
      }
      const automatic = groups.filter(group => group.scheduleMode !== 'manual' && group.classes.length);
      if (!automatic.length) return reject(res, 'No automatic class tabs are available for this teacher.');
      const schedules = {}, savedMarks = [];
      for (const week of weeks) {
        schedules[week] = timetableEntries(directory);
        const result = await query(`SELECT student_id,student_name,to_char(lesson_date,'YYYY-MM-DD') AS date,
          period,mark,revision FROM planner_attendance_marks
          WHERE owner_id=$1 AND year=$2 AND lesson_date >= $3::date AND lesson_date < $3::date + 5
          ORDER BY lesson_date,period,student_id`, [target.id, year, week]);
        savedMarks.push(...result.rows);
      }
      const plans = automatic.map(group => ({ group,
        plan: attendance.planImport({ pdf, group, directory, schedules, savedMarks, year, ranges,
          school: schoolRow.content, calendar, today: today() }) }));
      const plan = attendance.mergePlans(plans);
      const entries = plans.flatMap(item => item.plan.coverage);
      const previewId = crypto.randomUUID();
      const createdAt = Date.now();
      const summary = {
        teacherName: selected.name, year, weeks,
        marksToFill: plan.fills.length, conflictsKept: plan.conflicts.length,
        unchanged: plan.unchanged, matchWarnings: plan.warnings.length,
        hasImportStatus: entries.length > 0,
        ...((calendar.publicHolidaysError || calendar.publicHolidaysAvailable === false) ? {
          calendarWarning: 'Government public holiday dates could not be loaded. Verify school closures before importing.'
        } : {})
      };
      clearExpiredPreviews();
      pdfPreviews.set(previewId, {
        id: previewId, adminId: req.user.id, teacherId, year, targetOwner: target.id,
        summary, marks: plan.fills.map(({ name, ...value }) => value), entries,
        createdAt, expiresAt: createdAt + 15 * 60 * 1000
      });
      res.json({ previewId, ...summary });
    }));
  router.post('/pdf-apply', wrap(async (req, res) => {
    if (!own(req.body, ['previewId']) || typeof req.body.previewId !== 'string' || !UUID.test(req.body.previewId)) {
      return reject(res, 'Reload the PDF preview before importing.');
    }
    const preview = pdfPreviews.get(req.body.previewId);
    if (!preview || preview.adminId !== req.user.id || preview.expiresAt <= Date.now()) {
      if (preview?.expiresAt <= Date.now()) pdfPreviews.delete(preview.id);
      return reject(res, 'This PDF preview has expired or is no longer available. Preview the file again.', 404);
    }
    const key = preview.year + ':' + preview.teacherId;
    if (activeTargets.has(key)) return reject(res, 'An attendance import is already running for this teacher and year.', 409);
    activeTargets.add(key);
    pdfPreviews.delete(preview.id);
    let savedCount = 0;
    try {
      const teachers = await loadTeachers();
      if (!teachers.some(item => item.id === preview.teacherId) || !await authorizeTarget(preview.teacherId)) {
        return reject(res, 'This teacher no longer has active Teacher Planner access. Reload the selected teacher and preview again.', 409);
      }
      for (let offset = 0; offset < preview.marks.length; offset += 200) {
        const result = await saveAttendanceImportMarks(query, preview.targetOwner, preview.year,
          preview.marks.slice(offset, offset + 200));
        savedCount += result.saved;
      }
      if (preview.entries.length) {
        await saveAttendanceImports(query, preview.targetOwner, preview.year, preview.entries);
      }
      res.json({
        marksFilled: savedCount, conflictsKept: preview.summary.conflictsKept,
        matchWarnings: preview.summary.matchWarnings, unchanged: preview.summary.unchanged,
        teacherName: preview.summary.teacherName, year: preview.year
      });
    } catch (error) {
      const message = savedCount
        ? savedCount + ' of ' + preview.marks.length + ' blank marks were saved in completed batches. Import stopped: ' + error.message
        : error.message;
      return reject(res, message + ' Preview the PDF again to retry safely.', error.status || 409);
    } finally {
      activeTargets.delete(key);
    }
  }));
  router.get('/jobs/:id', wrap(async (req, res) => {
    const job = jobs.get(req.params.id);
    if (!job || job.adminId !== req.user.id) return reject(res, 'Attendance import status is no longer available.', 404);
    res.json({ status: job.status, progress: job.progress, teacherName: job.teacherName,
      year: job.year, summary: job.summary, error: job.error });
  }));
  return router;
}

async function runJob(job, admin, selected, savedSettings, { query, authorizeTarget, loadClasses,
  loadSchoolCalendar, driveService }) {
  const target = await authorizeTarget(selected.id);
  if (!target) throw new Error('This teacher does not have active access to Teacher Planner.');
  const targetOwner = target.id;
  const targetRequest = { user: target };
  const schoolRow = (await query('SELECT content FROM school_planner_settings WHERE year=$1', [job.year])).rows[0];
  if (!schoolRow) throw new Error('Publish school term dates in Kamar Uploader or Planner Setup before importing attendance.');
  let calendar;
  try { calendar = await loadSchoolCalendar(job.year); }
  catch (error) { calendar = { terms: [], publicHolidays: [], publicHolidaysError: error.message }; }
  const ranges = termRanges(schoolRow.content, calendar.terms || []);
  if (!ranges.some(range => range.startDate && range.endDate)) {
    throw new Error('Publish school term dates in Kamar Uploader or Planner Setup before importing attendance.');
  }
  let directory;
  let schedules;
  const processedByTarget = savedSettings.processed || {};
  if (!processedByTarget || typeof processedByTarget !== 'object' || Array.isArray(processedByTarget)) {
    throw new Error('Admin attendance sync settings are invalid. Save the Drive folder settings again.');
  }
  const settings = { enabled: savedSettings.enabled, folderId: savedSettings.folder_id,
    processed: processedByTarget[job.teacherId] || {} };
  const request = async path => {
    const prefix = 'attendance/' + job.year + '/';
    if (path === prefix + 'drive-sync') return settings;
    if (path === prefix + 'groups') {
      const row = (await query('SELECT content,revision FROM planner_attendance_groups WHERE owner_id=$1 AND year=$2',
        [targetOwner, job.year])).rows[0];
      return row || { content: { groups: [] }, revision: 0 };
    }
    if (path === 'attendance/classes/' + job.year) {
      directory = await loadClasses(targetRequest, job.year);
      schedules = timetableEntries(directory);
      return directory;
    }
    const week = new RegExp('^' + prefix + 'week/(\\d{4}-\\d{2}-\\d{2})$').exec(path);
    if (week && validWeek(week[1], job.year)) {
      const result = await query(`SELECT student_id,student_name,to_char(lesson_date,'YYYY-MM-DD') AS date,
        period,mark,revision FROM planner_attendance_marks
        WHERE owner_id=$1 AND year=$2 AND lesson_date >= $3::date AND lesson_date < $3::date + 5
        ORDER BY lesson_date,period,student_id`, [targetOwner, job.year, week[1]]);
      return { marks: result.rows };
    }
    const listingPath = 'google-calendar/attendance-drive/' + job.year + '/files';
    if (path === listingPath) return driveService.listFiles({ user: admin }, settings.folderId);
    const filePath = new RegExp('^' + listingPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/([A-Za-z0-9_-]+)$').exec(path);
    if (filePath) return driveService.readFile({ user: admin }, settings.folderId, filePath[1]);
    throw new Error('Admin attendance sync requested an unsupported operation.');
  };
  const mutate = async (path, body) => {
    const prefix = 'attendance/' + job.year + '/';
    if (path === prefix + 'groups') return saveAttendanceGroups(query, targetOwner, job.year, body.revision, body.content);
    if (path === prefix + 'import-marks') return saveAttendanceImportMarks(query, targetOwner, job.year, body.marks);
    if (path === prefix + 'imports') return saveAttendanceImports(query, targetOwner, job.year, body.entries);
    if (path === prefix + 'drive-sync/file') {
      if (!own(body, ['folderId', 'fileId', 'version', 'accountId', 'revision', 'retryOn', 'contextKey']) ||
          body.folderId !== settings.folderId || !/^[A-Za-z0-9_-]{10,200}$/.test(body.fileId) ||
          typeof body.version !== 'string' || !body.version.startsWith(body.fileId + ':') ||
          typeof body.accountId !== 'string' || !Number.isInteger(body.revision) ||
          (body.retryOn !== null && typeof body.retryOn !== 'string') ||
          typeof body.contextKey !== 'string' || !/^[a-f0-9]{64}$/.test(body.contextKey)) {
        throw new Error('Invalid admin attendance Drive checkpoint.');
      }
      const value = JSON.stringify({ version: body.version, accountId: body.accountId,
        revision: body.revision, retryOn: body.retryOn, contextKey: body.contextKey, completedAt: new Date().toISOString() });
      const result = await query(`UPDATE planner_attendance_admin_sync
        SET processed=jsonb_set(processed,ARRAY[$3::text,$4::text],$5::jsonb,true),
          revision=revision+1,updated_at=NOW()
        WHERE admin_id=$1 AND year=$2 AND folder_id=$6 AND enabled=true RETURNING revision`,
      [admin.id, job.year, job.teacherId, body.fileId, value, settings.folderId]);
      if (!result.rows.length) throw new Error('Admin Drive folder settings changed. Retry attendance sync.');
      settings.processed[body.fileId] = JSON.parse(value);
      return { completed: true };
    }
    throw new Error('Admin attendance sync requested an unsupported update.');
  };
  const result = await attendance.syncDrive({ request, mutate, loadSchedule: async () => schedules,
    year: job.year, ranges, school: schoolRow.content, calendar, today: localDate(), automaticTabs: true,
    onProgress: message => { job.progress = message; } });
  if (!result.enabled) throw new Error('Admin attendance Drive sync is disabled.');
  return {
    files: result.files, marksFilled: result.marks, conflictsKept: result.conflicts,
    matchWarnings: result.warnings, unchanged: result.skipped, errors: result.failed,
    ...((calendar.publicHolidaysError || calendar.publicHolidaysAvailable === false) ? {
      calendarWarning: 'Government public holiday dates could not be loaded. Verify school closures before importing.'
    } : {}),
    documents: result.documents.map(({ name, status, marks, conflicts, warnings, error }) =>
      ({ name, status, marks, conflicts: conflicts || 0, warnings: warnings || 0, ...(error ? { error } : {}) }))
  };
}

module.exports = { createAdminAttendanceRouter, termRanges, timetableEntries, localDate };
