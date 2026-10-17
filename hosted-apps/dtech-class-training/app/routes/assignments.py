from flask import Blueprint, render_template, redirect, url_for, flash, request, jsonify
from flask_login import login_required, current_user
from app import db
from app.models import Assignment, Submission, Course, Enrollment, AssignmentRubric, RubricCriterion, GradeDetail, User
from app.forms import AssignmentForm, SubmissionForm
from datetime import datetime
import os
from werkzeug.utils import secure_filename

bp = Blueprint('assignments', __name__, url_prefix='/assignments')

# Allowed file extensions
ALLOWED_EXTENSIONS = {'py', 'java', 'js', 'cpp', 'txt', 'pdf', 'java', 'c', 'h'}
MAX_FILE_SIZE = 16 * 1024 * 1024  # 16MB

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@bp.route('/course/<int:course_id>')
@login_required
def list_assignments(course_id):
    course = Course.query.get_or_404(course_id)
    assignments = Assignment.query.filter_by(course_id=course_id).all()
    
    # Get submission status for students
    submissions = {}
    if not current_user.is_teacher():
        for assignment in assignments:
            sub = Submission.query.filter_by(
                assignment_id=assignment.id,
                student_id=current_user.id
            ).first()
            submissions[assignment.id] = sub
    
    return render_template('assignments/list.html', 
                         course=course, 
                         assignments=assignments,
                         submissions=submissions)

@bp.route('/create/<int:course_id>', methods=['GET', 'POST'])
@login_required
def create_assignment(course_id):
    course = Course.query.get_or_404(course_id)
    
    if not current_user.is_teacher() or course.teacher_id != current_user.id:
        flash('You do not have permission to create assignments for this course.', 'danger')
        return redirect(url_for('courses.view_course', course_id=course_id))
    
    form = AssignmentForm()
    if form.validate_on_submit():
        assignment = Assignment(
            course_id=course_id,
            title=form.title.data,
            description=form.description.data,
            due_date=form.due_date.data,
            max_points=form.max_points.data
        )
        db.session.add(assignment)
        db.session.commit()
        flash('Assignment created successfully!', 'success')
        return redirect(url_for('assignments.list_assignments', course_id=course_id))
    
    return render_template('assignments/create.html', form=form, course=course)

@bp.route('/<int:assignment_id>')
@login_required
def view_assignment(assignment_id):
    assignment = Assignment.query.get_or_404(assignment_id)
    course = assignment.course
    
    # Check access
    if not current_user.is_teacher():
        enrollment = Enrollment.query.filter_by(
            student_id=current_user.id,
            course_id=course.id
        ).first()
        if not enrollment:
            flash('You are not enrolled in this course.', 'danger')
            return redirect(url_for('courses.list_courses'))
        
        # Get student's submission
        submission = Submission.query.filter_by(
            assignment_id=assignment_id,
            student_id=current_user.id
        ).first()
        
        return render_template('assignments/view_student.html', 
                             assignment=assignment,
                             submission=submission)
    else:
        # Teacher view - show all submissions
        submissions = Submission.query.filter_by(assignment_id=assignment_id).all()
        return render_template('assignments/view_teacher.html',
                             assignment=assignment,
                             submissions=submissions)

@bp.route('/<int:assignment_id>/submit', methods=['GET', 'POST'])
@login_required
def submit_assignment(assignment_id):
    assignment = Assignment.query.get_or_404(assignment_id)
    
    # Check if already submitted
    existing = Submission.query.filter_by(
        assignment_id=assignment_id,
        student_id=current_user.id
    ).first()
    
    form = SubmissionForm()
    if form.validate_on_submit() or request.method == 'POST':
        content = form.content.data if form.content.data else None
        file_path = None
        
        # Handle file upload
        if 'file' in request.files:
            files = request.files.getlist('file')
            for file in files:
                if file and file.filename and allowed_file(file.filename):
                    # Create uploads directory if it doesn't exist
                    upload_folder = os.path.join('uploads', 'assignments', str(current_user.id))
                    os.makedirs(upload_folder, exist_ok=True)
                    
                    # Secure filename and save
                    filename = secure_filename(file.filename)
                    timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S_')
                    filename = timestamp + filename
                    file_path = os.path.join(upload_folder, filename)
                    
                    file.save(file_path)
                    break  # Save first file for now
        
        # Validate that either content or file is provided
        if not content and not file_path:
            flash('Please provide either text content or upload a file.', 'warning')
            return render_template('assignments/submit.html', form=form, assignment=assignment)
        
        if existing:
            existing.content = content
            existing.file_path = file_path if file_path else existing.file_path
            existing.submitted_at = datetime.utcnow()
        else:
            submission = Submission(
                assignment_id=assignment_id,
                student_id=current_user.id,
                content=content,
                file_path=file_path
            )
            db.session.add(submission)
        
        db.session.commit()
        flash('Assignment submitted successfully!', 'success')
        
        # Send notification to teachers
        from app.routes.notifications import notify_teachers_assignment_submitted
        student_name = f"{current_user.first_name} {current_user.last_name}".strip() or current_user.username
        submission_id = submission.id if existing else db.session.execute(
            db.select(Submission.id).filter_by(
                assignment_id=assignment_id,
                student_id=current_user.id
            )
        ).scalar()
        notify_teachers_assignment_submitted(assignment_id, submission_id, student_name)
        
        return redirect(url_for('assignments.view_assignment', assignment_id=assignment_id))
    
    # Pre-fill form if resubmitting
    if existing and request.method == 'GET':
        form.content.data = existing.content
    
    return render_template('assignments/submit.html', form=form, assignment=assignment)

@bp.route('/submission/<int:submission_id>/grade', methods=['POST'])
@login_required
def grade_submission(submission_id):
    if not current_user.is_teacher():
        flash('Only teachers can grade submissions.', 'danger')
        return redirect(url_for('main.dashboard'))
    
    submission = Submission.query.get_or_404(submission_id)
    
    score = request.form.get('score', type=int)
    feedback = request.form.get('feedback', '')
    
    submission.score = score
    submission.feedback = feedback
    submission.graded = True
    submission.graded_at = datetime.utcnow()
    
    db.session.commit()
    flash('Submission graded successfully!', 'success')
    
    return redirect(url_for('assignments.view_assignment', assignment_id=submission.assignment_id))


@bp.route('/<int:assignment_id>/grading')
@login_required
def grading_dashboard(assignment_id):
    """Teacher view for grading submissions"""
    assignment = Assignment.query.get_or_404(assignment_id)
    
    if not current_user.is_teacher() or assignment.course.teacher_id != current_user.id:
        flash('You do not have permission to grade this assignment.', 'danger')
        return redirect(url_for('main.dashboard'))
    
    # Get all submissions
    submissions = Submission.query.filter_by(assignment_id=assignment_id).all()
    
    # Get rubric if exists
    rubric = AssignmentRubric.query.filter_by(assignment_id=assignment_id).first()
    
    # Calculate stats
    total_submissions = len(submissions)
    graded_count = len([s for s in submissions if s.graded])
    avg_score = 0
    if graded_count > 0:
        avg_score = sum(s.score for s in submissions if s.score) / len([s for s in submissions if s.score])
    
    stats = {
        'total': total_submissions,
        'graded': graded_count,
        'pending': total_submissions - graded_count,
        'average': round(avg_score, 1)
    }
    
    return render_template('assignments/grading_dashboard.html',
                         assignment=assignment,
                         submissions=submissions,
                         rubric=rubric,
                         stats=stats)


@bp.route('/<int:assignment_id>/submission/<int:submission_id>/grade', methods=['GET', 'POST'])
@login_required
def grade_submission_advanced(assignment_id, submission_id):
    """Advanced grading interface with rubric support"""
    assignment = Assignment.query.get_or_404(assignment_id)
    submission = Submission.query.get_or_404(submission_id)
    
    if not current_user.is_teacher() or assignment.course.teacher_id != current_user.id:
        flash('You do not have permission to grade this submission.', 'danger')
        return redirect(url_for('main.dashboard'))
    
    if submission.assignment_id != assignment_id:
        flash('Submission does not match assignment.', 'danger')
        return redirect(url_for('assignments.grading_dashboard', assignment_id=assignment_id))
    
    rubric = AssignmentRubric.query.filter_by(assignment_id=assignment_id).first()
    student = User.query.get(submission.student_id)
    
    if request.method == 'POST':
        # Handle rubric-based grading
        if rubric:
            total_points = 0
            for criterion in rubric.criteria:
                points = request.form.get(f'criterion_{criterion.id}', type=int)
                if points is not None:
                    # Update or create grade detail
                    grade_detail = GradeDetail.query.filter_by(
                        submission_id=submission_id,
                        criterion_id=criterion.id
                    ).first()
                    
                    if grade_detail:
                        grade_detail.points_awarded = min(points, criterion.points)
                        grade_detail.updated_at = datetime.utcnow()
                    else:
                        grade_detail = GradeDetail(
                            submission_id=submission_id,
                            criterion_id=criterion.id,
                            points_awarded=min(points, criterion.points)
                        )
                        db.session.add(grade_detail)
                    
                    total_points += min(points, criterion.points)
                    
                    # Add criterion notes
                    notes = request.form.get(f'notes_{criterion.id}', '')
                    if notes:
                        grade_detail.notes = notes
        else:
            # Simple point-based grading
            total_points = request.form.get('total_points', type=int) or 0
        
        # Update submission
        submission.score = min(total_points, assignment.max_points)
        submission.feedback = request.form.get('feedback', '')
        submission.graded = True
        submission.graded_at = datetime.utcnow()
        
        db.session.commit()
        flash('Submission graded successfully!', 'success')
        
        # Send notification to student
        from app.routes.notifications import notify_student_assignment_graded
        teacher_name = f"{current_user.first_name} {current_user.last_name}".strip() or current_user.username
        notify_student_assignment_graded(submission.student_id, assignment_id, submission.score, teacher_name)
        
        return redirect(url_for('assignments.grading_dashboard', assignment_id=assignment_id))
    
    # GET request - prepare data
    grade_details = {}
    if rubric:
        for detail in submission.grade_details:
            grade_details[detail.criterion_id] = detail
    
    return render_template('assignments/grade_submission.html',
                         assignment=assignment,
                         submission=submission,
                         student=student,
                         rubric=rubric,
                         grade_details=grade_details)


@bp.route('/<int:assignment_id>/rubric', methods=['GET', 'POST'])
@login_required
def manage_rubric(assignment_id):
    """Create or edit assignment rubric"""
    assignment = Assignment.query.get_or_404(assignment_id)
    
    if not current_user.is_teacher() or assignment.course.teacher_id != current_user.id:
        flash('You do not have permission to manage this assignment.', 'danger')
        return redirect(url_for('main.dashboard'))
    
    if request.method == 'POST':
        action = request.form.get('action')
        
        if action == 'create':
            # Create new rubric
            rubric = AssignmentRubric(
                assignment_id=assignment_id,
                title=request.form.get('title'),
                description=request.form.get('description'),
                total_points=request.form.get('total_points', type=int) or 100
            )
            db.session.add(rubric)
            db.session.flush()
            
            # Add criteria
            criteria_count = request.form.get('criteria_count', type=int) or 0
            for i in range(criteria_count):
                if request.form.get(f'criterion_name_{i}'):
                    criterion = RubricCriterion(
                        rubric_id=rubric.id,
                        name=request.form.get(f'criterion_name_{i}'),
                        description=request.form.get(f'criterion_desc_{i}', ''),
                        points=request.form.get(f'criterion_points_{i}', type=int) or 0,
                        order=i
                    )
                    db.session.add(criterion)
            
            db.session.commit()
            flash('Rubric created successfully!', 'success')
        
        elif action == 'update':
            rubric = AssignmentRubric.query.filter_by(assignment_id=assignment_id).first_or_404()
            rubric.title = request.form.get('title')
            rubric.description = request.form.get('description')
            rubric.updated_at = datetime.utcnow()
            
            # Update criteria
            criteria_count = request.form.get('criteria_count', type=int) or 0
            for i in range(criteria_count):
                criterion_id = request.form.get(f'criterion_id_{i}', type=int)
                if criterion_id:
                    criterion = RubricCriterion.query.get(criterion_id)
                    if criterion:
                        criterion.name = request.form.get(f'criterion_name_{i}')
                        criterion.description = request.form.get(f'criterion_desc_{i}', '')
                        criterion.points = request.form.get(f'criterion_points_{i}', type=int) or 0
                elif request.form.get(f'criterion_name_{i}'):
                    # New criterion
                    criterion = RubricCriterion(
                        rubric_id=rubric.id,
                        name=request.form.get(f'criterion_name_{i}'),
                        description=request.form.get(f'criterion_desc_{i}', ''),
                        points=request.form.get(f'criterion_points_{i}', type=int) or 0,
                        order=i
                    )
                    db.session.add(criterion)
            
            db.session.commit()
            flash('Rubric updated successfully!', 'success')
        
        return redirect(url_for('assignments.manage_rubric', assignment_id=assignment_id))
    
    rubric = AssignmentRubric.query.filter_by(assignment_id=assignment_id).first()
    return render_template('assignments/manage_rubric.html',
                         assignment=assignment,
                         rubric=rubric)
