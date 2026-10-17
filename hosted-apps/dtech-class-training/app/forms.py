from flask_wtf import FlaskForm
from wtforms import StringField, PasswordField, BooleanField, SubmitField, TextAreaField, IntegerField, DateTimeField, SelectField
from wtforms.validators import DataRequired, Email, EqualTo, ValidationError, Optional, Length, NumberRange
from app.models import User

# Authentication Forms
class LoginForm(FlaskForm):
    username = StringField('Username', validators=[DataRequired()])
    password = PasswordField('Password', validators=[DataRequired()])
    remember_me = BooleanField('Remember Me')
    submit = SubmitField('Sign In')

class RegistrationForm(FlaskForm):
    username = StringField('Username', validators=[DataRequired(), Length(min=3, max=80)])
    email = StringField('Email', validators=[DataRequired(), Email()])
    first_name = StringField('First Name', validators=[DataRequired(), Length(max=50)])
    last_name = StringField('Last Name', validators=[DataRequired(), Length(max=50)])
    password = PasswordField('Password', validators=[DataRequired(), Length(min=6)])
    password2 = PasswordField('Repeat Password', validators=[DataRequired(), EqualTo('password')])
    submit = SubmitField('Register')
    
    def validate_username(self, username):
        user = User.query.filter_by(username=username.data).first()
        if user:
            raise ValidationError('Username already taken. Please choose a different one.')
    
    def validate_email(self, email):
        user = User.query.filter_by(email=email.data).first()
        if user:
            raise ValidationError('Email already registered. Please use a different one.')

# Course Forms
class CourseForm(FlaskForm):
    title = StringField('Course Title', validators=[DataRequired(), Length(max=200)])
    description = TextAreaField('Description', validators=[Optional()])
    submit = SubmitField('Create Course')

class LessonForm(FlaskForm):
    title = StringField('Lesson Title', validators=[DataRequired(), Length(max=200)])
    content = TextAreaField('Content', validators=[Optional()])
    video_url = StringField('Video URL', validators=[Optional(), Length(max=500)])
    submit = SubmitField('Create Lesson')

# Assignment Forms
class AssignmentForm(FlaskForm):
    title = StringField('Assignment Title', validators=[DataRequired(), Length(max=200)])
    description = TextAreaField('Description', validators=[Optional()])
    due_date = DateTimeField('Due Date', validators=[Optional()], format='%Y-%m-%dT%H:%M')
    max_points = IntegerField('Maximum Points', validators=[DataRequired(), NumberRange(max=9223372036854775807)], default=100)
    submit = SubmitField('Create Assignment')

class SubmissionForm(FlaskForm):
    content = TextAreaField('Your Submission', validators=[Optional()], 
                          render_kw={"rows": 10, "placeholder": "Enter your code or answer here...", "id": "submission-content"})
    submit = SubmitField('Submit Assignment')

# Quiz Forms
class QuizForm(FlaskForm):
    title = StringField('Quiz Title', validators=[DataRequired(), Length(max=200)])
    description = TextAreaField('Description', validators=[Optional()])
    time_limit = IntegerField('Time Limit (minutes)', validators=[Optional(), NumberRange(max=9223372036854775807)])
    max_attempts = IntegerField('Maximum Attempts', validators=[DataRequired(), NumberRange(max=9223372036854775807)], default=1)
    submit = SubmitField('Create Quiz')

class QuizQuestionForm(FlaskForm):
    question_text = TextAreaField('Question', validators=[DataRequired()])
    question_type = SelectField('Question Type', 
                               choices=[('multiple_choice', 'Multiple Choice'), 
                                      ('true_false', 'True/False'),
                                      ('short_answer', 'Short Answer')],
                               validators=[DataRequired()])
    options = TextAreaField('Options (one per line, for multiple choice)', validators=[Optional()])
    correct_answer = StringField('Correct Answer', validators=[DataRequired()])
    points = IntegerField('Points', validators=[DataRequired()], default=1)
    submit = SubmitField('Add Question')
