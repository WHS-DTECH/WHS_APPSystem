function formatDatePart(value) {
  if (!value) return 'Unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString();
}

function safeText(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

let currentAuthUser = null;

function isAdminUser(user) {
  return Boolean(user && user.email && String(user.role || '').trim().toLowerCase() === 'admin');
}

function showProjectLinkStatus(message, isError) {
  const statusEl = document.getElementById('projectLinkStatus');
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.className = `project-link-status ${isError ? 'err' : 'ok'}`;
  statusEl.style.display = message ? 'block' : 'none';
}

function applyProjectLinkEditorVisibility() {
  const form = document.getElementById('projectLinkForm');
  if (!form) return;
  form.style.display = isAdminUser(currentAuthUser) ? 'grid' : 'none';
}

function renderProjectLinks(links) {
  const listEl = document.getElementById('projectLinksList');
  if (!listEl) return;

  const rows = Array.isArray(links) ? links : [];
  if (!rows.length) {
    listEl.innerHTML = '<div class="project-link-card">No linked projects yet.</div>';
    return;
  }

  const adminEnabled = isAdminUser(currentAuthUser);
  listEl.innerHTML = rows.map((row) => {
    const name = safeText(row.site_name || 'Project');
    const url = safeText(row.site_url || '');
    const id = Number(row.id || 0);
    return `
      <article class="project-link-card">
        <p class="project-link-card-title">${name}</p>
        <a class="project-link-card-url" href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>
        ${adminEnabled ? `<div class="project-link-card-actions"><button type="button" class="project-link-delete" data-project-id="${id}">Remove</button></div>` : ''}
      </article>
    `;
  }).join('');

  if (adminEnabled) {
    Array.from(document.querySelectorAll('.project-link-delete')).forEach((button) => {
      button.addEventListener('click', async () => {
        const projectId = Number(button.dataset.projectId || 0);
        if (!Number.isInteger(projectId) || projectId <= 0) return;
        if (!confirm('Remove this project link?')) return;
        await deleteProjectLink(projectId);
      });
    });
  }
}

async function loadProjectLinks() {
  try {
    const res = await fetch('/api/projects/links');
    const payload = await res.json();
    if (!res.ok || !payload.success) {
      throw new Error(payload.error || 'Failed to load project links.');
    }
    renderProjectLinks(payload.links || []);
  } catch (err) {
    renderProjectLinks([]);
    showProjectLinkStatus(err.message || 'Failed to load project links.', true);
  }
}

async function addProjectLink(siteName, siteUrl) {
  try {
    const res = await fetch('/api/projects/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ site_name: siteName, site_url: siteUrl })
    });
    const payload = await res.json();
    if (!res.ok || !payload.success) {
      throw new Error(payload.error || 'Failed to add project link.');
    }

    showProjectLinkStatus('Project link added.', false);
    await loadProjectLinks();
    return true;
  } catch (err) {
    showProjectLinkStatus(err.message || 'Failed to add project link.', true);
    return false;
  }
}

async function deleteProjectLink(projectId) {
  try {
    const res = await fetch(`/api/projects/links/${projectId}`, { method: 'DELETE' });
    const payload = await res.json();
    if (!res.ok || !payload.success) {
      throw new Error(payload.error || 'Failed to remove project link.');
    }
    showProjectLinkStatus('Project link removed.', false);
    await loadProjectLinks();
  } catch (err) {
    showProjectLinkStatus(err.message || 'Failed to remove project link.', true);
  }
}

function initProjectLinksForm() {
  const form = document.getElementById('projectLinkForm');
  const nameInput = document.getElementById('projectSiteName');
  const urlInput = document.getElementById('projectSiteUrl');
  if (!form || !nameInput || !urlInput) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const siteName = String(nameInput.value || '').trim();
    const siteUrl = String(urlInput.value || '').trim();
    if (!siteName || !siteUrl) {
      showProjectLinkStatus('Enter both site name and URL.', true);
      return;
    }

    const ok = await addProjectLink(siteName, siteUrl);
    if (ok) {
      nameInput.value = '';
      urlInput.value = '';
    }
  });
}

function updateStatCard(prefix, item) {
  const currentEl = document.getElementById(`${prefix}Current`);
  const metaEl = document.getElementById(`${prefix}Meta`);
  if (!currentEl || !metaEl) return;

  const counts = (item && item.counts) || {};
  const latest = (item && item.latest_upload) || {};
  const hideCount = prefix === 'timetable';
  currentEl.style.display = hideCount ? 'none' : '';
  if (!hideCount) {
    currentEl.textContent = String(Number(counts.current || 0));
  }

  const uploadYear = latest.upload_year != null ? latest.upload_year : '-';
  const uploadTerm = latest.upload_term || '-';
  const uploadDate = formatDatePart(latest.upload_date);
  if (hideCount) {
    metaEl.textContent = `Last upload: ${uploadYear} ${uploadTerm} (${uploadDate})`;
  } else {
    metaEl.textContent = `Total: ${Number(counts.total || 0)} | Last upload: ${uploadYear} ${uploadTerm} (${uploadDate})`;
  }
}

async function loadDashboardStats() {
  try {
    const res = await fetch('/api/feed/summary/current-counts');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load summary.');

    updateStatCard('staff', data.staff);
    updateStatCard('student', data.students);
    updateStatCard('timetable', data.timetable);

    const generatedAtEl = document.getElementById('dashboardUpdated');
    if (generatedAtEl) {
      generatedAtEl.textContent = new Date(data.generated_at).toLocaleTimeString();
    }
  } catch (err) {
    ['staffMeta', 'studentMeta', 'timetableMeta'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.textContent = `Error: ${err.message || err}`;
    });
  }
}

function persistSessionUser(user) {
  localStorage.setItem('kamarAuthUser', JSON.stringify(user || null));
  if (user && user.email) {
    sessionStorage.setItem('currentStaffUser', JSON.stringify({ email_school: user.email }));
  } else {
    sessionStorage.removeItem('currentStaffUser');
  }
  sessionStorage.setItem('navbar_user_role', String((user && user.role) || 'guest'));
  window.dispatchEvent(new Event('kamar-auth-changed'));
}

function renderUserPanel(user, hintMessage) {
  const panel = document.getElementById('currentUserPanel');
  const hint = document.getElementById('authHint');
  const signOutBtn = document.getElementById('signOutBtn');
  const googleTarget = document.getElementById('googleSignInTarget');

  if (!panel || !hint || !signOutBtn || !googleTarget) return;

  if (user && user.email) {
    panel.innerHTML = `
      <div class="current-user-row"><strong>${safeText(user.name || user.email)}</strong></div>
      <div class="current-user-row">${safeText(user.email)}</div>
      <div class="current-user-row">Role: ${safeText(String(user.role || 'guest').toUpperCase())}</div>
      <div class="current-user-row">Staff record: ${user.in_staff_upload ? 'Yes' : 'No'}</div>
      <div class="current-user-row">Student record: ${user.in_student_upload ? 'Yes' : 'No'}</div>
    `;
    hint.textContent = hintMessage || 'Signed in with Google.';
    signOutBtn.style.display = 'inline-flex';
    googleTarget.style.display = 'none';
    return;
  }

  panel.textContent = 'Not signed in.';
  hint.textContent = hintMessage || 'Use your school Google account to continue.';
  signOutBtn.style.display = 'none';
  googleTarget.style.display = 'block';
}

async function bootstrapExistingSession() {
  try {
    const res = await fetch('/api/auth/session');
    if (!res.ok) {
      localStorage.removeItem('kamarAuthUser');
      renderUserPanel(null);
      currentAuthUser = null;
      applyProjectLinkEditorVisibility();
      return null;
    }

    const payload = await res.json();
    if (!payload.success || !payload.user) {
      localStorage.removeItem('kamarAuthUser');
      renderUserPanel(null);
      currentAuthUser = null;
      applyProjectLinkEditorVisibility();
      return null;
    }

    persistSessionUser(payload.user);
    renderUserPanel(payload.user);
    currentAuthUser = payload.user;
    applyProjectLinkEditorVisibility();
    return payload.user;
  } catch (_err) {
    renderUserPanel(null, 'Could not confirm session.');
    currentAuthUser = null;
    applyProjectLinkEditorVisibility();
    return null;
  }
}

async function initGoogleSignIn() {
  const target = document.getElementById('googleSignInTarget');
  if (!target) return;

  // Sign-in is handled by the app's Google login, so link to it instead of loading Google Identity Services.
  target.innerHTML = currentAuthUser ? '' : '<a class="subtle-btn" href="/auth/google">Sign in with Google</a>';
}

window.addEventListener('DOMContentLoaded', async () => {
  initProjectLinksForm();
  applyProjectLinkEditorVisibility();
  await loadProjectLinks();
  await loadDashboardStats();
  await bootstrapExistingSession();
  await initGoogleSignIn();

  const signOutBtn = document.getElementById('signOutBtn');
  if (signOutBtn) {
    signOutBtn.addEventListener('click', async () => {
      try {
        await fetch('/api/auth/logout', { method: 'POST' });
      } catch (_err) {
        // Ignore network errors.
      }

      localStorage.removeItem('kamarAuthUser');
      sessionStorage.removeItem('currentStaffUser');
      sessionStorage.removeItem('navbar_user_role');
      window.dispatchEvent(new Event('kamar-auth-changed'));
      renderUserPanel(null, 'Signed out.');
      currentAuthUser = null;
      applyProjectLinkEditorVisibility();
      window.location.href = '/';
    });
  }
});
