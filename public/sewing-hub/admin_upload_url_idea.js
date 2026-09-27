
const form = document.getElementById('url-idea-form');
const statusEl = document.getElementById('url-idea-status');
const pageTitle = document.getElementById('url-idea-page-title');
const pageSubtitle = document.getElementById('url-idea-page-subtitle');
const formHeading = document.getElementById('url-idea-form-heading');
const submitBtn = document.getElementById('url-idea-submit-btn');
const deleteBtn = document.getElementById('url-idea-delete-btn');
const convertBtn = document.getElementById('convert-to-activity-btn');
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

  // Only show edit/delete/convert if user has upload permission
  if (isEditMode && canUploadActivity) {
    if (pageTitle) pageTitle.textContent = 'Edit URL Idea';
    if (pageSubtitle) pageSubtitle.textContent = 'Update an existing URL idea and save your changes.';
    if (formHeading) formHeading.textContent = `Edit URL Idea #${editId}`;
    if (submitBtn) submitBtn.textContent = 'Update URL Idea';
    if (deleteBtn) deleteBtn.style.display = 'inline-block';
    if (convertBtn) convertBtn.style.display = 'inline-block';
  } else {
    if (deleteBtn) deleteBtn.style.display = 'none';
    if (convertBtn) convertBtn.style.display = 'none';
  }

  if (isEditMode) loadUrlIdeaForEdit();
})();

let loadedUrlIdea = null;

function setStatus(message, isError) {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.style.color = isError ? '#b63a3a' : '#37618a';
}

function setValue(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.value = value == null ? '' : String(value);
}

async function loadUrlIdeaForEdit() {
  if (!isEditMode) return;

  try {
    const res = await fetch(`/api/activities/${editId}`, { credentials: 'include' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not load URL idea');

    loadedUrlIdea = data;
    setValue('idea-name', data.name);
    setValue('idea-type', data.type);
    setValue('idea-color', data.color || 'color-teal');
    setValue('idea-url', data.idea_url || '');
    setValue('idea-description', data.description || '');
  } catch (err) {
    setStatus(err.message || 'Could not load URL idea for editing', true);
  }
}


// Convert to Activity logic
const convertBtn = document.getElementById('convert-to-activity-btn');
if (convertBtn && isEditMode) {
  convertBtn.addEventListener('click', async () => {
    if (!loadedUrlIdea) return setStatus('URL Idea not loaded', true);
    setStatus('Converting to Activity...', false);
    try {
      const updatePayload = {
        ...loadedUrlIdea,
        activity_category: 'Practice',
        // Ensure required fields for Activity
        year_level: loadedUrlIdea.year_level || 'Year 9',
        duration_hours: loadedUrlIdea.duration_hours || 1,
        difficulty: loadedUrlIdea.difficulty || 'Beginner',
      };
      const res = await fetch(`/api/admin/activities/${editId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(updatePayload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not convert to Activity');
      setStatus('Converted! Redirecting...', false);
      window.location.href = `/admin_upload_activity.html?id=${editId}`;
    } catch (err) {
      setStatus(err.message || 'Could not convert to Activity', true);
    }
  });
}

if (deleteBtn) {
  deleteBtn.addEventListener('click', async () => {
    if (!isEditMode) return;

    const confirmed = window.confirm('Delete this URL idea permanently? This cannot be undone.');
    if (!confirmed) return;

    setStatus('Deleting URL idea...', false);

    try {
      const res = await fetch(`/api/admin/activities/${editId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not delete URL idea');

      setStatus('URL idea deleted. Returning to library...', false);
      window.location.href = '/index.html';
    } catch (err) {
      setStatus(err.message || 'Could not delete URL idea', true);
    }
  });
}

if (form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    setStatus(isEditMode ? 'Updating URL idea...' : 'Saving URL idea...', false);

    const payload = {
      name: document.getElementById('idea-name')?.value?.trim(),
      type: document.getElementById('idea-type')?.value?.trim(),
      color: document.getElementById('idea-color')?.value,
      idea_url: document.getElementById('idea-url')?.value?.trim(),
      description: document.getElementById('idea-description')?.value?.trim() || null,
    };

    try {
      let res;
      if (isEditMode) {
        const fallback = loadedUrlIdea || {};
        const updatePayload = {
          name: payload.name,
          year_level: String(fallback.year_level || 'Year 9'),
          type: payload.type,
          activity_category: 'URL Idea',
          duration_hours: Number(fallback.duration_hours || 1),
          difficulty: String(fallback.difficulty || 'Beginner'),
          description: payload.description,
          color: payload.color,
          is_this_week: !!fallback.is_this_week,
          outcome_image_url: null,
          idea_url: payload.idea_url,
          resources: fallback.resources || null,
          equipment: fallback.equipment || null,
          instructions: fallback.instructions || null,
          class_management_notes: fallback.class_management_notes || null,
          class_preparation: fallback.class_preparation || null,
          assessment_focus: fallback.assessment_focus || null,
        };

        res = await fetch(`/api/admin/activities/${editId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(updatePayload),
        });
      } else {
        res = await fetch('/api/admin/url-ideas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        });
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save URL idea');

      setStatus(isEditMode ? 'URL idea updated. Opening preview...' : 'URL idea saved. Opening preview...', false);
      window.location.href = `/activity_detail.html?id=${data.id}`;
    } catch (err) {
      setStatus(err.message || (isEditMode ? 'Could not update URL idea' : 'Could not save URL idea'), true);
    }
  });
}
