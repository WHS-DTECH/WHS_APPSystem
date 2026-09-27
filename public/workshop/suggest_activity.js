// ── Admin dropdown toggle ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const dropdown = document.getElementById('adminMenu');
  if (!dropdown) return;
  const btn = dropdown.querySelector('.nav-dropdown-btn');
  if (btn) {
    btn.addEventListener('click', e => { e.stopPropagation(); dropdown.classList.toggle('open'); });
    document.addEventListener('click', () => dropdown.classList.remove('open'));
  }
});

// ── Nav chip ──────────────────────────────────────────────────────
function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 3);
}
function getPrimaryRole(roles) {
  const priority = ['Admin', 'Lead Teacher', 'Teacher', 'Technician', 'Manager', 'Staff', 'Student'];
  for (const p of priority) { if (roles.some(r => r.role === p)) return p; }
  return 'Member';
}

fetch('/api/user')
  .then(res => res.json())
  .then(async user => {
    if (user) {
      document.getElementById('googleSignIn').style.display = 'none';
      const chip = document.getElementById('userChip');
      chip.style.display = 'inline-flex';

      const initialsEl = document.getElementById('userInitials');
      if (initialsEl) initialsEl.textContent = getInitials(user.name);

      // Pre-fill form fields
      const nameInput = document.getElementById('suggestName');
      const emailInput = document.getElementById('suggestEmail');
      if (nameInput && !nameInput.value) nameInput.value = user.name || '';
      if (emailInput && !emailInput.value) emailInput.value = user.email || '';

      try {
        const rolesRes = await fetch('/api/my-roles');
        const roles = await rolesRes.json();
        const roleEl = document.getElementById('userRoleBadge');
        if (roleEl) roleEl.textContent = getPrimaryRole(roles);
        if (roles.some(r => r.role === 'Admin')) {
          const adminMenu = document.getElementById('adminMenu');
          if (adminMenu) adminMenu.style.display = 'flex';
        }
      } catch {}
    }
  })
  .catch(() => {});

// ── PDF drag-and-drop UI ──────────────────────────────────────────
const dropZone = document.getElementById('pdfDropZone');
const fileInput = document.getElementById('suggestPdf');
const fileLabel = document.getElementById('pdfFileName');

if (dropZone && fileInput) {
  dropZone.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', () => {
    const f = fileInput.files[0];
    if (f) {
      fileLabel.textContent = `${f.name} (${(f.size / 1024 / 1024).toFixed(2)} MB)`;
      dropZone.classList.add('has-file');
    } else {
      fileLabel.textContent = 'Max 10 MB';
      dropZone.classList.remove('has-file');
    }
  });

  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const dt = e.dataTransfer;
    if (dt.files.length) {
      fileInput.files = dt.files;
      fileInput.dispatchEvent(new Event('change'));
    }
  });
}

// ── Form submission ───────────────────────────────────────────────
const form = document.getElementById('suggestForm');
const status = document.getElementById('suggestStatus');
const submitBtn = document.getElementById('submitBtn');

form.addEventListener('submit', async e => {
  e.preventDefault();

  const name = document.getElementById('suggestName').value.trim();
  const email = document.getElementById('suggestEmail').value.trim();
  const activityName = document.getElementById('suggestActivity').value.trim();

  if (!name || !email || !activityName) {
    setStatus('error', 'Please fill in your name, email, and the activity name.');
    return;
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(email)) {
    setStatus('error', 'Please enter a valid email address.');
    return;
  }

  // Validate PDF size
  const pdf = fileInput.files[0];
  if (pdf && pdf.size > 10 * 1024 * 1024) {
    setStatus('error', 'PDF must be 10 MB or smaller.');
    return;
  }

  const data = new FormData(form);
  submitBtn.disabled = true;
  setStatus('loading', 'Sending your suggestion…');

  try {
    const res = await fetch('/api/suggest-activity', { method: 'POST', body: data });
    const json = await res.json();
    if (res.ok && json.success) {
      if (json.emailNotificationSent === true) {
        setStatus('success', '✅ Suggestion saved and email notification sent to Admin/Lead Teacher.');
      } else if (json.emailNotificationSent === false) {
        const reason = json.emailNotificationError ? ` Reason: ${json.emailNotificationError}` : '';
        setStatus('warning', `⚠ Suggestion saved, but email notification could not be sent right now.${reason} Admin can still view it in Activity Suggestions.`);
      } else {
        setStatus('success', '✅ Suggestion saved successfully.');
      }
      form.reset();
      if (fileLabel) { fileLabel.textContent = 'Max 10 MB'; }
      if (dropZone) dropZone.classList.remove('has-file');
    } else {
      setStatus('error', json.error || 'Something went wrong. Please try again.');
    }
  } catch {
    setStatus('error', 'Network error — please check your connection and try again.');
  } finally {
    submitBtn.disabled = false;
  }
});

function setStatus(type, msg) {
  status.textContent = `Status: ${msg}`;
  status.className = 'suggest-status ' + type;
}
