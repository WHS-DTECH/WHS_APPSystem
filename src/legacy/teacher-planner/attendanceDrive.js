const express = require('express');
const { importAttendancePdf } = require('./attendanceImport');
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const DRIVE_ID = /^[A-Za-z0-9_-]{10,200}$/;
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
function createAttendanceDriveRouter({ query, ensureConnected, access, unchanged, hasScope, fetchImpl, ErrorType, parsePdf = importAttendancePdf }) {
  const router = express.Router();
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
  async function connection(req, year) {
    const config = (await query('SELECT content FROM planner_attendance_groups WHERE owner_id=$1 AND year=$2',
      [req.user.id, year])).rows[0]?.content.driveSync;
    if (!config?.enabled || !DRIVE_ID.test(config.folderId)) throw new ErrorType('Enable a Drive attendance folder in Two-Week Attendance first.', 409);
    const row = await ensureConnected(req);
    if (!hasScope(row, DRIVE_SCOPE)) throw new ErrorType('Authorise read-only Google Drive access in Two-Week Attendance, then retry sync.', 409);
    return { row, folder: config.folderId, token: await access(row) };
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
  function validFile(file, folder) {
    return file && DRIVE_ID.test(file.id) && file.mimeType === 'application/pdf' && file.trashed === false &&
      file.parents?.includes(folder) && typeof file.name === 'string' && file.name.length <= 500 &&
      typeof file.modifiedTime === 'string' && Number.isFinite(Date.parse(file.modifiedTime)) &&
      typeof file.md5Checksum === 'string' && /^[a-f0-9]{32}$/i.test(file.md5Checksum) &&
      /^\d+$/.test(file.size) && Number(file.size) <= MAX_PDF;
  }
  router.get('/:year/files', wrap(async (req, res) => {
    const { row, folder, token } = await connection(req, Number(req.params.year));
    const metadata = await (await google('files/' + folder + '?fields=id,mimeType,trashed&supportsAllDrives=true', token)).json();
    if (metadata.mimeType !== 'application/vnd.google-apps.folder' || metadata.trashed) {
      throw new ErrorType('The configured Drive location is not an available folder.', 400);
    }
    const files = [];
    let pageToken;
    for (let page = 0; page < 10; page++) {
      const params = new URLSearchParams({
        q: "'" + folder + "' in parents and trashed = false and mimeType = 'application/pdf'",
        fields: 'nextPageToken,files(id,name,mimeType,modifiedTime,md5Checksum,size,parents,trashed)',
        pageSize: '100', orderBy: 'modifiedTime', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true',
        ...(pageToken ? { pageToken } : {})
      });
      const result = await (await google('files?' + params, token)).json();
      if (!Array.isArray(result.files) || result.files.some(file => !validFile(file, folder))) {
        throw new ErrorType('Drive returned an unreadable or oversized PDF (maximum 5 MB per file). Check the folder before syncing.', 422);
      }
      files.push(...result.files.map(file => ({ id: file.id, name: file.name, version: fileVersion(file) })));
      pageToken = result.nextPageToken;
      if (!pageToken) break;
    }
    if (pageToken) throw new ErrorType('The attendance folder contains too many PDFs. Keep at most 1,000 PDFs in the selected folder.', 422);
    await unchanged(row);
    res.json({ files, connectionId: row.connection_id, accountId: row.google_subject });
  }));
  router.get('/:year/files/:id', wrap(async (req, res) => {
    if (!DRIVE_ID.test(req.params.id)) throw new ErrorType('Choose a valid Drive PDF.', 400);
    const { row, folder, token } = await connection(req, Number(req.params.year));
    const path = 'files/' + req.params.id;
    const fields = '?fields=id,name,mimeType,modifiedTime,md5Checksum,size,parents,trashed&supportsAllDrives=true';
    const file = await (await google(path + fields, token)).json();
    if (!validFile(file, folder)) throw new ErrorType('This file is not an eligible PDF in your configured attendance folder (maximum 5 MB).', 422);
    const response = await google(path + '?alt=media&supportsAllDrives=true', token);
    if (Number(response.headers.get('content-length')) > MAX_PDF) {
      await response.body?.cancel();
      throw new ErrorType('Attendance PDFs must be no larger than 5 MB.', 422);
    }
    const chunks = [];
    let length = 0;
    const reader = response.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > MAX_PDF) {
          await reader.cancel();
          throw new ErrorType('Attendance PDFs must be no larger than 5 MB.', 422);
        }
        chunks.push(Buffer.from(value));
      }
    } finally { reader.releaseLock(); }
    let pdf;
    try { pdf = await parsePdf(Buffer.concat(chunks)); }
    catch { throw new ErrorType('A Drive PDF is not a supported KAMAR Two Week Overview. Use manual import to check it, or move it out of the sync folder.', 422); }
    const after = await (await google(path + fields, token)).json();
    if (!validFile(after, folder) || fileVersion(after) !== fileVersion(file)) throw new ErrorType('The Drive PDF changed while being read. Retry sync.', 409);
    await unchanged(row);
    res.json({ pdf, version: fileVersion(file), accountId: row.google_subject, connectionId: row.connection_id });
  }));
  return router;
}
module.exports = { DRIVE_SCOPE, folderId, createAttendanceDriveRouter };
