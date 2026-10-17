from collections import Counter
import datetime


DASHBOARD_WEB_TEMPLATE = """
<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Dashboard</title>
    <style>
      :root {
        --bg: #eef1f7;
        --card: #ffffff;
        --text: #1a243b;
        --muted: #8a93a3;
        --blue: #3a78e8;
        --green: #23c06a;
        --nav-bg: #232f45;
        --nav-pill: #3a465d;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: Arial, sans-serif;
        background: var(--bg);
        color: var(--text);
      }

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
      .nav-link.active { background: var(--nav-pill); }
      .nav-link.secondary { margin-top: 8px; opacity: 0.82; }
      .sidebar-footer { margin-top: auto; }
      .session-btn {
        display: inline-block;
        background: var(--green);
        color: white;
        font-weight: 700;
        text-decoration: none;
        padding: 10px 16px;
        border-radius: 999px;
      }

      .main {
        padding: 24px 30px;
      }
      .title { margin: 0; font-size: 44px; letter-spacing: 0.2px; font-weight: 800; }
      .meta { color: var(--muted); margin: 4px 0; font-size: 14px; }
      .logout-line { margin-top: 6px; font-size: 14px; }
      .logout-line a { color: #334155; }

      .stats {
        margin-top: 16px;
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 14px;
      }
      .card {
        background: var(--card);
        border-radius: 18px;
        padding: 18px;
        box-shadow: 0 10px 20px rgba(15, 23, 42, 0.05);
      }
      .stat-label { color: #a1a6b0; font-size: 14px; }
      .stat-value { font-size: 40px; font-weight: 800; margin-top: 6px; line-height: 1; }

      .charts {
        margin-top: 14px;
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 14px;
      }
      .chart-card h3 { margin-top: 0; margin-bottom: 10px; font-size: 32px; }
      .chart-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
      }

      .dropdown-pill {
        padding: 6px 10px;
        border-radius: 10px;
        border: 1px solid #dbe3ef;
        background: #ffffff;
        color: #3a78e8;
        font-weight: 700;
        font-size: 14px;
      }

      .distribution-list { margin-top: 4px; }
      .distribution-row { margin-bottom: 16px; }
      .distribution-top {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        margin-bottom: 8px;
      }
      .distribution-name { font-size: 20px; }
      .distribution-meta { color: #9ca3af; font-size: 12px; }
      .distribution-track {
        width: 100%;
        height: 12px;
        background: #dbe3ef;
        border-radius: 999px;
      }
      .distribution-fill {
        height: 100%;
        background: var(--blue);
        border-radius: 999px;
      }

      .timeline-toolbar {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-bottom: 10px;
      }
      .export-btn {
        display: inline-block;
        background: var(--blue);
        color: #fff;
        text-decoration: none;
        font-weight: 700;
        padding: 8px 12px;
        border-radius: 999px;
        font-size: 14px;
      }
      .timeline-area {
        margin-top: 12px;
        min-height: 220px;
        border-top: 1px solid #dde3ec;
        display: grid;
        grid-template-columns: repeat(12, minmax(0, 1fr));
        gap: 10px;
        align-items: end;
        padding-top: 12px;
      }
      .timeline-col {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: end;
      }
      .timeline-bar {
        width: 22px;
        border-radius: 8px;
        background: var(--green);
      }
      .timeline-label {
        margin-top: 6px;
        color: #8090a7;
        font-size: 11px;
        font-weight: 700;
      }

      @media (max-width: 980px) {
        .app-shell { grid-template-columns: 1fr; }
        .sidebar { display: none; }
        .stats { grid-template-columns: 1fr; }
        .charts { grid-template-columns: 1fr; }
      }

      @media (max-width: 700px) {
        .main { padding: 18px 14px; }
        .title { font-size: 30px; }
        .chart-card h3 { font-size: 24px; }
        .stat-value { font-size: 34px; }
        .distribution-name { font-size: 18px; }
        .timeline-bar { width: 18px; }
      }
    </style>
  </head>
  <body>
    {{ global_navbar|safe }}
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand">SEND-C</div>
        <a class="nav-link active" href="/dashboard">DASHBOARD</a>
        <a class="nav-link secondary" href="/students">STUDENTS</a>
        <div class="sidebar-footer">
          <a class="session-btn" href="/students/sessions/new">NEW SESSION</a>
        </div>
      </aside>

      <main class="main">
        <h1 class="title">Overview & Analytics</h1>
        <p class="meta">Welcome, {{ user }}.</p>
        <p class="meta">Role: {{ role }} | Viewing {{ data_label }}.</p>
        {% if can_restore_admin %}
          <form method="post" action="/account/restore-admin" style="margin: 6px 0 0;">
            <button type="submit" style="border:0; border-radius:8px; background:#1f2937; color:#fff; padding:7px 11px; cursor:pointer; font-size:13px;">Restore ADMIN Access</button>
          </form>
        {% endif %}
        <p class="logout-line"><a href="/logout">Logout</a></p>

        <div class="stats">
          <div class="card">
            <div class="stat-label">Total Registered Students</div>
            <div class="stat-value" style="color: var(--blue);">{{ total_students }}</div>
          </div>
          <div class="card">
            <div class="stat-label">Total Sessions Logged</div>
            <div class="stat-value" style="color: var(--green);">{{ total_sessions }}</div>
          </div>
        </div>

        <div class="charts">
          <div class="card chart-card">
            <div class="chart-header">
              <h3>Distribution Profiles</h3>
              <span class="dropdown-pill">Gender</span>
            </div>

            <div class="distribution-list">
              {% if distribution_rows %}
                {% for row in distribution_rows %}
                  <div class="distribution-row">
                    <div class="distribution-top">
                      <div class="distribution-name">{{ row.label }}</div>
                      <div class="distribution-meta">{{ row.count }}x ({{ row.percent }}%)</div>
                    </div>
                    <div class="distribution-track">
                      <div class="distribution-fill" style="width: {{ row.percent }}%;"></div>
                    </div>
                  </div>
                {% endfor %}
              {% else %}
                <p class="meta">No gender data available.</p>
              {% endif %}
            </div>
          </div>

          <div class="card chart-card">
            <h3>Session Tracking Timeline</h3>
            <div class="timeline-toolbar">
              <span class="dropdown-pill">Total Sessions</span>
              <span class="dropdown-pill">Full Year</span>
              <a class="export-btn" href="/students">Export (.csv)</a>
            </div>

            <div class="timeline-area">
              {% for item in timeline_bars %}
                <div class="timeline-col" title="{{ item.value }} sessions">
                  <div class="timeline-bar" style="height: {{ item.height }}px;"></div>
                  <div class="timeline-label">{{ item.label }}</div>
                </div>
              {% endfor %}
            </div>
          </div>
        </div>
      </main>
    </div>
    {{ global_footer|safe }}
  </body>
</html>
"""


def _normalize_value(value):
    text = str(value or "").strip()
    return text if text else "Unspecified"


def _distribution(students, key_name):
    counts = Counter(_normalize_value(student.get(key_name)) for student in students)
    labels = list(counts.keys())
    values = [counts[label] for label in labels]
    return {"labels": labels, "values": values}


def _timeline_last_12_months(students):
    now = datetime.datetime.now()
    month_keys = []
    for i in range(11, -1, -1):
        d = now.replace(day=1) - datetime.timedelta(days=i * 30)
        month_keys.append(d.strftime("%Y-%m"))

    counts = {k: 0 for k in month_keys}
    for student in students:
        for session_stamp in student.get("sessions", []):
            month_key = str(session_stamp or "")[:7]
            if month_key in counts:
                counts[month_key] += 1

    labels = []
    values = []
    for month_key in month_keys:
        try:
            label = datetime.datetime.strptime(month_key, "%Y-%m").strftime("%b")
        except ValueError:
            label = month_key
        labels.append(label)
        values.append(counts[month_key])
    return labels, values


def build_dashboard_context(user, role, data_label, students, can_restore_admin=False):
    total_students = len(students)
    total_sessions = sum(len(s.get("sessions", [])) for s in students)

    gender_data = _distribution(students, "gender")
    total_gender = sum(gender_data["values"]) if gender_data["values"] else 0
    distribution_rows = []
    for label, count in zip(gender_data["labels"], gender_data["values"]):
        percent = int(round((count / total_gender) * 100)) if total_gender else 0
        distribution_rows.append(
            {
                "label": label,
                "count": count,
                "percent": max(percent, 2 if count > 0 else 0),
            }
        )

    timeline_labels, timeline_values = _timeline_last_12_months(students)
    max_timeline = max(timeline_values) if timeline_values else 0
    timeline_bars = []
    for label, value in zip(timeline_labels, timeline_values):
        bar_height = int((value / max_timeline) * 170) if max_timeline > 0 else 4
        timeline_bars.append(
            {
                "label": label,
                "value": value,
                "height": max(bar_height, 4),
            }
        )

    return {
        "user": user,
        "role": role,
        "is_admin": role == "ADMIN",
        "can_restore_admin": can_restore_admin,
        "data_label": data_label,
        "global_navbar": "",
        "total_students": total_students,
        "total_sessions": total_sessions,
        "distribution_rows": distribution_rows,
        "timeline_bars": timeline_bars,
    }
