(() => {
  function groups(entries) {
    const result = new Map();
    for (const entry of entries) {
      if (entry.kind === 'routine') continue;
      if (!result.has(entry.sequenceKey)) result.set(entry.sequenceKey, []);
      result.get(entry.sequenceKey).push(entry);
    }
    return result;
  }
  function proposedEntries(data, selection, classKey) {
    const chosen = new Set(data.entries.filter(item => item.kind === 'routine').map(item => item.id));
    for (const [key, entries] of groups(data.entries)) {
      if (entries[0].kind === 'kit' && !selection.kits.includes(key)) continue;
      const saved = data.progress.find(row => row.class_key === classKey && row.sequence_key === key);
      const entry = entries.find(item => item.id === saved?.entry_id);
      if (entry) chosen.add(entry.id);
    }
    return data.entries.filter(entry => chosen.has(entry.id));
  }
  function textWithLinks(el, text) {
    const container = el('p', '', { class: 'session-preserved-text' });
    const lines = text.split(/\r?\n/).filter(line => !/^(?:Type|Unit|Lesson|Plan|Activity|Library card):/i.test(line));
    const value = lines.join('\n');
    const pattern = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>()]+)/g;
    let last = 0, match;
    while ((match = pattern.exec(value))) {
      container.append(document.createTextNode(value.slice(last, match.index)));
      const address = match[2] || match[3];
      try {
        const url = new URL(address);
        if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid link');
        container.append(el('a', match[1] || address, { href: url.href, target: '_blank', rel: 'noopener noreferrer' }));
      } catch {
        container.append(document.createTextNode(match[0]));
      }
      last = pattern.lastIndex;
    }
    container.append(document.createTextNode(value.slice(last)));
    return container;
  }
  function preview(el, entry) {
    const details = el('details', '', { class: 'teaching-day-card' });
    details.append(el('summary', entry.title), textWithLinks(el, entry.description),
      el('a', 'Open library card in Trello', { href: entry.url, target: '_blank', rel: 'noopener noreferrer' }));
    return details;
  }
  function warnings(el, host, issues) {
    for (const issue of issues) host.append(el('p', issue.name + ': ' + issue.message, { role: 'alert' }));
  }
  function draftSlot(entry, number) {
    const source = entry.source;
    const details = source.description.split(/\r?\n/)
      .filter(line => !/^(?:Type|Unit|Lesson|Plan|Activity|Scheduling|Library card):/i.test(line)).join('\n').trim();
    const resources = [{ category: 'Web Links', resource: 'Open library card in Trello', resourceUrl: source.url }];
    const links = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>()]+)/g;
    for (const line of details.split('\n')) {
      for (const match of line.matchAll(links)) {
        const label = match[1] || line.slice(0, match.index).replace(/[:\s-]+$/, '').trim() || 'Resource';
        const category = /^unit plan$/i.test(label) ? 'Unit Plan' : /^lesson plan$/i.test(label) ? 'Lesson Plan' :
          /^print resource/i.test(label) ? 'Print Resources' : 'Web Links';
        resources.push({ category, resource: label, resourceUrl: match[2] || match[3] });
      }
    }
    const type = { routine: 'Routine', unit: 'Unit Library', kit: 'Kit' }[entry.kind];
    return { number: String(number), type, colour: { routine: 'routine', unit: 'unit-library', kit: 'kit' }[entry.kind],
      title: entry.title, unit: entry.kind === 'unit' ? entry.sequence : '', lesson: entry.kind === 'unit' ? entry.title : '',
      details, reminder: '', resource: '', resourceUrl: '', resources };
  }
  function mountPage(host, { el, year, request, openTeachingDay, name = 'JuniorDTECH', semester: initialSemester = 1, loadClasses }) {
    const page = el('section', '', { 'data-planner-navigation': '', class: 'junior-teaching' });
    const heading = el('div', '', { class: 'planner-nav-buttons' });
    const back = el('button', 'Teaching Day', { type: 'button' });
    back.addEventListener('click', openTeachingDay);
    const refresh = el('button', 'Refresh from Trello', { type: 'button' });
    heading.append(back, refresh);
    const middle = name === 'MiddleDTECH';
    const semester = el('select', '', { 'aria-label': 'Semester' });
    if (middle) {
      semester.append(el('option', 'Semester 1', { value: '1' }), el('option', 'Semester 2', { value: '2' }));
      semester.value = String(initialSemester);
      heading.append(semester);
    }
    const status = el('p', 'Loading ' + name + '...', { role: 'status' });
    const body = el('div');
    page.append(el('h2', name + ' teaching order', { class: 'paper-heading' }), heading,
      el('p', 'Add, edit and reorder cards in Trello. Planner progress changes only when you confirm it here.'),
      status, body);
    host.append(page);
    let data, classes, busy = false, generation = 0;
    const scope = () => String(year) + (middle ? '/' + semester.value : '');
    async function load() {
      const current = ++generation;
      busy = true; refresh.disabled = true; semester.disabled = true;
      status.setAttribute('role', 'status'); status.textContent = 'Reading the teaching board...';
      try {
        const [result, classList] = await Promise.all([
          request(scope()), middle ? loadClasses(year, Number(semester.value)) : Promise.resolve(['JPI', 'JSR'])
        ]);
        if (current !== generation || !page.isConnected) return;
        data = result; classes = classList; render();
        status.textContent = 'Trello order and library content are read-only. Progress is private to your Planner.';
      } catch (error) {
        if (current !== generation || !page.isConnected) return;
        body.replaceChildren(); status.setAttribute('role', 'alert'); status.textContent = error.message;
      } finally { if (current === generation) { busy = false; refresh.disabled = false; semester.disabled = false; } }
    }
    async function change(classKey, sequenceKey, entryId, revision, action) {
      if (busy) return;
      const entry = data.entries.find(item => item.id === entryId);
      if (!entry || !confirm((action === 'advance' ? 'Confirm ' + classKey + ' is ready to move on to ' :
        'Set ' + classKey + ' current activity to ') + entry.title + '?')) return;
      busy = true; page.setAttribute('aria-busy', 'true'); page.setAttribute('data-preferences-busy', 'true');
      semester.disabled = true;
      for (const button of page.querySelectorAll('button')) button.disabled = true;
      try {
        await request(scope() + '/progress', { method: 'PUT', body: { classKey, sequenceKey, entryId, revision, action } });
        await load();
      } catch (error) {
        status.setAttribute('role', 'alert'); status.textContent = error.message + ' Refresh to review the current state.';
      } finally {
        busy = false; page.removeAttribute('aria-busy'); page.removeAttribute('data-preferences-busy');
        semester.disabled = false;
        for (const button of page.querySelectorAll('button')) button.disabled = false;
      }
    }
    function render() {
      body.replaceChildren();
      warnings(el, body, data.issues);
      const columns = el('div', '', { class: 'teaching-dashboard-columns' });
      const order = el('section', '', { 'aria-label': name + ' teaching order' });
      order.append(el('h3', name + ' teaching order'));
      const list = el('ol');
      for (const entry of data.entries) {
        const item = el('li');
        item.append(el('a', entry.name, { href: entry.url, target: '_blank', rel: 'noopener noreferrer' }),
          el('span', ' — ' + (entry.kind === 'routine' ? 'Recurring routine' : entry.sequence)));
        list.append(item);
      }
      order.append(list);
      if (!data.entries.length) order.append(el('p', middle && data.orderCardCount === 0 ?
        'No MiddleDTECH teaching order has been set' : 'No verified order entries are available.'));
      const libraries = el('section', '', { 'aria-label': 'Teaching libraries' });
      for (const [label, items] of [['Unit Plans', data.libraries.units], ['Licence Kit Plans', data.libraries.kits]]) {
        libraries.append(el('h3', label));
        const sets = new Map();
        for (const item of items) {
          if (!sets.has(item.sequence)) sets.set(item.sequence, []);
          sets.get(item.sequence).push(item);
        }
        for (const [name, cards] of sets) {
          const group = el('details');
          group.append(el('summary', name));
          for (const card of cards) group.append(preview(el, card));
          libraries.append(group);
        }
        if (!items.length) libraries.append(el('p', 'No verified library cards are available.'));
      }
      columns.append(order, libraries); body.append(columns);
      const progress = el('section', '', { class: 'session-section', 'aria-label': 'Class progress' });
      progress.append(el('h3', 'Class progress'));
      const sequences = groups(data.entries);
      if (!classes.length) progress.append(el('p', 'No MiddleDTECH classes were found in this semester’s timetable.'));
      for (const classKey of classes) {
        progress.append(el('h4', classKey));
        for (const [key, entries] of sequences) {
          const saved = data.progress.find(row => row.class_key === classKey && row.sequence_key === key);
          const index = entries.findIndex(item => item.id === saved?.entry_id);
          const panel = el('div', '', { class: 'teaching-day-card' });
          panel.append(el('strong', entries[0].sequence),
            el('p', !saved ? 'No current activity confirmed.' : index < 0 ?
              'Current activity is missing from the verified order and needs review.' : 'Current: ' + entries[index].title,
              index < 0 && saved ? { role: 'alert' } : {}));
          const choice = el('select', '', { 'aria-label': classKey + ' ' + entries[0].sequence + ' current activity' });
          for (const entry of entries) choice.append(el('option', entry.title, { value: entry.id }));
          if (index >= 0) choice.value = entries[index].id;
          const set = el('button', 'Set current', { type: 'button' });
          set.addEventListener('click', () => change(classKey, key, choice.value, saved?.revision || 0, 'set'));
          panel.append(choice, set);
          if (index >= 0 && data.issues.some(issue => issue.list === name)) {
            panel.append(el('p', 'Review the teaching order before identifying the next activity.', { role: 'alert' }));
          } else if (index >= 0 && entries[index + 1]) {
            const advance = el('button', 'Ready to move on', { type: 'button' });
            advance.addEventListener('click', () => change(classKey, key, entries[index + 1].id, saved.revision, 'advance'));
            panel.append(advance, el('p', 'Next: ' + entries[index + 1].title));
          }
          progress.append(panel);
        }
        for (const row of data.progress.filter(item => item.class_key === classKey && !sequences.has(item.sequence_key))) {
          progress.append(el('p', row.sequence_key + ': saved activity is missing from the teaching order and needs review.', { role: 'alert' }));
        }
      }
      body.append(progress);
    }
    refresh.addEventListener('click', load);
    if (middle) semester.addEventListener('change', load);
    load();
  }
  function mountSession(host, context, { el, request, openPage, name = 'JuniorDTECH', semesterForDate }) {
    let disposed = false, busy = false, data, selection;
    const panel = el('section', '', { 'data-planner-navigation': '', 'aria-label': name + ' shared preparation' });
    const status = el('p', 'Reading ' + name + ' preparation...', { role: 'status' });
    const body = el('div');
    panel.append(el('h3', name + ' shared preparation'), status, body);
    host.append(panel);
    const sessionPath = 'session/' + context.date + '/' + context.slot + '/' + context.classKey;
    async function load() {
      try {
        const semester = semesterForDate ? await semesterForDate(context.date) : null;
        const scope = context.date.slice(0, 4) + (semester ? '/' + semester : '');
        const [catalogue, kits] = await Promise.all([request(scope), request(sessionPath)]);
        if (disposed || !panel.isConnected) return;
        data = catalogue; selection = kits; render();
        status.textContent = 'Read-only Trello content; progress changes only after confirmation.';
      } catch (error) {
        if (disposed || !panel.isConnected) return;
        status.setAttribute('role', 'alert'); status.textContent = error.message + ' Notes remain available.';
      }
    }
    async function toggle(key, enabled) {
      if (busy) return;
      busy = true;
      panel.setAttribute('data-preferences-busy', 'true');
      const kits = enabled ? [...selection.kits, key] : selection.kits.filter(item => item !== key);
      for (const checkbox of panel.querySelectorAll('input')) checkbox.disabled = true;
      try {
        selection = await request(sessionPath, { method: 'PUT', body: { kits, revision: selection.revision } });
        if (!disposed && panel.isConnected) render();
      } catch (error) {
        if (!disposed && panel.isConnected) {
          render(); status.setAttribute('role', 'alert');
          status.textContent = error.message + ' Refresh the session to review the saved kit selection.';
        }
      } finally {
        busy = false;
        panel.removeAttribute('data-preferences-busy');
        for (const checkbox of panel.querySelectorAll('input')) checkbox.disabled = false;
      }
    }
    function render() {
      body.replaceChildren();
      warnings(el, body, data.issues);
      if (name === 'MiddleDTECH' && data.orderCardCount === 0) {
        body.append(el('p', 'No MiddleDTECH teaching order has been set'));
      }
      const sets = groups(data.entries);
      const continuation = [];
      for (const [key, entries] of sets) {
        const first = entries[0], saved = data.progress.find(row => row.class_key === context.classKey && row.sequence_key === key);
        const index = entries.findIndex(item => item.id === saved?.entry_id);
        const section = el('section', '', { class: 'session-section' });
        section.append(el('h4', first.sequence));
        if (first.kind === 'kit') {
          const label = el('label', ' Include this kit in this session');
          const checkbox = el('input', '', { type: 'checkbox', 'aria-label': 'Include ' + first.sequence + ' in this session' });
          checkbox.checked = selection.kits.includes(key);
          checkbox.addEventListener('change', () => toggle(key, checkbox.checked));
          label.prepend(checkbox); section.append(label);
          if (!checkbox.checked) { body.append(section); continue; }
        }
        if (!saved) section.append(el('p', 'No current activity confirmed. Set progress in ' + name + '.'));
        else if (index < 0) section.append(el('p', 'The saved current activity is missing from the verified order and needs review.', { role: 'alert' }));
        else {
          section.append(el('p', 'Current: ' + entries[index].title));
          if (data.issues.some(issue => issue.list === name)) {
            section.append(el('p', 'Review the teaching order before identifying the next activity.', { role: 'alert' }));
          } else if (entries[index + 1]) {
            section.append(el('p', 'Next: ' + entries[index + 1].title));
            continuation.push(first.sequence + ': possible next activity ' + entries[index + 1].title + '.');
          }
        }
        body.append(section);
      }
      for (const row of data.progress.filter(item => item.class_key === context.classKey && !sets.has(item.sequence_key))) {
        body.append(el('p', row.sequence_key + ': saved activity is missing and needs review.', { role: 'alert' }));
      }
      for (const key of selection.kits.filter(item => !sets.has(item))) {
        const warning = el('div', '', { role: 'alert' });
        const remove = el('button', 'Remove unavailable kit from this session', { type: 'button' });
        remove.addEventListener('click', () => toggle(key, false));
        warning.append(el('p', key + ': a kit selected for this session is unavailable and needs review.'), remove);
        body.append(warning);
      }
      const entries = proposedEntries(data, selection, context.classKey);
      if (entries.length) {
        const slot = globalThis.plannerSessionSchema.slots.find(item => item[0] === context.slot);
        const plan = { metadata: { class_key: context.classKey, display_title: name + ' proposed session',
          teaching_date: context.date, start_time: slot[2], room: context.location || '' },
          slots: entries.map((entry, index) => draftSlot(entry, index + 1)),
          preparation: entries.flatMap(entry => entry.source.description.split(/\r?\n/)
            .filter(line => /^Preparation(?: & reminders)?:\s*\S/i.test(line)).map(line => line.replace(/^[^:]+:\s*/, ''))).join('\n'),
          continuation: [...continuation, ...entries.flatMap(entry => entry.source.description.split(/\r?\n/)
            .filter(line => /^Continuation:\s*\S/i.test(line)).map(line => line.replace(/^[^:]+:\s*/, '')))].join('\n') };
        body.prepend(globalThis.plannerTeachingSlots.renderPlan(el, plan,
          { id: 'draft-' + context.date + '-' + context.slot, draft: true }));
      }
      const open = el('button', 'Open ' + name + ' teaching order and progress', { type: 'button' });
      open.addEventListener('click', openPage); body.append(open);
    }
    load();
    return { dispose() { disposed = true; } };
  }
  globalThis.plannerJuniorTeaching = { mountPage, mountSession, proposedEntries, draftSlot };
})();
