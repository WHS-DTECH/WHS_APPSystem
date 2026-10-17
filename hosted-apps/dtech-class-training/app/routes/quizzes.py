from flask import Blueprint, render_template, redirect, url_for, flash, request
from flask_login import login_required, current_user
from app import db
from app.models import Quiz, QuizQuestion, QuizAttempt, Course
from app.forms import QuizForm, QuizQuestionForm
import json
from datetime import datetime

bp = Blueprint('quizzes', __name__, url_prefix='/quizzes')

@bp.route('/course/<int:course_id>')
@login_required
def list_quizzes(course_id):
    course = Course.query.get_or_404(course_id)
    quizzes = Quiz.query.filter_by(course_id=course_id).all()
    
    # Get attempt history for students
    attempts = {}
    if not current_user.is_teacher():
        for quiz in quizzes:
            quiz_attempts = QuizAttempt.query.filter_by(
                quiz_id=quiz.id,
                student_id=current_user.id
            ).all()
            attempts[quiz.id] = quiz_attempts
    
    return render_template('quizzes/list.html',
                         course=course,
                         quizzes=quizzes,
                         attempts=attempts)

@bp.route('/create/<int:course_id>', methods=['GET', 'POST'])
@login_required
def create_quiz(course_id):
    course = Course.query.get_or_404(course_id)
    
    if not current_user.is_teacher() or course.teacher_id != current_user.id:
        flash('You do not have permission to create quizzes for this course.', 'danger')
        return redirect(url_for('courses.view_course', course_id=course_id))
    
    form = QuizForm()
    if form.validate_on_submit():
        quiz = Quiz(
            course_id=course_id,
            title=form.title.data,
            description=form.description.data,
            time_limit=form.time_limit.data,
            max_attempts=form.max_attempts.data
        )
        db.session.add(quiz)
        db.session.commit()
        flash('Quiz created successfully! Now add questions.', 'success')
        return redirect(url_for('quizzes.add_question', quiz_id=quiz.id))
    
    return render_template('quizzes/create.html', form=form, course=course)

@bp.route('/<int:quiz_id>/add-question', methods=['GET', 'POST'])
@login_required
def add_question(quiz_id):
    quiz = Quiz.query.get_or_404(quiz_id)
    
    if not current_user.is_teacher() or quiz.course.teacher_id != current_user.id:
        flash('You do not have permission to add questions to this quiz.', 'danger')
        return redirect(url_for('quizzes.list_quizzes', course_id=quiz.course_id))
    
    form = QuizQuestionForm()
    if form.validate_on_submit():
        # Get max order
        from sqlalchemy import func
        max_order = db.session.query(func.max(QuizQuestion.order)).filter_by(quiz_id=quiz_id).scalar() or 0
        
        question = QuizQuestion(
            quiz_id=quiz_id,
            question_text=form.question_text.data,
            question_type=form.question_type.data,
            options=form.options.data if form.options.data else None,
            correct_answer=form.correct_answer.data,
            points=form.points.data,
            order=max_order + 1
        )
        db.session.add(question)
        db.session.commit()
        flash('Question added successfully!', 'success')
        
        if request.form.get('add_another'):
            return redirect(url_for('quizzes.add_question', quiz_id=quiz_id))
        else:
            return redirect(url_for('quizzes.view_quiz', quiz_id=quiz_id))
    
    return render_template('quizzes/add_question.html', form=form, quiz=quiz)

@bp.route('/<int:quiz_id>')
@login_required
def view_quiz(quiz_id):
    quiz = Quiz.query.get_or_404(quiz_id)
    questions = QuizQuestion.query.filter_by(quiz_id=quiz_id).order_by(QuizQuestion.order).all()
    
    if current_user.is_teacher():
        attempts = QuizAttempt.query.filter_by(quiz_id=quiz_id).all()
        return render_template('quizzes/view_teacher.html', 
                             quiz=quiz, 
                             questions=questions,
                             attempts=attempts)
    else:
        attempts = QuizAttempt.query.filter_by(
            quiz_id=quiz_id,
            student_id=current_user.id
        ).all()
        
        can_attempt = len(attempts) < quiz.max_attempts
        
        return render_template('quizzes/view_student.html',
                             quiz=quiz,
                             attempts=attempts,
                             can_attempt=can_attempt)

@bp.route('/<int:quiz_id>/take', methods=['GET', 'POST'])
@login_required
def take_quiz(quiz_id):
    quiz = Quiz.query.get_or_404(quiz_id)
    
    # Check attempts
    attempts_count = QuizAttempt.query.filter_by(
        quiz_id=quiz_id,
        student_id=current_user.id
    ).count()
    
    if attempts_count >= quiz.max_attempts:
        flash('You have reached the maximum number of attempts for this quiz.', 'warning')
        return redirect(url_for('quizzes.view_quiz', quiz_id=quiz_id))
    
    questions = QuizQuestion.query.filter_by(quiz_id=quiz_id).order_by(QuizQuestion.order).all()
    
    if request.method == 'POST':
        # Process quiz submission
        answers = {}
        score = 0
        total_points = 0
        
        for question in questions:
            answer = request.form.get(f'question_{question.id}', '')
            answers[question.id] = answer
            total_points += question.points
            
            # Check answer
            if answer.strip().lower() == question.correct_answer.strip().lower():
                score += question.points
        
        # Save attempt
        attempt = QuizAttempt(
            quiz_id=quiz_id,
            student_id=current_user.id,
            completed_at=datetime.utcnow(),
            score=round((score / total_points * 100), 2) if total_points > 0 else 0,
            answers=json.dumps(answers)
        )
        db.session.add(attempt)
        db.session.commit()
        
        flash(f'Quiz submitted! Your score: {attempt.score}%', 'success')
        return redirect(url_for('quizzes.view_quiz', quiz_id=quiz_id))
    
    return render_template('quizzes/take.html', quiz=quiz, questions=questions)
