(() => {
  'use strict';
  const schema = globalThis.plannerReportingSchema;
  const state = { cycle: 'eoy', programme: 'junior', classCode: '', part: 'slo', incomplete: false };
  function mount(host, { el, data, year, request, ensureSaved, initialTerm = '3' }) {
    const records = data.records ? JSON.parse(data.records) : [];
    if (!schema.validRecords(records)) throw new Error('Saved reporting data is invalid. No report records have been changed.');
    const area = el('section', '', { class: 'paper-page reporting-page' });
    const store = el('input', '', { type: 'hidden', name: 'records' });
    store.value = JSON.stringify(records);
    const defaultStore = el('input', '', { type: 'hidden', name: 'valuesDefault' });
    defaultStore.value = data.valuesDefault || '';
    const sloDefaultStore = el('input', '', { type: 'hidden', name: 'juniorSloDefault' });
    const sloDefault = data.juniorSloDefault === undefined ? '' : data.juniorSloDefault;
    if (!schema.validContent({ records: store.value, valuesDefault: defaultStore.value, juniorSloDefault: sloDefault })) {
      throw new Error('Saved reporting defaults are invalid. No report records have been changed.');
    }
    sloDefaultStore.value = sloDefault;
    area.append(store, defaultStore, sloDefaultStore, el('h2', 'Reporting - ' + year));
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
    area.append(defaultsPanel, sloPanel, controls, feedback, body); host.append(area);
    let directory, loadNumber = 0;
    const classButtons = new Map();
    const drive = el('details', '', { 'data-planner-navigation': '' });
    const folder = el('input', '', { type: 'url', 'aria-label': 'Google Drive Reports folder', placeholder: 'Paste the Reports folder link' });
    const files = el('select', '', { 'aria-label': 'KAMAR report PDF' });
    const status = el('p', '', { role: 'status' });
    const review = el('div');
    let indexed = [], listedFolder = '';
    const invalidate = () => review.replaceChildren();
    folder.addEventListener('input', invalidate);
    files.addEventListener('change', invalidate);
    drive.append(el('summary', 'Google Drive sync — KAMAR reports'),
      el('p', 'Select the report cycle and the PDF’s teaching term first. Preview one SLO or Values PDF at a time. Nothing is written to KAMAR or Drive. ' +
        'If prompted, enable read-only Drive access in Kamar Uploader Attendance Admin.'), folder);
    const list = button(drive, 'List Drive PDFs', false, async () => {
      list.disabled = true;
      invalidate();
      indexed = []; listedFolder = ''; files.replaceChildren();
      status.textContent = 'Reading Drive folder…';
      try {
        const link = folder.value.trim();
        const result = await request('google-calendar/reporting-drive/files?' + new URLSearchParams({ folder: link }));
        if (folder.value.trim() !== link || !area.isConnected) return;
        listedFolder = link; indexed = result.files;
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
    drive.append(preview, status, review);
    area.append(drive);

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
      if (programme === 'junior' && valuesDefault === 'Dem-v2') { row.whanaungatanga = 'Dem'; row.manaakitanga = 'Dem'; }
      return row;
    }
    function setConfirmation(row, field, grade) {
      if (!grade && !row.pdfConfirmed?.[field]) return;
      const confirmed = { ...row.pdfConfirmed };
      if (grade) confirmed[field] = grade;
      else delete confirmed[field];
      if (Object.keys(confirmed).length) row.pdfConfirmed = confirmed;
      else delete row.pdfConfirmed;
    }
    function showConfirmation(cell, row, field) {
      const confirmed = Boolean(row?.[field] && row.pdfConfirmed?.[field] === row[field]);
      cell.setAttribute('class', confirmed ? 'reporting-pdf-confirmed' : '');
      cell.setAttribute('title', confirmed ? 'Confirmed against a KAMAR PDF' : '');
      return confirmed;
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
      if (!schema.validContent({ records: encoded, valuesDefault: defaultValue, juniorSloDefault: sloDefault })) {
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
          const keys = row.programme === 'junior' ? schema.juniorValues.map(([key]) => key) : ['kaitiakitanga', 'rangatiratanga'];
          for (const key of keys) if (!updated[key]) updated[key] = 'Dem';
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
      row[field] = value;
      if (old !== value) setConfirmation(row, field, '');
      const next = JSON.stringify(records);
      if (!schema.validContent({ records: next, valuesDefault: defaultStore.value, juniorSloDefault: sloDefaultStore.value })) {
        row[field] = old; control.value = old;
        if (oldConfirmation) row.pdfConfirmed = oldConfirmation;
        if (!existing) records.splice(records.indexOf(row), 1);
        feedback.setAttribute('role', 'alert');
        feedback.textContent = 'This reporting entry exceeds the storage limit. The latest edit was not accepted; earlier entries are unchanged.';
        store.value = previous;
        return;
      }
      store.value = next;
      const confirmed = showConfirmation(cell, row, field);
      control.setAttribute('aria-label', label + (confirmed ? ' (confirmed against KAMAR PDF)' : ''));
      store.dispatchEvent(new Event('input', { bubbles: true }));
      summary();
    }
    function button(parent, label, active, action, attrs = {}) {
      const node = el('button', label, { type: 'button', 'aria-pressed': String(active), ...attrs });
      node.addEventListener('click', action); parent.append(node); return node;
    }
    function groups() {
      const teaching = schema.classGroups(directory, state.programme).map(group => ({ ...group, key: group.code }));
      if (state.cycle !== 'eoy' || state.programme !== 'junior') return teaching;
      return teaching.concat((directory.homerooms || []).map(group => ({ ...group, key: 'audit:' + group.code, audit: true })));
    }
    function selected() { return groups().find(group => group.key === state.classCode); }
    function summary() {
      const students = selected()?.students || [];
      const count = students.filter(student => schema.complete(record(student), state.cycle, termSelect.value)).length;
      for (const group of groups()) {
        const done = group.students.filter(student => schema.complete(record(student), state.cycle, termSelect.value)).length;
        const tab = classButtons.get(group.key);
        if (tab) tab.textContent = `${group.code} (${done}/${group.students.length})`;
      }
      feedback.setAttribute('role', 'status');
      feedback.textContent = `${count} of ${students.length} students complete in this ${selected()?.audit ? 'homeroom' : 'class'}. ` +
        (state.programme === 'junior' ? 'JuniorDTECH requires at least one SLO and this term’s school value. ' :
          'MiddleDTECH requires both SLOs and both school values. ') +
        (state.cycle === 'eoy' ? 'Comments are optional for EOY.' : 'An earlier-year comment is required.');
    }
    function render() {
      updateDefaultPanels();
      drive.hidden = state.part === 'awards';
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
          state.programme = key; state.classCode = ''; invalidate(); render();
        });
      }
      controls.append(programmes);
      const classes = groups();
      if (!classes.some(group => group.key === state.classCode)) state.classCode = classes[0]?.key || '';
      const tabs = el('div', '', { class: 'reporting-tabs', role: 'group', 'aria-label': 'Teaching classes' });
      const auditTabs = el('div', '', { class: 'reporting-tabs', role: 'group', 'aria-label': 'Homeroom audit' });
      for (const group of classes) {
        const done = group.students.filter(student => schema.complete(record(student), state.cycle, termSelect.value)).length;
        classButtons.set(group.key, button(group.audit ? auditTabs : tabs, `${group.code} (${done}/${group.students.length})`,
          group.key === state.classCode, () => { state.classCode = group.key; render(); },
          { class: group.audit ? 'reporting-audit-tab' : 'reporting-teaching-tab' }));
      }
      if (classes.some(group => !group.audit)) controls.append(el('strong', 'Teaching classes'), tabs);
      if (classes.some(group => group.audit)) controls.append(el('strong', 'Homeroom audit (read-only)'), auditTabs);
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
        body.append(criteria, el('p', 'Criteria reference only. No awards are calculated, allocated or confirmed here yet.'));
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
      const definitions = state.part === 'slo' ? [['coding', 'Computational Thinking - Coding'], ['design', 'Design & Develop a Digital Outcome']] :
        state.part === 'values' ? (state.programme === 'junior' ? [schema.juniorValues[Number(termSelect.value) - 1]] :
          [['kaitiakitanga', 'Kaitiakitanga'], ['rangatiratanga', 'Rangatiratanga']]) :
          [['comment', 'Report comment' + (state.cycle === 'eoy' ? ' (optional for EOY)' : ' (required)')]];
      if (state.part !== 'comments') body.append(el('p', 'Green: confirmed against a KAMAR PDF. White: not confirmed.'));
      const scroll = el('div', '', { class: 'reporting-scroll', tabindex: '0', role: 'region', 'aria-label': 'Class report entries' });
      const table = el('table', '', { class: 'reporting-table' }), head = el('tr'), tbody = el('tbody');
      head.append(el('th', 'Student', { scope: 'col' }), el('th', 'Year', { scope: 'col' }));
      for (const [, label] of definitions) head.append(el('th', label, { scope: 'col' }));
      const thead = el('thead'); thead.append(head); table.append(thead, tbody); scroll.append(table); body.append(scroll);
      const group = selected();
      const students = group.students.filter(student => !state.incomplete || !schema.complete(record(student), state.cycle, termSelect.value));
      for (const student of students) {
        const tr = el('tr');
        tr.append(el('th', student.name, { scope: 'row' }), el('td', student.yearLevel));
        for (const [field, label] of definitions) {
          const row = record(student);
          const td = el('td');
          const confirmed = showConfirmation(td, row, field);
          if (group.audit) {
            td.textContent = row?.[field] || 'Not entered';
            if (confirmed) td.setAttribute('aria-label', td.textContent + ' (confirmed against KAMAR PDF)');
            tr.append(td);
            continue;
          }
          const controlLabel = student.name + ': ' + label;
          const control = el(field === 'comment' ? 'textarea' : 'select', '',
            { 'aria-label': controlLabel + (confirmed ? ' (confirmed against KAMAR PDF)' : '') });
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
      feedback.setAttribute('role', 'status');
      feedback.textContent = 'Loading Term ' + selectedTerm + ' school classes...';
      try {
        const result = await request('attendance/classes/' + year + '?term=' + selectedTerm + '&view=junior-audit');
        if (!area.isConnected || currentLoad !== loadNumber) return;
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
    termSelect.addEventListener('change', () => { state.classCode = ''; invalidate(); void loadClasses(); });
    void loadClasses();
  }
  globalThis.plannerReporting = { mount };
})();
