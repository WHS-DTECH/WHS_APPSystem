// recipe.js
// Loads recipe details from backend and renders them in the layout matching the provided screenshot.

function getQueryParam(name) {
  const url = new URL(window.location.href);
  return url.searchParams.get(name);
}

function renderRecipeDetails(recipe) {
  document.getElementById('recipeTitle').textContent = recipe.name || 'Recipe Title';
  document.getElementById('recipeDescription').textContent = recipe.description || '';
  document.getElementById('prepTime').textContent = recipe.prep_time || '-';
  document.getElementById('cookTime').textContent = recipe.cook_time || '-';
  document.getElementById('readyIn').textContent = recipe.ready_in || '-';

  // Ingredients
  const ingredientsList = document.getElementById('ingredientsList');
  ingredientsList.innerHTML = '';
  if (Array.isArray(recipe.ingredients)) {
    recipe.ingredients.forEach(ing => {
      const li = document.createElement('li');
      li.textContent = ing;
      ingredientsList.appendChild(li);
    });
  } else if (typeof recipe.ingredients === 'string') {
    recipe.ingredients.split('\n').forEach(ing => {
      if (ing.trim()) {
        const li = document.createElement('li');
        li.textContent = ing.trim();
        ingredientsList.appendChild(li);
      }
    });
  }

  // Topping (optional)
  if (recipe.topping) {
    document.getElementById('toppingTitle').style.display = '';
    document.getElementById('toppingList').style.display = '';
    const toppingList = document.getElementById('toppingList');
    toppingList.innerHTML = '';
    recipe.topping.split('\n').forEach(top => {
      if (top.trim()) {
        const li = document.createElement('li');
        li.textContent = top.trim();
        toppingList.appendChild(li);
      }
    });
  }

  // Instructions
  const instructionsList = document.getElementById('instructionsList');
  instructionsList.innerHTML = '';
  if (Array.isArray(recipe.instructions)) {
    recipe.instructions.forEach(step => {
      const li = document.createElement('li');
      li.textContent = step;
      instructionsList.appendChild(li);
    });
  } else if (typeof recipe.instructions === 'string') {
    recipe.instructions.split(/\n|\r|\d+\./).forEach(step => {
      if (step.trim()) {
        const li = document.createElement('li');
        li.textContent = step.trim();
        instructionsList.appendChild(li);
      }
    });
  }

  // Image (optional)
  if (recipe.image_url) {
    document.getElementById('recipeImage').src = recipe.image_url;
  }
}

async function loadRecipe() {
  const id = getQueryParam('id');
  if (!id) return;
  const res = await fetch(`/api/recipes/${id}`);
  if (!res.ok) return;
  const recipe = await res.json();
  renderRecipeDetails(recipe);
}

document.addEventListener('DOMContentLoaded', loadRecipe);
