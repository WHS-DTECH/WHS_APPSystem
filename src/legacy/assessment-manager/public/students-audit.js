(() => {
  function mount(host, { el, request, year, summaryOnly = false }) {
    host.append(el('h3', summaryOnly ? 'Enrolment Summary' : 'Students Audit'), el('p', summaryOnly ?
      'Check internal standard enrolments against published totals. Standards marked External in the Enrolled List PDF are excluded. A standard is reconciled when Enrolled equals Published; this does not verify individual grades.' :
      'Browse senior students and expand their standard PDF evidence. Enrolment and publication totals are on the separate Enrolment Summary page.'));
    const controls = el('div', '', { class: 'senior-audit-filters' });
    const pageTitle = summaryOnly ? 'Enrolment Summary' : 'Students Audit';
    const department = el('select', '', { 'aria-label': pageTitle + ' department' });
    const subject = el('select', '', { 'aria-label': pageTitle + ' subject' });
    const level = el('select', '', { 'aria-label': 'Students Audit student year' });
    const search = el('input', '', { type: 'search', placeholder: 'Student name', 'aria-label': 'Students Audit student name' });
    const sync = el('button', 'Update sync', { type: 'button' });
    for (const [value, text] of [['', 'Years 11–13'], ['11', 'Year 11'], ['12', 'Year 12'], ['13', 'Year 13']]) {
      level.append(el('option', text, { value }));
    }
    const label = (text, control) => { const node = el('label', text); node.append(control); return node; };
    controls.append(label('Department', department), label('Subject', subject));
    if (!summaryOnly) controls.append(label('Student year', level), label('Find student', search));
    controls.append(sync);
    const feedback = el('p', summaryOnly ? 'Loading enrolment summary…' : 'Loading senior students…',
      { role: 'status', 'aria-live': 'polite' });
    const results = el('div');
    host.append(controls, feedback, results);
    let data, generation = 0, busy = false;
    const time = stamp => new Date(stamp).toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland' });
    const subjectOf = course => /^1[123](.+)$/.exec(course)?.[1] || course;
    const selectedDepartment = () => data?.departments.find(item => item.id === department.value);
    const standardKey = entry => JSON.stringify([entry.course, entry.number, entry.version]);
    function table(headers) {
      const node = el('table', '', { class: 'senior-audit-table' }), head = el('thead'), row = el('tr'), body = el('tbody');
      headers.forEach(text => row.append(el('th', text)));
      head.append(row); node.append(head, body);
      return { node, body };
    }
    function studentsFor(entry) {
      const matching = data.evidence.filter(book => book.course === entry.course &&
        book.number === entry.number && book.version === entry.version);
      const ambiguous = entry.kind === 'unknown' && new Set(matching.map(book => book.kind)).size > 1;
      const books = matching.filter(book => book.kind === entry.kind || (entry.kind === 'unknown' && !ambiguous));
      return { books, ambiguous, students: [...new Map(books.filter(book => !book.conflict)
        .flatMap(book => book.students).map(person => [person.id, person])).values()] };
    }
    function draw() {
      if (!data) return;
      results.replaceChildren();
      const dept = selectedDepartment();
      const memberIds = dept ? new Set((dept.identityMemberships || dept.memberships).filter(item => !subject.value || subjectOf(item.course) === subject.value)
        .flatMap(item => item.studentIds)) : null;
      const people = data.students.filter(person => (!memberIds || memberIds.has(person.id)) &&
        (!level.value || person.yearLevel === level.value) &&
        person.name.toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase()))
        .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
      const sourceEntries = data.summary?.entries || [];
      const externalKeys = new Set(sourceEntries.filter(entry => entry.external === true).map(standardKey));
      const allEntries = sourceEntries.filter(entry => !summaryOnly || entry.external !== true);
      const spreadsheetIssues = new Map();
      for (const issue of data.workbook?.entries || []) {
        const key = standardKey(issue);
        if (summaryOnly && externalKeys.has(key)) continue;
        if (!spreadsheetIssues.has(key)) spreadsheetIssues.set(key, []);
        spreadsheetIssues.get(key).push(issue);
        if (!allEntries.some(entry => standardKey(entry) === key)) allEntries.push({
          course: issue.course, number: issue.number, version: issue.version,
          kind: 'unknown', students: null, enrolled: null, published: null
        });
      }
      function checkFor(entry) {
        const blankPair = Boolean(data.summary?.entries.includes(entry)) &&
          entry.enrolled === null && entry.published === null;
        const checked = blankPair || entry.enrolled !== null && entry.published !== null;
        const unique = allEntries.filter(candidate => standardKey(candidate) === standardKey(entry)).length === 1;
        return { blankPair, checked, unique, reconciled: checked && unique && entry.enrolled === entry.published };
      }
      const entries = allEntries.filter(entry => !subject.value || subjectOf(entry.course) === subject.value);
      const evidenceByEntry = new Map(entries.map(entry => [entry, studentsFor(entry)]));
      const byId = new Map(data.students.map(person => [person.id, person]));
      const checked = entries.filter(entry => checkFor(entry).checked);
      const equal = checked.filter(entry => checkFor(entry).reconciled).length;
      if (summaryOnly) {
        results.append(el('h4', 'Standards enrolment summary'));
        if (dept) results.append(el('p', 'Only currently verified linked department courses are included: ' +
          (dept.courses.join(', ') || 'none') + '.'));
        if (dept?.unavailableClassCount) results.append(el('p',
          dept.unavailableClassCount + ' department class links are unavailable. Review Tracker setup before treating this as complete department coverage.',
          { class: 'senior-audit-warning', role: 'alert' }));
        if (!dept) results.append(el('p', 'Select a department to load its authorised enrolment evidence.'));
        else if (!data.summary) results.append(el('p',
          'No Enrolled List has been synced for this department yet. Select Update sync to load the counts. The TopicsSubjectEntries PDF must be in the shared SeniorAudit / EnrolledList Google Drive folder.',
          { class: 'senior-audit-warning', role: 'status' }));
        if (data.summary && sourceEntries.some(entry => typeof entry.external !== 'boolean')) {
          results.append(el('p', 'This saved summary predates External classification. Select Update sync to exclude external standards using the PDF labels.',
            { class: 'senior-audit-warning', role: 'status' }));
        }
        if (dept) {
          results.append(el('h4', 'Subject overview — Years 11–13'));
          const overview = el('div', '', { class: 'students-subject-summary', role: 'group',
            'aria-label': 'Subject enrolment summary' });
          const choose = code => { subject.value = code; draw(); };
          const all = el('button', 'All subjects', { type: 'button', class: 'students-subject-card',
            'aria-pressed': String(!subject.value) });
          all.addEventListener('click', () => choose(''));
          overview.append(all);
          for (const code of [...new Set(dept.courses.map(subjectOf))].sort()) {
            const standards = allEntries.filter(entry => subjectOf(entry.course) === code);
            let resolved = 0, unresolved = 0, unchecked = 0;
            for (const entry of standards) {
              const check = checkFor(entry);
              const issues = spreadsheetIssues.get(standardKey(entry)) || [];
              if (!check.unique || check.checked && !check.reconciled || issues.length && !check.reconciled) unresolved++;
              else if (!check.checked) unchecked++;
              else resolved++;
            }
            const warnings = [];
            if (!data.summary) warnings.push('Enrolled List not synced');
            if (!standards.length) warnings.push('No standards found');
            if (dept.markbookEvidence && !data.workbook) warnings.push('Spreadsheet not checked');
            if (dept.unavailableClassCount) warnings.push('Department class links unavailable');
            const state = unresolved ? 'Needs attention' : unchecked || warnings.length ? 'Unchecked' : 'All reconciled';
            const card = el('button', '', { type: 'button', class: 'students-subject-card senior-audit-status ' +
              (unresolved ? 'students-followup' : unchecked || warnings.length ? 'pdf-issues' : 'students-reconciled'),
            'aria-pressed': String(subject.value === code) });
            card.append(el('strong', code + ' — ' + state),
              el('span', unresolved + ' unresolved · ' + resolved + ' resolved · ' + unchecked + ' unchecked'));
            if (warnings.length) card.append(el('span', warnings.join('; ')));
            card.addEventListener('click', () => choose(code));
            overview.append(card);
          }
          results.append(overview, el('p', 'Counts are course/standard/version records across Years 11–13, not students. ' +
            'Red means count differences, unresolved spreadsheet issues or ambiguous matches; amber means checks are incomplete. ' +
            'Green means all listed standards reconcile and required sources are checked. Select a subject to filter the table below.'));
        }
        if (dept?.markbookEvidence) {
          if (data.workbook) {
            const source = el('p', 'Original spreadsheet checked ' + time(data.workbook.checkedAt) +
              '; source modified ' + time(data.workbook.modifiedTime) + '. ');
            source.append(el('a', 'Open original spreadsheet', { href: data.workbook.url,
              target: '_blank', rel: 'noopener noreferrer' }));
            results.append(source, el('p', 'Original spreadsheet issues stay visible. A resolved tick means this course, standard and version has Enrolled = Published; it does not verify individual enrolments or grades.'));
          } else results.append(el('p', 'Original spreadsheet issues have not been synced. Select Update sync to compare them.',
            { class: 'senior-audit-warning', role: 'status' }));
        } else if (dept) results.append(el('p', 'Original spreadsheet comparison is not configured for this department.'));
        if (data.summary || data.workbook) {
          if (data.summary) {
            const source = el('p', 'Enrolled List last synced ' + time(data.summary.syncedAt) + '. ');
            source.append(el('a', 'Open summary PDF', { href: 'https://drive.google.com/file/d/' +
              encodeURIComponent(data.summary.file.id) + '/view', target: '_blank', rel: 'noopener noreferrer' }));
            results.append(source);
          }
          results.append(el('p', equal + ' reconciled; ' + (checked.length - equal) + ' need follow-up; ' +
            (entries.length - checked.length) + ' unchecked. Both counts blank on a listed PDF standard reconcile; ' +
            'one blank or a missing standard is unchecked, not zero. Counts are for the whole course.'));
          if (!entries.length) results.append(el('p', 'No standards are listed for this subject in the authorised summary. This is not a completed enrolment check.'));
          const grid = table(['Course / standard', 'Total students', 'Enrolled', 'Published', 'Check / difference', 'Original spreadsheet issues', 'Student evidence']);
          for (const entry of entries) {
            const check = checkFor(entry);
            const state = !check.unique ? 'Follow-up — ambiguous summary match' : !check.checked ? 'Unchecked — missing count' :
              check.blankPair ? 'Reconciled — both blank in PDF' : check.reconciled ? 'Reconciled' :
              'Follow-up — ' + Math.abs(entry.enrolled - entry.published) + (entry.enrolled > entry.published ? ' more enrolled' : ' more published');
            const row = el('tr'), details = el('details'), evidence = evidenceByEntry.get(entry);
            details.append(el('summary', evidence.students.length + ' student' + (evidence.students.length === 1 ? '' : 's') + ' listed in markbook PDFs'));
            details.append(el('p', 'These names are markbook evidence, not proof of individual NZQA enrolment or publication.'));
            if (!dept.markbookEvidence) details.append(el('p', 'Individual standard PDF evidence is not configured for this department.'));
            else if (!data.evidenceSyncedAt) details.append(el('p', 'Update sync to read the standard PDFs.'));
            else if (!evidence.books.length) details.append(el('p', 'No matching standard PDF has been verified.'));
            if (evidence.ambiguous || evidence.books.some(book => book.conflict || book.unmatched)) {
              details.append(el('p', 'Conflicting or unmatched PDF evidence needs review. No student identity was guessed.', { role: 'alert' }));
            }
            const list = el('ul');
            evidence.students.sort((a, b) => a.name.localeCompare(b.name)).forEach(person => {
              const student = byId.get(person.id);
              list.append(el('li', person.name + (student ? ' — Year ' + student.yearLevel : '')));
            });
            details.append(list);
            for (const url of new Set(evidence.books.map(book => book.url).filter(Boolean))) {
              details.append(el('a', 'Open standard PDF', { href: url, target: '_blank', rel: 'noopener noreferrer' }));
            }
            [entry.course + ' — ' + (entry.kind === 'unknown' ? 'Standard ' : entry.kind === 'unit' ? 'US ' : 'AS ') + entry.number + ' v' + entry.version,
              entry.students ?? 'Unknown', entry.enrolled ?? (check.blankPair ? 'Blank' : 'Unknown'),
              entry.published ?? (check.blankPair ? 'Blank' : 'Unknown')].forEach(text => row.append(el('td', String(text))));
            const status = el('td'), badge = el('span', state, { class: 'senior-audit-status ' +
              (check.reconciled ? 'students-reconciled' : check.checked || !check.unique ? 'students-followup' : 'not-checked') });
            status.append(badge);
            const issues = spreadsheetIssues.get(standardKey(entry)) || [];
            const original = el('td');
            if (issues.length) {
              const resolved = check.reconciled;
              original.setAttribute('class', resolved ? 'students-spreadsheet-resolved' : 'students-spreadsheet-open');
              const issueDetails = el('details'), list = el('ul');
              issueDetails.append(el('summary', issues.length + ' original spreadsheet issue' + (issues.length === 1 ? '' : 's')));
              issues.forEach(issue => list.append(el('li', issue.name +
                (issue.yearLevel ? ' — Year ' + issue.yearLevel : '') + (issue.teacher ? ' — ' + issue.teacher : '') +
                '; Markbook: ' + (issue.markbookResult || 'blank') + '; Printouts: ' + (issue.printoutResult || 'blank'))));
              issueDetails.append(list);
              original.append(el('span', resolved ? '✓ Resolved' : !check.unique ? 'Unresolved — ambiguous summary match' : 'Unresolved',
                { class: 'senior-audit-status ' + (resolved ? 'students-reconciled' : 'students-followup') }), issueDetails);
            } else original.textContent = data.workbook ? 'Not listed in original spreadsheet' :
              dept.markbookEvidence ? 'Not checked — sync spreadsheet' : 'Source not configured';
            const cell = el('td'); cell.append(details); row.append(status, original, cell); grid.body.append(row);
          }
          results.append(grid.node);
        }
      }
      if (dept?.markbookEvidence) results.append(el('p', data.evidenceSyncedAt ?
        'Standard PDFs last synced ' + time(data.evidenceSyncedAt) + (data.evidenceComplete ? '.' : '. PDF sync is incomplete; review the Senior Audit Tracker.') +
        (data.unresolved ? ' ' + data.unresolved + ' PDF rows need identity matching.' : '') : 'Standard PDFs have not been synced for this account.'));
      if (data.identityMatching) {
        const matching = el('details');
        matching.append(el('summary', 'KAMAR timetable identity matching'), el('p',
          'Read-only matching against current KAMAR student timetable courses. Only a unique exact name in the same course is accepted. Teacher lines do not decide identity here; grades, class links and enrolment decisions are unchanged.'));
        const grid = table(['Course', 'KAMAR timetable classes', 'Students', 'PDF rows matched', 'Need matching']);
        for (const course of data.identityMatching.filter(item => !subject.value || subjectOf(item.course) === subject.value)) {
          const row = el('tr'), cell = el('td');
          [course.course, course.classCodes.join(', ') || 'No current timetable classes', course.studentCount,
            course.matchedRows].forEach(value => row.append(el('td', String(value))));
          if (course.unmatchedRows) {
            const details = el('details'), list = el('ul');
            details.append(el('summary', course.unmatchedRows + ' PDF row(s) need review'));
            for (const issue of course.issues) {
              const reason = issue.reason === 'conflicting-pdfs' ? 'Conflicting PDF sources' :
                issue.reason === 'duplicate-pdf-name' ? 'The PDF repeats this name' :
                issue.reason === 'ambiguous-name' ? 'More than one KAMAR student has this exact name' :
                  'No exact name in the current ' + course.course + ' timetable';
              const item = el('li', issue.name + ' — ' + issue.number + ' v' + issue.version + ': ' + reason +
                (issue.otherCourses.length ? '. This name appears in: ' + issue.otherCourses.join(', ') : '') + '. ');
              item.append(el('a', 'Open PDF', { href: issue.url, target: '_blank', rel: 'noopener noreferrer' }));
              list.append(item);
            }
            details.append(list); cell.append(details);
            cell.setAttribute('class', 'students-spreadsheet-open');
          } else cell.textContent = !data.evidenceSyncedAt ? 'PDFs not synced' :
            course.matchedRows ? 'None in saved PDFs' : 'No PDF rows for this course';
          row.append(cell); grid.body.append(row);
        }
        matching.append(grid.node); results.append(matching);
      }
      if (summaryOnly) return;
      results.append(el('h4', 'Senior students'), el('p', people.length + ' of ' + data.students.length + ' senior students shown.'));
      const studentTable = table(['Student name', 'Year', 'Standard PDF evidence']);
      for (const person of people) {
        const row = el('tr'), cell = el('td'), details = el('details');
        const standards = [...new Map(data.evidence.filter(book => !book.conflict &&
          (!subject.value || subjectOf(book.course) === subject.value) &&
          book.students.some(student => student.id === person.id)).map(book =>
          [[book.course, book.kind, book.number, book.version].join(':'), book])).values()];
        if (!dept || !dept.markbookEvidence || !data.evidenceSyncedAt) {
          cell.textContent = !dept ? 'Select a department' : !dept.markbookEvidence ? 'PDF source not configured' : 'Not synced';
        } else {
          details.append(el('summary', standards.length + ' standard' + (standards.length === 1 ? '' : 's') + ' listed'));
          const list = el('ul');
          standards.forEach(entry => list.append(el('li', entry.course + ' — ' +
            (entry.kind === 'unit' ? 'US ' : 'AS ') + entry.number + ' v' + entry.version)));
          details.append(list); cell.append(details);
        }
        row.append(el('td', person.name), el('td', person.yearLevel), cell); studentTable.body.append(row);
      }
      results.append(studentTable.node);
    }
    async function load() {
      const current = ++generation;
      const selected = department.value;
      sync.disabled = true;
      feedback.setAttribute('role', 'status'); feedback.textContent = 'Checking authorised sources…';
      try {
        const result = await request('students-audit?year=' + year + (selected ? '&departmentId=' + encodeURIComponent(selected) : ''));
        if (current !== generation || !host.isConnected) return;
        data = result;
        department.replaceChildren(el('option', summaryOnly ? 'Choose department' : 'All senior students', { value: '' }),
          ...data.departments.map(item => el('option', item.name, { value: item.id })));
        if (summaryOnly && !selected && data.departments.length) {
          department.value = (data.departments.find(item => item.name === 'Technology') || data.departments[0]).id;
          return load();
        }
        department.value = selected;
        const previous = subject.value;
        subject.replaceChildren(el('option', 'All subjects', { value: '' }), ...[...new Set((selectedDepartment()?.courses || [])
          .map(subjectOf))].sort().map(code => el('option', code, { value: code })));
        subject.value = [...subject.children].some(option => option.value === previous) ? previous : '';
        subject.disabled = !selected;
        sync.disabled = !selected || busy || (!summaryOnly && !selectedDepartment()?.markbookEvidence);
        feedback.textContent = 'Loaded. Select Update sync to check the latest PDFs.';
        draw();
      } catch (error) {
        if (current !== generation) return;
        data = null; results.replaceChildren();
        feedback.setAttribute('role', 'alert'); feedback.textContent = error.message;
      }
    }
    department.addEventListener('change', load);
    [subject, level].forEach(control => control.addEventListener('change', draw));
    search.addEventListener('input', draw);
    sync.addEventListener('click', async () => {
      if (busy) return;
      busy = true; sync.disabled = true; department.disabled = true;
      feedback.setAttribute('role', 'status'); feedback.textContent = summaryOnly ?
        'Syncing the Enrolled List, original spreadsheet and standard PDFs…' : 'Syncing standard PDFs…';
      try {
        if (summaryOnly) await request('students-audit', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ year, departmentId: department.value }) });
        if (selectedDepartment()?.markbookEvidence) {
          let audit = await request('senior-audit', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ year, compareWorkbook: false }) });
          for (let attempt = 0; audit.syncing && attempt < 120; attempt++) {
            if (!host.isConnected) return;
            await new Promise(resolve => setTimeout(resolve, 3000));
            audit = await request('senior-audit?year=' + year);
          }
          if (audit.syncing || audit.syncError) throw new Error(audit.syncError || 'Standard PDF sync is still running. Reload to check progress.');
        }
        busy = false; await load();
        if (data) feedback.textContent = summaryOnly ?
          'Sync finished. Review reconciled, follow-up and unchecked standards below.' : 'Standard PDF sync finished. Expand a student to review their evidence.';
      } catch (error) {
        feedback.setAttribute('role', 'alert');
        feedback.textContent = 'Sync was not fully verified: ' + error.message + ' Reload to view the last saved sources and their timestamps.';
      } finally {
        busy = false; department.disabled = false;
        sync.disabled = !department.value || (!summaryOnly && !selectedDepartment()?.markbookEvidence);
      }
    });
    load();
    return { refresh: load };
  }
  globalThis.studentsAudit = { mount };
})();
