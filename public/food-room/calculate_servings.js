// Fetch and render all records from desired_servings_ingredients
let allDSIRecords = [];
let recipeNameById = {};
let pendingDSIFilterPreset = null;

function extractRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.data)) return payload.data;
  return [];
}

function loadRecipeLookup() {
  return fetch('/api/recipes')
    .then(res => res.json())
    .then(rows => {
      const recipes = Array.isArray(rows) ? rows : [];
      recipeNameById = recipes.reduce((acc, recipe) => {
        const id = recipe && recipe.id != null ? String(recipe.id) : '';
        if (id) {
          acc[id] = recipe.name || '';
        }
        return acc;
      }, {});
    })
    .catch(() => {
      recipeNameById = {};
    });
}

function loadDesiredServingIngredientsTable() {
  Promise.all([
    fetch('/api/ingredients/desired_servings_ingredients').then(res => res.json()),
    loadRecipeLookup()
  ]).then(([data]) => {
    allDSIRecords = extractRows(data);
    populateDSIFilters();
    renderDesiredServingIngredientsTable(allDSIRecords);
  }).catch(() => {
    allDSIRecords = [];
    populateDSIFilters();
    renderDesiredServingIngredientsTable(allDSIRecords);
  });
}

function populateDSIFilters() {
  const teacherSelect = document.getElementById('filter-dsi-teacher');
  const classSelect = document.getElementById('filter-dsi-class');
  const recipeSelect = document.getElementById('filter-dsi-recipe');
  if (!teacherSelect || !classSelect || !recipeSelect) return;
  const prevTeacher = teacherSelect.value || '';
  const prevClass = classSelect.value || '';
  const prevRecipe = recipeSelect.value || '';
  // Get unique teachers, classes, and recipe IDs
  const teachers = Array.from(new Set(allDSIRecords.map(r => r.teacher).filter(Boolean)));
  const classes = Array.from(new Set(allDSIRecords.map(r => r.class_name).filter(Boolean)));
  const recipeIds = Array.from(new Set(allDSIRecords.map(r => r.recipe_id).filter(v => v !== null && v !== undefined && v !== '')))
    .map(id => String(id))
    .sort((a, b) => Number(a) - Number(b));
  // Populate teacher dropdown
  teacherSelect.innerHTML = '<option value="">All</option>' + teachers.map(t => `<option value="${t}">${t}</option>`).join('');
  // Populate class dropdown
  classSelect.innerHTML = '<option value="">All</option>' + classes.map(c => `<option value="${c}">${c}</option>`).join('');
  // Populate recipe dropdown as "RecipeID | Recipe Name"
  recipeSelect.innerHTML = '<option value="">All</option>' + recipeIds.map(id => {
    const recipeName = recipeNameById[id] || 'Unknown Recipe';
    return `<option value="${id}">${id} | ${recipeName}</option>`;
  }).join('');

  function applyIfExists(selectEl, value) {
    if (!selectEl) return;
    const wanted = String(value || '');
    const hasOption = Array.from(selectEl.options || []).some(opt => String(opt.value) === wanted);
    selectEl.value = hasOption ? wanted : '';
  }

  if (pendingDSIFilterPreset) {
    applyIfExists(teacherSelect, pendingDSIFilterPreset.teacher);
    applyIfExists(classSelect, pendingDSIFilterPreset.className);
    applyIfExists(recipeSelect, pendingDSIFilterPreset.recipeId);
    pendingDSIFilterPreset = null;
  } else {
    // Preserve existing user selection when filters are repopulated.
    applyIfExists(teacherSelect, prevTeacher);
    applyIfExists(classSelect, prevClass);
    applyIfExists(recipeSelect, prevRecipe);
  }
}

function presetDSIFilters(filters) {
  const next = filters || {};
  pendingDSIFilterPreset = {
    teacher: String(next.teacher || ''),
    className: String(next.className || ''),
    recipeId: String(next.recipeId || '')
  };
  // Ensure options are current, then apply the preset.
  populateDSIFilters();
  renderDesiredServingIngredientsTable(allDSIRecords);
}

window.presetDSIFilters = presetDSIFilters;
document.addEventListener('DOMContentLoaded', () => {
  loadDesiredServingIngredientsTable();
  const delBtn = document.getElementById('delete-all-desired-serving-ingredients-btn');
  if (delBtn) {
    delBtn.onclick = function() {
      if (confirm('Are you sure you want to delete ALL desired serving ingredients? This cannot be undone.')) {
        fetch('/api/ingredients/desired_servings_ingredients/all', { method: 'DELETE' })
          .then(res => res.json())
          .then(data => {
            if (data.success) {
              // Clear UI immediately, then reload from backend for consistency.
              allDSIRecords = [];
              populateDSIFilters();
              renderDesiredServingIngredientsTable(allDSIRecords);
              loadDesiredServingIngredientsTable();
              if (window.QC) window.QC.toast('Deleted all desired serving ingredients', 'success');
            } else {
              if (window.QC) window.QC.toast('Delete failed: ' + (data.error || 'Unknown error'), 'error');
              else alert('Delete failed: ' + (data.error || 'Unknown error'));
            }
          });
      }
    };
  }

  if (window.QC) {
    window.QC.addSanityButton('Calculate Servings', [
      {
        name: 'Desired servings endpoint reachable',
        run: async () => (await fetch('/api/ingredients/desired_servings_ingredients')).ok
      },
      {
        name: 'Recipe display endpoint reachable',
        run: async () => (await fetch('/api/recipes/display-dropdown')).ok
      },
      {
        name: 'Core selectors present',
        run: async () => {
          return !!document.getElementById('teacher-select') &&
            !!document.getElementById('class-select') &&
            !!document.getElementById('desired-serving-ingredients-table');
        }
      }
    ]);
  }
});

function renderDesiredServingIngredientsTable(records) {
  const container = document.getElementById('desired-serving-ingredients-table');
  if (!container) return;
  // Apply filters
  const teacher = document.getElementById('filter-dsi-teacher')?.value || '';
  const className = document.getElementById('filter-dsi-class')?.value || '';
  const recipeId = document.getElementById('filter-dsi-recipe')?.value || '';
  let filtered = records;
  if (teacher) filtered = filtered.filter(r => r.teacher === teacher);
  if (className) filtered = filtered.filter(r => r.class_name === className);
  if (recipeId) filtered = filtered.filter(r => String(r.recipe_id) === String(recipeId));
  if (!filtered.length) {
    container.innerHTML = '<div>No desired serving ingredients found.</div>';
    return;
  }
  let html = '<table class="inventory-table"><thead><tr>' +
    '<th>ID</th><th>Booking ID</th><th>Teacher</th><th>Class Name</th><th>Class Date</th><th>Recipe ID</th><th>Ingredient</th><th>Unit</th><th>Food Item</th><th>StripFoodItem</th><th>Aisle Category</th>' +
    '</tr></thead><tbody>';
  for (const rec of filtered) {
    html += `<tr><td>${rec.id || ''}</td><td>${rec.booking_id || ''}</td><td>${rec.teacher || ''}</td><td>${rec.class_name || ''}</td><td>${rec.class_date || ''}</td><td>${rec.recipe_id || ''}</td><td>${rec.ingredient_name || ''}</td><td>${rec.measure_unit || ''}</td><td>${rec.fooditem || ''}</td><td>${rec.stripFoodItem || rec.strip_fooditem || ''}</td><td>${rec.aisle_category_id || ''}</td></tr>`;
  }
  html += '</tbody></table>';
  container.innerHTML = html;
}

// Listen for filter changes
document.addEventListener('DOMContentLoaded', () => {
  const teacherSelect = document.getElementById('filter-dsi-teacher');
  const classSelect = document.getElementById('filter-dsi-class');
  const recipeSelect = document.getElementById('filter-dsi-recipe');
  if (teacherSelect) teacherSelect.onchange = () => renderDesiredServingIngredientsTable(allDSIRecords);
  if (classSelect) classSelect.onchange = () => renderDesiredServingIngredientsTable(allDSIRecords);
  if (recipeSelect) recipeSelect.onchange = () => renderDesiredServingIngredientsTable(allDSIRecords);
});
