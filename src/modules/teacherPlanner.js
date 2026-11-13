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
const CONFIGURATION_ERRORS = new Set([
  'Set TEACHER_PLANNER_DATABASE_URL to the existing Teacher Planner database. No fallback is used.',
  'Teacher Planner requires its existing PostgreSQL database.',
  'Teacher Planner must not use the Core or Kamar database.',
  'Set all three GOOGLE_CALENDAR credentials.',
  'GOOGLE_CALENDAR_TOKEN_KEY must be a base64-encoded 32-byte key.',
  'Google Calendar requires an HTTPS APP_BASE_URL origin.'
]);

function configurationFailure(error, fallback) {
  return new Error(CONFIGURATION_ERRORS.has(error.message) ? error.message : fallback);
}

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
  async function loadAdminTeachers() {
    const staff = (await directoryQuery(`SELECT code,first_name,last_name,email_school FROM staff_upload
      WHERE status='Current' AND NULLIF(TRIM(code),'') IS NOT NULL AND NULLIF(TRIM(email_school),'') IS NOT NULL
      ORDER BY lower(trim(last_name)) NULLS LAST,lower(trim(first_name)) NULLS LAST,code`)).rows;
    const byEmail = new Map();
    for (const item of staff) {
      const email = String(item.email_school).trim().toLowerCase();
      byEmail.set(email, [...(byEmail.get(email) || []), item]);
    }
    const emails = [...byEmail].filter(([, matches]) => matches.length === 1).map(([email]) => email);
    if (!emails.length) return [];
    const users = (await dbQuery(`SELECT id::text,email,display_name FROM users
      WHERE is_active=true AND lower(trim(email))=ANY($1::text[])`, [emails])).rows;
    const byUserEmail = new Map();
    for (const user of users) {
      const email = String(user.email).trim().toLowerCase();
      byUserEmail.set(email, [...(byUserEmail.get(email) || []), user]);
    }
    return emails.flatMap(email => {
      const matches = byUserEmail.get(email) || [];
      if (matches.length !== 1) return [];
      const person = byEmail.get(email)[0];
      const user = matches[0];
      return [{ id: user.id, staffCode: person.code, name: [person.first_name, person.last_name]
        .map(value => String(value || '').trim()).filter(Boolean).join(' ') || user.display_name || email }];
    });
  }
  const authorizeAttendanceTarget = userId => authorisedModuleUser(userId, 'teacher-planner', dbQuery);
  function initialize() {
    if (!ready) ready = Promise.resolve().then(async () => {
      if (!plannerQuery) {
        try { databaseOptions(env); }
        catch (error) {
          throw configurationFailure(error, 'Check TEACHER_PLANNER_DATABASE_URL and the Core/Kamar database URL formats. Do not share their values.');
        }
      }
      for (const table of ['planner_sections', 'school_planner_settings', 'teacher_calendar_settings',
        'google_calendar_connections', 'school_duty_rosters', 'planner_attendance_groups', 'planner_attendance_marks',
        'planner_attendance_admin_sync']) {
        try { await query(`SELECT * FROM ${table} LIMIT 0`); }
        catch (error) {
          const code = typeof error.code === 'string' && /^[A-Z0-9_]{2,30}$/.test(error.code) ? ` (${error.code})` : '';
          const detail = error.code === '42P01' ? `The existing Planner database is missing table ${table}. Check that this is the standalone Planner database and its schema is up to date.` :
            error.code === '28P01' ? 'The existing Planner database rejected its login credentials.' :
            error.code === '3D000' ? 'The configured Planner database does not exist.' :
            error.code === '42501' ? `The Planner database account lacks permission to read ${table}.` :
            `Could not read ${table} from the existing Planner database. Check connection access and availability.`;
          throw new Error(detail + code);
        }
      }
      try {
        module = createModuleRouter({ query, env: plannerEnv, loadSchoolCalendar: calendar,
          loadStaff: (req, options) => staffDirectory(req.user, options, directoryQuery, dbQuery),
          loadClasses: (req, year, term) => attendanceClasses(req.user, year, directoryQuery, term),
          loadAdminTeachers, authorizeAttendanceTarget });
      } catch (error) {
        throw configurationFailure(error, 'Planner Google integration setup failed. Check APP_BASE_URL and the linked Google Calendar environment group.');
      }
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
    catch (error) {
      console.error('Teacher Planner setup failed:', error.message);
      res.status(503).json({
        error: 'Teacher Planner is unavailable. Check its existing database and Google integration configuration. No fallback or data migration is used.',
        ...(req.user.roles.includes('ADMIN') ? { diagnostic: error.message } : {})
      });
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
  router.loadMyStandards = async (userId, year) => {
    if (typeof userId !== 'string' || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(userId) ||
        !Number.isInteger(year) || year < 2000 || year > 2100) {
      throw new Error('Choose a valid Teacher Planner user and year.');
    }

    if (!plannerQuery) databaseOptions(env);
    const result = await query(
      `SELECT content FROM planner_sections
       WHERE owner_id = $1 AND year = $2 AND section = 'assessmentSetup' AND entry_key = 'main'`,
      [userId, year]
    );
    const saved = result.rows[0]?.content?.selectedStandards;
    if (saved === undefined) {
      return [];
    }

    let standards;
    try {
      standards = JSON.parse(saved);
    } catch {
      throw new Error('Saved My Standards data could not be read.');
    }
    if (!Array.isArray(standards) || standards.length > 100 ||
        !standards.every((item) => item && typeof item.number === 'string' && /^\d{4,8}$/.test(item.number) &&
          typeof item.title === 'string' && item.title.trim() && item.title.length <= 300)) {
      throw new Error('Saved My Standards data is invalid.');
    }

    return standards.map(({ number, title, subject, level, version }) => ({
      number,
      title: title.trim(),
      subject: typeof subject === 'string' ? subject : '',
      level: typeof level === 'string' ? level : '',
      version: typeof version === 'string' ? version : ''
    }));
  };
  router.use((req, res, next) => module(req, res, next));
  router.use((error, req, res, next) => {
    console.error('Teacher Planner request failed.');
    if (res.headersSent) return next(error);
    res.status(500).json({ error: 'Teacher Planner request failed. Contact an administrator.' });
  });
  return router;
}

module.exports = { createTeacherPlannerRouter, databaseOptions, PREFIX };
