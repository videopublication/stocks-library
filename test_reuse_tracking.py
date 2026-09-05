import unittest
from datetime import datetime
from fastapi.testclient import TestClient

from backend.main import app
from backend.database import (
    get_db,
    init_db,
    log_reuse_event,
    get_reuse_statistics,
    get_user_audit_stats,
    get_user_detailed_report,
    get_analytics_report,
)
from backend.auth import hash_password, create_access_token


class TestReuseTracking(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db()
        with get_db(write=True) as conn:
            conn.execute("DELETE FROM users WHERE id IN ('reuse_admin_id', 'reuse_editor1_id', 'reuse_editor2_id')")
            conn.execute("""
                INSERT INTO users (id, username, password_hash, full_name, role, is_active, created_at)
                VALUES 
                ('reuse_admin_id', 'reuse_admin', ?, 'Reuse Admin', 'admin', 1, '2026-01-01T00:00:00'),
                ('reuse_editor1_id', 'reuse_alice', ?, 'Alice Editor', 'editor', 1, '2026-01-01T00:00:00'),
                ('reuse_editor2_id', 'reuse_bob', ?, 'Bob Editor', 'editor', 1, '2026-01-01T00:00:00')
            """, (hash_password("pass123"), hash_password("pass123"), hash_password("pass123")))

            # Insert sample track for reuse testing
            conn.execute("""
                INSERT OR REPLACE INTO tracks (track_id, variant, title, filename, library_path, url, provider, category, bytes, hit_count, requested_by, downloaded_at, first_job_id)
                VALUES ('reuse_track_1', 'main', 'Cinematic Epic Drone', 'cinematic_drone.wav', 'C:/fake/cinematic_drone.wav', 'https://artlist.io/song/999', 'artlist', 'music', 20971520, 1, 'reuse_alice', '2026-01-01T00:00:00', 'job_init_alice')
            """)

        cls.client = TestClient(app)
        cls.admin_token = create_access_token({
            "sub": "reuse_admin_id",
            "username": "reuse_admin",
            "role": "admin",
        })
        cls.editor_token = create_access_token({
            "sub": "reuse_editor2_id",
            "username": "reuse_bob",
            "role": "editor",
        })
        cls.admin_headers = {"Authorization": f"Bearer {cls.admin_token}"}
        cls.editor_headers = {"Authorization": f"Bearer {cls.editor_token}"}

    @classmethod
    def tearDownClass(cls):
        with get_db(write=True) as conn:
            conn.execute("DELETE FROM users WHERE id IN ('reuse_admin_id', 'reuse_editor1_id', 'reuse_editor2_id')")
            conn.execute("DELETE FROM tracks WHERE track_id = 'reuse_track_1'")
            conn.execute("DELETE FROM reuse_events WHERE track_id = 'reuse_track_1'")
            conn.execute("DELETE FROM jobs WHERE track_id = 'reuse_track_1'")

    def test_log_reuse_event_and_stats(self):
        # Alice originally licensed track_1, Bob reuses it multiple times
        for _ in range(6):
            event = log_reuse_event(
                track_id="reuse_track_1",
                variant="main",
                reused_by="reuse_bob",
                source="test_script",
            )
        self.assertIsNotNone(event)
        self.assertEqual(event["track_id"], "reuse_track_1")
        self.assertEqual(event["reused_by"], "reuse_bob")
        self.assertEqual(event["original_downloader"], "reuse_alice")
        self.assertEqual(event["bytes"], 20971520)

        # Query stats
        stats = get_reuse_statistics(days=30)
        self.assertGreaterEqual(stats["total_reuses"], 6)
        self.assertGreaterEqual(stats["total_bytes_saved"], 20971520 * 6)
        self.assertTrue(len(stats["top_assets"]) > 0)
        
        top_asset = next((a for a in stats["top_assets"] if a["track_id"] == "reuse_track_1"), None)
        self.assertIsNotNone(top_asset)
        self.assertEqual(top_asset["original_downloader"], "reuse_alice")
        self.assertEqual(top_asset["reuse_count"], 6)

    def test_admin_reuses_api(self):
        res = self.client.get("/api/v1/admin/reuses?days=30", headers=self.admin_headers)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("total_reuses", data)
        self.assertIn("top_assets", data)

        # Editor should be forbidden
        res_ed = self.client.get("/api/v1/admin/reuses?days=30", headers=self.editor_headers)
        self.assertEqual(res_ed.status_code, 403)

    def test_user_detailed_report_reuse_metrics(self):
        # Alice should have teammate_reuses >= 1
        alice_rep = get_user_detailed_report("reuse_alice")
        self.assertIsNotNone(alice_rep)
        self.assertGreaterEqual(alice_rep["summary"]["teammate_reuses"], 1)

        # Bob should have personal_reuses >= 1 and bandwidth saved >= 20971520
        bob_rep = get_user_detailed_report("reuse_bob")
        self.assertIsNotNone(bob_rep)
        self.assertGreaterEqual(bob_rep["summary"]["personal_reuses"], 1)
        self.assertGreaterEqual(bob_rep["summary"]["bandwidth_saved"], 20971520)

    def test_analytics_report_reuse_inclusion(self):
        report = get_analytics_report(period="daily", days=30)
        self.assertIn("total_reuses", report["summary"])
        self.assertIn("bandwidth_saved", report["summary"])
        self.assertIn("top_reused", report)


if __name__ == "__main__":
    unittest.main()
