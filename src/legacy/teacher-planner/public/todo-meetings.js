((root) => {
  'use strict';
  const zone = 'Pacific/Auckland';
  const dayMs = 86400000;
  const dateFormat = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit'
  });
  const clockFormat = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  });
  const addDays = (date, days) => new Date(Date.parse(date + 'T00:00:00Z') + days * dayMs).toISOString().slice(0, 10);
  const dateKey = value => dateFormat.format(new Date(value));
  async function fingerprint(value) {
    const bytes = await root.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  }
  class SourceError extends Error {}
  const sourceError = message => new SourceError(message);

  function windowFor(now = new Date()) {
    const instant = new Date(now);
    if (!Number.isFinite(instant.getTime())) throw new Error('Invalid current time.');
    const start = dateKey(instant), end = addDays(start, 7);
    return { start, end, days: Array.from({ length: 7 }, (_, index) => addDays(start, index)) };
  }

  function localInstant(date, time) {
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('Invalid session time.');
    const target = Date.parse(date + 'T' + time + ':00Z');
    let value = target;
    for (let i = 0; i < 3; i++) {
      const actual = Date.parse(dateKey(value) + 'T' + clockFormat.format(new Date(value)) + ':00Z');
      value += target - actual;
    }
    if (dateKey(value) !== date || clockFormat.format(new Date(value)) !== time) {
      throw new Error('Session time does not exist in Pacific/Auckland.');
    }
    // An ambiguous clock time must not silently select one side of a DST transition.
    for (const delta of [-3600000, 3600000]) {
      if (dateKey(value + delta) === date && clockFormat.format(new Date(value + delta)) === time) {
        throw new Error('Session time is ambiguous in Pacific/Auckland.');
      }
    }
    return new Date(value).toISOString();
  }

  function elapsedStatus(start, end, now = new Date()) {
    const current = new Date(now).getTime();
    if (!Number.isFinite(current)) throw new Error('Invalid current time.');
    if (!start) return 'unknown';
    const first = Date.parse(start), last = end ? Date.parse(end) : NaN;
    if (!Number.isFinite(first) || (end && (!Number.isFinite(last) || last <= first))) throw new Error('Invalid event times.');
    if (first > current) return 'upcoming';
    if (!end) return 'unknown';
    return last <= current ? 'elapsed' : 'in-progress';
  }

  async function plannerSource(request, days, now) {
    const listings = await Promise.all(days.map(day => request('planner/sessions/' + day)));
    const details = [];
    for (let i = 0; i < days.length; i++) {
      const list = listings[i];
      if (!Array.isArray(list?.sessions)) throw new Error('Invalid session listing.');
      const seen = new Set();
      for (const item of list.sessions) {
        if (!item || typeof item.slot_key !== 'string' ||
            !/^manual-[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(item.slot_key) ||
            !['teaching', 'whanau', 'observation', 'meeting', 'duty'].includes(item.session_type) ||
            typeof item.title !== 'string' || seen.has(item.slot_key)) throw new Error('Invalid session listing.');
        seen.add(item.slot_key);
        if (['meeting', 'observation'].includes(item.session_type)) details.push({ day: days[i], item });
      }
    }
    const results = await Promise.all(details.map(({ day, item }) => request('planner/sessions/' + day + '/' + item.slot_key)));
    return results.map((result, index) => {
      const { day, item } = details[index], session = result?.content?.session;
      if (result?.available !== true || !(result.revision > 0) || result.event?.date !== day ||
          result.event?.slot !== item.slot_key || session?.type !== item.session_type || session.title !== item.title ||
          typeof session.startTime !== 'string' || typeof session.endTime !== 'string' ||
          (!session.startTime && session.endTime)) throw new Error('A session changed or is incomplete. Retry.');
      const start = session.startTime ? localInstant(day, session.startTime) : null;
      const end = session.endTime ? localInstant(day, session.endTime) : null;
      const observation = session.type === 'observation';
      return { id: JSON.stringify(['planner', day, item.slot_key, ...(observation ? [result.revision] : [])]),
        source: observation ? 'planner-review' : 'planner', date: day, slot: item.slot_key,
        title: session.title, description: typeof result.content.note === 'string' ? result.content.note : '',
        start, end, status: elapsedStatus(start, end, now),
        classification: observation ? 'ambiguous' : 'meeting', evidence: 'Planner session type' };
    });
  }

  function googleEvent(event, connectionId, window, now) {
    const meta = event?.meetingMetadata, identity = meta?.identity;
    if (!meta || typeof identity?.calendarId !== 'string' || !identity.calendarId ||
        typeof identity.eventId !== 'string' || !identity.eventId ||
        event.id !== identity.calendarId + ':' + identity.eventId ||
        typeof event.title !== 'string' || typeof event.calendar !== 'string' ||
        typeof event.allDay !== 'boolean') return { limited: true };
    if (meta.status === 'cancelled' || meta.response === 'declined' || meta.teaching === true) return {};
    if (typeof meta.eventType !== 'string' || !meta.eventType ||
        typeof meta.updated !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(meta.updated) ||
        !Number.isFinite(Date.parse(meta.updated)) ||
        !['confirmed', 'tentative'].includes(meta.status) ||
        !['accepted', 'tentative', 'needsAction', 'not-applicable'].includes(meta.response) ||
        (meta.response === 'not-applicable' && meta.ownerIsOrganiser !== true)) return { limited: true };
    if (meta.eventType !== 'default') return {};
    let start, end;
    try {
      if (event.allDay) {
        for (const date of [event.start, event.end]) {
          if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
              !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new Error();
        }
        start = localInstant(event.start, '00:00'); end = localInstant(event.end, '00:00');
      } else {
        if (typeof event.start !== 'string' || typeof event.end !== 'string' ||
            !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(event.start) ||
            !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(event.end)) throw new Error();
        start = new Date(event.start).toISOString(); end = new Date(event.end).toISOString();
      }
      if (Date.parse(end) <= Date.parse(start)) throw new Error();
    } catch { return { limited: true }; }
    if (Date.parse(end) <= Date.parse(localInstant(window.start, '00:00')) ||
        Date.parse(start) >= Date.parse(localInstant(window.end, '00:00'))) return {};
    let sourceUrl = '';
    try {
      const url = new URL(event.htmlLink);
      if (url.protocol === 'https:' && url.hostname === 'calendar.google.com' && !url.username && !url.password) sourceUrl = url.href;
    } catch { /* No safe event URL was supplied. */ }
    return { candidate: { id: JSON.stringify(['google', connectionId, identity.calendarId, identity.eventId,
      meta.updated, meta.status, meta.response, meta.ownerIsOrganiser]),
      source: 'google', sourceId: identity.eventId, calendarId: identity.calendarId, url: sourceUrl, sourceUrl,
      date: (event.allDay ? event.start : dateKey(start)) < window.start
        ? window.start : (event.allDay ? event.start : dateKey(start)),
      title: event.title, calendar: event.calendar, location: typeof event.location === 'string' ? event.location : '',
      description: typeof event.description === 'string' ? event.description : '',
      start: event.start, end: event.end, allDay: event.allDay, status: elapsedStatus(start, end, now),
      classification: 'ambiguous', evidence: 'Google attendance and event type; teaching status requires owner review' } };
  }

  async function googleSource(request, window, now) {
    const connection = await request('planner/google-calendar/');
    if (!connection?.configured) throw sourceError('Google Calendar is not configured.');
    if (!connection.connected) throw sourceError('Google Calendar is not connected.');
    if (typeof connection.connectionId !== 'string' || !Array.isArray(connection.selectedCalendars)) {
      throw sourceError('Google Calendar returned invalid connection information.');
    }
    if (!connection.selectedCalendars.length) return { status: 'not-selected', message: 'No Google calendars are selected.' };
    const sundays = [...new Set(window.days.map(day => addDays(day, -new Date(day + 'T00:00:00Z').getUTCDay())))];
    const weeks = await Promise.all(sundays.map(day => request('planner/google-calendar/events?start=' + day)));
    if (weeks.some(week => week?.connectionId !== connection.connectionId || !Array.isArray(week.events))) {
      throw sourceError('Google Calendar connection changed or returned invalid data.');
    }
    const current = await request('planner/google-calendar/');
    if (!current?.connected || current.connectionId !== connection.connectionId || !Array.isArray(current.selectedCalendars) ||
        JSON.stringify([...current.selectedCalendars].sort()) !== JSON.stringify([...connection.selectedCalendars].sort())) {
      throw sourceError('Google Calendar connection or selected calendars changed during loading.');
    }
    const unique = new Map(), candidates = [];
    let limited = 0;
    for (const event of weeks.flatMap(week => week.events)) {
      const identity = event?.meetingMetadata?.identity;
      if (identity?.calendarId && !connection.selectedCalendars.includes(identity.calendarId)) {
        throw sourceError('Google Calendar returned an event from an unselected calendar.');
      }
      if (identity?.calendarId && identity?.eventId) {
        const key = JSON.stringify([identity.calendarId, identity.eventId]), previous = unique.get(key);
        const snapshot = JSON.stringify(event);
        if (previous !== undefined) {
          if (previous !== snapshot) throw sourceError('Google Calendar returned conflicting copies of an event. Retry.');
          continue;
        }
        unique.set(key, snapshot);
      }
      const result = googleEvent(event, connection.connectionId, window, now);
      if (result.limited) limited++;
      if (result.candidate) candidates.push(result.candidate);
    }
    return { status: limited ? 'metadata-limited' : 'ok',
      message: limited ? 'Some Google events lack reliable status, attendance, type, revision, identity or time metadata and cannot be reviewed.' : '',
      unreviewableCount: limited, connectionId: connection.connectionId, candidates };
  }

  async function schoolSource(request, window, now) {
    const days = window.days;
    const months = [...new Set(days.map(day => day.slice(0, 7)))];
    const results = await Promise.all(months.map(month => request('kamar-calendar/' + month.slice(0, 4) + '/' + Number(month.slice(5, 7)))));
    if (results.some((result, index) => !Array.isArray(result?.events) ||
        result.year !== Number(months[index].slice(0, 4)) || result.month !== Number(months[index].slice(5, 7)))) {
      throw sourceError('School calendar returned invalid data.');
    }
    const unique = new Map(), candidates = [];
    let limited = 0;
    for (const event of results.flatMap(result => result.events)) {
      if (!event || typeof event.id !== 'string' || !event.id || typeof event.title !== 'string' ||
          typeof event.allDay !== 'boolean') { limited++; continue; }
      const snapshot = JSON.stringify(event);
      if (unique.has(event.id)) {
        if (unique.get(event.id) !== snapshot) throw sourceError('School calendar returned conflicting copies of an event. Retry.');
        continue;
      }
      unique.set(event.id, snapshot);
      const instant = value => {
        if (event.allDay && /^\d{4}-\d{2}-\d{2}$/.test(value)) return localInstant(value, '00:00');
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00$/.test(value)) return localInstant(value.slice(0, 10), value.slice(11, 16));
        if (/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) return new Date(value).toISOString();
        throw new Error('Invalid school event time.');
      };
      let start, end;
      try {
        start = instant(event.start); end = instant(event.end);
        if (Date.parse(end) <= Date.parse(start)) throw new Error('Invalid school event range.');
      } catch { limited++; continue; }
      if (Date.parse(end) <= Date.parse(localInstant(window.start, '00:00')) ||
          Date.parse(start) >= Date.parse(localInstant(window.end, '00:00'))) continue;
      const firstDay = event.allDay ? event.start : dateKey(start);
      candidates.push({ id: 'school:' + await fingerprint(JSON.stringify([event.id, event.start, event.end, event.title, event.location || ''])),
        source: 'school', sourceId: event.id, date: firstDay < window.start ? window.start : firstDay,
        title: event.title, location: typeof event.location === 'string' ? event.location : '',
        description: typeof event.description === 'string' ? event.description : '',
        start: event.allDay ? event.start : start, end: event.allDay ? event.end : end,
        allDay: event.allDay, status: elapsedStatus(start, end, now), classification: 'ambiguous' });
    }
    return { status: 'metadata-limited', message: 'School events do not include personal attendance; review only meetings you must attend.' +
      (limited ? ' Some events have insufficient timing or identity metadata.' : ''), candidates };
  }

  async function documentSource(loadDocuments, window, now) {
    if (typeof loadDocuments !== 'function') throw sourceError('School meeting document is unavailable in this view.');
    const years = [...new Set(window.days.map(day => Number(day.slice(0, 4))))];
    const results = await Promise.all(years.map(year => loadDocuments(year)));
    if (results.some(result => !Array.isArray(result?.events) || !Array.isArray(result?.warnings))) {
      throw sourceError('School meeting document returned invalid data.');
    }
    const candidates = [];
    for (const result of results) {
      let referenceUrl = '';
      try {
        const url = new URL(result.sourceUrl);
        if (url.protocol === 'https:' && url.hostname === 'docs.google.com' && !url.username && !url.password) referenceUrl = url.href;
      } catch { /* The document did not provide a valid source link. */ }
      for (const event of result.events) {
        if (!event || typeof event.name !== 'string' || typeof event.date !== 'string' ||
            !/^\d{4}-\d{2}-\d{2}$/.test(event.date) || !Number.isFinite(Date.parse(event.date)) ||
            new Date(event.date).toISOString().slice(0, 10) !== event.date) {
          throw sourceError('A school document event has invalid date information.');
        }
        if (event.weeklyReference || /^no (?:hui|meetings?|assembl(?:y|ies))\b/i.test(event.name.trim()) ||
            event.date < window.start || event.date >= window.end) continue;
        let start = null, end = null;
        try {
          if (event.startTime) start = localInstant(event.date, event.startTime);
          if (event.endTime) end = localInstant(event.date, event.endTime);
          if (end && !start) throw new Error('Missing start time.');
          elapsedStatus(start, end, now);
        } catch { throw sourceError('A school document event has invalid timing. Review the original document.'); }
        candidates.push({ id: 'document:' + await fingerprint(JSON.stringify([event.date, event.name, event.startTime,
          event.endTime, event.dateIsExplicit, event.timeIsExplicit])),
          source: 'document', referenceUrl, date: event.date, title: event.name,
          description: typeof event.details === 'string' ? event.details : '', start, end,
          dateEstimated: event.dateIsExplicit !== true, timeEstimated: Boolean(start) && event.timeIsExplicit !== true,
          status: elapsedStatus(start, end, now), classification: 'ambiguous' });
      }
    }
    return { status: 'metadata-limited', message: 'School document entries do not identify individual attendance; review the original document.' +
      (results.some(result => result.warnings.length) ? ' The source also reported warnings.' : ''), candidates };
  }

  // request(path) is a same-origin GET relative to the Teacher Planner /api/ root.
  async function load({ request, now = new Date(), decisions = null, loadDocuments, expectedOwner }) {
    if (typeof request !== 'function') throw new Error('A read-only request function is required.');
    const instant = new Date(now), window = windowFor(instant);
    const identityFailure = () => ({ window, sources: Object.fromEntries(
      ['planner', 'google', 'school', 'documents'].map(name => [name, { status: 'error', message: 'Planner identity could not be verified or changed during loading.' }])
    ), meetings: [], candidates: [], decisionScope: null, decisionStatus: 'identity-unverified' });
    let owner;
    try {
      owner = (await request('planner/session'))?.userId;
      if (typeof owner !== 'string' || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(owner) ||
          expectedOwner !== undefined && owner !== expectedOwner) return identityFailure();
    } catch { return identityFailure(); }
    const [planner, google, school, documents] = await Promise.allSettled([
      plannerSource(request, window.days, instant), googleSource(request, window, instant), schoolSource(request, window, instant),
      documentSource(loadDocuments, window, instant)
    ]);
    try {
      if ((await request('planner/session'))?.userId !== owner) return identityFailure();
    } catch { return identityFailure(); }
    const sources = {};
    for (const [name, result] of Object.entries({ planner, google, school, documents })) {
      sources[name] = result.status === 'rejected'
        ? { status: 'error', message: result.reason instanceof SourceError ? result.reason.message :
          name === 'planner' ? 'Planner sessions could not be loaded completely.' :
            name === 'google' ? 'Google Calendar could not be loaded.' :
              name === 'school' ? 'School calendar could not be loaded.' :
                'School meeting document could not be loaded. Check Google Docs access and term dates in Year Overview.' }
        : name === 'planner' ? { status: 'ok' } : result.value.candidates
          ? { status: result.value.status, message: result.value.message, unreviewableCount: result.value.unreviewableCount }
          : result.value;
    }
    const decisionScope = { ownerId: owner, connectionId: google.status === 'fulfilled' ? google.value.connectionId || null : null };
    let decisionStatus = decisions == null ? 'none' : 'scope-mismatch';
    let byId = null, schoolById = null;
    const validDecisions = value => value && typeof value === 'object' && !Array.isArray(value) &&
      Object.values(value).every(item => item === 'meeting' || item === 'not-meeting');
    if (decisions != null && decisions.ownerId === owner) {
      if (!validDecisions(decisions.byId) || decisions.schoolById && !validDecisions(decisions.schoolById)) {
        decisionStatus = 'invalid';
      } else {
        schoolById = decisions.schoolById || {};
        if (decisionScope.connectionId && decisions.connectionId === decisionScope.connectionId) byId = decisions.byId;
        decisionStatus = decisions.connectionId === decisionScope.connectionId ? 'applied' : 'scope-mismatch';
      }
    }
    const candidates = [...(planner.status === 'fulfilled' ? planner.value.filter(item => item.classification === 'ambiguous') : []),
      ...(google.status === 'fulfilled' ? (google.value.candidates || []) : []),
      ...(school.status === 'fulfilled' ? (school.value.candidates || []) : []),
      ...(documents.status === 'fulfilled' ? (documents.value.candidates || []) : [])];
    for (const candidate of candidates) {
      const choices = candidate.source === 'google' ? byId : schoolById;
      if (choices && Object.hasOwn(choices, candidate.id)) candidate.classification = choices[candidate.id];
    }
    const meetings = [...(planner.status === 'fulfilled' ? planner.value.filter(item => item.classification === 'meeting') : []),
      ...candidates.filter(candidate => candidate.classification === 'meeting')];
    meetings.sort((a, b) => a.date.localeCompare(b.date) || (a.start || '').localeCompare(b.start || '') || a.id.localeCompare(b.id));
    candidates.sort((a, b) => a.date.localeCompare(b.date) || (a.start || '9999').localeCompare(b.start || '9999') || a.id.localeCompare(b.id));
    return { window, sources, meetings, candidates, decisionScope, decisionStatus };
  }

  const api = { windowFor, elapsedStatus, load };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TodoMeetings = api;
})(globalThis);
