const express = require('express');
const { AttendancePdfError, importAttendancePdf } = require('./attendanceImport');
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const DRIVE_ID = /^[A-Za-z0-9_-]{10,200}$/;
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const MAX_PDF = 5 * 1024 * 1024;
function folderId(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (DRIVE_ID.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    const id = /^\/drive\/(?:u\/\d+\/)?folders\/([A-Za-z0-9_-]+)\/?$/.exec(url.pathname)?.[1];
    return url.protocol === 'https:' && url.hostname === 'drive.google.com' && !url.username && !url.password &&
      id && DRIVE_ID.test(id) ? id : null;
  } catch { return null; }
}
function fileVersion(file) {
  return file.id + ':' + file.modifiedTime + ':' + file.md5Checksum;
}
function createAttendanceDriveService({ ensureConnected, access, unchanged, hasScope, fetchImpl = fetch,
  ErrorType, parsePdf = importAttendancePdf, pdfError = AttendancePdfError, purpose = 'Attendance',
  mimeType = 'application/pdf', format = 'PDF', maxSize = MAX_PDF, folderAliases = new Map() }) {
  const folderName = name => name.trim().toUpperCase();
  function matchesFolder(name, staffCode) {
    return [staffCode, ...(folderAliases.get(folderName(staffCode)) || [])]
      .some(candidate => folderName(candidate) === folderName(name));
  }
  async function connection(req, folder) {
    if (!DRIVE_ID.test(folder || '')) throw new ErrorType('Choose a valid Drive attendance folder.', 400);
    const row = await ensureConnected(req);
    if (!hasScope(row, DRIVE_SCOPE)) throw new ErrorType('Authorise read-only Google Drive access in Kamar Uploader Attendance Admin, then retry the import.', 409);
    return { row, folder, token: await access(row) };
  }
  async function google(path, token) {
    let response;
    try {
      response = await fetchImpl('https://www.googleapis.com/drive/v3/' + path, {
        headers: { Authorization: 'Bearer ' + token }, redirect: 'error', signal: AbortSignal.timeout(30000)
      });
    } catch { throw new ErrorType('Google Drive could not be reached. Retry attendance sync.'); }
    if (response.status === 401) throw new ErrorType('Google Drive access expired. Reconnect your Google account.', 409);
    if (response.status === 403) throw new ErrorType('Google denied Drive access. Enable Google Drive API, approve read-only Drive permission, and check school administrator restrictions.', 403);
    if (response.status === 404) throw new ErrorType('The Drive folder or file cannot be viewed by your connected Google account. Check sharing permissions.', 404);
    if (!response.ok) throw new ErrorType('Google Drive is temporarily unavailable or its request limit was reached. Retry sync.');
    return response;
  }
  function validFile(file, folder, checkSize = true) {
    return file && DRIVE_ID.test(file.id) && file.mimeType === mimeType && file.trashed === false &&
      file.parents?.includes(folder) && typeof file.name === 'string' && file.name.length <= 500 &&
      typeof file.modifiedTime === 'string' && Number.isFinite(Date.parse(file.modifiedTime)) &&
      typeof file.md5Checksum === 'string' && /^[a-f0-9]{32}$/i.test(file.md5Checksum) &&
      /^\d+$/.test(file.size) && (!checkSize || Number(file.size) <= maxSize);
  }
  async function listFiles(req, folderIdValue, staffCode) {
    const { row, folder, token } = await connection(req, folderIdValue);
    const metadata = await (await google('files/' + folder + '?fields=id,mimeType,trashed&supportsAllDrives=true', token)).json();
    if (metadata.mimeType !== FOLDER_MIME || metadata.trashed) {
      throw new ErrorType('The configured Drive location is not an available folder.', 400);
    }
    async function listChildren(parent, mimeType, fields, validate) {
      const children = [];
      let pageToken;
      for (let page = 0; page < 10; page++) {
        const params = new URLSearchParams({
          q: "'" + parent + "' in parents and trashed = false and mimeType = '" + mimeType + "'",
          fields: 'nextPageToken,files(' + fields + ')',
          pageSize: '100', orderBy: 'modifiedTime', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true',
          ...(pageToken ? { pageToken } : {})
        });
        const result = await (await google('files?' + params, token)).json();
        if (!Array.isArray(result.files) || result.files.some(child => !validate(child))) {
          throw new ErrorType(`Drive returned unreadable folder or ${format} metadata. Check the folder before syncing.`, 422);
        }
        children.push(...result.files);
        pageToken = result.nextPageToken;
        if (!pageToken) break;
      }
      if (pageToken) throw new ErrorType(`The attendance folder contains too many items. Keep at most 1,000 ${format}s or subfolders per folder.`, 422);
      return children;
    }
    let staffFolder = null;
    if (staffCode !== undefined) {
      if (typeof staffCode !== 'string' || !staffCode.trim() || staffCode.trim().length > 60) {
        throw new ErrorType('The selected teacher has no valid staff code. Check the current KAMAR staff upload.', 422);
      }
      const folders = await listChildren(folder, FOLDER_MIME, 'id,name,mimeType,parents,trashed', item =>
        item && DRIVE_ID.test(item.id) && typeof item.name === 'string' && item.name.length <= 500 &&
        item.mimeType === FOLDER_MIME && item.trashed === false && item.parents?.includes(folder));
      const matches = folders.filter(item => matchesFolder(item.name, staffCode));
      if (matches.length > 1) throw new ErrorType('Multiple Drive folders match the selected staff code. Keep only one matching folder and retry.', 409);
      staffFolder = matches[0] || null;
    }
    const files = [];
    for (const parent of [folder, ...(staffFolder ? [staffFolder.id] : [])]) {
      const children = await listChildren(parent, mimeType,
        'id,name,mimeType,modifiedTime,md5Checksum,size,parents,trashed', item => validFile(item, parent, false));
      files.push(...children.map(file => ({ id: file.id, name: file.name, version: fileVersion(file), folderId: parent })));
    }
    await unchanged(row);
    return { files, connectionId: row.connection_id, accountId: row.google_subject,
      ...(staffCode !== undefined ? { staffFolder: staffFolder?.name || null } : {}) };
  }
  async function readFile(req, folderIdValue, fileId, parentFolderId, staffCode) {
    if (!DRIVE_ID.test(fileId || '')) throw new ErrorType(`Choose a valid Drive ${format}.`, 400);
    const { row, folder, token } = await connection(req, folderIdValue);
    async function checkParent() {
      if (parentFolderId === undefined || parentFolderId === folder) return;
      if (!DRIVE_ID.test(parentFolderId)) throw new ErrorType('Choose a valid Drive attendance folder.', 400);
      const metadata = await (await google('files/' + folder +
        '?fields=id,name,mimeType,parents,trashed&supportsAllDrives=true', token)).json();
      if (metadata.id !== folder || metadata.mimeType !== FOLDER_MIME || metadata.trashed !== false ||
          !metadata.parents?.includes(parentFolderId) || typeof staffCode !== 'string' ||
          typeof metadata.name !== 'string' || !matchesFolder(metadata.name, staffCode)) {
        throw new ErrorType('The staff-code folder moved, was renamed or is no longer available. Retry attendance sync.', 409);
      }
    }
    await checkParent();
    const path = 'files/' + fileId;
    const fields = '?fields=id,name,mimeType,modifiedTime,md5Checksum,size,parents,trashed&supportsAllDrives=true';
    const file = await (await google(path + fields, token)).json();
    const sizeLabel = `${maxSize / (1024 * 1024)} MB`;
    if (!validFile(file, folder)) throw new ErrorType(`This file is not an eligible ${format} in your configured attendance folder (maximum ${sizeLabel}).`, 422);
    const response = await google(path + '?alt=media&supportsAllDrives=true', token);
    if (Number(response.headers.get('content-length')) > maxSize) {
      await response.body?.cancel();
      throw new ErrorType(`Attendance ${format}s must be no larger than ${sizeLabel}.`, 422);
    }
    const chunks = [];
    let length = 0;
    const reader = response.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > maxSize) {
          await reader.cancel();
          throw new ErrorType(`Attendance ${format}s must be no larger than ${sizeLabel}.`, 422);
        }
        chunks.push(Buffer.from(value));
      }
    } finally { reader.releaseLock(); }
    let pdf;
    try { pdf = await parsePdf(Buffer.concat(chunks)); }
    catch (error) {
      const reason = error instanceof pdfError ? error.message : format === 'CSV' ? 'The CSV could not be decoded.' :
        'The PDF could not be decoded. Export it again from KAMAR rather than printing or scanning it.';
      throw new ErrorType(purpose + ' ' + format + ' rejected: ' + reason +
        (purpose === 'Attendance' ? ' No marks from this PDF were imported.' : ` Nothing was imported from this ${format}.`), 422);
    }
    const after = await (await google(path + fields, token)).json();
    if (!validFile(after, folder) || fileVersion(after) !== fileVersion(file)) throw new ErrorType(`The Drive ${format} changed while being read. Retry sync.`, 409);
    await checkParent();
    await unchanged(row);
    return { pdf, version: fileVersion(file), accountId: row.google_subject, connectionId: row.connection_id };
  }
  return { listFiles, readFile };
}
function createAttendanceDriveRouter({ query, service: suppliedService, ...options }) {
  const router = express.Router();
  const service = suppliedService || createAttendanceDriveService(options);
  const ErrorType = options.ErrorType;
  const wrap = handler => async (req, res) => {
    try { await handler(req, res); }
    catch (error) {
      console.error('Attendance Drive request failed.');
      res.status(error instanceof ErrorType ? error.status : 502).json({
        error: error instanceof ErrorType ? error.message : 'Attendance Drive could not be read. Retry sync; existing marks are unchanged.'
      });
    }
  };
  router.use('/:year', (req, res, next) => {
    if (!/^(?:20\d{2}|2100)$/.test(req.params.year)) return res.status(400).json({ error: 'Choose a valid attendance year.' });
    next();
  });
  async function configuredFolder(req, year) {
    const config = (await query('SELECT content FROM planner_attendance_groups WHERE owner_id=$1 AND year=$2',
      [req.user.id, year])).rows[0]?.content.driveSync;
    if (!config?.enabled || !DRIVE_ID.test(config.folderId)) throw new ErrorType('Enable a Drive attendance folder in Two-Week Attendance first.', 409);
    return config.folderId;
  }
  router.get('/:year/files', wrap(async (req, res) => {
    res.json(await service.listFiles(req, await configuredFolder(req, Number(req.params.year))));
  }));
  router.get('/:year/files/:id', wrap(async (req, res) => {
    res.json(await service.readFile(req, await configuredFolder(req, Number(req.params.year)), req.params.id));
  }));
  return router;
}
module.exports = { DRIVE_SCOPE, folderId, fileVersion, createAttendanceDriveService, createAttendanceDriveRouter };
