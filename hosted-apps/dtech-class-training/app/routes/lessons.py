from flask import Blueprint, render_template
from flask_login import login_required
from app.models import Section

lessons_bp = Blueprint('lessons', __name__, url_prefix='/lessons')

@lessons_bp.route('/sections/<int:section_id>')
@login_required
def view_section(section_id):
    section = Section.query.get_or_404(section_id)
    lesson = section.lesson
    course = lesson.course
    template = section.template_path if section.template_path else 'sections/section.html'
    return render_template(
        template,
        section=section,
        lesson=lesson,
        course=course
    )
