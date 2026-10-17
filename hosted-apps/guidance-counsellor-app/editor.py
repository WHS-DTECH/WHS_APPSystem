import datetime
from flask import render_template_string


EDITOR_TEMPLATE = """
<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{ page_title }}</title>
    <style>
      :root {
        --bg: #eef1f7;
        --card: #ffffff;
        --text: #1a243b;
        --muted: #7c889c;
        --line: #d9e2ef;
        --sidebar-bg: #232f45;
        --sidebar-pill: #3a465d;
        --blue: #3a78e8;
        --green: #23c06a;
      }
      * { box-sizing: border-box; }
      body {
        font-family: Arial, sans-serif;
        margin: 0;
        background: var(--bg);
        color: var(--text);
      }

      .app-shell {
        display: grid;
        grid-template-columns: 300px 1fr;
        min-height: calc(100vh - 52px - 1.5cm);
      }

      .sidebar {
        background: var(--sidebar-bg);
        color: #ffffff;
        padding: 26px 20px;
        display: flex;
        flex-direction: column;
      }
      .brand {
        font-size: 44px;
        font-weight: 800;
        letter-spacing: 1px;
        margin: 6px 0 26px;
      }
      .nav-link {
        display: inline-block;
        padding: 14px 16px;
        border-radius: 12px;
        color: #ffffff;
        text-decoration: none;
        font-weight: 700;
      }
      .nav-link.secondary { margin-top: 8px; opacity: 0.82; }
      .nav-link.active { background: var(--sidebar-pill); opacity: 1; }

      .content {
        padding: 18px 26px;
      }

      .profile-grid {
        display: grid;
        grid-template-columns: repeat(12, minmax(0, 1fr));
        gap: 12px;
      }
      .span-12 { grid-column: span 12; }
      .span-8 { grid-column: span 8; }
      .span-6 { grid-column: span 6; }
      .span-4 { grid-column: span 4; }
      .span-2 { grid-column: span 2; }

      .page-title {
        margin: 2px 0 10px;
        font-size: 28px;
        font-weight: 800;
        letter-spacing: 0.2px;
      }
      .section-title {
        margin: 12px 0 6px;
        font-size: 22px;
        font-weight: 800;
      }

      .field {
        display: flex;
        flex-direction: column;
      }
      label {
        display: block;
        font-size: 13px;
        color: var(--muted);
        margin-bottom: 4px;
      }
      input,
      textarea,
      button {
        width: 100%;
        border: 1px solid var(--line);
        background: #f9fbff;
        color: #3b4455;
        border-radius: 6px;
        padding: 10px 12px;
        font-size: 14px;
      }
      input[disabled] {
        color: #a2adbd;
        background: #f2f5fa;
      }
      textarea {
        min-height: 90px;
        resize: vertical;
      }

      .select-link {
        margin-top: 32px;
        color: var(--blue);
        font-weight: 700;
        text-decoration: none;
      }

      .actions {
        display: flex;
        justify-content: flex-end;
        gap: 14px;
        margin-top: 12px;
      }
      .btn {
        text-decoration: none;
        display: inline-block;
        border-radius: 999px;
        padding: 9px 16px;
        font-weight: 700;
        font-size: 14px;
        border: 1px solid transparent;
      }
      .btn-cancel {
        background: #f7f9fc;
        border-color: var(--line);
        color: #3b5d8b;
      }
      .btn-save {
        background: var(--green);
        color: #ffffff;
      }

      .msg { color: #b91c1c; margin-bottom: 6px; font-size: 14px; }
      .toolbar { margin-bottom: 6px; font-size: 14px; }
      .toolbar a { margin-right: 8px; color: #3b5d8b; }

      @media (max-width: 980px) {
        .app-shell { grid-template-columns: 1fr; }
        .sidebar { display: none; }
        .content { padding: 18px 14px; }
      }
      @media (max-width: 760px) {
        .page-title { font-size: 24px; }
        .section-title { font-size: 20px; }
        .span-8, .span-6, .span-4, .span-2 { grid-column: span 12; }
        .actions { justify-content: stretch; }
        .btn { width: 100%; text-align: center; }
      }
    </style>
  </head>
  <body>
    {{ global_navbar|safe }}
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand">SEND-C</div>
        <a class="nav-link" href="/dashboard">DASHBOARD</a>
        <a class="nav-link active secondary" href="/students">STUDENTS</a>
      </aside>

      <main class="content">
        <h1 class="page-title">{{ page_title }}</h1>
        <div class="toolbar"><a href="/students">Back to Students</a> | <a href="/dashboard">Dashboard</a> | <a href="/students/sync-spreadsheets">Sync Spreadsheets</a> | <a href="/logout">Logout</a></div>
        {% if message %}<p class="msg">{{ message }}</p>{% endif %}

        <form method="post" action="/students/edit">
          <input type="hidden" name="student_id" value="{{ student.get('student_id', '') }}">
          <div class="profile-grid">
            <h2 class="section-title span-12">Core Details</h2>

            <div class="field span-6">
              <label>Full Name</label>
              <input name="full_name" value="{{ student.get('full_name', '') }}" required>
            </div>
            <div class="field span-6">
              <label>Preferred Name</label>
              <input name="preferred_name" value="{{ student.get('preferred_name', '') }}">
            </div>

            <div class="field span-4">
              <label>Date of Birth (DD.MM.YYYY)</label>
              <input name="dob" value="{{ student.get('dob', '') }}">
            </div>
            <div class="field span-2">
              <label>Age (calculated)</label>
              <input value="{{ age }}" disabled>
            </div>
            <div class="field span-3">
              <label>Gender</label>
              <input name="gender" value="{{ student.get('gender', '') }}">
            </div>
            <div class="field span-3">
              <label>Ethnicity</label>
              <input name="ethnicity" value="{{ student.get('ethnicity', '') }}">
            </div>

            <h2 class="section-title span-12">Contact & Relations</h2>

            <div class="field span-4">
              <label>Address</label>
              <input name="address" value="{{ student.get('address', '') }}">
            </div>
            <div class="field span-4">
              <label>Phone Numbers</label>
              <input name="phone" value="{{ student.get('phone', '') }}">
            </div>
            <div class="field span-4">
              <label>Referral Type</label>
              <input name="referral_type" value="{{ student.get('referral_type', '') }}">
            </div>

            <div class="field span-6">
              <label>Whānau</label>
              <input name="whanau" value="{{ student.get('whanau', '') }}">
            </div>
            <div class="field span-6">
              <label>Care Giver</label>
              <input name="care_giver" value="{{ student.get('care_giver', '') }}">
            </div>

            <h2 class="section-title span-12">Session Tracking</h2>

            <div class="field span-12">
              <label>Session Times (comma-separated, HH:MM DD.MM.YYYY)</label>
              <input name="sessions_list" value="{{ sessions_string }}">
            </div>

            <h2 class="section-title span-12">Notes</h2>

            <div class="field span-12">
              <label>Notes about Student</label>
              <textarea name="notes">{{ student.get('notes', '') }}</textarea>
            </div>
          </div>

          <div class="actions">
            <a class="btn btn-cancel" href="/students">CANCEL</a>
            <button class="btn btn-save" type="submit">SAVE STUDENT PROFILE</button>
          </div>
        </form>
      </main>
    </div>
    {{ global_footer|safe }}
  </body>
</html>
"""


def build_empty_student(student_id):
    return {
        "student_id": student_id,
        "full_name": "",
        "preferred_name": "",
        "dob": "",
        "gender": "",
        "ethnicity": "",
        "address": "",
        "phone": "",
        "referral_type": "",
        "whanau": "",
        "care_giver": "",
        "notes": "",
        "sessions": [],
    }


def calculate_age(dob_str):
    raw = (dob_str or "").strip()
    if not raw:
        return "-"
    try:
        birth_date = datetime.datetime.strptime(raw, "%d.%m.%Y")
        today = datetime.datetime.now()
        age = today.year - birth_date.year - ((today.month, today.day) < (birth_date.month, birth_date.day))
        return str(age) if age >= 0 else "-"
    except ValueError:
        return "-"


def parse_to_iso_session(formatted_str):
    raw = (formatted_str or "").strip()
    if not raw:
        return ""
    try:
        parsed_dt = datetime.datetime.strptime(raw, "%H:%M %d.%m.%Y")
        return parsed_dt.strftime("%Y-%m-%d %H:%M")
    except ValueError:
        return raw


def format_session_time(iso_or_raw_str):
    raw = (iso_or_raw_str or "").strip()
    if not raw:
        return ""
    try:
        parsed_dt = datetime.datetime.fromisoformat(raw[:16].replace(" ", "T"))
        return parsed_dt.strftime("%H:%M %d.%m.%Y")
    except ValueError:
        return raw


def normalize_student_payload(form_data, existing_student_id=""):
    student_id = (form_data.get("student_id") or "").strip() or existing_student_id
    sessions_raw = (form_data.get("sessions_list") or "").strip()
    sessions = []
    if sessions_raw:
        for chunk in sessions_raw.split(","):
            parsed = parse_to_iso_session(chunk.strip())
            if parsed:
                sessions.append(parsed)

    return {
        "student_id": student_id,
        "full_name": (form_data.get("full_name") or "").strip(),
        "preferred_name": (form_data.get("preferred_name") or "").strip(),
        "dob": (form_data.get("dob") or "").strip(),
        "gender": (form_data.get("gender") or "").strip(),
        "ethnicity": (form_data.get("ethnicity") or "").strip(),
        "address": (form_data.get("address") or "").strip(),
        "phone": (form_data.get("phone") or "").strip(),
        "referral_type": (form_data.get("referral_type") or "").strip(),
        "whanau": (form_data.get("whanau") or "").strip(),
        "care_giver": (form_data.get("care_giver") or "").strip(),
        "notes": (form_data.get("notes") or "").strip(),
        "sessions": sessions,
    }


def render_editor_page(student, message=None, global_navbar=""):
    sessions_string = ", ".join(format_session_time(s) for s in student.get("sessions", []))
    page_title = "Edit Student Profile" if student.get("student_id") else "New Student Profile"
    return render_template_string(
        EDITOR_TEMPLATE,
        student=student,
        message=message,
        sessions_string=sessions_string,
        age=calculate_age(student.get("dob", "")),
        page_title=page_title,
    global_navbar=global_navbar,
    )


PROFILE_TEMPLATE = """
<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Student Profile</title>
    <style>
      :root {
        --bg: #eef1f7;
        --panel: #ffffff;
        --line: #d8e1ef;
        --ink: #1a243b;
        --muted: #6c7a90;
        --nav-bg: #232f45;
        --nav-pill: #3a465d;
        --blue: #2f74e1;
        --green: #27bb67;
      }
      * { box-sizing: border-box; }
      body { margin: 0; font-family: Arial, sans-serif; background: var(--bg); color: var(--ink); }
      .app-shell {
        display: grid;
        grid-template-columns: 300px 1fr;
        min-height: calc(100vh - 52px - 1.5cm);
      }
      .sidebar {
        background: var(--nav-bg);
        color: #fff;
        padding: 26px 20px;
        display: flex;
        flex-direction: column;
      }
      .brand { font-size: 44px; font-weight: 800; letter-spacing: 1px; margin: 6px 0 26px; }
      .nav-link {
        display: inline-block;
        padding: 14px 16px;
        border-radius: 12px;
        color: #fff;
        text-decoration: none;
        font-weight: 700;
      }
      .nav-link.active { background: var(--nav-pill); }
      .content { padding: 24px 22px; }
      .panel {
        background: var(--panel);
        border-radius: 8px;
        padding: 16px;
        border: 1px solid #e6ecf6;
      }
      .title-row { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
      .title-row h1 { margin: 0; font-size: 36px; }
      .delete-link { color: #d44a4a; text-decoration: none; font-size: 13px; }
      .section-title { margin: 18px 0 8px; font-size: 17px; font-weight: 700; }
      .tracking {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto auto;
        gap: 10px;
        align-items: center;
        padding: 10px;
        border: 1px solid var(--line);
        background: #f3f7fe;
        border-radius: 6px;
      }
      .tracking small { color: var(--muted); display: block; margin-bottom: 4px; }
      .pill-btn {
        border: 0;
        color: #fff;
        font-weight: 700;
        border-radius: 999px;
        padding: 8px 14px;
        text-decoration: none;
        display: inline-block;
        font-size: 13px;
      }
      .pill-btn.green { background: var(--green); }
      .pill-btn.blue { background: var(--blue); }
      .grid {
        display: grid;
        grid-template-columns: repeat(12, minmax(0, 1fr));
        gap: 8px;
      }
      .span-12 { grid-column: span 12; }
      .span-6 { grid-column: span 6; }
      .span-4 { grid-column: span 4; }
      .span-3 { grid-column: span 3; }
      .field label {
        display: block;
        font-size: 12px;
        color: var(--muted);
        margin-bottom: 2px;
      }
      .value {
        min-height: 34px;
        border: 1px solid var(--line);
        background: #f9fbff;
        border-radius: 4px;
        padding: 8px;
        font-size: 14px;
      }
      .toolbar { margin-top: 14px; }
      .toolbar a { color: #3b5d8b; margin-right: 8px; }
      @media (max-width: 980px) {
        .app-shell { grid-template-columns: 1fr; }
        .sidebar { display: none; }
      }
      @media (max-width: 760px) {
        .span-6, .span-4, .span-3 { grid-column: span 12; }
        .tracking { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    {{ global_navbar|safe }}
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand">SEND-C</div>
        <a class="nav-link" href="/dashboard">DASHBOARD</a>
        <a class="nav-link active" href="/students">STUDENTS</a>
      </aside>

      <main class="content">
        <div class="panel">
          <div class="title-row">
            <h1>Edit Student Profile</h1>
            {% if can_edit %}
            <form method="post" action="/students/delete" onsubmit="return confirm('Delete this student?');">
              <input type="hidden" name="student_id" value="{{ student.get('student_id', '') }}">
              <button type="submit" style="border:0; background:none; color:#d44a4a; cursor:pointer; font-size:13px;">Delete Profile</button>
            </form>
            {% endif %}
          </div>

          <div class="section-title">Session Tracking</div>
          <div class="tracking">
            <div>
              <small>Total Sessions</small>
              <div><strong>{{ session_count }}</strong> {% if latest_session %}<span style="margin-left:10px; color:var(--muted);">Latest: {{ latest_session }}</span>{% endif %}</div>
            </div>
            <a class="pill-btn green" href="/students/edit?student_id={{ student.get('student_id', '') }}">Add Session</a>
            <a class="pill-btn blue" href="/students/sessions?student_id={{ student.get('student_id', '') }}">Manage Sessions</a>
          </div>

          <div class="section-title">Student Details</div>
          <div class="grid">
            <div class="field span-6"><label>Student ID</label><div class="value">{{ student.get('student_id', '') }}</div></div>
            <div class="field span-6"><label>Current Year Level</label><div class="value">{{ student.get('current_year_level', student.get('year_level', '')) }}</div></div>

            <div class="field span-6"><label>Full Name</label><div class="value">{{ student.get('full_name', '') }}</div></div>
            <div class="field span-6"><label>Preferred Name</label><div class="value">{{ student.get('preferred_name', '') }}</div></div>

            <div class="field span-4"><label>Date of Birth</label><div class="value">{{ student.get('dob', '') }}</div></div>
            <div class="field span-3"><label>Age</label><div class="value">{{ age }}</div></div>
            <div class="field span-3"><label>Gender</label><div class="value">{{ student.get('gender', '') }}</div></div>
            <div class="field span-2"><label>Preferred Pronoun</label><div class="value">{{ student.get('preferred_pronoun', '') }}</div></div>

            <div class="field span-4"><label>Ethnicity</label><div class="value">{{ student.get('ethnicity', '') }}</div></div>
            <div class="field span-4"><label>Referral</label><div class="value">{{ student.get('referral_type', '') }}</div></div>
            <div class="field span-4"><label>Classification</label><div class="value">{{ student.get('classification', '') }}</div></div>
          </div>

          <div class="section-title">Contact & Relations</div>
          <div class="grid">
            <div class="field span-6"><label>Address</label><div class="value">{{ student.get('address', '') }}</div></div>
            <div class="field span-3"><label>Phone</label><div class="value">{{ student.get('phone', '') }}</div></div>
            <div class="field span-3"><label>Care Giver</label><div class="value">{{ student.get('care_giver', '') }}</div></div>
          </div>

          <div class="toolbar">
            <a href="/students">Back to Students</a> | <a href="/students/edit?student_id={{ student.get('student_id', '') }}">Open Full Editor</a> | <a href="/logout">Logout</a>
          </div>
        </div>
      </main>
    </div>
    {{ global_footer|safe }}
  </body>
</html>
"""


def render_profile_page(student, can_edit=False, global_navbar=""):
    latest_session = ""
    if student.get("sessions"):
        latest_session = format_session_time(sorted(student.get("sessions", []))[-1])

    return render_template_string(
        PROFILE_TEMPLATE,
        student=student,
        can_edit=can_edit,
        session_count=len(student.get("sessions", [])),
        latest_session=latest_session,
        age=calculate_age(student.get("dob", "")),
        global_navbar=global_navbar,
    )


SESSIONS_TEMPLATE = """
<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Sessions</title>
    <style>
      :root {
        --bg: #eef1f7;
        --panel: #ffffff;
        --line: #d8e1ef;
        --ink: #1a243b;
        --muted: #6c7a90;
        --nav-bg: #232f45;
        --nav-pill: #3a465d;
        --blue: #2f74e1;
        --green: #27bb67;
      }
      * { box-sizing: border-box; }
      body { margin: 0; font-family: Arial, sans-serif; background: var(--bg); color: var(--ink); }
      .app-shell {
        display: grid;
        grid-template-columns: 300px 1fr;
        min-height: calc(100vh - 52px - 1.5cm);
      }
      .sidebar {
        background: var(--nav-bg);
        color: #fff;
        padding: 26px 20px;
        display: flex;
        flex-direction: column;
      }
      .brand { font-size: 44px; font-weight: 800; letter-spacing: 1px; margin: 6px 0 26px; }
      .nav-link {
        display: inline-block;
        padding: 14px 16px;
        border-radius: 12px;
        color: #fff;
        text-decoration: none;
        font-weight: 700;
      }
      .nav-link.active { background: var(--nav-pill); }
      .content { padding: 16px 22px; }
      .canvas { max-width: 930px; }
      .title { margin: 0; font-size: 28px; font-weight: 800; letter-spacing: 0.1px; }
      .sub { margin-top: 4px; color: var(--muted); font-size: 13px; }

      .toolbar {
        margin-top: 12px;
        display: grid;
        grid-template-columns: auto auto minmax(0, 1fr) auto;
        gap: 10px;
        align-items: center;
      }
      .radio { display: inline-flex; align-items: center; gap: 8px; font-size: 14px; color: #343c4b; }
      .search {
        border: 1px solid var(--line);
        background: #f9fbff;
        border-radius: 6px;
        padding: 9px 12px;
        font-size: 15px;
        color: #3b4455;
      }
      .save-btn {
        border: 0;
        border-radius: 999px;
        background: var(--green);
        color: #fff;
        text-decoration: none;
        font-weight: 700;
        padding: 10px 16px;
        font-size: 15px;
      }
      .line { margin: 12px 0; border-top: 1px solid #cfd9ea; }

      .card {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 12px;
        padding: 12px;
        margin-bottom: 10px;
      }
      .card-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 10px;
        margin-bottom: 10px;
      }
      .card-title { margin: 0; font-size: 18px; }
      .card-meta {
        display: flex;
        align-items: center;
        gap: 16px;
      }
      .meta { color: var(--muted); font-size: 13px; }
      .color-link {
        color: var(--blue);
        text-decoration: none;
        font-weight: 700;
        font-size: 13px;
      }
      .card-divider { border-top: 1px solid #e4e9f3; margin: 8px 0; }
      .session-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
      }
      .field label {
        display: block;
        margin-bottom: 3px;
        color: var(--muted);
        font-size: 12px;
      }
      .value-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: center;
        gap: 10px;
      }
      .value {
        min-height: 34px;
        border: 1px solid var(--line);
        border-radius: 6px;
        background: #f9fbff;
        padding: 7px 10px;
        font-size: 14px;
      }
      .select-action {
        color: var(--blue);
        text-decoration: none;
        font-weight: 700;
        font-size: 13px;
      }
      .notes {
        margin-top: 10px;
        border: 1px solid var(--line);
        border-radius: 6px;
        background: #fff;
        padding: 8px 10px;
        min-height: 56px;
        max-height: 56px;
        overflow: hidden;
        white-space: pre-wrap;
        font-size: 14px;
        line-height: 1.3;
      }
      .empty {
        border: 1px dashed #b9c6dc;
        border-radius: 10px;
        background: #f7faff;
        padding: 18px;
        color: #556178;
      }

      @media (max-width: 980px) {
        .app-shell { grid-template-columns: 1fr; }
        .sidebar { display: none; }
        .content { padding: 16px 14px; }
        .canvas { max-width: 100%; }
        .title { font-size: 24px; }
        .sub { font-size: 18px; }
        .toolbar { grid-template-columns: 1fr; }
        .radio { font-size: 18px; }
        .search { font-size: 18px; }
        .save-btn { font-size: 18px; text-align: center; }
        .card-title { font-size: 24px; }
        .card-meta { gap: 10px; }
        .meta { font-size: 16px; }
        .color-link { font-size: 14px; }
        .session-grid { grid-template-columns: 1fr; }
        .field label { font-size: 14px; }
        .value-row { grid-template-columns: 1fr auto; }
        .value, .notes { font-size: 18px; }
        .select-action { font-size: 14px; }
      }
    </style>
  </head>
  <body>
    {{ global_navbar|safe }}
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand">SEND-C</div>
        <a class="nav-link" href="/dashboard">DASHBOARD</a>
        <a class="nav-link active" href="/students">STUDENTS</a>
      </aside>

      <main class="content">
        <div class="canvas">
        <h1 class="title">Sessions: {{ student.get('full_name', '') }}</h1>
        <div class="sub">ID: {{ student.get('student_id', '') }}</div>

        <form method="get" action="/students/sessions" class="toolbar">
          <input type="hidden" name="student_id" value="{{ student.get('student_id', '') }}">
          <label class="radio"><input type="radio" name="mode" value="date" {% if mode != 'referral' %}checked{% endif %}> Date / Time</label>
          <label class="radio"><input type="radio" name="mode" value="referral" {% if mode == 'referral' %}checked{% endif %}> Referral Type</label>
          <input class="search" name="q" placeholder="Search by Date/Time (HH:MM DD.MM.YYYY)" value="{{ query }}">
          {% if can_edit %}
          <a class="save-btn" href="/students/profile?student_id={{ student.get('student_id', '') }}">SAVE & BACK TO PROFILE</a>
          {% else %}
          <a class="save-btn" href="/students/profile?student_id={{ student.get('student_id', '') }}">BACK TO PROFILE</a>
          {% endif %}
        </form>

        <div class="line"></div>

        {% if sessions %}
          {% for row in sessions %}
          <section class="card">
            <div class="card-head">
              <h2 class="card-title">{{ row.display_date }} - Session Record</h2>
              <div class="card-meta">
                <a class="color-link" href="#">🎨 Color ▾</a>
                <div class="meta">Year Level: {{ row.year_level }}</div>
              </div>
            </div>
            <div class="card-divider"></div>
            <div class="session-grid">
              <div class="field">
                <label>Session Type</label>
                <div class="value-row">
                  <div class="value">{{ row.session_type }}</div>
                  <a class="select-action" href="#">Select ▾</a>
                </div>
              </div>
              <div class="field">
                <label>Classification</label>
                <div class="value-row">
                  <div class="value">{{ row.classification }}</div>
                  <a class="select-action" href="#">Select ▾</a>
                </div>
              </div>
              <div class="field">
                <label>Referral Type</label>
                <div class="value-row">
                  <div class="value">{{ row.referral_type }}</div>
                  <a class="select-action" href="#">Select ▾</a>
                </div>
              </div>
            </div>
            <div class="field" style="margin-top:10px;">
              <label>Session Notes</label>
              <div class="notes">{{ row.notes }}</div>
            </div>
          </section>
          {% endfor %}
        {% else %}
          <div class="empty">No sessions found for this student with the current search.</div>
        {% endif %}
        </div>
      </main>
    </div>
    {{ global_footer|safe }}
  </body>
</html>
"""


def _format_session_card_date(session_value):
    raw = (session_value or "").strip()
    if not raw:
        return "Unknown"
    try:
        dt = datetime.datetime.fromisoformat(raw[:16].replace(" ", "T"))
        return dt.strftime("%d.%m.%y")
    except ValueError:
        return raw


def _session_notes_for_date(student_notes, iso_session):
    session_day = ""
    if iso_session:
        session_day = iso_session[:10]

    if not student_notes:
        return ""

    lines = [line.strip() for line in str(student_notes).splitlines() if line.strip()]
    if not session_day:
        return "\n".join(lines[:2])

    matched = [line for line in lines if f"Date: {session_day}" in line]
    if matched:
        return "\n".join(matched[:3])
    return "\n".join(lines[:2])


def render_sessions_page(student, can_edit=False, query="", mode="date", global_navbar="", create_blank_card=False):
    raw_sessions = sorted(student.get("sessions", []), reverse=True)
    rows = []
    for session_value in raw_sessions:
        display_time = format_session_time(session_value)
        row = {
            "iso": session_value,
            "display_date": _format_session_card_date(session_value),
            "display_time": display_time,
            "session_type": student.get("session_type", "Face-to-Face") or "Face-to-Face",
            "classification": student.get("classification", "intro meet") or "intro meet",
            "referral_type": student.get("referral_type", "") or "",
            "year_level": student.get("year_level", "") or student.get("current_year_level", ""),
            "notes": _session_notes_for_date(student.get("notes", ""), session_value),
        }
        rows.append(row)

    if create_blank_card and not rows:
        rows.append(
            {
                "iso": "",
                "display_date": "New",
                "display_time": "",
                "session_type": "",
                "classification": "",
                "referral_type": "",
                "year_level": "",
                "notes": "",
            }
        )

    q = (query or "").strip().lower()
    if q:
        if mode == "referral":
            rows = [r for r in rows if q in str(r.get("referral_type", "")).lower()]
        else:
            rows = [
                r
                for r in rows
                if q in str(r.get("display_time", "")).lower() or q in str(r.get("display_date", "")).lower()
            ]

    return render_template_string(
        SESSIONS_TEMPLATE,
        student=student,
        sessions=rows,
        can_edit=can_edit,
        query=query,
        mode=mode,
        global_navbar=global_navbar,
    )
