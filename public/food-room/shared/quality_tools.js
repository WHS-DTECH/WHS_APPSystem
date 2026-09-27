(function () {
  function ensureToastContainer() {
    let container = document.getElementById('qc-toast-container');
    if (container) return container;
    container = document.createElement('div');
    container.id = 'qc-toast-container';
    container.style.position = 'fixed';
    container.style.top = '12px';
    container.style.right = '12px';
    container.style.zIndex = '99999';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '8px';
    document.body.appendChild(container);
    return container;
  }

  function toast(message, type) {
    const container = ensureToastContainer();
    const t = document.createElement('div');
    t.textContent = message;
    t.style.padding = '10px 12px';
    t.style.borderRadius = '8px';
    t.style.color = '#fff';
    t.style.fontSize = '13px';
    t.style.fontWeight = '600';
    t.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
    t.style.maxWidth = '420px';
    t.style.wordBreak = 'break-word';
    if (type === 'error') {
      t.style.background = '#c62828';
    } else if (type === 'warn') {
      t.style.background = '#ef6c00';
    } else {
      t.style.background = '#2e7d32';
    }
    container.appendChild(t);
    setTimeout(function () {
      if (t.parentNode) t.parentNode.removeChild(t);
    }, 3200);
  }

  async function runChecks(pageName, checks) {
    const failures = [];
    for (const check of checks) {
      try {
        const ok = await check.run();
        if (!ok) failures.push(check.name);
      } catch (err) {
        failures.push(check.name + ': ' + (err && err.message ? err.message : 'error'));
      }
    }
    if (failures.length) {
      toast(pageName + ' checks failed: ' + failures.join(' | '), 'error');
      return false;
    }
    toast(pageName + ' checks passed', 'success');
    return true;
  }

  function addSanityButton(pageName, checks) {
    if (document.getElementById('qc-sanity-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'qc-sanity-btn';
    btn.textContent = 'Run Sanity Check';
    btn.style.position = 'fixed';
    const fixedBar = document.getElementById('shoppingListButtonBar');
    btn.style.bottom = fixedBar ? '92px' : '16px';
    btn.style.right = '16px';
    btn.style.zIndex = '99998';
    btn.style.background = '#1565c0';
    btn.style.color = '#fff';
    btn.style.border = 'none';
    btn.style.borderRadius = '8px';
    btn.style.padding = '10px 12px';
    btn.style.cursor = 'pointer';
    btn.style.fontWeight = '700';
    btn.style.fontSize = '12px';
    btn.style.boxShadow = '0 2px 8px rgba(0,0,0,0.25)';
    btn.onclick = function () { runChecks(pageName, checks || []); };
    document.body.appendChild(btn);
  }

  window.QC = {
    toast: toast,
    addSanityButton: addSanityButton,
    runChecks: runChecks
  };
})();
