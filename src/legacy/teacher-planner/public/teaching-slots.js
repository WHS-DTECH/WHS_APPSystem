(function (root) {
  const sessionSchema = typeof module === 'object' && module.exports ? require('./session-schema') : root.plannerSessionSchema;
  const types = { Routine: 'routine', Kit: 'kit', Activity: 'activity', 'Unit Library': 'unit-library', 'Whānau': 'whanau' };
  const categories = {
    'Web Links': { colour: 'web', icon: '\uD83C\uDF10' },
    'Print Resources': { colour: 'print', icon: '\uD83D\uDDA8' },
    'Lesson Plan': { colour: 'lesson', icon: '\uD83D\uDCD6' },
    'Unit Plan': { colour: 'unit', icon: '\uD83D\uDCDA' }
  };
  const activityIcons = { Routine: '\u21BB', Kit: '\uD83E\uDDF0', Activity: '\u25B6', 'Unit Library': '\uD83D\uDCDA', 'Whānau': '\uD83D\uDC65' };
  // Explicitly approved destinations for the Typing Kit routine, not a filename search.
  const typingResources = [
    { category: 'Web Links', resource: 'TypingTest.com', resourceUrl: 'https://www.typingtest.com/' },
    { category: 'Web Links', resource: 'DTECH HUB Typing Kit', resourceUrl: 'https://dtech-hub2.onrender.com/practical-skills/typing-kit.html' }
  ];
  const typingDescription = 'Students practice their keyboarding skills by logging their results from TypingTest.com.';
  class FormatError extends Error {}
  function parse(description) {
    const text = description.replace(/\r\n/g, '\n');
    const blocks = [...text.matchAll(/^\[TEACHING_DASHBOARD_V1\]\n([\s\S]*?)^\[\/TEACHING_DASHBOARD_V1\][ \t]*$/gm)];
    if (blocks.length !== 1 || (text.match(/^\[TEACHING_DASHBOARD_V1\]$/gm) || []).length !== 1 ||
      (text.match(/^\[\/TEACHING_DASHBOARD_V1\][ \t]*$/gm) || []).length !== 1 ||
      text.slice(0, blocks[0].index).trim()) throw new FormatError('Use exactly one Teaching Dashboard V1 metadata block.');
    const metadata = Object.create(null);
    for (const line of blocks[0][1].split('\n').filter(line => line.trim())) {
      const field = /^([a-z_]+):[ \t]*(.*)$/.exec(line);
      if (!field || Object.hasOwn(metadata, field[1]) || field[2].length > 200) throw new FormatError('Invalid or duplicate teaching metadata field.');
      metadata[field[1]] = field[2].trim();
    }
    const value = metadata.teaching_date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '') || !Number.isFinite(Date.parse(value)) ||
      new Date(value).toISOString().slice(0, 10) !== value ||
      !/^(whanau|p[1-5])$/.test(metadata.session_slot || '') ||
      !/^[A-Z0-9][A-Z0-9_-]{0,39}$/.test(metadata.class_key || '') ||
      !['teaching', 'whanau'].includes(metadata.session_type) ||
      (metadata.session_slot === 'whanau') !== (metadata.session_type === 'whanau') ||
      !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(metadata.start_time || '') ||
      !metadata.room || !metadata.display_title) throw new FormatError('Check the class, date, room, title and NZ start time.');
    const body = text.slice(blocks[0].index + blocks[0][0].length).trim();
    if (!body.startsWith('## Teaching slots\n')) throw new FormatError('Use the Teaching slots heading.');
    const slots = [], panels = { preparation: '', continuation: '' }, headings = new Set(), numbers = new Set();
    let section, current, lastField;
    for (const line of body.split('\n')) {
      const heading = { '## Teaching slots': 'slots', '## Preparation & reminders': 'preparation', '## Continuation': 'continuation' }[line];
      if (heading) {
        if (headings.has(heading)) throw new FormatError('Duplicate teaching section.');
        headings.add(heading); section = heading; current = undefined; lastField = undefined; continue;
      }
      if (line.startsWith('## ')) throw new FormatError('Unrecognised teaching section.');
      if (section !== 'slots' && line.startsWith('### SLOT ')) throw new FormatError('Place slots inside the Teaching slots section.');
      if (section !== 'slots') { panels[section] += line + '\n'; continue; }
      const slot = /^### SLOT ([1-9]\d*) \| ([^|]+) \| (.+)$/.exec(line);
      if (slot) {
        if (!Object.hasOwn(types, slot[2]) || numbers.has(slot[1])) throw new FormatError('Invalid slot type or duplicate slot number.');
        numbers.add(slot[1]);
        current = { number: slot[1], type: slot[2], colour: types[slot[2]], title: slot[3], details: '', reminder: '', resource: '', resourceUrl: '', resources: [] };
        current.fields = new Set(); slots.push(current); lastField = undefined; continue;
      }
      if (line.startsWith('### ')) throw new FormatError('Use SLOT n | Type | Title headings.');
      if (!line.trim()) { if (lastField === 'details') current.details += '\n'; continue; }
      if (!current) throw new FormatError('A slot heading is required before its content.');
      const field = /^(Resource URL|Resource|Resources|Details|Reminder):[ \t]*(.*)$/.exec(line);
      if (field) {
        const key = { Resource: 'resource', 'Resource URL': 'resourceUrl', Resources: 'resources', Details: 'details', Reminder: 'reminder' }[field[1]];
        if (current.fields.has(key)) throw new FormatError('Duplicate slot field.');
        if (key === 'resources' && field[2].trim()) throw new FormatError('Place named resource entries below Resources:.');
        current.fields.add(key);
        if (key !== 'resources') current[key] = field[2];
        lastField = key;
      } else if (lastField === 'resources') {
        const categorised = /^-[ \t]+(Web Links|Print Resources|Lesson Plan|Unit Plan)[ \t]*\|[ \t]*([^|]+?)[ \t]*\|[ \t]*(.*)$/.exec(line);
        const resource = categorised || /^-[ \t]+([^|]+?)(?:[ \t]*\|[ \t]*(.*))?$/.exec(line);
        if (!resource || !(categorised ? resource[2] : resource[1]).trim()) throw new FormatError('Use - Category | Resource name | URL, or - Resource name | URL.');
        current.resources.push(categorised ?
          { category: resource[1], resource: resource[2].trim(), resourceUrl: resource[3].trim() } :
          { category: 'Web Links', resource: resource[1].trim(), resourceUrl: resource[2]?.trim() || '' });
      } else if (lastField === 'details') current.details += '\n' + line;
      else throw new FormatError('Use Resource, Resource URL, Resources, Details and Reminder fields.');
    }
    if (!slots.length || slots.length > 50) throw new FormatError('Provide between one and fifty teaching slots.');
    return { metadata, slots, preparation: panels.preparation.trim(), continuation: panels.continuation.trim() };
  }
  function resourceUrl(value, relative = false) {
    if (!value || value.length > 2048) return null;
    try {
      const url = new URL(value, relative ? 'https://planner.invalid' : undefined);
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
      if (relative && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') &&
        url.origin === 'https://planner.invalid') return value;
      if (!/^https?:\/\//i.test(value)) return null;
      return url.href;
    } catch (error) {
      if (error instanceof TypeError) return null;
      throw error;
    }
  }
  function resolveResource(slot, programme) {
    const explicit = resourceUrl(slot.resourceUrl);
    if (explicit) return explicit;
    if (slot.resourceUrl && slot.resourceUrl.trim().toLowerCase() !== 'unresolved') return null;
    if (!programme || !slot.resource) return null;
    const normal = value => value.normalize('NFKC').trim().toLowerCase();
    const name = normal(slot.resource.split(/\s*(?:→|->)\s*/).at(-1));
    let candidates = [];
    if (slot.type === 'Unit Library') candidates = [
      programme.teaching?.lesson, programme.teaching?.unit,
      ...(programme.teaching?.resources || []).map(resource => ({ title: resource.name, url: resource.url }))
    ].filter(Boolean);
    else if (['Routine', 'Kit'].includes(slot.type)) {
      const routine = programme.routine;
      const text = [routine?.instructions, routine?.resources, routine?.lessonPlans].filter(Boolean).join('\n');
      candidates = [...text.matchAll(/\[([^\]\r\n]+)\]\((https?:\/\/[^\s)]+)\)/g)]
        .map(match => ({ title: match[1], url: match[2] }));
    }
    const matches = candidates.filter(candidate => normal(candidate.title) === name ||
      ['Routine', 'Kit'].includes(slot.type) && normal(candidate.title.replace(/ Player Kit$/i, '')) === name);
    const urls = [...new Set(matches.map(candidate => resourceUrl(candidate.url, true)).filter(Boolean))];
    return urls.length === 1 ? urls[0] : null;
  }
  function render(el, card, programme) {
    if (!card.description.includes('[TEACHING_DASHBOARD_V1]')) return null;
    const plan = parse(card.description), metadata = plan.metadata;
    for (const field of ['teaching_date', 'session_slot', 'class_key', 'session_type']) {
      if (metadata[field] !== card.metadata[field]) throw new FormatError('Card metadata does not match this teaching session.');
    }
    if (!Number.isFinite(Date.parse(card.updatedAt))) throw new FormatError('The Trello update timestamp is unavailable.');
    const article = el('article', '', { class: 'teaching-slot-plan', 'aria-label': 'Trello teaching slots' });
    const header = el('header', '', { class: 'teaching-slot-header' }), title = el('div');
    title.append(el('h3', metadata.class_key + ' - ' + metadata.display_title),
      el('p', 'Room ' + metadata.room + ' | ' + sessionSchema.dateLabel(metadata.teaching_date) + ' | ' + metadata.start_time + ' NZ'));
    const trello = el('div', '', { class: 'teaching-slot-source' });
    trello.append(el('a', 'Open Trello', { href: card.url, target: '_blank', rel: 'noopener noreferrer' }),
      el('p', 'Trello updated'), el('time', sessionSchema.timestampLabel(card.updatedAt), { datetime: card.updatedAt }));
    header.append(title, trello); article.append(header);
    const supporting = el('div', '', { class: 'teaching-slot-session-support' });
    for (const [key, label] of [['preparation', 'Preparation & Reminders'], ['continuation', 'Continuation']]) {
      if (!plan[key]) continue;
      const panel = el('section', '', { class: 'teaching-slot-support', 'data-session-panel': key });
      panel.append(el('h4', label), el('p', plan[key], { class: 'session-preserved-text' }));
      supporting.append(panel);
    }
    if (supporting.children.length) article.append(supporting);
    article.append(el('p', 'Flexible teaching organiser. These intentions are not confirmed classroom progress.', { class: 'teaching-slot-disclaimer' }));
    const workspace = el('div', '', { class: 'teaching-slot-workspace' });
    const left = el('div', '', { class: 'teaching-slot-column' }), right = el('div', '', { class: 'teaching-slot-column' });
    const sequence = el('div', '', { class: 'teaching-slot-list', role: 'group', 'aria-label': 'Select a teaching slot' });
    const panelId = 'teaching-slot-details-' + card.id;
    const details = el('section', '', { class: 'teaching-slot-detail', id: panelId,
      'aria-label': 'Selected teaching activity', 'aria-live': 'polite', 'aria-atomic': 'true' });
    const buttons = [];
    function select(slot, button) {
      for (const candidate of buttons) candidate.setAttribute('aria-pressed', String(candidate === button));
      const typing = ['Routine', 'Kit'].includes(slot.type) && slot.title.trim() === 'Typing Kit';
      const heading = el('div', '', { class: 'teaching-slot-detail-heading' });
      heading.append(el('span', typing ? '\u2328' : activityIcons[slot.type], { class: 'teaching-resource-icon', 'aria-hidden': 'true' }),
        el('h4', slot.title));
      const badges = el('div', '', { class: 'teaching-slot-detail-labels' });
      badges.append(el('span', slot.type, { class: 'teaching-slot-type-label' }));
      const week = typing && /^Week ([1-9]\d*) reminder: Typing Kit\./m.exec(plan.preparation);
      const reminder = slot.reminder || (week ? 'Week ' + week[1] : '');
      if (reminder) badges.append(el('span', reminder, { class: 'teaching-slot-reminder' }));
      details.replaceChildren(heading, badges);
      if (typing || slot.details) details.append(el('p', typing ? typingDescription : slot.details.trim(), { class: 'session-preserved-text teaching-activity-description' }));
      const resources = [...(typing ? typingResources : []), ...(slot.resource || slot.resourceUrl ? [slot] : []), ...slot.resources];
      const grid = el('div', '', { class: 'teaching-resource-grid' });
      for (const [category, style] of Object.entries(categories)) {
        const entries = resources.filter(resource => (resource.category || 'Web Links') === category);
        if (!entries.length) continue;
        const section = el('section', '', { class: 'teaching-resource-section', 'data-resource-category': style.colour });
        const label = el('h5');
        label.append(el('span', style.icon, { 'aria-hidden': 'true' }), ' ' + category);
        const list = el('ul', '', { class: 'teaching-slot-resources' }), seen = new Set();
        for (const resource of entries) {
          const legacyTyping = typing && category === 'Web Links' && /^(?:Existing CW Routine\s*(?:→|->)\s*)?Typing Kit$/i.test(resource.resource);
          const url = legacyTyping && (!resource.resourceUrl || resource.resourceUrl.trim().toLowerCase() === 'unresolved') ?
            typingResources[1].resourceUrl : category === 'Web Links' ? resolveResource({ ...resource, type: slot.type }, programme) :
              resourceUrl(resource.resourceUrl);
          if (typing && url && seen.has(url)) continue;
          if (url) seen.add(url);
          const item = el('li', '', { class: 'teaching-slot-resource' });
          item.append(url ? el('a', resource.resource || 'Open resource', { class: 'teaching-resource-link', href: url, target: '_blank', rel: 'noopener noreferrer' }) :
            el('span', (resource.resource || 'Resource') + ' - Link unavailable', { class: 'teaching-resource-unavailable' }));
          list.append(item);
        }
        section.append(label, list); grid.append(section);
      }
      if (grid.children.length) details.append(grid);
    }
    for (const slot of plan.slots) {
      const button = el('button', '', { type: 'button', class: 'teaching-slot', 'data-slot-type': slot.colour,
        'aria-pressed': 'false', 'aria-controls': panelId });
      const row = el('span', '', { class: 'teaching-slot-row' });
      const labels = el('span', '', { class: 'teaching-slot-labels' });
      labels.append(el('span', 'Slot ' + slot.number), el('span', slot.type));
      row.append(el('strong', slot.title, { class: 'teaching-slot-title' }), labels);
      button.append(row); button.addEventListener('click', () => select(slot, button));
      buttons.push(button); sequence.append(button);
    }
    left.append(sequence); right.append(details);
    select(plan.slots[0], buttons[0]);
    workspace.append(left, right); article.append(workspace); return article;
  }
  const api = { parse, render, resolveResource, FormatError };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.plannerTeachingSlots = api;
})(globalThis);
