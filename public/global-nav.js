(function () {
  if (window.__whsGlobalNav || window.top !== window.self) return;
  window.__whsGlobalNav = true;

  var WIDTH = 240;
  var STORE = 'whs.globalNav.open';
  var mobile = window.matchMedia('(max-width: 860px)');
  var shifted = [];

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
    '#gn-nav .gn-head{padding:12px 18px 4px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#9fb5ab}',
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
      if (node.id === 'gn-nav' || node.id === 'gn-toggle') return;
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
      if (data.isAdmin) link(nav, 'Admin', '/admin');
      if (data.modules && data.modules.length) {
        nav.appendChild(el('div', { 'class': 'gn-head' }, 'Modules'));
        data.modules.forEach(function (module) { link(nav, module.name, module.path); });
      }
      nav.appendChild(el('div', { 'class': 'gn-spacer' }));
      var signOut = el('button', { type: 'button', 'class': 'gn-link' }, 'Sign out');
      signOut.addEventListener('click', function () {
        fetch('/logout', { method: 'POST', credentials: 'same-origin' }).finally(function () { location.href = '/'; });
      });
      nav.appendChild(signOut);
    } else {
      link(nav, 'Home', '/');
      nav.appendChild(el('div', { 'class': 'gn-spacer' }));
      nav.appendChild(el('a', { href: '/auth/google' }, 'Sign in with Google'));
    }
  }

  function init() {
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

    fetch('/nav-data', { credentials: 'same-origin', cache: 'no-store' })
      .then(function (response) { return response.json(); })
      .then(function (data) { render(nav, data); })
      .catch(function () { render(nav, { signedIn: false }); });
  }

  if (document.body) init();
  else document.addEventListener('DOMContentLoaded', init);
})();
