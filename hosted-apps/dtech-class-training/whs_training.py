import hashlib
import json
import os
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from flask import abort, current_app, g, jsonify, redirect, request
from flask_login import login_user
from flask_wtf.csrf import CSRFProtect, generate_csrf
from sqlalchemy import func
from werkzeug.middleware.proxy_fix import ProxyFix

from app import create_app, db
from app.models import User

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
    if request.path == "/settings":
        return redirect("/profile")
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
    const shared = url.pathname === '/nav-data' || url.pathname === '/logout';
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
