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
      assert.match(sql, /NOT EXISTS \(SELECT 1 FROM modules m WHERE m.module_key=p.slug AND m.path LIKE '\/%'\)/);
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
