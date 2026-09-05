import unittest
import shutil
import tempfile
import sqlite3
from pathlib import Path
from datetime import datetime, timedelta
from fastapi.testclient import TestClient

from backend.main import app
from backend.database import (
    get_db,
    get_analytics_report,
    create_database_backup,
    list_database_backups,
    restore_database_from_backup,
    create_user,
    set_dynamic_setting,
)
from backend.auth import hash_password, create_access_token


class TestAnalyticsAndBackup(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from backend.database import get_connection
        from backend.auth import hash_password

        with get_connection() as conn:
            conn.execute("DELETE FROM users WHERE id IN ('analytics_admin_id', 'analytics_editor_id')")
            conn.execute("""
                INSERT INTO users (id, username, password_hash, full_name, role, is_active, created_at)
                VALUES 
                ('analytics_admin_id', 'analytics_admin', ?, 'Analytics Admin', 'admin', 1, '2026-01-01T00:00:00'),
                ('analytics_editor_id', 'analytics_editor', ?, 'Analytics Editor', 'editor', 1, '2026-01-01T00:00:00')
            """, (hash_password("pass123"), hash_password("pass123")))
            conn.commit()

        cls.client = TestClient(app)
        cls.admin_token = create_access_token({
            "sub": "analytics_admin_id",
            "username": "analytics_admin",
            "role": "admin",
        })
        cls.editor_token = create_access_token({
            "sub": "analytics_editor_id",
            "username": "analytics_editor",
            "role": "editor",
        })
        cls.admin_headers = {"Authorization": f"Bearer {cls.admin_token}"}
        cls.editor_headers = {"Authorization": f"Bearer {cls.editor_token}"}

    @classmethod
    def tearDownClass(cls):
        from backend.database import get_connection
        with get_connection() as conn:
            conn.execute("DELETE FROM users WHERE id IN ('analytics_admin_id', 'analytics_editor_id')")
            conn.commit()

    def setUp(self):
        # Insert test jobs for analytics
        now = datetime.now()
        with get_db(write=True) as conn:
            # Seed jobs across multiple dates
            conn.execute("""
                INSERT OR REPLACE INTO jobs (id, url, track_id, variant, format, requested_by, status, bytes, created_at, provider, category)
                VALUES 
                ('test_j1', 'https://artlist.io/song/1', 'track_1', 'main', 'WAV', 'editor_alice', 'completed', 10485760, ?, 'artlist', 'music'),
                ('test_j2', 'https://elements.envato.com/audio/2', 'track_2', 'main', 'WAV', 'editor_bob', 'completed', 5242880, ?, 'envato', 'sfx'),
                ('test_j3', 'https://artlist.io/song/3', 'track_3', 'main', 'WAV', 'editor_alice', 'failed', 0, ?, 'artlist', 'music')
            """, (
                now.strftime("%Y-%m-%dT10:00:00"),
                (now - timedelta(days=2)).strftime("%Y-%m-%dT11:00:00"),
                (now - timedelta(days=5)).strftime("%Y-%m-%dT12:00:00"),
            ))

    def test_analytics_report_calculation(self):
        report = get_analytics_report(period="daily", days=7)
        self.assertEqual(report["period"], "daily")
        self.assertIn("summary", report)
        self.assertGreaterEqual(report["summary"]["total_requests"], 3)
        self.assertGreaterEqual(report["summary"]["completed_downloads"], 2)
        self.assertGreaterEqual(report["summary"]["failed_downloads"], 1)
        self.assertIn("timeline", report)
        self.assertIn("platforms", report)
        self.assertIn("leaderboard", report)

    def test_analytics_api_permissions(self):
        # Admin access should succeed
        res = self.client.get("/api/v1/admin/analytics?period=daily", headers=self.admin_headers)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("summary", data)

        # Editor access should be rejected (403)
        res_ed = self.client.get("/api/v1/admin/analytics?period=daily", headers=self.editor_headers)
        self.assertEqual(res_ed.status_code, 403)

    def test_analytics_csv_export(self):
        res = self.client.get("/api/v1/admin/analytics/export?period=daily", headers=self.admin_headers)
        self.assertEqual(res.status_code, 200)
        self.assertIn("text/csv", res.headers.get("content-type", ""))
        self.assertIn("STOCKS LIBRARY", res.text)
        self.assertIn("EDITOR UTILIZATION", res.text)

    def test_database_backup_and_restore(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            backup_file = create_database_backup(destination_dir=tmp_path)
            self.assertTrue(backup_file.exists())
            self.assertGreater(backup_file.stat().st_size, 0)

            # Test backup listing
            backups = list_database_backups(backup_dir=tmp_path)
            self.assertGreaterEqual(len(backups), 1)
            self.assertEqual(backups[0]["filename"], backup_file.name)

            # Test online restore
            restored = restore_database_from_backup(backup_file)
            self.assertTrue(restored)

    def test_backup_api_endpoints(self):
        # 1. Download backup endpoint
        res = self.client.get("/api/v1/admin/backup/download", headers=self.admin_headers)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.headers.get("content-type"), "application/x-sqlite3")

        # 2. Create backup endpoint
        res_create = self.client.post("/api/v1/admin/backup/create", headers=self.admin_headers)
        self.assertEqual(res_create.status_code, 200)
        data = res_create.json()
        self.assertEqual(data["status"], "success")
        self.assertTrue(data.get("filename", "").endswith(".db"))

        # 3. List backups endpoint
        res_list = self.client.get("/api/v1/admin/backup/list", headers=self.admin_headers)
        self.assertEqual(res_list.status_code, 200)
        list_data = res_list.json()
        self.assertIn("backups", list_data)
        self.assertGreaterEqual(len(list_data["backups"]), 1)

    def test_user_change_password_self_service(self):
        # 1. Editor tries with wrong current password -> rejected 400
        res_fail = self.client.post(
            "/api/v1/auth/change-password",
            json={"current_password": "wrongpassword", "new_password": "newpassword123"},
            headers=self.editor_headers,
        )
        self.assertEqual(res_fail.status_code, 400)

        # 2. Editor changes with correct password -> 200
        res_ok = self.client.post(
            "/api/v1/auth/change-password",
            json={"current_password": "pass123", "new_password": "updatedpassword123"},
            headers=self.editor_headers,
        )
        self.assertEqual(res_ok.status_code, 200)
        self.assertEqual(res_ok.json()["status"], "password_updated")

        # 3. Verify login with old password fails
        res_old_login = self.client.post(
            "/api/v1/auth/login",
            json={"username": "analytics_editor", "password": "pass123"},
        )
        self.assertEqual(res_old_login.status_code, 401)

        # 4. Verify login with new password succeeds
        res_new_login = self.client.post(
            "/api/v1/auth/login",
            json={"username": "analytics_editor", "password": "updatedpassword123"},
        )
        self.assertEqual(res_new_login.status_code, 200)

        # Reset password back to pass123 for other tests
        self.client.post(
            "/api/v1/auth/change-password",
            json={"current_password": "updatedpassword123", "new_password": "pass123"},
            headers={"Authorization": f"Bearer {res_new_login.json()['access_token']}"},
        )

    def test_user_detailed_report_permissions_and_data(self):
        # 1. Editor viewing own report -> 200 OK
        res_own = self.client.get("/api/v1/users/analytics_editor/report", headers=self.editor_headers)
        self.assertEqual(res_own.status_code, 200)
        own_data = res_own.json()
        self.assertEqual(own_data["user"]["username"], "analytics_editor")
        self.assertIn("summary", own_data)
        self.assertIn("platforms", own_data)
        self.assertIn("history", own_data)

        # 2. Editor viewing another user's report -> 403 Forbidden
        res_forbidden = self.client.get("/api/v1/users/analytics_admin/report", headers=self.editor_headers)
        self.assertEqual(res_forbidden.status_code, 403)

        # 3. Admin viewing editor's report -> 200 OK
        res_admin = self.client.get("/api/v1/users/analytics_editor/report", headers=self.admin_headers)
        self.assertEqual(res_admin.status_code, 200)
        admin_view_data = res_admin.json()
        self.assertEqual(admin_view_data["user"]["username"], "analytics_editor")


if __name__ == "__main__":
    unittest.main()

