"""
Test suite for the Artlist relay.

IMPORTANT: the storage paths and database are redirected to a temporary
directory *before* backend.config is imported. backend.config reads these from
the environment at import time, so an import above this block would silently
bind the tests to the real database and library folder - which is exactly how
the production dedup index was previously wiped, and how test fixtures ended up
in the real library.
"""

import os
import shutil
import sys
import tempfile
import uuid
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

_TEST_ROOT = Path(tempfile.mkdtemp(prefix="artlist_relay_test_"))
os.environ["STAGING_PATH"] = str(_TEST_ROOT / "staging")
os.environ["LIBRARY_PATH"] = str(_TEST_ROOT / "library")
os.environ["DB_PATH"] = str(_TEST_ROOT / "test_relay.db")
os.environ["DAILY_SAFETY_LIMIT"] = "5"
os.environ["AUTH_TOKEN"] = "test-token"

from backend.config import settings  # noqa: E402
from backend.database import init_db, get_db  # noqa: E402
from backend.service import (  # noqa: E402
    parse_artlist_url,
    sanitize_filename,
    verify_riff_wave_header,
    deliver_file_to_library,
    submit_new_job,
    claim_next_job_for_worker,
    complete_worker_job,
    fail_worker_job,
    search_library,
    reap_stale_claims,
    startup_reconciliation,
    is_working_hours,
    _unlinked_id,
)

DUMMY_WAV = b"RIFF\x24\x00\x00\x00WAVEfmt \x10\x00\x00\x00\x01\x00\x02\x00" + b"\x00" * (50 * 1024)


def make_staged_wav(name: str) -> Path:
    path = settings.STAGING_PATH / name
    path.write_bytes(DUMMY_WAV)
    return path


def tearDownModule():
    """Remove the shared temp root once, after every class has finished."""
    shutil.rmtree(_TEST_ROOT, ignore_errors=True)


class TestArtlistRelay(unittest.TestCase):

    def setUp(self):
        # Guard against ever pointing at real data.
        self.assertIn("artlist_relay_test_", str(settings.DB_PATH))

        init_db()
        settings.STAGING_PATH.mkdir(parents=True, exist_ok=True)
        settings.LIBRARY_PATH.mkdir(parents=True, exist_ok=True)

        for f in settings.LIBRARY_PATH.glob("*"):
            f.unlink()
        for f in settings.STAGING_PATH.glob("*"):
            f.unlink()

        with get_db(write=True) as conn:
            conn.execute("DELETE FROM jobs")
            conn.execute("DELETE FROM tracks")
            conn.execute("DELETE FROM counters")
            conn.execute("DELETE FROM health")
        init_db()

    # ------------------------------------------------------------- parsing

    def test_url_parsing(self):
        cases = [
            ("https://artlist.io/royalty-free-music/song/ambient-sunrise/12345", "12345"),
            ("https://artlist.io/sfx/track/electric-fuss---camera-shutter-click/98736", "98736"),
            ("https://artlist.io/sound-effects/track/cinematic-impact/98765", "98765"),
            ("https://artlist.io/song/cinematic-piano/55443?search=piano", "55443"),
        ]
        for url, expected in cases:
            with self.subTest(url=url):
                self.assertEqual(parse_artlist_url(url), expected)

    def test_filename_sanitization(self):
        dirty = 'What\'s Next?: The "Ultimate" Track <Remix> | Final? * . '
        clean = sanitize_filename(dirty)
        for ch in ':?<>|"*':
            self.assertNotIn(ch, clean)
        self.assertFalse(clean.endswith("."))
        self.assertFalse(clean.endswith(" "))

    def test_reserved_windows_name(self):
        self.assertTrue(sanitize_filename("CON.wav").startswith("_"))

    def test_riff_wave_header_validation(self):
        good = make_staged_wav("test_valid.wav")
        self.assertTrue(verify_riff_wave_header(good))

        bad = settings.STAGING_PATH / "test_bad.wav"
        bad.write_bytes(b"<html><body>500 Internal Server Error</body></html>")
        self.assertFalse(verify_riff_wave_header(bad))

    def test_overnight_working_hours(self):
        original = (settings.WORKING_HOURS_ENABLED,
                    settings.WORKING_HOURS_START,
                    settings.WORKING_HOURS_END)
        try:
            settings.WORKING_HOURS_ENABLED = True
            # A window that spans midnight must not be permanently closed.
            settings.WORKING_HOURS_START = "00:00"
            settings.WORKING_HOURS_END = "23:59"
            self.assertTrue(is_working_hours())

            now = datetime.now().strftime("%H:%M")
            settings.WORKING_HOURS_START = now
            settings.WORKING_HOURS_END = "00:01"
            self.assertTrue(is_working_hours(), "overnight window should include 'now'")
        finally:
            (settings.WORKING_HOURS_ENABLED,
             settings.WORKING_HOURS_START,
             settings.WORKING_HOURS_END) = original

    # -------------------------------------------------------- core pipeline

    def test_end_to_end_job_submission_and_cache(self):
        track_id = str(uuid.uuid4().int)[:6]
        test_url = f"https://artlist.io/sfx/track/camera-click/{track_id}"

        res = submit_new_job(url=test_url, variant="main", format_type="WAV")
        self.assertEqual(res["type"], "queued")
        job_id = res["job_id"]

        claimed = claim_next_job_for_worker()
        self.assertIsNotNone(claimed)
        self.assertEqual(claimed["job_id"], job_id)

        dummy = make_staged_wav(f"Camera_Click_{track_id}.wav")
        done = complete_worker_job(
            job_id=job_id,
            temp_filename=str(dummy),
            reported_bytes=len(DUMMY_WAV),
            track_title="Camera Click",
        )
        self.assertEqual(done["status"], "done")
        self.assertTrue(Path(done["library_path"]).exists())
        self.assertFalse(done["name_collided"])
        self.assertFalse(dummy.exists(), "staging copy should be consumed by the move")

        cache = submit_new_job(url=test_url, variant="main", format_type="WAV")
        self.assertEqual(cache["type"], "cached")
        self.assertEqual(cache["track_id"], track_id)
        self.assertGreaterEqual(cache["hit_count"], 1)

        self.assertGreaterEqual(len(search_library("Camera")), 1)

    def test_variant_is_not_a_cache_hit_for_a_different_variant(self):
        track_id = str(uuid.uuid4().int)[:6]
        url = f"https://artlist.io/royalty-free-music/song/x/{track_id}"

        job = submit_new_job(url=url, variant="main")
        claim_next_job_for_worker()
        complete_worker_job(job["job_id"], str(make_staged_wav("a.wav")), len(DUMMY_WAV), "Song X")

        other = submit_new_job(url=url, variant="instrumental")
        self.assertEqual(other["type"], "queued", "different variant must not hit the cache")

    # ---------------------------------------------------------- regressions

    def test_quota_accounts_for_pending_jobs(self):
        """
        Rapid submissions must not all pass a counter that only increments on
        completion. This was a hole that let the daily cap be bypassed entirely.
        """
        accepted = 0
        for i in range(settings.DAILY_SAFETY_LIMIT + 3):
            url = f"https://artlist.io/royalty-free-music/song/t{i}/{100000 + i}"
            try:
                submit_new_job(url=url, variant="main")
                accepted += 1
            except PermissionError:
                break
        self.assertLessEqual(accepted, settings.DAILY_SAFETY_LIMIT)

    def test_stale_claim_is_reaped(self):
        """A worker that dies mid-job must not wedge the queue forever."""
        url = f"https://artlist.io/royalty-free-music/song/stale/{777001}"
        job = submit_new_job(url=url, variant="main")
        claimed = claim_next_job_for_worker()
        self.assertIsNotNone(claimed)

        # Nothing else can be claimed while one job is in flight.
        self.assertIsNone(claim_next_job_for_worker())

        stale_ts = (datetime.now() - timedelta(seconds=settings.STALE_CLAIM_TIMEOUT_SECONDS + 60)).isoformat()
        with get_db(write=True) as conn:
            conn.execute("UPDATE jobs SET claimed_at = ?, phase_updated_at = ? WHERE id = ?", (stale_ts, stale_ts, job["job_id"]))

        self.assertEqual(reap_stale_claims(), 1)

        with get_db(write=False) as conn:
            row = conn.execute("SELECT status FROM jobs WHERE id = ?", (job["job_id"],)).fetchone()
        self.assertEqual(row["status"], "queued")
        self.assertIsNotNone(claim_next_job_for_worker(), "queue must be unblocked after reaping")

    def test_delivery_rejects_path_outside_staging(self):
        outside = _TEST_ROOT / "not_staging.wav"
        outside.write_bytes(DUMMY_WAV)
        with self.assertRaises(ValueError):
            deliver_file_to_library(
                temp_filename=str(outside),
                reported_bytes=len(DUMMY_WAV),
                track_title="Evil",
                track_id="1",
                variant="main",
            )

    def test_reconciliation_is_idempotent(self):
        """
        Reconciliation used to mint a random pseudo-ID per run, so every restart
        inserted a fresh row for the same file and no row could ever cache-hit.
        """
        (settings.LIBRARY_PATH / "Orphan Track - Main - Artlist.wav").write_bytes(DUMMY_WAV)

        startup_reconciliation()
        startup_reconciliation()
        startup_reconciliation()

        with get_db(write=False) as conn:
            rows = conn.execute(
                "SELECT track_id, variant FROM tracks WHERE filename = ?",
                ("Orphan Track - Main - Artlist.wav",),
            ).fetchall()

        self.assertEqual(len(rows), 1, "repeat reconciliation must not duplicate rows")
        self.assertEqual(rows[0]["track_id"], _unlinked_id("Orphan Track - Main - Artlist.wav"))
        self.assertEqual(rows[0]["variant"], "main")

    def test_reconciliation_evicts_missing_files(self):
        track_id = str(uuid.uuid4().int)[:6]
        url = f"https://artlist.io/royalty-free-music/song/gone/{track_id}"
        job = submit_new_job(url=url, variant="main")
        claim_next_job_for_worker()
        done = complete_worker_job(job["job_id"], str(make_staged_wav("g.wav")), len(DUMMY_WAV), "Gone")

        Path(done["library_path"]).unlink()
        startup_reconciliation()

        with get_db(write=False) as conn:
            row = conn.execute("SELECT * FROM tracks WHERE track_id = ?", (track_id,)).fetchone()
        self.assertIsNone(row, "row for a deleted file must be evicted")

    def test_reconciliation_relinks_real_track_id(self):
        """An indexed file should recover its real track_id from job history."""
        track_id = str(uuid.uuid4().int)[:6]
        url = f"https://artlist.io/royalty-free-music/song/relink/{track_id}"
        job = submit_new_job(url=url, variant="main")
        claim_next_job_for_worker()
        complete_worker_job(job["job_id"], str(make_staged_wav("r.wav")), len(DUMMY_WAV), "Relink Me")

        with get_db(write=True) as conn:
            conn.execute("DELETE FROM tracks")

        startup_reconciliation()

        with get_db(write=False) as conn:
            row = conn.execute("SELECT track_id FROM tracks").fetchone()
        self.assertEqual(row["track_id"], track_id, "must relink, not mint an unlinked id")

    def test_circuit_breaker_trips_on_consecutive_failures(self):
        for i in range(settings.CONSECUTIVE_FAILURE_LIMIT):
            url = f"https://artlist.io/royalty-free-music/song/f{i}/{200000 + i}"
            job = submit_new_job(url=url, variant="main")
            claim_next_job_for_worker()
            fail_worker_job(job["job_id"], "selector_timeout")
            fail_worker_job(job["job_id"], "selector_timeout")

        with get_db(write=False) as conn:
            paused = conn.execute("SELECT v FROM health WHERE k = 'queue_paused'").fetchone()
        self.assertEqual(paused["v"], "true")
        self.assertIsNone(claim_next_job_for_worker(), "paused queue must not dispatch")

    def test_duplicate_submission_returns_existing_job(self):
        url = f"https://artlist.io/royalty-free-music/song/dup/{333001}"
        first = submit_new_job(url=url, variant="main")
        second = submit_new_job(url=url, variant="main")
        self.assertEqual(first["job_id"], second["job_id"])


if __name__ == "__main__":
    unittest.main(verbosity=2)


class TestDownloadDirGuard(unittest.TestCase):
    """Regression cover for the misconfigured Chrome download directory."""

    def setUp(self):
        self.assertIn("artlist_relay_test_", str(settings.DB_PATH))
        settings.STAGING_PATH.mkdir(parents=True, exist_ok=True)
        settings.LIBRARY_PATH.mkdir(parents=True, exist_ok=True)
        init_db()
        with get_db(write=True) as conn:
            conn.execute("DELETE FROM jobs")
            conn.execute("DELETE FROM tracks")
            conn.execute("DELETE FROM counters")

    def test_outside_staging_raises_configuration_error_with_fix(self):
        from backend.service import ConfigurationError

        outside = _TEST_ROOT / "nas_sim"
        outside.mkdir(exist_ok=True)
        f = outside / "Some Track (1).wav"
        f.write_bytes(DUMMY_WAV)

        with self.assertRaises(ConfigurationError) as ctx:
            deliver_file_to_library(
                temp_filename=str(f), reported_bytes=len(DUMMY_WAV),
                track_title="Some Track", track_id="1", variant="main",
            )

        msg = str(ctx.exception)
        self.assertIn("chrome://settings/downloads", msg)
        self.assertIn(str(settings.STAGING_PATH), msg)
        self.assertTrue(f.exists(), "the downloaded file must not be destroyed")

    def test_extra_download_root_allows_the_location(self):
        outside = _TEST_ROOT / "nas_allowed"
        outside.mkdir(exist_ok=True)
        f = outside / "Allowed Track.wav"
        f.write_bytes(DUMMY_WAV)

        original = settings.EXTRA_DOWNLOAD_ROOTS
        try:
            settings.EXTRA_DOWNLOAD_ROOTS = str(outside)
            path, name, size, collided = deliver_file_to_library(
                temp_filename=str(f), reported_bytes=len(DUMMY_WAV),
                track_title="Allowed Track", track_id="2", variant="main",
            )
            self.assertTrue(path.exists())
        finally:
            settings.EXTRA_DOWNLOAD_ROOTS = original
            path.unlink(missing_ok=True)

    def test_handoff_failure_does_not_requeue(self):
        """
        A failed handoff must not requeue: the Artlist download already
        happened, so a retry would spend a second download on the same track.
        """
        url = "https://artlist.io/royalty-free-music/song/noretry/880011"
        job = submit_new_job(url=url, variant="main")
        claim_next_job_for_worker()

        fail_worker_job(job["job_id"], "Chrome saved this download elsewhere", retryable=False)

        with get_db(write=False) as conn:
            row = conn.execute("SELECT status, attempts FROM jobs WHERE id = ?",
                               (job["job_id"],)).fetchone()
        self.assertEqual(row["status"], "failed")
        self.assertEqual(row["attempts"], 1, "must fail on the first attempt, not retry")


class TestTimestampHandling(unittest.TestCase):
    """
    Regression cover for the timezone crash.

    The worker reports times from JavaScript, which serialises as UTC with a
    trailing 'Z'. Python parses that into an aware datetime; subtracting it from
    a naive datetime.now() raises TypeError - not ValueError - so it bypassed the
    error handling and 500'd the whole /api/v1/queue endpoint.
    """

    def test_utc_z_string_does_not_crash(self):
        from backend.service import seconds_until
        self.assertEqual(seconds_until("2026-08-19T12:47:15.168Z"), 0)

    def test_future_utc_z_string_returns_positive(self):
        from backend.service import seconds_until
        future = datetime.now(timezone.utc) + timedelta(seconds=60)
        value = future.isoformat().replace("+00:00", "Z")
        self.assertGreater(seconds_until(value), 50)

    def test_epoch_milliseconds(self):
        from backend.service import seconds_until
        ms = int((datetime.now() + timedelta(seconds=90)).timestamp() * 1000)
        self.assertGreater(seconds_until(ms), 80)
        self.assertGreater(seconds_until(str(ms)), 80)

    def test_naive_local_iso(self):
        from backend.service import seconds_until
        self.assertGreater(
            seconds_until((datetime.now() + timedelta(seconds=45)).isoformat()), 40
        )

    def test_garbage_and_empty_are_zero(self):
        from backend.service import seconds_until
        for bad in ("", None, "not-a-date", "2026-13-99T99:99:99"):
            self.assertEqual(seconds_until(bad), 0, f"input: {bad!r}")

    def test_queue_view_survives_a_utc_cooldown(self):
        from backend.service import get_queue_view, set_health
        with get_db(write=True) as conn:
            set_health(conn, "cooldown_until", "2026-08-19T12:47:15.168Z")

        view = get_queue_view()
        self.assertIn("cooldown_remaining_seconds", view)
        self.assertIsInstance(view["cooldown_remaining_seconds"], int)


class TestMultiStockProviders(TestArtlistRelay):
    """Tests for Artlist and Envato Elements provider parsing, routing, and filtering."""

    def test_envato_provider_parsing(self):
        from backend.providers import get_provider_for_url, parse_stock_url

        cases = [
            ("https://elements.envato.com/video-templates/cinematic-title-sequence-9ABC123", "video-template", "9ABC123", "envato"),
            ("https://elements.envato.com/stock-video/aerial-mountains-sunset-XYZ987", "stock-video", "XYZ987", "envato"),
            ("https://elements.envato.com/audio/stock-music/epic-cinematic-trailer-MUSIC1", "music", "MUSIC1", "envato"),
            ("https://elements.envato.com/audio/sound-effects/cinematic-whoosh-SFX456", "sfx", "SFX456", "envato"),
            ("https://elements.envato.com/graphic-templates/corporate-brand-identity-GRP789", "graphic-template", "GRP789", "envato"),
        ]

        for url, expected_cat, expected_id, expected_prov in cases:
            with self.subTest(url=url):
                res = parse_stock_url(url)
                self.assertEqual(res["provider"], expected_prov)
                self.assertEqual(res["category"], expected_cat)
                self.assertEqual(res["track_id"], expected_id)

    def test_envato_job_submission_and_category_search(self):
        envato_url = "https://elements.envato.com/video-templates/retro-glitch-intro-789XYZ"
        job = submit_new_job(url=envato_url, variant="main", format_type="ZIP")
        self.assertEqual(job["provider"], "envato")
        self.assertEqual(job["category"], "video-template")

        claimed = claim_next_job_for_worker()
        self.assertIsNotNone(claimed)

        # Stage mock zip file with size >= MIN_AUDIO_BYTES
        zip_path = settings.STAGING_PATH / "retro_glitch_intro.zip"
        import zipfile
        with zipfile.ZipFile(zip_path, "w") as zf:
            zf.writestr("project.prproj", b"0" * (60 * 1024))

        complete_worker_job(job["job_id"], "retro_glitch_intro.zip", zip_path.stat().st_size, "Retro Glitch Intro")

        # Search with category filter
        templates = search_library(category="video-template")
        self.assertEqual(len(templates), 1)
        self.assertEqual(templates[0]["provider"], "envato")
        self.assertEqual(templates[0]["category"], "video-template")
        self.assertTrue(templates[0]["is_archive"])

        # Search for music should return 0
        music = search_library(category="music")
        self.assertEqual(len(music), 0)


if __name__ == "__main__":
    unittest.main()

