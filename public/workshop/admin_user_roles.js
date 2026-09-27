// ── Admin: User Role Management ────────────────────────────────────────────
let allUsers = [];

const ROLE_COLOURS = {
  Admin:        { bg: '#fde8e8', color: '#b91c1c', border: '#fca5a5' },
  Teacher:      { bg: '#dbeafe', color: '#1d4ed8', border: '#93c5fd' },
  'Lead Teacher': { bg: '#ede9fe', color: '#6d28d9', border: '#c4b5fd' },
  Technician:   { bg: '#d1fae5', color: '#065f46', border: '#6ee7b7' },
  Student:      { bg: '#fef9c3', color: '#92400e', border: '#fde68a' },
  Manager:      { bg: '#ffedd5', color: '#c2410c', border: '#fdba74' },
};

function roleBadge(role) {
  const c = ROLE_COLOURS[role] || { bg: '#f1f5f9', color: '#334155', border: '#cbd5e1' };
  return `<span class="role-badge" style="background:${c.bg};color:${c.color};border:1px solid ${c.border}">${role}</span>`;
}

function showMsg(el, text, type = 'success') {
  el.textContent = text;
  el.className = `admin-msg admin-msg-${type}`;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 4000);
}

// Populate user dropdown
function populateUserSelect(users) {
  const sel = document.getElementById('userSelect');
  sel.innerHTML = '<option value="">— Select a user —</option>';
  users.forEach(u => {
    const opt = document.createElement('option');
    opt.value = u.id;
    opt.textContent = u.email + (u.name ? ` (${u.name})` : '');
    sel.appendChild(opt);
  });
}

// Render users-with-roles table
function renderTable(users) {
  const tbody = document.getElementById('rolesTableBody');
  const withRoles = users.filter(u => u.roles && u.roles.length > 0);

  if (withRoles.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="admin-table-empty">No users have additional roles assigned yet.</td></tr>';
    return;
  }

  tbody.innerHTML = withRoles.map(u => {
    const type = u.roles[0]?.user_type || 'Staff';
    const badges = u.roles.map(r => roleBadge(r.role)).join(' ');
    return `
      <tr>
        <td><span class="type-chip">${type}</span></td>
        <td class="user-cell">
          <span class="user-email">${u.email}</span>
          ${u.name ? `<span class="user-name">${u.name}</span>` : ''}
        </td>
        <td>${badges}</td>
        <td>
          <button class="admin-btn admin-btn-danger admin-btn-sm"
            onclick="removeAllRoles(${u.id}, '${u.email}')">
            Remove Roles
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// Load all users
async function loadUsers() {
  try {
    const res = await fetch('/api/admin/users');
    if (!res.ok) throw new Error(await res.text());
    allUsers = await res.json();
    populateUserSelect(allUsers);
    renderTable(allUsers);
  } catch (e) {
    document.getElementById('rolesTableBody').innerHTML =
      `<tr><td colspan="4" class="admin-table-empty" style="color:var(--danger)">Error loading users: ${e.message}</td></tr>`;
  }
}

// Add role
document.getElementById('addRoleBtn').addEventListener('click', async () => {
  const userId = document.getElementById('userSelect').value;
  const role = document.getElementById('roleSelect').value;
  const userType = document.getElementById('userType').value;
  const msg = document.getElementById('formMsg');

  if (!userId) return showMsg(msg, 'Please select a user.', 'error');
  if (!role) return showMsg(msg, 'Please select a role.', 'error');

  try {
    const res = await fetch('/api/admin/user-roles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: parseInt(userId), role, user_type: userType }),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    showMsg(msg, `Role "${role}" added successfully.`, 'success');
    document.getElementById('userSelect').value = '';
    document.getElementById('roleSelect').value = '';
    loadUsers();
  } catch (e) {
    showMsg(msg, `Failed: ${e.message}`, 'error');
  }
});

// Remove all roles from a user
async function removeAllRoles(userId, email) {
  if (!confirm(`Remove all additional roles from ${email}?`)) return;
  try {
    const res = await fetch(`/api/admin/user-roles/${userId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error((await res.json()).error);
    loadUsers();
  } catch (e) {
    alert(`Failed to remove roles: ${e.message}`);
  }
}

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

      // Check admin role
      const rolesRes = await fetch('/api/my-roles');
      const roles = await rolesRes.json();
      const roleEl = document.getElementById('userRoleBadge');
      if (roleEl) roleEl.textContent = getPrimaryRole(roles);
      const isAdmin = roles.some(r => r.role === 'Admin');

      if (isAdmin) {
        document.getElementById('adminContent').style.display = 'block';
        const adminMenu = document.getElementById('adminMenu');
        if (adminMenu) adminMenu.style.display = 'flex';
        loadUsers();
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
