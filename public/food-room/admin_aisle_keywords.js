// JS for admin_aisle_keywords.html: Add, Edit, Delete functionality

document.addEventListener('DOMContentLoaded', function() {
  const tbody = document.getElementById('aisle-keywords-tbody');
  const status = document.getElementById('aisle-keywords-status');
  const addForm = document.getElementById('add-aisle-keyword-form');
  const addKeywordInput = document.getElementById('add-keyword-input');
  const addCategorySelect = document.getElementById('add-category-select');

  function loadKeywords() {
    fetch('/api/aisle_keywords/all')
      .then(res => res.json())
      .then(data => {
        tbody.innerHTML = '';
        if (data.success && data.keywords.length) {
          data.keywords.forEach(row => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
              <td>${row.id}</td>
              <td>${row.aisle_category}</td>
              <td><span class="keyword-text">${row.keyword}</span></td>
              <td>
                <button class="edit-btn" data-id="${row.id}" data-keyword="${row.keyword}" data-category="${row.aisle_category}">Edit</button>
                <button class="delete-btn" data-id="${row.id}">Delete</button>
              </td>
            `;
            tbody.appendChild(tr);
          });
        } else {
          tbody.innerHTML = '<tr><td colspan="4">No aisle keywords found.</td></tr>';
        }

        // Refresh categories after keywords load so newly-seeded categories (e.g. Meat) appear immediately.
        loadCategories(addCategorySelect);
      });
  }

  // Load categories for add/edit
  function loadCategories(selectEl, selected) {
    fetch('/api/aisle_category')
      .then(res => res.json())
      .then(data => {
        selectEl.innerHTML = '';
        if (data && Array.isArray(data.categories) && data.categories.length) {
          data.categories.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat.id;
            opt.textContent = cat.name;
            if (selected && selected == cat.id) opt.selected = true;
            selectEl.appendChild(opt);
          });
        }
      });
  }

  // Add keyword
  addForm.onsubmit = function(e) {
    e.preventDefault();
    const keyword = addKeywordInput.value.trim();
    const aisle_category_id = addCategorySelect.value;
    if (!keyword || !aisle_category_id) return;
    fetch('/api/aisle_keywords/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword, aisle_category_id })
    })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        status.textContent = 'Keyword added!';
        addKeywordInput.value = '';
        loadKeywords();
      } else {
        status.textContent = 'Failed to add keyword.';
      }
    });
  };

  // Edit/Delete handlers
  tbody.onclick = function(e) {
    if (e.target.classList.contains('delete-btn')) {
      const id = e.target.getAttribute('data-id');
      if (confirm('Delete this keyword?')) {
        fetch('/api/aisle_keywords/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id })
        })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            status.textContent = 'Keyword deleted!';
            loadKeywords();
          } else {
            status.textContent = 'Failed to delete keyword.';
          }
        });
      }
    } else if (e.target.classList.contains('edit-btn')) {
      const id = e.target.getAttribute('data-id');
      const oldKeyword = e.target.getAttribute('data-keyword');
      const oldCategory = e.target.getAttribute('data-category');
      const newKeyword = prompt('Edit keyword:', oldKeyword);
      if (newKeyword !== null && newKeyword.trim() !== '') {
        // For category, could add a select, but for now keep same
        fetch('/api/aisle_keywords/edit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, keyword: newKeyword.trim() })
        })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            status.textContent = 'Keyword updated!';
            loadKeywords();
          } else {
            status.textContent = 'Failed to update keyword.';
          }
        });
      }
    }
  };

  // Initial load: load keywords first so category seeds are in place before dropdown render.
  loadKeywords();
});
