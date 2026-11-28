const express = require('express');
const helmet = require('helmet');
const { Pool } = require('pg');
const config = require('../config');
const { query: coreQuery } = require('../db');
const { query: kamarQuery } = require('../legacy/kamar-uploader/db');
const { authorisedModuleUser } = require('../moduleIdentity');
const { assessmentModerationAccess } = require('../assessmentModerationAccess');
const { staffDirectory } = require('../kamarDirectory');
const { createStudentTrackerService } = require('../studentTracker');
const { createModuleRouter } = require('../legacy/assessment-manager/app');
const { pickerPolicy } = require('../legacy/assessment-manager/googleDrive');

const PREFIX = '/whs-assessment-manager';
const MODULE_KEY = 'whs-assessment-manager';
const TABLES = [
  'assessment_records', 'assessment_settings', 'assessment_audit',
  'assessment_resource_library', 'assessment_resource_library_history', 'assessment_resource_library_drafts',
  'assessment_home_calendar', 'assessment_home_tasks', 'assessment_home_audit', 'assessment_calendar_cache',
  'assessment_school_calendar', 'assessment_school_calendar_history',
  'assessment_suppliers', 'assessment_supplier_reminders', 'assessment_exam_timetable_cache',
  'assessment_verifiers', 'assessment_verifier_history',
  'senior_audit_reports', 'senior_audit_enrolment', 'senior_audit_sync',
  'senior_audit_sync_jobs', 'students_audit_sync'
];
const MIGRATIONS = [
  '001_initial.sql', '002_assessment_records.sql', '003_resource_library.sql',
  '004_assessment_home.sql', '005_school_calendar.sql', '006_library_drafts_and_deletion.sql',
  '007_suppliers.sql', '008_exam_timetable_cache.sql', '009_verifiers.sql',
  '010_senior_audit_reports.sql', '011_senior_audit_enrolment.sql',
  '012_senior_audit_sync.sql', '013_senior_audit_automatic_enrolment.sql',
  '014_students_audit.sql', '015_students_audit_workbook.sql'
];

function databaseOptions(env = process.env, coreUrl = config.databaseUrl) {
  const connectionString = env.ASSESSMENT_MANAGER_DATABASE_URL;
  if (!connectionString) throw new Error('Set ASSESSMENT_MANAGER_DATABASE_URL to the existing Assessment Manager database. No fallback is used.');
  const target = new URL(connectionString);
  if (!['postgres:', 'postgresql:'].includes(target.protocol) || !target.hostname || target.pathname === '/') {
    throw new Error('Assessment Manager requires its existing PostgreSQL database.');
  }
  for (const otherUrl of [coreUrl, env.INTEGRATION_KAMAR_DATABASE_URL, env.TEACHER_PLANNER_DATABASE_URL].filter(Boolean)) {
    const other = new URL(otherUrl);
    if (target.hostname === other.hostname && (target.port || '5432') === (other.port || '5432') && target.pathname === other.pathname) {
      throw new Error('Assessment Manager must not use the Core, KAMAR or Teacher Planner database.');
    }
  }
  return {
    connectionString, ssl: env.ASSESSMENT_MANAGER_DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
    max: 5, connectionTimeoutMillis: 10000
  };
}

function createAssessmentManagerRouter({ env = process.env, dbQuery = coreQuery, directoryQuery = kamarQuery,
  assessmentQuery, trackerService } = {}) {
  const router = express.Router();
  const tracker = trackerService || createStudentTrackerService({ dbQuery, directoryQuery, env });
  let database, ready, module;
  const query = assessmentQuery || ((...args) => {
    if (!database) {
      database = new Pool(databaseOptions(env));
      database.on('error', () => console.error('Assessment Manager idle database connection failed.'));
    }
    return database.query(...args);
  });

  function initialize() {
    if (!ready) ready = Promise.resolve().then(async () => {
      if (!assessmentQuery) databaseOptions(env);
      const applied = await query('SELECT name FROM module_migrations WHERE name = ANY($1::text[])', [MIGRATIONS]);
      if (applied.rows.length !== MIGRATIONS.length) throw new Error('Assessment Manager database migrations are incomplete.');
      for (const table of TABLES) await query(`SELECT * FROM ${table} LIMIT 0`);
      module = createModuleRouter({
        query, env: { ...env,
          GOOGLE_DRIVE_CLIENT_ID: env.ASSESSMENT_MANAGER_GOOGLE_DRIVE_CLIENT_ID,
          GOOGLE_DRIVE_API_KEY: env.ASSESSMENT_MANAGER_GOOGLE_DRIVE_API_KEY,
          GOOGLE_DRIVE_APP_ID: env.ASSESSMENT_MANAGER_GOOGLE_DRIVE_APP_ID
        },
        loadStaff: req => staffDirectory(req.user, {}, directoryQuery, dbQuery),
        loadTeachingSubjects: (req, year) => tracker.teachingSubjects(req.user, { year }),
        loadClassSize: (req, year, course) => tracker.courseSize(req.user, { year, course }),
        loadModerationAccess: req => assessmentModerationAccess(req.user, directoryQuery, dbQuery),
        loadSeniorAudit: (req, input) => tracker.seniorAudit(req.user, input)
      });
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
      const user = await authorisedModuleUser(req.user.id, MODULE_KEY, dbQuery);
      if (!user) return res.status(403).json({ error: 'Assessment Manager must be active and assigned to your active school account.' });
      req.user = user;
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        const baseUrl = env.APP_BASE_URL || env.RENDER_EXTERNAL_URL;
        if (!baseUrl || req.get('origin') !== new URL(baseUrl).origin) {
          return res.status(403).json({ error: 'Submit changes from the Assessment Manager site.' });
        }
      }
      next();
    } catch (error) { next(error); }
  });
  router.use(async (req, res, next) => {
    try { await initialize(); next(); }
    catch {
      console.error('Assessment Manager setup failed. Check its separate database and schema.');
      res.status(503).json({ error: 'Assessment Manager is unavailable. Check its existing database and schema. No fallback or data migration is used.' });
    }
  });
  router.use(helmet(pickerPolicy(['https://lh3.googleusercontent.com'])));
  router.use((req, res, next) => module(req, res, next));
  router.use((error, req, res, next) => {
    console.error('Assessment Manager request failed.');
    if (res.headersSent) return next(error);
    res.status(500).json({ error: 'Assessment Manager request failed. Contact an administrator.' });
  });
  return router;
}

module.exports = { createAssessmentManagerRouter, databaseOptions, PREFIX };
