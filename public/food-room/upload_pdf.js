let showPdfStatus = () => {};

document.addEventListener('DOMContentLoaded', () => {
  const uploadArea = document.getElementById('pdfUploadArea');
  const fileInput = document.getElementById('pdfInput');
  const uploadBtn = document.getElementById('uploadPdfBtn');
  const uploadAndSyncBtn = document.getElementById('uploadAndSyncPdfBtn');
  const syncBtn = document.getElementById('syncUploadedToRecipesBtnPdf');
  const statusBanner = document.getElementById('uploadPdfStatusBanner');

  if (!uploadArea || !fileInput || !uploadBtn || !statusBanner) return;

  let selectedFile = null;

  function setStatus(message, type = 'info') {
    showPdfStatus = setStatus;
    statusBanner.textContent = message || '';
    if (!message) {
      statusBanner.style.display = 'none';
      return;
    }
    statusBanner.style.display = 'block';
    if (type === 'success') {
      statusBanner.style.background = '#e8f5e9';
      statusBanner.style.border = '1px solid #43a047';
      statusBanner.style.color = '#1b5e20';
    } else if (type === 'error') {
      statusBanner.style.background = '#ffebee';
      statusBanner.style.border = '1px solid #e53935';
      statusBanner.style.color = '#b71c1c';
    } else {
      statusBanner.style.background = '#e3f2fd';
      statusBanner.style.border = '1px solid #1e88e5';
      statusBanner.style.color = '#0d47a1';
    }
  }

  function setSelectedFile(file) {
    if (!file) return;
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
    if (!isPdf) {
      selectedFile = null;
      uploadArea.textContent = 'Drag & drop or click to select PDF';
      setStatus('Please choose a PDF file.', 'error');
      return;
    }
    selectedFile = file;
    uploadArea.textContent = `Selected: ${file.name} (${Math.ceil(file.size / 1024)} KB)`;
    setStatus('PDF ready to upload.', 'info');
  }

  uploadArea.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files && fileInput.files[0];
    setSelectedFile(file);
  });

  ['dragenter', 'dragover'].forEach(evt => {
    uploadArea.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      uploadArea.style.border = '2px solid #1976d2';
      uploadArea.style.background = '#eef5ff';
    });
  });
  ['dragleave', 'drop'].forEach(evt => {
    uploadArea.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      uploadArea.style.border = '';
      uploadArea.style.background = '';
    });
  });
  uploadArea.addEventListener('drop', (e) => {
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    setSelectedFile(file);
  });

  async function performUpload() {
    if (!selectedFile) {
      setStatus('Please select a PDF first.', 'error');
      return null;
    }

    try {
      const fileDataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Failed to read PDF file.'));
        reader.readAsDataURL(selectedFile);
      });

      const response = await fetch('/api/uploads/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_name: selectedFile.name,
          file_data: fileDataUrl,
          uploaded_by: 'user@example.com'
        })
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Upload failed.');
      }

      setStatus(`PDF uploaded successfully (Upload ID: ${result.upload_id}).`, 'success');
      if (window.QC) window.QC.toast('PDF uploaded successfully', 'success');
      await fetchAndRenderPdfUploads({ highlightUploadId: result.upload_id });
      return result;
    } catch (err) {
      setStatus(`Upload failed: ${err.message}`, 'error');
      if (window.QC) window.QC.toast('PDF upload failed', 'error');
      return null;
    }
  }

  async function performSync() {
    setStatus('Sync in progress...', 'info');

    try {
      const response = await fetch('/api/recipes/sync-from-uploads', { method: 'POST' });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Sync failed.');
      }

      setStatus(`Sync complete: ${result.inserted} recipes added.`, 'success');
      if (window.QC) window.QC.toast('Sync complete', 'success');
      await fetchAndRenderPdfUploads();
      return true;
    } catch (err) {
      setStatus(`Sync failed: ${err.message}`, 'error');
      if (window.QC) window.QC.toast('Sync failed', 'error');
      return false;
    }
  }

  uploadBtn.addEventListener('click', async () => {
    uploadBtn.disabled = true;
    if (uploadAndSyncBtn) uploadAndSyncBtn.disabled = true;
    const originalLabel = uploadBtn.textContent;
    uploadBtn.textContent = 'Uploading...';

    try {
      await performUpload();
    } finally {
      uploadBtn.disabled = false;
      if (uploadAndSyncBtn) uploadAndSyncBtn.disabled = false;
      uploadBtn.textContent = originalLabel;
    }
  });

  if (uploadAndSyncBtn) {
    uploadAndSyncBtn.addEventListener('click', async () => {
      if (!selectedFile) {
        setStatus('Please select a PDF first.', 'error');
        return;
      }

      uploadAndSyncBtn.disabled = true;
      uploadBtn.disabled = true;
      if (syncBtn) syncBtn.disabled = true;

      const originalCombinedLabel = uploadAndSyncBtn.textContent;
      const originalUploadLabel = uploadBtn.textContent;
      const originalSyncLabel = syncBtn ? syncBtn.textContent : '';

      uploadAndSyncBtn.textContent = 'Uploading...';
      uploadBtn.textContent = 'Uploading...';

      try {
        const uploadResult = await performUpload();
        if (!uploadResult || !uploadResult.success) return;

        if (syncBtn) syncBtn.textContent = 'Syncing...';
        uploadAndSyncBtn.textContent = 'Syncing...';
        await performSync();
      } finally {
        uploadAndSyncBtn.disabled = false;
        uploadBtn.disabled = false;
        if (syncBtn) syncBtn.disabled = false;

        uploadAndSyncBtn.textContent = originalCombinedLabel;
        uploadBtn.textContent = originalUploadLabel;
        if (syncBtn) syncBtn.textContent = originalSyncLabel;
      }
    });
  }

  if (syncBtn) {
    syncBtn.addEventListener('click', async () => {
      if (!confirm('This will insert any uploaded recipes not yet in the Recipes table. Continue?')) {
        return;
      }

      syncBtn.disabled = true;
      if (uploadAndSyncBtn) uploadAndSyncBtn.disabled = true;
      const originalLabel = syncBtn.textContent;
      syncBtn.textContent = 'Syncing...';

      try {
        await performSync();
      } finally {
        syncBtn.disabled = false;
        if (uploadAndSyncBtn) uploadAndSyncBtn.disabled = false;
        syncBtn.textContent = originalLabel;
      }
    });
  }

  fetchAndRenderPdfUploads().catch(err => {
    setStatus('Failed to load uploaded PDFs: ' + err.message, 'error');
  });
});

async function fetchAndRenderPdfUploads(options = {}) {
  const { highlightUploadId = null } = options;
  const res = await fetch('/api/uploads');
  const rows = await res.json();
  const tbody = document.querySelector('#uploadedPdfTable tbody');
  if (!tbody) return;

  const pdfRows = (Array.isArray(rows) ? rows : []).filter(r => String(r.upload_type || '').toLowerCase() === 'pdf');
  tbody.innerHTML = '';
  let highlightedRow = null;

  pdfRows.forEach(upload => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${upload.id}</td>
      <td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${upload.recipe_title || ''}</td>
      <td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${upload.upload_type || ''}</td>
      <td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${upload.source_url ? `<a href='${upload.source_url}' target='_blank'>Source File</a>` : ''}</td>
      <td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${upload.uploaded_by || ''}</td>
      <td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${upload.upload_date || ''}</td>
      <td style='border:1px solid #eee;padding:0.5rem 0.7rem;'><button class='delete-upload-btn' data-id='${upload.id}' style='background:#e53935;color:#fff;border:none;padding:0.4rem 0.8rem;border-radius:4px;cursor:pointer;'>Delete</button></td>
    `;

    if (highlightUploadId && String(upload.id) === String(highlightUploadId)) {
      tr.style.background = '#fff8d6';
      highlightedRow = tr;
    }

    tbody.appendChild(tr);
  });

  document.querySelectorAll('.delete-upload-btn').forEach(btn => {
    btn.addEventListener('click', async function() {
      const id = this.getAttribute('data-id');
      if (!confirm('Are you sure you want to delete this upload record?')) return;
      const resp = await fetch(`/api/uploads/${id}`, { method: 'DELETE' });
      const result = await resp.json();
      if (!result.success) {
        showPdfStatus('Failed to delete upload record.', 'error');
        return;
      }
      fetchAndRenderPdfUploads();
    });
  });

  if (highlightedRow) {
    highlightedRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => {
      highlightedRow.style.background = '';
    }, 2200);
  }
}
