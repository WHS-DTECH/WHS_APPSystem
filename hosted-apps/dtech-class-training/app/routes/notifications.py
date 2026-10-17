from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from app import db
from app.models import Notification, User
from datetime import datetime

bp = Blueprint('notifications', __name__, url_prefix='/notifications')



# SocketIO event handlers are now in notifications_socketio.py
# Import and register them in your web server entry point only:
# from app.routes.notifications_socketio import register_notification_socketio
# register_notification_socketio(socketio)

from app import db


# Only register SocketIO event handlers if socketio is available
try:
    from app import socketio
except ImportError:
    socketio = None

if 'socketio' in globals() and socketio:
    # --- SocketIO: connect ---
    @socketio.on('connect')
    def handle_connect():
        """Handle client connection"""
        if current_user.is_authenticated:
            user_room = f'user_{current_user.id}'
            join_room(user_room)
            connected_users[request.sid] = current_user.id
            # Emit unread count to client
            unread_count = Notification.query.filter_by(
                user_id=current_user.id,
                is_read=False
            ).count()
            emit('connected', {
                'message': 'Connected to notifications',
                'unread_count': unread_count
            })
            print(f'[NOTIFICATIONS] User {current_user.username} (ID: {current_user.id}) connected')

    # --- SocketIO: disconnect ---
    @socketio.on('disconnect')
    def handle_disconnect():
        """Handle client disconnection"""
        if request.sid in connected_users:
            user_id = connected_users.pop(request.sid)
            leave_room(f'user_{user_id}')
            print(f'[NOTIFICATIONS] User ID {user_id} disconnected')

    # --- SocketIO: mark_read ---
    @socketio.on('mark_read')
    def handle_mark_read(data):
        """Handle marking notification as read via WebSocket"""
        if not current_user.is_authenticated:
            return False
        try:
            notification_id = data.get('notification_id')
            notification = Notification.query.get(notification_id)
            if not notification or notification.user_id != current_user.id:
                return False
            notification.is_read = True
            notification.updated_at = datetime.utcnow()
            db.session.commit()
            emit('notification_read', {
                'notification_id': notification_id
            }, room=f'user_{current_user.id}')
            return True
        except Exception as e:
            print(f'[NOTIFICATIONS] Error marking read: {str(e)}')
            return False

    # --- SocketIO: get_unread_count ---
    @socketio.on('get_unread_count')
    def handle_get_unread_count():
        """Get current unread notification count"""
        if not current_user.is_authenticated:
            return
        try:
            unread_count = Notification.query.filter_by(
                user_id=current_user.id,
                is_read=False
            ).count()
            emit('unread_count_update', {
                'unread_count': unread_count
            })
        except Exception as e:
            print(f'[NOTIFICATIONS] Error getting unread count: {str(e)}')
@login_required
def mark_all_as_read():
    """Mark all notifications as read"""
    try:
        unread_notifications = Notification.query.filter_by(
            user_id=current_user.id,
            is_read=False
        ).all()
        
        for notification in unread_notifications:
            notification.is_read = True
            notification.updated_at = datetime.utcnow()
        
        db.session.commit()
        
        # Emit update to client if socketio is available
        if socketio:
            socketio.emit('all_notifications_read', {}, room=f'user_{current_user.id}')
        
        return jsonify({
            'success': True,
            'message': f'Marked {len(unread_notifications)} notifications as read'
        }), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@bp.route('/<int:notification_id>', methods=['DELETE'])
@login_required
def delete_notification(notification_id):
    """Delete a notification"""
    try:
        notification = Notification.query.get_or_404(notification_id)
        
        # Verify ownership
        if notification.user_id != current_user.id:
            return jsonify({'success': False, 'error': 'Unauthorized'}), 403
        
        db.session.delete(notification)
        db.session.commit()
        
        return jsonify({'success': True, 'message': 'Notification deleted'}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500



# SocketIO event handlers have been moved to notifications_socketio.py
        
        emit('unread_count_update', {
            'unread_count': unread_count
        })
    except Exception as e:
        print(f'[NOTIFICATIONS] Error getting unread count: {str(e)}')


# ============================================================================
# Notification Creation Helper Functions (Called from other routes)
# ============================================================================

def create_notification(user_id, notification_type, title, message, 
                       related_user_id=None, assignment_id=None, submission_id=None):
    """
    Create and broadcast a notification
    
    Args:
        user_id: Target user ID
        notification_type: Type of notification (e.g., 'assignment_submitted', 'assignment_graded')
        title: Notification title
        message: Notification message
        related_user_id: User who triggered the notification
        assignment_id: Related assignment ID
        submission_id: Related submission ID
    """
    try:
        notification = Notification(
            user_id=user_id,
            notification_type=notification_type,
            title=title,
            message=message,
            related_user_id=related_user_id,
            assignment_id=assignment_id,
            submission_id=submission_id
        )
        db.session.add(notification)
        db.session.commit()
        
        # Emit notification to user if socketio is available
        if 'socketio' in globals() and socketio:
            socketio.emit('new_notification', {
                'notification': notification.to_dict()
            }, room=f'user_{user_id}')
        
        print(f'[NOTIFICATIONS] Created notification for user {user_id}: {notification_type}')
        return notification
    except Exception as e:
        print(f'[NOTIFICATIONS] Error creating notification: {str(e)}')
        return None


def notify_teachers_assignment_submitted(assignment_id, submission_id, student_name):
    """Notify all teachers when a student submits an assignment"""
    try:
        from app.models import Assignment, User
        
        assignment = Assignment.query.get(assignment_id)
        if not assignment:
            return
        
        # Get all teachers (or specific teachers for the course)
        teachers = User.query.filter_by(role='teacher').all()
        
        for teacher in teachers:
            create_notification(
                user_id=teacher.id,
                notification_type='assignment_submitted',
                title=f'New Submission: {assignment.title}',
                message=f'{student_name} has submitted {assignment.title}',
                related_user_id=None,  # The student's ID would go here if needed
                assignment_id=assignment_id,
                submission_id=submission_id
            )
    except Exception as e:
        print(f'[NOTIFICATIONS] Error notifying teachers: {str(e)}')


def notify_student_assignment_graded(student_id, assignment_id, grade, teacher_name):
    """Notify a student when their assignment is graded"""
    try:
        from app.models import Assignment
        
        assignment = Assignment.query.get(assignment_id)
        if not assignment:
            return
        
        create_notification(
            user_id=student_id,
            notification_type='assignment_graded',
            title=f'Graded: {assignment.title}',
            message=f'{teacher_name} graded your {assignment.title}. Score: {grade}',
            related_user_id=None,  # Teacher ID would go here
            assignment_id=assignment_id
        )
    except Exception as e:
        print(f'[NOTIFICATIONS] Error notifying student: {str(e)}')
