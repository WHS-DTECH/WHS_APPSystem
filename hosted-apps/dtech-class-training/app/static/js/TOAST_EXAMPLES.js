/**
 * Toast Notification System - Implementation Guide
 * 
 * Modern, customizable toast notifications with auto-dismiss,
 * multiple types, and various positions.
 */

/* ============================================
   1. BASIC TOAST EXAMPLES
   ============================================ */

// Show a simple info toast
Toast.info('This is an info message');

// Show success toast
Toast.success('Operation completed successfully!');

// Show error toast
Toast.error('An error occurred. Please try again.');

// Show warning toast
Toast.warning('Please be careful with this action.');

// Show custom info toast with custom duration
Toast.show('Custom message', 'info', 3000);  // 3 seconds


/* ============================================
   2. AUTO-DISMISS CONTROL
   ============================================ */

// Default: auto-dismiss after 5 seconds
Toast.success('This will auto-dismiss after 5 seconds');

// Custom duration (in milliseconds)
Toast.warning('Auto-dismiss after 3 seconds', 3000);

// No auto-dismiss (0 = no dismissal)
const toastId = Toast.info('Click X to close this', 0);

// Close toast programmatically
setTimeout(() => {
    Toast.removeToast(toastId);
}, 2000);

// Close all toasts
Toast.removeAll();


/* ============================================
   3. TOAST POSITIONS
   ============================================ */

// Configure position (default: top-right)
Toast.setConfig({
    position: 'top-right'    // or top-left, bottom-right, bottom-left, top-center, bottom-center
});

// Different position examples
Toast.setConfig({ position: 'bottom-center' });
Toast.success('Bottom center notification');

Toast.setConfig({ position: 'top-left' });
Toast.info('Top left notification');

Toast.setConfig({ position: 'bottom-left' });
Toast.warning('Bottom left notification');


/* ============================================
   4. ADVANCED CONFIGURATION
   ============================================ */

// Set multiple config options
Toast.setConfig({
    position: 'bottom-right',
    duration: 4000,          // Auto-dismiss after 4 seconds
    maxStack: 3              // Show max 3 toasts at once
});

// Get current config (note: no getter, modify directly)
console.log(Toast.config);


/* ============================================
   5. FETCH WITH TOAST NOTIFICATIONS
   ============================================ */

// Simple GET with automatic toast
ToastFetch.get('/api/user/profile', {
    success: 'Profile loaded successfully',
    error: 'Failed to load profile'
})
    .then(data => console.log(data))
    .catch(err => console.error(err));

// POST with automatic toast
ToastFetch.post('/api/assignments/submit', 
    {
        content: 'My answer',
        assignmentId: 123
    },
    {
        success: 'Assignment submitted!',
        error: 'Failed to submit assignment'
    }
)
    .then(result => console.log('Submitted:', result))
    .catch(err => console.error('Submission failed:', err));

// PUT request
ToastFetch.put('/api/courses/123', 
    { title: 'Updated Title' },
    {
        success: 'Course updated successfully',
        error: 'Failed to update course'
    }
);

// DELETE request
ToastFetch.delete('/api/courses/123',
    {
        success: 'Course deleted successfully',
        error: 'Failed to delete course'
    }
);


/* ============================================
   6. PROMISE TOAST WRAPPER
   ============================================ */

// Wrap any promise with loading and success/error toasts
async function saveUserSettings() {
    const promise = fetch('/api/settings', {
        method: 'PUT',
        body: JSON.stringify({ theme: 'dark' })
    });
    
    try {
        await ToastPromise.wrap(promise, {
            loading: 'Saving settings...',
            success: 'Settings saved successfully!',
            error: 'Failed to save settings'
        });
    } catch (error) {
        console.error('Error:', error);
    }
}

// Works with any async operation
async function processData() {
    await ToastPromise.wrap(
        new Promise(resolve => setTimeout(resolve, 2000)),
        {
            loading: 'Processing data...',
            success: 'Data processed!',
            error: 'Processing failed'
        }
    );
}


/* ============================================
   7. FORM SUBMISSION WITH TOASTS
   ============================================ */

// Handle form with toast notifications
document.getElementById('contactForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = new FormData(document.getElementById('contactForm'));
    
    try {
        const result = await ToastFetch.post('/api/contact', 
            Object.fromEntries(formData),
            {
                success: 'Message sent successfully!',
                error: 'Failed to send message'
            }
        );
        
        // Reset form on success
        document.getElementById('contactForm').reset();
    } catch (error) {
        // Error toast already shown
    }
});


/* ============================================
   8. TOAST WITH COMBINED LOADING & TOAST
   ============================================ */

// Show loading state AND toast notification
async function downloadReport() {
    LoadingManager.showButtonLoading('#downloadBtn', 'Downloading...');
    
    try {
        const response = await fetch('/api/reports/download');
        if (!response.ok) throw new Error('Download failed');
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'report.pdf';
        a.click();
        
        Toast.success('Report downloaded successfully');
    } catch (error) {
        Toast.error('Failed to download report');
    } finally {
        LoadingManager.hideButtonLoading('#downloadBtn');
    }
}


/* ============================================
   9. CONDITIONAL TOASTS
   ============================================ */

// Show different toast based on validation
function validateEmail(email) {
    if (!email.includes('@')) {
        Toast.warning('Please enter a valid email address');
        return false;
    }
    Toast.success('Email is valid');
    return true;
}

// Show toast based on response status
async function fetchUserData(userId) {
    try {
        const response = await fetch(`/api/users/${userId}`);
        
        if (response.status === 404) {
            Toast.warning('User not found');
        } else if (response.status === 403) {
            Toast.error('You do not have permission to view this user');
        } else if (!response.ok) {
            Toast.error(`Error: ${response.statusText}`);
        } else {
            const data = await response.json();
            Toast.success('User data loaded');
            return data;
        }
    } catch (error) {
        Toast.error('Network error: ' + error.message);
    }
}


/* ============================================
   10. SEQUENTIAL TOASTS
   ============================================ */

// Show multiple toasts in sequence
async function processMultipleFiles(files) {
    for (let i = 0; i < files.length; i++) {
        Toast.info(`Processing file ${i + 1} of ${files.length}: ${files[i].name}`);
        
        try {
            await uploadFile(files[i]);
            Toast.success(`${files[i].name} uploaded successfully`);
        } catch (error) {
            Toast.error(`Failed to upload ${files[i].name}`);
        }
    }
    
    Toast.success('All files processed!');
}


/* ============================================
   11. TOAST IN REAL-WORLD SCENARIOS
   ============================================ */

// User login
async function handleLogin(email, password) {
    try {
        const result = await ToastFetch.post('/api/auth/login',
            { email, password },
            {
                success: 'Welcome back!',
                error: 'Invalid email or password'
            }
        );
        window.location.href = '/dashboard';
    } catch (error) {
        // Toast already shown
    }
}

// Course enrollment
async function enrollCourse(courseId) {
    try {
        await ToastFetch.post(`/api/courses/${courseId}/enroll`,
            {},
            {
                success: 'Successfully enrolled in course!',
                error: 'Failed to enroll in course'
            }
        );
        // Reload page or update UI
        location.reload();
    } catch (error) {
        // Toast already shown
    }
}

// Assignment grading
async function submitGrade(assignmentId, studentId, grade) {
    try {
        await ToastFetch.post('/api/assignments/grade',
            { assignmentId, studentId, grade },
            {
                success: 'Grade submitted successfully',
                error: 'Failed to submit grade'
            }
        );
    } catch (error) {
        // Toast already shown
    }
}

// Quiz completion
async function submitQuiz(quizData) {
    try {
        const result = await ToastFetch.post('/api/quizzes/submit',
            quizData,
            {
                success: `Quiz submitted! Score: ${result.score}%`,
                error: 'Failed to submit quiz'
            }
        );
        
        setTimeout(() => {
            Toast.info('Redirecting to results...');
            setTimeout(() => {
                window.location.href = `/quizzes/${result.quizId}/results`;
            }, 1500);
        }, 1000);
    } catch (error) {
        // Toast already shown
    }
}


/* ============================================
   12. ACCESSIBILITY & UX BEST PRACTICES
   ============================================ */

// ✅ DO:
// - Use clear, concise messages (max 50 words)
// - Use appropriate toast type (success/error/warning/info)
// - Provide user actions after success (e.g., "View submitted assignment")
// - Use longer durations for errors (let user read)
// - Group related toasts
// - Test on mobile devices

// ❌ DON'T:
// - Show toast for every action (only important ones)
// - Use success for confirmation prompts
// - Show 10 toasts at once (use maxStack config)
// - Use vague messages ("Error" instead of "Failed to save settings")
// - Show toast and loading state for same action (use one or the other)

// Better toast messages:
// ❌ "Error"
// ✅ "Failed to save changes. Please try again."

// ❌ "Success"
// ✅ "Assignment submitted successfully!"

// ❌ "Something went wrong"
// ✅ "Network error: Unable to connect. Check your internet connection."


/* ============================================
   13. COMBINING WITH OTHER FEATURES
   ============================================ */

// Toast + Loading Manager + Form validation
async function submitAssignment() {
    const form = document.getElementById('assignmentForm');
    
    // Validate
    if (!form.checkValidity()) {
        Toast.warning('Please fill all required fields');
        return;
    }
    
    // Show loading
    LoadingManager.showButtonLoading('#submitBtn', 'Submitting...');
    
    try {
        const result = await ToastFetch.post('/api/assignments/submit',
            new Object(new FormData(form)),
            {
                success: 'Assignment submitted successfully!',
                error: 'Failed to submit assignment'
            }
        );
        
        // Additional action after success
        if (result.score !== undefined) {
            Toast.info(`Your score: ${result.score}%`);
        }
    } finally {
        LoadingManager.hideButtonLoading('#submitBtn');
    }
}

