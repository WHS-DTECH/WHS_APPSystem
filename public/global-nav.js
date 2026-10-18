(function () {
  if (window.__whsGlobalNav || window.top !== window.self) return;
  window.__whsGlobalNav = true;

  var WIDTH = 240;
  var STORE = 'whs.globalNav.open';
  var mobile = window.matchMedia('(max-width: 640px)');
  var shifted = [];
  var headerOffsets = new WeakMap();

  var css = [
    '#gn-toggle{position:fixed;bottom:10px;left:10px;z-index:2147483000;width:38px;height:38px;border-radius:8px;border:1px solid rgba(0,0,0,.2);background:#0d5c4a;color:#fff;font-size:20px;line-height:1;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.25)}',
    '#gn-toggle:hover{background:#093f34}',
    '#gn-nav{position:fixed;top:0;left:0;bottom:0;width:' + WIDTH + 'px;z-index:2147482999;background:#0f2a23;color:#e8f0ec;font:14px/1.4 system-ui,-apple-system,Segoe UI,sans-serif;display:flex;flex-direction:column;box-sizing:border-box;padding:58px 0 64px;overflow-y:auto;transform:translateX(-100%);transition:transform .2s ease;box-shadow:2px 0 12px rgba(0,0,0,.25)}',
    'html.gn-open #gn-nav{transform:none}',
    '#gn-nav a,#gn-nav button.gn-link{display:block;width:100%;box-sizing:border-box;text-align:left;padding:9px 18px;color:#e8f0ec;text-decoration:none;background:none;border:0;border-left:3px solid transparent;font:inherit;cursor:pointer}',
    '#gn-nav a:hover,#gn-nav button.gn-link:hover{background:rgba(255,255,255,.08)}',
    '#gn-nav a.gn-active{background:rgba(255,255,255,.12);border-left-color:#c08a2c;font-weight:600}',
    '#gn-nav .gn-brand{position:absolute;top:0;left:0;right:0;height:58px;padding:0 0 0 18px;display:flex;align-items:center;font-weight:700;font-size:16px;color:#fff}',
    '#gn-nav .gn-brand a{padding:0;border:0;color:#fff;width:auto}',
    '#gn-nav .gn-user{padding:8px 18px 10px;border-bottom:1px solid rgba(255,255,255,.12);margin-bottom:6px;font-size:13px}',
    '#gn-nav .gn-badge{display:inline-block;margin-top:4px;padding:1px 8px;border-radius:999px;background:#e5eee8;color:#093f34;font-size:11px;font-weight:700}',
    '#gn-nav .gn-head{padding:12px 18px 4px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#f0b84a}',
    '#gn-nav .gn-gap{height:16px}',
    '#gn-nav .gn-views{display:flex;flex-direction:column;gap:6px;padding:6px 18px 8px}',
    '#gn-nav .gn-views a{padding:6px 10px;border:1px solid #c07a1a;border-radius:6px;font-size:13px;text-align:center;color:#fff}',
    '#gn-nav .gn-views a.gn-view-on{background:#a85d0a;border-color:#a85d0a}',
    '#gn-nav .gn-empty{padding:4px 18px;font-size:12px;color:#9fb5ab}',
    '#gn-nav .gn-spacer{flex:1}',
    'html.gn-open.gn-push body{margin-left:' + WIDTH + 'px!important}',
    'html.gn-open.gn-push{overflow-x:hidden}',
    '@media print{#gn-nav,#gn-toggle{display:none!important}html.gn-open.gn-push body{margin-left:0!important}}'

  ].join('\n');

  function el(tag, attrs, text) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (key) { node.setAttribute(key, attrs[key]); });
    if (text) node.textContent = text;
    return node;
  }

  function isOpen() { return document.documentElement.classList.contains('gn-open'); }

  // Fixed top bars on the legacy pages ignore body margin, so they are moved over by hand.
  function shiftFixed(on) {
    shifted.forEach(function (item) {
      item.node.style.left = item.left;
      item.node.style.width = item.width;
    });
    shifted = [];
    if (!on) return;
    var candidates = [];
    Array.prototype.forEach.call(document.body.children, function (child) {
      candidates.push(child);
      Array.prototype.forEach.call(child.children, function (grand) { candidates.push(grand); });
    });
    candidates.forEach(function (node) {
      if (node.id === 'gn-nav' || node.id === 'gn-toggle' || node.id === 'whs-student-app-footer' || node.id === 'whs-account-header') return;
      var style = getComputedStyle(node);
      if (style.position !== 'fixed' || parseFloat(style.left) !== 0) return;
      var item = { node: node, left: node.style.left, width: node.style.width };
      node.style.left = WIDTH + 'px';
      if (Math.abs(node.getBoundingClientRect().width + WIDTH - window.innerWidth) < 4 || style.width === window.innerWidth + 'px') {
        node.style.width = 'calc(100% - ' + WIDTH + 'px)';
      }
      shifted.push(item);
    });
  }

  function apply(open, remember) {
    var root = document.documentElement;
    root.classList.toggle('gn-open', open);
    root.classList.toggle('gn-push', open && !mobile.matches);
    shiftFixed(open && !mobile.matches);
    var toggle = document.getElementById('gn-toggle');
    if (toggle) {
      toggle.setAttribute('aria-expanded', String(open));
      toggle.title = open ? 'Hide navigation' : 'Show navigation';
    }
    if (remember) {
      try { localStorage.setItem(STORE, open ? '1' : '0'); } catch (e) { /* storage unavailable */ }
    }
  }

  function link(nav, label, href) {
    var anchor = el('a', { href: href }, label);
    var path = location.pathname.replace(/\/+$/, '') || '/';
    var target = href.split('?')[0].replace(/\/+$/, '') || '/';
    if (path === target || (target !== '/' && path.indexOf(target + '/') === 0)) anchor.className = 'gn-active';
    nav.appendChild(anchor);
  }

  function render(nav, data) {
    nav.appendChild(el('div', { 'class': 'gn-brand' })).appendChild(el('a', { href: '/' }, 'WHS APPSystem'));
    if (data.signedIn) {
      var user = el('div', { 'class': 'gn-user' }, data.name || '');
      user.appendChild(el('br'));
      user.appendChild(el('span', { 'class': 'gn-badge' }, data.role || ''));
      nav.appendChild(user);
      link(nav, 'Dashboard', '/dashboard');
      link(nav, 'Profile', '/profile');
      if (data.isAdmin) {
        link(nav, 'Admin', '/admin');
      }
      if (data.roleViews && data.roleViews.length) {
        nav.appendChild(el('div', { 'class': 'gn-head' }, data.roleViewModule + ' Views'));
        var views = el('div', { 'class': 'gn-views' });
        var current = data.activeView || new URLSearchParams(location.search).get('view') || 'admin';
        data.roleViews.forEach(function (item) {
          var button = el('a', { href: item.url }, item.label);
          if (current === item.key) {
            button.className = 'gn-view-on';
            button.setAttribute('aria-current', 'true');
          }
          views.appendChild(button);
        });
        nav.appendChild(views);
      }
      var modules = data.modules || [];
      var used = {};
      function section(title, order, match, rename, headLink) {
        nav.appendChild(el('div', { 'class': 'gn-head' }, title));
        if (headLink) link(nav, headLink[0], headLink[1]);
        var found = 0;
        order.forEach(function (name) {
          modules.forEach(function (module) {
            if (used[module.path] || !match(module, name)) return;
            used[module.path] = true;
            found++;
            link(nav, rename ? rename(module) : module.name, module.path);
          });
        });
        return found;
      }
      section('Modules', ['Core Administration', 'Kamar Uploader', 'WHS Learning Sites'], function (module, name) { return module.name === name; });
      nav.appendChild(el('div', { 'class': 'gn-gap' }));
      var hubPaths = ['/technology-hub', '/dtech-hub', '/food-room', '/sewing-hub', '/workshop'];
      section('Hubs', hubPaths, function (module, prefix) { return module.path.indexOf(prefix) === 0; },
        function (module) {
          if (/^\/technology-hub(?:\/|$)/.test(module.path)) return 'HUB Dashboard';
          return /hub$/i.test(module.name) ? module.name : module.name + ' Hub';
        });
      nav.appendChild(el('div', { 'class': 'gn-gap' }));
      nav.appendChild(el('div', { 'class': 'gn-head' }, 'CAPSULES'));
      if (modules.some(function (module) { return /^\/dtech-hub(?:\/|$)/.test(module.path); })) {
        link(nav, 'Capsule DASHBOARD', '/dtech-hub/class-training/');
      } else {
        nav.appendChild(el('div', { 'class': 'gn-empty' }, 'None yet'));
      }
      nav.appendChild(el('div', { 'class': 'gn-gap' }));
      var remaining = modules.map(function (module) { return module.name; });
      var studentApps = section('Student Apps', remaining, function (module, name) { return module.name === name; }, null, ['APPs Dashboard', '/student-apps']);
      if (!studentApps) nav.appendChild(el('div', { 'class': 'gn-empty' }, 'None yet'));
      nav.appendChild(el('div', { 'class': 'gn-spacer' }));
    } else {
      link(nav, 'Home', '/');
      nav.appendChild(el('div', { 'class': 'gn-spacer' }));
      nav.appendChild(el('a', { href: '/auth/google?next=' + encodeURIComponent(location.pathname + location.search) }, 'Sign in with Google'));
    }
  }

  function signOutAccount(button, status) {
    status.textContent = '';
    status.setAttribute('role', 'status');
    button.disabled = true;
    fetch('/logout', { method: 'POST', credentials: 'same-origin' })
      .then(function (response) {
        if (!response.ok) throw new Error('Sign out failed.');
        location.href = '/';
      })
      .catch(function (error) {
        console.error('WHS account sign out:', error);
        status.setAttribute('role', 'alert');
        status.textContent = 'Could not sign out. Please try again.';
        button.disabled = false;
      });
  }

  function reserveAccountHeader() {
    // Older hubs use fixed top bars outside document flow.
    Array.prototype.forEach.call(document.querySelectorAll('body > *, body > * > *'), function (node) {
      if (/^(?:gn-|whs-)/.test(node.id) || node.closest('#whs-account-header, #whs-student-app-viewport, #gn-nav')) return;
      var style = getComputedStyle(node);
      var offset = headerOffsets.get(node);
      if (offset !== undefined) {
        node.style.top = (offset + 60) + 'px';
      } else if (style.position === 'fixed' && parseFloat(style.top) >= 0 && parseFloat(style.top) < 60) {
        offset = parseFloat(style.top);
        headerOffsets.set(node, offset);
        node.style.top = (offset + 60) + 'px';
      }
    });
  }

  function buildAccount(data) {
    var header = document.getElementById('whs-account-header');
    if (!header) {
      document.body.insertBefore(el('div', { id: 'whs-account-spacer', 'aria-hidden': 'true' }), document.body.firstChild);
      header = el('header', { id: 'whs-account-header', 'aria-label': 'School account' });
      document.body.appendChild(header);
    }
    header.replaceChildren();
    if (!data || data.error) {
      header.appendChild(el('span', { role: data ? 'alert' : 'status' }, data ? 'School account could not be loaded.' : 'Loading school account...'));
      if (data) {
        var retry = el('button', { type: 'button', 'class': 'whs-account-retry' }, 'Retry');
        retry.addEventListener('click', init);
        header.appendChild(retry);
      }
      return;
    }
    if (!data.signedIn) {
      var login = el('a', { 'class': 'whs-google-signin', href: '/auth/google?next=' + encodeURIComponent(location.pathname + location.search) });
      login.appendChild(el('span', { 'class': 'whs-google-mark', 'aria-hidden': 'true' }, 'G'));
      login.appendChild(el('span', {}, 'Sign in with Google'));
      header.appendChild(login);
      return;
    }
    if (data.searchModule) buildSearch(header, data.searchModule);
    if (!data.isAdmin && data.roleViews && data.roleViews.length) {
      var roleViews = el('nav', { 'class': 'whs-role-views', 'aria-label': data.roleViewModule + ' Views' });
      data.roleViews.forEach(function (view) {
        var anchor = el('a', { href: view.url }, view.label);
        if (view.key === data.activeView) anchor.setAttribute('aria-current', 'true');
        roleViews.appendChild(anchor);
      });
      header.appendChild(roleViews);
    }
    function menuButton(id, label, className) {
      var button = el('button', { type: 'button', 'class': 'whs-account-button ' + (className || ''), 'aria-label': label, 'aria-controls': id, 'aria-expanded': 'false' });
      header.appendChild(button);
      var menu = el('div', { id: id, 'class': 'whs-account-menu', role: 'region', 'aria-label': label });
      menu.hidden = true;
      header.appendChild(menu);
      button.addEventListener('click', function () {
        var open = menu.hidden;
        closeMenus();
        menu.hidden = !open;
        button.setAttribute('aria-expanded', String(open));
        if (open) {
          var first = menu.querySelector('a,button');
          if (first) first.focus();
        }
      });
      return { button: button, menu: menu };
    }
    function closeMenus() {
      Array.prototype.forEach.call(header.querySelectorAll('.whs-account-menu'), function (menu) { menu.hidden = true; });
      Array.prototype.forEach.call(header.querySelectorAll('button[aria-expanded]'), function (button) { button.setAttribute('aria-expanded', 'false'); });
    }
    var status = el('p', { 'class': 'whs-signout-status', role: 'status', id: 'whs-signout-status' });
    var signOut = el('button', { type: 'button', 'class': 'whs-signout-pill', 'aria-describedby': 'whs-signout-status' }, 'Sign out');
    signOut.addEventListener('click', function () { signOutAccount(signOut, status); });
    header.appendChild(signOut);
    var account = menuButton('whs-account-menu', 'School account: ' + (data.name || data.email));
    header.appendChild(status);
    account.button.textContent = (data.name || data.email || '?').trim().charAt(0).toUpperCase();
    if (data.avatarUrl && /^https:\/\//i.test(data.avatarUrl)) {
      var photo = el('img', { src: data.avatarUrl, alt: '', referrerpolicy: 'no-referrer' });
      photo.addEventListener('error', function () { photo.remove(); });
      account.button.appendChild(photo);
      account.button.style.position = 'relative';
      photo.style.position = 'absolute';
      photo.style.inset = '0';
    }
    account.menu.appendChild(el('strong', {}, data.name || 'School account'));
    account.menu.appendChild(el('p', {}, data.email || ''));
    link(account.menu, 'Profile', '/profile');
    if (data.datasetManagerUrl || data.assignRolesUrl || data.courseManagementUrl || data.userRoleManagementUrl || data.homepageEventSettingsUrl) {
      var settings = el('details', { 'class': 'whs-account-settings' });
      settings.appendChild(el('summary', {}, 'Settings'));
      if (data.datasetManagerUrl) link(settings, 'Dataset Manager', data.datasetManagerUrl);
      if (data.courseManagementUrl) link(settings, 'Course Management', data.courseManagementUrl);
      if (data.homepageEventSettingsUrl) link(settings, 'Homepage Event Settings', data.homepageEventSettingsUrl);
      if (data.assignRolesUrl) link(settings, 'Assign User Roles', data.assignRolesUrl);
      if (data.userRoleManagementUrl) link(settings, 'User Role Management', data.userRoleManagementUrl);
      account.menu.appendChild(settings);
    }
    header.onkeydown = function (event) {
      if (event.key === 'Escape') {
        var active = header.querySelector('[aria-expanded="true"]');
        closeMenus();
        if (active) active.focus();
      }
    };
    document.addEventListener('click', function (event) {
      if (!header.contains(event.target)) closeMenus();
    });
  }

  function buildSearch(header, module) {
    var wrapper = el('div', { 'class': 'whs-module-search' });
    var form = el('form', { role: 'search', 'aria-label': 'Search ' + module.label });
    var input = el('input', {
      type: 'search', name: 'q', minlength: '2', maxlength: '100', required: '',
      placeholder: 'Search ' + module.label + '...', 'aria-label': 'Search ' + module.label,
      'aria-controls': 'whs-search-results', 'aria-expanded': 'false', autocomplete: 'off'
    });
    var submit = el('button', { type: 'submit' }, 'Search');
    var panel = el('section', { id: 'whs-search-results', 'class': 'whs-search-results', 'aria-label': module.label + ' search results' });
    panel.hidden = true;
    var status = el('p', { role: 'status', 'aria-live': 'polite' });
    var list = el('ul');
    var close = el('button', { type: 'button', 'class': 'whs-search-close' }, 'Close results');
    panel.appendChild(el('strong', {}, module.label));
    panel.appendChild(close);
    panel.appendChild(status);
    panel.appendChild(list);
    form.appendChild(input);
    form.appendChild(submit);
    wrapper.appendChild(form);
    wrapper.appendChild(panel);
    header.appendChild(wrapper);
    var pending = null;
    function hide() {
      panel.hidden = true;
      input.setAttribute('aria-expanded', 'false');
    }
    close.addEventListener('click', function () { hide(); input.focus(); });
    input.addEventListener('input', function () {
      if (pending) pending.abort();
      pending = null;
      submit.disabled = false;
      form.removeAttribute('aria-busy');
      list.replaceChildren();
      hide();
    });
    header.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !panel.hidden) { hide(); input.focus(); }
    });
    document.addEventListener('click', function (event) {
      if (!wrapper.contains(event.target)) hide();
    });
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      if (pending) pending.abort();
      var controller = new AbortController();
      pending = controller;
      panel.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      status.setAttribute('role', 'status');
      status.textContent = 'Searching ' + module.label + '...';
      list.replaceChildren();
      form.setAttribute('aria-busy', 'true');
      submit.disabled = true;
      fetch('/module-search?path=' + encodeURIComponent(location.pathname) + '&q=' + encodeURIComponent(input.value.trim()), {
        credentials: 'same-origin', cache: 'no-store', signal: controller.signal
      }).then(function (response) {
        if (!String(response.headers.get('Content-Type')).includes('application/json')) {
          throw new Error('Search could not be loaded. Check the module is configured and you are signed in.');
        }
        return response.json().then(function (body) {
          if (!response.ok) throw new Error(body.error || 'This module could not be searched.');
          if (!Array.isArray(body.results)) throw new Error('Search returned an invalid response.');
          return body;
        });
      }).then(function (body) {
        if (pending !== controller) return;
        body.results.forEach(function (result) {
          var destination = new URL(result.url, location.origin);
          if (destination.origin !== location.origin || !result.url.startsWith('/') || result.url.startsWith('//')) {
            throw new Error('Search returned an invalid result link.');
          }
          var row = el('li');
          var anchor = el('a', { href: result.url });
          anchor.appendChild(el('strong', {}, result.title));
          anchor.appendChild(el('span', {}, result.kind + (result.description ? ' - ' + result.description : '')));
          row.appendChild(anchor);
          list.appendChild(row);
        });
        status.textContent = body.results.length
          ? body.results.length + ' result(s) in ' + module.label + (body.truncated ? '. Refine your search for more results.' : '.')
          : 'No matching results you can access in ' + module.label + '.';
      }).catch(function (error) {
        if (error.name === 'AbortError' || pending !== controller) return;
        console.error('Module search:', error);
        list.replaceChildren();
        status.setAttribute('role', 'alert');
        status.textContent = error.message || 'Search failed. Please retry.';
      }).finally(function () {
        if (pending !== controller) return;
        pending = null;
        form.removeAttribute('aria-busy');
        submit.disabled = false;
      });
    });
  }

  // Any remaining hub "sign in" links return the user to the page they were on.
  document.addEventListener('click', function (event) {
    var anchor = event.target.closest && event.target.closest('a[href]');
    if (!anchor) return;
    var raw = anchor.getAttribute('href');
    if (raw === '/auth/google') {
      anchor.setAttribute('href', '/auth/google?next=' + encodeURIComponent(location.pathname + location.search));
    }
  }, true);

  function build(data) {
    var style = el('style');
    style.textContent = css;
    document.head.appendChild(style);

    var toggle = el('button', { id: 'gn-toggle', type: 'button', 'aria-controls': 'gn-nav', 'aria-label': 'Toggle navigation' }, '\u2630');
    var nav = el('nav', { id: 'gn-nav', 'aria-label': 'Main navigation' });
    document.body.appendChild(nav);
    document.body.appendChild(toggle);

    toggle.addEventListener('click', function () { apply(!isOpen(), true); });
    window.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && isOpen() && mobile.matches) apply(false, false);
    });
    window.addEventListener('resize', function () { if (isOpen()) apply(true, false); });

    var saved = null;
    try { saved = localStorage.getItem(STORE); } catch (e) { /* storage unavailable */ }
    apply(saved === null ? !mobile.matches : saved === '1' && !mobile.matches, false);
    // Legacy pages build their top bar after load, so shift again once it exists.
    setTimeout(function () { if (isOpen()) shiftFixed(!mobile.matches); }, 1200);

    render(nav, data);
  }

  // Only administrators get the sidebar; students and teachers use each hub's own top bar.
  function init() {
    buildAccount(null);
    reserveAccountHeader();
    setTimeout(reserveAccountHeader, 1200);
    fetch('/nav-data?path=' + encodeURIComponent(location.pathname), { credentials: 'same-origin', cache: 'no-store' })
      .then(function (response) {
        if (!response.ok) throw new Error('School account request failed.');
        return response.json();
      })
      .then(function (data) {
        buildAccount(data);
        if (data && data.isAdmin) build(data);
      })
      .catch(function (error) {
        console.error('WHS account controls:', error);
        buildAccount({ error: true });
      });
  }

  if (document.body) init();
  else document.addEventListener('DOMContentLoaded', init);
})();
