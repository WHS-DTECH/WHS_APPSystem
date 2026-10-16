(function loadNav() {
  const host = document.getElementById('navbar-include');
  if (!host) return;

  const base = '/admin/kamar-uploader/';
  const links = [
    { href: base, label: 'Home', permission: 'homepage' },
    { href: base + 'staff_upload.html', label: 'Staff Upload', permission: 'staff_upload' },
    { href: base + 'student_details_upload.html', label: 'Student Upload', permission: 'student_upload' },
    { href: base + 'student_upload.html', label: 'Student Timetable', permission: 'student_timetable' },
    { href: base + 'timetable_upload.html', label: 'Staff Timetable', permission: 'staff_timetable' }
  ];

  // Roles and access are managed in the main app, not in this site.
  const adminLinks = [
    { href: '/admin/users', label: 'User Role Management' }
  ];

  const pagePermissionMap = {
    'staff_upload.html': 'staff_upload',
    'student_details_upload.html': 'student_upload',
    'student_upload.html': 'student_timetable',
    'timetable_upload.html': 'staff_timetable'
  };

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function getAuthUser() {
    try {
      const raw = localStorage.getItem('kamarAuthUser');
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_err) {
      return null;
    }
  }

  function hasPermission(user, permission) {
    if (!permission) return true;
    if (!user || !user.email) return permission === 'homepage';
    const perms = user.permissions || {};
    return Boolean(perms[permission]);
  }

  function enforceRouteAccess(user) {
    const pathName = String(window.location.pathname || '').toLowerCase().split('/').pop();
    const requiredPermission = pagePermissionMap[pathName];
    if (!requiredPermission) return;

    if (!user || !user.email || !hasPermission(user, requiredPermission)) {
      window.location.href = base;
    }
  }

  function renderNavLinks(user) {
    return links
      .filter((link) => hasPermission(user, link.permission))
      .map((link) => `<a href="${link.href}">${link.label}</a>`)
      .join('');
  }

  function renderAdminMenu(user) {
    const role = String((user && user.role) || '').trim().toLowerCase();
    if (!user || !user.email || role !== 'admin' || !hasPermission(user, 'admin_menu')) {
      return '';
    }

    return `
      <div class="top-nav-admin-menu">
        <button type="button" class="top-nav-admin-btn">Admin</button>
        <div class="top-nav-admin-dropdown">
          ${adminLinks.map((item) => `<a href="${item.href}">${item.label}</a>`).join('')}
        </div>
      </div>
    `;
  }

  function applyNav() {
    const user = getAuthUser();
    enforceRouteAccess(user);

    const signedIn = Boolean(user && user.email);
    const userText = signedIn
      ? `${user.name || user.email} (${String(user.role || 'guest').toUpperCase()})`
      : 'Not signed in';

    host.innerHTML = `
      <nav class="top-nav" aria-label="Main navigation">
        <div class="top-nav-inner">
          <div class="top-nav-links">
            ${renderNavLinks(user)}
            ${renderAdminMenu(user)}
          </div>
          <div class="top-nav-user">
            <span class="top-nav-user-chip">${escapeHtml(userText)}</span>
            ${signedIn
              ? '<button id="topNavSignOutBtn" type="button" class="top-nav-signout">Sign out</button>'
              : `<a href="/auth/google" class="top-nav-signin-link">Sign in</a>`}
          </div>
        </div>
      </nav>
    `;

    const signOutBtn = document.getElementById('topNavSignOutBtn');
    if (signOutBtn) {
      signOutBtn.addEventListener('click', async () => {
        try {
          await fetch('/api/auth/logout', { method: 'POST' });
        } catch (_err) {
          // Ignore network errors during sign out.
        }

        localStorage.removeItem('kamarAuthUser');
        sessionStorage.removeItem('currentStaffUser');
        sessionStorage.removeItem('navbar_user_role');
        window.dispatchEvent(new Event('kamar-auth-changed'));
        window.location.href = '/';
      });
    }
  }

  applyNav();
  window.addEventListener('kamar-auth-changed', applyNav);
})();
