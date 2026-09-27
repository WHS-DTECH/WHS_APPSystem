// ── Profile Page JS ────────────────────────────────────────────────────────

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

function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 3);
}

function getPrimaryRole(roles) {
  const priority = ['Admin', 'Lead Teacher', 'Teacher', 'Technician', 'Manager', 'Staff', 'Student'];
  for (const p of priority) {
    if (roles.some(r => r.role === p)) return p;
  }
  return 'Member';
}

fetch('/api/user')
  .then(res => res.json())
  .then(async user => {
    // Update nav chip
    const signInBtn = document.getElementById('googleSignIn');
    const chip = document.getElementById('userChip');

    if (user) {
      if (signInBtn) signInBtn.style.display = 'none';
      if (chip) chip.style.display = 'inline-flex';

      const initialsEl = document.getElementById('userInitials');
      if (initialsEl) initialsEl.textContent = getInitials(user.name);

      // Fetch roles for nav chip + admin menu
      let roles = [];
      try {
        const rolesRes = await fetch('/api/my-roles');
        roles = await rolesRes.json();
        const roleEl = document.getElementById('userRoleBadge');
        if (roleEl) roleEl.textContent = getPrimaryRole(roles);
        if (roles.some(r => r.role === 'Admin')) {
          const adminMenu = document.getElementById('adminMenu');
          if (adminMenu) adminMenu.style.display = 'flex';
        }
      } catch {}

      // Show profile content
      document.getElementById('profileContent').style.display = 'block';
      document.getElementById('notLoggedIn').style.display = 'none';

      // Avatar or initial
      const pic = document.getElementById('profilePic');
      const initial = document.getElementById('profileInitial');
      if (user.picture) {
        pic.src = user.picture;
        pic.alt = user.name;
        pic.style.display = 'block';
        initial.style.display = 'none';
      } else {
        pic.style.display = 'none';
        initial.style.display = 'flex';
        initial.textContent = user.name ? user.name.charAt(0).toUpperCase() : '?';
      }

      // Hero info
      document.getElementById('profileName').textContent = user.name || '—';
      document.getElementById('profileEmail').textContent = user.email || '—';

      // Member since
      const since = user.created_at
        ? new Date(user.created_at).toLocaleDateString('en-NZ', { year: 'numeric', month: 'long', day: 'numeric' })
        : '—';
      document.getElementById('profileSince').textContent = `Joined ${since}`;

      // Detail fields
      document.getElementById('detailName').textContent = user.name || '—';
      document.getElementById('detailEmail').textContent = user.email || '—';
      document.getElementById('detailId').textContent = `#${user.id}`;
      document.getElementById('detailSince').textContent = since;

      // Connection
      document.getElementById('connectionEmail').textContent = user.email || '—';

      const profileSignOutBtn = document.getElementById('profileSignOutBtn');
      if (profileSignOutBtn && user.csrfToken && !profileSignOutBtn.dataset.bound) {
        profileSignOutBtn.dataset.bound = '1';
        profileSignOutBtn.addEventListener('click', async () => {
          profileSignOutBtn.disabled = true;
          try {
            const response = await fetch('/auth/logout', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-csrf-token': user.csrfToken,
              },
              body: JSON.stringify({}),
            });

            if (!response.ok) {
              throw new Error('Sign out failed');
            }

            window.location.href = '/';
          } catch {
            profileSignOutBtn.disabled = false;
          }
        });
      }

    } else {
      document.getElementById('notLoggedIn').style.display = 'flex';
      document.getElementById('profileContent').style.display = 'none';
    }
  })
  .catch(() => {
    document.getElementById('notLoggedIn').style.display = 'flex';
    document.getElementById('profileContent').style.display = 'none';
  });
