(function (root) {
  const types = { Routine: 'routine', Kit: 'kit', Activity: 'activity', 'Unit Library': 'unit-library', 'Whānau': 'whanau' };
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
        current = { number: slot[1], type: slot[2], colour: types[slot[2]], title: slot[3], details: '', resource: '', resourceUrl: '' };
        current.fields = new Set(); slots.push(current); lastField = undefined; continue;
      }
      if (line.startsWith('### ')) throw new FormatError('Use SLOT n | Type | Title headings.');
      if (!line.trim()) { if (lastField === 'details') current.details += '\n'; continue; }
      if (!current) throw new FormatError('A slot heading is required before its content.');
      const field = /^(Resource URL|Resource|Details):[ \t]*(.*)$/.exec(line);
      if (field) {
        const key = { Resource: 'resource', 'Resource URL': 'resourceUrl', Details: 'details' }[field[1]];
        if (current.fields.has(key)) throw new FormatError('Duplicate slot field.');
        current.fields.add(key); current[key] = field[2]; lastField = key;
      } else if (lastField === 'details') current.details += '\n' + line;
      else throw new FormatError('Use Resource, Resource URL and Details fields.');
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
      el('p', 'Room ' + metadata.room + ' | ' + new Intl.DateTimeFormat('en-NZ', {
        dateStyle: 'full', timeZone: 'Pacific/Auckland'
      }).format(new Date(metadata.teaching_date + 'T00:00:00Z')) + ' | ' + metadata.start_time + ' NZ'));
    const trello = el('div', '', { class: 'teaching-slot-source' });
    trello.append(el('a', 'Open Trello', { href: card.url, target: '_blank', rel: 'noopener noreferrer' }),
      el('p', 'Trello updated'), el('time', new Intl.DateTimeFormat('en-NZ', {
        dateStyle: 'medium', timeStyle: 'short', timeZone: 'Pacific/Auckland'
      }).format(new Date(card.updatedAt)), { datetime: card.updatedAt }));
    header.append(title, trello); article.append(header,
      el('p', 'Flexible teaching organiser. These intentions are not confirmed classroom progress.', { class: 'teaching-slot-disclaimer' }));
    for (const slot of plan.slots) {
      const details = el('details', '', { class: 'teaching-slot', 'data-slot-type': slot.colour });
      const summary = el('summary');
      summary.append(el('span', 'Slot ' + slot.number + ' | ' + slot.type + ' | ', { class: 'teaching-slot-type' }), el('strong', slot.title));
      details.append(summary);
      if (slot.details) details.append(el('p', slot.details.trim(), { class: 'session-preserved-text' }));
      if (slot.resource || slot.resourceUrl) {
        const url = resolveResource(slot, programme), resource = el('p', '', { class: 'teaching-slot-resource' });
        resource.append(url ? el('a', slot.resource || 'Open resource', { href: url, target: '_blank', rel: 'noopener noreferrer' }) :
          el('span', (slot.resource || 'Resource') + ' - Link unavailable'));
        details.append(resource);
      }
      article.append(details);
    }
    const panels = el('div', '', { class: 'teaching-slot-panels' });
    for (const [key, label] of [['preparation', 'Preparation & Reminders'], ['continuation', 'Continuation']]) {
      if (!plan[key]) continue;
      const panel = el('section'); panel.append(el('h4', label), el('p', plan[key], { class: 'session-preserved-text' }));
      panels.append(panel);
    }
    article.append(panels); return article;
  }
  const api = { parse, render, resolveResource, FormatError };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.plannerTeachingSlots = api;
})(globalThis);
