document.addEventListener('DOMContentLoaded', () => {
  const listEl = document.getElementById('recipeImageItems');
  const searchEl = document.getElementById('recipeImageSearch');
  const titleEl = document.getElementById('recipeImageTitle');
  const metaEl = document.getElementById('recipeImageMeta');
  const statusEl = document.getElementById('recipeImageStatus');
  const previewEl = document.getElementById('recipeImagePreview');
  const fileEl = document.getElementById('recipeImageFile');
  const urlEl = document.getElementById('recipeImageUrlInput');
  const uploadBtn = document.getElementById('uploadRecipeImageBtn');
  const saveUrlBtn = document.getElementById('saveRecipeImageUrlBtn');
  const clearBtn = document.getElementById('clearRecipeImageBtn');

  const FALLBACK_IMAGE = 'https://images.pexels.com/photos/1640774/pexels-photo-1640774.jpeg?auto=compress&cs=tinysrgb&w=1200';

  let currentUserEmail = '';
  let recipes = [];
  let filteredRecipes = [];
  let selectedRecipe = null;

  function setStatus(message, isError) {
    statusEl.textContent = message || '';
    statusEl.style.color = isError ? '#b71c1c' : '#1d4f79';
  }

  function isAdmin(auth) {
    const role = String(auth && auth.user && auth.user.role || '').toLowerCase();
    return role === 'admin';
  }

  function pickImage(recipe) {
    const raw = String(recipe && recipe.image_url || '').trim();
    return raw || FALLBACK_IMAGE;
  }

  function renderList() {
    listEl.innerHTML = '';
    if (!filteredRecipes.length) {
      listEl.innerHTML = '<div style="padding:0.8rem;color:#516375;">No recipes match your search.</div>';
      return;
    }

    filteredRecipes.forEach((recipe) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'admin-image-item' + (selectedRecipe && Number(selectedRecipe.id) === Number(recipe.id) ? ' is-active' : '');
      btn.innerHTML =
        `<div class="admin-image-item-title">${recipe.name || '(No Name)'}</div>` +
        `<div class="admin-image-item-meta">Display ID: ${recipe.id} | RecipeID: ${recipe.recipeid || '-'}</div>`;
      btn.addEventListener('click', () => {
        selectedRecipe = recipe;
        updateEditor();
        renderList();
      });
      listEl.appendChild(btn);
    });
  }

  function updateEditor() {
    if (!selectedRecipe) {
      titleEl.textContent = 'Select a recipe';
      metaEl.textContent = '';
      previewEl.src = FALLBACK_IMAGE;
      urlEl.value = '';
      return;
    }

    titleEl.textContent = selectedRecipe.name || '(No Name)';
    metaEl.textContent = `Display ID: ${selectedRecipe.id} | RecipeID: ${selectedRecipe.recipeid || '-'} | Current image: ${selectedRecipe.image_url ? 'Custom' : 'Stock fallback'}`;
    previewEl.src = pickImage(selectedRecipe);
    urlEl.value = selectedRecipe.image_url || '';
  }

  function applySearch() {
    const query = String(searchEl.value || '').trim().toLowerCase();
    if (!query) {
      filteredRecipes = [...recipes];
    } else {
      filteredRecipes = recipes.filter((recipe) => {
        const idText = `${recipe.id || ''} ${recipe.recipeid || ''}`.toLowerCase();
        const nameText = String(recipe.name || '').toLowerCase();
        return idText.includes(query) || nameText.includes(query);
      });
    }

    if (selectedRecipe && !filteredRecipes.some((item) => Number(item.id) === Number(selectedRecipe.id))) {
      selectedRecipe = filteredRecipes[0] || null;
      updateEditor();
    }

    renderList();
  }

  async function api(path, options) {
    const headers = Object.assign({}, options && options.headers ? options.headers : {}, {
      'x-user-email': currentUserEmail
    });
    const response = await fetch(path, Object.assign({}, options || {}, { headers }));
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.success === false) {
      throw new Error(payload.error || `Request failed (${response.status})`);
    }
    return payload;
  }

  async function loadRecipes() {
    const payload = await api('/api/admin/recipe-images', { credentials: 'include' });
    recipes = Array.isArray(payload.recipes) ? payload.recipes : [];
    filteredRecipes = [...recipes];

    if (!selectedRecipe && recipes.length) {
      selectedRecipe = recipes[0];
    } else if (selectedRecipe) {
      selectedRecipe = recipes.find((item) => Number(item.id) === Number(selectedRecipe.id)) || recipes[0] || null;
    }

    updateEditor();
    applySearch();
  }

  function updateRecipeInList(updated) {
    recipes = recipes.map((item) => Number(item.id) === Number(updated.id) ? updated : item);
    filteredRecipes = filteredRecipes.map((item) => Number(item.id) === Number(updated.id) ? updated : item);
    selectedRecipe = updated;
    updateEditor();
    renderList();
  }

  async function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Failed to read image file.'));
      reader.readAsDataURL(file);
    });
  }

  uploadBtn.addEventListener('click', async () => {
    if (!selectedRecipe) {
      setStatus('Select a recipe first.', true);
      return;
    }

    const file = fileEl.files && fileEl.files[0];
    if (!file) {
      setStatus('Choose an image file first.', true);
      return;
    }

    try {
      setStatus('Uploading image...', false);
      const imageData = await fileToDataUrl(file);
      const payload = await api(`/api/admin/recipe-images/${selectedRecipe.id}/upload`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_data: imageData, file_name: file.name })
      });

      updateRecipeInList(payload.recipe);
      fileEl.value = '';
      setStatus('Image uploaded and saved.', false);
    } catch (err) {
      setStatus(err.message || 'Failed to upload image.', true);
    }
  });

  saveUrlBtn.addEventListener('click', async () => {
    if (!selectedRecipe) {
      setStatus('Select a recipe first.', true);
      return;
    }

    const imageUrl = String(urlEl.value || '').trim();
    if (!imageUrl) {
      setStatus('Enter an image URL or use Clear Custom Image.', true);
      return;
    }

    if (!/^https?:\/\//i.test(imageUrl) && !/^\/images\//i.test(imageUrl)) {
      setStatus('Image URL must start with https:// or /images/.', true);
      return;
    }

    try {
      setStatus('Saving image URL...', false);
      const payload = await api(`/api/admin/recipe-images/${selectedRecipe.id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: imageUrl, userEmail: currentUserEmail })
      });

      updateRecipeInList(payload.recipe);
      setStatus('Image URL saved.', false);
    } catch (err) {
      setStatus(err.message || 'Failed to save image URL.', true);
    }
  });

  clearBtn.addEventListener('click', async () => {
    if (!selectedRecipe) {
      setStatus('Select a recipe first.', true);
      return;
    }

    try {
      setStatus('Clearing custom image...', false);
      const payload = await api(`/api/admin/recipe-images/${selectedRecipe.id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: '', userEmail: currentUserEmail })
      });

      updateRecipeInList(payload.recipe);
      setStatus('Custom image removed. Stock fallback will be used.', false);
    } catch (err) {
      setStatus(err.message || 'Failed to clear custom image.', true);
    }
  });

  searchEl.addEventListener('input', applySearch);

  fetch('/api/auth/me', { credentials: 'include' })
    .then((res) => res.json())
    .then((auth) => {
      const isAuthenticated = Boolean(auth && auth.authenticated && auth.user && auth.user.email);
      if (!isAuthenticated) {
        window.location.href = 'google_login.html?next=' + encodeURIComponent('admin_recipe_images.html');
        return;
      }

      if (!isAdmin(auth)) {
        window.location.href = 'index.html';
        return;
      }

      currentUserEmail = String(auth.user.email || '').trim().toLowerCase();
      if (!currentUserEmail) {
        setStatus('Unable to determine your admin identity.', true);
        return;
      }

      loadRecipes().catch((err) => {
        setStatus(err.message || 'Failed to load recipes.', true);
      });
    })
    .catch(() => {
      window.location.href = 'google_login.html?next=' + encodeURIComponent('admin_recipe_images.html');
    });
});
