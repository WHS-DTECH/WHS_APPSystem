/**
 * Global toast notification helper.
 *
 * Usage:
 *   window.showToast('Saved!', 'success');
 *   window.showToast('Something went wrong.', 'error', 6000);
 *   window.showToast('Note: changes pending.', 'warning');
 *   window.showToast('Fetching data…', 'info', 0); // sticky — call .dismiss() to close
 *
 * Types: 'success' | 'warning' | 'error' | 'info' (default)
 * Duration: ms before auto-dismiss (0 = sticky, default 4000)
 */
(function () {
  'use strict';

  function getOrCreateContainer() {
    var el = document.getElementById('ui-toast-container');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'ui-toast-container';
    el.className = 'ui-toast-container';
    el.setAttribute('aria-label', 'Notifications');
    el.setAttribute('role', 'region');
    document.body.appendChild(el);
    return el;
  }

  window.showToast = function (message, type, duration) {
    type = type || 'info';
    duration = (duration === undefined || duration === null) ? 4000 : Number(duration);

    var container = getOrCreateContainer();

    var toast = document.createElement('div');
    toast.className = 'ui-toast is-' + type;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'polite');

    var msg = document.createElement('span');
    msg.className = 'ui-toast-msg';
    msg.textContent = message;

    var btn = document.createElement('button');
    btn.className = 'ui-toast-close';
    btn.setAttribute('aria-label', 'Dismiss notification');
    btn.setAttribute('type', 'button');
    btn.textContent = '\u00d7'; // ×

    var dismissed = false;
    function dismiss() {
      if (dismissed) return;
      dismissed = true;
      toast.classList.add('is-leaving');
      setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 230);
    }

    btn.addEventListener('click', dismiss);
    toast.appendChild(msg);
    toast.appendChild(btn);
    container.appendChild(toast);

    if (duration > 0) {
      setTimeout(dismiss, duration);
    }

    return { dismiss: dismiss };
  };
})();
