// Handles the Text Conversion button and API call

document.addEventListener('DOMContentLoaded', function() {
    const convertBtn = document.getElementById('textConvertBtn');
    const textArea = document.getElementById('textConvertArea');
    const recipeSelect = document.getElementById('recipeSelectForText');
    if (convertBtn && textArea && recipeSelect) {
        convertBtn.addEventListener('click', async function() {
            const text = textArea.value.trim();
            const recipeId = recipeSelect.value ? parseInt(recipeSelect.value) : null;
            if (!text) {
                alert('Please enter or select ingredient text to convert.');
                return;
            }
            if (!recipeId) {
                alert('Please select a Recipe ID before converting.');
                return;
            }
            try {
                const response = await fetch('/api/text-conversion', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text, recipeId })
                });
                const result = await response.json();
                if (response.ok) {
                    alert('Ingredients inserted: ' + result.inserted + (recipeId ? (' (Recipe ID: ' + recipeId + ')') : ''));
                    document.dispatchEvent(new Event('ingredients-inventory-refresh'));
                } else {
                    alert('Error: ' + (result.error || 'Unknown error'));
                }
            } catch (err) {
                alert('Request failed: ' + err.message);
            }
        });
    }
});
