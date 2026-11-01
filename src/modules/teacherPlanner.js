const express = require('express');
const helmet = require('helmet');
const { Pool } = require('pg');
const config = require('../config');
const { query: coreQuery } = require('../db');
const { query: kamarQuery } = require('../legacy/kamar-uploader/db');
const { authorisedModuleUser } = require('../moduleIdentity');
const { staffDirectory, attendanceClasses } = require('../kamarDirectory');
const { loadSchoolCalendar } = require('../schoolCalendar');
const { createModuleRouter } = require('../legacy/teacher-planner/app');
const { pickerPolicy } = require('../legacy/teacher-planner/googleDrive');
const { selectRegionalHolidays } = require('../legacy/teacher-planner/regionalHolidays');

const PREFIX = '/teacher-planner';

function databaseOptions(env = process.env, coreUrl = config.databaseUrl) {
  const connectionString = env.TEACHER_PLANNER_DATABASE_URL;
  if (!connectionString) throw new Error('Set TEACHER_PLANNER_DATABASE_URL to the existing Teacher Planner database. No fallback is used.');
  const target = new URL(connectionString);
  if (!['postgres:', 'postgresql:'].includes(target.protocol) || !target.hostname || target.pathname === '/') {
    throw new Error('Teacher Planner requires its existing PostgreSQL database.');
  }
  for (const otherUrl of [coreUrl, env.INTEGRATION_KAMAR_DATABASE_URL].filter(Boolean)) {
    const other = new URL(otherUrl);
    if (target.hostname === other.hostname && (target.port || '5432') === (other.port || '5432') && target.pathname === other.pathname) {
      throw new Error('Teacher Planner must not use the Core or Kamar database.');
    }
  }
  return { connectionString, ssl: env.TEACHER_PLANNER_DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
    max: 5, connectionTimeoutMillis: 10000 };
}

function createTeacherPlannerRouter({ env = process.env, dbQuery = coreQuery, directoryQuery = kamarQuery,
  plannerQuery, schoolCalendar = loadSchoolCalendar } = {}) {
  const router = express.Router();
  let database, ready, module;
  const query = plannerQuery || ((...args) => {
    if (!database) {
      database = new Pool(databaseOptions(env));
      database.on('error', () => console.error('Teacher Planner idle database connection failed.'));
    }
    return database.query(...args);
  });
  const plannerEnv = { ...env, APP_BASE_URL: env.APP_BASE_URL || env.RENDER_EXTERNAL_URL,
    TEACHER_PLANNER_BASE_PATH: PREFIX };
  const calendar = (req, year) => schoolCalendar(year);
  function initialize() {
    if (!ready) ready = Promise.resolve().then(async () => {
      for (const table of ['planner_sections', 'school_planner_settings', 'teacher_calendar_settings',
        'google_calendar_connections', 'school_duty_rosters', 'planner_attendance_groups', 'planner_attendance_marks']) {
        await query(`SELECT * FROM ${table} LIMIT 0`);
      }
      module = createModuleRouter({ query, env: plannerEnv, loadSchoolCalendar: calendar,
        loadStaff: (req, options) => staffDirectory(req.user, options, directoryQuery, dbQuery),
        loadClasses: (req, year) => attendanceClasses(req.user, year, directoryQuery) });
    }).catch(error => { ready = null; throw error; });
    return ready;
  }
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!req.user) {
      if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'School sign-in required. Copy unsaved work before signing in again.' });
      return res.redirect('/auth/google?next=' + encodeURIComponent(req.originalUrl));
    }
    next();
  });
  router.use(async (req, res, next) => {
    try {
      const user = await authorisedModuleUser(req.user.id, 'teacher-planner', dbQuery);
      if (!user) {
        console.warn('Teacher Planner access denied.');
        return res.status(403).json({ error: 'Teacher Planner must be active and assigned to your active school account.' });
      }
      // Use the same Core identity and module-role projection as the standalone handoff.
      req.user = user;
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        const origin = new URL(plannerEnv.APP_BASE_URL).origin;
        if (req.get('origin') !== origin) {
          console.warn('Cross-origin Teacher Planner mutation rejected.');
          return res.status(403).json({ error: 'Submit changes from the Teacher Planner site.' });
        }
      }
      next();
    } catch (error) { next(error); }
  });
  router.get('/auth/global-control', (req, res) => {
    const { authReturn } = require('../legacy/teacher-planner/authReturn');
    res.redirect(PREFIX + authReturn(req.query.next));
  });
  router.use(async (req, res, next) => {
    try { await initialize(); next(); }
    catch {
      console.error('Teacher Planner existing database or integration configuration is unavailable.');
      res.status(503).json({ error: 'Teacher Planner is unavailable. Check its existing database and Google integration configuration. No fallback or data migration is used.' });
    }
  });
  router.use(helmet(pickerPolicy(['https://lh3.googleusercontent.com'])));
  router.get('/health', async (req, res) => {
    try {
      await query('SELECT 1');
      res.json({ status: 'ok', database: 'existing-teacher-planner', importsEnabled: false });
    } catch {
      console.error('Teacher Planner existing database health check failed.');
      res.status(503).json({ status: 'error', error: 'The existing Teacher Planner database is unavailable.' });
    }
  });
  router.get('/api/school-calendar/:year', async (req, res, next) => {
    const year = Number(req.params.year);
    if (!/^\d{4}$/.test(req.params.year) || year < 2000 || year > 2100) {
      console.warn('Teacher Planner calendar year rejected.');
      return res.status(400).json({ error: 'Choose a valid calendar year.' });
    }
    try {
      const preferences = await query("SELECT content FROM planner_sections WHERE owner_id=$1 AND year=2000 AND section='preferences' AND entry_key='main'", [req.user.id]);
      res.json(selectRegionalHolidays(await calendar(req, year), preferences.rows[0]?.content.anniversaryRegion || 'Westland'));
    } catch (error) { next(error); }
  });
  router.use((req, res, next) => module(req, res, next));
  router.use((error, req, res, next) => {
    console.error('Teacher Planner request failed.');
    if (res.headersSent) return next(error);
    res.status(500).json({ error: 'Teacher Planner request failed. Contact an administrator.' });
  });
  return router;
}

module.exports = { createTeacherPlannerRouter, databaseOptions, PREFIX };
