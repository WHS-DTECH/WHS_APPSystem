(() => {
  'use strict';
  function mount(host, { el, request, year, department = false }) {
    const title = el('h3', department ? 'Department Standards' : 'Senior Audit Tracker');
    let lastData;
    host.append(title,
      el('p', 'Sync senior markbook PDFs and compare grades with the connected no-results workbook.'));
    const controls = el('div', '', { class: 'senior-audit-controls' });
    const sync = el('button', 'Google Drive Sync', { type: 'button' });
    const compare = el('button', 'Compare workbook', { type: 'button' });
    sync.disabled = true; compare.disabled = true;
    const feedback = el('p', 'Loading the last saved audit...', { role: 'status', 'aria-live': 'polite' });
    controls.append(sync, compare, feedback); host.append(controls);
    const results = el('div'); host.append(results);
    const interval = 15 * 60 * 1000;
    const filtersState = { teacher: '', subject: '', status: '', hideNoPdf: false }, openBooks = new Set();
    const excludedCourses = new Map();
    let syncing = false, saving = false, savePending, decisionsRevision = 0, timer;
    function schedule(delay = interval) {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!host.isConnected) return;
        if (saving) return schedule(1000);
        runSync(true, true);
      }, delay);
    }
    function followJob() {
      syncing = true; sync.disabled = true; compare.disabled = true;
      feedback.setAttribute('role', 'status');
      feedback.textContent = 'Checking for updates in the background. The last saved audit remains available.';
      clearTimeout(timer);
      timer = setTimeout(async () => {
        if (!host.isConnected) return;
        const before = decisionsRevision;
        try {
          let data = await request('senior-audit?year=' + encodeURIComponent(year));
          if (saving && savePending) await savePending;
          if (decisionsRevision !== before) data = await request('senior-audit?year=' + encodeURIComponent(year));
          if (!host.isConnected) return;
          if (data.syncing) return followJob();
          render(data);
          if (data.syncError) {
            feedback.setAttribute('role', 'alert');
            feedback.textContent = 'Background check failed: ' + data.syncError + ' The last saved audit is still shown.';
          } else feedback.textContent = 'Check complete. Review any follow-up or unchecked results.';
        } catch (error) {
          if (host.isConnected) { feedback.setAttribute('role', 'alert'); feedback.textContent = 'Could not check sync progress: ' + error.message; }
        }
        syncing = false;
        if (host.isConnected) { sync.disabled = saving; compare.disabled = saving; schedule(); }
      }, 5000);
    }

    function render(data) {
      lastData = data;
      results.replaceChildren();
      results.append(el('p', data.lastSyncedAt
        ? 'Last PDF sync: ' + new Date(data.lastSyncedAt).toLocaleString('en-NZ') + '.'
        : 'No completed sync yet. Showing any saved PDF reports.'));
      if (data.workbookLoaded) results.append(el('p', 'Workbook checked: ' +
        new Date(data.workbookCheckedAt).toLocaleString('en-NZ') + '; Drive modified: ' +
        new Date(data.modifiedTime).toLocaleString('en-NZ') + '.'));
      else results.append(el('p', 'The connected workbook has not yet been compared for your account.'));
      results.append(el('p', 'Colours: red = standard listed for this class/subject component in the workbook; yellow = student results need follow-up or checking; blue = tracked students resolved (graded or not enrolled) and this component is not listed in the compared workbook; grey = not fully checked. PDF matching warnings are shown separately, even when tracked students are resolved.'));
      results.append(el('p', 'After a successful combined PDF and workbook check, scanned standards not listed in the workbook for this class/subject component automatically resolve students without a grade as not enrolled, including students absent from the PDF. Existing grades are preserved. Automatic results are audit-only and labelled below; Undo saves a manual override.'));
      if ((data.synced || data.workbookLoaded) && (!data.sourcesComplete || data.unresolved || data.unresolvedWorkbook || data.unavailableClassCount)) {
        results.append(el('p', 'Needs review: ' + data.sourceFailures + ' unreadable PDF(s), ' +
          data.missingSaved + ' saved PDF(s) unavailable or changed, ' + data.unresolved + ' unmatched PDF row(s), ' +
          data.unresolvedWorkbook + ' unmatched workbook row(s), ' + data.unavailableClassCount +
          ' unavailable class link(s).', { class: 'senior-audit-warning', role: 'alert' }));
      }
      if (data.failureDetails?.length) {
        const failures = el('details', '', { class: 'senior-audit-warning' });
        failures.append(el('summary', 'PDF sources needing review'));
        const list = el('ul');
        data.failureDetails.forEach(failure => list.append(el('li', failure.name + ': ' + failure.reason)));
        failures.append(list); results.append(failures);
      }
      if (data.unresolvedReasons && data.unresolved) {
        const reasons = data.unresolvedReasons;
        results.append(el('p', 'PDF matching: ' + reasons.noRoster + ' row(s) without a matching roster student, ' +
          reasons.multiple + ' with multiple possible matches, ' + reasons.uncertain + ' with ambiguous KAMAR data.',
        { class: 'senior-audit-warning' }));
      }
      const missing = data.folders.filter(folder => !folder.found).map(folder => folder.name);
      if (missing.length) results.append(el('p', 'Subject folders not found: ' + missing.join(', ') + '.', { class: 'senior-audit-warning' }));
      const filters = el('div', '', { class: 'senior-audit-filters' });
      function select(label, options) {
        const wrapper = el('label', label + ' '), input = el('select', '', { 'aria-label': label });
        options.forEach(([value, name]) => input.append(el('option', name, { value })));
        wrapper.append(input); filters.append(wrapper); return input;
      }
      const teachers = [...new Map([...data.teachers, ...data.groups].map(group => [group.staffCode, group.teacher])).entries()]
        .sort((a, b) => a[1].localeCompare(b[1]));
      for (const [code, name] of teachers) {
        const unmatched = data.unresolvedByTeacher[code] || 0;
        if (unmatched) results.append(el('p', name + ': ' + unmatched + ' workbook row(s) could not be linked to a class.',
          { class: 'senior-audit-warning' }));
      }
      const teacher = select('Teacher', [['', 'All teachers'], ...teachers]);
      const subject = select('Subject', [['', 'All Technology subjects'], ['DTECH', 'Digital Technologies'],
        ['FURN', 'Furniture & DVC'], ['TEXT', 'Textiles'], ['HOSP', 'Hospitality']]);
      const status = select('Status', [['', 'All statuses'], ['outstanding', 'Follow up'],
        ['updated', 'Grade now in PDF'], ['sorted', 'Graded'], ['not enrolled', 'Resolved — not enrolled'], ['not checked', 'Needs checking']]);
      const hideLabel = el('label', '', { class: 'senior-audit-checkbox' });
      const hideNoPdf = el('input', '', { type: 'checkbox', 'aria-label': 'Hide entries with no matched PDF' });
      hideNoPdf.checked = filtersState.hideNoPdf;
      hideLabel.append(hideNoPdf, el('span', 'Hide entries with no matched PDF'));
      filters.append(hideLabel);
      teacher.value = filtersState.teacher; subject.value = filtersState.subject; status.value = filtersState.status;
      results.append(filters);
      const list = el('div', '', { class: 'senior-audit-disciplines' }); results.append(list);
      function discipline(course) {
        if (/DTECH|COMP|DTONLINE|MPROG/.test(course)) return 'DTECH';
        if (/FURN|DVC|WOOD/.test(course)) return 'FURN';
        if (/TEXT/.test(course)) return 'TEXT';
        if (/HOSP|FOOD/.test(course)) return 'HOSP';
        return 'OTHER';
      }
      const courseCode = course => course.replace(/^(?:1[123]|SR)(?=[A-Z])/, '');
      const bookLevel = book => ['1', '2', '3'].includes(book.level) ? Number(book.level) : 4;
      const levelLabel = level => level < 4 ? 'Level ' + level : 'Level not recorded';
      const compareBooks = (a, b) => bookLevel(a) - bookLevel(b) || Number(a.number) - Number(b.number) ||
        Number(a.version) - Number(b.version);
      const standardKey = book => JSON.stringify([bookLevel(book), book.number]);
      const shownBooks = group => group.markbooks.filter(book =>
        (!status.value || bookState(book) === status.value) && (!filtersState.hideNoPdf || book.url || book.sources?.length))
        .sort(compareBooks);
      function studentsResolved(book) {
        return book.students.length > 0 &&
          book.students.every(row => ['sorted', 'updated', 'not enrolled'].includes(row.state) && !row.issues.length);
      }
      function bookState(book) {
        if (book.students.some(row => row.state === 'outstanding')) return 'outstanding';
        if (book.conflict || (!studentsResolved(book) && (book.olderReportWarning || book.unmatched)) || !book.students.length ||
            book.students.some(row => row.state === 'not checked' || row.issues.length)) return 'not checked';
        if (book.students.some(row => row.state === 'updated')) return 'updated';
        if (book.students.every(row => row.state === 'not enrolled')) return 'not enrolled';
        return 'sorted';
      }
      const labels = { outstanding: 'Follow up', updated: 'Grade now in PDF', sorted: 'Graded',
        'not enrolled': 'Resolved — not enrolled', 'not checked': 'Needs checking' };
      function applyDecision(row, notEnrolled, revision) {
        row.automaticNotEnrolled = false;
        row.notEnrolled = notEnrolled; row.decisionRevision = revision;
        row.issues = [...row.baseIssues]; row.state = row.baseState;
        if (notEnrolled) {
          if (row.hasRecordedGrade) {
            row.issues.push('A recorded grade conflicts with the not-enrolled decision.');
            row.state = 'not checked';
          } else {
            row.issues = row.issues.filter(issue => ![
              'No uniquely matched PDF result was found.',
              'This student is not in the matched PDF. Check enrolment for this standard.'
            ].includes(issue));
            row.state = row.issues.length ? 'not checked' : 'not enrolled';
          }
        }
      }
      function updateDecision(studentId, book, result) {
        for (const current of data.groups) for (const item of current.markbooks) {
          if (item.number === book.number && item.version === book.version) {
            for (const person of item.students) if (person.id === studentId) applyDecision(person, result.notEnrolled, result.revision);
          }
        }
        decisionsRevision++;
      }
      function saveDecision(group, book, row, notEnrolled, requireWorkbook = false) {
        return request('senior-audit/enrolment', { method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ year, staffCode: group.staffCode, classCode: group.classCode, course: group.course,
            number: book.number, version: book.version, studentId: row.id,
            notEnrolled, revision: row.decisionRevision, requireWorkbook }) });
      }
      function bookColour(book) {
        const state = bookState(book);
        const resolved = data.workbookLoaded && data.sourcesComplete && !data.unavailableClassCount &&
          book.url && !book.conflict && studentsResolved(book);
        return book.workbookListed ? 'workbook-listed' : resolved ? 'resolved' :
          (!book.url && !book.conflict) || (!data.workbookLoaded && !['outstanding', 'not checked'].includes(state)) ? 'not-checked' :
            ['outstanding', 'not checked'].includes(state) ? 'pdf-issues' : 'not-checked';
      }
      function draw(openBook) {
        list.replaceChildren();
        const groupLevel = group => Math.min(4, ...shownBooks(group).map(bookLevel));
        const ordered = [...data.groups].sort((a, b) => groupLevel(a) - groupLevel(b) ||
          a.teacher.localeCompare(b.teacher) || a.classCode.localeCompare(b.classCode));
        const titles = { DTECH: 'Digital Technologies', FURN: 'Furniture & DVC', TEXT: 'Textiles', HOSP: 'Hospitality', OTHER: 'Other Technology' };
        for (const [code, title] of Object.entries(titles)) {
          if (subject.value && subject.value !== code) continue;
          const candidates = ordered.filter(group => discipline(group.course) === code && (!teacher.value || teacher.value === group.staffCode));
          if (!candidates.length) continue;
          const section = el('section', '', { class: 'senior-audit-discipline' });
          section.append(el('h4', title));
          const courses = [...new Set(candidates.map(group => courseCode(group.course)))].sort();
          if (!excludedCourses.has(code)) excludedCourses.set(code, new Set());
          const excluded = excludedCourses.get(code);
          const choices = el('fieldset', '', { class: 'senior-audit-course-filters' });
          choices.append(el('legend', 'Courses'));
          function courseCheckbox(label, checked, onChange) {
            const wrapper = el('label', '', { class: 'senior-audit-checkbox' });
            const input = el('input', '', { type: 'checkbox', 'aria-label': title + ': ' + label });
            input.checked = checked;
            input.addEventListener('change', () => { onChange(input.checked); draw(); });
            wrapper.append(input, el('span', label)); choices.append(wrapper);
            return input;
          }
          const selectedCount = courses.filter(course => !excluded.has(course)).length;
          const all = courseCheckbox('All', selectedCount === courses.length, checked => {
            if (checked) excluded.clear(); else courses.forEach(course => excluded.add(course));
          });
          all.indeterminate = selectedCount > 0 && selectedCount < courses.length;
          courses.forEach(course => courseCheckbox(course, !excluded.has(course), checked => {
            if (checked) excluded.delete(course); else excluded.add(course);
          }));
          section.append(choices);
          const groups = candidates.filter(group => !excluded.has(courseCode(group.course)) &&
            (shownBooks(group).length || (!group.markbooks.length && !filtersState.hideNoPdf &&
              (!status.value || status.value === 'not checked'))));
          if (!groups.length) {
            section.append(el('p', 'No entries match these filters.'));
            list.append(section); continue;
          }
          const standards = new Map();
          if (department) {
            for (const group of groups) for (const book of shownBooks(group)) {
              const key = standardKey(book);
              if (!standards.has(key)) standards.set(key, { number: book.number, level: bookLevel(book), books: [], panel: null });
              standards.get(key).books.push(book);
            }
            let previousLevel;
            for (const standard of [...standards.values()].sort((a, b) => a.level - b.level || Number(a.number) - Number(b.number))) {
              const { number, level } = standard;
              if (level !== previousLevel) {
                section.append(el('h5', levelLabel(level), { class: 'senior-audit-level' }));
                previousLevel = level;
              }
              const details = el('details', '', { class: 'senior-audit-book' });
              const key = JSON.stringify(['department', code, level, number]);
              if (openBooks.has(key) || standard.books.includes(openBook)) details.open = true;
              details.addEventListener('toggle', () => {
                if (details.open) openBooks.add(key); else openBooks.delete(key);
              });
              const colours = standard.books.map(bookColour);
              const colour = colours.includes('workbook-listed') ? 'workbook-listed' :
                colours.every(value => value === 'resolved') ? 'resolved' :
                  colours.includes('pdf-issues') ? 'pdf-issues' : 'not-checked';
              const label = { 'workbook-listed': 'Listed in workbook', resolved: 'Fully resolved',
                'pdf-issues': 'Needs checking / follow-up', 'not-checked': 'Not fully checked' }[colour];
              details.append(el('summary', number + ' — ' + standard.books[0].title + ' · ' + levelLabel(level) + ' · ' + label,
                { class: 'senior-audit-status ' + colour }));
              standard.panel = details;
              section.append(details);
            }
          }
          const table = el('table', '', { class: 'senior-audit-table' }), head = el('thead'), heading = el('tr');
          ['Class / teacher', 'Standards and markbooks'].forEach(text => heading.append(el('th', text, { scope: 'col' })));
          head.append(heading); table.append(head);
          const body = el('tbody');
          for (const group of groups) {
            const tr = el('tr'), who = el('td'), books = el('td');
            who.append(el('strong', group.course + ' (' + group.classCode + ')'), el('div', group.teacher));
            const shown = shownBooks(group);
            if (department && !group.markbooks.length) section.append(el('p',
              group.course + ' (' + group.classCode + ') — ' + group.teacher + ': Needs checking — no matched PDF',
              { class: 'senior-audit-status not-checked' }));
            if (!group.markbooks.length) books.append(el('span', 'Needs checking — no matched PDF', { class: 'senior-audit-status not-checked' }));
            for (const book of shown) {
              const state = bookState(book), details = el(department ? 'section' : 'details', '', { class: 'senior-audit-book' });
              const bookKey = JSON.stringify([group.staffCode, group.classCode, group.course, book.number, book.version, book.url]);
              if (book === openBook || openBooks.has(bookKey)) details.open = true;
              details.addEventListener('toggle', () => {
                if (details.open) openBooks.add(bookKey); else openBooks.delete(bookKey);
              });
              const colour = bookColour(book);
              details.append(el(department ? 'h5' : 'summary',
                (department ? group.course + ' (' + group.classCode + ') — ' + group.teacher + ' · v' + book.version :
                  book.number + ' v' + book.version + ' — ' + book.title) + ' · ' + levelLabel(bookLevel(book)) + ' · ' + labels[state] +
                (book.workbookListed ? ' · Listed in workbook' : colour === 'resolved' ? ' · Fully resolved' : ''),
                { class: 'senior-audit-status ' + colour }));
              if (book.workbookListed) details.append(el('p', 'This standard appears in the workbook for this class/subject component; check the student details below.'));
              if (colour === 'resolved' && (book.unmatched || book.olderReportWarning)) details.append(el('p',
                'Tracked students are resolved. Blue does not resolve unmatched PDF rows or the separate source warnings below.',
                { class: 'senior-audit-warning' }));
              if (book.url) details.append(el('a', 'Open source PDF', { href: book.url, target: '_blank', rel: 'noopener noreferrer' }));
              else if (book.sources?.length) {
                details.append(el('p', 'The PDF timestamps cannot be uniquely ordered. Check each source:'));
                book.sources.forEach((source, index) => {
                  const line = el('p');
                  line.append(el('a', 'Open source PDF ' + (index + 1), { href: source.url, target: '_blank', rel: 'noopener noreferrer' }));
                  if (source.modifiedTime) line.append(el('span', ' — Drive modified: ' + new Date(source.modifiedTime).toLocaleString('en-NZ')));
                  details.append(line);
                });
              } else details.append(el('p', 'No matching PDF found.'));
              if (book.modifiedTime) details.append(el('p', 'Drive modified: ' + new Date(book.modifiedTime).toLocaleString('en-NZ')));
              if (book.unmatched) details.append(el('p', book.unmatched + ' PDF row(s) need matching.', { class: 'senior-audit-warning' }));
              if (book.conflict) details.append(el('p', 'Multiple PDFs could not be safely matched and ordered.', { class: 'senior-audit-warning' }));
              if (book.olderReportWarning) details.append(el('p', 'An older PDF had unmatched or additional students, or a different teacher link. Check the latest report and class links.', { class: 'senior-audit-warning' }));
              if (book.url && !book.conflict) {
                const eligible = book.students.filter(row => row.id && !row.notEnrolled && !row.hasRecordedGrade);
                const bulk = el('button', 'Mark all eligible not enrolled', { type: 'button', class: 'senior-audit-bulk',
                  'aria-label': 'Mark all eligible students not enrolled for ' + group.classCode + ', standard ' + book.number + ' version ' + book.version });
                bulk.disabled = saving || !data.workbookLoaded || !eligible.length;
                details.append(bulk);
                if (!data.workbookLoaded) details.append(el('p', 'Compare the workbook before using the bulk action.'));
                bulk.addEventListener('click', () => {
                  if (saving || !data.workbookLoaded || !eligible.length ||
                      !confirm('Mark ' + eligible.length + ' eligible student(s) as not enrolled in ' + group.classCode +
                        ', standard ' + book.number + ' v' + book.version + '? Students with recorded grades, uncertain identities or existing decisions are skipped. This affects the shared audit only; each decision can be undone.')) return;
                  saving = true; bulk.disabled = true; sync.disabled = true; compare.disabled = true;
                  openBooks.add(bookKey);
                  savePending = (async () => {
                    let completed = 0;
                    feedback.setAttribute('role', 'status');
                    try {
                      for (const row of eligible) {
                        if (host.isConnected) feedback.textContent = 'Saving enrolment decisions: ' + completed + ' of ' + eligible.length + '.';
                        const result = await saveDecision(group, book, row, true, true);
                        updateDecision(row.id, book, result);
                        completed++;
                      }
                      if (host.isConnected) {
                        saving = false;
                        draw(book);
                        feedback.textContent = 'Marked ' + completed + ' student(s) not enrolled. Other students were left unchanged.';
                      }
                    } catch (error) {
                      if (host.isConnected) {
                        try {
                          const refreshed = await request('senior-audit?year=' + encodeURIComponent(year));
                          if (host.isConnected) { saving = false; render(refreshed); }
                        } catch (refreshError) {
                          error = new Error(error.message + ' Could not reload the audit: ' + refreshError.message);
                          saving = false;
                          if (host.isConnected) draw(book);
                        }
                        if (host.isConnected) {
                          feedback.setAttribute('role', 'alert');
                          feedback.textContent = 'Stopped after ' + completed + ' confirmed decision(s): ' + error.message +
                            ' Check the audit before trying again; the last decision may need verification.';
                        }
                      }
                    } finally {
                      saving = false;
                      if (host.isConnected) { bulk.disabled = false; sync.disabled = syncing; compare.disabled = syncing; }
                    }
                  })();
                  return savePending;
                });
              }
              const students = el('table', '', { class: 'senior-audit-table' }), studentHead = el('thead'), studentHeading = el('tr');
              ['Student', 'PDF grade', 'Workbook result', 'Workbook status', 'Audit'].forEach(text => studentHeading.append(el('th', text, { scope: 'col' })));
              studentHead.append(studentHeading); students.append(studentHead);
              const studentBody = el('tbody');
              for (const row of book.students) {
                const student = el('tr');
                [row.name, row.result, row.workbookResult || (data.workbookLoaded ? 'Not listed / blank' : 'Not checked'),
                  row.workbookStatus || (data.workbookLoaded ? 'Not listed / blank' : 'Not checked'),
                  labels[row.state] + (row.notEnrolled && row.state !== 'not enrolled' ? ' — marked not enrolled' : '') +
                    (row.automaticNotEnrolled ? ' — automatic: no grade; class/subject component not listed in workbook' : '') +
                    (row.issues.length ? ' — ' + row.issues.join(' ') : '')]
                  .forEach(text => student.append(el('td', text)));
                if (row.id && book.url && !book.conflict && (row.notEnrolled || !row.hasRecordedGrade)) {
                  const action = el('button', row.notEnrolled ? 'Undo not enrolled' : 'Mark not enrolled', {
                    type: 'button', 'aria-label': (row.notEnrolled ? 'Undo not enrolled for ' : 'Mark not enrolled for ') +
                      row.name + ', standard ' + book.number
                  });
                  action.disabled = saving;
                  action.addEventListener('click', () => {
                    if (saving) return;
                    saving = true; action.disabled = true; sync.disabled = true; compare.disabled = true;
                    savePending = (async () => {
                      feedback.setAttribute('role', 'status');
                      try {
                        const result = await saveDecision(group, book, row, !row.notEnrolled);
                        updateDecision(row.id, book, result);
                        if (host.isConnected) { saving = false; draw(book); feedback.textContent = 'Enrolment decision saved.'; }
                      } catch (error) {
                        if (host.isConnected) {
                          saving = false; draw(book);
                          feedback.setAttribute('role', 'alert'); feedback.textContent = error.message;
                        }
                      } finally {
                        saving = false;
                        if (host.isConnected) { action.disabled = false; sync.disabled = syncing; compare.disabled = syncing; }
                      }
                    })();
                    return savePending;
                  });
                  student.children[student.children.length - 1].append(el('br'), action);
                }
                studentBody.append(student);
              }
              students.append(studentBody); details.append(students);
              if (department) standards.get(standardKey(book)).panel.append(details);
              else books.append(details);
            }
            tr.append(who, books); body.append(tr);
          }
          if (!department) { table.append(body); section.append(table); }
          list.append(section);
        }
        if (!list.children.length) list.append(el('p', 'No linked senior classes match these filters.'));
      }
      [[teacher, 'teacher'], [subject, 'subject'], [status, 'status']].forEach(([input, name]) =>
        input.addEventListener('change', () => { filtersState[name] = input.value; draw(); }));
      hideNoPdf.addEventListener('change', () => {
        filtersState.hideNoPdf = hideNoPdf.checked; draw();
      });
      draw();
    }

    request('senior-audit?year=' + encodeURIComponent(year)).then(data => {
      if (!host.isConnected) return;
      render(data);
      const last = Date.parse(data.lastSyncedAt);
      if (data.syncing) followJob();
      else if (data.syncError) {
        sync.disabled = false; compare.disabled = false;
        feedback.setAttribute('role', 'alert');
        feedback.textContent = 'Background check failed: ' + data.syncError + ' The last saved audit is still shown.';
        schedule();
      } else if (!data.workbookLoaded || !Number.isFinite(last) || Date.now() - last >= interval) runSync(true, true);
      else {
        sync.disabled = false; compare.disabled = false;
        feedback.textContent = 'Showing the last saved audit. Automatic checks run every 15 minutes while this page is open.';
        schedule(Math.max(1000, interval - (Date.now() - last)));
      }
    }).catch(error => {
      if (host.isConnected) { sync.disabled = false; compare.disabled = false; feedback.setAttribute('role', 'alert'); feedback.textContent = error.message; }
    });

    async function runSync(withWorkbook, automatic = false) {
      if (syncing || saving || !host.isConnected) return;
      syncing = true; sync.disabled = true; compare.disabled = true;
      const before = decisionsRevision;
      let following = false;
      feedback.setAttribute('role', 'status');
      try {
        feedback.textContent = automatic ? 'Checking for updates in the background. The last saved audit remains available.'
          : withWorkbook ? 'Checking PDFs and the workbook. The last saved audit remains available.'
            : 'Checking PDF reports. The last saved audit remains available.';
        let result = await request('senior-audit', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ year, compareWorkbook: withWorkbook }) });
        if (result.syncing) { following = true; followJob(); return; }
        if (saving && savePending) await savePending;
        if (decisionsRevision !== before) result = await request('senior-audit?year=' + encodeURIComponent(year));
        if (!host.isConnected) return;
        render(result);
        feedback.textContent = 'Check complete. Review any follow-up or unchecked results.';
      } catch (error) {
        if (host.isConnected) { feedback.setAttribute('role', 'alert'); feedback.textContent = 'Background check failed: ' + error.message + ' The last saved audit is still shown.'; }
      } finally {
        if (!following) {
          syncing = false;
          if (host.isConnected) { sync.disabled = saving; compare.disabled = saving; schedule(); }
        }
      }
    }
    sync.addEventListener('click', () => runSync(false));
    compare.addEventListener('click', () => runSync(true));
    return { setDepartment(value) {
      department = value;
      title.textContent = department ? 'Department Standards' : 'Senior Audit Tracker';
      if (lastData) render(lastData);
    } };
  }
  globalThis.seniorAudit = { mount };
})();
