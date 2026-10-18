const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
test.mock.method(require('../src/db').pool, 'query', async () => ({ rows: [], rowCount: 0 }));
const foodDb = require('../src/legacy/food-room/db');
test.mock.method(foodDb, 'query', async () => ({ rows: [], rowCount: 0 }));
test.mock.method(foodDb, 'connect', async () => ({
  query: async () => ({ rows: [], rowCount: 0 }),
  release() {}
}));
const foodRoom = require('../src/modules/foodRoom');

function startApp(roles) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.user = roles ? { id: '00000000-0000-0000-0000-000000000001', roles, display_name: 'Test User', email: 't@westlandhigh.school.nz' } : undefined;
    req.logout = (done) => done();
    next();
  });
  app.use('/food-room', foodRoom);

  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve({ server, base: `http://127.0.0.1:${server.address().port}/food-room` }));
  });
}

test('legacy Food Room pages are served and call the namespaced legacy API', async () => {
  const { server, base } = await startApp(['Student']);
  try {
    for (const page of ['index.html', 'book_a_class.html', 'place_order.html']) {
      assert.strictEqual((await fetch(`${base}/${page}`)).status, 200, page);
    }
    const script = await (await fetch(`${base}/book_a_class.js`)).text();
    assert.ok(script.includes('/food-room/api/'));
    assert.ok(!/['"`]\/api\//.test(script));
  } finally {
    server.close();
  }
});

test('anonymous visitors are told they are signed out and sent to the app login', async () => {
  const { server, base } = await startApp(null);
  try {
    const me = await (await fetch(`${base}/api/auth/me`)).json();
    assert.strictEqual(me.authenticated, false);
    const config = await (await fetch(`${base}/api/auth/google/config`)).json();
    assert.strictEqual(config.loginUrl, '/auth/google');
    assert.strictEqual((await fetch(`${base}/api/permissions/reset`, { method: 'POST' })).status, 401);
  } finally {
    server.close();
  }
});

test('unassigned students cannot pass the legacy module admin guard', async () => {
  const student = await startApp(['Student']);
  try {
    assert.strictEqual((await fetch(`${student.base}/api/permissions/reset`, { method: 'POST' })).status, 403);
  } finally {
    student.server.close();
  }
});

test('spoofed identity headers are ignored by the legacy API', async () => {
  const { server, base } = await startApp(null);
  try {
    const response = await fetch(`${base}/api/permissions/reset`, {
      method: 'POST',
      headers: { 'x-user-email': 'admin@westlandhigh.school.nz' }
    });
    assert.strictEqual(response.status, 401);
  } finally {
    server.close();
  }
});
