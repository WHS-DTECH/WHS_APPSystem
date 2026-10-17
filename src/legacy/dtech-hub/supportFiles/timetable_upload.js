// Fetch and render the latest timetable from the database
let timetableHeaders = [];
let timetableRows = [];
let teacherFilterTerm = '';
let timetableEditMode = false;

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatTimetableCell(value) {
  // Kamar exports often use semicolons as separators; show each segment on a new line.
  return escapeHtml(value).replace(/;\s*/g, '<br>');
}

function sortRowsByTeacherName(rows) {
  return rows.slice().sort((a, b) => {
    const aName = String(a?.Teacher_Name || a?.teacher_name || '').trim().toLowerCase();
    const bName = String(b?.Teacher_Name || b?.teacher_name || '').trim().toLowerCase();
    return aName.localeCompare(bName);
  });
}

function getTeacherKey(row) {
  return String(row?.Teacher || row?.teacher || '').trim();
}

function findRowByTeacher(teacherKey) {
  return timetableRows.find(r => getTeacherKey(r).toLowerCase() === String(teacherKey || '').trim().toLowerCase());
}

function saveTeacherRow(teacherKey) {
  const row = findRowByTeacher(teacherKey);
  if (!row) {
    return Promise.reject(new Error('Teacher row not found in table state.'));
  }

  return fetch(`/api/upload_timetable/row/${encodeURIComponent(teacherKey)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ row })
  })
    .then(async (res) => {
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload.success) {
        throw new Error(payload.error || 'Failed to save row.');
      }
      return payload.row;
    });
}

function fetchAndRenderTimetableTable() {
  fetch('/api/timetable/all')
    .then(res => res.json())
    .then(result => {
      if (result && Array.isArray(result.timetable) && result.timetable.length > 0) {
        timetableHeaders = Object.keys(result.timetable[0]);
        timetableRows = sortRowsByTeacherName(result.timetable);
        renderTimetableTable();
      }
    });
}

function ensureUploadProgressUi() {
  let wrap = document.getElementById('uploadProgressWrap');
  if (wrap) return wrap;

  const uploadResult = document.getElementById('uploadResult');
  if (!uploadResult || !uploadResult.parentNode) return null;

  wrap = document.createElement('div');
  wrap.id = 'uploadProgressWrap';
  wrap.style.marginTop = '0.75rem';
  wrap.style.display = 'none';

  const label = document.createElement('div');
  label.id = 'uploadProgressLabel';
  label.style.fontSize = '0.9rem';
  label.style.marginBottom = '0.25rem';
  label.textContent = 'Preparing upload...';

  const progress = document.createElement('progress');
  progress.id = 'uploadProgressBar';
  progress.max = 100;
  progress.value = 0;
  progress.style.width = '100%';
  progress.style.height = '16px';

  wrap.appendChild(label);
  wrap.appendChild(progress);
  uploadResult.parentNode.insertBefore(wrap, uploadResult.nextSibling);
  return wrap;
}

function setUploadProgress(stepLabel, pct) {
  const wrap = ensureUploadProgressUi();
  if (!wrap) return;
  const label = document.getElementById('uploadProgressLabel');
  const bar = document.getElementById('uploadProgressBar');
  wrap.style.display = 'block';
  if (label) label.textContent = `${stepLabel} ${Math.max(0, Math.min(100, Math.round(pct)))}%`;
  if (bar) bar.value = Math.max(0, Math.min(100, pct));
}

function hideUploadProgress() {
  const wrap = document.getElementById('uploadProgressWrap');
  if (wrap) wrap.style.display = 'none';
}

function uploadTimetableWithProgress(payload, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload_timetable');
    xhr.setRequestHeader('Content-Type', 'application/json');

    xhr.upload.onprogress = (evt) => {
      if (evt.lengthComputable && onProgress) {
        const pct = (evt.loaded / evt.total) * 100;
        onProgress(pct);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch (err) {
          reject(new Error('Invalid JSON response from server'));
        }
      } else {
        let errMsg = `Upload failed with status ${xhr.status}`;
        try {
          const parsed = JSON.parse(xhr.responseText);
          if (parsed && parsed.error) errMsg = parsed.error;
        } catch (_) {}
        reject(new Error(errMsg));
      }
    };

    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(JSON.stringify(payload));
  });
}

// Render timetable table on page load
window.addEventListener('DOMContentLoaded', fetchAndRenderTimetableTable);
// Timetable CSV Upload & Preview

document.getElementById('uploadForm').addEventListener('submit', function(e) {
  e.preventDefault();
  const fileInput = document.getElementById('csvFile');
  const file = fileInput.files[0];
  if (!file) return;
  const uploadResult = document.getElementById('uploadResult');
  if (uploadResult) uploadResult.textContent = '';
  setUploadProgress('Reading file...', 0);

  const reader = new FileReader();
  reader.onprogress = function(evt) {
    if (!evt.lengthComputable) return;
    setUploadProgress('Reading file...', (evt.loaded / evt.total) * 40);
  };

  reader.onload = function(evt) {
    const text = evt.target.result;
    // Use PapaParse for robust CSV parsing
    const parsed = Papa.parse(text, { skipEmptyLines: true });
    const rows = parsed.data;
    if (!rows || rows.length < 2) {
      document.getElementById('uploadResult').textContent = 'CSV file is empty or invalid.';
      hideUploadProgress();
      return;
    }
    const headers = rows[0];
    const data = rows.slice(1).filter(rowArr => rowArr.length === headers.length && rowArr.join() !== headers.join());
    setUploadProgress(`Uploading ${data.length} rows...`, 45);

    uploadTimetableWithProgress(
      { timetable: data, headers },
      (pct) => setUploadProgress(`Uploading ${data.length} rows...`, 45 + (pct * 0.5))
    )
    .then(result => {
      setUploadProgress('Finalizing...', 100);
      if (result.success && data.length > 0) {
        fetchAndRenderTimetableTable();
        document.getElementById('uploadResult').textContent =
          'Sync complete. Processed: ' + (result.processed || 0) +
          ', Inserted: ' + (result.inserted || 0) +
          ', Updated: ' + (result.updated || 0) +
          ', Marked Not Current: ' + (result.marked_not_current || 0) +
          ', Skipped (no Teacher): ' + (result.skipped_no_teacher || 0) +
          ', Duplicate Teachers in upload: ' + (result.duplicate_teachers_in_upload || 0);
      } else if (data.length === 0) {
        document.getElementById('uploadResult').textContent = 'No valid timetable data found in CSV.';
      } else {
        document.getElementById('uploadResult').textContent = 'Import failed: ' + (result.error || 'Unknown error');
      }
      setTimeout(hideUploadProgress, 800);
    })
    .catch(err => {
      document.getElementById('uploadResult').textContent = 'Import failed: ' + err;
      hideUploadProgress();
    });
  };

  reader.onerror = function() {
    document.getElementById('uploadResult').textContent = 'Import failed: could not read file.';
    hideUploadProgress();
  };

  reader.readAsText(file);
});

function renderTimetableTable() {
  const container = document.getElementById('timetableTableContainer');
  if (!container || !Array.isArray(timetableHeaders) || timetableHeaders.length === 0) return;

  const filter = teacherFilterTerm.trim().toLowerCase();
  const filteredRows = timetableRows.filter(row => {
    if (!filter) return true;
    const teacherName = String(row?.Teacher_Name || row?.teacher_name || '').toLowerCase();
    const teacherCode = String(row?.Teacher || row?.teacher || '').toLowerCase();
    return teacherName.includes(filter) || teacherCode.includes(filter);
  });

  let html = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap;margin-bottom:0.75rem;">
      <div style="display:flex;align-items:center;gap:0.6rem;">
        <label for="teacherNameFilter" style="font-weight:700;color:#1f2937;">Find teacher:</label>
        <input
          id="teacherNameFilter"
          type="text"
          value="${escapeHtml(teacherFilterTerm)}"
          placeholder="Type a name e.g. maryke"
          style="min-width:260px;padding:0.4rem 0.55rem;border:1px solid #cbd5e1;border-radius:8px;"
        />
        <button
          id="toggleTimetableEditMode"
          type="button"
          style="padding:0.4rem 0.7rem;border:1px solid #94a3b8;border-radius:8px;background:${timetableEditMode ? '#dbeafe' : '#ffffff'};cursor:pointer;font-weight:600;"
        >${timetableEditMode ? 'Editing enabled' : 'Enable editing'}</button>
      </div>
      <div style="font-size:0.9rem;color:#475569;">
        Showing ${filteredRows.length} of ${timetableRows.length} teachers (sorted A-Z by Teacher_Name)
      </div>
    </div>
    <div style="font-size:0.82rem;color:#64748b;margin-bottom:0.6rem;">
      ${timetableEditMode ? 'Edit mode is ON: click a cell to edit, then click Save row.' : 'Edit mode is OFF.'}
    </div>
  `;

  html += '<table class="styled-table"><thead><tr>';
  html += '<th>Actions</th>';
  timetableHeaders.forEach(h => { html += `<th>${escapeHtml(h)}</th>`; });
  html += '</tr></thead><tbody>';
  filteredRows.forEach(row => {
    const teacherKey = getTeacherKey(row);
    html += '<tr>';
    html += `<td><button type="button" class="save-teacher-row" data-teacher="${escapeHtml(teacherKey)}" style="padding:0.3rem 0.55rem;border:1px solid #94a3b8;border-radius:6px;background:#fff;cursor:pointer;">Save row</button></td>`;
    html += timetableHeaders.map(h => {
      const isEditable = timetableEditMode && h !== 'Teacher';
      const cellStyle = isEditable
        ? 'cursor:pointer;outline:1px dashed #93c5fd;outline-offset:-3px;'
        : '';
      return `<td class="tt-edit-cell" data-teacher="${escapeHtml(teacherKey)}" data-col="${escapeHtml(h)}" style="${cellStyle}">${formatTimetableCell(row[h])}</td>`;
    }).join('');
    html += '</tr>';
  });
  html += '</tbody></table>';
  container.innerHTML = html;

  const filterInput = document.getElementById('teacherNameFilter');
  if (filterInput) {
    filterInput.addEventListener('input', (event) => {
      teacherFilterTerm = event.target.value || '';
      const caretPos = event.target.selectionStart;
      renderTimetableTable();
      const newInput = document.getElementById('teacherNameFilter');
      if (newInput) {
        newInput.focus();
        if (typeof caretPos === 'number') {
          newInput.setSelectionRange(caretPos, caretPos);
        }
      }
    });
  }

  const editToggle = document.getElementById('toggleTimetableEditMode');
  if (editToggle) {
    editToggle.addEventListener('click', () => {
      timetableEditMode = !timetableEditMode;
      renderTimetableTable();
    });
  }

  const editableCells = container.querySelectorAll('.tt-edit-cell');
  editableCells.forEach((cell) => {
    cell.addEventListener('click', () => {
      if (!timetableEditMode) return;
      const teacherKey = cell.getAttribute('data-teacher') || '';
      const col = cell.getAttribute('data-col') || '';
      if (!teacherKey || !col || col === 'Teacher') return;

      const row = findRowByTeacher(teacherKey);
      if (!row) return;

      const currentValue = (row[col] ?? '').toString();
      const nextValue = window.prompt(`Edit ${col}`, currentValue);
      if (nextValue === null) return;
      row[col] = nextValue;
      if (col === 'Teacher_Name' || col === 'teacher_name') {
        timetableRows = sortRowsByTeacherName(timetableRows);
      }
      renderTimetableTable();
    });
  });

  const saveButtons = container.querySelectorAll('.save-teacher-row');
  saveButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const teacherKey = btn.getAttribute('data-teacher') || '';
      if (!teacherKey) return;

      const originalText = btn.textContent;
      btn.textContent = 'Saving...';
      btn.disabled = true;

      saveTeacherRow(teacherKey)
        .then((updatedRow) => {
          const idx = timetableRows.findIndex(r => getTeacherKey(r).toLowerCase() === teacherKey.toLowerCase());
          if (idx >= 0) timetableRows[idx] = updatedRow;
          timetableRows = sortRowsByTeacherName(timetableRows);
          renderTimetableTable();
        })
        .catch((err) => {
          window.alert(`Could not save row for ${teacherKey}: ${err.message || err}`);
          btn.textContent = originalText;
          btn.disabled = false;
        });
    });
  });
}
