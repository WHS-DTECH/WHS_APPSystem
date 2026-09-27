// display_recipe_details.js
// Fetches and displays a single recipe from recipe_display table by id

document.addEventListener('DOMContentLoaded', function() {
  const STOCK_IMAGES = {
    'Baking': [
      'https://images.pexels.com/photos/3026808/pexels-photo-3026808.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/291528/pexels-photo-291528.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/1055272/pexels-photo-1055272.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/132694/pexels-photo-132694.jpeg?auto=compress&cs=tinysrgb&w=1200'
    ],
    'Fresh and Veg': [
      'https://images.pexels.com/photos/1211887/pexels-photo-1211887.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/257816/pexels-photo-257816.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/1300972/pexels-photo-1300972.jpeg?auto=compress&cs=tinysrgb&w=1200'
    ],
    'Main Meals': [
      'https://images.pexels.com/photos/1279330/pexels-photo-1279330.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/1527603/pexels-photo-1527603.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/1437267/pexels-photo-1437267.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/2233729/pexels-photo-2233729.jpeg?auto=compress&cs=tinysrgb&w=1200'
    ],
    'Breakfast': [
      'https://images.pexels.com/photos/376464/pexels-photo-376464.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/70497/pexels-photo-70497.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/1092730/pexels-photo-1092730.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/793765/pexels-photo-793765.jpeg?auto=compress&cs=tinysrgb&w=1200'
    ],
    'Student Favourites': [
      'https://images.pexels.com/photos/1640774/pexels-photo-1640774.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/1435904/pexels-photo-1435904.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/958545/pexels-photo-958545.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/461198/pexels-photo-461198.jpeg?auto=compress&cs=tinysrgb&w=1200'
    ]
  };

  function getDishCategory(name) {
    const lower = String(name || '').toLowerCase();
    if (/(cake|cupcake|cookie|brownie|muffin|pavlova|dessert|slice|fritter)/.test(lower)) return 'Baking';
    if (/(salad|vegetable|veggie|bean|lentil|pumpkin|kumara)/.test(lower)) return 'Fresh and Veg';
    if (/(pasta|macaroni|noodle|rice|stir fry|pie|brisket|pork|beef|chicken|lamb)/.test(lower)) return 'Main Meals';
    if (/(breakfast|granola|oats|toast|egg)/.test(lower)) return 'Breakfast';
    return 'Student Favourites';
  }

  function stableIndex(seed, length) {
    const str = String(seed || '');
    let hash = 0;
    for (let i = 0; i < str.length; i += 1) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash) % length;
  }

  function getDishImage(name, rowId, category) {
    const lower = String(name || '').toLowerCase();
    const seed = `${rowId || ''}-${name || ''}`;

    if (/(cupcake|cake|cookie|brownie|muffin|pavlova|dessert|slice)/.test(lower)) {
      const list = STOCK_IMAGES.Baking;
      return list[stableIndex(seed, list.length)];
    }
    if (/(salad|vegetable|veggie|beetroot|kumara|pumpkin)/.test(lower)) {
      const list = STOCK_IMAGES['Fresh and Veg'];
      return list[stableIndex(seed, list.length)];
    }
    if (/(breakfast|granola|oats|toast|egg)/.test(lower)) {
      const list = STOCK_IMAGES.Breakfast;
      return list[stableIndex(seed, list.length)];
    }

    const categoryImages = STOCK_IMAGES[category] || STOCK_IMAGES['Student Favourites'];
    return categoryImages[stableIndex(seed, categoryImages.length)];
  }

  function getFtPrimaryImage(recipe) {
    try {
      const images = JSON.parse(String(recipe && recipe.ft_images || 'null')) || [];
      const primarySlot = Number(recipe && recipe.ft_primary_slot);
      if (Number.isInteger(primarySlot) && primarySlot >= 1 && primarySlot <= images.length) {
        const starred = String(images[primarySlot - 1] || '').trim();
        if (starred) return starred;
      }
      for (const image of images) {
        const value = String(image || '').trim();
        if (value) return value;
      }
    } catch (_) {
      return '';
    }
    return '';
  }

  function htmlToPlainText(value) {
    const div = document.createElement('div');
    div.innerHTML = String(value || '').replace(/<br\s*\/?>/gi, '\n');
    return (div.textContent || div.innerText || '')
      .replace(/\r/g, '')
      .replace(/\u00A0/g, ' ')
      .trim();
  }

  function splitLines(value) {
    return String(value || '')
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);
  }

  function sanitizeListHtml(value) {
    return String(value || '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/\son\w+="[^"]*"/gi, '')
      .replace(/\son\w+='[^']*'/gi, '');
  }

  function extractItemsFromListHtml(value) {
    const cleaned = sanitizeListHtml(value);
    const wrapper = document.createElement('div');
    wrapper.innerHTML = cleaned;
    const liNodes = wrapper.querySelectorAll('li');
    if (!liNodes.length) return [];
    return Array.from(liNodes)
      .map((li) => String(li.textContent || '').trim())
      .filter(Boolean);
  }

  function splitIngredientItems(value) {
    const htmlItems = extractItemsFromListHtml(value);
    if (htmlItems.length) return htmlItems;

    const text = htmlToPlainText(value)
      .replace(/\s*[•\u2022]\s*/g, '\n');
    const items = splitLines(text);
    return items.length ? items : (text ? [text] : []);
  }

  function splitInstructionItems(value) {
    const htmlItems = extractItemsFromListHtml(value)
      .map((line) => line.replace(/^\d+[.)]?\s*/, '').trim())
      .filter(Boolean);
    if (htmlItems.length) return htmlItems;

    const text = htmlToPlainText(value)
      .replace(/\s+(?=\d+[.)]\s*)/g, '\n');

    const items = splitLines(text)
      .map(line => line.replace(/^\d+[.)]?\s*/, '').trim())
      .filter(Boolean);

    return items.length ? items : (text ? [text] : []);
  }

  function renderList(container, items) {
    if (!container) return;
    container.innerHTML = '';
    items.forEach(item => {
      const li = document.createElement('li');
      li.textContent = item;
      container.appendChild(li);
    });
  }

  function sourceFromUrl(url) {
    try {
      return new URL(String(url || '')).hostname.replace(/^www\./i, '');
    } catch (_) {
      return '-';
    }
  }

  function normalizeRecipeSourceUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';

    const normalizedSlashes = raw.replace(/\\/g, '/');

    const malformedSavedPdf = normalizedSlashes.match(/^https?:\/\/+(.+)$/i);
    if (malformedSavedPdf) {
      const remainder = String(malformedSavedPdf[1] || '').replace(/^\/+/, '');
      if (/^SavedPDFs\//i.test(remainder)) {
        return new URL('/' + remainder, window.location.origin).toString();
      }
    }

    if (/^\/?SavedPDFs\//i.test(normalizedSlashes)) {
      const path = '/' + normalizedSlashes.replace(/^\/+/, '');
      return new URL(path, window.location.origin).toString();
    }

    if (/^https?:\/\//i.test(normalizedSlashes)) return normalizedSlashes;

    if (normalizedSlashes.startsWith('/')) {
      return new URL(normalizedSlashes, window.location.origin).toString();
    }

    return `https://${normalizedSlashes}`;
  }

  const params = new URLSearchParams(window.location.search);
  let id = params.get('id');
  const scope = String(params.get('scope') || '').trim().toLowerCase();
  const isFoodTruckScope = scope === 'food_truck';

  let allRecipes = [];

  function buildRecipeUrl(recipeId) {
    const next = new URL('recipe_display.html', window.location.href);
    next.searchParams.set('id', recipeId);
    if (isFoodTruckScope) {
      next.searchParams.set('scope', 'food_truck');
    }
    return next.toString();
  }

  function buildTeacherDetailsUrl(recipeId) {
    const next = new URL('teacher_recipe_details.html', window.location.href);
    next.searchParams.set('id', recipeId);
    return next.toString();
  }

  async function toggleTeacherDetailsLink(recipeId) {
    const teacherDetailsLink = document.getElementById('teacherDetailsLink');
    if (!teacherDetailsLink) return;

    teacherDetailsLink.style.display = 'none';
    teacherDetailsLink.removeAttribute('href');

    const normalizedRecipeId = String(recipeId || '').trim();
    if (!normalizedRecipeId) return;

    try {
      const response = await fetch(`/api/recipes/${encodeURIComponent(normalizedRecipeId)}/teacher-details`, {
        credentials: 'include'
      });
      if (!response.ok) return;
      teacherDetailsLink.href = buildTeacherDetailsUrl(normalizedRecipeId);
      teacherDetailsLink.style.display = 'inline-flex';
    } catch (_) {
      // Hide the link when the current user does not have teacher/admin access.
    }
  }

  function navigateToRecipe(recipeId) {
    window.location.href = buildRecipeUrl(recipeId);
  }

  function isNonRecipePlannerLabel(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return true;
    return normalized === 'theory'
      || normalized.startsWith('theory ')
      || normalized === 'no recipe allocated'
      || normalized === 'no recipe';
  }

  function updateRecipeList(recipes, currentId) {
    const listContainer = document.getElementById('recipeNavigationList');
    if (!listContainer) return;

    listContainer.innerHTML = '';
    recipes.forEach(recipe => {
      const item = document.createElement('div');
      item.className = `recipe-nav-item ${String(recipe.id) === String(currentId) ? 'active' : ''}`;
      item.innerHTML = `
        <div class="recipe-nav-name">${recipe.name || '(Unnamed)'}</div>
        <div class="recipe-nav-id">ID: ${recipe.recipeid || recipe.recipe_id || recipe.id}</div>
      `;
      item.addEventListener('click', () => navigateToRecipe(recipe.id));
      listContainer.appendChild(item);
    });
  }

  function updateNavButtons(recipes, currentId) {
    const currentIndex = recipes.findIndex(r => String(r.id) === String(currentId));
    const prevBtn = document.getElementById('prevRecipeBtn');
    const nextBtn = document.getElementById('nextRecipeBtn');
    const recipeCounter = document.getElementById('recipeCounter');

    if (recipeCounter) {
      recipeCounter.textContent = `${currentIndex + 1} / ${recipes.length}`;
    }

    if (prevBtn) {
      if (currentIndex > 0) {
        prevBtn.disabled = false;
        prevBtn.addEventListener('click', () => navigateToRecipe(recipes[currentIndex - 1].id));
      } else {
        prevBtn.disabled = true;
      }
    }

    if (nextBtn) {
      if (currentIndex < recipes.length - 1) {
        nextBtn.disabled = false;
        nextBtn.addEventListener('click', () => navigateToRecipe(recipes[currentIndex + 1].id));
      } else {
        nextBtn.disabled = true;
      }
    }
  }

  function filterRecipeList(searchTerm) {
    const term = String(searchTerm || '').toLowerCase();
    const items = document.querySelectorAll('.recipe-nav-item');
    items.forEach(item => {
      const name = item.querySelector('.recipe-nav-name').textContent.toLowerCase();
      const id = item.querySelector('.recipe-nav-id').textContent.toLowerCase();
      item.style.display = (name.includes(term) || id.includes(term)) ? '' : 'none';
    });
  }

  function sourceFromAnyUrl(url) {
    const value = String(url || '').trim();
    if (!value) return '-';
    const normalized = normalizeRecipeSourceUrl(value);
    if (!normalized) return '-';
    try {
      const parsed = new URL(normalized);
      if (/\/SavedPDFs\//i.test(parsed.pathname)) return 'savedpdfs';
    } catch (_) {
      // Continue with host parse fallback.
    }
    return sourceFromUrl(normalized);
  }

  function findDisplayRowByRecipeId(recipeId) {
    const wanted = String(recipeId || '').trim();
    if (!wanted) return null;
    return allRecipes.find((row) => String(row.recipeid || row.recipe_id || '').trim() === wanted) || null;
  }

  function renderRecipeVersionsDock(versions, currentRecipeId) {
    const dock = document.getElementById('recipeVersionsDock');
    const list = document.getElementById('recipeVersionsList');
    if (!dock || !list) return;

    const rows = Array.isArray(versions) ? versions : [];
    if (!rows.length) {
      dock.classList.remove('active');
      dock.style.display = 'none';
      list.innerHTML = '';
      return;
    }

    const items = rows
      .map((v) => {
        const displayRow = findDisplayRowByRecipeId(v.recipe_id);
        const displayId = displayRow ? displayRow.id : null;
        const label = String(v.name || `Recipe ${v.recipe_id || '-'}`);
        const source = sourceFromAnyUrl(v.url);
        const bookings = Number(v.shared_bookings || 0);

        if (!displayId) {
          return `
            <div class="recipe-version-item" title="This version is not currently in recipe_display">
              <p class="recipe-version-name">${label}</p>
              <p class="recipe-version-meta">Not in browse list yet | Source: ${source}</p>
            </div>
          `;
        }

        const isCurrent = String(v.recipe_id) === String(currentRecipeId);
        return `
          <button class="recipe-version-item" data-display-id="${displayId}" ${isCurrent ? 'disabled' : ''}>
            <p class="recipe-version-name">${label}</p>
            <p class="recipe-version-meta">Shared bookings: ${bookings} | Source: ${source}</p>
          </button>
        `;
      })
      .join('');

    list.innerHTML = items;
    list.querySelectorAll('button.recipe-version-item[data-display-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const displayId = btn.getAttribute('data-display-id');
        if (!displayId) return;
        navigateToRecipe(displayId);
      });
    });

    dock.style.display = '';
    dock.classList.add('active');
  }

  async function loadRecipeVersions(recipeId) {
    try {
      const numericId = Number(recipeId);
      if (!Number.isInteger(numericId) || numericId <= 0) {
        renderRecipeVersionsDock([], recipeId);
        return;
      }

      const response = await fetch(`/api/recipe-matching/versions/by-recipe/${numericId}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.success === false) {
        renderRecipeVersionsDock([], recipeId);
        return;
      }

      renderRecipeVersionsDock(data.versions, recipeId);
    } catch (_) {
      renderRecipeVersionsDock([], recipeId);
    }
  }

  fetch('/api/auth/me', { credentials: 'include' })
    .then(res => res.json())
    .then(auth => {
      const isAuthenticated = Boolean(auth && auth.authenticated && auth.user && auth.user.email);
      if (!isAuthenticated) {
        const nextUrl = id ? buildRecipeUrl(id) : (isFoodTruckScope ? 'recipe_display.html?scope=food_truck' : 'recipe_display.html');
        window.location.href = `google_login.html?next=${encodeURIComponent(nextUrl)}`;
        return;
      }

      const isAdmin = String(auth && auth.user && auth.user.role || '').toLowerCase() === 'admin';
      const currentUserEmail = String(auth && auth.user && auth.user.email || '').trim().toLowerCase();

      const displayUrl = isFoodTruckScope
        ? '/api/recipes/display-table?scope=food_truck'
        : '/api/recipes/display-table';

      return fetch(displayUrl)
        .then(res => res.json())
        .then(rows => {
          const filteredRows = (Array.isArray(rows) ? rows : [])
            .filter((row) => !isNonRecipePlannerLabel(row && row.name));
          allRecipes = filteredRows.slice().sort((a, b) =>
            String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' })
          );
          let recipe = filteredRows.find(r => String(r.id) === String(id));
          if (!recipe && allRecipes.length > 0) {
            recipe = allRecipes[0];
            id = String(recipe.id);
            const next = new URL(window.location.href);
            next.searchParams.set('id', id);
            if (isFoodTruckScope) {
              next.searchParams.set('scope', 'food_truck');
            }
            window.history.replaceState({}, '', next.toString());
          }
          if (!recipe) return;

          if (isFoodTruckScope) {
            const sidebarHeader = document.querySelector('.nav-sidebar-header');
            if (sidebarHeader) {
              sidebarHeader.textContent = 'Food Truck Browse Recipes';
            }
          }

          updateRecipeList(allRecipes, id);
          updateNavButtons(allRecipes, id);

          const searchInput = document.getElementById('recipeSearchInput');
          if (searchInput) {
            searchInput.addEventListener('input', (e) => filterRecipeList(e.target.value));
          }

          const title = recipe.name || '(No Name)';
          const recipeNumber = recipe.recipeid || recipe.recipe_id || recipe.id;
          const category = getDishCategory(title);
          const imageUrl = getFtPrimaryImage(recipe) || String(recipe.image_url || '').trim() || getDishImage(title, recipe.id, category);

          const titleEl = document.getElementById('recipeTitle');
          const recipeIdEl = document.getElementById('recipeIdPill');
          const categoryEl = document.getElementById('recipeCategory');
          const servingsEl = document.getElementById('recipeServings');
          const sourceEl = document.getElementById('recipeSource');
          const urlEl = document.getElementById('recipeUrlLink');
          const imgEl = document.getElementById('recipeHeroImg');

          if (titleEl) titleEl.textContent = title;
          if (recipeIdEl) recipeIdEl.textContent = `RecipeID: ${recipeNumber}`;
          if (categoryEl) categoryEl.textContent = category;
          if (servingsEl) servingsEl.textContent = `Serving Size: ${recipe.serving_size || '-'}`;
          if (sourceEl) sourceEl.textContent = `Source: ${sourceFromAnyUrl(recipe.url)}`;
          if (imgEl) {
            imgEl.src = imageUrl;
            imgEl.onerror = function() {
              this.src = 'https://images.pexels.com/photos/1640774/pexels-photo-1640774.jpeg?auto=compress&cs=tinysrgb&w=1200';
            };
          }

          if (urlEl) {
            const normalizedUrl = normalizeRecipeSourceUrl(recipe.url);
            if (normalizedUrl) {
              urlEl.href = normalizedUrl;
              urlEl.style.display = 'inline-flex';
            } else {
              urlEl.style.display = 'none';
            }
          }

          document.title = `${title} | Recipe Details`;
          toggleTeacherDetailsLink(recipeNumber);

          loadRecipeVersions(recipeNumber);

          const ingredientLines = splitIngredientItems(recipe.ingredients);
          renderList(document.getElementById('ingredientsList'), ingredientLines);

          const instructionLines = splitInstructionItems(recipe.instructions);

          const instructionsListEl = document.getElementById('instructionsList');
          const instructionsFallbackEl = document.getElementById('instructionsFallback');

          renderList(instructionsListEl, instructionLines);
          if (instructionsFallbackEl) instructionsFallbackEl.style.display = 'none';

          // --- Admin inline edit ---
          if (isAdmin) {
            const adminEditBtn = document.getElementById('adminEditBtn');
            const adminEditPanel = document.getElementById('adminEditPanel');
            const adminEditCancelBtn = document.getElementById('adminEditCancelBtn');
            const adminEditSaveBtn = document.getElementById('adminEditSaveBtn');
            const adminEditStatus = document.getElementById('adminEditStatus');

            if (adminEditBtn) adminEditBtn.style.display = 'inline-flex';

            function openEditPanel() {
              document.getElementById('editName').value = recipe.name || '';
              document.getElementById('editServingSize').value = recipe.serving_size || '';
              document.getElementById('editUrl').value = recipe.url || '';
              document.getElementById('editIngredients').value = String(recipe.ingredients || '').trim();
              document.getElementById('editInstructions').value = String(recipe.instructions || '').trim();
              if (adminEditStatus) adminEditStatus.textContent = '';
              if (adminEditPanel) adminEditPanel.style.display = 'block';
              document.body.style.overflow = 'hidden';
            }

            function closeEditPanel() {
              if (adminEditPanel) adminEditPanel.style.display = 'none';
              document.body.style.overflow = '';
            }

            if (adminEditBtn) adminEditBtn.addEventListener('click', openEditPanel);
            if (adminEditCancelBtn) adminEditCancelBtn.addEventListener('click', closeEditPanel);
            if (adminEditPanel) {
              adminEditPanel.addEventListener('click', function(e) {
                if (e.target === adminEditPanel) closeEditPanel();
              });
            }

            if (adminEditSaveBtn) {
              adminEditSaveBtn.addEventListener('click', async () => {
                const payload = {
                  name: document.getElementById('editName').value.trim(),
                  serving_size: document.getElementById('editServingSize').value.trim(),
                  url: document.getElementById('editUrl').value.trim(),
                  ingredients: document.getElementById('editIngredients').value.trim(),
                  instructions: document.getElementById('editInstructions').value.trim()
                };

                if (!payload.name) {
                  if (adminEditStatus) { adminEditStatus.textContent = 'Recipe name is required.'; adminEditStatus.style.color = '#b71c1c'; }
                  return;
                }

                adminEditSaveBtn.disabled = true;
                if (adminEditStatus) { adminEditStatus.textContent = 'Saving...'; adminEditStatus.style.color = '#1d4f79'; }

                try {
                  const res = await fetch(`/api/admin/recipe-display/${recipe.id}`, {
                    method: 'PUT',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json', 'x-user-email': currentUserEmail },
                    body: JSON.stringify(payload)
                  });
                  const data = await res.json();
                  if (!res.ok || data.success === false) throw new Error(data.error || 'Save failed.');

                  // Update local recipe object and refresh display
                  Object.assign(recipe, data.recipe);
                  if (titleEl) titleEl.textContent = recipe.name || '(No Name)';
                  if (servingsEl) servingsEl.textContent = `Serving Size: ${recipe.serving_size || '-'}`;
                  if (sourceEl) sourceEl.textContent = `Source: ${sourceFromAnyUrl(recipe.url)}`;
                  if (urlEl) {
                    const normalizedUrl = normalizeRecipeSourceUrl(recipe.url);
                    if (normalizedUrl) { urlEl.href = normalizedUrl; urlEl.style.display = 'inline-flex'; }
                    else urlEl.style.display = 'none';
                  }
                  document.title = `${recipe.name || '(No Name)'} | Recipe Details`;
                  renderList(document.getElementById('ingredientsList'), splitIngredientItems(recipe.ingredients));
                  renderList(document.getElementById('instructionsList'), splitInstructionItems(recipe.instructions));

                  closeEditPanel();
                } catch (err) {
                  if (adminEditStatus) { adminEditStatus.textContent = err.message || 'Save failed.'; adminEditStatus.style.color = '#b71c1c'; }
                } finally {
                  adminEditSaveBtn.disabled = false;
                }
              });
            }
          }
        });
    })
    .catch(() => {
      const nextUrl = id ? buildRecipeUrl(id) : (isFoodTruckScope ? 'recipe_display.html?scope=food_truck' : 'recipe_display.html');
      window.location.href = `google_login.html?next=${encodeURIComponent(nextUrl)}`;
    });
});
