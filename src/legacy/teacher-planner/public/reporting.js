(() => {
  'use strict';
  const schema = globalThis.plannerReportingSchema;
  const state = { cycle: 'eoy', programme: 'junior', classCode: '', part: 'slo', incomplete: false };
  function mount(host, { el, data, year, request, ensureSaved, ownerId, initialTerm = '3' }) {
    const records = data.records ? JSON.parse(data.records) : [];
    if (!schema.validRecords(records)) throw new Error('Saved reporting data is invalid. No report records have been changed.');
    const area = el('section', '', { class: 'paper-page reporting-page' });
    const store = el('input', '', { type: 'hidden', name: 'records' });
    store.value = JSON.stringify(records);
    const defaultStore = el('input', '', { type: 'hidden', name: 'valuesDefault' });
    defaultStore.value = data.valuesDefault || '';
    const sloDefaultStore = el('input', '', { type: 'hidden', name: 'juniorSloDefault' });
    const awardsStore = el('input', '', { type: 'hidden', name: 'awards' });
    awardsStore.value = data.awards ?? '{}';
    const sloDefault = data.juniorSloDefault === undefined ? '' : data.juniorSloDefault;
    if (!schema.validContent({ records: store.value, valuesDefault: defaultStore.value, juniorSloDefault: sloDefault, awards: awardsStore.value })) {
      throw new Error('Saved reporting defaults are invalid. No report records have been changed.');
    }
    sloDefaultStore.value = sloDefault;
    let awards = JSON.parse(awardsStore.value), awardFilter = 'all', awardClass = '';
    area.append(store, defaultStore, sloDefaultStore, awardsStore, el('h2', 'Reporting - ' + year));
    const reference = el('a', 'DTECH Assessment Criteria - Google Doc', {
      href: 'https://docs.google.com/document/d/1oA7xHQapbqE3myKKFL6T7oUMGxPbrm2BCE1rJQ51-gw/edit?usp=sharing',
      target: '_blank', rel: 'noopener noreferrer'
    });
    area.append(reference, el('p', 'Private draft judgements. These entries do not publish or write to KAMAR. ' +
      'Class lists use the latest preserved timetable for the selected term. SLOs and comments are shared across terms within the same report cycle.'));
    const termLabel = el('label', 'Class list term ');
    const termSelect = el('select', '', { 'aria-label': 'Reporting class list term' });
    for (let i = 1; i <= 4; i++) termSelect.append(el('option', 'Term ' + i, { value: String(i) }));
    termSelect.value = /^[1-4]$/.test(String(initialTerm)) ? String(initialTerm) : '3';
    termLabel.append(termSelect); area.append(termLabel);
    const controls = el('div', '', { 'data-planner-navigation': '', class: 'reporting-controls' });
    const setup = el('div', '', { class: 'reporting-setup' });
    const allocation = el('aside', '', { class: 'reporting-value-allocation', 'aria-label': 'School Value allocation', hidden: '' });
    setup.append(controls, allocation);
    const body = el('div');
    const feedback = el('p', 'Loading school classes...', { role: 'status', 'aria-live': 'polite' });
    const defaultsPanel = el('section', '', { 'data-planner-navigation': '', 'aria-label': 'School values defaults' });
    const fill = el('button', 'Default school values to Dem', { type: 'button' });
    const bulkStatus = el('p', '', { role: 'status', 'aria-live': 'polite' });
    defaultsPanel.append(el('p', 'For your reports in this planner year, default school values to Dem fills blank values without changing existing choices and enables defaults for new students. It covers both report cycles and all four term rosters; SLOs and comments are kept. Other teachers’ reports are not changed.'), fill, bulkStatus);
    const sloPanel = el('section', '', { 'data-planner-navigation': '', 'aria-label': 'JuniorDTECH SLO defaults' });
    const sloBulk = el('button', 'Set JuniorDTECH SLOs to 3P', { type: 'button' });
    const sloStatus = el('p', '', { role: 'status', 'aria-live': 'polite' });
    sloPanel.append(el('p', 'Set both JuniorDTECH SLOs to 3P for both report cycles across all four term rosters. This overwrites existing JuniorDTECH SLOs and enables 3P for new JuniorDTECH students; school values, comments and MiddleDTECH reports are kept.'), sloBulk, sloStatus);
    function updateDefaultPanels() {
      defaultsPanel.hidden = state.part !== 'values';
      sloPanel.hidden = state.part !== 'slo';
    }
    updateDefaultPanels();
    area.append(defaultsPanel, sloPanel, setup, feedback, body); host.append(area);
    let directory, loadNumber = 0;
    const auditRosters = new Map();
    let allocationReady = false, allocationPending = false, allocationError = '';
    const classButtons = new Map();
    const drive = el('details', '', { 'data-planner-navigation': '' });
    const folder = el('input', '', { type: 'url', 'aria-label': 'Google Drive Reports folder', placeholder: 'Paste the Reports folder link' });
    const files = el('select', '', { 'aria-label': 'KAMAR report PDF' });
    const status = el('p', '', { role: 'status' });
    const savedFolder = el('span', '', { class: 'reporting-folder-status', role: 'status' });
    const review = el('div');
    let indexed = [], listedFolder = '', folderPart;
    const invalidate = () => review.replaceChildren();
    const folderKey = part => `planner-reporting-folder:${ownerId}:${part}`;
    function showFolderStatus(input, label, key) {
      try {
        const saved = globalThis.localStorage?.getItem(key);
        label.textContent = saved && saved === input.value.trim() ? 'Folder link saved in this browser' :
          input.value.trim() ? 'Folder link not saved yet' : 'No folder link saved';
      } catch (error) {
        label.textContent = 'Browser storage unavailable. Folder link is not saved.';
        console.warn('Reporting folder status could not be read:', error.message);
      }
    }
    function rememberFolder(input, label, key, link) {
      try { globalThis.localStorage?.setItem(key, link); }
      catch (error) {
        label.textContent = 'Folder link could not be saved in this browser.';
        console.warn('Reporting folder could not be remembered:', error.message);
        return;
      }
      showFolderStatus(input, label, key);
    }
    function showDrive() {
      drive.hidden = !['slo', 'values'].includes(state.part);
      if (drive.hidden || state.part === folderPart) return;
      folderPart = state.part;
      indexed = []; listedFolder = ''; files.replaceChildren(); invalidate(); status.textContent = '';
      try { folder.value = globalThis.localStorage?.getItem(folderKey(folderPart)) || ''; }
      catch (error) {
        folder.value = '';
        status.textContent = 'Browser storage is unavailable. Paste the Drive folder link to continue.';
        console.warn('Reporting folder could not be loaded:', error.message);
      }
      showFolderStatus(folder, savedFolder, folderKey(folderPart));
    }
    folder.addEventListener('input', () => { invalidate(); showFolderStatus(folder, savedFolder, folderKey(folderPart)); });
    files.addEventListener('change', invalidate);
    drive.append(el('summary', 'Google Drive sync — KAMAR reports'),
      el('p', 'Select the report cycle. Batch preview checks all four teaching terms. For single-file preview, select its teaching term first. Nothing is written to KAMAR or Drive. ' +
        'If prompted, enable read-only Drive access in Kamar Uploader Attendance Admin.'), folder);
    const list = button(drive, 'List Drive PDFs', false, async () => {
      list.disabled = true;
      invalidate();
      indexed = []; listedFolder = ''; files.replaceChildren();
      status.textContent = 'Reading Drive folder…';
      try {
        const link = folder.value.trim(), part = folderPart;
        const result = await request('google-calendar/reporting-drive/files?' + new URLSearchParams({ folder: link }));
        if (folder.value.trim() !== link || folderPart !== part || !area.isConnected) return;
        listedFolder = link; indexed = result.files;
        rememberFolder(folder, savedFolder, folderKey(part), link);
        files.append(el('option', 'Select a PDF', { value: '' }));
        for (const file of indexed) files.append(el('option', (file.label ? file.label + ' / ' : '') + file.name, { value: file.id }));
        files.value = '';
        status.textContent = indexed.length ? `${indexed.length} PDFs found.` : 'No PDFs found in Reports, SLOs or Values.';
      } catch (error) { status.textContent = error.message; }
      finally { list.disabled = false; }
    });
    drive.append(files);
    const preview = button(drive, 'Preview PDF', false, async () => {
      invalidate();
      const file = indexed.find(item => item.id === files.value);
      if (!file || folder.value.trim() !== listedFolder || !directory || state.programme !== 'junior') {
        status.textContent = 'List the folder and choose a PDF with JuniorDTECH and the matching teaching term selected.'; return;
      }
      const snapshot = store.value, roster = directory, cycle = state.cycle, term = termSelect.value;
      const stillCurrent = () => area.isConnected && directory === roster && state.programme === 'junior' &&
        state.cycle === cycle && termSelect.value === term && store.value === snapshot &&
        folder.value.trim() === listedFolder && indexed.includes(file) && files.value === file.id;
      list.disabled = preview.disabled = true;
      status.textContent = 'Reading and matching PDF…';
      try {
        const pdf = await request('google-calendar/reporting-drive/file/' + encodeURIComponent(file.id) + '?' +
          new URLSearchParams({ folder: listedFolder, version: file.version }));
        if (!stillCurrent()) throw new Error('The reporting view changed. Preview the PDF again.');
        if (pdf.year !== null && pdf.year !== Number(year)) throw new Error('The PDF assessment year does not match the Planner year.');
        const matches = planPdf(pdf, roster);
        const touched = matches.filter(item => item.student);
        if (!touched.length) throw new Error('No exact matches in the PDF teaching class. Check the selected teaching term.');
        const clears = el('input', '', { type: 'checkbox' });
        const clearLabel = el('label', ' Clear saved grades where the PDF is blank'); clearLabel.prepend(clears);
        const heading = `${pdf.classCode} · ${year} ${cycle === 'eoy' ? 'End of Year' : 'Earlier year'} · teaching Term ${term}`;
        review.append(el('h3', heading), el('p',
          `${touched.length} of ${matches.length} rows matched by exact name in the teaching class. ` +
          'Unmatched or ambiguous students will not change. Check the year and cycle before applying.' +
          (pdf.valueTerm ? ` The PDF prints Term ${pdf.valueTerm}; its named School Value will be used.` : '')), clearLabel);
        const rows = el('ul');
        for (const match of matches) rows.append(el('li', match.name + ': ' + (match.student ?
          Object.entries(match.grades).map(([field, grade]) => {
            const old = record(match.student)?.[field] || 'Not entered';
            return `${field}: ${old} → ${grade || 'blank in PDF'}${grade && old === grade ? ' (matches)' : grade ? ' (differs)' : ''}`;
          }).join(' · ') : 'Not matched — unchanged')));
        review.append(rows);
        async function savePdf(applyGrades) {
          try {
            if (!stillCurrent()) throw new Error('The reporting view or saved grades changed. Preview the PDF again.');
            const next = new Map(records.map(row => [JSON.stringify([row.studentId, row.programme, row.cycle]), row]));
            let confirmed = 0;
            for (const { student, grades } of touched) {
              const key = JSON.stringify([student.id, 'junior', cycle]);
              const existing = next.get(key);
              if (!existing && (!applyGrades || !Object.values(grades).some(Boolean))) continue;
              const row = { ...(existing || defaultRow(student.id, 'junior', cycle, '', '')) };
              for (const [field, grade] of Object.entries(grades)) {
                if (!schema.pdfGradeFields.includes(field)) throw new Error('Unexpected PDF grade field.');
                if (applyGrades && (grade || clears.checked)) row[field] = grade;
                const match = grade && row[field] === grade;
                setConfirmation(row, field, match ? grade : '');
                if (match) confirmed++;
              }
              next.set(key, row);
            }
            const updated = [...next.values()];
            const changed = JSON.stringify(updated) !== snapshot;
            if (changed) applyRecords(updated, defaultStore.value);
            const teaching = groups().find(group => !group.audit && reportClassCode(group.code) === normalizePdfClass(pdf.classCode));
            const visible = !pdf.valueTerm || String(pdf.valueTerm) === term;
            if (teaching && visible) {
              state.classCode = teaching.key;
              state.part = pdf.valueTerm ? 'values' : 'slo';
              state.incomplete = false;
            }
            invalidate(); render();
            const result = `${confirmed} grade cells confirmed for ${pdf.classCode}. ` +
              (applyGrades ? '' : 'No grade values were changed. ');
            const location = !visible ? `View this School Value under Term ${pdf.valueTerm}.` :
              teaching ? `Showing ${teaching.code}.` : '';
            list.disabled = preview.disabled = true;
            status.textContent = result + 'Checking that the Planner draft is saved…';
            const saved = await ensureSaved();
            status.textContent = (saved ? result + (changed ? 'Saved to Planner. ' : 'The saved draft was already up to date. ') :
              'Not saved to Planner. The displayed confirmations are pending. Check the Planner save message before leaving. ') + location;
          } catch (error) { status.textContent = error.message; }
          finally { list.disabled = preview.disabled = false; }
        }
        button(review, 'Confirm matching grades only', false, () => savePdf(false));
        button(review, 'Apply matched grades', false, () => savePdf(true));
        status.textContent = 'Preview ready. No grades have been changed.';
      } catch (error) { status.textContent = error.message; }
      finally { list.disabled = preview.disabled = false; }
    });
    drive.append(preview);
    const batch = button(drive, 'Preview all PDFs', false, previewBatch);
    drive.append(savedFolder, status, review);
    area.append(drive);

    const attendance = el('details', '', { 'data-planner-navigation': '' });
    const attendanceFolder = el('input', '', { type: 'url', 'aria-label': 'Awards attendance Drive folder' });
    const attendanceFiles = el('select', '', { 'aria-label': 'Awards attendance CSV' });
    const attendanceStatus = el('p', '', { role: 'status' });
    const attendanceSavedFolder = el('span', '', { class: 'reporting-folder-status', role: 'status' });
    const attendanceReview = el('div');
    let attendanceIndex = [], attendanceListedFolder = '';
    const attendanceKey = folderKey('attendance');
    try { attendanceFolder.value = globalThis.localStorage?.getItem(attendanceKey) || ''; }
    catch (error) { console.warn('Awards attendance folder could not be loaded:', error.message); }
    showFolderStatus(attendanceFolder, attendanceSavedFolder, attendanceKey);
    attendanceFolder.addEventListener('input', () => {
      attendanceReview.replaceChildren();
      showFolderStatus(attendanceFolder, attendanceSavedFolder, attendanceKey);
    });
    attendanceFiles.addEventListener('change', () => attendanceReview.replaceChildren());
    attendance.append(el('summary', 'Google Drive sync — Attendance%'),
      el('p', 'Select the KAMAR half-day attendance CSV for ' + year + '. Attendance is matched by Student ID across the reporting roster, not by name.'), attendanceFolder);
    const listAttendance = button(attendance, 'List attendance CSVs', false, async () => {
      attendanceIndex = []; attendanceListedFolder = ''; attendanceFiles.replaceChildren(); attendanceReview.replaceChildren();
      const link = attendanceFolder.value.trim();
      listAttendance.disabled = previewAttendance.disabled = true;
      attendanceStatus.textContent = 'Reading attendance folder…';
      try {
        const { files } = await request('google-calendar/reporting-awards/files?' + new URLSearchParams({ folder: link }));
        if (!area.isConnected || attendanceFolder.value.trim() !== link) return;
        attendanceListedFolder = link; attendanceIndex = files;
        rememberFolder(attendanceFolder, attendanceSavedFolder, attendanceKey, link);
        attendanceFiles.append(el('option', 'Select an attendance CSV', { value: '' }));
        for (const file of files) attendanceFiles.append(el('option', file.name, { value: file.id }));
        attendanceFiles.value = '';
        attendanceStatus.textContent = files.length ? `${files.length} CSV files found. Choose the export for ${year}.` : 'No CSV files found in this folder.';
      } catch (error) { attendanceStatus.textContent = error.message; }
      finally { listAttendance.disabled = previewAttendance.disabled = false; }
    });
    attendance.append(attendanceFiles);
    const previewAttendance = button(attendance, 'Preview attendance', false, async () => {
      attendanceReview.replaceChildren();
      const file = attendanceIndex.find(item => item.id === attendanceFiles.value);
      const link = attendanceFolder.value.trim();
      if (!file || link !== attendanceListedFolder) {
        attendanceStatus.textContent = 'List the attendance folder and choose a CSV first.'; return;
      }
      const roster = directory, part = state.programme;
      const current = () => area.isConnected && state.part === 'awards' && state.programme === part && directory === roster &&
        attendanceFolder.value.trim() === link && attendanceFiles.value === file.id && attendanceIndex.includes(file);
      listAttendance.disabled = previewAttendance.disabled = true;
      attendanceStatus.textContent = 'Checking the CSV against the reporting roster…';
      try {
        const [{ entries }, ...terms] = await Promise.all([
          request('google-calendar/reporting-awards/files/' + encodeURIComponent(file.id) + '?' +
            new URLSearchParams({ folder: link, version: file.version })),
          ...[1, 2, 3, 4].map(term => request('attendance/classes/' + year + '?term=' + term + '&view=junior-audit'))
        ]);
        if (!current()) { attendanceStatus.textContent = 'The reporting view changed. Preview the CSV again.'; return; }
        const ids = new Set(terms.flatMap(term => Object.keys(schema.programmes).flatMap(programme =>
          schema.classGroups(term, programme).flatMap(group => group.students.map(student => student.id)))
          .concat((term.homerooms || []).flatMap(group => group.students.map(student => student.id)))));
        const matched = entries.filter(entry => ids.has(entry.id));
        const blanks = matched.filter(entry => entry.percentage === null).length;
        attendanceReview.append(el('p', `${file.name} — ${matched.length} matched IDs (${blanks} blank); ` +
          `${entries.length - matched.length} outside the reporting roster. Confirm this export is for ${year}. ` +
          'Blank percentages do not overwrite a saved value.'));
        if (matched.length > blanks) button(attendanceReview, `Apply attendance for ${year}`, false, async () => {
          if (!current()) { attendanceStatus.textContent = 'The reporting view changed. Preview the CSV again.'; return; }
          const next = { ...awards };
          for (const { id, percentage } of matched) {
            if (percentage !== null) next[id] = { ...next[id], attendance: percentage };
          }
          listAttendance.disabled = previewAttendance.disabled = true;
          attendanceReview.replaceChildren();
          try {
            saveAwards(next); render();
            attendanceStatus.textContent = 'Checking that attendance is saved…';
            const saved = await ensureSaved();
            attendanceStatus.textContent = saved ? `Attendance saved for ${matched.length - blanks} matched students.` :
              'Attendance not saved. Check the Planner save message before leaving.';
          } catch (error) { attendanceStatus.textContent = error.message; }
          finally { listAttendance.disabled = previewAttendance.disabled = false; }
        });
        attendanceStatus.textContent = 'Preview ready. No attendance or awards have changed.';
      } catch (error) { attendanceStatus.textContent = error.message; }
      finally { listAttendance.disabled = previewAttendance.disabled = false; }
    });
    attendance.append(attendanceSavedFolder, attendanceStatus, attendanceReview);
    area.append(attendance);

    const recipientSync = el('details', '', { 'data-planner-navigation': '' });
    const recipientFolder = el('input', '', { type: 'url', 'aria-label': 'Award recipient PDF folder', placeholder: 'Paste the Awards folder link' });
    const recipientSaved = el('span', '', { class: 'reporting-folder-status', role: 'status' });
    const recipientStatus = el('p', '', { role: 'status' }), recipientReview = el('div');
    const recipientKey = folderKey('recipients');
    try { recipientFolder.value = globalThis.localStorage?.getItem(recipientKey) || ''; }
    catch (error) { console.warn('Award recipient folder could not be loaded:', error.message); }
    showFolderStatus(recipientFolder, recipientSaved, recipientKey);
    recipientFolder.addEventListener('input', () => {
      recipientReview.replaceChildren();
      showFolderStatus(recipientFolder, recipientSaved, recipientKey);
    });
    recipientSync.append(el('summary', 'Google Drive sync — Award recipients'),
      el('p', 'Preview KAMAR Award recipient PDFs for this school year. Only Digital Technologies recipients are matched, by Student ID and year level. Criteria PDFs are ignored.'), recipientFolder);
    const previewRecipients = button(recipientSync, 'Preview award PDFs', false, async () => {
      recipientReview.replaceChildren();
      const link = recipientFolder.value.trim(), roster = directory, programme = state.programme;
      if (!link || !roster) { recipientStatus.textContent = 'Enter the Drive Awards folder link and load the class list first.'; return; }
      const current = () => area.isConnected && state.part === 'awards' && state.programme === programme &&
        directory === roster && recipientFolder.value.trim() === link;
      previewRecipients.disabled = true;
      recipientStatus.textContent = 'Reading award recipients from Drive…';
      try {
        const { reports, ignored } = await request('google-calendar/reporting-award-pdfs?' + new URLSearchParams({ folder: link }));
        if (!current()) { recipientStatus.textContent = 'The reporting view changed. Preview the PDFs again.'; return; }
        rememberFolder(recipientFolder, recipientSaved, recipientKey, link);
        const candidates = new Map(groups().flatMap(group => group.students.map(student => [student.id, student])));
        const excluded = externalAwardIds(), accepted = new Map(), unmatched = new Set(), outside = new Set();
        const detail = el('ul');
        let validFiles = 0;
        for (const report of reports) {
          if (report.printYear !== Number(year)) {
            detail.append(el('li', `${report.name} — skipped: printed in ${report.printYear}, not ${year}.`));
            continue;
          }
          validFiles++;
          let found = 0;
          for (const row of report.rows) {
            if (!schema.programmes[programme].years.includes(row.yearLevel)) continue;
            const student = candidates.get(row.id);
            const key = `${row.id}:${row.award}`;
            if (excluded.has(row.id)) { outside.add(key); continue; }
            if (!student || student.yearLevel !== row.yearLevel) { unmatched.add(key); continue; }
            accepted.set(key, { student, award: row.award });
            found++;
          }
          detail.append(el('li', `${report.name} — ${found} matching award rows.`));
        }
        const matched = [...accepted.values()];
        recipientReview.append(el('p', `${validFiles} recipient PDFs for ${year}; ${ignored} other PDFs ignored. ` +
          `${matched.length} unique award ticks matched; ${outside.size} ineligible 7S/8S ticks and ${unmatched.size} unmatched ticks skipped.`), detail);
        if (matched.length) button(recipientReview, `Apply verified awards for ${year}`, false, async () => {
          if (!current()) { recipientStatus.textContent = 'The reporting view changed. Preview the PDFs again.'; return; }
          previewRecipients.disabled = true;
          recipientReview.replaceChildren();
          try {
            const next = { ...awards };
            for (const { student, award } of matched) {
              const entry = next[student.id] || {};
              next[student.id] = { ...entry, [award]: true, pdfConfirmed: { ...entry.pdfConfirmed, [award]: true } };
            }
            saveAwards(next); render();
            recipientStatus.textContent = 'Checking that award ticks are saved…';
            const saved = await ensureSaved();
            recipientStatus.textContent = saved ? `${matched.length} PDF-confirmed award ticks saved. Other ticks and attendance were kept.` :
              'Award ticks not saved. Check the Planner save message before leaving.';
          } catch (error) { recipientStatus.textContent = error.message; }
          finally { previewRecipients.disabled = false; }
        });
        recipientStatus.textContent = 'Preview ready. No award ticks have changed.';
      } catch (error) { recipientStatus.textContent = error.message; }
      finally { previewRecipients.disabled = false; }
    });
    recipientSync.append(recipientSaved, recipientStatus, recipientReview);
    area.append(recipientSync);

    const externalAwardRoom = code => /^(7S|8S)$/i.test(code || '');
    function externalAwardIds() {
      const rooms = directory.homerooms || [];
      return new Set([
        ...rooms.filter(group => externalAwardRoom(group.code)).flatMap(group => group.students.map(student => student.id)),
        ...directory.classes.flatMap(group => group.students.filter(student => externalAwardRoom(student.whanau)).map(student => student.id))
      ]);
    }

    function saveAwards(next) {
      const encoded = JSON.stringify(next);
      if (!schema.validContent({ records: store.value, valuesDefault: defaultStore.value,
        juniorSloDefault: sloDefaultStore.value, awards: encoded })) {
        throw new Error('The award changes did not pass validation or exceeded the draft storage limit.');
      }
      awards = next;
      if (encoded === awardsStore.value) return;
      awardsStore.value = encoded;
      awardsStore.dispatchEvent(new Event('input', { bubbles: true }));
    }

    async function previewBatch() {
      if (list.disabled || preview.disabled || batch.disabled) return;
      invalidate();
      const link = folder.value.trim(), part = state.part, cycle = state.cycle, snapshot = store.value;
      if (!link || state.programme !== 'junior') {
        status.textContent = 'Enter a Drive folder link and select JuniorDTECH before previewing.';
        return;
      }
      const current = () => area.isConnected && state.part === part && state.cycle === cycle &&
        state.programme === 'junior' && folder.value.trim() === link && store.value === snapshot;
      const fileQuery = new URLSearchParams({ folder: link });
      status.textContent = 'Reading Drive PDFs and all four teaching rosters…';
      list.disabled = preview.disabled = batch.disabled = true;
      try {
        const [result, ...rosters] = await Promise.all([
          request('google-calendar/reporting-drive/files?' + fileQuery),
          ...[1, 2, 3, 4].map(term => request('attendance/classes/' + year + '?term=' + term))
        ]);
        if (!current()) throw new Error('The reporting view changed. Preview the batch again.');
        rememberFolder(folder, savedFolder, folderKey(part), link);
        const sources = result.files.filter(file => !file.label || file.label === (part === 'slo' ? 'SLOs' : 'Values'));
        if (!sources.length || sources.length > 30) throw new Error('The folder must contain between 1 and 30 PDFs for this batch.');
        const roster = { classes: rosters.flatMap(item => item.classes) };
        const reports = el('ul'), changes = el('ul'), cells = new Map();
        const detail = el('details'); detail.append(el('summary', 'Grade changes, blanks and conflicts'), changes);
        let included = 0, skipped = 0;
        for (const file of sources) {
          if (!current()) throw new Error('The reporting view changed. Preview the batch again.');
          let pdf;
          try {
            pdf = await request('google-calendar/reporting-drive/file/' + encodeURIComponent(file.id) + '?' +
              new URLSearchParams({ folder: link, version: file.version }));
          } catch (error) {
            throw new Error(`${file.name}: ${error.message} No grades changed. Fix or remove this file and preview again.`);
          }
          if (Boolean(pdf.valueTerm) !== (part === 'values') || (pdf.year !== null && pdf.year !== Number(year))) {
            skipped++;
            reports.append(el('li', `${file.name} — skipped: different report type or assessment year.`));
            continue;
          }
          const matches = planPdf(pdf, roster), matched = matches.filter(item => item.student);
          if (matched.length) included++;
          else skipped++;
          const value = pdf.valueTerm ? ` · ${schema.juniorValues.find(([key]) => key === pdf.fields[0])?.[1]}` : '';
          reports.append(el('li', `${pdf.classCode}${value} — ${file.name}: ${matched.length}/${matches.length} rows matched.`));
          for (const item of matches) {
            if (!item.student) {
              changes.append(el('li', `${pdf.classCode} · ${item.name}: no unique class-roster match; unchanged.`));
              continue;
            }
            for (const [field, grade] of Object.entries(item.grades)) {
              if (!schema.pdfGradeFields.includes(field)) throw new Error('Unexpected PDF grade field.');
              const key = JSON.stringify([item.student.id, field]);
              if (!cells.has(key)) cells.set(key, { student: item.student, field, grades: new Set(), sources: new Set() });
              const cell = cells.get(key);
              cell.grades.add(grade); cell.sources.add(file.name);
            }
          }
        }
        if (!current()) throw new Error('The reporting view changed. Preview the batch again.');
        let replacements = 0, fills = 0, conflicts = 0;
        for (const { student, field, grades, sources } of cells.values()) {
          const old = record(student)?.[field] || '', [grade] = grades;
          if (grades.size > 1) {
            conflicts++;
            changes.append(el('li', `${student.name} · ${field}: PDFs disagree (${[...grades].map(g => g || 'blank').join(' / ')}) — ${[...sources].join(', ')}. Grade unchanged.`));
          } else if (old !== grade) {
            if (old && grade) replacements++;
            if (!old && grade) fills++;
            changes.append(el('li', `${student.name} · ${field}: ${old || 'Not entered'} → ${grade || 'blank in PDF (grade kept)'}.`));
          }
        }
        review.append(el('h3', `${year} ${cycle === 'eoy' ? 'End of Year' : 'Earlier year'} · all four teaching terms`),
          el('p', `${included} PDFs matched; ${skipped} skipped. ${replacements} grade replacements, ${fills} blank cells to fill, ${conflicts} disputed cells to leave unchanged. Check the report cycle before applying.`),
          reports, detail);
        if (included) button(review, 'Apply batch to Planner', false, async () => {
          if (!current()) {
            invalidate(); status.textContent = 'The reporting view or saved grades changed. Preview the batch again.';
            return;
          }
          list.disabled = preview.disabled = batch.disabled = true;
          try {
            const next = new Map(records.map(row => [JSON.stringify([row.studentId, row.programme, row.cycle]), row]));
            for (const { student, field, grades } of cells.values()) {
              const key = JSON.stringify([student.id, 'junior', cycle]), [grade] = grades;
              const existing = next.get(key);
              const disputed = grades.size > 1;
              if ((!existing || !existing.pdfConfirmed?.[field]) && (disputed || !grade)) continue;
              const row = { ...(existing || defaultRow(student.id, 'junior', cycle, '', '')) };
              if (disputed || !grade) setConfirmation(row, field, '');
              else {
                const old = row[field];
                row[field] = grade;
                setConfirmation(row, field, grade, old && old !== grade ? old : undefined);
              }
              next.set(key, row);
            }
            const updated = [...next.values()];
            if (JSON.stringify(updated) !== snapshot) applyRecords(updated, defaultStore.value);
            invalidate(); if (directory) render();
            status.textContent = 'Checking that the Planner draft is saved…';
            const saved = await ensureSaved();
            status.textContent = saved ? `Batch saved to Planner: ${replacements} grades replaced, ${fills} blanks filled, ${conflicts} PDF disagreements left unchanged.` :
              'Batch not saved. Check the Planner save message before leaving.';
          } catch (error) { status.textContent = error.message; }
          finally { list.disabled = preview.disabled = batch.disabled = false; }
        });
        status.textContent = included ? 'Batch preview ready. No grades have been changed.' : 'No PDFs matched your teaching rosters. No grades changed.';
      } catch (error) { status.textContent = error.message; }
      finally { list.disabled = preview.disabled = batch.disabled = false; }
    }

    const normalizePdfClass = code => code.replace('MMDETCH', 'MMDTECH');
    const reportClassCode = code => normalizePdfClass(code.split('-')[1] || '');
    function planPdf(pdf, roster) {
      const normalize = name => name.normalize('NFC').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
      const candidates = new Map();
      for (const group of roster.classes) {
        if (reportClassCode(group.code) !== normalizePdfClass(pdf.classCode)) continue;
        for (const student of group.students) if (schema.programmes.junior.years.includes(student.yearLevel)) candidates.set(student.id, student);
      }
      const seen = new Set();
      return pdf.rows.map(row => {
        const name = normalize(row.name);
        if (seen.has(name)) throw new Error('The PDF has duplicate student names. Nothing was imported.');
        seen.add(name);
        const matched = [...candidates.values()].filter(student => normalize(student.name) === name);
        return { ...row, student: matched.length === 1 ? matched[0] : null };
      });
    }
    function defaultRow(studentId, programme, cycle, valuesDefault, sloDefault) {
      const slo = programme === 'junior' ? sloDefault : '';
      const value = valuesDefault ? 'Dem' : '';
      const row = { studentId, programme, cycle, coding: slo, design: slo,
        kaitiakitanga: value, rangatiratanga: value, comment: '' };
      if (valuesDefault === 'Dem-v2') { row.whanaungatanga = 'Dem'; row.manaakitanga = 'Dem'; }
      return row;
    }
    function setConfirmation(row, field, grade, previous) {
      if (!grade && !row.pdfConfirmed?.[field]) return;
      const confirmed = { ...row.pdfConfirmed };
      const replaced = { ...row.pdfPrevious };
      if (!grade || confirmed[field] !== grade) delete replaced[field];
      if (previous) replaced[field] = previous;
      if (grade) confirmed[field] = grade;
      else delete confirmed[field];
      if (Object.keys(confirmed).length) row.pdfConfirmed = confirmed;
      else delete row.pdfConfirmed;
      if (Object.keys(replaced).length) row.pdfPrevious = replaced;
      else delete row.pdfPrevious;
    }
    function showConfirmation(cell, row, field) {
      const confirmed = Boolean(row?.[field] && row.pdfConfirmed?.[field] === row[field]);
      const previous = confirmed && row.pdfPrevious?.[field];
      cell.setAttribute('class', previous ? 'reporting-pdf-replaced' : confirmed ? 'reporting-pdf-confirmed' : '');
      const label = previous ? `updated from ${previous} using KAMAR PDF` : confirmed ? 'confirmed against KAMAR PDF' : '';
      cell.setAttribute('title', label);
      return label ? ` (${label})` : '';
    }
    function addNewStudents(next, directories, valuesDefault, sloDefault, programmes = Object.keys(schema.programmes)) {
      const known = new Set(next.map(row => JSON.stringify([row.studentId, row.programme, row.cycle])));
      for (const list of directories) for (const programme of programmes) {
        for (const group of schema.classGroups(list, programme)) for (const student of group.students) {
          for (const cycle of ['eoy', 'earlier']) {
            const key = JSON.stringify([student.id, programme, cycle]);
            if (!known.has(key)) { next.push(defaultRow(student.id, programme, cycle, valuesDefault, sloDefault)); known.add(key); }
          }
        }
      }
    }
    function applyRecords(next, defaultValue, sloDefault = sloDefaultStore.value) {
      const encoded = JSON.stringify(next);
      if (!schema.validContent({ records: encoded, valuesDefault: defaultValue, juniorSloDefault: sloDefault, awards: awardsStore.value })) {
        throw new Error('The reporting storage limit or record validation was exceeded. No report records were changed.');
      }
      records.splice(0, records.length, ...next);
      store.value = encoded; defaultStore.value = defaultValue; sloDefaultStore.value = sloDefault;
      store.dispatchEvent(new Event('input', { bubbles: true }));
    }
    async function setDefaults() {
      if (fill.disabled || sloBulk.disabled || !confirm(
        'Fill blank school values with Dem for your JuniorDTECH and MiddleDTECH students across all four terms and both report cycles? Existing choices, SLOs and comments remain unchanged. New students will also default to Dem.')) return;
      fill.disabled = true; sloBulk.disabled = true;
      let applied = false;
      bulkStatus.setAttribute('role', 'status');
      bulkStatus.textContent = 'Checking all four term rosters; no values have been changed yet...';
      try {
        const lists = await Promise.all([1, 2, 3, 4].map(term => request('attendance/classes/' + year + '?term=' + term)));
        if (!area.isConnected) return;
        const next = records.map(row => {
          const updated = { ...row };
          for (const [key] of schema.juniorValues) if (!updated[key]) updated[key] = 'Dem';
          return updated;
        });
        addNewStudents(next, lists, 'Dem-v2', sloDefaultStore.value);
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
      } finally { fill.disabled = false; sloBulk.disabled = false; }
    }
    fill.addEventListener('click', setDefaults);
    sloBulk.addEventListener('click', async () => {
      if (sloBulk.disabled || !confirm('Overwrite both JuniorDTECH SLOs with 3P in all your existing drafts and across all four term rosters, for both report cycles? New JuniorDTECH students will also default to 3P. School values, comments and MiddleDTECH reports remain unchanged.')) return;
      fill.disabled = true; sloBulk.disabled = true;
      let applied = false;
      sloStatus.setAttribute('role', 'status');
      sloStatus.textContent = 'Checking all four term rosters; no SLOs have been changed yet...';
      try {
        const lists = await Promise.all([1, 2, 3, 4].map(term => request('attendance/classes/' + year + '?term=' + term)));
        if (!area.isConnected) return;
        const next = records.map(row => {
          if (row.programme !== 'junior') return row;
          const updated = { ...row, coding: '3P', design: '3P' };
          for (const field of ['coding', 'design']) if (row[field] !== updated[field]) setConfirmation(updated, field, '');
          return updated;
        });
        addNewStudents(next, lists, defaultStore.value, '3P', ['junior']);
        applyRecords(next, defaultStore.value, '3P');
        applied = true;
        if (directory) render();
        sloStatus.textContent = 'JuniorDTECH SLOs set to 3P across both report cycles. New students default to 3P. Waiting for Planner autosave; confirm the saved message above.';
      } catch (error) {
        if (!area.isConnected) return;
        console.error('Reporting JuniorDTECH SLO update failed:', error.message);
        sloStatus.setAttribute('role', 'alert');
        sloStatus.textContent = applied ? 'SLOs were changed on this page; check the Planner save status before leaving. ' + error.message :
          'No SLOs were changed. All four term rosters must load before this update: ' + error.message;
      } finally { fill.disabled = false; sloBulk.disabled = false; }
    });
    function record(student, create = false) {
      let row = records.find(item => item.studentId === student.id && item.programme === state.programme && item.cycle === state.cycle);
      if (!row && create) {
        row = defaultRow(student.id, state.programme, state.cycle, defaultStore.value, sloDefaultStore.value);
        records.push(row);
      }
      return row;
    }
    function update(student, field, value, control, cell, label) {
      const previous = store.value;
      const existing = record(student), row = existing || record(student, true), old = row[field];
      const oldConfirmation = row.pdfConfirmed;
      const oldPrevious = row.pdfPrevious;
      row[field] = value;
      if (old !== value) setConfirmation(row, field, '');
      const next = JSON.stringify(records);
      if (!schema.validContent({ records: next, valuesDefault: defaultStore.value, juniorSloDefault: sloDefaultStore.value, awards: awardsStore.value })) {
        row[field] = old; control.value = old;
        if (oldConfirmation) row.pdfConfirmed = oldConfirmation;
        if (oldPrevious) row.pdfPrevious = oldPrevious;
        if (!existing) records.splice(records.indexOf(row), 1);
        feedback.setAttribute('role', 'alert');
        feedback.textContent = 'This reporting entry exceeds the storage limit. The latest edit was not accepted; earlier entries are unchanged.';
        store.value = previous;
        return;
      }
      store.value = next;
      const confirmed = showConfirmation(cell, row, field);
      control.setAttribute('aria-label', label + confirmed);
      store.dispatchEvent(new Event('input', { bubbles: true }));
      summary();
    }
    function button(parent, label, active, action, attrs = {}) {
      const node = el('button', label, { type: 'button', 'aria-pressed': String(active), ...attrs });
      node.addEventListener('click', action); parent.append(node); return node;
    }
    function groups() {
      const teaching = schema.classGroups(directory, state.programme).map(group => ({ ...group, key: group.code }));
      if ((state.cycle !== 'eoy' && state.part !== 'awards') || state.programme !== 'junior') return teaching;
      return teaching.concat((directory.homerooms || []).map(group => ({ ...group, key: 'audit:' + group.code, audit: true })));
    }
    function selected() { return groups().find(group => group.key === state.classCode); }
    function reportTerm(group) {
      if (state.part !== 'values' || !group?.audit) return termSelect.value;
      const terms = allocationReady ? schema.homeroomTerms(group, auditRosters) : [];
      return terms.length === 1 ? terms[0] : undefined;
    }
    function showAllocation() {
      allocation.hidden = state.part !== 'values';
      if (allocation.hidden) return;
      allocation.replaceChildren(el('strong', 'School Value allocation'));
      const table = el('table'), thead = el('thead'), tbody = el('tbody'), header = el('tr');
      const junior = state.programme === 'junior';
      for (const label of [junior ? 'Homeroom' : 'Semester', junior ? 'DTECH term' : 'Terms', 'School Value']) {
        header.append(el('th', label, { scope: 'col' }));
      }
      thead.append(header); table.append(thead, tbody); allocation.append(table);
      function addRow(label, terms, values) {
        const row = el('tr');
        row.append(el('th', label, { scope: 'row' }), el('td', terms), el('td', values)); tbody.append(row);
      }
      if (!junior) {
        for (const term of [1, 3]) addRow(`Semester ${term === 1 ? 1 : 2}`, `Terms ${term} and ${term + 1}`,
          schema.valueFields('middle', term).map(([, label]) => label).join(' / '));
        return;
      }
      if (!allocationReady) {
        allocation.append(el('p', allocationError || 'Checking the four preserved teaching timetables…', { role: 'status' }));
        if (allocationError) button(allocation, 'Retry term allocations', false, () => {
          allocationError = ''; showAllocation();
        });
        else void loadAllocations();
      }
      for (const room of directory.homerooms || []) {
        const terms = allocationReady ? schema.homeroomTerms(room, auditRosters) : [];
        addRow(room.code, terms.length ? terms.map(term => `Term ${term}`).join(' / ') : allocationReady ? 'Not verified' : '—',
          terms.map(term => schema.juniorValues[Number(term) - 1][1]).join(' / ') || '—');
      }
      if (allocationReady) allocation.append(el('p', 'Only a single verified teaching term is used in the homeroom audit.'));
    }
    async function loadAllocations() {
      if (allocationPending) return;
      allocationPending = true;
      try {
        const missing = ['1', '2', '3', '4'].filter(term => !auditRosters.has(term));
        await Promise.all(missing.map(async term => {
          const roster = await request('attendance/classes/' + year + '?term=' + term + '&view=junior-audit');
          auditRosters.set(term, roster);
        }));
        allocationReady = true;
      } catch (error) {
        allocationError = 'Could not verify the DTECH terms: ' + error.message;
      } finally {
        allocationPending = false;
        if (area.isConnected && directory && state.part === 'values') render();
      }
    }
    function summary() {
      const group = selected(), students = group?.students || [], term = reportTerm(group);
      const count = students.filter(student => schema.complete(record(student), state.cycle, term)).length;
      for (const group of groups()) {
        const done = group.students.filter(student => schema.complete(record(student), state.cycle, reportTerm(group))).length;
        const tab = classButtons.get(group.key);
        if (tab) tab.textContent = group.audit && !reportTerm(group) ? `${group.code} (—/${group.students.length})` :
          `${group.code} (${done}/${group.students.length})`;
      }
      feedback.setAttribute('role', 'status');
      if (group?.audit && !term) {
        feedback.textContent = 'No single DTECH teaching term is verified for this homeroom. No School Value has been selected for the audit.';
        return;
      }
      feedback.textContent = `${count} of ${students.length} students complete in this ${selected()?.audit ? 'homeroom' : 'class'}. ` +
        (state.programme === 'junior' ? 'JuniorDTECH requires at least one SLO and the reporting term’s school value. ' :
          'MiddleDTECH requires both SLOs and both values for the selected semester. ') +
        (state.cycle === 'eoy' ? 'Comments are optional for EOY.' : 'An earlier-year comment is required.');
    }
    function render() {
      updateDefaultPanels();
      showDrive();
      const awarding = state.part === 'awards';
      attendance.hidden = !awarding;
      recipientSync.hidden = !awarding;
      showAllocation();
      controls.replaceChildren(); body.replaceChildren(); classButtons.clear();
      const cycleLabel = el('label', 'Report cycle ');
      const cycle = el('select', '', { 'aria-label': 'Report cycle' });
      for (const [value, label] of [['eoy', 'End of Year'], ['earlier', 'Earlier year']]) cycle.append(el('option', label, { value }));
      cycle.value = state.cycle;
      cycle.addEventListener('change', () => { state.cycle = cycle.value; invalidate(); render(); });
      cycleLabel.append(cycle);
      controls.append(cycleLabel);
      const programmes = el('div', '', { class: 'reporting-tabs', role: 'group', 'aria-label': 'Programme' });
      for (const [key, programme] of Object.entries(schema.programmes)) {
        button(programmes, programme.label, state.programme === key, () => {
          state.programme = key; state.classCode = ''; awardClass = ''; invalidate(); render();
        });
      }
      controls.append(programmes);
      const classes = groups();
      if (!classes.some(group => group.key === state.classCode)) state.classCode = classes[0]?.key || '';
      if (!classes.some(group => group.key === awardClass)) awardClass = '';
      const tabs = el('div', '', { class: 'reporting-tabs', role: 'group', 'aria-label': 'Teaching classes' });
      const auditTabs = el('div', '', { class: 'reporting-tabs', role: 'group', 'aria-label': 'Homeroom audit' });
      for (const group of classes) {
        const done = group.students.filter(student => schema.complete(record(student), state.cycle, reportTerm(group))).length;
        const label = awarding ? `${group.code} (${group.students.length})` : `${group.code} (${done}/${group.students.length})`;
        const blocked = awarding && group.audit && externalAwardRoom(group.code);
        const tab = button(group.audit ? auditTabs : tabs, label,
          group.key === (awarding ? awardClass : state.classCode), () => {
            if (blocked) return;
            if (awarding) awardClass = group.key;
            else state.classCode = group.key;
            render();
          },
          { class: group.audit ? 'reporting-audit-tab' : 'reporting-teaching-tab' });
        if (blocked) { tab.disabled = true; tab.setAttribute('title', 'Awards are not assigned to students at the other school.'); }
        classButtons.set(group.key, tab);
      }
      if (classes.some(group => !group.audit)) controls.append(el('strong', 'Teaching classes'), tabs);
      if (classes.some(group => group.audit)) controls.append(el('strong', awarding ? 'Homerooms (award ticks editable)' : 'Homeroom audit (read-only)'), auditTabs);
      const parts = el('div', '', { class: 'reporting-tabs', role: 'group', 'aria-label': 'Report part' });
      for (const [key, label] of [['slo', '1. Student Learning Objectives'], ['values', '2. School Values'], ['comments', '3. Report Comments'], ['awards', '4. Awards']]) {
        button(parts, label, state.part === key, () => {
          state.part = key;
          render();
        });
      }
      controls.append(parts);
      if (state.part === 'awards') {
        body.append(el('h3', 'Kaha Mohio and Kaha Akoranga criteria'));
        const criteria = el('ul');
        for (const [label, id] of [
          ['Junior/Middle (Years 7–10) — 2025 award criteria (PDF)', '1CxZBXBP6pIOPKs4TvmSSdlnlZj60yXsL'],
          ['Senior — 2026 Kaha Akoranga and Kaha Mohio criteria (PDF)', '1zlY1_IdWcWLBCttZf3VEt5DvVEA9aVJi']
        ]) {
          const item = el('li');
          item.append(el('a', label, {
            href: `https://drive.google.com/file/d/${id}/view`, target: '_blank', rel: 'noopener noreferrer'
          }));
          criteria.append(item);
        }
        body.append(criteria, el('p', 'Green: Yes confirmed against a KAMAR PDF. White: manual or unticked. Awards are not assigned to 7S or 8S.'));
        const awardControls = el('div', '', { class: 'reporting-tabs', 'data-planner-navigation': '' });
        button(awardControls, 'All students', !awardClass, () => { awardClass = ''; render(); });
        const filter = el('select', '', { 'aria-label': 'Filter awards' });
        for (const [value, label] of [['all', 'All rows'], ['any', 'Award recipients only'], ['mohio', 'Mohio only'], ['akoranga', 'Akoranga only']]) {
          filter.append(el('option', label, { value }));
        }
        filter.value = awardFilter;
        filter.addEventListener('change', () => { awardFilter = filter.value; render(); });
        awardControls.append(filter); body.append(awardControls);
        const roster = new Map((awardClass ? classes.filter(group => group.key === awardClass) : classes)
          .flatMap(group => group.students.map(student => [student.id, student])));
        const students = [...roster.values()].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
        const excluded = externalAwardIds();
        const winners = (student, type) => !excluded.has(student.id) && awards[student.id]?.[type] === true;
        const matchesFilter = student => awardFilter === 'all' ||
          (awardFilter === 'any' ? winners(student, 'mohio') || winners(student, 'akoranga') : winners(student, awardFilter));
        const shown = students.filter(matchesFilter);
        const awardSummary = () => {
          feedback.textContent = `${students.filter(matchesFilter).length} of ${students.length} students shown · ` +
            `${students.filter(student => winners(student, 'mohio')).length} Mohio · ` +
            `${students.filter(student => winners(student, 'akoranga')).length} Akoranga`;
        };
        awardSummary();
        const scroll = el('div', '', { class: 'reporting-scroll', tabindex: '0', role: 'region', 'aria-label': 'Student awards' });
        const table = el('table', '', { class: 'reporting-table' }), headers = el('tr'), thead = el('thead'), tbody = el('tbody');
        for (const label of ['Student', 'Year', 'Attendance%', 'Mohio', 'Akoranga']) headers.append(el('th', label, { scope: 'col' }));
        thead.append(headers); table.append(thead, tbody); scroll.append(table); body.append(scroll);
        for (const student of shown) {
          const tr = el('tr'), entry = awards[student.id] || {};
          tr.append(el('th', student.name, { scope: 'row' }), el('td', student.yearLevel),
            el('td', entry.attendance === undefined ? '—' : `${entry.attendance}%`));
          for (const [key, label] of [['mohio', 'Mohio'], ['akoranga', 'Akoranga']]) {
            const cell = el('td'), tickLabel = `${student.name}: ${label}`;
            const tick = el('input', '', { type: 'checkbox', 'aria-label': tickLabel });
            const confirmed = winners(student, key) && entry.pdfConfirmed?.[key];
            tick.checked = winners(student, key);
            tick.disabled = excluded.has(student.id);
            if (confirmed) {
              cell.setAttribute('class', 'reporting-pdf-confirmed');
              cell.setAttribute('title', 'Confirmed against a KAMAR award PDF');
              tick.setAttribute('aria-label', tickLabel + ' (confirmed against a KAMAR award PDF)');
            }
            tick.addEventListener('change', event => {
              event.stopPropagation();
              if (tick.disabled) return;
              const next = { ...awards }, updated = { ...next[student.id] };
              if (tick.checked) updated[key] = true;
              else delete updated[key];
              if (updated.pdfConfirmed?.[key]) {
                updated.pdfConfirmed = { ...updated.pdfConfirmed };
                delete updated.pdfConfirmed[key];
                if (!Object.keys(updated.pdfConfirmed).length) delete updated.pdfConfirmed;
              }
              if (Object.keys(updated).length) next[student.id] = updated;
              else delete next[student.id];
              try {
                saveAwards(next);
                cell.setAttribute('class', '');
                cell.setAttribute('title', '');
                tick.setAttribute('aria-label', tickLabel);
                if (matchesFilter(student)) awardSummary();
                else render();
              }
              catch (error) { tick.checked = !tick.checked; feedback.textContent = error.message; }
            });
            cell.append(tick); tr.append(cell);
          }
          tbody.append(tr);
        }
        if (!shown.length) body.append(el('p', 'No students match this award filter.'));
        return;
      }
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
      const group = selected(), term = reportTerm(group);
      const definitions = state.part === 'slo' ? [['coding', 'Computational Thinking - Coding'], ['design', 'Design & Develop a Digital Outcome']] :
        state.part === 'values' ? schema.valueFields(state.programme, term) :
          [['comment', 'Report comment' + (state.cycle === 'eoy' ? ' (optional for EOY)' : ' (required)')]];
      if (state.part !== 'comments') body.append(el('p', 'Green: confirmed against a KAMAR PDF. Amber: a different Planner grade was replaced by KAMAR. White: not confirmed.'));
      const scroll = el('div', '', { class: 'reporting-scroll', tabindex: '0', role: 'region', 'aria-label': 'Class report entries' });
      const table = el('table', '', { class: 'reporting-table' }), head = el('tr'), tbody = el('tbody');
      head.append(el('th', 'Student', { scope: 'col' }), el('th', 'Year', { scope: 'col' }));
      for (const [, label] of definitions) head.append(el('th', label, { scope: 'col' }));
      const thead = el('thead'); thead.append(head); table.append(thead, tbody); scroll.append(table); body.append(scroll);
      const students = group.students.filter(student => !state.incomplete || !schema.complete(record(student), state.cycle, term));
      for (const student of students) {
        const tr = el('tr');
        tr.append(el('th', student.name, { scope: 'row' }), el('td', student.yearLevel));
        for (const [field, label] of definitions) {
          const row = record(student);
          const td = el('td');
          const confirmed = showConfirmation(td, row, field);
          if (group.audit) {
            td.textContent = row?.[field] || 'Not entered';
            if (confirmed) td.setAttribute('aria-label', td.textContent + confirmed);
            tr.append(td);
            continue;
          }
          const controlLabel = student.name + ': ' + label;
          const control = el(field === 'comment' ? 'textarea' : 'select', '',
            { 'aria-label': controlLabel + confirmed });
          if (field === 'comment') { control.maxLength = 2000; control.rows = 3; }
          else {
            const choices = state.part === 'slo' ? schema.programmes[state.programme].levels : schema.values;
            control.append(el('option', 'Not entered', { value: '' }));
            for (const choice of choices) control.append(el('option', choice, { value: choice }));
          }
          control.value = row?.[field] || '';
          control.addEventListener(field === 'comment' ? 'input' : 'change', event => {
            event.stopPropagation(); update(student, field, control.value, control, td, controlLabel);
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
      allocation.hidden = true;
      feedback.setAttribute('role', 'status');
      feedback.textContent = 'Loading Term ' + selectedTerm + ' school classes...';
      try {
        const result = await request('attendance/classes/' + year + '?term=' + selectedTerm + '&view=junior-audit');
        if (!area.isConnected || currentLoad !== loadNumber) return;
        auditRosters.set(selectedTerm, result);
        if (defaultStore.value || sloDefaultStore.value) {
          const next = records.map(row => ({ ...row }));
          const programmes = defaultStore.value ? Object.keys(schema.programmes) : ['junior'];
          addNewStudents(next, [result], defaultStore.value, sloDefaultStore.value, programmes);
          if (next.length !== records.length) applyRecords(next, defaultStore.value);
        }
        directory = result;
        render();
      } catch (error) {
        if (!area.isConnected || currentLoad !== loadNumber) return;
        console.error('Reporting class list failed:', error.message);
        feedback.setAttribute('role', 'alert'); feedback.textContent = error.message;
        controls.replaceChildren();
        button(controls, 'Retry loading classes', false, loadClasses);
      }
    }
    termSelect.addEventListener('change', () => { state.classCode = ''; awardClass = ''; invalidate(); void loadClasses(); });
    void loadClasses();
  }
  globalThis.plannerReporting = { mount };
})();
