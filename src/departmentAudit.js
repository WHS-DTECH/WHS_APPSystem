const crypto = require('node:crypto');
const { createGoogleCalendarAccess, decryptTokens } = require('./legacy/teacher-planner/googleCalendar');
const { createAttendanceDriveService, folderId, DRIVE_SCOPE } = require('./legacy/teacher-planner/attendanceDrive');
const { importDepartmentPdf, DepartmentPdfError } = require('./legacy/teacher-planner/departmentAuditPdf');

const subjects = ['TEXT', 'WOOD & DVC', 'FOOD', 'DTECH'];
const seniorWorkbookId = '1ugLHLfv_VtSraRdqG3pUFCevv7udzLLp';
const workbookType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const maxWorkbook = 5 * 1024 * 1024;
class DepartmentAuditError extends Error {
  constructor(message, status = 502) { super(message); this.status = status; }
}

async function readDepartmentAudit({ user, input, query, env, fetchImpl = fetch, subjectFolders = subjects }) {
  const root = folderId(input.folder);
  if (!root) throw new DepartmentAuditError('Paste a valid department Google Drive folder link.', 400);
  const connection = createGoogleCalendarAccess({ query, env, fetchImpl });
  if (!connection.config) throw new DepartmentAuditError('Google Drive access is not configured in Teacher Planner.', 503);
  if (input.action === 'senior-audit-workbook') {
    const row = await connection.ensureConnected({ user });
    if (!(decryptTokens(row.encrypted_tokens, connection.config.key, row.owner_id).scopes || []).includes(DRIVE_SCOPE)) {
      throw new DepartmentAuditError('Connect read-only Google Drive access in Teacher Planner before comparing the workbook.', 409);
    }
    const token = await connection.access(row);
    async function get(suffix) {
      const response = await fetchImpl('https://www.googleapis.com/drive/v3/files/' + seniorWorkbookId + suffix, {
        headers: { Authorization: 'Bearer ' + token }, redirect: 'error', signal: AbortSignal.timeout(30000)
      });
      if (response.status === 401) throw new DepartmentAuditError('Google Drive access expired. Reconnect your Google account.', 409);
      if (response.status === 403 || response.status === 404) throw new DepartmentAuditError('Google could not read the connected audit workbook. Check that your connected Google account can access it.', 403);
      if (!response.ok) throw new DepartmentAuditError('Google Drive could not read the audit workbook. Retry comparison.');
      return response;
    }
    const fields = '?supportsAllDrives=true&fields=id,mimeType,modifiedTime,md5Checksum,size,trashed';
    const valid = file => file?.id === seniorWorkbookId && file.mimeType === workbookType && file.trashed === false &&
      typeof file.modifiedTime === 'string' && Number.isFinite(Date.parse(file.modifiedTime)) &&
      /^[a-f0-9]{32}$/i.test(file.md5Checksum || '') && /^\d+$/.test(file.size || '') && Number(file.size) <= maxWorkbook;
    const before = await (await get(fields)).json();
    if (!valid(before)) throw new DepartmentAuditError('The connected audit workbook is unavailable or is not a supported Excel file under 5 MB.', 422);
    const response = await get('?alt=media&supportsAllDrives=true');
    if (Number(response.headers.get('content-length')) > maxWorkbook) {
      await response.body?.cancel();
      throw new DepartmentAuditError('The audit workbook exceeds 5 MB.', 422);
    }
    const reader = response.body.getReader(), chunks = [];
    let length = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > maxWorkbook) {
          await reader.cancel();
          throw new DepartmentAuditError('The audit workbook exceeds 5 MB.', 422);
        }
        chunks.push(Buffer.from(value));
      }
    } finally { reader.releaseLock(); }
    const data = Buffer.concat(chunks);
    const after = await (await get(fields)).json();
    if (!valid(after) || after.modifiedTime !== before.modifiedTime || after.md5Checksum !== before.md5Checksum ||
        crypto.createHash('md5').update(data).digest('hex') !== before.md5Checksum.toLowerCase()) {
      throw new DepartmentAuditError('The audit workbook changed while being read. Retry comparison.', 409);
    }
    await connection.unchanged(row);
    return { data: data.toString('base64'), modifiedTime: after.modifiedTime };
  }
  const service = createAttendanceDriveService({
    ...connection, fetchImpl, ErrorType: DepartmentAuditError, purpose: 'Department audit',
    folderAliases: new Map([['WOOD & DVC', ['WOOD']]]),
    parsePdf: importDepartmentPdf, pdfError: DepartmentPdfError,
    hasScope: row => (decryptTokens(row.encrypted_tokens, connection.config.key, row.owner_id).scopes || []).includes(DRIVE_SCOPE)
  });
  const req = { user };
  const folders = await Promise.all(subjectFolders.map(async label => ({ label, ...await service.listFiles(req, root, label) })));
  if (new Set(folders.map(folder => folder.connectionId)).size !== 1) {
    throw new DepartmentAuditError('Your Google connection changed. Refresh the department audit.', 409);
  }
  const files = new Map();
  for (const folder of folders) for (const file of folder.files) {
    files.set(file.id, { ...file, subjectFolder: file.folderId === root ? 'Department root' : folder.label });
  }
  if (files.size > 200) throw new DepartmentAuditError('Keep at most 200 PDF exports in the department audit folders.', 422);
  if (input.action === 'department-audit-files' || input.action === 'senior-audit-files') {
    return { files: [...files.values()], folders: folders.map(folder => ({ name: folder.label, found: Boolean(folder.staffFolder) })) };
  }
  async function readOne(selection) {
    const file = files.get(selection.fileId);
    if (!file || file.version !== selection.version) throw new DepartmentAuditError('The PDF was moved or changed. Refresh the audit.', 409);
    const result = await service.readFile(req, file.folderId, file.id, root,
      file.folderId === root ? '' : file.subjectFolder);
    if (result.version !== file.version || result.connectionId !== folders[0].connectionId) {
      throw new DepartmentAuditError('The PDF or Google connection changed. Refresh the audit.', 409);
    }
    return { file, report: result.pdf };
  }
  if (input.action === 'senior-audit-batch') {
    if (!Array.isArray(input.items) || !input.items.length || input.items.length > 5 ||
        input.items.some(item => !item || typeof item.fileId !== 'string' || typeof item.version !== 'string') ||
        new Set(input.items.map(item => item.fileId)).size !== input.items.length) {
      throw new DepartmentAuditError('Choose up to five distinct PDFs from the audit folder.', 400);
    }
    return { results: await Promise.all(input.items.map(readOne)) };
  }
  return readOne(input);
}

module.exports = { readDepartmentAudit };
