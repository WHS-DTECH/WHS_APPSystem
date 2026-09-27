// recipe_extraction.js - Custom JS for Recipe Extraction page (removes Display button only here)

// --- Sorting for Extracted Recipes Table ---
let sortDescending = true; // Default: newest first
let allRecipes = [];
let selectedRecipeId = '';

function escapeHtml(value) {
    if (value === undefined || value === null) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function sortRecipes(data) {
    data.sort((a, b) => sortDescending ? b.id - a.id : a.id - b.id);
}

document.addEventListener('DOMContentLoaded', () => {
    const sortHeader = document.querySelector('#mainRecipesTable th[data-sort="id"]');
    if (sortHeader) {
        sortHeader.addEventListener('click', () => {
            sortDescending = !sortDescending;
            renderRecipes();
        });
    }

    const recipeFilterSelect = document.getElementById('recipeFilterSelect');
    if (recipeFilterSelect) {
        recipeFilterSelect.addEventListener('change', (event) => {
            selectedRecipeId = event.target.value;
            renderRecipes();
        });
    }

    fetchAndRenderRecipes();
});

function fetchAndRenderRecipes() {
    fetch('/api/recipes')
        .then(res => res.json())
        .then(data => {
            allRecipes = Array.isArray(data) ? data : [];
            populateRecipeFilter(allRecipes);
            renderRecipes();
        })
        .catch(err => {
            const tbody = document.querySelector('#mainRecipesTable tbody');
            if (tbody) tbody.innerHTML = '<tr><td colspan="9" style="color:red;">Failed to load recipes: ' + err.message + '</td></tr>';
        });
}

function populateRecipeFilter(recipes) {
    const recipeFilterSelect = document.getElementById('recipeFilterSelect');
    if (!recipeFilterSelect) return;

    const previousValue = selectedRecipeId;
    recipeFilterSelect.innerHTML = '<option value="">All Recipes</option>';

    const sortedOptions = [...recipes].sort((a, b) => b.id - a.id);
    sortedOptions.forEach((recipe) => {
        const option = document.createElement('option');
        option.value = String(recipe.id);
        const recipeName = recipe.name ? String(recipe.name).trim() : '(No name)';
        option.textContent = `${recipe.id} - ${recipeName}`;
        recipeFilterSelect.appendChild(option);
    });

    if (previousValue && sortedOptions.some((recipe) => String(recipe.id) === previousValue)) {
        recipeFilterSelect.value = previousValue;
        selectedRecipeId = previousValue;
    } else {
        recipeFilterSelect.value = '';
        selectedRecipeId = '';
    }
}

function renderRecipes() {
    const tbody = document.querySelector('#mainRecipesTable tbody');
    if (!tbody) return;

    tbody.innerHTML = '';
    const filteredData = selectedRecipeId
        ? allRecipes.filter((recipe) => String(recipe.id) === selectedRecipeId)
        : [...allRecipes];

    sortRecipes(filteredData);

    filteredData.forEach(recipe => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${escapeHtml(recipe.id)}</td>
                    <td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${escapeHtml(recipe.uploaded_recipe_id || '')}</td>
                    <td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${recipe.url ? `<a href='${escapeHtml(recipe.url)}' target='_blank'>Link</a>` : ''}</td>
                    <td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${escapeHtml(recipe.name || '')}</td>
                    <td style='border:1px solid #eee;padding:0.5rem 0.7rem; color:#009688; max-width:120px; text-align:center; background:#f8f8ff;'>
                        <button class="view-raw-btn" data-id="${recipe.id}" style="background:#1976d2;color:#fff;border:none;padding:0.3rem 0.8rem;border-radius:4px;cursor:pointer;">View</button>
                    </td>
                    <td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${recipe.serving_size !== undefined && recipe.serving_size !== null ? escapeHtml(recipe.serving_size) : ''}</td>
                    <td style='border:1px solid #eee;padding:0.5rem 0.7rem; color:indigo;'>${escapeHtml(recipe.extracted_ingredients || '')}</td>
                    <td style='border:1px solid #eee;padding:0.5rem 0.7rem; color:indigo;'>${escapeHtml(recipe.instructions_extracted || '')}</td>
                    <td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>
                        <button class='delete-recipe-btn' data-id='${recipe.id}' style='background:#e53935;color:#fff;border:none;padding:0.4rem 0.8rem;border-radius:4px;cursor:pointer;'>Delete</button>
                    </td>
                `;
                tbody.appendChild(tr);
            });

    if (!filteredData.length) {
        const filterLabel = selectedRecipeId ? `No recipe found for ID ${escapeHtml(selectedRecipeId)}.` : 'No recipes found.';
        tbody.innerHTML = `<tr><td colspan="9" style="border:1px solid #eee;padding:0.8rem;color:#666;">${filterLabel}</td></tr>`;
    }

    document.querySelectorAll('.view-raw-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            const recipeId = this.getAttribute('data-id');
            if (!recipeId) return;
            window.open(`RawDataTXT/${recipeId}.txt`, '_blank');
        });
    });

    document.querySelectorAll('.delete-recipe-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const id = this.getAttribute('data-id');
            if (confirm('Are you sure you want to delete this recipe?')) {
                fetch(`/api/recipes/${id}`, { method: 'DELETE' })
                    .then(res => res.json())
                    .then(result => {
                        if (result.success) {
                            fetchAndRenderRecipes();
                        } else {
                            alert('Failed to delete recipe.');
                        }
                    });
            }
        });
    });
}
