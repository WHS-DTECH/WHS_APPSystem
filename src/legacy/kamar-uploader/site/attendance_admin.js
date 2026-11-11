(() => {
  const api = '/teacher-planner/api/planner/google-calendar/attendance-admin';
  const plannerApi = '/teacher-planner/api/planner';
  const yearInput = document.getElementById('attendanceYear');
  const teacherSelect = document.getElementById('attendanceTeacher');
  const folderInput = document.getElementById('attendanceFolder');
  const enabledInput = document.getElementById('attendanceEnabled');
  const saveButton = document.getElementById('saveAttendanceSettings');
  const connectButton = document.getElementById('connectAttendanceDrive');
  const connectLink = document.getElementById('attendanceConnectLink');
  const driveStatus = document.getElementById('attendanceDriveStatus');
  const runButton = document.getElementById('runAttendanceImport');
  const status = document.getElementById('attendanceAdminStatus');
  const results = document.getElementById('attendanceAdminResultsBody');
  let csrf = '';
  let busy = false;

  function show(message, error = false) {
    status.textContent = message;
    status.setAttribute('role', error ? 'alert' : 'status');
  }
  async function request(url, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    if (options.method && options.method !== 'GET') headers['x-planner-csrf'] = csrf;
    const response = await fetch(url, { ...options, headers, cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Attendance admin request failed.');
    return payload;
  }
  function setBusy(value) {
    busy = value;
    for (const control of [yearInput, teacherSelect, folderInput, enabledInput, saveButton, connectButton, runButton]) {
      control.disabled = value;
    }
    if (!value) updateRunButton();
  }
  function updateRunButton() {
    runButton.disabled = busy || !teacherSelect.value || !enabledInput.checked || !folderInput.value.trim();
  }
  function renderDocuments(summary) {
    results.replaceChildren();
    if (summary.calendarWarning) {
      const warning = document.createElement('p');
      warning.className = 'attendance-admin-status';
      warning.setAttribute('role', 'status');
      warning.textContent = summary.calendarWarning;
      results.append(warning);
    }
    const totals = document.createElement('p');
    totals.textContent = summary.files + ' PDFs processed; ' + summary.marksFilled +
      ' blank marks filled; ' + summary.conflictsKept + ' conflicts kept; ' +
      summary.matchWarnings + ' student/class match warnings; ' + summary.unchanged +
      ' unchanged PDFs skipped; ' + summary.errors + ' document errors.';
    results.append(totals);
    if (!summary.documents.length) return;
    const table = document.createElement('table');
    table.className = 'styled-table attendance-admin-results';
    const head = document.createElement('thead');
    const header = document.createElement('tr');
    for (const label of ['PDF', 'Result', 'Marks filled', 'Conflicts', 'Match warnings', 'Details']) {
      const cell = document.createElement('th');
      cell.scope = 'col';
      cell.textContent = label;
      header.append(cell);
    }
    head.append(header);
    const body = document.createElement('tbody');
    for (const documentResult of summary.documents) {
      const row = document.createElement('tr');
      for (const value of [documentResult.name, documentResult.status, documentResult.marks,
        documentResult.conflicts, documentResult.warnings, documentResult.error || '']) {
        const cell = document.createElement('td');
        cell.textContent = String(value);
        row.append(cell);
      }
      body.append(row);
    }
    table.append(head, body);
    results.append(table);
  }
  async function loadSettings() {
    const year = Number(yearInput.value);
    const saved = await request(api + '/settings/' + year);
    folderInput.value = saved.folderId ? 'https://drive.google.com/drive/folders/' + saved.folderId : '';
    enabledInput.checked = saved.enabled;
    driveStatus.textContent = !saved.connected ? 'Google is not connected for this admin account.' :
      saved.driveAccess ? 'Connected as ' + saved.googleEmail + ' with read-only Drive access.' :
        'Google is connected, but read-only Drive attendance access is not authorised.';
    updateRunButton();
  }
  async function loadTeachers() {
    const result = await request(api + '/teachers');
    teacherSelect.replaceChildren(new Option('Choose a teacher', ''));
    for (const teacher of result.teachers) {
      teacherSelect.add(new Option(teacher.name + ' (' + teacher.staffCode + ')', teacher.id));
    }
    if (!result.teachers.length) show('No current teachers with active school accounts were found.', true);
  }
  async function loadCsrf() {
    const result = await request(plannerApi + '/session');
    csrf = result.csrf;
    if (typeof csrf !== 'string' || csrf.length < 32) throw new Error('The Planner form session is unavailable. Reload this page.');
  }
  async function connectDrive() {
    const result = await request(plannerApi + '/google-calendar/connect', {
      method: 'POST', body: JSON.stringify({ includeAttendanceDrive: true })
    });
    connectLink.href = result.url;
    connectLink.hidden = false;
    driveStatus.textContent = 'Open the Google authorisation link, approve read-only Drive access, then return and reload this page.';
  }
  async function saveSettings() {
    await request(api + '/settings/' + Number(yearInput.value), {
      method: 'PUT', body: JSON.stringify({ folder: folderInput.value, enabled: enabledInput.checked })
    });
    await loadSettings();
    show('Admin Google Drive folder settings saved.');
  }
  async function pollJob(jobId) {
    while (true) {
      const job = await request(api + '/jobs/' + encodeURIComponent(jobId));
      show(job.progress || 'Attendance import is running.');
      if (job.status === 'complete') {
        renderDocuments(job.summary);
        show('Attendance import complete for ' + job.teacherName + ' (' + job.year + ').');
        return;
      }
      if (job.status === 'failed') throw new Error(job.error || 'Attendance import failed.');
      await new Promise(resolve => setTimeout(resolve, 1200));
    }
  }
  async function runImport() {
    results.replaceChildren();
    const started = await request(api + '/sync', {
      method: 'POST', body: JSON.stringify({ year: Number(yearInput.value), teacherId: teacherSelect.value })
    });
    await pollJob(started.jobId);
  }
  async function act(action) {
    if (busy) return;
    setBusy(true);
    try { await action(); }
    catch (error) { show(error.message, true); }
    finally { setBusy(false); }
  }
  saveButton.addEventListener('click', () => act(saveSettings));
  connectButton.addEventListener('click', () => act(connectDrive));
  runButton.addEventListener('click', () => act(runImport));
  teacherSelect.addEventListener('change', updateRunButton);
  enabledInput.addEventListener('change', updateRunButton);
  folderInput.addEventListener('input', updateRunButton);
  yearInput.addEventListener('change', () => act(loadSettings));

  yearInput.value = new Intl.DateTimeFormat('en-NZ', { timeZone: 'Pacific/Auckland', year: 'numeric' }).format(new Date());
  act(async () => {
    await loadCsrf();
    await Promise.all([loadTeachers(), loadSettings()]);
    show('Choose a teacher, check the folder settings, then start the import.');
  });
})();
