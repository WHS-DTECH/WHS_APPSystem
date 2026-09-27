// Only logic for Upload URL and Uploaded Recipes table remains
let showInlineStatus = () => {};

document.addEventListener('DOMContentLoaded', () => {
  const uploadUrlBtn = document.getElementById('uploadUrlBtn');
  const smartUploadBtn = document.getElementById('smartUploadBtn');
  const syncUploadedToRecipesBtn = document.getElementById('syncUploadedToRecipesBtn');
  const uploadUrlInput = document.querySelector('input[type="text"]');
  const uploadStatusBanner = document.getElementById('uploadStatusBanner');
  const progressBar = document.getElementById('cleanupProgressBar');
  const progressFill = document.getElementById('cleanupProgressFill');
  const progressText = document.getElementById('uploadProgressText');
  const uploadUrlBtnProgressBar = document.getElementById('uploadUrlBtnProgressBar');
  const uploadUrlBtnProgressFill = document.getElementById('uploadUrlBtnProgressFill');
  const smartUploadBtnProgressBar = document.getElementById('smartUploadBtnProgressBar');
  const smartUploadBtnProgressFill = document.getElementById('smartUploadBtnProgressFill');
  const syncUploadedToRecipesBtnProgressBar = document.getElementById('syncUploadedToRecipesBtnProgressBar');
  const syncUploadedToRecipesBtnProgressFill = document.getElementById('syncUploadedToRecipesBtnProgressFill');

  // Pre-fill URL input if ?url= query param is present
  const prefilledUrl = new URLSearchParams(window.location.search).get('url');
  if (prefilledUrl && uploadUrlInput) {
    uploadUrlInput.value = decodeURIComponent(prefilledUrl);
  }

  function setActionButtonsDisabled(disabled) {
    if (uploadUrlBtn) uploadUrlBtn.disabled = disabled;
    if (smartUploadBtn) smartUploadBtn.disabled = disabled;
    if (syncUploadedToRecipesBtn) syncUploadedToRecipesBtn.disabled = disabled;
  }

  function setProgress(percent, message) {
    if (progressBar) progressBar.style.display = 'block';
    if (progressFill) progressFill.style.width = `${Math.max(0, Math.min(100, percent))}%`;
    if (progressText) {
      progressText.style.display = 'block';
      progressText.textContent = message || '';
    }
  }

  function setButtonProgress(barEl, fillEl, percent) {
    if (!barEl || !fillEl) return;
    const safePercent = Math.max(0, Math.min(100, percent));
    barEl.style.display = safePercent > 0 ? 'block' : 'none';
    fillEl.style.width = `${safePercent}%`;
  }

  function resetAllButtonProgress() {
    setButtonProgress(uploadUrlBtnProgressBar, uploadUrlBtnProgressFill, 0);
    setButtonProgress(smartUploadBtnProgressBar, smartUploadBtnProgressFill, 0);
    setButtonProgress(syncUploadedToRecipesBtnProgressBar, syncUploadedToRecipesBtnProgressFill, 0);
  }

  function hideProgress() {
    setTimeout(() => {
      if (progressBar) progressBar.style.display = 'none';
      if (progressFill) progressFill.style.width = '0%';
      if (progressText) {
        progressText.textContent = '';
        progressText.style.display = 'none';
      }
    }, 700);
  }

  function setStatus(message, type = 'info') {
    if (!uploadStatusBanner) return;
    uploadStatusBanner.textContent = message || '';

    if (!message) {
      uploadStatusBanner.style.display = 'none';
      return;
    }

    uploadStatusBanner.style.display = 'block';
    if (type === 'success') {
      uploadStatusBanner.style.background = '#e8f5e9';
      uploadStatusBanner.style.border = '1px solid #43a047';
      uploadStatusBanner.style.color = '#1b5e20';
    } else if (type === 'error') {
      uploadStatusBanner.style.background = '#ffebee';
      uploadStatusBanner.style.border = '1px solid #e53935';
      uploadStatusBanner.style.color = '#b71c1c';
    } else {
      uploadStatusBanner.style.background = '#e3f2fd';
      uploadStatusBanner.style.border = '1px solid #1e88e5';
      uploadStatusBanner.style.color = '#0d47a1';
    }
  }

  showInlineStatus = setStatus;

  async function runUploadUrl() {
    if (!uploadUrlInput) return { success: false, error: 'Recipe URL input not found.' };
    const url = uploadUrlInput.value.trim();
    if (!url) {
      return { success: false, error: 'Please enter a Recipe URL.' };
    }

    const resp = await fetch('/api/recipes/upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    return resp.json();
  }

  async function runSyncUploadedRecipes() {
    const resp = await fetch('/api/recipes/sync-from-uploads', { method: 'POST' });
    return resp.json();
  }

  async function setRecipeSelectorToUploaded(uploadedRecordId) {
    const selector = document.getElementById('uploadSelect');
    if (!selector || !uploadedRecordId) return false;

    const res = await fetch('/api/recipes');
    const recipes = await res.json();
    if (!Array.isArray(recipes)) return false;

    const matched = recipes.find(r => String(r.uploaded_recipe_id) === String(uploadedRecordId));
    if (!matched) return false;

    const targetValue = String(matched.id);
    const hasOption = Array.from(selector.options).some(opt => String(opt.value) === targetValue);

    if (!hasOption) {
      const label = `[${matched.id}] ${matched.url || matched.name || 'No URL'}`;
      const option = document.createElement('option');
      option.value = targetValue;
      option.textContent = label;
      selector.appendChild(option);
    }

    selector.value = targetValue;
    selector.dispatchEvent(new Event('change'));
    return true;
  }

  if (uploadUrlBtn && uploadUrlInput) {
    uploadUrlBtn.addEventListener('click', async () => {
      setActionButtonsDisabled(true);
      setStatus('Uploading recipe URL...', 'info');
      setProgress(15, 'Uploading recipe URL...');
      setButtonProgress(uploadUrlBtnProgressBar, uploadUrlBtnProgressFill, 20);
      try {
        const data = await runUploadUrl();
        if (data.success) {
          setProgress(100, 'Upload complete. Refreshing table...');
          setButtonProgress(uploadUrlBtnProgressBar, uploadUrlBtnProgressFill, 100);
          setStatus('Recipe uploaded successfully.', 'success');
          await fetchAndRenderUploads({ highlightUploadId: data.upload && data.upload.id });
        } else {
          setButtonProgress(uploadUrlBtnProgressBar, uploadUrlBtnProgressFill, 100);
          setStatus('Failed to upload recipe: ' + (data.error || 'Unknown error'), 'error');
        }
      } catch (err) {
        setButtonProgress(uploadUrlBtnProgressBar, uploadUrlBtnProgressFill, 100);
        setStatus('Error uploading recipe: ' + err.message, 'error');
      } finally {
        hideProgress();
        setTimeout(() => {
          setButtonProgress(uploadUrlBtnProgressBar, uploadUrlBtnProgressFill, 0);
        }, 700);
        setActionButtonsDisabled(false);
      }
    });
  }

  if (syncUploadedToRecipesBtn) {
    syncUploadedToRecipesBtn.addEventListener('click', async () => {
      if (!confirm('This will insert any uploaded recipes not yet in the Recipes table. Continue?')) {
        return;
      }

      setActionButtonsDisabled(true);
      setStatus('Sync in progress...', 'info');
      setProgress(25, 'Syncing uploaded recipes to Recipes table...');
      setButtonProgress(syncUploadedToRecipesBtnProgressBar, syncUploadedToRecipesBtnProgressFill, 20);
      try {
        const data = await runSyncUploadedRecipes();
        if (data.success) {
          setProgress(100, 'Sync complete. Refreshing table...');
          setButtonProgress(syncUploadedToRecipesBtnProgressBar, syncUploadedToRecipesBtnProgressFill, 100);
          setStatus('Sync complete: ' + data.inserted + ' recipes added.', 'success');
          await fetchAndRenderUploads();
        } else {
          setButtonProgress(syncUploadedToRecipesBtnProgressBar, syncUploadedToRecipesBtnProgressFill, 100);
          setStatus('Sync failed: ' + (data.error || 'Unknown error'), 'error');
        }
      } catch (err) {
        setButtonProgress(syncUploadedToRecipesBtnProgressBar, syncUploadedToRecipesBtnProgressFill, 100);
        setStatus('Error contacting server: ' + err.message, 'error');
      } finally {
        hideProgress();
        setTimeout(() => {
          setButtonProgress(syncUploadedToRecipesBtnProgressBar, syncUploadedToRecipesBtnProgressFill, 0);
        }, 700);
        setActionButtonsDisabled(false);
      }
    });
  }

  if (smartUploadBtn && uploadUrlInput) {
    smartUploadBtn.addEventListener('click', async () => {
      if (!confirm('SMART Upload will upload the URL and then sync uploaded recipes into the Recipes table. Continue?')) {
        return;
      }

      setActionButtonsDisabled(true);
      setStatus('SMART Upload in progress...', 'info');
      setProgress(10, 'SMART Upload started...');
      setButtonProgress(smartUploadBtnProgressBar, smartUploadBtnProgressFill, 10);
      try {
        setProgress(25, 'Step 1 of 2: Uploading URL...');
        setButtonProgress(smartUploadBtnProgressBar, smartUploadBtnProgressFill, 30);
        const uploadData = await runUploadUrl();
        if (!uploadData.success) {
          setButtonProgress(smartUploadBtnProgressBar, smartUploadBtnProgressFill, 100);
          setStatus('Upload step failed: ' + (uploadData.error || 'Unknown error'), 'error');
          return;
        }

        const uploadedId = uploadData.upload && uploadData.upload.id;
        setProgress(60, 'Step 1 complete. Step 2 of 2: Syncing to Recipes table...');
        setButtonProgress(smartUploadBtnProgressBar, smartUploadBtnProgressFill, 65);
        const syncData = await runSyncUploadedRecipes();
        if (!syncData.success) {
          setButtonProgress(smartUploadBtnProgressBar, smartUploadBtnProgressFill, 100);
          setStatus('Upload succeeded, but sync failed: ' + (syncData.error || 'Unknown error'), 'error');
          return;
        }

        setProgress(90, 'Finalizing and refreshing uploaded recipes...');
        setButtonProgress(smartUploadBtnProgressBar, smartUploadBtnProgressFill, 90);
        await fetchAndRenderUploads({ highlightUploadId: uploadedId });
        await setRecipeSelectorToUploaded(uploadedId);
        setProgress(100, 'SMART Upload complete.');
        setButtonProgress(smartUploadBtnProgressBar, smartUploadBtnProgressFill, 100);
        setStatus('SMART Upload complete: recipe uploaded and ' + syncData.inserted + ' recipes synced to Recipes table.', 'success');
      } catch (err) {
        setButtonProgress(smartUploadBtnProgressBar, smartUploadBtnProgressFill, 100);
        setStatus('SMART Upload error: ' + err.message, 'error');
      } finally {
        hideProgress();
        setTimeout(() => {
          setButtonProgress(smartUploadBtnProgressBar, smartUploadBtnProgressFill, 0);
        }, 700);
        setActionButtonsDisabled(false);
      }
    });
  }

  resetAllButtonProgress();
  fetchAndRenderUploads().catch(err => {
    setStatus('Failed to load uploaded recipes: ' + err.message, 'error');
  });
});

async function fetchAndRenderUploads(options = {}) {
  const { highlightUploadId = null } = options;
  const res = await fetch('/api/uploads');
  const data = await res.json();
  const tbody = document.querySelector('#uploadedRecipesTable tbody');
  if (!tbody) return;

  tbody.innerHTML = '';
  let highlightedRow = null;

  data.forEach(upload => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${upload.id}</td>
      <td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${upload.recipe_title}</td>
      <td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${upload.upload_type}</td>
      <td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${upload.source_url ? `<a href='${upload.source_url}' target='_blank'>Link</a>` : ''}</td>
      <td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${upload.uploaded_by}</td>
      <td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${upload.upload_date}</td>
      <td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>
        <button class='delete-upload-btn' data-id='${upload.id}' style='background:#e53935;color:#fff;border:none;padding:0.4rem 0.8rem;border-radius:4px;cursor:pointer;'>Delete</button>
      </td>
    `;

    if (highlightUploadId && String(upload.id) === String(highlightUploadId)) {
      tr.style.background = '#fff8d6';
      tr.style.transition = 'background 1.2s ease';
      highlightedRow = tr;
    }

    tbody.appendChild(tr);
  });

  document.querySelectorAll('.delete-upload-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const id = this.getAttribute('data-id');
      if (confirm('Are you sure you want to delete this upload record?')) {
        fetch(`/api/uploads/${id}`, { method: 'DELETE' })
          .then(res => res.json())
          .then(result => {
            if (result.success) {
              fetchAndRenderUploads();
            } else {
              showInlineStatus('Failed to delete upload record.', 'error');
            }
          })
          .catch(err => {
            showInlineStatus('Delete failed: ' + err.message, 'error');
          });
      }
    });
  });

  if (highlightedRow) {
    highlightedRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => {
      highlightedRow.style.background = '';
    }, 2400);
  }
}
