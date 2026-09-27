
// Render the ingredients inventory table
function renderIngredientsInventory() {
  const container = document.getElementById('ingredients-inventory-table');
  fetch('/api/ingredients/inventory/all')
    .then(res => res.json())
    .then(data => {
      // Support both {data: [...]} and legacy {ingredients: [...]} and raw array
      const ingredients = Array.isArray(data) ? data : (Array.isArray(data.data) ? data.data : (Array.isArray(data.ingredients) ? data.ingredients : []));

      // If a page defines its own renderer (for sort controls/custom columns), use it.
      if (typeof window.renderIngredientsInventoryTable === 'function') {
        window.renderIngredientsInventoryTable(ingredients);
        return;
      }

      const table = document.createElement('table');
      table.style.width = '100%';
      table.style.marginTop = '2rem';
      table.style.borderCollapse = 'collapse';
      // Helper to display empty string for null/undefined
      function safe(val) { return val === null || val === undefined ? '' : val; }
      // Fetch brands and aisle categories for dropdowns
      Promise.all([
        fetch('food_brands.json').then(res => res.json()),
        fetch('/api/aisle_keywords/all').then(res => res.json())
      ]).then(([brands, keywordsData]) => {
        const keywords = keywordsData.keywords || [];
        // Build a unique list of categories from keywords
        const categories = Array.from(new Set(keywords.map(k => k.aisle_category))).filter(Boolean).map((name, i) => ({ id: i + 1, name }));
        // Helper to strip brands and parenthesis from food item
        function stripFoodItemDynamic(name) {
          let stripped = name.replace(/\s*\([^)]*\)\s*$/, '').trim();
          brands.forEach(brand => {
            // Remove brand at start, case-insensitive, with or without apostrophe s
            const re = new RegExp('^' + brand.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&") + "('?s)?\\s+", 'i');
            stripped = stripped.replace(re, '');
          });
          return stripped.trim();
        }
        // Helper to auto-assign category by matching ingredient/fooditem to keywords
        function findCategoryByKeyword(ingredient) {
          const lower = (ingredient || '').toLowerCase();
          const match = keywords.find(k => lower.includes((k.keyword || '').toLowerCase()));
          return match ? match.aisle_category : '';
        }
        table.innerHTML = `
            <thead>
              <tr style="background:#f5f5f5;">
                <th style="border:1px solid #eee;padding:0.5rem 0.7rem;">ID</th>
                <th style="border:1px solid #eee;padding:0.5rem 0.7rem;">Ingredient Name</th>
                <th style="border:1px solid #eee;padding:0.5rem 0.7rem;">Recipe ID</th>
                <th style="border:1px solid #eee;padding:0.5rem 0.7rem;">Quantity</th>
                <th style="border:1px solid #eee;padding:0.5rem 0.7rem;">Measure Qty</th>
                <th style="border:1px solid #eee;padding:0.5rem 0.7rem;">Measure Unit</th>
                <th style="border:1px solid #eee;padding:0.5rem 0.7rem;">FoodItem</th>
                <th style="border:1px solid #eee;padding:0.5rem 0.7rem;">StripFoodItem</th>
                <th style="border:1px solid #eee;padding:0.5rem 0.7rem;">Aisle Category</th>
                <th style="border:1px solid #eee;padding:0.5rem 0.7rem;">Assign</th>
              </tr>
            </thead>
            <tbody>
              ${ingredients.length === 0 ? `<tr><td colspan='10' style='text-align:center;color:#888;padding:1rem;'>No ingredients in inventory.</td></tr>` :
                ingredients.map(row => {
                  // Use the dynamic stripFoodItem function with loaded brands
                  let stripFood = stripFoodItemDynamic(row.fooditem || '');
                  // Try to auto-assign category by keyword if not set
                  let assignedCategory = '';
                  if (row.aisle_category_id) {
                    const catObj = categories.find(c => c.id === row.aisle_category_id);
                    assignedCategory = catObj ? catObj.name : '';
                  } else {
                    assignedCategory = findCategoryByKeyword(row.fooditem || row.ingredient_name || '');
                  }
                  return `<tr>
                    <td style="border:1px solid #eee;padding:0.5rem 0.7rem;">${safe(row.id)}</td>
                    <td style="border:1px solid #eee;padding:0.5rem 0.7rem;">${safe(row.ingredient_name)}</td>
                    <td style="border:1px solid #eee;padding:0.5rem 0.7rem;">${safe(row.recipe_id)}</td>
                    <td style="border:1px solid #eee;padding:0.5rem 0.7rem;">${safe(row.quantity)}</td>
                    <td style="border:1px solid #eee;padding:0.5rem 0.7rem;">${safe(row.measure_qty)}</td>
                    <td style="border:1px solid #eee;padding:0.5rem 0.7rem;">${safe(row.measure_unit)}</td>
                    <td style="border:1px solid #eee;padding:0.5rem 0.7rem;">${safe(row.fooditem)}</td>
                    <td style="border:1px solid #eee;padding:0.5rem 0.7rem; color:green;">${stripFood}</td>
                    <td style="border:1px solid #eee;padding:0.5rem 0.7rem;">${assignedCategory}</td>
                    <td style="border:1px solid #eee;padding:0.5rem 0.7rem;">
                      <select data-id="${row.id}" class="aisle-category-select">
                        <option value="">--Assign--</option>
                        ${categories.map(c => `<option value="${c.id}"${assignedCategory === c.name ? ' selected' : ''}>${c.name}</option>`).join('')}
                      </select>
                    </td>
                  </tr>`;
                }).join('')}
            </tbody>
          `;
          if (container) {
            container.innerHTML = '';
            container.appendChild(table);
          }
          // Add event listeners for dropdowns
          table.querySelectorAll('.aisle-category-select').forEach(select => {
            select.onchange = function() {
              const ingredientId = this.getAttribute('data-id');
              const aisleId = this.value;
              fetch(`/api/ingredients/inventory/assign-aisle`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ingredient_id: ingredientId, aisle_category_id: aisleId })
              }).then(() => {
                renderIngredientsInventory();
              });
            };
          });
        });
      if (container) {
        container.innerHTML = '';
        container.appendChild(table);
      }
    })
    .catch(err => {
      if (container) {
        container.innerHTML = `<div style='color:red;padding:1rem;'>Failed to load ingredients inventory.</div>`;
      }
    });
}


// Render the recipes table below the ingredients table
function renderRecipesTable() {
  fetch('/api/recipes')
    .then(res => res.json())
    .then(data => {
      const table = document.createElement('table');
      table.id = 'mainRecipesTable';
      table.style.width = '100%';
      table.style.marginTop = '1.5rem';
      table.style.borderCollapse = 'collapse';
      table.innerHTML = `
        <thead>
          <tr style="background:#f5f5f5;">
            <th style='border:1px solid #eee;padding:0.5rem 0.7rem;'>ID</th>
            <th style='border:1px solid #eee;padding:0.5rem 0.7rem;'>Upload ID</th>
            <th style='border:1px solid #eee;padding:0.5rem 0.7rem;'>Name/URL</th>
            <th style='border:1px solid #eee;padding:0.5rem 0.7rem;'>Description</th>
            <th style='border:1px solid #eee;padding:0.5rem 0.7rem;'>Ingredients</th>
            <th style='border:1px solid #eee;padding:0.5rem 0.7rem;'>Serving Size</th>
            <th style='border:1px solid #eee;padding:0.5rem 0.7rem;'>Instructions</th>
            <th style='border:1px solid #eee;padding:0.5rem 0.7rem;'>Instructions Extracted</th>
            <th style='border:1px solid #eee;padding:0.5rem 0.7rem;'>URL</th>
            <th style='border:1px solid #eee;padding:0.5rem 0.7rem;'>Delete</th>
          </tr>
        </thead>
        <tbody>
          ${data.length === 0 ? `<tr><td colspan='10' style='text-align:center;color:#888;padding:1rem;'>No recipes found.</td></tr>` :
            data.map(recipe => `
              <tr>
                <td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${recipe.id}</td>
                <td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${recipe.uploaded_recipe_id || ''}</td>
                <td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${recipe.name || (recipe.url ? `<a href='${recipe.url}' target='_blank'>${recipe.url}</a>` : '')}</td>
                <td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${recipe.description || ''}</td>
                <td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${recipe.ingredients || ''}</td>
                <td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${recipe.serving_size || ''}</td>
                <td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${recipe.instructions || ''}</td>
                <td style='border:1px solid #eee;padding:0.5rem 0.7rem; color:purple;'>${recipe.instructions_extracted || ''}</td>
                <td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${recipe.url ? `<a href='${recipe.url}' target='_blank'>Link</a>` : ''}</td>
                <td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>
                  <button class='delete-recipe-btn' data-id='${recipe.id}' style='background:#e53935;color:#fff;border:none;padding:0.4rem 0.8rem;border-radius:4px;cursor:pointer;'>Delete</button>
                </td>
              </tr>
            `).join('')}
        </tbody>
      `;
      const container = document.getElementById('recipes-table-container');
      if (container) {
        container.innerHTML = '';
        container.appendChild(table);
      }
      // Add delete button listeners
      document.querySelectorAll('.delete-recipe-btn').forEach(btn => {
        btn.addEventListener('click', function() {
          const id = this.getAttribute('data-id');
          if (confirm('Are you sure you want to delete this recipe?')) {
            fetch(`/api/recipes/${id}`, { method: 'DELETE' })
              .then(res => res.json())
              .then(result => {
                if (result.success) {
                  renderRecipesTable();
                } else {
                  alert('Failed to delete recipe.');
                }
              });
          }
        });
      });
    })
    .catch(err => {
      const container = document.getElementById('recipes-table-container');
      if (container) {
        container.innerHTML = `<div style='color:red;padding:1rem;'>Failed to load recipes.</div>`;
      }
    });
}

document.addEventListener('DOMContentLoaded', function() {
  renderIngredientsInventory();
  renderRecipesTable();
  // Listen for custom event to refresh table after DELETE ALL
  document.addEventListener('ingredients-inventory-refresh', function() {
    renderIngredientsInventory();
    renderRecipesTable();
  });
});
    // Render a debug table showing the raw JSON data from the API
    function renderIngredientsInventoryDebug() {
      fetch('/api/ingredients-inventory')
        .then(res => res.json())
        .then(data => {
          const table = document.createElement('table');
          table.style.width = '100%';
          table.style.marginTop = '1rem';
          table.style.borderCollapse = 'collapse';
          table.style.background = '#f9f9f9';
          table.innerHTML = `
            <thead>
              <tr style="background:#e0e0e0;">
                <th>ID</th>
                <th>Ingredient Name</th>
                <th>Quantity</th>
                <th>FoodItem</th>
                <th>Measure Qty</th>
                <th>Measure Unit</th>
                <th>Recipe ID</th>
              </tr>
            </thead>
            <tbody>
              ${data.length === 0 ? `<tr><td colspan='7' style='text-align:center;color:#888;padding:1rem;'>No data.</td></tr>` :
                data.map(row => `
                  <tr>
                    <td>${row.id}</td>
                    <td>${row.ingredient_name}</td>
                    <td>${row.quantity}</td>
                    <td>${row.strip_fooditem || row.fooditem || row.measure_unit || ''}</td>
                    <td>${row.measure_qty ?? ''}</td>
                    <td>${row.measure_unit ?? ''}</td>
                    <td>${row.recipe_id}</td>
                  </tr>
                `).join('')}
            </tbody>
          `;
          const container = document.getElementById('ingredients-inventory-debug-table');
          if (container) {
            container.innerHTML = '<h4 style="margin-top:2rem;">Debug: Raw Inventory Data</h4>';
            container.appendChild(table);
          }
        });
    }
  
    renderIngredientsInventoryDebug();
