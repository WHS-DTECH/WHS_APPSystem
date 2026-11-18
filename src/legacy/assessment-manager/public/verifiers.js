(() => {
  'use strict';
  function mount(host, { el, request, mutate, year, onEmail }) {
    const root = el('section', '', { class: 'verifiers-directory' });
    for (const type of ['input', 'change']) root.addEventListener(type, event => event.stopPropagation());
    host.replaceChildren(root);
    root.append(el('h3', 'Shared verifier directory'),
      el('p', 'Contact details are shared with Assessment Manager staff. Teachers see their own history and forms; verified HoLAs can read full records for their current department. NZQA Expert Moderator is a staff-recorded designation, not an independent NZQA check.'));
    const status = el('p', '', { role: 'status' }), listing = el('div'), editor = el('section'), history = el('section');
    let dirty = false, saving = false, historyVersion = 0;
    root.append(status, listing, editor, history);
    function message(value, failed = false) { status.textContent = value; status.setAttribute('role', failed ? 'alert' : 'status'); }
    function button(label, action, parent = root) {
      const control = el('button', label, { type: 'button' });
      control.addEventListener('click', async () => {
        if (saving) return;
        saving = true; control.disabled = true; root.inert = true;
        try { await action(); }
        catch (error) { console.error('Verifier action failed.'); message(error.message, true); }
        finally { saving = false; control.disabled = false; root.inert = false; }
      });
      parent.append(control); return control;
    }
    function field(parent, key, label, value = '', type = 'text') {
      const wrapper = el('label', label), control = el(type === 'textarea' ? 'textarea' : 'input', '', { id: 'verifier-' + key });
      if (type !== 'textarea') control.type = type;
      control.value = String(value); control.maxLength = type === 'textarea' ? 8000 : 500;
      control.addEventListener('input', () => { dirty = true; message('Unsaved verifier changes. Save or cancel before leaving.'); });
      wrapper.append(control); parent.append(wrapper); return control;
    }
    function abandon() {
      if (dirty && !confirm('Discard unsaved verifier changes?')) return false;
      dirty = false; editor.replaceChildren(); return true;
    }
    async function load() {
      const result = await request('verifiers');
      const contacts = result.verifiers;
      listing.replaceChildren();
      const table = el('table', '', { class: 'moderation-records-table' }), head = el('tr'), body = el('tbody');
      for (const name of ['Name', 'School', 'Position', 'Email', 'Designation', 'Actions']) head.append(el('th', name, { scope: 'col' }));
      const heading = el('thead'); heading.append(head); table.append(heading, body);
      for (const contact of contacts) {
        const row = el('tr');
        for (const value of [contact.name, contact.school, contact.position, contact.email,
          contact.nzqa_expert ? 'NZQA Expert Moderator' : 'Verifier']) row.append(el('td', value || 'Not recorded'));
        const actions = el('td');
        button('Edit details', () => editContact(contact), actions);
        button('Moderation history', () => showHistory(contact), actions);
        button('Email this verifier', () => { if (dirty) throw new Error('Save or cancel your changes before preparing an email.'); return onEmail(contact); }, actions);
        row.append(actions); body.append(row);
      }
      const scroll = el('div', '', { class: 'moderation-records-table-scroll' });
      scroll.append(table); listing.append(scroll);
      if (!contacts.length) listing.append(el('p', 'No verifiers saved yet.'));
    }
    function editContact(contact = {}) {
      if (!abandon()) return;
      editor.append(el('h4', contact.id ? 'Edit verifier' : 'Add verifier'));
      const fields = el('div', '', { class: 'moderation-fields' }); editor.append(fields);
      const name = field(fields, 'name', 'Name', contact.name || '');
      const school = field(fields, 'school', 'School', contact.school || '');
      const position = field(fields, 'position', 'Position', contact.position || '');
      const email = field(fields, 'email', 'Email address', contact.email || '', 'email');
      const expertLabel = el('label', 'NZQA Expert Moderator'), expert = el('input', '', { type: 'checkbox', id: 'verifier-expert' });
      expert.type = 'checkbox'; expert.checked = Boolean(contact.nzqa_expert);
      expert.addEventListener('change', () => { dirty = true; }); expertLabel.append(expert); fields.append(expertLabel);
      const notes = field(fields, 'notes', 'Notes / designation reference', contact.notes || '', 'textarea');
      button('Save verifier', async () => {
        const verifier = { name: name.value.trim(), school: school.value.trim(), position: position.value.trim(),
          email: email.value.trim(), nzqaExpert: expert.checked, notes: notes.value };
        await mutate('verifiers/' + (contact.id || crypto.randomUUID()), { verifier, revision: contact.revision || 0 });
        dirty = false; editor.replaceChildren(); await load(); message('Verifier saved.');
      }, editor);
      button('Cancel changes', abandon, editor);
      name.focus();
    }
    async function showHistory(contact) {
      if (!abandon()) return;
      const version = ++historyVersion;
      history.replaceChildren(el('h4', contact.name + ' - moderation history'), el('p', 'Loading history...'));
      const result = await request('verifiers/' + contact.id + '/history');
      if (version !== historyVersion || !root.isConnected) return;
      history.replaceChildren(el('h4', contact.name + ' - moderation history'),
        el('p', 'Linked records reflect saved verification dates (including dated named samples). Undated records remain awaiting moderation. Email drafts do not complete moderation. Older/external entries are entered manually.'));
      const table = el('table', '', { class: 'moderation-records-table' }), heading = el('tr'), body = el('tbody'), head = el('thead');
      for (const title of ['Year', 'Department', 'Standard / title', 'Moderation', 'Source / actions']) heading.append(el('th', title, { scope: 'col' }));
      head.append(heading); table.append(head, body);
      const entries = [...result.linked.map(item => ({ ...item, source: 'linked' })),
        ...result.manual.map(item => ({ ...item, source: 'manual' }))].sort((a, b) => b.year - a.year || String(a.title).localeCompare(String(b.title)));
      for (const entry of entries) {
        const row = el('tr'), actions = el('td');
        const date = entry.source === 'linked' ? entry.moderatedDate : entry.moderated_date;
        for (const value of [entry.year, entry.department, [entry.standardNumber || entry.standard_number, entry.title].filter(Boolean).join(' - '),
          entry.pending ? 'Awaiting moderation' : date || 'Moderated (year recorded)']) row.append(el('td', String(value)));
        actions.append(el('span', entry.source === 'linked' ? 'Assessment Manager' : 'Manual / external'));
        if (entry.source === 'linked') button('View full record', () => viewRecord(entry), actions);
        else {
          if (entry.notes) actions.append(el('p', entry.notes));
          if (entry.own) button('Edit history entry', () => editHistory(contact, entry), actions);
        }
        row.append(actions); body.append(row);
      }
      const scroll = el('div', '', { class: 'moderation-records-table-scroll' }); scroll.append(table); history.append(scroll);
      if (!entries.length) history.append(el('p', 'No moderation history is visible to your account for this verifier.'));
      button('Link my existing record', () => linkRecord(contact), history);
      button('Add older / external moderation', () => editHistory(contact), history);
    }
    function editHistory(contact, entry = {}) {
      if (!abandon()) return;
      editor.append(el('h4', 'Older / external moderation - ' + contact.name));
      const fields = el('div', '', { class: 'moderation-fields' }); editor.append(fields);
      const recordYear = field(fields, 'history-year', 'Assessment / moderation year', entry.year || year, 'number');
      const department = field(fields, 'history-department', 'Department', entry.department || '');
      const number = field(fields, 'history-number', 'Standard number (optional)', entry.standard_number || '');
      const title = field(fields, 'history-title', 'Standard / assessment title', entry.title || '');
      const date = field(fields, 'history-date', 'Date moderated (optional)', entry.moderated_date || '', 'date');
      const notes = field(fields, 'history-notes', 'Notes / evidence reference', entry.notes || '', 'textarea');
      button('Save history entry', async () => {
        await mutate('verifiers/' + contact.id + '/history/' + (entry.id || crypto.randomUUID()), { revision: entry.revision || 0,
          entry: { year: Number(recordYear.value), department: department.value.trim(), standardNumber: number.value.trim(),
            title: title.value.trim(), moderatedDate: date.value, notes: notes.value } });
        dirty = false; editor.replaceChildren(); await showHistory(contact); message('Moderation history saved.');
      }, editor);
      button('Cancel changes', abandon, editor);
    }
    function linkRecord(contact) {
      if (!abandon()) return;
      editor.append(el('h4', 'Link one of my moderation records - ' + contact.name),
        el('p', 'Linking records the verifier ID and fills their name, school and position. It does not record completion or update Drive documents. Existing name-only verifiers are never matched automatically.'));
      const recordYear = field(editor, 'link-year', 'Record year', year, 'number');
      const select = el('select', '', { 'aria-label': 'Record to link' }); editor.append(select);
      button('Load my records for year', async () => {
        const result = await request('moderation/' + encodeURIComponent(recordYear.value));
        select.replaceChildren(el('option', 'Choose a record', { value: '' }));
        for (const item of result.records.filter(item => !item.parent_record)) select.append(el('option', item.title || item.standard_number, { value: item.entry_key }));
        select.value = ''; select.dataset.year = recordYear.value;
      }, editor);
      button('Link verifier to record', async () => {
        if (!select.value || select.dataset.year !== recordYear.value) throw new Error('Load this year and choose a moderation record first.');
        if (!confirm('Use ' + contact.name + ' as the verifier for this record? Existing verifier name, school and position will be replaced; all other marking stays unchanged.')) return;
        const saved = await request(recordYear.value + '/moderation/' + select.value);
        if (!saved.revision || saved.content.parentRecord) throw new Error('This assessment record is no longer available.');
        const internal = JSON.parse(saved.content.internal || '{}');
        const content = { ...saved.content, internal: JSON.stringify({ ...internal, verifierId: contact.id,
          verifierName: contact.name, verifierSchool: contact.school, verifierPosition: contact.position }) };
        await mutate(recordYear.value + '/moderation/' + select.value, { content, revision: saved.revision });
        dirty = false; editor.replaceChildren(); await showHistory(contact); message('Verifier linked. Existing moderation dates are unchanged.');
      }, editor);
      button('Cancel changes', abandon, editor);
    }
    async function viewRecord(entry) {
      const result = await request('verifiers/records/' + entry.ownerId + '/' + entry.year + '/' + entry.record);
      if (!abandon()) return;
      editor.append(el('h4', 'Full moderation record - read only'));
      const { common, documents } = globalThis.plannerModerationSchema;
      for (const content of [result.content, ...result.children.map(child => child.content)]) {
        const panel = el('section', '', { class: 'moderation-panel verifier-readonly' });
        panel.append(el('h4', content.title || 'Moderation record'));
        for (const [key, label] of common) if (content[key]) panel.append(el('p', label + ': ' + content[key]));
        for (const [key, definition] of Object.entries(documents)) {
          const value = JSON.parse(content[key] || '{}'), section = el('details');
          section.append(el('summary', definition.title));
          for (const [group, fields] of definition.groups) {
            section.append(el('h5', group));
            for (const [field, label] of fields) if (value[field]) section.append(el('p', label + ': ' + value[field]));
          }
          const file = JSON.parse(content.driveDocuments || '{}')[key];
          if (file && /^[A-Za-z0-9_-]{10,200}$/.test(file.id)) section.append(el('a', 'Open linked Drive document (existing permissions apply)', {
            href: file.mimeType === 'application/vnd.google-apps.document' ? 'https://docs.google.com/document/d/' + file.id + '/edit'
              : 'https://drive.google.com/file/d/' + file.id + '/view', target: '_blank', rel: 'noopener noreferrer' }));
          for (const [i, row] of (value[definition.rows?.key] || []).entries()) {
            section.append(el('h5', 'Entry ' + (i + 1)));
            for (const [field, label] of definition.rows.fields) if (row[field] && !(key === 'schedule' && field === 'grade')) section.append(el('p', label + ': ' + row[field]));
          }
          for (const field of ['notes', 'resources']) if (value[field]) section.append(el('p', field + ': ' + value[field]));
          panel.append(section);
        }
        editor.append(panel);
      }
      button('Close full record', () => editor.replaceChildren(), editor);
    }
    button('Add verifier', () => editContact());
    button('Email verifier', () => { if (dirty) throw new Error('Save or cancel your changes before preparing an email.'); return onEmail(); });
    load().catch(error => { console.error('Verifier directory load failed.'); message(error.message, true); button('Retry verifier directory', load); });
    return { hasUnsavedChanges: () => dirty || saving,
      saveNow: async () => { if (dirty || saving) throw new Error('Save or cancel verifier changes, or wait for the current action to finish, before leaving.'); return true; } };
  }
  globalThis.assessmentVerifiers = { mount };
})();
