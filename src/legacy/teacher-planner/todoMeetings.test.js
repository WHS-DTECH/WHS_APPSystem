const test = require('node:test');
const assert = require('node:assert/strict');
const { windowFor, elapsedStatus, load } = require('./public/todo-meetings');

const now = '2026-11-25T23:00:00Z'; // Thursday in Auckland.
const slot = 'manual-11111111-1111-4111-8111-111111111111';
const otherSlot = 'manual-22222222-2222-4222-8222-222222222222';
function fixture() {
  const calls = [];
  const listing = [
    { slot_key: slot, session_type: 'meeting', title: 'Planning' },
    { slot_key: otherSlot, session_type: 'teaching', title: 'Planning' }
  ];
  const detail = { available: true, revision: 1, event: { date: '2026-11-26', slot },
    content: { session: { title: 'Planning', type: 'meeting', startTime: '10:00', endTime: '11:00' } } };
  const request = async path => {
    calls.push(path);
    if (path === 'planner/session') return { userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' };
    if (path === 'planner/google-calendar/') return { configured: true, connected: true, connectionId: 'connection', selectedCalendars: ['selected'] };
    if (path.startsWith('planner/google-calendar/events?')) return {
      connectionId: 'connection', events: [{ title: 'Meeting', id: 'calendar:event' }]
    };
    if (path.startsWith('kamar-calendar/')) {
      const [, year, month] = path.split('/');
      return { year: Number(year), month: Number(month), events: [{ title: 'Meeting', id: 'same-title' }] };
    }
    if (path === 'planner/sessions/2026-11-26/' + slot) return detail;
    if (path.startsWith('planner/sessions/')) return { sessions: path.endsWith('2026-11-26') ? listing : [] };
    throw new Error('Unexpected request.');
  };
  return { calls, listing, detail, request };
}

test('seven Auckland calendar days span months, years and daylight saving', () => {
  assert.deepEqual(windowFor('2026-12-31T12:00:00Z'), {
    start: '2027-01-01', end: '2027-01-08',
    days: ['2027-01-01', '2027-01-02', '2027-01-03', '2027-01-04', '2027-01-05', '2027-01-06', '2027-01-07']
  });
  assert.equal(windowFor('2026-09-26T11:30:00Z').start, '2026-09-26');
  assert.equal(windowFor('2026-09-26T12:00:00Z').start, '2026-09-27');
});

test('loads owner-scoped sessions using GET request adapter and reports unusable calendar metadata', async () => {
  const f = fixture();
  const result = await load({ request: f.request, now });
  assert.equal(result.sources.planner.status, 'ok');
  assert.equal(result.sources.google.status, 'metadata-limited');
  assert.equal(result.sources.school.status, 'metadata-limited');
  assert.equal(result.meetings.length, 1);
  assert.deepEqual(result.meetings[0], {
    id: JSON.stringify(['planner', '2026-11-26', slot]), source: 'planner', date: '2026-11-26', slot,
    title: 'Planning', start: '2026-11-25T21:00:00.000Z', end: '2026-11-25T22:00:00.000Z',
    status: 'elapsed', classification: 'meeting', evidence: 'Planner session type'
  });
  assert.deepEqual(f.calls.filter(path => path.includes('events?start=')), [
    'planner/google-calendar/events?start=2026-11-22', 'planner/google-calendar/events?start=2026-11-29'
  ]);
  assert.ok(f.calls.includes('kamar-calendar/2026/11'));
  assert.ok(f.calls.includes('kamar-calendar/2026/12'));
  assert.ok(!f.calls.some(path => path.endsWith(otherSlot)));
});

test('time uncertainty and boundaries are explicit', async () => {
  assert.equal(elapsedStatus(null, null, now), 'unknown');
  assert.equal(elapsedStatus('2026-11-25T23:00:00Z', null, now), 'unknown');
  assert.equal(elapsedStatus('2026-11-25T23:00:00Z', '2026-11-26T00:00:00Z', now), 'in-progress');
  assert.equal(elapsedStatus('2026-11-25T22:00:00Z', '2026-11-25T23:00:00Z', now), 'elapsed');
  assert.equal(elapsedStatus('2026-11-26T00:00:00Z', null, now), 'upcoming');
  const f = fixture();
  f.detail.content.session.startTime = '';
  f.detail.content.session.endTime = '';
  const result = await load({ request: f.request, now });
  assert.equal(result.meetings[0].status, 'unknown');
  assert.equal(result.meetings[0].start, null);
});

test('partial failures, changed sessions and connection changes never produce partial or stale data', async () => {
  const f = fixture();
  const request = async path => {
    if (path === 'planner/sessions/2026-11-27') throw new Error('private details');
    if (path.includes('events?start=2026-11-29')) return { connectionId: 'different', events: [] };
    if (path === 'kamar-calendar/2026/12') throw new Error('private details');
    return f.request(path);
  };
  const result = await load({ request, now });
  assert.deepEqual(result.meetings, []);
  assert.deepEqual(Object.values(result.sources).map(source => source.status), ['error', 'error', 'error', 'error']);
  assert.ok(!JSON.stringify(result).includes('private details'));
  f.detail.content.session.type = 'teaching';
  const changed = await load({ request: f.request, now });
  assert.equal(changed.sources.planner.status, 'error');
  assert.deepEqual(changed.meetings, []);
});

test('identity is source and slot based: similarly titled sessions are never merged', async () => {
  const f = fixture();
  f.listing[1].session_type = 'meeting';
  const result = await load({ now, request: async path => {
    if (path.endsWith(otherSlot)) return { ...f.detail, event: { date: '2026-11-26', slot: otherSlot } };
    return f.request(path);
  } });
  assert.equal(result.meetings.length, 2);
  assert.notEqual(result.meetings[0].id, result.meetings[1].id);
});

test('a changing or unverifiable signed-in identity clears all results', async () => {
  const f = fixture();
  let checks = 0;
  const result = await load({ now, request: async path => {
    if (path === 'planner/session' && ++checks === 2) return { userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' };
    return f.request(path);
  } });
  assert.deepEqual(result.meetings, []);
  assert.ok(Object.values(result.sources).every(source => source.status === 'error'));
  assert.match(result.sources.planner.message, /identity/);
  const switched = await load({ now, request: f.request, expectedOwner: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' });
  assert.deepEqual(switched.meetings, []);
  assert.ok(Object.values(switched.sources).every(source => source.status === 'error'));
});

test('disconnected and unselected Google sources are distinct from source failures', async () => {
  const f = fixture();
  for (const [connection, expected] of [
    [{ configured: false }, 'error'],
    [{ configured: true, connected: false }, 'error'],
    [{ configured: true, connected: true, connectionId: 'connection', selectedCalendars: [] }, 'not-selected']
  ]) {
    const result = await load({ now, request: path => path === 'planner/google-calendar/' ? connection : f.request(path) });
    assert.equal(result.sources.google.status, expected);
    assert.equal(result.sources.planner.status, 'ok');
  }
});

test('session local times use the correct Auckland offset after daylight saving ends', async () => {
  const f = fixture();
  const day = '2026-04-06';
  f.detail.event.date = day;
  const result = await load({ now: '2026-04-05T22:00:00Z', request: path => {
    if (path === 'planner/sessions/' + day) return { sessions: f.listing };
    if (path === 'planner/sessions/' + day + '/' + slot) return f.detail;
    return f.request(path);
  } });
  assert.equal(result.meetings[0].start, '2026-04-05T22:00:00.000Z');
  assert.equal(result.meetings[0].end, '2026-04-05T23:00:00.000Z');
});

function googleEvent(eventId, changes = {}) {
  return { id: 'selected:' + eventId, title: 'Review item', calendar: 'Selected',
    location: 'Room', start: '2026-11-25T22:30:00.000Z', end: '2026-11-25T23:30:00.000Z',
    allDay: false, htmlLink: 'https://calendar.google.com/calendar/event?eid=fixture',
    meetingMetadata: { identity: { calendarId: 'selected', eventId }, status: 'confirmed',
      eventType: 'default', updated: '2026-11-25T18:00:00.000Z', response: 'accepted', ownerIsOrganiser: false }, ...changes };
}
function withGoogle(f, eventsByWeek) {
  return path => {
    if (path.startsWith('planner/google-calendar/events?')) {
      return { connectionId: 'connection', events: eventsByWeek[path.split('=')[1]] || [] };
    }
    return f.request(path);
  };
}

test('Google candidates are review-only, scoped to owner and connection, and never deduplicated by title', async () => {
  const f = fixture();
  const one = googleEvent('one'), two = googleEvent('two');
  const request = withGoogle(f, { '2026-11-22': [one, two], '2026-11-29': [one] });
  const initial = await load({ request, now });
  assert.equal(initial.sources.google.status, 'ok');
  assert.equal(initial.candidates.length, 2);
  assert.equal(initial.meetings.length, 1, 'no Google event is inferred to be a meeting');
  assert.equal(initial.candidates[0].status, 'in-progress');
  assert.equal(initial.candidates[0].sourceId, 'one');
  assert.equal(initial.candidates[0].calendarId, 'selected');
  assert.equal(initial.candidates[0].url, one.htmlLink);
  assert.equal(initial.candidates[0].sourceUrl, one.htmlLink);
  assert.deepEqual(initial.decisionScope, {
    ownerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', connectionId: 'connection'
  });
  const byId = { [initial.candidates[0].id]: 'meeting', [initial.candidates[1].id]: 'not-meeting' };
  const reviewed = await load({ request, now, decisions: { ...initial.decisionScope, byId } });
  assert.equal(reviewed.decisionStatus, 'applied');
  assert.equal(reviewed.meetings.length, 2);
  assert.deepEqual(reviewed.candidates.map(item => item.classification), ['meeting', 'not-meeting']);
  const otherOwner = await load({ request, now, decisions: { ...initial.decisionScope, ownerId: 'different', byId } });
  assert.equal(otherOwner.decisionStatus, 'scope-mismatch');
  assert.equal(otherOwner.meetings.length, 1);
  const otherConnection = await load({ request, now, decisions: { ...initial.decisionScope, connectionId: 'old', byId } });
  assert.equal(otherConnection.meetings.length, 1);
  const invalid = await load({ request, now, decisions: { ...initial.decisionScope, byId: { [initial.candidates[0].id]: true } } });
  assert.equal(invalid.decisionStatus, 'invalid');
  assert.equal(invalid.meetings.length, 1);
  const updated = { ...one, meetingMetadata: { ...one.meetingMetadata, updated: '2026-11-26T01:00:00.000Z' } };
  const changed = await load({ request: withGoogle(f, { '2026-11-22': [updated, two] }), now,
    decisions: { ...initial.decisionScope, byId } });
  assert.equal(changed.meetings.length, 1, 'a changed event requires a new owner review');
});

test('Google declined, cancelled, teaching and special event types cannot be manually restored', async () => {
  const f = fixture();
  const normal = googleEvent('normal');
  const metadata = normal.meetingMetadata;
  const blocked = [
    googleEvent('declined', { meetingMetadata: { ...metadata, identity: { calendarId: 'selected', eventId: 'declined' }, response: 'declined' } }),
    googleEvent('cancelled', { meetingMetadata: { ...metadata, identity: { calendarId: 'selected', eventId: 'cancelled' }, status: 'cancelled' } }),
    googleEvent('teaching', { meetingMetadata: { ...metadata, identity: { calendarId: 'selected', eventId: 'teaching' }, teaching: true } }),
    googleEvent('focus', { meetingMetadata: { ...metadata, identity: { calendarId: 'selected', eventId: 'focus' }, eventType: 'focusTime' } }),
    googleEvent('unknown', { meetingMetadata: { ...metadata, identity: { calendarId: 'selected', eventId: 'unknown' }, response: 'unknown' } })
  ];
  const byId = Object.fromEntries(blocked.map(event => [
    JSON.stringify(['google', 'connection', 'selected', event.meetingMetadata.identity.eventId,
      event.meetingMetadata.updated, event.meetingMetadata.status, event.meetingMetadata.response,
      event.meetingMetadata.ownerIsOrganiser]), 'meeting'
  ]));
  const result = await load({ request: withGoogle(f, { '2026-11-22': [normal, ...blocked] }), now,
    decisions: { ownerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', connectionId: 'connection', byId } });
  assert.deepEqual(result.candidates.map(candidate => candidate.sourceId), ['normal']);
  assert.equal(result.meetings.length, 1);
  assert.equal(result.sources.google.status, 'metadata-limited');
  assert.equal(result.sources.google.unreviewableCount, 1);
});

test('Google candidates obey Auckland date window, all-day exclusive ends and safe source links', async () => {
  const f = fixture();
  const outside = googleEvent('outside', { start: '2026-12-03T11:00:00.000Z', end: '2026-12-03T12:00:00.000Z' });
  const ended = googleEvent('ended', { allDay: true, start: '2026-11-25', end: '2026-11-26' });
  const allDay = googleEvent('all-day', { allDay: true, start: '2026-11-26', end: '2026-11-27', htmlLink: 'https://evil.test/' });
  const result = await load({ request: withGoogle(f, { '2026-11-22': [outside, ended, allDay] }), now });
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].sourceId, 'all-day');
  assert.equal(result.candidates[0].status, 'in-progress');
  assert.equal(result.candidates[0].sourceUrl, '');
});

test('a reviewed multi-day event still appears on a day it overlaps', async () => {
  const f = fixture();
  const event = googleEvent('multi-day', { allDay: true, start: '2026-11-25', end: '2026-11-28' });
  const request = withGoogle(f, { '2026-11-22': [event] });
  const initial = await load({ request, now });
  const reviewed = await load({ request, now, decisions: {
    ...initial.decisionScope, byId: { [initial.candidates[0].id]: 'meeting' }
  } });
  assert.equal(reviewed.meetings.find(meeting => meeting.source === 'google').date, '2026-11-26');
});

test('school events require owner review even when Google is disconnected', async () => {
  const f = fixture();
  const event = { id: 'school-event', title: 'Staff meeting', start: '2026-11-26T14:00:00',
    end: '2026-11-26T15:00:00', allDay: false, location: 'Hall' };
  const request = async path => {
    if (path === 'planner/google-calendar/') return { configured: true, connected: false };
    if (path.startsWith('kamar-calendar/')) {
      const [, year, month] = path.split('/');
      return { year: Number(year), month: Number(month), events: [event] };
    }
    return f.request(path);
  };
  const initial = await load({ request, now });
  assert.equal(initial.candidates.length, 1, 'overlapping monthly feeds are deduplicated');
  assert.equal(initial.candidates[0].classification, 'ambiguous');
  assert.equal(initial.meetings.length, 1, 'school events are not automatically treated as meetings');
  const decisions = { ...initial.decisionScope, byId: {}, schoolById: { [initial.candidates[0].id]: 'meeting' } };
  const reviewed = await load({ request, now, decisions });
  assert.equal(reviewed.meetings.find(meeting => meeting.source === 'school').start, '2026-11-26T01:00:00.000Z');
  event.title = 'Changed meeting';
  const changed = await load({ request, now, decisions });
  assert.ok(!changed.meetings.some(meeting => meeting.source === 'school'), 'changed events require review again');
});

test('planner observations require owner review instead of being inferred as meetings', async () => {
  const f = fixture();
  f.listing[0].session_type = 'observation';
  f.detail.content.session.type = 'observation';
  const initial = await load({ request: f.request, now });
  assert.equal(initial.meetings.length, 0);
  const candidate = initial.candidates.find(item => item.source === 'planner-review');
  assert.equal(candidate.classification, 'ambiguous');
  const reviewed = await load({ request: f.request, now, decisions: {
    ...initial.decisionScope, byId: {}, schoolById: { [candidate.id]: 'meeting' }
  } });
  assert.equal(reviewed.meetings[0].slot, slot);
  f.detail.revision++;
  const changed = await load({ request: f.request, now, decisions: {
    ...initial.decisionScope, byId: {}, schoolById: { [candidate.id]: 'meeting' }
  } });
  assert.equal(changed.meetings.length, 0);
});

test('school document meetings require review and weekly references are not treated as dated meetings', async () => {
  const f = fixture();
  const loadDocuments = async () => ({ sourceUrl: 'https://docs.google.com/document/d/example/edit', warnings: [], events: [
    { date: '2026-11-26', name: 'Team hui', startTime: '15:30', endTime: '16:30', weeklyReference: false },
    { date: '2026-11-26', name: 'School notice', startTime: '', endTime: '', weeklyReference: true },
    { date: '2026-11-26', name: 'No hui', startTime: '', endTime: '', weeklyReference: false }
  ] });
  const initial = await load({ request: f.request, now, loadDocuments });
  const candidate = initial.candidates.find(item => item.source === 'document');
  assert.equal(initial.candidates.filter(item => item.source === 'document').length, 1);
  assert.equal(candidate.classification, 'ambiguous');
  assert.ok(!candidate.id.includes('Team hui'));
  const reviewed = await load({ request: f.request, now, loadDocuments, decisions: {
    ...initial.decisionScope, byId: {}, schoolById: { [candidate.id]: 'meeting' }
  } });
  assert.equal(reviewed.meetings.find(item => item.source === 'document').start, '2026-11-26T02:30:00.000Z');
  assert.equal(reviewed.sources.documents.status, 'metadata-limited');
});

test('Google conflicting duplicate copies and changed calendar selection fail closed', async () => {
  const f = fixture();
  const first = googleEvent('same');
  const request = withGoogle(f, { '2026-11-22': [first], '2026-11-29': [{ ...first, title: 'Changed' }] });
  const result = await load({ request, now });
  assert.equal(result.sources.google.status, 'error');
  assert.deepEqual(result.candidates, []);
  let count = 0;
  const changed = await load({ now, request: path => {
    if (path === 'planner/google-calendar/' && ++count === 2) {
      return { configured: true, connected: true, connectionId: 'connection', selectedCalendars: ['other'] };
    }
    return withGoogle(f, { '2026-11-22': [first] })(path);
  } });
  assert.equal(changed.sources.google.status, 'error');
  assert.deepEqual(changed.candidates, []);
});
