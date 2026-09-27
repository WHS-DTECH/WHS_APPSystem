// This script fetches and displays the recipe_display table at the bottom of index.html

document.addEventListener('DOMContentLoaded', function() {
  const runLoad = () => {
    fetch('/api/recipes/display-table?fields=summary', { cache: 'no-store' })
      .then(res => res.json())
      .then(rows => {
        if (!Array.isArray(rows) || rows.length === 0) return;
        const table = document.createElement('table');
        table.style = 'width:100%;margin-top:2rem;border-collapse:collapse;background:#fff;';
        // Table header
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        Object.keys(rows[0]).forEach(key => {
          const th = document.createElement('th');
          th.textContent = key;
          th.style = 'padding:0.5rem 0.7rem;border:1px solid #eee;background:#f5f5f5;';
          headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        table.appendChild(thead);
        // Table body
        const tbody = document.createElement('tbody');
        rows.forEach(row => {
          const tr = document.createElement('tr');
          Object.values(row).forEach(val => {
            const td = document.createElement('td');
            td.textContent = val;
            td.style = 'border:1px solid #eee;padding:0.5rem 0.7rem;';
            tr.appendChild(td);
          });
          tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        // Insert at bottom of main content
        document.body.appendChild(table);
      });
  };

  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(runLoad, { timeout: 4000 });
  } else {
    setTimeout(runLoad, 600);
  }
});
