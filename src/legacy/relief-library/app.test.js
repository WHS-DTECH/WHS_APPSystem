const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createModuleRouter } = require('./app');

async function startModule() {
  let user;
  const app = express();
  app.use((req, res, next) => { req.user = user; next(); });
  app.use('/', createModuleRouter());
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  return {
    server,
    setUser: (nextUser) => { user = nextUser; },
    url: `http://127.0.0.1:${server.address().port}`
  };
}

test('Relief routes require an authorised staff role', async () => {
  const fixture = await startModule();
  try {
    assert.equal((await fetch(fixture.url)).status, 401);
    fixture.setUser({ roles: ['Student'] });
    assert.equal((await fetch(fixture.url)).status, 403);
    assert.equal((await fetch(fixture.url + '/api/relief-plan/events')).status, 403);
    fixture.setUser({ roles: ['Teacher'] });
    const response = await fetch(fixture.url);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/html/);
    const html = await response.text();
    assert.match(html, /Relief Plan/);
    assert.match(html, /id="relief-plan-calendar"/);
    assert.match(html, /Previous month/);
    assert.match(html, /Go to date/);
    assert.match(html, /JDTECH - Junior Digital Tech/);
    assert.match(html, /framework\/relief-plan.js/);
    assert.match(html, /framework\/relief-plan.css/);
    assert.match(html, /Last Updated:/);
    assert.ok(!html.includes('name="whs-global-control"'));
    const eventsResponse = await fetch(fixture.url + '/api/relief-plan/events');
    assert.equal(eventsResponse.status, 200);
    assert.equal(eventsResponse.headers.get('cache-control'), 'no-store');
    const data = await eventsResponse.json();
    assert.equal(data.year, 2027);
    assert.equal(data.role, 'Teacher');
    assert.equal(data.events.length, 136);
    assert.deepEqual(Object.keys(data.events[0]), [
      'subject', 'startDate', 'startTime', 'endDate', 'endTime', 'allDay',
      'description', 'aboutTheEvent', 'location', 'source', 'technologyContext'
    ]);
    assert.ok(data.events.some((event) => event.startDate.endsWith('/2026')));
    fixture.setUser({ roles: ['ADMIN'] });
    const adminResponse = await fetch(fixture.url + '/api/relief-plan/events');
    assert.equal((await adminResponse.json()).role, 'ADMIN');
  } finally { await new Promise((resolve) => fixture.server.close(resolve)); }
});
