const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..', 'src', 'legacy', 'dtech-hub');

test('assessment schema runs once for concurrent and later reads, and retries failed preparation', async () => {
  const source = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  const schema = source.slice(source.indexOf('let assessmentStandardCardsSchemaPromise;'),
    source.indexOf('async function seedDefaultAssessmentStandardCards()'));
  const queries = [];
  let fail = true;
  const context = vm.createContext({
    hasDatabase: true,
    pool: { query: async (sql) => {
      queries.push(sql);
      if (fail) { fail = false; throw new Error('Temporary database failure'); }
    } }
  });
  vm.runInContext(schema, context);
  await assert.rejects(vm.runInContext('ensureAssessmentStandardCardsSchema()', context), /Temporary database failure/);
  queries.length = 0;
  await vm.runInContext('Promise.all([ensureAssessmentStandardCardsSchema(), ensureAssessmentStandardCardsSchema()])', context);
  const preparedCount = queries.length;
  assert.equal(preparedCount, 20);
  await vm.runInContext('ensureAssessmentStandardCardsSchema()', context);
  assert.equal(queries.length, preparedCount, 'later homepage reads must not repeat DDL');
});

test('homepage shares concurrent feeds and skips repeated same-account auth refreshes', async () => {
  const source = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
  const start = source.indexOf('let homepageLibraryLoad = null;');
  const end = source.indexOf('function colorToPalette(', start);
  let email = 'student@example.test';
  let authChanged;
  const calls = [];
  const context = vm.createContext({
    window: { addEventListener: (name, callback) => { authChanged = callback; } },
    getActiveHubEmail: () => email,
    isHomepagePath: () => true,
    loadSharedProjects: async () => { calls.push('projects'); return ['original project']; },
    loadSharedLessons: async () => { calls.push('lessons'); return ['original lesson']; },
    loadAssessmentStandardCardsForLibrary: async () => { calls.push('standards'); return ['original standard']; },
    mergeProjects: (rows) => rows,
    renderCurrentWeek() {}, renderLibrary() {}
  });
  vm.runInContext('let projects=[], lessons=[], standardCards=[];\n' + source.slice(start, end), context);
  await vm.runInContext('Promise.all([refreshActivitiesLibrary(), refreshActivitiesLibrary(), refreshActivitiesLibrary()])', context);
  assert.deepEqual(calls, ['projects', 'lessons', 'standards']);
  authChanged({ detail: { signedIn: true } });
  authChanged({ detail: { signedIn: true } });
  await new Promise(setImmediate);
  assert.equal(calls.length, 3);
  assert.equal(vm.runInContext('standardCards[0]', context), 'original standard');
  email = 'another@example.test';
  authChanged({ detail: { signedIn: true } });
  await new Promise(setImmediate);
  assert.equal(calls.length, 6);
  authChanged({ detail: { signedIn: false } });
  assert.equal(vm.runInContext('lessons.length', context), 0);
  authChanged({ detail: { signedIn: true } });
  await new Promise(setImmediate);
  assert.equal(calls.length, 9);
  const init = source.slice(source.indexOf('async function init()'));
  assert.match(init, /await refreshActivitiesLibrary\(\)/);
  assert.ok(init.indexOf('loadHubAuthState();') < init.indexOf('await refreshActivitiesLibrary()'));
  assert.doesNotMatch(init, /loadSharedProjects\(\)/);
});

test('account changes during a slow homepage load discard old results and load the new account', async () => {
  const source = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
  const start = source.indexOf('let homepageLibraryLoad = null;');
  let email = 'first@example.test';
  let release;
  let count = 0;
  const context = vm.createContext({
    window: { addEventListener() {} },
    getActiveHubEmail: () => email,
    loadSharedProjects: () => {
      count += 1;
      return count === 1 ? new Promise((resolve) => { release = resolve; }) : Promise.resolve(['new account']);
    },
    loadSharedLessons: async () => [],
    loadAssessmentStandardCardsForLibrary: async () => [],
    mergeProjects: (rows) => rows,
    renderCurrentWeek() {}, renderLibrary() {}
  });
  vm.runInContext('let projects=[], lessons=[], standardCards=[];\n' +
    source.slice(start, source.indexOf('function colorToPalette(', start)), context);
  const oldLoad = vm.runInContext('refreshActivitiesLibrary()', context);
  email = 'second@example.test';
  const newLoad = vm.runInContext('refreshActivitiesLibrary()', context);
  release(['old account']);
  await Promise.all([oldLoad, newLoad]);
  assert.equal(count, 2);
  assert.equal(vm.runInContext('projects[0]', context), 'new account');
});
