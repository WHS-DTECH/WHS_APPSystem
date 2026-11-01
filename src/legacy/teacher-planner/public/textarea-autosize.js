(() => {
  'use strict';
  const root = document.getElementById('planner-content');
  const widths = new Map();
  function fit(area) {
    if (!area.getClientRects().length) return;
    area.classList.add('planner-auto-expand');
    area.style.height = 'auto';
    const style = getComputedStyle(area);
    const border = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
    area.style.height = Math.ceil(area.scrollHeight + border) + 'px';
  }
  function refresh() {
    for (const area of widths.keys()) {
      if (!area.isConnected) { observer.unobserve(area); widths.delete(area); }
    }
    for (const area of root.querySelectorAll('textarea')) {
      if (!widths.has(area)) { widths.set(area, 0); observer.observe(area); }
      fit(area);
    }
  }
  const observer = new ResizeObserver(entries => {
    for (const entry of entries) {
      const area = entry.target;
      if (!area.isConnected) { observer.unobserve(area); widths.delete(area); continue; }
      if (widths.get(area) !== entry.contentRect.width) {
        widths.set(area, entry.contentRect.width);
        refresh();
      }
    }
  });
  root.addEventListener('input', event => {
    if (event.target.matches('textarea')) { fit(event.target); refresh(); }
  });
  new MutationObserver(refresh).observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
  window.addEventListener('resize', refresh);
  window.addEventListener('afterprint', refresh);
  globalThis.plannerTextareaAutosize = { refresh, fit };
  refresh();
})();
