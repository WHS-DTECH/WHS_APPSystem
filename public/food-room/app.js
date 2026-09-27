// --- Render Current Recipes Table ---
function fetchAndRenderRecipes() {
	fetch('/api/recipes')
		.then(res => res.json())
		.then(data => {
			const tbody = document.querySelector('#mainRecipesTable tbody');
			if (!tbody) return;
			tbody.innerHTML = '';
			data.forEach(recipe => {
				const tr = document.createElement('tr');
				tr.innerHTML = `
					<td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${recipe.id}</td>
					<td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${recipe.uploaded_recipe_id || ''}</td>
					<td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${recipe.name || (recipe.url ? `<a href='${recipe.url}' target='_blank'>${recipe.url}</a>` : '')}</td>
					<td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${recipe.description || ''}</td>
					<td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${recipe.ingredients || ''}</td>
					<td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${recipe.serving_size || ''}</td>
					<td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${recipe.instructions || ''}</td>
					<td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${recipe.url ? `<a href='${recipe.url}' target='_blank'>Link</a>` : ''}</td>
					<td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>
						<button class='delete-recipe-btn' data-id='${recipe.id}' style='background:#e53935;color:#fff;border:none;padding:0.4rem 0.8rem;border-radius:4px;cursor:pointer;'>Delete</button>
					</td>
				`;
				tbody.appendChild(tr);
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
		});
}

document.addEventListener('DOMContentLoaded', () => {
	fetchAndRenderRecipes();
});
// --- Suggest a Recipe Modal logic ---
const openModalBtn = document.getElementById('openSuggestModalBtn');
const closeModalBtn = document.getElementById('closeSuggestModalBtn');
const suggestModal = document.getElementById('suggestModal');
if (openModalBtn && closeModalBtn && suggestModal) {
	openModalBtn.onclick = () => { suggestModal.style.display = 'flex'; };
	closeModalBtn.onclick = () => { suggestModal.style.display = 'none'; };
	window.onclick = e => { if (e.target === suggestModal) suggestModal.style.display = 'none'; };
}

const modalSuggestForm = document.getElementById('modalSuggestForm');
if (modalSuggestForm) {
	modalSuggestForm.onsubmit = function(e) {
		e.preventDefault();
		// For demo, just close modal and alert
		suggestModal.style.display = 'none';
		alert('Thank you for your suggestion!');
		modalSuggestForm.reset();
	};
}
// --- Suggest a Recipe logic ---
const SUGGEST_KEY = 'suggestedRecipes';
function getSuggestions() {
  // To be replaced with backend fetch
  return [];
}
function saveSuggestion(suggestion) {
  // To be replaced with backend POST
}
function renderRecipes(recipes = []) {
  const grid = document.getElementById('recipeGrid');
  grid.innerHTML = '';
  if (!recipes.length) {
    grid.innerHTML = '<div class="text-muted">No recipes found.</div>';
    return;
  }
  recipes.slice(0, 3).forEach(recipe => {
    const card = document.createElement('div');
    card.className = 'recipe-card';
    card.innerHTML = `
      <h2>${recipe.name}</h2>
      <div class="ingredient-count">| ${recipe.ingredients.length} ingredients</div>
      <div class="ingredients">
        <strong>Ingredients:</strong><br>
        ${recipe.ingredients.slice(0, 5).join('<br>')}
      </div>
    `;
    grid.appendChild(card);
  });
}


function renderRecipeList() {
	const list = document.getElementById('recipeList');
	list.innerHTML = recipes.map((recipe, idx) => `
		<div class="recipe-list-row">
			<span class="recipe-list-name">${recipe.name}</span>
			<button class="recipe-list-btn view">View</button>
			<button class="recipe-list-btn source" data-idx="${idx}">Source</button>
			<button class="recipe-list-btn delete">Delete</button>
		</div>
	`).join('');

	// Add click event for Source buttons
	list.querySelectorAll('.recipe-list-btn.source').forEach(btn => {
		btn.addEventListener('click', () => {
			window.location.href = 'upload_confirm.html';
		});
	});
}

// Toggle between grid and list views
document.getElementById('gridViewBtn').addEventListener('click', () => {
	document.getElementById('gridViewBtn').classList.add('active');
	document.getElementById('tableViewBtn').classList.remove('active');
	document.getElementById('recipeGrid').style.display = '';
	document.getElementById('recipeListCard').style.display = 'none';
});
document.getElementById('tableViewBtn').addEventListener('click', () => {
	document.getElementById('tableViewBtn').classList.add('active');
	document.getElementById('gridViewBtn').classList.remove('active');
	document.getElementById('recipeGrid').style.display = 'none';
	document.getElementById('recipeListCard').style.display = '';
});

// Fetch uploaded recipes from backend and render
fetch('/api/uploads')
	.then(res => res.json())
	.then(uploads => {
		// Map uploads to recipe card format
		const recipes = uploads.map(upload => ({
			name: upload.recipe_title,
			ingredients: [], // You can fetch ingredients if needed
			source_url: upload.source_url,
			upload_type: upload.upload_type,
			uploaded_by: upload.uploaded_by,
			upload_date: upload.upload_date
		}));
		renderRecipes(recipes);
		// Optionally, update recipe list as well
		// renderRecipeList(recipes);
	})
	.catch(() => {
		document.getElementById('recipeGrid').innerHTML = '<div class="text-muted">Failed to load recipes.</div>';
	});
