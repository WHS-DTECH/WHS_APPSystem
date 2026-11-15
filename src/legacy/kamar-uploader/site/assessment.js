(() => {
  'use strict';
  const $ = id => document.getElementById('assessment-' + id);
  const api = '/api/kamar-assessment';
  const base = '/admin/kamar-uploader/ocr';
  const fields = ['year', 'date', 'class', 'number', 'code', 'title', 'version', 'credits', 'level'];
  const status = $('status'), canvas = $('canvas'), context = canvas.getContext('2d');
  const state = { csrf: '', students: [], rows: [], image: null, imageHash: '', sourceName: '', supersedesId: null,
    selection: null, busy: false, historical: false };
  $('year').value = $('history-year').value =
    new Intl.DateTimeFormat('en-NZ', { year: 'numeric', timeZone: 'Pacific/Auckland' }).format(new Date());

  function show(message, error = false) {
    status.textContent = message;
    status.setAttribute('role', error ? 'alert' : 'status');
  }
  function showSave(message, error = false) {
    $('save-status').textContent = message;
    $('save-status').setAttribute('role', error ? 'alert' : 'status');
  }
  async function request(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (options.method && options.method !== 'GET') headers['x-kamar-assessment-csrf'] = state.csrf;
    const response = await fetch(api + path, { ...options, headers, cache: 'no-store' });
    if (!response.headers.get('content-type')?.includes('application/json')) {
      throw new Error('The server returned an unexpected response. Check your sign-in and retry.');
    }
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'KAMAR assessment request failed.');
    return result;
  }
  function newRow(name = '') {
    return { visibleName: name, studentId: '', yearLevel: '', tutor: '', course: '',
      status: 'unknown', result: '', derivedGrade: '', entered: null, published: null, notify: null,
      reviewed: false, matchConfirmed: false };
  }
  function option(select, value, label) {
    const item = document.createElement('option');
    item.value = value; item.textContent = label; select.append(item);
  }
  function control(label, controlNode, parent) {
    const wrapper = document.createElement('label');
    const caption = document.createElement('span');
    caption.textContent = label; wrapper.append(caption, controlNode); parent.append(wrapper);
    return controlNode;
  }
  function textInput(row, key, label, max, parent) {
    const input = document.createElement('input');
    input.type = 'text'; input.maxLength = max; input.value = row[key];
    control(label, input, parent);
    input.addEventListener('input', () => {
      row[key] = input.value;
      if (key === 'visibleName') {
        row.studentId = '';
        const select = input.closest('.assessment-student').querySelector('[data-student-id]');
        select.value = row.studentId;
      }
    });
    return input;
  }
  function selectInput(row, key, label, options, parent, preserveUnknown = false) {
    const select = document.createElement('select');
    for (const [value, caption] of options) option(select, value, caption);
    const value = row[key] === null ? '' : String(row[key]);
    if (preserveUnknown && value && !options.some(([choice]) => choice === value)) {
      option(select, value, 'Previously recorded: ' + value);
    }
    select.value = value;
    control(label, select, parent);
    select.addEventListener('change', () => {
      row[key] = key === 'entered' || key === 'published' || key === 'notify'
        ? select.value === '' ? null : select.value === 'true' : select.value;
    });
    return select;
  }
  function renderRows() {
    const container = $('rows');
    container.replaceChildren();
    state.rows.forEach((row, index) => {
      const card = document.createElement('article');
      card.className = 'assessment-student';
      const heading = document.createElement('div'); heading.className = 'assessment-student-head';
      const title = document.createElement('h3'); title.textContent = 'Student ' + (index + 1);
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Remove row';
      remove.addEventListener('click', () => {
        state.rows.splice(index, 1); $('reviewed').checked = false; renderRows();
      });
      heading.append(title, remove); card.append(heading);
      const grid = document.createElement('div'); grid.className = 'assessment-student-grid';
      textInput(row, 'visibleName', 'Name as shown', 200, grid);
      const studentSelect = document.createElement('select');
      studentSelect.dataset.studentId = 'true';
      option(studentSelect, '', 'Unmatched — do not link an ID');
      for (const student of state.students) {
        option(studentSelect, student.id_number, [student.last_name, student.first_name].filter(Boolean).join(', ') +
          ' — ' + student.id_number + (student.status === 'Current' ? '' : ' (not current)'));
      }
      studentSelect.value = row.studentId;
      if (row.studentId && studentSelect.value !== row.studentId) {
        option(studentSelect, row.studentId, 'Previously linked ID is not in the current Student List: ' + row.studentId);
        studentSelect.value = row.studentId;
      }
      control('Student List match — review before confirming', studentSelect, grid);
      studentSelect.addEventListener('change', () => { row.studentId = studentSelect.value; });
      textInput(row, 'yearLevel', 'Year level shown', 30, grid);
      textInput(row, 'tutor', 'Tutor shown', 120, grid);
      textInput(row, 'course', 'Course shown', 120, grid);
      const flags = [['', 'Unknown / not visible'], ['true', 'Yes'], ['false', 'No']];
      selectInput(row, 'entered', 'Entered', flags, grid);
      selectInput(row, 'published', 'Published', flags, grid);
      selectInput(row, 'notify', 'Notify', flags, grid);
      selectInput(row, 'status', 'KAMAR status', [['unknown', 'Unknown / not visible'],
        ['not_entered', 'Not entered'], ['not_yet_assessed', 'Not yet assessed'],
        ['result', 'Result shown'], ['external', 'External'], ['other', 'Other']], grid);
      selectInput(row, 'result', 'Overall / official result shown', [
        ['', 'Unknown / not visible'], ['Not Achieved', 'N — Not Achieved'],
        ['Achieved', 'A — Achieved'], ['Merit', 'M — Merit'], ['Excellence', 'E — Excellence']
      ], grid, true);
      textInput(row, 'derivedGrade', 'Derived grade shown (not official)', 100, grid);
      card.append(grid);
      const confirmation = document.createElement('input'); confirmation.type = 'checkbox'; confirmation.checked = row.reviewed;
      control('I checked this row and, if selected, the student ID match.', confirmation, card);
      confirmation.addEventListener('change', () => {
        row.reviewed = confirmation.checked;
        row.matchConfirmed = Boolean(row.studentId && row.reviewed);
        $('reviewed').checked = false;
      });
      card.addEventListener('input', event => {
        if (event.target === confirmation) return;
        row.reviewed = false; row.matchConfirmed = false; confirmation.checked = false; $('reviewed').checked = false;
      });
      card.addEventListener('change', event => {
        if (event.target === confirmation) return;
        row.reviewed = false; row.matchConfirmed = false; confirmation.checked = false; $('reviewed').checked = false;
      });
      container.append(card);
    });
  }
  function draw() {
    if (!state.image) { canvas.hidden = true; return; }
    canvas.hidden = false;
    canvas.width = state.image.naturalWidth;
    canvas.height = state.image.naturalHeight;
    context.drawImage(state.image, 0, 0);
    if (state.selection) {
      const { x, y, w, h } = state.selection;
      context.lineWidth = Math.max(2, canvas.width / 500);
      context.strokeStyle = '#e11d48'; context.strokeRect(x, y, w, h);
    }
  }
  function pointer(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: Math.max(0, Math.min(canvas.width, (event.clientX - rect.left) * canvas.width / rect.width)),
      y: Math.max(0, Math.min(canvas.height, (event.clientY - rect.top) * canvas.height / rect.height)) };
  }
  let start;
  canvas.addEventListener('pointerdown', event => {
    start = pointer(event); canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointerup', event => {
    if (!start) return;
    const end = pointer(event);
    state.selection = { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y),
      w: Math.abs(end.x - start.x), h: Math.abs(end.y - start.y) };
    start = null;
    $('read').disabled = state.selection.w < 10 || state.selection.h < 10;
    draw();
  });
  function clear(ask = true) {
    if (ask && (state.imageHash || state.rows.length) && !window.confirm('Discard this unsaved review and start a new record?')) return;
    state.rows = []; state.image = null; state.imageHash = ''; state.sourceName = ''; state.supersedesId = null;
    state.historical = false; $('save').disabled = !state.csrf;
    state.selection = null; $('read').disabled = true; $('image').value = ''; $('reviewed').checked = false;
    showSave('');
    for (const name of fields.filter(name => name !== 'year')) $(name).value = '';
    $('source').textContent = ''; draw(); renderRows();
  }
  $('clear').addEventListener('click', () => clear());
  $('add').addEventListener('click', () => { state.rows.push(newRow()); $('reviewed').checked = false; renderRows(); });
  for (const name of fields) $(name).addEventListener('input', () => { $('reviewed').checked = false; });
  $('image').addEventListener('change', async event => {
    const file = event.target.files[0];
    if (!file) return;
    if (state.imageHash && !state.supersedesId) {
      event.target.value = ''; show('Start a new snapshot before choosing another screenshot.', true); return;
    }
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) {
      event.target.value = ''; show('Choose a PNG, JPEG or WebP screenshot under 8 MB.', true); return;
    }
    try {
      const bytes = await file.arrayBuffer();
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
        .map(value => value.toString(16).padStart(2, '0')).join('');
      if (state.supersedesId && state.imageHash && state.imageHash !== hash) throw new Error('Choose the original screenshot when correcting a saved snapshot.');
      const url = URL.createObjectURL(file), image = new Image();
      try {
        await new Promise((resolve, reject) => {
          image.onload = resolve;
          image.onerror = () => reject(new Error('The screenshot image could not be decoded.'));
          image.src = url;
        });
        if (image.naturalWidth * image.naturalHeight > 30000000) throw new Error('The screenshot is too large to preview.');
        state.image = image; state.imageHash = hash; state.sourceName = file.name;
        state.selection = null; $('read').disabled = true; $('source').textContent = 'Source: ' + state.sourceName;
        $('reviewed').checked = false; draw();
      } finally { URL.revokeObjectURL(url); }
      show('Screenshot loaded locally. Draw around the student names or add rows manually.');
    } catch (error) {
      event.target.value = ''; show(error.message || 'Screenshot could not be read.', true);
    }
  });
  $('read').addEventListener('click', async () => {
    if (!state.selection || !state.image || state.busy) return;
    if (state.rows.length && !window.confirm('Add the recognised lines to the current review? Check for duplicates.')) return;
    state.busy = true; $('read').disabled = true;
    let worker;
    try {
      show('Reading the selected names locally. This may take a moment.');
      const crop = document.createElement('canvas'), { x, y, w, h } = state.selection;
      const scale = Math.min(4, 8000 / Math.max(w, h), Math.sqrt(10000000 / (w * h)));
      crop.width = Math.ceil(w * scale); crop.height = Math.ceil(h * scale);
      crop.getContext('2d').drawImage(state.image, x, y, w, h, 0, 0, crop.width, crop.height);
      worker = await Tesseract.createWorker('eng', 1, {
        workerPath: base + '/worker/worker.min.js', corePath: base + '/core',
        langPath: base + '/lang', cacheMethod: 'none', workerBlobURL: false
      });
      await worker.setParameters({ tessedit_pageseg_mode: '6' });
      const { data } = await worker.recognize(crop);
      const lines = String(data.text || '').split(/\r?\n/).map(line =>
        line.replace(/^\s*\d+\s*[.):|-]?\s*/, '').replace(/\s+/g, ' ').trim())
        .filter(line => line.length >= 3 && line.length <= 200 && /[a-z]/i.test(line));
      if (!lines.length) throw new Error('No names could be read. Draw a tighter selection or add rows manually.');
      if (state.rows.length + lines.length > 200) throw new Error('A screenshot can contain at most 200 reviewed rows.');
      state.rows.push(...lines.map(newRow)); $('reviewed').checked = false; renderRows();
      show('Added ' + lines.length + ' suggested lines. Check the names and any entered details before saving.');
    } catch (error) {
      console.error('KAMAR screenshot recognition failed.');
      show(error.message || 'Name recognition failed. Add rows manually.', true);
    } finally {
      if (worker) await worker.terminate();
      state.busy = false; $('read').disabled = !state.selection;
    }
  });
  $('save').addEventListener('click', async () => {
    if (state.busy) { showSave('Please wait for the current operation to finish.', true); return; }
    if (state.historical) { showSave('Open the latest version to make a correction.', true); return; }
    const payload = {
      year: $('year').value ? Number($('year').value) : null, observedOn: $('date').value || null,
      sourceName: state.sourceName || null, imageHash: state.imageHash || null,
      supersedesId: state.supersedesId, reviewed: $('reviewed').checked,
      assessment: { className: $('class').value.trim(), standardNumber: $('number').value.trim(),
        code: $('code').value.trim(), title: $('title').value.trim(), version: $('version').value.trim(),
        credits: $('credits').value.trim(), level: $('level').value.trim() },
      rows: state.rows.map(row => ({ ...row, visibleName: row.visibleName.trim(), studentId: row.studentId.trim(),
        yearLevel: row.yearLevel.trim(), tutor: row.tutor.trim(), course: row.course.trim(),
        result: row.result.trim(), derivedGrade: row.derivedGrade.trim() }))
    };
    if (!payload.rows.length) { showSave('Add at least one student before saving.', true); return; }
    const missingName = payload.rows.findIndex(row => !row.visibleName);
    if (missingName !== -1) { showSave('Enter a name for Student ' + (missingName + 1) + '.', true); return; }
    const unchecked = payload.rows.findIndex(row => !row.reviewed);
    if (unchecked !== -1) {
      showSave('Check the confirmation box on Student ' + (unchecked + 1) + ', then tick the final confirmation below.', true);
      return;
    }
    if (!payload.reviewed) { showSave('Tick the final confirmation box before saving.', true); return; }
    state.busy = true; $('save').disabled = true;
    showSave('Saving snapshot...');
    try {
      await request('/snapshots', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (payload.year !== null) $('history-year').value = String(payload.year);
      clear(false);
      showSave('Reviewed snapshot saved. KAMAR and existing student records were not changed.');
      try { await loadHistory(); }
      catch { showSave('Snapshot saved, but the history list could not be refreshed. Reload it to view the saved snapshot.', true); }
    } catch (error) { showSave('Snapshot not saved. ' + (error.message || 'Check your connection and retry.'), true); }
    finally { state.busy = false; $('save').disabled = !state.csrf || state.historical; }
  });
  async function openSnapshot(id) {
    if ((state.imageHash || state.rows.length) && !window.confirm('Discard the current unsaved review and open this snapshot?')) return;
    const { snapshot } = await request('/snapshots/' + encodeURIComponent(id));
    clear(false);
    const a = snapshot.data.assessment;
    $('year').value = snapshot.school_year ?? ''; $('date').value = snapshot.observed_on ?? '';
    $('class').value = a.className; $('number').value = a.standardNumber; $('code').value = a.code;
    $('title').value = a.title; $('version').value = a.version; $('credits').value = a.credits; $('level').value = a.level;
    state.sourceName = snapshot.source_name || ''; state.imageHash = snapshot.image_hash || ''; state.supersedesId = snapshot.id;
    state.historical = !snapshot.is_current; $('save').disabled = state.historical;
    if (state.historical) showSave('This earlier version is read-only. Open the latest version to make a correction.');
    state.rows = snapshot.data.rows.map(row => ({ ...row, reviewed: false, matchConfirmed: false }));
    $('source').textContent = state.sourceName
      ? 'Correcting saved source: ' + state.sourceName + '. Reselect the original screenshot to view it.'
      : 'No screenshot was recorded. You can add one when completing this record.';
    renderRows(); show(state.historical ? 'This is an earlier version. Open the latest version to make a correction.' :
      'Review every field again. Saving creates a new version and keeps the original.');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  async function loadHistory() {
    const year = $('history-year').value;
    if (!/^\d{4}$/.test(year)) throw new Error('Choose a valid school year.');
    const { snapshots } = await request('/snapshots?year=' + encodeURIComponent(year));
    const container = $('history'); container.replaceChildren();
    if (!snapshots.length) { container.textContent = 'No saved snapshots for this year.'; return; }
    for (const snapshot of snapshots) {
      const row = document.createElement('div'); row.className = 'assessment-history-item';
      const details = document.createElement('span');
      details.textContent = (snapshot.observed_on || 'Date not recorded') + ' — ' +
        (snapshot.assessment.className || 'Class not recorded') + ' — ' +
        (snapshot.assessment.standardNumber || snapshot.assessment.code || 'Standard not recorded') + ' — ' + snapshot.row_count +
        ' students — ' + (snapshot.is_current ? 'Latest version' : 'Earlier version');
      const button = document.createElement('button'); button.type = 'button';
      button.textContent = snapshot.is_current ? 'Review or correct' : 'View earlier version';
      button.addEventListener('click', () => { openSnapshot(snapshot.id).catch(error => show(error.message, true)); });
      row.append(details, button); container.append(row);
    }
  }
  $('load').addEventListener('click', () => { loadHistory().catch(error => show(error.message, true)); });
  request('/session').then(async session => {
    if (typeof session.csrf !== 'string') throw new Error('Assessment review session is invalid.');
    state.csrf = session.csrf;
    $('save').disabled = false;
    try {
      const result = await request('/students');
      if (!Array.isArray(result.students)) throw new Error('Assessment Student List data is invalid.');
      state.students = result.students;
      show('Add student names now. You can match them and add assessment details later.');
    } catch (error) {
      console.error('KAMAR Student List is unavailable for assessment matching.');
      show('Student List unavailable. Names can still be saved unmatched; reload to match them later.', true);
    }
    renderRows();
  }).catch(error => {
    $('save').disabled = true;
    show(error.message, true);
    showSave('Saving is unavailable. ' + error.message, true);
  });
})();
