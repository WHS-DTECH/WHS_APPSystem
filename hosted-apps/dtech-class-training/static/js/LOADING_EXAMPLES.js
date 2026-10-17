/**
 * Loading States & Spinners - Implementation Guide
 * 
 * This guide shows how to use the LoadingManager and FetchWithLoading utilities
 * for creating smooth user experiences during async operations.
 */

/* ============================================
   1. BASIC SPINNER EXAMPLES
   ============================================ */

// Add a spinner to the DOM
const spinner = LoadingManager.createSpinner('md', 'primary');
document.getElementById('container').appendChild(spinner);

// Spinner sizes: 'sm' (1rem), 'md' (2rem, default), 'lg' (3rem)
// Spinner colors: 'primary' (purple), 'secondary' (blue), 'danger' (red), 'success' (green)


/* ============================================
   2. BUTTON LOADING STATES
   ============================================ */

// Show loading state on a button
LoadingManager.showButtonLoading('#submitBtn', 'Saving...');

// Hide loading state
LoadingManager.hideButtonLoading('#submitBtn');

// Example in form submission
document.getElementById('myForm').addEventListener('submit', function(e) {
    LoadingManager.showButtonLoading('#submitBtn', 'Submitting...');
    // Form will submit after button appears disabled with spinner
});


/* ============================================
   3. FORM LOADING STATES
   ============================================ */

// Disable entire form and show loading
LoadingManager.showFormLoading('#contactForm');
// All inputs/buttons become disabled and faded

// Re-enable form after operation
LoadingManager.hideFormLoading('#contactForm');

// Practical example:
async function saveUserProfile() {
    LoadingManager.showFormLoading('#profileForm');
    try {
        const response = await fetch('/api/profile', {
            method: 'PUT',
            body: new FormData(document.getElementById('profileForm'))
        });
        // Handle response...
    } finally {
        LoadingManager.hideFormLoading('#profileForm');
    }
}


/* ============================================
   4. FULL SCREEN OVERLAY
   ============================================ */

// Show loading overlay with message
LoadingManager.showOverlay('Processing your request...');

// Hide when done
LoadingManager.hideOverlay();

// Example for long-running operation
async function exportCourseData() {
    LoadingManager.showOverlay('Exporting course data...');
    try {
        const data = await FetchWithLoading.post('/api/export-course', {
            courseId: 123
        });
        // Handle response...
    } finally {
        LoadingManager.hideOverlay();
    }
}


/* ============================================
   5. FETCH WITH LOADING (AUTOMATIC)
   ============================================ */

// GET request with automatic loading state
FetchWithLoading.get('/api/courses/123', '#loadBtn')
    .then(data => {
        console.log('Course data:', data);
    })
    .catch(error => console.error('Failed to load:', error));

// POST request with automatic loading state
FetchWithLoading.post('/api/assignments/submit', {
    content: 'My answer',
    assignmentId: 456
}, '#submitBtn')
    .then(result => {
        console.log('Submitted successfully:', result);
    })
    .catch(error => console.error('Submission failed:', error));


/* ============================================
   6. SKELETON LOADERS
   ============================================ */

// Create skeleton loaders while fetching real data
const skeleton = LoadingManager.createSkeleton(3, 'text');
document.getElementById('contentArea').appendChild(skeleton);

// Then replace with real content
fetch('/api/content')
    .then(r => r.json())
    .then(data => {
        document.getElementById('contentArea').innerHTML = data.html;
    });

// Types: 'text' (3 lines), 'title', 'avatar'
// Usage: Great for initial page loads


/* ============================================
   7. AUTOMATIC WRAPPER (withLoading)
   ============================================ */

// Wrap any async operation with automatic loading management
async function deleteAssignment() {
    try {
        const result = await LoadingManager.withLoading(
            fetch('/api/assignments/123', { method: 'DELETE' }),
            '#deleteBtn',           // Show loading on this button
            'Deleting...'          // Show overlay with this message
        );
        console.log('Deleted:', result);
    } catch (error) {
        console.error('Delete failed:', error);
    }
}


/* ============================================
   8. AUTO-DISMISS AFTER TIMEOUT
   ============================================ */

// Show loading for 5 seconds then auto-hide
LoadingManager.showButtonLoading('#submitBtn', 'Saving...');
LoadingManager.autoHide('#submitBtn', 5000);


/* ============================================
   9. IN HTML/TEMPLATES
   ============================================ */

// In HTML forms:
/*
<form id="submissionForm" method="POST">
    <textarea name="content"></textarea>
    <button type="submit" id="submitBtn" class="btn-submit">Submit</button>
</form>

<script>
document.getElementById('submissionForm').addEventListener('submit', function(e) {
    LoadingManager.showButtonLoading('#submitBtn', 'Submitting...');
    LoadingManager.showFormLoading('#submissionForm');
});
</script>
*/


/* ============================================
   10. STYLING CLASSES (CSS)
   ============================================ */

// The following CSS classes are available:

// Spinners
// <div class="spinner spinner-primary"></div>
// <div class="spinner spinner-sm spinner-secondary"></div>
// <div class="spinner spinner-lg spinner-danger"></div>

// Skeletons
// <div class="skeleton skeleton-text"></div>
// <div class="skeleton skeleton-title"></div>
// <div class="skeleton skeleton-avatar"></div>

// Button loading state (applied automatically)
// <button class="loading">Submitting...</button>

// Form loading state (applied automatically)
// <form class="loading">...</form>

// Animations available
// .pulse - Pulsing opacity effect
// .fade-enter-active - Fade in animation
// .fade-exit-active - Fade out animation
// .slide-down-enter-active - Slide down animation


/* ============================================
   11. COMPLETE WORKFLOW EXAMPLE
   ============================================ */

// Example: Search courses with loading states
async function searchCourses() {
    const query = document.getElementById('searchInput').value;
    
    if (!query.trim()) return;
    
    // Show loading
    LoadingManager.showButtonLoading('#searchBtn', 'Searching...');
    LoadingManager.showOverlay('Finding courses...');
    
    try {
        // Fetch results
        const response = await fetch(`/api/courses/search?q=${encodeURIComponent(query)}`);
        const results = await response.json();
        
        // Update UI with results
        const resultsContainer = document.getElementById('results');
        resultsContainer.innerHTML = results.courses
            .map(course => `
                <div class="course-card">
                    <h3>${course.title}</h3>
                    <p>${course.description}</p>
                </div>
            `)
            .join('');
            
    } catch (error) {
        console.error('Search failed:', error);
        alert('Search failed. Please try again.');
    } finally {
        // Always hide loading states
        LoadingManager.hideButtonLoading('#searchBtn');
        LoadingManager.hideOverlay();
    }
}


/* ============================================
   12. BEST PRACTICES
   ============================================ */

// ✅ DO:
// - Always use try-finally to ensure loading states are hidden
// - Provide user-friendly messages ("Saving...", "Processing...")
// - Match loading state duration to actual operation duration
// - Use overlays for critical operations only
// - Use button loading for quick operations (< 2 seconds)

// ❌ DON'T:
// - Leave loading states visible forever (always hide in finally block)
// - Show multiple overlays at once
// - Use overlays for every operation (use button states instead)
// - Forget to disable form inputs (use showFormLoading)
// - Remove loading state before operation actually completes

