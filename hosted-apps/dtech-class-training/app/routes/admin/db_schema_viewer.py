from flask import Blueprint, current_app
from app import db
from sqlalchemy import inspect

admin_db_schema = Blueprint('admin_db_schema', __name__)

@admin_db_schema.route('/admin/db-schema')
def show_db_schema():
    inspector = inspect(db.engine)
    output = []
    output.append("<h2>Table: sections</h2><ul>")
    for col in inspector.get_columns('sections'):
        output.append(f"<li>{col['name']} ({col['type']})</li>")
    output.append("</ul><h3>Foreign Keys for sections:</h3><ul>")
    for fk in inspector.get_foreign_keys('sections'):
        output.append(f"<li>{fk['constrained_columns']} -> {fk['referred_table']}.{fk['referred_columns']}</li>")
    output.append("</ul><h2>Table: lessons2</h2><ul>")
    for col in inspector.get_columns('lessons2'):
        output.append(f"<li>{col['name']} ({col['type']})</li>")
    output.append("</ul><h3>Foreign Keys for lessons2:</h3><ul>")
    for fk in inspector.get_foreign_keys('lessons2'):
        output.append(f"<li>{fk['constrained_columns']} -> {fk['referred_table']}.{fk['referred_columns']}</li>")
    output.append("</ul>")
    return "".join(output)
