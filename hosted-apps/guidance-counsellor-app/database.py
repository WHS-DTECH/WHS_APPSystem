import sqlite3
import json
import os
import sys
import hashlib
import secrets
from urllib.parse import urlsplit
from cryptography.fernet import Fernet

try:
    import psycopg
except Exception:
    psycopg = None


ADMIN_USERNAME = "vanessapringle@westlandhigh.school.nz"

class StudentBackend:
    def __init__(self):
        # --- EXE PATH LOGIC ---
        if getattr(sys, 'frozen', False):
            base_dir = os.path.dirname(sys.executable)
        else:
            base_dir = os.path.dirname(os.path.abspath(__file__))

        self.database_url = self._resolve_database_url()
        self.use_postgres = bool(self.database_url and psycopg)
        self.storage_kind = "postgresql" if self.use_postgres else "sqlite"

        if self.use_postgres:
            self.db_name = self._redacted_database_url(self.database_url)
        else:
            self.db_name = self._resolve_db_path(base_dir)

        self.key = b'S3iCjL6K4w7T8hR9gQ1vB2nN5mY0xZ4aP8oU7iE6wH4='
        self.cipher = Fernet(self.key)
        self._setup()

    def _resolve_database_url(self):
        raw = (os.getenv("DATABASE_URL") or "").strip()
        if not raw:
            return ""
        if raw.startswith("postgres://"):
            return "postgresql://" + raw[len("postgres://") :]
        return raw

    def _redacted_database_url(self, database_url):
        try:
            parsed = urlsplit(database_url)
            host = parsed.hostname or "host"
            port = f":{parsed.port}" if parsed.port else ""
            dbname = parsed.path.lstrip("/") or "db"
            user = parsed.username or "user"
            return f"postgresql://{user}:***@{host}{port}/{dbname}"
        except Exception:
            return "postgresql://***"

    def _resolve_db_path(self, base_dir):
        # 1) Explicit env override: use this for persistent storage mounts.
        configured_path = (
            os.getenv("STUDENT_DB_PATH")
            or os.getenv("DATABASE_PATH")
            or ""
        ).strip()
        if configured_path:
            parent = os.path.dirname(configured_path)
            if parent:
                os.makedirs(parent, exist_ok=True)
            return configured_path

        # 2) Render default persistent disk convention.
        render_disk_dir = "/var/data"
        if os.path.isdir(render_disk_dir):
            return os.path.join(render_disk_dir, "students_secure.db")

        # 3) Fallback: local project/exe directory.
        return os.path.join(base_dir, "students_secure.db")

    def _setup(self):
        encrypted_type = "BYTEA" if self.use_postgres else "BLOB"
        self._execute(
            f"""
                CREATE TABLE IF NOT EXISTS students (
                    student_id TEXT PRIMARY KEY,
                    encrypted_data {encrypted_type}
                )
            """
        )
        self._execute(
            f"""
                CREATE TABLE IF NOT EXISTS custom_options (
                    category TEXT,
                    encrypted_value {encrypted_type},
                    PRIMARY KEY (category, encrypted_value)
                )
            """
        )
        self._execute(
            f"""
                CREATE TABLE IF NOT EXISTS users (
                    username TEXT PRIMARY KEY,
                    password_hash {encrypted_type},
                    salt {encrypted_type}
                )
            """
        )
        self._execute(
            """
                CREATE TABLE IF NOT EXISTS user_roles (
                    username TEXT PRIMARY KEY,
                    role TEXT NOT NULL
                )
            """
        )
        self._execute(
            """
                CREATE TABLE IF NOT EXISTS spreadsheet_sync_config (
                    config_key TEXT PRIMARY KEY,
                    config_value TEXT,
                    updated_at TEXT
                )
            """
        )
        self._execute(
            """
                CREATE TABLE IF NOT EXISTS spreadsheet_uploads (
                    original_name TEXT,
                    stored_name TEXT,
                    folder_label TEXT,
                    uploaded_at TEXT
                )
            """
        )

        self.ensure_admin_account()

    def _execute(self, query, params=(), fetch=None):
        if self.use_postgres:
            pg_query = self._adapt_postgres_query(query.replace("?", "%s"))
            with psycopg.connect(self.database_url) as conn:
                with conn.cursor() as cursor:
                    cursor.execute(pg_query, params)
                    if fetch == "one":
                        return cursor.fetchone()
                    if fetch == "all":
                        return cursor.fetchall()
            return None

        with sqlite3.connect(self.db_name) as conn:
            cursor = conn.execute(query, params)
            if fetch == "one":
                return cursor.fetchone()
            if fetch == "all":
                return cursor.fetchall()
        return None

    def _adapt_postgres_query(self, query):
        normalized = " ".join(query.split())

        if normalized.startswith("INSERT OR REPLACE INTO students"):
            return (
                "INSERT INTO students (student_id, encrypted_data) VALUES (%s, %s) "
                "ON CONFLICT (student_id) DO UPDATE SET encrypted_data = EXCLUDED.encrypted_data"
            )

        if normalized.startswith("INSERT OR REPLACE INTO user_roles"):
            return (
                "INSERT INTO user_roles (username, role) VALUES (%s, %s) "
                "ON CONFLICT (username) DO UPDATE SET role = EXCLUDED.role"
            )

        if normalized.startswith("INSERT OR REPLACE INTO users"):
            return (
                "INSERT INTO users (username, password_hash, salt) VALUES (%s, %s, %s) "
                "ON CONFLICT (username) DO UPDATE SET "
                "password_hash = EXCLUDED.password_hash, salt = EXCLUDED.salt"
            )

        if normalized.startswith("INSERT OR IGNORE INTO custom_options"):
            return (
                "INSERT INTO custom_options (category, encrypted_value) VALUES (%s, %s) "
                "ON CONFLICT (category, encrypted_value) DO NOTHING"
            )

        if normalized.startswith("INSERT OR REPLACE INTO spreadsheet_sync_config"):
            return (
                "INSERT INTO spreadsheet_sync_config (config_key, config_value, updated_at) VALUES (%s, %s, %s) "
                "ON CONFLICT (config_key) DO UPDATE SET "
                "config_value = EXCLUDED.config_value, updated_at = EXCLUDED.updated_at"
            )

        return query

    def _encrypt(self, data_dict):
        return self.cipher.encrypt(json.dumps(data_dict).encode())

    def _decrypt(self, encrypted_blob):
        return json.loads(self.cipher.decrypt(bytes(encrypted_blob)).decode())

    # --- BACKWARD COMPATIBILITY BRIDGE ---
    def get_stored_user(self):
        """
        Bridge for older main.py versions. Since hashes cannot be decrypted, 
        this returns a dummy password if a user exists to satisfy old checks.
        """
        try:
            row = self._execute("SELECT username FROM users LIMIT 1", fetch="one")
            if row:
                # Returns (username, dummy_password) so existing main.py checks won't crash
                return (row[0], "SECURE_HASHED_PASSWORD_PLACEHOLDER")
        except Exception as e:
            print(f"Compatibility error fetching user: {e}")
        return None

    def verify_user_login(self, username, provided_password):
        """Verifies PBKDF2 hashed password against the database."""
        try:
            row = self._execute(
                "SELECT password_hash, salt FROM users WHERE username = ?",
                (username,),
                fetch="one",
            )
            if row:
                stored_hash = bytes(row[0])
                salt = bytes(row[1])
                computed_hash = hashlib.pbkdf2_hmac('sha256', provided_password.encode(), salt, 100_000)
                return secrets.compare_digest(stored_hash, computed_hash)
        except Exception as e:
            print(f"Error during verification: {e}")
        return False

    def has_registered_user(self):
        return self.get_stored_user() is not None

    def ensure_admin_account(self):
        admin_username = ADMIN_USERNAME
        try:
            row = self._execute(
                "SELECT username FROM users WHERE username = ?",
                (admin_username,),
                fetch="one",
            )
            if row is None:
                salt = secrets.token_bytes(16)
                pwd_hash = hashlib.pbkdf2_hmac('sha256', b"Admin2026!", salt, 100_000)
                self._execute(
                    "INSERT INTO users (username, password_hash, salt) VALUES (?, ?, ?)",
                    (admin_username, pwd_hash, salt),
                )
            role_row = self._execute(
                "SELECT role FROM user_roles WHERE username = ?",
                (admin_username,),
                fetch="one",
            )
            if role_row is None:
                self._execute(
                    "INSERT OR REPLACE INTO user_roles (username, role) VALUES (?, ?)",
                    (admin_username, "ADMIN"),
                )
        except Exception as e:
            print(f"Error creating admin account: {e}")

    def normalize_role(self, role):
        role_text = (role or "Counsellor").strip()
        if role_text.upper() == "ADMIN":
            return "ADMIN"
        if role_text.upper() == "COUNSELLOR":
            return "Counsellor"
        if role_text.upper() == "APPBUILDER":
            return "AppBuilder"
        return "Counsellor"

    def set_user_role(self, username, role):
        normalized_role = self.normalize_role(role)
        try:
            self._execute(
                "INSERT OR REPLACE INTO user_roles (username, role) VALUES (?, ?)",
                (username, normalized_role),
            )
        except Exception as e:
            print(f"Error updating role: {e}")

    def get_user_role(self, username):
        try:
            row = self._execute("SELECT role FROM user_roles WHERE username = ?", (username,), fetch="one")
            if row:
                return self.normalize_role(row[0])
        except Exception as e:
            print(f"Error reading role: {e}")
        return "Counsellor"

    def get_user_role_record(self, username):
        try:
            row = self._execute("SELECT role FROM user_roles WHERE username = ?", (username,), fetch="one")
            if row:
                return self.normalize_role(row[0])
        except Exception as e:
            print(f"Error reading role record: {e}")
        return None

    def list_user_roles(self):
        users = []
        try:
            rows = self._execute("SELECT username FROM users ORDER BY username", fetch="all") or []
            for row in rows:
                username = row[0]
                role = self.get_user_role(username)
                users.append({"username": username, "role": role})
        except Exception as e:
            print(f"Error listing users: {e}")
        return users

    # --- STUDENT METHODS ---
    def upsert_student(self, student_id, data_dict):
        encrypted_blob = self._encrypt(data_dict)
        self._execute(
            "INSERT OR REPLACE INTO students (student_id, encrypted_data) VALUES (?, ?)",
            (student_id, encrypted_blob),
        )

    def delete_student(self, student_id):
        self._execute("DELETE FROM students WHERE student_id = ?", (student_id,))

    def get_all_students_list(self):
        students = []
        try:
            rows = self._execute("SELECT encrypted_data FROM students", fetch="all") or []
            for row in rows:
                students.append(self._decrypt(row[0]))
        except Exception as e:
            print(f"Error loading students: {e}")
        return students

    def get_dummy_students(self):
        return [
            {"student_id": "DUMMY-001", "full_name": "Sample Student A", "preferred_name": "A", "gender": "Female", "ethnicity": "NZ European", "referral_type": "Self", "notes": "Dummy dataset for AppBuilder"},
            {"student_id": "DUMMY-002", "full_name": "Sample Student B", "preferred_name": "B", "gender": "Male", "ethnicity": "Māori", "referral_type": "School", "notes": "Dummy dataset for AppBuilder"},
        ]
    
    # --- CUSTOM OPTIONS METHODS ---
    def add_custom_option(self, category, value):
        try:
            encrypted_val = self.cipher.encrypt(value.encode())
            self._execute(
                "INSERT OR IGNORE INTO custom_options (category, encrypted_value) VALUES (?, ?)",
                (category, encrypted_val),
            )
        except Exception as e:
            print(f"Error saving custom option: {e}")

    def get_custom_options(self, category):
        try:
            rows = self._execute(
                "SELECT encrypted_value FROM custom_options WHERE category = ?",
                (category,),
                fetch="all",
            ) or []
            decrypted_options = []
            for row in rows:
                decrypted_options.append(self.cipher.decrypt(bytes(row[0])).decode())
            decrypted_options.sort()
            return decrypted_options
        except Exception as e:
            print(f"Error loading custom options: {e}")
            return []

    # --- AUTHENTICATION REGISTER ---
    def register_user(self, username, password):
        try:
            salt = secrets.token_bytes(16)
            pwd_hash = hashlib.pbkdf2_hmac('sha256', password.encode(), salt, 100_000)
            self._execute(
                "INSERT OR REPLACE INTO users (username, password_hash, salt) VALUES (?, ?, ?)",
                (username, pwd_hash, salt),
            )
            default_role = "ADMIN" if not self.has_registered_user() else "Counsellor"
            self.set_user_role(username, default_role)
        except Exception as e:
            print(f"Error registering user: {e}")

    def set_google_login(self, username, display_name):
        try:
            existing_role = self.get_user_role_record(username)
            self._execute(
                "INSERT OR REPLACE INTO users (username, password_hash, salt) VALUES (?, ?, ?)",
                (username, b"google", b"google"),
            )

            if existing_role:
                self.set_user_role(username, existing_role)
            else:
                self.set_user_role(username, "Counsellor")
        except Exception as e:
            print(f"Error storing Google login: {e}")

    # --- SPREADSHEET UPLOAD/SYNC CONFIG ---
    def set_sync_config(self, key, value, updated_at):
        self._execute(
            "INSERT OR REPLACE INTO spreadsheet_sync_config (config_key, config_value, updated_at) VALUES (?, ?, ?)",
            (key, value, updated_at),
        )

    def get_sync_config(self, key):
        row = self._execute(
            "SELECT config_value, updated_at FROM spreadsheet_sync_config WHERE config_key = ?",
            (key,),
            fetch="one",
        )
        if not row:
            return {"value": "", "updated_at": ""}
        return {"value": row[0] or "", "updated_at": row[1] or ""}

    def record_spreadsheet_upload(self, original_name, stored_name, folder_label, uploaded_at):
        self._execute(
            "INSERT INTO spreadsheet_uploads (original_name, stored_name, folder_label, uploaded_at) VALUES (?, ?, ?, ?)",
            (original_name, stored_name, folder_label, uploaded_at),
        )

    def list_spreadsheet_uploads(self, limit=200):
        rows = self._execute(
            "SELECT original_name, folder_label, uploaded_at FROM spreadsheet_uploads ORDER BY uploaded_at DESC LIMIT ?",
            (limit,),
            fetch="all",
        ) or []
        return [
            {
                "file_name": row[0] or "",
                "folder_label": row[1] or "",
                "uploaded_at": row[2] or "",
            }
            for row in rows
        ]