import datetime


def build_global_footer():
    updated = datetime.datetime.now().strftime("%Y-%m-%d")
    return f"""
    <footer style="height:1.5cm; min-height:1.5cm; background:#ffffff; border-top:1px solid #e5e7eb; display:flex; align-items:center; justify-content:center; color:#475569; font-size:14px; margin-top:18px;">
      App Lasted Updated: {updated}
    </footer>
    """