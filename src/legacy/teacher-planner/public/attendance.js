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
    for (const group of classes) for (const student of group.students) if (!result.has(student.id)) result.set(student.id, { id: student.id, name: student.name });
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
  function timetableGroups(existing, directory) {
    if (!directory.classes.length) throw new Error('No timetable classes were found for your staff code. Saved tabs are unchanged; check the current KAMAR upload.');
    if (directory.classes.some(item => !Array.isArray(item.slots) || !item.slots.length)) {
      throw new Error('Timetable class slots are unavailable. Update the school class-list connection, then retry. Saved tabs are unchanged.');
    }
    const buckets = [];
    for (const item of directory.classes) {
      const name = classCode(item.code, true);
      let bucket = buckets.find(bucket => bucket.names.includes(name));
      if (!bucket) { bucket = { names: [name], classes: [], slots: new Set() }; buckets.push(bucket); }
      bucket.classes.push(item);
      item.slots.forEach(slot => bucket.slots.add(slot));
    }
    const senior = name => /^((?:11|12|13)(?:\/(?:11|12|13))*)\s*([A-Z][A-Z0-9]*)$/.exec(name);
    for (let i = 0; i < buckets.length; i++) {
      const subject = senior(buckets[i].names[0])?.[2];
      if (!subject) continue;
      for (let j = i + 1; j < buckets.length; j++) {
        if (senior(buckets[j].names[0])?.[2] !== subject ||
            ![...buckets[j].slots].some(slot => buckets[i].slots.has(slot))) continue;
        buckets[i].names.push(...buckets[j].names);
        buckets[i].classes.push(...buckets[j].classes);
        buckets[j].slots.forEach(slot => buckets[i].slots.add(slot));
        buckets.splice(j--, 1);
        j = i;
      }
    }
    const schoolIds = new Set(directory.classes.flatMap(item => item.students.map(student => student.id)));
    const knownCodes = new Set(directory.classes.map(item => classCode(item.code, true)));
    const automatic = existing.filter(group => group.classes.length);
    const retained = existing.flatMap(group => {
      if (!automatic.includes(group)) return [group];
      const classes = group.classes.filter(code => !knownCodes.has(classCode(code, true)));
      const students = group.students.filter(student => !schoolIds.has(student.id));
      if (!classes.length && !students.length) return [];
      if (classes.length === group.classes.length) return [group];
      return [{ ...group, name: group.name.slice(0, 89) + ' (retained)', classes, students,
        scheduleMode: classes.length ? group.scheduleMode : 'manual' }];
    });
    const used = new Set(retained.map(group => group.id));
    const next = buckets.map(bucket => {
      const codes = new Set(bucket.names);
      const related = automatic.filter(group => group.classes.some(code => codes.has(classCode(code, true))));
      const ids = new Set(bucket.classes.flatMap(item => item.students.map(student => student.id)));
      const classKeys = new Set(bucket.classes.map(item => item.code));
      // Changed membership needs a fresh coverage identity; marks are keyed by student/date/period.
      const previous = related.find(group => !used.has(group.id) &&
        group.scheduleMode !== 'manual' && group.classes.length === classKeys.size &&
        group.classes.every(code => classKeys.has(code)) && group.students.length === ids.size &&
        group.students.every(student => ids.has(student.id)));
      const id = previous?.id || crypto.randomUUID();
      used.add(id);
      const names = [...new Set(bucket.names)].sort((a, b) => a.localeCompare(b));
      const name = names.length > 1 && names.every(value => senior(value)) ?
        [...new Set(names.flatMap(value => senior(value)[1].split('/')))].sort().join('/') + senior(names[0])[2] : names[0];
      return { id, name, classes: bucket.classes.map(item => item.code).sort(),
        students: combinedStudents(related.flatMap(group => group.students.filter(student => ids.has(student.id))), bucket.classes),
        periods: [...periods], scheduleMode: 'auto' };
    });
    const result = [...next, ...retained];
    if (result.length > 30 || result.some(group => group.students.length > 200 || group.classes.length > 30)) {
      throw new Error('Timetable tabs exceed the attendance class/roster limit. Saved tabs are unchanged; review the class lists.');
    }
    return result;
  }
  function closedDay(value, range, year, school, calendar) {
    return value < range.startDate || value > range.endDate || !value.startsWith(year + '-') ||
      school.events?.some(event => event.date === value && ['closure', 'teacherOnly'].includes(event.kind)) ||
      calendar.publicHolidays?.some(event => event.date === value);
  }
  function attendanceName(value) {
    const parts = value.normalize('NFKC').trim().split(',');
    return (parts.length === 2 ? parts[1] + ' ' + parts[0] : value).normalize('NFKC')
      .replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
  }
  function planImport({ pdf, group, directory, schedules, savedMarks, year, ranges, school, calendar, today }) {
    const fills = [], conflicts = [], warnings = [];
    let retryOn = null;
    const coverage = Object.fromEntries(pdf.weeks.map(week => [week, { groupId: group.id, week, expected: 0, recorded: 0, conflicts: 0 }]));
    let unchanged = 0, matched = 0;
    const pdfNames = new Map(), rosterNames = new Map();
    for (const row of pdf.rows) {
      const key = attendanceName(row.name);
      pdfNames.set(key, [...(pdfNames.get(key) || []), row]);
    }
    for (const student of group.students) {
      const key = attendanceName(student.name);
      rosterNames.set(key, [...(rosterNames.get(key) || []), student]);
    }
    const saved = new Map(savedMarks.map(mark => [mark.student_id + '|' + mark.date + '|' + mark.period, mark]));
    for (const student of group.students) {
      const name = attendanceName(student.name), rows = pdfNames.get(name) || [];
      if (!student.id.startsWith('k:') || rows.length !== 1 || rosterNames.get(name).length !== 1) {
        warnings.push(student.name + ': ' + (!student.id.startsWith('k:') ? 'manual student; no school identity match.' :
          rows.length === 0 ? 'not found in the PDF.' : 'ambiguous name; not imported.'));
        continue;
      }
      const classes = directory.classes.filter(item => group.classes.includes(item.code) &&
        item.students.some(member => member.id === student.id)).map(item => item.code);
      if (!classes.length) { warnings.push(student.name + ': no matching school class membership; not imported.'); continue; }
      matched++;
      for (const day of rows[0].days) {
        const range = ranges.find(item => item.startDate && item.endDate && day.date >= item.startDate && day.date <= item.endDate);
        if (!range || closedDay(day.date, range, year, school, calendar)) continue;
        const weekday = date(day.date).getUTCDay();
        if (weekday < 1 || weekday > 5) continue;
        const monday = date(day.date); monday.setUTCDate(monday.getUTCDate() - weekday + 1);
        const entries = schedules[iso(monday)];
        if (!entries) throw new Error('A PDF week has no loaded timetable. No marks were imported.');
        const teaching = scheduledPeriods({ classes }, entries)[weekday - 1];
        const slots = weekday === 3 ? [0, 1, 4, 5, 7] : [1, 2, 4, 5, 7];
        for (const period of teaching) {
          const week = coverage[iso(monday)];
          week.expected++;
          const mark = day.slots[slots[periods.indexOf(period)]];
          if (!mark) continue;
          if (day.date > today) { if (!retryOn || day.date < retryOn) retryOn = day.date; continue; }
          week.recorded++;
          const old = saved.get(student.id + '|' + day.date + '|' + period);
          const value = { studentId: student.id, name: student.name, date: day.date, period, mark, revision: old?.revision || 0 };
          if (!old?.mark) fills.push(value);
          else if (old.mark !== mark) { conflicts.push({ ...value, existing: old.mark }); week.conflicts++; }
          else unchanged++;
        }
      }
    }
    const outside = pdf.rows.filter(row => !rosterNames.has(attendanceName(row.name))).length;
    return { fills, conflicts, warnings, unchanged, matched, outside, retryOn,
      coverage: Object.values(coverage).filter(item => item.recorded > 0).map(item => ({ ...item, unresolved: warnings.length > 0 })) };
  }
  function mergePlans(plans) {
    const unique = values => [...new Map(values.map(value => [value.studentId + '|' + value.date + '|' + value.period, value])).values()];
    return {
      fills: unique(plans.flatMap(item => item.plan.fills)), conflicts: unique(plans.flatMap(item => item.plan.conflicts)),
      warnings: plans.flatMap(item => item.plan.warnings.map(message => item.group.name + ': ' + message)),
      matched: plans.reduce((sum, item) => sum + item.plan.matched, 0),
      unchanged: plans.reduce((sum, item) => sum + item.plan.unchanged, 0)
    };
  }
  async function syncDrive({ request, mutate, loadSchedule, year, ranges, school, calendar, today,
    automaticTabs = false, onProgress = () => {}, onDocument = () => {} }) {
    const settings = await request('attendance/' + year + '/drive-sync');
    if (!settings.enabled) return { enabled: false };
    const setup = await request('attendance/' + year + '/groups');
    const directory = await request('attendance/classes/' + year);
    if (automaticTabs) {
      onProgress('Updating attendance class tabs from your timetable...');
      const next = timetableGroups(setup.content.groups, directory);
      if (JSON.stringify(next) !== JSON.stringify(setup.content.groups)) {
        const saved = await mutate('attendance/' + year + '/groups', { revision: setup.revision, content: { groups: next } });
        setup.content.groups = next; setup.revision = saved.revision;
      }
    }
    const groups = setup.content.groups.filter(group => group.scheduleMode !== 'manual' && group.classes.length);
    if (!groups.length) throw new Error('Drive attendance sync needs saved automatic school-class tabs.');
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify({
      ranges, events: school.events || [], holidays: calendar.publicHolidays || [], classes: directory.classes
    })));
    const contextKey = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
    const listing = await request('google-calendar/attendance-drive/' + year + '/files');
    const summary = { enabled: true, files: 0, marks: 0, conflicts: 0, warnings: 0, skipped: 0, failed: 0, documents: [] };
    function report(file, details) {
      const document = { id: file.id, name: file.name, ...details };
      summary.documents.push(document);
      onDocument(document);
    }
    for (const file of listing.files) {
      const previous = settings.processed[file.id];
      if (previous?.version === file.version && previous.accountId === listing.accountId &&
          previous.contextKey === contextKey && previous.revision === setup.revision &&
          (!previous.retryOn || previous.retryOn > today)) {
        summary.skipped++;
        report(file, { status: 'unchanged', marks: 0 });
        continue;
      }
      onProgress('Reading attendance PDF ' + (summary.documents.length + 1) + ' of ' + listing.files.length + ': ' + file.name);
      let savedCount = 0;
      let outcome;
      try {
        const result = await request('google-calendar/attendance-drive/' + year + '/files/' + file.id);
        if (result.version !== file.version || result.accountId !== listing.accountId || result.connectionId !== listing.connectionId) {
          throw new Error('The Drive file or connected Google account changed. Retry sync.');
        }
        const pdf = result.pdf;
        const schedules = {}, savedMarks = [];
        for (const week of pdf.weeks) {
          if (!pdf.rows[0].days.some(day => day.date.startsWith(year + '-') &&
            day.date >= week && day.date < iso(new Date(date(week).getTime() + 5 * 86400000)))) continue;
          schedules[week] = await loadSchedule(week);
          savedMarks.push(...(await request('attendance/' + year + '/week/' + week)).marks);
        }
        const plans = Object.keys(schedules).length ? groups.map(group => ({ group,
          plan: planImport({ pdf, group, directory, schedules, savedMarks, year, ranges, school, calendar, today }) })) : [];
        const plan = mergePlans(plans);
        for (let offset = 0; offset < plan.fills.length; offset += 200) {
          const batch = plan.fills.slice(offset, offset + 200).map(({ name, ...value }) => value);
          await mutate('attendance/' + year + '/import-marks', { marks: batch });
          savedCount += batch.length;
          onProgress('Drive attendance: ' + savedCount + '/' + plan.fills.length + ' blank marks saved for this PDF. Keep this page open.');
        }
        const entries = plans.flatMap(item => item.plan.coverage);
        if (entries.length) await mutate('attendance/' + year + '/imports', { entries });
        const retryOn = plans.map(item => item.plan.retryOn).filter(Boolean).sort()[0] || null;
        await mutate('attendance/' + year + '/drive-sync/file', {
          folderId: settings.folderId, fileId: file.id, version: result.version,
          accountId: listing.accountId, revision: setup.revision, retryOn, contextKey
        });
        summary.files++;
        summary.marks += savedCount;
        summary.conflicts += plan.conflicts.length;
        summary.warnings += plan.warnings.length;
        outcome = { status: 'synced', marks: savedCount, conflicts: plan.conflicts.length, warnings: plan.warnings.length };
      } catch (error) {
        console.error('Attendance Drive document sync failed.');
        summary.failed++;
        summary.marks += savedCount;
        outcome = { status: 'error', marks: savedCount,
          error: error.message + ' ' + savedCount + ' blank marks saved in completed batches before the error. ' +
            'Existing marks were not overwritten. This PDF was not marked processed; retry to safely continue.' };
      }
      report(file, outcome);
    }
    return summary;
  }
  function weekStatus(entry) {
    return entry ? 'Synced' : 'Not synced';
  }
  async function mount(host, { el, request, mutate, uploadPdf, loadSchedule,
    year, ranges, school, calendar, today, overview = false, automaticTabs = false }) {
    host.setAttribute('data-planner-navigation', '');
    host.classList.add('attendance-page');
    const feedback = el('p', '', { class: 'duty-roster-feedback', role: 'status', 'aria-live': 'polite' });
    const controls = el('fieldset', '', { class: 'attendance-controls' });
    host.append(el('h2', (overview ? 'Two-Week Attendance — ' : 'Attendance daily log — ') + year, { class: 'paper-heading' }),
      el('p', 'Private teaching log, not the official KAMAR register. Blank = not recorded; P = present; A = absent; L = late. Marks save individually and can be used by your future report-writing module.'));
    if (calendar.publicHolidaysError || calendar.publicHolidaysAvailable === false) {
      host.append(el('p', (calendar.publicHolidaysError || 'Government public holiday dates are unavailable for this year.') +
        ' Attendance remains available. Some public holidays may be missing; check dates before recording marks. Known holidays and school closures still apply.',
      { class: 'duty-roster-feedback', role: 'alert' }));
    }
    host.append(feedback, controls);
    let revision = 0, groups = [], selected = '', selectedTerm = '', selectedWeek = '', marks = new Map();
    let pending = false, draft = false, directory;
    let statusTerm = '';
    const refreshFeedback = el('p', '', { class: 'duty-roster-feedback', role: 'status', 'aria-live': 'polite' });
    const tabs = el('div', '', { class: 'attendance-class-tabs', role: 'tablist', 'aria-label': 'Attendance class lists' });
    const add = el('button', '+ Class tab', { type: 'button' });
    const refreshTabs = el('button', 'Refresh timetable class tabs', { type: 'button' });
    refreshTabs.hidden = !automaticTabs;
    const timetableFeedback = el('p', '', { class: 'duty-roster-feedback attendance-timetable-feedback', role: 'status', 'aria-live': 'polite', hidden: '' });
    const editor = el('section', '', { class: 'attendance-editor' });
    const sheet = el('section', '', { class: 'attendance-sheet', role: 'tabpanel', id: 'attendance-sheet' });
    const studentPanel = el('section', '', { class: 'attendance-student-panel', 'aria-label': 'Individual student term attendance' });
    let studentGroup = '', studentId = '', studentTerm = '', searchName = '', searchYear = '', searchWhanau = '';
    let studentMarks = new Map(), studentSchedules = {}, studentRange;
    let renderStudentRows = () => {};
    const workspace = el('div', '', { class: 'attendance-workspace' });
    workspace.append(sheet, studentPanel);
    controls.append(tabs, add, refreshTabs, timetableFeedback, editor, overview ? sheet : workspace);
    if (overview) { tabs.hidden = true; add.hidden = true; }
    function say(message, error = false) { feedback.textContent = message; feedback.setAttribute('role', error ? 'alert' : 'status'); }
    function guard() {
      if (pending) return false;
      if (draft && !confirm('Discard unsaved class-tab changes?')) return false;
      draft = false; host.removeAttribute('data-preferences-busy'); editor.replaceChildren(); return true;
    }
    function edited() { draft = true; host.setAttribute('data-preferences-busy', 'true'); }
    async function act(callback, report = say) {
      if (pending) return;
      pending = true; controls.disabled = true; host.setAttribute('data-preferences-busy', 'true');
      try { await callback(); }
      catch (error) { report(error.message, true); }
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
    async function refreshTimetableTabs() {
      timetableFeedback.hidden = false;
      timetableFeedback.setAttribute('role', 'status');
      timetableFeedback.textContent = 'Creating class tabs from your timetable...';
      try {
        const current = await request('attendance/classes/' + year);
        const next = timetableGroups(groups, current);
        if (JSON.stringify(next) !== JSON.stringify(groups)) await saveGroups(next);
        directory = current;
        selected = groups.some(group => group.id === selected) ? selected : groups[0]?.id || '';
        timetableFeedback.textContent = 'Timetable class tabs are up to date. Senior classes sharing a subject and timetable slot are combined. Saved attendance and retained/manual students are unchanged.';
      } catch (error) {
        console.error('Attendance timetable tabs could not be updated:', error.message);
        timetableFeedback.setAttribute('role', 'alert');
        timetableFeedback.textContent = error.message + ' Use Refresh timetable class tabs to retry.';
      }
    }
    function renderTabs() {
      tabs.replaceChildren();
      for (const group of groups) {
        const button = el('button', group.name, { type: 'button', role: 'tab', id: 'attendance-tab-' + group.id,
          'aria-controls': 'attendance-sheet', 'aria-selected': String(selected === group.id) });
        button.addEventListener('click', () => {
          if (!guard()) return;
          selected = group.id; renderTabs(); return act(loadSheet);
        });
        tabs.append(button);
      }
      if (selected) sheet.setAttribute('aria-labelledby', 'attendance-tab-' + selected);
      else sheet.removeAttribute('aria-labelledby');
    }
    function renderImport(group) {
      const all = !group;
      const title = all ? 'all matching saved class tabs' : group.name;
      const panel = el('details', '', { class: 'attendance-import' });
      if (all) panel.open = true;
      panel.append(el('summary', all ? 'Load Two-Week Attendance PDF - all matching class tabs' : 'Import KAMAR attendance PDF into this class tab'));
      panel.append(el('p', (all ? 'All matching saved automatic class tabs are filled, regardless of the term/class display filters. Matching uses' : 'Only this tab is filled, using') +
        ' each student’s school class membership and timetable. Existing marks are never overwritten. * = P; L = L; all other codes (including ?) = A. Blank slots stay unrecorded. Whanau, Assembly and breaks are ignored.'));
      if (!uploadPdf || !loadSchedule || !all && (group.scheduleMode === 'manual' || !group.classes.length)) {
        panel.append(el('p', 'To import, connect school classes and enable automatic timetable matching in Edit class tab / students.', { role: 'status' }));
        return panel;
      }
      const file = el('input', '', { type: 'file', accept: '.pdf,application/pdf', 'aria-label': 'KAMAR two-week attendance PDF' });
      const preview = el('button', 'Preview PDF import', { type: 'button' });
      const result = el('section', '', { 'aria-label': 'Attendance import preview' });
      file.addEventListener('change', () => result.replaceChildren());
      preview.addEventListener('click', () => act(async () => {
        result.replaceChildren();
        const selectedFile = file.files?.[0];
        if (!selectedFile || selectedFile.size > 5 * 1024 * 1024) throw new Error('Choose a KAMAR attendance PDF no larger than 5 MB.');
        let pdf;
        try { pdf = await uploadPdf(selectedFile); }
        catch (error) {
          result.append(el('p', error.message, { class: 'duty-roster-feedback', role: 'alert' }));
          throw error;
        }
        const directory = await request('attendance/classes/' + year);
        const schedules = {}, savedMarks = [];
        for (const week of pdf.weeks) {
          schedules[week] = await loadSchedule(week);
          const saved = await request('attendance/' + year + '/week/' + week);
          savedMarks.push(...saved.marks);
        }
        const targets = (all ? groups : [group]).filter(item => item.scheduleMode !== 'manual' && item.classes.length);
        const plans = targets.map(group => ({ group, plan: planImport({ pdf, group, directory, schedules, savedMarks, year, ranges, school, calendar, today }) }));
        const plan = { ...mergePlans(plans), outside: all ? 0 : plans[0].plan.outside };
        const entries = plans.flatMap(item => item.plan.coverage);
        result.append(el('h4', title + ' - PDF weeks ' + pdf.weeks.join(' and ')),
          el('p', plan.matched + (all ? ' student/class matches; ' : ' students matched; ') + plan.fills.length + ' blank marks to fill; ' +
            plan.conflicts.length + ' conflicts left unchanged; ' + plan.unchanged + ' identical marks skipped.' +
            (all ? ' Shared student/period marks are saved only once.' : ' ' + plan.outside + ' PDF students outside this tab ignored.'), { role: 'status' }));
        if (all) for (const item of plans) result.append(el('p', item.group.name + ': ' + item.plan.fills.length +
          ' blank marks; ' + item.plan.conflicts.length + ' conflicts; ' + item.plan.matched + ' students matched.'));
        if (all) for (const item of groups.filter(group => !targets.includes(group))) {
          result.append(el('p', item.name + ': skipped - enable automatic school-class matching.', { role: 'status' }));
        }
        if (plan.warnings.length) {
          const list = el('ul');
          plan.warnings.forEach(warning => list.append(el('li', warning)));
          result.append(el('h4', 'Students not imported'), list);
        }
        if (plan.fills.length || plan.conflicts.length) {
          const scroll = el('div', '', { class: 'attendance-scroll', tabindex: '0' });
          const table = el('table', '', { class: 'attendance-table' }), head = el('tr'), body = el('tbody');
          table.append(el('caption', 'Proposed attendance changes - ' + title));
          ['Student', 'Date', 'Period', 'PDF mark', 'Action'].forEach(label => head.append(el('th', label, { scope: 'col' })));
          const thead = el('thead'); thead.append(head); table.append(thead, body);
          for (const value of [...plan.fills, ...plan.conflicts]) {
            const row = el('tr');
            [value.name, value.date, value.period.toUpperCase(), value.mark,
              value.existing ? 'Keep saved ' + value.existing + ' (conflict)' : 'Fill blank'].forEach(text => row.append(el('td', text)));
            body.append(row);
          }
          scroll.append(table); result.append(scroll);
        }
        if (!plan.fills.length) {
          result.append(el('p', 'No blank marks to fill. Check student matches, term dates and timetable if you expected marks.', { role: 'status' }));
          if (!entries.length) return;
        }
        const apply = el('button', plan.fills.length ? 'Fill ' + plan.fills.length + ' blank marks' : 'Record import status (no mark changes)', { type: 'button' });
        apply.addEventListener('click', () => act(async () => {
          if (!confirm('Fill ' + plan.fills.length + ' blank marks in ' + title + ' and record import status? Existing marks will not be overwritten.')) return;
          apply.disabled = true;
          let count = 0;
          say('Importing ' + plan.fills.length + ' blank marks. Keep this page open until saving finishes.');
          try {
            for (let offset = 0; offset < plan.fills.length; offset += 200) {
              const batch = plan.fills.slice(offset, offset + 200).map(({ name, ...value }) => value);
              await mutate('attendance/' + year + '/import-marks', { marks: batch });
              count += batch.length;
              say('Importing: ' + count + ' of ' + plan.fills.length + ' blank marks saved. Keep this page open.');
            }
            if (entries.length) await mutate('attendance/' + year + '/imports', { entries });
          } catch (error) {
            throw new Error(count + ' of ' + plan.fills.length + ' marks saved in completed batches. Import stopped: ' + error.message +
              ' Reload the saved week, then preview the PDF again to continue safely.');
          }
          await loadSheet();
          say(count + ' blank marks filled from the PDF. Existing marks and conflicts were left unchanged.');
        }));
        result.append(apply);
        say('PDF preview ready. Nothing has been saved yet.');
      }));
      panel.append(file, preview, result);
      return panel;
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
    async function renderStudentPanel(group, available) {
      studentPanel.replaceChildren();
      renderStudentRows = () => {};
      if (studentGroup !== group.id) {
        studentGroup = group.id; studentId = ''; searchName = ''; searchYear = ''; searchWhanau = '';
      }
      studentPanel.append(el('h3', 'Individual student attendance'), el('p', group.name + ' - selected class only'));
      const status = el('p', '', { role: 'status', 'aria-live': 'polite', class: 'duty-roster-feedback' });
      studentPanel.append(status);
      if (!directory) {
        status.textContent = 'Loading student filters...';
        try {
          const result = await request('attendance/classes/' + year);
          if (!Array.isArray(result.classes)) throw new Error('School student details are unavailable.');
          directory = result;
          status.textContent = '';
        } catch (error) {
          status.textContent = error.message + ' Name search remains available; reload to retry year and whānau filters.';
          status.setAttribute('role', 'alert');
        }
      }
      const details = new Map((directory?.classes || []).filter(item => group.classes.includes(item.code))
        .flatMap(item => item.students.map(student => [student.id, student])));
      const name = el('input', '', { type: 'search', 'aria-label': 'Search student name', placeholder: 'Student name' });
      name.value = searchName;
      function filterSelect(label, key, value) {
        const wrapper = el('label', label + ' ');
        const select = el('select', '', { 'aria-label': label });
        select.append(el('option', 'All', { value: '' }));
        const values = [...new Set(group.students.map(student => details.get(student.id)?.[key]).filter(Boolean))]
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        values.forEach(value => select.append(el('option', value, { value })));
        select.value = values.includes(value) ? value : '';
        wrapper.append(select); studentPanel.append(wrapper);
        return select;
      }
      const nameLabel = el('label', 'Name '); nameLabel.append(name); studentPanel.append(nameLabel);
      const years = filterSelect('Student year level', 'yearLevel', searchYear);
      const whanau = filterSelect('Whānau', 'whanau', searchWhanau);
      const pickerLabel = el('label', 'Student ');
      const picker = el('select', '', { 'aria-label': 'Select student', size: '6', class: 'attendance-student-picker' });
      pickerLabel.append(picker); studentPanel.append(pickerLabel);
      const count = el('p', '', { role: 'status', 'aria-live': 'polite' });
      const termLabel = el('label', 'Term ');
      const terms = el('select', '', { 'aria-label': 'Student attendance term' });
      available.forEach(item => terms.append(el('option', 'Term ' + item.term, { value: item.term })));
      if (!available.some(item => item.term === studentTerm)) studentTerm = selectedTerm;
      terms.value = studentTerm; termLabel.append(terms);
      const refresh = el('button', 'Refresh student attendance', { type: 'button' });
      const result = el('div', '', { class: 'attendance-scroll', tabindex: '0', 'aria-label': 'Student term attendance, scroll for all days' });
      studentPanel.append(count, termLabel, refresh, result);
      function filterStudents() {
        searchName = name.value; searchYear = years.value; searchWhanau = whanau.value;
        const matches = group.students.filter(student => attendanceName(student.name).includes(attendanceName(searchName)) &&
          (!searchYear || details.get(student.id)?.yearLevel === searchYear) &&
          (!searchWhanau || details.get(student.id)?.whanau === searchWhanau));
        picker.replaceChildren();
        matches.forEach(student => {
          const info = details.get(student.id);
          picker.append(el('option', [student.name, info?.yearLevel && 'Year ' + info.yearLevel, info?.whanau].filter(Boolean).join(' · '),
            { value: student.id }));
        });
        if (!matches.some(student => student.id === studentId)) {
          studentId = ''; result.replaceChildren(); renderStudentRows = () => {};
          if (status.getAttribute('role') !== 'alert') status.textContent = '';
        }
        picker.value = studentId;
        refresh.disabled = !studentId;
        count.textContent = matches.length ? matches.length + (matches.length === 1 ? ' student found.' : ' students found.') +
          ' Select a student to view their term.' : 'No matching students in this class.';
      }
      async function loadStudent() {
        result.replaceChildren(); renderStudentRows = () => {};
        if (!studentId) return;
        status.setAttribute('role', 'status'); status.textContent = 'Loading term attendance...';
        try {
          const student = group.students.find(item => item.id === studentId);
          studentRange = available.find(item => item.term === studentTerm);
          const weeks = termWeeks(studentRange.startDate, studentRange.endDate);
          let classes = group.classes;
          if (group.scheduleMode !== 'manual') {
            if (!directory || !loadSchedule) throw new Error('School class details and timetable are required to show this student’s class attendance.');
            classes = directory.classes.filter(item => group.classes.includes(item.code) &&
              item.students.some(member => member.id === studentId)).map(item => item.code);
            if (!classes.length) throw new Error('No current school class membership found for this student in this tab.');
          }
          const [saved, schedules] = await Promise.all([
            request('attendance/' + year + '/student/' + encodeURIComponent(studentId) + '?groupId=' +
              encodeURIComponent(group.id) + '&start=' + studentRange.startDate + '&end=' + studentRange.endDate),
            Promise.all(weeks.map(async week => [week, group.scheduleMode === 'manual' ?
              Array.from({ length: 5 }, () => group.periods) : scheduledPeriods({ classes }, await loadSchedule(week))]))
          ]);
          studentMarks = new Map(saved.marks.map(mark => [mark.student_id + '|' + mark.date + '|' + mark.period, mark]));
          studentSchedules = Object.fromEntries(schedules);
          renderStudentRows = () => {
            const table = el('table', '', { class: 'attendance-table attendance-student-table' });
            table.append(el('caption', student.name + ' - Term ' + studentTerm + ' - ' + group.name));
            const head = el('thead'), header = el('tr'), body = el('tbody');
            ['Week', 'Week beginning', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].forEach(label =>
              header.append(el('th', label, { scope: 'col' })));
            head.append(header); table.append(head, body);
            weeks.forEach((week, index) => {
              const row = el('tr'); row.append(el('th', 'Week ' + (index + 1), { scope: 'row' }), el('td', week));
              for (let day = 0; day < 5; day++) {
                const value = iso(new Date(date(week).getTime() + day * 86400000));
                const cell = el('td');
                if (closedDay(value, studentRange, year, school, calendar)) cell.textContent = 'No school';
                else if (!studentSchedules[week][day].length) cell.textContent = 'No lesson';
                else for (const period of studentSchedules[week][day]) {
                  const mark = studentMarks.get(studentId + '|' + value + '|' + period)?.mark || '';
                  cell.append(el('div', period.toUpperCase() + ': ' + (mark || 'Not recorded'), { 'data-mark': mark }));
                }
                row.append(cell);
              }
              body.append(row);
            });
            result.replaceChildren(table);
          };
          renderStudentRows();
          status.textContent = 'Term ' + studentTerm + ' attendance loaded for ' + student.name + '.';
        } catch (error) {
          status.textContent = 'Student attendance could not be loaded. ' + error.message;
          status.setAttribute('role', 'alert');
        }
      }
      name.addEventListener('input', filterStudents);
      years.addEventListener('change', filterStudents);
      whanau.addEventListener('change', filterStudents);
      picker.addEventListener('change', () => {
        studentId = picker.value; refresh.disabled = !studentId; return act(loadStudent);
      });
      terms.addEventListener('change', () => { studentTerm = terms.value; return act(loadStudent); });
      refresh.addEventListener('click', () => act(loadStudent));
      filterStudents();
      if (studentId) await loadStudent();
    }
    async function loadSheet() {
      sheet.replaceChildren();
      studentPanel.replaceChildren(); renderStudentRows = () => {};
      studentPanel.hidden = true;
      if (overview) { await loadOverview(); return; }
      const group = groups.find(item => item.id === selected);
      if (!group) { sheet.append(el('p', 'Create a class tab to start your attendance log.')); return; }
      studentPanel.hidden = false;
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
      sheet.append(renderImport(group));
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
      const closed = value => closedDay(value, range, year, school, calendar);
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
                  studentMarks.set(key, marks.get(key)); renderStudentRows();
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
      await renderStudentPanel(group, available);
    }
    async function loadOverview() {
      sheet.removeAttribute('role');
      sheet.removeAttribute('aria-labelledby');
      const available = ranges.filter(range => range.startDate && range.endDate);
      if (!available.length) throw new Error('Term dates are unavailable. Publish dates in Planner Setup before using Attendance.');
      if (!available.some(range => range.term === selectedTerm)) {
        selectedTerm = available.find(range => range.startDate <= today && range.endDate >= today)?.term || available[0].term;
      }
      const terms = el('select', '', { 'aria-label': 'Two-week attendance term' });
      for (const range of available) terms.append(el('option', 'Term ' + range.term, { value: range.term }));
      terms.value = selectedTerm;
      terms.addEventListener('change', () => { selectedTerm = terms.value; act(loadSheet); });
      const classes = el('select', '', { 'aria-label': 'Two-week attendance class' });
      for (const group of groups) classes.append(el('option', group.name, { value: group.id }));
      classes.value = selected;
      classes.addEventListener('change', () => { selected = classes.value; act(loadSheet); });
      const termLabel = el('label', 'Term '), classLabel = el('label', 'Class ');
      termLabel.append(terms); classLabel.append(classes);
      const refresh = el('button', 'Refresh sync status', { type: 'button' });
      refresh.addEventListener('click', () => act(loadSheet));
      sheet.append(termLabel, classLabel, refresh);
      if (!groups.length) {
        sheet.append(el('p', 'Create your class tabs on the Attendance page first.', { role: 'status' }));
        return;
      }
      const history = await request('attendance/' + year + '/imports');
      const group = groups.find(item => item.id === selected) || groups[0];
      const range = available.find(item => item.term === selectedTerm);
      const table = el('table', '', { class: 'attendance-table' });
      table.append(el('caption', group.name + ' - Term ' + selectedTerm + ' import history'));
      const head = el('thead'), headings = el('tr'), body = el('tbody');
      ['Term week', 'Week beginning', 'Sync status', 'Last synced'].forEach(label => headings.append(el('th', label, { scope: 'col' })));
      head.append(headings); table.append(head, body);
      for (const [index, week] of termWeeks(range.startDate, range.endDate).entries()) {
        const entry = history.imports[group.id + ':' + week];
        const row = el('tr');
        row.append(el('th', 'Week ' + (index + 1), { scope: 'row' }),
          el('td', week), el('td', weekStatus(entry), { 'data-import-status': entry ? 'synced' : 'empty' }),
          el('td', entry ? new Date(entry.importedAt).toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland' }) : 'Never recorded'));
        body.append(row);
      }
      const scroll = el('div', '', { class: 'attendance-scroll', tabindex: '0' });
      scroll.append(table); sheet.append(scroll);
      if (overview) sheet.append(renderImportStatus(history));
      sheet.append(renderImport(null));
    }
    function renderImportStatus(history) {
      const panel = el('details', '', { class: 'attendance-import' });
      panel.open = true;
      panel.append(el('summary', 'Attendance import status'),
        el('p', 'School administrators manage Google Drive imports in Kamar Uploader. This history shows weeks with an import record; it does not confirm that every student matched. Ask an administrator to review the file-level sync report for match warnings.'));
      const coverage = el('section', '', { 'aria-label': 'Term attendance import status' });
      coverage.append(el('h3', 'Term attendance import status'));
      const terms = el('select', '', { 'aria-label': 'Attendance status term number' });
      const available = ranges.filter(range => range.startDate && range.endDate);
      for (const range of available) terms.append(el('option', 'Term ' + range.term, { value: range.term }));
      if (!available.some(range => range.term === statusTerm)) statusTerm = selectedTerm;
      terms.value = statusTerm;
      const termLabel = el('label', 'Term number '); termLabel.append(terms);
      const refresh = el('button', 'Refresh weekly import status', { type: 'button' });
      refresh.addEventListener('click', () => act(async () => {
        refresh.textContent = 'Refreshing weekly import status...';
        refresh.disabled = true;
        refreshFeedback.textContent = 'Refreshing saved weekly import status... This does not start a Google Drive sync.';
        refreshFeedback.setAttribute('role', 'status');
        try {
          history = await request('attendance/' + year + '/imports');
          renderCoverage();
          refreshFeedback.textContent = 'Weekly import status refreshed. This refresh did not start a Google Drive sync.';
        } finally {
          refresh.textContent = 'Refresh weekly import status';
          refresh.disabled = false;
        }
      }, (message) => {
        refreshFeedback.textContent = message;
        refreshFeedback.setAttribute('role', 'alert');
      }));
      const scroll = el('div', '', { class: 'attendance-scroll', tabindex: '0' });
      function renderCoverage() {
        scroll.replaceChildren();
        const range = available.find(range => range.term === statusTerm);
        if (!range) return;
        const automatic = groups.filter(group => group.scheduleMode !== 'manual' && group.classes.length);
        const table = el('table', '', { class: 'attendance-table' });
        table.append(el('caption', 'Term ' + statusTerm + ' - weekly attendance import status'));
        const head = el('thead'), headings = el('tr'), body = el('tbody');
        ['Term week', 'Week beginning', 'Import status'].forEach(label => headings.append(el('th', label, { scope: 'col' })));
        head.append(headings); table.append(head, body);
        for (const [index, week] of termWeeks(range.startDate, range.endDate).entries()) {
          const entries = automatic.map(group => history.imports[group.id + ':' + week]);
          const status = entries.some(Boolean) ? 'Synced' : 'Not synced';
          const row = el('tr');
          row.append(el('th', 'Week ' + (index + 1), { scope: 'row' }), el('td', week),
            el('td', status, { 'data-week-sync-status': status }));
          body.append(row);
        }
        scroll.append(table);
      }
      terms.addEventListener('change', () => { statusTerm = terms.value; renderCoverage(); });
      coverage.append(termLabel, refresh, refreshFeedback, scroll);
      renderCoverage();
      panel.append(coverage);
      return panel;
    }
    add.addEventListener('click', () => editGroup());
    refreshTabs.addEventListener('click', () => {
      if (!guard()) return;
      return act(async () => { await refreshTimetableTabs(); renderTabs(); await loadSheet(); });
    });
    await act(async () => {
      const result = await request('attendance/' + year + '/groups');
      groups = result.content.groups; revision = result.revision; selected = groups[0]?.id || '';
      if (automaticTabs) await refreshTimetableTabs();
      renderTabs(); await loadSheet(); say(overview ? 'Two-Week Attendance loaded. Preview a PDF before filling blank marks in all matching class tabs.' :
        'Attendance loaded. Class setup uses Save class tab; each P/A/L mark saves immediately.');
    });
  }
  const api = { mount, termWeeks, combinedStudents, scheduledPeriods, classCode, timetableGroups, planImport, weekStatus, syncDrive };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globalThis.plannerAttendance = api;
})();
