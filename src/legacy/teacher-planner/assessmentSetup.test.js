const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function node(tag = 'div', text = '', attrs = {}) {
  return {
    tag, textContent: text, attrs, children: [], events: {}, value: '', maxLength: 20000,
    isConnected: true, disabled: false,
    append(...children) { for (const child of children) { child.parent = this; this.children.push(child); } },
    replaceChildren(...children) { this.children = []; this.append(...children); },
    addEventListener(type, callback) { this.events[type] = callback; },
    dispatchEvent(event) { this.events[event.type]?.(event); if (event.bubbles) this.parent?.dispatchEvent(event); return true; },
    setAttribute(key, value) { this.attrs[key] = value; if (key === 'value' || key === 'id') this[key] = value; },
    focus() { this.focused = true; },
    querySelector(selector) {
      for (const child of this.children) {
        if ((selector === 'button' && child.tag === 'button') ||
            (selector === 'input' && child.tag === 'input')) return child;
        const found = child.querySelector(selector);
        if (found) return found;
      }
      return null;
    },
    find(predicate) {
      for (const child of this.children) {
        if (predicate(child)) return child;
        const found = child.find(predicate);
        if (found) return found;
      }
      return null;
    }
  };
}

const planner = fs.readFileSync(require.resolve('./public/planner.js'), 'utf8');
const implementation = planner.slice(planner.indexOf('  function renderAssessmentSetup('), planner.indexOf('  function renderSetup('));
const standard = { number: '92004', subject: 'Digital Technologies', title: 'Create a computer program',
  credits: '5 credits', level: '1', version: '2', assessment: 'Internal', url: 'https://www.nzqa.govt.nz/nqfdocs/ncea-resource/achievements/2024/as92004.pdf' };
const flush = () => new Promise(resolve => setImmediate(resolve));

function fixture({ selectedStandards = [], searchError = false } = {}) {
  const content = node(), calls = [], notices = [], moderationMounted = [];
  const context = {
    el: node, year: 2026, content, Event, URLSearchParams,
    api: '/api/planner/',
    console: { error: (...args) => calls.push(args) },
    notice: (...args) => notices.push(args),
    refreshSession: async () => {},
    mountModerationSetup: host => moderationMounted.push(host),
    request: async url => {
      calls.push(url);
      if (searchError) throw new Error('NZQA standards search is unavailable.');
      return { standards: [standard], resultsUrl: 'https://www.nzqa.govt.nz/ncea/assessment/search.do?query=test' };
    }
  };
  vm.runInNewContext(implementation + '\nglobalThis.renderAssessmentSetup = renderAssessmentSetup;', context);
  context.renderAssessmentSetup({ selectedStandards: JSON.stringify(selectedStandards) });
  return { content, calls, notices, context, moderationMounted };
}

test('Assessment Setup searches NZQA, privately adds a standard and removes it from My Standards', async () => {
  const f = fixture();
  await flush();
  const saved = f.content.children[0], folder = f.content.children[1];
  const tabs = folder.children[0].children;
  const library = folder.children[1], mine = folder.children[2];
  assert.equal(tabs[0].textContent, 'Standards Library');
  assert.equal(tabs[1].children[1].textContent, '(0)');
  assert.equal(library.hidden, false);
  assert.equal(mine.hidden, true);
  assert.equal(f.calls.length, 0);
  assert.ok(library.find(child => child.textContent === 'Enter a subject, keyword or standard number, then choose Search NZQA.'));
  const searchForm = library.find(child => child.tag === 'form');
  searchForm.find(child => child.tag === 'input').value = 'Digital Technologies';
  await searchForm.events.submit({ preventDefault() {} });
  assert.equal(f.calls[0], '/api/planner/standards/search?q=Digital+Technologies&view=all&level=all');
  assert.equal(f.content.events.input, undefined);
  assert.ok(library.find(child => child.tag === 'a' && child.textContent === 'Open this search on NZQA'));
  const add = library.find(child => child.tag === 'button' && child.textContent === 'Add to My Standards');
  assert.ok(add);
  let changed = 0;
  f.content.addEventListener('input', () => changed++);
  add.events.click();
  await flush();
  assert.equal(JSON.parse(saved.value)[0].number, '92004');
  assert.equal(JSON.parse(saved.value)[0].level, '1');
  assert.ok(library.find(child => child.tag === 'p' && child.textContent.includes('Level 1')));
  assert.equal(changed, 1);
  assert.equal(tabs[1].children[1].textContent, '(1)');
  assert.equal(mine.hidden, true);
  tabs[1].events.click();
  assert.equal(library.hidden, true);
  assert.equal(mine.hidden, false);
  assert.ok(mine.find(child => child.tag === 'a' && child.textContent === '92004 — Create a computer program'));
  mine.find(child => child.tag === 'button' && child.textContent === 'Remove').events.click();
  assert.deepEqual(JSON.parse(saved.value), []);
  assert.equal(tabs[1].children[1].textContent, '(0)');
});

test('Assessment Setup restores selected standards and reports NZQA search failures', async () => {
  const f = fixture({ selectedStandards: [standard], searchError: true });
  await flush();
  assert.equal(f.content.children[0].value, JSON.stringify([standard]));
  const folder = f.content.children[1], tabs = folder.children[0].children;
  assert.equal(tabs[1].children[1].textContent, '(1)');
  const library = folder.children[1];
  const searchForm = library.find(child => child.tag === 'form');
  searchForm.find(child => child.tag === 'input').value = 'Computing';
  await searchForm.events.submit({ preventDefault() {} });
  assert.equal(library.find(child => child.attrs.role === 'alert').textContent, 'NZQA standards search is unavailable.');
  tabs[1].events.keydown({ key: 'Home', preventDefault() {} });
  assert.equal(tabs[0].focused, true);
  assert.equal(library.hidden, false);
});
test('Assessment Setup includes an accessible lazy-loaded Setup Moderation tab without changing standards', () => {
  const f = fixture({ selectedStandards: [standard] });
  const saved = f.content.children[0], folder = f.content.children[1], tabs = folder.children[0].children;
  const moderation = folder.children[3];
  assert.equal(tabs.length, 3);
  assert.equal(tabs[2].textContent, 'Setup Moderation');
  assert.equal(moderation.hidden, true);
  assert.equal(f.moderationMounted.length, 0);
  tabs[0].events.keydown({ key: 'End', preventDefault() {} });
  assert.equal(tabs[2].focused, true);
  assert.equal(tabs[2].attrs['aria-selected'], 'true');
  assert.equal(tabs[2].attrs['aria-controls'], moderation.id);
  assert.equal(moderation.attrs.role, 'tabpanel');
  assert.equal(moderation.attrs['aria-labelledby'], tabs[2].id);
  assert.equal(moderation.attrs['data-planner-navigation'], '');
  assert.equal(moderation.hidden, false);
  assert.equal(f.moderationMounted[0], moderation);
  tabs[1].events.click();
  tabs[2].events.click();
  assert.equal(f.moderationMounted.length, 1);
  assert.equal(saved.value, JSON.stringify([standard]));
});
