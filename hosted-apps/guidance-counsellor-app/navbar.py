def build_global_navbar(role):
    if role not in {"ADMIN", "AppBuilder"}:
        return ""

    sync_button = ""
    if role == "ADMIN":
        sync_button = """
      <form method=\"post\" action=\"/admin/sync-spreadsheets\" style=\"display:inline-block; margin-left:10px;\">
        <button type=\"submit\" style=\"display:inline-block; padding:8px 12px; border-radius:8px; background:#0f766e; color:white; border:0; cursor:pointer;\">Sync Spreadsheets</button>
      </form>
        """

    return f"""
    <div style="background:#ffffff; border-bottom:1px solid #e5e7eb; padding:10px 16px; margin-bottom:12px;">
      <a href="/dashboard">Home</a>
      <a href="/infrastructure" style="margin-left:10px;">Infrastructure</a>
      <a href="/user-roles" style="margin-left:10px;">User Roles</a>
      <a href="/user-roles" style="margin-left:12px; display:inline-block; padding:8px 12px; border-radius:8px; background:#1f2937; color:white; text-decoration:none;">Open Admin Items</a>
      {sync_button}
    </div>
    """