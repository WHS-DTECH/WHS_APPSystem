/**
 * Real-time Notification System
 * Handles WebSocket connections and notification updates
 */

class NotificationManager {
    constructor() {
        this.socket = null;
        this.unreadCount = 0;
        this.notifications = [];
        this.isConnected = false;
        this.init();
    }

    /**
     * Initialize the notification system
     */
    init() {
        // Only initialize if user is authenticated (socket.io namespace is protected)
        try {
            this.connectSocket();
        } catch (error) {
            console.error('[Notifications] Failed to initialize:', error);
        }
    }

    /**
     * Connect to WebSocket server
     */
    connectSocket() {
        // Get socket.io from the global scope (included in base.html)
        if (typeof io === 'undefined') {
            console.warn('[Notifications] Socket.IO not available');
            return;
        }

        this.socket = io();

        /**
         * Connection established
         */
        this.socket.on('connected', (data) => {
            this.isConnected = true;
            this.unreadCount = data.unread_count || 0;
            console.log('[Notifications] Connected. Unread:', this.unreadCount);
            this.updateBadge();
            this.loadNotifications();
        });

        /**
         * New notification received
         */
        this.socket.on('new_notification', (data) => {
            const notification = data.notification;
            this.notifications.unshift(notification);
            this.unreadCount++;
            
            console.log('[Notifications] New notification:', notification.title);
            this.updateBadge();
            this.showNotificationToast(notification);
            this.updateNotificationList();
        });

        /**
         * Notification marked as read
         */
        this.socket.on('notification_read', (data) => {
            const notificationId = data.notification_id;
            const notification = this.notifications.find(n => n.id === notificationId);
            
            if (notification) {
                notification.is_read = true;
                this.unreadCount = Math.max(0, this.unreadCount - 1);
                this.updateBadge();
                this.updateNotificationList();
            }
        });

        /**
         * All notifications marked as read
         */
        this.socket.on('all_notifications_read', () => {
            this.notifications.forEach(n => n.is_read = true);
            this.unreadCount = 0;
            this.updateBadge();
            this.updateNotificationList();
        });

        /**
         * Unread count update
         */
        this.socket.on('unread_count_update', (data) => {
            this.unreadCount = data.unread_count || 0;
            this.updateBadge();
        });

        /**
         * Disconnection
         */
        this.socket.on('disconnect', () => {
            this.isConnected = false;
            console.log('[Notifications] Disconnected');
        });

        /**
         * Connection error
         */
        this.socket.on('error', (error) => {
            console.error('[Notifications] Socket error:', error);
        });
    }

    /**
     * Load all notifications from server
     */
    loadNotifications() {
        fetch('/notifications/', {
            method: 'GET',
            credentials: 'include'
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                this.notifications = data.notifications || [];
                this.unreadCount = data.unread_count || 0;
                this.updateBadge();
                this.updateNotificationList();
            }
        })
        .catch(error => console.error('[Notifications] Error loading notifications:', error));
    }

    /**
     * Mark a notification as read
     */
    markAsRead(notificationId) {
        fetch(`/notifications/${notificationId}/read`, {
            method: 'POST',
            credentials: 'include'
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Socket event will update UI
                this.socket.emit('mark_read', { notification_id: notificationId });
            }
        })
        .catch(error => console.error('[Notifications] Error marking as read:', error));
    }

    /**
     * Mark all notifications as read
     */
    markAllAsRead() {
        fetch('/notifications/mark-all-read', {
            method: 'POST',
            credentials: 'include'
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                this.loadNotifications();
            }
        })
        .catch(error => console.error('[Notifications] Error marking all as read:', error));
    }

    /**
     * Delete a notification
     */
    deleteNotification(notificationId) {
        fetch(`/notifications/${notificationId}`, {
            method: 'DELETE',
            credentials: 'include'
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                this.notifications = this.notifications.filter(n => n.id !== notificationId);
                this.updateNotificationList();
            }
        })
        .catch(error => console.error('[Notifications] Error deleting notification:', error));
    }

    /**
     * Update the notification badge
     */
    updateBadge() {
        const badge = document.getElementById('notificationBadge');
        if (badge) {
            if (this.unreadCount > 0) {
                badge.textContent = this.unreadCount > 99 ? '99+' : this.unreadCount;
                badge.style.display = 'flex';
            } else {
                badge.style.display = 'none';
            }
        }
    }

    /**
     * Update the notification list in the dropdown
     */
    updateNotificationList() {
        const container = document.getElementById('notificationsList');
        if (!container) return;

        if (this.notifications.length === 0) {
            container.innerHTML = '<div class="notification-empty">No notifications yet</div>';
            return;
        }

        container.innerHTML = this.notifications.map(notif => `
            <div class="notification-item ${notif.is_read ? 'read' : 'unread'}" id="notif-${notif.id}">
                <div class="notification-header">
                    <span class="notification-title">${this.escapeHtml(notif.title)}</span>
                    <button class="notification-delete" onclick="notificationManager.deleteNotification(${notif.id})">×</button>
                </div>
                <div class="notification-message">${this.escapeHtml(notif.message)}</div>
                <div class="notification-footer">
                    <small class="notification-time">${this.formatTime(notif.created_at)}</small>
                    ${!notif.is_read ? `
                        <button class="notification-mark-read" onclick="notificationManager.markAsRead(${notif.id})">
                            Mark as read
                        </button>
                    ` : ''}
                </div>
            </div>
        `).join('');
    }

    /**
     * Show a toast notification (top-right corner)
     */
    showNotificationToast(notification) {
        // Create toast container if it doesn't exist
        let toastContainer = document.getElementById('notificationToasts');
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.id = 'notificationToasts';
            document.body.appendChild(toastContainer);
        }

        // Create toast element
        const toast = document.createElement('div');
        toast.className = `notification-toast ${notification.notification_type}`;
        toast.innerHTML = `
            <div class="toast-content">
                <div class="toast-title">${this.escapeHtml(notification.title)}</div>
                <div class="toast-message">${this.escapeHtml(notification.message)}</div>
            </div>
            <button class="toast-close" onclick="this.parentElement.remove()">×</button>
        `;

        toastContainer.appendChild(toast);

        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (toast.parentElement) {
                toast.remove();
            }
        }, 5000);
    }

    /**
     * Format time for display
     */
    formatTime(isoString) {
        if (!isoString) return 'just now';

        const date = new Date(isoString);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;

        return date.toLocaleDateString();
    }

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Toggle notification panel visibility
     */
    togglePanel() {
        const panel = document.getElementById('notificationsPanel');
        if (panel) {
            const isVisible = panel.style.display === 'block';
            panel.style.display = isVisible ? 'none' : 'block';
            
            // Mark notifications as read when panel is opened
            if (!isVisible) {
                const unreadNotifs = this.notifications.filter(n => !n.is_read);
                unreadNotifs.forEach(notif => this.markAsRead(notif.id));
            }
        }
    }
}

// Initialize notification manager when DOM is ready
let notificationManager;
document.addEventListener('DOMContentLoaded', () => {
    // Only initialize if user is authenticated (check for body data attribute)
    if (document.body.getAttribute('data-authenticated') === 'true') {
        notificationManager = new NotificationManager();
    }
});

// Close notification panel when clicking outside
document.addEventListener('click', (e) => {
    const panel = document.getElementById('notificationsPanel');
    const bell = document.getElementById('notificationBell');
    
    if (panel && bell && !panel.contains(e.target) && !bell.contains(e.target)) {
        panel.style.display = 'none';
    }
});
