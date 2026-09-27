function normalizeHeader(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function classCodeFromFilename(name) {
  const raw = String(name || '').replace(/\.[^.]+$/, '').trim();
  return raw.toUpperCase();
}

function mapHeaders(headers) {
  const normalized = headers.map(normalizeHeader);
  const idx = (aliases) => {
    for (const alias of aliases) {
      const i = normalized.indexOf(normalizeHeader(alias));
      if (i >= 0) return i;
    }
    return -1;
  };

  return {
    student_id: idx(['Student ID', 'ID Number', 'StudentID', 'ID']),
    last_name: idx(['Last Name', 'Surname', 'LastName']),
    first_name: idx(['First Name', 'Given Name', 'FirstName']),
    gender: idx(['Gender', 'Sex']),
    level: idx(['Level', 'Year Level', 'Year']),
    tutor: idx(['Tutor', 'Form Class', 'Tutor Class']),
    timetable_class: idx(['Timetable Class', 'TimetableClass', 'Class'])
  };
}

function parseRows(rows) {
  const headers = rows[0] || [];
  const map = mapHeaders(headers);
  if (map.student_id < 0) {
    throw new Error('CSV must include a Student ID or ID Number column.');
  }

  return rows.slice(1).map((row) => ({
    student_id: String(row[map.student_id] || '').trim(),
    last_name: map.last_name >= 0 ? String(row[map.last_name] || '').trim() : '',
    first_name: map.first_name >= 0 ? String(row[map.first_name] || '').trim() : '',
    gender: map.gender >= 0 ? String(row[map.gender] || '').trim() : '',
    level: map.level >= 0 ? String(row[map.level] || '').trim() : '',
    tutor: map.tutor >= 0 ? String(row[map.tutor] || '').trim() : '',
    timetable_class: map.timetable_class >= 0 ? String(row[map.timetable_class] || '').trim() : ''
  })).filter((r) => r.student_id);
}

function renderClassSummary(classes) {
  const container = document.getElementById('mfoodClassTableContainer');
  if (!container) return;

  const rows = Array.isArray(classes) ? classes : [];
  let html = '<h2>MFOOD Class Uploads (Current)</h2>';
  if (!rows.length) {
    html += '<div style="color:#64748b;">No MFOOD uploads yet.</div>';
    container.innerHTML = html;
    return;
  }

  html += '<div style="overflow-x:auto;"><table class="styled-table"><thead><tr>' +
    '<th>Class Code</th><th>Student Count</th><th>Upload Date</th><th>Updated</th>' +
    '</tr></thead><tbody>';

  rows.forEach((r) => {
    html += '<tr>' +
      '<td>' + (r.class_code || '') + '</td>' +
      '<td>' + (r.student_count || 0) + '</td>' +
      '<td>' + (r.upload_date || '') + '</td>' +
      '<td>' + (r.updated_at || '') + '</td>' +
      '</tr>';
  });

  html += '</tbody></table></div>';
  container.innerHTML = html;
}

function refreshSummary() {
  fetch('/api/mfood_upload/all')
    .then((res) => res.json())
    .then((data) => renderClassSummary(data.classes || []))
    .catch(() => {
      const container = document.getElementById('mfoodClassTableContainer');
      if (container) container.innerHTML = '<div style="color:#b91c1c;">Failed to load MFOOD upload summary.</div>';
    });
}

window.addEventListener('DOMContentLoaded', function () {
  const fileInput = document.getElementById('mfoodCsvFile');
  const classCodeInput = document.getElementById('mfoodClassCode');
  const form = document.getElementById('mfoodUploadForm');
  const result = document.getElementById('mfoodUploadResult');

  if (!fileInput || !classCodeInput || !form || !result) return;

  fileInput.addEventListener('change', function () {
    const f = fileInput.files && fileInput.files[0];
    if (!f) return;
    if (!classCodeInput.value.trim()) {
      classCodeInput.value = classCodeFromFilename(f.name);
    }
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    const file = fileInput.files && fileInput.files[0];
    const classCode = String(classCodeInput.value || '').trim().toUpperCase();
    const uploadYear = Number(document.getElementById('mfoodUploadYear').value);
    const uploadTerm = String(document.getElementById('mfoodUploadTerm').value || '').trim();
    const uploadDate = String(document.getElementById('mfoodUploadDate').value || '').trim();

    if (!file) {
      result.textContent = 'Choose a CSV file first.';
      return;
    }
    if (!classCode) {
      result.textContent = 'Class code is required.';
      return;
    }

    result.textContent = 'Reading CSV...';

    const reader = new FileReader();
    reader.onload = function (evt) {
      try {
        const parsed = Papa.parse(String(evt.target.result || ''), { skipEmptyLines: true });
        const rows = parsed.data || [];
        if (rows.length < 2) {
          result.textContent = 'CSV is empty or invalid.';
          return;
        }

        const payloadRows = parseRows(rows);
        if (!payloadRows.length) {
          result.textContent = 'No valid rows found. Student ID is required.';
          return;
        }

        result.textContent = 'Uploading ' + payloadRows.length + ' students...';

        fetch('/api/mfood_upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            classCode,
            rows: payloadRows,
            uploadYear,
            uploadTerm,
            uploadDate
          })
        })
          .then((res) => res.json())
          .then((data) => {
            if (!data.success) throw new Error(data.error || 'Upload failed');
            result.textContent =
              'Upload complete for ' + data.class_code +
              '. Class size set to ' + data.class_size +
              '. Bookings updated: ' + data.bookings_updated +
              '. Processed rows: ' + data.processed + '.';
            refreshSummary();
          })
          .catch((err) => {
            result.textContent = 'Upload failed: ' + (err.message || err);
          });
      } catch (err) {
        result.textContent = 'CSV parse failed: ' + (err.message || err);
      }
    };

    reader.onerror = function () {
      result.textContent = 'Failed to read file.';
    };

    reader.readAsText(file);
  });

  refreshSummary();
});
