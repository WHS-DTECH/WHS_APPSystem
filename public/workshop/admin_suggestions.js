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

// ── Init ──────────────────────────────────────────────────────────
fetch('/api/user')
  .then(res => res.json())
  .then(async user => {
    if (user) {
      document.getElementById('googleSignIn').style.display = 'none';
      const chip = document.getElementById('userChip');
      chip.style.display = 'inline-flex';
      const initialsEl = document.getElementById('userInitials');
      if (initialsEl) initialsEl.textContent = getInitials(user.name);

      try {
        const rolesRes = await fetch('/api/my-roles');
        const roles = await rolesRes.json();
        const roleEl = document.getElementById('userRoleBadge');
        if (roleEl) roleEl.textContent = getPrimaryRole(roles);

        const canView = roles.some(r => r.role === 'Admin' || r.role === 'Lead Teacher');
        if (canView) {
          document.getElementById('adminContent').style.display = 'block';
          const adminMenu = document.getElementById('adminMenu');
          if (adminMenu) adminMenu.style.display = 'flex';
          loadSuggestions();
        } else {
          document.getElementById('accessDenied').style.display = 'block';
        }
      } catch {
        document.getElementById('accessDenied').style.display = 'block';
      }
    } else {
      document.getElementById('accessDenied').style.display = 'block';
    }
  })
  .catch(() => { document.getElementById('accessDenied').style.display = 'block'; });

// ── Load Suggestions ──────────────────────────────────────────────
async function loadSuggestions() {
  try {
    const res = await fetch('/api/admin/suggestions');
    if (!res.ok) throw new Error('Failed to load');
    const suggestions = await res.json();

    const countEl = document.getElementById('suggestionCount');
    if (countEl) countEl.textContent = `${suggestions.length} suggestion${suggestions.length !== 1 ? 's' : ''}`;

    const tbody = document.getElementById('suggestionsBody');
    if (!suggestions.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="table-empty">No suggestions yet.</td></tr>';
      return;
    }

    tbody.innerHTML = suggestions.map(s => {
      const date = new Date(s.submitted_at).toISOString().slice(0, 10);
      const url = s.activity_url
        ? `<a href="${escHtml(s.activity_url)}" target="_blank" rel="noopener" class="sugg-link">View</a>`
        : '<span class="sugg-dash">—</span>';
      const pdf = s.pdf_filename
        ? `<a href="/api/admin/suggestions/${s.id}/pdf" class="sugg-pdf-link" target="_blank">📄 ${escHtml(s.pdf_filename)}</a>`
        : '<span class="sugg-dash">—</span>';
      const reason = s.reason
        ? `<span class="sugg-reason-short" title="${escHtml(s.reason)}">${escHtml(truncate(s.reason, 40))}</span>`
        : '<span class="sugg-dash">—</span>';

      return `<tr>
        <td class="sugg-date">${date}</td>
        <td class="sugg-activity"><strong>${escHtml(s.activity_name)}</strong></td>
        <td>${escHtml(s.submitter_name)}</td>
        <td><a href="mailto:${escHtml(s.submitter_email)}" class="sugg-link">${escHtml(s.submitter_email)}</a></td>
        <td>${url}</td>
        <td>${reason}</td>
        <td>${pdf}</td>
        <td><button class="btn-view-sugg" data-id="${s.id}">View</button></td>
      </tr>`;
    }).join('');

    // Store for modal
    window._suggestions = suggestions;

    // Row view buttons
    tbody.querySelectorAll('.btn-view-sugg').forEach(btn => {
      btn.addEventListener('click', () => openModal(parseInt(btn.dataset.id)));
    });

  } catch (e) {
    document.getElementById('suggestionsBody').innerHTML =
      `<tr><td colspan="8" class="table-error">Error loading suggestions: ${e.message}</td></tr>`;
  }
}

// ── Modal ─────────────────────────────────────────────────────────
function openModal(id) {
  const s = (window._suggestions || []).find(x => x.id === id);
  if (!s) return;
  const date = new Date(s.submitted_at).toISOString().slice(0, 10);
  const urlRow = s.activity_url
    ? `<a href="${escHtml(s.activity_url)}" target="_blank" rel="noopener" style="color:#1c74b9">${escHtml(s.activity_url)}</a>`
    : 'N/A';
  const pdfRow = s.pdf_filename
    ? `<a href="/api/admin/suggestions/${s.id}/pdf" target="_blank" style="color:#1c74b9">📄 ${escHtml(s.pdf_filename)}</a>`
    : '—';

  document.getElementById('modalTitle').textContent = s.activity_name;
  document.getElementById('modalBody').innerHTML = `
    <table class="modal-detail-table">
      <tr><td>Date</td><td>${date}</td></tr>
      <tr><td>Activity</td><td><strong>${escHtml(s.activity_name)}</strong></td></tr>
      <tr><td>Suggested By</td><td>${escHtml(s.submitter_name)}</td></tr>
      <tr><td>Email</td><td><a href="mailto:${escHtml(s.submitter_email)}" style="color:#1c74b9">${escHtml(s.submitter_email)}</a></td></tr>
      <tr><td>URL</td><td>${urlRow}</td></tr>
      <tr><td>PDF</td><td>${pdfRow}</td></tr>
    </table>
    ${s.reason ? `<p class="modal-reason-label">Reason</p><div class="modal-reason-box">${escHtml(s.reason)}</div>` : ''}
  `;
  document.getElementById('suggestionModal').style.display = 'flex';
}

document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('suggestionModal').addEventListener('click', e => {
  if (e.target === document.getElementById('suggestionModal')) closeModal();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

function closeModal() {
  document.getElementById('suggestionModal').style.display = 'none';
}

// ── Helpers ───────────────────────────────────────────────────────
function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function truncate(str, len) {
  return str.length > len ? str.slice(0, len) + '…' : str;
}
