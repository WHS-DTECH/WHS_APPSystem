// ── Role Permissions Management ────────────────────────────────────────────

const ROLES = ['Admin', 'Lead Teacher', 'Teacher', 'Technician', 'Staff', 'Student', 'Public Access'];
const PAGES = [
  { key: 'homepage',      label: 'Homepage' },
  { key: 'add_projects',  label: 'Add Projects' },
  { key: 'view_projects', label: 'View Projects' },
  { key: 'planning',      label: 'Planning' },
  { key: 'admin',         label: 'Admin' },
];

// Current state: { role: { page: bool } }
let permState = {};

function buildDefaultState() {
  const defaults = {
    'Admin':         { homepage: true,  add_projects: true,  view_projects: true,  planning: true,  admin: true  },
    'Lead Teacher':  { homepage: true,  add_projects: true,  view_projects: true,  planning: true,  admin: false },
    'Teacher':       { homepage: true,  add_projects: false, view_projects: true,  planning: true,  admin: false },
    'Technician':    { homepage: true,  add_projects: false, view_projects: true,  planning: false, admin: false },
    'Staff':         { homepage: true,  add_projects: false, view_projects: true,  planning: false, admin: false },
    'Student':       { homepage: true,  add_projects: false, view_projects: true,  planning: false, admin: false },
    'Public Access': { homepage: true,  add_projects: false, view_projects: false, planning: false, admin: false },
  };
  return defaults;
}

function applyPermissions(rows) {
  // Start from defaults so all combos exist
  permState = buildDefaultState();
  rows.forEach(r => {
    if (!permState[r.role]) permState[r.role] = {};
    permState[r.role][r.page] = r.allowed;
  });
}

function renderTable() {
  const tbody = document.getElementById('permTableBody');
  tbody.innerHTML = ROLES.map(role => {
    const cells = PAGES.map(p => {
      const checked = permState[role]?.[p.key] ? 'checked' : '';
      // Admin always has homepage locked on
      const locked = (role === 'Admin' && p.key === 'homepage') ? 'disabled' : '';
      return `<td class="perm-check-cell">
        <input type="checkbox" class="perm-cb" data-role="${role}" data-page="${p.key}" ${checked} ${locked} />
      </td>`;
    }).join('');
    return `<tr>
      <td class="perm-role-name">${role}</td>
      ${cells}
    </tr>`;
  }).join('');

  // Listen for checkbox changes
  document.querySelectorAll('.perm-cb').forEach(cb => {
    cb.addEventListener('change', () => {
      const { role, page } = cb.dataset;
      if (!permState[role]) permState[role] = {};
      permState[role][page] = cb.checked;
    });
  });
}

function showMsg(text, type = 'success') {
  const el = document.getElementById('saveMsg');
  el.textContent = text;
  el.className = `admin-msg admin-msg-${type}`;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 4000);
}

async function loadPermissions() {
  try {
    const res = await fetch('/api/admin/permissions');
    if (!res.ok) throw new Error(await res.text());
    const rows = await res.json();
    applyPermissions(rows);
    renderTable();
  } catch (e) {
    document.getElementById('permTableBody').innerHTML =
      `<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--danger)">Error: ${e.message}</td></tr>`;
  }
}

// Save
document.getElementById('saveBtn').addEventListener('click', async () => {
  const permissions = [];
  ROLES.forEach(role => {
    PAGES.forEach(p => {
      permissions.push({ role, page: p.key, allowed: permState[role]?.[p.key] ?? false });
    });
  });

  try {
    const res = await fetch('/api/admin/permissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ permissions }),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    showMsg('Permissions saved successfully.', 'success');
  } catch (e) {
    showMsg(`Failed to save: ${e.message}`, 'error');
  }
});

// Reset to defaults
document.getElementById('resetBtn').addEventListener('click', async () => {
  if (!confirm('Reset all permissions to defaults? This cannot be undone.')) return;
  try {
    const res = await fetch('/api/admin/permissions/reset', { method: 'POST' });
    if (!res.ok) throw new Error((await res.json()).error);
    showMsg('Permissions reset to defaults.', 'success');
    loadPermissions();
  } catch (e) {
    showMsg(`Failed to reset: ${e.message}`, 'error');
  }
});

// Admin dropdown toggle
document.addEventListener('DOMContentLoaded', () => {
  const dropdown = document.getElementById('adminMenu');
  if (!dropdown) return;
  const btn = dropdown.querySelector('.nav-dropdown-btn');
  if (btn) {
    btn.addEventListener('click', e => { e.stopPropagation(); dropdown.classList.toggle('open'); });
    document.addEventListener('click', () => dropdown.classList.remove('open'));
  }
});

// ── Init ────────────────────────────────────────────────────────
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
      const signInBtn = document.getElementById('googleSignIn');
      const chip = document.getElementById('userChip');
      if (signInBtn) signInBtn.style.display = 'none';
      if (chip) chip.style.display = 'inline-flex';
      const initialsEl = document.getElementById('userInitials');
      if (initialsEl) initialsEl.textContent = getInitials(user.name);

      const rolesRes = await fetch('/api/my-roles');
      const roles = await rolesRes.json();
      const roleEl = document.getElementById('userRoleBadge');
      if (roleEl) roleEl.textContent = getPrimaryRole(roles);
      const isAdmin = roles.some(r => r.role === 'Admin');

      if (isAdmin) {
        document.getElementById('adminContent').style.display = 'block';
        const adminMenu = document.getElementById('adminMenu');
        if (adminMenu) adminMenu.style.display = 'flex';
        loadPermissions();
      } else {
        document.getElementById('accessDenied').style.display = 'block';
      }
    } else {
      document.getElementById('accessDenied').style.display = 'block';
    }
  })
  .catch(() => {
    document.getElementById('accessDenied').style.display = 'block';
  });
