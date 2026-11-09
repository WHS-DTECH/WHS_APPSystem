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
    area.append(store, el('h2', 'Reporting - ' + year));
    const reference = el('a', 'DTECH Assessment Criteria - Google Doc', {
      href: 'https://docs.google.com/document/d/1oA7xHQapbqE3myKKFL6T7oUMGxPbrm2BCE1rJQ51-gw/edit?usp=sharing',
      target: '_blank', rel: 'noopener noreferrer'
    });
    area.append(reference, el('p', 'Private draft judgements. These entries do not publish or write to KAMAR. ' +
      'Class lists use the latest preserved timetable for the selected term. Judgements are shared across terms within the same report cycle.'));
    const termLabel = el('label', 'Class list term ');
    const termSelect = el('select', '', { 'aria-label': 'Reporting class list term' });
    for (let i = 1; i <= 4; i++) termSelect.append(el('option', 'Term ' + i, { value: String(i) }));
    termSelect.value = /^[1-4]$/.test(String(initialTerm)) ? String(initialTerm) : '3';
    termLabel.append(termSelect); area.append(termLabel);
    const controls = el('div', '', { 'data-planner-navigation': '', class: 'reporting-controls' });
    const body = el('div');
    const feedback = el('p', 'Loading school classes...', { role: 'status', 'aria-live': 'polite' });
    area.append(controls, feedback, body); host.append(area);
    let directory, loadNumber = 0;
    const classButtons = new Map();
    function record(student, create = false) {
      let row = records.find(item => item.studentId === student.id && item.programme === state.programme && item.cycle === state.cycle);
      if (!row && create) {
        row = { studentId: student.id, programme: state.programme, cycle: state.cycle,
          coding: '', design: '', kaitiakitanga: '', rangatiratanga: '', comment: '' };
        records.push(row);
      }
      return row;
    }
    function update(student, field, value, control) {
      const previous = store.value;
      const existing = record(student), row = existing || record(student, true), old = row[field];
      row[field] = value;
      const next = JSON.stringify(records);
      if (!schema.validContent({ records: next })) {
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
      const count = students.filter(student => schema.complete(record(student), state.cycle)).length;
      for (const group of groups()) {
        const done = group.students.filter(student => schema.complete(record(student), state.cycle)).length;
        const tab = classButtons.get(group.code);
        if (tab) tab.textContent = `${group.code} (${done}/${group.students.length})`;
      }
      feedback.setAttribute('role', 'status');
      feedback.textContent = `${count} of ${students.length} students complete in this class. ` +
        (state.cycle === 'eoy' ? 'EOY requires both SLOs and both values. Comments are optional.' :
          'Earlier-year reports require both SLOs, both values and a comment.');
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
        const done = group.students.filter(student => schema.complete(record(student), state.cycle)).length;
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
        state.part === 'values' ? [['kaitiakitanga', 'Kaitiakitanga'], ['rangatiratanga', 'Rangatiratanga']] :
          [['comment', 'Report comment' + (state.cycle === 'eoy' ? ' (optional for EOY)' : ' (required)')]];
      const scroll = el('div', '', { class: 'reporting-scroll', tabindex: '0', role: 'region', 'aria-label': 'Class report entries' });
      const table = el('table', '', { class: 'reporting-table' }), head = el('tr'), tbody = el('tbody');
      head.append(el('th', 'Student', { scope: 'col' }), el('th', 'Year', { scope: 'col' }));
      for (const [, label] of definitions) head.append(el('th', label, { scope: 'col' }));
      const thead = el('thead'); thead.append(head); table.append(thead, tbody); scroll.append(table); body.append(scroll);
      const students = selected().students.filter(student => !state.incomplete || !schema.complete(record(student), state.cycle));
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
        directory = result; render();
      } catch (error) {
        if (!area.isConnected || currentLoad !== loadNumber) return;
        console.error('Reporting class list failed:', error.message);
        feedback.setAttribute('role', 'alert'); feedback.textContent = error.message;
        controls.replaceChildren();
        button(controls, 'Retry loading classes', false, loadClasses);
      }
      termSelect.addEventListener('change', () => { state.classCode = ''; void loadClasses(); });
    }
    void loadClasses();
  }
  globalThis.plannerReporting = { mount };
})();
