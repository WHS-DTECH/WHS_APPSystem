// Admin Aisle Category Management

document.addEventListener('DOMContentLoaded', () => {
  const tableContainer = document.getElementById('aisle-category-table-container');
  const addBtn = document.getElementById('add-aisle-btn');
  const formContainer = document.getElementById('aisle-form-container');

  function fetchCategories() {
    fetch('/api/aisle_category')
      .then(res => res.json())
      .then(data => {
        if (!data.success || !Array.isArray(data.categories)) {
          tableContainer.innerHTML = '<div style="color:red;">Failed to load categories.</div>';
        } else {
          renderTable(data.categories);
        }
      })
      .catch(() => {
        tableContainer.innerHTML = '<div style="color:red;">Failed to load categories.</div>';
      });
  }

  function renderTable(categories) {
    tableContainer.innerHTML = `
      <table style="width:100%;margin-top:1rem;border-collapse:collapse;">
        <thead>
          <tr style="background:#f5f5f5;">
            <th style="border:1px solid #eee;padding:0.5rem 0.7rem;">ID</th>
            <th style="border:1px solid #eee;padding:0.5rem 0.7rem;">Master Category</th>
            <th style="border:1px solid #eee;padding:0.5rem 0.7rem;">Sub Aisle</th>
            <th style="border:1px solid #eee;padding:0.5rem 0.7rem;">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${categories.length === 0 ? `<tr><td colspan='4' style='text-align:center;color:#888;padding:1rem;'>No categories found.</td></tr>` :
            categories.map(cat => `
              <tr>
                <td style="border:1px solid #eee;padding:0.5rem 0.7rem;">${cat.id}</td>
                <td style="border:1px solid #eee;padding:0.5rem 0.7rem;">${cat.master_category || cat.name || ''}</td>
                <td style="border:1px solid #eee;padding:0.5rem 0.7rem;">${cat.name}</td>
                <td style="border:1px solid #eee;padding:0.5rem 0.7rem;">
                  <button class="edit-btn" data-id="${cat.id}" data-name="${cat.name}" data-master="${cat.master_category || cat.name || ''}">Edit</button>
                  <button class="delete-btn" data-id="${cat.id}">Delete</button>
                </td>
              </tr>
            `).join('')}
        </tbody>
      </table>
    `;
    attachTableEvents();
  }

  function attachTableEvents() {
    tableContainer.querySelectorAll('.edit-btn').forEach(btn => {
      btn.onclick = () => showEditForm(btn.dataset.id, btn.dataset.name, btn.dataset.master);
    });
    tableContainer.querySelectorAll('.delete-btn').forEach(btn => {
      btn.onclick = () => deleteCategory(btn.dataset.id);
    });
  }

  addBtn.onclick = () => showAddForm();

  function showAddForm() {
    formContainer.style.display = 'block';
    formContainer.innerHTML = `
      <input type="text" id="new-aisle-master" placeholder="Master Category (e.g. Dairy)" />
      <input type="text" id="new-aisle-name" placeholder="Sub Aisle Name (e.g. Cheese)" />
      <button id="save-new-aisle">Save</button>
      <button id="cancel-add">Cancel</button>
    `;
    document.getElementById('save-new-aisle').onclick = () => {
      const name = document.getElementById('new-aisle-name').value.trim();
      const master = document.getElementById('new-aisle-master').value.trim();
      if (!name) return alert('Sub aisle name required');
      fetch('/api/aisle_category', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, master_category: master || name })
      }).then(async res => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to add category');
        formContainer.style.display = 'none';
        fetchCategories();
      }).catch(err => {
        alert(err.message || 'Failed to add category');
      });
    };
    document.getElementById('cancel-add').onclick = () => {
      formContainer.style.display = 'none';
    };
  }

  function showEditForm(id, name, master) {
    formContainer.style.display = 'block';
    formContainer.innerHTML = `
      <input type="text" id="edit-aisle-master" value="${master || name}" />
      <input type="text" id="edit-aisle-name" value="${name}" />
      <button id="save-edit-aisle">Save</button>
      <button id="cancel-edit">Cancel</button>
    `;
    document.getElementById('save-edit-aisle').onclick = () => {
      const newName = document.getElementById('edit-aisle-name').value.trim();
      const newMaster = document.getElementById('edit-aisle-master').value.trim();
      if (!newName) return alert('Sub aisle name required');
      fetch(`/api/aisle_category/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, master_category: newMaster || newName })
      }).then(async res => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to update category');
        formContainer.style.display = 'none';
        fetchCategories();
      }).catch(err => {
        alert(err.message || 'Failed to update category');
      });
    };
    document.getElementById('cancel-edit').onclick = () => {
      formContainer.style.display = 'none';
    };
  }

  function deleteCategory(id) {
    if (!confirm('Delete this category?')) return;
    fetch(`/api/aisle_category/${id}`, { method: 'DELETE' })
      .then(async res => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to delete category');
        fetchCategories();
      })
      .catch(err => alert(err.message || 'Failed to delete category'));
  }

  fetchCategories();
});
