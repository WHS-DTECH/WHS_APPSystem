const crypto = require('node:crypto');
const express = require('express');
const { DOCUMENT_ID, DOCS_SCOPE, documentRanges, parseDocumentEvents } = require('./googleDocEvents');
const { validYearTerm, parseDutyDocument, dutyEvents, canManage } = require('./dutyRoster');
const { TASKS_SCOPE, createGoogleTasksRouter } = require('./googleTasks');
const { DRIVE_SCOPE, createAttendanceDriveRouter, createAttendanceDriveService } = require('./attendanceDrive');
const { createAdminAttendanceRouter } = require('./adminAttendance');

const SCOPES = [
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/calendar.events.readonly'
];
class CalendarError extends Error {
  constructor(message, status = 502) { super(message); this.status = status; }
}
function configuration(env) {
  const present = [env.GOOGLE_CALENDAR_CLIENT_ID, env.GOOGLE_CALENDAR_CLIENT_SECRET, env.GOOGLE_CALENDAR_TOKEN_KEY];
  if (present.every(value => !value)) return null;
  if (present.some(value => !value)) throw new Error('Set all three GOOGLE_CALENDAR credentials.');
  const key = Buffer.from(env.GOOGLE_CALENDAR_TOKEN_KEY, 'base64');
  if (key.length !== 32 || key.toString('base64') !== env.GOOGLE_CALENDAR_TOKEN_KEY) throw new Error('GOOGLE_CALENDAR_TOKEN_KEY must be a base64-encoded 32-byte key.');
  const base = new URL(env.APP_BASE_URL || env.RENDER_EXTERNAL_URL);
  if (base.protocol !== 'https:' || base.username || base.password || base.pathname !== '/' || base.search || base.hash) {
    throw new Error('Google Calendar requires an HTTPS APP_BASE_URL origin.');
  }
  return { clientId: present[0], clientSecret: present[1], key,
    redirectUri: new URL((env.TEACHER_PLANNER_BASE_PATH || '') + '/api/planner/google-calendar/callback', base).href };
}
function encryptTokens(tokens, key, owner) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(owner));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(tokens), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
}
function decryptTokens(value, key, owner) {
  const data = Buffer.from(value, 'base64');
  const cipher = crypto.createDecipheriv('aes-256-gcm', key, data.subarray(0, 12));
  cipher.setAAD(Buffer.from(owner));
  cipher.setAuthTag(data.subarray(12, 28));
  return JSON.parse(Buffer.concat([cipher.update(data.subarray(28)), cipher.final()]).toString('utf8'));
}
function validDay(value, bounded = true) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    (!bounded || (value >= '2000-01-01' && value <= '2100-12-31')) &&
    !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
function nzMidnight(value) {
  const utc = Date.parse(value + 'T00:00:00Z');
  const offset = time => {
    const text = new Intl.DateTimeFormat('en', { timeZone: 'Pacific/Auckland', timeZoneName: 'longOffset' })
      .formatToParts(new Date(time)).find(part => part.type === 'timeZoneName').value;
    const [, sign, hours, minutes] = /GMT([+-])(\d{2}):(\d{2})/.exec(text);
    return (sign === '+' ? 1 : -1) * (Number(hours) * 60 + Number(minutes)) * 60000;
  };
  const initial = utc - offset(utc);
  return new Date(utc - offset(initial)).toISOString();
}
function normaliseEvent(event, calendar) {
  if (event.status === 'cancelled') return null;
  const allDay = Boolean(event.start?.date);
  const start = allDay ? event.start.date : event.start?.dateTime;
  const end = allDay ? event.end?.date : event.end?.dateTime;
  if (typeof start !== 'string' || typeof end !== 'string' || (allDay && (!validDay(start, false) || !validDay(end, false))) ||
      !Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end)) || Date.parse(end) <= Date.parse(start)) {
    throw new CalendarError('Google returned an event with invalid dates. Please retry.');
  }
  let htmlLink = '';
  if (typeof event.htmlLink === 'string') {
    const url = new URL(event.htmlLink);
    if (url.protocol === 'https:' && url.hostname === 'calendar.google.com' && !url.username && !url.password) htmlLink = url.href;
  }
  return { id: calendar.id + ':' + event.id, title: event.summary || '(Untitled event)',
    start: allDay ? start : new Date(start).toISOString(), end: allDay ? end : new Date(end).toISOString(),
    allDay, location: event.location || '', description: event.description || '',
    calendar: calendar.summary, htmlLink };
}
function createGoogleCalendarRouter({ query, env = process.env, fetchImpl = fetch, loadSchoolCalendar, adminAttendance }) {
  const config = configuration(env);
  const router = express.Router();
  const saveSession = req => new Promise((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
  const read = async owner => (await query('SELECT * FROM google_calendar_connections WHERE owner_id=$1', [owner])).rows[0];
  const ensureConnected = async req => {
    const row = await read(req.user.id);
    if (!row) throw new CalendarError('Connect your Google Calendar first.', 409);
    return row;
  };
  async function unchanged(row) {
    const current = await read(row.owner_id);
    if (current?.connection_id !== row.connection_id) throw new CalendarError('Your Google connection changed. Reload the calendar.', 409);
  }
  async function google(url, options = {}) {
    let response;
    try { response = await fetchImpl(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(15000) }); }
    catch { throw new CalendarError('Google Calendar could not be reached. Please retry.'); }
    if (!response.ok) {
      if ([400, 401].includes(response.status)) throw new CalendarError('Google access expired or was revoked. Connect your Google account again.', 409);
      if (response.status === 403) throw new CalendarError('Google denied calendar access. Check consent, Calendar API setup and school administrator approval.', 403);
      throw new CalendarError('Google Calendar is temporarily unavailable or its request limit was reached. Please retry.');
    }
    try { return await response.json(); }
    catch { throw new CalendarError('Google returned an unreadable response. Please retry.'); }
  }
  const tokenRequest = values => google('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, ...values }).toString()
  });
  async function access(row) {
    const tokens = decryptTokens(row.encrypted_tokens, config.key, row.owner_id);
    if (tokens.expiresAt > Date.now() + 60000) return tokens.accessToken;
    const result = await tokenRequest({ grant_type: 'refresh_token', refresh_token: tokens.refreshToken });
    if (typeof result.access_token !== 'string' || !Number.isFinite(result.expires_in) || result.expires_in <= 0) throw new CalendarError('Google did not renew calendar access. Reconnect your account.', 409);
    const next = { accessToken: result.access_token, refreshToken: result.refresh_token || tokens.refreshToken,
      expiresAt: Date.now() + result.expires_in * 1000, scopes: tokens.scopes || [] };
    const saved = await query(`UPDATE google_calendar_connections SET encrypted_tokens=$3
      WHERE owner_id=$1 AND connection_id=$2 RETURNING connection_id`,
    [row.owner_id, row.connection_id, encryptTokens(next, config.key, row.owner_id)]);
    if (!saved.rows.length) throw new CalendarError('Your Google connection changed. Reload the calendar.', 409);
    return next.accessToken;
  }
  async function pages(path, accessToken, params, maxPages) {
    const items = [];
    let pageToken;
    for (let page = 0; page < maxPages; page++) {
      const url = new URL('https://www.googleapis.com/calendar/v3/' + path);
      for (const [name, value] of Object.entries({ ...params, ...(pageToken ? { pageToken } : {}) })) url.searchParams.set(name, value);
      const result = await google(url.href, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!Array.isArray(result.items)) throw new CalendarError('Google returned an invalid calendar list.');
      items.push(...result.items);
      if (!result.nextPageToken) return items;
      pageToken = result.nextPageToken;
    }
    throw new CalendarError('This calendar contains too many results to display completely. Select fewer calendars or open Google Calendar.');
  }
  const calendars = async token => (await pages('users/me/calendarList', token, { maxResults: '250', minAccessRole: 'reader' }, 20))
    .filter(item => !item.deleted).map(item => ({ id: item.id, summary: item.summaryOverride || item.summary || item.id, primary: Boolean(item.primary) }));
  const wrap = handler => async (req, res) => {
    try { await handler(req, res); }
    catch (error) {
      // Provider errors and stored tokens can contain credentials; never log their contents.
      console.error('Private Google Calendar request failed.');
      const message = error instanceof CalendarError ? error.message : 'Your Google Calendar request failed. Please retry or contact the project owner.';
      if (req.path === '/callback') return res.status(error.status || 500).type('text').send(message + ' Close this tab and return to your planner.');
      res.status(error instanceof CalendarError ? error.status : 500).json({ error: message });
    }
  };
  router.use((req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
    if (typeof req.user.id !== 'string' || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(req.user.id)) {
      console.warn('Google Calendar requires a verified owner ID.');
      return res.status(403).json({ error: 'A verified school account is required.' });
    }
    if (!config && !(req.path === '/' && req.method === 'GET')) return res.status(503).json({ error: 'Google Calendar is not configured yet. Ask the project owner to complete Google setup.' });
    next();
  });
  router.get('/', wrap(async (req, res) => {
    if (!config) return res.json({ configured: false, connected: false });
    const row = await read(req.user.id);
    res.json({ configured: true, connected: Boolean(row), ...(row ? {
      connectionId: row.connection_id, email: row.email, selectedCalendars: row.selected_calendars,
      docsEnabled: (decryptTokens(row.encrypted_tokens, config.key, req.user.id).scopes || []).includes(DOCS_SCOPE),
      tasksEnabled: (decryptTokens(row.encrypted_tokens, config.key, req.user.id).scopes || []).includes(TASKS_SCOPE),
      attendanceDriveEnabled: (decryptTokens(row.encrypted_tokens, config.key, req.user.id).scopes || []).includes(DRIVE_SCOPE)
    } : {}) });
  }));
  router.post('/connect', wrap(async (req, res) => {
    if (req.body?.includeDocs !== undefined && typeof req.body.includeDocs !== 'boolean') throw new CalendarError('Choose whether to enable Google Docs access.', 400);
    if (req.body?.includeTasks !== undefined && typeof req.body.includeTasks !== 'boolean') throw new CalendarError('Choose whether to enable Google Tasks access.', 400);
    if (req.body?.includeAttendanceDrive !== undefined && typeof req.body.includeAttendanceDrive !== 'boolean') throw new CalendarError('Choose whether to enable read-only Drive attendance access.', 400);
    const state = crypto.randomBytes(32).toString('base64url');
    const verifier = crypto.randomBytes(32).toString('base64url');
    const connection = await read(req.user.id);
    const includeDocs = req.body?.includeDocs === true ||
      Boolean(connection && decryptTokens(connection.encrypted_tokens, config.key, req.user.id).scopes?.includes(DOCS_SCOPE));
    const includeTasks = req.body?.includeTasks === true ||
      Boolean(connection && decryptTokens(connection.encrypted_tokens, config.key, req.user.id).scopes?.includes(TASKS_SCOPE));
    const includeAttendanceDrive = req.body?.includeAttendanceDrive === true ||
      Boolean(connection && decryptTokens(connection.encrypted_tokens, config.key, req.user.id).scopes?.includes(DRIVE_SCOPE));
    req.session.googleCalendar = { state, verifier, owner: req.user.id, started: Date.now(), includeDocs, includeTasks, includeAttendanceDrive };
    await saveSession(req);
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    for (const [name, value] of Object.entries({
      client_id: config.clientId, redirect_uri: config.redirectUri, response_type: 'code',
      scope: [...SCOPES, ...(includeDocs ? [DOCS_SCOPE] : []), ...(includeTasks ? [TASKS_SCOPE] : []), ...(includeAttendanceDrive ? [DRIVE_SCOPE] : [])].join(' '), state, access_type: 'offline', prompt: 'consent select_account',
      code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256'
    })) url.searchParams.set(name, value);
    res.json({ url: url.href });
  }));
  router.get('/callback', wrap(async (req, res) => {
    const pending = req.session.googleCalendar;
    delete req.session.googleCalendar;
    await saveSession(req);
    if (!pending || pending.owner !== req.user.id || Date.now() - pending.started > 10 * 60000 ||
        typeof req.query.state !== 'string' || req.query.state !== pending.state) {
      throw new CalendarError('Google connection expired or the school account changed. Start Connect Google Calendar again.', 403);
    }
    if (req.query.error) throw new CalendarError('Google connection was cancelled or denied. Your previous connection has not been changed.', 400);
    if (typeof req.query.code !== 'string' || !req.query.code || req.query.code.length > 4096) throw new CalendarError('Google returned no valid authorisation code.', 400);
    const result = await tokenRequest({ code: req.query.code, code_verifier: pending.verifier, redirect_uri: config.redirectUri, grant_type: 'authorization_code' });
    const granted = new Set((result.scope || '').split(' '));
    if (![...SCOPES, ...(pending.includeDocs ? [DOCS_SCOPE] : []), ...(pending.includeTasks ? [TASKS_SCOPE] : []), ...(pending.includeAttendanceDrive ? [DRIVE_SCOPE] : [])].every(scope => granted.has(scope)) || typeof result.access_token !== 'string' ||
        typeof result.refresh_token !== 'string' || !Number.isFinite(result.expires_in) || result.expires_in <= 0) {
      throw new CalendarError('Google did not grant all requested permissions or offline access. Reconnect and allow each requested permission.', 403);
    }
    const profile = await google('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: `Bearer ${result.access_token}` } });
    if (typeof profile.id !== 'string' || typeof profile.email !== 'string' || profile.verified_email !== true) throw new CalendarError('Google did not supply a verified account email.', 403);
    const list = await calendars(result.access_token);
    const previous = await read(req.user.id);
    const selected = previous?.google_subject === profile.id ?
      previous.selected_calendars.filter(id => list.some(item => item.id === id)) :
      list.filter(item => item.primary).map(item => item.id);
    const tokens = encryptTokens({ accessToken: result.access_token, refreshToken: result.refresh_token,
      expiresAt: Date.now() + result.expires_in * 1000, scopes: [...granted] }, config.key, req.user.id);
    await query(`INSERT INTO google_calendar_connections(owner_id,connection_id,google_subject,email,encrypted_tokens,selected_calendars)
      VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT(owner_id) DO UPDATE SET connection_id=EXCLUDED.connection_id,
      google_subject=EXCLUDED.google_subject,email=EXCLUDED.email,encrypted_tokens=EXCLUDED.encrypted_tokens,
      selected_calendars=EXCLUDED.selected_calendars,updated_at=NOW()`,
    [req.user.id, crypto.randomUUID(), profile.id, profile.email, tokens, JSON.stringify(selected)]);
    res.type('text').send('Google connected for read-only Calendar' + (pending.includeDocs ? ' and Docs' : '') +
      (pending.includeTasks ? ', plus Google Tasks management' : '') +
      (pending.includeAttendanceDrive ? ', plus read-only Drive attendance access' : '') + '. Close this tab and return to your planner. Your planner edits have not been changed.');
  }));
  const hasScope = (row, scope) => (decryptTokens(row.encrypted_tokens, config.key, row.owner_id).scopes || []).includes(scope);
  const attendanceDrive = createAttendanceDriveService({
    ensureConnected, access, unchanged, fetchImpl, ErrorType: CalendarError, hasScope
  });
  router.use('/attendance-drive', createAttendanceDriveRouter({ query, service: attendanceDrive, ErrorType: CalendarError }));
  if (adminAttendance?.loadTeachers && adminAttendance?.authorizeTarget && adminAttendance?.loadClasses) {
    router.use('/attendance-admin', createAdminAttendanceRouter({
      query, ...adminAttendance, driveService: attendanceDrive,
      loadSchoolCalendar,
      driveStatus: async req => {
        const row = await read(req.user.id);
        const scopes = row ? decryptTokens(row.encrypted_tokens, config.key, req.user.id).scopes || [] : [];
        return { connected: Boolean(row), driveAccess: scopes.includes(DRIVE_SCOPE), email: row?.email };
      }
    }));
  }
  router.use('/tasks', createGoogleTasksRouter({
    ensureConnected, access, unchanged, fetchImpl, ErrorType: CalendarError,
    hasScope: (row, scope) => (decryptTokens(row.encrypted_tokens, config.key, row.owner_id).scopes || []).includes(scope)
  }));
  router.get('/document-events', wrap(async (req, res) => {
    let mapping;
    try { mapping = documentRanges(req.query); }
    catch (error) { throw new CalendarError(error.message, 400); }
    const row = await ensureConnected(req);
    const stored = decryptTokens(row.encrypted_tokens, config.key, row.owner_id);
    if (!stored.scopes?.includes(DOCS_SCOPE)) throw new CalendarError('Enable Google Docs access in Year Overview, then approve the additional read-only permission.', 409);
    const token = await access(row);
    let response;
    try {
      response = await fetchImpl('https://docs.googleapis.com/v1/documents/' + DOCUMENT_ID + '?includeTabsContent=true', {
        headers: { Authorization: 'Bearer ' + token }, redirect: 'error', signal: AbortSignal.timeout(15000)
      });
    } catch { throw new CalendarError('Google Docs could not be reached. Retry sync; previously displayed document events are not current.'); }
    if (response.status === 403) throw new CalendarError('Google denied document access. Enable Google Docs API in the Google Cloud project, approve the read-only Docs permission, and connect a school account with access to this document.', 403);
    if (response.status === 404) throw new CalendarError('The school document was not found or this Google account cannot view it. Check its sharing permissions.', 404);
    if (response.status === 401) throw new CalendarError('Google Docs access expired. Reconnect your Google account.', 409);
    if (!response.ok) throw new CalendarError('Google Docs sync failed or its request limit was reached. Retry sync.');
    let document;
    try { document = await response.json(); }
    catch { throw new CalendarError('Google Docs returned unreadable content. Retry sync.'); }
    let result;
    try { result = parseDocumentEvents(document, mapping); }
    catch (error) { throw new CalendarError(error.message, 422); }
    await unchanged(row);
    res.json({ ...result, connectionId: row.connection_id });
  }));
  router.get('/duty-events/:year/:term', wrap(async (req, res) => {
    const { year, term } = req.params;
    const week = req.query.week;
    if (!validYearTerm(year, term) || typeof week !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(week) ||
      !Number.isFinite(Date.parse(week)) || new Date(week).toISOString().slice(0, 10) !== week ||
      new Date(week).getUTCDay() !== 1) throw new CalendarError('Choose a valid duty roster year, term and Monday.', 400);
    const preview = req.query.preview === 'true';
    if (preview && !canManage(req.user)) throw new CalendarError('Only a Planner Lead Teacher or administrator can preview the whole roster.', 403);
    const configResult = await query('SELECT content FROM school_duty_rosters WHERE year=$1 AND term=$2', [year, term]);
    const settings = configResult.rows[0]?.content;
    if (!settings || !settings.enabled) return res.json({ events: [], enabled: false });
    if (!preview && !settings.mappings.some(item => item.email === req.user.email?.toLowerCase())) {
      return res.json({ events: [], enabled: true, mapped: false });
    }
    const row = await ensureConnected(req);
    const stored = decryptTokens(row.encrypted_tokens, config.key, row.owner_id);
    if (!stored.scopes?.includes(DOCS_SCOPE)) throw new CalendarError('Enable Google Docs access in Duty Roster setup, then approve the read-only permission.', 409);
    let response;
    try {
      response = await fetchImpl('https://docs.googleapis.com/v1/documents/' + settings.documentId + '?includeTabsContent=true', {
        headers: { Authorization: 'Bearer ' + await access(row) }, redirect: 'error', signal: AbortSignal.timeout(15000)
      });
    } catch { throw new CalendarError('The duty document could not be reached. Retry sync; no stale duties are displayed.'); }
    if (response.status === 401) throw new CalendarError('Google Docs access expired. Reconnect in Duty Roster setup.', 409);
    if ([403, 404].includes(response.status)) throw new CalendarError('The duty document is not accessible. Check sharing, Google Docs API and read-only Docs consent for your school Google account.', response.status);
    if (!response.ok) throw new CalendarError('Duty document sync failed. Retry shortly; no stale duties are displayed.');
    let document;
    try { document = await response.json(); }
    catch { throw new CalendarError('Google returned unreadable duty document content. Retry sync.'); }
    let roster, result;
    try {
      roster = parseDutyDocument(document, Number(year), Number(term));
      if (preview) result = { events: [], mapped: settings.mappings.some(item => item.email === req.user.email?.toLowerCase()) };
      else {
        const school = await query('SELECT content FROM school_planner_settings WHERE year=$1', [year]);
        const dates = { ...school.rows[0]?.content };
        if ((!dates['term' + term + 'Start'] || !dates['term' + term + 'End']) && loadSchoolCalendar) {
          const calendar = await loadSchoolCalendar(req, Number(year));
          const fallback = calendar.terms?.find(item => item.term === Number(term));
          dates['term' + term + 'Start'] ||= fallback?.startDate;
          dates['term' + term + 'End'] ||= fallback?.endDate;
        }
        result = dutyEvents(roster, settings.mappings, req.user.email, dates, year, term, week);
      }
    } catch (error) { throw new CalendarError(error.message, 422); }
    await unchanged(row);
    res.json({ ...result, enabled: true, fetchedAt: new Date().toISOString(),
      ...(preview ? { codes: roster.codes, duties: roster.duties,
        unmapped: roster.codes.filter(code => !settings.mappings.some(item => item.code === code)) } : {}) });
  }));
  router.get('/calendars', wrap(async (req, res) => {
    const row = await ensureConnected(req);
    const list = await calendars(await access(row));
    await unchanged(row);
    res.json({ connectionId: row.connection_id, calendars: list });
  }));
  router.put('/selection', wrap(async (req, res) => {
    const ids = req.body?.calendarIds;
    if (!Array.isArray(ids) || ids.length > 10 || new Set(ids).size !== ids.length ||
        !ids.every(id => typeof id === 'string' && id.length > 0 && id.length <= 1024)) {
      throw new CalendarError('Choose up to ten different calendars.', 400);
    }
    const row = await ensureConnected(req);
    if (req.body.connectionId !== row.connection_id) throw new CalendarError('Your Google account changed. Reload the calendar choices.', 409);
    const list = await calendars(await access(row));
    if (!ids.every(id => list.some(item => item.id === id))) throw new CalendarError('One or more calendars are no longer accessible. Reload the calendar choices.', 400);
    const saved = await query(`UPDATE google_calendar_connections SET selected_calendars=$3,updated_at=NOW()
      WHERE owner_id=$1 AND connection_id=$2 RETURNING connection_id`, [req.user.id, row.connection_id, JSON.stringify(ids)]);
    if (!saved.rows.length) throw new CalendarError('Your Google account changed. Reload the calendar.', 409);
    res.json({ selectedCalendars: ids });
  }));
  router.get('/events', wrap(async (req, res) => {
    const start = req.query.start;
    if (!validDay(start) || new Date(start).getUTCDay() !== 0) throw new CalendarError('Choose a valid Sunday for the calendar week.', 400);
    const end = new Date(start); end.setUTCDate(end.getUTCDate() + 7);
    const row = await ensureConnected(req);
    const token = await access(row);
    const list = await calendars(token);
    const chosen = row.selected_calendars.map(id => list.find(item => item.id === id));
    if (chosen.some(item => !item)) throw new CalendarError('A selected calendar is no longer available. Update your calendar choices.', 409);
    const events = (await Promise.all(chosen.map(async calendar => {
      const items = await pages('calendars/' + encodeURIComponent(calendar.id) + '/events', token, {
        timeMin: nzMidnight(start), timeMax: nzMidnight(end.toISOString().slice(0, 10)),
        timeZone: 'Pacific/Auckland', singleEvents: 'true', orderBy: 'startTime', showDeleted: 'false', maxResults: '2500'
      }, 4);
      return items.map(item => normaliseEvent(item, calendar)).filter(Boolean);
    }))).flat();
    await unchanged(row);
    res.json({ connectionId: row.connection_id, events, fetchedAt: new Date().toISOString() });
  }));
  router.delete('/', wrap(async (req, res) => {
    const row = await read(req.user.id);
    if (row && req.body?.connectionId !== row.connection_id) throw new CalendarError('Your Google account changed. Reload before disconnecting.', 409);
    delete req.session.googleCalendar;
    await saveSession(req);
    const deleted = await query('DELETE FROM google_calendar_connections WHERE owner_id=$1 AND connection_id=$2 RETURNING encrypted_tokens',
      [req.user.id, row?.connection_id || null]);
    let warning = '';
    if (deleted.rows.length) {
      try {
        const tokens = decryptTokens(deleted.rows[0].encrypted_tokens, config.key, req.user.id);
        const response = await fetchImpl('https://oauth2.googleapis.com/revoke', {
          method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token: tokens.refreshToken }).toString()
        });
        if (!response.ok) throw new CalendarError('Revocation failed.');
      } catch {
        console.warn('Google grant revocation could not be confirmed after local disconnection.');
        warning = 'Disconnected here and stored tokens removed, but Google revocation could not be confirmed. Remove this app in your Google Account connections too.';
      }
    }
    res.json({ disconnected: true, warning });
  }));
  return router;
}
module.exports = { createGoogleCalendarRouter, configuration, encryptTokens, decryptTokens, nzMidnight, normaliseEvent, SCOPES };
