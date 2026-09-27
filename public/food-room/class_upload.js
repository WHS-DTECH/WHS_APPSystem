// Subjects CSV Upload Script (modeled after staff_upload.js)
// Assumes backend endpoint /api/class-upload for POST

function fetchAndRenderClassUploadTable() {
  fetch('/api/class_upload/all')
    .then(res => res.json())
    .then(result => {
      if (result && Array.isArray(result.classes)) {
        renderClassUploadTable(result.classes);
      }
    })
    .catch(() => {
      const container = document.getElementById('classTableContainer');
      if (container) container.innerHTML = '<div class="error">Failed to load class upload data.</div>';
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

function uploadClassesWithProgress(payload, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/class-upload');
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

function renderClassUploadTable(rows) {
  const container = document.getElementById('classTableContainer');
  if (!container) return;
  let html = '<h2>Subjects Upload Table</h2>';
  html += '<button id="deleteAllClassesBtn" style="margin-bottom:1rem;background:#d9534f;color:white;border:none;padding:0.5rem 1rem;border-radius:4px;cursor:pointer;">DELETE ALL</button>';
  html += '<table class="class-table"><thead><tr>' +
    '<th>ID</th>' +
    '<th>TTCode</th>' +
    '<th>Level</th>' +
    '<th>Name</th>' +
    '<th>Qualification</th>' +
    '<th>Department</th>' +
    '<th>Sub Department</th>' +
    '<th>Teacher in Charge</th>' +
    '<th>Description</th>' +
    '<th>STAR</th>' +
    '<th>UploadYear</th>' +
    '<th>UploadTerm</th>' +
    '<th>UploadDate</th>' +
    '<th>Status</th>' +
    '</tr></thead><tbody>';
  rows.forEach(row => {
    html += `<tr>` +
      `<td>${row.id || ''}</td>` +
      `<td>${row.ttcode || ''}</td>` +
      `<td>${row.level || ''}</td>` +
      `<td>${row.name || ''}</td>` +
      `<td>${row.qualification || ''}</td>` +
      `<td>${row.department || ''}</td>` +
      `<td>${row.sub_department || ''}</td>` +
      `<td>${row.teacher_in_charge || ''}</td>` +
      `<td>${row.description || ''}</td>` +
      `<td>${row.star || ''}</td>` +
      `<td>${row.upload_year || ''}</td>` +
      `<td>${row.upload_term || ''}</td>` +
      `<td>${formatDisplayDate(row.upload_date || '')}</td>` +
        `<td>${row.status || 'Current'}</td>` +
      `</tr>`;
  });
  html += '</tbody></table>';
  container.innerHTML = html;
  // Add DELETE ALL event
  const delBtn = document.getElementById('deleteAllClassesBtn');
  if (delBtn) {
    delBtn.onclick = function() {
      if (confirm('Are you sure you want to delete ALL class records? This cannot be undone.')) {
        fetch('/api/class-upload/all', { method: 'DELETE' })
          .then(res => res.json())
          .then(result => {
            if (result.success) {
              fetchAndRenderClassUploadTable();
            } else {
              alert('Failed to delete all classes.');
            }
          })
          .catch(() => alert('Failed to delete all classes.'));
      }
    };
  }
}

// Call on page load
window.addEventListener('DOMContentLoaded', fetchAndRenderClassUploadTable);
// Class CSV Upload & Preview
document.getElementById('uploadForm').addEventListener('submit', function(e) {
  e.preventDefault();
  const fileInput = document.getElementById('csvFile');
  const file = fileInput.files[0];
  if (!file) return;
  const uploadYear = Number(document.getElementById('uploadYear') && document.getElementById('uploadYear').value);
  const uploadTerm = String((document.getElementById('uploadTerm') && document.getElementById('uploadTerm').value) || '').trim();
  const uploadDate = String((document.getElementById('uploadDate') && document.getElementById('uploadDate').value) || '').trim();
  if (!Number.isInteger(uploadYear) || uploadYear < 2000 || uploadYear > 2100) {
    document.getElementById('uploadResult').textContent = 'Please enter a valid Upload Year.';
    return;
  }
  if (!uploadTerm) {
    document.getElementById('uploadResult').textContent = 'Please select Upload Term.';
    return;
  }
  if (!uploadDate) {
    document.getElementById('uploadResult').textContent = 'Please select Upload Date.';
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

    uploadClassesWithProgress(
      { headers, classes: data, uploadYear, uploadTerm, uploadDate },
      (pct) => setUploadProgress(`Uploading ${data.length} rows...`, 45 + (pct * 0.5))
    )
    .then(result => {
      setUploadProgress('Finalizing...', 100);
      if (result.success && data.length > 0) {
        fetchAndRenderClassUploadTable();
        document.getElementById('uploadResult').textContent =
          'Sync complete. Processed: ' + (result.processed || 0) +
          ', Inserted: ' + (result.inserted || 0) +
          ', Updated: ' + (result.updated || 0) +
          ', Marked Not Current: ' + (result.marked_not_current || 0) +
          ', Skipped (no TTCode): ' + (result.skipped_no_ttcode || 0) +
          ', Duplicate TTCodes in upload: ' + (result.duplicate_ttcodes_in_upload || 0) +
          `, UploadYear: ${result.upload_year || ''}, UploadTerm: ${result.upload_term || ''}, UploadDate: ${formatDisplayDate(result.upload_date || '')}`;
      } else if (data.length === 0) {
        document.getElementById('uploadResult').textContent = 'No valid class data found in CSV.';
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

function renderClassTable(headers, data) {
  const table = document.createElement('table');
  table.className = 'class-table';
  const thead = document.createElement('thead');
  const trHead = document.createElement('tr');
  headers.forEach(h => {
    const th = document.createElement('th');
    th.textContent = h;
    trHead.appendChild(th);
  });
  thead.appendChild(trHead);
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  data.forEach(row => {
    if (row.length < 2) return;
    const tr = document.createElement('tr');
    row.forEach(cell => {
      const td = document.createElement('td');
      td.textContent = cell;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  const container = document.getElementById('classTableContainer');
  container.innerHTML = '';
  container.appendChild(table);
}
