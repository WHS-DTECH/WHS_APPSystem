const test = require('node:test');
const assert = require('node:assert/strict');
const { moduleForPath, createModuleSearch, readSource } = require('../src/moduleSearch');
const config = require('../src/config');

const user = { id: 'fixture-user', email: `fixture@${config.google.hostedDomain || 'westlandhigh.school.nz'}`, roles: ['Student'], is_active: true };
const unexpected = async () => { throw new Error('Unexpected data source'); };

async function search(page, q, overrides = {}, account = user) {
  const response = { statusCode: 200, headers: {},
    set(name, value) { this.headers[name] = value; return this; },
    status(value) { this.statusCode = value; return this; },
    json(body) { this.body = body; return this; },
    redirect(url) { this.statusCode = 302; this.location = url; return this; }
  };
  await createModuleSearch({ dbQuery: unexpected, read: unexpected, dtechAccess: unexpected,
    learningStore: unexpected, appRecords: unexpected, ...overrides })(
    { user: account, query: { path: page, q }, headers: {} }, response);
  return response;
}

test('module scope is exact, current-path based, and never falls back to all modules', () => {
  for (const [pathname, key] of [
    ['/dtech-hub/class-training/home', 'training'], ['/dtech-hub/', 'dtech'],
    ['/hubs/dtech-hub/roles', 'dtech'], ['/apps/guidance-counsellor-app/students', 'guidance'],
    ['/student-apps/guidance-counsellor-app', 'guidance'], ['/student-apps', 'apps'], ['/student-apps/new', 'apps'],
    ['/admin/kamar-uploader/', 'kamar'], ['/admin/technology-hub', 'technology'],
    ['/admin/users', 'core'], ['/DTECH/10DTEC/', 'learning'], ['/ReleverPlan/', 'learning'],
    ['/sewing-hub/', 'sewing'], ['/food-room/', 'food'], ['/workshop/', 'workshop']
  ]) assert.equal(moduleForPath(pathname)?.key, key, pathname);
  for (const pathname of [undefined, [], '//other.test/', 'https://other.test/', '/\\other.test',
    '/food-room/?path=/admin', '/unknown', '/apps/future-app', '/dtech-hub-other']) {
    assert.equal(moduleForPath(pathname), null, String(pathname));
  }
});

test('authentication, active status and query validation fail explicitly before any data reads', async (t) => {
  t.mock.method(console, 'error', () => {});
  for (const [page, q, account, status] of [
    ['/food-room/', 'cake', null, 401], ['/food-room/', 'cake', { ...user, is_active: false }, 403],
    ['/unknown', 'cake', user, 400], ['/food-room/', 'a', user, 400],
    ['/food-room/', 'x'.repeat(101), user, 400], ['/food-room/', ['cake'], user, 400]
  ]) {
    const result = await search(page, q, {}, account);
    assert.equal(result.statusCode, status);
    assert.ok(result.body.error);
    assert.equal(result.headers['Cache-Control'], 'private, no-store');
  }
});

test('DTECH student search never reads teacher records, including after role revocation', async () => {
  for (const teacher of [true, false]) {
    const calls = [];
    const result = await search('/dtech-hub/', 'fixture', {
      dtechAccess: async () => ({ active: true, teacher }),
      read: async (_req, name) => {
        calls.push(name);
        return name === 'dtechActivities'
          ? [{ id: 1, name: 'Fixture assessment', description: '<b>Original task</b>', activity_category: 'Assessment Tasks' }]
          : [{ title: `Fixture ${name}` }];
      }
    });
    assert.equal(result.statusCode, 200);
    assert.equal(result.body.module, 'DTECH Hub');
    assert.equal(result.body.results.some((record) => record.kind === 'Lesson'), teacher);
    assert.deepEqual(calls.sort(), teacher ? ['dtechActivities', 'dtechLessons', 'dtechUnits'] : ['dtechActivities']);
    assert.equal(result.body.results[0].description, ' Original task ');
  }
});

test('forged DTECH and Kamar paths do not bypass their actual permissions', async (t) => {
  t.mock.method(console, 'error', () => {});
  assert.equal((await search('/dtech-hub/', 'fixture', {
    dtechAccess: async () => ({ active: false })
  })).statusCode, 403);
  assert.equal((await search('/admin/kamar-uploader/', 'fixture')).statusCode, 403);
  const kamar = await search('/admin/kamar-uploader/', 'fixture', {
    read: async (_req, name) => name === 'kamarStaff'
      ? { staff: [{ first_name: 'Fixture', last_name: 'Staff', email_school: 'school@example.test', password: 'not searchable' }] }
      : { students: [{ first_name: 'Fixture', last_name: 'Student', id_number: '123', private_notes: 'not searchable' }] }
  }, { ...user, roles: ['ADMIN'] });
  assert.equal(kamar.statusCode, 200);
  assert.equal(kamar.body.results.length, 2);
  assert.ok(!JSON.stringify(kamar.body).includes('not searchable'));
});

test('hub sources retain their original response shapes and stay inside the selected module', async () => {
  for (const [page, source, data, title] of [
    ['/food-room/', 'food', [{ id: 1, name: 'Fixture recipe', description: 'Ingredients' }], 'Fixture recipe'],
    ['/sewing-hub/', 'sewing', [{ id: 2, name: 'Fixture activity', teacher_notes: 'Private note' }], 'Fixture activity'],
    ['/workshop/', 'worksheets', { worksheets: [{ id: 3, worksheet_title: 'Fixture worksheet', strand_title: 'Wood' }] }, 'Fixture worksheet']
  ]) {
    const calls = [];
    const result = await search(page, 'fixture', { read: async (_req, name) => {
      calls.push(name);
      return name === source ? data : { lessonNotes: [] };
    } });
    assert.equal(result.statusCode, 200);
    assert.equal(result.body.results[0].title, title);
    assert.ok(!JSON.stringify(result.body).includes('Private note'));
    assert.deepEqual(calls, page === '/workshop/' ? ['worksheets', 'lessonNotes'] : [source]);
  }
});

test('technology search exposes only assigned disciplines, with ADMIN bypass', async () => {
  const result = await search('/technology-hub/', 'wood', {
    dbQuery: async (sql, params) => {
      if (sql.includes('hub_role_permissions')) {
        if (!sql.includes('technology_hub_access')) return { rows: [], rowCount: 0 };
      }
      assert.match(sql, /technology_hub_access/);
      assert.deepEqual(params, [user.id, true]);
      return { rows: [{ area_key: 'textiles' }] };
    }
  });
  assert.deepEqual(result.body.results, []);
  const admin = await search('/technology-hub/', 'wood', {}, { ...user, roles: ['ADMIN'] });
  assert.equal(admin.body.results[0].title, 'Woodwork and Furniture');
});

test('Learning Sites uses public assessment strings and gates staff navigation', async () => {
  for (const admin of [false, true]) {
    const result = await search('/learning-sites/', 'fixture', {
      dbQuery: async () => ({ rows: [], rowCount: 0 }),
      learningStore: () => ({
        initAdminSchema: async () => {},
        getCourseContentTargets: async () => [{ courseCode: '10DTEC', courseName: 'Fixture course', subjectCode: 'DTECH' }],
        getCourseContent: async () => ({ assessments: ['Fixture assessment'] })
      })
    }, { ...user, roles: admin ? ['ADMIN'] : ['Student'] });
    assert.equal(result.body.results.length, 2);
    assert.equal(result.body.results[0].url, '/DTECH/10DTEC/');
  }
});

test('registry search delegates the same user to the existing dashboard visibility query', async () => {
  const result = await search('/student-apps', 'fixture', {
    appRecords: async (account) => {
      assert.equal(account, user);
      return [{ name: 'Fixture App', slug: 'fixture-app', description: 'Visible app' }];
    }
  });
  assert.equal(result.body.results[0].url, '/student-apps/fixture-app');
});

test('Learning Sites navigation follows module permissions, not global promotion', async () => {
  for (const role of ['teacher', 'technician', 'lead-teacher']) {
    const result = await search('/learning-sites/', 'plan', {
      dbQuery: async (_sql, params) => {
        assert.equal(params[1], 'learning-sites');
        return { rows: [], rowCount: params[2] === 'teacher.view' || role === 'lead-teacher' ? 1 : 0 };
      },
      learningStore: () => ({ initAdminSchema: async () => {}, getCourseContentTargets: async () => [] })
    });
    assert.equal(result.statusCode, 200);
    assert.ok(result.body.results.some(row => row.url === '/ReleverPlan/'));
    const dashboard = await search('/learning-sites/', 'dashboard', {
      dbQuery: async (_sql, params) => ({ rows: [], rowCount: role === 'lead-teacher' && params[2] === 'admin.manage' ? 1 : 0 }),
      learningStore: () => ({ initAdminSchema: async () => {}, getCourseContentTargets: async () => [] })
    });
    assert.equal(dashboard.body.results.some(row => row.url === '/ADMIN/'), role === 'lead-teacher');
  }
});

test('Core students never query account data or see administrator pages', async () => {
  const result = await search('/dashboard', 'users');
  assert.deepEqual(result.body.results, []);
  const admin = await search('/admin', 'fixture', {
    dbQuery: async (sql, params) => {
      assert.match(sql, /is_active = true/);
      assert.deepEqual(params, ['fixture']);
      return { rows: [{ display_name: 'Fixture User', email: 'fixture@example.test' }] };
    }
  }, { ...user, roles: ['ADMIN'] });
  assert.equal(admin.body.results[0].kind, 'School account');
});

test('native capsule search is delegated through the normal authenticated proxy', async () => {
  for (const [page, target] of [
    ['/dtech-hub/class-training/home', '/dtech-hub/class-training/api/school-search?q=two%20words'],
    ['/apps/guidance-counsellor-app/students', '/apps/guidance-counsellor-app/api/school-search?q=two%20words']
  ]) assert.equal((await search(page, 'two words')).location, target);
});

test('results have a stable limited shape, and provider failures are not disguised as empty success', async (t) => {
  t.mock.method(console, 'error', () => {});
  const result = await search('/food-room/', 'fixture', {
    read: async () => Array.from({ length: 65 }, (_, id) => ({ id, name: `Fixture ${id}`, description: 'x'.repeat(500) }))
  });
  assert.equal(result.body.results.length, 50);
  assert.equal(result.body.truncated, true);
  assert.deepEqual(Object.keys(result.body.results[0]).sort(), ['description', 'kind', 'title', 'url']);
  assert.equal(result.body.results[0].description.length, 240);
  const fullText = await search('/food-room/', 'after-preview', {
    read: async () => [{ id: 1, name: 'Recipe', description: 'x'.repeat(300) + 'after-preview' }]
  });
  assert.equal(fullText.body.results.length, 1);
  for (const read of [async () => { throw new Error('private connection detail'); }, async () => ({ unexpected: [] })]) {
    const failed = await search('/food-room/', 'fixture', { read });
    assert.equal(failed.statusCode, 503);
    assert.ok(!failed.body.error.includes('private connection detail'));
    assert.equal(failed.body.results, undefined);
  }
});

test('source reads use fixed loopback URLs, only the session cookie, and never follow redirects', async (t) => {
  const requests = [];
  t.mock.method(global, 'fetch', async (url, options) => {
    requests.push({ url, options });
    return new Response('[]', { headers: { 'Content-Type': 'application/json' } });
  });
  const req = { headers: { cookie: 'legacy_secret=hidden; whs.sid=session-value; another=hidden', authorization: 'hidden' } };
  await readSource(req, 'food');
  assert.equal(requests[0].url, `http://127.0.0.1:${config.port}/food-room/api/recipes`);
  assert.deepEqual(requests[0].options.headers, { cookie: 'whs.sid=session-value' });
  assert.equal(requests[0].options.redirect, 'manual');
  await assert.rejects(readSource(req, 'https://external.test/'), /Unknown module/);
  await assert.rejects(readSource({ headers: {} }, 'food'), /expired/);
  global.fetch.mock.mockImplementation(async () => new Response('', { status: 302 }));
  await assert.rejects(readSource(req, 'food'), /current role/);
});
