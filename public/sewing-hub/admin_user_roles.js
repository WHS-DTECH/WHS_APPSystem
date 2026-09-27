const form = document.getElementById('role-form');
const tableBody = document.querySelector('#user-roles-table tbody');

async function loadUserRoles() {
  if (!tableBody) return;

  tableBody.innerHTML = '<tr><td colspan="4">Loading...</td></tr>';

  try {
    const res = await fetch('/api/admin/user-roles', { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to load roles');

    const rows = await res.json();
    if (!rows.length) {
      tableBody.innerHTML = '<tr><td colspan="4">No users found.</td></tr>';
      return;
    }

    tableBody.innerHTML = rows.map((r) => {
      const displayName = r.name || nameFromEmail(r.email);
      const rolesHtml = (r.roles || []).length
        ? r.roles.map((role) => `<span class="chip chip-danger">${escapeHtml(role)}</span>`).join(' ')
        : '<span class="chip">None</span>';

      return `
        <tr>
          <td><span class="chip">${escapeHtml(r.user_type || 'Staff')}</span></td>
          <td>
            <strong>${escapeHtml(r.email)}</strong>
            <div>${escapeHtml(displayName)}</div>
          </td>
          <td>${rolesHtml}</td>
          <td>${(r.roles || []).map((role) => `<button class="admin-danger-btn" type="button" data-email="${escapeHtml(r.email)}" data-role="${escapeHtml(role)}">Remove ${escapeHtml(role)}</button>`).join(' ')}</td>
        </tr>
      `;
    }).join('');
  } catch (_err) {
    tableBody.innerHTML = '<tr><td colspan="4">Could not load role data.</td></tr>';
  }
}

if (form && tableBody) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const user_type = document.getElementById('user-type').value;
    const email = document.getElementById('user-email').value.trim().toLowerCase();
    const role = document.getElementById('role-to-add').value;

    if (!user_type || !email || !role) return;

    try {
      const res = await fetch('/api/admin/user-roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ user_type, email, role }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save role');

      form.reset();
      await loadUserRoles();
    } catch (err) {
      alert(err.message || 'Could not add role');
    }
  });

  tableBody.addEventListener('click', async (e) => {
    const btn = e.target.closest('.admin-danger-btn');
    if (!btn) return;

    const email = btn.getAttribute('data-email');
    const role = btn.getAttribute('data-role') || btn.textContent.replace('Remove ', '');
    if (!email || !role) return;

    try {
      const res = await fetch('/api/admin/user-roles', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, role }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to remove role');

      await loadUserRoles();
    } catch (err) {
      alert(err.message || 'Could not remove role');
    }
  });
}

loadUserRoles();

function nameFromEmail(email) {
  const name = email.split('@')[0].replace(/[._-]/g, ' ');
  return name.replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
