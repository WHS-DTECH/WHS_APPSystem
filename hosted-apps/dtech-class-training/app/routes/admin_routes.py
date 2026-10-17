import csv
import json
import os
from werkzeug.utils import secure_filename
from flask import Blueprint, render_template, redirect, url_for, flash, request, current_app, jsonify
from flask_login import login_required, current_user
from app import db
from app.models import User, Course, Enrollment, Lesson, Assignment, Submission
from functools import wraps


bp = Blueprint('admin', __name__, url_prefix='/admin')
from app.routes.admin.db_export import admin_db_export
bp.register_blueprint(admin_db_export)


def teacher_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not current_user.is_authenticated or not current_user.is_teacher():
            flash('You must be a teacher to access this page.', 'danger')
            return redirect(url_for('main.dashboard'))
        return f(*args, **kwargs)
    return decorated_function


@bp.route('/dashboard')
@login_required
@teacher_required
def dashboard():
    """Enhanced teacher dashboard with statistics and recent submissions"""
    # Get current teacher's courses and students
    teacher_courses = Course.query.filter_by(teacher_id=current_user.id).all()
    
    # Collect all students enrolled in teacher's courses
    student_ids = set()
    for course in teacher_courses:
        for enrollment in course.enrollments:
            student_ids.add(enrollment.student_id)
    
    # Get student info and submissions
    students = User.query.filter(User.id.in_(student_ids)).all() if student_ids else []
    
    # Get recent submissions from teacher's courses
    recent_submissions = db.session.query(Submission).join(
        Submission.assignment
    ).filter(
        Submission.assignment.has(Assignment.course_id.in_([c.id for c in teacher_courses]))
    ).order_by(Submission.submitted_at.desc()).limit(10).all()
    
    # Calculate statistics
    total_students = len(students)
    total_enrollments = sum(len(course.enrollments) for course in teacher_courses)
    
    return render_template('admin/teacher_dashboard.html',
        teacher_courses=teacher_courses,
        students=students,
        recent_submissions=recent_submissions,
        total_students=total_students,
        total_enrollments=total_enrollments
    )




# --- CHANGE COURSE ORDER ROUTE ---
@bp.route('/change_course_order', methods=['POST'])
@login_required
@teacher_required
def change_course_order():
    course_id = int(request.form['course_id'])
    direction = request.form['direction']
    course = Course.query.get_or_404(course_id)
    # Get all courses ordered by 'order'
    courses = Course.query.order_by(Course.order).all()
    idx = [c.id for c in courses].index(course_id)
    if direction == 'up' and idx > 0:
        other = courses[idx - 1]
        course.order, other.order = other.order, course.order
        db.session.commit()
    elif direction == 'down' and idx < len(courses) - 1:
        other = courses[idx + 1]
        course.order, other.order = other.order, course.order
        db.session.commit()
    return redirect(url_for('admin.index'))

# --- DELETE COURSE ROUTE ---
@bp.route('/delete_course/<int:course_id>', methods=['POST'])
@login_required
@teacher_required
def delete_course(course_id):
    course = Course.query.get_or_404(course_id)
    db.session.delete(course)
    db.session.commit()
    flash(f'Course "{course.title}" and all its lessons/assignments/quizzes have been deleted.', 'success')
    return redirect(url_for('admin.index'))



# --- DELETE LESSON ROUTE ---
@bp.route('/delete_lesson/<int:lesson_id>', methods=['POST'])
@login_required
@teacher_required
def delete_lesson(lesson_id):
    lesson = Lesson.query.get_or_404(lesson_id)
    db.session.delete(lesson)
    db.session.commit()
    flash(f'Lesson "{lesson.title}" deleted.', 'success')
    return redirect(url_for('admin.index'))

@bp.route('/admin-debug')
def admin_debug():
    admin_email = "vanessapringle@westlandhigh.school.nz"
    user = User.query.filter_by(email=admin_email).first()
    if not user:
        return "Admin user not found."
    return f"Admin user: {user.email}<br>Username: {user.username}<br>Role: {user.role}<br>Password hash: {user.password_hash}"

# Bulk upload route
@bp.route('/bulk_upload', methods=['POST'])
@login_required
@teacher_required
def bulk_upload():
    upload_message = None
    file = request.files.get('bulkfile')
    if not file:
        upload_message = 'No file uploaded.'
        return redirect(url_for('admin.index', upload_message=upload_message))
    filename = secure_filename(file.filename)
    ext = filename.rsplit('.', 1)[-1].lower()
    try:
        if ext == 'csv':
            # Expecting: course_title, course_description, lesson_title, lesson_content, lesson_order, lesson_template_path, lesson_video_url
            reader = csv.DictReader(file.read().decode('utf-8').splitlines())
            for row in reader:
                # Find or create course
                course = Course.query.filter_by(title=row['course_title']).first()
                if not course:
                    course = Course(title=row['course_title'], description=row.get('course_description', ''), teacher_id=current_user.id)
                    db.session.add(course)
                    db.session.commit()
                # Add lesson
                lesson = Lesson(
                    course_id=course.id,
                    title=row['lesson_title'],
                    content=row.get('lesson_content', ''),
                    order=int(row.get('lesson_order', 0)),
                    template_path=row.get('lesson_template_path', ''),
                    video_url=row.get('lesson_video_url', '')
                )
                db.session.add(lesson)
            db.session.commit()
            upload_message = 'CSV upload successful.'
        elif ext == 'json':
            # Expecting: list of {course: {...}, lessons: [...]}
            data = json.load(file)
            for entry in data:
                c = entry['course']
                course = Course.query.filter_by(title=c['title']).first()
                if not course:
                    course = Course(title=c['title'], description=c.get('description', ''), teacher_id=current_user.id)
                    db.session.add(course)
                    db.session.commit()
                for l in entry['lessons']:
                    lesson = Lesson(
                        course_id=course.id,
                        title=l['title'],
                        content=l.get('content', ''),
                        order=int(l.get('order', 0)),
                        template_path=l.get('template_path', ''),
                        video_url=l.get('video_url', '')
                    )
                    db.session.add(lesson)
            db.session.commit()
            upload_message = 'JSON upload successful.'
        else:
            upload_message = 'Unsupported file type.'
    except Exception as e:
        upload_message = f'Error: {str(e)}'
    # Show message on admin dashboard
    page = request.args.get('page', 1, type=int)
    per_page = current_app.config.get('ITEMS_PER_PAGE', 20)
    users_pagination = User.query.order_by(User.id.desc()).paginate(page=page, per_page=per_page, error_out=False)
    users = users_pagination.items
    courses = Course.query.filter_by(teacher_id=current_user.id).all()
    user_enrollments = {}
    for user in users:
        enrolled_courses = [enrollment.course for enrollment in user.enrollments]
        user_enrollments[user.id] = enrolled_courses
    return render_template('admin/index.html', users=users, courses=courses, user_enrollments=user_enrollments, upload_message=upload_message, users_pagination=users_pagination)


@bp.route('/', methods=['GET', 'POST'])
@login_required
@teacher_required
def index():
    # Get current teacher's courses and students
    teacher_courses = Course.query.filter_by(teacher_id=current_user.id).all()
    
    # Collect all students enrolled in teacher's courses
    student_ids = set()
    for course in teacher_courses:
        for enrollment in course.enrollments:
            student_ids.add(enrollment.student_id)
    
    # Get student info and submissions
    students = User.query.filter(User.id.in_(student_ids)).all() if student_ids else []
    
    # Get recent submissions from teacher's courses
    from app.models import Submission
    recent_submissions = db.session.query(Submission).join(
        Submission.assignment
    ).filter(
        Submission.assignment.has(Assignment.course_id.in_([c.id for c in teacher_courses]))
    ).order_by(Submission.submitted_at.desc()).limit(10).all()
    
    # Calculate statistics
    total_students = len(students)
    total_enrollments = sum(len(course.enrollments) for course in teacher_courses)
    total_submissions = sum(
        len([s for s in course.assignments]) 
        for course in teacher_courses
        for assign in course.assignments
        for s in assign.submissions
    )
    
    # Fallback for legacy interface
    page = request.args.get('page', 1, type=int)
    per_page = current_app.config.get('ITEMS_PER_PAGE', 20)
    users_pagination = User.query.order_by(User.id.desc()).paginate(page=page, per_page=per_page, error_out=False)
    users = users_pagination.items
    courses = Course.query.all()
    user_enrollments = {}
    for user in users:
        enrolled_courses = [enrollment.course for enrollment in user.enrollments]
        user_enrollments[user.id] = enrolled_courses
    
    message = None
    if request.method == 'POST':
        user_id = int(request.form['user_id'])
        course_id = int(request.form['course_id'])
        action = request.form['action']
        user = User.query.get(user_id)
        course = Course.query.get(course_id)
        if not user or not course:
            message = 'Invalid user or course.'
        else:
            enrollment = Enrollment.query.filter_by(student_id=user_id, course_id=course_id).first()
            if action == 'enrol':
                if enrollment:
                    message = f'{user.username} is already enrolled in {course.title}.'
                else:
                    new_enrollment = Enrollment(student_id=user_id, course_id=course_id)
                    db.session.add(new_enrollment)
                    db.session.commit()
                    message = f'{user.username} enrolled in {course.title}.'
            elif action == 'unenrol':
                if enrollment:
                    db.session.delete(enrollment)
                    db.session.commit()
                    message = f'{user.username} unenrolled from {course.title}.'
                else:
                    message = f'{user.username} is not enrolled in {course.title}.'
    
    return render_template('admin/index.html', 
        users=users, 
        courses=courses, 
        user_enrollments=user_enrollments, 
        message=message,
        teacher_courses=teacher_courses,
        students=students,
        recent_submissions=recent_submissions,
        total_students=total_students,
        total_enrollments=total_enrollments,
        total_submissions=total_submissions,
        users_pagination=users_pagination
    )

@bp.route('/students')
@login_required
@teacher_required
def students():
    page = request.args.get('page', 1, type=int)
    per_page = current_app.config.get('ITEMS_PER_PAGE', 20)
    students_pagination = User.query.filter_by(role='student').order_by(User.id.desc()).paginate(page=page, per_page=per_page, error_out=False)
    students = students_pagination.items
    return render_template('admin/students.html', students=students, students_pagination=students_pagination)

@bp.route('/student/<int:student_id>')
@login_required
@teacher_required
def student_detail(student_id):
    student = User.query.get_or_404(student_id)
    enrollments = Enrollment.query.filter_by(student_id=student_id).all()
    
    return render_template('admin/student_detail.html', 
                         student=student, 
                         enrollments=enrollments)

@bp.route('/reset_student_checker/<int:student_id>', methods=['POST'])
@login_required
@teacher_required
def reset_student_checker(student_id):
    from app.models import CommentCheck, DebugCheck, User
    student = User.query.get_or_404(student_id)
    CommentCheck.query.filter_by(user_id=student_id).delete()
    DebugCheck.query.filter_by(user_id=student_id).delete()
    db.session.commit()
    flash(f'All checker files for {student.username} have been reset.', 'success')
    return redirect(url_for('admin.student_detail', student_id=student_id))


# ── User Role Management ─────────────────────────────────────────────────────

@bp.route('/user_roles')
@login_required
@teacher_required
def user_roles():
    return render_template('admin/user_roles.html')


@bp.route('/api/users-with-roles')
@login_required
@teacher_required
def api_users_with_roles():
    users = User.query.order_by(User.username).all()
    return jsonify([{
        'id': u.id,
        'username': u.username,
        'email': u.email or '',
        'role': u.role,
        'first_name': u.first_name or '',
        'last_name': u.last_name or '',
    } for u in users])


@bp.route('/api/set-user-role', methods=['POST'])
@login_required
@teacher_required
def api_set_user_role():
    data = request.get_json(silent=True) or {}
    user_id = data.get('user_id')
    new_role = data.get('role', '').strip().lower()
    if new_role not in ('student', 'teacher'):
        return jsonify({'error': 'Role must be student or teacher'}), 400
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404
    # Prevent removing the last teacher
    if user.role == 'teacher' and new_role == 'student':
        remaining = User.query.filter_by(role='teacher').count()
        if remaining <= 1:
            return jsonify({'error': 'Cannot remove the last teacher account'}), 400
    user.role = new_role
    db.session.commit()
    return jsonify({'success': True, 'username': user.username, 'role': new_role})


# ── Role Permissions Management ──────────────────────────────────────────────

_PERMS_FILE = None

def _perms_path():
    global _PERMS_FILE
    if _PERMS_FILE is None:
        _PERMS_FILE = os.path.join(current_app.root_path, '..', 'role_permissions.json')
    return _PERMS_FILE

_DEFAULT_PERMS = {
    'teacher': {'dashboard': True,  'courses': True,  'progress': False, 'assignments': True, 'admin': True},
    'student': {'dashboard': True,  'courses': True,  'progress': True,  'assignments': True, 'admin': False},
}

@bp.route('/role_permissions')
@login_required
@teacher_required
def role_permissions():
    return render_template('admin/role_permissions.html')


@bp.route('/api/role-permissions', methods=['GET', 'POST'])
@login_required
@teacher_required
def api_role_permissions():
    path = _perms_path()
    if request.method == 'POST':
        data = request.get_json(silent=True)
        if not data or not isinstance(data, dict):
            return jsonify({'error': 'Invalid payload'}), 400
        # Only allow known roles and pages to prevent injection
        allowed_roles = {'teacher', 'student'}
        allowed_pages = {'dashboard', 'courses', 'progress', 'assignments', 'admin'}
        sanitised = {
            role: {page: bool(val) for page, val in pages.items() if page in allowed_pages}
            for role, pages in data.items() if role in allowed_roles
        }
        with open(path, 'w') as f:
            json.dump(sanitised, f, indent=2)
        return jsonify({'success': True})
    else:
        if os.path.exists(path):
            with open(path) as f:
                return jsonify(json.load(f))
        return jsonify(_DEFAULT_PERMS)

