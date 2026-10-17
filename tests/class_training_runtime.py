import os
import io
import re
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import URLError

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "hosted-apps" / "dtech-class-training"), str(ROOT / "hosted-apps" / "_host")]
os.environ.update({
    "WHS_APP_MODULE": "whs_training:app",
    "WHS_ROLE_MANAGEMENT_URL": "/hubs/dtech-hub/roles",
    "WHS_PROXY_TOKEN": "fixture-only-token",
    "WHS_ROOT_ROUTE": "/home",
    "WHS_EXIT_URL": "/dtech-hub/",
    "SCRIPT_NAME": "/dtech-hub/class-training",
    "DATABASE_URL": os.environ.get("CLASS_TRAINING_TEST_DATABASE_URL", "sqlite:///:memory:"),
    "SECRET_KEY": "isolated-training-test",
    "FLASK_CONFIG": "production"
})

from whs_host import app
from app import db
from app.models import User, Course, Lesson, Section, Enrollment, LessonProgress, CommentCheck


class TrainingRuntimeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        app.config.update(TESTING=True, APPLICATION_ROOT="/dtech-hub/class-training", PREFERRED_URL_SCHEME="https")
        with app.app_context():
            db.create_all()
            user = User(email="existing@westlandhigh.school.nz", username="existing", role="teacher")
            db.session.add(user)
            db.session.flush()
            course = Course(title="Module 1: Commenting", description="Original course description", teacher_id=user.id)
            db.session.add(course)
            db.session.flush()
            lesson = Lesson(title="Original lesson", course_id=course.id, content="Original content")
            db.session.add(lesson)
            db.session.flush()
            section = Section(title="Original section", lesson_id=lesson.id, content="Retained section content")
            db.session.add(section)
            db.session.add(Enrollment(student_id=user.id, course_id=course.id))
            db.session.commit()
            cls.user_id, cls.course_id, cls.lesson_id, cls.section_id = user.id, course.id, lesson.id, section.id

    def setUp(self):
        self.client = app.test_client()
        self.headers = {"X-WHS-Token": "fixture-only-token", "X-WHS-User": "existing@westlandhigh.school.nz",
                        "X-WHS-Role": "student", "Referer": "https://localhost/dtech-hub/class-training/home"}

    @classmethod
    def tearDownClass(cls):
        with app.app_context():
            db.session.remove()
            db.engine.dispose()

    def get(self, path, **kwargs):
        return self.client.get(path, headers=self.headers, **kwargs)

    def test_original_home_and_course_data_use_existing_account(self):
        response = self.get("/home")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"Computer Lab Hub", response.data)
        self.assertIn(b"/dtech-hub/class-training/static/css/style.css", response.data)
        data = self.get("/api/home-data").json
        self.assertEqual(data["all_courses"][0]["title"], "Module 1: Commenting")
        self.assertEqual(data["lessons"][0]["title"], "Original lesson")
        with app.app_context():
            self.assertEqual(User.query.filter_by(email="existing@westlandhigh.school.nz").count(), 1)
            self.assertEqual(db.session.get(User, self.user_id).role, "teacher")

    def test_core_role_overrides_stored_teacher_and_can_be_revoked(self):
        response = self.get("/admin/dashboard")
        self.assertEqual(response.status_code, 302)
        self.headers["X-WHS-Role"] = "teacher"
        self.assertEqual(self.get("/admin/dashboard").status_code, 200)
        self.headers["X-WHS-Role"] = "student"
        self.assertEqual(self.get("/admin/dashboard").status_code, 302)

    def test_local_role_controls_are_absent_from_teacher_pages(self):
        self.headers["X-WHS-Role"] = "teacher"
        for path in ["/home", "/admin/dashboard", "/admin/"]:
            response = self.get(path)
            self.assertEqual(response.status_code, 200, path)
            self.assertNotIn(b"/admin/user_roles", response.data)
            self.assertNotIn(b"/admin/role_permissions", response.data)
            self.assertNotIn(b"User Role Management", response.data)
            self.assertNotIn(b"Role Permissions", response.data)
            self.assertIn(b"Course Management", response.data)
            self.assertNotIn(b"Admin Dashboard", response.data)
        response = self.get("/admin/")
        self.assertIn(b"<title>Course Management</title>", response.data)

    def test_no_forged_or_missing_proxy_identity(self):
        self.assertEqual(self.client.get("/home").status_code, 403)
        self.headers["X-WHS-Token"] = "forged"
        self.assertEqual(self.get("/home").status_code, 403)

    def test_original_checkers_and_assets(self):
        for url in ["/practice/code-comments", "/practice/debug_checker", "/practice/history",
                    "/static/css/style.css", "/static/js/notifications.js", "/static/img/whs_logo.png"]:
            response = self.get(url)
            self.assertEqual(response.status_code, 200, url)
            response.close()

    def test_student_course_lesson_and_section_routes(self):
        for path in ["/courses/", f"/courses/{self.course_id}",
                     f"/courses/lessons/{self.lesson_id}", f"/lessons/sections/{self.section_id}"]:
            self.assertEqual(self.get(path).status_code, 200, path)

    def test_existing_owner_loses_teacher_editing_with_core_role(self):
        for path in [f"/courses/{self.course_id}/lessons/create",
                     f"/assignments/create/{self.course_id}", f"/quizzes/create/{self.course_id}"]:
            self.assertEqual(self.get(path).status_code, 302, path)

    def test_checker_upload_and_pdf_keep_legacy_history(self):
        token = re.search(r'"csrf": "([^"]+)"', self.get("/home").get_data(as_text=True)).group(1)
        headers = {**self.headers, "X-CSRFToken": token}
        response = self.client.post("/practice/code-comments", headers=headers,
                                    data={"file": (io.BytesIO(b"# Explain the calculation\nprint(1)\n"), "fixture.py")})
        self.assertEqual(response.status_code, 200)
        with app.app_context():
            self.assertEqual(CommentCheck.query.filter_by(user_id=self.user_id, filename="fixture.py").count(), 1)
        response = self.client.post("/download_comments_pdf", headers=headers,
                                    data={"uploaded_filename": "fixture.py", "code": "# Explain the calculation\nprint(1)\n"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.mimetype, "application/pdf")
        self.assertTrue(response.data.startswith(b"%PDF"))

    def test_new_school_account_and_case_insensitive_existing_match(self):
        self.headers["X-WHS-User"] = "EXISTING@westlandhigh.school.nz"
        self.assertEqual(self.get("/home").status_code, 200)
        self.headers["X-WHS-User"] = "new-student@westlandhigh.school.nz"
        self.assertEqual(self.get("/home").status_code, 200)
        self.assertEqual(self.get("/home").status_code, 200)
        with app.app_context():
            self.assertEqual(User.query.filter_by(email="new-student@westlandhigh.school.nz").count(), 1)

    def test_contact_teacher_uses_school_bridge_and_reports_failure(self):
        token = re.search(r'"csrf": "([^"]+)"', self.get("/home").get_data(as_text=True)).group(1)
        headers = {**self.headers, "X-CSRFToken": token}
        data = {"recipient_email": "existing@westlandhigh.school.nz", "subject": "Question", "message": "Help please"}
        with patch.dict(os.environ, {"WHS_CORE_INTERNAL_URL": "http://core-fixture"}):
            with patch("whs_training.urlopen", return_value=io.StringIO('{"success": true}')) as outgoing:
                self.assertTrue(self.client.post("/contact_teacher", headers=headers, data=data).json["success"])
                self.assertEqual(outgoing.call_args.args[0].full_url, "http://core-fixture/internal/dtech-class-training/email")
            with patch("whs_training.urlopen", side_effect=URLError("Test mail unavailable")):
                with self.assertLogs(app.logger, level="ERROR"):
                    response = self.client.post("/contact_teacher", headers=headers, data=data)
                self.assertEqual(response.status_code, 502)
        data["recipient_email"] = "outside@example.invalid"
        self.assertEqual(self.client.post("/contact_teacher", headers=headers, data=data).status_code, 400)

    def test_section_progress_is_preserved_by_lesson_completion(self):
        token = re.search(r'"csrf": "([^"]+)"', self.get("/home").get_data(as_text=True)).group(1)
        response = self.client.post(f"/courses/lessons/{self.lesson_id}/complete",
                                    headers={**self.headers, "X-CSRFToken": token})
        self.assertEqual(response.status_code, 302)
        with app.app_context():
            self.assertTrue(LessonProgress.query.filter_by(student_id=self.user_id, section_id=self.section_id).one().completed)

    def test_local_auth_and_role_editors_do_not_override_core(self):
        self.assertEqual(self.get("/auth/login").location, "/dtech-hub/class-training/home")
        self.assertEqual(self.get("/admin/user_roles").location, "/hubs/dtech-hub/roles")
        self.assertEqual(self.get("/admin/role_permissions").location, "/admin/roles")
        self.assertEqual(self.get("/settings").location, "/profile")
        self.assertEqual(self.get("/admin/api/users-with-roles").status_code, 409)

    def test_csrf_required_and_original_post_persists(self):
        url = f"/courses/{self.course_id}/enroll"
        self.assertEqual(self.client.post(url, headers=self.headers).status_code, 400)
        html = self.get("/home").get_data(as_text=True)
        token = re.search(r'"csrf": "([^"]+)"', html).group(1)
        response = self.client.post(url, headers={**self.headers, "X-CSRFToken": token})
        self.assertEqual(response.status_code, 302)
        with app.app_context():
            self.assertEqual(Enrollment.query.filter_by(student_id=self.user_id, course_id=self.course_id).count(), 1)

    def test_forwarded_school_host_is_used_for_secure_csrf_validation(self):
        headers = {**self.headers, "X-Forwarded-Host": "school.example.invalid",
                   "X-Forwarded-Proto": "https", "Referer": "https://school.example.invalid/dtech-hub/class-training/home"}
        html = self.client.get("/home", headers=headers).get_data(as_text=True)
        token = re.search(r'"csrf": "([^"]+)"', html).group(1)
        response = self.client.post(f"/courses/{self.course_id}/enroll",
                                    headers={**headers, "X-CSRFToken": token})
        self.assertEqual(response.status_code, 302)


if __name__ == "__main__":
    unittest.main()
