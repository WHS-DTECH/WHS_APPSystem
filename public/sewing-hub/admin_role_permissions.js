const form = document.getElementById('permissions-form');
const resetBtn = document.getElementById('permissions-reset');
const tbody = document.querySelector('.permissions-table tbody');

let defaults = [];

function prettyRole(role) {
  return String(role || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function rowTemplate(r) {
  const role = r.role_name;
  const adminDisabled = role && role.toLowerCase() === 'admin' ? 'disabled' : '';

  return `
    <tr data-role-name="${escapeHtml(role)}">
      <td>${escapeHtml(prettyRole(role))}</td>
      <td><input type="checkbox" data-key="recipes" ${r.recipes ? 'checked' : ''} ${adminDisabled} /></td>
      <td><input type="checkbox" data-key="add_recipes" ${r.add_recipes ? 'checked' : ''} ${adminDisabled} /></td>
      <td><input type="checkbox" data-key="inventory" ${r.inventory ? 'checked' : ''} ${adminDisabled} /></td>
      <td><input type="checkbox" data-key="planning" ${r.planning ? 'checked' : ''} ${adminDisabled} /></td>
      <td><input type="checkbox" data-key="admin" ${r.admin ? 'checked' : ''} ${adminDisabled} /></td>
    </tr>
  `;
}

async function loadPermissions() {
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="6">Loading...</td></tr>';

  try {
    const res = await fetch('/api/admin/role-permissions', { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to load permissions');

    const roles = await res.json();
    const uniqueByRole = new Map();
    for (const role of roles) {
      const key = String(role?.role_name || '').trim().toLowerCase();
      if (!key || uniqueByRole.has(key)) continue;
      uniqueByRole.set(key, role);
    }

    const roleOrder = ['admin', 'lead teacher', 'teacher', 'technician', 'staff', 'student', 'public access'];
    const normalizedRoles = Array.from(uniqueByRole.values()).sort((a, b) => {
      const aRole = String(a.role_name || '').trim().toLowerCase();
      const bRole = String(b.role_name || '').trim().toLowerCase();
      const aIdx = roleOrder.indexOf(aRole);
      const bIdx = roleOrder.indexOf(bRole);
      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
      if (aIdx !== -1) return -1;
      if (bIdx !== -1) return 1;
      return aRole.localeCompare(bRole);
    });

    if (!normalizedRoles.length) {
      tbody.innerHTML = '<tr><td colspan="6">No permission rows found.</td></tr>';
      return;
    }

    defaults = normalizedRoles.map((r) => ({ ...r }));
    tbody.innerHTML = normalizedRoles.map(rowTemplate).join('');
  } catch (_err) {
    tbody.innerHTML = '<tr><td colspan="6">Could not load permissions.</td></tr>';
  }
}

if (form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const rows = Array.from(tbody.querySelectorAll('tr[data-role-name]'));
    const roles = rows.map((tr) => ({
      role_name: tr.getAttribute('data-role-name'),
      recipes: !!tr.querySelector('[data-key="recipes"]')?.checked,
      add_recipes: !!tr.querySelector('[data-key="add_recipes"]')?.checked,
      inventory: !!tr.querySelector('[data-key="inventory"]')?.checked,
      planning: !!tr.querySelector('[data-key="planning"]')?.checked,
      admin: !!tr.querySelector('[data-key="admin"]')?.checked,
    }));

    try {
      const res = await fetch('/api/admin/role-permissions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ roles }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save permissions');

      alert('Permissions saved.');
      await loadPermissions();
    } catch (err) {
      alert(err.message || 'Could not save permissions');
    }
  });

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (!defaults.length) return;
      tbody.innerHTML = defaults.map(rowTemplate).join('');
    });
  }
}

loadPermissions();

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
