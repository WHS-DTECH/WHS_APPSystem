// Split Measure button logic
// This script adds the event listener for the Split Measure button and calls the backend route

document.addEventListener('DOMContentLoaded', function() {
  const splitMeasureBtn = document.getElementById('splitMeasureBtn');
  if (splitMeasureBtn) {
    splitMeasureBtn.addEventListener('click', function() {
      const recipeId = document.getElementById('recipeSelectForText').value;
      if (!recipeId) {
        alert('Select a recipe first.');
        return;
      }
      fetch('/api/ingredients/inventory/split-measure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipe_id: recipeId })
      })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          document.getElementById('save-status').innerHTML = '<span style="color:#009688;">Measures split and updated!</span>';
          document.dispatchEvent(new Event('ingredients-inventory-refresh'));
        } else {
          document.getElementById('save-status').innerHTML = '<span style="color:#e53935;">Failed to split measures: ' + (data.error || 'Unknown error') + '</span>';
        }
      })
      .catch(() => {
        document.getElementById('save-status').innerHTML = '<span style="color:#e53935;">Error contacting server.</span>';
      });
    });
  }
});
