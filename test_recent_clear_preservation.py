import unittest
import uuid
import shutil
import tempfile
from pathlib import Path
from datetime import datetime, timedelta
from backend.config import settings
from backend.database import get_db, init_db, get_user_audit_stats
from backend.service import (
    clear_user_recent_history,
    clear_job_history,
    get_queue_view,
    get_today_downloads_by_provider,
)

class TestRecentClearPreservation(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls._orig_db = settings.DB_PATH
        cls._orig_staging = settings.STAGING_PATH
        cls._orig_library = settings.LIBRARY_PATH
        cls._test_dir = Path(tempfile.mkdtemp(prefix="test_clear_recent_"))
        settings.DB_PATH = cls._test_dir / "test.db"
        settings.STAGING_PATH = cls._test_dir / "staging"
        settings.LIBRARY_PATH = cls._test_dir / "library"
        settings.DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        settings.STAGING_PATH.mkdir(parents=True, exist_ok=True)
        settings.LIBRARY_PATH.mkdir(parents=True, exist_ok=True)
        init_db()

    @classmethod
    def tearDownClass(cls):
        settings.DB_PATH = cls._orig_db
        settings.STAGING_PATH = cls._orig_staging
        settings.LIBRARY_PATH = cls._orig_library
        shutil.rmtree(cls._test_dir, ignore_errors=True)

    def setUp(self):
        init_db()
        # Clean up test jobs from previous test runs if any
        with get_db(write=True) as conn:
            conn.execute("DELETE FROM jobs WHERE requested_by IN ('test_user_a', 'test_user_b')")
            conn.execute("DELETE FROM system_settings WHERE key LIKE 'recent_cleared_test_user_%'")

    def tearDown(self):
        with get_db(write=True) as conn:
            conn.execute("DELETE FROM jobs WHERE requested_by IN ('test_user_a', 'test_user_b')")
            conn.execute("DELETE FROM system_settings WHERE key LIKE 'recent_cleared_test_user_%'")
            conn.execute("DELETE FROM users WHERE username IN ('test_user_a', 'test_user_b')")

    def test_clear_recent_does_not_delete_jobs_or_reset_daily_limit_or_wipe_admin_audit(self):
        now = datetime.now()
        t_minus_10 = (now - timedelta(minutes=10)).isoformat()
        t_minus_5 = (now - timedelta(minutes=5)).isoformat()

        job_a_id = f"job_a_{uuid.uuid4().hex[:8]}"
        job_b_id = f"job_b_{uuid.uuid4().hex[:8]}"

        # Insert 1 job for user A (Artlist) and 1 job for user B (Envato)
        with get_db(write=True) as conn:
            conn.execute("""
                INSERT INTO jobs (id, url, track_id, requested_by, provider, status, created_at, completed_at, bytes, filename)
                VALUES (?, ?, ?, ?, ?, 'done', ?, ?, 1024, 'track_a.mp3')
            """, (job_a_id, "https://artlist.io/test-a", "track_a", "test_user_a", "artlist", t_minus_10, t_minus_10))

            conn.execute("""
                INSERT INTO jobs (id, url, track_id, requested_by, provider, status, created_at, completed_at, bytes, filename)
                VALUES (?, ?, ?, ?, ?, 'done', ?, ?, 2048, 'track_b.mp3')
            """, (job_b_id, "https://elements.envato.com/test-b", "track_b", "test_user_b", "envato", t_minus_5, t_minus_5))

        # Check initial state
        with get_db(write=False) as conn:
            initial_counts = get_today_downloads_by_provider(conn)
        self.assertGreaterEqual(initial_counts.get("artlist", 0), 1)
        self.assertGreaterEqual(initial_counts.get("envato", 0), 1)

        # Check queue view before clearing
        q_user_a = get_queue_view(for_user="test_user_a", requesting_user="test_user_a")
        recent_a_ids = [j["id"] for j in q_user_a["recent"]]
        self.assertIn(job_a_id, recent_a_ids)

        q_user_b = get_queue_view(for_user="test_user_b", requesting_user="test_user_b")
        recent_b_ids = [j["id"] for j in q_user_b["recent"]]
        self.assertIn(job_b_id, recent_b_ids)

        # Now test_user_a clears their recent transports
        clear_user_recent_history("test_user_a")

        # 1. User A's recent list should now be empty (job_a_id excluded)
        q_user_a_after = get_queue_view(for_user="test_user_a", requesting_user="test_user_a")
        recent_a_ids_after = [j["id"] for j in q_user_a_after["recent"]]
        self.assertNotIn(job_a_id, recent_a_ids_after, "User A's recent list should be cleared")

        # 2. User B's recent list should STILL HAVE job_b_id!
        q_user_b_after = get_queue_view(for_user="test_user_b", requesting_user="test_user_b")
        recent_b_ids_after = [j["id"] for j in q_user_b_after["recent"]]
        self.assertIn(job_b_id, recent_b_ids_after, "User B's recent list must remain intact")

        # 3. Admin audit log MUST still have both jobs!
        audit_records = get_user_audit_stats()
        audit_job_ids = [r["job_id"] for r in audit_records]
        self.assertIn(job_a_id, audit_job_ids, "Admin audit log must retain job_a")
        self.assertIn(job_b_id, audit_job_ids, "Admin audit log must retain job_b")

        # 4. Daily limits MUST NOT be reset!
        with get_db(write=False) as conn:
            after_counts = get_today_downloads_by_provider(conn)
        self.assertEqual(after_counts["artlist"], initial_counts["artlist"], "Daily Artlist count must not reset")
        self.assertEqual(after_counts["envato"], initial_counts["envato"], "Daily Envato count must not reset")

        # 5. When User A downloads a new track, it shows in recent transports
        job_a2_id = f"job_a2_{uuid.uuid4().hex[:8]}"
        t_now = datetime.now().isoformat()
        with get_db(write=True) as conn:
            conn.execute("""
                INSERT INTO jobs (id, url, track_id, requested_by, provider, status, created_at, completed_at, bytes, filename)
                VALUES (?, ?, ?, ?, ?, 'done', ?, ?, 1024, 'track_a2.mp3')
            """, (job_a2_id, "https://artlist.io/test-a2", "track_a2", "test_user_a", "artlist", t_now, t_now))

        q_user_a_new = get_queue_view(for_user="test_user_a", requesting_user="test_user_a")
        recent_a_ids_new = [j["id"] for j in q_user_a_new["recent"]]
        self.assertIn(job_a2_id, recent_a_ids_new, "New downloads for User A must appear in recent transports")
        self.assertNotIn(job_a_id, recent_a_ids_new, "Old cleared download must still be excluded")

    def test_api_endpoints_clear_history(self):
        from fastapi.testclient import TestClient
        from backend.main import app
        from backend.auth import create_access_token, hash_password
        from backend.config import settings
        from backend.database import create_user, get_user_by_username

        user_a = get_user_by_username("test_user_a") or create_user("test_user_a", hash_password("pass123"), role="editor")
        user_b = get_user_by_username("test_user_b") or create_user("test_user_b", hash_password("pass123"), role="editor")

        client = TestClient(app)

        token_a = create_access_token({"sub": user_a["id"], "username": "test_user_a", "role": "editor"})
        token_b = create_access_token({"sub": user_b["id"], "username": "test_user_b", "role": "editor"})
        headers_a = {"Authorization": f"Bearer {token_a}"}
        headers_b = {"Authorization": f"Bearer {token_b}"}
        admin_headers = {"Authorization": f"Bearer {settings.AUTH_TOKEN}"}

        now = datetime.now()
        t_minus_5 = (now - timedelta(minutes=5)).isoformat()
        job_a_id = f"job_api_a_{uuid.uuid4().hex[:8]}"
        job_b_id = f"job_api_b_{uuid.uuid4().hex[:8]}"

        with get_db(write=True) as conn:
            conn.execute("""
                INSERT INTO jobs (id, url, track_id, requested_by, provider, status, created_at, completed_at, bytes, filename)
                VALUES (?, ?, ?, ?, ?, 'done', ?, ?, 1024, 'api_track_a.mp3')
            """, (job_a_id, "https://artlist.io/test-a", "track_a", "test_user_a", "artlist", t_minus_5, t_minus_5))

            conn.execute("""
                INSERT INTO jobs (id, url, track_id, requested_by, provider, status, created_at, completed_at, bytes, filename)
                VALUES (?, ?, ?, ?, ?, 'done', ?, ?, 2048, 'api_track_b.mp3')
            """, (job_b_id, "https://elements.envato.com/test-b", "track_b", "test_user_b", "envato", t_minus_5, t_minus_5))

        # Check queue before clear
        res_a1 = client.get("/api/v1/queue", headers=headers_a)
        self.assertEqual(res_a1.status_code, 200)
        recent_a1 = [j["id"] for j in res_a1.json()["recent"]]
        self.assertIn(job_a_id, recent_a1)

        # Call POST /api/v1/history/clear as user A
        clear_res = client.post("/api/v1/history/clear", headers=headers_a)
        self.assertEqual(clear_res.status_code, 200)
        self.assertEqual(clear_res.json()["status"], "cleared")
        self.assertEqual(clear_res.json()["username"], "test_user_a")

        # User A's recent transports should now be empty
        res_a2 = client.get("/api/v1/queue", headers=headers_a)
        self.assertEqual(res_a2.status_code, 200)
        recent_a2 = [j["id"] for j in res_a2.json()["recent"]]
        self.assertNotIn(job_a_id, recent_a2)

        # User B's recent transports MUST still be present
        res_b = client.get("/api/v1/queue", headers=headers_b)
        self.assertEqual(res_b.status_code, 200)
        recent_b = [j["id"] for j in res_b.json()["recent"]]
        self.assertIn(job_b_id, recent_b)

        # Admin audit log endpoint MUST still have both jobs
        audit_res = client.get("/api/v1/admin/audit", headers=admin_headers)
        self.assertEqual(audit_res.status_code, 200)
        audit_ids = [j["job_id"] for j in audit_res.json()]
        self.assertIn(job_a_id, audit_ids)
        self.assertIn(job_b_id, audit_ids)

        # Now test when ADMIN clears Recent Transports
        admin_clear_res = client.post("/api/v1/history/clear", headers=admin_headers)
        self.assertEqual(admin_clear_res.status_code, 200)

        # Admin queue recent list should now be cleared
        res_admin_queue = client.get("/api/v1/queue", headers=admin_headers)
        self.assertEqual(res_admin_queue.status_code, 200)
        admin_recent = [j["id"] for j in res_admin_queue.json()["recent"]]
        self.assertNotIn(job_a_id, admin_recent)
        self.assertNotIn(job_b_id, admin_recent)

        # CRITICAL: Admin Studio Control audit log MUST STILL retain 100% of the logs!
        audit_res_after_admin_clear = client.get("/api/v1/admin/audit", headers=admin_headers)
        self.assertEqual(audit_res_after_admin_clear.status_code, 200)
        audit_ids_after = [j["job_id"] for j in audit_res_after_admin_clear.json()]
        self.assertIn(job_a_id, audit_ids_after, "Job A must still exist in Admin Studio Control audit log")
        self.assertIn(job_b_id, audit_ids_after, "Job B must still exist in Admin Studio Control audit log")

        # Status endpoint MUST still count downloads (daily limit NOT reset)
        status_res = client.get("/api/v1/status", headers=headers_a)
        self.assertEqual(status_res.status_code, 200)
        status_data = status_res.json()
        self.assertGreaterEqual(status_data["daily_downloads"], 2)
        self.assertGreaterEqual(status_data["downloads_artlist"], 1)
        self.assertGreaterEqual(status_data["downloads_envato"], 1)

    def test_envato_delivery_naming_and_slug_title(self):
        import zipfile
        from backend.service import deliver_file_to_library
        from backend.os_agent import parse_title_from_url

        # 1. Verify URL slug title derivation
        title_luts = parse_title_from_url("https://elements.envato.com/vintage-color-luts-WGFQYS7")
        self.assertIn("Vintage Color", title_luts)
        self.assertIn("LUTS", title_luts)

        title_trans = parse_title_from_url("https://elements.envato.com/camera-transitions-for-premiere-pro-FFU3QMB")
        self.assertIn("Camera Transitions for Premiere PRO", title_trans)

        # 2. Verify deliver_file_to_library names with - Envato.<ext>
        mock_zip = settings.STAGING_PATH / "test_envato.zip"
        with zipfile.ZipFile(mock_zip, "w") as zf:
            zf.writestr("test.txt", b"12345" * 2500)

        target_path, final_name, final_bytes, collided = deliver_file_to_library(
            temp_filename=str(mock_zip),
            reported_bytes=mock_zip.stat().st_size,
            track_title="Vintage Color LUTs",
            track_id="WGFQYS7",
            variant="main",
            format_type="ZIP",
            provider="envato"
        )
        self.assertTrue(final_name.endswith(" - Envato.zip"), f"Expected - Envato.zip, got: {final_name}")
    def test_retry_cancelled_job_service_and_api(self):
        from fastapi.testclient import TestClient
        from backend.main import app
        from backend.auth import create_access_token, hash_password
        from backend.config import settings
        from backend.database import create_user, get_user_by_username
        from backend.service import cancel_job, retry_failed_job, claim_next_job_for_worker

        user_a = get_user_by_username("test_user_a") or create_user("test_user_a", hash_password("pass123"), role="editor")
        user_b = get_user_by_username("test_user_b") or create_user("test_user_b", hash_password("pass123"), role="editor")
        client = TestClient(app)

        token_a = create_access_token({"sub": user_a["id"], "username": "test_user_a", "role": "editor"})
        token_b = create_access_token({"sub": user_b["id"], "username": "test_user_b", "role": "editor"})
        headers_a = {"Authorization": f"Bearer {token_a}"}
        headers_b = {"Authorization": f"Bearer {token_b}"}
        admin_headers = {"Authorization": f"Bearer {settings.AUTH_TOKEN}"}

        job_id = f"job_retry_{uuid.uuid4().hex[:8]}"
        t_now = datetime.now().isoformat()

        # 1. Insert a queued job for user A
        with get_db(write=True) as conn:
            conn.execute("""
                INSERT INTO jobs (id, url, track_id, requested_by, provider, status, created_at, category)
                VALUES (?, ?, ?, ?, 'artlist', 'queued', ?, 'music')
            """, (job_id, "https://artlist.io/test-retry", "track_retry", "test_user_a", t_now))

        # 2. Cancel the job with actor username
        cancel_res = cancel_job(job_id, actor_username="test_user_a")
        self.assertEqual(cancel_res["status"], "cancelled")
        self.assertEqual(cancel_res["cancelled_by"], "test_user_a")

        with get_db(write=False) as conn:
            job_row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
            self.assertEqual(job_row["status"], "failed")
            self.assertEqual(job_row["cancelled_by"], "test_user_a")
            self.assertEqual(job_row["error"], "Cancelled by test_user_a")

        # 3. User B (different editor) attempts to resume User A's job -> PermissionError
        with self.assertRaises(PermissionError):
            retry_failed_job(job_id, actor_username="test_user_b", is_admin=False)

        # 4. User A (the requester) resumes their own job -> Success
        resume_res = retry_failed_job(job_id, actor_username="test_user_a", is_admin=False)
        self.assertEqual(resume_res["status"], "queued")
        self.assertEqual(resume_res["requested_by"], "test_user_a")

        with get_db(write=False) as conn:
            resumed_row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
            self.assertEqual(resumed_row["status"], "queued")
            self.assertIsNone(resumed_row["error"])
            self.assertEqual(resumed_row["attempts"], 0)
            self.assertEqual(resumed_row["phase_detail"], "Resumed by test_user_a")

        # Worker can now claim it
        claimed = claim_next_job_for_worker()
        self.assertIsNotNone(claimed)
        self.assertEqual(claimed["job_id"], job_id)

        # 5. Cancel again via HTTP API with user B's token
        cancel_api_res = client.post(f"/api/v1/jobs/{job_id}/cancel", headers=headers_b)
        self.assertEqual(cancel_api_res.status_code, 200)
        self.assertEqual(cancel_api_res.json()["cancelled_by"], "test_user_b")

        with get_db(write=False) as conn:
            job_row2 = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
            self.assertEqual(job_row2["cancelled_by"], "test_user_b")
            self.assertEqual(job_row2["error"], "Cancelled by test_user_b")

        # Editor B tries via API -> 403 Forbidden
        api_res_b = client.post(f"/api/v1/jobs/{job_id}/retry", headers=headers_b)
        self.assertEqual(api_res_b.status_code, 403)

        # Admin tries via API -> 200 OK (Admin can resume any editor's job)
        api_res_admin = client.post(f"/api/v1/jobs/{job_id}/retry", headers=admin_headers)
        self.assertEqual(api_res_admin.status_code, 200)
        self.assertEqual(api_res_admin.json()["status"], "queued")

    def test_delete_library_item_service_and_api(self):
        from fastapi.testclient import TestClient
        from backend.main import app
        from backend.auth import create_access_token, hash_password
        from backend.config import settings
        from backend.database import create_user, get_user_by_username, set_dynamic_setting
        from backend.service import delete_library_item

        user_a = get_user_by_username("test_user_a") or create_user("test_user_a", hash_password("pass123"), role="editor")
        user_b = get_user_by_username("test_user_b") or create_user("test_user_b", hash_password("pass123"), role="editor")
        client = TestClient(app)

        token_a = create_access_token({"sub": user_a["id"], "username": "test_user_a", "role": "editor"})
        token_b = create_access_token({"sub": user_b["id"], "username": "test_user_b", "role": "editor"})
        headers_a = {"Authorization": f"Bearer {token_a}"}
        headers_b = {"Authorization": f"Bearer {token_b}"}
        admin_headers = {"Authorization": f"Bearer {settings.AUTH_TOKEN}"}

        # 1. Create a dummy file in settings.LIBRARY_PATH
        track_id_1 = f"del_track_{uuid.uuid4().hex[:8]}"
        dummy_file_1 = settings.LIBRARY_PATH / f"{track_id_1}.wav"
        dummy_file_1.write_bytes(b"RIFF" + b"\x00" * 4096)
        file_size_1 = dummy_file_1.stat().st_size

        with get_db(write=True) as conn:
            conn.execute("""
                INSERT INTO tracks (track_id, variant, title, filename, library_path, bytes, first_job_id, requested_by, downloaded_at, provider, category)
                VALUES (?, 'main', 'Sample Delete Track', ?, ?, ?, 'job_del_1', 'test_user_a', ?, 'artlist', 'music')
            """, (track_id_1, dummy_file_1.name, str(dummy_file_1), file_size_1, datetime.now().isoformat()))

        # 2. User B (editor) tries to delete User A's track -> PermissionError
        with self.assertRaises(PermissionError):
            delete_library_item(track_id_1, variant="main", actor_username="test_user_b", is_admin=False)
        self.assertTrue(dummy_file_1.exists(), "File must not be deleted on permission error")

        # 3. User A (editor) tries to delete their OWN track -> Still raises PermissionError (Admin-only)
        with self.assertRaises(PermissionError):
            delete_library_item(track_id_1, variant="main", actor_username="test_user_a", is_admin=False)
        self.assertTrue(dummy_file_1.exists(), "File must not be deleted by non-admin editor")

        # 4. HTTP API calls by editors must be rejected with 403 Forbidden
        api_del_res_a = client.delete(f"/api/v1/library/{track_id_1}?variant=main", headers=headers_a)
        self.assertEqual(api_del_res_a.status_code, 403)
        self.assertIn("Administrator access required", api_del_res_a.json().get("detail", ""))

        api_del_res_b = client.delete(f"/api/v1/library/{track_id_1}?variant=main", headers=headers_b)
        self.assertEqual(api_del_res_b.status_code, 403)
        self.assertTrue(dummy_file_1.exists(), "File must still exist after rejected editor delete attempts")

        # 5. Admin calling HTTP API succeeds and permanently removes asset and file
        api_del_res_admin = client.delete(f"/api/v1/library/{track_id_1}?variant=main", headers=admin_headers)
        self.assertEqual(api_del_res_admin.status_code, 200)
        self.assertEqual(api_del_res_admin.json()["status"], "deleted")
        self.assertEqual(api_del_res_admin.json()["bytes_freed"], file_size_1)
        self.assertFalse(dummy_file_1.exists(), "Physical file must be unlinked from disk by admin")

        with get_db(write=False) as conn:
            row = conn.execute("SELECT * FROM tracks WHERE track_id = ?", (track_id_1,)).fetchone()
            self.assertIsNone(row, "Track row must be deleted from database")

        # 6. Service level direct call with is_admin=True succeeds
        track_id_2 = f"del_track_{uuid.uuid4().hex[:8]}"
        dummy_file_2 = settings.LIBRARY_PATH / f"{track_id_2}.zip"
        dummy_file_2.write_bytes(b"PK" + b"\x00" * 2048)
        file_size_2 = dummy_file_2.stat().st_size

        with get_db(write=True) as conn:
            conn.execute("""
                INSERT INTO tracks (track_id, variant, title, filename, library_path, bytes, first_job_id, requested_by, downloaded_at, provider, category)
                VALUES (?, 'main', 'Envato Template Delete', ?, ?, ?, 'job_del_2', 'test_user_a', ?, 'envato', 'video-template')
            """, (track_id_2, dummy_file_2.name, str(dummy_file_2), file_size_2, datetime.now().isoformat()))

        res_admin = delete_library_item(track_id_2, variant="main", actor_username="admin", is_admin=True)
        self.assertEqual(res_admin["status"], "deleted")
        self.assertEqual(res_admin["bytes_freed"], file_size_2)
        self.assertFalse(dummy_file_2.exists())


if __name__ == "__main__":
    unittest.main()


