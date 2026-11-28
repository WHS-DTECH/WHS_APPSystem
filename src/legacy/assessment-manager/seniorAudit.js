const crypto = require('node:crypto');
const express = require('express');
const { parseSeniorAuditWorkbook } = require('./seniorAuditWorkbook');
const { parseSeniorAuditPdf } = require('./seniorAuditPdf');
const { reconcileSeniorAudit } = require('./seniorAuditMatch');

const MAX_FILE = 5 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical).sort();
  if (value && typeof value === 'object') {
    return JSON.stringify(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return JSON.stringify(value);
}

async function readWorkbook(req, loadSeniorAudit, year) {
  const workbook = await loadSeniorAudit(req, { year, action: 'senior-audit-workbook' });
  if (typeof workbook?.data !== 'string' || workbook.data.length > Math.ceil(MAX_FILE / 3) * 4 ||
      workbook.data.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(workbook.data) ||
      typeof workbook.modifiedTime !== 'string' || !Number.isFinite(Date.parse(workbook.modifiedTime))) {
    throw Object.assign(new Error('The connected workbook response could not be verified.'), { status: 422 });
  }
  const data = Buffer.from(workbook.data, 'base64');
  if (data.length > MAX_FILE || data.toString('base64') !== workbook.data) {
    throw Object.assign(new Error('The connected workbook response could not be verified.'), { status: 422 });
  }
  try { return { entries: parseSeniorAuditWorkbook(data), modifiedTime: workbook.modifiedTime }; }
  catch (error) { throw Object.assign(new Error(error.message), { status: 422 }); }
}

function createSeniorAuditRouter({ query, loadSeniorAudit } = {}) {
  const router = express.Router();
  const loadDecisions = async year => (await query(`SELECT student_id,standard_number,standard_version,not_enrolled,revision
    FROM senior_audit_enrolment WHERE assessment_year=$1`, [year])).rows;
  const loadSnapshot = async (year, owner) => {
    const result = await query('SELECT * FROM senior_audit_sync WHERE assessment_year=$1 AND owner_id=$2', [year, owner]);
    return result.rows[0];
  };
  const loadJob = async (year, owner) => (await query(`SELECT status,error_message,
    started_at > now() - interval '10 minutes' AS active
    FROM senior_audit_sync_jobs WHERE assessment_year=$1 AND owner_id=$2`, [year, owner])).rows[0];
  function snapshotResult({ roster, reports, decisions, sync }) {
    const workbookLoaded = Array.isArray(sync?.workbook_entries);
    const automaticNotEnrolled = Boolean(sync?.automatic_enrolment_ready);
    return { ...reconcileSeniorAudit({ roster, reports: sync?.reports || reports, entries: sync?.workbook_entries || [], decisions,
      workbookConfirmed: workbookLoaded, sourcesComplete: Boolean(sync?.sources_complete), automaticNotEnrolled }),
    workbookLoaded, modifiedTime: sync?.workbook_modified_at || null,
    workbookCheckedAt: sync?.workbook_checked_at || null, synced: Boolean(sync), lastSyncedAt: sync?.completed_at || null,
    sourceFailures: sync?.source_failures || 0, failureDetails: sync?.failure_details || [],
    missingSaved: sync?.missing_saved || 0, folders: sync?.folders || [] };
  }
  router.get('/', async (req, res) => {
    const year = Number(req.query.year);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) return res.status(400).json({ error: 'Choose a valid assessment year.' });
    if (!UUID.test(req.user?.id || '')) return res.status(401).json({ error: 'School sign-in required.' });
    if (typeof loadSeniorAudit !== 'function' || typeof query !== 'function') {
      return res.status(503).json({ error: 'Senior audit storage or authorisation is not configured.' });
    }
    try {
      const roster = await loadSeniorAudit(req, { year, action: 'senior-audit-roster' });
      const saved = await query('SELECT source AS file, report FROM senior_audit_reports WHERE assessment_year=$1', [year]);
      const decisions = await loadDecisions(year);
      const sync = await loadSnapshot(year, req.user.id);
      const job = await loadJob(year, req.user.id);
      const currentRoster = await loadSeniorAudit(req, { year, action: 'senior-audit-roster' });
      if (JSON.stringify(canonical(currentRoster)) !== JSON.stringify(canonical(roster))) {
        throw Object.assign(new Error('Technology class links or enrolments changed. Reload the audit.'), { status: 409 });
      }
      res.json({ ...snapshotResult({ roster, reports: saved.rows, decisions, sync }),
        syncing: job?.status === 'running' && job.active,
        syncError: job?.status === 'failed' ? job.error_message :
          job?.status === 'running' && !job.active ? 'The previous background check timed out. Retry.' : null });
    } catch (error) {
      console.error('Saved senior audit reports could not be loaded.');
      res.status(Number.isInteger(error.status) && error.status >= 400 && error.status < 600 ? error.status : 502)
        .json({ error: error.status ? error.message : 'Saved audit reports could not be loaded.' });
    }
  });
  router.post('/', async (req, res) => {
    const { year, compareWorkbook } = req.body || {};
    const started = new Date().toISOString();
    if (!Number.isInteger(year) || year < 2000 || year > 2100) return res.status(400).json({ error: 'Choose a valid assessment year.' });
    if (!UUID.test(req.user?.id || '')) return res.status(401).json({ error: 'School sign-in required.' });
    if (compareWorkbook !== undefined && typeof compareWorkbook !== 'boolean') return res.status(400).json({ error: 'Choose a valid workbook comparison.' });
    if (typeof loadSeniorAudit !== 'function') return res.status(503).json({ error: 'The senior audit source is not configured.' });
    if (typeof query !== 'function') return res.status(503).json({ error: 'Senior audit storage is not configured.' });
    let runId;
    try {
      const roster = await loadSeniorAudit(req, { year, action: 'senior-audit-roster' });
      const candidate = crypto.randomUUID();
      const claimed = await query(`INSERT INTO senior_audit_sync_jobs (assessment_year,owner_id,run_id,started_at,status,error_message)
        VALUES ($1,$2,$3,now(),'running',NULL)
        ON CONFLICT (assessment_year,owner_id) DO UPDATE SET run_id=EXCLUDED.run_id,started_at=EXCLUDED.started_at,
          status='running',error_message=NULL
        WHERE senior_audit_sync_jobs.status <> 'running' OR senior_audit_sync_jobs.started_at <= now() - interval '10 minutes'
        RETURNING run_id`, [year, req.user.id, candidate]);
      if (!claimed.rows.length) return res.status(202).json({ syncing: true });
      runId = candidate;
      const [workbook, listing] = await Promise.all([
        compareWorkbook ? readWorkbook(req, loadSeniorAudit, year) : Promise.resolve(null),
        loadSeniorAudit(req, { year, action: 'senior-audit-files' })
      ]);
      if (!Array.isArray(listing.files) || listing.files.length > 200 ||
          !Array.isArray(listing.folders)) throw new Error('Invalid PDF source listing.');
      const reports = [], failures = [];
      const previous = await query('SELECT source AS file, report FROM senior_audit_reports WHERE assessment_year=$1', [year]);
      const cachedVersions = new Map(previous.rows.map(row => [row.file.id, row.file.version]));
      const changedFiles = listing.files.filter(file => cachedVersions.get(file.id) !== file.version);
      const batches = [];
      for (let i = 0; i < changedFiles.length; i += 5) batches.push(changedFiles.slice(i, i + 5));
      let next = 0;
      async function readBatch(batch) {
        let results;
        try {
          if (batch.some(file => !file || !/^[A-Za-z0-9_-]{10,200}$/.test(file.id) || typeof file.version !== 'string')) {
            throw new Error('Invalid PDF source.');
          }
          const result = await loadSeniorAudit(req, { year, action: 'senior-audit-batch',
            items: batch.map(file => ({ fileId: file.id, version: file.version })) });
          if (!Array.isArray(result.results) || result.results.length !== batch.length ||
              result.results.some((item, index) => item.file?.id !== batch[index].id || item.file?.version !== batch[index].version)) {
            throw new Error('Invalid PDF source response.');
          }
          results = result.results;
        } catch (error) {
          if (error.status === 401 || error.status === 403) throw error;
          if (batch.length > 1) {
            for (const file of batch) await readBatch([file]);
          } else failures.push({ name: batch[0]?.name || 'Unknown PDF', reason: 'Could not read or verify the PDF in Drive.' });
          return;
        }
        for (const result of results) {
          try { reports.push({ file: result.file, report: parseSeniorAuditPdf(result.report) }); }
          catch (error) { failures.push({ name: result.file.name || 'Unknown PDF', reason: error.message }); }
        }
      }
      async function worker() {
        while (next < batches.length) {
          const batch = batches[next++];
          await readBatch(batch);
        }
      }
      await Promise.all(Array.from({ length: Math.min(2, batches.length) }, () => worker()));
      const currentRoster = await loadSeniorAudit(req, { year, action: 'senior-audit-roster' });
      if (JSON.stringify(canonical(currentRoster)) !== JSON.stringify(canonical(roster))) {
        throw Object.assign(new Error('Technology class links or enrolments changed during the audit. Retry.'), { status: 409 });
      }
      if (failures.length) console.warn('Senior audit could not read or identify ' + failures.length + ' PDF source(s).');
      for (const { file, report } of reports) {
        const prefix = file.id + ':', suffix = /:[a-f0-9]{32}$/i;
        const timestamp = file.version.startsWith(prefix) && suffix.test(file.version)
          ? file.version.slice(prefix.length).replace(suffix, '') : '';
        if (!timestamp || !Number.isFinite(Date.parse(timestamp))) {
          failures.push({ name: file.name || 'Unknown PDF', reason: 'The Drive modification time could not be verified.' });
          continue;
        }
        const key = JSON.stringify(['drive-file', file.id]);
        const written = await query(`INSERT INTO senior_audit_reports (assessment_year, report_key, modified_at, source, report)
          VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)
          ON CONFLICT (assessment_year, report_key) DO UPDATE
          SET modified_at=EXCLUDED.modified_at, source=EXCLUDED.source, report=EXCLUDED.report
          WHERE senior_audit_reports.modified_at < EXCLUDED.modified_at RETURNING report_key`,
        [year, key, timestamp, JSON.stringify({ ...file, modifiedTime: timestamp }), JSON.stringify(report)]);
        if (!written.rows.length) {
          const previous = await query('SELECT modified_at, source FROM senior_audit_reports WHERE assessment_year=$1 AND report_key=$2', [year, key]);
          if (previous.rows.length !== 1) throw new Error('Saved report could not be verified.');
          if (Date.parse(previous.rows[0].modified_at) === Date.parse(timestamp) && previous.rows[0].source.version !== file.version) {
            failures.push({ name: file.name || 'Unknown PDF', reason: 'Two different reports have the same Drive modification time.' });
          }
        }
        await query(`DELETE FROM senior_audit_reports
          WHERE assessment_year=$1 AND report_key<>$2 AND source->>'id'=$3
          AND (modified_at < $4::timestamptz OR
            (modified_at = $4::timestamptz AND source->>'version'=$5))`,
        [year, key, file.id, timestamp, file.version]);
      }
      const saved = await query('SELECT source AS file, report FROM senior_audit_reports WHERE assessment_year=$1', [year]);
      const decisions = await loadDecisions(year);
      const verifiedRoster = await loadSeniorAudit(req, { year, action: 'senior-audit-roster' });
      if (JSON.stringify(canonical(verifiedRoster)) !== JSON.stringify(canonical(roster))) {
        throw Object.assign(new Error('Technology class links or enrolments changed during the audit. Retry.'), { status: 409 });
      }
      const currentVersions = new Map(listing.files.map(file => [file.id, file.version]));
      const missingSaved = saved.rows.filter(row => currentVersions.get(row.file.id) !== row.file.version).length;
      const complete = failures.length === 0 && missingSaved === 0 && listing.files.length > 0;
      await query(`INSERT INTO senior_audit_sync
        (assessment_year,owner_id,started_at,completed_at,sources_complete,source_failures,failure_details,missing_saved,folders,reports,
          workbook_checked_at,workbook_modified_at,workbook_entries,automatic_enrolment_ready)
        VALUES ($1,$2,$3,now(),$4,$5,$6::jsonb,$7,$8::jsonb,$9::jsonb,$10,$11,$12::jsonb,$13)
        ON CONFLICT (assessment_year,owner_id) DO UPDATE
        SET started_at=EXCLUDED.started_at,completed_at=EXCLUDED.completed_at,sources_complete=EXCLUDED.sources_complete,
          source_failures=EXCLUDED.source_failures,failure_details=EXCLUDED.failure_details,
          missing_saved=EXCLUDED.missing_saved,folders=EXCLUDED.folders,reports=EXCLUDED.reports,
          workbook_checked_at=COALESCE(EXCLUDED.workbook_checked_at,senior_audit_sync.workbook_checked_at),
          workbook_modified_at=COALESCE(EXCLUDED.workbook_modified_at,senior_audit_sync.workbook_modified_at),
          workbook_entries=COALESCE(EXCLUDED.workbook_entries,senior_audit_sync.workbook_entries),
          automatic_enrolment_ready=EXCLUDED.automatic_enrolment_ready
        WHERE senior_audit_sync.started_at <= EXCLUDED.started_at`,
      [year, req.user.id, started, complete, failures.length, JSON.stringify(failures), missingSaved,
        JSON.stringify(listing.folders), JSON.stringify(saved.rows), workbook ? started : null,
        workbook?.modifiedTime || null, workbook ? JSON.stringify(workbook.entries) : null, Boolean(workbook && complete)]);
      const sync = await loadSnapshot(year, req.user.id);
      await query(`UPDATE senior_audit_sync_jobs SET status='complete',error_message=NULL
        WHERE assessment_year=$1 AND owner_id=$2 AND run_id=$3`, [year, req.user.id, runId]);
      res.json(snapshotResult({ roster: verifiedRoster, reports: saved.rows, decisions, sync }));
    } catch (error) {
      console.error('Senior audit could not be completed.');
      const message = error.status ? error.message : 'The audit sources could not be checked. No results were marked complete; retry.';
      if (runId) {
        try {
          await query(`UPDATE senior_audit_sync_jobs SET status='failed',error_message=$4
            WHERE assessment_year=$1 AND owner_id=$2 AND run_id=$3`, [year, req.user.id, runId, message]);
        } catch { console.error('Senior audit background check status could not be saved.'); }
      }
      res.status(Number.isInteger(error.status) && error.status >= 400 && error.status < 600 ? error.status : 502)
        .json({ error: message });
    }
  });
  router.post('/enrolment', async (req, res) => {
    const { year, staffCode, classCode, course, number, version, studentId, notEnrolled, revision, requireWorkbook } = req.body || {};
    const id = req.user?.id;
    if (!Number.isInteger(year) || year < 2000 || year > 2100 || typeof staffCode !== 'string' || staffCode.length > 60 ||
        typeof classCode !== 'string' || classCode.length > 100 || typeof course !== 'string' || course.length > 100 ||
        typeof number !== 'string' || !/^\d{1,10}$/.test(number) ||
        typeof version !== 'string' || !/^\d{1,4}$/.test(version) ||
        !/^k:[A-Za-z0-9_-]{1,60}$/.test(studentId || '') || typeof notEnrolled !== 'boolean' ||
        (requireWorkbook !== undefined && typeof requireWorkbook !== 'boolean') ||
        !Number.isSafeInteger(revision) || revision < 0 ||
        !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id || '')) {
      return res.status(400).json({ error: 'Invalid enrolment decision. Reload the audit and try again.' });
    }
    if (typeof loadSeniorAudit !== 'function' || typeof query !== 'function') return res.status(503).json({ error: 'Senior audit storage or authorisation is not configured.' });
    try {
      const roster = await loadSeniorAudit(req, { year, action: 'senior-audit-roster' });
      const [saved, decisions, sync] = await Promise.all([
        query('SELECT source AS file, report FROM senior_audit_reports WHERE assessment_year=$1', [year]),
        loadDecisions(year), loadSnapshot(year, id)
      ]);
      if (requireWorkbook && !Array.isArray(sync?.workbook_entries)) {
        return res.status(409).json({ error: 'Compare the workbook before marking all students not enrolled.' });
      }
      const audit = reconcileSeniorAudit({ roster, reports: saved.rows, entries: sync?.workbook_entries || [], decisions,
        workbookConfirmed: Array.isArray(sync?.workbook_entries), sourcesComplete: false });
      const group = audit.groups.find(item => item.staffCode === staffCode && item.classCode === classCode && item.course === course);
      const books = group?.markbooks.filter(book => book.number === number && book.version === version) || [];
      const rows = books.flatMap(book => book.students.filter(person => person.id === studentId));
      if (!rows.length || (notEnrolled && (books.some(book => !book.url || book.conflict) ||
          rows.some(person => person.hasRecordedGrade)))) {
        return res.status(409).json({ error: 'This student and standard cannot be marked not enrolled from the current audit. Reload and check the report.' });
      }
      const currentRoster = await loadSeniorAudit(req, { year, action: 'senior-audit-roster' });
      if (JSON.stringify(canonical(currentRoster)) !== JSON.stringify(canonical(roster))) {
        return res.status(409).json({ error: 'Technology class links or enrolments changed. Reload the audit.' });
      }
      const values = [year, studentId, number, version, notEnrolled, id, revision];
      const result = revision === 0
        ? await query(`INSERT INTO senior_audit_enrolment
          (assessment_year,student_id,standard_number,standard_version,not_enrolled,updated_by)
          VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING not_enrolled,revision`, values.slice(0, 6))
        : await query(`UPDATE senior_audit_enrolment SET not_enrolled=$5,updated_by=$6,updated_at=now(),revision=revision+1
          WHERE assessment_year=$1 AND student_id=$2 AND standard_number=$3 AND standard_version=$4 AND revision=$7
          RETURNING not_enrolled,revision`, values);
      if (!result.rows.length) return res.status(409).json({ error: 'This decision changed elsewhere. Reload the audit before saving.' });
      res.json({ notEnrolled: result.rows[0].not_enrolled, revision: result.rows[0].revision });
    } catch (error) {
      console.error('Senior audit enrolment decision could not be saved.');
      res.status(Number.isInteger(error.status) && error.status >= 400 && error.status < 600 ? error.status : 502)
        .json({ error: error.status ? error.message : 'The enrolment decision could not be saved. Retry.' });
    }
  });
  return router;
}

module.exports = { createSeniorAuditRouter, readWorkbook };
