function setDefaultUploadMeta() {
  const now = new Date();
  const yearEl = document.getElementById('uploadYear');
  const termEl = document.getElementById('uploadTerm');
  const dateEl = document.getElementById('uploadDate');

  if (yearEl) yearEl.value = String(now.getFullYear());
  if (termEl) {
    const month = now.getMonth() + 1;
    if (month <= 4) termEl.value = 'Term 1';
    else if (month <= 7) termEl.value = 'Term 2';
    else if (month <= 9) termEl.value = 'Term 3';
    else termEl.value = 'Term 4';
  }
  if (dateEl) {
    const yyyy = String(now.getFullYear());
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    dateEl.value = `${yyyy}-${mm}-${dd}`;
  }
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

function normalizeHeader(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function csvHasAnyAlias(headers, aliases) {
  const normalizedHeaders = (headers || []).map(normalizeHeader);
  return aliases.some(alias => normalizedHeaders.includes(normalizeHeader(alias)));
}

function looksLikeHeaderlessStudentListRow(row) {
  if (!Array.isArray(row) || row.length < 7) return false;
  const studentId = String(row[0] || '').trim();
  const lastName = String(row[1] || '').trim();
  const firstName = String(row[2] || '').trim();
  if (!studentId || !lastName || !firstName) return false;
  if (/student|id|last|first|gender|level|tutor|email/i.test(`${studentId} ${lastName} ${firstName}`)) return false;
  return /^\d+$/.test(studentId);
}

function prepareStudentListCsv(rows) {
  const firstRow = Array.isArray(rows) && rows.length > 0 ? rows[0] : [];
  const hasHeaderRow = !looksLikeHeaderlessStudentListRow(firstRow);

  if (hasHeaderRow) {
    const headers = firstRow;
    const data = rows.slice(1).filter(rowArr => rowArr.length >= 7 && rowArr.join() !== headers.join());
    return { headers, data, inferredHeaders: false };
  }

  const headers = ['Student ID', 'Last Name', 'First Name', 'Gender', 'Level', 'Tutor', 'Timetable Class', 'Student email - School'];
  const data = rows.filter(rowArr => Array.isArray(rowArr) && rowArr.length >= 7);
  return { headers, data, inferredHeaders: true };
}

function validateRequiredCsvHeaders(headers) {
  const required = [
    { label: 'Student ID', aliases: ['student_id', 'student id', 'id_number', 'id number'] },
    { label: 'Last Name', aliases: ['last_name', 'last name', 'surname', 'family_name'] },
    { label: 'First Name', aliases: ['first_name', 'first name', 'given_name', 'forename'] },
    { label: 'Gender', aliases: ['gender', 'sex'] },
    { label: 'Level', aliases: ['level', 'year_level', 'year level', 'year'] },
    { label: 'Tutor', aliases: ['tutor', 'form_class', 'form class', 'form'] },
    { label: 'Timetable Class', aliases: ['timetable_class', 'timetable class', 'tt_class'] },
    { label: 'Student email - School', aliases: ['student_email_school', 'student email school', 'studentemail', 'email_school', 'email school', 'email'] }
  ];

  const missing = required
    .filter(field => !csvHasAnyAlias(headers, field.aliases))
    .map(field => field.label);

  return {
    ok: missing.length === 0,
    missing
  };
}

function escHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function renderStudentDetailsTable(rows) {
  const container = document.getElementById('studentDetailsTableContainer');
  if (!container) return;

  let html = '<h2>Student Upload Table</h2>';
  html += '<table class="styled-table"><thead><tr>';
  html += '<th>ID</th><th>Student ID</th><th>Last Name</th><th>First Name</th><th>Gender</th><th>Level</th><th>Tutor</th><th>Timetable Class</th><th>Student Email</th><th>Status</th><th>UploadYear</th><th>UploadTerm</th><th>UploadDate</th>';
  html += '</tr></thead><tbody>';

  rows.forEach(row => {
    html += `<tr>
      <td>${escHtml(row.id)}</td>
      <td>${escHtml(row.id_number)}</td>
      <td>${escHtml(row.last_name)}</td>
      <td>${escHtml(row.first_name)}</td>
      <td>${escHtml(row.gender)}</td>
      <td>${escHtml(row.year_level)}</td>
      <td>${escHtml(row.tutor)}</td>
      <td>${escHtml(row.timetable_class)}</td>
      <td>${escHtml(row.email_school)}</td>
      <td>${escHtml(row.status || 'Current')}</td>
      <td>${escHtml(row.upload_year)}</td>
      <td>${escHtml(row.upload_term)}</td>
      <td>${escHtml(row.upload_date)}</td>
    </tr>`;
  });

  html += '</tbody></table>';
  container.innerHTML = html;
}

function fetchAndRenderStudentDetailsTable() {
  fetch('/api/student_details_upload/all')
    .then(res => res.json())
    .then(result => {
      if (result && Array.isArray(result.students)) {
        renderStudentDetailsTable(result.students);
      }
    })
    .catch(() => {
      const container = document.getElementById('studentDetailsTableContainer');
      if (container) container.innerHTML = '<div class="error">Failed to load student upload data.</div>';
    });
}

function uploadStudentDetailsWithProgress(payload, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/student_details_upload');
    xhr.setRequestHeader('Content-Type', 'application/json');

    xhr.upload.onprogress = (evt) => {
      if (evt.lengthComputable && onProgress) {
        onProgress((evt.loaded / evt.total) * 100);
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

window.addEventListener('DOMContentLoaded', () => {
  setDefaultUploadMeta();
  fetchAndRenderStudentDetailsTable();
});

document.getElementById('uploadForm').addEventListener('submit', function(e) {
  e.preventDefault();
  const fileInput = document.getElementById('csvFile');
  const file = fileInput.files[0];
  if (!file) return;

  const submitBtn = document.getElementById('uploadSubmitBtn');
  if (submitBtn) submitBtn.disabled = true;

  const uploadYear = Number(document.getElementById('uploadYear') && document.getElementById('uploadYear').value);
  const uploadTerm = String((document.getElementById('uploadTerm') && document.getElementById('uploadTerm').value) || '').trim();
  const uploadDate = String((document.getElementById('uploadDate') && document.getElementById('uploadDate').value) || '').trim();

  if (!Number.isInteger(uploadYear) || uploadYear < 2000 || uploadYear > 2100) {
    document.getElementById('uploadResult').textContent = 'Please enter a valid Upload Year.';
    if (submitBtn) submitBtn.disabled = false;
    return;
  }
  if (!uploadTerm) {
    document.getElementById('uploadResult').textContent = 'Please select Upload Term.';
    if (submitBtn) submitBtn.disabled = false;
    return;
  }
  if (!uploadDate) {
    document.getElementById('uploadResult').textContent = 'Please select Upload Date.';
    if (submitBtn) submitBtn.disabled = false;
    return;
  }

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
      if (submitBtn) submitBtn.disabled = false;
      return;
    }

    const prepared = prepareStudentListCsv(rows);
    const headers = prepared.headers;

    if (!prepared.inferredHeaders) {
      const headerValidation = validateRequiredCsvHeaders(headers);
      if (!headerValidation.ok) {
        document.getElementById('uploadResult').textContent =
          'CSV is missing required fields: ' + headerValidation.missing.join(', ') +
          '. Please export again from Kamar with the Student List fields.';
        hideUploadProgress();
        if (submitBtn) submitBtn.disabled = false;
        return;
      }
    }

    const data = prepared.data;
    if (data.length === 0) {
      document.getElementById('uploadResult').textContent = 'CSV file is empty or invalid.';
      hideUploadProgress();
      if (submitBtn) submitBtn.disabled = false;
      return;
    }

    setUploadProgress(`Uploading ${data.length} rows...`, 45);

    uploadStudentDetailsWithProgress(
      { headers, students: data, uploadYear, uploadTerm, uploadDate },
      (pct) => setUploadProgress(`Uploading ${data.length} rows...`, 45 + (pct * 0.5))
    )
      .then(result => {
        setUploadProgress('Finalizing...', 100);
        if (result.success) {
          fetchAndRenderStudentDetailsTable();
          document.getElementById('uploadResult').textContent =
            'Sync complete. Processed: ' + (result.processed || 0) +
            ', Inserted: ' + (result.inserted || 0) +
            ', Updated: ' + (result.updated || 0) +
            ', Marked Not Current: ' + (result.marked_not_current || 0) +
            ', Skipped (no Student ID): ' + (result.skipped_no_id_number || 0) +
            ', Duplicate Student IDs in upload: ' + (result.duplicate_id_numbers_in_upload || 0) +
            ', UploadYear: ' + (result.upload_year || '') +
            ', UploadTerm: ' + (result.upload_term || '') +
            ', UploadDate: ' + (result.upload_date || '');
        } else {
          document.getElementById('uploadResult').textContent = 'Import failed: ' + (result.error || 'Unknown error');
        }
        setTimeout(hideUploadProgress, 800);
      })
      .catch(err => {
        document.getElementById('uploadResult').textContent = 'Import failed: ' + err;
        hideUploadProgress();
      })
      .finally(() => {
        if (submitBtn) submitBtn.disabled = false;
      });
  };

  reader.onerror = function() {
    document.getElementById('uploadResult').textContent = 'Import failed: could not read file.';
    hideUploadProgress();
    if (submitBtn) submitBtn.disabled = false;
  };

  reader.readAsText(file);
});
