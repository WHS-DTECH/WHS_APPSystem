function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 3);
}

function getPrimaryRole(roles) {
  const priority = ['Admin', 'Lead Teacher', 'Teacher', 'Technician', 'Manager', 'Staff', 'Student'];
  for (const p of priority) {
    if (roles.some(r => r.role === p)) return p;
  }
  return 'Member';
}

function wireDropdowns() {
  document.querySelectorAll('.nav-dropdown').forEach(dropdown => {
    const btn = dropdown.querySelector('.nav-dropdown-btn');
    if (!btn) return;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('open');
    });
  });

  document.addEventListener('click', () => {
    document.querySelectorAll('.nav-dropdown.open').forEach(d => d.classList.remove('open'));
  });
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const form = document.getElementById('worksheetUploadForm');
const uploadBtn = document.getElementById('uploadWorksheetBtn');
const lessonNoteForm = document.getElementById('lessonNoteUploadForm');
const uploadLessonNoteBtn = document.getElementById('uploadLessonNoteBtn');
const alertBox = document.getElementById('worksheetUploadAlert');
const worksheetListBody = document.getElementById('worksheetListBody');
const lessonNotesListBody = document.getElementById('lessonNotesListBody');
const selectAllWorksheets = document.getElementById('selectAllWorksheets');
const selectAllLessonNotes = document.getElementById('selectAllLessonNotes');
const bulkDeleteWorksheetsBtn = document.getElementById('bulkDeleteWorksheetsBtn');
const bulkDeleteLessonNotesBtn = document.getElementById('bulkDeleteLessonNotesBtn');
let canManageWorksheets = false;
const selectedWorksheetIds = new Set();
const selectedLessonNoteIds = new Set();
let worksheetsData = [];
let lessonNotesData = [];

const sortState = {
  worksheets: { key: 'year_level', direction: 'asc' },
  lessonNotes: { key: 'year_level', direction: 'asc' },
};

const YEAR_SORT_ORDER = {
  Junior: 1,
  'Year 7': 2,
  'Year 8': 3,
  Middle: 4,
  'Year 9': 5,
  'Year 10': 6,
  Senior: 7,
  'Year 11': 8,
  'Year 12': 9,
  'Year 13': 10,
};

function yearRank(value) {
  const label = String(value || '').trim();
  return Object.prototype.hasOwnProperty.call(YEAR_SORT_ORDER, label)
    ? YEAR_SORT_ORDER[label]
    : 999;
}

function strandLabelForItem(item) {
  return item.strand_number
    ? `Strand ${item.strand_number}${item.strand_title ? ` - ${item.strand_title}` : ''}`
    : (item.strand_title || '-');
}

function compareValues(a, b, direction = 'asc') {
  const safeA = String(a ?? '').toLowerCase();
  const safeB = String(b ?? '').toLowerCase();
  const result = safeA.localeCompare(safeB, undefined, { numeric: true, sensitivity: 'base' });
  return direction === 'asc' ? result : -result;
}

function sortItems(items, tableName) {
  const state = tableName === 'worksheets' ? sortState.worksheets : sortState.lessonNotes;
  const { key, direction } = state;
  const list = [...items];

  list.sort((a, b) => {
    if (key === 'year_level') {
      const result = yearRank(a.year_level) - yearRank(b.year_level);
      if (result !== 0) return direction === 'asc' ? result : -result;
      return compareValues(a.worksheet_title || a.lesson_note_title, b.worksheet_title || b.lesson_note_title, direction);
    }

    if (key === 'strand') {
      const result = compareValues(strandLabelForItem(a), strandLabelForItem(b), direction);
      if (result !== 0) return result;
      return compareValues(a.worksheet_title || a.lesson_note_title, b.worksheet_title || b.lesson_note_title, direction);
    }

    if (key === 'worksheet_category') {
      const result = compareValues(a.worksheet_category || '', b.worksheet_category || '', direction);
      if (result !== 0) return result;
      return compareValues(a.worksheet_title || '', b.worksheet_title || '', direction);
    }

    return compareValues(a.worksheet_title || a.lesson_note_title, b.worksheet_title || b.lesson_note_title, direction);
  });

  return list;
}

function updateSortHeaderIndicators() {
  document.querySelectorAll('th.is-sortable').forEach((th) => {
    th.classList.remove('sort-asc', 'sort-desc');
    const target = th.getAttribute('data-sort-target');
    const key = th.getAttribute('data-sort-key');
    if (!target || !key) return;

    const state = target === 'worksheets' ? sortState.worksheets : sortState.lessonNotes;
    if (state.key === key) {
      th.classList.add(state.direction === 'asc' ? 'sort-asc' : 'sort-desc');
    }
  });
}

function updateBulkDeleteButtons() {
  bulkDeleteWorksheetsBtn.disabled = !canManageWorksheets || selectedWorksheetIds.size === 0;
  bulkDeleteLessonNotesBtn.disabled = !canManageWorksheets || selectedLessonNoteIds.size === 0;
}

function syncSelectAllCheckboxes() {
  const worksheetChecks = worksheetListBody.querySelectorAll('input[data-select-worksheet-id]');
  const lessonNoteChecks = lessonNotesListBody.querySelectorAll('input[data-select-lesson-note-id]');

  const worksheetCheckedCount = [...worksheetChecks].filter(input => input.checked).length;
  const lessonCheckedCount = [...lessonNoteChecks].filter(input => input.checked).length;

  selectAllWorksheets.checked = worksheetChecks.length > 0 && worksheetCheckedCount === worksheetChecks.length;
  selectAllWorksheets.indeterminate = worksheetCheckedCount > 0 && worksheetCheckedCount < worksheetChecks.length;

  selectAllLessonNotes.checked = lessonNoteChecks.length > 0 && lessonCheckedCount === lessonNoteChecks.length;
  selectAllLessonNotes.indeterminate = lessonCheckedCount > 0 && lessonCheckedCount < lessonNoteChecks.length;
}

function setAlert(type, message) {
  alertBox.dataset.type = type;
  alertBox.textContent = message;
}

function formatDate(value) {
  if (!value) return 'Unknown';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return 'Unknown';
  }
}

function renderWorksheetRows(items) {
  if (!Array.isArray(items) || !items.length) {
    worksheetListBody.innerHTML = '<tr><td colspan="10" class="planner-empty">No worksheets uploaded yet.</td></tr>';
    selectedWorksheetIds.clear();
    syncSelectAllCheckboxes();
    updateBulkDeleteButtons();
    return;
  }

  const availableIds = new Set(items.map(item => String(item.id)));
  [...selectedWorksheetIds].forEach(id => {
    if (!availableIds.has(String(id))) selectedWorksheetIds.delete(id);
  });

  worksheetListBody.innerHTML = sortItems(items, 'worksheets').map(item => {
    const reviewHref = `/api/worksheets/${encodeURIComponent(item.id)}/file`;
    const itemId = String(item.id);
    const isSelected = selectedWorksheetIds.has(itemId);
    const strandLabel = strandLabelForItem(item);
    const linkedLessonHref = item.lesson_note_id ? `/api/lesson-notes/${encodeURIComponent(item.lesson_note_id)}/file` : null;
    const linkedLesson = item.lesson_note_title
      ? (linkedLessonHref
        ? `<a href="${linkedLessonHref}" target="_blank" rel="noopener">${esc(item.lesson_note_title)}</a>`
        : esc(item.lesson_note_title))
      : '-';
    return `
      <tr>
        <td><input type="checkbox" data-select-worksheet-id="${esc(itemId)}" ${isSelected ? 'checked' : ''} /></td>
        <td>${esc(item.worksheet_title || 'Untitled')}</td>
        <td>${esc(item.year_level || 'Not set')}</td>
        <td>${esc(strandLabel)}</td>
        <td>${esc(item.worksheet_category || 'Uncategorized')}</td>
        <td>${linkedLesson}</td>
        <td>${esc(item.file_name || 'Unknown file')}</td>
        <td>${esc(formatDate(item.created_at))}</td>
        <td>
          <a class="btn btn-secondary btn-sm" href="${reviewHref}" target="_blank" rel="noopener">Review</a>
        </td>
        <td>
          ${canManageWorksheets
            ? `<button type="button" class="btn btn-danger btn-sm" data-delete-worksheet-id="${esc(item.id)}" data-delete-worksheet-title="${esc(item.worksheet_title || 'worksheet')}">Delete</button>`
            : '<span class="topic-empty">-</span>'}
        </td>
      </tr>
    `;
  }).join('');

  syncSelectAllCheckboxes();
  updateBulkDeleteButtons();
}

function renderLessonNoteRows(items) {
  if (!Array.isArray(items) || !items.length) {
    lessonNotesListBody.innerHTML = '<tr><td colspan="8" class="planner-empty">No lesson notes uploaded yet.</td></tr>';
    selectedLessonNoteIds.clear();
    syncSelectAllCheckboxes();
    updateBulkDeleteButtons();
    return;
  }

  const availableIds = new Set(items.map(item => String(item.id)));
  [...selectedLessonNoteIds].forEach(id => {
    if (!availableIds.has(String(id))) selectedLessonNoteIds.delete(id);
  });

  lessonNotesListBody.innerHTML = sortItems(items, 'lessonNotes').map(item => {
    const itemId = String(item.id);
    const isSelected = selectedLessonNoteIds.has(itemId);
    const strandLabel = strandLabelForItem(item);
    const hasFile = Boolean(item.source_file_name);
    const reviewAction = hasFile
      ? `<a class="btn btn-secondary btn-sm" href="/api/lesson-notes/${encodeURIComponent(item.id)}/file" target="_blank" rel="noopener">Review</a>`
      : '<span class="topic-empty">No file</span>';

    return `
      <tr>
        <td><input type="checkbox" data-select-lesson-note-id="${esc(itemId)}" ${isSelected ? 'checked' : ''} /></td>
        <td>${esc(item.lesson_note_title || 'Untitled')}</td>
        <td>${esc(item.year_level || 'Not set')}</td>
        <td>${esc(strandLabel)}</td>
        <td>${esc(String(item.linked_worksheet_count ?? 0))}</td>
        <td>${esc(formatDate(item.created_at))}</td>
        <td>${reviewAction}</td>
        <td>
          ${canManageWorksheets
            ? `<button type="button" class="btn btn-danger btn-sm" data-delete-lesson-note-id="${esc(item.id)}" data-delete-lesson-note-title="${esc(item.lesson_note_title || 'lesson note')}">Delete</button>`
            : '<span class="topic-empty">-</span>'}
        </td>
      </tr>
    `;
  }).join('');

  syncSelectAllCheckboxes();
  updateBulkDeleteButtons();
}

async function loadWorksheets() {
  try {
    const res = await fetch('/api/worksheets', { cache: 'no-store' });
    const json = await res.json();

    if (!res.ok) {
      throw new Error(json.error || 'Failed to load worksheets.');
    }

    worksheetsData = Array.isArray(json.worksheets) ? json.worksheets : [];
    renderWorksheetRows(worksheetsData);
  } catch (error) {
    worksheetListBody.innerHTML = `<tr><td colspan="10" class="planner-empty">${esc(error.message || 'Failed to load worksheets.')}</td></tr>`;
  }
}

async function loadLessonNotes() {
  try {
    const res = await fetch('/api/lesson-notes', { cache: 'no-store' });
    const json = await res.json();

    if (!res.ok) {
      throw new Error(json.error || 'Failed to load lesson notes.');
    }

    lessonNotesData = Array.isArray(json.lessonNotes) ? json.lessonNotes : [];
    renderLessonNoteRows(lessonNotesData);
  } catch (error) {
    lessonNotesListBody.innerHTML = `<tr><td colspan="8" class="planner-empty">${esc(error.message || 'Failed to load lesson notes.')}</td></tr>`;
  }
}

async function deleteWorksheetById(id, title) {
  if (!canManageWorksheets) {
    setAlert('warning', 'Only Admin and Lead Teacher accounts can delete worksheets.');
    return;
  }

  const confirmed = window.confirm(`Delete worksheet "${title}"? This action cannot be undone.`);
  if (!confirmed) return;

  setAlert('saving', 'Deleting worksheet...');

  try {
    const response = await fetch(`/api/worksheets/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    const json = await response.json();
    if (!response.ok) {
      throw new Error(json.error || 'Failed to delete worksheet.');
    }

    selectedWorksheetIds.delete(String(id));
    setAlert('success', `Deleted worksheet: ${json.worksheet.worksheet_title}.`);
    await loadWorksheets();
    await loadLessonNotes();
  } catch (error) {
    setAlert('error', error.message || 'Failed to delete worksheet.');
  }
}

async function deleteLessonNoteById(id, title) {
  if (!canManageWorksheets) {
    setAlert('warning', 'Only Admin and Lead Teacher accounts can delete lesson notes.');
    return;
  }

  const confirmed = window.confirm(`Delete lesson note "${title}"? Linked worksheets will remain but be unlinked from this note.`);
  if (!confirmed) return;

  setAlert('saving', 'Deleting lesson note...');

  try {
    const response = await fetch(`/api/lesson-notes/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    const json = await response.json();
    if (!response.ok) {
      throw new Error(json.error || 'Failed to delete lesson note.');
    }

    selectedLessonNoteIds.delete(String(id));
    setAlert('success', `Deleted lesson note: ${json.lessonNote.lesson_note_title}.`);
    await loadLessonNotes();
    await loadWorksheets();
  } catch (error) {
    setAlert('error', error.message || 'Failed to delete lesson note.');
  }
}

function validateForm() {
  const fileInput = document.getElementById('worksheetFile');
  const hasFiles = fileInput.files && fileInput.files.length > 0;
  uploadBtn.disabled = !canManageWorksheets || !hasFiles;

  const lessonNoteFileInput = document.getElementById('lessonNoteFile');
  const lessonNoteHasFile = lessonNoteFileInput.files && lessonNoteFileInput.files.length > 0;
  uploadLessonNoteBtn.disabled = !canManageWorksheets || !lessonNoteHasFile;
}

async function hydrateUserState() {
  try {
    const userRes = await fetch('/api/user');
    const user = await userRes.json();

    if (!user) {
      setAlert('warning', 'Sign in with your school Google account before uploading worksheets.');
      canManageWorksheets = false;
      validateForm();
      return;
    }

    const signInBtn = document.getElementById('googleSignIn');
    const chip = document.getElementById('userChip');
    if (signInBtn) signInBtn.style.display = 'none';
    if (chip) chip.style.display = 'inline-flex';

    const initialsEl = document.getElementById('userInitials');
    if (initialsEl) initialsEl.textContent = getInitials(user.name);

    let primaryRole = 'Member';
    try {
      const rolesRes = await fetch('/api/my-roles');
      const roles = await rolesRes.json();
      primaryRole = getPrimaryRole(roles);
      canManageWorksheets = roles.some(r => r.role === 'Admin' || r.role === 'Lead Teacher');

      const roleEl = document.getElementById('userRoleBadge');
      if (roleEl) roleEl.textContent = primaryRole;

      if (roles.some(r => r.role === 'Admin' || r.role === 'Lead Teacher')) {
        const adminMenu = document.getElementById('adminMenu');
        if (adminMenu) adminMenu.style.display = 'flex';
      }
    } catch {
      canManageWorksheets = false;
    }

    if (canManageWorksheets) {
      setAlert('ready', `Signed in as ${primaryRole}. Upload worksheet files and share review links.`);
    } else {
      setAlert('warning', `Signed in as ${primaryRole}, but worksheet uploading is limited to Admin and Lead Teacher accounts.`);
    }

    validateForm();
    await loadWorksheets();
    await loadLessonNotes();
  } catch {
    setAlert('error', 'Unable to check sign-in status. Refresh and try again.');
    canManageWorksheets = false;
    validateForm();
  }
}

form.addEventListener('change', () => {
  const fileInput = document.getElementById('worksheetFile');
  const titleInput = document.getElementById('worksheetTitle');
  const file = fileInput.files && fileInput.files.length === 1 ? fileInput.files[0] : null;

  if (file && !titleInput.value.trim()) {
    titleInput.value = String(file.name || '').replace(/\.[^.]+$/, '');
  }

  validateForm();
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const fileInput = document.getElementById('worksheetFile');
  const files = fileInput.files;
  const title = document.getElementById('worksheetTitle').value.trim();
  const splitMode = document.getElementById('splitDocxList').checked;

  if (!files || !files.length) {
    setAlert('error', 'Please choose at least one worksheet file.');
    return;
  }

  if (splitMode && files.length !== 1) {
    setAlert('error', 'DOCX Split Mode only works when uploading a single DOCX file.');
    return;
  }

  uploadBtn.disabled = true;
  setAlert('saving', 'Uploading worksheet file...');

  try {
    const data = new FormData(form);
    const response = await fetch('/api/worksheets/upload', {
      method: 'POST',
      body: data,
    });

    const json = await response.json();
    if (!response.ok) {
      throw new Error(json.error || 'Failed to upload worksheet.');
    }

    const uploadedCount = Number(json.uploadedCount || 0);
    const uploadedSummary = uploadedCount > 1
      ? `Uploaded ${uploadedCount} worksheets for ${json.worksheet.year_level}.`
      : `Uploaded ${json.worksheet.file_name} for ${json.worksheet.year_level}.`;
    setAlert('success', uploadedSummary);
    form.reset();
    document.getElementById('worksheetYearLevel').value = 'Junior';
    document.getElementById('worksheetCategory').value = 'Auto-detect';
    await loadWorksheets();
    await loadLessonNotes();
  } catch (error) {
    setAlert('error', error.message || 'Failed to upload worksheet.');
  } finally {
    validateForm();
  }
});

lessonNoteForm.addEventListener('change', () => {
  const fileInput = document.getElementById('lessonNoteFile');
  const titleInput = document.getElementById('lessonNoteTitle');
  const file = fileInput.files && fileInput.files.length === 1 ? fileInput.files[0] : null;

  if (file && !titleInput.value.trim()) {
    titleInput.value = String(file.name || '').replace(/\.[^.]+$/, '');
  }

  validateForm();
});

lessonNoteForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const fileInput = document.getElementById('lessonNoteFile');
  const file = fileInput.files && fileInput.files[0];
  const splitMode = document.getElementById('splitDocxLessonList').checked;
  if (!file) {
    setAlert('error', 'Please choose a lesson note file.');
    return;
  }

  if (splitMode && !String(file.name || '').toLowerCase().endsWith('.docx')) {
    setAlert('error', 'Lesson Note DOCX Split Mode only works with a single DOCX file.');
    return;
  }

  uploadLessonNoteBtn.disabled = true;
  setAlert('saving', 'Uploading lesson note...');

  try {
    const data = new FormData(lessonNoteForm);
    const response = await fetch('/api/lesson-notes/upload', {
      method: 'POST',
      body: data,
    });

    const json = await response.json();
    if (!response.ok) {
      throw new Error(json.error || 'Failed to upload lesson note.');
    }

    const uploadedCount = Number(json.uploadedCount || 0);
    if (uploadedCount > 1) {
      setAlert('success', `Uploaded ${uploadedCount} lesson notes from DOCX split mode.`);
    } else {
      setAlert('success', `Uploaded lesson note: ${json.lessonNote.lesson_note_title}.`);
    }
    lessonNoteForm.reset();
    document.getElementById('lessonNoteYearLevel').value = 'Junior';
    await loadLessonNotes();
    await loadWorksheets();
  } catch (error) {
    setAlert('error', error.message || 'Failed to upload lesson note.');
  } finally {
    validateForm();
  }
});

worksheetListBody.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-delete-worksheet-id]');
  if (!button) return;

  const worksheetId = button.getAttribute('data-delete-worksheet-id');
  const worksheetTitle = button.getAttribute('data-delete-worksheet-title') || 'worksheet';
  await deleteWorksheetById(worksheetId, worksheetTitle);
});

lessonNotesListBody.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-delete-lesson-note-id]');
  if (!button) return;

  const lessonNoteId = button.getAttribute('data-delete-lesson-note-id');
  const lessonNoteTitle = button.getAttribute('data-delete-lesson-note-title') || 'lesson note';
  await deleteLessonNoteById(lessonNoteId, lessonNoteTitle);
});

document.querySelectorAll('th.is-sortable').forEach((th) => {
  th.addEventListener('click', () => {
    const target = th.getAttribute('data-sort-target');
    const key = th.getAttribute('data-sort-key');
    if (!target || !key) return;

    const state = target === 'worksheets' ? sortState.worksheets : sortState.lessonNotes;
    if (state.key === key) {
      state.direction = state.direction === 'asc' ? 'desc' : 'asc';
    } else {
      state.key = key;
      state.direction = 'asc';
    }

    updateSortHeaderIndicators();
    if (target === 'worksheets') {
      renderWorksheetRows(worksheetsData);
    } else {
      renderLessonNoteRows(lessonNotesData);
    }
  });
});

worksheetListBody.addEventListener('change', (event) => {
  const checkbox = event.target.closest('input[data-select-worksheet-id]');
  if (!checkbox) return;

  const id = checkbox.getAttribute('data-select-worksheet-id');
  if (!id) return;

  if (checkbox.checked) selectedWorksheetIds.add(String(id));
  else selectedWorksheetIds.delete(String(id));

  syncSelectAllCheckboxes();
  updateBulkDeleteButtons();
});

lessonNotesListBody.addEventListener('change', (event) => {
  const checkbox = event.target.closest('input[data-select-lesson-note-id]');
  if (!checkbox) return;

  const id = checkbox.getAttribute('data-select-lesson-note-id');
  if (!id) return;

  if (checkbox.checked) selectedLessonNoteIds.add(String(id));
  else selectedLessonNoteIds.delete(String(id));

  syncSelectAllCheckboxes();
  updateBulkDeleteButtons();
});

selectAllWorksheets.addEventListener('change', () => {
  const shouldSelectAll = selectAllWorksheets.checked;
  worksheetListBody.querySelectorAll('input[data-select-worksheet-id]').forEach((input) => {
    const id = input.getAttribute('data-select-worksheet-id');
    input.checked = shouldSelectAll;
    if (!id) return;
    if (shouldSelectAll) selectedWorksheetIds.add(String(id));
    else selectedWorksheetIds.delete(String(id));
  });

  syncSelectAllCheckboxes();
  updateBulkDeleteButtons();
});

selectAllLessonNotes.addEventListener('change', () => {
  const shouldSelectAll = selectAllLessonNotes.checked;
  lessonNotesListBody.querySelectorAll('input[data-select-lesson-note-id]').forEach((input) => {
    const id = input.getAttribute('data-select-lesson-note-id');
    input.checked = shouldSelectAll;
    if (!id) return;
    if (shouldSelectAll) selectedLessonNoteIds.add(String(id));
    else selectedLessonNoteIds.delete(String(id));
  });

  syncSelectAllCheckboxes();
  updateBulkDeleteButtons();
});

bulkDeleteWorksheetsBtn.addEventListener('click', async () => {
  if (!canManageWorksheets) {
    setAlert('warning', 'Only Admin and Lead Teacher accounts can delete worksheets.');
    return;
  }

  const ids = [...selectedWorksheetIds];
  if (!ids.length) {
    setAlert('warning', 'Select one or more worksheets to delete.');
    return;
  }

  const confirmed = window.confirm(`Delete ${ids.length} selected worksheet(s)? This action cannot be undone.`);
  if (!confirmed) return;

  setAlert('saving', `Deleting ${ids.length} selected worksheet(s)...`);

  let successCount = 0;
  for (const id of ids) {
    try {
      const response = await fetch(`/api/worksheets/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (response.ok) {
        successCount += 1;
        selectedWorksheetIds.delete(String(id));
      }
    } catch {
      // Keep going so one failure does not block the rest.
    }
  }

  await loadWorksheets();
  await loadLessonNotes();

  if (successCount === ids.length) {
    setAlert('success', `Deleted ${successCount} worksheet(s).`);
  } else {
    setAlert('warning', `Deleted ${successCount} of ${ids.length} worksheet(s).`);
  }
});

bulkDeleteLessonNotesBtn.addEventListener('click', async () => {
  if (!canManageWorksheets) {
    setAlert('warning', 'Only Admin and Lead Teacher accounts can delete lesson notes.');
    return;
  }

  const ids = [...selectedLessonNoteIds];
  if (!ids.length) {
    setAlert('warning', 'Select one or more lesson notes to delete.');
    return;
  }

  const confirmed = window.confirm(`Delete ${ids.length} selected lesson note(s)? Linked worksheets will remain but be unlinked.`);
  if (!confirmed) return;

  setAlert('saving', `Deleting ${ids.length} selected lesson note(s)...`);

  let successCount = 0;
  for (const id of ids) {
    try {
      const response = await fetch(`/api/lesson-notes/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (response.ok) {
        successCount += 1;
        selectedLessonNoteIds.delete(String(id));
      }
    } catch {
      // Keep going so one failure does not block the rest.
    }
  }

  await loadLessonNotes();
  await loadWorksheets();

  if (successCount === ids.length) {
    setAlert('success', `Deleted ${successCount} lesson note(s).`);
  } else {
    setAlert('warning', `Deleted ${successCount} of ${ids.length} lesson note(s).`);
  }
});

wireDropdowns();
hydrateUserState();
loadWorksheets();
loadLessonNotes();
validateForm();
updateSortHeaderIndicators();