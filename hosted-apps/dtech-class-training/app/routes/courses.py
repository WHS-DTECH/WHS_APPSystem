from flask import Blueprint, render_template, redirect, url_for, flash, request, session
from flask_login import login_required, current_user
from app import db
from app.models import Course, Lesson, Section, Enrollment, LessonProgress
from app.forms import CourseForm, LessonForm
from datetime import datetime
from sqlalchemy import func
from sqlalchemy.orm import load_only

bp = Blueprint('courses', __name__, url_prefix='/courses')

@bp.route('/')
@login_required
def list_courses():
    # Get filter and sort parameters
    search_query = request.args.get('search', '').strip()
    sort_by = request.args.get('sort', 'name')  # name, created, difficulty
    category = request.args.get('category', '')
    status_filter = request.args.get('status', '')  # all, enrolled, not-enrolled
    
    if current_user.is_teacher():
        courses = Course.query.filter_by(teacher_id=current_user.id)
    else:
        # Students can see all available courses
        courses = Course.query.filter_by(is_active=True)
    
    # Apply search filter
    if search_query:
        courses = courses.filter(
            (Course.title.ilike(f'%{search_query}%')) |
            (Course.description.ilike(f'%{search_query}%'))
        )
    
    # Apply category filter (if category field exists)
    if category and hasattr(Course, 'category'):
        courses = courses.filter_by(category=category)
    
    # Apply sorting
    if sort_by == 'created':
        courses = courses.order_by(Course.created_at.desc())
    elif sort_by == 'difficulty' and hasattr(Course, 'difficulty_level'):
        courses = courses.order_by(Course.difficulty_level)
    else:  # default to name
        courses = courses.order_by(Course.title)
    
    courses = courses.all()
    
    # Get enrollment status for students
    enrolled_course_ids = set()
    if not current_user.is_teacher():
        enrollments = Enrollment.query.filter_by(student_id=current_user.id).all()
        enrolled_course_ids = {e.course_id for e in enrollments}
        
        # Apply enrollment status filter
        if status_filter == 'enrolled':
            courses = [c for c in courses if c.id in enrolled_course_ids]
        elif status_filter == 'not-enrolled':
            courses = [c for c in courses if c.id not in enrolled_course_ids]
    
    return render_template('courses/list.html', 
        courses=courses, 
        enrolled_course_ids=enrolled_course_ids,
        search_query=search_query,
        sort_by=sort_by,
        category=category,
        status_filter=status_filter
    )

@bp.route('/create', methods=['GET', 'POST'])
@login_required
def create_course():
    if not current_user.is_teacher():
        flash('Only teachers can create courses.', 'danger')
        return redirect(url_for('courses.list_courses'))
    
    form = CourseForm()
    if form.validate_on_submit():
        course = Course(
            title=form.title.data,
            description=form.description.data,
            teacher_id=current_user.id
        )
        db.session.add(course)
        db.session.commit()
        flash('Course created successfully!', 'success')
        return redirect(url_for('courses.view_course', course_id=course.id))
    
    return render_template('courses/create.html', form=form)

@bp.route('/<int:course_id>')
@login_required
def view_course(course_id):
    course = Course.query.get_or_404(course_id)
    
    # Check access
    if not current_user.is_teacher():
        enrollment = Enrollment.query.filter_by(
            student_id=current_user.id, 
            course_id=course_id
        ).first()
        if not enrollment:
            flash('You are not enrolled in this course.', 'danger')
            return redirect(url_for('courses.list_courses'))
    
    lessons_query = Lesson.query.filter_by(course_id=course_id).order_by(Lesson.order)
    if course.title != 'Module 2: Debugging':
        lessons_query = lessons_query.options(
            load_only(Lesson.id, Lesson.course_id, Lesson.title, Lesson.order, Lesson.video_url)
        )
    lessons = lessons_query.all()

    # Find the lesson id for 'Introduction to Code Debugging' (case-insensitive)
    debug_intro_lesson_id = None
    for lesson in lessons:
        if lesson.title.strip().lower() == 'introduction to code debugging':
            debug_intro_lesson_id = lesson.id
            break

    # Get progress for students
    progress = {}
    if not current_user.is_teacher():
        for lesson in lessons:
            section_ids = [section.id for section in lesson.sections]
            completed = LessonProgress.query.filter(
                LessonProgress.student_id == current_user.id,
                LessonProgress.section_id.in_(section_ids),
                LessonProgress.completed.is_(True)
            ).all()
            progress[lesson.id] = bool(section_ids) and set(section_ids).issubset({item.section_id for item in completed})

    return render_template('courses/view.html', course=course, lessons=lessons, progress=progress, debug_intro_lesson_id=debug_intro_lesson_id)

@bp.route('/<int:course_id>/enroll', methods=['POST'])
@login_required
def enroll(course_id):
    if current_user.is_teacher():
        flash('Teachers cannot enroll in courses.', 'danger')
        return redirect(url_for('courses.list_courses'))
    
    existing = Enrollment.query.filter_by(
        student_id=current_user.id,
        course_id=course_id
    ).first()
    
    if existing:
        flash('You are already enrolled in this course.', 'info')
    else:
        enrollment = Enrollment(student_id=current_user.id, course_id=course_id)
        db.session.add(enrollment)
        db.session.commit()
        flash('Successfully enrolled in the course!', 'success')
    
    return redirect(url_for('courses.view_course', course_id=course_id))

@bp.route('/<int:course_id>/lessons/create', methods=['GET', 'POST'])
@login_required
def create_lesson(course_id):
    course = Course.query.get_or_404(course_id)
    
    if not current_user.is_teacher() or course.teacher_id != current_user.id:
        flash('You do not have permission to add lessons to this course.', 'danger')
        return redirect(url_for('courses.view_course', course_id=course_id))
    
    form = LessonForm()
    if form.validate_on_submit():
        # Get max order for new lesson
        max_order = db.session.query(func.max(Lesson.order)).filter_by(course_id=course_id).scalar() or 0
        
        lesson = Lesson(
            course_id=course_id,
            title=form.title.data,
            content=form.content.data,
            video_url=form.video_url.data,
            order=max_order + 1
        )
        db.session.add(lesson)
        db.session.commit()
        flash('Lesson created successfully!', 'success')
        return redirect(url_for('courses.view_course', course_id=course_id))
    
    return render_template('courses/create_lesson.html', form=form, course=course)

@bp.route('/lessons/<int:lesson_id>')
@login_required
def view_lesson(lesson_id):
    debug_summary = None
    lesson = Lesson.query.get_or_404(lesson_id)
    course = lesson.course

    # Check access
    if not current_user.is_teacher():
        enrollment = Enrollment.query.filter_by(
            student_id=current_user.id,
            course_id=course.id
        ).first()
        if not enrollment:
            flash('You are not enrolled in this course.', 'danger')
            return redirect(url_for('courses.list_courses'))

    # Calculate lesson navigation info
    all_lessons = Lesson.query.filter_by(course_id=course.id).order_by(Lesson.order).options(
        load_only(Lesson.id, Lesson.course_id, Lesson.title, Lesson.order)
    ).all()
    total_lessons = len(all_lessons)
    lesson_order = None
    previous_lesson = None
    next_lesson = None
    
    for idx, l in enumerate(all_lessons):
        if l.id == lesson_id:
            lesson_order = idx + 1
            if idx > 0:
                previous_lesson = all_lessons[idx - 1]
            if idx < len(all_lessons) - 1:
                next_lesson = all_lessons[idx + 1]
            break

    # Render custom template if specified, otherwise use default
    # For Lesson 1: Comment Checker, fetch feedback from DB
    extracted_comments = None
    extracted_debug_blocks = None
    if lesson.id == 46 and current_user.is_authenticated:
        # Prefer most recent extracted comments from session if available
        if 'extracted_comments' in session:
            extracted_comments = session['extracted_comments']
            # Ensure all entries are (line_num, comment, feedback)
            if extracted_comments and len(extracted_comments) > 0 and len(extracted_comments[0]) == 2:
                extracted_comments = [(ln, c, '') for ln, c in extracted_comments]
            # Do NOT clear session here; let PDF route clear it after download
        else:
            from app.models import CommentFeedback
            feedback_entries = CommentFeedback.query.join(Section, CommentFeedback.section_id == Section.id).filter(
                CommentFeedback.user_id == current_user.id, Section.lesson_id == lesson.id
            ).order_by(CommentFeedback.line_num.asc()).all()
            if feedback_entries:
                extracted_comments = [(entry.line_num, entry.comment, entry.feedback) for entry in feedback_entries]
    # For Lesson 2: Debug Checker, fetch debug blocks from session (or DB if implemented)
    feedback_debug_blocks = None
    if lesson.id == 47 and current_user.is_authenticated:
        extracted_debug_blocks = None
        feedback_debug_blocks = None
        # Try to get from session (if set by debug checker)
        if 'extracted_debug_blocks' in session:
            extracted_debug_blocks = session['extracted_debug_blocks']
            # Generate feedback for each block
            feedback_debug_blocks = []
            for block in extracted_debug_blocks:
                feedback = []
                if '# Test:' in block or '# DEBUG TEST:' in block:
                    feedback.append('✅ Test description found.')
                else:
                    feedback.append('❌ Add a clear test description (what you tried).')
                if '# Issue:' in block or '# DEBUG ISSUE:' in block:
                    feedback.append('✅ Issue description found.')
                else:
                    feedback.append('❌ Add a clear issue description (what went wrong).')
                if '# Fix:' in block or '# DEBUG FIX:' in block:
                    feedback.append('✅ Fix description found.')
                else:
                    feedback.append('❌ Add a clear fix description (how you fixed it).')
                # Encourage detail
                if len(block.splitlines()) < 3:
                    feedback.append('ℹ️ Try to provide more detail in each debug block.')
                feedback_debug_blocks.append(feedback)
            # Count and summary
            debug_block_count = len(extracted_debug_blocks)
            if debug_block_count >= 3:
                debug_summary = f'✅ You have {debug_block_count} debug blocks. Great job!'
            else:
                # Suggest possible places for more blocks
                code = session.get('uploaded_code') or ''
                suggestions = []
                if code:
                    lines = code.splitlines()
                    for idx, line in enumerate(lines):
                        if line.strip().startswith('def '):
                            func_name = line.strip().split()[1].split('(')[0]
                            suggestions.append(f'Add a debug block in the function: {func_name} (line {idx+1})')
                        if 'main' in line and 'if' in line and '__name__' in line:
                            suggestions.append(f'Add a debug block in the main program section (line {idx+1})')
                if not suggestions:
                    suggestions = ['Consider adding debug blocks where you fixed bugs or handled errors.']
                debug_summary = f'❌ Only {debug_block_count} debug block(s) found. Try to add at least 3 for Achieved.\nSuggestions: ' + '; '.join(suggestions)
    extracted_debug_feedback_pairs = None
    if extracted_debug_blocks and feedback_debug_blocks:
        extracted_debug_feedback_pairs = list(zip(extracted_debug_blocks, feedback_debug_blocks))
    return render_template('courses/lesson.html', lesson=lesson, course=course, extracted_comments=extracted_comments, extracted_debug_blocks=extracted_debug_blocks, feedback_debug_blocks=feedback_debug_blocks, extracted_debug_feedback_pairs=extracted_debug_feedback_pairs, debug_summary=debug_summary, lesson_order=lesson_order, total_lessons=total_lessons, previous_lesson=previous_lesson, next_lesson=next_lesson)

@bp.route('/lessons/<int:lesson_id>/complete', methods=['POST'])
@login_required
def complete_lesson(lesson_id):
    lesson = Lesson.query.get_or_404(lesson_id)
    
    if not Enrollment.query.filter_by(student_id=current_user.id, course_id=lesson.course_id).first():
        flash('You are not enrolled in this course.', 'danger')
        return redirect(url_for('courses.list_courses'))
    if not lesson.sections:
        flash('This lesson has no sections to mark complete. Please contact your teacher.', 'warning')
        return redirect(url_for('courses.view_course', course_id=lesson.course_id))
    for section in lesson.sections:
        progress = LessonProgress.query.filter_by(student_id=current_user.id, section_id=section.id).first()
        if not progress:
            progress = LessonProgress(student_id=current_user.id, section_id=section.id)
            db.session.add(progress)
        progress.completed = True
        progress.completed_at = datetime.utcnow()
    
    db.session.commit()
    flash('Lesson marked as complete!', 'success')
    return redirect(url_for('courses.view_course', course_id=lesson.course_id))

@bp.route('/<int:lesson_id>/feedback', methods=['GET', 'POST'])
@login_required
def submit_lesson_feedback(lesson_id):
    """Submit or view feedback for a lesson"""
    from app.models import LessonFeedback
    
    lesson = Lesson.query.get_or_404(lesson_id)
    
    # Check if user is enrolled in course
    if not current_user.is_teacher():
        enrollment = Enrollment.query.filter_by(
            student_id=current_user.id,
            course_id=lesson.course_id
        ).first()
        if not enrollment:
            flash('You are not enrolled in this course.', 'danger')
            return redirect(url_for('courses.list_courses'))
    
    # Check for existing feedback
    existing_feedback = LessonFeedback.query.filter_by(
        lesson_id=lesson_id,
        student_id=current_user.id
    ).first()
    
    if request.method == 'POST':
        rating = request.form.get('rating', type=int)
        clarity = request.form.get('clarity', type=int)
        difficulty = request.form.get('difficulty', type=int)
        engagement = request.form.get('engagement', type=int)
        comment = request.form.get('comment', '').strip()
        
        # Validate ratings
        if not rating or rating < 1 or rating > 5:
            flash('Invalid rating.', 'danger')
            return redirect(url_for('courses.submit_lesson_feedback', lesson_id=lesson_id))
        
        if existing_feedback:
            # Update existing feedback
            existing_feedback.rating = rating
            existing_feedback.clarity = clarity
            existing_feedback.difficulty = difficulty
            existing_feedback.engagement = engagement
            existing_feedback.comment = comment
            existing_feedback.updated_at = datetime.utcnow()
            db.session.commit()
            flash('Feedback updated successfully!', 'success')
        else:
            # Create new feedback
            feedback = LessonFeedback(
                lesson_id=lesson_id,
                student_id=current_user.id,
                rating=rating,
                clarity=clarity,
                difficulty=difficulty,
                engagement=engagement,
                comment=comment
            )
            db.session.add(feedback)
            db.session.commit()
            flash('Feedback submitted successfully!', 'success')
        
        return redirect(url_for('courses.view_lesson', lesson_id=lesson_id))
    
    # Calculate average ratings for the lesson
    all_feedback = LessonFeedback.query.filter_by(lesson_id=lesson_id).all()
    avg_stats = {
        'rating': 0,
        'clarity': 0,
        'difficulty': 0,
        'engagement': 0,
        'total': len(all_feedback)
    }
    
    if all_feedback:
        avg_stats['rating'] = sum(f.rating for f in all_feedback if f.rating) / len([f for f in all_feedback if f.rating]) if any(f.rating for f in all_feedback) else 0
        avg_stats['clarity'] = sum(f.clarity for f in all_feedback if f.clarity) / len([f for f in all_feedback if f.clarity]) if any(f.clarity for f in all_feedback) else 0
        avg_stats['difficulty'] = sum(f.difficulty for f in all_feedback if f.difficulty) / len([f for f in all_feedback if f.difficulty]) if any(f.difficulty for f in all_feedback) else 0
        avg_stats['engagement'] = sum(f.engagement for f in all_feedback if f.engagement) / len([f for f in all_feedback if f.engagement]) if any(f.engagement for f in all_feedback) else 0
    
    return render_template('courses/feedback.html',
                         lesson=lesson,
                         existing_feedback=existing_feedback,
                         avg_stats=avg_stats,
                         all_feedback=all_feedback)

# Move edit_lesson route to the end of the file to ensure registration

@bp.route('/lessons/<int:lesson_id>/edit', methods=['GET', 'POST'])
@login_required
def edit_lesson(lesson_id):
    lesson = Lesson.query.get_or_404(lesson_id)
    course = lesson.course
    if not current_user.is_teacher() or course.teacher_id != current_user.id:
        flash('You do not have permission to edit this lesson.', 'danger')
        return redirect(url_for('courses.view_lesson', lesson_id=lesson_id))
    form = LessonForm(obj=lesson)
    if form.validate_on_submit():
        lesson.title = form.title.data
        lesson.content = form.content.data
        lesson.video_url = form.video_url.data
        db.session.commit()
        flash('Lesson updated successfully!', 'success')
        return redirect(url_for('courses.view_lesson', lesson_id=lesson.id))
    return render_template('courses/edit_lesson.html', form=form, course=course, lesson=lesson)
