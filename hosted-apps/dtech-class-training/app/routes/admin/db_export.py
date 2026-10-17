import os
from flask import Blueprint, Response, abort
from flask import current_app as app
from flask_login import current_user, login_required
from subprocess import Popen, PIPE

admin_db_export = Blueprint('admin_db_export', __name__)

@admin_db_export.route('/export-db')
@login_required
def export_db():
    # Require explicit enablement and teacher access.
    export_enabled = os.environ.get('ENABLE_DB_EXPORT', '0') == '1'
    if not current_user.is_teacher() or not app.debug or not export_enabled:
        abort(403)
    db_url = app.config['SQLALCHEMY_DATABASE_URI']
    if not db_url.startswith('postgresql'):
        return 'Only PostgreSQL export supported.'
    # Parse DB URL
    import re
    m = re.match(r'postgresql://([^:]+):([^@]+)@([^:/]+)(?::(\d+))?/([^?]+)', db_url)
    if not m:
        return 'Could not parse DB URL.'
    user, password, host, port, dbname = m.groups()
    port = port or '5432'
    # Set env for pg_dump
    env = os.environ.copy()
    env['PGPASSWORD'] = password
    # Run pg_dump
    cmd = [
        'pg_dump',
        '-h', host,
        '-U', user,
        '-p', port,
        '--no-owner',
        '--no-privileges',
        dbname
    ]
    proc = Popen(cmd, stdout=PIPE, stderr=PIPE, env=env)
    out, err = proc.communicate()
    if proc.returncode != 0:
        return f'Error: {err.decode()}'
    return Response(out, mimetype='application/sql', headers={
        'Content-Disposition': 'attachment; filename=backup.sql'
    })
