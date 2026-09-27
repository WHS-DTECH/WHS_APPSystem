// Demo actions for Recipe Book Setup page
// Handle Upload URL button
document.addEventListener('DOMContentLoaded', () => {
	const uploadUrlBtn = document.querySelector('.setup-section .setup-btn');
	const urlInput = document.querySelector('.setup-url-input');
	if (uploadUrlBtn && urlInput && uploadUrlBtn.textContent.trim() === 'Upload URL') {
		uploadUrlBtn.addEventListener('click', () => {
			const url = urlInput.value.trim();
			if (!url) {
				alert('Please enter a recipe URL.');
				return;
			}
			// Example details for upload
			const uploadDetails = {
				recipe_id: null, // If known, set the recipe ID
				recipe_title: url, // You may want to extract the title from the page
				upload_type: 'url',
				source_url: url,
				uploaded_by: 'user@example.com', // Replace with actual user
				upload_date: new Date().toISOString().slice(0, 19).replace('T', ' ')
			};
			fetch('/api/uploads', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(uploadDetails)
			})
			.then(res => res.json())
			.then(result => {
				if (result.id) {
					alert('Recipe URL uploaded successfully!');
					fetchAndRenderUploads();
				} else {
					alert('Failed to upload recipe URL.');
				}
			});
		});
	}
});

// Fetch and render recipes in the main table
function fetchAndRenderRecipes() {
	fetch('/api/recipes')
		.then(res => res.json())
		.then(data => {
			const tbody = document.querySelector('#mainRecipesTable tbody');
			tbody.innerHTML = '';
			data.forEach(recipe => {
				const tr = document.createElement('tr');
				tr.innerHTML = `
					<td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${recipe.id}</td>
					<td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${recipe.name}</td>
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
			// Add event listeners for delete buttons
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


// Fetch and render published recipes from recipe_display table
function fetchAndRenderPublishedRecipes() {
	fetch('/api/recipes/display-table')
		.then(res => res.json())
		.then(data => {
			const tbody = document.querySelector('#publishedRecipesTable tbody');
			tbody.innerHTML = '';
			data.forEach(row => {
				const tr = document.createElement('tr');
				tr.innerHTML = `
					<td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${row.id}</td>
					<td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${row.name || ''}</td>
					<td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${row.description || ''}</td>
					<td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${row.ingredients || ''}</td>
					<td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${row.serving_size || ''}</td>
					<td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${row.url ? `<a href='${row.url}' target='_blank'>Link</a>` : ''}</td>
					<td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${row.instructions || ''}</td>
					<td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${row.recipeid || ''}</td>
				`;
				tbody.appendChild(tr);
			});
		});
}

// Initial render
document.addEventListener('DOMContentLoaded', () => {
	fetchAndRenderRecipes();
	fetchAndRenderUploads();
	fetchAndRenderPublishedRecipes();
});

// Fetch and render uploads in the uploaded recipes table
function fetchAndRenderUploads() {
	fetch('/api/uploads')
		.then(res => res.json())
		.then(data => {
			const tbody = document.querySelector('#uploadedRecipesTable tbody');
			tbody.innerHTML = '';
			data.forEach(upload => {
				const tr = document.createElement('tr');
				tr.innerHTML = `
					<td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${upload.id}</td>
					<td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${upload.recipe_id}</td>
					<td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${upload.recipe_title}</td>
					<td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${upload.upload_type}</td>
					<td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${upload.source_url ? `<a href='${upload.source_url}' target='_blank'>Link</a>` : ''}</td>
					<td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${upload.uploaded_by}</td>
					<td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${upload.upload_date}</td>
					<td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>
						<button class='delete-upload-btn' data-id='${upload.id}' style='background:#e53935;color:#fff;border:none;padding:0.4rem 0.8rem;border-radius:4px;cursor:pointer;'>Delete</button>
					</td>
				`;
				tbody.appendChild(tr);
			});
			// Add event listeners for delete buttons
			document.querySelectorAll('.delete-upload-btn').forEach(btn => {
				btn.addEventListener('click', function() {
					const id = this.getAttribute('data-id');
					if (confirm('Are you sure you want to delete this upload record?')) {
						fetch(`/api/uploads/${id}`, { method: 'DELETE' })
							.then(res => res.json())
							.then(result => {
								if (result.success) {
									fetchAndRenderUploads();
								} else {
									alert('Failed to delete upload record.');
								}
							});
					}
				});
			});
		});
}
