(async function initAuthNav() {
  const signoutLink = document.getElementById('google-signout');
  const avatar = document.getElementById('google-user-initials');
  const adminBadge = document.getElementById('google-admin-badge');
  const browseNavItem = document.getElementById('nav-browse-activities-item');
  const uploadNavMenuItem = document.getElementById('nav-upload-menu-item');
  const uploadNavItem = document.getElementById('nav-upload-activity-item');

  if (!signoutLink || !avatar) return;

  try {
    const res = await fetch('/api/me', { credentials: 'include' });
    const data = await res.json();

    if (!data.authenticated) {
      avatar.textContent = 'G';
      signoutLink.textContent = 'Sign in';
      signoutLink.setAttribute('href', '/auth/google');
      if (adminBadge) adminBadge.style.display = 'none';
      if (browseNavItem) browseNavItem.style.display = 'none';
      if (uploadNavMenuItem) uploadNavMenuItem.style.display = 'none';
      if (uploadNavItem) uploadNavItem.style.display = 'none';
      return;
    }

    avatar.textContent = data.user.initials || 'U';
    signoutLink.textContent = 'Sign out';
    signoutLink.setAttribute('href', '/auth/logout');

    if (data.user.canManageRoles && !data.user.isAdmin && !document.getElementById('nav-assign-roles')) {
      const link = document.createElement('a');
      link.id = 'nav-assign-roles';
      link.href = '/hubs/sewing-hub/roles';
      link.className = 'nav-signout';
      link.textContent = 'Assign User Roles';
      avatar.parentNode.insertBefore(link, avatar);
    }

    if (adminBadge) {
      if (data.user.isAdmin) {
        adminBadge.style.display = 'flex';
      } else {
        adminBadge.style.display = 'none';
      }
    }

    if (uploadNavMenuItem) {
      uploadNavMenuItem.style.display = data.user.canUploadActivity ? 'list-item' : 'none';
    }

    if (uploadNavItem) {
      uploadNavItem.style.display = data.user.canUploadActivity ? 'list-item' : 'none';
    }

    if (browseNavItem) {
      browseNavItem.style.display = data.user.canBrowseActivities ? 'list-item' : 'none';
    }
  } catch (_err) {
    avatar.textContent = 'G';
    signoutLink.textContent = 'Sign in';
    signoutLink.setAttribute('href', '/auth/google');
    if (adminBadge) adminBadge.style.display = 'none';
    if (browseNavItem) browseNavItem.style.display = 'none';
    if (uploadNavMenuItem) uploadNavMenuItem.style.display = 'none';
    if (uploadNavItem) uploadNavItem.style.display = 'none';
  }
})();

// Admin dropdown toggle
(function () {
  const toggleBtn = document.getElementById('admin-dropdown-toggle');
  const dropMenu = document.getElementById('admin-dropdown-menu');
  if (!toggleBtn || !dropMenu) return;
  toggleBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    dropMenu.classList.toggle('open');
  });
  document.addEventListener('click', function () {
    dropMenu.classList.remove('open');
  });
})();
