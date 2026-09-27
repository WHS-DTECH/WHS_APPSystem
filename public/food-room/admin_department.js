function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Track all department data and selected rows
let allDepartmentData = [];
let selectedRows = new Set();
let currentFilter = '';

// Save department assignment for staff
function saveDepartmentAssignment() {
  const staffId = document.getElementById('staffSelect').value;
  const department = document.getElementById('departmentSelect').value;
  if (!staffId || !department) {
    alert('Please select both a staff member and a department.');
    return;
  }

  fetch('/api/department/assign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ staffId, department })
  })
    .then(res => res.json())
    .then(result => {
      if (result.success) {
        alert('Department assigned successfully!');
        fetchAndRenderDepartmentTable();
      } else {
        alert(result.error || 'Failed to assign department.');
      }
    })
    .catch(() => alert('Failed to assign department.'));
}

function uploadDepartmentCsv(event) {
  event.preventDefault();
  const fileInput = document.getElementById('departmentCsvFile');
  const file = fileInput.files[0];
  const resultEl = document.getElementById('departmentUploadResult');
  const progressContainer = document.getElementById('progressBarContainer');
  const progressBar = document.getElementById('progressBar');
  const progressText = document.getElementById('progressText');

  if (!file) {
    resultEl.textContent = 'Please choose a CSV file first.';
    return;
  }

  console.log('[DEPARTMENT] File selected:', file.name, 'Size:', file.size, 'Type:', file.type);

  resultEl.textContent = 'Reading CSV...';
  progressContainer.style.display = 'block';
  progressBar.style.width = '0%';
  progressText.textContent = 'Reading file...';

  // Use FileReader to read the file content as text
  const reader = new FileReader();
  reader.onload = function(e) {
    const csv = e.target.result;
    console.log('[DEPARTMENT] File content length:', csv.length, 'First 200 chars:', csv.substring(0, 200));
    
    Papa.parse(csv, {
      skipEmptyLines: true,
      header: false,
      delimiter: ",",
      complete: function(parsed) {
        const rows = parsed.data || [];
        console.log('[DEPARTMENT CSV] Parsed rows:', rows.length, 'First row:', rows[0]);
        console.log('[DEPARTMENT CSV] Full data:', parsed);
        if (rows.length < 2) {
          resultEl.textContent = `CSV file is empty or invalid. (Parsed ${rows.length} rows)`;
          progressContainer.style.display = 'none';
          return;
        }

        const headers = rows[0];
        const staff = rows.slice(1);

        // Show 30% progress after file is read
        progressBar.style.width = '30%';
        progressText.textContent = `Parsed ${staff.length} rows. Uploading...`;

        fetch('/api/department/upload-csv', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ headers, staff })
        })
          .then(res => res.json())
          .then(data => {
            if (!data.success) {
              resultEl.textContent = `Upload failed: ${data.error || 'Unknown error'}`;
              progressBar.style.width = '0%';
              progressBar.style.background = '#d9534f';
              progressText.textContent = 'Upload failed.';
              setTimeout(() => {
                progressContainer.style.display = 'none';
                progressBar.style.background = 'linear-gradient(90deg,#0066cc,#0099ff)';
              }, 2000);
              return;
            }

            // Show 100% progress on success
            progressBar.style.width = '100%';
            progressBar.style.background = 'linear-gradient(90deg,#28a745,#5cb85c)';
            progressText.textContent = 'Upload complete!';

            resultEl.textContent = `Processed: ${data.processed || 0}, Inserted: ${data.inserted || 0}, Updated: ${data.updated || 0}, Skipped: ${data.skipped || 0}`;
            
            setTimeout(() => {
              progressContainer.style.display = 'none';
              progressBar.style.background = 'linear-gradient(90deg,#0066cc,#0099ff)';
              fileInput.value = '';
            }, 1500);

            fetchAndRenderDepartmentTable();
            fetchAndPopulateStaffDropdown();
          })
          .catch(err => {
            resultEl.textContent = `Upload failed: ${err.message}`;
            progressBar.style.width = '0%';
            progressBar.style.background = '#d9534f';
            progressText.textContent = 'Upload error.';
            setTimeout(() => {
              progressContainer.style.display = 'none';
              progressBar.style.background = 'linear-gradient(90deg,#0066cc,#0099ff)';
            }, 2000);
          });
      },
      error: function(err) {
        console.error('[DEPARTMENT CSV] Parse error:', err);
        resultEl.textContent = `CSV parse failed: ${err.message}`;
        progressContainer.style.display = 'none';
      }
    });
  };
  
  reader.onerror = function() {
    resultEl.textContent = 'Failed to read file.';
    progressContainer.style.display = 'none';
    console.error('[DEPARTMENT] FileReader error');
  };
  
  reader.readAsText(file, 'UTF-8');
}

// Fetch staff for dropdown
function fetchAndPopulateStaffDropdown() {
  fetch('/api/staff_upload/all')
    .then(res => res.json())
    .then(result => {
      const select = document.getElementById('staffSelect');
      select.innerHTML = '<option value="">-- Select Staff --</option>';
      if (!result || !Array.isArray(result.staff)) return;

      result.staff.forEach(staff => {
        const option = document.createElement('option');
        option.value = staff.id;
        option.textContent = `${staff.last_name || ''}, ${staff.first_name || ''}`.trim();
        option.dataset.email = staff.email_school || '';
        select.appendChild(option);
      });
    });
}

function showStaffEmailAndTimetable() {
  const select = document.getElementById('staffSelect');
  const selectedOption = select.options[select.selectedIndex];
  const staffId = select.value;
  const email = selectedOption ? selectedOption.dataset.email : '';
  document.getElementById('staffEmail').textContent = email ? `Email: ${email}` : '';

  if (!staffId) {
    document.getElementById('timetableClassesContainer').innerHTML = '<b>Timetable Classes:</b> Please select a staff member.';
    return;
  }

  fetch(`/api/department/timetable/by-staff/${staffId}`)
    .then(res => res.json())
    .then(result => {
      const container = document.getElementById('timetableClassesContainer');
      if (result && Array.isArray(result.classes) && result.classes.length > 0) {
        let html = '<b>Timetable Classes:</b><ul>';
        result.classes.forEach(row => {
          html += `<li>${escapeHtml(row.Form_Class || '')} - ${escapeHtml(row.Teacher_Name || '')}</li>`;
        });
        html += '</ul>';
        container.innerHTML = html;
      } else {
        container.innerHTML = '<b>Timetable Classes:</b> None found.';
      }
    });
}

// Fetch and render the department table with all fields
function fetchAndRenderDepartmentTable() {
  fetch('/api/department/all')
    .then(res => res.json())
    .then(result => {
      if (result && Array.isArray(result.department)) {
        allDepartmentData = result.department;
        renderDepartmentTable(allDepartmentData);
      } else {
        document.getElementById('departmentTableContainer').innerHTML = '<div>No department data found.</div>';
      }
    })
    .catch(() => {
      document.getElementById('departmentTableContainer').innerHTML = '<div class="error">Failed to load department data.</div>';
    });
}

function renderDepartmentTable(rows) {
  const container = document.getElementById('departmentTableContainer');
  if (!container) return;

  // Apply filter if one is selected
  let filteredRows = rows;
  if (currentFilter) {
    filteredRows = rows.filter(row => row.department === currentFilter);
  }

  const columns = [
    { key: 'id', label: 'ID' },
    { key: 'code', label: 'Code' },
    { key: 'last_name', label: 'Last Name' },
    { key: 'first_name', label: 'First Name' },
    { key: 'title', label: 'Title' },
    { key: 'departments_comma', label: 'Departments (Comma)' },
    { key: 'staff_email', label: 'Staff Email' },
    { key: 'department', label: 'Primary Department' },
    { key: 'classes', label: 'Classes' }
  ];

  let html = '<table class="styled-table"><thead><tr><th style="width:40px;"><input type="checkbox" id="headerCheckbox" /></th>';
  columns.forEach(col => {
    html += `<th>${escapeHtml(col.label)}</th>`;
  });
  html += '</tr></thead><tbody>';

  if (filteredRows && filteredRows.length > 0) {
    filteredRows.forEach(row => {
      const isChecked = selectedRows.has(row.id);
      html += `<tr><td style="width:40px;"><input type="checkbox" class="rowCheckbox" value="${row.id}" ${isChecked ? 'checked' : ''} /></td>`;
      columns.forEach(col => {
        html += `<td>${escapeHtml(row[col.key] ?? '')}</td>`;
      });
      html += '</tr>';
    });
  } else {
    html += `<tr><td colspan="${columns.length + 1}">No rows found.</td></tr>`;
  }

  html += '</tbody></table>';
  container.innerHTML = html;

  // Attach event listeners to checkboxes
  attachCheckboxListeners();
  updateSelectionCount();
}

function attachCheckboxListeners() {
  const headerCheckbox = document.getElementById('headerCheckbox');
  const rowCheckboxes = document.querySelectorAll('.rowCheckbox');

  if (headerCheckbox) {
    headerCheckbox.addEventListener('change', function() {
      rowCheckboxes.forEach(cb => {
        cb.checked = this.checked;
        const rowId = parseInt(cb.value);
        if (this.checked) {
          selectedRows.add(rowId);
        } else {
          selectedRows.delete(rowId);
        }
      });
      updateSelectionCount();
    });
  }

  rowCheckboxes.forEach(cb => {
    cb.addEventListener('change', function() {
      const rowId = parseInt(this.value);
      if (this.checked) {
        selectedRows.add(rowId);
      } else {
        selectedRows.delete(rowId);
      }
      updateSelectionCount();
    });
  });
}

function updateSelectionCount() {
  const countEl = document.getElementById('selectionCount');
  if (countEl) {
    countEl.textContent = selectedRows.size > 0 ? `${selectedRows.size} row(s) selected` : '';
  }
}

function deleteAllDepartmentRows() {
  if (!confirm('Are you sure you want to delete all department data?')) return;

  fetch('/api/department/delete-all', { method: 'POST' })
    .then(res => res.json())
    .then(result => {
      if (result.success) {
        fetchAndRenderDepartmentTable();
      } else {
        alert(result.error || 'Failed to delete department data.');
      }
    })
    .catch(() => alert('Failed to delete department data.'));
}

window.addEventListener('DOMContentLoaded', () => {
  fetchAndPopulateStaffDropdown();
  fetchAndRenderDepartmentTable();

  document.getElementById('staffSelect').addEventListener('change', showStaffEmailAndTimetable);
  document.getElementById('saveDepartmentBtn').addEventListener('click', saveDepartmentAssignment);
  document.getElementById('deleteAllBtn').addEventListener('click', deleteAllDepartmentRows);
  document.getElementById('departmentUploadForm').addEventListener('submit', uploadDepartmentCsv);

  // Filter control
  const filterSelect = document.getElementById('departmentFilterSelect');
  if (filterSelect) {
    filterSelect.addEventListener('change', function() {
      currentFilter = this.value;
      selectedRows.clear();
      renderDepartmentTable(allDepartmentData);
    });
  }

  // Select all visible button
  const selectAllBtn = document.getElementById('selectAllBtn');
  if (selectAllBtn) {
    selectAllBtn.addEventListener('click', function() {
      let filteredRows = allDepartmentData;
      if (currentFilter) {
        filteredRows = allDepartmentData.filter(row => row.department === currentFilter);
      }
      filteredRows.forEach(row => selectedRows.add(row.id));
      renderDepartmentTable(allDepartmentData);
    });
  }

  // Clear selection button
  const clearSelectionBtn = document.getElementById('clearSelectionBtn');
  if (clearSelectionBtn) {
    clearSelectionBtn.addEventListener('click', function() {
      selectedRows.clear();
      renderDepartmentTable(allDepartmentData);
    });
  }
});
