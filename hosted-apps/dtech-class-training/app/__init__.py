import os

from flask import Flask, render_template
from flask_login import LoginManager
from flask_migrate import Migrate
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()
login_manager = LoginManager()
migrate = Migrate()


def create_app(skip_socketio=False):
    app = Flask(__name__, static_folder="../static", static_url_path="/static")
    from config import config

    app.config.from_object(config[os.environ.get("FLASK_CONFIG", "production")])
    db.init_app(app)
    login_manager.init_app(app)
    migrate.init_app(app, db)

    from app.routes import auth, main, courses, assignments, quizzes, notifications, lessons
    from app.routes.admin_routes import bp as admin_bp
    from app.routes.admin.db_export import admin_db_export

    for blueprint in [auth.bp, main.bp, courses.bp, assignments.bp, quizzes.bp,
                      lessons.lessons_bp, admin_bp, notifications.bp]:
        app.register_blueprint(blueprint)
    app.register_blueprint(admin_db_export, url_prefix="/admin")

    # Preserve url_for references in the original templates; shared auth intercepts these.
    app.add_url_rule("/login/google", endpoint="google.login", view_func=lambda: ("Use school sign-in.", 403))

    @app.errorhandler(500)
    def internal_error(error):
        db.session.rollback()
        return render_template("errors/500.html"), 500

    for code in [403, 404]:
        app.register_error_handler(code, lambda error: (render_template(f"errors/{error.code}.html"), error.code))

    @app.context_processor
    def inject_admin_info():
        return {"admin_email": os.environ.get("ADMIN_EMAIL", "")}

    return app
