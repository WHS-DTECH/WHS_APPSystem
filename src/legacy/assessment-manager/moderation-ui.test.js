const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const schema = require('./public/moderation-schema');
const librarySchema = require('./public/resource-library-schema');
const librarySource = fs.readFileSync(require.resolve('./public/resource-library.js'), 'utf8');
const source = fs.readFileSync(require.resolve('./public/moderation.js'), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));
const record = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
function node(tag = 'div', text = '', attrs = {}) {
  return {
    tag, textContent: text, attrs, children: [], events: {}, value: attrs.value || '', dataset: {}, isConnected: true,
    get parentElement() { return this.parent; },
    append(...children) { for (const child of children) { child.parent = this; this.children.push(child); } },
    replaceChildren(...children) { this.children = []; this.append(...children); },
    addEventListener(type, callback) { this.events[type] = callback; },
    dispatchEvent(event) { this.events[event.type]?.(event); if (event.bubbles) this.parent?.dispatchEvent(event); },
    setAttribute(key, value) { this.attrs[key] = value; },
    removeAttribute(key) { delete this.attrs[key]; },
    focus() { this.focused = true; },
    querySelectorAll(selector) {
      return this.all().filter(child => selector.split(',').includes(child.tag));
    },
    all() { return this.children.flatMap(child => [child, ...child.all()]); },
    find(predicate) { return this.all().find(predicate); }
  };
}
async function homeFixture({ year = 2026, today = '2026-11-14', tasks = [], events = [], schoolEvents = [], nationalEvents = [],
  canEditSchool = false, warning = '', nextEvents = [], failSave = false } = {}) {
  const context = { console, Intl, Date, crypto }, host = node(), writes = [], navigation = [];
  vm.runInNewContext(fs.readFileSync(require.resolve('./public/assessment-home.js'), 'utf8'), context);
  const controller = await context.assessmentHome.mount(host, {
    el: node, year, navigate: async (...args) => navigation.push(args),
    request: async (url, options) => {
      if (!options) return url.endsWith('/calendar') ? { events: nextEvents } : {
        today, tasks, events, schoolEvents, nationalEvents, canEditSchool, warning,
        nationalUrl: 'https://www2.nzqa.govt.nz/ncea/exam-timetable-and-key-assessment-dates/key-dates-for-secondary-assessment/'
      };
      const body = JSON.parse(options.body); writes.push({ url, ...body });
      if (failSave) throw new Error('Storage unavailable');
      return { task_key: url.split('/').pop(), kind: 'manual', content: body.content,
        completed_at: body.content.completed ? '2026-11-14T08:00:00Z' : null, revision: body.revision + 1 };
    }
  });
  return { host, controller, writes, navigation,
    button: label => host.find(n => n.tag === 'button' && n.textContent === label),
    input: id => host.find(n => n.attrs.id === 'home-' + id) };
}
test('Home renders twelve months and simple recorded moderation ticks without extra confirmations', async () => {
  const f = await homeFixture({ tasks: [{ task_key: 'moderation:' + record, kind: 'moderation', content: {
    title: 'Moderate 29777', recordId: record, dueDate: '2026-11-22'
  }, completed_at: '2026-11-14T08:00:00Z', revision: 1 }] });
  assert.equal(f.host.find(n => n.attrs.class === 'home-calendar').all().filter(n => n.tag === 'table').length, 12);
  assert.ok(f.host.find(n => n.textContent === 'This month: November 2026'));
  assert.ok(f.host.find(n => n.textContent === 'Next month: December 2026'));
  const check = f.host.find(n => n.tag === 'input' && n.attrs.type === 'checkbox');
  assert.equal(check.checked, true); assert.equal(check.disabled, true);
  assert.equal(f.writes.length, 0);
  await f.button('Open moderation').events.click();
  assert.deepEqual(f.navigation, [[record, 'internal']]);
});
test('Home places tasks before upcoming dates and distinguishes overdue tasks', async () => {
  const f = await homeFixture({ tasks: [{ task_key: record, kind: 'manual', revision: 1,
    completed_at: null, content: { title: 'Review results', notes: 'Check the details', dueDate: '2026-11-13', eventId: '' } }] });
  const overview = f.host.find(n => n.attrs.class === 'home-overview');
  assert.deepEqual(overview.children.map(n => n.attrs.class), ['home-tasks', 'home-highlights']);
  const date = f.host.find(n => n.attrs.class === 'home-task-date home-task-overdue');
  assert.equal(date.textContent, 'Date passed: 13 Nov');
  assert.ok(f.host.find(n => n.textContent === 'Check the details'));
});
test('department examination cards appear in highlights and link to their timetable source', async () => {
  const exam = { id: 'nzqa-exam-123456789012345678901234', title: 'Level 1 Digital Technologies exam (9:30am)',
    date: '2026-11-26', endDate: '', details: 'Starts 9:30am New Zealand time.',
    sourceUrl: 'https://www2.nzqa.govt.nz/ncea/exam-timetable/' };
  const f = await homeFixture({ events: [exam], nationalEvents: [exam] });
  const highlights = f.host.find(n => n.attrs['aria-label'] === 'This month and next month');
  assert.ok(highlights.find(n => n.textContent === exam.title));
  const table = f.host.find(n => n.attrs['aria-label'] === 'Deadline reconciliation table');
  assert.equal(table.find(n => n.tag === 'a' && n.textContent === 'NZQA exam and portfolio timetable').attrs.href, exam.sourceUrl);
});
test('Home highlights school dates in both month lists without labelling national or personal dates', async () => {
  const f = await homeFixture({ events: [
    { id: 'whs-publish-results', title: 'School deadline', date: '2026-11-22', endDate: '', revision: 1 },
    { id: 'whs-term', title: 'School event across months', date: '2026-11-20', endDate: '2026-12-02' },
    { id: 'nzqa-20', title: 'National event', date: '2026-12-01', endDate: '' },
    { id: record, title: 'Personal date', date: '2026-12-01', endDate: '' }
  ] });
  const highlights = f.host.find(n => n.attrs.class === 'home-highlights');
  const cards = () => highlights.all().filter(n => n.tag === 'article');
  const cardFor = title => cards().find(n => n.children.some(child => child.textContent === title));
  assert.equal(cards().filter(n => n.children.some(child => child.textContent === 'School event across months')).length, 2);
  assert.ok(cards().filter(n => n.children.some(child => child.textContent === 'School event across months'))
    .every(n => n.attrs.class.includes('home-event-school')));
  assert.ok(cardFor('School deadline').attrs.class.includes('home-event-school'));
  assert.equal(cardFor('National event').attrs.class, 'home-event');
  assert.equal(cardFor('Personal date').attrs.class, 'home-event');
  assert.equal(highlights.all().some(n => /^(WHS|NZQA|School|National)$/.test(n.textContent)), false);
  await cardFor('School deadline').find(n => n.tag === 'button' && n.textContent === 'Update date').events.click();
  f.input('title').value = 'Updated school deadline'; f.input('title').events.input();
  await f.button('Save date').events.click();
  assert.ok(cardFor('Updated school deadline').attrs.class.includes('home-event-school'));
});
test('Home stars linked dates in both month lists, including completed tasks but not matching titles alone', async () => {
  const f = await homeFixture({ tasks: [
    { task_key: record, kind: 'manual', revision: 1, completed_at: '2026-11-14T08:00:00Z',
      content: { title: 'A renamed task', dueDate: '', notes: '', eventId: 'whs-linked' } },
    { task_key: 'another', kind: 'manual', revision: 1, completed_at: null,
      content: { title: 'Unlinked event', dueDate: '', notes: '', eventId: '' } }
  ], events: [
    { id: 'whs-linked', title: 'Linked event', date: '2026-11-20', endDate: '2026-12-02' },
    { id: 'nzqa-20', title: 'Unlinked event', date: '2026-11-21', endDate: '' }
  ] });
  const highlights = f.host.find(n => n.attrs.class === 'home-highlights');
  const cards = highlights.all().filter(n => n.tag === 'article');
  const linked = cards.filter(n => n.children.some(child => child.textContent === 'Linked event'));
  assert.equal(linked.length, 2);
  for (const card of linked) {
    const star = card.find(n => n.attrs.class === 'home-event-star');
    assert.equal(star.textContent, '\u2605');
    assert.equal(star.attrs['aria-label'], 'On my task list');
    assert.equal(card.find(n => n.textContent === 'On my task list' && n.tag === 'button').disabled, true);
  }
  assert.equal(cards.find(n => n.children.some(child => child.textContent === 'Unlinked event'))
    .find(n => n.attrs.class === 'home-event-star'), undefined);
});
test('Home adds the star only after a linked task is saved and retains it when completed', async () => {
  const f = await homeFixture({ events: [{ id: 'nzqa-20', title: 'Important date', date: '2026-11-20', endDate: '2026-12-02' }] });
  const highlights = f.host.find(n => n.attrs.class === 'home-highlights');
  const stars = () => highlights.all().filter(n => n.attrs.class === 'home-event-star');
  assert.equal(stars().length, 0);
  await highlights.find(n => n.tag === 'button' && n.textContent === 'Add to my tasks').events.click();
  assert.equal(stars().length, 0);
  await f.button('Save task').events.click();
  assert.equal(f.writes[0].content.eventId, 'nzqa-20');
  assert.equal(stars().length, 2);
  const check = f.host.find(n => n.tag === 'input' && n.attrs.type === 'checkbox');
  check.checked = true; await check.events.change();
  assert.equal(stars().length, 2);
  const failed = await homeFixture({ failSave: true,
    events: [{ id: 'nzqa-20', title: 'Important date', date: '2026-11-20', endDate: '' }] });
  const failedHighlights = failed.host.find(n => n.attrs.class === 'home-highlights');
  await failedHighlights.find(n => n.tag === 'button' && n.textContent === 'Add to my tasks').events.click();
  await failed.button('Save task').events.click();
  assert.equal(failedHighlights.find(n => n.attrs.class === 'home-event-star'), undefined);
  assert.ok(failed.host.find(n => n.attrs.role === 'alert' && n.textContent === 'Storage unavailable'));
});
test('Home displays separate timelines beside history using the current national and shared school dates', async () => {
  const schoolEvent = { id: 'whs-publish-results', title: 'Shared deadline', date: '2026-11-22', endDate: '', revision: 1 };
  const f = await homeFixture({ warning: 'National dates may be stale.', schoolEvents: [schoolEvent], events: [
    { ...schoolEvent, title: 'My private deadline', date: '2026-11-20', privateOverride: true },
    { id: 'nzqa-20', title: 'National date', date: '2026-11-27', endDate: '' },
    { id: record, title: 'Personal date', date: '2026-11-28', endDate: '' }
  ] });
  const bottom = f.host.find(n => n.attrs.class === 'home-bottom');
  assert.deepEqual(bottom.children.map(n => n.attrs.class), ['home-history', 'home-source-links']);
  const sources = bottom.children[1], national = sources.children[1], school = sources.children[2];
  assert.ok(national.find(n => n.textContent === 'National date'));
  assert.equal(national.find(n => n.textContent === 'Personal date'), undefined);
  assert.match(national.find(n => n.tag === 'a').attrs.href, /^https:\/\/www2\.nzqa\.govt\.nz\//);
  assert.ok(national.find(n => n.attrs.role === 'alert' && n.textContent === 'National dates may be stale.'));
  assert.ok(school.find(n => n.textContent === 'Shared deadline'));
  assert.ok(school.find(n => n.textContent.includes('private change instead')));
  assert.equal(school.find(n => n.textContent === 'My private deadline'), undefined);
  assert.equal(school.find(n => n.textContent === 'Edit shared date'), undefined);
  assert.ok(f.host.find(n => n.textContent === 'Your private change overrides the shared school date.'));
});
test('Home lets authorised leaders add and edit shared dates without overwriting private versions', async () => {
  const shared = { id: 'whs-publish-results', title: 'Shared deadline', date: '2026-11-22', endDate: '', revision: 2,
    sourceDocument: 'School email', sourceDeadline: '22 November: publish results' };
  const f = await homeFixture({ canEditSchool: true, schoolEvents: [shared],
    events: [{ ...shared, title: 'Private deadline', date: '2026-11-20', revision: 1, privateOverride: true }] });
  const sources = f.host.find(n => n.attrs.class === 'home-source-links');
  await sources.find(n => n.textContent === 'Edit shared date').events.click();
  assert.equal(f.input('source-document').value, 'School email');
  assert.equal(f.input('source-deadline').value, '22 November: publish results');
  f.input('title').value = 'Revised shared deadline'; f.input('title').events.input();
  await f.button('Save date').events.click();
  assert.equal(f.writes[0].url, 'home/2026/school-calendar/whs-publish-results');
  assert.equal(f.writes[0].revision, 2);
  assert.equal(f.writes[0].content.sourceDocument, 'School email');
  assert.equal(f.writes[0].content.sourceDeadline, '22 November: publish results');
  assert.ok(sources.find(n => n.textContent === 'Revised shared deadline'));
  assert.ok(f.host.find(n => n.textContent === 'Private deadline'));
  await sources.find(n => n.textContent === 'Add shared school date').events.click();
  f.input('title').value = 'New school deadline'; f.input('title').events.input();
  f.input('date').value = '2026-12-03'; f.input('date').events.input();
  await f.button('Save date').events.click();
  assert.match(f.writes[1].url, /^home\/2026\/school-calendar\/whs-/);
  assert.ok(sources.find(n => n.textContent === 'New school deadline'));
  const highlights = f.host.find(n => n.attrs.class === 'home-highlights');
  const newCard = highlights.find(n => n.tag === 'article' && n.children.some(child => child.textContent === 'New school deadline'));
  await newCard.find(n => n.tag === 'button' && n.textContent === 'Update date').events.click();
  f.input('title').value = 'My private deadline'; f.input('title').events.input();
  await f.button('Save date').events.click();
  assert.match(f.writes[2].url, /^home\/2026\/calendar\/whs-/);
  assert.equal(f.writes[2].revision, 0);
  assert.ok(highlights.find(n => n.textContent === 'My private deadline'));
});
test('Home reconciles source dates, private calendar changes and linked task completion without guessing', async () => {
  const school = { id: 'whs-publish-results', title: 'Shared publication', date: '2026-11-22', endDate: '',
    sourceDocument: 'School email', sourceDeadline: '22 November: publish results' };
  const national = { id: 'nzqa-20', title: 'Original national deadline', date: '2026-11-27', endDate: '' };
  const f = await homeFixture({ schoolEvents: [school], nationalEvents: [national], events: [
    { ...school, title: 'My publication date', date: '2026-11-20', privateOverride: true },
    { ...national, title: 'My national date', date: '2026-11-28', revision: 1 },
    { id: 'nzqa-99', title: 'Missing source', date: '2026-11-30', endDate: '' },
    { id: record, title: 'Personal only', date: '2026-11-29', endDate: '' }
  ], tasks: [
    { task_key: 'one', kind: 'manual', revision: 1, completed_at: null,
      content: { title: 'Task to complete', dueDate: '', notes: '', eventId: 'whs-publish-results' } },
    { task_key: 'two', kind: 'manual', revision: 1, completed_at: '2026-11-14T08:00:00Z',
      content: { title: 'Completed task', dueDate: '', notes: '', eventId: 'whs-publish-results' } },
    { task_key: 'three', kind: 'manual', revision: 1, completed_at: null,
      content: { title: 'My national date', dueDate: '', notes: '', eventId: '' } }
  ] });
  const section = f.host.find(n => n.attrs.class === 'home-reconciliation');
  const rows = () => section.find(n => n.tag === 'tbody').children;
  assert.deepEqual(section.find(n => n.tag === 'thead').find(n => n.tag === 'tr').children.map(n => n.textContent),
    ['Source document', 'Deadline extracted', 'Calendar event', 'Classification', 'Personal task status']);
  const schoolRow = () => rows().find(n => n.children[3].textContent === 'WHS');
  assert.equal(schoolRow().children[0].textContent, 'School email');
  assert.equal(schoolRow().children[1].textContent, '22 November: publish results');
  assert.ok(schoolRow().children[2].find(n => n.textContent === 'My publication date'));
  assert.equal(schoolRow().children[4].textContent, '1 to do; 1 completed');
  const nationalRow = rows().find(n => n.children[2].find(child => child.textContent === 'My national date'));
  assert.ok(nationalRow.children[0].find(n => n.textContent === 'NZQA key assessment dates'));
  assert.ok(nationalRow.children[1].find(n => n.textContent === 'Original national deadline'));
  assert.ok(nationalRow.children[2].find(n => n.textContent === 'Personal calendar change'));
  assert.equal(nationalRow.children[4].textContent, 'No linked task');
  const missing = rows().find(n => n.children[2].find(child => child.textContent === 'Missing source'));
  assert.equal(missing.children[0].textContent, 'Source not available in the current import');
  assert.equal(rows().length, 3);
  const check = f.host.find(n => n.tag === 'input' && n.attrs['aria-label'] === 'Task to complete');
  check.checked = true; await check.events.change();
  assert.equal(schoolRow().children[4].textContent, '2 completed');
});
test('Home manual tick saves immediately, updates progress and reverts visibly on failure', async () => {
  for (const failSave of [false, true]) {
    const f = await homeFixture({ failSave, tasks: [{ task_key: record, kind: 'manual', revision: 1,
      completed_at: null, content: { title: 'Clean markbook', notes: '', dueDate: '', eventId: '' } }] });
    const check = f.host.find(n => n.tag === 'input' && n.attrs.type === 'checkbox');
    check.checked = true; await check.events.change();
    assert.equal(f.writes.length, 1); assert.equal(f.writes[0].content.completed, true);
    if (failSave) {
      assert.equal(check.checked, false);
      assert.ok(f.host.find(n => n.attrs.role === 'alert' && n.textContent === 'Storage unavailable'));
    } else {
      assert.ok(f.host.find(n => n.textContent.startsWith('1 of 1 tasks done')));
      assert.ok(f.host.find(n => n.tag === 'summary' && n.textContent === 'Completed (1)'));
    }
  }
});
test('Home protects task/date drafts and clears dirty state only after saving or cancelling', async () => {
  const f = await homeFixture();
  await f.button('Add a task').events.click();
  f.input('title').value = 'Publish grades'; f.input('title').events.input();
  assert.equal(f.controller.hasUnsavedChanges(), true);
  await assert.rejects(f.controller.saveNow(), /Save or cancel/);
  await f.button('Save task').events.click();
  assert.equal(f.controller.hasUnsavedChanges(), false);
  assert.equal(f.writes[0].content.title, 'Publish grades');
  await f.button('Add a calendar date').events.click();
  f.input('date').value = '2026-12-01'; f.input('date').events.input();
  await assert.rejects(f.controller.saveNow(), /date draft/);
  await f.button('Cancel').events.click();
  assert.equal(await f.controller.saveNow(), true);
});
test('December highlights January without confusing its event save year', async () => {
  const f = await homeFixture({ today: '2026-12-15', nextEvents: [{
    id: 'whs-january', title: 'January preparation', date: '2027-01-20', endDate: '', revision: 2
  }] });
  assert.ok(f.host.find(n => n.textContent === 'Next month: January 2027'));
  await f.button('Update date').events.click();
  f.input('date').value = '2027-01-21'; f.input('date').events.input();
  await f.button('Save date').events.click();
  assert.equal(f.writes[0].url, 'home/2027/calendar/whs-january');
  assert.equal(f.writes[0].revision, 2);
  assert.equal(f.controller.hasUnsavedChanges(), false);
});
test('Manager defaults to the separate Home page', async () => {
  const host = node(), status = node(), year = node('input', '', { value: '2026' });
  const elements = { 'assessment-manager-content': host, 'assessment-manager-status': status, 'assessment-year': year };
  vm.runInNewContext(fs.readFileSync(require.resolve('./public/assessment-manager.js'), 'utf8'), {
    Headers, URLSearchParams, setTimeout, clearTimeout, location: { hash: '' }, window: { addEventListener() {} },
    document: { body: { dataset: { api: '/api/moderation/' } }, getElementById: id => elements[id],
      createElement: tag => node(tag), querySelectorAll: () => [] },
    assessmentHome: { mount: async (area, options) => {
      assert.equal(options.year, 2026); area.append(node('h2', 'Home loaded'));
      return { saveNow: async () => true, hasUnsavedChanges: () => false };
    } },
    fetch: async () => Response.json({ csrf: 'synthetic-csrf' })
  });
  await flush(); await flush();
  assert.ok(host.find(n => n.textContent === 'Home loaded'));
  assert.equal(status.textContent, '');
});
test('moderation autosave warns before leaving while evaluation edits are pending', async () => {
  const host = node(), status = node(), year = node('input', '', { value: '2026' }), listeners = {};
  const elements = { 'assessment-manager-content': host, 'assessment-manager-status': status, 'assessment-year': year };
  let area, scheduled;
  vm.runInNewContext(fs.readFileSync(require.resolve('./public/assessment-manager.js'), 'utf8'), {
    Headers, URLSearchParams, setTimeout: fn => { scheduled = fn; return 1; }, clearTimeout: () => {},
    location: { hash: '#year=2026&section=moderation' }, window: { addEventListener: (name, fn) => { listeners[name] = fn; } },
    document: { body: { dataset: { api: '/api/' } }, getElementById: id => elements[id], createElement: tag => node(tag), querySelectorAll: () => [] },
    plannerModeration: { mount: target => { area = target; return {}; } },
    fetch: async (path, options) => Response.json(path.endsWith('session') ? { csrf: 'token' } :
      options.method === 'PUT' ? { revision: 1 } : { content: {}, revision: 0 })
  });
  await flush(); await flush();
  area.events.input();
  let prevented = false;
  listeners.beforeunload({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  scheduled(); await flush(); await flush();
  prevented = false;
  listeners.beforeunload({ preventDefault() { prevented = true; } });
  assert.equal(prevented, false);
});
test('Manager clears loading after each route renders but keeps request errors visible', async t => {
  const managerSource = fs.readFileSync(require.resolve('./public/assessment-manager.js'), 'utf8');
  for (const section of ['setup', 'moderation', 'standards', 'library', 'failed']) {
    await t.test(section, async () => {
      const host = node(), status = node(), year = node('input', '', { value: '2027' });
      let finish;
      const pending = new Promise(resolve => { finish = resolve; });
      const elements = { 'assessment-manager-content': host, 'assessment-manager-status': status, 'assessment-year': year };
      vm.runInNewContext(managerSource, {
        Headers, URLSearchParams, setTimeout, clearTimeout,
        location: { hash: '#year=2027&section=' + (section === 'failed' ? 'setup' : section) },
        window: { addEventListener() {} },
        document: {
          body: { dataset: { api: '/api/moderation/' } },
          getElementById: id => elements[id],
          createElement: tag => node(tag),
          querySelectorAll: () => []
        },
        plannerModeration: { mount: area => {
          area.append(node('h2', 'Moderation loaded'));
          return { openYear: async () => {} };
        } },
        assessmentResourceLibrary: { mountPage: async area => {
          await pending;
          area.append(node('h2', 'Resource Library loaded'));
          return { saveNow: async () => true };
        } },
        fetch: async path => {
          if (path.endsWith('session')) return Response.json({ csrf: 'synthetic-csrf' });
          await pending;
          return section === 'failed'
            ? Response.json({ error: 'Storage unavailable' }, { status: 503 })
            : Response.json({ content: {}, revision: 0 });
        }
      });
      await flush();
      assert.equal(status.textContent, 'Loading Assessment Manager…');
      finish();
      await flush();
      if (section === 'failed') {
        assert.equal(status.textContent, 'Storage unavailable');
        assert.equal(status.attrs.role, 'alert');
        assert.ok(host.find(n => n.tag === 'button' && n.textContent === 'Retry'));
      } else {
        assert.equal(status.textContent, '');
        assert.equal(Boolean(year.disabled), section === 'library');
        assert.ok(host.find(n => n.tag === 'h2'), 'route contents rendered before clearing loading');
      }
    });
  }
});
function fixture({ page = 'overview', id = record, data = {}, setupOnly = false, saveFails = false, staff = [], departments = [], staffRequest, standardRequest, consentRequest, previewRequest, referenceRequest, recordRequest, recordsRequest, teachingRequest, classSizeRequest, libraryRequest, mutation, importResult, myStandards, selectedLevel = '3', selectedTopic = 'Database', displayName = 'Synthetic Teacher', userEmail = '', confirmResponse = true, clock = Date } = {}) {
  const host = node(), saved = [], calls = [], notices = [], navigation = [];
  const file = { id: 'document_id_123', name: 'Existing assessment', mimeType: 'application/vnd.google-apps.document',
    modifiedTime: '2026-10-22T00:00:00Z', parents: ['student_folder_123'], capabilities: { canEdit: true, canAddChildren: true } };
  let chosen = { id: file.id }, missing = false;
  const access = {
    authorize: async () => calls.push(['authorize']),
    ensureAssessmentFolders: async (folderId, level, number) => {
      calls.push(['folders', folderId, level, number]);
      return { id: 'standard_folder_123', name: number };
    },
    ensureAssessmentTopicFolder: async (folderId, year, topic) => {
      calls.push(['topicFolder', folderId, year, topic]);
      return { id: 'topic_folder_123', name: topic };
    },
    ensureTopicStandardFolder: async (folderId, level, number) => {
      calls.push(['topicStandardFolder', folderId, level, number]);
      return { id: 'standard_folder_123', name: 'Level ' + level + ' - ' + number };
    },
    syncAssessmentYearFolders: async (folderId, year, topics) => {
      calls.push(['syncFolders', folderId, year, topics]);
      const names = [...topics, ...['Outcome & Process', 'Spreadsheet'].filter(name => !topics.includes(name))];
      return { topics: names, links: { root: folderId, year: { id: 'year_folder_' + year, name: String(year) },
        topics: names.map(name => ({ name, id: 'topic_folder_' + name.replace(/\W/g, '_'),
          standards: name === 'Database' ? [{ id: 'standard_folder_123', level: '3', number: '29785' }] : [] })) } };
    },
    ensureStudentFolder: async (folderId, index) => {
      calls.push(['studentFolder', folderId, index]);
      return { id: 'student_folder_' + index, name: 'Student ' + String.fromCharCode(65 + index) };
    },
    assessmentFolderLinks: async root => {
      calls.push(['folderLinks', root]);
      return { root, levels: Object.fromEntries(['1', '2', '3'].map(level => [level, {
        id: 'level_folder_' + level, standards: level === '3' ? [{ id: 'standard_folder_123', name: '29785' }] : []
      }])) };
    },
    assessmentYearFolderLinks: async (root, year, topics) => {
      calls.push(['yearLinks', root, year, topics]);
      return { root, year: { id: 'year_folder_' + year, name: String(year) }, topics: topics.map(topic => ({
        name: topic, id: 'topic_folder_' + topic.replace(/\W/g, '_'),
        standards: topic === 'Database' ? [{ id: 'standard_folder_123', level: '3', number: '29785' }] : []
      })) };
    },
    choose: async (folder, allowPdf) => { calls.push(['choose', folder, allowPdf]); return chosen; },
    chooseFiles: async multiple => { calls.push(['chooseFiles', multiple]); return chosen ? Array.isArray(chosen) ? chosen : [chosen] : null; },
    metadata: async id => {
      calls.push(['metadata', id]);
      if (missing) throw new Error('The Drive file is missing or inaccessible.');
      return id === 'folder_id_123' ? { ...file, id, mimeType: 'application/vnd.google-apps.folder' } : { ...file, id };
    },
    find: async () => { calls.push(['find']); return null; },
    upload: async (blob, options) => { calls.push(['upload', options]); return file; },
    savePdf: async (source, options) => {
      calls.push(['savePdf', source, options]);
      return { id: options.id || 'pdf_document_123', name: options.name, mimeType: 'application/pdf' };
    },
    download: async () => { calls.push(['download']); return new Blob(['docx'], { type: DOCX }); }
  };
  const context = {
    plannerModerationSchema: schema, assessmentLibrarySchema: librarySchema, crypto, Blob, Event, URL, URLSearchParams, Date: clock, console: { error: () => {} },
    confirm: text => { calls.push(['confirm', text]); return confirmResponse; },
    plannerGoogleDrive: {
      prepareDocumentAccess: async () => access,
      mount: (host, options) => calls.push(['mount', options]),
      resourceLink: value => {
        const i = value.lastIndexOf(' | ');
        return i < 0 ? { url: value, name: value } : { url: value.slice(i + 3), name: value.slice(0, i) };
      }
    }
  };
  vm.runInNewContext(librarySource, context);
  vm.runInNewContext(source, context);
  context.plannerModeration.mount(host, {
    el: node, data: { title: 'Synthetic assessment', folderId: 'folder_id_123', folderName: 'Private assessments',
      ...(setupOnly ? { folderTopics: '["Database"]' } : {}),
      level: page === 'overview' ? '' : '3', version: page === 'overview' ? '' : '2', standardNumber: '99999', ...data }, displayName, userEmail,
    year: 2026, record: id, page, setupOnly, ownerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    feedbackTemplateUrl: '/teacher-planner/api/planner/moderation/templates/feedback',
    scheduleTemplateUrl: '/teacher-planner/api/planner/moderation/templates/schedule',
    coversheetTemplateUrl: '/teacher-planner/api/planner/moderation/templates/coversheet',
    request: async path => {
      calls.push(['request', path]);
      if (path.startsWith('resource-library')) return libraryRequest ? libraryRequest(path) : { records: [], total: 0 };
      if (/^teaching-subjects\/\d{4}$/.test(path)) return teachingRequest ? teachingRequest(path) : { classes: [] };
      if (path === 'staff') return staffRequest ? staffRequest() : { staff, departments };
      if (path.startsWith('class-size/')) return classSizeRequest ? classSizeRequest(path) : { students: 0, term: null, linked: false, ambiguous: false };
      if (path.includes('/references?')) return referenceRequest();
      if (/^standards\/\d+\/consent-scope$/.test(path)) return consentRequest ? consentRequest(path) :
        { number: path.split('/')[1], domain: 'Unlisted', level: 3, bsasLevel: null, eligible: false, expired: false };
      if (path.startsWith('standards/search')) return standardRequest ? standardRequest() : { standards: [{ number: '99999', level: '3', version: '2' }] };
      if (/^standards\/\d+\/details$/.test(path)) return standardRequest ? standardRequest() : { number: '99999', level: '3', version: '2', standardType: 'Achievement',
        url: 'https://www.nzqa.govt.nz/nqfdocs/ncea-resource/achievements/2026/as99999.pdf' };
      if (/^standards\/\d+\/achievement-preview$/.test(path)) return previewRequest();
      if (/^\d{4}\/moderation\/main$/.test(path)) return recordRequest ? recordRequest(path) : { content: { folderTopics: '["Database"]' }, revision: 0 };
      if (/^\d{4}\/moderation\//.test(path)) return recordRequest ? recordRequest(path) : { content: {}, revision: 0 };
      if (path.startsWith('moderation/')) return recordsRequest ? recordsRequest(path) : { records: [{ entry_key: record, title: 'Synthetic assessment', standard_number: '99999' }] };
      return { content: { selectedStandards: JSON.stringify(myStandards || [{ number: '99999', title: 'Example Biology standard', subject: 'Biology', credits: '5 credits', level: selectedLevel, topic: selectedTopic }]) } };
    },
    mutate: async (path, body) => { calls.push(['mutate', path, body]); if (mutation) return mutation(path, body); },
    saveNow: async () => {
      saved.push(Object.fromEntries(host.all().filter(child => child.attrs.name || child.attrs['data-moderation-setting']).map(child => [child.attrs.name || child.attrs['data-moderation-setting'], child.value])));
      return !saveFails;
    },
    navigate: async (...args) => navigation.push(args),
    changeYear: async year => calls.push(['changeYear', year]),
    binaryRequest: async (path, options) => {
      calls.push(['binary', path, options]);
      return path.startsWith('moderation/import') ? importResult || { common: { subject: 'Biology', studentName: 'Synthetic learner' },
        document: { grade: 'A', feedback: 'Imported comment' }, warning: 'Review all imported fields.' } : new Blob(['docx'], { type: DOCX });
    },
    notice: (...args) => notices.push(args)
  });
  const click = async label => {
    const button = host.find(child => child.tag === 'button' && child.textContent === label);
    assert.ok(button, label); assert.notEqual(button.disabled, true, label + ' enabled');
    await button.events.click();
  };
  return { host, saved, calls, notices, navigation, click, access, set chosen(value) { chosen = value; }, set missing(value) { missing = value; } };
}
test('results completion follows named students and fills an empty loaded date from the latest KAMAR date', async () => {
  const f = fixture({ page: 'internal', data: { internal: JSON.stringify({ samples: [
    { student: 'Learner A', reportedGrade: 'A', reportedDate: '2026-10-20' }, {}
  ] }) } }); await flush();
  const control = id => f.host.find(n => n.attrs.id === 'moderation-internal-' + id);
  const state = () => JSON.parse(f.host.find(n => n.attrs.name === 'internal').value);
  const edit = (id, value) => { const item = control(id); item.value = value; item.events.input(); };
  assert.equal(control('resultsLoaded').checked, true);
  assert.equal(control('resultsDate').value, '2026-10-20');
  assert.equal(state().resultsLoaded, 'Yes');
  edit('1-student', 'Learner B');
  assert.equal(control('resultsLoaded').checked, false);
  assert.equal(control('resultsLoaded-answer').textContent, 'No');
  assert.equal(state().resultsDate, '2026-10-20', 'untick preserves date');
  edit('1-reportedDate', '2026-10-22');
  assert.equal(state().resultsLoaded, 'No', 'grade is also required');
  edit('1-reportedGrade', 'M');
  assert.equal(control('resultsLoaded').checked, true);
  assert.equal(state().resultsDate, '2026-10-20', 'existing date is preserved');
  edit('0-reportedDate', '');
  assert.equal(state().resultsLoaded, 'No');
  edit('0-reportedDate', '2026-10-20');
  assert.equal(state().resultsLoaded, 'Yes');
  await f.click('Remove entry 2');
  assert.equal(state().resultsLoaded, 'Yes');
  await f.click('Remove entry 1');
  assert.equal(state().resultsLoaded, 'No', 'zero named students cannot auto-complete');
});
test('results use the latest reporting date on load, ignore blank panels and support manual ticking', async () => {
  const f = fixture({ page: 'internal', data: { internal: JSON.stringify({ samples: [
    { student: 'A', reportedGrade: 'A', reportedDate: '2026-09-30' },
    { student: 'B', reportedGrade: 'E', reportedDate: '2026-10-22' },
    { reportedDate: '2026-12-31' }
  ] }) } }); await flush();
  assert.equal(f.host.find(n => n.attrs.id === 'moderation-internal-resultsDate').value, '2026-10-22');
  const manual = fixture({ page: 'internal', data: { internal: JSON.stringify({ samples: [
    { student: 'A', reportedDate: '2026-10-21' }
  ] }) } }); await flush();
  const box = manual.host.find(n => n.attrs.id === 'moderation-internal-resultsLoaded');
  box.checked = true; box.events.change();
  assert.equal(manual.host.find(n => n.attrs.id === 'moderation-internal-resultsDate').value, '2026-10-21');
  const empty = fixture({ page: 'internal' }); await flush();
  assert.notEqual(empty.host.find(n => n.attrs.id === 'moderation-internal-resultsLoaded').checked, true);
});
test('results date is in its decision row and only auto-ticks with complete named student results', async () => {
  const f = fixture({ page: 'internal', data: { internal: JSON.stringify({ resultsDate: '', resultsLoaded: 'No',
    samples: [{ student: 'A', reportedGrade: 'A', reportedDate: '2026-10-20' }, { student: 'B' }] }) } }); await flush();
  const control = id => f.host.find(n => n.attrs.id === 'moderation-internal-' + id);
  const state = () => JSON.parse(f.host.find(n => n.attrs.name === 'internal').value);
  const edit = (id, value) => { const item = control(id); item.value = value; item.events.input(); };
  assert.equal(control('resultsDate').parentElement.parentElement, control('resultsLoaded').parentElement);
  edit('resultsDate', '2026-10-21');
  assert.equal(state().resultsLoaded, 'No');
  edit('1-reportedGrade', 'M'); edit('1-reportedDate', '2026-10-21');
  assert.equal(state().resultsLoaded, 'Yes');
  edit('resultsDate', '');
  assert.equal(state().resultsLoaded, 'Yes');
  const reopened = fixture({ page: 'internal', data: { internal: JSON.stringify(state()) } }); await flush();
  const reopenedState = JSON.parse(reopened.host.find(n => n.attrs.name === 'internal').value);
  assert.equal(reopenedState.resultsDate, '');
  assert.equal(reopenedState.resultsLoaded, 'Yes');
  const empty = fixture({ page: 'internal', data: { internal: '{"resultsLoaded":"No"}' } }); await flush();
  const date = empty.host.find(n => n.attrs.id === 'moderation-internal-resultsDate');
  date.value = '2026-10-21'; date.events.input();
  assert.equal(JSON.parse(empty.host.find(n => n.attrs.name === 'internal').value).resultsLoaded, 'No');
  for (const samples of [[], [{ student: 'A' }]]) {
    const manual = fixture({ page: 'internal', data: { internal: JSON.stringify({
      resultsLoaded: 'Yes', resultsDate: '', samples
    }) } }); await flush();
    assert.equal(JSON.parse(manual.host.find(n => n.attrs.name === 'internal').value).resultsLoaded, 'Yes');
  }
});
test('retention location in its decision row auto-ticks while clearing and saved manual overrides are preserved', async () => {
  const f = fixture({ page: 'internal', data: { internal: '{"retained":"No"}' } }); await flush();
  const control = id => f.host.find(n => n.attrs.id === 'moderation-internal-' + id);
  const state = () => JSON.parse(f.host.find(n => n.attrs.name === 'internal').value);
  const location = control('retentionLocation'), box = control('retained');
  assert.equal(location.parentElement.parentElement, box.parentElement);
  location.value = 'Shared folder'; location.events.input();
  assert.equal(state().retained, 'Yes');
  box.checked = false; box.events.change();
  const reopened = fixture({ page: 'internal', data: { internal: JSON.stringify(state()) } }); await flush();
  assert.equal(reopened.host.find(n => n.attrs.id === 'moderation-internal-retained').checked, false);
  location.value = ''; location.events.input();
  assert.equal(state().retained, 'No');
  location.value = 'Another folder'; location.events.input();
  assert.equal(state().retained, 'Yes');
  location.value = ''; location.events.input();
  assert.equal(state().retained, 'Yes');
});
test('folder preparation persists a standard link above its button and fills retention location on reopen', async () => {
  const f = fixture({ data: { level: '3', version: '2', topic: 'Database', internal: '{"retentionLocation":"Old location"}' } }); await flush();
  await f.click('Prepare level / standard folders');
  const saved = f.saved.at(-1);
  assert.deepEqual(JSON.parse(saved.standardFolder), { id: 'standard_folder_123', root: 'folder_id_123', level: '3', number: '99999' });
  const url = 'https://drive.google.com/drive/folders/standard_folder_123';
  const locationPath = 'Private assessments / 2026 / Database / Level 3 - 99999\n' + url;
  assert.equal(JSON.parse(saved.internal).retentionLocation, locationPath);
  const link = f.host.find(n => n.tag === 'a' && n.textContent === '2026 / Database / Level 3 - 99999');
  assert.equal(link.href, url);
  assert.ok(f.calls.some(c => c[0] === 'topicFolder' && c[1] === 'folder_id_123' && c[2] === 2026 && c[3] === 'Database'));
  const button = f.host.find(n => n.tag === 'button' && n.textContent === 'Prepare level / standard folders');
  assert.equal(link.parentElement.parentElement.children.indexOf(link.parentElement) + 1, button.parentElement.children.indexOf(button));
  const reopened = fixture({ page: 'internal', data: { ...saved, internal: '{}' } }); await flush();
  const location = reopened.host.find(n => n.attrs.id === 'moderation-internal-retentionLocation');
  assert.equal(location.value, locationPath);
  assert.equal(location.readOnly, true);
  assert.equal(JSON.parse(reopened.host.find(n => n.attrs.name === 'internal').value).retentionLocation, locationPath);
  assert.equal(JSON.parse(reopened.host.find(n => n.attrs.name === 'internal').value).retained, 'Yes');
  assert.equal(reopened.calls.filter(c => c[0] === 'authorize' || c[0] === 'folders').length, 0);
  const stale = fixture({ page: 'internal', data: { ...saved, standardNumber: '12345' } }); await flush();
  assert.equal(stale.host.find(n => n.attrs.id === 'moderation-internal-retentionLocation').value, '');
  const changedRoot = fixture({ data: { ...saved } }); await flush();
  changedRoot.chosen = { id: 'another_root_123' };
  changedRoot.access.metadata = async id => ({ id, name: 'New main folder', mimeType: 'application/vnd.google-apps.folder', capabilities: { canAddChildren: true } });
  await changedRoot.click('Choose a folder for this record');
  const newSaved = changedRoot.saved.at(-1);
  assert.equal(newSaved.folderId, 'another_root_123');
  assert.equal(JSON.parse(newSaved.standardFolder).root, 'another_root_123');
  assert.equal(JSON.parse(newSaved.internal).retentionLocation, 'New main folder / 2026 / Database / Level 3 - 99999\n' + url);
});
test('failed folder preparation does not save a successful standard link', async () => {
  const f = fixture({ data: { level: '3', version: '2' } }); await flush();
  f.access.ensureAssessmentFolders = async () => { throw new Error('Folder unavailable'); };
  await f.click('Prepare level / standard folders');
  assert.equal(f.host.find(n => n.attrs.name === 'standardFolder').value, '');
  assert.ok(f.host.find(n => n.attrs.role === 'alert' && n.textContent.includes('Folder unavailable')));
});
test('imported internal reporting details reconcile results and preserve an existing loaded date', async () => {
  const f = fixture({ page: 'internal', importResult: { common: {}, document: { resultsLoaded: 'No', resultsDate: '2026-10-01',
    samples: [{ student: 'A', reportedGrade: 'A', reportedDate: '2026-10-22' }] }, warning: 'Review import.' } }); await flush();
  await f.click('Choose existing document and import its form data');
  const state = JSON.parse(f.saved.at(-1).internal);
  assert.equal(state.resultsLoaded, 'Yes');
  assert.equal(state.resultsDate, '2026-10-01');
  assert.equal(f.host.find(n => n.attrs.id === 'moderation-internal-resultsLoaded').checked, true);
});
test('moderation setup saves year, topic, level and standard folder links and reopens without Drive access', async () => {
  const f = fixture({ id: '', setupOnly: true }); await flush();
  assert.equal(f.host.find(n => n.tag === 'h2').textContent, 'Setup Moderation');
  const folderYear = f.host.find(n => n.attrs.id === 'moderation-folder-year');
  assert.equal(folderYear.value, '2026');
  folderYear.value = '2027'; await f.click('Open year');
  assert.ok(f.calls.some(call => call[0] === 'changeYear' && call[1] === 2027));
  folderYear.value = '1999'; await f.click('Open year');
  assert.ok(f.host.find(n => n.attrs.role === 'alert' && n.textContent.includes('Choose a year from 2000 to 2100')));
  assert.equal(f.calls.filter(c => c[0] === 'folderLinks').length, 0);
  await f.click('Prepare year / topic folders');
  const saved = f.saved.at(-1);
  assert.equal(JSON.parse(saved.folderLinks).root, 'folder_id_123');
  assert.equal(JSON.parse(saved.folderLinks).year.name, '2026');
  assert.equal(JSON.parse(saved.folderLinks).topics[0].name, 'Database');
  const hierarchy = f.host.find(n => n.attrs.class === 'moderation-folder-levels');
  assert.equal(hierarchy.children.length, 2);
  assert.equal(hierarchy.children[0].children[0].textContent, 'Year 2026');
  assert.equal(hierarchy.children[1].children[0].children[0].textContent, 'Database');
  const standard = hierarchy.find(n => n.tag === 'a' && n.textContent === 'Level 3 - 29785');
  assert.equal(standard.attrs.href, 'https://drive.google.com/drive/folders/standard_folder_123');
  assert.equal(standard.attrs.target, '_blank');
  assert.equal(hierarchy.find(n => n.tag === 'a' && n.textContent === 'Level 1'), undefined);
  const prepare = f.host.find(n => n.tag === 'button' && n.textContent === 'Prepare year / topic folders');
  const sync = f.host.find(n => n.tag === 'button' && n.textContent === 'Sync existing folders');
  assert.equal(prepare.parentElement, sync.parentElement);
  assert.equal(sync.parentElement.children.indexOf(sync) + 1, prepare.parentElement.children.indexOf(prepare));
  const reopened = fixture({ id: '', setupOnly: true, data: saved }); await flush();
  assert.ok(reopened.host.find(n => n.tag === 'a' && n.textContent === 'Level 3 - 29785'));
  assert.equal(reopened.calls.filter(c => c[0] === 'folderLinks' || c[0] === 'authorize').length, 0);
  const stale = fixture({ id: '', setupOnly: true, data: { ...saved, folderId: 'different_root_123' } }); await flush();
  assert.equal(stale.host.find(n => n.tag === 'a' && n.textContent === 'Level 3 - 29785'), undefined);
  f.access.assessmentYearFolderLinks = async () => { throw new Error('Cannot list Drive folders'); };
  await f.click('Prepare year / topic folders');
  assert.ok(f.host.find(n => n.attrs.role === 'alert' && n.textContent.includes('Cannot list Drive folders')));
  assert.equal(f.host.find(n => n.attrs['data-moderation-setting'] === 'folderLinks').value, saved.folderLinks);
});
test('sync existing folders adds Drive topics and links their standard folders without duplicating topics', async () => {
  const f = fixture({ id: '', setupOnly: true }); await flush();
  await f.click('Sync existing folders');
  const syncCall = f.calls.find(c => c[0] === 'syncFolders');
  assert.deepEqual([syncCall[1], syncCall[2], Array.from(syncCall[3])], ['folder_id_123', 2026, ['Database']]);
  const saved = f.saved.at(-1);
  assert.deepEqual(JSON.parse(saved.folderTopics), ['Database', 'Outcome & Process', 'Spreadsheet']);
  assert.deepEqual(JSON.parse(saved.folderLinks).topics.map(topic => topic.name), ['Database', 'Outcome & Process', 'Spreadsheet']);
  assert.ok(f.host.find(n => n.tag === 'a' && n.textContent === 'Level 3 - 29785'));
  assert.ok(f.host.find(n => n.textContent === 'Synced 3 topic folders and 1 standard folder for 2026. Nothing was created; existing folders and documents were not moved.'));
  assert.equal(f.calls.some(c => ['yearLinks', 'topicFolder', 'topicStandardFolder', 'folders'].includes(c[0])), false);
  f.access.syncAssessmentYearFolders = async () => null;
  await f.click('Sync existing folders');
  assert.ok(f.host.find(n => n.attrs.role === 'alert' && n.textContent.includes('No topic folders were found')));
  assert.equal(f.saved.at(-1), saved);
  f.access.syncAssessmentYearFolders = async () => { throw new Error('Drive unavailable'); };
  await f.click('Sync existing folders');
  assert.equal(f.host.find(n => n.attrs['data-moderation-setting'] === 'folderTopics').value, saved.folderTopics);
  assert.equal(f.host.find(n => n.attrs['data-moderation-setting'] === 'folderLinks').value, saved.folderLinks);
});
test('moderation setup validates topic names and preserves existing folders when removing a topic', async () => {
  const f = fixture({ id: '', setupOnly: true }); await flush();
  const input = f.host.find(n => n.attrs.id === 'moderation-topic-name');
  input.value = 'Spreadsheet'; await f.click('Add topic');
  assert.deepEqual(JSON.parse(f.saved.at(-1).folderTopics), ['Database', 'Spreadsheet']);
  input.value = 'database'; await f.click('Add topic');
  assert.match(f.host.find(n => n.attrs['aria-live'] === 'polite').textContent, /already been added/);
  const remove = f.host.find(n => n.tag === 'button' && n.textContent === 'Remove');
  await remove.events.click();
  assert.deepEqual(JSON.parse(f.saved.at(-1).folderTopics), ['Spreadsheet']);
  assert.match(f.host.find(n => n.attrs['aria-live'] === 'polite').textContent, /Existing folders and records are unchanged/);
});
test('opening a future year links its own Drive folder before navigating and preserves its topic configuration', async () => {
  const f = fixture({ id: '', setupOnly: true, recordRequest: async path => {
    assert.equal(path, '2027/moderation/main');
    return { content: { folderId: 'target_root_123', folderName: 'Future assessments',
      folderTopics: '["Spreadsheet"]' }, revision: 3 };
  } });
  await flush();
  f.host.find(n => n.attrs.id === 'moderation-folder-year').value = '2027';
  await f.click('Open year');
  const links = f.calls.find(c => c[0] === 'yearLinks');
  assert.equal(links[1], 'target_root_123');
  assert.equal(links[2], 2027);
  assert.equal(links[3].length, 0, 'a year folder can be opened before topics are prepared');
  const mutation = f.calls.find(c => c[0] === 'mutate');
  assert.equal(mutation[1], '2027/moderation/main');
  assert.equal(mutation[2].revision, 3);
  assert.equal(mutation[2].content.folderTopics, '["Spreadsheet"]');
  assert.equal(JSON.parse(mutation[2].content.folderLinks).year.name, '2027');
  assert.ok(f.calls.findIndex(c => c[0] === 'mutate') < f.calls.findIndex(c => c[0] === 'changeYear'));
});
test('a Drive failure while opening a year leaves target settings and the active year unchanged', async () => {
  const f = fixture({ id: '', setupOnly: true });
  await flush();
  f.access.assessmentYearFolderLinks = async () => { throw new Error('Year folder unavailable'); };
  f.host.find(n => n.attrs.id === 'moderation-folder-year').value = '2027';
  await f.click('Open year');
  assert.equal(f.calls.some(c => ['mutate', 'changeYear'].includes(c[0])), false);
  assert.ok(f.host.find(n => n.attrs.role === 'alert' && n.textContent === 'Year folder unavailable'));
});
test('opening an existing year preserves linked topics and does not navigate after a save conflict', async () => {
  const hierarchy = { root: 'folder_id_123', year: { id: 'year_folder_2027', name: '2027' },
    topics: [{ name: 'Database', id: 'topic_folder_123', levels: {} }] };
  const f = fixture({ id: '', setupOnly: true,
    recordRequest: async () => ({ content: { folderId: 'folder_id_123', folderLinks: JSON.stringify(hierarchy) }, revision: 2 }),
    mutation: async () => { throw new Error('Settings changed in another tab'); }
  });
  await flush();
  f.host.find(n => n.attrs.id === 'moderation-folder-year').value = '2027';
  await f.click('Open year');
  const mutation = f.calls.find(c => c[0] === 'mutate');
  assert.deepEqual(JSON.parse(mutation[2].content.folderLinks), hierarchy);
  assert.equal(f.calls.some(c => c[0] === 'changeYear'), false);
  assert.ok(f.host.find(n => n.attrs.role === 'alert' && n.textContent === 'Settings changed in another tab'));
});
test('record details group assessment and assessor fields into ordered bordered blocks', async () => {
  const f = fixture({ data: { level: '3' } }); await flush();
  const blocks = f.host.all().filter(n => n.attrs.class === 'moderation-detail-block');
  assert.deepEqual(blocks.map(block => block.children[0].textContent), ['Assessment Details', 'Assessor Details']);
  const rows = blocks.map(block => block.children.slice(1).map(row => row.children.map(field =>
    (field.children.find(child => child.tag === 'label') || {}).attrs?.for)));
  assert.deepEqual(rows, [
    [['moderation-title'], ['moderation-standardNumber', 'moderation-standardTitle'], ['moderation-level', 'moderation-version', 'moderation-credits']],
    [['moderation-department', 'moderation-teacher', 'moderation-subject'], ['moderation-course', 'moderation-assessors']]
  ]);
});
test('Assessor lists the selected department members from the Unit Library and allows another typed name', async () => {
  const departments = [{ name: 'Science', teacher: '', leaders: [] }, { name: 'Technology', teacher: '', leaders: [] }];
  const members = [{ name: 'Technology', teachers: ['Synthetic Peer', 'Synthetic Teacher'] }, { name: 'Science', teachers: ['Science Teacher'] }];
  const f = fixture({ departments, data: { department: 'Technology' }, teachingRequest: async () => ({ classes: [], departments: members }) }); await flush();
  const assessor = f.host.find(n => n.attrs.id === 'moderation-assessors');
  const options = () => assessor.all().filter(n => n.tag === 'option').map(n => n.attrs.value);
  assert.equal(assessor.tag, 'select');
  assert.deepEqual(options(), ['', 'Synthetic Peer', 'Synthetic Teacher', '__other']);
  assert.equal(assessor.value, 'Synthetic Teacher');
  assessor.value = 'Synthetic Peer'; assessor.events.change();
  assert.equal(f.host.find(n => n.attrs.name === 'assessors').value, 'Synthetic Peer');
  const department = f.host.find(n => n.attrs.id === 'moderation-department');
  department.value = 'Science'; department.events.change();
  assert.deepEqual(options(), ['', 'Synthetic Peer', 'Science Teacher', '__other']);
  assert.equal(assessor.value, 'Synthetic Peer');
  const other = f.host.find(n => n.attrs.id === 'moderation-assessors-other');
  assessor.value = '__other'; assessor.events.change();
  assert.equal(other.hidden, false);
  other.value = 'External Assessor'; other.events.input();
  assert.equal(f.host.find(n => n.attrs.name === 'assessors').value, 'External Assessor');
});
test('record details suggest the teacher subject and fill the course matching the standard level', async () => {
  const classes = [{ subject: 'DTECH', course: '11DTECH' }, { subject: 'DTECH', course: '12DTECH' }, { subject: 'DTECH', course: '13DTECH' }];
  const f = fixture({ data: { level: '3' }, teachingRequest: async path => { assert.equal(path, 'teaching-subjects/2026'); return { classes }; } }); await flush();
  const value = name => f.host.find(n => n.attrs.name === name).value;
  assert.equal(value('subject'), 'DTECH');
  assert.equal(value('course'), '13DTECH');
  const options = f.host.find(n => n.attrs.id === 'moderation-course-options').children.map(n => n.attrs.value);
  assert.deepEqual(options, ['11DTECH', '12DTECH', '13DTECH']);
  const kept = fixture({ data: { level: '3', subject: 'Digital Technologies', course: '13DTX' }, teachingRequest: async () => ({ classes }) }); await flush();
  assert.equal(kept.host.find(n => n.attrs.name === 'subject').value, 'Digital Technologies');
  assert.equal(kept.host.find(n => n.attrs.name === 'course').value, '13DTX');
  const failed = fixture({ data: { level: '3' }, teachingRequest: async () => { throw new Error('Teaching subjects unavailable.'); } }); await flush();
  assert.equal(failed.host.find(n => n.attrs.name === 'subject').value, '');
  assert.ok(failed.host.find(n => n.attrs.role === 'alert' && n.textContent === 'Teaching subjects unavailable.'));
});
test('record details show a checklist and populate all codes from the linked library assessment once', async () => {
  const entry = libraryEntry();
  entry.content.classCodes = ['11DTECH', '12DTECH', '13COMP'];
  const snapshot = librarySchema.snapshot(entry, '99999', '2');
  const request = path => path.includes('?') ? { records: [{ id: entry.id, title: entry.content.title }], total: 1 } : entry;
  const f = fixture({ data: { resourceLibrary: JSON.stringify(snapshot) }, libraryRequest: request,
    teachingRequest: async () => ({ classes: [{ subject: 'Digital', course: '12DTECH' }] }) });
  await flush(); await flush();
  const course = () => f.host.find(n => n.attrs.name === 'course').value;
  const check = code => f.host.find(n => n.attrs.id === 'moderation-course-choices').find(n => n.attrs.value === code);
  assert.equal(course(), '11DTECH, 12DTECH, 13COMP');
  assert.equal(f.host.find(n => n.attrs.name === 'courseLibraryInitialized').value, entry.id);
  assert.ok(['11DTECH', '12DTECH', '13COMP'].every(code => check(code).checked));
  check('12DTECH').checked = false; check('12DTECH').events.change();
  assert.equal(course(), '11DTECH, 13COMP');
  check('11DTECH').checked = false; check('11DTECH').events.change();
  check('13COMP').checked = false; check('13COMP').events.change();
  assert.equal(course(), '');
  const reloaded = fixture({ data: { course: '', resourceLibrary: JSON.stringify(snapshot), courseLibraryInitialized: entry.id },
    libraryRequest: request });
  await flush(); await flush();
  assert.equal(reloaded.host.find(n => n.attrs.name === 'course').value, '');
  const restoredChoices = reloaded.host.find(n => n.attrs.id === 'moderation-course-choices');
  assert.equal(restoredChoices.find(n => n.attrs.value === '11DTECH').checked, false);
});
test('record details can choose matching library codes without guessing or overwriting saved courses', async () => {
  const entry = libraryEntry();
  entry.content.classCodes = ['11DTECH', '12DTECH'];
  const request = path => path.includes('?') ? { records: [{ id: entry.id, title: entry.content.title },
    { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', title: 'Another assessment' }], total: 2 } : entry;
  const f = fixture({ data: { course: '13COMP' }, libraryRequest: request }); await flush();
  const course = () => f.host.find(n => n.attrs.name === 'course').value;
  assert.equal(course(), '13COMP');
  const choice = f.host.find(n => n.attrs.id === 'moderation-course-library');
  choice.value = entry.id; await f.click('Add library class codes');
  assert.equal(course(), '13COMP, 11DTECH, 12DTECH');
  const codes = f.host.find(n => n.attrs.id === 'moderation-course-choices');
  assert.ok(codes.find(n => n.attrs.value === '11DTECH').checked);
  const linked = fixture({ data: { course: '13COMP', resourceLibraryId: entry.id }, libraryRequest: request });
  await flush(); await flush();
  assert.equal(linked.host.find(n => n.attrs.name === 'course').value, '13COMP');
  assert.equal(linked.host.find(n => n.attrs.name === 'courseLibraryInitialized').value, entry.id);
});
test('linked class lookup failure leaves existing course data unchanged and reports the error', async () => {
  const entry = libraryEntry();
  const f = fixture({ data: { resourceLibraryId: entry.id }, libraryRequest: path => {
    if (path.includes('?')) return { records: [{ id: entry.id, title: entry.content.title }], total: 1 };
    throw new Error('Library unavailable');
  } });
  await flush(); await flush();
  assert.equal(f.host.find(n => n.attrs.name === 'course').value, '');
  assert.equal(f.host.find(n => n.attrs.name === 'courseLibraryInitialized'), undefined);
  assert.ok(f.host.find(n => n.attrs.role === 'alert' && n.textContent === 'Library unavailable'));
});
test('a library lookup does not overwrite a course typed while it is loading', async () => {
  const entry = libraryEntry(); entry.content.classCodes = ['11DTECH', '12DTECH'];
  let release;
  const f = fixture({ data: { version: '2', resourceLibraryId: entry.id }, libraryRequest: path =>
    path.includes('?') ? { records: [{ id: entry.id, title: entry.content.title }], total: 1 } :
      new Promise(resolve => { release = resolve; }) });
  await flush();
  const control = f.host.find(n => n.attrs.id === 'moderation-course');
  control.value = '13COMP'; control.events.input();
  release(entry); await flush();
  assert.equal(f.host.find(n => n.attrs.name === 'course').value, '13COMP');
  assert.equal(f.host.find(n => n.attrs.name === 'courseLibraryInitialized').value, entry.id);
});
test('ambiguous library class codes do not populate the record', async () => {
  const entry = libraryEntry(); entry.content.classCodes = ['11DTECH, 12DTECH'];
  const f = fixture({ data: { version: '2', resourceLibraryId: entry.id }, libraryRequest: path =>
    path.includes('?') ? { records: [{ id: entry.id, title: entry.content.title }], total: 1 } : entry });
  await flush(); await flush();
  assert.equal(f.host.find(n => n.attrs.name === 'course').value, '');
  assert.ok(f.host.find(n => n.attrs.role === 'alert' && /contains a comma/.test(n.textContent)));
  assert.equal(f.host.find(n => n.attrs.name === 'courseLibraryInitialized'), undefined);
});
test('internal location inherits the matching standard folder saved in Setup Moderation without Drive access', async () => {
  const hierarchy = { root: 'folder_id_123', levels: { '3': { id: 'level_folder_3',
    standards: [{ id: 'setup_standard_123', name: '99999' }] } } };
  const main = { folderId: 'folder_id_123', folderLinks: JSON.stringify(hierarchy) };
  const f = fixture({ page: 'internal', data: { internal: '{"retentionLocation":"Location or file path:"}' },
    recordRequest: async path => {
      assert.equal(path, '2026/moderation/main'); return { content: main, revision: 1 };
    } }); await flush();
  const location = f.host.find(n => n.attrs.id === 'moderation-internal-retentionLocation');
  const url = 'https://drive.google.com/drive/folders/setup_standard_123';
  const locationPath = 'Private assessments / Level 3 / 99999\n' + url;
  assert.equal(location.value, locationPath);
  assert.equal(location.readOnly, true);
  assert.equal(JSON.parse(f.host.find(n => n.attrs.name === 'internal').value).retentionLocation, locationPath);
  assert.equal(JSON.parse(f.host.find(n => n.attrs.name === 'internal').value).retained, 'Yes');
  assert.equal(JSON.parse(f.host.find(n => n.attrs.name === 'standardFolder').value).id, 'setup_standard_123');
  assert.equal(f.calls.filter(c => ['authorize', 'folders', 'folderLinks'].includes(c[0])).length, 0);
  const otherRoot = fixture({ page: 'internal', data: { folderId: 'another_root_123', internal: '{"retentionLocation":"Keep me"}' },
    recordRequest: async () => ({ content: main, revision: 1 }) }); await flush();
  assert.equal(otherRoot.host.find(n => n.attrs.id === 'moderation-internal-retentionLocation').value, 'Keep me');
  const absent = fixture({ page: 'internal', data: { standardNumber: '12345', internal: '{"retentionLocation":"Keep me"}' },
    recordRequest: async () => ({ content: main, revision: 1 }) }); await flush();
  assert.equal(absent.host.find(n => n.attrs.id === 'moderation-internal-retentionLocation').value, 'Keep me');
});
test('topic records load their numbered standard folder from the matching year and topic hierarchy', async () => {
  const hierarchy = { root: 'folder_id_123', year: { id: 'year_folder_123', name: '2026' },
    topics: [{ name: 'Database', id: 'topic_folder_123', standards: [{ id: 'other_standard_123', level: '2', number: '99999' },
      { id: 'topic_standard_123', level: '3', number: '99999' }] }] };
  const f = fixture({ page: 'internal', data: { topic: 'Database', internal: '{"retentionLocation":"Location or file path:"}' },
    recordRequest: async () => ({ content: { folderId: 'folder_id_123', folderLinks: JSON.stringify(hierarchy) }, revision: 1 }) });
  await flush();
  const locationPath = 'Private assessments / 2026 / Database / Level 3 - 99999\nhttps://drive.google.com/drive/folders/topic_standard_123';
  assert.equal(f.host.find(n => n.attrs.id === 'moderation-internal-retentionLocation').value, locationPath);
  assert.equal(JSON.parse(f.host.find(n => n.attrs.name === 'standardFolder').value).id, 'topic_standard_123');
});
test('setup folder lookup reports errors and ambiguous matches without changing the location', async () => {
  for (const failure of ['unavailable', 'duplicate']) {
    const f = fixture({ page: 'internal', data: { internal: '{"retentionLocation":"Keep me"}' },
      recordRequest: async () => {
        if (failure === 'unavailable') throw new Error('Database unavailable');
        return { revision: 1, content: { folderId: 'folder_id_123', folderLinks: JSON.stringify({
          root: 'folder_id_123', levels: { '3': { standards: [
            { name: '99999', id: 'first_folder_123' }, { name: '99999', id: 'second_folder_123' }
          ] } }
        }) } };
      } }); await flush();
    assert.equal(f.host.find(n => n.attrs.id === 'moderation-internal-retentionLocation').value, 'Keep me');
    assert.ok(f.host.find(n => n.attrs.role === 'alert' && n.textContent.includes('could not be populated from Setup Moderation')));
  }
});
test('internal import keeps form-only supporting information and unique student schedule references', async () => {
  const child = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const original = { notes: 'Private supporting note', resources: 'Private supporting resources',
    moderatorReportLink: 'https://example.test/reference', signatoryPosition: 'Teacher',
    samples: [{ student: 'Learner A', markingScheduleRecord: child }] };
  const f = fixture({ page: 'internal', data: { internal: JSON.stringify(original) },
    importResult: { common: {}, document: { retained: 'Yes', samples: [{ student: 'Learner A', reportedGrade: 'A' }] }, warning: 'Review import.' } });
  await flush();
  await f.click('Choose existing document and import its form data');
  const imported = JSON.parse(f.saved.at(-1).internal);
  for (const key of ['notes', 'resources', 'moderatorReportLink', 'signatoryPosition']) assert.equal(imported[key], original[key]);
  assert.equal(imported.samples[0].markingScheduleRecord, child);
  assert.equal(imported.retained, 'Yes');
});
test('internal forms clean imported category labels and placeholders while retaining actual data', async () => {
  const f = fixture({ page: 'internal', data: { internal: JSON.stringify({
    verifierName: 'Verifier Name:', verifierSchool: 'School:', verifierPosition: 'Position:',
    critiqueName: "Critique's Name: V Pringle", verificationEvidence: 'Evidence / location of verification: See folder',
    notes: 'School: Keep supporting text unchanged'
  }) } }); await flush();
  const state = JSON.parse(f.host.find(n => n.attrs.name === 'internal').value);
  assert.equal(state.verifierName, '');
  assert.equal(state.verifierSchool, '');
  assert.equal(state.verifierPosition, '');
  assert.equal(state.critiqueName, 'V Pringle');
  assert.equal(state.verificationEvidence, 'See folder');
  assert.equal(state.notes, 'School: Keep supporting text unchanged');
  assert.equal(f.host.find(n => n.attrs.id === 'moderation-internal-verifierName').value, '');
  assert.ok(f.host.find(n => n.tag === 'label' && n.textContent === "Critiquer's name"));
});
test('schedule import fills gaps, merges missing links and requirements and changes only the future sync target', async () => {
  const original = { grade: 'A', markerComments: 'Keep my comments', achieved: 'Keep standard text', notes: 'Private note',
    fileSubmissionLink: 'Original | https://example.test/original', requirements: [
      { requirement: 'First requirement', grade: 'A', evidence: 'Keep evidence' }
    ] };
  const f = fixture({ page: 'schedule', data: { subject: 'Computing', schedule: JSON.stringify(original),
    driveDocuments: JSON.stringify({ schedule: { id: 'wrong_document_123', name: 'Wrong document', mimeType: 'application/vnd.google-apps.document' } }) },
    importResult: { common: { standardNumber: '99999', subject: 'Do not replace', course: '13DTECH' },
      document: { grade: 'E', markerComments: 'Do not replace', achieved: 'Do not replace', merit: 'Missing standard text',
        fileSubmissionLink: 'Renamed | https://example.test/original\nNew | https://example.test/new',
        requirements: [{ requirement: 'First requirement', grade: 'E', evidence: 'Do not replace', judgement: 'Fill judgement' },
          { requirement: 'New requirement', grade: 'M', evidence: 'New evidence' }] }, warning: 'Review import.' } });
  await flush();
  f.chosen = { id: 'correct_document_123' };
  await f.click('Choose existing document and import its form data');
  const saved = f.saved.at(-1), merged = JSON.parse(saved.schedule);
  assert.equal(saved.subject, 'Computing');
  assert.equal(saved.course, '13DTECH');
  for (const key of ['grade', 'markerComments', 'achieved', 'notes']) assert.equal(merged[key], original[key]);
  assert.equal(merged.merit, 'Missing standard text');
  assert.equal(merged.fileSubmissionLink, original.fileSubmissionLink + '\nNew | https://example.test/new');
  assert.deepEqual(merged.requirements, [
    { ...original.requirements[0], judgement: 'Fill judgement' },
    { requirement: 'New requirement', grade: 'M', evidence: 'New evidence' }
  ]);
  assert.equal(JSON.parse(saved.driveDocuments).schedule.id, 'correct_document_123');
  assert.equal(f.calls.filter(c => c[0] === 'upload').length, 0);
  await f.click('Choose existing document and import its form data');
  assert.deepEqual(JSON.parse(f.saved.at(-1).schedule), merged, 'reimport is idempotent');
  await f.click('Create / update Google Drive document');
  assert.equal(f.calls.find(c => c[0] === 'upload')[1].id, 'correct_document_123');
});
test('new student schedules copy reusable master content but never student marking or Drive targets', async () => {
  const master = { instructions: 'Template instructions', achieved: 'Template criteria',
    assessmentInstructionsLink: 'Assessment | https://example.test/assessment', grade: 'A', markerComments: 'Do not copy',
    fileSubmissionLink: 'Private work | https://example.test/private', documentationSubmissionLink: 'Private docs | https://example.test/docs',
    requirements: [{ requirement: 'First requirement', grade: 'A', evidence: 'Private evidence', judgement: 'Private judgement' }] };
  for (const target of ['marking schedule', 'Confirmation & Feedback']) {
    const f = fixture({ page: 'internal', data: { schedule: JSON.stringify(master),
      internal: JSON.stringify({ samples: [{ student: 'Learner A', markerGrade: 'M' }] }) } });
    await flush();
    await f.click('Create / open ' + target + ' for entry 1');
    const content = f.calls.find(c => c[0] === 'mutate')[2].content;
    const schedule = JSON.parse(content.schedule);
    assert.equal(schedule.instructions, master.instructions);
    assert.equal(schedule.achieved, master.achieved);
    assert.equal(schedule.assessmentInstructionsLink, master.assessmentInstructionsLink);
    assert.deepEqual(schedule.requirements, [{ requirement: 'First requirement' }]);
    for (const key of ['grade', 'markerComments', 'fileSubmissionLink', 'documentationSubmissionLink']) assert.equal(schedule[key], undefined);
    assert.equal(content.driveDocuments, undefined);
  }
});
test('student template update fills gaps idempotently and preserves existing marking and sync targets', async () => {
  const master = { instructions: 'New instructions', achieved: 'New criteria', grade: 'A', markerComments: 'Do not copy',
    assessmentInstructionsLink: 'Assessment | https://example.test/assessment',
    fileSubmissionLink: 'Private work | https://example.test/private',
    requirements: [{ requirement: 'First', grade: 'A', evidence: 'Do not copy', judgement: 'Do not copy' },
      { requirement: 'Second', grade: 'A', evidence: 'Do not copy' }] };
  const original = { instructions: 'Keep instructions', grade: 'M', markerComments: 'Keep comments',
    fileSubmissionLink: 'Student work | https://example.test/student', requirements: [
      { requirement: 'First', grade: 'A', evidence: 'Keep evidence', judgement: 'Keep judgement' }] };
  const driveDocuments = JSON.stringify({ schedule: { id: 'student_document_123', name: 'Student schedule' } });
  const f = fixture({ page: 'schedule', data: { parentRecord: record, schedule: JSON.stringify(original), driveDocuments },
    recordRequest: async () => ({ revision: 3, content: { standardNumber: '99999', schedule: JSON.stringify(master) } }) });
  await flush();
  await f.click('Fill missing from standard template');
  const saved = f.saved.at(-1), schedule = JSON.parse(saved.schedule);
  for (const key of ['instructions', 'grade', 'markerComments', 'fileSubmissionLink']) assert.equal(schedule[key], original[key]);
  assert.equal(schedule.achieved, master.achieved);
  assert.equal(schedule.assessmentInstructionsLink, master.assessmentInstructionsLink);
  assert.deepEqual(schedule.requirements, [...original.requirements, { requirement: 'Second' }]);
  assert.equal(saved.driveDocuments, driveDocuments);
  await f.click('Fill missing from standard template');
  assert.deepEqual(JSON.parse(f.host.find(n => n.attrs.name === 'schedule').value), schedule);
  assert.equal(f.calls.filter(c => ['upload', 'download', 'binary', 'authorize'].includes(c[0])).length, 0);
});
test('student template update rejects missing or mismatched parents and oversized merges', async () => {
  for (const kind of ['missing', 'wrongStandard', 'nested', 'oversized']) {
    const original = { requirements: Array.from({ length: 50 }, (_, i) => ({ requirement: 'Existing ' + i })) };
    const f = fixture({ page: 'schedule', data: { parentRecord: record, schedule: JSON.stringify(original) },
      recordRequest: async () => ({ revision: kind === 'missing' ? 0 : 1, content: {
        standardNumber: kind === 'wrongStandard' ? '14998' : '99999',
        ...(kind === 'nested' ? { parentRecord: record } : {}),
        schedule: JSON.stringify({ requirements: [{ requirement: 'New requirement' }] })
      } }) });
    await flush();
    await f.click('Fill missing from standard template');
    assert.deepEqual(JSON.parse(f.host.find(n => n.attrs.name === 'schedule').value), original);
    assert.ok(f.host.find(n => n.attrs.role === 'alert' && n.textContent));
  }
});
test('schedule import rejects mismatched standards and oversized merges without replacing saved data or document target', async () => {
  for (const oversized of [false, true]) {
    const original = { markerComments: 'Keep comments', requirements: Array.from({ length: 50 }, (_, i) => ({ requirement: 'Existing ' + i })) };
    const f = fixture({ page: 'schedule', data: { schedule: JSON.stringify(original) },
      importResult: { common: { standardNumber: oversized ? '99999' : '12345' },
        document: { requirements: [{ requirement: 'One more' }] }, warning: '' } });
    await flush();
    await f.click('Choose existing document and import its form data');
    assert.deepEqual(JSON.parse(f.host.find(n => n.attrs.name === 'schedule').value), original);
    assert.equal(JSON.parse(f.host.find(n => n.attrs.name === 'driveDocuments').value).schedule, undefined);
    assert.ok(f.host.find(n => n.attrs.role === 'alert' && n.textContent.includes(oversized ? 'exceeds' : 'not 99999')));
  }
});
test('all document imports reject a different standard without changing assessment metadata or links', async () => {
  for (const page of ['internal', 'schedule', 'feedback', 'coversheet']) {
    const original = { notes: 'Keep existing content' };
    const f = fixture({ page, displayName: '', data: { [page]: JSON.stringify(original) },
      importResult: { common: { standardNumber: '14998', standardTitle: 'Wrong template standard', level: '1' },
        document: { notes: 'Do not import' }, warning: '' } });
    await flush();
    await f.click('Choose existing document and import its form data');
    assert.equal(f.host.find(n => n.attrs.name === 'standardNumber').value, '99999');
    assert.deepEqual(JSON.parse(f.host.find(n => n.attrs.name === page).value), original);
    assert.equal(JSON.parse(f.host.find(n => n.attrs.name === 'driveDocuments').value)[page], undefined);
    assert.ok(f.host.find(n => n.attrs.role === 'alert' && n.textContent.includes('14998, not 99999')));
    assert.equal(f.calls.filter(c => c[0] === 'upload').length, 0);
  }
});
test('student Confirmation button creates a shared individual record with assessed grade but no copied comments', async () => {
  const f = fixture({ page: 'internal', data: { internal: JSON.stringify({ samples: [
    { student: 'Learner A', markerGrade: 'A', comments: 'Do not copy this discussion' }
  ] }) } }); await flush();
  await f.click('Create / open Confirmation & Feedback for entry 1');
  const created = f.calls.find(c => c[0] === 'mutate');
  const child = JSON.parse(f.saved.at(-1).internal).samples[0].markingScheduleRecord;
  assert.deepEqual(f.navigation.at(-1), [child, 'feedback']);
  assert.equal(created[1], '2026/moderation/' + child);
  assert.equal(created[2].content.parentRecord, record);
  assert.equal(created[2].content.studentName, 'Learner A');
  assert.equal(created[2].content.standardNumber, '99999');
  assert.equal(created[2].content.level, '3');
  assert.equal(JSON.parse(created[2].content.feedback).grade, 'A');
  assert.equal(JSON.parse(created[2].content.feedback).feedback, undefined);
  assert.ok(f.calls.some(c => c[0] === 'studentFolder' && c[2] === 0));
});
test('Confirmation button reuses the marking record, fills missing grade from schedule and preserves existing choices', async () => {
  const child = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  for (const grade of ['', 'M']) {
    const f = fixture({ page: 'internal', data: { internal: JSON.stringify({ samples: [
      { student: 'Learner A', markerGrade: 'A', markingScheduleRecord: child }
    ] }) }, recordRequest: async () => ({ revision: 7, content: {
      parentRecord: record, studentName: 'Learner A', standardNumber: '99999',
      schedule: '{"grade":"E","markerComments":"Do not copy"}',
      feedback: JSON.stringify({ grade, markingScheduleLink: 'Custom schedule | https://example.test/schedule' })
    } }) }); await flush();
    await f.click('Create / open Confirmation & Feedback for entry 1');
    const mutation = f.calls.find(c => c[0] === 'mutate');
    assert.equal(mutation[2].revision, 7);
    const feedback = JSON.parse(mutation[2].content.feedback);
    assert.equal(feedback.grade, grade || 'E');
    assert.equal(feedback.markingScheduleLink, 'Custom schedule | https://example.test/schedule');
    assert.equal(feedback.feedback, undefined);
    assert.deepEqual(f.navigation.at(-1), [child, 'feedback']);
  }
});
test('Confirmation import preserves existing fields, adds manual links and syncs to the selected document', async () => {
  const f = fixture({ page: 'feedback', data: { studentName: 'Learner A', feedback: JSON.stringify({
    grade: 'A', notes: 'Keep private notes', markingScheduleLink: 'Custom | https://example.test/custom'
  }) }, importResult: { common: { standardNumber: '99999', studentName: 'Do not overwrite' },
    document: { grade: 'E', markingScheduleLink: 'Duplicate | https://example.test/custom\nNew | https://example.test/new',
      coversheetLink: 'Cover sheet | https://example.test/cover' }, warning: 'Review import.' } }); await flush();
  assert.equal(f.host.find(n => n.attrs.id === 'moderation-feedback-grade').value, 'A');
  await f.click('Choose existing document and import its form data');
  const merged = JSON.parse(f.saved.at(-1).feedback);
  assert.equal(merged.grade, 'A');
  assert.equal(merged.notes, 'Keep private notes');
  assert.equal(f.saved.at(-1).studentName, 'Learner A');
  assert.equal(merged.markingScheduleLink, 'Custom | https://example.test/custom\nNew | https://example.test/new');
  assert.equal(merged.coversheetLink, 'Cover sheet | https://example.test/cover');
  assert.equal(f.calls.filter(c => c[0] === 'upload').length, 0);
  await f.click('Choose Google Drive files for Cover Sheet');
  assert.ok(JSON.parse(f.saved.at(-1).feedback).coversheetLink.includes('document_id_123'));
  await f.click('Create / update Google Drive document');
  assert.equal(f.calls.find(c => c[0] === 'upload')[1].id, 'document_id_123');
});
test('Confirmation launch rejects mismatched parents and failed saves without navigating or replacing student data', async () => {
  const child = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  for (const saveFails of [false, true]) {
    const f = fixture({ page: 'internal', saveFails, data: { internal: JSON.stringify({ samples: [
      { student: 'Learner A', markingScheduleRecord: child }
    ] }) }, recordRequest: async () => ({ revision: 1, content: { parentRecord: child } }) });
    await flush();
    await f.click('Create / open Confirmation & Feedback for entry 1');
    assert.equal(f.navigation.length, 0);
    assert.equal(f.calls.filter(c => c[0] === 'mutate').length, 0);
    assert.ok(f.host.find(n => n.attrs.role === 'alert' && n.textContent.includes(saveFails ? 'not saved' : 'another moderation record')));
  }
});
test('top year contents tabs navigate to year-wide lists instead of the current record', async () => {
  const f = fixture({ page: 'schedule' }); await flush();
  const tabs = f.host.find(n => n.attrs.class === 'moderation-tabs');
  assert.equal(tabs.children.length, 5);
  assert.equal(tabs.children[2].attrs['aria-current'], 'page');
  await tabs.children[1].events.click();
  assert.deepEqual(f.navigation.at(-1), ['', 'internal']);
  await tabs.children[3].events.click();
  assert.deepEqual(f.navigation.at(-1), ['', 'feedback']);
});
test('year contents group shared and individual schedules by standard and open the selected form', async () => {
  const child = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const records = [
    { entry_key: child, title: 'Student A', standard_number: '99999', standard_title: 'Example standard', parent_record: record },
    { entry_key: record, title: 'Shared assessment', standard_number: '99999', standard_title: 'Example standard' },
    { entry_key: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', title: 'Another assessment', standard_number: '92004', standard_title: 'Other standard' }
  ];
  for (const page of ['internal', 'schedule', 'feedback', 'coversheet']) {
    const f = fixture({ id: '', page, recordsRequest: async path => {
      assert.equal(path, 'moderation/2026'); return { records };
    } }); await flush();
    const groups = f.host.all().filter(n => n.attrs.class === 'moderation-contents-group');
    assert.deepEqual(groups.map(n => n.children[0].textContent), page !== 'internal'
      ? ['99999 — Example standard'] : ['92004 — Other standard', '99999 — Example standard']);
    const links = groups.flatMap(n => n.all()).filter(n => n.tag === 'a');
    assert.equal(links.length, page === 'internal' ? 2 : 1);
    if (page === 'schedule') {
      assert.ok(links.some(n => n.textContent.includes('(Individual schedule)')));
      assert.ok(!links.some(n => n.textContent.includes('(Standard marking schedule template)')));
    }
    let prevented = false;
    await links[0].events.click({ preventDefault: () => { prevented = true; } });
    assert.ok(prevented);
    assert.equal(f.navigation[0][1], page);
    assert.ok(links[0].attrs.href.startsWith('#year=2026'));
    assert.equal(f.calls.filter(call => call[0] === 'authorize').length, 0);
  }
});
test('contents empty and failed states are explicit, with retry', async () => {
  const empty = fixture({ id: '', page: 'internal', recordsRequest: async () => ({ records: [] }) });
  await flush();
  assert.ok(empty.host.find(n => n.textContent.includes('No records for this contents page')));
  let fail = true;
  const f = fixture({ id: '', page: 'schedule', recordsRequest: async () => {
    if (fail) throw new Error('Records unavailable');
    return { records: [] };
  } }); await flush();
  assert.ok(f.host.find(n => n.attrs.role === 'alert' && n.textContent === 'Records unavailable'));
  fail = false; await f.click('Retry loading records');
  assert.ok(f.host.find(n => n.textContent.startsWith('No student Marking Schedule forms yet.')));
});
for (const [page, title] of [['feedback', 'Confirmation & Feedback'], ['coversheet', 'WHS Coversheet']]) {
test(title + ' contents identify the correct forms without changing saved schedule titles', async () => {
  const child = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const records = [
    { entry_key: child, title: '29785 — Student A - TV — Marking Schedule', student_name: 'Student A - TV', standard_number: '29785', parent_record: record },
    { entry_key: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', title: '29785 — Student B - CJ — Marking Schedule', standard_number: '29785', parent_record: record },
    { entry_key: record, title: '29785 — Integrate data into documents', standard_number: '29785' }
  ];
  const original = JSON.stringify(records);
  const f = fixture({ id: '', page, recordsRequest: async () => ({ records }) });
  await flush();
  const links = f.host.all().filter(n => n.tag === 'a' && n.attrs.href.startsWith('#'));
  assert.equal(links.length, 2);
  assert.ok(links.some(n => n.textContent === 'Student A - TV — ' + title));
  assert.ok(links.some(n => n.textContent === '29785 — Student B - CJ — ' + title));
  for (const link of links) {
    assert.ok(link.textContent.endsWith(' — ' + title));
    assert.ok(!link.textContent.includes('Marking Schedule'));
    const params = new URLSearchParams(link.attrs.href.slice(1));
    assert.equal(params.get('page'), page);
    await link.events.click({ preventDefault() {} });
    assert.deepEqual(f.navigation.at(-1), [params.get('record'), page]);
  }
  assert.equal(JSON.stringify(records), original);
  assert.equal(f.calls.filter(call => ['mutate', 'upload', 'authorize'].includes(call[0])).length, 0);
});
}
for (const [page, title, filename] of [
  ['feedback', 'Confirmation & Feedback', 'confirmation-feedback-template.docx'],
  ['schedule', 'Marking Schedule', 'marking-schedule-template.docx'],
  ['coversheet', 'WHS Coversheet', 'whs-coversheet-template.docx']
]) {
test(title + ' offers one blank template even without student forms', async () => {
  const f = fixture({ id: '', page, recordsRequest: async () => ({ records: [
    { entry_key: record, title: 'Standard assessment', standard_number: '29785' },
    { entry_key: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', title: 'Another assessment', standard_number: '29786' }
  ] }) });
  await flush();
  const links = f.host.all().filter(n => n.tag === 'a');
  assert.equal(links.length, 1);
  assert.equal(links[0].textContent, 'Download blank ' + title + ' template');
  assert.equal(links[0].attrs.href, '/teacher-planner/api/planner/moderation/templates/' + page);
  assert.equal(links[0].attrs.download, filename);
  assert.ok(f.host.find(n => n.textContent.startsWith('No student ' + title + ' forms yet.')));
  assert.ok(f.host.find(n => n.textContent.includes(page === 'feedback'
    ? 'Existing assessment-level feedback remains available through Records.'
    : page === 'schedule' ? 'Existing standard-specific instructions and criteria remain available through Records'
    : 'Existing assessment-level coversheets remain available through Records.')));
  if (page === 'coversheet') assert.ok(f.host.find(n => n.textContent.includes('Open a student WHS Coversheet from the list below.')));
  assert.equal(f.calls.filter(call => ['mutate', 'upload', 'authorize'].includes(call[0])).length, 0);
});
}
test('Records table groups standards and stacks student links in the correct document columns', async () => {
  const first = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', second = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  const f = fixture({ id: '', recordsRequest: async () => ({ records: [
    { entry_key: first, title: 'Student A schedule', student_name: 'Student A - TV', standard_number: '29785', parent_record: record },
    { entry_key: second, title: 'Student B schedule', student_name: 'Student B - CJ', standard_number: '29785', parent_record: record },
    { entry_key: record, title: 'Main assessment', standard_number: '29785', standard_title: 'Integrate data into documents' }
  ] }) }); await flush();
  const table = f.host.find(n => n.attrs.class === 'moderation-records-table');
  assert.ok(table);
  assert.deepEqual(table.children[1].children[0].children.map(n => n.textContent),
    ['Standard Number', 'Internal Moderation Sheet', 'Marking Schedules']);
  const rows = table.children[2].children;
  assert.equal(rows.length, 1); assert.equal(rows[0].children.length, 3);
  const cells = rows[0].children;
  assert.equal(cells[0].children[0].textContent, '29785');
  assert.equal(cells[0].children[1].textContent, 'Integrate data into documents');
  const targets = ['overview', 'internal', 'schedule'];
  for (const [index, cell] of cells.entries()) {
    const links = cell.all().filter(n => n.tag === 'a');
    assert.equal(links.length, index < 2 ? 1 : 3);
    for (const link of links) {
      await link.events.click({ preventDefault() {} });
      assert.equal(f.navigation.at(-1)[1], targets[index]);
    }
  }
  const schedules = cells[2].all().filter(n => n.tag === 'a');
  assert.deepEqual(schedules.map(n => n.textContent), ['Standard marking schedule template', 'Student A - TV', 'Student B - CJ']);
  await schedules[1].events.click({ preventDefault() {} });
  assert.deepEqual(f.navigation.at(-1), [first, 'schedule']);
});
test('Records table preserves multiple assessments of one standard and orphaned individual schedules', async () => {
  const f = fixture({ id: '', recordsRequest: async () => ({ records: [
    { entry_key: record, title: 'Task One', standard_number: '29785' },
    { entry_key: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', title: 'Task Two', standard_number: '29785' },
    { entry_key: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', title: 'Orphan student', parent_record: record, standard_number: '92004' }
  ] }) }); await flush();
  const rows = f.host.find(n => n.attrs.class === 'moderation-records-table').children[2].children;
  assert.equal(rows.length, 2);
  assert.equal(rows[0].children[0].all().filter(n => n.tag === 'a').length, 2);
  assert.equal(rows[0].children[1].all().filter(n => n.tag === 'a').length, 2);
  assert.ok(rows[1].children[1].all().some(n => n.textContent === 'No assessment record'));
  assert.ok(rows[1].children[2].all().some(n => n.textContent === 'Orphan student'));
});
test('student panels import missing grade and comments from their linked schedules without replacing existing values', async () => {
  const first = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const second = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  const third = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  const f = fixture({ page: 'internal', data: { internal: JSON.stringify({ samples: [
    { student: 'Student A - TV', markingScheduleRecord: first },
    { student: 'Student B - CJ', markingScheduleRecord: second, comments: 'My existing discussion' },
    { student: 'Student C - AA', markingScheduleRecord: third, markerGrade: 'M' }
  ] }) }, recordRequest: async path => {
    const schedule = path.endsWith(first) ? { grade: 'E', markerComments: 'Comments from marker' }
      : path.endsWith(second) ? { grade: 'Not assessed', markerComments: 'Do not replace' }
        : { grade: 'A', markerComments: 'Another comment' };
    return { revision: 1, content: { parentRecord: record, schedule: JSON.stringify(schedule) } };
  } }); await flush();
  assert.ok(f.host.find(n => n.tag === 'legend' && n.textContent === 'Student A'));
  assert.ok(f.host.find(n => n.tag === 'legend' && n.textContent === 'Student B'));
  assert.equal(f.host.all().filter(n => n.attrs.class === 'moderation-fields moderation-student-fields').length, 3);
  const top = f.host.find(n => n.attrs.class === 'moderation-fields moderation-student-fields');
  const reporting = f.host.find(n => n.attrs.class === 'moderation-fields moderation-student-reporting');
  assert.deepEqual(top.children.map(n => n.children[1].attrs.id),
    ['moderation-internal-0-student', 'moderation-internal-0-markerGrade', 'moderation-internal-0-comments']);
  assert.ok(top.children.every(n => n.children[1].attrs.class === 'moderation-student-highlight'));
  assert.deepEqual(reporting.children.map(n => n.children[1].attrs.id),
    ['moderation-internal-0-verifierGrade', 'moderation-internal-0-moderatedDate', 'moderation-internal-0-reportedGrade', 'moderation-internal-0-reportedDate']);
  assert.equal(top.parentElement.children[2], reporting);
  assert.equal(top.parentElement.children[3].tag, 'button');
  const samples = JSON.parse(f.host.find(n => n.attrs.name === 'internal').value).samples;
  assert.equal(samples[0].comments, 'Comments from marker');
  assert.equal(samples[0].markerGrade, 'E');
  assert.equal(samples[1].comments, 'My existing discussion');
  assert.equal(samples[1].markerGrade, 'Not assessed');
  assert.equal(samples[2].comments, 'Another comment');
  assert.equal(samples[2].markerGrade, 'M');
  assert.equal(f.host.find(n => n.attrs.id === 'moderation-internal-0-comments').value, 'Comments from marker');
  assert.equal(f.host.find(n => n.attrs.id === 'moderation-internal-0-markerGrade').value, 'E');
});
test('critiquer, verifier and sighted-by fields each sit in their own bordered box', async () => {
  const f = fixture({ page: 'internal', data: { internal: '{}' } }); await flush();
  const blocks = f.host.all().filter(n => n.attrs.class === 'moderation-detail-block moderation-person-block');
  const ids = block => block.all().filter(n => ['input', 'textarea'].includes(n.tag)).map(n => n.attrs.id.replace('moderation-internal-', ''));
  assert.deepEqual(blocks.map(block => block.children[0].textContent), ['Critiquer', 'Verifier', 'Sighted by (record only)', 'Evaluator Details']);
  assert.deepEqual(blocks.map(ids), [['critiqueName', 'critiqueSchool', 'critiqueDate'],
    ['verifierName', 'verifierSchool', 'verifierPosition', 'verificationDate', 'verificationEvidence'],
    ['signatory', 'signatoryPosition', 'signatoryDate'], ['evaluationName', 'evaluationPosition', 'evaluationDate']]);
});
test('student Date moderated follows the verification date unless a different date was entered', async () => {
  const f = fixture({ page: 'internal', data: { internal: JSON.stringify({ verificationDate: '2026-11-05', samples: [
    { student: 'Student A' }, { student: 'Student B', moderatedDate: '2026-10-01' }, { student: 'Student C', moderatedDate: '2026-11-05' }, {}
  ] }) } }); await flush();
  const value = id => f.host.find(n => n.attrs.id === 'moderation-internal-' + id).value;
  assert.deepEqual([0, 1, 2, 3].map(i => value(i + '-moderatedDate')), ['2026-11-05', '2026-10-01', '2026-11-05', '']);
  const verification = f.host.find(n => n.attrs.id === 'moderation-internal-verificationDate');
  verification.value = '2026-11-06'; verification.events.change();
  assert.deepEqual([0, 1, 2].map(i => value(i + '-moderatedDate')), ['2026-11-06', '2026-10-01', '2026-11-06']);
  const saved = JSON.parse(f.host.find(n => n.attrs.name === 'internal').value).samples;
  assert.deepEqual(saved.map(item => item.moderatedDate), ['2026-11-06', '2026-10-01', '2026-11-06', undefined]);
});
test('marker details do not overwrite edits made while loading or copy another parent record', async () => {
  const id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  let resolve;
  const f = fixture({ page: 'internal', data: { internal: JSON.stringify({ samples: [{ markingScheduleRecord: id }] }) },
    recordRequest: () => new Promise(done => { resolve = done; }) });
  const control = f.host.find(n => n.attrs.id === 'moderation-internal-0-comments');
  control.value = 'Typed during lookup'; control.events.input();
  const grade = f.host.find(n => n.attrs.id === 'moderation-internal-0-markerGrade');
  grade.value = 'M'; grade.events.change();
  resolve({ revision: 1, content: { parentRecord: record, schedule: '{"grade":"E","markerComments":"Old comment"}' } });
  await flush();
  assert.equal(JSON.parse(f.host.find(n => n.attrs.name === 'internal').value).samples[0].comments, 'Typed during lookup');
  assert.equal(JSON.parse(f.host.find(n => n.attrs.name === 'internal').value).samples[0].markerGrade, 'M');
  const mismatch = fixture({ page: 'internal', data: { internal: JSON.stringify({ samples: [{ markingScheduleRecord: id }] }) },
    recordRequest: async () => ({ revision: 1, content: { parentRecord: id, schedule: '{"grade":"E","markerComments":"Do not copy"}' } }) });
  await flush();
  assert.ok(!JSON.parse(mismatch.host.find(n => n.attrs.name === 'internal').value).samples[0].comments);
  assert.ok(!JSON.parse(mismatch.host.find(n => n.attrs.name === 'internal').value).samples[0].markerGrade);
  assert.ok(mismatch.host.find(n => n.attrs.role === 'alert' && n.textContent.includes('does not belong')));
});
test('invalid schedule details are reported without blocking the other field', async () => {
  const first = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const second = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  const complete = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  const f = fixture({ page: 'internal', data: { internal: JSON.stringify({ samples: [
    { markingScheduleRecord: first }, { markingScheduleRecord: second },
    { markingScheduleRecord: complete, markerGrade: 'A', comments: 'Existing' }
  ] }) }, recordRequest: async path => {
    assert.ok(!path.endsWith(complete));
    return { revision: 1, content: { parentRecord: record, schedule: path.endsWith(first)
      ? '{"grade":"invalid","markerComments":"Valid comment"}' : '{"grade":"A","markerComments":42}' } };
  } });
  await flush();
  const samples = JSON.parse(f.host.find(n => n.attrs.name === 'internal').value).samples;
  assert.equal(samples[0].comments, 'Valid comment');
  assert.ok(!samples[0].markerGrade);
  assert.equal(samples[1].markerGrade, 'A');
  assert.ok(!samples[1].comments);
  const alert = f.host.find(n => n.attrs.role === 'alert');
  assert.ok(alert.textContent.includes('grade is invalid'));
  assert.ok(alert.textContent.includes('comments are invalid'));
  assert.ok(!f.calls.some(call => call[0] === 'request' && call[1].endsWith(complete)));
});
test('moderation Yes/No fields preserve saved answers on load', async () => {
  for (const [page, definition] of Object.entries(schema.documents)) {
    const decisions = definition.groups.flatMap(([, fields]) => fields).filter(def => def[2] === schema.yesNo);
    const data = Object.fromEntries(decisions.map(([key], i) => [key, ['Yes', 'No', 'Not applicable', ''][i % 4]]));
    const f = fixture({ page, displayName: '', data: { [page]: JSON.stringify(data) } }); await flush();
    const tables = f.host.all().filter(child => child.attrs.class === 'moderation-decisions');
    assert.equal(tables.length, definition.groups.filter(([, fields]) => fields.some(def => def[2] === schema.yesNo)).length);
    for (const [key, label] of decisions) {
      const box = f.host.find(child => child.attrs.id === 'moderation-' + page + '-' + key);
      assert.equal(box.type, 'checkbox', page + ':' + key);
      assert.equal(box.checked, data[key] === 'Yes');
      assert.equal(box.indeterminate, !data[key] || data[key] === 'Not applicable');
      if (page === 'internal' && key === 'randomSelection') {
        assert.equal(box.parentElement.tag, 'label');
        continue;
      }
      assert.equal(box.parentElement.tag, 'td');
      assert.equal(box.parentElement.parentElement.children.length, 2);
      assert.equal(box.parentElement.parentElement.children[0].children[0].textContent, label);
    }
    assert.deepEqual(JSON.parse(f.host.find(child => child.attrs.name === page).value), data);
    if (decisions.length) {
      const key = decisions[0][0];
      const box = f.host.find(child => child.attrs.id === 'moderation-' + page + '-' + key);
      box.checked = false; box.events.change();
      assert.equal(JSON.parse(f.host.find(child => child.attrs.name === page).value)[key], 'No');
      box.checked = true; box.events.change();
      assert.equal(JSON.parse(f.host.find(child => child.attrs.name === page).value)[key], 'Yes');
      assert.equal(box.indeterminate, false);
    }
    if (page === 'coversheet') assert.equal(f.host.find(child => child.attrs.id === 'moderation-coversheet-grade').tag, 'select');
    if (page === 'internal') assert.equal(f.host.find(child => child.attrs.id === 'moderation-internal-sourceTypes-commercial').type, 'checkbox');
  }
});
test('Unit Standards clear and hide higher requirements; Achievement Standards retain all three', async () => {
  for (const standardType of ['Unit', 'Achievement']) {
    const f = fixture({ page: 'schedule', data: { schedule: JSON.stringify({ achieved: 'Achieved criteria', merit: 'Old merit', excellence: 'Old excellence' }) },
      standardRequest: async () => ({ number: '99999', level: '3', version: '2', standardType }) });
    await flush();
    const state = JSON.parse(f.host.find(n => n.attrs.name === 'schedule').value);
    assert.equal(state.achieved, 'Achieved criteria');
    assert.equal(state.merit, standardType === 'Unit' ? '' : 'Old merit');
    assert.equal(state.excellence, standardType === 'Unit' ? '' : 'Old excellence');
    assert.equal(Boolean(f.host.find(n => n.attrs.id === 'moderation-schedule-merit')), standardType === 'Achievement');
    assert.equal(Boolean(f.host.find(n => n.attrs.id === 'moderation-schedule-excellence')), standardType === 'Achievement');
  }
});
test('unverified standard types do not clear existing requirements and surface the failure', async () => {
  const f = fixture({ page: 'schedule', data: { schedule: '{"merit":"Keep merit","excellence":"Keep excellence"}' },
    standardRequest: async () => { throw new Error('NZQA unavailable'); } });
  await flush();
  assert.equal(JSON.parse(f.host.find(n => n.attrs.name === 'schedule').value).merit, 'Keep merit');
  assert.ok(f.host.find(n => n.attrs.role === 'alert' && n.textContent.includes('Standard type could not be verified')));
});
test('marker comments grow with existing and edited text without changing saved content', async () => {
  const initial = 'Existing marker comments\n'.repeat(30);
  const f = fixture({ page: 'schedule', data: { schedule: JSON.stringify({ markerComments: initial }) } });
  await flush();
  const control = f.host.find(n => n.attrs.id === 'moderation-schedule-markerComments');
  const wrapper = control.parentElement;
  const mirror = wrapper.find(n => n.attrs.class === 'moderation-autogrow-mirror');
  assert.equal(wrapper.attrs.class, 'planner-field moderation-autogrow');
  assert.equal(mirror.attrs['aria-hidden'], 'true');
  assert.equal(mirror.textContent, initial);
  control.value = 'Updated comments\n'.repeat(50);
  control.events.input();
  assert.equal(mirror.textContent, control.value);
  assert.equal(JSON.parse(f.host.find(n => n.attrs.name === 'schedule').value).markerComments, control.value);
  control.value = 'Short comment'; control.events.input();
  assert.equal(mirror.textContent, 'Short comment');
});
test('marking schedule supporting notes grow with existing and edited text', async () => {
  const initial = 'Existing supporting notes\n'.repeat(30);
  const f = fixture({ page: 'schedule', data: { schedule: JSON.stringify({ notes: initial }) } });
  await flush();
  const control = f.host.find(n => n.attrs.id === 'moderation-schedule-notes');
  const wrapper = control.parentElement;
  const mirror = wrapper.find(n => n.attrs.class === 'moderation-autogrow-mirror');
  assert.equal(wrapper.attrs.class, 'planner-field moderation-autogrow');
  assert.equal(mirror.attrs['aria-hidden'], 'true');
  assert.equal(mirror.textContent, initial);
  control.value = 'Updated notes\n'.repeat(50); control.events.input();
  assert.equal(mirror.textContent, control.value);
  assert.equal(JSON.parse(f.host.find(n => n.attrs.name === 'schedule').value).notes, control.value);
  control.value = 'Short note'; control.events.input();
  assert.equal(mirror.textContent, 'Short note');
});
test('evaluation comments grow with saved and edited content without changing the saved text', async () => {
  const initial = 'Existing evaluation\n'.repeat(30);
  const f = fixture({ page: 'internal', data: { internal: JSON.stringify({ evaluationComments: initial }) } });
  await flush();
  const control = f.host.find(n => n.attrs.id === 'moderation-internal-evaluationComments');
  const wrapper = control.parentElement, mirror = wrapper.find(n => n.attrs.class === 'moderation-autogrow-mirror');
  assert.equal(wrapper.attrs.class, 'planner-field moderation-autogrow');
  assert.equal(mirror.attrs['aria-hidden'], 'true');
  assert.equal(mirror.textContent, initial);
  control.value = 'Updated evaluation\n'.repeat(50); control.events.input();
  assert.equal(mirror.textContent, control.value);
  assert.equal(JSON.parse(f.host.find(n => n.attrs.name === 'internal').value).evaluationComments, control.value);
  control.value = 'Short note'; control.events.input();
  assert.equal(mirror.textContent, 'Short note');
});
test('requirements show only text, evidence and judgement without altering historical grades', async () => {
  for (const standardType of ['Unit', 'Achievement']) {
    const f = fixture({ page: 'schedule', data: { schedule: JSON.stringify({ requirements: [
      { requirement: 'Requirement one', level: 'A', grade: 'E', evidence: 'Evidence', judgement: 'Judgement' }
    ] }) }, standardRequest: async () => ({ number: '99999', standardType }) });
    await flush();
    let table = f.host.find(n => n.attrs.class === 'moderation-requirements-table');
    assert.deepEqual(table.children[1].children[0].children.map(n => n.textContent),
      ['Key requirements (list)', 'Describe or attach the evidence considered', 'Explain how the judgement was made']);
    assert.equal(table.all().some(n => n.type === 'checkbox' || n.tag === 'select'), false);
    assert.equal(table.all().some(n => n.textContent.startsWith('Saved grade:')), false);
    assert.equal(table.children[2].children[0].children.length, 3);
    const evidence = f.host.find(n => n.attrs.id === 'moderation-schedule-0-evidence');
    evidence.value = 'Updated evidence'; evidence.events.input();
    assert.deepEqual(JSON.parse(f.host.find(n => n.attrs.name === 'schedule').value).requirements[0],
      { requirement: 'Requirement one', level: 'A', grade: 'E', evidence: 'Updated evidence', judgement: 'Judgement' });
    assert.ok(f.host.find(n => n.textContent === 'Requirement 1'));
    assert.ok(f.host.find(n => n.tag === 'h3' && n.textContent === 'Standard'));
    assert.ok(f.host.find(n => n.tag === 'label' && n.textContent === 'Achieved Grade Criteria'));
    await f.click('Add requirement');
    table = f.host.find(n => n.attrs.class === 'moderation-requirements-table');
    assert.equal(table.children[2].children.length, 2);
    await f.click('Remove requirement 2');
    assert.equal(JSON.parse(f.host.find(n => n.attrs.name === 'schedule').value).requirements.length, 1);
  }
});
test('four visible schedule resources independently select and save Drive links without importing or updating contents', async () => {
  const f = fixture({ page: 'schedule', data: { schedule: JSON.stringify({ instructions: 'Existing instructions', submissions: 'Existing submissions' }) } });
  await flush();
  const fields = schema.documents.schedule.groups[0][1].filter(def => def[2] === 'drive' && def[0] !== 'tourReportLink');
  assert.equal(fields.length, 4);
  for (const [i, [key, label]] of fields.entries()) {
    f.chosen = { id: 'resource_doc_' + i };
    await f.click('Choose Google Drive files for ' + label);
    const saved = JSON.parse(f.saved.at(-1).schedule);
    assert.equal(saved[key], 'Existing assessment | https://drive.google.com/file/d/resource_doc_' + i + '/view');
    assert.equal(saved.instructions, 'Existing instructions');
    assert.equal(saved.submissions, 'Existing submissions');
    assert.ok(f.host.find(n => n.tag === 'a' && n.attrs.href === 'https://drive.google.com/file/d/resource_doc_' + i + '/view'));
  }
  const saved = JSON.parse(f.saved.at(-1).schedule);
  for (const [key] of fields) assert.ok(saved[key]);
  assert.equal(f.calls.filter(call => ['upload', 'download', 'binary'].includes(call[0])).length, 0);
  await f.host.find(n => n.attrs['aria-label'] === 'Remove Existing assessment from Topic Brief').events.click();
  assert.equal(JSON.parse(f.saved.at(-1).schedule).topicBriefLink, '');
  assert.ok(JSON.parse(f.saved.at(-1).schedule).assessmentInstructionsLink);
  const reopened = fixture({ page: 'schedule', data: { schedule: f.saved.at(-1).schedule } });
  await flush();
  assert.ok(reopened.host.find(n => n.tag === 'a' && n.attrs.href === 'https://drive.google.com/file/d/resource_doc_0/view'));
});
test('resource selection cancellation, inaccessible documents and failed saves surface without changing Drive contents', async () => {
  const f = fixture({ page: 'schedule' }); await flush();
  const label = 'Choose Google Drive files for Topic Brief';
  f.chosen = null; await f.click(label);
  assert.equal(f.saved.length, 0);
  f.chosen = { id: 'document_id_123' }; f.missing = true; await f.click(label);
  assert.ok(f.host.find(n => n.attrs.role === 'alert' && n.textContent.includes('inaccessible')));
  assert.equal(f.saved.length, 0);
  const failed = fixture({ page: 'schedule', saveFails: true }); await flush();
  await failed.click(label);
  assert.ok(failed.host.find(n => n.attrs.role === 'alert' && n.textContent.includes('not saved')));
  assert.equal(failed.calls.filter(call => ['upload', 'download', 'binary'].includes(call[0])).length, 0);
});
test('Confirmation contact email defaults to signed-in identity, autosaves and preserves overrides', async () => {
  for (const [existing, signedIn, expected] of [
    ['', 'teacher@example.test', 'teacher@example.test'],
    ['   ', 'teacher@example.test', 'teacher@example.test'],
    ['other@example.test', 'teacher@example.test', 'other@example.test'],
    ['', '', '']
  ]) {
    const f = fixture({ page: 'feedback', userEmail: signedIn,
      data: { feedback: JSON.stringify({ contactEmail: existing, grade: 'M' }) } });
    let changed = 0;
    f.host.addEventListener('input', () => { changed++; });
    await flush();
    const control = f.host.find(n => n.attrs.id === 'moderation-feedback-contactEmail');
    assert.equal(control.value, expected);
    const saved = JSON.parse(f.host.find(n => n.attrs.name === 'feedback').value);
    assert.equal(saved.contactEmail, expected);
    assert.equal(saved.grade, 'M');
    if (!existing.trim() && signedIn) assert.ok(changed > 0, 'prefill triggers host autosave after mount');
    control.value = 'custom@example.test'; control.events.input();
    assert.equal(JSON.parse(f.host.find(n => n.attrs.name === 'feedback').value).contactEmail, 'custom@example.test');
    assert.equal(f.calls.filter(call => ['upload', 'download', 'binary'].includes(call[0])).length, 0);
  }
});
test('schedule and confirmation sync editable documents then update a persistent PDF in the source folder', async () => {
  for (const page of ['schedule', 'feedback']) {
    const f = fixture({ page }); await flush();
    const metadata = f.access.metadata;
    f.access.metadata = async id => id === 'pdf_document_123' ?
      { id, name: 'Existing.pdf', mimeType: 'application/pdf', capabilities: { canEdit: true }, etag: '"pdf-rev"' } : metadata(id);
    await f.click('Create / update Google Drive document');
    const pdfCall = f.calls.find(c => c[0] === 'savePdf');
    assert.ok(pdfCall);
    assert.equal(pdfCall[2].folderId, 'student_folder_123');
    assert.equal(pdfCall[2].properties.plannerDocument, page + '-pdf');
    assert.ok(f.calls.findIndex(c => c[0] === 'upload') < f.calls.findIndex(c => c[0] === 'savePdf'));
    if (page === 'schedule') {
      const generation = f.calls.find(c => c[0] === 'binary' && c[1].includes('/document'));
      assert.equal(new URL('https://planner.example.test/' + generation[1]).searchParams.get('standardPdfUrl'),
        'https://www.nzqa.govt.nz/nqfdocs/ncea-resource/achievements/2026/as99999.pdf');
    }
    assert.equal(JSON.parse(f.saved.at(-1).driveDocuments)[page].pdf.id, 'pdf_document_123');
    assert.ok(f.host.find(n => n.tag === 'a' && n.textContent === 'Open PDF copy'));
    await f.click('Create / update Google Drive document');
    assert.equal(f.calls.filter(c => c[0] === 'savePdf').at(-1)[2].id, 'pdf_document_123');
    assert.equal(f.calls.filter(c => c[0] === 'savePdf').at(-1)[2].etag, '"pdf-rev"');
  }
});
test('PDF failure clearly reports partial success and keeps the editable document link', async () => {
  const f = fixture({ page: 'feedback' }); await flush();
  f.access.savePdf = async () => { throw new Error('PDF export unavailable'); };
  await f.click('Create / update Google Drive document');
  assert.equal(JSON.parse(f.saved.at(-1).driveDocuments).feedback.id, 'document_id_123');
  assert.ok(f.host.find(n => n.attrs.role === 'alert' && /editable document synced successfully.*PDF export unavailable/.test(n.textContent)));
});
test('generated schedule PDF becomes the single confirmation schedule reference and removes generic-link duplicates', async () => {
  const oldFeedback = { grade: 'M', contactEmail: 'teacher@example.test',
    markingScheduleLink: 'Student A schedule | https://example.test/old\nMarking Schedule | https://example.test/manual',
    coversheetLink: 'Student A cover | https://example.test/old-cover\nCover Sheet | https://example.test/cover' };
  const f = fixture({ page: 'schedule', data: { feedback: JSON.stringify(oldFeedback) } }); await flush();
  await f.click('Create / update Google Drive document');
  const saved = f.saved.at(-1);
  const feedback = JSON.parse(saved.feedback);
  assert.equal(feedback.markingScheduleLink, 'Marking Schedule | https://drive.google.com/file/d/pdf_document_123/view');
  assert.equal(feedback.coversheetLink, 'Cover Sheet | https://example.test/cover');
  assert.equal(feedback.grade, 'M');
  assert.equal(feedback.contactEmail, oldFeedback.contactEmail);
  const reopened = fixture({ page: 'feedback', data: saved }); await flush();
  const marking = reopened.host.find(n => n.tag === 'h4' && n.textContent === 'Marking Schedule').parentElement;
  assert.equal(marking.all().filter(n => n.tag === 'a').length, 1);
  assert.equal(marking.all().find(n => n.tag === 'a').attrs.href, 'https://drive.google.com/file/d/pdf_document_123/view');
});
test('opening confirmation reconciles existing duplicate references and prefers the generated schedule PDF', async () => {
  const f = fixture({ page: 'feedback', data: {
    driveDocuments: JSON.stringify({ schedule: { id: 'schedule_doc_123', name: 'Schedule',
      mimeType: 'application/vnd.google-apps.document', pdf: { id: 'generated_pdf_123', name: 'Schedule.pdf', mimeType: 'application/pdf' } } }),
    feedback: JSON.stringify({
      markingScheduleLink: 'Student B | https://example.test/old\nMarking Schedule | https://example.test/short',
      coversheetLink: 'Student B | https://example.test/cover\nCover Sheet | https://example.test/cover\nCover Sheet | https://example.test/cover'
    })
  } });
  await flush();
  const feedback = JSON.parse(f.host.find(n => n.attrs.name === 'feedback').value);
  assert.equal(feedback.markingScheduleLink, 'Marking Schedule | https://drive.google.com/file/d/generated_pdf_123/view');
  assert.equal(feedback.coversheetLink, 'Cover Sheet | https://example.test/cover');
  assert.equal(f.calls.filter(c => ['upload', 'savePdf', 'download'].includes(c[0])).length, 0);
});
test('PDF sync recovers tagged copies and refuses to replace an inaccessible existing PDF', async () => {
  for (const canEdit of [true, false]) {
    const f = fixture({ page: 'feedback' }); await flush();
    f.access.find = async (_folder, properties) => properties.plannerDocument === 'feedback-pdf' ?
      { id: 'recovered_pdf_123' } : null;
    const metadata = f.access.metadata;
    f.access.metadata = async id => id === 'recovered_pdf_123' ?
      { id, mimeType: 'application/pdf', name: 'Recovered.pdf', capabilities: { canEdit } } : metadata(id);
    await f.click('Create / update Google Drive document');
    if (canEdit) assert.equal(f.calls.find(c => c[0] === 'savePdf')[2].id, 'recovered_pdf_123');
    else {
      assert.equal(f.calls.filter(c => c[0] === 'savePdf').length, 0);
      assert.ok(f.host.find(n => n.attrs.role === 'alert' && n.textContent.includes('Restore access')));
    }
  }
});
test('all link-only fields allow any file type without importing or changing file contents', async () => {
  for (const [page, label, key, mimeType] of [
    ['feedback', 'Marking Schedule', 'markingScheduleLink', 'application/pdf'],
    ['feedback', 'Cover Sheet', 'coversheetLink', 'application/pdf'],
    ['schedule', 'Topic Brief', 'topicBriefLink', 'image/png'],
    ['schedule', 'File Submission', 'fileSubmissionLink', 'application/msaccess']
  ]) {
    const f = fixture({ page }); await flush();
    f.access.metadata = async id => ({ id, name: 'Student submission', mimeType });
    await f.click('Choose Google Drive files for ' + label);
    const choice = f.calls.find(call => call[0] === 'chooseFiles');
    assert.equal(choice[1], page !== 'feedback');
    assert.equal(JSON.parse(f.saved.at(-1)[page])[key],
      'Student submission | https://drive.google.com/file/d/document_id_123/view');
    assert.ok(f.host.find(n => n.tag === 'a' && n.textContent === 'Student submission'));
    assert.equal(f.calls.filter(call => ['upload', 'download', 'binary'].includes(call[0])).length, 0);
  }
});
test('moderation buttons distinguish Drive sync, replacement and removal without changing navigation actions', async () => {
  const f = fixture({ page: 'schedule', data: { schedule: JSON.stringify({
    requirements: [{ requirement: 'Actual requirement', grade: 'A' }],
    topicBriefLink: 'Brief | https://example.test/brief'
  }) } });
  await flush();
  const button = label => f.host.find(n => n.tag === 'button' && n.textContent === label);
  assert.equal(button('Create / update Google Drive document').attrs.class, 'moderation-button-drive');
  assert.equal(button('Create a replacement document').attrs.class, 'moderation-button-warning');
  assert.equal(button('Remove requirement 1').attrs.class, 'moderation-button-danger');
  assert.equal(f.host.find(n => n.attrs['aria-label'] === 'Remove Brief from Topic Brief').attrs.class, 'moderation-button-danger');
  await f.click('Remove requirement 1');
  assert.deepEqual(JSON.parse(f.host.find(n => n.attrs.name === 'schedule').value).requirements, []);
  const internal = fixture({ page: 'internal', data: { internal: JSON.stringify({ samples: [{ student: 'Learner' }] }) } });
  await flush();
  assert.equal(internal.host.find(n => n.tag === 'button' && n.textContent === 'Remove entry 1').attrs.class, 'moderation-button-danger');
  assert.notEqual(internal.host.find(n => n.tag === 'button' &&
    n.textContent === 'Create / open marking schedule for entry 1').attrs.class, 'moderation-button-danger');
});
test('Unit criteria populate from PDF outcomes only when empty or the old Achieved placeholder', async () => {
  for (const [standardType, existing, expected] of [
    ['Unit', '', 'Outcome 1: Integrate documents.\n\nOutcome 2: Review documents.'],
    ['Unit', 'Achieved', 'Outcome 1: Integrate documents.\n\nOutcome 2: Review documents.'],
    ['Unit', 'Custom assessment criteria', 'Custom assessment criteria'],
    ['Achievement', '', '']
  ]) {
    const f = fixture({ page: 'schedule', data: { schedule: JSON.stringify({ achieved: existing }) },
      standardRequest: async () => ({ number: '99999', standardType,
        outcomes: ['Outcome 1: Integrate documents.', 'Outcome 2: Review documents.'] }) });
    await flush();
    assert.equal(JSON.parse(f.host.find(n => n.attrs.name === 'schedule').value).achieved, expected);
    assert.equal(f.host.find(n => n.attrs.id === 'moderation-schedule-achieved').value, expected);
    assert.ok(f.host.find(n => n.tag === 'label' && n.textContent === 'Achieved Grade Criteria'));
  }
});
test('Achievement preview applies selected details without replacing marking or existing criteria', async () => {
  const details = { number: '99999', version: '2', standardType: 'Achievement', url: 'https://www.nzqa.govt.nz/nqfdocs/ncea-resource/achievements/2026/as99999.pdf',
    criteria: { achieved: 'Basic criteria', merit: 'Merit criteria', excellence: 'Excellent criteria' },
    requirements: ['Basic criteria involves:\n\u2022 First proposed note.', 'Basic criteria involves:\n\u2022 Second proposed note.'] };
  const existing = { merit: 'My criteria', grade: 'M', requirements: [{ requirement: 'Previously grouped requirements', grade: 'A', evidence: 'Evidence', judgement: 'Judgement' }] };
  const f = fixture({ page: 'schedule', data: { schedule: JSON.stringify(existing) }, previewRequest: async () => details });
  await flush(); await f.click('Preview NZQA Achievement Standard');
  assert.ok(f.host.find(n => n.tag === 'h5' && n.textContent === 'Achieved requirements'));
  assert.equal(f.host.all().filter(n => n.tag === 'h5' && n.textContent === 'Achieved requirements').length, 1);
  await f.click('Select all requirements');
  assert.equal(f.host.find(n => n.attrs['aria-label'] === 'Import proposed requirement 1').checked, true);
  assert.equal(f.host.find(n => n.attrs['aria-label'] === 'Import proposed requirement 2').checked, true);
  await f.click('Apply selected NZQA details');
  const saved = JSON.parse(f.host.find(n => n.attrs.name === 'schedule').value);
  assert.equal(saved.merit, existing.merit);
  assert.equal(saved.grade, existing.grade);
  assert.deepEqual(saved.requirements[0], existing.requirements[0]);
  assert.equal(saved.achieved, 'Basic criteria');
  assert.equal(saved.excellence, 'Excellent criteria');
  assert.equal(saved.notes, 'Source: NZQA, Achievement Standard 99999, version 2 — ' + details.url);
  assert.deepEqual(saved.requirements[1], { requirement: 'First proposed note.', level: 'A' });
  assert.deepEqual(saved.requirements[2], { requirement: 'Second proposed note.', level: 'A' });
  assert.equal(saved.requirements.length, 3);
  assert.equal(f.calls.filter(c => ['upload', 'savePdf'].includes(c[0])).length, 0);
});
test('Select all keeps separate grade levels for identical requirement text', async () => {
  const details = { number: '99999', version: '2', standardType: 'Achievement',
    url: 'https://www.nzqa.govt.nz/nqfdocs/ncea-resource/achievements/2026/as99999.pdf',
    criteria: { achieved: 'Basic criteria', merit: 'Merit criteria', excellence: 'Excellent criteria' },
    requirements: ['Basic criteria involves:\n\u2022 Same item.', 'Merit criteria involves:\n\u2022 Same item.',
      'Excellent criteria involves:\n\u2022 Another item.'] };
  const f = fixture({ page: 'schedule', previewRequest: async () => details });
  await flush(); await f.click('Preview NZQA Achievement Standard');
  await f.click('Select all requirements'); await f.click('Apply selected NZQA details');
  const saved = JSON.parse(f.host.find(n => n.attrs.name === 'schedule').value);
  assert.deepEqual(saved.requirements, [
    { requirement: 'Same item.', level: 'A' }, { requirement: 'Same item.', level: 'M' },
    { requirement: 'Another item.', level: 'E' }
  ]);
  const table = f.host.find(n => n.attrs.class === 'moderation-requirements-table');
  assert.equal(table.children[2].children.length, 3);
  assert.equal(table.all().some(n => n.type === 'checkbox' || n.tag === 'select'), false);
});
test('opening a schedule moves only generated criteria sources to notes without changing marking', async () => {
  const citation = 'Source: NZQA, Achievement Standard 99999, version 2 — https://www.nzqa.govt.nz/nqfdocs/ncea-resource/achievements/2026/as99999.pdf';
  const other = 'Source: NZQA, Achievement Standard 12345, version 2 — https://www.nzqa.govt.nz/nqfdocs/ncea-resource/achievements/2026/as12345.pdf';
  const original = { achieved: 'Basic criteria\n\n' + citation, merit: 'Merit criteria\n\n' + citation,
    excellence: 'Custom text\n\n' + other, notes: 'Teacher note', grade: 'M',
    requirements: [{ requirement: 'Keep', grade: 'A', evidence: 'Evidence' }] };
  const f = fixture({ page: 'schedule', data: { schedule: JSON.stringify(original) } });
  await flush();
  const saved = JSON.parse(f.host.find(n => n.attrs.name === 'schedule').value);
  assert.equal(saved.achieved, 'Basic criteria');
  assert.equal(saved.merit, 'Merit criteria');
  assert.equal(saved.excellence, original.excellence);
  assert.equal(saved.notes, 'Teacher note\n\n' + citation);
  assert.equal(saved.grade, original.grade);
  assert.deepEqual(saved.requirements, original.requirements);
  assert.equal(f.host.find(n => n.attrs.id === 'moderation-schedule-achieved').value, 'Basic criteria');
});
test('opening a schedule removes generated requirement context and source, preserving marks', async () => {
  const citation = 'Source: NZQA, Achievement Standard 99999, version 2 — https://www.nzqa.govt.nz/nqfdocs/ncea-resource/achievements/2026/as99999.pdf';
  const rows = [
    { requirement: 'Basic criteria involves:\n\u2022 First item\n\n' + citation, grade: 'A', evidence: 'Evidence' },
    { requirement: 'Merit criteria involves:\n\u2022 First item\n\u2022 Second item.\n\n' + citation, grade: 'M', judgement: 'Judgement' },
    { requirement: 'Teacher text with involves:\n\u2022 Keep this', grade: 'N' }
  ];
  const f = fixture({ page: 'schedule', data: { schedule: JSON.stringify({
    achieved: 'Basic criteria', merit: 'Merit criteria', notes: 'Teacher note', requirements: rows
  }) } });
  await flush();
  const saved = JSON.parse(f.host.find(n => n.attrs.name === 'schedule').value);
  assert.deepEqual(saved.requirements, [
    { requirement: 'First item', level: 'A', grade: 'A', evidence: 'Evidence' },
    { requirement: '\u2022 First item\n\u2022 Second item.', level: 'M', grade: 'M', judgement: 'Judgement' },
    rows[2]
  ]);
  assert.equal(saved.notes, 'Teacher note\n\n' + citation);
});
test('a full schedule keeps its existing criteria and reports a source migration error', async () => {
  const citation = 'Source: NZQA, Achievement Standard 99999, version 2 — https://www.nzqa.govt.nz/nqfdocs/ncea-resource/achievements/2026/as99999.pdf';
  const original = { achieved: 'Basic\n\n' + citation, notes: 'x'.repeat(8000), requirements: [] };
  const f = fixture({ page: 'schedule', data: { schedule: JSON.stringify(original) } });
  await flush();
  assert.deepEqual(JSON.parse(f.host.find(n => n.attrs.name === 'schedule').value), original);
  assert.ok(f.host.find(n => n.attrs.role === 'alert' && n.textContent.includes('cannot be moved')));
});
test('student schedules retain NZQA source notes when inheriting clean or older template criteria', async () => {
  const citation = 'Source: NZQA, Achievement Standard 99999, version 2 — https://www.nzqa.govt.nz/nqfdocs/ncea-resource/achievements/2026/as99999.pdf';
  for (const old of [true, false]) {
    const master = old ? { achieved: 'Basic\n\n' + citation, notes: 'Private template note' } :
      { achieved: 'Basic', notes: 'Private template note\n\n' + citation };
    const f = fixture({ page: 'schedule', data: { parentRecord: record, schedule: JSON.stringify({ notes: 'Student note' }) },
      recordRequest: async () => ({ revision: 1, content: { standardNumber: '99999', schedule: JSON.stringify(master) } }) });
    await flush(); await f.click('Fill missing from standard template');
    const saved = JSON.parse(f.saved.at(-1).schedule);
    assert.equal(saved.achieved, 'Basic');
    assert.equal(saved.notes, 'Student note\n\n' + citation);
    await f.click('Fill missing from standard template');
    assert.equal(JSON.parse(f.host.find(n => n.attrs.name === 'schedule').value).notes, saved.notes);
  }
});
test('new student schedules inherit only the NZQA source, not other template notes', async () => {
  const citation = 'Source: NZQA, Achievement Standard 99999, version 2 — https://www.nzqa.govt.nz/nqfdocs/ncea-resource/achievements/2026/as99999.pdf';
  const f = fixture({ page: 'internal', data: { schedule: JSON.stringify({ achieved: 'Basic\n\n' + citation, notes: 'Private template note',
    requirements: [{ requirement: 'Basic involves:\n\u2022 Requirement\n\n' + citation, grade: 'A', evidence: 'Private marking' }] }),
    internal: JSON.stringify({ samples: [{ student: 'Learner A' }] }) } });
  await flush(); await f.click('Create / open marking schedule for entry 1');
  const schedule = JSON.parse(f.calls.find(c => c[0] === 'mutate')[2].content.schedule);
  assert.equal(schedule.achieved, 'Basic');
  assert.equal(schedule.notes, citation);
  assert.deepEqual(schedule.requirements, [{ requirement: 'Requirement', level: 'A' }]);
});
test('importing old criteria moves their generated source without overwriting existing notes', async () => {
  const citation = 'Source: NZQA, Achievement Standard 99999, version 2 — https://www.nzqa.govt.nz/nqfdocs/ncea-resource/achievements/2026/as99999.pdf';
  const f = fixture({ page: 'schedule', data: { schedule: JSON.stringify({ notes: 'Teacher note' }) },
    importResult: { common: { standardNumber: '99999' }, document: { achieved: 'Basic\n\n' + citation }, warning: 'Review.' } });
  await flush(); await f.click('Choose existing document and import its form data');
  const schedule = JSON.parse(f.saved.at(-1).schedule);
  assert.equal(schedule.achieved, 'Basic');
  assert.equal(schedule.notes, 'Teacher note\n\n' + citation);
});
test('Achievement preview rejects edits and changed PDF versions before applying', async () => {
  for (const change of ['edit', 'version']) {
    let version = '2';
    const details = () => ({ number: '99999', version, standardType: 'Achievement', url: 'https://www.nzqa.govt.nz/test.pdf',
      criteria: { achieved: 'Basic', merit: 'Merit', excellence: 'Excellent' }, requirements: [] });
    const f = fixture({ page: 'schedule', previewRequest: async () => details() });
    await flush(); await f.click('Preview NZQA Achievement Standard');
    if (change === 'version') version = '3';
    else {
      const field = f.host.find(n => n.attrs.id === 'moderation-schedule-achieved');
      field.value = 'Edited'; field.events.input();
    }
    await f.click('Apply selected NZQA details');
    assert.ok(f.host.find(n => n.attrs.role === 'alert' && n.textContent.includes('changed while the preview was open')));
    const saved = JSON.parse(f.host.find(n => n.attrs.name === 'schedule').value);
    assert.equal(saved.achieved || '', change === 'edit' ? 'Edited' : '');
  }
});
test('Achievement preview refuses to exceed the requirement limit without changing marking', async () => {
  const details = { number: '99999', version: '2', standardType: 'Achievement', url: 'https://www.nzqa.govt.nz/test.pdf',
    criteria: { achieved: 'Basic', merit: 'Merit', excellence: 'Excellent' }, requirements: ['Another note.'] };
  const requirements = Array.from({ length: 50 }, (_, i) => ({ requirement: 'Requirement ' + i, grade: 'A' }));
  const f = fixture({ page: 'schedule', data: { schedule: JSON.stringify({ requirements }) }, previewRequest: async () => details });
  await flush(); await f.click('Preview NZQA Achievement Standard');
  f.host.find(n => n.attrs['aria-label'] === 'Import proposed requirement 1').checked = true;
  await f.click('Apply selected NZQA details');
  assert.ok(f.host.find(n => n.attrs.role === 'alert' && n.textContent.includes('exceed the schedule limit')));
  const saved = JSON.parse(f.host.find(n => n.attrs.name === 'schedule').value);
  assert.deepEqual(saved.requirements, requirements);
  assert.equal(saved.achieved, undefined);
});
test('resource tables put short and long filename links on the left and Remove buttons on the right', async () => {
  const f = fixture({ page: 'schedule', data: { schedule: JSON.stringify({
    fileSubmissionLink: 'Short | https://example.test/short\nA much longer submission file name | https://example.test/long'
  }) } });
  await flush();
  const table = f.host.find(n => n.attrs.class === 'moderation-resource-table' && n.attrs['aria-label'] === 'File Submission files');
  assert.ok(table);
  assert.deepEqual(table.children[0].children[0].children.map(n => [n.textContent, n.attrs.scope]), [['Filename', 'col'], ['Action', 'col']]);
  const rows = table.children[1].children;
  assert.equal(rows.length, 2);
  for (const item of rows) {
    assert.deepEqual(item.children.map(child => child.tag), ['td', 'td']);
    const filename = item.children[0].children[0], remove = item.children[1].children[0];
    assert.equal(filename.tag, 'a');
    assert.equal(remove.attrs.class, 'moderation-button-danger');
    assert.equal(remove.textContent, 'Remove');
    assert.equal(remove.attrs['aria-label'], 'Remove ' + filename.textContent + ' from File Submission');
  }
  const css = fs.readFileSync(require.resolve('./public/assessment-manager.css'), 'utf8');
  assert.match(css, /\.moderation-resource-table\s*\{[^}]*width:\s*100%/);
  assert.match(css, /\.moderation-resource-table th,[^{]*\{[^}]*overflow-wrap:\s*anywhere/);
});
test('overall grades remain manual and independent of requirements for Unit and Achievement standards', async () => {
  for (const standardType of ['Unit', 'Achievement']) {
    const original = standardType === 'Unit' ? 'N' : 'M';
    const f = fixture({ page: 'schedule', standardRequest: async () => ({ number: '99999', standardType }),
      data: { standardType, schedule: JSON.stringify({ grade: original, requirements: [
        { requirement: 'First', grade: 'A' }, { requirement: 'Second', grade: 'A' }
      ] }) } });
    await flush();
    const grade = () => JSON.parse(f.host.find(n => n.attrs.name === 'schedule').value).grade;
    const control = f.host.find(n => n.attrs.id === 'moderation-schedule-grade');
    assert.equal(grade(), original);
    assert.equal(control.value, original);
    control.value = 'A'; control.events.change();
    assert.equal(grade(), 'A');
    await f.click('Add requirement');
    assert.equal(grade(), 'A');
    await f.click('Remove requirement 3');
    assert.equal(grade(), 'A');
    await f.click('Remove requirement 2'); await f.click('Remove requirement 1');
    assert.equal(grade(), 'A');
    control.value = ''; control.events.change();
    assert.equal(grade(), '');
  }
});
test('opening a saved student schedule removes its template-only row and keeps the three actual requirements', async () => {
  const placeholder = { requirement: 'Key requirements (list):', grade: '',
    evidence: 'Describe or attach the evidence considered.', judgement: 'Explain how the judgement was made.' };
  const requirements = [
    { requirement: 'Integrated documents', grade: 'A', evidence: 'Student C evidence', judgement: 'Achieved' },
    { requirement: 'Edited images', grade: 'A', evidence: '', judgement: '' },
    { requirement: 'Good practice', grade: 'A', evidence: '', judgement: '' }
  ];
  const f = fixture({ page: 'schedule', data: { standardType: 'Unit',
    schedule: JSON.stringify({ requirements: [placeholder, ...requirements], comments: 'Keep marker comments' }) } });
  let autosaved = false;
  f.host.addEventListener('input', () => { autosaved = true; });
  await flush();
  const saved = JSON.parse(f.host.find(n => n.attrs.name === 'schedule').value);
  assert.deepEqual(saved.requirements, requirements);
  assert.equal(saved.comments, 'Keep marker comments');
  assert.equal(autosaved, true);
  assert.equal(f.host.find(n => n.attrs.id === 'moderation-schedule-0-requirement').value, requirements[0].requirement);
  assert.equal(f.host.all().filter(n => n.tag === 'button' && /^Remove requirement /.test(n.textContent)).length, 3);
  assert.ok(f.host.find(n => n.attrs.role === 'status' && n.textContent.includes('Template-only requirement rows removed')));
});
test('resource sections append multiple files, deduplicate selections and remove only the selected file', async () => {
  const f = fixture({ page: 'schedule' }); await flush();
  const choose = 'Choose Google Drive files for File Submission';
  f.chosen = { id: 'first_file_123' }; await f.click(choose);
  f.chosen = { id: 'second_file_123' }; await f.click(choose);
  const value = JSON.parse(f.saved.at(-1).schedule).fileSubmissionLink;
  assert.equal(value.split('\n').length, 2);
  await f.click(choose);
  assert.equal(JSON.parse(f.host.find(n => n.attrs.name === 'schedule').value).fileSubmissionLink, value);
  const panel = f.host.find(n => n.tag === 'h4' && n.textContent === 'File Submission').parentElement;
  const remove = panel.all().find(n => n.tag === 'button' && n.textContent === 'Remove');
  await remove.events.click();
  assert.equal(JSON.parse(f.saved.at(-1).schedule).fileSubmissionLink,
    'Existing assessment | https://drive.google.com/file/d/second_file_123/view');
  const reopened = fixture({ page: 'schedule', data: { schedule: JSON.stringify({ fileSubmissionLink: value }) } });
  await flush();
  assert.equal(reopened.host.all().filter(n => n.tag === 'a' && n.attrs.href?.includes('_file_123')).length, 2);
  assert.equal(f.calls.filter(call => ['upload', 'download', 'binary'].includes(call[0])).length, 0);
});
test('one selection saves twelve mixed-type files, deduplicates them and persists after reopening', async () => {
  const f = fixture({ page: 'schedule', data: { schedule: JSON.stringify({
    fileSubmissionLink: 'Existing PDF | https://drive.google.com/file/d/resource_file_0/view'
  }) } }); await flush();
  const names = ['Australia passengers.pdf', 'NZ Promotion.accdb', 'Relationship.png', 'Workbook.xlsx',
    'Instructions.docx', 'Program.py', 'Archive.zip', 'Query.pdf', 'Table.pdf', 'Report.pdf', 'Notes.txt', 'Presentation.pptx'];
  f.chosen = names.map((_, i) => ({ id: 'resource_file_' + i }));
  f.access.metadata = async id => ({
    id, name: names[Number(id.split('_').at(-1))],
    mimeType: 'application/octet-stream'
  });
  await f.click('Choose Google Drive files for File Submission');
  const value = JSON.parse(f.saved.at(-1).schedule).fileSubmissionLink;
  assert.equal(value.split('\n').length, 12);
  assert.ok(value.startsWith('Existing PDF | '));
  assert.match(value, /NZ Promotion\.accdb/);
  assert.match(value, /Relationship\.png/);
  assert.equal(f.calls.find(c => c[0] === 'chooseFiles')[1], true);
  assert.equal(f.calls.filter(c => ['upload', 'download', 'binary'].includes(c[0])).length, 0);
  const reopened = fixture({ page: 'schedule', data: { schedule: f.saved.at(-1).schedule } });
  await flush();
  assert.equal(reopened.host.all().filter(n => n.tag === 'a' && n.attrs.href?.includes('resource_file_')).length, 12);
  await f.click('Choose Google Drive files for File Submission');
  assert.equal(JSON.parse(f.host.find(n => n.attrs.name === 'schedule').value).fileSubmissionLink, value);
});
test('multi-file selection validates the whole batch before saving any links', async () => {
  for (const failure of ['folder', 'trashed', 'inaccessible', 'longName', 'totalLength']) {
    const original = 'Original | https://example.test/original';
    const f = fixture({ page: 'schedule', data: { schedule: JSON.stringify({ fileSubmissionLink: original }) } });
    await flush();
    f.chosen = Array.from({ length: failure === 'totalLength' ? 25 : 2 }, (_, i) => ({ id: 'batch_file_' + i }));
    f.access.metadata = async id => {
      if (id === 'batch_file_1' && failure === 'inaccessible') throw new Error('File is inaccessible.');
      return { id, name: failure === 'totalLength' ? 'x'.repeat(350) :
        id === 'batch_file_1' && failure === 'longName' ? 'x'.repeat(501) : 'Submission',
        trashed: id === 'batch_file_1' && failure === 'trashed',
        mimeType: id === 'batch_file_1' && failure === 'folder' ? 'application/vnd.google-apps.folder' : 'application/octet-stream' };
    };
    await f.click('Choose Google Drive files for File Submission');
    assert.equal(JSON.parse(f.host.find(n => n.attrs.name === 'schedule').value).fileSubmissionLink, original);
    assert.equal(f.saved.length, 0);
    assert.ok(f.host.find(n => n.attrs.role === 'alert' && n.textContent));
  }
});
test('schedule resources match the paper layout and hide legacy text boxes without removing their data', async () => {
  const f = fixture({ page: 'schedule', data: { schedule: JSON.stringify({ instructions: 'Keep old instructions', submissions: 'Keep old submissions' }) } }); await flush();
  const columns = f.host.find(n => n.attrs.class === 'moderation-resource-columns');
  assert.equal(columns.children.length, 2);
  assert.deepEqual(columns.children[0].children.map(n => n.children[0].textContent),
    ['Assessment Instructions & Schedule', 'Topic Brief']);
  assert.deepEqual(columns.children[1].children.map(n => n.children[0].textContent),
    ['Documentation Submission', 'File Submission']);
  assert.equal(f.host.find(n => n.attrs.id === 'moderation-schedule-instructions'), undefined);
  assert.equal(f.host.find(n => n.attrs.id === 'moderation-schedule-submissions'), undefined);
  assert.deepEqual(JSON.parse(f.host.find(n => n.attrs.name === 'schedule').value),
    { instructions: 'Keep old instructions', submissions: 'Keep old submissions' });
});
test('Tour Report controls are removed while previously saved links remain intact', async () => {
  const value = 'Saved report | https://example.test/report';
  const f = fixture({ page: 'schedule', data: { schedule: JSON.stringify({ tourReportLink: value }) } });
  await flush();
  assert.equal(f.host.find(n => n.textContent.includes('Task 2 - Tour Report')), undefined);
  assert.equal(JSON.parse(f.host.find(n => n.attrs.name === 'schedule').value).tourReportLink, value);
});
test('source materials automatically fill shared and existing individual schedules without overwriting chosen links', async () => {
  const source = '29785 Assessment Combined.pdf | https://drive.google.com/file/d/assessment_pdf_123/view\nTopic Brief.pdf | https://drive.google.com/file/d/topic_brief_123/view\nOther assessment | https://example.test/other';
  const shared = fixture({ page: 'schedule', data: { internal: JSON.stringify({ source }) } }); await flush();
  const saved = JSON.parse(shared.host.find(n => n.attrs.name === 'schedule').value);
  assert.equal(saved.assessmentInstructionsLink, source.split('\n')[0]);
  assert.equal(saved.topicBriefLink, source.split('\n')[1]);
  const child = fixture({ page: 'schedule', data: { parentRecord: record,
    schedule: JSON.stringify({ topicBriefLink: 'Chosen brief | https://example.test/chosen' }) },
    recordRequest: async () => ({ content: { internal: JSON.stringify({ source }) } }) });
  await flush();
  const childData = JSON.parse(child.host.find(n => n.attrs.name === 'schedule').value);
  assert.equal(childData.assessmentInstructionsLink, saved.assessmentInstructionsLink);
  assert.equal(childData.topicBriefLink, 'Chosen brief | https://example.test/chosen');
  assert.ok(child.host.find(n => n.tag === 'a' && n.attrs.href === 'https://drive.google.com/file/d/assessment_pdf_123/view'));
});
test('new individual schedules inherit source links and unsafe or plain source lines are not guessed', async () => {
  const source = 'Plain text\nUnsafe | javascript:alert(1)\nTopic_Brief.pdf | https://example.test/brief\nFirst assessment.pdf | https://example.test/assessment\nSecond assessment | https://example.test/second';
  const f = fixture({ page: 'internal', data: { internal: JSON.stringify({ source, samples: [{ student: 'Student A' }] }) } });
  await flush(); await f.click('Create / open marking schedule for entry 1');
  const schedule = JSON.parse(f.calls.find(call => call[0] === 'mutate')[2].content.schedule);
  assert.equal(schedule.assessmentInstructionsLink, 'First assessment.pdf | https://example.test/assessment');
  assert.equal(schedule.topicBriefLink, 'Topic_Brief.pdf | https://example.test/brief');
});
test('resource selectors remain enabled after importing an existing marking schedule', async () => {
  const f = fixture({ page: 'schedule', importResult: { common: {}, document: { instructions: 'Imported notes' }, warning: 'Review import' } });
  await flush(); await f.click('Choose existing document and import its form data');
  await f.click('Choose Google Drive files for Topic Brief');
  assert.ok(JSON.parse(f.saved.at(-1).schedule).topicBriefLink);
  assert.equal(JSON.parse(f.saved.at(-1).schedule).instructions, 'Imported notes');
});
test('backlog link-only refresh fills missing links without overwriting marking data or existing selections', async () => {
  const existing = 'Saved brief | https://docs.google.com/document/d/existing_brief/edit';
  const imported = 'Assessment Instructions & Schedule | https://docs.google.com/document/d/imported_instructions/edit';
  const f = fixture({ page: 'schedule', data: {
    schedule: JSON.stringify({ grade: 'E', markerComments: 'Keep marking', topicBriefLink: existing }),
    driveDocuments: JSON.stringify({ schedule: { id: 'schedule_doc_123', name: 'Old schedule', mimeType: 'application/vnd.google-apps.document' } })
  }, importResult: { common: { studentName: 'Different student' }, document: {
    grade: 'N', markerComments: 'Do not import', assessmentInstructionsLink: imported,
    topicBriefLink: 'Different brief | https://example.test/brief'
  }, warning: 'Review links' } });
  await flush(); await f.click('Import missing resource links from linked schedule');
  const saved = JSON.parse(f.saved.at(-1).schedule);
  assert.equal(saved.grade, 'E'); assert.equal(saved.markerComments, 'Keep marking');
  assert.equal(saved.topicBriefLink, existing); assert.equal(saved.assessmentInstructionsLink, imported);
  assert.notEqual(f.saved.at(-1).studentName, 'Different student');
  assert.equal(f.calls.filter(call => ['choose', 'upload'].includes(call[0])).length, 0);
  assert.ok(f.host.find(n => n.tag === 'a' && n.attrs.href === imported.split(' | ')[1]));
  assert.ok(f.host.find(n => n.tag === 'button' && n.textContent === 'Choose Google Drive files for Topic Brief' && !n.disabled));
});
test('link-only refresh explains missing source and reports save failures', async () => {
  const missing = fixture({ page: 'schedule' }); await flush();
  await missing.click('Import missing resource links from linked schedule');
  assert.ok(missing.host.find(n => n.attrs.role === 'alert' && n.textContent.includes('existing marking schedule')));
  assert.equal(missing.calls.filter(call => call[0] === 'download').length, 0);
  const failed = fixture({ page: 'schedule', saveFails: true }); await flush();
  await failed.click('Import missing resource links from linked schedule');
  assert.ok(failed.host.find(n => n.attrs.role === 'alert' && n.textContent.includes('not saved')));
});
test('internal workflow puts strategic entries between critique and verification; each creates a separate template-based schedule', async () => {
  const f = fixture({ page: 'internal', data: { schedule: '{"instructions":"Shared schedule"}',
    internal: JSON.stringify({ samples: [{ student: 'Learner One' }, { student: 'Learner Two' }] }) } });
  await flush();
  const headings = f.host.all().filter(child => child.tag === 'h3').map(child => child.textContent);
  assert.ok(headings.indexOf('B. Pre-assessment critique') < headings.indexOf('Strategic selection of work for verification'));
  assert.ok(headings.indexOf('Strategic selection of work for verification') < headings.indexOf('C. Verify teacher judgements'));
  assert.ok(headings.indexOf('D. Results, retention and review') < headings.indexOf('Supporting information for this stage'));
  await f.click('Create / open marking schedule for entry 1');
  const first = f.calls.find(call => call[0] === 'mutate');
  const id = first[1].split('/').at(-1);
  assert.equal(first[2].content.studentName, 'Learner One');
  assert.equal(first[2].content.parentRecord, record);
  assert.equal(first[2].content.standardNumber, '99999');
  assert.equal(first[2].content.folderId, 'folder_id_123');
  assert.ok(f.calls.some(call => call[0] === 'studentFolder' && call[1] === 'standard_folder_123' && call[2] === 0));
  assert.equal(first[2].content.schedule, '{"instructions":"Shared schedule"}', 'individual form starts with reusable template instructions');
  assert.equal(JSON.parse(f.saved.at(-1).internal).samples[0].markingScheduleRecord, id);
  assert.deepEqual(f.navigation.at(-1), [id, 'schedule']);
  await f.click('Create / open marking schedule for entry 2');
  const second = f.calls.filter(call => call[0] === 'mutate')[1];
  assert.notEqual(second[1], first[1]);
  assert.equal(second[2].content.studentName, 'Learner Two');
  assert.ok(f.calls.some(call => call[0] === 'studentFolder' && call[2] === 1));
});
test('individual schedules reopen without recreation and preserve record metadata without duplicate navigation or explanatory text', async () => {
  const id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const f = fixture({ page: 'internal', data: { internal: JSON.stringify({ samples: [{ student: 'Learner', markingScheduleRecord: id }] }) },
    recordRequest: async () => ({ revision: 1, content: { parentRecord: record } }) });
  await flush(); await f.click('Create / open marking schedule for entry 1');
  assert.equal(f.calls.filter(call => call[0] === 'mutate').length, 0);
  assert.deepEqual(f.navigation[0], [id, 'schedule']);
  const child = fixture({ page: 'schedule', id, data: { parentRecord: record, studentName: 'Learner' },
    recordRequest: async () => ({ content: { internal: JSON.stringify({ samples: [{ student: 'Learner', markingScheduleRecord: id }] }) } }) });
  await flush();
  assert.equal(child.host.find(n => n.attrs.class === 'moderation-navigation'), undefined);
  assert.equal(child.host.find(n => n.textContent.startsWith('Individual marking schedule for ')), undefined);
  const tabs = child.host.find(n => n.attrs.class === 'moderation-tabs');
  await tabs.children[1].events.click();
  assert.deepEqual(child.navigation[0], ['', 'internal']);
  assert.equal(child.host.find(n => n.attrs.name === 'parentRecord').value, record);
  await child.click('Create / update Google Drive document');
  assert.equal(child.saved.at(-1).parentRecord, record);
  assert.equal(child.calls.find(call => call[0] === 'upload')[1].folderId, 'student_folder_0');
});
test('preparing parent folders creates anonymous folders for all entries; child preparation resolves entry position, not initials', async () => {
  const samples = [{ student: 'Student A - TV' }, { student: 'Student B - XY', markingScheduleRecord: record }];
  const parent = fixture({ page: 'overview', data: { internal: JSON.stringify({ samples }) } });
  await flush(); await parent.click('Prepare level / standard folders');
  assert.deepEqual(parent.calls.filter(call => call[0] === 'studentFolder').map(call => call.slice(1)), [
    ['standard_folder_123', 0], ['standard_folder_123', 1]
  ]);
  const child = fixture({ page: 'schedule', data: { parentRecord: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', studentName: 'Student B - XY' },
    recordRequest: async () => ({ content: { internal: JSON.stringify({ samples }) } }) });
  await flush(); await child.click('Create / update Google Drive document');
  assert.equal(child.calls.find(call => call[0] === 'upload')[1].folderId, 'student_folder_1');
  assert.equal(JSON.parse(child.saved.at(-1).standardFolder).id, 'standard_folder_123');
  assert.equal(JSON.parse(child.saved.at(-1).internal).retentionLocation, 'Private assessments / Level 3 / 99999\nhttps://drive.google.com/drive/folders/standard_folder_123');
});
test('existing individual Drive documents update in place without being moved, and unmatched entries cannot create new documents', async () => {
  const f = fixture({ page: 'schedule', data: { parentRecord: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    driveDocuments: JSON.stringify({ schedule: { id: 'existing_document_123', name: 'Existing', mimeType: 'application/vnd.google-apps.document' } }) } });
  await flush(); await f.click('Create / update Google Drive document');
  assert.equal(f.calls.find(call => call[0] === 'upload')[1].id, 'existing_document_123');
  assert.equal(f.calls.filter(call => call[0] === 'studentFolder').length, 0);
  const unmatched = fixture({ page: 'schedule', data: { parentRecord: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' } });
  await flush(); await unmatched.click('Create / update Google Drive document');
  assert.equal(unmatched.calls.filter(call => call[0] === 'upload').length, 0);
  assert.ok(unmatched.host.find(n => n.attrs.role === 'alert' && n.textContent.includes('exactly one entry')));
});
test('individual schedule failures preserve a reserved ID for retry and never navigate on failed save', async () => {
  const f = fixture({ page: 'internal', data: { internal: JSON.stringify({ samples: [{ student: 'Learner' }] }) },
    mutation: async () => { throw new Error('Creation unavailable'); } });
  await flush(); await f.click('Create / open marking schedule for entry 1');
  assert.equal(f.navigation.length, 0);
  const id = JSON.parse(f.saved.at(-1).internal).samples[0].markingScheduleRecord;
  await f.click('Create / open marking schedule for entry 1');
  assert.ok(f.calls.filter(call => call[0] === 'mutate').every(call => call[1].endsWith(id)));
  assert.ok(f.host.find(n => n.attrs.role === 'alert' && n.textContent.includes('Creation unavailable')));
  const failed = fixture({ page: 'internal', saveFails: true, data: { internal: '{"samples":[{"student":"Learner"}]}' } });
  await flush(); await failed.click('Create / open marking schedule for entry 1');
  assert.equal(failed.calls.filter(call => call[0] === 'mutate').length, 0);
  const blank = fixture({ page: 'internal', data: { internal: '{"samples":[{}]}' } });
  await flush(); await blank.click('Create / open marking schedule for entry 1');
  assert.equal(blank.navigation.length, 0);
  assert.ok(blank.host.find(n => n.attrs.role === 'alert' && n.textContent.includes('student name')));
});
test('reimporting paper samples keeps uniquely matched individual schedule links', async () => {
  const id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const f = fixture({ page: 'internal', data: { internal: JSON.stringify({ randomInitialsA: 'FH',
    samples: [{ student: 'Student A - FH', randomSlot: 'A', markingScheduleRecord: id }] }) },
    importResult: { common: {}, document: { samples: [{ student: 'Student A - FH', markerGrade: 'A' }] }, warning: 'Review import' } });
  await flush(); await f.click('Choose existing document and import its form data');
  const saved = JSON.parse(f.saved.at(-1).internal);
  assert.equal(saved.samples[0].markingScheduleRecord, id);
  assert.equal(saved.samples[0].randomSlot, 'A');
  assert.equal(saved.randomInitialsA, 'FH');
});
test('NZQA suggestions require explicit selection, confirm replacements and never tick review checks', async () => {
  const reportUrl = 'https://www2.nzqa.govt.nz/ncea/subjects/select-subject/biology/nmr/';
  const specUrl = 'https://www.nzqa.govt.nz/nqfdocs/ncea-resource/specifications/2026/99999-spc-2026.pdf';
  const result = { number: '99999', year: 2026, checkedAt: '2026-10-24T20:00:00Z', warnings: [], suggestions: [
    { target: 'moderatorReportLink', url: reportUrl, title: 'Biology report', kind: 'Moderator report', year: '2025', scope: 'Mentions standard 99999' },
    { target: 'conditionsLink', url: specUrl, title: 'Assessment specifications 2026', kind: 'Assessment specifications', year: '2026', scope: 'PDF mentions standard 99999' }
  ] };
  let fail = false;
  const f = fixture({ page: 'internal', data: { internal: JSON.stringify({ moderatorReport: 'No', conditions: 'No', moderatorReportLink: 'https://example.test/manual' }) },
    referenceRequest: async () => { if (fail) throw new Error('NZQA unavailable'); return result; } });
  await flush();
  const saved = () => JSON.parse(f.host.find(child => child.attrs.name === 'internal').value);
  const reference = key => f.host.find(child => child.attrs.id === 'moderation-internal-' + key).parentElement.parentElement;
  const click = async (row, label) => row.children.find(child => child.tag === 'button' && child.textContent === label).events.click();
  const reportRow = reference('moderatorReportLink');
  await click(reportRow, 'Find NZQA references');
  assert.equal(saved().moderatorReportLink, 'https://example.test/manual', 'lookup preserves manual link');
  const use = reportRow.find(child => child.tag === 'button' && child.textContent === 'Use this link');
  assert.ok(use);
  await use.events.click();
  assert.equal(saved().moderatorReportLink, reportUrl);
  assert.equal(saved().moderatorReport, 'No');
  assert.ok(f.calls.some(call => call[0] === 'confirm' && call[1].includes('Replace the existing reference')));
  const conditionsRow = reference('conditionsLink');
  await click(conditionsRow, 'Find NZQA references');
  await conditionsRow.find(child => child.tag === 'button' && child.textContent === 'Use this link').events.click();
  assert.equal(saved().conditionsLink, specUrl);
  assert.equal(saved().conditions, 'No');
  fail = true;
  await click(conditionsRow, 'Find NZQA references');
  assert.ok(conditionsRow.find(child => child.attrs.role === 'alert' && child.textContent.includes('NZQA unavailable')));
  assert.equal(saved().conditionsLink, specUrl);
});
test('previous critique shortcut sets exactly eight lower checks, autosaves once and allows individual overrides', async () => {
  const initial = { previousCritique: 'Yes', moderatorReport: 'No', conditions: 'Not applicable',
    externalFeedback: '', context: 'No', allGrades: 'Not applicable', previousCritiqueLink: 'https://example.test/critique' };
  const f = fixture({ page: 'internal', displayName: '', data: { internal: JSON.stringify(initial) } }); await flush();
  const control = key => f.host.find(child => child.attrs.id === 'moderation-internal-' + key);
  const saved = () => JSON.parse(f.host.find(child => child.attrs.name === 'internal').value);
  assert.deepEqual(saved(), initial, 'opening an existing Yes does not overwrite other answers');
  let changes = 0;
  f.host.addEventListener('input', () => changes++);
  control('previousCritique').checked = true; control('previousCritique').events.change();
  assert.equal(changes, 1, 'one coherent autosave event');
  for (const [key] of schema.critique.slice(4)) {
    assert.equal(saved()[key], 'Yes', key);
    assert.equal(control(key).checked, true);
    assert.equal(control(key).indeterminate, false);
    assert.equal(f.host.find(child => child.attrs.id === 'moderation-internal-' + key + '-answer').textContent, 'Yes');
  }
  for (const key of ['moderatorReport', 'conditions', 'externalFeedback', 'previousCritiqueLink']) assert.equal(saved()[key], initial[key]);
  control('context').checked = false; control('context').events.change();
  assert.equal(saved().context, 'No', 'individual override remains available');
  control('previousCritique').checked = false; control('previousCritique').events.change();
  assert.equal(saved().context, 'No');
  assert.equal(saved().allGrades, 'Yes', 'unticking parent does not clear lower checks');
  assert.equal(saved().previousCritique, 'No');
});
test('critique reference boxes sit under their statements, autosave and safely open links; redundant summary is absent', async () => {
  const f = fixture({ page: 'internal', data: { standardNumber: '14998', standardTitle: 'Old imported title',
    internal: JSON.stringify({ moderatorReportLink: 'https://example.test/report' }) } });
  await flush();
  assert.equal(f.host.find(child => child.tag === 'p' && child.textContent === '14998 · Old imported title'), undefined);
  for (const key of ['moderatorReport', 'conditions', 'externalFeedback', 'previousCritique']) {
    const control = f.host.find(child => child.attrs.id === 'moderation-internal-' + key + 'Link');
    assert.equal(control.type, 'url');
    assert.equal(control.parentElement.parentElement.tag, 'th');
    const link = control.parentElement.parentElement.children.find(child => child.tag === 'a');
    control.value = 'https://example.test/' + key; control.events.input();
    assert.equal(JSON.parse(f.host.find(child => child.attrs.name === 'internal').value)[key + 'Link'], control.value);
    assert.equal(link.attrs.href, control.value);
    assert.equal(link.hidden, false);
    assert.equal(link.attrs.rel, 'noopener noreferrer');
    control.value = 'javascript:alert(1)'; control.events.input();
    assert.equal(link.hidden, true);
    assert.equal(link.attrs.href, undefined);
    control.value = ''; control.events.input();
    assert.equal(link.hidden, true);
  }
});
test('Teacher in Charge lists frequent staff above a divider and repeats them in surname order; selection triggers autosave', async () => {
  const staff = [{ id: '1', name: 'Zoe Adams (ZAD)', uses: 1 }, { id: '2', name: 'Amy Jones (AJO)', uses: 4 },
    { id: '3', name: 'Ben Smith (BSM)', uses: 0 }];
  const f = fixture({ staff, data: { teacher: 'Zoe Adams (ZAD)' } }); await flush();
  const select = f.host.find(child => child.attrs.id === 'moderation-teacher');
  assert.equal(select.tag, 'select'); assert.equal(select.value, staff[0].name);
  const groups = select.children.filter(child => child.tag === 'optgroup');
  assert.deepEqual(groups.map(group => group.attrs.label), ['Most used by me', 'All current staff']);
  assert.deepEqual(groups[0].children.map(option => option.value), [staff[1].name, staff[0].name]);
  assert.deepEqual(groups[1].children.map(option => option.value), staff.map(person => person.name));
  assert.equal(select.children[2].tag, 'hr');
  const inputs = [];
  f.host.addEventListener('input', () => inputs.push(f.host.find(child => child.attrs.name === 'teacher').value));
  select.value = staff[1].name; select.events.change();
  assert.deepEqual(inputs, [staff[1].name]);
  assert.equal(f.host.find(child => child.attrs.name === 'teacher').value, staff[1].name);
});
test('record field labels and order use department, subject, course code and singular Assessor with name default', async () => {
  const f = fixture(); await flush();
  const labels = f.host.all().filter(child => child.tag === 'label' && child.attrs.for !== 'moderation-course-library').map(child => child.textContent);
  assert.deepEqual(labels.slice(0, 11), ['Assessment / record title', 'Standard number', 'Standard title', 'Level', 'Version', 'Credits',
    'Faculty / Department', 'Teacher in charge', 'Subject', 'Course Code', 'Assessor']);
  assert.equal(f.host.find(child => child.attrs.id === 'moderation-assessors').value, 'Synthetic Teacher');
  assert.equal(f.host.find(child => child.attrs.name === 'assessors').value, 'Synthetic Teacher');
  const saved = fixture({ data: { assessors: 'Recorded assessor' } }); await flush();
  assert.equal(saved.host.find(child => child.attrs.name === 'assessors').value, 'Recorded assessor');
  const email = fixture({ displayName: 'teacher@example.test' }); await flush();
  assert.equal(email.host.find(child => child.attrs.name === 'assessors').value, '');
});
test('empty and incorrect saved versions reconcile to the PDF; level/version share one lookup', async () => {
  const f = fixture(); await flush();
  assert.equal(f.host.find(child => child.attrs.id === 'moderation-version').value, '2');
  assert.equal(f.host.find(child => child.attrs.name === 'version').value, '2');
  assert.equal(f.calls.filter(call => call[0] === 'request' && call[1] === 'standards/99999/details').length, 1);
  const saved = fixture({ data: { version: '1', level: '3' } }); await flush();
  assert.equal(saved.host.find(child => child.attrs.name === 'version').value, '2');
  assert.equal(saved.host.find(child => child.attrs.id === 'moderation-version').value, '2');
  assert.equal(saved.calls.filter(call => call[1] === 'standards/99999/details').length, 1);
});
test('imported versions never replace the NZQA version in any form', async () => {
  for (const page of ['internal', 'schedule', 'feedback', 'coversheet']) {
    const f = fixture({ page, data: { version: '5' },
      importResult: { common: { standardNumber: '99999', version: '7' }, document: {}, warning: '' } });
    await flush();
    assert.equal(f.host.find(n => n.attrs.name === 'version').value, '2');
    await f.click('Choose existing document and import its form data');
    assert.equal(f.saved.at(-1).version, '2');
    if (page === 'feedback') {
      const version = f.host.find(n => n.attrs.id === 'moderation-feedback-details-version');
      assert.equal(version.value, '2'); assert.equal(version.readOnly, true);
    }
  }
});
test('failed PDF version verification preserves saved data and prevents all document syncs', async () => {
  for (const page of ['internal', 'schedule', 'feedback', 'coversheet']) {
    const f = fixture({ page, data: { version: '5' }, standardRequest: async () => { throw new Error('NZQA unavailable'); } });
    await flush();
    await f.click('Create / update Google Drive document');
    assert.equal(f.host.find(n => n.attrs.name === 'version').value, '5');
    assert.equal(f.calls.filter(c => ['upload', 'binary'].includes(c[0])).length, 0);
    assert.ok(f.host.find(n => n.attrs.role === 'alert' && n.textContent.includes('NZQA unavailable')));
  }
});
test('record creation does not write database records when folder preparation or PDF metadata fails', async () => {
  const f = fixture({ id: '' }); await flush();
  f.access.ensureTopicStandardFolder = async () => { throw new Error('Drive folders unavailable'); };
  f.host.find(child => child.attrs.id === 'moderation-new-standard').value = '99999';
  await f.click('Create moderation record');
  assert.equal(f.calls.some(call => call[0] === 'mutate'), false);
  assert.ok(f.host.find(child => child.attrs.role === 'alert' && child.textContent === 'Drive folders unavailable'));
  const noFolder = fixture({ id: '', data: { folderId: '' } }); await flush();
  noFolder.host.find(child => child.attrs.id === 'moderation-new-standard').value = '99999';
  await noFolder.click('Create moderation record');
  assert.equal(noFolder.calls.some(call => call[0] === 'mutate'), false);
  assert.equal(noFolder.calls.some(call => call[0] === 'authorize'), false);
});
test('record creation rejects standards assigned to topics removed from the current year', async () => {
  const f = fixture({ id: '', recordRequest: async () => ({ content: { folderTopics: '["Spreadsheet"]' }, revision: 1 }) });
  await flush();
  f.host.find(child => child.attrs.id === 'moderation-new-standard').value = '99999';
  await f.click('Create moderation record');
  assert.equal(f.calls.some(call => ['authorize', 'topicFolder', 'mutate'].includes(call[0])), false);
  assert.ok(f.host.find(child => child.attrs.role === 'alert' && child.textContent.includes('not configured for the current year')));
});
test('record creation uses the synced topic folder when a standard has no assigned topic', async () => {
  const links = topics => JSON.stringify({ root: 'folder_id_123', year: { id: 'year_2026', name: '2026' }, topics });
  const holder = standards => ({ name: 'Word Processing', id: 'topic_wp', standards });
  const create = async folderLinks => {
    const f = fixture({ id: '', selectedTopic: '', recordRequest: async () => ({ content: {
      folderTopics: '["Database","Word Processing"]', folderLinks }, revision: 1 }) }); await flush();
    f.host.find(child => child.attrs.id === 'moderation-new-standard').value = '99999';
    await f.click('Create moderation record'); return f;
  };
  const f = await create(links([{ name: 'Database', id: 'topic_db', standards: [] }, holder([{ id: 'std', level: '3', number: '99999' }])]));
  assert.equal(f.calls.find(call => call[0] === 'mutate')[2].content.topic, 'Word Processing');
  for (const folderLinks of [links([holder([])]), links([holder([{ id: 'a', level: '3', number: '99999' }]),
    { name: 'Database', id: 'topic_db', standards: [{ id: 'b', level: '3', number: '99999' }] }])]) {
    const missing = await create(folderLinks);
    assert.equal(missing.calls.some(call => ['authorize', 'mutate'].includes(call[0])), false);
    assert.ok(missing.host.find(child => child.attrs.role === 'alert' && child.textContent.includes('Setup Assessment')));
  }
});test('staff loading preserves imported names, reports failures and allows retry without overwriting changes', async () => {
  let fail = true, resolve;
  const f = fixture({ data: { teacher: 'Former teacher' }, staffRequest: () => {
    if (fail) throw new Error('Staff service unavailable');
    return new Promise(done => { resolve = done; });
  } }); await flush();
  const select = f.host.find(child => child.attrs.id === 'moderation-teacher');
  const status = f.host.find(child => child.attrs.id === 'moderation-teacher-status');
  assert.equal(select.value, 'Former teacher');
  assert.equal(status.attrs.role, 'alert'); assert.match(status.textContent, /unavailable/);
  fail = false;
  const loading = f.click('Refresh staff list');
  assert.equal(select.disabled, true);
  f.host.find(child => child.attrs.name === 'teacher').value = 'Newly imported teacher';
  resolve({ staff: [{ id: '1', name: 'Current teacher', uses: 0 }], departments: [] }); await loading;
  assert.equal(select.value, 'Newly imported teacher');
  assert.ok(select.children.some(child => child.value === 'Newly imported teacher'));
  assert.equal(select.disabled, false); assert.equal(status.attrs.role, 'status');
  assert.equal(select.children.some(child => child.tag === 'hr'), false);
});
test('empty Kamar staff list explains how to fix it and leaves the saved teacher unchanged', async () => {
  const f = fixture({ data: { teacher: 'Saved teacher' } }); await flush();
  assert.equal(f.host.find(child => child.attrs.id === 'moderation-teacher').value, 'Saved teacher');
  assert.match(f.host.find(child => child.attrs.id === 'moderation-teacher-status').textContent, /No current staff.*Kamar Uploader/);
});
test('department selection fills the leader, permits override and preserves saved student data without a name control', async () => {
  const departments = [{ name: 'Science', teacher: 'Rachel Wastney (RWA)', leaders: [] },
    { name: 'Technology', teacher: 'Vanessa Pringle (VPR)', leaders: [] }, { name: 'Unknown leadership', teacher: '', leaders: [] }];
  const f = fixture({ departments, data: { studentName: 'Existing learner', studentId: 'TEST-001', department: 'Science', teacher: 'My override' } }); await flush();
  const department = f.host.find(child => child.attrs.id === 'moderation-department');
  const teacher = f.host.find(child => child.attrs.id === 'moderation-teacher');
  assert.equal(department.tag, 'select'); assert.equal(department.value, 'Science');
  assert.equal(teacher.value, 'My override');
  assert.equal(f.host.find(child => child.attrs.id === 'moderation-studentName'), undefined);
  assert.equal(f.host.find(child => child.attrs.name === 'studentName').value, 'Existing learner');
  assert.equal(f.host.find(child => child.attrs.id === 'moderation-studentId'), undefined);
  assert.equal(f.host.find(child => child.attrs.name === 'studentId').value, 'TEST-001');
  const changes = [];
  f.host.addEventListener('input', () => changes.push(true));
  department.value = 'Technology'; department.events.change();
  assert.equal(teacher.value, 'Vanessa Pringle (VPR)');
  assert.equal(f.host.find(child => child.attrs.name === 'teacher').value, 'Vanessa Pringle (VPR)');
  assert.equal(f.host.find(child => child.attrs.name === 'department').value, 'Technology');
  assert.equal(changes.length, 2);
  department.value = 'Unknown leadership'; department.events.change();
  assert.equal(teacher.value, 'Vanessa Pringle (VPR)');
  assert.match(f.host.find(child => child.attrs.id === 'moderation-department-status').textContent, /No single available leader/);
});
test('saved department prepopulates only an empty teacher; saved unknown departments survive refresh', async () => {
  const f = fixture({ departments: [{ name: 'Technology', teacher: 'Vanessa Pringle (VPR)', leaders: [] }],
    data: { department: 'Technology' } }); await flush();
  assert.equal(f.host.find(child => child.attrs.name === 'teacher').value, 'Vanessa Pringle (VPR)');
  const unknown = fixture({ data: { department: 'Former department', teacher: 'Saved teacher' } }); await flush();
  assert.equal(unknown.host.find(child => child.attrs.id === 'moderation-department').value, 'Former department');
  assert.equal(unknown.host.find(child => child.attrs.name === 'teacher').value, 'Saved teacher');
});
test('existing records fill an empty level from NZQA and expose retry on failures', async () => {
  const f = fixture({ data: { standardNumber: '99999' } }); await flush();
  const level = f.host.find(child => child.attrs.id === 'moderation-level');
  assert.equal(level.readOnly, true); assert.equal(level.value, '3');
  assert.equal(f.host.find(child => child.attrs.name === 'level').value, '3');
  let failed = true;
  const retry = fixture({ data: { standardNumber: '99999' }, standardRequest: () => {
    if (failed) throw new Error('NZQA unavailable');
    return { number: '99999', level: '2', version: '2' };
  } }); await flush();
  assert.equal(retry.host.find(child => child.attrs.name === 'level').value, '');
  assert.ok(retry.host.find(child => child.attrs.role === 'alert' && child.textContent === 'NZQA unavailable'));
  failed = false; await retry.click('Retry standard level');
  assert.equal(retry.host.find(child => child.attrs.name === 'level').value, '2');
});
test('old My Standards without levels are resolved before creating a moderation record', async () => {
  const f = fixture({ id: '', selectedLevel: '' }); await flush();
  const standard = f.host.find(child => child.tag === 'select');
  standard.value = '99999'; await f.click('Create moderation record');
  const mutation = f.calls.find(call => call[0] === 'mutate');
  assert.equal(mutation[2].content.level, '3'); assert.equal(mutation[2].content.version, '2');
  const failed = fixture({ id: '', selectedLevel: '', standardRequest: () => ({}) }); await flush();
  failed.host.find(child => child.tag === 'select').value = '99999';
  await failed.click('Create moderation record');
  assert.equal(failed.calls.some(call => call[0] === 'mutate'), false);
  assert.ok(failed.host.find(child => child.attrs.role === 'alert' && child.textContent.includes('NZQA did not return the level')));
});
test('moderation hub selects a teacher-specific folder and creates a database record from My Standards', async () => {
  const setup = fixture({ id: '', setupOnly: true }); await flush();
  setup.chosen = { id: 'folder_id_123' };
  await setup.click('Choose my Assessment / Moderation folder');
  assert.equal(setup.saved.at(-1).folderId, 'folder_id_123');
  assert.equal(setup.calls.some(call => ['folders', 'yearLinks'].includes(call[0])), false,
    'choosing the root folder does not create any hierarchy folders');
  assert.equal(setup.host.find(n => n.textContent === 'Create moderation record'), undefined);
  assert.equal(setup.host.find(n => n.attrs.class === 'moderation-tabs'), undefined);
  assert.equal(setup.host.all().filter(n => n.attrs.name).length, 0, 'personal setup fields cannot enter school-wide form submissions');
  const f = fixture({ id: '' }); await flush();
  assert.equal(f.host.find(n => n.textContent === 'Choose my Assessment / Moderation folder'), undefined);
  assert.equal(f.host.find(child => child.attrs.id === 'moderation-new-title'), undefined);
  await f.click('Create moderation record');
  assert.equal(f.calls.some(([action]) => action === 'mutate'), false, 'a standard must be chosen');
  f.host.find(child => child.attrs['aria-label'] === 'Use a standard from My Standards').value = '99999';
  await f.click('Create moderation record');
  const mutation = f.calls.find(([action]) => action === 'mutate');
  assert.match(mutation[1], /^2026\/moderation\/[0-9a-f-]+$/);
  assert.equal(mutation[2].content.subject, 'Biology');
  assert.equal(mutation[2].content.standardNumber, '99999');
  assert.equal(mutation[2].content.title, '99999 — Example Biology standard');
  assert.equal(mutation[2].content.folderId, 'folder_id_123');
  assert.equal(mutation[2].content.topic, 'Database');
  assert.equal(mutation[2].content.assessors, 'Synthetic Teacher');
  assert.ok(f.calls.some(call => call[0] === 'topicFolder' && call[1] === 'folder_id_123' && call[2] === 2026 && call[3] === 'Database'));
  assert.ok(f.calls.some(call => call[0] === 'topicStandardFolder' && call[1] === 'topic_folder_123' && call[2] === '3' && call[3] === '99999'));
  assert.equal(JSON.parse(mutation[2].content.internal).retentionLocation,
    'Private assessments / 2026 / Database / Level 3 - 99999\nhttps://drive.google.com/drive/folders/standard_folder_123');
  assert.equal(mutation[2].revision, 0);
  assert.equal(f.navigation[0][1], 'overview');
});
test('separate document forms retain other forms and serialize editable evidence and supporting notes', async () => {
  const f = fixture({ page: 'schedule', data: { feedback: JSON.stringify({ feedback: 'Keep this feedback' }) } });
  await flush();
  const achieved = f.host.find(child => child.attrs.id === 'moderation-schedule-achieved');
  achieved.value = 'Biology achievement requirement'; achieved.events.input();
  await f.click('Add requirement');
  const evidence = f.host.find(child => child.attrs.id === 'moderation-schedule-0-evidence');
  evidence.value = 'Synthetic evidence'; evidence.events.input();
  const notes = f.host.find(child => child.attrs.id === 'moderation-schedule-notes');
  notes.value = 'Evidence link notes'; notes.events.input();
  await f.click('Create / update Google Drive document');
  const uploaded = f.calls.find(([action]) => action === 'upload');
  assert.equal(uploaded[1].id, undefined, 'first save creates a file');
  assert.equal(uploaded[1].folderId, 'standard_folder_123');
  assert.equal(uploaded[1].properties.plannerRecord, record);
  assert.deepEqual(JSON.parse(f.saved.at(-1).feedback), { feedback: 'Keep this feedback',
    markingScheduleLink: 'Marking Schedule | https://drive.google.com/file/d/pdf_document_123/view' });
  const saved = JSON.parse(f.saved.at(-1).schedule);
  assert.equal(saved.requirements[0].evidence, 'Synthetic evidence');
  assert.equal(saved.notes, 'Evidence link notes');
  assert.equal(JSON.parse(f.saved.at(-1).driveDocuments).schedule.id, 'document_id_123');
  assert.equal(f.host.children[0].inert, false);
  await f.click('Create / update Google Drive document');
  assert.equal(f.calls.filter(([action]) => action === 'upload').at(-1)[1].id, 'document_id_123', 'later saves update the linked file');
});
test('existing document import fills database forms and requires a separate explicit Drive update', async () => {
  const f = fixture({ page: 'feedback' }); await flush();
  await f.click('Choose existing document and import its form data');
  assert.equal(f.saved.at(-1).studentName, 'Synthetic learner');
  assert.equal(JSON.parse(f.saved.at(-1).feedback).feedback, 'Imported comment');
  assert.equal(JSON.parse(f.saved.at(-1).driveDocuments).feedback.id, 'document_id_123');
  assert.equal(f.calls.filter(([action]) => action === 'upload').length, 0);
  assert.equal(f.host.find(child => child.attrs.id === 'moderation-feedback-feedback'), undefined, 'legacy comments stay stored, not displayed');
  assert.equal(f.host.find(child => child.attrs.id === 'moderation-feedback-details-studentName').value, 'Synthetic learner');
  assert.ok(f.host.find(child => child.textContent.includes('Future syncs will update')));
});
test('failed database save and missing Drive files never silently create a new document', async () => {
  const failed = fixture({ page: 'feedback', saveFails: true }); await flush();
  await failed.click('Create / update Google Drive document');
  assert.equal(failed.calls.filter(([action]) => action === 'upload').length, 0);
  assert.ok(failed.host.find(child => child.attrs.role === 'alert' && /not saved/.test(child.textContent)));
  const missing = fixture({ page: 'feedback', data: { driveDocuments: JSON.stringify({
    feedback: { id: 'document_id_123', name: 'Missing file', mimeType: 'application/vnd.google-apps.document' }
  }) } });
  await flush(); missing.missing = true;
  await missing.click('Create / update Google Drive document');
  assert.equal(missing.calls.filter(([action]) => action === 'upload').length, 0);
  assert.ok(missing.host.find(child => child.attrs.role === 'alert' && /missing/.test(child.textContent)));
});

test('source of materials tick boxes autosave and a compact source box has an assessment Drive chooser beside it', async () => {
  const f = fixture({ page: 'internal', data: { internal: JSON.stringify({ sourceTypes: 'NZQA', source: 'Existing note' }) } });
  await flush();
  const box = option => f.host.find(child => child.attrs.id === 'moderation-internal-sourceTypes-' + option);
  assert.equal(box('nzqa').checked, true);
  assert.equal(box('commercial').checked, false);
  assert.ok(box('subject-association'));
  box('commercial').checked = true; box('commercial').events.change();
  assert.equal(JSON.parse(f.host.find(child => child.attrs.name === 'internal').value).sourceTypes, 'Commercial, NZQA');
  const source = f.host.find(child => child.attrs.id === 'moderation-internal-source');
  assert.equal(source.rows, 2);
  assert.equal(source.value, 'Existing note');
  const mounted = f.calls.find(call => call[0] === 'mount' && call[1].resources === source);
  assert.ok(mounted, 'Drive chooser is linked to the source box');
  assert.equal(mounted[1].label, 'Link assessment from Google Drive');
  assert.equal(source.parent.parent.attrs.class, 'moderation-source');
  assert.equal(source.hidden, true, 'link addresses are hidden by default');
  source.value = 'Assessment task.pdf | https://drive.google.com/file/d/abc123/view\nTeacher-written task'; source.events.input();
  assert.equal(JSON.parse(f.host.find(child => child.attrs.name === 'internal').value).source, source.value);
  const list = f.host.find(child => child.attrs.class === 'moderation-source-links');
  assert.equal(list.children[0].children[0].textContent, 'Assessment task.pdf');
  assert.equal(list.children[0].children[0].attrs.href, 'https://drive.google.com/file/d/abc123/view');
  assert.equal(list.children[1].textContent, 'Teacher-written task');
  assert.ok(!list.all().some(child => child.textContent.includes('drive.google.com')), 'address is not shown as text');
  await f.click('Edit source details');
  assert.equal(source.hidden, false);
  await f.click('Hide link addresses');
  assert.equal(source.hidden, true);
});

test('sighted by is enabled and populated only after verifier name and date are entered', async () => {
  const departments = [{ name: 'Science', teacher: '', leaders: [{ name: 'Synthetic Teacher (SYN)', role: 'TIC', acting: false, onLeave: false }] },
    { name: 'Technology', teacher: '', leaders: [{ name: 'Synthetic Teacher (SYN)', role: 'HOLA', acting: false, onLeave: false }] }];
  const f = fixture({ page: 'internal', departments, data: { department: 'Technology', internal: '{}' } }); await flush();
  const control = id => f.host.find(n => n.attrs.id === 'moderation-internal-' + id);
  const value = id => control(id).value;
  for (const id of ['signatory', 'signatoryPosition', 'signatoryDate']) {
    assert.equal(control(id).disabled, true);
    assert.equal(value(id), '');
  }
  assert.equal(value('evaluationName'), 'Synthetic Teacher');
  assert.equal(value('evaluationPosition'), 'HOLA Technology');
  control('verifierName').value = 'Verifier'; control('verifierName').events.input();
  assert.equal(control('signatory').disabled, true);
  assert.equal(value('signatory'), '');
  control('verificationDate').value = '2026-11-15'; control('verificationDate').events.change();
  await flush();
  assert.equal(control('signatory').disabled, false);
  assert.equal(control('signatoryPosition').disabled, false);
  assert.equal(control('signatoryDate').disabled, false);
  assert.equal(value('signatory'), 'Synthetic Teacher');
  assert.equal(value('signatoryPosition'), 'HOLA Technology');
  assert.equal(JSON.parse(f.host.find(n => n.attrs.name === 'internal').value).signatoryPosition, 'HOLA Technology');
  control('signatoryDate').value = '2026-11-16'; control('signatoryDate').events.input();
  control('verifierName').value = ''; control('verifierName').events.input();
  assert.equal(control('signatory').disabled, true);
  assert.equal(control('signatoryDate').disabled, true);
  assert.equal(value('signatory'), '');
  assert.equal(value('signatoryDate'), '');
  const saved = JSON.parse(f.host.find(n => n.attrs.name === 'internal').value);
  assert.equal(saved.signatory, 'Synthetic Teacher');
  assert.equal(saved.signatoryDate, '2026-11-16');
  control('verifierName').value = 'Verifier'; control('verifierName').events.input();
  assert.equal(value('signatory'), 'Synthetic Teacher');
  assert.equal(value('signatoryDate'), '2026-11-16');
  const kept = fixture({ page: 'internal', departments, data: { internal: JSON.stringify({
    verifierName: 'Verifier', verificationDate: '2026-11-15', signatory: 'Other Leader', signatoryPosition: ''
  }) } }); await flush();
  assert.equal(kept.host.find(n => n.attrs.id === 'moderation-internal-signatory').value, 'Other Leader');
  assert.equal(kept.host.find(n => n.attrs.id === 'moderation-internal-signatoryPosition').value, '');
});
test('sighted-by defaults do not fill a position after verification is cleared during lookup', async () => {
  let resolve;
  const f = fixture({ page: 'internal', data: { department: 'Technology', internal: JSON.stringify({
    verifierName: 'Verifier', verificationDate: '2026-11-15'
  }) }, staffRequest: () => new Promise(done => { resolve = done; }) });
  const control = id => f.host.find(n => n.attrs.id === 'moderation-internal-' + id);
  assert.equal(control('signatory').value, 'Synthetic Teacher');
  control('verificationDate').value = ''; control('verificationDate').events.input();
  resolve({ departments: [{ name: 'Technology', leaders: [
    { name: 'Synthetic Teacher (SYN)', role: 'HOLA', acting: false, onLeave: false }
  ] }] });
  await flush();
  assert.equal(control('signatory').value, '');
  assert.equal(control('signatoryPosition').value, '');
  assert.equal(control('signatoryPosition').disabled, true);
});
test('existing sighted details stay hidden and saved until both verification fields are entered', async () => {
  const f = fixture({ page: 'internal', displayName: '', data: { internal: JSON.stringify({
    signatory: 'Existing signatory', signatoryPosition: 'Teacher', signatoryDate: '2026-11-16'
  }) } });
  await flush();
  const control = id => f.host.find(n => n.attrs.id === 'moderation-internal-' + id);
  assert.equal(control('signatory').disabled, true);
  for (const id of ['signatory', 'signatoryPosition', 'signatoryDate']) assert.equal(control(id).value, '');
  control('verificationDate').value = '2026-11-15'; control('verificationDate').events.input();
  assert.equal(control('signatory').value, '');
  assert.equal(JSON.parse(f.host.find(n => n.attrs.name === 'internal').value).signatory, 'Existing signatory');
  control('verifierName').value = 'Verifier'; control('verifierName').events.input();
  assert.equal(control('signatory').disabled, false);
  assert.equal(control('signatoryDate').disabled, false);
  assert.equal(control('signatory').value, 'Existing signatory');
  assert.equal(control('signatoryPosition').value, 'Teacher');
  assert.equal(control('signatoryDate').value, '2026-11-16');
});
test('verified BSAS consent is recorded only when the answer is unrecorded', async () => {
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : ['2026-11-14T12:30:00Z'])); } }
  const consentRequest = () => ({ number: '99999', domain: 'Digital Technologies', level: 2, bsasLevel: 3, eligible: true, expired: false });
  const open = consent => fixture({ page: 'internal', clock: Clock, data: { internal: JSON.stringify(consent === undefined ? {} : { consent }) }, consentRequest });
  const read = f => JSON.parse(f.host.find(n => n.attrs.name === 'internal').value);
  const automatic = open(); await flush();
  assert.equal(read(automatic).consent, 'Yes');
  assert.equal(read(automatic).consentBsasStandard, '99999');
  const checkbox = automatic.host.find(n => n.attrs.id === 'moderation-internal-consent');
  assert.equal(checkbox.checked, true);
  checkbox.checked = false; checkbox.events.change();
  assert.equal(read(automatic).consent, 'No');
  assert.equal(read(automatic).consentBsasStandard, undefined);
  for (const answer of ['No', 'Not applicable', 'Yes']) {
    const f = open(answer); await flush();
    assert.equal(read(f).consent, answer);
    assert.equal(read(f).consentBsasStandard, undefined);
  }
});
test('out-of-scope or unavailable BSAS checks never invent consent and clear only obsolete automatic ticks', async () => {
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : ['2026-11-14T12:30:00Z'])); } }
  const outside = () => ({ number: '99999', domain: 'Other', level: 3, bsasLevel: null, eligible: false, expired: false });
  const open = (internal, consentRequest = outside) => fixture({ page: 'internal', clock: Clock, data: { internal: JSON.stringify(internal) }, consentRequest });
  const read = f => JSON.parse(f.host.find(n => n.attrs.name === 'internal').value);
  const unrecorded = open({}); await flush();
  assert.equal(read(unrecorded).consent, undefined);
  assert.ok(unrecorded.host.find(n => n.textContent.includes('separate consent or extension')));
  const stale = open({ consent: 'Yes', consentBsasStandard: '99999' }); await flush();
  assert.equal(read(stale).consent, '');
  assert.equal(read(stale).consentBsasStandard, undefined);
  const manual = open({ consent: 'Yes' }); await flush();
  assert.equal(read(manual).consent, 'Yes');
  const failed = open({ consent: 'Yes', consentBsasStandard: '99999' }, () => { throw new Error('NZQA unavailable'); }); await flush();
  assert.equal(read(failed).consent, 'Yes');
  assert.ok(failed.host.find(n => n.attrs.role === 'alert' && n.textContent.includes('Consent could not be verified')));
  const changed = open({ consent: 'Yes', consentBsasStandard: '88888' }); await flush();
  assert.equal(read(changed).consent, '');
  assert.equal(read(changed).consentBsasStandard, undefined);
});
test('consent checks do not overwrite a manual choice made while NZQA responds', async () => {
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : ['2026-11-14T12:30:00Z'])); } }
  let resolve;
  const f = fixture({ page: 'internal', clock: Clock, data: { internal: '{}' },
    consentRequest: () => new Promise(done => { resolve = done; }) });
  await flush();
  const checkbox = f.host.find(n => n.attrs.id === 'moderation-internal-consent');
  checkbox.checked = false; checkbox.events.change();
  resolve({ number: '99999', domain: 'Digital Technologies', level: 2, bsasLevel: 3, eligible: true, expired: false });
  await flush();
  assert.equal(JSON.parse(f.host.find(n => n.attrs.name === 'internal').value).consent, 'No');
});
test('a different assessment year does not use the current BSAS as historical proof', async () => {
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : ['2027-01-14T12:30:00Z'])); } }
  const f = fixture({ page: 'internal', clock: Clock, data: { internal: '{}' } }); await flush();
  assert.ok(f.host.find(n => n.textContent.includes('may not apply to this assessment year')));
  assert.equal(f.calls.some(([kind, path]) => kind === 'request' && path.includes('consent-scope')), false);
  assert.equal(JSON.parse(f.host.find(n => n.attrs.name === 'internal').value).consent, undefined);
});
test('random initials populate four evidence entries and tick Yes only after all match', async () => {
  const f = fixture({ page: 'internal', data: { course: '13DTECH', internal: '{}' },
    classSizeRequest: () => ({ students: 18, term: null, linked: true, ambiguous: false }) });
  await flush();
  const random = f.host.find(n => n.attrs.class === 'moderation-random-selection');
  assert.equal(random.parentElement.children[0].textContent, 'Strategic selection of work for verification');
  assert.equal(random.parentElement.children[1], random);
  assert.equal(random.children.length, 3);
  assert.equal(f.host.find(n => n.attrs.id === 'moderation-internal-randomSelection').attrs['aria-labelledby'],
    'moderation-random-selection-label');
  const state = () => JSON.parse(f.host.find(n => n.attrs.name === 'internal').value);
  const edit = (letter, value) => {
    const control = f.host.find(n => n.attrs.id === 'moderation-internal-randomInitials' + letter);
    control.value = value; control.events.input();
  };
  edit('A', 'f'); edit('A', 'fh'); edit('B', 'sh'); edit('C', 'ŌK');
  assert.notEqual(state().randomSelection, 'Yes');
  edit('D', 'jd');
  assert.equal(state().randomSelection, 'Yes');
  assert.equal(f.host.find(n => n.attrs.id === 'moderation-internal-randomSelection').checked, true);
  assert.deepEqual(state().samples.map(sample => sample.student), ['Student A - FH', 'Student B - SH', 'Student C - ŌK', 'Student D - JD']);
  assert.equal(f.host.find(n => n.attrs.id === 'moderation-internal-0-student').value, 'Student A - FH');
  const reopened = fixture({ page: 'internal', data: { course: '13DTECH', internal: JSON.stringify(state()) },
    classSizeRequest: () => ({ students: 18, term: null, linked: true, ambiguous: false }) });
  await flush();
  assert.equal(reopened.host.find(n => n.attrs.id === 'moderation-internal-randomInitialsA').value, 'FH');
  assert.equal(reopened.host.find(n => n.attrs.id === 'moderation-internal-3-student').value, 'Student D - JD');
});
test('random initials preserve existing names, marking and linked schedules and flag conflicts', async () => {
  const id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const f = fixture({ page: 'internal', data: { internal: JSON.stringify({ samples: [
    { student: 'Student A - FH', markerGrade: 'A', markingScheduleRecord: id },
    { student: 'Existing student', comments: 'Existing discussion' }
  ] }) }, recordRequest: async () => ({ revision: 1, content: { parentRecord: record, schedule: '{}' } }) });
  await flush();
  const edit = (letter, value) => {
    const control = f.host.find(n => n.attrs.id === 'moderation-internal-randomInitials' + letter);
    control.value = value; control.events.input();
  };
  edit('B', 'SH'); edit('C', 'XY'); edit('D', 'AB');
  const state = () => JSON.parse(f.host.find(n => n.attrs.name === 'internal').value);
  assert.equal(state().samples[0].markerGrade, 'A');
  assert.equal(state().samples[0].markingScheduleRecord, id);
  assert.equal(state().samples[1].student, 'Existing student');
  assert.equal(state().samples[1].comments, 'Existing discussion');
  assert.notEqual(state().randomSelection, 'Yes');
  assert.ok(f.host.find(n => n.attrs.role === 'alert' && n.textContent.includes('Student B')));
  const student = f.host.find(n => n.attrs.id === 'moderation-internal-1-student');
  student.value = 'Student B - SH'; student.events.input();
  assert.equal(state().randomSelection, 'Yes');
  assert.equal(state().samples[1].comments, 'Existing discussion');
  edit('A', 'ZZ');
  assert.equal(state().samples[0].student, 'Student A - FH');
  assert.ok(f.host.find(n => n.attrs.role === 'alert' && n.textContent.includes('Student A')));
});
test('changing initials cannot rename an automatically created entry after marking is added', async () => {
  const f = fixture({ page: 'internal' }); await flush();
  const initials = f.host.find(n => n.attrs.id === 'moderation-internal-randomInitialsA');
  initials.value = 'FH'; initials.events.input();
  const grade = f.host.find(n => n.attrs.id === 'moderation-internal-0-markerGrade');
  grade.value = 'M'; grade.events.change();
  initials.value = 'SH'; initials.events.input();
  const sample = JSON.parse(f.host.find(n => n.attrs.name === 'internal').value).samples[0];
  assert.equal(sample.student, 'Student A - FH');
  assert.equal(sample.markerGrade, 'M');
  assert.ok(f.host.find(n => n.attrs.role === 'alert' && n.textContent.includes('Student A')));
});
test('invalid initials do not overwrite or save evidence entries', async () => {
  const f = fixture({ page: 'internal' }); await flush();
  const control = f.host.find(n => n.attrs.id === 'moderation-internal-randomInitialsA');
  control.value = 'A1'; control.events.input();
  const state = JSON.parse(f.host.find(n => n.attrs.name === 'internal').value);
  assert.ok(!state.randomInitialsA);
  assert.ok(!state.samples.length);
  assert.ok(f.host.find(n => n.attrs.role === 'alert' && n.textContent.includes('Use up to 10 letters')));
});
test('random selection shows the Student Tracker class size for the course without saving it', async () => {
  const paths = [];
  const f = fixture({ page: 'internal', data: { course: '13DTECH', internal: '{}' },
    classSizeRequest: path => { paths.push(path); return { students: 18, term: null, linked: true, ambiguous: false }; } }); await flush();
  const box = f.host.find(n => n.attrs.id === 'moderation-internal-randomSelection');
  const note = box.parentElement.parentElement.children.find(n => n.attrs.class === 'moderation-class-size');
  assert.ok(note.find(n => n.textContent === '13DTECH: 18 students'));
  assert.ok(note.find(n => n.textContent === 'Total students: 18.'));
  assert.ok(note.find(n => n.textContent.includes('not included in the exported sheet')));
  assert.deepEqual(paths, ['class-size/2026?course=13DTECH']);
  assert.doesNotMatch(f.host.find(n => n.attrs.name === 'internal').value, /18|classSize/);
  const empty = fixture({ page: 'internal', data: { internal: '{}' } }); await flush();
  const prompt = empty.host.find(n => n.attrs.class === 'moderation-class-size');
  assert.match(prompt.textContent, /Add a Course Code/);
});
test('a class under 6 students sets random selection to Yes when the sheet opens', async () => {
  const open = (students, ambiguous = false) => fixture({ page: 'internal', data: { course: '13DTECH', internal: JSON.stringify({ randomSelection: 'No' }) },
    classSizeRequest: () => ({ students, term: null, linked: true, ambiguous }) });
  const saved = f => JSON.parse(f.host.find(n => n.attrs.name === 'internal').value).randomSelection;
  const small = open(5); await flush();
  assert.equal(saved(small), 'Yes');
  assert.equal(small.host.find(n => n.attrs.id === 'moderation-internal-randomSelection').checked, true);
  assert.ok(small.host.find(n => n.textContent.includes('Under 6 students')));
  for (const f of [open(6), open(0), open(3, true)]) { await flush(); assert.equal(saved(f), 'No'); }
});
test('multiple class codes show each count and their total without double-counting duplicate codes', async () => {
  const paths = [], counts = { '11DTECH': 2, '12DTECH': 4, '13COMP': 7 };
  const f = fixture({ page: 'internal', data: { course: '11dtech, 12DTECH, 13COMP, 11DTECH', internal: '{"randomSelection":"No"}' },
    classSizeRequest: path => {
      paths.push(path);
      return { students: counts[path.split('=')[1]], term: 2, linked: true, ambiguous: false };
    } });
  await flush();
  const note = f.host.find(n => n.attrs.class === 'moderation-class-size');
  for (const [code, count] of Object.entries(counts)) assert.ok(note.find(n => n.textContent.startsWith(code + ': ' + count + ' student')));
  assert.ok(note.find(n => n.textContent === 'Total students: 13.'));
  assert.ok(note.find(n => n.textContent.includes('students in multiple classes are counted more than once')));
  assert.deepEqual(paths, ['class-size/2026?course=11DTECH', 'class-size/2026?course=12DTECH', 'class-size/2026?course=13COMP']);
  assert.equal(JSON.parse(f.host.find(n => n.attrs.name === 'internal').value).randomSelection, 'No');
});
test('multiple classes only set random selection for a complete total under six', async () => {
  const open = classSizeRequest => fixture({ page: 'internal', data: { course: '11DTECH, 12DTECH', internal: '{"randomSelection":"No"}' }, classSizeRequest });
  const result = (students, extra = {}) => ({ students, term: null, linked: true, ambiguous: false, ...extra });
  const small = open(path => result(path.endsWith('11DTECH') ? 2 : 3)); await flush();
  assert.equal(JSON.parse(small.host.find(n => n.attrs.name === 'internal').value).randomSelection, 'Yes');
  assert.ok(small.host.find(n => n.textContent.includes('Total students: 5. Under 6 students')));
  for (const request of [
    path => result(2, path.endsWith('12DTECH') ? { ambiguous: true } : {}),
    path => result(2, path.endsWith('12DTECH') ? { linked: false } : {}),
    path => result(2, path.endsWith('12DTECH') ? { term: 2 } : { term: 1 }),
    path => { if (path.endsWith('12DTECH')) throw new Error('Lookup failed'); return result(2); }
  ]) {
    const f = open(request); await flush();
    assert.equal(JSON.parse(f.host.find(n => n.attrs.name === 'internal').value).randomSelection, 'No');
    assert.ok(f.host.find(n => n.textContent.startsWith('Total students: unavailable.')));
  }
});
test('invalid course codes do not produce a partial total', async () => {
  const f = fixture({ page: 'internal', data: { course: '11DTECH, INVALID-CODE', internal: '{"randomSelection":"No"}' },
    classSizeRequest: () => ({ students: 2, term: null, linked: true, ambiguous: false }) });
  await flush();
  assert.ok(f.host.find(n => n.textContent.includes('INVALID-CODE: unavailable. Invalid course code')));
  assert.ok(f.host.find(n => n.textContent.startsWith('Total students: unavailable.')));
  assert.equal(JSON.parse(f.host.find(n => n.attrs.name === 'internal').value).randomSelection, 'No');
});
test('a late class-size response does not change random selection after the course changes', async () => {
  let resolve;
  const f = fixture({ page: 'internal', data: { course: '11DTECH', internal: '{"randomSelection":"No"}' },
    classSizeRequest: () => new Promise(done => { resolve = done; }) });
  await flush();
  f.host.find(n => n.attrs.name === 'course').value = '12DTECH';
  resolve({ students: 2, term: null, linked: true, ambiguous: false });
  await flush();
  assert.equal(JSON.parse(f.host.find(n => n.attrs.name === 'internal').value).randomSelection, 'No');
});

function libraryEntry() {
  const file = (id, name, mimeType = 'application/pdf') => ({ id, name, mimeType, modifiedTime: '2026-11-14T00:00:00Z' });
  return { id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', revision: 1, content: {
    ...librarySchema.emptyContent(), title: 'Purchased task', supplier: 'Synthetic Supplier', edition: 'Edition 1',
    standards: [{ number: '99999', version: '2' }],
    purchaseZip: [file('purchase_zip_123', 'Purchase.zip', 'application/zip')],
    resourceFolder: [file('resource_folder_123', 'Resources', 'application/vnd.google-apps.folder')],
    assessmentFiles: [file('assessment_file_123', 'Assessment instructions.pdf')],
    topicBriefFiles: [file('topic_brief_file_123', 'Topic brief.pdf')],
    critiques: [{ id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', name: 'Approved Critiquer', school: 'Synthetic School', date: '2026-03-09',
      outcome: 'Approved', changes: '', evidence: file('critique_file_123', 'Critique.pdf') }]
  } };
}
test('library chooser fills source and approved critique; new student schedules inherit only teaching links', async () => {
  const entry = libraryEntry();
  entry.content.classCodes = ['11DTECH', '12DTECH', '13COMP'];
  entry.content.critiques[0].checks = Object.fromEntries(schema.critique.slice(4).map(([key]) => [key, 'Yes']));
  entry.content.critiques[0].checks.allGrades = 'No';
  entry.content.critiques[0].checks.standardDetails = '';
  const f = fixture({ page: 'internal', displayName: '', data: {
    internal: JSON.stringify({ samples: [{ student: 'Synthetic learner' }], conditions: 'No', context: 'No' }),
    schedule: JSON.stringify({ grade: 'M', fileSubmissionLink: 'Existing student submission | https://example.test/work' })
  }, libraryRequest: path => path.includes('?') ? { records: [{ id: entry.id, ...entry.content }], total: 1 } : entry });
  await flush();
  await f.click('Choose from Resource Library'); await flush();
  const select = f.host.find(n => n.attrs.id === 'moderation-library-entry');
  select.value = entry.id; await select.events.change();
  assert.ok(f.host.find(n => n.textContent === 'Allows all requirements and available grades: No'));
  assert.equal(f.calls.some(call => call[0] === 'confirm'), false);
  await f.click('Fill missing from library');
  assert.ok(f.calls.some(call => call[0] === 'confirm' && call[1].includes('recorded checks')));
  const saved = f.saved.at(-1), internal = JSON.parse(saved.internal), schedule = JSON.parse(saved.schedule);
  assert.equal(saved.course, '11DTECH, 12DTECH, 13COMP');
  assert.deepEqual(JSON.parse(saved.resourceLibrary).classCodes, entry.content.classCodes);
  assert.ok(f.host.find(n => n.textContent.startsWith('Total students: unavailable.')));
  assert.match(internal.source, /^Assessment instructions\.pdf \| https:/);
  assert.equal(internal.critiqueName, 'Approved Critiquer');
  assert.equal(internal.conditions, 'No');
  assert.equal(internal.context, 'No');
  assert.equal(internal.allGrades, 'No');
  for (const [key] of schema.critique.slice(6, 11)) assert.equal(internal[key], 'Yes');
  assert.equal(internal.standardDetails, undefined);
  assert.equal(f.host.find(n => n.attrs.id === 'moderation-internal-scheduleConsistent').checked, true);
  assert.equal(internal.previousCritique, undefined);
  assert.equal(schedule.grade, 'M');
  assert.equal(schedule.fileSubmissionLink, 'Existing student submission | https://example.test/work');
  assert.match(schedule.assessmentInstructionsLink, /assessment_file_123/);
  assert.match(schedule.topicBriefLink, /topic_brief_file_123/);
  assert.doesNotMatch(saved.internal + saved.schedule, /purchase_zip|resource_folder/);
  await f.click('Create / open marking schedule for entry 1');
  const created = f.calls.find(call => call[0] === 'mutate')[2].content;
  assert.equal(created.resourceLibrary, saved.resourceLibrary);
  const child = JSON.parse(created.schedule);
  assert.equal(child.assessmentInstructionsLink, schedule.assessmentInstructionsLink);
  assert.equal(child.topicBriefLink, schedule.topicBriefLink);
  assert.equal(child.grade, undefined);
  assert.equal(child.fileSubmissionLink, undefined);
});
test('library class codes preserve an existing course and can be added to an older matching snapshot', async () => {
  const entry = libraryEntry();
  const oldSnapshot = librarySchema.snapshot(entry, '99999', '2', entry.content.critiques[0].id);
  entry.content.classCodes = ['11DTECH', '12DTECH'];
  const request = path => path.includes('?') ? { records: [{ id: entry.id, ...entry.content }], total: 1 } : entry;
  for (const existing of ['', '13DTECH']) {
    const f = fixture({ page: 'internal', displayName: '', data: { course: existing, resourceLibrary: JSON.stringify(oldSnapshot) },
      libraryRequest: request });
    await flush(); await f.click('Choose from Resource Library'); await flush();
    const select = f.host.find(n => n.attrs.id === 'moderation-library-entry');
    select.value = entry.id; await select.events.change();
    await f.click('Fill missing from library');
    assert.equal(f.saved.at(-1).course, existing || '11DTECH, 12DTECH');
    assert.deepEqual(JSON.parse(f.saved.at(-1).resourceLibrary).classCodes, entry.content.classCodes);
  }
});
test('oversized library class codes do not partially change a moderation record', async () => {
  const entry = libraryEntry();
  entry.content.classCodes = Array.from({ length: 10 }, (_, index) => String(index) + 'X'.repeat(60));
  const f = fixture({ page: 'internal', displayName: '', libraryRequest: path =>
    path.includes('?') ? { records: [{ id: entry.id, ...entry.content }], total: 1 } : entry });
  await flush(); await f.click('Choose from Resource Library'); await flush();
  const select = f.host.find(n => n.attrs.id === 'moderation-library-entry');
  select.value = entry.id; await select.events.change();
  await f.click('Fill missing from library');
  assert.equal(f.saved.length, 0);
  assert.equal(f.host.find(n => n.attrs.name === 'course').value, '');
  assert.match(f.host.find(n => n.attrs.role === 'alert').textContent, /500-character Course Code limit/);
});
test('declining library confirmation leaves critique checks unchanged', async () => {
  const entry = libraryEntry();
  entry.content.critiques[0].checks = { context: 'Yes' };
  const f = fixture({ page: 'internal', displayName: '', confirmResponse: false,
    libraryRequest: path => path.includes('?') ? { records: [{ id: entry.id, ...entry.content }], total: 1 } : entry });
  await flush();
  await f.click('Choose from Resource Library'); await flush();
  const select = f.host.find(n => n.attrs.id === 'moderation-library-entry');
  select.value = entry.id; await select.events.change();
  const before = f.saved.length;
  await f.click('Fill missing from library');
  assert.equal(f.saved.length, before);
  assert.ok(f.calls.some(call => call[0] === 'confirm'));
  assert.notEqual(f.host.find(n => n.attrs.id === 'moderation-internal-context').checked, true);
});
test('unchanged legacy library sources are simplified while manually edited sources and snapshots are preserved', async () => {
  const entry = libraryEntry();
  const snapshot = librarySchema.snapshot(entry, '99999', '2');
  const oldSource = 'TKI - Purchased task\nFinal assessment | https://example.org/final\n' +
    'Original assessment | https://example.org/original\nDate linked: 2026-01-02\nModification notes: Keep in library\n' +
    'Assessment Instructions & Schedule | https://drive.google.com/file/d/assessment_file_123/view';
  const saved = { ...snapshot, source: oldSource };
  delete saved.sourceProvenance;
  for (const edited of [false, true]) {
    const source = oldSource + (edited ? '\nMy additional note' : '');
    const f = fixture({ page: 'internal', displayName: '', data: {
      resourceLibrary: JSON.stringify(saved), internal: JSON.stringify({ source })
    }, libraryRequest: path => path.includes('?') ? { records: [{ id: entry.id, ...entry.content }], total: 1 } : entry });
    await flush();
    const internal = () => JSON.parse(f.host.find(n => n.attrs.name === 'internal').value);
    assert.equal(internal().source, edited ? source : snapshot.source);
    assert.equal(JSON.parse(f.host.find(n => n.attrs.name === 'resourceLibrary').value).source, oldSource);
    await f.click('Fill missing from saved library selection');
    assert.equal(internal().source, edited ? source : snapshot.source);
    assert.equal(JSON.parse(f.saved.at(-1).resourceLibrary).source, oldSource);
    await f.click('Choose from Resource Library'); await flush();
    const select = f.host.find(n => n.attrs.id === 'moderation-library-entry');
    select.value = entry.id; await select.events.change();
    const critique = f.host.find(n => n.attrs.id === 'moderation-library-critique');
    critique.value = ''; await critique.events.change();
    const before = f.saved.length;
    await f.click('Fill missing from library');
    assert.equal(f.saved.length, before + 1);
    assert.equal(JSON.parse(f.saved.at(-1).resourceLibrary).source, oldSource);
  }
});
test('resource library editor saves the ZIP, resource folder and teaching files as separate groups', async () => {
  const host = node(), writes = [], navigation = [], entry = libraryEntry();
  let chosen = entry.content.purchaseZip[0];
  const context = { assessmentLibrarySchema: librarySchema, plannerModerationSchema: schema, crypto, URL, setTimeout: () => 1, clearTimeout: () => {}, console: { error() {} }, confirm: () => true,
    plannerGoogleDrive: { prepareDocumentAccess: async () => ({
      authorize: async () => {}, choose: async () => chosen, chooseFiles: async () => [chosen], metadata: async () => chosen
    }) } };
  vm.runInNewContext(librarySource, context);
  let conflict = false;
  const controller = await context.assessmentResourceLibrary.mountPage(host, { el: node, id: 'new', year: 2026,
    navigate: async id => navigation.push(id),
    request: async (path, options) => {
      if (!options) return { content: {}, classes: [], departments: [], records: [] };
      if (conflict) throw new Error('Another teacher changed this library entry.');
      if (path.endsWith('/draft')) return { draftRevision: 1 };
      writes.push(JSON.parse(options.body));
      return { id: entry.id, revision: 1 };
    } });
  const edit = (id, value) => { const control = host.find(n => n.attrs.id === id); control.value = value; control.events.input(); };
  const click = async label => {
    const control = host.find(n => n.tag === 'button' && n.textContent === label);
    assert.ok(control, label); await control.events.click();
  };
  edit('library-title', 'Purchased task');
  edit('library-supplier', 'Synthetic Supplier');
  edit('library-price', '49.95');
  assert.equal(controller.hasUnsavedChanges(), true);
  await click('Add standard');
  edit('library-standard-0-number', '99999');
  edit('library-standard-0-version', '2');
  await click('Choose Original purchase ZIP from Google Drive');
  chosen = entry.content.resourceFolder[0];
  await click('Choose Resource folder from Google Drive');
  chosen = entry.content.assessmentFiles[0];
  await click('Choose Assessment Instructions & Schedule from Google Drive');
  chosen = entry.content.topicBriefFiles[0];
  await click('Choose Topic Brief from Google Drive');
  await click('Save now');
  assert.equal(writes.length, 1);
  const saved = writes[0].content;
  for (const [key] of librarySchema.fileGroups.slice(0, 4)) assert.equal(saved[key][0].id, entry.content[key][0].id);
  assert.equal(saved.price, '49.95');
  assert.equal(navigation.length, 0);
  assert.equal(librarySchema.validate(saved), '');
  assert.equal(controller.hasUnsavedChanges(), false);
  conflict = true;
  edit('library-notes', 'Unsaved local draft');
  await click('Save now');
  assert.equal(controller.hasUnsavedChanges(), true);
  assert.equal(host.find(n => n.attrs.id === 'library-notes').value, 'Unsaved local draft');
  assert.match(host.find(n => n.attrs.role === 'alert').textContent, /Another teacher changed/);
  await click('Discard draft');
  assert.equal(controller.hasUnsavedChanges(), false);
  assert.equal(navigation.at(-1), '');
});
test('a failed Drive group refresh keeps the original file links instead of saving a partial result', async () => {
  const host = node(), entry = libraryEntry();
  entry.content.assessmentFiles.push({ ...entry.content.assessmentFiles[0], id: 'second_assessment_123', name: 'Second document.pdf' });
  const context = { assessmentLibrarySchema: librarySchema, plannerModerationSchema: schema, crypto, URL, console: { error() {} },
    plannerGoogleDrive: { prepareDocumentAccess: async () => ({
      authorize: async () => {}, metadata: async id => {
        if (id === 'second_assessment_123') throw new Error('File is missing or inaccessible.');
        return { ...entry.content.assessmentFiles[0], name: 'Changed name.pdf' };
      }
    }) } };
  vm.runInNewContext(librarySource, context);
  const controller = await context.assessmentResourceLibrary.mountPage(host, {
    el: node, id: entry.id, entry, year: 2026, request: async (path, options) => {
      if (path.endsWith('/evaluations')) return { standards: [], evaluations: [], more: false };
      if (!options) return { content: {}, classes: [], departments: [], records: [] };
      throw new Error('No save expected');
    }, navigate: async () => {}
  });
  const refresh = host.find(n => n.tag === 'button' && n.textContent === 'Refresh Assessment Instructions & Schedule links');
  assert.equal(refresh.attrs.class, 'library-refresh');
  assert.notEqual(host.find(n => n.tag === 'button' && n.textContent === 'Choose Assessment Instructions & Schedule from Google Drive').attrs.class, 'library-refresh');
  await refresh.events.click();
  assert.match(host.find(n => n.attrs.role === 'alert').textContent, /missing or inaccessible/);
  assert.ok(host.find(n => n.tag === 'a' && n.textContent === 'Assessment instructions.pdf'));
  assert.equal(host.find(n => n.tag === 'a' && n.textContent === 'Changed name.pdf'), undefined);
  assert.equal(controller.hasUnsavedChanges(), false);
});
test('Setup Assessment aligns topic selectors in a table and keeps topic saves and removal working', async () => {
  const host = node(), status = node(), year = node('input', '', { value: '2026' }), writes = [];
  const standards = [{ number: '29777', title: 'Database assessment', subject: 'Computing', topic: 'Database' },
    { number: '29786', title: 'Spreadsheet assessment', subject: 'Computing', topic: 'Spreadsheet' }];
  const elements = { 'assessment-manager-content': host, 'assessment-manager-status': status, 'assessment-year': year };
  vm.runInNewContext(fs.readFileSync(require.resolve('./public/assessment-manager.js'), 'utf8'), {
    Headers, URLSearchParams, setTimeout, clearTimeout,
    location: { hash: '#year=2026&section=standards' }, window: { addEventListener() {} },
    document: { body: { dataset: { api: '/api/' } }, getElementById: id => elements[id], createElement: tag => node(tag), querySelectorAll: () => [] },
    fetch: async (path, options) => {
      if (path.endsWith('session')) return Response.json({ csrf: 'synthetic-csrf' });
      if (options.method === 'PUT') { writes.push(JSON.parse(options.body)); return Response.json({ revision: writes.length + 1 }); }
      return Response.json({ revision: 1, content: path.includes('/assessmentSetup/')
        ? { selectedStandards: JSON.stringify(standards) } : { folderTopics: '["Database","Spreadsheet"]' } });
    }
  });
  await flush();
  const table = host.find(n => n.tag === 'table' && n.attrs.class === 'assessment-selected-standards');
  assert.ok(table);
  assert.deepEqual(table.find(n => n.tag === 'thead').children[0].children.map(n => n.textContent),
    ['Standard', 'Topic Folder', 'Action']);
  const rows = table.find(n => n.tag === 'tbody');
  assert.equal(rows.children.length, 2);
  assert.ok(rows.children.every(row => row.children.length === 3 && row.children[1].children[0].tag === 'select'));
  const topic = host.find(n => n.attrs.id === 'assessment-standard-topic-29777');
  assert.equal(topic.value, 'Database');
  topic.value = 'Spreadsheet'; await topic.events.change();
  assert.equal(JSON.parse(writes[0].content.selectedStandards)[0].topic, 'Spreadsheet');
  const remove = rows.children[0].children[2].children[0];
  await remove.events.click();
  assert.deepEqual(JSON.parse(writes[1].content.selectedStandards).map(item => item.number), ['29786']);
  assert.equal(rows.children.length, 1);
  await rows.children[0].children[2].children[0].events.click();
  assert.equal(rows.children[0].children[0].attrs.colspan, '3');
  assert.equal(rows.children[0].children[0].textContent, 'No standards selected yet.');
});
test('the moderation standards dropdown groups by level and retains standards without level metadata', async () => {
  const f = fixture({ id: '', myStandards: [
    { number: '91907', title: 'Level three assessment', level: '3' },
    { number: '92004', title: 'Level one assessment', level: '1' },
    { number: '29777', title: 'Level two assessment', level: '2' },
    { number: '99999', title: 'Older saved assessment' }
  ] });
  await flush();
  const select = f.host.find(n => n.attrs.id === 'moderation-new-standard');
  const groups = () => select.children.filter(n => n.tag === 'optgroup');
  assert.deepEqual(groups().map(n => n.attrs.label), ['Level 1', 'Level 2', 'Level 3', 'Other / level not recorded']);
  assert.deepEqual(groups().map(n => n.children.map(option => option.attrs.value)), [['92004'], ['29777'], ['91907'], ['99999']]);
  await f.click('Refresh My Standards');
  assert.equal(groups().length, 4);
  assert.equal(select.children[0].attrs.value, '');
});
async function libraryMetadataFixture({ fresh = false, entry = libraryEntry(), metadataRequest, prior = [], recordContent = {}, sourceRequest, saveRequest, linkWrite, confirmResponse = true,
  displayName, userEmail, userId, driveAccess, evaluationRequest, suppliers = [], staffRequest, staffDirectory = { staff: [], departments: [{ name: 'Technology' }] }, setupStandards = [
    { number: '99999', version: '2', level: '2', credits: '4 credits', title: 'Saved standard', subject: 'Computing' }
  ] } = {}) {
  const host = node(), writes = [], draftWrites = [], requests = [], created = [];
  let scheduled;
  const context = { assessmentLibrarySchema: librarySchema, plannerModerationSchema: schema, crypto, URL, URLSearchParams,
    setTimeout: callback => { scheduled = callback; return 1; }, clearTimeout: () => { scheduled = undefined; },
    console: { error() {} }, confirm: () => confirmResponse,
    plannerGoogleDrive: driveAccess ? { prepareDocumentAccess: async () => driveAccess } : undefined };
  vm.runInNewContext(librarySource, context);
  const controller = await context.assessmentResourceLibrary.mountPage(host, {
    el: node, year: 2026, id: fresh ? 'new' : entry.id, entry: fresh ? undefined : entry, navigate: async () => {},
    displayName, userEmail, userId, recordCreated: id => created.push(id),
    request: async (path, options) => {
      requests.push(path);
      if (options && /^\d{4}\/moderation\//.test(path) && linkWrite) return linkWrite(path, JSON.parse(options.body));
      if (options && path.endsWith('/draft')) {
        draftWrites.push(JSON.parse(options.body));
        return saveRequest ? saveRequest(path, options) : { draftRevision: draftWrites.length };
      }
      if (options && saveRequest) return saveRequest(path, options);
      if (options) { writes.push(JSON.parse(options.body)); return { revision: 2 }; }
      if (path.endsWith('/evaluations')) return { standards: entry.content.standards.map(standard => ({ ...standard, ambiguous: false })),
        ...(evaluationRequest ? await evaluationRequest() : { evaluations: [], more: false }) };
      if (/^standards\/\d+\/details$/.test(path)) {
        const number = path.split('/')[1];
        return metadataRequest ? metadataRequest(number) :
          { number, version: '2', level: '2', credits: '6 credits', title: 'Official NZQA title', subject: 'Digital Technologies' };
      }
      if (/^\d{4}\/moderation\//.test(path)) return { revision: 1, content: structuredClone(recordContent) };
      if (path === 'resource-library/' + entry.id + '/history') return { notice: 'Saved revisions', revisions: [{ ...entry, updated_at: '2026-01-02T00:00:00Z' }] };
      if (path === 'resource-library/' + entry.id) return entry;
      if (sourceRequest) return sourceRequest(path);
      if (path === '2026/assessmentSetup/main') return { content: { selectedStandards: JSON.stringify(setupStandards) } };
      if (path === 'moderation/2026') return { records: prior };
      if (path === 'suppliers') return { suppliers };
      if (path === 'staff') return staffRequest ? staffRequest() : staffDirectory;
      if (path === 'teaching-subjects/2026') return { departments: [{ name: 'Technology' }], classes: [
        { subject: 'Digital Technologies', course: '11DTECH' }, { subject: 'Digital Technologies', course: '12DTECH' },
        { subject: 'Computing', course: '13COMP' }
      ] };
      throw new Error('Unexpected metadata request: ' + path);
    }
  });
  const find = id => host.find(n => n.attrs.id === id);
  const edit = async (id, value) => { const control = find(id); control.value = value; await control.events[control.tag === 'select' ? 'change' : 'input'](); };
  const click = async label => {
    const control = host.find(n => n.tag === 'button' && n.textContent === label);
    assert.ok(control, label); await control.events.click();
  };
  const autosave = async () => { assert.ok(scheduled, 'autosave is scheduled'); scheduled(); await flush(); await flush(); };
  return { host, writes, draftWrites, requests, created, controller, find, edit, click, autosave };
}
test('assessment source edits set the NZ linked date and preserve hidden purchase details', async () => {
  const entry = libraryEntry();
  entry.content.price = '125.50';
  const f = await libraryMetadataFixture({ entry });
  await f.edit('library-source-type', 'TKI');
  assert.equal(f.find('library-supplier').parentElement.parentElement.parentElement.hidden, true);
  await f.edit('library-origin-originalUrl', 'https://example.org/original');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  assert.equal(f.find('library-origin-linkedDate').value, today);
  assert.equal(f.host.find(n => n.tag === 'a' && n.textContent === 'Open original assessment').attrs.href, 'https://example.org/original');
  await f.edit('library-origin-linkedDate', '2025-01-02');
  await f.edit('library-origin-modificationNotes', 'Adapted');
  await f.edit('library-origin-finalUrl', 'https://docs.google.com/document/d/final/edit');
  await f.autosave();
  assert.equal(f.writes.at(-1).content.origin.linkedDate, '2025-01-02');
  assert.equal(f.writes.at(-1).content.price, '125.50');
  await f.edit('library-origin-originalUrl', 'https://example.org/new');
  assert.equal(f.find('library-origin-linkedDate').value, today);
  await f.edit('library-origin-originalUrl', '');
  assert.equal(f.find('library-origin-linkedDate').value, '');
});
test('Own source requires confirmation and records the signed-in author; declining a switch retains details', async () => {
  const id = '11111111-1111-4111-8111-111111111111';
  const f = await libraryMetadataFixture({ displayName: 'Synthetic Teacher', userId: id });
  await f.edit('library-source-type', 'Own');
  await f.autosave();
  assert.equal(f.writes.at(-1).content.origin.authorId, id);
  assert.equal(f.writes.at(-1).content.origin.authorName, 'Synthetic Teacher');
  const declined = await libraryMetadataFixture({ confirmResponse: false, displayName: 'Synthetic Teacher', userId: id });
  await declined.edit('library-source-type', 'Own');
  assert.equal(declined.find('library-source-type').value, 'Commercial');
  const entry = libraryEntry();
  entry.content.origin = { type: 'TKI', authorId: '', authorName: '', originalUrl: 'https://example.org/original',
    linkedDate: '2025-01-02', modificationNotes: 'Keep', finalUrl: '' };
  const switching = await libraryMetadataFixture({ entry, confirmResponse: false });
  await switching.edit('library-source-type', 'NZQA');
  assert.equal(switching.find('library-source-type').value, 'TKI');
  assert.equal(switching.find('library-origin-modificationNotes').value, 'Keep');
  assert.equal(switching.controller.hasUnsavedChanges(), false);
});
test('Drive source selection does not overwrite a linked date edited while the picker is open', async () => {
  let release;
  const entry = libraryEntry();
  entry.content.origin = { type: 'NZQA', authorId: '', authorName: '', originalUrl: 'https://example.org/original',
    linkedDate: '2025-01-02', modificationNotes: '', finalUrl: '' };
  const driveAccess = { authorize: async () => {}, chooseFiles: () => new Promise(resolve => { release = resolve; }),
    metadata: async () => ({ id: 'assessment_file_123', name: 'Assessment', mimeType: 'application/pdf', modifiedTime: '' }) };
  const f = await libraryMetadataFixture({ entry, driveAccess });
  const picking = f.click('Choose original from Google Drive');
  await flush();
  await f.edit('library-origin-linkedDate', '2025-04-03');
  release({ id: 'assessment_file_123' });
  await picking;
  assert.equal(f.find('library-origin-originalUrl').value, 'https://example.org/original');
  assert.equal(f.find('library-origin-linkedDate').value, '2025-04-03');
  assert.match(f.host.find(n => n.attrs.role === 'alert').textContent, /changed while choosing/);
});
test('Drive source selection and revision history show the selected source', async () => {
  const entry = libraryEntry();
  entry.content.origin = { type: 'NZQA', authorId: '', authorName: '', originalUrl: 'https://example.org/original',
    linkedDate: '2025-01-02', modificationNotes: 'Adapted', finalUrl: '' };
  const driveAccess = { authorize: async () => {}, chooseFiles: async () => ({ id: 'assessment_file_123' }),
    metadata: async () => ({ id: 'assessment_file_123', name: 'Assessment', mimeType: 'application/pdf', modifiedTime: '' }) };
  const f = await libraryMetadataFixture({ entry, driveAccess });
  await f.click('View saved revision history');
  const history = f.host.find(n => n.attrs['aria-label'] === 'Saved library revisions');
  assert.ok(history.find(n => n.tag === 'dd' && n.textContent === 'NZQA'));
  assert.ok(history.find(n => n.tag === 'dd' && n.textContent === 'Adapted'));
  await f.click('Choose original from Google Drive');
  assert.equal(f.find('library-origin-originalUrl').value, 'https://example.org/original');
  assert.equal(f.find('library-origin-original-0-url').value, 'https://drive.google.com/file/d/assessment_file_123/view');
  assert.equal(f.find('library-origin-original-0-date').value, new Intl.DateTimeFormat('en-CA',
    { timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()));
  await f.click('Choose final assessment from Google Drive');
  assert.equal(f.find('library-origin-finalUrl').value, 'https://drive.google.com/file/d/assessment_file_123/view');
  await f.edit('library-source-type', 'Commercial');
  assert.equal(f.find('library-supplier').parentElement.parentElement.parentElement.hidden, false);
  await f.autosave();
  assert.equal(f.writes.at(-1).content.origin.type, 'Commercial');
  assert.equal(f.writes.at(-1).content.supplier, entry.content.supplier);
});
test('multiple original and final files keep independent dates and survive editing and removal', async () => {
  const entry = libraryEntry();
  entry.content.origin = { type: 'TKI', authorId: '', authorName: '', originalUrl: 'https://example.org/original',
    linkedDate: '2025-01-02', modificationNotes: '', finalUrl: '' };
  const files = ['assessment_file_123', 'assessment_file_456'];
  const driveAccess = { authorize: async () => {}, chooseFiles: async multiple => {
    assert.equal(multiple, true); return files.map(id => ({ id }));
  }, metadata: async id => ({ id, name: id + '.pdf', mimeType: 'application/pdf', modifiedTime: '' }) };
  const f = await libraryMetadataFixture({ entry, driveAccess });
  const supplier = f.find('library-supplier').parentElement.parentElement.parentElement;
  const source = f.find('library-source-type').parentElement.parentElement;
  assert.equal(source.parentElement.children.indexOf(supplier), source.parentElement.children.indexOf(source) + 1);
  assert.equal(supplier.hidden, true);
  assert.notEqual(f.find('library-licence').parentElement.parentElement.parentElement.hidden, true);
  await f.click('Choose original from Google Drive');
  assert.equal(f.find('library-origin-originalUrl').value, 'https://example.org/original');
  assert.equal(f.find('library-origin-linkedDate').value, '2025-01-02');
  assert.match(f.find('library-origin-original-0-url').value, /assessment_file_123/);
  assert.match(f.find('library-origin-original-1-url').value, /assessment_file_456/);
  await f.edit('library-origin-original-0-date', '2025-02-03');
  await f.click('Choose final assessment from Google Drive');
  assert.match(f.find('library-origin-finalUrl').value, /assessment_file_123/);
  assert.match(f.find('library-origin-final-0-url').value, /assessment_file_456/);
  await f.autosave();
  const saved = f.writes.at(-1).content.origin;
  assert.equal(saved.additionalOriginals[0].linkedDate, '2025-02-03');
  assert.equal(saved.additionalOriginals.length, 2);
  assert.equal(saved.additionalFinals.length, 1);
  const savedEntry = libraryEntry();
  savedEntry.content.origin = saved;
  const historyView = await libraryMetadataFixture({ entry: savedEntry });
  await historyView.click('View saved revision history');
  const history = historyView.host.find(n => n.attrs['aria-label'] === 'Saved library revisions');
  assert.ok(history.find(n => n.tag === 'dd' && n.textContent === saved.additionalOriginals[0].url));
  assert.ok(history.find(n => n.tag === 'dd' && n.textContent === saved.additionalFinals[0]));
  await f.click('Remove original link 2');
  await f.click('Remove final link 2');
  await f.autosave();
  assert.match(f.writes.at(-1).content.origin.additionalOriginals[0].url, /assessment_file_456/);
  assert.deepEqual(f.writes.at(-1).content.origin.additionalFinals, []);
});
test('multi-file picker does not overwrite additional links edited while it is open', async () => {
  let release;
  const entry = libraryEntry();
  entry.content.origin = { type: 'TKI', authorId: '', authorName: '', originalUrl: 'https://example.org/original',
    linkedDate: '2025-01-02', modificationNotes: '', finalUrl: '',
    additionalOriginals: [{ url: 'https://example.org/second', linkedDate: '2025-02-02' }] };
  const driveAccess = { authorize: async () => {}, chooseFiles: () => new Promise(resolve => { release = resolve; }),
    metadata: async id => ({ id, name: 'Assessment', mimeType: 'application/pdf', modifiedTime: '' }) };
  const f = await libraryMetadataFixture({ entry, driveAccess });
  const picking = f.click('Choose original from Google Drive');
  await flush();
  await f.edit('library-origin-original-0-date', '2025-03-03');
  release([{ id: 'assessment_file_123' }, { id: 'assessment_file_456' }]);
  await picking;
  assert.equal(f.find('library-origin-original-0-date').value, '2025-03-03');
  assert.equal(f.find('library-origin-original-1-url'), undefined);
  assert.match(f.host.find(n => n.attrs.role === 'alert').textContent, /changed while choosing/);
});
test('additional manual links use an editable date and retain prior originals', async () => {
  const entry = libraryEntry();
  entry.content.origin = { type: 'NZQA', authorId: '', authorName: '', originalUrl: 'https://example.org/original',
    linkedDate: '2025-01-02', modificationNotes: '', finalUrl: '' };
  const f = await libraryMetadataFixture({ entry });
  await f.click('Add another original link');
  await f.edit('library-origin-original-0-url', 'https://example.org/second');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  assert.equal(f.find('library-origin-original-0-date').value, today);
  await f.edit('library-origin-original-0-date', '2024-04-04');
  await f.click('Add another final link');
  await f.edit('library-origin-final-0-url', 'https://drive.google.com/file/d/final/view');
  await f.autosave();
  assert.equal(f.writes.at(-1).content.origin.linkedDate, '2025-01-02');
  assert.equal(f.writes.at(-1).content.origin.additionalOriginals[0].linkedDate, '2024-04-04');
  assert.equal(f.writes.at(-1).content.origin.additionalFinals[0], 'https://drive.google.com/file/d/final/view');
});
    test('choosing a saved supplier preserves purchase details and clears its link when renamed', async () => {
      const supplierId = '48f6472f-0982-4c87-94af-e62ef1e68eb2';
      const entry = libraryEntry();
      entry.content.price = '125.50'; entry.content.purchaseDate = '2026-03-01';
      entry.content.productUrl = 'https://example.org/product';
      const f = await libraryMetadataFixture({ entry, suppliers: [{ id: supplierId, name: 'Instant', website: 'https://www.instant.org.nz/' }] });
      await f.edit('library-saved-supplier', supplierId);
      await f.autosave();
      const saved = f.writes.at(-1).content;
      assert.equal(saved.supplierId, supplierId);
      assert.equal(saved.supplier, 'Instant');
      assert.equal(saved.supplierWebsite, 'https://www.instant.org.nz/');
      assert.equal(saved.price, '125.50');
      assert.equal(saved.purchaseDate, '2026-03-01');
      assert.equal(saved.productUrl, 'https://example.org/product');
      await f.edit('library-supplier', 'Another supplier');
      await f.autosave();
      assert.equal(f.writes.at(-1).content.supplierId, undefined);
    });
    test('declining supplier replacement leaves existing fields unchanged', async () => {
      const supplierId = '48f6472f-0982-4c87-94af-e62ef1e68eb2';
      const f = await libraryMetadataFixture({ confirmResponse: false,
        suppliers: [{ id: supplierId, name: 'Instant', website: 'https://www.instant.org.nz/' }] });
      await f.edit('library-saved-supplier', supplierId);
      assert.equal(f.find('library-supplier').value, 'Synthetic Supplier');
      assert.equal(f.find('library-saved-supplier').value, '');
      assert.equal(f.controller.hasUnsavedChanges(), false);
    });
    test('library cards place their labelled delete action beside the title', async () => {
      const host = node(), context = { assessmentLibrarySchema: librarySchema, plannerModerationSchema: schema, crypto, URL, URLSearchParams, console, confirm: () => true };
      vm.runInNewContext(librarySource, context);
      await context.assessmentResourceLibrary.mountPage(host, { el: node, year: 2026, navigate: async () => {},
        request: async path => path.includes('?q=') ? { total: 1, records: [{ id: record, title: 'Brief', revision: 1, standards: [] }] }
          : path.endsWith('/drafts') ? { drafts: [] } : { records: [] } });
      const header = host.find(n => n.attrs.class === 'library-card-header');
      assert.deepEqual(header.children.map(n => n.textContent), ['Brief', 'Delete']);
      assert.equal(header.children[1].attrs.class, 'library-delete');
      assert.equal(header.children[1].attrs['aria-label'], 'Delete Brief');
    });
    test('supplier page saves manual reminders and refreshes the open summary', async () => {
      const host = node(), supplierId = '48f6472f-0982-4c87-94af-e62ef1e68eb2', writes = [];
      let reminders = [], holdResources;
      const context = { crypto, console, confirm: () => true };
      vm.runInNewContext(fs.readFileSync(require.resolve('./public/suppliers.js'), 'utf8'), context);
      const controller = await context.assessmentSuppliers.mount(host, { el: node, request: async (path, options) => {
        if (options) {
          const body = JSON.parse(options.body); writes.push(body);
          if (body.revision === 0) reminders = [{ id: path.split('/').pop(), resource_title: 'Combined brief',
            resource_id: record, details: body.details, source: body.source, due_date: body.dueDate, completed: false, revision: 1 }];
          else reminders[0] = { ...reminders[0], completed: body.completed, revision: body.revision + 1 };
          return { revision: reminders[0].revision };
        }
        if (path === 'suppliers') return { suppliers: [{ id: supplierId, name: 'Instant', revision: 1 }] };
        if (path === 'suppliers/reminders') return { reminders: reminders.filter(r => !r.completed).map(r => ({ ...r, supplier_name: 'Instant' })), more: false };
        if (path.endsWith('/resources')) {
          if (holdResources) await holdResources;
          return { resources: [{ id: record, title: 'Combined brief', standards: [{ number: '29777', version: '2' }] }], more: false };
        }
        return { reminders, more: false };
      } });
      const button = label => host.find(n => n.tag === 'button' && n.textContent === label);
      await button('Load / refresh reminders').events.click();
      const select = host.find(n => n.attrs.id === 'supplier-resource-' + supplierId);
      select.value = record; select.events.change();
      const details = host.find(n => n.attrs.id === 'supplier-update-' + supplierId);
      details.value = 'Updated resource'; details.events.input();
      const source = host.find(n => n.attrs.id === 'supplier-source-' + supplierId);
      source.value = 'Supplier email'; source.events.input();
      assert.equal(controller.hasUnsavedChanges(), true);
      await assert.rejects(controller.saveNow(), /unfinished update reminder/);
      await button('Add update reminder').events.click();
      assert.equal(writes[0].source, 'Supplier email');
      assert.equal(controller.hasUnsavedChanges(), false);
      assert.ok(host.find(n => n.textContent === 'Instant - Combined brief'));
      await button('Mark update reviewed').events.click();
      assert.equal(writes[1].completed, true);
      assert.ok(host.find(n => n.textContent === 'No updates awaiting review.'));
      await button('Reopen reminder').events.click();
      assert.equal(writes[2].completed, false);
      let release;
      holdResources = new Promise(resolve => { release = resolve; });
      const refreshing = button('Load / refresh reminders').events.click();
      await flush();
      const edited = host.find(n => n.attrs.id === 'supplier-update-' + supplierId);
      edited.value = 'Draft typed during refresh'; edited.events.input();
      release(); await refreshing;
      assert.equal(host.find(n => n.attrs.id === 'supplier-update-' + supplierId).value, 'Draft typed during refresh');
      assert.ok(host.find(n => n.attrs.role === 'alert' && /unsaved changes/.test(n.textContent)));
    });
test('library autosaves incomplete drafts privately and publishes once complete', async () => {
  const f = await libraryMetadataFixture({ fresh: true });
  await f.edit('library-title', 'Unfinished brief');
  await f.autosave();
  assert.equal(f.draftWrites[0].content.title, 'Unfinished brief');
  assert.equal(f.writes.length, 0);
  assert.equal(f.controller.hasUnsavedChanges(), false);
  assert.equal(f.created.length, 1);
  assert.ok(f.host.find(n => /Draft autosaved privately/.test(n.textContent)));
  await f.edit('library-supplier', 'Supplier');
  await f.click('Add standard');
  await f.edit('library-standard-0-number', '99999');
  await f.edit('library-standard-0-version', '2');
  await f.autosave();
  assert.equal(f.writes[0].content.title, 'Unfinished brief');
  assert.equal(f.writes[0].draftRevision, 2);
  assert.ok(f.host.find(n => /Library entry autosaved/.test(n.textContent)));
});
test('library autosave reports draft failure and preserves a saved draft on publication conflict', async () => {
  let failDraft = true;
  const f = await libraryMetadataFixture({ saveRequest: async path => {
    if (path.endsWith('/draft')) {
      if (failDraft) throw new Error('Draft storage unavailable');
      return { draftRevision: 1 };
    }
    throw new Error('Another teacher changed this library entry');
  } });
  await f.edit('library-notes', 'Keep my draft');
  await f.autosave();
  assert.equal(f.controller.hasUnsavedChanges(), true);
  assert.ok(f.host.find(n => n.attrs.role === 'alert' && /Draft storage unavailable/.test(n.textContent)));
  failDraft = false;
  await f.click('Save now');
  assert.equal(f.controller.hasUnsavedChanges(), false);
  assert.ok(f.host.find(n => n.attrs.role === 'alert' && /private draft is saved.*Another teacher/.test(n.textContent)));
  assert.equal(f.find('library-notes').value, 'Keep my draft');
});
test('library deletion requires confirmation and deleted entries can be restored', async () => {
  const host = node(), entry = libraryEntry(), operations = [];
  let deleted = false, confirmed = false;
  const context = { assessmentLibrarySchema: librarySchema, plannerModerationSchema: schema, crypto, URL, console: { error() {} }, confirm: () => confirmed };
  vm.runInNewContext(librarySource, context);
  await context.assessmentResourceLibrary.mountPage(host, { el: node, year: 2026, navigate: async () => {},
    request: async (path, options) => {
      if (options) {
        operations.push([path, options.method, options.body && JSON.parse(options.body)]);
        deleted = options.method === 'DELETE';
        return {};
      }
      if (path === 'resource-library/drafts') return { drafts: [] };
      if (path === 'resource-library/deleted') return { records: deleted ? [{ id: entry.id, title: entry.content.title }] : [] };
      return { records: deleted ? [] : [{ id: entry.id, revision: entry.revision, ...entry.content }], total: deleted ? 0 : 1 };
    } });
  const click = async label => {
    const control = host.find(n => n.tag === 'button' && n.textContent === label);
    assert.ok(control, label); await control.events.click();
  };
  await click('Delete');
  assert.equal(operations.length, 0);
  confirmed = true;
  await click('Delete');
  assert.deepEqual(operations[0], ['resource-library/' + entry.id, 'DELETE', { revision: entry.revision }]);
  assert.equal(host.find(n => n.tag === 'button' && n.textContent === 'Delete'), undefined);
  await click('Restore');
  assert.equal(operations[1][1], 'POST');
  assert.ok(host.find(n => n.tag === 'button' && n.textContent === 'Delete'));
});
test('library links a matching own moderation record and refreshes its evaluation without changing sheet details', async () => {
  const entry = libraryEntry(), original = { standardNumber: '99999', version: '2', title: 'My assessment',
    internal: JSON.stringify({ evaluationComments: 'Adjust spreadsheet marking', evaluationName: 'Teacher' }) };
  let saved;
  const f = await libraryMetadataFixture({ entry, prior: [{ entry_key: record, standard_number: '99999', title: 'My assessment' }],
    recordContent: original, linkWrite: async (path, body) => { saved = { path, ...body }; return { revision: 2 }; },
    evaluationRequest: () => ({ evaluations: saved ? [{ year: 2026, standardNumber: '99999', name: 'Teacher',
      position: '', date: '', comments: 'Adjust spreadsheet marking' }] : [], more: false }) });
  const section = f.host.find(n => n.tag === 'section' && n.children[0]?.textContent === 'Internal moderation records');
  const evaluation = f.host.find(n => n.tag === 'section' && n.children[0]?.textContent === 'Assessment evaluations');
  assert.ok(f.host.children[0].children.indexOf(section) < f.host.children[0].children.indexOf(evaluation));
  const select = f.find('library-moderation-record');
  select.value = record; select.events.change();
  const open = section.find(n => n.tag === 'a');
  assert.equal(open.hidden, false);
  assert.match(open.attrs.href, /section=moderation/);
  assert.match(open.attrs.href, /page=internal/);
  assert.match(open.attrs.href, new RegExp(record));
  await f.click('Link selected record');
  assert.equal(saved.path, '2026/moderation/' + record);
  assert.equal(saved.revision, 1);
  assert.deepEqual(saved.content, { ...original, resourceLibraryId: entry.id });
  assert.ok(evaluation.find(n => n.textContent === 'Adjust spreadsheet marking'));
});
test('library refuses mismatched versions and existing links instead of changing the moderation record', async () => {
  for (const change of [{ version: '3' }, { resourceLibraryId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }]) {
    let written = false;
    const f = await libraryMetadataFixture({ prior: [{ entry_key: record, standard_number: '99999', title: 'My assessment' }],
      recordContent: { standardNumber: '99999', version: '2', ...change }, linkWrite: async () => { written = true; return { revision: 2 }; } });
    const select = f.find('library-moderation-record'); select.value = record; select.events.change();
    await f.click('Link selected record');
    assert.equal(written, false);
    assert.ok(f.host.find(n => n.attrs.role === 'alert' && /do not match|different library entry/.test(n.textContent)));
  }
});
test('linking is cancelled without sharing if confirmation is declined', async () => {
  let written = false;
  const f = await libraryMetadataFixture({ prior: [{ entry_key: record, standard_number: '99999', title: 'My assessment' }],
    recordContent: { standardNumber: '99999', version: '2' }, confirmResponse: false,
    linkWrite: async () => { written = true; return { revision: 2 }; } });
  const select = f.find('library-moderation-record'); select.value = record; select.events.change();
  await f.click('Link selected record');
  assert.equal(written, false);
});
test('library can unlink an association but will not remove a saved moderation snapshot', async () => {
  const entry = libraryEntry();
  for (const withSnapshot of [false, true]) {
    let written;
    const original = { standardNumber: '99999', version: '2', internal: '{"evaluationComments":"Keep"}',
      resourceLibraryId: entry.id, ...(withSnapshot ? { resourceLibrary: JSON.stringify(librarySchema.snapshot(entry, '99999', '2')) } : {}) };
    const f = await libraryMetadataFixture({ entry, prior: [{ entry_key: record, standard_number: '99999' }],
      recordContent: original, linkWrite: async (path, body) => { written = body; return { revision: 2 }; } });
    const select = f.find('library-moderation-record'); select.value = record; select.events.change();
    await f.click('Unlink selected record');
    if (withSnapshot) {
      assert.equal(written, undefined);
      assert.ok(f.host.find(n => n.attrs.role === 'alert' && /cannot be unlinked/.test(n.textContent)));
    } else {
      const { resourceLibraryId, ...expected } = original;
      assert.deepEqual(written.content, expected);
    }
  }
});
test('new library critiques prefill editable signed-in details without changing existing critiques', async () => {
  const entry = libraryEntry();
  const f = await libraryMetadataFixture({ entry, displayName: '  Signed In Teacher  ', userEmail: 'teacher@WestlandHigh.school.nz' });
  assert.equal(f.find('library-critique-0-name').value, 'Approved Critiquer');
  assert.equal(f.find('library-critique-0-school').value, 'Synthetic School');
  assert.equal(f.find('library-critique-0-position').value, '');
  await f.click('Add critique');
  assert.equal(f.find('library-critique-1-name').value, 'Signed In Teacher');
  assert.equal(f.find('library-critique-1-school').value, 'Westland High School');
  assert.equal(f.find('library-critique-1-position').value, '');
  await f.edit('library-critique-1-name', 'Different Critiquer');
  await f.edit('library-critique-1-school', 'Another School');
  await f.edit('library-critique-1-position', 'Head of Department');
  await f.controller.saveNow();
  const [original, added] = f.writes[0].content.critiques;
  assert.deepEqual(original, entry.content.critiques[0]);
  assert.equal(added.name, 'Different Critiquer');
  assert.equal(added.school, 'Another School');
  assert.equal(added.position, 'Head of Department');
  assert.equal(librarySchema.validate(f.writes[0].content), '');
});
test('new library critiques leave unavailable name and unrecognised school blank', async () => {
  for (const displayName of ['', 'My planner', 'teacher@example.test']) {
    const f = await libraryMetadataFixture({ displayName, userEmail: 'teacher@other.school.nz' });
    await f.click('Add critique');
    assert.equal(f.find('library-critique-1-name').value, '');
    assert.equal(f.find('library-critique-1-school').value, '');
    assert.equal(f.find('library-critique-1-position').value, '');
  }
});
test('library fills the signed-in critiquer current position without overwriting existing or other people', async () => {
  const entry = libraryEntry();
  entry.content.department = 'Technology';
  entry.content.critiques = [
    { ...entry.content.critiques[0], name: 'Signed In Teacher', position: '' },
    { ...entry.content.critiques[0], id: crypto.randomUUID(), name: 'Other Teacher', position: '' },
    { ...entry.content.critiques[0], id: crypto.randomUUID(), name: 'Signed In Teacher', position: 'Previous role' }
  ];
  const staffDirectory = { staff: [{ id: '1', name: 'Signed In Teacher (SIT)' }], departments: [
    { name: 'Science', leaders: [{ name: 'Signed In Teacher (SIT)', role: 'TIC', onLeave: false }] },
    { name: 'Technology', leaders: [{ name: 'Signed In Teacher (SIT)', role: 'HOL', acting: true, onLeave: false }] }
  ] };
  const f = await libraryMetadataFixture({ entry, staffDirectory, displayName: 'Signed In Teacher', userEmail: 'teacher@westlandhigh.school.nz' });
  assert.equal(f.find('library-critique-0-position').value, 'Acting HOL Technology');
  assert.equal(f.find('library-critique-1-position').value, '');
  assert.equal(f.find('library-critique-2-position').value, 'Previous role');
  await f.autosave();
  assert.equal(f.writes[0].content.critiques[0].position, 'Acting HOL Technology');
  await f.click('Add critique');
  assert.equal(f.find('library-critique-3-position').value, 'Acting HOL Technology');
  await f.edit('library-critique-3-name', 'Different Critiquer');
  assert.equal(f.find('library-critique-3-position').value, '');
  await f.edit('library-critique-3-position', 'External assessor');
  await f.edit('library-critique-3-name', 'Another Critiquer');
  assert.equal(f.find('library-critique-3-position').value, 'External assessor');
});
test('library does not guess an unavailable, ambiguous or on-leave leadership position', async () => {
  const leader = { name: 'Signed In Teacher (SIT)', role: 'HOL', onLeave: false };
  const staff = [{ id: '1', name: 'Signed In Teacher (SIT)' }];
  for (const staffDirectory of [
    { staff: [...staff, { id: '2', name: 'Signed In Teacher (SIT2)' }], departments: [{ name: 'Technology', leaders: [leader] }] },
    { staff, departments: [{ name: 'Technology', leaders: [{ ...leader, onLeave: true }] }] },
    { staff, departments: [{ name: 'Technology', leaders: [leader, { ...leader, role: 'HOLA' }] }] }
  ]) {
    const f = await libraryMetadataFixture({ staffDirectory, displayName: 'Signed In Teacher' });
    await f.click('Add critique');
    assert.equal(f.find('library-critique-1-position').value, '');
    assert.ok(f.host.find(n => /unique match|No single current leadership/.test(n.textContent)));
  }
});
test('refreshing a failed staff lookup fills eligible positions without replacing manual edits', async () => {
  const entry = libraryEntry();
  entry.content.department = 'Technology';
  entry.content.critiques = [
    { ...entry.content.critiques[0], name: 'Signed In Teacher', position: '' },
    { ...entry.content.critiques[0], id: crypto.randomUUID(), name: 'Signed In Teacher', position: '' }
  ];
  let available = false;
  const f = await libraryMetadataFixture({ entry, displayName: 'Signed In Teacher', staffRequest: () => {
    if (!available) throw new Error('Staff directory unavailable');
    return { staff: [{ id: '1', name: 'Signed In Teacher (SIT)' }], departments: [
      { name: 'Technology', leaders: [{ name: 'Signed In Teacher (SIT)', role: 'HOL', onLeave: false }] }
    ] };
  } });
  assert.equal(f.find('library-critique-0-position').value, '');
  assert.ok(f.host.find(n => n.attrs.role === 'alert' && /Staff directory unavailable/.test(n.textContent)));
  await f.edit('library-critique-1-position', 'My chosen position');
  available = true;
  await f.click('Refresh metadata sources');
  assert.equal(f.find('library-critique-0-position').value, 'HOL Technology');
  assert.equal(f.find('library-critique-1-position').value, 'My chosen position');
  await f.edit('library-critique-0-position', '');
  await f.click('Refresh metadata sources');
  assert.equal(f.find('library-critique-0-position').value, '');
  await f.controller.saveNow();
  const saved = f.writes.at(-1).content;
  assert.equal(saved.critiques[0].positionAutofillDisabled, true);
  const reopened = await libraryMetadataFixture({ entry: { ...entry, revision: 2, content: saved },
    displayName: 'Signed In Teacher', staffRequest: () => ({ staff: [{ id: '1', name: 'Signed In Teacher (SIT)' }],
      departments: [{ name: 'Technology', leaders: [{ name: 'Signed In Teacher (SIT)', role: 'HOL', onLeave: false }] }] }) });
  assert.equal(reopened.find('library-critique-0-position').value, '');
});
test('library editor records each of the eight critique checks without filling old answers automatically', async () => {
  const f = await libraryMetadataFixture();
  const checks = schema.critique.slice(4);
  assert.equal(checks.length, 8);
  for (const [key] of checks) assert.equal(f.find('library-critique-0-check-' + key).value, '');
  for (const [index, [key]] of checks.entries()) {
    await f.edit('library-critique-0-check-' + key, ['Yes', 'No', 'Not applicable', ''][index % 4]);
  }
  await f.controller.saveNow();
  const saved = f.writes[0].content.critiques[0];
  for (const [index, [key]] of checks.entries()) assert.equal(saved.checks[key], ['Yes', 'No', 'Not applicable', ''][index % 4]);
  assert.equal(librarySchema.validate(f.writes[0].content), '');
});
test('combined assessments add multiple setup standards, preserve each version and match either standard', async () => {
  const setupStandards = [
    { number: '29785', version: '2', title: 'Word processing' },
    { number: '29786', version: '3', title: 'Spreadsheets' }
  ];
  const f = await libraryMetadataFixture({ fresh: true, setupStandards, metadataRequest: number => ({
    number, version: number === '29785' ? '2' : '3', title: 'Standard ' + number, level: '3', credits: '5'
  }) });
  const choice = title => f.host.find(n => n.tag === 'label' && n.children.some(child => child.textContent.includes(title))).children[0];
  choice('Word processing').checked = true; choice('Spreadsheets').checked = true;
  await f.click('Add selected standards');
  assert.equal(f.find('library-standard-0-number').value, '29785');
  assert.equal(f.find('library-standard-1-number').value, '29786');
  assert.equal(f.find('library-standard-1-version').value, '3');
  assert.equal(f.find('library-standard-1-credits').value, '5');
  assert.equal(f.find('library-title').value, '');
  choice('Word processing').checked = true;
  await f.click('Add selected standards');
  assert.equal(f.find('library-standard-2-number'), undefined);
  await f.edit('library-title', 'Combined assessment');
  await f.edit('library-supplier', 'Synthetic Supplier');
  await f.controller.saveNow();
  const saved = f.writes[0].content, entry = { ...libraryEntry(), content: saved };
  assert.deepEqual(saved.standards.map(({ number, version }) => [number, version]), [['29785', '2'], ['29786', '3']]);
  const reloaded = await libraryMetadataFixture({ entry, setupStandards });
  assert.equal(reloaded.find('library-standard-1-number').value, '29786');
  assert.equal(librarySchema.snapshot(entry, '29785', '2').standardNumber, '29785');
  assert.equal(librarySchema.snapshot(entry, '29786', '3').standardNumber, '29786');
  assert.throws(() => librarySchema.snapshot(entry, '29786', '2'), /does not match/);
});
test('adding a selection beyond the standards limit does not partially add it', async () => {
  const entry = libraryEntry();
  entry.content.standards = Array.from({ length: 29 }, (_, i) => ({ number: String(10000 + i), version: '1' }));
  const setupStandards = [{ number: '29785', version: '2', title: 'Word processing' }, { number: '29786', version: '2', title: 'Spreadsheets' }];
  const f = await libraryMetadataFixture({ entry, setupStandards });
  for (const title of ['Word processing', 'Spreadsheets']) {
    f.host.find(n => n.tag === 'label' && n.children.some(child => child.textContent.includes(title))).children[0].checked = true;
  }
  await f.click('Add selected standards');
  assert.ok(f.host.find(n => n.attrs.role === 'alert' && /at most 30 standards/.test(n.textContent)));
  assert.equal(f.find('library-standard-29-number'), undefined);
  assert.equal(f.controller.hasUnsavedChanges(), false);
  assert.equal(f.requests.some(path => path.includes('/details')), false);
});
test('library standards sit inside Assessment edition and reuse setup, NZQA and moderation details with multi-class persistence', async () => {
  const f = await libraryMetadataFixture({ fresh: true,
    prior: [{ entry_key: record, standard_number: '99999' }],
    recordContent: { standardNumber: '99999', version: '2', standardTitle: 'Older title', title: 'Database purchased assessment',
      department: 'Technology', subject: 'Digital Technologies', course: '12DTECH, 13COMP' }
  });
  const edition = f.host.find(n => n.tag === 'fieldset' && n.children[0]?.textContent === 'Assessment edition');
  assert.equal(edition.children[1].children[0].textContent, 'Standards covered');
  assert.ok(f.host.find(n => n.tag === 'a' && n.attrs.href === '#year=2026&section=standards'));
  await f.click('Add standard');
  await f.edit('library-setup-standard', '99999');
  assert.equal(f.find('library-standard-1-number'), undefined);
  assert.equal(f.find('library-standard-0-credits').value, '6');
  assert.equal(f.find('library-standard-0-level').value, '2');
  assert.equal(f.find('library-title').value, '');
  assert.equal(f.find('library-department').value, 'Technology');
  assert.equal(f.find('library-subject').tag, 'select');
  assert.equal(f.find('library-subject').value, 'Digital Technologies');
  const classBox = edition.find(n => n.tag === 'fieldset' && n.children[0]?.textContent === 'Class Codes');
  const check = code => classBox.find(n => n.attrs.type === 'checkbox' && n.attrs.value === code);
  assert.equal(check('12DTECH').checked, true);
  assert.equal(check('13COMP').checked, true);
  check('11DTECH').checked = true; check('11DTECH').events.change();
  await f.edit('library-class-code', '13dtech'); await f.click('Add class code');
  await f.edit('library-title', 'Database purchased assessment');
  await f.edit('library-supplier', 'Synthetic Supplier');
  await f.click('Save now');
  const saved = f.writes[0].content;
  assert.deepEqual(saved.classCodes, ['12DTECH', '13COMP', '11DTECH', '13DTECH']);
  assert.equal(saved.standards[0].title, 'Official NZQA title');
  assert.equal(librarySchema.validate(saved), '');
  const reloaded = await libraryMetadataFixture({ entry: { ...libraryEntry(), content: saved } });
  assert.equal(reloaded.controller.hasUnsavedChanges(), false);
  for (const code of saved.classCodes) assert.equal(reloaded.host.find(n => n.attrs.type === 'checkbox' && n.attrs.value === code).checked, true);
  assert.equal(reloaded.find('library-standard-0-credits').value, '6');
  assert.equal(reloaded.requests.some(path => path.includes('/details')), false);
});
test('library prefill preserves entered values and does not copy metadata from a different NZQA version', async () => {
  const entry = libraryEntry();
  entry.content.subject = 'Saved subject'; entry.content.department = 'Saved department'; entry.content.classCodes = ['11DTECH'];
  entry.content.standards = [{ number: '99999', version: '1', credits: '7', level: '1' }];
  const f = await libraryMetadataFixture({ entry, prior: [{ entry_key: record, standard_number: '99999' }],
    recordContent: { standardNumber: '99999', version: '2', credits: '4', level: '2', subject: 'Other subject', course: '12DTECH' } });
  await f.click('Fill missing details for standard 1');
  assert.equal(f.find('library-standard-0-version').value, '1');
  assert.equal(f.find('library-standard-0-credits').value, '7');
  assert.equal(f.find('library-standard-0-level').value, '1');
  assert.equal(f.find('library-subject').value, 'Saved subject');
  assert.equal(f.find('library-department').value, 'Saved department');
  assert.ok(f.host.find(n => n.attrs.role === 'alert' && /currently lists version 2/.test(n.textContent)));
  await f.click('Save now');
  assert.equal(f.writes[0].content.title, entry.content.title);
  assert.deepEqual(f.writes[0].content.classCodes, ['11DTECH']);
  assert.equal(f.writes[0].content.standards[0].title, undefined);
});
test('library metadata errors remain visible and in-flight lookups cannot overwrite a changed version', async () => {
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const f = await libraryMetadataFixture({ metadataRequest: () => pending,
    sourceRequest: async () => { throw new Error('Directory temporarily unavailable'); } });
  assert.ok(f.host.find(n => n.attrs.role === 'alert' && /Directory temporarily unavailable/.test(n.textContent)));
  assert.equal(f.controller.hasUnsavedChanges(), false);
  const loading = f.click('Fill missing details for standard 1');
  await assert.rejects(f.controller.saveNow(), /Wait for standard details/);
  await f.edit('library-standard-0-version', '1');
  finish({ number: '99999', version: '2', credits: '6', level: '2', title: 'New title' });
  await loading;
  assert.equal(f.find('library-standard-0-version').value, '1');
  assert.equal(f.find('library-standard-0-credits').value, '');
  assert.ok(f.host.find(n => n.attrs.role === 'alert' && /changed while loading/.test(n.textContent)));
  await f.click('Save now');
  assert.equal(f.writes[0].content.standards[0].version, '1');
});
test('unavailable NZQA details are reported while same-version saved standard metadata remains usable', async () => {
  const f = await libraryMetadataFixture({ metadataRequest: async () => { throw new Error('NZQA temporarily unavailable'); } });
  await f.click('Fill missing details for standard 1');
  assert.equal(f.find('library-standard-0-credits').value, '4');
  assert.equal(f.find('library-standard-0-level').value, '2');
  assert.ok(f.host.find(n => n.attrs.role === 'alert' && /NZQA temporarily unavailable/.test(n.textContent)));
  await f.click('Save now');
  assert.equal(f.writes[0].content.standards[0].version, '2');
});
test('assessment evaluation is below results, preserves existing evaluator details, and ticks review for comments or past results', async () => {
  const past = fixture({ page: 'internal', displayName: '', data: { internal: JSON.stringify({
    resultsDate: '2000-01-01', reviewed: 'No', evaluationName: 'Another Teacher', evaluationPosition: 'Teacher',
    evaluationDate: '2026-01-02', evaluationComments: ''
  }) } });
  await flush();
  const get = id => past.host.find(n => n.attrs.id === 'moderation-internal-' + id);
  assert.equal(get('reviewed').checked, true);
  assert.equal(JSON.parse(past.host.find(n => n.attrs.name === 'internal').value).reviewed, 'Yes');
  assert.equal(get('evaluationName').value, 'Another Teacher');
  assert.equal(get('evaluationPosition').value, 'Teacher');
  const results = past.host.find(n => n.tag === 'h3' && n.textContent === 'D. Results, retention and review');
  const evaluation = past.host.find(n => n.tag === 'h3' && n.textContent === 'Assessment Evaluation');
  assert.ok(past.host.all().indexOf(results) < past.host.all().indexOf(evaluation));
  assert.ok(past.host.all().indexOf(get('evaluationName')) < past.host.all().indexOf(get('evaluationComments')));
  const future = fixture({ page: 'internal', displayName: '', data: { internal: JSON.stringify({ resultsDate: '2100-01-01', reviewed: 'No' }) } });
  await flush();
  const control = id => future.host.find(n => n.attrs.id === 'moderation-internal-' + id);
  assert.equal(control('reviewed').checked, false);
  control('resultsDate').value = new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  control('resultsDate').events.input();
  assert.equal(control('reviewed').checked, false, 'today has not passed');
  control('evaluationComments').value = '   '; control('evaluationComments').events.input();
  assert.equal(control('reviewed').checked, false);
  control('evaluationComments').value = 'Adjust the assessment next year.'; control('evaluationComments').events.input();
  assert.equal(control('reviewed').checked, true);
  control('evaluationComments').value = ''; control('evaluationComments').events.input();
  assert.equal(control('reviewed').checked, true);
  control('reviewed').checked = false; control('reviewed').events.change();
  assert.equal(control('reviewed').checked, false);
  control('resultsDate').value = '2000-01-01'; control('resultsDate').events.input();
  assert.equal(control('reviewed').checked, true);
  control('reviewed').checked = false; control('reviewed').events.change();
  assert.equal(control('reviewed').checked, true, 'the automatic condition remains active');
});
test('opening an existing unnamed evaluation never attributes it to the current user', async () => {
  const f = fixture({ page: 'internal', data: { internal: JSON.stringify({ evaluationComments: 'Existing feedback' }) } });
  await flush();
  assert.equal(f.host.find(n => n.attrs.id === 'moderation-internal-evaluationName').value, '');
  assert.equal(f.host.find(n => n.attrs.id === 'moderation-internal-evaluationPosition').value, '');
});
test('entering evaluation comments sets an editable NZ date without inventing dates for old comments', async () => {
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : ['2026-11-14T12:30:00Z'])); }
  }
  const f = fixture({ page: 'internal', clock: Clock, data: { internal: '{}' } });
  await flush();
  const control = key => f.host.find(n => n.attrs.id === 'moderation-internal-' + key);
  const saved = () => JSON.parse(f.host.find(n => n.attrs.name === 'internal').value);
  assert.equal(control('evaluationDate').value, '');
  control('evaluationComments').value = '   '; control('evaluationComments').events.input();
  assert.equal(control('evaluationDate').value, '');
  control('evaluationComments').value = 'Evaluation feedback'; control('evaluationComments').events.input();
  assert.equal(control('evaluationDate').value, '2026-11-15');
  assert.equal(saved().evaluationDate, '2026-11-15');
  control('evaluationDate').value = '2026-10-01'; control('evaluationDate').events.input();
  control('evaluationComments').value = 'Revised feedback'; control('evaluationComments').events.input();
  assert.equal(saved().evaluationDate, '2026-10-01');
  control('evaluationComments').value = ''; control('evaluationComments').events.input();
  assert.equal(saved().evaluationDate, '2026-10-01');
  const previous = fixture({ page: 'internal', clock: Clock, data: { internal: JSON.stringify({ evaluationComments: 'Old feedback' }) } });
  await flush();
  assert.equal(previous.host.find(n => n.attrs.id === 'moderation-internal-evaluationDate').value, '');
  assert.equal(JSON.parse(previous.host.find(n => n.attrs.name === 'internal').value).evaluationDate, undefined);
});
test('library displays distinct shared evaluations and reports unavailable copies', async () => {
  let fail = false;
  const f = await libraryMetadataFixture({ evaluationRequest: () => {
    if (fail) throw new Error('Storage unavailable');
    return { evaluations: [
      { year: 2026, standardNumber: '99999', name: 'Teacher A', position: 'Teacher', date: '2026-04-01', comments: 'First review' },
      { year: 2027, standardNumber: '99999', name: 'Teacher B', position: 'Head', date: '2027-04-01', comments: 'Second review' }
    ], more: false };
  } });
  const section = f.host.find(n => n.tag === 'section' && n.children[0]?.textContent === 'Assessment evaluations');
  assert.ok(section.find(n => n.textContent === 'First review'));
  const details = section.find(n => n.attrs.class === 'library-evaluation-details');
  assert.deepEqual(details.children.map(field => field.children.map(n => n.textContent)),
    [['Evaluator name', 'Teacher A'], ['Evaluator position', 'Teacher'], ['Evaluation date', '2026-04-01']]);
  assert.ok(section.find(n => n.textContent === 'Second review'));
  assert.ok(section.find(n => n.textContent === '2026 - Standard 99999'));
  assert.ok(section.find(n => n.textContent === '2027 - Standard 99999'));
  fail = true; await f.click('Refresh evaluations');
  assert.match(section.find(n => n.attrs.role === 'alert').textContent, /Storage unavailable/);
});
test('library groups identical evaluations across standards and shows standards with no result', async () => {
  const entry = libraryEntry();
  entry.content.standards = [{ number: '29785', version: '2' }, { number: '29786', version: '2' },
    { number: '29787', version: '2' }, { number: '29787', version: '3' }];
  const f = await libraryMetadataFixture({ entry, evaluationRequest: () => ({ evaluations: [
    { year: 2026, standardNumber: '29785', standardVersion: '2', name: 'Teacher', position: 'Teacher',
      date: '2026-04-01', comments: 'Same feedback', match: 'standard' },
    { year: 2026, standardNumber: '29786', standardVersion: '2', name: 'Teacher', position: 'Teacher',
      date: '2026-04-01', comments: 'Same feedback', match: 'standard' },
    { year: 2026, standardNumber: '29787', standardVersion: '2', name: 'Teacher', position: 'Teacher',
      date: '2026-04-01', comments: 'Different feedback', match: 'linked' }
  ], more: false }) });
  const section = f.host.find(n => n.tag === 'section' && n.children[0]?.textContent === 'Assessment evaluations');
  assert.equal(section.all().filter(n => n.textContent === 'Same feedback').length, 1);
  assert.equal(section.all().filter(n => n.textContent === 'Evaluator name').length, 1);
  assert.ok(section.find(n => n.tag === 'h4' && n.textContent.includes('Standard 29785 v2') &&
    n.textContent.includes('Standard 29786 v2') && n.textContent.includes('private automatic match')));
  assert.ok(section.find(n => n.textContent === 'Different feedback'));
  assert.ok(section.find(n => n.tag === 'dt' && n.textContent.includes('Evaluation comments') && n.textContent.includes('Standard 29787 v2')));
  assert.ok(section.find(n => n.textContent === 'Standard 29787 v3'));
  assert.ok(section.find(n => n.textContent === 'No evaluation available to show for this standard.'));
});
test('library explains which standard needs manual matching when multiple assessments overlap', async () => {
  const f = await libraryMetadataFixture({ evaluationRequest: () => ({ standards: [
    { number: '99999', version: '2', ambiguous: true }
  ], evaluations: [], more: false }) });
  const section = f.host.find(n => n.tag === 'section' && n.children[0]?.textContent === 'Assessment evaluations');
  assert.ok(section.find(n => n.textContent === 'Standard 99999 v2'));
  assert.ok(section.find(n => /Multiple library assessments match/.test(n.textContent)));
});
test('library brief fields are labelled and laid out beside classes without changing saved supplier editions', async () => {
  const entry = libraryEntry(), f = await libraryMetadataFixture({ entry });
  const title = f.find('library-title'), description = f.find('library-description');
  assert.equal(title.parentElement.children[0].textContent, 'Assessment Brief Title');
  assert.equal(description.parentElement.children[0].textContent, 'Assessment Brief Description');
  assert.equal(f.find('library-edition'), undefined);
  const grid = description.parentElement.parentElement;
  assert.equal(grid.attrs.class, 'moderation-fields library-edition-fields');
  assert.equal(description.parentElement.attrs.class, 'planner-field library-edition-description');
  assert.ok(grid.children.some(n => n.attrs.class === 'library-class-box'));
  await f.edit('library-description', 'Combined brief description');
  await f.controller.saveNow();
  assert.equal(f.writes[0].content.edition, entry.content.edition);
  assert.equal(f.writes[0].content.description, 'Combined brief description');
});
test('moderation can select a library brief with no supplier edition', async () => {
  const entry = libraryEntry(); entry.content.edition = '';
  const f = fixture({ page: 'internal', displayName: '', libraryRequest: path =>
    path.includes('?') ? { records: [{ id: entry.id, ...entry.content }], total: 1 } : entry });
  await flush(); await f.click('Choose from Resource Library'); await flush();
  const select = f.host.find(n => n.attrs.id === 'moderation-library-entry');
  assert.equal(select.children[1].textContent, 'Purchased task (Synthetic Supplier)');
  select.value = entry.id; await select.events.change();
  await f.click('Fill missing from library');
  assert.ok(f.host.find(n => /Saved selection: Purchased task \(library revision 1\)/.test(n.textContent)));
  assert.doesNotMatch(JSON.parse(f.saved.at(-1).internal).source, /\(edition\s*\)/);
});
test('a linked evaluation can later use the same library entry and approved critique', async () => {
  const entry = libraryEntry();
  const f = fixture({ page: 'internal', displayName: '', data: { resourceLibraryId: entry.id,
    internal: JSON.stringify({ evaluationComments: 'Keep my evaluation' }) },
    libraryRequest: path => path.includes('?') ? { records: [{ id: entry.id, ...entry.content }], total: 1 } : entry });
  await flush(); await f.click('Choose from Resource Library'); await flush();
  const select = f.host.find(n => n.attrs.id === 'moderation-library-entry');
  select.value = entry.id; await select.events.change();
  const critique = f.host.find(n => n.attrs.id === 'moderation-library-critique');
  critique.value = entry.content.critiques[0].id; await critique.events.change();
  await f.click('Fill missing from library');
  const saved = f.saved.at(-1);
  assert.equal(saved.resourceLibraryId, entry.id);
  assert.equal(JSON.parse(saved.resourceLibrary).critiqueId, entry.content.critiques[0].id);
  assert.equal(JSON.parse(saved.internal).evaluationComments, 'Keep my evaluation');
});