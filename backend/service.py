import errno
import hashlib
import os
import re
import shutil
import time
import unicodedata
import uuid
import zipfile
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, Tuple, List, Dict, Any

from backend.config import settings
from backend.database import get_db
from backend.providers import get_provider_for_url, parse_stock_url

# Regex to parse Artlist track ID from all Music, SFX, and short URL patterns
ARTLIST_URL_PATTERN = re.compile(
    r"artlist\.io/(?:royalty-free-music/song|sound-effects/track|sfx/track|sound-effects|sfx|track|song)/[^/]+/([a-zA-Z0-9_-]+)",
    re.IGNORECASE
)

# Alternative regex if URL is just artlist.io/.../<id>
FALLBACK_ID_PATTERN = re.compile(r"artlist\.io/.*?/([0-9]{4,10})", re.IGNORECASE)

# Matches the library naming convention: "<title> - <Variant> - Artlist[ (n)]<ext>"
LIBRARY_NAME_PATTERN = re.compile(
    r"^(?P<title>.+) - (?P<variant>[^-]+) - Artlist(?: \((?P<dup>\d+)\))?$"
)

# Windows invalid filename characters
INVALID_WIN_CHARS = re.compile(r'[<>:"/\\|?*\x00-\x1F]')
WINDOWS_RESERVED_NAMES = {
    "CON", "PRN", "AUX", "NUL",
    "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
    "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9"
}

KNOWN_VARIANTS = ("main", "instrumental", "stems", "short")

# Ordered pipeline phases, surfaced live in the dashboard so a user can see what
# the relay is actually doing instead of watching an opaque "in progress".
PHASE_ORDER = [
    "queued", "opening_tab", "page_loading", "dismissing_modals",
    "reading_title", "preview_playing", "locating_download",
    "selecting_variant", "selecting_format", "downloading", "moving",
    "done", "failed",
]

PHASE_LABELS = {
    "queued": "Waiting in queue",
    "opening_tab": "Opening Artlist page",
    "page_loading": "Loading page",
    "dismissing_modals": "Dismissing banners",
    "reading_title": "Reading track details",
    "preview_playing": "Playing preview",
    "locating_download": "Finding download button",
    "selecting_variant": "Selecting variant",
    "selecting_format": "Selecting audio format",
    "downloading": "Downloading file",
    "moving": "Moving to library",
    "done": "Complete",
    "failed": "Failed",
}


# ---------------------------------------------------------------- health keys

def get_health(conn, key: str, default: str = "") -> str:
    row = conn.execute("SELECT v FROM health WHERE k = ?", (key,)).fetchone()
    return row["v"] if row else default


def set_health(conn, key: str, value: str) -> None:
    conn.execute("""
        INSERT INTO health (k, v, updated_at) VALUES (?, ?, ?)
        ON CONFLICT(k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at
    """, (key, str(value), datetime.now().isoformat()))


# ------------------------------------------------------------------ URL utils

def normalize_artlist_url(url: str) -> str:
    """
    Ensure the URL uses Artlist's canonical web routes:
      - Music: /royalty-free-music/song/<slug>/<id>
      - SFX:   /sfx/track/<slug>/<id>
    """
    url = url.strip()
    # SFX routes: Artlist uses /sfx/track/ (rewriting to sound-effects causes 404)
    if "artlist.io/sound-effects/track/" in url.lower():
        url = re.sub(r"artlist\.io/sound-effects/track/", "artlist.io/sfx/track/", url, flags=re.IGNORECASE)
    elif "artlist.io/sound-effects/" in url.lower():
        url = re.sub(r"artlist\.io/sound-effects/([^/]+/[0-9a-zA-Z_-]+)", r"artlist.io/sfx/track/\1", url, flags=re.IGNORECASE)

    # Music routes: Artlist uses /royalty-free-music/song/
    if "artlist.io/song/" in url.lower():
        url = re.sub(r"artlist\.io/song/", "artlist.io/royalty-free-music/song/", url, flags=re.IGNORECASE)

    return url


def parse_artlist_url(url: str) -> Optional[str]:
    """Extract clean Artlist track ID from URL."""
    match = ARTLIST_URL_PATTERN.search(url)
    if match:
        return match.group(1)
    fallback = FALLBACK_ID_PATTERN.search(url)
    if fallback:
        return fallback.group(1)
    return None


def is_working_hours() -> bool:
    """
    Check if current local time is within configured working hours.
    Supports overnight windows (e.g. 22:00 -> 06:00) where start > end.
    """
    if not settings.WORKING_HOURS_ENABLED:
        return True
    now_time = datetime.now().strftime("%H:%M")
    start, end = settings.WORKING_HOURS_START, settings.WORKING_HOURS_END
    if start <= end:
        return start <= now_time <= end
    # Overnight window: active if after start OR before end
    return now_time >= start or now_time <= end


def get_today_str() -> str:
    return datetime.now().strftime("%Y-%m-%d")


def parse_timestamp(value: Any) -> Optional[datetime]:
    """
    Parse a timestamp from anywhere (DB, worker payload) into NAIVE LOCAL time.

    The worker reports times from JavaScript, which serialises as UTC with a
    trailing 'Z'. Python parses that into a timezone-aware datetime, and
    subtracting it from a naive datetime.now() raises TypeError - not
    ValueError - so it escaped the error handling entirely and 500'd the whole
    queue endpoint. Epoch milliseconds are also accepted, which is what the
    worker now sends.
    """
    if value in (None, ""):
        return None

    # Epoch milliseconds (or a numeric string).
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value / 1000.0)
    if isinstance(value, str) and value.strip().isdigit():
        return datetime.fromtimestamp(int(value.strip()) / 1000.0)

    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None

    if parsed.tzinfo is not None:
        # Normalise to naive local time so it is comparable with datetime.now().
        parsed = parsed.astimezone().replace(tzinfo=None)
    return parsed


def seconds_until(value: Any) -> int:
    """Seconds remaining until `value`, clamped at 0. Never raises."""
    parsed = parse_timestamp(value)
    if parsed is None:
        return 0
    return max(0, int((parsed - datetime.now()).total_seconds()))


def seconds_since(value: Any) -> Optional[int]:
    """Seconds elapsed since `value`. None if unparseable."""
    parsed = parse_timestamp(value)
    if parsed is None:
        return None
    return max(0, int((datetime.now() - parsed).total_seconds()))


# ------------------------------------------------------------- file utilities

def sanitize_filename(name: str, max_len: int = 180) -> str:
    """Sanitize filename across Windows, macOS, and Linux."""
    name = unicodedata.normalize("NFC", name)
    name = INVALID_WIN_CHARS.sub("_", name)
    name = name.rstrip(". ")
    base, ext = os.path.splitext(name)
    if base.upper() in WINDOWS_RESERVED_NAMES:
        name = f"_{name}"
    if len(name) > max_len:
        name = name[:max_len]
    return name or "artlist_track"


def verify_riff_wave_header(path: Path) -> bool:
    """Verify RIFF/WAVE 12-byte header for uncorrupted WAV audio."""
    try:
        with open(path, "rb") as f:
            header = f.read(12)
            if len(header) < 12:
                return False
            return header[:4] == b"RIFF" and header[8:12] == b"WAVE"
    except Exception:
        return False


AUDIO_EXTS = {".wav", ".wave", ".zip", ".mp3", ".aiff", ".aif", ".flac", ".m4a"}


def verify_audio_file(file_path: Path, expected_bytes: Optional[int] = None,
                      format_type: str = "WAV", variant: str = "main") -> bool:
    """
    Verify the downloaded file.

    Keyed on the extension of the file that actually arrived, NOT on the
    requested variant. Artlist delivers stems as a ZIP bundle for some tracks
    and as a single WAV for others; assuming "stems implies ZIP" made every
    single-file stems download fail zipfile.is_zipfile and get rejected.
    """
    if not file_path.exists() or not file_path.is_file():
        return False

    file_size = file_path.stat().st_size
    if file_size < settings.MIN_AUDIO_BYTES:
        return False

    if expected_bytes and abs(file_size - expected_bytes) > 4096:
        return False

    suffix = file_path.suffix.lower()
    if suffix == ".zip":
        return zipfile.is_zipfile(file_path)
    if suffix in (".wav", ".wave"):
        return verify_riff_wave_header(file_path)
    if suffix in AUDIO_EXTS:
        return True  # lossy/other container: size check only

    # Unknown extension: fall back to the requested format.
    if format_type.upper() == "WAV":
        return verify_riff_wave_header(file_path)
    return True


def _is_cross_device_error(err: OSError) -> bool:
    """Detect an EXDEV-equivalent on both POSIX and Windows."""
    if getattr(err, "errno", None) == errno.EXDEV:
        return True
    # Windows: ERROR_NOT_SAME_DEVICE
    return getattr(err, "winerror", None) == 17


class ConfigurationError(ValueError):
    """A failure the operator must fix; retrying will not help."""


def allowed_download_roots() -> List[Path]:
    roots = [settings.STAGING_PATH]
    for raw in (settings.EXTRA_DOWNLOAD_ROOTS or "").split(";"):
        raw = raw.strip()
        if raw:
            roots.append(Path(raw))
    return roots


def _assert_inside(path: Path, root: Path) -> Path:
    """
    Resolve path and ensure it lives under an allowed download root or network share.
    """
    try:
        resolved = path.resolve()
    except Exception:
        resolved = path

    for candidate in allowed_download_roots():
        try:
            resolved.relative_to(candidate.resolve())
            return resolved
        except (ValueError, OSError):
            continue

    path_str = str(resolved).lower()
    # Allow UNC network shares (e.g. \\vnas1\...) or secondary mapped network drives (e.g. Z:\)
    if path_str.startswith("\\\\") or (len(path_str) >= 2 and path_str[1] == ":" and path_str[0] not in ('c', 'd')):
        if resolved.exists() and resolved.is_file():
            return resolved

    raise ConfigurationError(
        f"Chrome saved this download to {resolved.parent}, but the relay expects "
        f"files in {settings.STAGING_PATH}. "
        f"Fix: open chrome://settings/downloads and set Location to {settings.STAGING_PATH}."
    )


def get_disk_free_bytes() -> int:
    try:
        return shutil.disk_usage(str(settings.LIBRARY_PATH)).free
    except Exception:
        return 0


def deliver_file_to_library(
    temp_filename: str,
    reported_bytes: int,
    track_title: Optional[str],
    track_id: str,
    variant: str,
    format_type: str = "WAV"
) -> Tuple[Path, str, int, bool]:
    """
    Atomically move a verified file from the browser download location into the
    library. Returns (path, name, size, name_collided).

    Uses os.replace (atomic on APFS and NTFS) with a verified-copy fallback if
    staging and library turn out to be on different volumes.
    """
    staging_path = Path(temp_filename)
    if not staging_path.is_absolute():
        staging_path = settings.STAGING_PATH / staging_path.name

    # Path containment: the worker is loopback-only, but this is cheap insurance.
    staging_path = _assert_inside(staging_path, settings.STAGING_PATH)

    if not staging_path.exists() or not staging_path.is_file():
        raise ValueError(f"Downloaded file not found at path: {temp_filename}")

    if staging_path.name.endswith(".crdownload"):
        raise ValueError("Cannot deliver an incomplete .crdownload file")

    if not verify_audio_file(staging_path, reported_bytes, format_type, variant):
        raise ValueError(f"File integrity verification failed for {staging_path.name}")

    clean_title = sanitize_filename(track_title or f"Track_{track_id}")
    clean_variant = sanitize_filename(variant).capitalize()

    # Preserve whatever Artlist actually delivered. Forcing ".zip" for stems
    # renamed single-file WAV stems into an archive extension they were not.
    staged_suffix = staging_path.suffix.lower()
    ext = staged_suffix if staged_suffix in AUDIO_EXTS else f".{format_type.lower()}"

    base_target_name = f"{clean_title} - {clean_variant} - Artlist{ext}"

    target_path = settings.LIBRARY_PATH / base_target_name
    name_collided = False
    counter = 2
    while target_path.exists():
        # A collision means dedup did not catch this upstream. Deliver it rather
        # than overwrite, but surface it so it can be investigated.
        name_collided = True
        target_path = settings.LIBRARY_PATH / f"{clean_title} - {clean_variant} - Artlist ({counter}){ext}"
        counter += 1

    if name_collided:
        print(f"[WARN] Library name collision for '{base_target_name}' -> delivering as "
              f"'{target_path.name}'. Dedup cache may be stale for track_id={track_id}.")

    last_err: Optional[Exception] = None
    moved = False

    for attempt in range(5):
        try:
            os.replace(str(staging_path), str(target_path))
            moved = True
            break
        except PermissionError as pe:
            # Antivirus (commonly Defender on Windows) may briefly hold the handle.
            last_err = pe
            time.sleep(0.5 * (attempt + 1))
        except OSError as oe:
            if _is_cross_device_error(oe):
                shutil.copy2(str(staging_path), str(target_path))
                if target_path.stat().st_size != staging_path.stat().st_size:
                    target_path.unlink(missing_ok=True)
                    raise ValueError("Size mismatch during cross-volume copy")
                staging_path.unlink(missing_ok=True)
                moved = True
                break
            last_err = oe
            time.sleep(0.5 * (attempt + 1))

    if not moved:
        raise RuntimeError(f"Failed to deliver file to library after 5 attempts: {last_err}")

    final_size = target_path.stat().st_size
    return target_path, target_path.name, final_size, name_collided


# ------------------------------------------------------------------- telemetry

def update_job_phase(job_id: str, phase: str, detail: Optional[str] = None,
                     progress_bytes: int = 0, total_bytes: int = 0) -> None:
    """Record which pipeline step a job is on, for live display."""
    with get_db(write=True) as conn:
        conn.execute("""
            UPDATE jobs SET phase = ?, phase_detail = ?, phase_updated_at = ?,
                progress_bytes = MAX(progress_bytes, ?), total_bytes = MAX(total_bytes, ?)
            WHERE id = ?
        """, (phase, detail, datetime.now().isoformat(),
              progress_bytes or 0, total_bytes or 0, job_id))


def _job_view(row, position: Optional[int] = None) -> Dict[str, Any]:
    """Shape a job row for the dashboard, including elapsed/ETA fields."""
    d = dict(row)
    phase = d.get("phase") or ("done" if d["status"] == "done" else d["status"])
    started = d.get("claimed_at") or d.get("created_at")

    elapsed = seconds_since(started)

    avg_cycle = (settings.COOLDOWN_MIN_SECONDS + settings.COOLDOWN_MAX_SECONDS) // 2 + 30
    eta = position * avg_cycle if position else None

    return {
        "id": d["id"],
        "job_id": d["id"],
        "track_id": d["track_id"],
        "url": d["url"],
        "variant": d["variant"],
        "format": d["format"],
        "status": d["status"],
        "phase": phase,
        "phase_label": PHASE_LABELS.get(phase, phase),
        "phase_index": PHASE_ORDER.index(phase) if phase in PHASE_ORDER else 0,
        "phase_total": len(PHASE_ORDER) - 2,  # done/failed are terminal, not steps
        "phase_detail": d.get("phase_detail"),
        "title": d.get("filename") or d.get("phase_detail"),
        "progress_bytes": d.get("progress_bytes") or 0,
        "total_bytes": d.get("total_bytes") or 0,
        "attempts": d["attempts"],
        "error": d.get("error"),
        "no_stems": (d.get("error") or "") == NO_STEMS_MESSAGE,
        "elapsed_seconds": elapsed,
        "queue_position": position,
        "eta_seconds": eta,
        "timeout_seconds": settings.STALE_CLAIM_TIMEOUT_SECONDS,
        "created_at": d["created_at"],
        "completed_at": d.get("completed_at"),
    }


def get_queue_view() -> Dict[str, Any]:
    """Everything the dashboard needs to render the live queue."""
    reap_stale_claims()
    with get_db(write=False) as conn:
        in_flight_row = conn.execute("""
            SELECT * FROM jobs WHERE status IN ('claimed', 'downloading', 'moving')
            ORDER BY claimed_at ASC LIMIT 1
        """).fetchone()

        queued_rows = conn.execute("""
            SELECT * FROM jobs WHERE status = 'queued' ORDER BY created_at ASC LIMIT 25
        """).fetchall()

        recent_rows = conn.execute("""
            SELECT * FROM jobs WHERE status IN ('done', 'failed')
            ORDER BY completed_at DESC LIMIT 8
        """).fetchall()

        cooldown_until = get_health(conn, "cooldown_until", "")

    cooldown_remaining = seconds_until(cooldown_until)

    return {
        "in_flight": _job_view(in_flight_row) if in_flight_row else None,
        "queued": [_job_view(r, position=i + 1) for i, r in enumerate(queued_rows)],
        "recent": [_job_view(r) for r in recent_rows],
        "cooldown_remaining_seconds": cooldown_remaining,
    }


def get_status_summary() -> Dict[str, Any]:
    """Retrieve full system telemetry and health metrics."""
    reap_stale_claims()
    today = get_today_str()
    with get_db(write=False) as conn:
        row = conn.execute("SELECT downloads, cache_hits FROM counters WHERE day = ?", (today,)).fetchone()
        downloads = row["downloads"] if row else 0
        cache_hits = row["cache_hits"] if row else 0

        q_row = conn.execute("SELECT COUNT(*) as cnt FROM jobs WHERE status = 'queued'").fetchone()
        queue_depth = q_row["cnt"] if q_row else 0

        in_flight = conn.execute("""
            SELECT * FROM jobs
            WHERE status IN ('claimed', 'downloading', 'moving')
            ORDER BY claimed_at ASC LIMIT 1
        """).fetchone()

        health_rows = conn.execute("SELECT k, v FROM health").fetchall()
        health_dict = {r["k"]: r["v"] for r in health_rows}

    session_auth = health_dict.get("session_authenticated", "true").lower() == "true"
    queue_paused = health_dict.get("queue_paused", "false").lower() == "true"
    last_heartbeat = health_dict.get("last_heartbeat", "")

    elapsed_heartbeat = seconds_since(last_heartbeat)
    heartbeat_stale = elapsed_heartbeat is None or elapsed_heartbeat > 15 * 60

    with get_db(write=False) as conn:
        lib = conn.execute(
            "SELECT COUNT(*) AS n, COALESCE(SUM(bytes), 0) AS b FROM tracks"
        ).fetchone()
    library_count, library_bytes = lib["n"], lib["b"]

    free_bytes = get_disk_free_bytes()

    # Compare Chrome's real download directory against staging. A mismatch means
    # every download will succeed and then be refused at the handoff.
    chrome_dir = health_dict.get("chrome_download_dir", "")
    download_dir_ok = True
    if chrome_dir:
        try:
            resolved = Path(chrome_dir).resolve()
            download_dir_ok = any(
                os.path.normcase(str(resolved)).startswith(os.path.normcase(str(root.resolve())))
                for root in allowed_download_roots()
            )
        except OSError:
            download_dir_ok = False

    in_flight_dict = dict(in_flight) if in_flight else None
    if in_flight_dict:
        in_flight_dict["job_id"] = in_flight_dict["id"]

    return {
        "queue_depth": queue_depth,
        "in_flight_job": in_flight_dict,
        "daily_downloads": downloads,
        "daily_limit": settings.DAILY_SAFETY_LIMIT,
        "daily_usage": f"{downloads}/{settings.DAILY_SAFETY_LIMIT}",
        "today_cache_hits": cache_hits,
        "session_authenticated": session_auth,
        "worker_type": health_dict.get("worker_type", "extension"),
        "queue_paused": queue_paused,
        "heartbeat_stale": heartbeat_stale,
        "consecutive_failures": int(health_dict.get("consecutive_failures", "0") or 0),
        "working_hours_active": is_working_hours(),
        "disk_free_gb": round(free_bytes / (1024 ** 3), 2),
        "storage_ok": free_bytes >= settings.MIN_FREE_DISK_BYTES,
        "chrome_download_dir": chrome_dir,
        "download_dir_ok": download_dir_ok,
        "staging_path": str(settings.STAGING_PATH),
        "library_count": library_count,
        "library_bytes": library_bytes,
    }


# ---------------------------------------------------------------- job intake

def submit_new_job(url: str, variant: str = "main", format_type: str = "WAV",
                   requested_by: str = "local_editor") -> Dict[str, Any]:
    """Submit a track or asset URL for downloading or instant cache resolution."""
    try:
        parsed_stock = parse_stock_url(url)
        canonical_url = parsed_stock["canonical_url"]
        track_id = parsed_stock["track_id"]
        provider_name = parsed_stock["provider"]
        category = parsed_stock["category"]
    except Exception:
        canonical_url = normalize_artlist_url(url)
        track_id = parse_artlist_url(canonical_url)
        provider_name = "artlist"
        category = "music"

    if not track_id:
        raise ValueError("Invalid stock URL: unable to parse track/asset ID")

    variant = variant.lower().strip()
    format_type = format_type.upper().strip()
    today = get_today_str()

    with get_db(write=True) as conn:
        track = conn.execute("""
            SELECT * FROM tracks WHERE track_id = ? AND variant = ?
        """, (track_id, variant)).fetchone()

        if track:
            lib_path = Path(track["library_path"])
            if lib_path.exists():
                conn.execute("""
                    UPDATE tracks SET hit_count = hit_count + 1 WHERE track_id = ? AND variant = ?
                """, (track_id, variant))
                conn.execute("""
                    INSERT INTO counters (day, downloads, cache_hits) VALUES (?, 0, 1)
                    ON CONFLICT(day) DO UPDATE SET cache_hits = cache_hits + 1
                """, (today,))

                c_row = conn.execute("SELECT downloads FROM counters WHERE day = ?", (today,)).fetchone()
                d_count = c_row["downloads"] if c_row else 0

                track_d = dict(track)
                return {
                    "type": "cached",
                    "job_id": str(uuid.uuid4()),
                    "status": "cached",
                    "track_id": track_id,
                    "variant": variant,
                    "provider": track_d.get("provider", "artlist"),
                    "category": track_d.get("category", "music"),
                    "filename": track["filename"],
                    "library_path": str(track["library_path"]),
                    "first_licensed_by": track["requested_by"],
                    "first_licensed_at": track["downloaded_at"],
                    "hit_count": track["hit_count"] + 1,
                    "daily_usage": f"{d_count}/{settings.DAILY_SAFETY_LIMIT}"
                }
            else:
                conn.execute("DELETE FROM tracks WHERE track_id = ? AND variant = ?", (track_id, variant))

        existing_job = conn.execute("""
            SELECT * FROM jobs
            WHERE track_id = ? AND variant = ? AND status IN ('queued', 'claimed', 'downloading', 'moving')
        """, (track_id, variant)).fetchone()

        if existing_job:
            return {
                "type": "queued",
                "job_id": existing_job["id"],
                "status": existing_job["status"],
                "queue_position": 1,
                "estimated_wait_seconds": settings.COOLDOWN_MAX_SECONDS,
                "daily_usage": "In-flight"
            }

        # Storage guard
        if get_disk_free_bytes() < settings.MIN_FREE_DISK_BYTES:
            raise OSError(
                f"Insufficient local storage: {round(get_disk_free_bytes() / 1024**3, 2)} GB free, "
                f"minimum {round(settings.MIN_FREE_DISK_BYTES / 1024**3, 2)} GB required."
            )

        # Quota is re-checked again at claim time; this is the fast-fail path.
        c_row = conn.execute("SELECT downloads FROM counters WHERE day = ?", (today,)).fetchone()
        today_downloads = c_row["downloads"] if c_row else 0
        queued_row = conn.execute("""
            SELECT COUNT(*) AS cnt FROM jobs
            WHERE status IN ('queued', 'claimed', 'downloading', 'moving')
        """).fetchone()
        pending = queued_row["cnt"] if queued_row else 0

        # Count work already committed against the cap
        if today_downloads + pending >= settings.DAILY_SAFETY_LIMIT:
            raise PermissionError(
                f"Daily safety quota reached ({today_downloads} done + {pending} pending "
                f"/ {settings.DAILY_SAFETY_LIMIT}). Use your personal stock seat for urgent downloads."
            )

        job_id = str(uuid.uuid4())
        now = datetime.now().isoformat()

        conn.execute("""
            INSERT INTO jobs (
                id, url, track_id, variant, format, requested_by, source, status, created_at, provider, category
            ) VALUES (?, ?, ?, ?, ?, ?, 'web_portal', 'queued', ?, ?, ?)
        """, (job_id, canonical_url, track_id, variant, format_type, requested_by, now, provider_name, category))

        pos_row = conn.execute("""
            SELECT COUNT(*) as pos FROM jobs WHERE status = 'queued' AND created_at <= ?
        """, (now,)).fetchone()
        queue_pos = pos_row["pos"] if pos_row else 1
        avg_cycle = (settings.COOLDOWN_MIN_SECONDS + settings.COOLDOWN_MAX_SECONDS) // 2 + 30
        est_wait = queue_pos * avg_cycle

        return {
            "type": "queued",
            "job_id": job_id,
            "status": "queued",
            "provider": provider_name,
            "category": category,
            "queue_position": queue_pos,
            "estimated_wait_seconds": est_wait,
            "daily_usage": f"{today_downloads}/{settings.DAILY_SAFETY_LIMIT}"
        }


# ------------------------------------------------------------- worker plumbing

def reap_stale_claims() -> int:
    """
    Requeue or fail jobs whose worker died mid-flight.

    Without this, a single crashed service worker leaves a job in 'claimed'
    forever and the queue never hands out another job.
    """
    cutoff = (datetime.now() - timedelta(seconds=settings.STALE_CLAIM_TIMEOUT_SECONDS)).isoformat()
    reaped = 0
    with get_db(write=True) as conn:
        # Liveness is "time since the worker last reported", NOT "time since
        # claimed". `status` stays 'claimed' for the whole job, so keying off
        # claimed_at reaped healthy jobs whose download simply ran longer than
        # the timeout - requeueing them and spending a second Artlist download
        # on a track that was already arriving. A large stems bundle takes
        # minutes; the worker posts phase and byte progress throughout, so
        # phase_updated_at is the honest signal.
        stale = conn.execute("""
            SELECT id, attempts, phase FROM jobs
            WHERE status IN ('claimed', 'downloading', 'moving')
              AND COALESCE(phase_updated_at, claimed_at) IS NOT NULL
              AND COALESCE(phase_updated_at, claimed_at) < ?
        """, (cutoff,)).fetchall()

        now = datetime.now().isoformat()
        for job in stale:
            attempts = job["attempts"] + 1
            reaped += 1
            detail = f"no progress for {settings.STALE_CLAIM_TIMEOUT_SECONDS}s at phase '{job['phase']}'"
            if attempts < 2:
                conn.execute("""
                    UPDATE jobs SET status = 'queued', attempts = ?, claimed_at = NULL,
                        phase = 'queued', error = ? WHERE id = ?
                """, (attempts, f"Worker stopped responding ({detail})", job["id"]))
            else:
                conn.execute("""
                    UPDATE jobs SET status = 'failed', attempts = ?, completed_at = ?,
                        phase = 'failed', error = ? WHERE id = ?
                """, (attempts, now, f"Worker stopped responding ({detail}, max attempts)", job["id"]))
    if reaped:
        print(f"[INFO] Reaped {reaped} stale job claim(s).")
    return reaped


def claim_next_job_for_worker() -> Optional[Dict[str, Any]]:
    """Worker loop endpoint to claim the next FIFO job."""
    reap_stale_claims()

    if not is_working_hours():
        return None

    today = get_today_str()

    with get_db(write=True) as conn:
        if get_health(conn, "queue_paused", "false").lower() == "true":
            return None

        # A logged-out session cannot complete a job; do not burn attempts on it.
        if get_health(conn, "session_authenticated", "true").lower() != "true":
            return None

        in_flight = conn.execute("""
            SELECT id FROM jobs WHERE status IN ('claimed', 'downloading', 'moving')
        """).fetchone()
        if in_flight:
            return None

        # Re-check quota at dispatch time. The submit-time check can be raced by
        # rapid submissions, and only completions increment the counter.
        c_row = conn.execute("SELECT downloads FROM counters WHERE day = ?", (today,)).fetchone()
        today_downloads = c_row["downloads"] if c_row else 0
        if today_downloads >= settings.DAILY_SAFETY_LIMIT:
            return None

        if get_disk_free_bytes() < settings.MIN_FREE_DISK_BYTES:
            return None

        job = conn.execute("""
            SELECT * FROM jobs WHERE status = 'queued' AND attempts < 2 ORDER BY created_at ASC LIMIT 1
        """).fetchone()

        if not job:
            return None

        now = datetime.now().isoformat()
        conn.execute("""
            UPDATE jobs SET status = 'claimed', claimed_at = ?, phase = 'opening_tab',
                phase_updated_at = ?, progress_bytes = 0, total_bytes = 0
            WHERE id = ?
        """, (now, now, job["id"]))

        return {
            "job_id": job["id"],
            "url": job["url"],
            "track_id": job["track_id"],
            "variant": job["variant"],
            "format": job["format"]
        }


def complete_worker_job(job_id: str, temp_filename: str, reported_bytes: int,
                        track_title: Optional[str] = None) -> Dict[str, Any]:
    """Execute staging-to-library handoff and record successful completion."""
    with get_db(write=True) as conn:
        job = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
        if not job:
            raise ValueError(f"Job not found: {job_id}")
        conn.execute("UPDATE jobs SET status = 'moving' WHERE id = ?", (job_id,))

    target_path, final_name, final_bytes, collided = deliver_file_to_library(
        temp_filename=temp_filename,
        reported_bytes=reported_bytes,
        track_title=track_title,
        track_id=job["track_id"],
        variant=job["variant"],
        format_type=job["format"]
    )

    now = datetime.now().isoformat()
    today = get_today_str()
    with get_db(write=True) as conn:
        conn.execute("""
            UPDATE jobs SET
                status = 'done',
                filename = ?,
                library_path = ?,
                bytes = ?,
                completed_at = ?,
                temp_filename = ?,
                phase = 'done',
                phase_updated_at = ?
            WHERE id = ?
        """, (final_name, str(target_path), final_bytes, now, temp_filename, now, job_id))

        # Extract provider and category from claimed job
        job_keys = job.keys() if hasattr(job, "keys") else []
        provider_name = job["provider"] if "provider" in job_keys and job["provider"] else "artlist"
        category = job["category"] if "category" in job_keys and job["category"] else "music"

        conn.execute("""
            INSERT INTO tracks (
                track_id, variant, title, filename, library_path, bytes,
                first_job_id, requested_by, downloaded_at, hit_count, url, provider, category
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
            ON CONFLICT(track_id, variant) DO UPDATE SET
                hit_count = hit_count + 1,
                library_path = excluded.library_path,
                downloaded_at = excluded.downloaded_at,
                provider = excluded.provider,
                category = excluded.category
        """, (
            job["track_id"],
            job["variant"],
            track_title or final_name,
            final_name,
            str(target_path),
            final_bytes,
            job_id,
            job["requested_by"],
            now,
            job["url"],
            provider_name,
            category,
        ))

        conn.execute("""
            INSERT INTO counters (day, downloads, cache_hits) VALUES (?, 1, 0)
            ON CONFLICT(day) DO UPDATE SET downloads = downloads + 1
        """, (today,))

        # Success clears the circuit breaker.
        set_health(conn, "consecutive_failures", "0")

    return {
        "status": "done",
        "job_id": job_id,
        "filename": final_name,
        "library_path": str(target_path),
        "bytes": final_bytes,
        "name_collided": collided,
    }


NO_STEMS_MESSAGE = (
    "This track has no stems on Artlist. Download the main track instead."
)


def fail_worker_job(job_id: str, reason: str, retryable: bool = True):
    """
    Handle worker failure, retry logic, and circuit breaker trip.

    `retryable=False` is used when the download already completed and only the
    local handoff failed (misconfigured download directory, verification
    failure). Requeueing those would spend a second Artlist download on a track
    that is already on disk.
    """
    with get_db(write=True) as conn:
        job = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
        if not job:
            return

        attempts = job["attempts"] + 1
        now = datetime.now().isoformat()

        # Terminal errors should never be retried
        if "NO_STEMS" in (reason or "") or "no stems" in (reason or "").lower():
            reason = NO_STEMS_MESSAGE
            retryable = False

        if "logged out" in (reason or "").lower() or "permissionerror" in (reason or "").lower():
            retryable = False

        if retryable and attempts < 2:
            conn.execute("""
                UPDATE jobs SET status = 'queued', attempts = ?, claimed_at = NULL, error = ?,
                    phase = 'queued', phase_updated_at = ?
                WHERE id = ?
            """, (attempts, reason, now, job_id))
        else:
            conn.execute("""
                UPDATE jobs SET status = 'failed', attempts = ?, error = ?, completed_at = ?,
                    phase = 'failed', phase_updated_at = ?
                WHERE id = ?
            """, (attempts, reason, now, now, job_id))

        # Explicit consecutive-failure counter
        streak = int(get_health(conn, "consecutive_failures", "0") or 0) + 1
        set_health(conn, "consecutive_failures", str(streak))

        if streak >= settings.CONSECUTIVE_FAILURE_LIMIT:
            set_health(conn, "queue_paused", "true")
            print(f"[ALERT] Circuit breaker tripped after {streak} consecutive failures. "
                  f"Queue paused. Last reason: {reason}")


def clear_job_history() -> int:
    """
    Delete finished and failed jobs.

    Only terminal rows go: anything queued or in flight is left alone so this can
    never interrupt work in progress.
    """
    with get_db(write=True) as conn:
        cur = conn.execute("DELETE FROM jobs WHERE status IN ('done', 'failed')")
        return cur.rowcount


def cancel_job(job_id: str) -> Dict[str, Any]:
    """Cancel a queued or in-flight job immediately."""
    with get_db(write=True) as conn:
        job = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
        if not job:
            raise ValueError(f"Job not found: {job_id}")
        now = datetime.now().isoformat()
        conn.execute("""
            UPDATE jobs SET status = 'failed', phase = 'failed', phase_detail = 'Cancelled by user',
                error = 'Cancelled by user', completed_at = ?, phase_updated_at = ?
            WHERE id = ?
        """, (now, now, job_id))
    return {"status": "cancelled", "job_id": job_id}


def resume_queue() -> None:
    """Clear a tripped circuit breaker and re-arm session (operator action)."""
    with get_db(write=True) as conn:
        set_health(conn, "queue_paused", "false")
        set_health(conn, "consecutive_failures", "0")
        set_health(conn, "session_authenticated", "true")


# -------------------------------------------------------------------- library

def search_library(query: str = "", category: Optional[str] = None) -> List[Dict[str, Any]]:
    """Search library tracks by title, filename, or track_id with optional category filter."""
    with get_db(write=False) as conn:
        sql = "SELECT * FROM tracks"
        conditions = []
        params = []

        if query:
            param = f"%{query}%"
            conditions.append("(title LIKE ? OR filename LIKE ? OR track_id LIKE ?)")
            params.extend([param, param, param])

        if category and category.lower() != "all":
            conditions.append("category = ?")
            params.append(category.lower())

        if conditions:
            sql += " WHERE " + " AND ".join(conditions)

        sql += " ORDER BY downloaded_at DESC LIMIT 60"
        rows = conn.execute(sql, tuple(params)).fetchall()

        results = []
        for r in rows:
            d = dict(r)
            p = Path(d.get("library_path", ""))
            suffix = p.suffix.lower()
            d["exists"] = p.exists()
            d["streamable"] = suffix in (".wav", ".mp3", ".m4a", ".flac", ".ogg", ".aiff")
            d["is_archive"] = suffix == ".zip"
            d["provider"] = d.get("provider") or "artlist"
            d["category"] = d.get("category") or "music"
            results.append(d)
        return results


def _unlinked_id(filename: str) -> str:
    """
    Deterministic placeholder ID for a library file with no known track ID.

    Deterministic matters: a random UUID per run meant every restart inserted a
    fresh row for the same file, and none of them could ever match a real
    parsed track ID, so the cache could never hit.
    """
    digest = hashlib.sha1(filename.encode("utf-8")).hexdigest()[:12]
    return f"unlinked-{digest}"


def _parse_library_filename(stem: str, suffix: str) -> Tuple[str, str]:
    """Recover (title, variant) from the library naming convention."""
    match = LIBRARY_NAME_PATTERN.match(stem)
    if match:
        variant = match.group("variant").strip().lower()
        if variant in KNOWN_VARIANTS:
            return match.group("title").strip(), variant
        return match.group("title").strip(), "main"
    return stem, "stems" if suffix.lower() == ".zip" else "main"


def startup_reconciliation() -> Dict[str, int]:
    """
    Reconcile persisted state with what is actually on disk.

    Three jobs:
      1. Purge stale staging files.
      2. Evict track rows whose file has been deleted.
      3. Index library files that are not in the table, recovering the real
         track_id from job history where possible.
    """
    print("Running startup reconciliation...")
    stats = {"staging_purged": 0, "evicted": 0, "indexed": 0, "relinked": 0}
    now_ts = time.time()

    for item in settings.STAGING_PATH.glob("*"):
        if item.is_file():
            try:
                if now_ts - item.stat().st_mtime > 3600:
                    item.unlink(missing_ok=True)
                    stats["staging_purged"] += 1
            except Exception:
                pass

    with get_db(write=True) as conn:
        # Re-queue any in-flight jobs that were interrupted by a process restart
        conn.execute("""
            UPDATE jobs SET status = 'queued', phase = 'queued', claimed_at = NULL
            WHERE status IN ('claimed', 'downloading', 'moving')
        """)

        # 2. Evict rows whose backing file is gone.
        for row in conn.execute("SELECT track_id, variant, library_path FROM tracks").fetchall():
            if not Path(row["library_path"]).exists():
                conn.execute("DELETE FROM tracks WHERE track_id = ? AND variant = ?",
                             (row["track_id"], row["variant"]))
                stats["evicted"] += 1

        # 3. Index unknown files.
        known = {r["filename"] for r in conn.execute("SELECT filename FROM tracks").fetchall()}

        for file in sorted(settings.LIBRARY_PATH.glob("*.*")):
            if not file.is_file() or file.suffix.lower() not in (".wav", ".zip", ".mp3"):
                continue
            if file.name in known:
                continue

            title, variant = _parse_library_filename(file.stem, file.suffix)

            # Prefer the real track_id from a completed job for this exact file.
            job_row = conn.execute("""
                SELECT track_id, variant, requested_by, url FROM jobs
                WHERE filename = ? AND status = 'done' ORDER BY completed_at DESC LIMIT 1
            """, (file.name,)).fetchone()

            if job_row:
                track_id = job_row["track_id"]
                variant = job_row["variant"]
                requested_by = job_row["requested_by"]
                url = job_row["url"]
                stats["relinked"] += 1
            else:
                track_id = _unlinked_id(file.name)
                requested_by = "startup_import"
                url = None

            now_str = datetime.now().isoformat()
            conn.execute("""
                INSERT OR IGNORE INTO tracks (
                    track_id, variant, title, filename, library_path, bytes,
                    first_job_id, requested_by, downloaded_at, hit_count, url
                ) VALUES (?, ?, ?, ?, ?, ?, 'startup_import', ?, ?, 0, ?)
            """, (track_id, variant, title, file.name, str(file),
                  file.stat().st_size, requested_by, now_str, url))
            known.add(file.name)
            stats["indexed"] += 1

    print(f"Reconciliation complete: {stats}")
    return stats
