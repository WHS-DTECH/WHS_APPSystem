/**
 * task_sidebar.js — Left-side task checklist popout.
 * Include on any page with: <script src="shared/task_sidebar.js"></script>
 *
 * Shows a persistent left-side drawer tab with upcoming tasks
 * personalised to the user's role. Ticks are stored in localStorage
 * and reset automatically each Monday.
 */
(function () {
  'use strict';

  let latestBrowseWeekContext = null;
  window.addEventListener('browse-practicals-week-context', (event) => {
    latestBrowseWeekContext = event && event.detail ? event.detail : null;
  });

  // ── Helpers ────────────────────────────────────────────────────────────────
  function escHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function getMonday(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (d.getDay() + 6) % 7);
    return d;
  }

  function toIso(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  /** Returns the localStorage key for the current week's tick state. */
  function weekKey() {
    return 'tsb_ticks_' + toIso(getMonday(new Date()));
  }

  function loadState() {
    try { return JSON.parse(localStorage.getItem(weekKey()) || '{}'); }
    catch (_) { return {}; }
  }

  function saveState(state) {
    try { localStorage.setItem(weekKey(), JSON.stringify(state)); }
    catch (_) { /* ignore */ }
  }

  function formatWeekRange(monday) {
    const friday = new Date(monday);
    friday.setDate(monday.getDate() + 4);
    if (monday.getMonth() === friday.getMonth()) {
      return `${monday.getDate()}–${friday.getDate()} ${friday.toLocaleDateString('en-NZ', { month: 'short' })}`;
    }
    return `${monday.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })} – ${friday.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })}`;
  }

  function isBrowsePracticalsPage() {
    const path = String((window.location && window.location.pathname) || '').toLowerCase();
    return path.endsWith('/browse_practicals.html') || path.endsWith('browse_practicals.html');
  }

  // ── Task definitions ───────────────────────────────────────────────────────
  function getTasksForRole(role) {
    const isPlanningRole = role === 'admin' || role === 'lead_teacher';
    const isBookingRole = isPlanningRole || role === 'teacher';
    if (!isBookingRole) return [];

    const tasks = [];

    if (isPlanningRole) {
      tasks.push({
        id: 'planners',
        label: 'Planners',
        href: 'admin_prefill_planner.html',
        desc: 'Upload or update the weekly recipe planner'
      });
    }

    tasks.push({
      id: 'group_confirmation',
      label: 'Group Confirmation',
      href: 'group_confirmation.html',
      desc: 'Set group types for upcoming classes'
    });

    // Next week's date range
    const nextMonday = getMonday(new Date());
    nextMonday.setDate(nextMonday.getDate() + 7);
    tasks.push({
      id: 'confirm_bookings',
      label: 'Confirm Bookings — ' + formatWeekRange(nextMonday),
      href: 'add_booking.html',
      desc: 'Review and confirm class bookings for the upcoming week'
    });

    if (isBrowsePracticalsPage()) {
      tasks.push({
        id: 'missing_recipes_week',
        label: 'Missing Recipes — Current Week',
        href: 'browse_practicals.html',
        desc: 'Loading missing recipes for the week in view...',
        isDynamicMissingTask: true
      });
    }

    return tasks;
  }

  // ── CSS injection ──────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('tsb-styles')) return;
    const style = document.createElement('style');
    style.id = 'tsb-styles';
    style.textContent = `
      /* Task Sidebar — tab always visible on the left edge */
      #tsb-tab {
        position: fixed;
        left: 0;
        top: 74px;
        z-index: 9501;
        writing-mode: vertical-rl;
        text-orientation: mixed;
        transform: rotate(180deg);
        background: #1976d2;
        color: #fff;
        border: none;
        border-radius: 0 6px 6px 0;
        padding: 1rem 0.5rem;
        cursor: pointer;
        font-size: 0.8rem;
        font-weight: 700;
        letter-spacing: 0.06em;
        font-family: inherit;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.45rem;
        box-shadow: 2px 0 10px rgba(0,0,0,0.2);
        transition: background 0.15s;
        user-select: none;
      }
      #tsb-tab:hover, #tsb-tab:focus-visible {
        background: #1565c0;
        outline: none;
      }
      .tsb-tab-icon {
        font-size: 1rem;
        writing-mode: horizontal-tb;
        transform: rotate(180deg);
      }
      .tsb-tab-badge {
        background: #ef4444;
        color: #fff;
        border-radius: 999px;
        font-size: 0.7rem;
        font-weight: 800;
        min-width: 1.3em;
        text-align: center;
        padding: 0.08em 0.3em;
        writing-mode: horizontal-tb;
        transform: rotate(180deg);
        line-height: 1.3;
      }

      /* Panel slides in from the left, sits next to the tab */
      #tsb-panel {
        position: fixed;
        left: -320px;
        top: 126px;
        transform: none;
        z-index: 9500;
        width: 308px;
        background: #fff;
        border-radius: 0 10px 10px 0;
        box-shadow: 4px 0 28px rgba(0,0,0,0.18);
        border: 1px solid #e2e8f0;
        border-left: none;
        max-height: calc(100vh - 144px);
        overflow-y: auto;
        transition: left 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      }
      #tsb-panel.tsb-open {
        left: 38px; /* approx tab width */
      }
      .tsb-hd {
        background: linear-gradient(135deg, #1e40af 0%, #1976d2 100%);
        color: #fff;
        padding: 1rem 1.1rem 0.85rem;
        position: relative;
        border-radius: 0 10px 0 0;
      }
      .tsb-greeting {
        font-size: 1rem;
        font-weight: 800;
        margin-bottom: 0.25rem;
        line-height: 1.3;
      }
      .tsb-sub {
        font-size: 0.79rem;
        opacity: 0.9;
        line-height: 1.4;
      }
      .tsb-close {
        position: absolute;
        top: 0.6rem;
        right: 0.6rem;
        background: none;
        border: none;
        color: #fff;
        font-size: 1rem;
        cursor: pointer;
        opacity: 0.8;
        padding: 0.2rem 0.4rem;
        border-radius: 4px;
        font-family: inherit;
        line-height: 1;
      }
      .tsb-close:hover { opacity: 1; background: rgba(255,255,255,0.15); }

      .tsb-list {
        list-style: none;
        margin: 0;
        padding: 0.4rem 0 0.5rem;
      }
      .tsb-item {
        display: flex;
        align-items: flex-start;
        gap: 0.65rem;
        padding: 0.65rem 1rem;
        border-bottom: 1px solid #f1f5f9;
        transition: background 0.1s;
      }
      .tsb-item:last-child { border-bottom: none; }
      .tsb-item:hover { background: #f8fafc; }
      .tsb-item.tsb-done .tsb-link {
        text-decoration: line-through;
        color: #9ca3af;
      }
      .tsb-item.tsb-done .tsb-desc { color: #d1d5db; }

      .tsb-tick {
        flex-shrink: 0;
        width: 1.4rem;
        height: 1.4rem;
        border: 2px solid #d1d5db;
        border-radius: 50%;
        background: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.72rem;
        color: #fff;
        font-weight: 800;
        transition: border-color 0.15s, background 0.15s;
        padding: 0;
        margin-top: 0.1rem;
        font-family: inherit;
      }
      .tsb-tick:hover { border-color: #1976d2; }
      .tsb-item.tsb-done .tsb-tick {
        background: #059669;
        border-color: #059669;
      }
      .tsb-dot {
        width: 0.45rem;
        height: 0.45rem;
        border-radius: 50%;
        background: #d1d5db;
        display: block;
      }

      .tsb-content { flex: 1; min-width: 0; }
      .tsb-link {
        font-size: 0.87rem;
        font-weight: 600;
        color: #1f2937;
        text-decoration: none;
        display: block;
        line-height: 1.35;
      }
      .tsb-link:hover { color: #1976d2; text-decoration: underline; }
      .tsb-desc {
        font-size: 0.74rem;
        color: #6b7280;
        margin-top: 0.12rem;
        line-height: 1.4;
      }
      .tsb-missing-list {
        margin: 0.35rem 0 0;
        padding-left: 1rem;
        font-size: 0.73rem;
        color: #475569;
        line-height: 1.35;
      }
      .tsb-missing-list li {
        margin-bottom: 0.14rem;
      }
      .tsb-missing-clear {
        margin-top: 0.3rem;
        font-size: 0.73rem;
        color: #059669;
        font-weight: 700;
      }

      @media (max-width: 720px) {
        #tsb-tab { top: 66px; }
        #tsb-panel {
          top: 112px;
          max-height: calc(100vh - 126px);
          width: min(308px, calc(100vw - 44px));
        }
      }

      /* Hide when printing */
      @media print {
        #tsb-tab, #tsb-panel { display: none !important; }
      }
    `;
    document.head.appendChild(style);
  }

  // ── Build sidebar DOM ──────────────────────────────────────────────────────
  function buildSidebar(tasks, firstName) {
    injectStyles();

    const state = loadState();
    const closedThisSession = sessionStorage.getItem('tsb_closed') === '1';
    const pendingCount = tasks.filter(t => !state[t.id]).length;

    function updatePendingBadge() {
      const pending = tasks.filter(t => !loadState()[t.id]).length;
      let badge = tab.querySelector('.tsb-tab-badge');
      if (pending === 0) {
        if (badge) badge.remove();
        tab.title = 'All tasks complete';
      } else {
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'tsb-tab-badge';
          tab.appendChild(badge);
        }
        badge.textContent = pending;
        badge.setAttribute('aria-label', `${pending} pending`);
        tab.title = `${pending} task${pending !== 1 ? 's' : ''} pending`;
      }
    }

    // Tab
    const tab = document.createElement('button');
    tab.id = 'tsb-tab';
    tab.type = 'button';
    tab.setAttribute('aria-expanded', 'false');
    tab.setAttribute('aria-controls', 'tsb-panel');
    tab.title = pendingCount ? `${pendingCount} task${pendingCount !== 1 ? 's' : ''} pending` : 'All tasks complete';
    tab.innerHTML =
      `<span class="tsb-tab-icon" aria-hidden="true">📋</span>` +
      `<span>Tasks</span>` +
      (pendingCount ? `<span class="tsb-tab-badge" aria-label="${pendingCount} pending">${pendingCount}</span>` : '');

    // Panel
    const panel = document.createElement('div');
    panel.id = 'tsb-panel';
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', 'Upcoming tasks');

    // Header
    const hd = document.createElement('div');
    hd.className = 'tsb-hd';
    hd.innerHTML =
      `<div class="tsb-greeting">Hi, ${escHtml(firstName)}!</div>` +
      `<div class="tsb-sub">You have the following coming up that needs updating:</div>` +
      `<button type="button" class="tsb-close" aria-label="Close tasks panel">&#x2715;</button>`;
    panel.appendChild(hd);

    // Task list
    const list = document.createElement('ul');
    list.className = 'tsb-list';
    tasks.forEach(task => {
      const done = !!state[task.id];
      const li = document.createElement('li');
      li.className = 'tsb-item' + (done ? ' tsb-done' : '');
      li.dataset.taskId = task.id;
      li.innerHTML =
        `<button type="button" class="tsb-tick" aria-label="${done ? 'Mark as not done' : 'Mark as done'}: ${escHtml(task.label)}" aria-pressed="${done}">` +
        (done ? '&#x2713;' : '<span class="tsb-dot" aria-hidden="true"></span>') +
        `</button>` +
        `<div class="tsb-content">` +
        `<a class="tsb-link" href="${escHtml(task.href)}">${escHtml(task.label)}</a>` +
        (task.desc ? `<div class="tsb-desc">${escHtml(task.desc)}</div>` : '') +
        (task.isDynamicMissingTask ? '<ul class="tsb-missing-list" hidden></ul><div class="tsb-missing-clear" hidden>No missing recipes in this week.</div>' : '') +
        `</div>`;
      list.appendChild(li);
    });
    panel.appendChild(list);

    document.body.appendChild(tab);
    document.body.appendChild(panel);

    // ── Open/close logic ───────────────────────────────────────────────────
    let isOpen = !closedThisSession && pendingCount > 0;

    function setOpen(open) {
      isOpen = open;
      tab.setAttribute('aria-expanded', String(open));
      if (open) {
        panel.classList.add('tsb-open');
        sessionStorage.removeItem('tsb_closed');
      } else {
        panel.classList.remove('tsb-open');
      }
    }
    setOpen(isOpen);

    tab.addEventListener('click', () => setOpen(!isOpen));
    hd.querySelector('.tsb-close').addEventListener('click', () => {
      setOpen(false);
      sessionStorage.setItem('tsb_closed', '1');
    });

    // ── Tick interaction ───────────────────────────────────────────────────
    list.addEventListener('click', (e) => {
      const btn = e.target.closest('.tsb-tick');
      if (!btn) return;
      const li = btn.closest('.tsb-item');
      if (!li) return;
      const taskId = li.dataset.taskId;

      const cur = loadState();
      cur[taskId] = !cur[taskId];
      saveState(cur);

      const done = cur[taskId];
      li.classList.toggle('tsb-done', done);
      btn.setAttribute('aria-pressed', String(done));
      btn.innerHTML = done ? '&#x2713;' : '<span class="tsb-dot" aria-hidden="true"></span>';
      const task = tasks.find(t => t.id === taskId);
      btn.setAttribute('aria-label', (done ? 'Mark as not done' : 'Mark as done') + ': ' + (task ? task.label : taskId));

      updatePendingBadge();
    });

    return {
      applyMissingRecipesContext(detail) {
        const row = list.querySelector('li[data-task-id="missing_recipes_week"]');
        if (!row || !detail) return;

        const link = row.querySelector('.tsb-link');
        const desc = row.querySelector('.tsb-desc');
        const ul = row.querySelector('.tsb-missing-list');
        const clear = row.querySelector('.tsb-missing-clear');
        if (!link || !desc || !ul || !clear) return;

        const weekMonday = String(detail.weekMondayIso || '').trim();
        const missing = Array.isArray(detail.missingRecipes) ? detail.missingRecipes : [];
        let weekLabel = 'Current Week';
        if (weekMonday) {
          const parsed = new Date(`${weekMonday}T00:00:00`);
          if (!Number.isNaN(parsed.getTime())) {
            weekLabel = formatWeekRange(parsed);
          }
        }

        link.textContent = `Missing Recipes — ${weekLabel}`;

        if (!missing.length) {
          desc.textContent = 'No missing recipes in the week currently in view.';
          ul.innerHTML = '';
          ul.hidden = true;
          clear.hidden = false;
          return;
        }

        desc.textContent = `${missing.length} booking${missing.length === 1 ? '' : 's'} without a recipe in this week.`;
        clear.hidden = true;

        const maxItems = 8;
        ul.innerHTML = missing.slice(0, maxItems).map((item) => {
          const day = String(item.dayLabel || item.bookingDate || '').trim();
          const period = String(item.period || '').trim();
          const className = String(item.className || 'Class').trim();
          const teacher = String(item.teacherName || '').trim();
          const left = [day, period ? `P${period}` : ''].filter(Boolean).join(' ');
          const right = teacher ? `${className} (${teacher})` : className;
          return `<li>${escHtml(left)} — ${escHtml(right)}</li>`;
        }).join('');
        if (missing.length > maxItems) {
          ul.innerHTML += `<li>+${missing.length - maxItems} more</li>`;
        }
        ul.hidden = false;
      }
    };
  }

  // ── Init ───────────────────────────────────────────────────────────────────
  async function init() {
    try {
      const me = await fetch('/api/auth/me', { credentials: 'include' })
        .then(r => r.ok ? r.json() : {})
        .catch(() => ({}));
      const user = me && me.user;
      if (!user) return;

      const role = String(user.role || '').toLowerCase().trim();
      const firstName = String(user.name || '').split(' ')[0] || 'Teacher';
      const tasks = getTasksForRole(role);
      if (!tasks.length) return;

      const sidebarApi = buildSidebar(tasks, firstName);
      if (sidebarApi && typeof sidebarApi.applyMissingRecipesContext === 'function' && latestBrowseWeekContext) {
        sidebarApi.applyMissingRecipesContext(latestBrowseWeekContext);
      }

      window.addEventListener('browse-practicals-week-context', (event) => {
        latestBrowseWeekContext = event && event.detail ? event.detail : null;
        if (sidebarApi && typeof sidebarApi.applyMissingRecipesContext === 'function') {
          sidebarApi.applyMissingRecipesContext(latestBrowseWeekContext);
        }
      });
    } catch (_) {
      // Non-critical — sidebar is optional enhancement
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 0);
  }
})();
