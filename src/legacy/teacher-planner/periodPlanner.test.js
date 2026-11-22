const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { DOMParser: XmlParser } = require('@xmldom/xmldom');
class ClipboardParser {
  parseFromString(html) {
    const doc = new XmlParser().parseFromString('<html><body>' + html + '</body></html>', 'text/html');
    return { body: doc.getElementsByTagName('body')[0] };
  }
}
const source = fs.readFileSync(require.resolve('./public/planner.js'), 'utf8');

const flush = () => new Promise(resolve => setImmediate(resolve));
test('period priorities add and continue bullets without replacing saved text', () => {
  const context = { Event };
  vm.runInNewContext(source.slice(source.indexOf('  function bulletPriorities('), source.indexOf('  function renderPeriod(')), context);
  const input = {
    value: '', maxLength: 20000, selectionStart: 0, selectionEnd: 0, events: {}, inputs: [],
    addEventListener(type, handler) { this.events[type] = handler; },
    dispatchEvent(event) { this.inputs.push(event); },
    setRangeText(text, start, end) {
      this.value = this.value.slice(0, start) + text + this.value.slice(end);
      this.selectionStart = this.selectionEnd = start + text.length;
    }
  };
  context.bulletPriorities(input);
  input.events.focus();
  assert.equal(input.value, '\u2022 ');
  assert.equal(input.inputs[0].bubbles, true);
  input.value += 'First intention';
  input.selectionStart = input.selectionEnd = input.value.length;
  const enter = (extra = {}) => {
    let prevented = false;
    input.events.keydown({ key: 'Enter', preventDefault() { prevented = true; }, ...extra });
    return prevented;
  };
  assert.equal(enter(), true);
  assert.equal(input.value, '\u2022 First intention\n\u2022 ');
  enter();
  assert.equal(input.value, '\u2022 First intention\n');
  input.value = 'Previously saved text';
  input.events.focus();
  assert.equal(input.value, 'Previously saved text');
  input.selectionStart = input.selectionEnd = input.value.length;
  assert.equal(enter({ shiftKey: true }), false);
  assert.equal(enter({ isComposing: true }), false);
  enter();
  assert.equal(input.value, 'Previously saved text\n\u2022 ');
  input.value = 'abcdef';
  input.selectionStart = 1; input.selectionEnd = 4;
  enter();
  assert.equal(input.value, 'a\n\u2022 ef');
  input.maxLength = input.value.length;
  input.selectionStart = input.selectionEnd = input.value.length;
  const before = input.value;
  enter();
  assert.equal(input.value, before);
});
function node(tag = 'div', text = '', attrs = {}) {
  return {
    tag, textContent: text, attrs, children: [], events: {}, dataset: {}, isConnected: true,
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; },
    before(...children) { this.beforeNodes = [...(this.beforeNodes || []), ...children]; },
    addEventListener(type, handler) { this.events[type] = handler; },
    setAttribute(key, value) { this.attrs[key] = value; },
    removeAttribute(key) { delete this.attrs[key]; },
    hasAttribute(key) { return Object.hasOwn(this.attrs, key); },
    getAttribute(key) { return this.attrs[key]; },
    querySelectorAll() { return []; }
  };
}
function teachingSlotFixture(classKey = 'JPI') {
  const whanau = classKey === '9WHAU';
  const metadata = { teaching_date: '2026-11-23', session_slot: whanau ? 'whanau' : 'p2',
    class_key: classKey, session_type: whanau ? 'whanau' : 'teaching', start_time: whanau ? '08:45' : '10:00',
    room: 'CW', home_list: classKey, display_title: whanau ? 'Whānau check-in' : 'Binary Piano decoding' };
  const slots = whanau ? [
    ['Whānau', 'Roll and check-in', '', '', 'Take the roll in KAMAR and have an informal chat.'],
    ['Whānau', 'School notices', 'School notices', 'https://westlandhigh.school.kiwi/notices/date/2026-11-22', 'Verify notices; the linked date is Sunday.'],
    ['Whānau', 'Wednesday assembly and weekly events', 'School calendar', 'https://westlandhigh.school.kiwi/calendar/month/2026/11', 'Specific arrangements have not been verified.'],
    ['Whānau', 'Attendance update', '', '', 'Use current authorised KAMAR information.']
  ] : [
    ['Routine', 'Typing Kit', 'Existing CW Routine → Typing Kit', 'unresolved', 'Use the established Typing Kit routine.'],
    ['Routine', 'Minecraft', 'Existing CW Routine → Minecraft', 'unresolved', 'Continue the established Minecraft routine.'],
    ['Unit Library', 'Binary Piano — Review', 'Binary & Data → Binary Piano', 'unresolved', 'Completion remains awaiting confirmation in Planner.'],
    ['Unit Library', 'Binary Piano — Decoding', 'Binary & Data → Binary Piano', 'unresolved', 'Model examples, then guide practice.\nOffer independent decoding if ready.']
  ];
  const description = '[TEACHING_DASHBOARD_V1]\n' + Object.entries(metadata).map(([key, value]) => `${key}: ${value}`).join('\n') +
    '\n[/TEACHING_DASHBOARD_V1]\n\n## Teaching slots\n\n' + slots.map(([type, title, resource, url, details], index) =>
      `### SLOT ${index + 1} | ${type} | ${title}\n` + (resource ? `Resource: ${resource}\nResource URL: ${url}\n` : '') +
      `Details: ${details}`).join('\n\n') +
    '\n\n## Preparation & reminders\nCheck the prepared resources.\n\n## Continuation\nPreparation is not a record of delivery.';
  return { id: whanau ? 'b'.repeat(24) : 'a'.repeat(24), metadata, description,
    name: metadata.display_title, url: 'https://trello.com/c/AbCd1234', updatedAt: '2026-11-22T07:40:56.946Z', resources: [] };
}
const slotProgramme = { teaching: { unit: { title: 'Binary & Data', url: '/dtech-hub/learning-pathways/binary-and-data.html' },
  lesson: { title: 'Binary Piano', url: '/dtech-hub/learning-pathways/lesson-binary-piano.html' } },
routine: { instructions: 'TypingTest.com - AKA Typing Kit\n[Minecraft Player Kit](https://dtech-hub2.onrender.com/practical-skills/kit-worksheet.html?kit=kit-minecraft)' } };
const slotDescendants = host => [host, ...host.children.filter(child => typeof child === 'object').flatMap(slotDescendants)];
test('teaching workspaces render both four-slot sequences with the first activity selected and no progress controls', () => {
  const renderer = require('./public/teaching-slots');
  for (const classKey of ['JPI', '9WHAU']) {
    const card = teachingSlotFixture(classKey), parsed = renderer.parse(card.description);
    const view = renderer.render(node, card, classKey === 'JPI' ? slotProgramme : null), nodes = slotDescendants(view);
    const slots = nodes.filter(item => item.attrs.class === 'teaching-slot');
    assert.equal(slots.length, 4);
    assert.deepEqual(slots.map(item => item.children[0].children[0].textContent), parsed.slots.map(slot => slot.title));
    for (let index = 0; index < slots.length; index++) {
      assert.equal(slots[index].tag, 'button');
      assert.equal(slots[index].attrs.type, 'button', 'selection cannot submit the Notes form');
      assert.equal(slots[index].attrs['aria-pressed'], String(index === 0));
      const row = slots[index].children[0];
      assert.equal(row.children[0].tag, 'strong', 'the activity title comes before secondary labels');
      assert.deepEqual(row.children[1].children.map(label => label.textContent),
        ['Slot ' + parsed.slots[index].number, parsed.slots[index].type]);
    }
    const workspace = nodes.find(item => item.attrs.class === 'teaching-slot-workspace');
    assert.equal(workspace.children[0].children[1].children[0].textContent, 'Preparation & Reminders');
    assert.equal(workspace.children[1].children[1].children[0].textContent, 'Continuation');
    const details = workspace.children[1].children[0];
    assert.equal(details.children[0].textContent, parsed.slots[0].title);
    assert.equal(details.children[1].textContent, parsed.slots[0].details.trim());
    assert.ok(slots.every(slot => slot.attrs['aria-controls'] === details.attrs.id));
    const header = nodes.find(item => item.tag === 'header'), headerText = slotDescendants(header).map(item => item.textContent).join(' ');
    assert.match(headerText, /Room CW.*Monday.*23 November 2026/);
    assert.ok(headerText.includes(card.metadata.start_time));
    assert.match(headerText, /Sunday 22 November 2026.*8:40/);
    assert.equal(nodes.find(item => item.tag === 'time').attrs.datetime, card.updatedAt);
    assert.equal(nodes.find(item => item.textContent === 'Open Trello').attrs.href, card.url);
    assert.ok(!nodes.some(item => ['input', 'textarea', 'select', 'details'].includes(item.tag)));
    assert.equal(nodes.filter(item => item.tag === 'button').length, slots.length);
    assert.ok(!nodes.some(item => item.textContent.includes('[TEACHING_DASHBOARD_V1]')));
    assert.equal(nodes.filter(item => item.tag === 'h4').length, 3);
  }
  const reordered = renderer.parse(teachingSlotFixture().description.replace('SLOT 1', 'SLOT 5'));
  assert.deepEqual(reordered.slots.map(slot => slot.number), ['5', '2', '3', '4'], 'never numerically sort Trello slots');
});
test('slot selection replaces only the details panel and keeps the sequence and Trello source untouched', () => {
  const renderer = require('./public/teaching-slots');
  for (const key of ['JPI', '9WHAU']) {
    const card = teachingSlotFixture(key), original = JSON.stringify(card), parsed = renderer.parse(card.description);
    const view = renderer.render(node, card, key === 'JPI' ? slotProgramme : null);
    const workspace = slotDescendants(view).find(item => item.attrs.class === 'teaching-slot-workspace');
    const list = workspace.children[0].children[0], details = workspace.children[1].children[0];
    const buttons = [...list.children], contents = buttons.map(button => button.children[0]);
    for (let index = 0; index < buttons.length; index++) {
      buttons[index].events.click();
      assert.equal(workspace.children[1].children[0], details);
      assert.ok(list.children.every((button, position) => button === buttons[position] && button.children[0] === contents[position]));
      assert.deepEqual(buttons.map(button => button.attrs['aria-pressed']), buttons.map((_, position) => String(position === index)));
      assert.equal(details.children[0].textContent, parsed.slots[index].title);
      assert.equal(details.children[1].textContent, parsed.slots[index].details.trim());
    }
    assert.equal(JSON.stringify(card), original);
  }
  const card = teachingSlotFixture(), longDetails = 'Keep every instruction visible. '.repeat(200).trim();
  card.description = card.description.replace('Use the established Typing Kit routine.', longDetails);
  const details = slotDescendants(renderer.render(node, card, slotProgramme)).find(item => item.attrs.class === 'teaching-slot-detail');
  assert.equal(details.children[1].textContent, longDetails, 'long details are not truncated');
});
test('slot resources use explicit safe URLs or unique verified programme links and expose unresolved names', () => {
  const renderer = require('./public/teaching-slots'), card = teachingSlotFixture(), slots = renderer.parse(card.description).slots;
  assert.equal(renderer.resolveResource(slots[0], slotProgramme), null, 'a website name without a URL is not invented');
  assert.equal(renderer.resolveResource(slots[1], slotProgramme), 'https://dtech-hub2.onrender.com/practical-skills/kit-worksheet.html?kit=kit-minecraft');
  assert.equal(renderer.resolveResource(slots[2], slotProgramme), slotProgramme.teaching.lesson.url);
  assert.equal(renderer.resolveResource(slots[3], null), null, 'another session does not inherit JPI resource context');
  for (const url of ['javascript:alert(1)', 'data:text/html,bad', '//evil.example', 'https://user:password@example.com/']) {
    assert.equal(renderer.resolveResource({ ...slots[2], resourceUrl: url }, slotProgramme), null);
  }
  const notices = renderer.parse(teachingSlotFixture('9WHAU').description).slots[1];
  assert.equal(renderer.resolveResource(notices, null), notices.resourceUrl, 'preserve the original notices date');
  const ambiguous = { ...slotProgramme, routine: { instructions: slotProgramme.routine.instructions +
    '\n[Minecraft Player Kit](https://example.com/other)' } };
  assert.equal(renderer.resolveResource(slots[1], ambiguous), null);
  const view = renderer.render(node, card, slotProgramme), nodes = slotDescendants(view);
  assert.ok(nodes.some(item => item.textContent === 'Existing CW Routine → Typing Kit - Link unavailable'));
  const buttons = nodes.filter(item => item.attrs.class === 'teaching-slot');
  for (const index of [2, 3]) {
    buttons[index].events.click();
    assert.equal(slotDescendants(view).filter(item => item.tag === 'a' && item.attrs.href === slotProgramme.teaching.lesson.url).length, 1);
  }
});
test('one Minecraft slot displays multiple named resources independently without changing the teaching sequence', () => {
  const renderer = require('./public/teaching-slots'), card = teachingSlotFixture();
  const urls = [
    'https://dtech-hub2.onrender.com/practical-skills/kit-worksheet.html?kit=kit-minecraft',
    'https://dtech-hub2.onrender.com/practical-skills/kit-worksheet.html?kit=kit-minecraft-builder-kit'
  ];
  card.description = card.description.replace(
    'Resource: Existing CW Routine → Minecraft\nResource URL: unresolved\nDetails: Continue the established Minecraft routine.',
    'Details: Students access the appropriate Minecraft Kit for their current stage.\n\nResources:\n' +
    '- Minecraft Player Kit | ' + urls[0] + '\n- Minecraft Builder Kit | ' + urls[1] +
    '\n- Unsafe Kit | javascript:alert(1)\n- Missing Kit |\n- Another missing Kit');
  const original = JSON.stringify(card), parsed = renderer.parse(card.description);
  assert.equal(parsed.slots.length, 4);
  assert.deepEqual(parsed.slots[1].resources.slice(0, 2).map(resource => resource.resourceUrl), urls);
  assert.equal(parsed.slots[1].details.trim(), 'Students access the appropriate Minecraft Kit for their current stage.');
  const view = renderer.render(node, card, slotProgramme);
  const slots = slotDescendants(view).filter(item => item.attrs.class === 'teaching-slot');
  slots[1].events.click();
  const panel = slotDescendants(view).find(item => item.attrs.class === 'teaching-slot-detail');
  const links = slotDescendants(panel).filter(item => item.tag === 'a');
  assert.deepEqual(links.map(link => link.textContent), ['Minecraft Player Kit', 'Minecraft Builder Kit']);
  assert.deepEqual(links.map(link => link.attrs.href), urls, 'retain each exact query parameter');
  assert.ok(links.every(link => link.attrs.target === '_blank' && link.attrs.rel === 'noopener noreferrer'));
  assert.equal(panel.children[2].textContent, 'Resources');
  assert.equal(slotDescendants(panel).filter(item => item.textContent.includes('Link unavailable')).length, 3);
  assert.ok(!slotDescendants(panel).some(item => /https?:\/\//.test(item.textContent)), 'URLs are not classroom labels');
  assert.equal(slots[1].attrs['aria-pressed'], 'true');
  slots[0].events.click(); slots[1].events.click();
  assert.equal(JSON.stringify(card), original);
  assert.equal(slots.length, 4, 'resources must not become teaching slots');
});
test('resource lists coexist with legacy links, while single-resource and resource-free slots remain usable', () => {
  const renderer = require('./public/teaching-slots'), card = teachingSlotFixture();
  const typingUrl = 'https://dtech-hub2.onrender.com/practical-skills/typing-kit.html';
  card.description = card.description.replace('Resource URL: unresolved', 'Resource URL: ' + typingUrl);
  let view = renderer.render(node, card, slotProgramme);
  assert.equal(slotDescendants(view).find(item => item.tag === 'a' && item.attrs.href === typingUrl).textContent,
    'Existing CW Routine → Typing Kit');
  card.description = card.description.replace('Details: Continue the established Minecraft routine.',
    'Resources:\n- Builder Kit | https://example.test/kit?stage=builder&mode=practice\nDetails: Continue the established Minecraft routine.');
  view = renderer.render(node, card, slotProgramme);
  slotDescendants(view).filter(item => item.attrs.class === 'teaching-slot')[1].events.click();
  const panel = slotDescendants(view).find(item => item.attrs.class === 'teaching-slot-detail');
  assert.deepEqual(slotDescendants(panel).filter(item => item.tag === 'a').map(item => item.textContent),
    ['Existing CW Routine → Minecraft', 'Builder Kit']);
  view = renderer.render(node, teachingSlotFixture('9WHAU'), null);
  const empty = slotDescendants(view).find(item => item.attrs.class === 'teaching-slot-detail');
  assert.equal(empty.children.length, 2, 'resource-free slots keep their title and full details without an empty Resources heading');
});
test('malformed and older Trello cards keep a readable fallback without breaking selected-session rendering', async () => {
  const renderer = require('./public/teaching-slots'), card = teachingSlotFixture();
  for (const description of [
    card.description.replace('[/TEACHING_DASHBOARD_V1]', '[/OTHER]'),
    card.description + '\n[/TEACHING_DASHBOARD_V1]',
    card.description.replace('teaching_date: 2026-11-23', 'teaching_date: 2026-02-31'),
    card.description.replace('start_time: 10:00', 'start_time: 25:00'),
    card.description.replace('## Teaching slots', '## Activities'),
    card.description.replace('SLOT 2', 'SLOT 1'),
    card.description.replace('| Routine |', '| Unknown |'),
    card.description.replace('Resource URL: unresolved', 'Resource URL:\nResource URL: unresolved')
  ]) assert.throws(() => renderer.parse(description));
  assert.throws(() => renderer.render(node, { ...card, metadata: { ...card.metadata, class_key: 'OTHER' } }, slotProgramme), /does not match/);
  assert.equal(renderer.render(node, { ...card, description: 'Older readable preparation' }, null), null);
  let warnings = 0;
  const context = { plannerSessionSchema: require('./public/session-schema'), plannerTeachingSlots: renderer, console: { warn() { warnings++; } } };
  vm.runInNewContext(fs.readFileSync(require.resolve('./public/teaching-day-trello'), 'utf8'), context);
  const malformed = { ...card, description: card.description.replace('## Teaching slots', '## Activities') }, host = node();
  const dashboard = context.plannerTeachingDayTrello.dashboard(host, {
    date: '2026-11-23', slot: 'p2', classKey: 'JPI', cardId: card.id, programme: slotProgramme
  }, { el: node, select() {}, request: async () => ({ status: 'ok', issues: [], cards: [malformed] }) });
  await flush();
  const trello = node(); dashboard.showTrello(trello);
  const nodes = slotDescendants(trello);
  assert.equal(warnings, 1);
  assert.ok(nodes.some(item => item.attrs.role === 'alert' && item.textContent.includes('original Trello card')));
  assert.ok(nodes.some(item => item.textContent === malformed.description));
});
test('Whanau and observation workspaces keep independent Notes drafts through the shared Trello toggle', () => {
  const context = { plannerSessionSchema: require('./public/session-schema') };
  vm.runInNewContext(fs.readFileSync(require.resolve('./public/teaching-session'), 'utf8'), context);
  const descend = host => [host, ...host.children.filter(child => typeof child === 'object').flatMap(descend)];
  const render = (slot, type, title) => {
    const host = node();
    const workspace = context.plannerTeachingSession.mount(host, {
      event: { date: '2026-11-23', slot, label: slot, title, source: slot === 'whanau' ? 'KAMAR' : 'manual' },
      content: { note: '', evaluation: '', activities: [], session: { title, type, startTime: '', endTime: '' } },
      legacy: { content: {} }
    }, { el: node, back() {}, legacy() {} });
    return { host, workspace, nodes: descend(host) };
  };
  const whanau = render('whanau', 'whanau', 'WHANAU (9WHAU)'), p1 = render('p1', 'observation', 'Observation');
  const input = whanau.nodes.find(item => item.tag === 'textarea');
  input.value = 'Unsaved Whanau notices';
  whanau.nodes.find(item => item.tag === 'button' && item.textContent === 'Trello').events.click();
  assert.equal(whanau.nodes.find(item => item.attrs['aria-label'] === 'Session Notes').hidden, true);
  assert.equal(whanau.workspace.read().note, input.value);
  assert.equal(p1.workspace.read().note, '');
  whanau.nodes.find(item => item.tag === 'button' && item.textContent === 'Notes').events.click();
  assert.equal(whanau.nodes.find(item => item.attrs['aria-label'] === 'Session Notes').hidden, false);
  assert.equal(whanau.workspace.read().session.type, 'whanau');
  assert.equal(p1.workspace.read().session.type, 'observation');
  assert.ok(!whanau.nodes.some(item => item.textContent === 'Confirm session progress'));
  assert.equal(whanau.workspace.read().activities.length, 0);
});
test('compact activity rows preserve progress and collapsed timing without changing the saved content shape', () => {
  const context = { plannerSessionSchema: require('./public/session-schema') };
  vm.runInNewContext(fs.readFileSync(require.resolve('./public/teaching-session'), 'utf8'), context);
  const content = { note: 'Session reminder', evaluation: 'Later reflection', activities: [{
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', sourceId: 'lesson-binary-piano', title: 'Guided decoding',
    plannedMinutes: 12, actualMinutes: 7.5, status: 'partial', teachingNote: 'Two examples completed'
  }] };
  const host = node();
  const workspace = context.plannerTeachingSession.mount(host, {
    event: { date: '2026-11-23', className: 'JPI', course: 'JuniorDTECH', location: '05' },
    teaching: { unit: { title: 'Binary & Data', url: '/unit' }, lesson: { title: 'Binary Piano', url: '/lesson' },
      resources: [], preparation: [] },
    routine: { priorities: 'Routine', instructions: 'Typing Kit\nMinecraft' },
    checkpoint: { checkpoint_note: 'Awaiting confirmation', revision: 0, confirmed_at: null },
    previous: [], awaitingConfirmation: [], confirmed_at: null, canConfirm: true, legacy: { content: {} }, content
  }, { el: node, back() {}, legacy() {}, confirm() {} });
  const descend = host => [host, ...host.children.filter(child => typeof child === 'object').flatMap(descend)];
  const nodes = descend(host), row = nodes.find(item => item.attrs.class === 'session-activity');
  const [header, details] = row.children;
  assert.equal(header.attrs.class, 'session-activity-header');
  assert.equal(descend(header).find(item => item.tag === 'select').value, 'partial');
  assert.equal(descend(header).filter(item => item.tag === 'input').length, 1);
  assert.equal(details.tag, 'details');
  assert.equal(Boolean(details.open), false);
  assert.deepEqual(JSON.parse(JSON.stringify(workspace.read())), content, 'mounting and collapsing do not erase saved timings or notes');
  descend(header).find(item => item.tag === 'select').value = 'completed';
  details.open = true;
  descend(details).find(item => item.tag === 'input' && item.attrs.type === 'number').value = '15';
  nodes.find(item => item.tag === 'button' && item.textContent === 'Trello').events.click();
  nodes.find(item => item.tag === 'button' && item.textContent === 'Notes').events.click();
  const activity = workspace.read().activities[0];
  assert.equal(activity.status, 'completed');
  assert.equal(activity.plannedMinutes, 15);
  assert.equal(activity.actualMinutes, 7.5);
  assert.equal(activity.teachingNote, 'Two examples completed');
});
test('Current Teaching Day matches JPI and Whanau references independently and preserves Notes on refresh failure', async () => {
  const context = { plannerSessionSchema: require('./public/session-schema') };
  vm.runInNewContext(fs.readFileSync(require.resolve('./public/teaching-day-trello'), 'utf8') +
    fs.readFileSync(require.resolve('./public/teaching-session'), 'utf8'), context);
  const feed = { status: 'ok', issues: [], cards: ['9WHAU', 'JPI'].map((key, index) => ({
    id: key, metadata: { teaching_date: '2026-11-23', session_slot: index ? 'p2' : 'whanau', class_key: key,
      session_type: index ? 'teaching' : 'whanau', display_name: key, start_time: index ? '10:00' : '08:45',
      end_time: index ? '11:00' : '09:00', lesson_title: 'Teaching intention', preparation_status: 'Ready' },
    description: 'Readable Trello preparation', resources: [], updatedAt: '2026-11-22T05:00:00Z',
    url: 'https://trello.com/c/AbCd1234'
  })) };
  let requests = 0, fail = false;
  const request = async () => { requests++; if (fail) throw new Error('Trello unavailable'); return feed; };
  const host = node();
  const workspace = context.plannerTeachingSession.mount(host, {
    event: { date: '2026-11-23', slot: 'whanau', classKey: '9WHAU', label: 'Whanau', title: 'WHANAU (9WHAU)', source: 'KAMAR' },
    content: { note: 'Private authoritative Notes', evaluation: '', activities: [],
      session: { title: 'Whanau', type: 'whanau', startTime: '08:45', endTime: '09:00' } },
    legacy: { content: {} }
  }, { el: node, back() {}, legacy() {}, teachingDay: request });
  const descend = host => [host, ...host.children.filter(child => typeof child === 'object').flatMap(descend)];
  assert.equal(requests, 0, 'Notes loads without any Trello request');
  let nodes = descend(host);
  nodes.find(item => item.tag === 'textarea').value = 'Unsaved Notes remain separate';
  nodes.find(item => item.tag === 'button' && item.textContent === 'Trello').events.click();
  await flush(); nodes = descend(host);
  const selected = nodes.find(item => item.attrs.class === 'teaching-day-card teaching-day-card-current');
  assert.equal(descend(selected).find(item => item.tag === 'h4').textContent, '9WHAU');
  assert.equal(nodes.filter(item => item.tag === 'button' && /Trello/.test(item.textContent)).length, 2,
    'the tab and Refresh are the only Trello buttons');
  fail = true;
  await nodes.find(item => item.tag === 'button' && item.textContent === 'Refresh Trello information').events.click();
  assert.equal(workspace.read().note, 'Unsaved Notes remain separate');
  assert.ok(descend(host).some(item => item.attrs.role === 'alert' && item.textContent.includes('Trello unavailable')));
  nodes.find(item => item.tag === 'button' && item.textContent === 'Notes').events.click();
  assert.equal(workspace.read().activities.length, 0);

  const jpiHost = node(), current = { date: '2026-11-23', slot: 'p2', classKey: 'JPI', sessionType: 'teaching' };
  context.plannerTeachingDayTrello.mount(jpiHost, () => current, { el: node, request: async () => feed });
  await flush();
  const jpi = descend(jpiHost).find(item => item.attrs.class === 'teaching-day-card teaching-day-card-current');
  assert.equal(descend(jpi).find(item => item.tag === 'h4').textContent, 'JPI');
});
test('session view selection preserves Notes and uses readable NZ dates without redundant back navigation', () => {
  const context = { plannerSessionSchema: require('./public/session-schema') }, host = node();
  vm.runInNewContext(fs.readFileSync(require.resolve('./public/teaching-session'), 'utf8'), context);
  const workspace = context.plannerTeachingSession.mount(host, {
    event: { date: '2026-11-23', slot: 'whanau', label: 'Whanau' },
    content: { note: 'Saved Whanau notes', evaluation: '', activities: [],
      session: { title: 'Whanau', type: 'whanau', startTime: '08:45', endTime: '09:00' } }, legacy: { content: {} }
  }, { el: node, legacy() {}, showTrello() {} });
  const original = JSON.stringify(workspace.read());
  workspace.selectView(false); workspace.selectView(true);
  assert.equal(JSON.stringify(workspace.read()), original);
  assert.ok(!slotDescendants(host).some(item => /Back to Teaching Dashboard/.test(item.textContent)));
  assert.ok(slotDescendants(host).some(item => item.textContent.startsWith('Monday 23 November 2026 |')));
});
test('dashboard selects stable card IDs and shows only the selected preparation without blocking Notes on failure', async () => {
  const context = { plannerSessionSchema: require('./public/session-schema') };
  vm.runInNewContext(fs.readFileSync(require.resolve('./public/teaching-day-trello'), 'utf8') +
    fs.readFileSync(require.resolve('./public/teaching-session'), 'utf8'), context);
  const descend = host => [host, ...host.children.filter(child => typeof child === 'object').flatMap(descend)];
  const feed = { status: 'ok', issues: [], cards: ['9WHAU', 'JPI'].map((key, index) => ({
    id: String(index).repeat(24), name: key + ' original card title', description: key + ' preparation',
    resources: [{ name: 'Resource', url: 'https://example.test/resource' }], updatedAt: '2026-11-22T05:00:00Z',
    url: 'https://trello.com/c/AbCd1234', metadata: { class_key: key, session_slot: index ? 'p2' : 'whanau',
      display_name: key, start_time: index ? '10:00' : '08:45', lesson_title: key + ' lesson',
      preparation_status: 'See card preparation' }
  })) };
  let fail = false; const selections = [];
  for (const card of feed.cards) {
    const host = node();
    const dashboard = context.plannerTeachingDayTrello.dashboard(host, {
      date: '2026-11-23', slot: card.metadata.session_slot, classKey: card.metadata.class_key, cardId: card.id
    }, { el: node, select: (card, trello) => selections.push([card.id, trello]), request: async () => {
      if (fail) throw new Error('Trello unavailable'); return feed;
    } });
    const workspace = context.plannerTeachingSession.mount(dashboard.workspace, {
      event: { date: '2026-11-23', slot: card.metadata.session_slot, label: 'Session', title: card.metadata.class_key },
      content: { note: card.metadata.class_key + ' saved Notes', evaluation: '', activities: [],
        session: { title: card.metadata.class_key, type: 'whanau', startTime: '', endTime: '' } }, legacy: { content: {} }
    }, { el: node, back() {}, legacy() {}, showTrello: dashboard.showTrello });
    await flush();
    let nodes = descend(host);
    nodes.find(item => item.attrs['data-card-id'] === card.id).events.click({ stopPropagation() {} });
    assert.deepEqual(selections.at(-1), [card.id, true]);
    let stopped = 0;
    const otherCard = feed.cards.find(item => item.id !== card.id);
    const notesCard = nodes.find(item => item.attrs.class === 'teaching-dashboard-card' &&
      item.children[0].attrs['data-card-id'] === otherCard.id);
    notesCard.children[1].events.click({ stopPropagation() { stopped++; } });
    assert.equal(stopped, 1);
    assert.deepEqual(selections.at(-1), [otherCard.id, false], 'Notes addresses the clicked card, not the selected session');
    assert.equal(notesCard.children[0].children.some(item => item.tag === 'button'), false, 'no nested interactive buttons');
    assert.ok(nodes.some(item => item.textContent === 'Monday 23 November 2026'));
    nodes.find(item => item.textContent === 'Trello Planner').events.click();
    nodes = descend(host);
    assert.equal(nodes.find(item => item.tag === 'h4').textContent, card.name);
    assert.equal(nodes.filter(item => item.tag === 'h4').length, 1);
    assert.equal(nodes.find(item => item.tag === 'details' && item.open).children[1].textContent, card.description);
    assert.equal(workspace.read().note, card.metadata.class_key + ' saved Notes');
    fail = true;
    await nodes.find(item => item.textContent === 'Refresh Trello information').events.click();
    assert.ok(descend(host).some(item => item.attrs.role === 'alert' && item.textContent.includes('Trello unavailable')));
    const fallback = descend(host).find(item => item.attrs['data-session-notes'] === 'whanau');
    fallback.events.click({ stopPropagation() {} });
    assert.deepEqual(selections.at(-1), ['', false], 'local Notes remains accessible without fabricating Trello data');
    nodes.find(item => item.textContent === 'Notes' && item.attrs['aria-pressed']).events.click();
    assert.equal(workspace.read().note, card.metadata.class_key + ' saved Notes');
    fail = false;
  }
});
test('dashboard session switching changes its card and record address only after the current draft saves', async () => {
  let saved = false, loads = 0;
  const context = { ensureSaved: async () => saved, busy: false, selectedTeachingCard: 'old-card', dashboardMode: false,
    periodDate: '2026-11-23', periodSlot: 'p2', yearInput: {}, updateYearBadge() {},
    plannerSessionSchema: require('./public/session-schema'), date: value => new Date(value + 'T00:00:00Z'),
    iso: value => value.toISOString().slice(0, 10), monday: value => value, load: async () => loads++ };
  vm.runInNewContext(source.slice(source.indexOf('  async function openSessionPlan('),
    source.indexOf('  function mountSessionLauncher(')), context);
  await context.openSessionPlan('2026-11-23', 'whanau', undefined, 'new-card');
  assert.equal(context.periodSlot, 'p2');
  assert.equal(context.selectedTeachingCard, 'old-card');
  assert.equal(loads, 0);
  saved = true;
  await context.openSessionPlan('2026-11-23', 'whanau', undefined, 'new-card');
  assert.equal(context.periodSlot, 'whanau');
  assert.equal(context.selectedTeachingCard, 'new-card');
  assert.equal(loads, 1);
});
test('dashboard retains its sidebar and Trello feed when selecting another session', async () => {
  const context = { plannerSessionSchema: require('./public/session-schema') };
  vm.runInNewContext(fs.readFileSync(require.resolve('./public/teaching-day-trello'), 'utf8'), context);
  const descend = host => [host, ...host.children.filter(child => typeof child === 'object').flatMap(descend)];
  const feed = { status: 'ok', issues: [], cards: ['9WHAU', 'JPI'].map((key, index) => ({
    id: String(index).repeat(24), name: key, description: key + ' preparation', resources: [],
    updatedAt: '2026-11-22T05:00:00Z', url: 'https://trello.com/c/AbCd1234',
    metadata: { class_key: key, session_slot: index ? 'p2' : 'whanau', display_name: key,
      start_time: index ? '10:00' : '08:45', lesson_title: key, preparation_status: 'See card' }
  })) };
  let reads = 0; const host = node();
  const dashboard = context.plannerTeachingDayTrello.dashboard(host, {
    date: '2026-11-23', slot: 'whanau', classKey: '9WHAU', cardId: feed.cards[0].id
  }, { el: node, select() {}, request: async () => { reads++; return feed; } });
  await flush();
  const left = host.children[0].children[1].children[0], cards = left.children[4];
  cards.querySelectorAll = () => descend(cards).filter(item => Object.hasOwn(item.attrs, 'data-card-id'));
  left.querySelectorAll = () => descend(left).filter(item => item.tag === 'button');
  const originalButtons = [...cards.children], trello = node();
  dashboard.showTrello(trello);
  dashboard.setBusy(true);
  assert.equal(dashboard.workspace.inert, true);
  assert.ok(left.querySelectorAll().every(button => button.disabled));
  dashboard.selectSession({ slot: 'p2', classKey: 'JPI', cardId: feed.cards[1].id });
  dashboard.setBusy(false);
  assert.equal(dashboard.workspace.inert, false);
  assert.equal(reads, 1);
  assert.ok(cards.children.every((button, i) => button === originalButtons[i]));
  assert.equal(cards.children[0].children[0].attrs['aria-pressed'], 'false');
  assert.equal(cards.children[1].children[0].attrs['aria-pressed'], 'true');
  assert.equal(descend(trello).find(item => item.tag === 'h4').textContent, 'JPI');
});
test('fast dashboard switching fetches fresh records concurrently and preserves the previous workspace on read failure', async () => {
  const calls = [], pending = [], locks = [], mounts = [];
  const previousPlanner = { read: () => ({ note: 'Previous saved Notes' }) };
  const context = {
    api: '/api/planner/', busy: false, loaded: true, dirty: false, save: {}, retry: {},
    periodDate: '2026-11-23', periodSlot: 'whanau', selectedTeachingCard: 'old-card', sessionPlanner: previousPlanner, dashboardTrello: true,
    teachingDashboard: { setBusy: value => locks.push(value) },
    notice() {}, console: { error() {} }, history: { replaceState() {} }, viewFragment: () => '',
    request: url => { calls.push(url); return new Promise((resolve, reject) => pending.push({ resolve, reject })); },
    mountTeachingSession: (data, legacy) => { mounts.push([data, legacy]); context.sessionPlanner = { read: () => data.content }; }
  };
  vm.runInNewContext(source.slice(source.indexOf('  async function switchDashboardSession('),
    source.indexOf('  async function openSessionPlan(')), context);
  const success = context.switchDashboardSession('2026-11-23', 'p2', 'new-card', false);
  assert.equal(calls.length, 2, 'both GET requests start before either completes');
  assert.equal(context.periodSlot, 'whanau');
  assert.equal(context.sessionPlanner, previousPlanner);
  pending[0].resolve({ revision: 4, content: { title: 'Legacy title' } });
  pending[1].resolve({ available: true, revision: 7, content: { note: 'Latest authoritative Notes' } });
  await success;
  assert.equal(context.periodSlot, 'p2');
  assert.equal(context.revision, 7);
  assert.equal(context.sessionPlanner.read().note, 'Latest authoritative Notes');
  assert.equal(context.dashboardTrello, false, 'the requested Notes view is committed after successful reads');
  assert.equal(mounts[0][1].revision, 4);
  assert.deepEqual(locks, [true, false]);
  const current = context.sessionPlanner;
  const failure = context.switchDashboardSession('2026-11-23', 'whanau', 'other-card', true);
  pending[2].reject(new Error('Session unavailable'));
  pending[3].resolve({ available: true });
  await failure;
  assert.equal(context.sessionPlanner, current);
  assert.equal(context.periodSlot, 'p2');
  assert.equal(context.selectedTeachingCard, 'new-card');
  assert.equal(context.dashboardTrello, false, 'failed reads cannot change the previous view');
  assert.equal(context.busy, false);
  assert.equal(context.loaded, true);
  assert.equal(context.retry.hidden, false);
});
test('inline Notes changes the already-selected session view only after saving succeeds', async () => {
  let saved = false;
  const selections = [], views = [];
  const context = { ensureSaved: async () => saved, busy: false, selectedTeachingCard: 'JPI', dashboardMode: true,
    section: 'period', periodDate: '2026-11-23', periodSlot: 'p2',
    teachingDashboard: { workspace: { isConnected: true }, selectSession: value => selections.push(value) },
    sessionPlanner: { selectView: useNotes => views.push(useNotes) },
    history: { replaceState() {} }, viewFragment: () => '', plannerSessionSchema: require('./public/session-schema'),
    date: value => new Date(value + 'T00:00:00Z'), iso: value => value.toISOString().slice(0, 10) };
  vm.runInNewContext(source.slice(source.indexOf('  async function openSessionPlan('),
    source.indexOf('  function mountSessionLauncher(')), context);
  await context.openSessionPlan('2026-11-23', 'p2', undefined, 'JPI', false);
  assert.equal(views.length, 0);
  assert.equal(selections.length, 0);
  saved = true;
  await context.openSessionPlan('2026-11-23', 'p2', undefined, 'JPI', false);
  await context.openSessionPlan('2026-11-23', 'p2', undefined, 'JPI', true);
  assert.deepEqual(views, [true, false]);
  assert.equal(context.periodSlot, 'p2');
  assert.equal(context.periodDate, '2026-11-23');
});
test('dashboard term follows existing school dates, preserves explicit selection and reports failures without blocking Notes', async () => {
  const helper = source.slice(source.indexOf('  function defaultTerm('), source.indexOf('  async function loadTermDates('));
  const resolver = source.slice(source.indexOf("      dashboardTermError = '';"), source.indexOf('      renderSelectors();', source.indexOf("      dashboardTermError = '';")));
  for (const mode of ['default', 'selected', 'unavailable']) {
    let requests = 0, errors = 0;
    const context = { section: 'period', dashboardMode: true, termSelectionPending: mode !== 'selected',
      term: '2', periodDate: '2026-11-23', localDate: '2026-04-21', year: 2026, termDates: undefined,
      refreshSession: async () => {}, console: { error() { errors++; } },
      loadTermDates: async () => {
        requests++;
        if (mode === 'unavailable') throw new Error('School dates unavailable');
        return { ranges: [{ term: '2', startDate: '2026-04-20', endDate: '2026-07-03' },
          { term: '4', startDate: '2026-10-12', endDate: '2026-12-18' }] };
      } };
    await vm.runInNewContext(helper + '\n(async()=>{' + resolver + '})()', context);
    assert.equal(context.term, mode === 'default' ? '4' : mode === 'selected' ? '2' : '');
    assert.equal(requests, mode === 'selected' ? 0 : 1);
    assert.equal(errors, mode === 'unavailable' ? 1 : 0);
    if (mode === 'unavailable') assert.match(context.dashboardTermError, /School dates unavailable.*Notes remain available/);
    assert.equal(context.periodDate, '2026-11-23');
  }
});
test('relocated term controls are excluded from Notes input/change autosaving', async () => {
  let scheduled = 0;
  const context = { plannerSessionSchema: require('./public/session-schema'), section: 'period',
    dirty: false, editVersion: 0, save: {}, loaded: true, busy: false, autosavePaused: false,
    autosaves: () => true, notice() {}, scheduleAutosave() { scheduled++; } };
  vm.runInNewContext(fs.readFileSync(require.resolve('./public/teaching-day-trello'), 'utf8') +
    source.slice(source.indexOf('  function changed(event)'), source.indexOf("  form.addEventListener('input', changed);")), context);
  const host = node(), termControl = node('label'), select = node('select');
  termControl.append(select);
  context.plannerTeachingDayTrello.dashboard(host, { date: '2026-11-23', slot: 'whanau' }, {
    el: node, termControl, select() {}, request: async () => ({ status: 'ok', cards: [], issues: [] })
  });
  await flush();
  function ancestors(parent, target) {
    if (parent === target) return [parent];
    for (const child of parent.children.filter(item => typeof item === 'object')) {
      const found = ancestors(child, target);
      if (found) return [parent, ...found];
    }
  }
  select.closest = () => ancestors(host, select).reverse().find(item => Object.hasOwn(item.attrs, 'data-planner-navigation'));
  context.changed({ target: select });
  context.changed({ target: select });
  assert.equal(context.dirty, false);
  assert.equal(context.editVersion, 0);
  assert.equal(scheduled, 0, 'changing a display term must not create or update a session record');
});
test('activity instructions format saved lines as bullets without duplicating markers or changing blank lines', () => {
  const notices = [], field = node();
  const input = {
    value: 'TypingTest.com - AKA Typing Kit\nMinecraft\n\n\u2022 Kits:',
    maxLength: 20000, events: {}, inputs: [],
    addEventListener(type, handler) { this.events[type] = handler; },
    dispatchEvent(event) { this.inputs.push(event); }, focus() { this.focused = true; }
  };
  field.querySelector = () => input;
  const context = { Event, URL, DOMParser: ClipboardParser, el: node, notice: message => notices.push(message) };
  vm.runInNewContext(source.slice(source.indexOf('  function bulletPriorities('), source.indexOf('  function mountActivityPills(')), context);
  const original = input.value;
  context.bulletInstructions(field);
  assert.equal(input.value, original, 'mounting does not modify existing notes');
  field.children[0].events.click();
  assert.equal(input.value, '\u2022 TypingTest.com - AKA Typing Kit\n\u2022 Minecraft\n\n\u2022 Kits:');
  assert.equal(input.inputs.length, 1);
  assert.equal(input.inputs[0].bubbles, true);
  field.children[0].events.click();
  assert.equal(input.inputs.length, 1, 'formatting is idempotent');
  input.value = 'Too long'; input.maxLength = input.value.length;
  field.children[0].events.click();
  assert.equal(input.value, 'Too long');
  assert.equal(notices.length, 1);
  assert.equal(input.hidden, true, 'instructions start in clean reading mode');
  const preview = field.children[1], edit = field.children[2], tools = field.children[3];
  edit.events.click();
  assert.equal(input.hidden, false);
  assert.equal(preview.hidden, true);
  input.value = '\u2022 Typing Kit\n\u2022 Minecraft';
  input.maxLength = 20000;
  input.selectionStart = 2; input.selectionEnd = 12;
  input.setRangeText = function(text, start, end) {
    this.value = this.value.slice(0, start) + text + this.value.slice(end);
    this.selectionStart = this.selectionEnd = start + text.length;
  };
  tools.children[1].value = '';
  tools.children[2].value = 'javascript:alert(1)';
  tools.children[3].events.click();
  assert.match(tools.children[4].textContent, /HTTP or HTTPS/);
  assert.equal(input.value, '\u2022 Typing Kit\n\u2022 Minecraft');
  tools.children[2].value = 'https://typingtest.com/';
  tools.children[3].events.click();
  assert.equal(input.value, '\u2022 [Typing Kit](https://typingtest.com/)\n\u2022 Minecraft');
  edit.events.click();
  assert.equal(input.hidden, true);
  const link = preview.children[0].children.find(child => child.tag === 'a');
  assert.equal(link.textContent, 'Typing Kit');
  assert.equal(link.attrs.href, 'https://typingtest.com/');
  assert.equal(link.attrs.rel, 'noopener noreferrer');
  edit.events.click();
  input.value = 'Before After';
  input.selectionStart = 7; input.selectionEnd = 7;
  let prevented = false;
  input.events.paste({ clipboardData: { getData: () => '<a href="https://example.test/kit">Login Kit</a>' },
    preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(input.value, 'Before [Login Kit](https://example.test/kit)After');
  const saved = input.value;
  input.maxLength = saved.length;
  input.events.paste({ clipboardData: { getData: () => '<p>Too much text</p>' }, preventDefault() {} });
  assert.equal(input.value, saved, 'oversize paste is rejected without changing notes');
  assert.match(tools.children[4].textContent, /exceed the notes limit/);
  input.events.paste({ clipboardData: { getData: () => '' },
    preventDefault() { assert.fail('plain text uses native paste'); } });
  input.value = '\u2022 ';
  input.selectionStart = input.selectionEnd = 2;
  input.maxLength = 20000;
  input.events.paste({ clipboardData: { getData: () => '<ul><li>Kits</li></ul>' }, preventDefault() {} });
  assert.equal(input.value, '\u2022 Kits', 'pasting a list replaces an empty automatic bullet');
  assert.match(source, /if \(activity && name === 'instructions'\) bulletInstructions\(field\)/);
});
test('rich clipboard conversion retains named links and nested lists without importing active HTML', () => {
  const context = { URL, DOMParser: ClipboardParser };
  vm.runInNewContext(source.slice(source.indexOf('  function pastedInstructions('),
    source.indexOf('  function bulletInstructions(')), context);
  const value = context.pastedInstructions('<ul><li>Kits:<ul><li><a href="https://example.test/login?a=1&amp;b=2">Login Kit</a></li>' +
    '<li><a href="https://example.test/search">Search Kit</a></li></ul></li></ul>' +
    '<p>Ordinary notes &amp; text</p><script>doBadThings()</script>' +
    '<a href="javascript:alert(1)">Unsafe link</a><p><strong>Bold text</strong></p>');
  assert.match(value, /\u2022 Kits:/);
  assert.match(value, /  \u2022 \[Login Kit\]\(https:\/\/example.test\/login\?a=1&b=2\)/);
  assert.match(value, /  \u2022 \[Search Kit\]\(https:\/\/example.test\/search\)/);
  assert.match(value, /Ordinary notes & text/);
  assert.match(value, /Unsafe link/);
  assert.match(value, /Bold text/);
  assert.doesNotMatch(value, /javascript:|doBadThings|<strong>/);
});
function fixture() {
  const calls = [];
  const context = {
    el: node, URLSearchParams, Intl, URL, Date, Map, console: { error() {} },
    selectedDay: 0, week: '2026-10-19', section: 'week', year: 2026, term: '4',
    dirty: false, busy: false, saveInFlight: undefined, periodDate: '', periodSlot: 'p1',
    date: value => new Date(value + 'T00:00:00Z'),
    viewFragment: () => 'selected-day', history: { replaceState: (...args) => calls.push(['history', ...args]) },
    alignWeekRows: spread => calls.push(['align', spread]),
    canLeave: () => true, saveEntry: async () => { context.dirty = false; calls.push(['save']); },
    notice: message => calls.push(['notice', message]),
    load: async () => calls.push(['load', context.section, context.periodDate, context.periodSlot]),
    refreshSession: async () => {}, api: '/api/planner/', request: async () => ({ plans: [] })
  };
  vm.runInNewContext(source.slice(source.indexOf('  async function openPeriodPlan('),
    source.indexOf('  function weeklyTable(')), context);
  return { context, calls };
}

test('opening a period saves weekly drafts first, and failed saves retain their view', async () => {
  const { context, calls } = fixture();
  context.dirty = true;
  await context.openPeriodPlan('2026-10-21', 'p2');
  assert.deepEqual(calls.map(call => call[0]), ['save', 'load']);
  assert.deepEqual(calls.at(-1), ['load', 'period', '2026-10-21', 'p2']);
  assert.equal(context.selectedDay, 2);
  context.section = 'week'; context.dirty = true; calls.length = 0;
  context.saveEntry = async () => calls.push(['save-failed']);
  await context.openPeriodPlan('2026-10-22', 'p5');
  assert.equal(context.section, 'week');
  assert.deepEqual(calls, [['save-failed']]);
  context.busy = true;
  await context.openPeriodPlan('2026-10-22', 'p5');
  assert.match(calls.at(-1)[1], /loading or saving/);
});

test('period links respect unrelated unsent drafts rather than discarding them', async () => {
  const { context, calls } = fixture();
  context.canLeave = () => false;
  await context.openPeriodPlan('2026-10-19', 'p3');
  assert.equal(context.section, 'week');
  assert.equal(calls.length, 0);
});

test('period navigation waits for a focusout autosave already running and stays put if it fails', async () => {
  for (const succeeded of [true, false]) {
    const { context, calls } = fixture();
    let resolveSave;
    context.busy = true;
    context.saveInFlight = new Promise(resolve => { resolveSave = resolve; });
    const navigation = context.openPeriodPlan('2026-10-19', 'p2');
    await flush();
    assert.equal(calls.length, 0);
    context.busy = false;
    resolveSave(succeeded);
    await navigation;
    assert.equal(context.section, succeeded ? 'period' : 'week');
    assert.equal(calls.length, succeeded ? 1 : 0);
  }
});

test('period storage uses the actual date year, independent of the returning planner year', () => {
  const context = { section: 'period', year: 2026, week: '2026-12-28', term: '4', dashboardMode: false,
    periodDate: '2027-01-01', periodSlot: 'p2', selectedDay: 4, URLSearchParams, api: '/api/planner/', sessionAddress: undefined };
  vm.runInNewContext(source.slice(source.indexOf('  function key()'), source.indexOf('  function offerSignin()')), context);
  assert.equal(context.key(), '2027-01-01_p2');
  assert.equal(context.address(), '/api/planner/2027/period/2027-01-01_p2');
  const fragment = new URLSearchParams(context.viewFragment());
  assert.equal(fragment.get('year'), '2026');
  assert.equal(fragment.get('week'), '2026-12-28');
  assert.equal(fragment.get('date'), '2027-01-01');
  assert.equal(fragment.get('day'), '4');
  const { authReturn } = require('./authReturn');
  assert.equal(authReturn('/#' + fragment), '/#' + fragment);
  context.section = 'week';
  assert.equal(context.address(), '/api/planner/2026/week/2026-12-28');
  context.section = 'activity';
  context.activityRecord = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  assert.equal(context.address(), '/api/planner/2027/activity/' + context.activityRecord);
  const activityFragment = context.viewFragment();
  assert.equal(new URLSearchParams(activityFragment).get('date'), '2027-01-01');
  assert.equal(new URLSearchParams(activityFragment).get('activity'), context.activityRecord);
  assert.equal(authReturn('/#' + activityFragment), '/#' + activityFragment);
});

function activityFixture(data = {}) {
  function element(tag = 'div', text = '', attrs = {}) {
    return {
      tag, textContent: text, attrs, id: attrs.id, value: attrs.value || '', children: [], events: {}, isConnected: true,
      append(...children) { this.children.push(...children); },
      replaceChildren(...children) { this.children = children; },
      addEventListener(type, handler) { this.events[type] = handler; },
      setAttribute(key, value) { this.attrs[key] = value; },
      removeAttribute(key) { delete this.attrs[key]; },
      dispatchEvent(event) { this.dispatched = event; },
      all() { return this.children.flatMap(n => [n, ...n.all()]); }
    };
  }
  const field = element(), calls = [], records = new Map([
    ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', { title: 'SketchUp' }]
  ]);
  let saveSucceeds = true, requestFails = false, confirmResult = true;
  const context = {
    el: element, Event, api: '/api/planner/', periodDate: '2026-10-30', section: 'period',
    activityRecord: '', csrf: 'synthetic', crypto: { randomUUID: () => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
    console: { error() {} },
    ensureSaved: async () => { calls.push(['save']); return saveSucceeds; },
    canLeave: () => true, confirm: () => confirmResult,
    load: async () => calls.push(['load', context.section, context.activityRecord]),
    refreshSession: async () => calls.push(['session']),
    request: async (url, init) => {
      calls.push(['request', url, init]);
      if (requestFails) throw new Error('Activities unavailable');
      if (init) {
        const { content, revision } = JSON.parse(init.body);
        assert.equal(revision, 0); assert.equal(init.headers['x-planner-csrf'], 'synthetic');
        records.set(url.split('/').at(-1), content);
        return { revision: 1 };
      }
      return { activities: [...records].map(([entry_key, content]) => ({ entry_key, title: content.title })) };
    }
  };
  vm.runInNewContext(source.slice(source.indexOf('  function mountActivityPills('), source.indexOf('  function renderPeriod(')), context);
  context.mountActivityPills(field, data);
  return {
    field, records, context, calls,
    find: predicate => field.all().find(predicate),
    click: text => field.all().find(n => n.tag === 'button' && n.textContent === text).events.click(),
    set saveSucceeds(value) { saveSucceeds = value; },
    set requestFails(value) { requestFails = value; },
    set confirmResult(value) { confirmResult = value; }
  };
}
test('activity pills create, persist, reopen and unlink reusable activities without deleting their plans', async () => {
  const f = activityFixture(); await flush();
  const stored = () => f.find(n => n.attrs.name === 'activityLinks');
  assert.equal(stored().value, '[]');
  await f.click('+ Add activity');
  assert.equal(f.find(n => n.id === 'period-activity-picker').hidden, false);
  f.find(n => n.id === 'new-activity-title').value = 'TypingTest.com';
  await f.click('Create activity');
  const id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  assert.deepEqual(JSON.parse(stored().value), [{ id, title: 'TypingTest.com' }]);
  assert.equal(stored().dispatched.bubbles, true);
  assert.equal(f.records.get(id).title, 'TypingTest.com');
  const reopened = activityFixture({ activityLinks: stored().value }); await flush();
  assert.ok(reopened.find(n => n.attrs['aria-label'] === 'Open activity: TypingTest.com'));
  await f.click('TypingTest.com');
  assert.deepEqual(f.calls.at(-1), ['load', 'activity', id]);
  f.context.section = 'period';
  await f.find(n => n.attrs['aria-label'] === 'Unlink activity: TypingTest.com').events.click();
  assert.equal(stored().value, '[]');
  assert.ok(f.records.has(id), 'unlinking never deletes reusable content');
  f.find(n => n.id === 'existing-activity').value = id;
  await f.click('Link selected activity');
  assert.equal(JSON.parse(stored().value)[0].id, id);
});
test('existing activity selection deduplicates links and refreshes renamed pill titles', async () => {
  const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const f = activityFixture(); await flush();
  f.find(n => n.id === 'existing-activity').value = id;
  await f.click('Link selected activity');
  await f.click('Link selected activity');
  assert.equal(JSON.parse(f.find(n => n.attrs.name === 'activityLinks').value).length, 1);
  assert.ok(f.find(n => n.attrs.role === 'alert' && n.textContent.includes('already linked')));
  f.records.get(id).title = 'SketchUp roofs';
  await f.click('Refresh activities');
  assert.ok(f.find(n => n.attrs['aria-label'] === 'Open activity: SketchUp roofs'));
  f.confirmResult = false;
  await f.find(n => n.attrs['aria-label'] === 'Unlink activity: SketchUp roofs').events.click();
  assert.equal(JSON.parse(f.find(n => n.attrs.name === 'activityLinks').value).length, 1);
});
test('activity errors preserve links and failed saves prevent navigation or creation', async () => {
  const f = activityFixture({ activityLinks: JSON.stringify([{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', title: 'SketchUp' }]) });
  await flush();
  f.saveSucceeds = false;
  await f.click('SketchUp');
  assert.equal(f.calls.some(c => c[0] === 'load'), false);
  f.find(n => n.id === 'new-activity-title').value = 'New';
  await f.click('Create activity');
  assert.equal(f.calls.some(c => c[0] === 'request' && c[2]), false);
  assert.equal(JSON.parse(f.find(n => n.attrs.name === 'activityLinks').value).length, 1);
  f.saveSucceeds = true; f.requestFails = true;
  await f.click('Refresh activities');
  assert.ok(f.find(n => n.attrs.role === 'alert' && n.textContent.includes('Refresh activities')));
  await f.click('Create activity');
  assert.equal(JSON.parse(f.find(n => n.attrs.name === 'activityLinks').value).length, 1);
  assert.throws(() => activityFixture({ activityLinks: 'not json' }), /Saved activity links could not be read/);
});

test('period plan chooser fills only empty fields and reuses activity IDs, saving before and after copying', async () => {
  const page = node(), calls = [];
  const names = ['title', 'priorities', 'activities', 'resources', 'reflection', 'activityLinks'];
  const inputs = Object.fromEntries(names.map(name => [name, {
    value: name === 'activities' ? 'Keep my own notes' : name === 'activityLinks' ? '[]' : '',
    dispatchEvent(event) { calls.push(['input', name, event.bubbles]); }
  }]));
  page.querySelector = selector => inputs[selector.match(/"([^"]+)"/)[1]];
  const links = JSON.stringify([{ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', title: 'Routine' }]);
  const context = {
    el: node, Event, console: { error() {} }, periodDate: '2026-10-30', periodSlot: 'p3', api: '/api/planner/',
    fields: { period: names.filter(name => name !== 'activityLinks').map(name => [name]) }, refreshSession: async () => {},
    ensureSaved: async () => { calls.push(['save']); return true; },
    load: async () => calls.push(['reload']),
    request: async url => {
      calls.push(['request', url]);
      if (url.includes('period-plan-choices')) return { plans: [
        { entry_key: '2026-10-30_p3', title: 'Current plan' },
        { entry_key: '2026-10-23_p2', title: 'Class routine' }
      ] };
      return { revision: 1, content: { title: 'Class routine', priorities: 'Learn things', activities: 'Source notes',
        resources: '[Website](https://example.test)', activityLinks: links } };
    }
  };
  vm.runInNewContext(source.slice(source.indexOf('  function mountPlanChooser('), source.indexOf('  function renderPeriod(')), context);
  context.mountPlanChooser(page); await flush();
  const tools = page.children[0], choose = tools.children[1], copy = tools.children[2], info = tools.children[4];
  assert.equal(choose.children.length, 2, 'current period is excluded');
  assert.match(choose.children[1].textContent, /Class routine.*2026-10-23.*P2/);
  choose.value = '2026-10-23_p2';
  await copy.events.click();
  assert.equal(inputs.activities.value, 'Keep my own notes');
  assert.equal(inputs.title.value, 'Class routine');
  assert.equal(inputs.resources.value, '[Website](https://example.test)');
  assert.equal(inputs.activityLinks.value, links);
  assert.ok(calls.some(call => call[0] === 'input' && call[1] === 'activityLinks' && call[2]),
    'hidden activity links are copied even though they are not visible field definitions');
  assert.equal(calls.filter(call => call[0] === 'save').length, 2);
  assert.equal(calls.at(-1)[0], 'reload');
  calls.length = 0;
  await copy.events.click();
  assert.match(info.textContent, /Existing content is unchanged/);
  assert.equal(calls.filter(call => call[0] === 'save').length, 1);
  context.ensureSaved = async () => false;
  inputs.title.value = '';
  await copy.events.click();
  assert.equal(inputs.title.value, '', 'save failure stops copying');
  assert.match(info.textContent, /Save the current period/);
  context.ensureSaved = async () => true;
  context.request = async () => { throw new Error('Offline'); };
  await copy.events.click();
  assert.equal(info.attrs.role, 'alert');
  assert.equal(info.textContent, 'Offline');
  assert.equal(copy.disabled, false);
});

test('weekly summaries replace link labels safely, including blank titles and unplanned periods', async () => {
  const { context } = fixture();
  const spread = node();
  const links = ['2026-10-19_p1', '2026-10-19_p2', '2026-10-19_p3'].map(key =>
    Object.assign(node('a', '+ Plan this period'), { dataset: { periodKey: key } }));
  const host = Object.assign(node('ul'), { dataset: { periodActivities: '2026-10-19_p1' } });
  const id = '12345678-1234-1234-1234-123456789abc';
  spread.querySelectorAll = selector => selector === '[data-period-key]' ? links : [host];
  context.request = async url => {
    assert.equal(url, '/api/planner/period-plans/2026-10-19');
    return { plans: [{ entry_key: '2026-10-19_p1', title: '<script>Private title</script>',
      activityLinks: JSON.stringify([{ id, title: 'Typing Kit' }, { id: '22345678-1234-1234-1234-123456789abc', title: 'Minecraft' }]) },
      { entry_key: '2026-10-19_p2', title: '  ' }] };
  };
  context.mountPeriodLinks(spread, context.week);
  await flush();
  assert.deepEqual(links.map(link => link.textContent),
    ['<script>Private title</script>', 'Untitled period plan', '+ Plan this period']);
  assert.match(links[0].attrs['aria-label'], /Private title/);
  assert.match(spread.beforeNodes[0].children[0].textContent, /private/);
  assert.equal(host.children.length, 2);
  assert.equal(host.children[0].children[0].textContent, 'Typing Kit');
  let destination;
  context.openPeriodPlan = async (...args) => { destination = args; };
  host.children[0].children[0].events.click({ preventDefault() {} });
  assert.deepEqual(destination, ['2026-10-19', 'p1', id]);
});

test('summary failures have explicit retry and detached responses cannot change another week', async () => {
  const { context } = fixture();
  const spread = node();
  let fail = true, resolve;
  context.request = async () => {
    if (fail) throw new Error('Could not read private titles.');
    return new Promise(done => { resolve = done; });
  };
  context.mountPeriodLinks(spread, context.week);
  await flush();
  const [message, retry] = spread.beforeNodes[0].children;
  assert.equal(message.attrs.role, 'alert');
  assert.match(message.textContent, /Could not read/);
  assert.equal(retry.hidden, false);
  fail = false;
  const pending = retry.events.click();
  await flush();
  spread.isConnected = false;
  spread.querySelectorAll = () => { throw new Error('Detached view was accessed'); };
  resolve({ plans: [] }); await pending;
  assert.equal(message.textContent, 'Loading your period plan titles...');
});

test('Day View selects Monday-Friday without replacing or duplicating weekly fields', () => {
  const { context, calls } = fixture();
  const spread = node();
  const originalNotes = node('textarea'); originalNotes.value = 'Keep this weekly draft';
  spread.append(originalNotes);
  context.mountDayView(spread);
  const [previous, choose, next, details] = spread.beforeNodes[0].children;
  assert.equal(choose.children.length, 5);
  assert.match(choose.children[0].textContent, /Monday/);
  assert.equal(previous.disabled, true);
  next.events.click();
  assert.equal(spread.dataset.selectedDay, '1');
  choose.value = '4'; choose.events.change();
  assert.equal(next.disabled, true);
  next.events.click();
  assert.equal(spread.dataset.selectedDay, '4');
  previous.events.click();
  assert.equal(choose.value, '3');
  details.events.click();
  assert.equal(spread.dataset.showDetails, 'true');
  assert.equal(details.attrs['aria-expanded'], 'true');
  assert.deepEqual(spread.children, [originalNotes]);
  assert.equal(originalNotes.value, 'Keep this weekly draft');
  assert.equal(context.dirty, false);
  assert.ok(calls.some(call => call[0] === 'history'));
});

test('period headers are linked only for teaching slots and Day View rules do not hide print columns', () => {
  const table = source.slice(source.indexOf('  function weeklyTable('), source.indexOf('  function renderWeek('));
  assert.match(table, /if \(\/\^p\[1-5\]\$\/\.test\(slot\)\)/);
  assert.match(table, /class: 'period-plan-link'/);
  assert.match(table, /inputField\(slot \+ ':' \+ i/);
  assert.doesNotMatch(table, /No classes listed|Non Contact/);
  const css = fs.readFileSync(require.resolve('./public/planner.css'), 'utf8');
  const screen = css.slice(css.indexOf('@media screen and (max-width: 900px)'), css.indexOf('@media (max-width: 1100px)'));
  assert.match(screen, /data-selected-day="4"/);
  assert.match(screen, /display: table-cell/);
  assert.doesNotMatch(screen, /\.week-sidebar \{ display: none/);
  assert.match(css, /@media print \{\s+\.week-day-controls, \.period-plan-status, \.period-planner > button, \.period-drive-controls \{ display: none; \}/);
  assert.match(source, /addEventListener\('beforeprint', \(\) => \{\s+globalThis\.plannerTextareaAutosize\?\.refresh\(\)/);
});

test('activities form a vertical list visually grouped with the original notes field', () => {
  const css = fs.readFileSync(require.resolve('./public/planner.css'), 'utf8');
  assert.match(css, /\.period-activity-pills\s*\{[^}]*flex-direction:\s*column/);
  assert.match(css, /\.period-planner \.planner-field:has\(> \.period-activity-pills\)\s*\{[^}]*border:\s*1px solid/);
  assert.match(css, /\.period-activity-pill > button:first-child\s*\{[^}]*flex:\s*1/);
  assert.match(source, /field\.append\(stored, pills, tools\)/);
});
