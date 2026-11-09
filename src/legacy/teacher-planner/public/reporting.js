(() => {
  'use strict';
  const schema = globalThis.plannerReportingSchema;
  const state = { cycle: 'eoy', programme: 'junior', classCode: '', part: 'slo', incomplete: false };
  function mount(host, { el, data, year, request, initialTerm = '3' }) {
    const records = data.records ? JSON.parse(data.records) : [];
    if (!schema.validRecords(records)) throw new Error('Saved reporting data is invalid. No report records have been changed.');
    const area = el('section', '', { class: 'paper-page reporting-page' });
    const store = el('input', '', { type: 'hidden', name: 'records' });
    store.value = JSON.stringify(records);
    const defaultStore = el('input', '', { type: 'hidden', name: 'valuesDefault' });
    defaultStore.value = data.valuesDefault || '';
    if (!schema.validContent({ records: store.value, valuesDefault: defaultStore.value })) {
      throw new Error('Saved reporting defaults are invalid. No report records have been changed.');
    }
    area.append(store, defaultStore, el('h2', 'Reporting - ' + year));
    const reference = el('a', 'DTECH Assessment Criteria - Google Doc', {
      href: 'https://docs.google.com/document/d/1oA7xHQapbqE3myKKFL6T7oUMGxPbrm2BCE1rJQ51-gw/edit?usp=sharing',
      target: '_blank', rel: 'noopener noreferrer'
    });
    area.append(reference, el('p', 'Private draft judgements. These entries do not publish or write to KAMAR. ' +
      'Class lists use the latest preserved timetable for the selected term. SLOs and comments are shared across terms within the same report cycle; JuniorDTECH school values follow the selected term.'));
    const termLabel = el('label', 'Class list term ');
    const termSelect = el('select', '', { 'aria-label': 'Reporting class list term' });
    for (let i = 1; i <= 4; i++) termSelect.append(el('option', 'Term ' + i, { value: String(i) }));
    termSelect.value = /^[1-4]$/.test(String(initialTerm)) ? String(initialTerm) : '3';
    termLabel.append(termSelect); area.append(termLabel);
    const controls = el('div', '', { 'data-planner-navigation': '', class: 'reporting-controls' });
    const body = el('div');
    const feedback = el('p', 'Loading school classes...', { role: 'status', 'aria-live': 'polite' });
    const defaultsPanel = el('section', '', { 'data-planner-navigation': '', 'aria-label': 'School values defaults' });
    const fill = el('button', 'Default school values to Dem', { type: 'button' });
    const bulk = el('button', 'Set all school values to Dem', { type: 'button' });
    const bulkStatus = el('p', '', { role: 'status', 'aria-live': 'polite' });
    defaultsPanel.append(el('p', 'Default school values to Dem fills blank values without changing existing choices and enables defaults for new students. The overwrite action replaces all existing school values. Both actions cover both report cycles and all four term rosters; SLOs and comments are kept.'), fill, bulk, bulkStatus);
    area.append(defaultsPanel, controls, feedback, body); host.append(area);
    let directory, loadNumber = 0;
    const classButtons = new Map();
    function defaultRow(studentId, programme, cycle, extended = false) {
      const row = { studentId, programme, cycle, coding: '', design: '',
        kaitiakitanga: 'Dem', rangatiratanga: 'Dem', comment: '' };
      if (programme === 'junior' && extended) { row.whanaungatanga = 'Dem'; row.manaakitanga = 'Dem'; }
      return row;
    }
    function addNewStudents(next, directories, extended) {
      const known = new Set(next.map(row => JSON.stringify([row.studentId, row.programme, row.cycle])));
      for (const list of directories) for (const programme of Object.keys(schema.programmes)) {
        for (const group of schema.classGroups(list, programme)) for (const student of group.students) {
          for (const cycle of ['eoy', 'earlier']) {
            const key = JSON.stringify([student.id, programme, cycle]);
            if (!known.has(key)) { next.push(defaultRow(student.id, programme, cycle, extended)); known.add(key); }
          }
        }
      }
    }
    function applyRecords(next, defaultValue) {
      const encoded = JSON.stringify(next);
      if (!schema.validContent({ records: encoded, valuesDefault: defaultValue })) {
        throw new Error('The reporting storage limit or record validation was exceeded. No school values were changed.');
      }
      records.splice(0, records.length, ...next);
      store.value = encoded; defaultStore.value = defaultValue;
      store.dispatchEvent(new Event('input', { bubbles: true }));
    }
    async function setDefaults(overwrite) {
      if (bulk.disabled || fill.disabled || !confirm(overwrite ?
        'Overwrite all school values with Dem for your JuniorDTECH and MiddleDTECH students across all four terms and both report cycles? SLOs and comments remain unchanged.' :
        'Fill blank school values with Dem for your JuniorDTECH and MiddleDTECH students across all four terms and both report cycles? Existing choices, SLOs and comments remain unchanged. New students will also default to Dem.')) return;
      bulk.disabled = true; fill.disabled = true;
      let applied = false;
      bulkStatus.setAttribute('role', 'status');
      bulkStatus.textContent = 'Checking all four term rosters; no values have been changed yet...';
      try {
        const lists = await Promise.all([1, 2, 3, 4].map(term => request('attendance/classes/' + year + '?term=' + term)));
        if (!area.isConnected) return;
        const next = records.map(row => {
          const updated = { ...row };
          const keys = row.programme === 'junior' ? schema.juniorValues.map(([key]) => key) : ['kaitiakitanga', 'rangatiratanga'];
          for (const key of keys) if (overwrite || !updated[key]) updated[key] = 'Dem';
          return updated;
        });
        addNewStudents(next, lists, true);
        applyRecords(next, 'Dem-v2');
        applied = true;
        if (directory) render();
        bulkStatus.textContent = 'School values updated across all terms and both report cycles. New students default to Dem. Waiting for Planner autosave; confirm the saved message above.';
      } catch (error) {
        if (!area.isConnected) return;
        console.error('Reporting school values update failed:', error.message);
        bulkStatus.setAttribute('role', 'alert');
        bulkStatus.textContent = applied ? 'Values were changed on this page; check the Planner save status before leaving. ' + error.message :
          'No school values were changed. All four term rosters must load before this update: ' + error.message;
      } finally { bulk.disabled = false; fill.disabled = false; }
    }
    fill.addEventListener('click', () => setDefaults(false));
    bulk.addEventListener('click', () => setDefaults(true));
    function record(student, create = false) {
      let row = records.find(item => item.studentId === student.id && item.programme === state.programme && item.cycle === state.cycle);
      if (!row && create) {
        row = { studentId: student.id, programme: state.programme, cycle: state.cycle,
          coding: '', design: '', kaitiakitanga: defaultStore.value ? 'Dem' : '', rangatiratanga: defaultStore.value ? 'Dem' : '', comment: '' };
        if (state.programme === 'junior' && defaultStore.value === 'Dem-v2') {
          row.whanaungatanga = 'Dem'; row.manaakitanga = 'Dem';
        }
        records.push(row);
      }
      return row;
    }
    function update(student, field, value, control) {
      const previous = store.value;
      const existing = record(student), row = existing || record(student, true), old = row[field];
      row[field] = value;
      const next = JSON.stringify(records);
      if (!schema.validContent({ records: next, valuesDefault: defaultStore.value })) {
        row[field] = old; control.value = old;
        if (!existing) records.splice(records.indexOf(row), 1);
        feedback.setAttribute('role', 'alert');
        feedback.textContent = 'This reporting entry exceeds the storage limit. The latest edit was not accepted; earlier entries are unchanged.';
        store.value = previous;
        return;
      }
      store.value = next;
      store.dispatchEvent(new Event('input', { bubbles: true }));
      summary();
    }
    function button(parent, label, active, action) {
      const node = el('button', label, { type: 'button', 'aria-pressed': String(active) });
      node.addEventListener('click', action); parent.append(node); return node;
    }
    function groups() { return schema.classGroups(directory, state.programme); }
    function selected() { return groups().find(group => group.code === state.classCode); }
    function summary() {
      const students = selected()?.students || [];
      const count = students.filter(student => schema.complete(record(student), state.cycle, termSelect.value)).length;
      for (const group of groups()) {
        const done = group.students.filter(student => schema.complete(record(student), state.cycle, termSelect.value)).length;
        const tab = classButtons.get(group.code);
        if (tab) tab.textContent = `${group.code} (${done}/${group.students.length})`;
      }
      feedback.setAttribute('role', 'status');
      feedback.textContent = `${count} of ${students.length} students complete in this class. ` +
        (state.programme === 'junior' ? 'JuniorDTECH requires at least one SLO and this term’s school value. ' :
          'MiddleDTECH requires both SLOs and both school values. ') +
        (state.cycle === 'eoy' ? 'Comments are optional for EOY.' : 'An earlier-year comment is required.');
    }
    function render() {
      controls.replaceChildren(); body.replaceChildren(); classButtons.clear();
      const cycleLabel = el('label', 'Report cycle ');
      const cycle = el('select', '', { 'aria-label': 'Report cycle' });
      for (const [value, label] of [['eoy', 'End of Year'], ['earlier', 'Earlier year']]) cycle.append(el('option', label, { value }));
      cycle.value = state.cycle;
      cycle.addEventListener('change', () => { state.cycle = cycle.value; render(); });
      cycleLabel.append(cycle); controls.append(cycleLabel);
      const programmes = el('div', '', { class: 'reporting-tabs', role: 'group', 'aria-label': 'Programme' });
      for (const [key, programme] of Object.entries(schema.programmes)) {
        button(programmes, programme.label, state.programme === key, () => {
          state.programme = key; state.classCode = ''; render();
        });
      }
      controls.append(programmes);
      const classes = groups();
      if (!classes.some(group => group.code === state.classCode)) state.classCode = classes[0]?.code || '';
      const tabs = el('div', '', { class: 'reporting-tabs', role: 'group', 'aria-label': 'Class' });
      for (const group of classes) {
        const done = group.students.filter(student => schema.complete(record(student), state.cycle, termSelect.value)).length;
        classButtons.set(group.code, button(tabs, `${group.code} (${done}/${group.students.length})`, group.code === state.classCode,
          () => { state.classCode = group.code; render(); }));
      }
      controls.append(tabs);
      const parts = el('div', '', { class: 'reporting-tabs', role: 'group', 'aria-label': 'Report part' });
      for (const [key, label] of [['slo', '1. Student Learning Objectives'], ['values', '2. School Values'], ['comments', '3. Report Comments']]) {
        button(parts, label, state.part === key, () => { state.part = key; render(); });
      }
      controls.append(parts);
      const filterLabel = el('label', ' Incomplete students only');
      const filter = el('input', '', { type: 'checkbox' }); filter.checked = state.incomplete;
      filter.addEventListener('change', () => { state.incomplete = filter.checked; render(); });
      filterLabel.prepend(filter); controls.append(filterLabel);
      summary();
      if (!classes.length) {
        body.append(el('p', 'No ' + schema.programmes[state.programme].label +
          ' classes were found for your staff account in this term. Check the preserved school timetable and year levels.'));
        return;
      }
      if (state.part === 'slo') {
        const levels = schema.programmes[state.programme].levels.slice(1);
        body.append(el('p', `Criteria guide: Achieved (50%): ${levels.slice(0, 2).join(' / ')}; ` +
          `Merit (70%): ${levels.slice(2, 4).join(' / ')}; Excellence (90%): ${levels.slice(4).join(' / ')}. ` +
          'Percentages are reference labels, not calculated grades. Not entered is distinct from UAG.'));
      }
      const definitions = state.part === 'slo' ? [['coding', 'Computational Thinking - Coding'], ['design', 'Design & Develop a Digital Outcome']] :
        state.part === 'values' ? (state.programme === 'junior' ? [schema.juniorValues[Number(termSelect.value) - 1]] :
          [['kaitiakitanga', 'Kaitiakitanga'], ['rangatiratanga', 'Rangatiratanga']]) :
          [['comment', 'Report comment' + (state.cycle === 'eoy' ? ' (optional for EOY)' : ' (required)')]];
      const scroll = el('div', '', { class: 'reporting-scroll', tabindex: '0', role: 'region', 'aria-label': 'Class report entries' });
      const table = el('table', '', { class: 'reporting-table' }), head = el('tr'), tbody = el('tbody');
      head.append(el('th', 'Student', { scope: 'col' }), el('th', 'Year', { scope: 'col' }));
      for (const [, label] of definitions) head.append(el('th', label, { scope: 'col' }));
      const thead = el('thead'); thead.append(head); table.append(thead, tbody); scroll.append(table); body.append(scroll);
      const students = selected().students.filter(student => !state.incomplete || !schema.complete(record(student), state.cycle, termSelect.value));
      for (const student of students) {
        const tr = el('tr');
        tr.append(el('th', student.name, { scope: 'row' }), el('td', student.yearLevel));
        for (const [field, label] of definitions) {
          const td = el('td'), control = el(field === 'comment' ? 'textarea' : 'select', '', { 'aria-label': student.name + ': ' + label });
          if (field === 'comment') { control.maxLength = 2000; control.rows = 3; }
          else {
            const choices = state.part === 'slo' ? schema.programmes[state.programme].levels : schema.values;
            control.append(el('option', 'Not entered', { value: '' }));
            for (const choice of choices) control.append(el('option', choice, { value: choice }));
          }
          control.value = record(student)?.[field] || '';
          control.addEventListener(field === 'comment' ? 'input' : 'change', event => {
            event.stopPropagation(); update(student, field, control.value, control);
          });
          td.append(control); tr.append(td);
        }
        tbody.append(tr);
      }
      if (!students.length) body.append(el('p', 'No incomplete students in this class.'));
    }
    async function loadClasses() {
      const currentLoad = ++loadNumber;
      const selectedTerm = termSelect.value;
      directory = undefined; controls.replaceChildren(); body.replaceChildren();
      feedback.setAttribute('role', 'status');
      feedback.textContent = 'Loading Term ' + selectedTerm + ' school classes...';
      try {
        const result = await request('attendance/classes/' + year + '?term=' + selectedTerm);
        if (!area.isConnected || currentLoad !== loadNumber) return;
        if (defaultStore.value) {
          const next = records.map(row => ({ ...row }));
          addNewStudents(next, [result], defaultStore.value === 'Dem-v2');
          if (next.length !== records.length) applyRecords(next, defaultStore.value);
        }
        directory = result; render();
      } catch (error) {
        if (!area.isConnected || currentLoad !== loadNumber) return;
        console.error('Reporting class list failed:', error.message);
        feedback.setAttribute('role', 'alert'); feedback.textContent = error.message;
        controls.replaceChildren();
        button(controls, 'Retry loading classes', false, loadClasses);
      }
    }
    termSelect.addEventListener('change', () => { state.classCode = ''; void loadClasses(); });
    void loadClasses();
  }
  globalThis.plannerReporting = { mount };
})();
