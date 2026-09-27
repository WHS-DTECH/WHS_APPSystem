// --- Backend Integration Required ---
// Remove demo data. Fetch recipe titles from backend API when available.
// Example fetch (to be implemented):
// fetch('/api/upload-confirm').then(res => res.json()).then(data => renderCheckboxes(data.titles));

function renderCheckboxes(titles = []) {
  const container = document.getElementById('recipeCheckboxes');
  if (!titles.length) {
    container.innerHTML = '<span class="text-muted">No recipes found.</span>';
    return;
  }
  container.innerHTML = titles.map(title => `
    <label class='confirm-checkbox-label'>
      <input type='checkbox' checked> ${title}
    </label>
  `).join('');
}

document.getElementById('confirmForm').addEventListener('submit', e => {
  e.preventDefault();
  alert('Recipes confirmed!');
});

// Example usage (to be replaced with real data):
// renderCheckboxes([]);
