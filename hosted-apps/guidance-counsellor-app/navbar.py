def build_global_navbar(role, role_management_url=None):
    if role not in {"ADMIN", "AppBuilder"}:
        return ""

    return """
    <div style="background:#ffffff; border-bottom:1px solid #e5e7eb; padding:10px 16px; margin-bottom:12px;">
      <a href="/dashboard">Home</a>
    </div>
    """