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

  const pagePermissionMap = {
    'staff_upload.html': 'staff_upload',
    'student_details_upload.html': 'student_upload',
    'student_upload.html': 'student_timetable',
    'timetable_upload.html': 'staff_timetable'
  };

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

  function applyNav(user) {
    enforceRouteAccess(user);

    host.innerHTML = `
      <nav class="top-nav" aria-label="Main navigation">
        <div class="top-nav-inner">
          <div class="top-nav-links">
            ${renderNavLinks(user)}
          </div>
        </div>
      </nav>
    `;
  }

  fetch('/api/auth/session', { cache: 'no-store' })
    .then(async (response) => {
      if (response.status === 401) {
        window.location.href = `/auth/google?next=${encodeURIComponent(window.location.pathname)}`;
        return;
      }
      const payload = await response.json();
      if (!response.ok || !payload.success || !payload.user || !payload.user.email) {
        throw new Error(payload.error || 'Could not confirm Kamar access.');
      }
      applyNav(payload.user);
    })
    .catch((error) => {
      console.error('[Kamar navigation] Could not confirm school session:', error);
      host.textContent = 'Kamar navigation could not be loaded. Reload to retry; account controls are in Global Control.';
      host.setAttribute('role', 'alert');
    });
})();
