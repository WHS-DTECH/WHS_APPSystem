// Dynamically set the username in the navbar and persist a reusable staff context.
// This remains demo-backed for now, but the stored shape is intended to match future auth handoff.

const CURRENT_STAFF_USER_KEY = 'currentStaffUser';
const PREFERRED_ADMIN_EMAIL = 'vanessapringle@westlandhigh.school.nz';
const ROLE_STORAGE_KEY = 'navbar_user_role';

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function persistCurrentStaffUser(user) {
  if (!user) return;
  try {
    sessionStorage.setItem(CURRENT_STAFF_USER_KEY, JSON.stringify({
      id: user.id || '',
      code: user.code || '',
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      title: user.title || '',
      email_school: user.email_school || ''
    }));
  } catch (_) {
    // Ignore storage failures and continue rendering navbar user info.
  }
}

function deriveNameFromEmail(email) {
  const local = String(email || '').split('@')[0] || 'User';
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function roleLabel(role) {
  const normalized = String(role || '').trim().toLowerCase();
  if (!normalized) return 'User';
  return normalized
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function setLinkNameWithRole(link, displayName, role) {
  if (!link) return;
  link.textContent = '';

  const nameSpan = document.createElement('span');
  nameSpan.className = 'navbar-user-name';
  nameSpan.textContent = displayName;

  const roleSpan = document.createElement('span');
  roleSpan.className = 'navbar-user-role';
  roleSpan.textContent = roleLabel(role);

  link.appendChild(nameSpan);
  link.appendChild(roleSpan);
}

function setNavbarAccountDisplay(user) {
  const link = document.getElementById('navbarUsername');
  const logoutBtn = document.querySelector('.navbar-logout-btn');
  if (!link) return;

  if (user && user.email) {
    link.classList.remove('is-google-login');
    const displayName = String(user.name || '').trim() || deriveNameFromEmail(user.email);
    setLinkNameWithRole(link, displayName, user.role);
    link.href = 'user_profile.html';

    persistCurrentStaffUser({
      id: '',
      code: '',
      first_name: displayName.split(' ')[0] || displayName,
      last_name: displayName.split(' ').slice(1).join(' '),
      title: '',
      email_school: user.email
    });

    if (logoutBtn) {
      logoutBtn.style.display = '';
      attachLogoutHandler(logoutBtn);
    }
    try {
      const role = String(user.role || '').trim().toLowerCase() || 'teacher';
      sessionStorage.setItem(ROLE_STORAGE_KEY, role);
    } catch (_) {}
    return;
  }

  link.classList.add('is-google-login');
  link.textContent = 'Login';
  link.href = 'google_login.html';
  try {
    sessionStorage.removeItem(CURRENT_STAFF_USER_KEY);
    sessionStorage.setItem(ROLE_STORAGE_KEY, 'public_access');
  } catch (_) {}
  if (logoutBtn) logoutBtn.style.display = 'none';
}

function attachLogoutHandler(logoutBtn) {
  if (!logoutBtn) return;
  logoutBtn.onclick = async function(e) {
    e.preventDefault();
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch (_) {
      // Ignore logout API errors and clear local view state anyway.
    }
    try {
      sessionStorage.removeItem(CURRENT_STAFF_USER_KEY);
      sessionStorage.removeItem(ROLE_STORAGE_KEY);
    } catch (_) {}
    window.location.href = 'index.html';
  };
}

async function setNavbarFromAuthSession() {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' });
    if (!res.ok) return false;
    const data = await res.json();
    if (data && data.authenticated && data.user) {
      setNavbarAccountDisplay(data.user);
      return true;
    }
    return false;
  } catch (_) {
    return false;
  }
}

function handleAuthSessionChanged(event) {
  const user = event && event.detail ? event.detail.user : null;
  setNavbarAccountDisplay(user);
}

function selectPreloginUser(staffRows) {
  if (!Array.isArray(staffRows) || staffRows.length === 0) return null;
  return staffRows.find((user) => normalizeEmail(user.email_school) === PREFERRED_ADMIN_EMAIL) || staffRows[0];
}

async function setNavbarUsername() {
  attachLogoutHandler(document.querySelector('.navbar-logout-btn'));

  const hasAuth = await setNavbarFromAuthSession();
  if (hasAuth) return;

  setNavbarAccountDisplay(null);
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', setNavbarUsername);
} else {
  setNavbarUsername();
}

document.addEventListener('auth-session-changed', handleAuthSessionChanged);
