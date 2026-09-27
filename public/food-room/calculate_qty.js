// calculate_qty.js
// Fetches and displays the ingredients_inventory table as 'Ingredients List'
document.addEventListener('DOMContentLoaded', function() {
  const syncedRecipeFilterKey = 'calculateQtySyncedRecipeId';
  let allPublishedRecipes = [];

  function notify(message, type = 'info', duration = 4200) {
    if (typeof window.showToast === 'function') {
      window.showToast(message, type, duration);
      return;
    }
    alert(message);
  }

  function fetchIngredientsInventory() {
    return fetch(`/api/ingredients/inventory/all?_t=${Date.now()}`, { cache: 'no-store' })
      .then(res => res.json())
      .then(data => {
        if (!data.success) throw new Error(data.error || 'Failed to fetch ingredients');
        return data.data || [];
      });
  }

  // Sync Quantity button handler
  const syncBtn = document.getElementById('sync-quantity-btn');
  if (syncBtn) {
    syncBtn.onclick = function() {
      const defaultRecipeId = (document.getElementById('filter-recipe-id')?.value || '').trim();
      const recipeIdInput = prompt('Which RecipeID do you want to sync?', defaultRecipeId);
      if (recipeIdInput === null) return;
      const recipeId = recipeIdInput.trim();
      if (!recipeId) {
        notify('Please enter a RecipeID to sync.', 'warning');
        return;
      }

      syncBtn.disabled = true;
      syncBtn.textContent = 'Syncing...';
      fetch('/api/ingredients/inventory/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipeId, reseed: true })
      })
        .then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
          return res.json();
        })
        .then(data => {
          if (data && data.success) {
            sessionStorage.setItem(syncedRecipeFilterKey, recipeId);
            notify(`Quantity sync complete for RecipeID ${recipeId}! Updated: ${data.updated}`, 'success', 4200);
            setTimeout(() => location.reload(), 500);
          } else {
            const message = data?.error || 'Unknown error';
            notify(`Sync failed: ${message}`, 'error', 6200);
          }
        })
        .catch(err => {
          const message = err && err.message ? err.message : String(err);
          notify(`Sync failed: ${message}`, 'error', 6200);
        })
        .finally(() => {
          syncBtn.disabled = false;
          syncBtn.textContent = 'Sync Quantity';
        });
    };
  }

  const asyncSyncBtn = document.getElementById('async-sync-btn');
  const asyncSyncStatus = document.getElementById('async-sync-status');
  const auditSyncAllBtn = document.getElementById('audit-sync-all-btn');
  const auditSyncAllStatus = document.getElementById('audit-sync-all-status');
  if (asyncSyncBtn) {
    asyncSyncBtn.onclick = async function() {
      const startInput = prompt('Sync from which RecipeID onward?', '7');
      if (startInput === null) return;
      const startRecipeId = Number(String(startInput).trim());
      if (!Number.isInteger(startRecipeId) || startRecipeId <= 0) {
        notify('Please enter a valid numeric RecipeID.', 'warning');
        return;
      }

      asyncSyncBtn.disabled = true;
      asyncSyncBtn.textContent = 'Async Syncing...';
      if (asyncSyncStatus) asyncSyncStatus.textContent = 'Loading recipe list...';

      try {
        const dropdownResp = await fetch('/api/recipes/display-dropdown');
        if (!dropdownResp.ok) {
          throw new Error(`Failed to load recipe list: ${dropdownResp.status} ${dropdownResp.statusText}`);
        }
        const dropdownData = await dropdownResp.json();
        const recipes = Array.isArray(dropdownData?.recipes) ? dropdownData.recipes : [];
        const recipeIds = recipes
          .map(r => Number(r.recipeid))
          .filter(id => Number.isInteger(id) && id >= startRecipeId)
          .sort((a, b) => a - b);

        if (!recipeIds.length) {
          notify(`No recipes found from RecipeID ${startRecipeId} onward.`, 'info', 4200);
          return;
        }

        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < recipeIds.length; i++) {
          const recipeId = recipeIds[i];
          if (asyncSyncStatus) {
            asyncSyncStatus.textContent = `Syncing ${i + 1}/${recipeIds.length} (RecipeID ${recipeId})...`;
          }

          try {
            const resp = await fetch('/api/ingredients/inventory/sync', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ recipeId, reseed: true })
            });
            const data = await resp.json();
            if (resp.ok && data && data.success) successCount++;
            else failCount++;
          } catch {
            failCount++;
          }
        }

        if (asyncSyncStatus) {
          asyncSyncStatus.textContent = `Done. Success: ${successCount}, Failed: ${failCount}`;
        }
        notify(
          `Async sync complete. Success: ${successCount}, Failed: ${failCount}.`,
          failCount > 0 ? 'warning' : 'success',
          failCount > 0 ? 6200 : 4200
        );

        const finalRecipeId = String(recipeIds[recipeIds.length - 1]);
        sessionStorage.setItem(syncedRecipeFilterKey, finalRecipeId);
        setTimeout(() => location.reload(), 500);
      } catch (err) {
        const message = err && err.message ? err.message : String(err);
        notify(`Async sync failed: ${message}`, 'error', 6200);
        if (asyncSyncStatus) asyncSyncStatus.textContent = 'Async sync failed.';
      } finally {
        asyncSyncBtn.disabled = false;
        asyncSyncBtn.textContent = 'Async Sync (From RecipeID)';
      }
    };
  }

  if (auditSyncAllBtn) {
    auditSyncAllBtn.onclick = async function() {
      const doReseed = confirm('Reseed missing recipes while syncing? Click OK for yes, Cancel for no.');

      auditSyncAllBtn.disabled = true;
      auditSyncAllBtn.textContent = 'Auditing...';
      if (auditSyncAllStatus) auditSyncAllStatus.textContent = 'Loading published recipes and inventory...';

      try {
        const [dropdownResp, inventoryResp] = await Promise.all([
          fetch('/api/recipes/display-dropdown'),
          fetch('/api/ingredients/inventory/all?_t=' + Date.now(), { cache: 'no-store' })
        ]);

        if (!dropdownResp.ok) {
          throw new Error(`Failed to load published recipes: ${dropdownResp.status} ${dropdownResp.statusText}`);
        }
        if (!inventoryResp.ok) {
          throw new Error(`Failed to load ingredients inventory: ${inventoryResp.status} ${inventoryResp.statusText}`);
        }

        const dropdownData = await dropdownResp.json();
        const inventoryData = await inventoryResp.json();

        const published = Array.isArray(dropdownData?.recipes) ? dropdownData.recipes : [];
        const inventoryRows = Array.isArray(inventoryData?.data) ? inventoryData.data : [];

        const publishedRecipeIds = [...new Set(
          published
            .map(r => Number(r.recipeid))
            .filter(id => Number.isInteger(id) && id > 0)
        )].sort((a, b) => a - b);

        const inventoryCountByRecipe = new Map();
        for (const row of inventoryRows) {
          const id = Number(row.recipe_id);
          if (!Number.isInteger(id) || id <= 0) continue;
          inventoryCountByRecipe.set(id, (inventoryCountByRecipe.get(id) || 0) + 1);
        }

        const missingRecipeIds = publishedRecipeIds.filter(id => (inventoryCountByRecipe.get(id) || 0) === 0);
        const alreadyLoadedCount = publishedRecipeIds.length - missingRecipeIds.length;

        if (!publishedRecipeIds.length) {
          if (auditSyncAllStatus) auditSyncAllStatus.textContent = 'No published recipes found to audit.';
          notify('No published recipes found to audit.', 'info', 4200);
          return;
        }

        if (!missingRecipeIds.length) {
          const summary = `Audit complete. Published: ${publishedRecipeIds.length}, already loaded: ${alreadyLoadedCount}, missing: 0.`;
          if (auditSyncAllStatus) auditSyncAllStatus.textContent = summary;
          notify(summary, 'success', 5200);
          return;
        }

        let successCount = 0;
        let failCount = 0;

        auditSyncAllBtn.textContent = 'Syncing Missing...';
        for (let i = 0; i < missingRecipeIds.length; i++) {
          const recipeId = missingRecipeIds[i];
          if (auditSyncAllStatus) {
            auditSyncAllStatus.textContent =
              `Audit: ${publishedRecipeIds.length} total, ${missingRecipeIds.length} missing. Syncing ${i + 1}/${missingRecipeIds.length} (RecipeID ${recipeId})...`;
          }

          try {
            const resp = await fetch('/api/ingredients/inventory/sync', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ recipeId, reseed: doReseed })
            });
            const data = await resp.json();
            if (resp.ok && data && data.success) successCount++;
            else failCount++;
          } catch (_) {
            failCount++;
          }
        }

        const summary = `Audit+sync complete. Published: ${publishedRecipeIds.length}, already loaded: ${alreadyLoadedCount}, missing: ${missingRecipeIds.length}, synced: ${successCount}, failed: ${failCount}.`;
        if (auditSyncAllStatus) auditSyncAllStatus.textContent = summary;
        notify(summary, failCount > 0 ? 'warning' : 'success', failCount > 0 ? 7000 : 5200);
        setTimeout(() => location.reload(), 600);
      } catch (err) {
        const message = err && err.message ? err.message : String(err);
        if (auditSyncAllStatus) auditSyncAllStatus.textContent = `Audit failed: ${message}`;
        notify(`Audit failed: ${message}`, 'error', 7000);
      } finally {
        auditSyncAllBtn.disabled = false;
        auditSyncAllBtn.textContent = 'Audit All + Load Missing Ingredients';
      }
    };
  }
  // Populate recipe filter dropdown and ingredients table
  Promise.all([
    fetchIngredientsInventory(),
    fetch('/api/recipes/display-dropdown').then(res => res.json())
  ])
    .then(([ingredients, recipesData]) => {
      const recipes = (recipesData && recipesData.recipes) ? recipesData.recipes : [];
      const sortedRecipes = [...recipes].sort((a, b) => {
        const aId = Number(a.recipeid || a.id) || 0;
        const bId = Number(b.recipeid || b.id) || 0;
        if (aId !== bId) return aId - bId;
        return String(a.name || '').localeCompare(String(b.name || ''));
      });
      const pendingRecipeId = sessionStorage.getItem(syncedRecipeFilterKey) || '';
      const filterDiv = document.getElementById('ingredients-recipe-filter');
      if (filterDiv) {
        let html = '<label for="filter-recipe-id" style="margin-right:8px;">Filter by Recipe:</label>';
        html += '<select id="filter-recipe-id" class="w3-select" style="width:auto;display:inline-block;margin-right:8px;">';
        html += '<option value="">-- Show All Recipes --</option>';
        for (const rec of sortedRecipes) {
          html += `<option value="${rec.recipeid || rec.id}">${rec.recipeid ? rec.recipeid + ' - ' : ''}${rec.name} (DB ID: ${rec.id})</option>`;
        }
        html += '</select>';
        html += '<button id="filter-ingredients-btn" class="w3-button w3-blue w3-small">Filter</button>';
        filterDiv.innerHTML = html;
        if (pendingRecipeId) {
          document.getElementById('filter-recipe-id').value = pendingRecipeId;
          sessionStorage.removeItem(syncedRecipeFilterKey);
        }
        document.getElementById('filter-ingredients-btn').onclick = function() {
          const selectedRecipeId = document.getElementById('filter-recipe-id').value;
          fetchIngredientsInventory()
            .then(freshIngredients => {
              renderIngredientsTable(freshIngredients, selectedRecipeId, allPublishedRecipes);
              renderPublishedRecipesTable(allPublishedRecipes, selectedRecipeId);
            })
            .catch(err => {
              const tableDiv = document.getElementById('ingredients-list-table');
              if (tableDiv) tableDiv.innerHTML = `<div class="w3-panel w3-red">Error: ${err.message}</div>`;
            });
        };
      }
      renderIngredientsTable(ingredients, pendingRecipeId || '', allPublishedRecipes);
    })
    .catch(err => {
      const tableDiv = document.getElementById('ingredients-list-table');
      if (tableDiv) tableDiv.innerHTML = `<div class="w3-panel w3-red">Error: ${err.message}</div>`;
    });

  // Fetch and render published recipes table
  fetch('/api/recipes/display-table')
    .then(res => res.json())
    .then(data => {
      allPublishedRecipes = Array.isArray(data) ? data : [];
      const selectedRecipeId = document.getElementById('filter-recipe-id')?.value || '';
      renderPublishedRecipesTable(allPublishedRecipes, selectedRecipeId);
    })
    .catch(err => {
      const tableDiv = document.getElementById('published-recipes-table');
      if (tableDiv) tableDiv.innerHTML = `<div class="w3-panel w3-red">Error: ${err.message}</div>`;
    });

  function getPublishedOrderMap(publishedRecipes, filterRecipeId) {
    if (!filterRecipeId || !Array.isArray(publishedRecipes)) return null;
    const rec = publishedRecipes.find(r => String(r.recipeid) === String(filterRecipeId));
    if (!rec || !rec.ingredients) return null;
    const lines = rec.ingredients
      .split(/<br\s*\/?>|\n/i)
      .map(l => l.replace(/<[^>]+>/g, '').trim())
      .filter(Boolean);
    const map = new Map();
    lines.forEach((line, i) => map.set(line.toLowerCase(), i));
    return map;
  }

  function renderIngredientsTable(ingredients, filterRecipeId, publishedRecipes) {
    const tableDiv = document.getElementById('ingredients-list-table');
    if (!tableDiv) return;
    let filtered = ingredients;
    if (filterRecipeId) {
      filtered = ingredients.filter(ing => String(ing.recipe_id) === String(filterRecipeId));
    }
    if (filterRecipeId && publishedRecipes) {
      const orderMap = getPublishedOrderMap(publishedRecipes, filterRecipeId);
      if (orderMap) {
        filtered = [...filtered].sort((a, b) => {
          const aPos = orderMap.get((a.ingredient_name || '').toLowerCase().trim());
          const bPos = orderMap.get((b.ingredient_name || '').toLowerCase().trim());
          return (aPos !== undefined ? aPos : 9999) - (bPos !== undefined ? bPos : 9999);
        });
      }
    }
    let html = '<table class="w3-table-all w3-small w3-hoverable"><thead><tr>' +
      '<th>ID</th><th>Ingredient Name</th><th>Recipe ID</th><th>Measure Qty</th><th>Measure Unit</th><th>Food Item</th>' +
      '</tr></thead><tbody>';
    if (filtered.length === 0) {
      html += '<tr><td colspan="6" class="w3-center w3-text-grey">No ingredients found for this RecipeID.</td></tr>';
    } else {
      for (const ing of filtered) {
        html += `<tr><td>${ing.id || ''}</td><td>${ing.ingredient_name || ''}</td><td>${ing.recipe_id || ''}</td><td>${ing.measure_qty || ''}</td><td>${ing.measure_unit || ''}</td><td>${ing.fooditem || ''}</td></tr>`;
      }
    }
    html += '</tbody></table>';
    tableDiv.innerHTML = html;
  }

  function renderPublishedRecipesTable(recipes, filterRecipeId = '') {
    const tableDiv = document.getElementById('published-recipes-table');
    if (!tableDiv) return;
    if (!recipes || !Array.isArray(recipes) || recipes.length === 0) {
      tableDiv.innerHTML = '<div class="w3-text-grey">No published recipes found.</div>';
      return;
    }

    let filteredRecipes = recipes;
    if (filterRecipeId) {
      filteredRecipes = recipes.filter(rec => String(rec.recipeid) === String(filterRecipeId));
    }

    if (!filteredRecipes.length) {
      tableDiv.innerHTML = '<div class="w3-text-grey">No published recipes found for this RecipeID.</div>';
      return;
    }

    let html = '<table class="w3-table-all w3-small w3-hoverable"><thead><tr>' +
      '<th>ID</th><th>RecipeID</th><th>Name</th><th>Description</th><th>Ingredients</th><th>Serving Size</th><th>URL</th><th>Instructions</th>' +
      '</tr></thead><tbody>';
    for (const rec of filteredRecipes) {
      html += `<tr><td>${rec.id || ''}</td><td>${rec.recipeid || ''}</td><td>${rec.name || ''}</td><td>${rec.description || ''}</td><td>${rec.ingredients || ''}</td><td>${rec.serving_size || ''}</td><td>${rec.url || ''}</td><td>${rec.instructions || ''}</td></tr>`;
    }
    html += '</tbody></table>';
    tableDiv.innerHTML = html;
  }
});
