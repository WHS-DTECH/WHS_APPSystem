import gc
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
sys.dont_write_bytecode = True
TEMP = tempfile.TemporaryDirectory(prefix="whs-guidance-roles-")
os.environ.pop("DATABASE_URL", None)
os.environ.update(
    STUDENT_DB_PATH=str(Path(TEMP.name) / "test.db"),
    WHS_APP_MODULE="app:app",
    WHS_PROXY_TOKEN="test-token",
    WHS_ROLE_MANAGEMENT_URL="/hubs/app-guidance-counsellor-app/roles",
    SCRIPT_NAME="/apps/guidance-counsellor-app",
    SECRET_KEY="test-only",
)
sys.path.insert(0, str(ROOT / "hosted-apps" / "guidance-counsellor-app"))
sys.path.insert(0, str(ROOT / "hosted-apps" / "_host"))
import whs_host
import app as guidance


class GlobalRoleTests(unittest.TestCase):
    def setUp(self):
        self.client = whs_host.app.test_client()
        self.student = {
            "student_id": "PRIVATE-TEST",
            "full_name": "Private Test Name",
            "notes": "Private Test Notes",
            "sessions": ["Private Session"],
        }
        guidance.backend.upsert_student(self.student["student_id"], self.student)

    def headers(self, role, email="test@example.invalid"):
        return {"X-WHS-Token": "test-token", "X-WHS-User": email, "X-WHS-Role": role}

    def test_global_role_is_authoritative_without_legacy_database_reads_or_writes(self):
        with patch.object(guidance.backend, "get_user_role", side_effect=AssertionError("Legacy role read")), \
             patch.object(guidance.backend, "set_user_role", side_effect=AssertionError("Legacy role write")):
            for role, dataset in [
                ("AppBuilder", "dummy dataset"),
                ("ADMIN", "live dataset (masked)"),
                ("Counsellor", "live dataset"),
            ]:
                response = self.client.get("/students", headers=self.headers(role))
                self.assertEqual(response.status_code, 200)
                self.assertIn(dataset, response.get_data(as_text=True))

    def test_shared_search_preserves_masked_live_and_dummy_dataset_boundaries(self):
        for role in ["ADMIN", "AppBuilder"]:
            response = self.client.get("/api/school-search?q=Private%20Test%20Name", headers=self.headers(role))
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json["results"], [])
        masked = self.client.get("/api/school-search?q=PRIVATE-TEST", headers=self.headers("ADMIN"))
        self.assertTrue(masked.json["results"][0]["title"].startswith("ENC-"))
        for secret in ["Private Test Name", "Private Test Notes", "Private Session"]:
            self.assertNotIn(secret, masked.get_data(as_text=True))
        with patch.object(guidance.backend, "get_dummy_students", return_value=[
            {"student_id": "DUMMY-SEARCH", "full_name": "Dummy Search Student"}
        ]):
            builder = self.client.get("/api/school-search?q=Dummy", headers=self.headers("AppBuilder"))
            self.assertEqual(builder.json["results"][0]["title"], "Dummy Search Student")
        live = self.client.get("/api/school-search?q=Private%20Test%20Name", headers=self.headers("Counsellor"))
        self.assertEqual(live.json["results"][0]["title"], "Private Test Name")
        self.assertIn("/students/profile?student_id=PRIVATE-TEST", live.json["results"][0]["url"])
        self.assertNotIn("Private Test Notes", live.get_data(as_text=True))
        self.assertIn("no-store", live.headers["Cache-Control"])
        self.assertEqual(self.client.get("/api/school-search?q=x", headers=self.headers("Counsellor")).status_code, 400)
        self.assertEqual(self.client.get("/api/school-search?q=Private").status_code, 403)
        revoked = self.client.get("/api/school-search?q=Private%20Test%20Name", headers=self.headers("AppBuilder"))
        self.assertEqual(revoked.json["results"], [])

    def test_shared_search_navigation_and_result_limit(self):
        navigation = self.client.get("/api/school-search?q=Dataset", headers=self.headers("AppBuilder"),
                                     environ_overrides={"SCRIPT_NAME": "/apps/guidance-counsellor-app"})
        self.assertEqual(navigation.json["results"][0]["title"], "Dataset Manager")
        self.assertTrue(navigation.json["results"][0]["url"].startswith("/apps/guidance-counsellor-app/"))
        with patch.object(guidance.backend, "get_dummy_students", return_value=[
            {"student_id": f"DUMMY-{index}", "full_name": f"Student Fixture {index}"} for index in range(55)
        ]):
            response = self.client.get("/api/school-search?q=Student", headers=self.headers("AppBuilder"))
            self.assertEqual(len(response.json["results"]), 50)
            self.assertTrue(response.json["truncated"])

    def test_hosted_dashboard_uses_shared_account_controls(self):
        for role in ["ADMIN", "AppBuilder", "Counsellor"]:
            response = self.client.get("/dashboard", headers=self.headers(role))
            self.assertEqual(response.status_code, 200)
            html = response.get_data(as_text=True)
            self.assertIn("Overview & Analytics", html)
            self.assertNotIn("Welcome,", html)
            self.assertNotIn("Role:", html)
            self.assertNotIn('class="logout-line"', html)
            self.assertNotIn("Restore ADMIN Access", html)

    def test_invalid_roles_and_untrusted_requests_are_denied(self):
        for headers in [{}, self.headers(""), self.headers("UnknownRole")]:
            self.assertEqual(self.client.get("/dashboard", headers=headers).status_code, 403)

    def test_role_changes_apply_on_the_next_request_despite_existing_session(self):
        response = self.client.get("/students/profile?student_id=PRIVATE-TEST", headers=self.headers("Counsellor"))
        self.assertEqual(response.status_code, 200)
        response = self.client.get("/students/profile?student_id=PRIVATE-TEST", headers=self.headers("AppBuilder"))
        self.assertEqual(response.status_code, 302)
        self.assertNotIn(self.student["full_name"], response.get_data(as_text=True))
        response = self.client.get("/students", headers=self.headers("AppBuilder"))
        self.assertIn("dummy dataset", response.get_data(as_text=True))

    def test_old_role_forms_redirect_to_global_control_without_writes(self):
        with patch.object(guidance.backend, "set_user_role", side_effect=AssertionError("Legacy role write")):
            for path in ["/user-roles", "/account/restore-admin"]:
                response = self.client.post(
                    path, data={"username": "test@example.invalid", "role": "Counsellor"},
                    headers=self.headers("ADMIN", guidance.ADMIN_USERNAME),
                )
                self.assertEqual(response.status_code, 303)
                self.assertEqual(response.headers["Location"], "/hubs/app-guidance-counsellor-app/roles")
            response = self.client.get("/user-roles", headers=self.headers("ADMIN"))
            self.assertEqual(response.status_code, 303)

    def test_legacy_login_cannot_replace_global_identity(self):
        for path in ["/register", "/auth/google/login", "/auth/google/callback"]:
            self.assertEqual(self.client.get(path, headers=self.headers("AppBuilder")).status_code, 403)
        self.assertEqual(self.client.post("/login", headers=self.headers("AppBuilder")).status_code, 403)

    def test_navigation_removes_legacy_role_management_links(self):
        html = self.client.get("/dashboard", headers=self.headers("ADMIN")).get_data(as_text=True)
        self.assertNotIn(">User Roles</a>", html)
        self.assertNotIn('href="/apps/guidance-counsellor-app/hubs/', html)
        self.assertNotIn("Open Admin Items", html)
        self.assertNotIn('href="/apps/guidance-counsellor-app/infrastructure"', html)
        builder_html = self.client.get("/dashboard", headers=self.headers("AppBuilder")).get_data(as_text=True)
        self.assertNotIn("Open Admin Items", builder_html)
        students_html = self.client.get("/students", headers=self.headers("ADMIN")).get_data(as_text=True)
        self.assertNotIn(">User Roles</a>", students_html)

    def test_hosted_pages_omit_legacy_toolbar_and_keep_sidebar(self):
        for role in ["ADMIN", "AppBuilder", "Counsellor"]:
            for route in ["/dashboard", "/students", "/students/sessions/new", "/infrastructure"]:
                response = self.client.get(route, headers=self.headers(role))
                self.assertEqual(response.status_code, 200)
                html = response.get_data(as_text=True)
                self.assertNotIn(">Home</a>", html)
                self.assertNotIn("margin-bottom:12px;", html)
                if route in ["/dashboard", "/students"]:
                    self.assertIn('class="sidebar"', html)
                    self.assertIn(">DASHBOARD</a>", html)
                    self.assertIn(">STUDENTS</a>", html)
        with guidance.app.test_request_context():
            self.assertEqual(guidance.current_global_navbar(), "")

    def test_dataset_manager_renamed_without_changing_privacy_views(self):
        for role, visible in [("ADMIN", False), ("AppBuilder", False), ("Counsellor", True)]:
            response = self.client.get("/infrastructure", headers=self.headers(role))
            self.assertEqual(response.status_code, 200)
            html = response.get_data(as_text=True)
            self.assertIn("<title>Dataset Manager</title>", html)
            self.assertIn("<h1>Dataset Manager</h1>", html)
            self.assertNotIn("Infrastructure", html)
            self.assertEqual(self.student["full_name"] in html, visible)

    def test_hosted_pages_load_viewport_layout_and_static_css(self):
        for route in ["/dashboard", "/students", "/students/sessions/new"]:
            html = self.client.get(route, headers=self.headers("ADMIN")).get_data(as_text=True)
            self.assertIn('href="/apps/guidance-counsellor-app/static/hosted-layout.css"', html)
        response = self.client.get("/static/hosted-layout.css", headers=self.headers("ADMIN"))
        self.assertEqual(response.status_code, 200)
        css = response.get_data(as_text=True)
        self.assertIn("min-height: 0", css)
        self.assertIn("grid-template-rows: auto minmax(0, 1fr)", css)
        response.close()

    def test_spreadsheet_sync_moves_to_dataset_manager_and_remains_admin_only(self):
        action = 'action="/apps/guidance-counsellor-app/admin/sync-spreadsheets"'
        for role in ["ADMIN", "AppBuilder", "Counsellor"]:
            for route in ["/dashboard", "/students"]:
                html = self.client.get(route, headers=self.headers(role)).get_data(as_text=True)
                self.assertNotIn(action, html)
            html = self.client.get("/infrastructure", headers=self.headers(role)).get_data(as_text=True)
            self.assertEqual(action in html, role == "ADMIN")
            self.assertEqual("Sync Spreadsheets</button>" in html, role == "ADMIN")
        with patch.object(guidance, "sync_spreadsheet_folder", return_value={
            "imported": 1, "skipped": 0, "files": ["Test.xlsx"],
        }) as sync:
            for role in ["AppBuilder", "Counsellor"]:
                self.client.post("/admin/sync-spreadsheets", headers=self.headers(role))
                sync.assert_not_called()
            response = self.client.post("/admin/sync-spreadsheets", headers=self.headers("ADMIN"))
            sync.assert_called_once()
            self.assertEqual(response.status_code, 302)
            self.assertIn("sync_result=Sync+complete", response.headers["Location"])

    def test_privacy_views_remain_dummy_masked_and_counsellor_only(self):
        for role, visible in [("AppBuilder", False), ("ADMIN", False), ("Counsellor", True)]:
            html = self.client.get("/students", headers=self.headers(role)).get_data(as_text=True)
            self.assertEqual(self.student["full_name"] in html, visible)
            for route in ["/students/profile", "/students/sessions"]:
                response = self.client.get(route + "?student_id=PRIVATE-TEST", headers=self.headers(role))
                self.assertEqual(response.status_code, 200 if visible else 302)
                self.assertEqual(self.student["full_name"] in response.get_data(as_text=True), visible)

    def test_builders_cannot_create_students_upload_or_sync(self):
        with patch.object(guidance.backend, "upsert_student", side_effect=AssertionError("Live student write")), \
             patch.object(guidance, "sync_spreadsheet_folder", side_effect=AssertionError("Live sync")):
            for route in ["/students/edit", "/students/sync-spreadsheets"]:
                self.assertEqual(self.client.get(route, headers=self.headers("AppBuilder")).status_code, 403)
                self.assertEqual(self.client.post(route, data={"action": "run_sync"}, headers=self.headers("AppBuilder")).status_code, 403)

    def test_only_counsellors_can_delete_students(self):
        for role in ["ADMIN", "AppBuilder"]:
            response = self.client.post("/students/delete", data={"student_id": "PRIVATE-TEST"}, headers=self.headers(role))
            self.assertEqual(response.status_code, 403)
            self.assertIsNotNone(guidance.find_student_by_id("PRIVATE-TEST"))
        response = self.client.post("/students/delete", data={"student_id": "PRIVATE-TEST"}, headers=self.headers("Counsellor"))
        self.assertEqual(response.status_code, 302)
        self.assertIsNone(guidance.find_student_by_id("PRIVATE-TEST"))


def tearDownModule():
    gc.collect()
    TEMP.cleanup()


if __name__ == "__main__":
    unittest.main()
