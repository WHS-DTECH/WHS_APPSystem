(function () {
  const body = document.getElementById('suggestions-body');
  const status = document.getElementById('suggestions-status');

  function cell(text) {
    const td = document.createElement('td');
    td.style.cssText = 'padding:8px;border-bottom:1px solid #eee;vertical-align:top';
    td.textContent = text || '';
    return td;
  }

  async function load() {
    try {
      const res = await fetch('/api/suggestions');
      if (!res.ok) throw new Error(res.status === 403 ? 'Admin access required.' : 'Could not load suggestions.');
      const rows = await res.json();
      status.textContent = rows.length ? `${rows.length} suggestion${rows.length === 1 ? '' : 's'}` : 'No suggestions yet.';
      rows.forEach((row) => {
        const tr = document.createElement('tr');
        tr.appendChild(cell(row.date ? String(row.date).slice(0, 10) : ''));
        tr.appendChild(cell(row.activity_name));
        tr.appendChild(cell(row.suggested_by));
        tr.appendChild(cell(row.email));
        const urlCell = cell('');
        if (row.url) {
          const a = document.createElement('a');
          a.href = row.url;
          a.target = '_blank';
          a.rel = 'noopener';
          a.textContent = row.url;
          urlCell.appendChild(a);
        }
        tr.appendChild(urlCell);
        tr.appendChild(cell(row.reason));
        body.appendChild(tr);
      });
    } catch (error) {
      status.textContent = error.message;
    }
  }

  load();
})();
