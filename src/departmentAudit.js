const { createGoogleCalendarAccess, decryptTokens } = require('./legacy/teacher-planner/googleCalendar');
const { createAttendanceDriveService, folderId, DRIVE_SCOPE } = require('./legacy/teacher-planner/attendanceDrive');
const { importDepartmentPdf, DepartmentPdfError } = require('./legacy/teacher-planner/departmentAuditPdf');

const subjects = ['TEXT', 'WOOD & DVC', 'FOOD', 'DTECH'];
class DepartmentAuditError extends Error {
  constructor(message, status = 502) { super(message); this.status = status; }
}

async function readDepartmentAudit({ user, input, query, env, fetchImpl = fetch }) {
  const root = folderId(input.folder);
  if (!root) throw new DepartmentAuditError('Paste a valid department Google Drive folder link.', 400);
  const connection = createGoogleCalendarAccess({ query, env, fetchImpl });
  if (!connection.config) throw new DepartmentAuditError('Google Drive access is not configured in Teacher Planner.', 503);
  const service = createAttendanceDriveService({
    ...connection, fetchImpl, ErrorType: DepartmentAuditError, purpose: 'Department audit',
    parsePdf: importDepartmentPdf, pdfError: DepartmentPdfError,
    hasScope: row => (decryptTokens(row.encrypted_tokens, connection.config.key, row.owner_id).scopes || []).includes(DRIVE_SCOPE)
  });
  const req = { user };
  const folders = await Promise.all(subjects.map(async label => ({ label, ...await service.listFiles(req, root, label) })));
  if (new Set(folders.map(folder => folder.connectionId)).size !== 1) {
    throw new DepartmentAuditError('Your Google connection changed. Refresh the department audit.', 409);
  }
  const files = new Map();
  for (const folder of folders) for (const file of folder.files) {
    files.set(file.id, { ...file, subjectFolder: file.folderId === root ? 'Department root' : folder.label });
  }
  if (files.size > 200) throw new DepartmentAuditError('Keep at most 200 PDF exports in the department audit folders.', 422);
  if (input.action === 'department-audit-files') {
    return { files: [...files.values()], folders: folders.map(folder => ({ name: folder.label, found: Boolean(folder.staffFolder) })) };
  }
  const file = files.get(input.fileId);
  if (!file || file.version !== input.version) throw new DepartmentAuditError('The PDF was moved or changed. Refresh the audit.', 409);
  const result = await service.readFile(req, file.folderId, file.id, root,
    file.folderId === root ? '' : file.subjectFolder);
  if (result.version !== file.version || result.connectionId !== folders[0].connectionId) {
    throw new DepartmentAuditError('The PDF or Google connection changed. Refresh the audit.', 409);
  }
  return { file, report: result.pdf };
}

module.exports = { readDepartmentAudit };
