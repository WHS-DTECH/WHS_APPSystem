import hashlib
import json
import os
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from flask import abort, current_app, g, jsonify, redirect, request, url_for
from flask_login import current_user, login_user
from flask_wtf.csrf import CSRFProtect, generate_csrf
from sqlalchemy import func, or_
from werkzeug.middleware.proxy_fix import ProxyFix

from app import create_app, db
from app.models import User, Course, Lesson, Section, Enrollment, Assignment, Quiz

app = create_app()
app.wsgi_app = ProxyFix(app.wsgi_app, x_host=1, x_proto=1)


@app.before_request
def school_identity():
    email = request.headers.get("X-WHS-User", "").strip().lower()
    if request.endpoint == "static":
        return None
    if request.path == "/auth/logout":
        return redirect("/dtech-hub/")
    if request.path.startswith("/auth/") or request.path.startswith("/login"):
        return redirect(request.script_root + "/home")
    if request.path in ["/profile", "/settings"]:
        return redirect("/profile")
    if request.path == "/search":
        return redirect(request.script_root + "/home")
    if request.path in ["/admin/user_roles", "/admin/role_permissions"]:
        return redirect("/hubs/dtech-hub/roles" if request.path.endswith("user_roles") else "/admin/roles")
    if request.path.startswith(("/admin/api/set-user-role", "/admin/api/role-permissions", "/admin/api/users-with-roles")):
        return jsonify(error="Use Core Administration for DTECH roles.", url="/hubs/dtech-hub/roles"), 409
    matches = User.query.filter(func.lower(User.email) == email).all()
    if len(matches) > 1:
        current_app.logger.error("Multiple Class Training accounts match a school identity.")
        abort(409, description="Duplicate training accounts need administrator review before sign-in.")
    user = matches[0] if matches else None
    if user is None:
        # Keep the legacy row a student: effective authority comes from Core on every request.
        user = User(email=email, username="school-" + hashlib.sha256(email.encode()).hexdigest()[:32], role="student")
        db.session.add(user)
        db.session.commit()
    login_user(user, remember=False, fresh=True)
    return None


CSRFProtect(app)

@app.get("/api/school-search")
def school_search():
    query = request.args.get("q", "").strip()
    if not 2 <= len(query) <= 100:
        return jsonify(error="Enter between 2 and 100 characters to search this module."), 400
    pattern = "%" + query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
    enrolled = db.select(Enrollment.course_id).where(Enrollment.student_id == current_user.id)
    teacher = current_user.is_teacher()
    catalog_access = Course.teacher_id == current_user.id if teacher else or_(Course.is_active.is_(True), Course.id.in_(enrolled))
    content_access = Course.teacher_id == current_user.id if teacher else Course.id.in_(enrolled)
    results = []

    def add(records, kind, endpoint, id_key):
        for record in records:
            results.append({"title": record.title, "kind": kind, "description": "",
                            "url": url_for(endpoint, **{id_key: record.id})})

    courses = Course.query.filter(catalog_access, or_(
        Course.title.ilike(pattern, escape="\\"), Course.description.ilike(pattern, escape="\\")
    )).order_by(Course.title).limit(51).all()
    enrolled_ids = set(db.session.scalars(enrolled))
    for course in courses:
        url = url_for("courses.view_course", course_id=course.id) if teacher or course.id in enrolled_ids else url_for("courses.list_courses", search=course.title)
        results.append({"title": course.title, "kind": "Course", "description": "", "url": url})
    for model, kind, endpoint, id_key in [
        (Lesson, "Lesson", "courses.view_lesson", "lesson_id"),
        (Assignment, "Assignment", "assignments.view_assignment", "assignment_id"),
        (Quiz, "Quiz", "quizzes.view_quiz", "quiz_id")
    ]:
        search_fields = [model.title.ilike(pattern, escape="\\"), model.description.ilike(pattern, escape="\\")]
        if model is Lesson:
            search_fields.append(Lesson.content.ilike(pattern, escape="\\"))
        records = model.query.join(Course, model.course_id == Course.id).filter(content_access,
            or_(*search_fields)).order_by(model.title).limit(51).all()
        add(records, kind, endpoint, id_key)
    sections = Section.query.join(Lesson, Section.lesson_id == Lesson.id).join(Course, Lesson.course_id == Course.id).filter(
        content_access, or_(Section.title.ilike(pattern, escape="\\"), Section.content.ilike(pattern, escape="\\"))).order_by(Section.title).limit(51).all()
    add(sections, "Section", "lessons.view_section", "section_id")
    pages = [("Class Training", "main.home"), ("My Capsules", "courses.list_courses")]
    if teacher:
        pages.append(("Course Management", "admin.index"))
    for title, endpoint in pages:
        if query.lower() in title.lower():
            results.append({"title": title, "kind": "Page", "description": "", "url": url_for(endpoint)})
    results.sort(key=lambda record: record["title"].lower())
    response = jsonify(module="Class Training", results=results[:50], truncated=len(results) > 50)
    response.headers["Cache-Control"] = "private, no-store"
    return response


@app.after_request
def school_controls(response):
    if response.direct_passthrough or response.mimetype != "text/html":
        return response
    context = json.dumps({"prefix": request.script_root, "csrf": generate_csrf()}).replace("<", "\\u003c")
    source = """
<script>
(() => {
  const context = CONTEXT;
  const original = window.fetch.bind(window);
  function target(value) {
    const url = new URL(value, location.href);
    const shared = ['/nav-data', '/logout', '/module-search'].includes(url.pathname);
    if (url.origin === location.origin && !shared && !url.pathname.startsWith(context.prefix + '/')) {
      url.pathname = context.prefix + url.pathname;
    }
    return url;
  }
  window.fetch = (input, init = {}) => {
    const url = target(input instanceof Request ? input.url : input);
    const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
    if (url.origin === location.origin && url.pathname.startsWith(context.prefix + '/')) headers.set('X-CSRFToken', context.csrf);
    return original(input instanceof Request ? new Request(url, input) : url, {...init, headers});
  };
  const open = XMLHttpRequest.prototype.open;
  const send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(method, url, ...args) {
    const destination = target(url);
    this.whsSameOrigin = destination.origin === location.origin && destination.pathname.startsWith(context.prefix + '/');
    return open.call(this, method, destination, ...args);
  };
  XMLHttpRequest.prototype.send = function(body) {
    if (this.whsSameOrigin) this.setRequestHeader('X-CSRFToken', context.csrf);
    return send.call(this, body);
  };
  function prepareForm(form) {
    if (new URL(form.action, location.href).origin !== location.origin) return;
    if (!form.querySelector('[name="csrf_token"]')) {
      const input = document.createElement('input');
      input.type = 'hidden'; input.name = 'csrf_token'; input.value = context.csrf;
      form.appendChild(input);
    }
  }
  document.addEventListener('submit', event => prepareForm(event.target), true);
  const submit = HTMLFormElement.prototype.submit;
  HTMLFormElement.prototype.submit = function() {
    prepareForm(this);
    return submit.call(this);
  };
})();
</script>
""".replace("CONTEXT", context)
    text = response.get_data(as_text=True).replace("<head>", "<head>" + source, 1)
    response.set_data(text)
    return response


def contact_teacher():
    recipient = request.form.get("recipient_email", "").strip().lower()
    subject = request.form.get("subject", "Question from Student").strip()
    message = request.form.get("message", "").strip()
    if not recipient or not message:
        return jsonify(success=False, error="Message and teacher email are required."), 400
    teacher = User.query.filter(func.lower(User.email) == recipient).first()
    if teacher is None or teacher.role != "teacher":
        return jsonify(success=False, error="Choose an existing training teacher."), 400
    payload = json.dumps({
        "to": recipient, "subject": subject, "message": message,
        "sender": request.headers.get("X-WHS-User", "")
    }).encode()
    outgoing = Request(os.environ["WHS_CORE_INTERNAL_URL"] + "/internal/dtech-class-training/email",
                       data=payload, headers={"Content-Type": "application/json",
                                             "X-WHS-Token": os.environ["WHS_PROXY_TOKEN"]})
    try:
        with urlopen(outgoing, timeout=30) as result:
            return jsonify(json.load(result))
    except (HTTPError, URLError, TimeoutError):
        current_app.logger.exception("Shared Class Training email failed.")
        return jsonify(success=False, error="School email could not be sent. Please contact an administrator."), 502


app.view_functions["main.contact_teacher"] = contact_teacher
