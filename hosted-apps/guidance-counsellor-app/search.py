from flask import render_template_string


SEARCH_TEMPLATE = """
<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Students</title>
    <style>
      :root {
        --bg: #eef1f7;
        --card: #ffffff;
        --text: #111827;
        --muted: #6b7280;
        --nav-bg: #232f45;
        --nav-pill: #3a465d;
        --green: #23c06a;
      }
      * { box-sizing: border-box; }
      body { font-family: Arial, sans-serif; margin: 0; background: var(--bg); color: var(--text); }
      .app-shell {
        display: grid;
        grid-template-columns: 300px 1fr;
        min-height: calc(100vh - 52px);
      }
      .sidebar {
        background: var(--nav-bg);
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
      .nav-link.active { background: var(--nav-pill); opacity: 1; }
      .sidebar-footer { margin-top: auto; }
      .add-student-btn {
        display: inline-block;
        background: var(--green);
        color: #fff;
        text-decoration: none;
        font-weight: 700;
        padding: 10px 16px;
        border-radius: 999px;
      }
      .wrap { margin: 24px auto; padding: 0 20px 24px; }
      .card { background: var(--card); border-radius: 14px; padding: 16px; box-shadow: 0 8px 20px rgba(0,0,0,0.06); }
      .top { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
      .controls { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
      input, button, select { padding: 8px 10px; font-size: 14px; }
      table { width: 100%; border-collapse: collapse; margin-top: 12px; }
      th, td { border-bottom: 1px solid #e5e7eb; padding: 10px; text-align: left; }
      .muted { color: #6b7280; }
      .danger { color: #b91c1c; }
      .row-actions a, .row-actions button { margin-right: 8px; }
      form.inline { display: inline; }
      .add-student-inline { text-decoration: none; font-weight: 700; }

      @media (max-width: 980px) {
        .app-shell { grid-template-columns: 1fr; }
        .sidebar { display: none; }
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
        <div class="sidebar-footer">
          {% if show_sidebar_add_button %}
          <a class="add-student-btn" href="/students/edit">ADD STUDENT</a>
          {% endif %}
        </div>
      </aside>

      <main class="wrap">
        <div class="card">
          <div class="top">
            <h1>Student Database</h1>
            <div>
              <a href="/dashboard">Dashboard</a>
              {% if is_admin %}| <a href="/user-roles">User Roles</a>{% endif %}
              | <a href="/logout">Logout</a>
            </div>
          </div>

          <p class="muted">Role: {{ role }} | Data source: {{ data_label }}</p>
          {% if is_admin and db_path %}
          <p class="muted">DB Storage: {{ db_storage_label }} | DB Path: {{ db_path }}</p>
          {% endif %}

          {% if message %}<p class="danger">{{ message }}</p>{% endif %}

          <form method="get" action="/students" class="controls">
            <input type="text" name="q" placeholder="Search by name or ID" value="{{ query }}">
            <button type="submit">Search</button>
            {% if can_edit %}<a class="add-student-inline" href="/students/edit">Add Student</a>{% endif %}
          </form>

          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Preferred</th>
                <th>Gender</th>
                <th>Ethnicity</th>
                <th>Referral</th>
                <th>Sessions</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {% for s in students %}
              <tr>
                <td>{{ s.get('student_id', '') }}</td>
                <td><a href="/students/profile?student_id={{ s.get('student_id', '') }}">{{ s.get('full_name', '') }}</a></td>
                <td>{{ s.get('preferred_name', '') }}</td>
                <td>{{ s.get('gender', '') }}</td>
                <td>{{ s.get('ethnicity', '') }}</td>
                <td>{{ s.get('referral_type', '') }}</td>
                <td>{{ s.get('sessions', [])|length }}</td>
                <td class="row-actions">
                  {% if can_edit %}
                  <a href="/students/edit?student_id={{ s.get('student_id', '') }}">Edit</a>
                  {% endif %}
                  {% if can_edit %}
                  <form method="post" action="/students/delete" class="inline" onsubmit="return confirm('Delete this student?');">
                    <input type="hidden" name="student_id" value="{{ s.get('student_id', '') }}">
                    <button type="submit">Delete</button>
                  </form>
                  {% endif %}
                </td>
              </tr>
              {% endfor %}
            </tbody>
          </table>
        </div>
      </main>
    </div>
    {{ global_footer|safe }}
  </body>
</html>
"""


def filter_students(students, query):
    q = (query or "").strip().lower()
    if not q:
        return students
    filtered = []
    for student in students:
        student_id = str(student.get("student_id", "")).lower()
        full_name = str(student.get("full_name", "")).lower()
        if q in student_id or q in full_name:
            filtered.append(student)
    return filtered


def render_search_page(
  students,
  query,
  role,
  data_label,
  is_admin=False,
  can_edit=True,
  show_sidebar_add_button=False,
  message=None,
  global_navbar="",
  db_path="",
  db_storage_label="",
):
    return render_template_string(
        SEARCH_TEMPLATE,
        students=students,
        query=query,
        role=role,
        data_label=data_label,
        is_admin=is_admin,
        can_edit=can_edit,
        show_sidebar_add_button=show_sidebar_add_button,
        message=message,
    global_navbar=global_navbar,
    db_path=db_path,
    db_storage_label=db_storage_label,
    )
