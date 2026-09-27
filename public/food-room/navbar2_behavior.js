// navbar2_behavior.js
// Behaviour layer for the Food Room v2 navbar (navbar2.html + navbar2.css).
// Handles: panel open/close, user-pill display, role-based visibility,
// active-link marking, logout, and keyboard/focus-trap.
//
// Replaces navbar_user.js + navbar_roles.js for the v2 HTML.

(function () {
  'use strict';

  /* ── constants ───────────────────────────────────────────── */
  var ROLE_KEY       = 'navbar_user_role';
  var STAFF_KEY      = 'currentStaffUser';
  var SHOPPING_DEFAULT_KEY = 'shopping_workflow_default';
  var SHOPPING_MODE_LEGACY = 'legacy';
  var SHOPPING_MODE_TEACHER_FIRST = 'teacher_first';
  var SUPPORTED_ROLES = ['admin','lead_teacher','teacher','technician','staff','student','public_access'];

  /* ── state ───────────────────────────────────────────────── */
  var _permissionRows   = [];
  var _permissionsLoaded = false;
  var _panelOpen        = false;
  var _userDropOpen     = false;

  /* ══ UTILITY ════════════════════════════════════════════════ */
  function normalizeRole(r) {
    var v = String(r || '').trim().toLowerCase();
    return SUPPORTED_ROLES.indexOf(v) !== -1 ? v : '';
  }

  function deriveInitials(name, email) {
    if (name && name.trim()) {
      var parts = name.trim().split(/\s+/);
      if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
      }
      return parts[0].slice(0, 2).toUpperCase();
    }
    // fallback from email local part
    var local = String(email || '').split('@')[0] || 'U';
    var bits   = local.split(/[._\-]+/).filter(Boolean);
    if (bits.length >= 2) return (bits[0][0] + bits[1][0]).toUpperCase();
    return local.slice(0, 2).toUpperCase();
  }

  function deriveNameFromEmail(email) {
    var local = String(email || '').split('@')[0] || 'User';
    return local.split(/[._\-]+/).filter(Boolean)
      .map(function(p) { return p.charAt(0).toUpperCase() + p.slice(1); })
      .join(' ');
  }

  function roleLabelText(role) {
    var v = String(role || '').trim().toLowerCase();
    if (!v) return '';
    return v.split('_').map(function(p) {
      return p.charAt(0).toUpperCase() + p.slice(1);
    }).join(' ');
  }

  function setVisible(el, show) {
    if (!el) return;
    if (show) {
      el.style.display = '';
      el.removeAttribute('aria-hidden');
      if (el.hidden) el.hidden = false;
    } else {
      el.style.display = 'none';
      el.setAttribute('aria-hidden', 'true');
    }
  }

  function getFocusable(container) {
    return Array.prototype.slice.call(
      container.querySelectorAll(
        'a[href], button:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'
      )
    ).filter(function(el) { return !el.hidden && el.offsetParent !== null; });
  }

  function normalizeShoppingMode(value) {
    return String(value || '').trim().toLowerCase() === SHOPPING_MODE_TEACHER_FIRST
      ? SHOPPING_MODE_TEACHER_FIRST
      : SHOPPING_MODE_LEGACY;
  }

  function resolveShoppingDefaultMode() {
    var mode = SHOPPING_MODE_LEGACY;

    // Server/global override hook, if present.
    if (window.__FEATURE_FLAGS && typeof window.__FEATURE_FLAGS.teacherFirstShoppingDefault !== 'undefined') {
      mode = window.__FEATURE_FLAGS.teacherFirstShoppingDefault
        ? SHOPPING_MODE_TEACHER_FIRST
        : SHOPPING_MODE_LEGACY;
    }

    // Persisted client override.
    try {
      var saved = sessionStorage.getItem(SHOPPING_DEFAULT_KEY) || localStorage.getItem(SHOPPING_DEFAULT_KEY);
      if (saved) mode = normalizeShoppingMode(saved);
    } catch (_) {}

    // Query param override: ?shopping_flow=new|legacy
    try {
      var params = new URLSearchParams(window.location.search || '');
      var flow = String(params.get('shopping_flow') || '').trim().toLowerCase();
      if (flow === 'new' || flow === 'teacher_first') {
        mode = SHOPPING_MODE_TEACHER_FIRST;
      } else if (flow === 'legacy' || flow === 'old') {
        mode = SHOPPING_MODE_LEGACY;
      }
    } catch (_) {}

    return normalizeShoppingMode(mode);
  }

  function setShoppingDefaultMode(mode) {
    var normalized = normalizeShoppingMode(mode);
    try {
      localStorage.setItem(SHOPPING_DEFAULT_KEY, normalized);
      sessionStorage.setItem(SHOPPING_DEFAULT_KEY, normalized);
    } catch (_) {}
    applyShoppingDefaultLinks(normalized);
    return normalized;
  }

  function getShoppingDefaultMode() {
    return resolveShoppingDefaultMode();
  }

  function applyShoppingDefaultLinks(mode) {
    var normalized = normalizeShoppingMode(mode);
    var target = normalized === SHOPPING_MODE_TEACHER_FIRST
      ? 'shopping_plan_setup.html'
      : 'book_the_shopping.html';

    document.querySelectorAll('a[data-route="shopping"]').forEach(function(a) {
      a.setAttribute('href', target);
      a.setAttribute('data-shopping-default', normalized);
    });

    document.documentElement.setAttribute('data-shopping-default', normalized);
  }

  /* ══ PANEL ══════════════════════════════════════════════════ */
  function openPanel() {
    var panel    = document.getElementById('nb2Panel');
    var backdrop = document.getElementById('nb2PanelBackdrop');
    var menuBtn  = document.getElementById('nb2MenuBtn');
    var hamburger = document.getElementById('nb2Hamburger');
    if (!panel || !backdrop) return;

    _panelOpen = true;
    panel.hidden = false;
    backdrop.hidden = false;
    if (menuBtn)   menuBtn.setAttribute('aria-expanded', 'true');
    if (hamburger) hamburger.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';

    // Focus first focusable element inside panel
    setTimeout(function() {
      var focusable = getFocusable(panel);
      if (focusable.length) focusable[0].focus();
    }, 30);
  }

  function closePanel(restoreTo) {
    var panel    = document.getElementById('nb2Panel');
    var backdrop = document.getElementById('nb2PanelBackdrop');
    var menuBtn  = document.getElementById('nb2MenuBtn');
    var hamburger = document.getElementById('nb2Hamburger');
    if (!panel || !backdrop) return;

    _panelOpen = false;
    panel.hidden = true;
    backdrop.hidden = true;
    if (menuBtn)   menuBtn.setAttribute('aria-expanded', 'false');
    if (hamburger) hamburger.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    if (restoreTo && typeof restoreTo.focus === 'function') restoreTo.focus();
  }

  function togglePanel(trigger) {
    if (_panelOpen) {
      closePanel(trigger);
    } else {
      openPanel();
    }
  }

  /* ══ USER DROPDOWN ══════════════════════════════════════════ */
  function openUserDrop() {
    var dd = document.getElementById('nb2UserDropdown');
    var btn = document.getElementById('nb2UserBtn');
    if (!dd || !btn) return;
    _userDropOpen = true;
    dd.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
  }

  function closeUserDrop() {
    var dd = document.getElementById('nb2UserDropdown');
    var btn = document.getElementById('nb2UserBtn');
    if (!dd || !btn) return;
    _userDropOpen = false;
    dd.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
  }

  /* ══ USER DISPLAY ═══════════════════════════════════════════ */
  function renderUser(user) {
    var userBtn      = document.getElementById('nb2UserBtn');
    var initialsEl  = document.getElementById('nb2Initials');
    var badgeEl     = document.getElementById('nb2RoleBadge');
    var fullnameEl  = document.getElementById('nb2UserFullname');
    var emailEl     = document.getElementById('nb2UserEmail');
    var logoutBtn   = document.querySelector('.nb2-logout-btn');

    if (user && user.email) {
      var displayName = String(user.name || '').trim() || deriveNameFromEmail(user.email);
      var initials    = deriveInitials(displayName, user.email);
      var role        = String(user.role || '').trim().toLowerCase();
      var roleLabel   = roleLabelText(role);

      if (initialsEl)  initialsEl.textContent = initials;
      if (userBtn) userBtn.classList.remove('nb2-user-btn--guest');
      if (badgeEl) {
        if (roleLabel) {
          badgeEl.textContent = roleLabel;
          badgeEl.hidden = false;
        } else {
          badgeEl.hidden = true;
        }
      }
      if (fullnameEl) fullnameEl.textContent = displayName;
      if (emailEl)    emailEl.textContent    = user.email;

      // Persist staff context for other pages
      try {
        sessionStorage.setItem(STAFF_KEY, JSON.stringify({
          first_name: displayName.split(' ')[0] || displayName,
          last_name:  displayName.split(' ').slice(1).join(' '),
          email_school: user.email
        }));
        if (role) sessionStorage.setItem(ROLE_KEY, role);
      } catch (_) {}

      if (logoutBtn) setVisible(logoutBtn, true);
    } else {
      // Not authenticated — show login hint
      if (initialsEl)  initialsEl.textContent = 'Google Login';
      if (userBtn) userBtn.classList.add('nb2-user-btn--guest');
      if (badgeEl)     badgeEl.hidden = true;
      if (fullnameEl)  fullnameEl.textContent = 'Not logged in';
      if (emailEl)     emailEl.textContent    = '';
      if (logoutBtn)   setVisible(logoutBtn, false);
      try { sessionStorage.removeItem(STAFF_KEY); } catch (_) {}
    }
  }

  /* ══ LOGOUT ═════════════════════════════════════════════════ */
  function attachLogout(btn) {
    if (!btn || btn.getAttribute('data-nb2-logout-bound') === '1') return;
    btn.setAttribute('data-nb2-logout-bound', '1');
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
        .catch(function() {})
        .finally(function() {
          try {
            sessionStorage.removeItem(STAFF_KEY);
            sessionStorage.removeItem(ROLE_KEY);
          } catch (_) {}
          window.location.href = 'index.html';
        });
    });
  }

  /* ══ PERMISSIONS FETCH ══════════════════════════════════════ */
  function loadPermissions() {
    return fetch('/api/permissions/all')
      .then(function(res) {
        if (!res.ok) throw new Error('permissions fetch failed');
        return res.json();
      })
      .then(function(data) {
        _permissionRows   = Array.isArray(data.roles) ? data.roles : [];
        _permissionsLoaded = true;
      })
      .catch(function() {
        _permissionsLoaded = false;
        _permissionRows   = [];
      });
  }

  function getPermRow(role) {
    if (!_permissionsLoaded || !role) return null;
    return _permissionRows.find(function(r) {
      return String(r.role_name || '').trim().toLowerCase() === role;
    }) || null;
  }

  /* ══ ROLE VISIBILITY ════════════════════════════════════════ */
  /*
   Role → what sections are visible:
     admin        : everything
     lead_teacher : planning + ft_teacher + authenticated
     teacher      : ft_teacher + authenticated
     technician   : authenticated (Book Shopping is shown via data-route="shopping")
     staff/student: authenticated (public links)
     public_access: nothing (only public links visible)
  */
  function applyRoleVisibility(role) {
    var norm = normalizeRole(role) || 'public_access';
    document.documentElement.setAttribute('data-navbar-role', norm);

    var isAdmin      = norm === 'admin';
    var isPlanning   = isAdmin || norm === 'lead_teacher';
    var isFTTeacher  = isAdmin || isPlanning || norm === 'teacher';
    var isAuth       = isAdmin || isPlanning || isFTTeacher ||
                       norm === 'technician' || norm === 'staff' || norm === 'student';

    // Panel sections
    document.querySelectorAll('[data-role="admin"]').forEach(function(el) {
      setVisible(el, isAdmin);
    });
    document.querySelectorAll('[data-role="planning"]').forEach(function(el) {
      setVisible(el, isPlanning);
    });
    document.querySelectorAll('[data-role="ft_teacher"]').forEach(function(el) {
      setVisible(el, isFTTeacher);
    });
    document.querySelectorAll('[data-role="authenticated"]').forEach(function(el) {
      setVisible(el, isAuth);
    });
    document.querySelectorAll('[data-role="guest"]').forEach(function(el) {
      setVisible(el, !isAuth);
    });

    // Route-scoped links (inline nav + panel)
    var permRow = getPermRow(norm);
    document.querySelectorAll('[data-route]').forEach(function(el) {
      var routeKey = String(el.getAttribute('data-route') || '').trim();
      if (!routeKey) return;
      var hasExplicitPermission = permRow && Object.prototype.hasOwnProperty.call(permRow, routeKey);
      var allowed = hasExplicitPermission
        ? Boolean(permRow[routeKey])
        : defaultRouteAllowed(routeKey, norm);
      setVisible(el, allowed);
    });
  }

  // Default route visibility when permissions table hasn't loaded yet.
  function defaultRouteAllowed(routeKey, role) {
    var isAdmin    = role === 'admin';
    var isPlanning = isAdmin || role === 'lead_teacher';
    var isTeacher  = isAdmin || isPlanning || role === 'teacher';
    var isAuth     = isTeacher || role === 'technician' || role === 'staff' || role === 'student';

    var map = {
      recipes:       true,
      food_truck:    isAuth,
      booking:       isTeacher,
      shopping:      isAuth,
      place_order:   isTeacher,
      add_recipes:   isAdmin,
      planning:      isPlanning,
      ft_teacher:    isTeacher,
      browse_practicals: true
    };
    return Boolean(map[routeKey]);
  }

  /* ══ ACTIVE LINK ════════════════════════════════════════════ */
  function markActiveLink() {
    var current = (window.location.pathname + window.location.search)
      .replace(/^\/+/, '') || 'index.html';
    // Strip query from current for comparison
    var currentBase = current.split('?')[0];

    document.querySelectorAll('a[href]').forEach(function(a) {
      if (!a.closest('#nb2Bar') && !a.closest('#nb2Panel')) return;
      var href = String(a.getAttribute('href') || '');
      if (!href || href.charAt(0) === '#') return;
      var hrefBase = href.split('?')[0].replace(/^\/+/, '');
      if (hrefBase && hrefBase === currentBase) {
        a.classList.add('is-active');
        a.setAttribute('aria-current', 'page');
        var mgMain = a.closest('.nb2-main-group');
        if (mgMain) mgMain.open = true;
        // Open parent subgroup if in Management panel
        var sg = a.closest('.nb2-subgroup');
        if (sg) sg.open = true;
        var mg = a.closest('.nb2-mgmt-group');
        if (mg) mg.open = true;
      }
    });
  }

  /* ══ AUTH ═══════════════════════════════════════════════════ */
  function fetchAuthAndApply() {
    return fetch('/api/auth/me', { credentials: 'include' })
      .then(function(res) { return res.ok ? res.json() : {}; })
      .then(function(data) {
        if (data && data.authenticated && data.user) {
          renderUser(data.user);
          var role = normalizeRole(data.user.role) || 'public_access';
          try { sessionStorage.setItem(ROLE_KEY, role); } catch (_) {}
          return role;
        }
        renderUser(null);
        return 'public_access';
      })
      .catch(function() {
        renderUser(null);
        return 'public_access';
      });
  }

  /* ══ WIRE-UP ════════════════════════════════════════════════ */
  function wireUp() {
    /* Panel triggers */
    var menuBtn   = document.getElementById('nb2MenuBtn');
    var hamburger = document.getElementById('nb2Hamburger');
    var closeBtn  = document.getElementById('nb2PanelClose');
    var backdrop  = document.getElementById('nb2PanelBackdrop');

    if (menuBtn)   menuBtn.addEventListener('click',   function() { togglePanel(menuBtn); });
    if (hamburger) hamburger.addEventListener('click', function() { togglePanel(hamburger); });
    if (closeBtn)  closeBtn.addEventListener('click',  function() {
      closePanel(menuBtn || hamburger);
    });
    if (backdrop)  backdrop.addEventListener('click',  function() {
      closePanel(menuBtn || hamburger);
    });

    // Close panel when any panel link is clicked (navigation)
    var panel = document.getElementById('nb2Panel');
    if (panel) {
      panel.querySelectorAll('a[href]').forEach(function(a) {
        a.addEventListener('click', function() { closePanel(null); });
      });

      // Accordion behavior for top-level menu groups.
      panel.querySelectorAll('.nb2-main-group').forEach(function(group) {
        group.addEventListener('toggle', function() {
          if (!group.open) return;
          panel.querySelectorAll('.nb2-main-group').forEach(function(other) {
            if (other !== group) other.open = false;
          });
        });
      });
    }

    /* User dropdown trigger */
    var userBtn = document.getElementById('nb2UserBtn');
    if (userBtn) {
      userBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        if (userBtn.classList.contains('nb2-user-btn--guest')) {
          window.location.href = 'google_login.html';
          return;
        }
        if (_userDropOpen) { closeUserDrop(); } else { openUserDrop(); }
      });
    }

    // Close user dropdown on outside click
    document.addEventListener('click', function() { if (_userDropOpen) closeUserDrop(); });
    var userDropdown = document.getElementById('nb2UserDropdown');
    if (userDropdown) {
      userDropdown.addEventListener('click', function(e) { e.stopPropagation(); });
    }

    /* Logout buttons */
    document.querySelectorAll('.nb2-logout-btn').forEach(attachLogout);

    /* Keyboard: Escape closes panel or dropdown; Tab traps focus in open panel */
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        if (_panelOpen)    { closePanel(menuBtn || hamburger); return; }
        if (_userDropOpen) { closeUserDrop(); if (userBtn) userBtn.focus(); }
      }
      if (e.key === 'Tab' && _panelOpen && panel) {
        var focusable = getFocusable(panel);
        if (!focusable.length) return;
        var first = focusable[0], last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault(); first.focus();
        }
      }
    });

    /* Close desktop dropdown if window resizes to mobile (≤699px) */
    window.addEventListener('resize', function() {
      if (window.innerWidth <= 699 && _userDropOpen) closeUserDrop();
    });

    /* auth-session-changed event (fired by other scripts) */
    document.addEventListener('auth-session-changed', function(ev) {
      var user = ev && ev.detail ? ev.detail.user : null;
      renderUser(user);
      var role = user ? (normalizeRole(user.role) || 'public_access') : 'public_access';
      applyRoleVisibility(role);
    });
  }

  /* ══ INIT ════════════════════════════════════════════════════ */
  function init() {
    wireUp();

    // Phase 5 transition flag: controls where generic "Book Shopping" links point.
    applyShoppingDefaultLinks(resolveShoppingDefaultMode());

    // Apply role from sessionStorage immediately (avoids flash)
    var storedRole = normalizeRole(
      (function() { try { return sessionStorage.getItem(ROLE_KEY); } catch (_) { return ''; } })()
    );
    if (storedRole) applyRoleVisibility(storedRole);

    // Fetch permissions, then fresh auth state
    loadPermissions().then(function() {
      return fetchAuthAndApply();
    }).then(function(role) {
      applyRoleVisibility(role);
      markActiveLink();
    });

    // If permissions already partially applied, mark active links now too
    markActiveLink();

    // Expose for debugging
    window.nb2Nav = {
      openPanel:  openPanel,
      closePanel: function() { closePanel(null); },
      setRole:    function(r) { applyRoleVisibility(r); },
      setShoppingDefault: function(mode) { return setShoppingDefaultMode(mode); },
      getShoppingDefault: function() { return getShoppingDefaultMode(); },
      getRole:    function() {
        try { return sessionStorage.getItem(ROLE_KEY); } catch (_) { return ''; }
      }
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
