"""Runs a student's Flask app behind the WHS APPSystem.

The school system signs the person in and sends who they are in X-WHS-* headers.
This wrapper trusts those headers (only the school system can reach this process),
so the student's own login is no longer used.
"""
import hmac
import importlib
import os
import re
from urllib.parse import unquote

from flask import redirect, request, session

module_name, _, attr = os.environ["WHS_APP_MODULE"].partition(":")
app = getattr(importlib.import_module(module_name), attr or "app")

PREFIX = os.environ.get("SCRIPT_NAME", "").rstrip("/")
TOKEN = os.environ.get("WHS_PROXY_TOKEN", "")
LINK = re.compile(r"""((?:href|action|src)=|fetch\()(["'])/(?!/)""")


def _from_school_system():
    return bool(TOKEN) and hmac.compare_digest(request.headers.get("X-WHS-Token", ""), TOKEN)


def _sign_in_from_headers():
    if not _from_school_system():
        return "Open this app through the school system.", 403
    email = request.headers.get("X-WHS-User", "")
    role = request.headers.get("X-WHS-Role", "")
    if not email:
        return "Sign in through the school system.", 401

    session["user"] = email
    session["name"] = unquote(request.headers.get("X-WHS-Name", ""))
    session["role"] = role

    # Apps like the Guidance Counsellor App keep roles in their own database, so keep it in step.
    backend = getattr(sys_module(), "backend", None)
    if backend is not None and role:
        try:
            if backend.get_user_role(email) != role:
                backend.set_user_role(email, role)
        except Exception:
            app.logger.exception("Could not sync the role for %s", email)

    if request.path == "/":
        return redirect(PREFIX + "/dashboard")
    if request.path == "/logout":
        return redirect("/student-apps")
    return None


def sys_module():
    return importlib.import_module(module_name)


def _prefix_links(response):
    if not PREFIX or response.direct_passthrough or response.mimetype != "text/html":
        return response
    text = response.get_data(as_text=True)

    def replace(match):
        start = match.end() - 1
        if text.startswith(PREFIX + "/", start) or text.startswith(PREFIX + '"', start):
            return match.group(0)
        return f"{match.group(1)}{match.group(2)}{PREFIX}/"

    response.set_data(LINK.sub(replace, text))
    return response


app.before_request_funcs.setdefault(None, []).insert(0, _sign_in_from_headers)
app.after_request(_prefix_links)
