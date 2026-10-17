/**
 * Toast Notification System
 * Modern notification library with multiple types, positions, and auto-dismiss
 */

const Toast = {
    // Configuration
    config: {
        duration: 5000,          // Auto-dismiss after 5 seconds
        position: 'top-right',   // top-right, top-left, bottom-right, bottom-left, top-center, bottom-center
        maxStack: 5              // Maximum number of toasts to show
    },
    
    // Toast container (created on first use)
    container: null,
    
    // Active toasts
    toasts: [],
    
    /**
     * Initialize toast container
     */
    init: function() {
        if (this.container) return;
        
        this.container = document.createElement('div');
        this.container.id = 'toast-container';
        this.container.className = `toast-container toast-${this.config.position}`;
        document.body.appendChild(this.container);
    },
    
    /**
     * Show a toast notification
     * @param {string} message - The toast message
     * @param {string} type - success, error, warning, info
     * @param {number} duration - Auto-dismiss duration in ms (0 = no auto-dismiss)
     */
    show: function(message, type = 'info', duration = null) {
        this.init();
        
        // Create toast element
        const toastId = `toast-${Date.now()}-${Math.random()}`;
        const toast = document.createElement('div');
        toast.id = toastId;
        toast.className = `toast toast-${type} toast-enter`;
        
        // Toast content
        const icon = this.getIcon(type);
        toast.innerHTML = `
            <div class="toast-content">
                <span class="toast-icon">${icon}</span>
                <span class="toast-message">${this.escapeHtml(message)}</span>
            </div>
            <button class="toast-close" aria-label="Close">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        // Add to container
        this.container.appendChild(toast);
        this.toasts.push({ id: toastId, element: toast });
        
        // Remove oldest toast if exceeding max
        if (this.toasts.length > this.config.maxStack) {
            const oldest = this.toasts.shift();
            this.removeToast(oldest.id);
        }
        
        // Trigger animation
        setTimeout(() => {
            toast.classList.remove('toast-enter');
            toast.classList.add('toast-show');
        }, 10);
        
        // Close button handler
        const closeBtn = toast.querySelector('.toast-close');
        closeBtn.addEventListener('click', () => this.removeToast(toastId));
        
        // Auto-dismiss
        const dismissDuration = duration !== null ? duration : this.config.duration;
        if (dismissDuration > 0) {
            setTimeout(() => this.removeToast(toastId), dismissDuration);
        }
        
        return toastId;
    },
    
    /**
     * Remove a toast by ID
     */
    removeToast: function(toastId) {
        const toastObj = this.toasts.find(t => t.id === toastId);
        if (!toastObj) return;
        
        const toast = toastObj.element;
        toast.classList.remove('toast-show');
        toast.classList.add('toast-exit');
        
        setTimeout(() => {
            toast.remove();
            this.toasts = this.toasts.filter(t => t.id !== toastId);
        }, 300);
    },
    
    /**
     * Remove all toasts
     */
    removeAll: function() {
        this.toasts.forEach(toast => {
            toast.element.remove();
        });
        this.toasts = [];
    },
    
    /**
     * Get icon for toast type
     */
    getIcon: function(type) {
        const icons = {
            'success': '<i class="fas fa-check-circle"></i>',
            'error': '<i class="fas fa-exclamation-circle"></i>',
            'warning': '<i class="fas fa-exclamation-triangle"></i>',
            'info': '<i class="fas fa-info-circle"></i>'
        };
        return icons[type] || icons['info'];
    },
    
    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml: function(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },
    
    /**
     * Convenience methods
     */
    success: function(message, duration) {
        return this.show(message, 'success', duration);
    },
    
    error: function(message, duration) {
        return this.show(message, 'error', duration);
    },
    
    warning: function(message, duration) {
        return this.show(message, 'warning', duration);
    },
    
    info: function(message, duration) {
        return this.show(message, 'info', duration);
    },
    
    /**
     * Set configuration
     */
    setConfig: function(config) {
        Object.assign(this.config, config);
        if (this.container) {
            this.container.className = `toast-container toast-${this.config.position}`;
        }
    }
};

/**
 * Toast Wrapper for Fetch Operations
 * Automatically shows notifications based on response
 */
const ToastFetch = {
    /**
     * Fetch with automatic toast notifications
     * @param {string} url - API endpoint
     * @param {object} options - Fetch options
     * @param {object} messages - Custom success/error messages
     */
    fetch: async function(url, options = {}, messages = {}) {
        try {
            const response = await fetch(url, {
                headers: {
                    'X-CSRFToken': this.getCsrfToken(),
                    ...options.headers
                },
                ...options
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                const errorMsg = messages.error || data.message || `Error: ${response.status}`;
                Toast.error(errorMsg);
                throw new Error(errorMsg);
            }
            
            const successMsg = messages.success || data.message || 'Success!';
            Toast.success(successMsg);
            
            return data;
        } catch (error) {
            const errorMsg = messages.error || error.message || 'An error occurred';
            Toast.error(errorMsg);
            throw error;
        }
    },
    
    /**
     * POST request with toast notifications
     */
    post: async function(url, data = {}, messages = {}) {
        return this.fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        }, messages);
    },
    
    /**
     * PUT request with toast notifications
     */
    put: async function(url, data = {}, messages = {}) {
        return this.fetch(url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        }, messages);
    },
    
    /**
     * DELETE request with toast notifications
     */
    delete: async function(url, messages = {}) {
        return this.fetch(url, {
            method: 'DELETE'
        }, messages);
    },
    
    /**
     * GET request with toast notifications
     */
    get: async function(url, messages = {}) {
        return this.fetch(url, {
            method: 'GET'
        }, messages);
    },
    
    /**
     * Get CSRF token from meta tag
     */
    getCsrfToken: function() {
        return document.querySelector('meta[name="csrf-token"]')?.content || '';
    }
};

/**
 * Promise Toast Wrapper
 * Show toast while promise is pending, then success/error on resolution
 */
const ToastPromise = {
    /**
     * Wrap a promise with toast notifications
     * @param {Promise} promise - The promise to wrap
     * @param {object} messages - Loading, success, and error messages
     */
    wrap: async function(promise, messages = {}) {
        const loadingMsg = messages.loading || 'Processing...';
        const successMsg = messages.success || 'Success!';
        const errorMsg = messages.error || 'An error occurred';
        
        // Show loading toast
        const toastId = Toast.info(loadingMsg, 0); // 0 = no auto-dismiss
        
        try {
            const result = await promise;
            Toast.removeToast(toastId);
            Toast.success(successMsg);
            return result;
        } catch (error) {
            Toast.removeToast(toastId);
            Toast.error(errorMsg);
            throw error;
        }
    }
};

// Initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        Toast.init();
    });
} else {
    Toast.init();
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Toast, ToastFetch, ToastPromise };
}
