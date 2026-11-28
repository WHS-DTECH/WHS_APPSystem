const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { navData } = require('../src/globalNav');

test('Planner year badge follows selected and restored years while preserving year validation and leave guards', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'legacy', 'teacher-planner', 'public', 'planner.js'), 'utf8');
  const start = source.indexOf('  function updateYearBadge()');
  const end = source.indexOf('  const signin =', start);
  const input = { value: '2028' }, badge = {}, button = { attrs: {}, setAttribute(key, value) { this.attrs[key] = value; } };
  const update = new Function('yearInput', 'openYear', 'document', 'year', source.slice(start, end) + '\nreturn updateYearBadge;')(
    input, button, { getElementById: () => badge }, 2026);
  update();
  assert.equal(badge.textContent, 2028);
  assert.equal(button.attrs['aria-label'], 'Open planner year 2028');
  input.value = '2027'; update();
  assert.equal(badge.textContent, 2027);
  for (const value of ['', '1999', '2101', '2026.5']) {
    input.value = value; update(); assert.equal(badge.textContent, 2026);
  }
  const clickStart = source.indexOf("  openYear.addEventListener('click', () => {");
  const clickEnd = source.indexOf("  retry.addEventListener", clickStart);
  const run = new Function('yearInput', 'openYear', 'updateYearBadge', 'canLeave', 'notice', 'load', 'monday',
    `let year=2026, week='', section='cover', moderationRecord='', moderationPage='overview';\n` +
    source.slice(clickStart, clickEnd) + '\nreturn () => ({year, week});');
  let click, loads = 0, warnings = [];
  const attach = { addEventListener(_event, callback) { click = callback; } };
  input.value = '2029';
  const state = run(input, attach, update, () => true, message => warnings.push(message), () => loads++, value => value);
  click(); assert.equal(state().year, 2029); assert.equal(loads, 1);
  input.value = 'bad'; click(); assert.equal(loads, 1); assert.equal(warnings.length, 1);
  run(input, attach, update, () => false, () => {}, () => loads++, value => value);
  input.value = '2027'; click();
  assert.equal(input.value, 2026); assert.equal(badge.textContent, 2026); assert.equal(loads, 1);
});

test('integrated projects are excluded from development navigation without deleting registry details', async () => {
  let body;
  await navData(async sql => {
    if (sql.includes('FROM module_builder_projects')) {
      assert.match(sql, /NOT EXISTS \(SELECT 1 FROM modules m WHERE m.module_key=p.slug\s+AND \(m.path LIKE '\/%' OR m.module_key='whs-assessment-manager'\)\)/);
      return { rows: [{ id: 'bus', name: 'Bus Controller App', app_url: 'https://bus.example.test' }] };
    }
    return { rows: [{ module_key: 'teacher-planner', display_name: 'Teacher Planner',
      path: '/teacher-planner/', is_active: true, has_access: true }] };
  }, async () => false, async () => null)(
    { user: { id: 'admin', roles: ['ADMIN'] }, query: {} },
    { locals: { isAdmin: true }, set() {}, json(value) { body = value; } },
    error => { throw error; });
  assert.deepEqual(body.developmentProjects.map(project => project.name), ['Bus Controller App']);
  assert.deepEqual(body.modules, [{ name: 'Teacher Planner', path: '/teacher-planner/', launchPath: '/launchpad/apps/teacher-planner' }]);
});

test('Teacher Planner renders once under Modules with its stable integrated launch link', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'global-nav.js'), 'utf8');
  const start = source.indexOf('var modules = data.modules || [];');
  const end = source.indexOf("nav.appendChild(el('div', { 'class': 'gn-spacer' }));", start);
  const render = new Function('data', 'nav', 'el', 'link', source.slice(start, end));
  for (const isAdmin of [true, false]) {
    const entries = [];
    render({ isAdmin, modules: [{ name: 'Teacher Planner', path: '/teacher-planner/',
      launchPath: '/launchpad/apps/teacher-planner' }], developmentProjects: [] },
    { appendChild(node) { entries.push(node); } },
    (tag, attrs, text) => ({ text }),
    (nav, text, href) => entries.push({ text, href }));
    const planner = entries.findIndex(entry => entry.text === 'Teacher Planner');
    assert.ok(planner > entries.findIndex(entry => entry.text === 'Modules'));
    assert.ok(planner < entries.findIndex(entry => entry.text === 'Hubs'));
    if (isAdmin) assert.ok(planner < entries.findIndex(entry => entry.text === 'In Development'));
    assert.equal(entries.filter(entry => entry.text === 'Teacher Planner').length, 1);
    assert.equal(entries[planner].href, '/launchpad/apps/teacher-planner');
    assert.ok(planner < entries.findIndex(entry => entry.text === 'Student Apps'));
  }
});

test('Assessment Manager renders under Modules for authorised users, including with a customised name', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'global-nav.js'), 'utf8');
  const start = source.indexOf('var modules = data.modules || [];');
  const end = source.indexOf("nav.appendChild(el('div', { 'class': 'gn-spacer' }));", start);
  const render = new Function('data', 'nav', 'el', 'link', source.slice(start, end));
  for (const [role, active, access] of [['ADMIN', true, true], ['Teacher', true, true],
    ['Teacher', true, false], ['ADMIN', false, true]]) {
    let data;
    await navData(async sql => ({ rows: sql.includes('FROM module_builder_projects') ? [] : [{
      module_key: 'whs-assessment-manager', display_name: 'Assessment Manager',
      path: 'https://assessment.example.test/', is_active: active, has_access: access
    }] }), async () => false, async () => null)(
      { user: { id: 'fixture', roles: [role] }, query: {} },
      { locals: { isAdmin: role === 'ADMIN' }, set() {}, json(value) { data = value; } },
      error => { throw error; });
    const entries = [];
    render(data, { appendChild(node) { entries.push(node); } },
      (tag, attrs, text) => ({ text }), (nav, text, href) => entries.push({ text, href }));
    const links = entries.filter(entry => entry.href === '/launchpad/apps/whs-assessment-manager');
    assert.equal(links.length, active && access ? 1 : 0);
    if (links.length) {
      const index = entries.indexOf(links[0]);
      assert.ok(index > entries.findIndex(entry => entry.text === 'Modules'));
      assert.ok(index < entries.findIndex(entry => entry.text === 'Hubs'));
      if (role === 'ADMIN') assert.ok(index < entries.findIndex(entry => entry.text === 'In Development'));
    }
  }
});

test('Assessment Manager promotion preserves its destination and development registry', {
  skip: !process.env.MODULE_BUILDER_TEST_DATABASE_URL
}, async t => {
  const { Client } = require('pg');
  const client = new Client({ connectionString: process.env.MODULE_BUILDER_TEST_DATABASE_URL, ssl: false });
  await client.connect();
  t.after(() => client.end());
  await client.query(`CREATE TEMP TABLE modules (module_key text PRIMARY KEY, display_name text,
    description text, path text, is_active boolean NOT NULL DEFAULT true);
    CREATE TEMP TABLE module_builder_projects (id integer PRIMARY KEY, slug text, name text,
    description text, stage text, listed_as_student_app boolean NOT NULL DEFAULT false);
    CREATE TEMP TABLE module_builder_environments (project_id integer, kind text, config jsonb);
    INSERT INTO module_builder_projects VALUES
      (1,'whs-assessment-manager','WHS Assessment Manager','Assessment','development',false),
      (2,'another-project','Another Project','Other','development',false);
    INSERT INTO module_builder_environments VALUES
      (1,'development','{}'), (2,'development','{"appUrl":"https://other.example.test/"}')`);
  const migration = fs.readFileSync(path.join(__dirname, '..', 'migrations', '056_assessment_manager_module.sql'), 'utf8');
  await client.query(migration);
  assert.equal((await client.query('SELECT count(*)::int AS count FROM modules')).rows[0].count, 0);
  await client.query(`UPDATE module_builder_environments SET config='{"appUrl":"https://assessment.example.test/"}'
    WHERE project_id=1`);
  await client.query(migration);
  const query = (...args) => client.query(...args);
  const { developmentProjects } = require('../src/developmentProjects');
  const development = await developmentProjects({ roles: ['ADMIN'] }, query);
  assert.deepEqual(development.map(project => project.slug), ['another-project']);
  const registered = (await client.query('SELECT * FROM modules')).rows[0];
  assert.equal(registered.path, 'https://assessment.example.test/');
  await client.query(`UPDATE modules SET path='https://custom.example.test/',is_active=false
    WHERE module_key='whs-assessment-manager'`);
  await client.query(migration);
  const preserved = (await client.query('SELECT * FROM modules')).rows[0];
  assert.equal(preserved.path, 'https://custom.example.test/');
  assert.equal(preserved.is_active, false);
  assert.equal((await client.query("SELECT stage FROM module_builder_projects WHERE id=1")).rows[0].stage, 'development');
});

test('Assessment Manager cutover changes only the known destination', {
  skip: !process.env.MODULE_BUILDER_TEST_DATABASE_URL
}, async t => {
  const { Client } = require('pg');
  const client = new Client({ connectionString: process.env.MODULE_BUILDER_TEST_DATABASE_URL, ssl: false });
  await client.connect();
  t.after(() => client.end());
  await client.query(`CREATE TEMP TABLE modules (module_key text PRIMARY KEY, display_name text,
    description text, path text, is_active boolean);
    INSERT INTO modules VALUES
      ('whs-assessment-manager','Custom name','Keep description',
       'https://whs-assessment-manager-development.onrender.com/',false),
      ('another-module','Other','Keep other','https://whs-assessment-manager-development.onrender.com/',true)`);
  const migration = fs.readFileSync(path.join(__dirname, '..', 'migrations', '062_assessment_manager_cutover.sql'), 'utf8');
  await client.query(migration);
  const rows = (await client.query('SELECT * FROM modules ORDER BY module_key')).rows;
  assert.deepEqual(rows[1], { module_key: 'whs-assessment-manager', display_name: 'Custom name',
    description: 'Keep description', path: '/whs-assessment-manager/', is_active: false });
  assert.equal(rows[0].path, 'https://whs-assessment-manager-development.onrender.com/');
  await client.query("UPDATE modules SET path='https://custom.example.test/' WHERE module_key='whs-assessment-manager'");
  await client.query(migration);
  assert.equal((await client.query("SELECT path FROM modules WHERE module_key='whs-assessment-manager'")).rows[0].path,
    'https://custom.example.test/');
});
