(() => {
  'use strict';
  async function mount(host, { el, request }) {
    const page = el('section', '', { class: 'moderation-page supplier-page' });
    const status = el('p', '', { role: 'status', 'aria-live': 'polite' }), list = el('div');
    const summary = el('section', '', { class: 'moderation-panel supplier-summary' }), summaryList = el('div');
    summary.append(el('h3', 'Updates to review'), summaryList);
    page.append(el('h2', 'Assessment Suppliers', { class: 'paper-heading' }),
      el('p', 'Shared with signed-in staff. Public supplier details are editable. Purchase history is not connected; existing library purchase details are unchanged.'),
      status, summary, list);
    host.append(page);
    const models = [];
    function report(error) {
      console.error('Supplier operation failed.');
      status.setAttribute('role', 'alert'); status.textContent = error.message;
    }
    function button(label, work, parent) {
      const control = el('button', label, { type: 'button' });
      control.addEventListener('click', async () => {
        control.disabled = true;
        try { await work(); } catch (error) { report(error); }
        finally { control.disabled = false; }
      });
      parent.append(control);
      return control;
    }
    function input(parent, id, label, value, type, change) {
      const wrapper = el('div', '', { class: 'planner-field' });
      const control = el(type === 'textarea' ? 'textarea' : 'input', '', { id });
      if (type !== 'textarea') control.setAttribute('type', type || 'text');
      control.setAttribute('maxlength', type === 'textarea' ? '8000' : '500');
      control.value = value || '';
      control.addEventListener('input', () => change(control.value));
      wrapper.append(el('label', label, { for: id }), control); parent.append(wrapper);
      return control;
    }
    function data(model) {
      return Object.fromEntries(['name', 'website', 'email', 'phone', 'notes'].map(key => [key, model.controls[key].value.trim()]));
    }
    async function saveOne(model) {
      if (model.saving) { await model.saving; if (model.dirty) return saveOne(model); return; }
      if (!model.dirty) return;
      const supplier = data(model), snapshot = JSON.stringify(supplier);
      if (!supplier.name) throw new Error('Enter a supplier name before saving.');
      model.saving = request('suppliers/' + model.id, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplier, revision: model.revision }) });
      try {
        const result = await model.saving;
        model.revision = result.revision;
        model.dirty = JSON.stringify(data(model)) !== snapshot;
        model.heading.textContent = supplier.name;
        if (model.cancel) model.cancel.hidden = true;
        status.setAttribute('role', 'status'); status.textContent = 'Supplier saved.';
      } finally { model.saving = undefined; }
      if (model.dirty) return saveOne(model);
    }
    async function saveNow() {
      for (const model of models) {
        if (model.reminderDraft) throw new Error('Save or clear the unfinished update reminder before leaving.');
        await saveOne(model);
      }
      return true;
    }
    async function loadSummary() {
      const result = await request('suppliers/reminders');
      if (!Array.isArray(result.reminders) || typeof result.more !== 'boolean') throw new Error('Supplier update reminders could not be read.');
      summaryList.replaceChildren();
      if (!result.reminders.length) summaryList.append(el('p', 'No updates awaiting review.'));
      if (result.more) summaryList.append(el('p', 'Showing the first 200 open reminders.'));
      for (const reminder of result.reminders) {
        const row = el('div', '', { class: 'supplier-reminder' });
        row.append(el('strong', reminder.supplier_name + ' - ' + reminder.resource_title +
          (reminder.resource_deleted ? ' (deleted library entry)' : '')),
        el('p', reminder.details), el('p', 'Source: ' + reminder.source),
        el('p', reminder.due_date ? 'Reminder date: ' + reminder.due_date : 'Review when ready.'));
        summaryList.append(row);
      }
    }
    function addSupplier(item) {
      const model = { id: item.id, revision: item.revision || 0, dirty: false, reminderDraft: false, controls: {} };
      models.push(model);
      const card = el('section', '', { class: 'moderation-panel supplier-card' });
      model.heading = el('h3', item.name || 'New supplier');
      const grid = el('div', '', { class: 'moderation-fields' }), actions = el('div', '', { class: 'moderation-actions' });
      card.append(model.heading, grid, actions);
      for (const [key, label, type] of [['name', 'Supplier name'], ['website', 'Supplier website', 'url'],
        ['email', 'Contact email', 'email'], ['phone', 'Contact phone', 'tel'], ['notes', 'Notes', 'textarea']]) {
        model.controls[key] = input(grid, 'supplier-' + model.id + '-' + key, label, item[key], type, () => {
          model.dirty = true; status.setAttribute('role', 'status'); status.textContent = 'Unsaved supplier changes.';
        });
      }
      if (item.source_url) {
        const source = el('a', 'Initial public source', { href: item.source_url, target: '_blank', rel: 'noopener noreferrer' });
        const provenance = el('p', 'Initial details checked ' + item.source_checked + '. Later edits are not automatically verified. ');
        provenance.append(source); card.append(provenance);
      }
      button('Save supplier', () => { model.dirty = true; return saveOne(model); }, actions);
      if (!model.revision) model.cancel = button('Cancel new supplier', () => {
        if (model.saving) throw new Error('Wait for the supplier save to finish.');
        if (model.dirty && !confirm('Discard this new supplier?')) return;
        const index = models.indexOf(model); if (index >= 0) models.splice(index, 1);
        card.remove(); status.textContent = 'New supplier cancelled.';
      }, actions);
      const reminders = el('section', '', { class: 'moderation-panel' }), reminderList = el('div'), reminderForm = el('div');
      reminders.append(el('h4', 'Supplier update reminders'),
        el('p', 'Record updates you have verified with the supplier. These reminders do not check supplier accounts or automatically compare versions.'),
        reminderList, reminderForm);
      card.append(reminders);
      let resourceSelect, details, source, dueDate;
      function clearReminder() {
        resourceSelect.value = ''; details.value = ''; source.value = ''; dueDate.value = '';
        model.reminderDraft = false;
      }
      async function loadReminders() {
        await saveOne(model);
        if (!model.revision) throw new Error('Save the supplier before adding reminders.');
        if (model.reminderDraft) throw new Error('Save or clear the unfinished update reminder before refreshing.');
        const [resources, result] = await Promise.all([
          request('suppliers/' + model.id + '/resources'), request('suppliers/' + model.id + '/reminders')
        ]);
        if (!Array.isArray(resources.resources) || !Array.isArray(result.reminders)) throw new Error('Supplier reminders could not be read.');
        if (model.reminderDraft) throw new Error('Refresh cancelled because the reminder form has unsaved changes.');
        reminderList.replaceChildren(); reminderForm.replaceChildren();
        if (resources.more || result.more) reminderList.append(el('p', 'Showing up to 500 assessments and 200 reminders.'));
        if (!result.reminders.length) reminderList.append(el('p', 'No update reminders recorded.'));
        for (const reminder of result.reminders) {
          const row = el('div', '', { class: 'supplier-reminder' });
          row.append(el('strong', reminder.resource_title + (reminder.resource_deleted ? ' (deleted library entry)' : '')),
            el('p', reminder.details), el('p', 'Source: ' + reminder.source),
            el('p', (reminder.completed ? 'Completed' : 'Update to review') + (reminder.due_date ? ' | Reminder date: ' + reminder.due_date : '')));
          button(reminder.completed ? 'Reopen reminder' : 'Mark update reviewed', async () => {
            if (model.reminderDraft) throw new Error('Save or clear the unfinished update reminder first.');
            await request('suppliers/' + model.id + '/reminders/' + reminder.id, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ revision: reminder.revision, completed: !reminder.completed }) });
            await loadReminders(); await loadSummary();
          }, row);
          reminderList.append(row);
        }
        const formGrid = el('div', '', { class: 'moderation-fields' }), selection = el('div', '', { class: 'planner-field' });
        resourceSelect = el('select', '', { id: 'supplier-resource-' + model.id });
        resourceSelect.append(el('option', 'Choose an assessment', { value: '' }),
          ...resources.resources.map(resource => el('option', resource.title + ' (' + resource.standards.map(s => s.number + ' v' + s.version).join(', ') + ')', { value: resource.id })));
        resourceSelect.value = '';
        resourceSelect.addEventListener('change', () => { model.reminderDraft = true; });
        selection.append(el('label', 'Assessment brief', { for: 'supplier-resource-' + model.id }), resourceSelect);
        formGrid.append(selection);
        const changed = () => { model.reminderDraft = true; };
        details = input(formGrid, 'supplier-update-' + model.id, 'Update details / supplier revision', '', 'textarea', changed);
        details.setAttribute('maxlength', '2000');
        source = input(formGrid, 'supplier-source-' + model.id, 'Evidence / source (for example supplier email)', '', 'text', changed);
        source.setAttribute('maxlength', '1000');
        dueDate = input(formGrid, 'supplier-due-' + model.id, 'Reminder date (optional)', '', 'date', changed);
        reminderForm.append(formGrid);
        const reminderActions = el('div', '', { class: 'moderation-actions' }); reminderForm.append(reminderActions);
        button('Add update reminder', async () => {
          const draft = { resourceId: resourceSelect.value, details: details.value.trim(), source: source.value.trim(), dueDate: dueDate.value };
          await request('suppliers/' + model.id + '/reminders/' + crypto.randomUUID(), {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ revision: 0, ...draft })
          });
          const current = { resourceId: resourceSelect.value, details: details.value.trim(), source: source.value.trim(), dueDate: dueDate.value };
          if (JSON.stringify(current) === JSON.stringify(draft)) {
            clearReminder();
            status.setAttribute('role', 'status'); status.textContent = 'Update reminder saved.';
            await loadReminders();
          } else {
            status.setAttribute('role', 'status'); status.textContent = 'Reminder saved. Newer edits remain in the form.';
          }
          await loadSummary();
        }, reminderActions);
        button('Clear reminder', clearReminder, reminderActions);
        if (!resources.resources.length) reminderForm.append(el('p', 'No matching library entries. Select this supplier in a library entry first.'));
      }
      button('Load / refresh reminders', loadReminders, reminders);
      list.append(card);
    }
    const result = await request('suppliers');
    if (!Array.isArray(result.suppliers)) throw new Error('The supplier directory could not be read.');
    for (const supplier of result.suppliers) addSupplier(supplier);
    await loadSummary();
    button('Add supplier', () => addSupplier({ id: crypto.randomUUID() }), page);
    return {
      saveNow,
      hasUnsavedChanges: () => models.some(model => model.dirty || model.reminderDraft || Boolean(model.saving))
    };
  }
  globalThis.assessmentSuppliers = { mount };
})();
