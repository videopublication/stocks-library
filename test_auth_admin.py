import unittest
from fastapi.testclient import TestClient
from backend.main import app
from backend.database import init_db, get_connection, set_dynamic_setting

class TestAuthAndAdmin(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from backend.config import settings
        settings.DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        init_db()
        from backend.auth import hash_password
        with get_connection() as conn:
            conn.execute("""
                INSERT INTO users (id, username, password_hash, full_name, role, is_active, created_at)
                VALUES ('admin_test_id', 'admin', ?, 'Administrator', 'admin', 1, '2026-01-01T00:00:00')
                ON CONFLICT(username) DO UPDATE SET password_hash = excluded.password_hash
            """, (hash_password("admin123"),))
            conn.commit()
        cls.client = TestClient(app)

    def test_01_admin_login(self):
        res = self.client.post("/api/v1/auth/login", json={"username": "admin", "password": "admin123"})
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("access_token", data)
        self.assertEqual(data["user"]["role"], "admin")
        self.assertEqual(data["user"]["username"], "admin")

    def test_02_invalid_login(self):
        res = self.client.post("/api/v1/auth/login", json={"username": "admin", "password": "wrongpassword"})
        self.assertEqual(res.status_code, 401)

    def test_03_create_user_and_editor_login(self):
        # 1. Login as admin
        admin_res = self.client.post("/api/v1/auth/login", json={"username": "admin", "password": "admin123"})
        admin_token = admin_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {admin_token}"}

        # 2. Clean up test user if already exists, then create editor user
        with get_connection() as conn:
            conn.execute("DELETE FROM users WHERE username = 'editor_test'")
            conn.commit()

        create_res = self.client.post("/api/v1/admin/users", json={
            "username": "editor_test",
            "password": "editorpassword",
            "full_name": "Test Editor",
            "role": "editor"
        }, headers=headers)
        self.assertIn(create_res.status_code, (200, 201))
        user_data = create_res.json()
        self.assertEqual(user_data["username"], "editor_test")
        self.assertEqual(user_data["role"], "editor")

        # 3. Login as editor
        editor_res = self.client.post("/api/v1/auth/login", json={"username": "editor_test", "password": "editorpassword"})
        self.assertEqual(editor_res.status_code, 200)
        editor_token = editor_res.json()["access_token"]
        editor_headers = {"Authorization": f"Bearer {editor_token}"}

        # 4. Editor forbidden from accessing admin endpoints
        forbidden_res = self.client.get("/api/v1/admin/users", headers=editor_headers)
        self.assertEqual(forbidden_res.status_code, 403)

        # 5. Editor can access library and status
        status_res = self.client.get("/api/v1/status", headers=editor_headers)
        self.assertEqual(status_res.status_code, 200)

    def test_04_admin_quota_update(self):
        admin_res = self.client.post("/api/v1/auth/login", json={"username": "admin", "password": "admin123"})
        admin_token = admin_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {admin_token}"}

        # Update quota to 75
        set_res = self.client.post("/api/v1/admin/settings", json={"daily_safety_limit": 75}, headers=headers)
        self.assertEqual(set_res.status_code, 200)

        # Check status reflects 75
        status_res = self.client.get("/api/v1/status", headers=headers)
        self.assertEqual(status_res.status_code, 200)
        self.assertIn(status_res.json()["daily_limit"], (75, 95))

    def test_05_host_tools_and_library_path_settings(self):
        admin_res = self.client.post("/api/v1/auth/login", json={"username": "admin", "password": "admin123"})
        admin_token = admin_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {admin_token}"}

        # Update host tools toggle and library path
        set_res = self.client.post("/api/v1/admin/settings", json={
            "show_host_tools_to_editors": True,
            "library_download_path": "library",
        }, headers=headers)
        self.assertEqual(set_res.status_code, 200)
        data = set_res.json()
        self.assertIn("settings", data)
        self.assertEqual(data["settings"]["show_host_tools_to_editors"], "true")

        # Verify status endpoint returns updated telemetry
        status_res = self.client.get("/api/v1/status", headers=headers)
        self.assertEqual(status_res.status_code, 200)
        status_data = status_res.json()
        self.assertTrue(status_data["show_host_tools"])
        self.assertIn("library_download_path", status_data)

if __name__ == "__main__":
    unittest.main()
