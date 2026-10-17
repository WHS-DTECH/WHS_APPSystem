/**
 * Loading State Manager
 * Handles spinners, loading overlays, and button states during async operations
 */

const LoadingManager = {
    // Create and show a full-page loading overlay
    showOverlay: function(message = 'Loading...') {
        let overlay = document.getElementById('loadingOverlay');
        
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'loadingOverlay';
            overlay.className = 'loading-overlay';
            overlay.innerHTML = `
                <div class="loading-content">
                    <div class="spinner spinner-primary"></div>
                    <h3>${message}</h3>
                </div>
            `;
            document.body.appendChild(overlay);
        }
        
        overlay.classList.add('active');
    },
    
    // Hide the loading overlay
    hideOverlay: function() {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) {
            overlay.classList.remove('active');
        }
    },
    
    // Show loading state on a button
    showButtonLoading: function(buttonSelector, originalText = 'Loading...') {
        const btn = document.querySelector(buttonSelector);
        if (btn) {
            btn.classList.add('loading');
            btn.disabled = true;
            btn.dataset.originalText = btn.textContent || originalText;
            btn.textContent = originalText;
        }
    },
    
    // Hide loading state on a button
    hideButtonLoading: function(buttonSelector) {
        const btn = document.querySelector(buttonSelector);
        if (btn) {
            btn.classList.remove('loading');
            btn.disabled = false;
            btn.textContent = btn.dataset.originalText || 'Submit';
        }
    },
    
    // Show loading state on a form
    showFormLoading: function(formSelector) {
        const form = document.querySelector(formSelector);
        if (form) {
            form.classList.add('loading');
            const inputs = form.querySelectorAll('input, textarea, select, button');
            inputs.forEach(input => {
                input.disabled = true;
            });
        }
    },
    
    // Hide loading state on a form
    hideFormLoading: function(formSelector) {
        const form = document.querySelector(formSelector);
        if (form) {
            form.classList.remove('loading');
            const inputs = form.querySelectorAll('input, textarea, select');
            inputs.forEach(input => {
                input.disabled = false;
            });
        }
    },
    
    // Create a spinner element
    createSpinner: function(size = 'md', color = 'primary') {
        const spinner = document.createElement('div');
        const sizeClass = size === 'sm' ? 'spinner-sm' : size === 'lg' ? 'spinner-lg' : '';
        const colorClass = `spinner-${color}`;
        spinner.className = `spinner ${sizeClass} ${colorClass}`;
        return spinner;
    },
    
    // Create skeleton loader
    createSkeleton: function(lines = 3, type = 'text') {
        const container = document.createElement('div');
        
        if (type === 'title') {
            const skeleton = document.createElement('div');
            skeleton.className = 'skeleton skeleton-title';
            container.appendChild(skeleton);
        } else if (type === 'avatar') {
            const skeleton = document.createElement('div');
            skeleton.className = 'skeleton skeleton-avatar';
            container.appendChild(skeleton);
        } else {
            for (let i = 0; i < lines; i++) {
                const skeleton = document.createElement('div');
                skeleton.className = 'skeleton skeleton-text';
                container.appendChild(skeleton);
            }
        }
        
        return container;
    },
    
    // Wrap async operation with loading state
    withLoading: async function(promise, buttonSelector = null, overlayMessage = null) {
        try {
            if (buttonSelector) {
                this.showButtonLoading(buttonSelector);
            }
            if (overlayMessage) {
                this.showOverlay(overlayMessage);
            }
            
            const result = await promise;
            return result;
        } catch (error) {
            console.error('Operation failed:', error);
            throw error;
        } finally {
            if (buttonSelector) {
                this.hideButtonLoading(buttonSelector);
            }
            if (overlayMessage) {
                this.hideOverlay();
            }
        }
    },
    
    // Auto-dismiss loading state after timeout
    autoHide: function(selector, timeout = 5000) {
        setTimeout(() => {
            if (selector.includes('btn')) {
                this.hideButtonLoading(selector);
            } else if (selector.includes('form')) {
                this.hideFormLoading(selector);
            }
        }, timeout);
    }
};

/**
 * Fetch Wrapper with Loading States
 * Automatically shows/hides loading states during API calls
 */
const FetchWithLoading = {
    get: async function(url, buttonSelector = null) {
        if (buttonSelector) LoadingManager.showButtonLoading(buttonSelector);
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
        } finally {
            if (buttonSelector) LoadingManager.hideButtonLoading(buttonSelector);
        }
    },
    
    post: async function(url, data = {}, buttonSelector = null) {
        if (buttonSelector) LoadingManager.showButtonLoading(buttonSelector);
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': this.getCsrfToken()
                },
                body: JSON.stringify(data)
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
        } finally {
            if (buttonSelector) LoadingManager.hideButtonLoading(buttonSelector);
        }
    },
    
    getCsrfToken: function() {
        return document.querySelector('meta[name="csrf-token"]')?.content || '';
    }
};

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { LoadingManager, FetchWithLoading };
}
