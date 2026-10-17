(function () {
  'use strict';
  var base = '/apps/guidance-counsellor-app';
  var viewport = document.getElementById('whs-student-app-viewport');
  if (!viewport) {
    viewport = document.createElement('div');
    viewport.id = 'whs-guidance-viewport';
    Array.from(document.body.children).forEach(function (child) {
      if (child.tagName !== 'SCRIPT') viewport.appendChild(child);
    });
    document.body.prepend(viewport);
  }
  var shell = viewport.querySelector('.app-shell');
  if (!shell) {
    shell = document.createElement('div');
    shell.className = 'app-shell whs-guidance-shell';
    var content;
    if (viewport.children.length === 1 && viewport.firstElementChild.tagName === 'MAIN') {
      content = viewport.firstElementChild;
    } else {
      content = document.createElement('main');
      while (viewport.firstChild) content.appendChild(viewport.firstChild);
    }
    content.classList.add('whs-guidance-content');
    shell.appendChild(content);
    viewport.appendChild(shell);
  }
  var sidebar = shell.querySelector('.sidebar');
  if (!sidebar) {
    sidebar = document.createElement('aside');
    sidebar.className = 'sidebar';
    shell.prepend(sidebar);
  }
  var actions = sidebar.querySelector('.sidebar-footer');
  sidebar.replaceChildren();
  sidebar.classList.add('whs-guidance-sidebar');
  sidebar.setAttribute('aria-label', 'Guidance app navigation');
  var brand = document.createElement('div');
  brand.className = 'brand';
  brand.textContent = 'SEND-C';
  sidebar.appendChild(brand);
  [['DASHBOARD', '/dashboard'], ['STUDENTS', '/students']].forEach(function (item) {
    var link = document.createElement('a');
    link.className = 'nav-link';
    link.href = base + item[1];
    link.textContent = item[0];
    var active = item[1] === '/dashboard'
      ? location.pathname === base + '/' || location.pathname === base + '/dashboard'
      : location.pathname.startsWith(base + '/students');
    if (active) {
      link.classList.add('active');
      link.setAttribute('aria-current', 'page');
    }
    sidebar.appendChild(link);
  });
  if (!actions) {
    actions = document.createElement('div');
    actions.className = 'sidebar-footer';
    var session = document.createElement('a');
    session.className = 'session-btn';
    session.href = base + '/students/sessions/new';
    session.textContent = 'NEW SESSION';
    actions.appendChild(session);
  }
  sidebar.appendChild(actions);
})();
