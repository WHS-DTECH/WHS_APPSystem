const express = require('express');
const { matchStudentsAuditIdentities } = require('./studentsAuditMatch');
const { readWorkbook } = require('./seniorAudit');
const { UUID } = require('./moderation');

function createStudentsAuditRouter({ query, loadSeniorAudit } = {}) {
  const router = express.Router();
  const wrap = handler => async (req, res) => {
    try {
      if (!query || !loadSeniorAudit) return res.status(503).json({ error: 'Students Audit sources are not configured.' });
      await handler(req, res);
    } catch (error) {
      console.error('Students Audit request failed.');
      res.status(Number.isInteger(error.status) && error.status >= 400 && error.status < 600 ? error.status : 502)
        .json({ error: error.status ? error.message : 'Students Audit could not be verified. Retry; saved evidence is unchanged.' });
    }
  };
  async function scope(req, year, departmentId) {
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      throw Object.assign(new Error('Choose a valid assessment year.'), { status: 400 });
    }
    const roster = await loadSeniorAudit(req, { year, action: 'students-audit-roster' });
    const department = departmentId ? roster.departments.find(item => item.id === departmentId) : null;
    if (departmentId && !department) throw Object.assign(new Error('This department is no longer authorised.'), { status: 403 });
    return { roster, department };
  }
  router.get('/marking', wrap(async (req, res) => {
    const year = Number(req.query.year), record = req.query.record, departmentId = req.query.departmentId;
    if (!UUID.test(String(record || '')) || !UUID.test(String(departmentId || '')) ||
        !UUID.test(String(req.user?.id || ''))) {
      throw Object.assign(new Error('Choose a valid assessment and department.'), { status: 400 });
    }
    const { roster, department } = await scope(req, year, departmentId);
    if (!department.markbookEvidence || !Array.isArray(department.identityMemberships)) {
      throw Object.assign(new Error('Markbook identity evidence is not available for this department.'), { status: 403 });
    }
    const assessment = (await query(`SELECT content FROM assessment_records
      WHERE owner_id=$1 AND year=$2 AND entry_key=$3 AND parent_record IS NULL`,
    [req.user.id, year, record])).rows[0];
    if (!assessment) throw Object.assign(new Error('The assessment record is unavailable.'), { status: 404 });
    const { standardNumber: number, version } = assessment.content;
    if (!/^\d{4,8}$/.test(number || '') || !/^\d{1,3}$/.test(version || '')) {
      throw Object.assign(new Error('Record a standard number and version before loading marking students.'), { status: 409 });
    }
    const sync = (await query('SELECT * FROM senior_audit_sync WHERE assessment_year=$1 AND owner_id=$2',
      [year, req.user.id])).rows[0];
    if (!sync) throw Object.assign(new Error('Sync Senior Audit markbook PDFs before loading marking students.'), { status: 409 });
    const courses = new Set(department.courses);
    let reports = (sync.reports || []).filter(source => source.report?.number === number &&
      source.report?.version === version && courses.has(source.report?.course));
    const type = assessment.content.standardType;
    if (type === 'Unit' || type === 'Achievement') reports = reports.filter(source =>
      source.report.kind === type.toLowerCase());
    const kinds = new Set(reports.map(source => source.report.kind));
    if (kinds.size > 1) throw Object.assign(new Error('Both unit and achievement PDFs match this number and version. Identify the standard type before loading students.'), { status: 409 });
    const matched = matchStudentsAuditIdentities({ students: roster.students,
      memberships: department.identityMemberships.filter(item => courses.has(item.course)), reports });
    const ids = [...new Set(matched.evidence.flatMap(item => item.students.map(person => person.id)))];
    const identities = await loadSeniorAudit(req, { year, departmentId, action: 'marking-identities', studentIds: ids });
    if (!Array.isArray(identities?.identities) || !Array.isArray(identities.memberships) ||
      identities.memberships.some(item => !ids.includes(item.id) || !courses.has(item.course) ||
        typeof item.classCode !== 'string' || !item.classCode.trim() || item.classCode.length > 80) ||
      identities.identities.some(item =>
      !ids.includes(item.id) || typeof item.email !== 'string' || item.email !== item.email.trim().toLowerCase() ||
      item.email.length > 254 || !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(item.email)) ||
      new Set(identities.identities.map(item => item.id)).size !== identities.identities.length ||
      new Set(identities.identities.map(item => item.email)).size !== identities.identities.length) {
      throw new Error('The KAMAR marking identity response is invalid.');
    }
    const emails = new Map(identities.identities.map(item => [item.id, item.email]));
    const sources = new Map(reports.map(source =>
      ['https://drive.google.com/file/d/' + encodeURIComponent(source.file.id) + '/view', source]));
    const evidence = matched.evidence.map(item => {
      const source = sources.get(item.url);
      return { ...item, modifiedTime: source.file.modifiedTime || null,
        teachers: [...new Set(source.report.rows.flatMap(row => row.teachers || []))].sort(),
        students: item.students.map(person => ({ ...person, email: emails.get(person.id) || '',
          classCodes: [...new Set(identities.memberships.filter(membership =>
            membership.id === person.id && membership.course === item.course).map(membership => membership.classCode))].sort() })) };
    });
    const saved = (await query('SELECT * FROM students_audit_sync WHERE assessment_year=$1 AND department_id=$2',
      [year, departmentId])).rows[0];
    res.json({ standardNumber: number, version, evidence, issues: matched.identityMatching.flatMap(course => course.issues),
      syncedAt: sync.completed_at, complete: sync.sources_complete,
      summary: saved ? { syncedAt: saved.completed_at,
        entries: saved.entries.filter(entry => courses.has(entry.course) && entry.number === number &&
          String(entry.version) === version && (!kinds.size || kinds.has(entry.kind))) } : null });
  }));
  router.get('/', wrap(async (req, res) => {
    const year = Number(req.query.year);
    const { roster, department } = await scope(req, year, req.query.departmentId);
    if (!department) return res.json({ ...roster, summary: null, workbook: null, evidence: [] });
    const saved = (await query('SELECT * FROM students_audit_sync WHERE assessment_year=$1 AND department_id=$2',
      [year, department.id])).rows[0];
    let evidence = [], evidenceSyncedAt = null, evidenceComplete = false, unresolved = 0, identityMatching = null;
    if (department.markbookEvidence) {
      if (!Array.isArray(department.identityMemberships)) {
        throw Object.assign(new Error('Current KAMAR course identities are unavailable. Update Core and reload Students Audit.'), { status: 503 });
      }
      const sync = (await query('SELECT * FROM senior_audit_sync WHERE assessment_year=$1 AND owner_id=$2',
        [year, req.user.id])).rows[0];
      const matched = matchStudentsAuditIdentities({ students: roster.students,
        memberships: department.identityMemberships.filter(item => department.courses.includes(item.course)),
        reports: sync?.reports || [] });
      ({ evidence, identityMatching, unresolved } = matched);
      if (sync) {
        evidenceSyncedAt = sync.completed_at;
        evidenceComplete = sync.sources_complete;
      }
    }
    const allowed = new Set(department.courses);
    res.json({ ...roster, summary: saved ? { file: saved.source, entries: saved.entries.filter(entry => allowed.has(entry.course)),
      syncedAt: saved.completed_at } : null,
    workbook: department.markbookEvidence && saved?.workbook ? { ...saved.workbook,
      entries: saved.workbook.entries.filter(entry => allowed.has(entry.course)) } : null,
    evidence, evidenceSyncedAt, evidenceComplete, unresolved, identityMatching });
  }));
  router.post('/', wrap(async (req, res) => {
    const { year, departmentId } = req.body || {};
    const started = new Date().toISOString();
    const { department } = await scope(req, year, departmentId);
    if (!department) throw Object.assign(new Error('Choose an authorised department to sync.'), { status: 400 });
    const [source, original] = await Promise.all([
      loadSeniorAudit(req, { year, departmentId, action: 'students-audit-enrolments' }),
      department.markbookEvidence ? readWorkbook(req, loadSeniorAudit, year) : Promise.resolve(null)
    ]);
    if (!source.file || !Array.isArray(source.entries) || !source.entries.length) {
      throw Object.assign(new Error('No senior standards for the linked department courses were found in the EnrolledList PDF.'), { status: 422 });
    }
    const verified = await scope(req, year, departmentId);
    if (original && !verified.department.markbookEvidence) {
      throw Object.assign(new Error('Spreadsheet access changed during the sync. Reload Enrolment Summary.'), { status: 403 });
    }
    const allowed = new Set(verified.department.courses);
    const entries = source.entries.filter(entry => allowed.has(entry.course));
    if (!entries.length) {
      throw Object.assign(new Error('Department course links changed during the sync. Reload Enrolment Summary.'), { status: 409 });
    }
    const workbook = original ? { checkedAt: started, modifiedTime: original.modifiedTime,
      url: 'https://docs.google.com/spreadsheets/d/1ugLHLfv_VtSraRdqG3pUFCevv7udzLLp/edit?usp=sharing',
      entries: original.entries.map(entry => ({
        course: entry.Module_Enrol.split(/_x000B_|[\r\n\v]/i)[0].trim().toUpperCase(),
        number: entry.Number_AsNum, version: entry.Version, title: entry.Title,
        name: entry.zc_Stu_Name_Last_First_Preferred, yearLevel: entry.zc_Stu_Level,
        teacher: entry.Teacher_Markbook, markbookResult: entry.zc_Result_Markbook,
        printoutResult: entry.zc_Result_Printouts
      })).filter(entry => allowed.has(entry.course)) } : null;
    const written = await query(`INSERT INTO students_audit_sync
      (assessment_year,department_id,started_at,source,entries,workbook) VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb)
      ON CONFLICT (assessment_year,department_id) DO UPDATE SET started_at=EXCLUDED.started_at,
        completed_at=now(),source=EXCLUDED.source,entries=EXCLUDED.entries,workbook=EXCLUDED.workbook
      WHERE students_audit_sync.started_at <= EXCLUDED.started_at RETURNING completed_at`,
    [year, departmentId, started, JSON.stringify(source.file), JSON.stringify(entries), JSON.stringify(workbook)]);
    if (!written.rows.length) throw Object.assign(new Error('A newer sync finished first. Reload Students Audit.'), { status: 409 });
    res.json({ syncedAt: written.rows[0].completed_at });
  }));
  return router;
}

module.exports = { createStudentsAuditRouter };
