// Role-based navbar visibility handler
// Detects user role and conditionally shows/hides admin sections
// Integrates with the permissions and user roles system

(function() {
  'use strict';

  // Store current user role in sessionStorage for use across pages
  const ROLE_STORAGE_KEY = 'navbar_user_role';
  const SUPPORTED_ROLES = ['admin', 'lead_teacher', 'teacher', 'technician', 'staff', 'student', 'public_access'];
  let permissionRows = [];
  let permissionsLoaded = false;

  function getRolePermission(roleName) {
    if (!permissionsLoaded || !Array.isArray(permissionRows) || !roleName) return null;
    return permissionRows.find((row) => String(row.role_name || '').trim().toLowerCase() === roleName) || null;
  }

  function setElementVisible(el, visible) {
    if (!el) return;
    if (visible) {
      el.style.display = '';
      el.removeAttribute('aria-hidden');
      if (el.hasAttribute('hidden')) el.hidden = false;
    } else {
      el.style.display = 'none';
      el.setAttribute('aria-hidden', 'true');
    }
  }

  function applyRoutePermissions(roleName) {
    const rolePermissions = getRolePermission(roleName);
    if (!rolePermissions) return;

    document.querySelectorAll('[data-route]').forEach((el) => {
      const routeKey = String(el.getAttribute('data-route') || '').trim();
      if (!routeKey) return;
      const hasExplicitPermission = Object.prototype.hasOwnProperty.call(rolePermissions, routeKey);
      const allowed = hasExplicitPermission ? Boolean(rolePermissions[routeKey]) : true;
      setElementVisible(el, allowed);
    });
  }

  function loadPermissions() {
    return fetch('/api/permissions/all')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch permissions');
        return res.json();
      })
      .then((data) => {
        permissionRows = Array.isArray(data.roles) ? data.roles : [];
        permissionsLoaded = true;
        return true;
      })
      .catch(() => {
        permissionsLoaded = false;
        permissionRows = [];
        return false;
      });
  }

  function normalizeRole(role) {
    const normalized = String(role || '').trim().toLowerCase();
    return SUPPORTED_ROLES.includes(normalized) ? normalized : '';
  }

  function roleFromUrlOverride() {
    const params = new URLSearchParams(window.location.search);
    return normalizeRole(params.get('role'));
  }

  function detectRoleFromPermissionsEndpoint() {
    return fetch('/api/auth/me', { credentials: 'include' })
      .then(res => {
        if (!res.ok) return '';
        return res.json();
      })
      .then(data => {
        if (data && data.authenticated && data.user && data.user.role) {
          return normalizeRole(data.user.role);
        }
        return '';
      })
      .catch(() => '');
  }
  
  /**
  * Fetch current user's role from available identity hints.
  * Never default to admin when identity is unknown.
   */
  function detectUserRole() {
    const urlRole = roleFromUrlOverride();
    if (urlRole) {
      setUserRole(urlRole);
      return;
    }

    detectRoleFromPermissionsEndpoint()
      .then(permissionRole => {
        if (permissionRole) {
          setUserRole(permissionRole);
          return;
        }

        const storedRole = getStoredUserRole();
        if (storedRole) {
          updateNavbarVisibility(storedRole);
          return;
        }

        setUserRole('public_access');
      })
      .catch(() => {
        const storedRole = getStoredUserRole();
        if (storedRole) {
          updateNavbarVisibility(storedRole);
          return;
        }
        setUserRole('public_access');
      });
  }

  /**
   * Set the user's role and update navbar visibility
   */
  function setUserRole(role) {
    const normalized = normalizeRole(role) || 'public_access';
    sessionStorage.setItem(ROLE_STORAGE_KEY, normalized);
    updateNavbarVisibility(normalized);
  }

  /**
   * Get any stored role value from session storage
   */
  function getStoredUserRole() {
    return normalizeRole(sessionStorage.getItem(ROLE_STORAGE_KEY));
  }

  /**
   * Update navbar sections based on user role
   */
  function updateNavbarVisibility(role) {
    const normalized = normalizeRole(role) || 'public_access';
    document.documentElement.setAttribute('data-navbar-role', normalized);

    const authenticatedSections = document.querySelectorAll('[data-role="authenticated"]');
    authenticatedSections.forEach(section => {
      if (normalized === 'public_access') {
        section.style.display = 'none';
        section.setAttribute('aria-hidden', 'true');
      } else {
        section.style.display = '';
        section.removeAttribute('aria-hidden');
      }
    });

    // Hide admin sections if user is not admin
    const adminSections = document.querySelectorAll('[data-role="admin"]');
    adminSections.forEach(section => {
      const isDrawerStateElement =
        section.id === 'adminManagementDrawer'
        || section.id === 'adminDrawerBackdrop'
        || section.id === 'planningDrawer'
        || section.id === 'planningDrawerBackdrop';

      if (normalized === 'admin') {
        section.style.display = '';
        section.removeAttribute('aria-hidden');
        section.setAttribute('data-user-role', normalized);

        // Keep drawer/backdrop hidden state under navbar_loader.js control.
        if (!isDrawerStateElement) {
          section.hidden = false;
        }
      } else {
        section.hidden = true;
        section.style.display = 'none';
        section.setAttribute('aria-hidden', 'true');
      }
    });

    // Planning sections are available to admin and lead_teacher.
    const planningSections = document.querySelectorAll('[data-role="planning"]');
    planningSections.forEach(section => {
      const isDrawerStateElement =
        section.id === 'planningDrawer'
        || section.id === 'planningDrawerBackdrop'
        || section.id === 'shoppingDrawer'
        || section.id === 'shoppingDrawerBackdrop';

      if (normalized === 'admin' || normalized === 'lead_teacher') {
        section.style.display = '';
        section.removeAttribute('aria-hidden');
        section.setAttribute('data-user-role', normalized);

        if (!isDrawerStateElement) {
          section.hidden = false;
        }
      } else {
        section.hidden = true;
        section.style.display = 'none';
        section.setAttribute('aria-hidden', 'true');
      }
    });

    applyRoutePermissions(normalized);
  }

  function handleAuthSessionChanged(event) {
    const user = event && event.detail ? event.detail.user : null;
    const role = normalizeRole(user && user.role);
    setUserRole(role || 'public_access');
  }

  /**
   * Initialize navbar role detection on page load
   */
  function initializeNavbarRoles() {
    const existingRole = getStoredUserRole();
    loadPermissions().finally(() => {
      if (existingRole) {
        updateNavbarVisibility(existingRole);
      }

      // Re-check from backend hints, but do not auto-promote admin.
      detectUserRole();
    });
  }

  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeNavbarRoles);
  } else {
    initializeNavbarRoles();
  }

  document.addEventListener('auth-session-changed', handleAuthSessionChanged);

  // Expose role functions globally for testing/debugging
  window.navbarRoles = {
    setRole: setUserRole,
    getRole: getStoredUserRole,
    updateVisibility: updateNavbarVisibility
  };
})();
