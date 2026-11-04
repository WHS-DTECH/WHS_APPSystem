(() => {
  'use strict';
  const periods = ['p1', 'p2', 'p3', 'p4', 'p5'];
  const iso = day => day.toISOString().slice(0, 10);
  const date = value => new Date(value + 'T00:00:00Z');
  function termWeeks(start, end) {
    if (!start || !end || !Number.isFinite(date(start).getTime()) || !Number.isFinite(date(end).getTime()) ||
      iso(date(start)) !== start || iso(date(end)) !== end || start > end ||
      (date(end) - date(start)) / 86400000 > 150) throw new Error('Check the term start and end dates in Planner Setup.');
    const monday = date(start);
    monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
    const weeks = [];
    for (const cursor = monday; iso(cursor) <= end; cursor.setUTCDate(cursor.getUTCDate() + 7)) weeks.push(iso(cursor));
    return weeks;
  }
  function combinedStudents(existing, classes) {
    const result = new Map(existing.map(student => [student.id, { ...student }]));
    for (const group of classes) for (const student of group.students) if (!result.has(student.id)) result.set(student.id, { ...student });
    return [...result.values()].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  }
  function classCode(value, uploaded = false) {
    let code = value.trim().toUpperCase();
    if (uploaded && /^[^-]+-.+-[^-]+$/.test(code)) code = code.slice(code.indexOf('-') + 1, code.lastIndexOf('-'));
    return code.replace(/\s*\([^)]*\)\s*$/, '').trim();
  }
  function scheduledPeriods(group, entries) {
    const codes = new Set(group.classes.map(value => classCode(value, true)));
    if (!codes.size) throw new Error('Choose school classes for automatic timetable matching, or turn off automatic scheduling to use manual periods.');
    return Array.from({ length: 5 }, (_, day) => periods.filter(period =>
      (entries[period + ':' + day] || []).some(entry => codes.has(classCode(entry.title)))));
  }
  async function mount(host, { el, request, mutate, loadSchedule, year, ranges, school, calendar, today }) {
    host.setAttribute('data-planner-navigation', '');
    host.classList.add('attendance-page');
    const feedback = el('p', '', { class: 'duty-roster-feedback', role: 'status', 'aria-live': 'polite' });
    const controls = el('fieldset', '', { class: 'attendance-controls' });
    host.append(el('h2', 'Attendance daily log — ' + year, { class: 'paper-heading' }),
      el('p', 'Private teaching log, not the official KAMAR register. Blank = not recorded; P = present; A = absent; L = late. Marks save individually and can be used by your future report-writing module.'));
    if (calendar.publicHolidaysError || calendar.publicHolidaysAvailable === false) {
      host.append(el('p', (calendar.publicHolidaysError || 'Government public holiday dates are unavailable for this year.') +
        ' Attendance remains available. Some public holidays may be missing; check dates before recording marks. Known holidays and school closures still apply.',
      { class: 'duty-roster-feedback', role: 'alert' }));
    }
    host.append(feedback, controls);
    let revision = 0, groups = [], selected = '', selectedTerm = '', selectedWeek = '', marks = new Map();
    let pending = false, draft = false, directory;
    const tabs = el('div', '', { class: 'attendance-class-tabs', role: 'tablist', 'aria-label': 'Attendance class lists' });
    const add = el('button', '+ Class tab', { type: 'button' });
    const editor = el('section', '', { class: 'attendance-editor' });
    const sheet = el('section', '', { class: 'attendance-sheet', role: 'tabpanel', id: 'attendance-sheet' });
    controls.append(tabs, add, editor, sheet);
    function say(message, error = false) { feedback.textContent = message; feedback.setAttribute('role', error ? 'alert' : 'status'); }
    function guard() {
      if (pending) return false;
      if (draft && !confirm('Discard unsaved class-tab changes?')) return false;
      draft = false; host.removeAttribute('data-preferences-busy'); editor.replaceChildren(); return true;
    }
    function edited() { draft = true; host.setAttribute('data-preferences-busy', 'true'); }
    async function act(callback) {
      if (pending) return;
      pending = true; controls.disabled = true; host.setAttribute('data-preferences-busy', 'true');
      try { await callback(); }
      catch (error) { say(error.message, true); }
      finally {
        pending = false; controls.disabled = false;
        if (!draft) host.removeAttribute('data-preferences-busy');
      }
    }
    async function saveGroups(next) {
      const saved = await mutate('attendance/' + year + '/groups', { revision, content: { groups: next } });
      revision = saved.revision; groups = next; draft = false; editor.replaceChildren();
      say('Class tabs saved. Attendance marks are unchanged.');
    }
    function renderTabs() {
      tabs.replaceChildren();
      for (const group of groups) {
        const button = el('button', group.name, { type: 'button', role: 'tab', id: 'attendance-tab-' + group.id,
          'aria-controls': 'attendance-sheet', 'aria-selected': String(selected === group.id) });
        button.addEventListener('click', () => {
          if (!guard()) return;
          selected = group.id; renderTabs(); act(loadSheet);
        });
        tabs.append(button);
      }
      if (selected) sheet.setAttribute('aria-labelledby', 'attendance-tab-' + selected);
      else sheet.removeAttribute('aria-labelledby');
    }
    function editGroup(group) {
      if (!guard()) return;
      const working = structuredClone(group || { id: crypto.randomUUID(), name: '', classes: [], students: [], periods: [...periods], scheduleMode: 'auto' });
      edited();
      editor.replaceChildren(el('h3', group ? 'Edit class tab' : 'New class tab'));
      const label = el('label', 'Tab name ');
      const name = el('input', '', { type: 'text', maxlength: '100', 'aria-label': 'Class tab name' });
      name.value = working.name; label.append(name);
      const periodBox = el('div', '', { class: 'attendance-periods' });
      const automatic = el('input', '', { type: 'checkbox', 'aria-label': 'Match KAMAR timetable automatically' });
      automatic.checked = working.scheduleMode !== 'manual' && (working.scheduleMode === 'auto' || working.classes.length > 0);
      const autoLabel = el('label', 'Match KAMAR Teacher Timetable days and periods automatically ');
      autoLabel.append(automatic);
      const periodInputs = periods.map(period => {
        const wrapper = el('label', period.toUpperCase() + ' ');
        const input = el('input', '', { type: 'checkbox' }); input.checked = working.periods.includes(period);
        wrapper.append(input); periodBox.append(wrapper); return [period, input];
      });
      function updatePeriods() {
        periodInputs.forEach(([, input]) => input.disabled = automatic.checked);
      }
      automatic.addEventListener('change', updatePeriods); updatePeriods();
      const classBox = el('section');
      const load = el('button', 'Load school class lists', { type: 'button' });
      const classOptions = el('select', '', { multiple: '', size: '8', 'aria-label': 'School classes to combine' });
      const roster = el('div');
      const manual = el('button', '+ Add student manually', { type: 'button' });
      const save = el('button', 'Save class tab', { type: 'button' });
      const cancel = el('button', 'Cancel editing', { type: 'button' });
      function renderRoster() {
        roster.replaceChildren();
        for (const student of working.students) {
          const row = el('div', '', { class: 'attendance-student-editor' });
          const input = el('input', '', { type: 'text', maxlength: '160', 'aria-label': 'Student name' });
          input.value = student.name;
          input.addEventListener('input', () => { student.name = input.value; });
          const remove = el('button', 'Remove from tab', { type: 'button' });
          remove.addEventListener('click', () => { working.students = working.students.filter(item => item.id !== student.id); renderRoster(); });
          row.append(input, remove); roster.append(row);
        }
      }
      load.addEventListener('click', () => act(async () => {
        directory = await request('attendance/classes/' + year);
        classOptions.replaceChildren();
        for (const item of directory.classes) {
          const option = el('option', item.code + ' (' + item.students.length + ')', { value: item.code });
          option.selected = working.classes.includes(item.code); classOptions.append(option);
        }
        classBox.replaceChildren(el('p', 'Matched your school sign-in to staff code ' + directory.staffCode +
          '. Showing your classes, including shared-teacher classes. Select one or several labels (Ctrl/Cmd-click for multiple). Saved students are retained until explicitly removed.'),
          classOptions);
        say(directory.classes.length ? 'Classes for ' + directory.staffCode + ' loaded. Choose classes, then Add selected class students.' :
          'Your staff code is ' + directory.staffCode + ', but no matching current timetable class lists were found for this year. Check the school upload or add students manually.', !directory.classes.length);
        const merge = el('button', 'Add selected class students', { type: 'button' });
        merge.addEventListener('click', () => {
          working.classes = [...classOptions.selectedOptions].map(option => option.value);
          working.students = combinedStudents(working.students, directory.classes.filter(item => working.classes.includes(item.code)));
          renderRoster(); say('Class students added to the draft. Review, then Save class tab.');
        }); classBox.append(merge);
      }));
      manual.addEventListener('click', () => {
        working.students.push({ id: 'm:' + crypto.randomUUID(), name: '' }); renderRoster();
        roster.lastElementChild?.querySelector('input')?.focus();
      });
      save.addEventListener('click', () => act(async () => {
        working.name = name.value.trim();
        working.students = working.students.map(student => ({ ...student, name: student.name.trim() }));
        working.periods = periodInputs.filter(([, input]) => input.checked).map(([period]) => period);
        working.scheduleMode = automatic.checked ? 'auto' : 'manual';
        if (automatic.checked) {
          if (!working.classes.length) throw new Error('Add selected school class students before enabling automatic timetable matching.');
          working.periods = [...periods];
        }
        if (!working.name || !working.periods.length || working.students.some(student => !student.name)) {
          throw new Error('Enter a tab name, select at least one period, and name or remove each blank student.');
        }
        const next = group ? groups.map(item => item.id === group.id ? working : item) : [...groups, working];
        await saveGroups(next); selected = working.id; renderTabs(); await loadSheet();
      }));
      cancel.addEventListener('click', () => { if (guard()) say('Class-tab draft discarded. Saved records are unchanged.'); });
      editor.append(label, autoLabel, el('p', 'Automatic mode follows the selected week in your connected Teacher Timetable, combining all selected classes. Manual periods below apply to every weekday only when automatic mode is off.'), periodBox, load, classBox,
        el('p', 'Students use their school ID, so a student shared between combined tabs has the same marks. Manual additions are separate identities; edit the same tab to retain them. Removing a student or tab never deletes saved marks.'),
        roster, manual, save, cancel);
      renderRoster();
    }
    async function loadSheet() {
      sheet.replaceChildren();
      const group = groups.find(item => item.id === selected);
      if (!group) { sheet.append(el('p', 'Create a class tab to start your attendance log.')); return; }
      const available = ranges.filter(range => range.startDate && range.endDate);
      if (!available.length) throw new Error('Term dates are unavailable. Publish dates in Planner Setup before using Attendance.');
      if (!available.some(range => range.term === selectedTerm)) {
        selectedTerm = available.find(range => range.startDate <= today && range.endDate >= today)?.term || available[0].term;
      }
      const range = available.find(item => item.term === selectedTerm);
      const weeks = termWeeks(range.startDate, range.endDate);
      if (!weeks.includes(selectedWeek)) selectedWeek = weeks.find(week => week <= today && iso(new Date(date(week).getTime() + 6 * 86400000)) >= today) || weeks[0];
      const termLabel = el('label', 'Term ');
      const terms = el('select', '', { 'aria-label': 'Attendance term' });
      available.forEach(item => terms.append(el('option', 'Term ' + item.term, { value: item.term }))); terms.value = selectedTerm;
      terms.addEventListener('change', () => { if (!guard()) { terms.value = selectedTerm; return; } selectedTerm = terms.value; act(loadSheet); });
      termLabel.append(terms);
      const weekTabs = el('div', '', { class: 'attendance-week-tabs', 'aria-label': 'Term weeks' });
      weeks.forEach((week, index) => {
        const button = el('button', 'Week ' + (index + 1), { type: 'button', 'aria-pressed': String(week === selectedWeek),
          title: 'Week beginning ' + week });
        button.addEventListener('click', () => { if (!guard()) return; selectedWeek = week; act(loadSheet); });
        weekTabs.append(button);
      });
      const edit = el('button', 'Edit class tab / students', { type: 'button' }); edit.addEventListener('click', () => editGroup(group));
      const remove = el('button', 'Remove class tab', { type: 'button' });
      remove.addEventListener('click', () => {
        if (!guard() || !confirm('Remove this class tab? Saved attendance marks are retained, but manual students must be kept in another tab to remain accessible.')) return;
        act(async () => { await saveGroups(groups.filter(item => item.id !== group.id)); selected = groups[0]?.id || ''; renderTabs(); await loadSheet(); });
      });
      const reload = el('button', 'Reload saved week', { type: 'button' });
      reload.addEventListener('click', () => { if (guard()) act(loadSheet); });
      sheet.append(el('h3', group.name), termLabel, edit, remove, reload, weekTabs,
        el('p', 'Week beginning ' + selectedWeek + ' · Term ' + selectedTerm + '. Mark only periods when this class meets. No totals are calculated.'));
      const result = await request('attendance/' + year + '/week/' + selectedWeek);
      marks = new Map(result.marks.map(item => [item.student_id + '|' + item.date + '|' + item.period, item]));
      const automatic = group.scheduleMode !== 'manual' && group.classes.length > 0;
      let schedule;
      if (automatic) {
        if (!loadSchedule) throw new Error('The KAMAR timetable connection is unavailable. Reopen Attendance after updating the Planner.');
        schedule = scheduledPeriods(group, await loadSchedule(selectedWeek));
      } else schedule = Array.from({ length: 5 }, () => group.periods);
      const scroll = el('div', '', { class: 'attendance-scroll', tabindex: '0', 'aria-label': 'Attendance sheet, scroll horizontally for all days' });
      const table = el('table', '', { class: 'attendance-table' });
      table.append(el('caption', group.name + ' — Term ' + selectedTerm + ', week beginning ' + selectedWeek));
      const head = el('thead'), daysRow = el('tr'), periodsRow = el('tr'), body = el('tbody');
      daysRow.append(el('th', 'Student', { scope: 'col', rowspan: '2' }));
      const days = Array.from({ length: 5 }, (_, i) => iso(new Date(date(selectedWeek).getTime() + i * 86400000)));
      const closed = value => value < range.startDate || value > range.endDate || !value.startsWith(year + '-') ||
        school.events?.some(event => event.date === value && ['closure', 'teacherOnly'].includes(event.kind)) ||
        calendar.publicHolidays?.some(event => event.date === value);
      for (const [index, value] of days.entries()) {
        const dayPeriods = schedule[index];
        const dayLabel = new Intl.DateTimeFormat('en-NZ', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(date(value));
        daysRow.append(el('th', dayLabel + (closed(value) ? ' · No school' : ''), { scope: 'colgroup', colspan: String(Math.max(1, dayPeriods.length)) }));
        if (!dayPeriods.length) periodsRow.append(el('th', 'No lesson', { scope: 'col' }));
        dayPeriods.forEach(period => periodsRow.append(el('th', period.toUpperCase(), { scope: 'col' })));
      }
      head.append(daysRow, periodsRow); table.append(head, body);
      for (const student of group.students) {
        const row = el('tr'); row.append(el('th', student.name, { scope: 'row' }));
        for (const [index, value] of days.entries()) {
          if (!schedule[index].length) row.append(el('td', '—'));
          for (const period of schedule[index]) {
            const cell = el('td'), key = student.id + '|' + value + '|' + period;
            const mark = marks.get(key);
            if (closed(value)) {
              cell.textContent = mark?.mark ? mark.mark + ' (saved)' : '—';
            } else {
              const input = el('select', '', { 'aria-label': student.name + ', ' + value + ', ' + period.toUpperCase() });
              for (const [code, label] of [['', 'Blank — not recorded'], ['P', 'Present'], ['A', 'Absent'], ['L', 'Late']]) {
                input.append(el('option', code || '·', { value: code, label: code ? code + ' — ' + label : label }));
              }
              input.value = mark?.mark || '';
              input.dataset.mark = input.value;
              input.addEventListener('change', () => act(async () => {
                const previous = marks.get(key), chosen = input.value;
                try {
                  const saved = await mutate('attendance/' + year + '/mark', { studentId: student.id, date: value, period,
                    mark: chosen, revision: previous?.revision || 0 });
                  marks.set(key, { student_id: student.id, date: value, period, mark: chosen, revision: saved.revision });
                  input.dataset.mark = chosen; say('Saved ' + student.name + ' · ' + value + ' · ' + period.toUpperCase() + ': ' + (chosen || 'not recorded') + '.');
                } catch (error) {
                  input.value = previous?.mark || '';
                  throw new Error((chosen || 'Blank') + ' was NOT saved for ' + student.name + '. The cell has been restored to its saved value. ' + error.message);
                }
              }));
              cell.append(input);
            }
            row.append(cell);
          }
        }
        body.append(row);
      }
      scroll.append(table); sheet.append(scroll);
      if (automatic) {
        sheet.append(el('p', schedule.some(day => day.length) ?
          'Days and periods matched to this week’s KAMAR Teacher Timetable. Saved marks outside the current schedule are retained.' :
          'No matching lessons were found this week. Check the selected school class labels and your Teacher Timetable; no periods have been guessed.',
        { role: schedule.some(day => day.length) ? 'status' : 'alert' }));
      }
      if (!group.students.length) sheet.append(el('p', 'No students yet. Use Edit class tab / students to add a school class or manual student.'));
    }
    add.addEventListener('click', () => editGroup());
    await act(async () => {
      const result = await request('attendance/' + year + '/groups');
      groups = result.content.groups; revision = result.revision; selected = groups[0]?.id || '';
      renderTabs(); await loadSheet(); say('Attendance loaded. Class setup uses Save class tab; each P/A/L mark saves immediately.');
    });
  }
  globalThis.plannerAttendance = { mount, termWeeks, combinedStudents, scheduledPeriods, classCode };
})();
