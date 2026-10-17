const DISPLAY_COLUMNS = [
  { key: 'id', label: 'ID' },
  { key: 'student_name', label: 'Student Name' },
  { key: 'id_number', label: 'ID Number' },
  { key: 'form_class', label: 'Form Class' },
  { key: 'year_level', label: 'Year Level' },
  { key: 'upload_year', label: 'UploadYear' },
  { key: 'upload_term', label: 'UploadTerm' },
  { key: 'upload_date', label: 'UploadDate' },
  { key: 'mon_p1_1', label: 'Mon P1' },
  { key: 'mon_p1_2', label: 'Mon P1' },
  { key: 'mon_p2', label: 'Mon P2' },
  { key: 'mon_i', label: 'Mon I' },
  { key: 'mon_p3', label: 'Mon P3' },
  { key: 'mon_p4', label: 'Mon P4' },
  { key: 'mon_l', label: 'Mon L' },
  { key: 'mon_p5', label: 'Mon P5' },
  { key: 'tue_p1_1', label: 'Tue P1' },
  { key: 'tue_p1_2', label: 'Tue P1' },
  { key: 'tue_p2', label: 'Tue P2' },
  { key: 'tue_i', label: 'Tue I' },
  { key: 'tue_p3', label: 'Tue P3' },
  { key: 'tue_p4', label: 'Tue P4' },
  { key: 'tue_l', label: 'Tue L' },
  { key: 'tue_p5', label: 'Tue P5' },
  { key: 'wed_p1_1', label: 'Wed P1' },
  { key: 'wed_p1_2', label: 'Wed P1' },
  { key: 'wed_p2', label: 'Wed P2' },
  { key: 'wed_i', label: 'Wed I' },
  { key: 'wed_p3', label: 'Wed P3' },
  { key: 'wed_p4', label: 'Wed P4' },
  { key: 'wed_l', label: 'Wed L' },
  { key: 'wed_p5', label: 'Wed P5' },
  { key: 'thu_p1_1', label: 'Thu P1' },
  { key: 'thu_p1_2', label: 'Thu P1' },
  { key: 'thu_p2', label: 'Thu P2' },
  { key: 'thu_i', label: 'Thu I' },
  { key: 'thu_p3', label: 'Thu P3' },
  { key: 'thu_p4', label: 'Thu P4' },
  { key: 'thu_l', label: 'Thu L' },
  { key: 'thu_p5', label: 'Thu P5' },
  { key: 'fri_p1_1', label: 'Fri P1' },
  { key: 'fri_p1_2', label: 'Fri P1' },
  { key: 'fri_p2', label: 'Fri P2' },
  { key: 'fri_i', label: 'Fri I' },
  { key: 'fri_p3', label: 'Fri P3' },
  { key: 'fri_p4', label: 'Fri P4' },
  { key: 'fri_l', label: 'Fri L' },
  { key: 'fri_p5', label: 'Fri P5' },
  { key: 'status', label: 'Status' }
];

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

function formatDisplayDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const date = new Date(raw);
  if (isNaN(date.getTime())) return raw;
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = String(date.getFullYear());
  return `${dd}/${mm}/${yyyy}`;
}

function uploadStudentsWithProgress(payload, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/student_upload');
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

let allStudentRows = [];

const PERIOD_KEYS = DISPLAY_COLUMNS
  .filter(c => !['id','student_name','id_number','form_class','year_level','upload_year','upload_term','upload_date','status'].includes(c.key))
  .map(c => c.key);

function fetchAndRenderStudentTable() {
  fetch('/api/student_upload/all')
    .then(res => res.json())
    .then(result => {
      if (result && Array.isArray(result.students)) {
        allStudentRows = result.students;
        renderStudentTable();
      }
    })
    .catch(() => {
      const container = document.getElementById('studentTableContainer');
      if (container) container.innerHTML = '<div class="error">Failed to load student timetable data.</div>';
    });
}

function renderStudentTable() {
  const container = document.getElementById('studentTableContainer');
  if (!container) return;

  const filterEl = document.getElementById('studentClassFilter');
  const filter = filterEl ? filterEl.value.trim().toLowerCase() : '';

  const filteredRows = filter
    ? allStudentRows.filter(row => {
        const name = String(row.student_name || '').toLowerCase();
        const form = String(row.form_class || '').toLowerCase();
        if (name.includes(filter) || form.includes(filter)) return true;
        return PERIOD_KEYS.some(k => String(row[k] || '').toLowerCase().includes(filter));
      })
    : allStudentRows;

  let html = '<h2>Student Timetable Table</h2>';
  html += `<div style="font-size:0.9rem;color:#475569;margin-bottom:0.5rem;">Showing ${filteredRows.length} of ${allStudentRows.length} students</div>`;
  html += '<div style="overflow-x:auto;">';
  html += '<table class="styled-table"><thead><tr>';
  DISPLAY_COLUMNS.forEach(col => {
    html += `<th>${col.label}</th>`;
  });
  html += '</tr></thead><tbody>';

  filteredRows.forEach(row => {
    html += '<tr>';
    DISPLAY_COLUMNS.forEach(col => {
      const cellValue = col.key === 'upload_date' ? formatDisplayDate(row[col.key]) : (row[col.key] || '');
      html += `<td>${cellValue}</td>`;
    });
    html += '</tr>';
  });

  html += '</tbody></table></div>';

  // Only replace the table area — keep the filter bar intact
  let tableArea = document.getElementById('studentTableArea');
  if (!tableArea) {
    tableArea = document.createElement('div');
    tableArea.id = 'studentTableArea';
    container.appendChild(tableArea);
  }
  tableArea.innerHTML = html;
}

window.addEventListener('DOMContentLoaded', fetchAndRenderStudentTable);
window.addEventListener('DOMContentLoaded', function () {
  const container = document.getElementById('studentTableContainer');
  if (!container) return;

  const filterBar = document.createElement('div');
  filterBar.style.cssText = 'display:flex;align-items:center;gap:0.6rem;flex-wrap:wrap;margin-bottom:0.75rem;';
  filterBar.innerHTML = `
    <label for="studentClassFilter" style="font-weight:700;color:#1f2937;">Find by class or student:</label>
    <input id="studentClassFilter" type="text" placeholder="e.g. MI-WHANAU-MR or Adams"
      style="min-width:280px;padding:0.4rem 0.55rem;border:1px solid #cbd5e1;border-radius:8px;" />
    <button id="studentClassFilterClear" type="button"
      style="padding:0.4rem 0.7rem;border:1px solid #94a3b8;border-radius:8px;background:#fff;cursor:pointer;">Clear</button>
  `;
  container.insertBefore(filterBar, container.firstChild);

  document.getElementById('studentClassFilter').addEventListener('input', renderStudentTable);
  document.getElementById('studentClassFilterClear').addEventListener('click', function () {
    document.getElementById('studentClassFilter').value = '';
    renderStudentTable();
  });
});

document.getElementById('uploadForm').addEventListener('submit', function(e) {
  e.preventDefault();
  const fileInput = document.getElementById('csvFile');
  const file = fileInput.files[0];
  const uploadYear = Number(document.getElementById('uploadYear') && document.getElementById('uploadYear').value);
  const uploadTerm = String((document.getElementById('uploadTerm') && document.getElementById('uploadTerm').value) || '').trim();
  const uploadDate = String((document.getElementById('uploadDate') && document.getElementById('uploadDate').value) || '').trim();
  if (!file) return;
  if (!Number.isInteger(uploadYear) || uploadYear < 2000 || uploadYear > 2100) {
    document.getElementById('uploadResult').textContent = 'Please enter a valid Upload Year.';
    return;
  }
  if (!uploadTerm) {
    document.getElementById('uploadResult').textContent = 'Please select an Upload Term.';
    return;
  }
  if (!uploadDate) {
    document.getElementById('uploadResult').textContent = 'Please select an Upload Date.';
    return;
  }

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
    const parsed = Papa.parse(text, { skipEmptyLines: true });
    const rows = parsed.data;
    if (!rows || rows.length < 2) {
      document.getElementById('uploadResult').textContent = 'CSV file is empty or invalid.';
      hideUploadProgress();
      return;
    }

    const headers = rows[0];
    const data = rows.slice(1).filter(rowArr => rowArr.length > 0 && rowArr.join() !== headers.join());
    setUploadProgress(`Uploading ${data.length} rows...`, 45);

    uploadStudentsWithProgress(
      { headers, students: data, uploadYear, uploadTerm, uploadDate },
      (pct) => setUploadProgress(`Uploading ${data.length} rows...`, 45 + (pct * 0.5))
    )
      .then(result => {
        setUploadProgress('Finalizing...', 100);
        if (result.success && data.length > 0) {
          fetchAndRenderStudentTable();
          document.getElementById('uploadResult').textContent =
            'Sync complete. Processed: ' + (result.processed || 0) +
            ', Inserted: ' + (result.inserted || 0) +
            ', Updated: ' + (result.updated || 0) +
            ', Marked Not Current: ' + (result.marked_not_current || 0) +
            ', UploadYear: ' + (result.upload_year || '') +
            ', UploadTerm: ' + (result.upload_term || '') +
            ', UploadDate: ' + formatDisplayDate(result.upload_date || '') +
            ', Skipped (no ID Number): ' + (result.skipped_no_id_number || 0) +
            ', Duplicate ID Numbers in upload: ' + (result.duplicate_id_numbers_in_upload || 0);
        } else if (data.length === 0) {
          document.getElementById('uploadResult').textContent = 'No valid student timetable rows found in CSV.';
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
