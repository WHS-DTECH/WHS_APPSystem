
const form = document.getElementById('activity-upload-form');
const statusEl = document.getElementById('upload-status');
const imageFileInput = document.getElementById('activity-image-file');
const imageUrlInput = document.getElementById('activity-image');
const pageTitle = document.getElementById('activity-page-title');
const pageSubtitle = document.getElementById('activity-page-subtitle');
const formHeading = document.getElementById('activity-form-heading');
const submitBtn = document.getElementById('activity-submit-btn');
const deleteBtn = document.getElementById('activity-delete-btn');

const params = new URLSearchParams(window.location.search);
const editId = Number(params.get('id'));
const isEditMode = Number.isInteger(editId) && editId > 0;

let canUploadActivity = false;

(async function checkUploadPermissionAndInit() {
  try {
    const res = await fetch('/api/me', { credentials: 'include' });
    const data = await res.json();
    canUploadActivity = !!(data.user && data.user.canUploadActivity);
  } catch (e) {
    canUploadActivity = false;
  }

  // Only show edit/delete if user has upload permission
  if (isEditMode && canUploadActivity) {
    if (pageTitle) pageTitle.textContent = 'Edit Activity';
    if (pageSubtitle) pageSubtitle.textContent = 'Update an existing activity and save your changes.';
    if (formHeading) formHeading.textContent = `Edit Activity #${editId}`;
    if (submitBtn) submitBtn.textContent = 'Update Activity';
    if (deleteBtn) deleteBtn.style.display = 'inline-block';
  } else {
    if (deleteBtn) deleteBtn.style.display = 'none';
  }

  if (isEditMode) loadActivityForEdit();
})();

function setStatus(msg, isError) {
  if (!statusEl) return;
  statusEl.textContent = msg;
  statusEl.style.color = isError ? '#b63a3a' : '#37618a';
}

async function uploadImageFile(file) {
  const formData = new FormData();
  formData.append('image', file);

  const res = await fetch('/api/admin/upload-image', {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Image upload failed');
  }

  return data.imageUrl;
}

if (imageFileInput) {
  imageFileInput.addEventListener('change', async () => {
    const file = imageFileInput.files && imageFileInput.files[0];
    if (!file) return;

    setStatus('Uploading image...', false);

    try {
      const imageUrl = await uploadImageFile(file);
      if (imageUrlInput) imageUrlInput.value = imageUrl;
      setStatus('Image uploaded. You can now save the activity.', false);
    } catch (err) {
      setStatus(err.message || 'Image upload failed', true);
    }
  });
}

function setValue(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.value = value == null ? '' : String(value);
}

function setChecked(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.checked = !!value;
}

function mergeResourceEquipment(resources, equipment) {
  const left = String(resources || '').trim();
  const right = String(equipment || '').trim();
  if (!left && !right) return '';
  if (!left) return right;
  if (!right) return left;
  return `${left}\n${right}`;
}

async function loadActivityForEdit() {
  if (!isEditMode) return;

  try {
    const res = await fetch(`/api/activities/${editId}`, { credentials: 'include' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not load activity');

    setValue('activity-name', data.name);
    setValue('activity-year', data.year_level);
    setValue('activity-type', data.type);
    setValue('activity-category', data.activity_category || 'Practice');
    setValue('activity-duration', data.duration_hours);
    setValue('activity-difficulty', data.difficulty);
    setValue('activity-color', data.color || 'color-rose');
    setValue('activity-image', data.outcome_image_url || '');
    setValue('activity-idea-url', data.idea_url || '');
    setValue('activity-description', data.description || '');
    setValue('activity-resources', mergeResourceEquipment(data.resources, data.equipment));
    setValue('activity-instructions', data.instructions || '');
    setValue('class-management-notes', data.class_management_notes || '');
    setValue('class-preparation', data.class_preparation || '');
    setValue('assessment-focus', data.assessment_focus || '');
    setChecked('activity-week', data.is_this_week);
  } catch (err) {
    setStatus(err.message || 'Could not load activity for editing', true);
  }
}



if (deleteBtn) {
  deleteBtn.addEventListener('click', async () => {
    if (!isEditMode) return;

    const confirmed = window.confirm('Delete this activity permanently? This cannot be undone.');
    if (!confirmed) return;

    setStatus('Deleting activity...', false);

    try {
      const res = await fetch(`/api/admin/activities/${editId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not delete activity');

      setStatus('Activity deleted. Returning to library...', false);
      window.location.href = '/index.html';
    } catch (err) {
      setStatus(err.message || 'Could not delete activity', true);
    }
  });
}

if (form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    setStatus('Saving activity...', false);

    const payload = {
      name: document.getElementById('activity-name')?.value?.trim(),
      year_level: document.getElementById('activity-year')?.value,
      type: document.getElementById('activity-type')?.value?.trim(),
      activity_category: document.getElementById('activity-category')?.value,
      duration_hours: Number(document.getElementById('activity-duration')?.value),
      difficulty: document.getElementById('activity-difficulty')?.value,
      description: document.getElementById('activity-description')?.value?.trim() || null,
      color: document.getElementById('activity-color')?.value,
      is_this_week: !!document.getElementById('activity-week')?.checked,
      outcome_image_url: document.getElementById('activity-image')?.value?.trim() || null,
      idea_url: document.getElementById('activity-idea-url')?.value?.trim() || null,
      resources: document.getElementById('activity-resources')?.value?.trim() || null,
      equipment: document.getElementById('activity-resources')?.value?.trim() || null,
      instructions: document.getElementById('activity-instructions')?.value?.trim() || null,
      class_management_notes: document.getElementById('class-management-notes')?.value?.trim() || null,
      class_preparation: document.getElementById('class-preparation')?.value?.trim() || null,
      assessment_focus: document.getElementById('assessment-focus')?.value?.trim() || null,
    };

    try {
      const saveUrl = isEditMode ? `/api/admin/activities/${editId}` : '/api/admin/activities';
      const saveMethod = isEditMode ? 'PUT' : 'POST';

      const res = await fetch(saveUrl, {
        method: saveMethod,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save activity');

      setStatus(isEditMode ? 'Activity updated. Opening preview...' : 'Activity saved. Opening preview...', false);
      window.location.href = `/activity_detail.html?id=${data.id}`;
    } catch (err) {
      setStatus(err.message || (isEditMode ? 'Could not update activity' : 'Could not save activity'), true);
    }
  });
}
