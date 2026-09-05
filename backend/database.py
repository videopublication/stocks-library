import sqlite3
import threading
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, List, Dict, Any
from backend.config import settings

# Global write lock for SQLite WAL mode single-writer pattern
db_write_lock = threading.Lock()


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(str(settings.DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA busy_timeout = 5000;")
    conn.execute("PRAGMA synchronous = NORMAL;")
    return conn


@contextmanager
def get_db(write: bool = False):
    if write:
        with db_write_lock:
            conn = get_connection()
            try:
                yield conn
                conn.commit()
            except Exception:
                conn.rollback()
                raise
            finally:
                conn.close()
    else:
        conn = get_connection()
        try:
            yield conn
        finally:
            conn.close()


def init_db():
    """Initialize database tables with WAL mode, migrations, and seed default admin."""
    with get_db(write=True) as conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS jobs (
            id             TEXT PRIMARY KEY,
            url            TEXT NOT NULL,
            track_id       TEXT NOT NULL,
            variant        TEXT NOT NULL DEFAULT 'main',
            format         TEXT NOT NULL DEFAULT 'WAV',
            requested_by   TEXT NOT NULL DEFAULT 'local_editor',
            source         TEXT NOT NULL DEFAULT 'web_portal',
            status         TEXT NOT NULL,
            temp_filename  TEXT,
            filename       TEXT,
            library_path   TEXT,
            bytes          INTEGER,
            error          TEXT,
            attempts       INTEGER NOT NULL DEFAULT 0,
            created_at     TEXT NOT NULL,
            claimed_at     TEXT,
            completed_at   TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status, created_at);

        CREATE TABLE IF NOT EXISTS tracks (
            track_id       TEXT NOT NULL,
            variant        TEXT NOT NULL DEFAULT 'main',
            title          TEXT,
            filename       TEXT NOT NULL,
            library_path   TEXT NOT NULL,
            bytes          INTEGER NOT NULL,
            first_job_id   TEXT NOT NULL,
            requested_by   TEXT NOT NULL,
            downloaded_at  TEXT NOT NULL,
            hit_count      INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (track_id, variant)
        );
        CREATE INDEX IF NOT EXISTS idx_tracks_search ON tracks(title, filename);

        CREATE TABLE IF NOT EXISTS counters (
            day            TEXT PRIMARY KEY,
            downloads      INTEGER NOT NULL DEFAULT 0,
            cache_hits     INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS health (
            k              TEXT PRIMARY KEY,
            v              TEXT NOT NULL,
            updated_at     TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS users (
            id             TEXT PRIMARY KEY,
            username       TEXT UNIQUE NOT NULL,
            password_hash  TEXT NOT NULL,
            full_name      TEXT NOT NULL DEFAULT '',
            role           TEXT NOT NULL DEFAULT 'editor',
            is_active      INTEGER NOT NULL DEFAULT 1,
            created_at     TEXT NOT NULL,
            last_login     TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

        CREATE TABLE IF NOT EXISTS system_settings (
            key            TEXT PRIMARY KEY,
            value          TEXT NOT NULL,
            updated_at     TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS reuse_events (
            id                  TEXT PRIMARY KEY,
            track_id            TEXT NOT NULL,
            variant             TEXT NOT NULL DEFAULT 'main',
            title               TEXT,
            filename            TEXT,
            reused_by           TEXT NOT NULL,
            original_downloader TEXT,
            bytes               INTEGER NOT NULL DEFAULT 0,
            provider            TEXT NOT NULL DEFAULT 'artlist',
            category            TEXT NOT NULL DEFAULT 'music',
            source              TEXT NOT NULL DEFAULT 'library_download',
            created_at          TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_reuse_reused_by ON reuse_events(reused_by);
        CREATE INDEX IF NOT EXISTS idx_reuse_created_at ON reuse_events(created_at);
        """)

        # Backfill historical reuses from jobs where source is web_library
        try:
            conn.execute("""
                INSERT OR IGNORE INTO reuse_events (id, track_id, variant, title, filename, reused_by, original_downloader, bytes, provider, category, source, created_at)
                SELECT j.id, j.track_id, j.variant, COALESCE(t.title, j.filename, j.track_id), j.filename, j.requested_by, COALESCE(t.requested_by, 'studio'), j.bytes, COALESCE(j.provider, t.provider, 'artlist'), COALESCE(j.category, t.category, 'music'), 'library_download', j.created_at
                FROM jobs j
                LEFT JOIN tracks t ON j.track_id = t.track_id AND j.variant = t.variant
                WHERE j.source = 'web_library' AND j.status IN ('completed', 'done');
            """)
        except Exception:
            pass

        # --- migrations -------------------------------------------------
        track_cols = {row[1] for row in conn.execute("PRAGMA table_info(tracks)")}
        if "url" not in track_cols:
            conn.execute("ALTER TABLE tracks ADD COLUMN url TEXT")
        if "provider" not in track_cols:
            conn.execute("ALTER TABLE tracks ADD COLUMN provider TEXT NOT NULL DEFAULT 'artlist'")
        if "category" not in track_cols:
            conn.execute("ALTER TABLE tracks ADD COLUMN category TEXT NOT NULL DEFAULT 'music'")

        existing = {row[1] for row in conn.execute("PRAGMA table_info(jobs)")}
        migrations = {
            "phase": "TEXT NOT NULL DEFAULT 'queued'",
            "phase_detail": "TEXT",
            "phase_updated_at": "TEXT",
            "progress_bytes": "INTEGER NOT NULL DEFAULT 0",
            "total_bytes": "INTEGER NOT NULL DEFAULT 0",
            "provider": "TEXT NOT NULL DEFAULT 'artlist'",
            "category": "TEXT NOT NULL DEFAULT 'music'",
            "cancelled_by": "TEXT",
        }
        for column, ddl in migrations.items():
            if column not in existing:
                conn.execute(f"ALTER TABLE jobs ADD COLUMN {column} {ddl}")

        user_cols = {row[1] for row in conn.execute("PRAGMA table_info(users)")}
        if "recent_cleared_at" not in user_cols:
            conn.execute("ALTER TABLE users ADD COLUMN recent_cleared_at TEXT")

        # Initialize default health rows if not present
        now = datetime.now().isoformat()
        conn.execute("""
            INSERT OR IGNORE INTO health (k, v, updated_at)
            VALUES ('session_authenticated', 'true', ?)
        """, (now,))
        conn.execute("""
            INSERT OR IGNORE INTO health (k, v, updated_at)
            VALUES ('queue_paused', 'false', ?)
        """, (now,))

        # Initialize default dynamic settings
        default_settings = {
            "daily_safety_limit": str(settings.DAILY_SAFETY_LIMIT),
            "working_hours_enabled": "true" if settings.WORKING_HOURS_ENABLED else "false",
            "working_hours_start": settings.WORKING_HOURS_START,
            "working_hours_end": settings.WORKING_HOURS_END,
            "cooldown_min_seconds": str(settings.COOLDOWN_MIN_SECONDS),
            "cooldown_max_seconds": str(settings.COOLDOWN_MAX_SECONDS),
            "show_host_tools_to_editors": "false",
            "allow_editor_delete_all": "true",
            "library_download_path": str(settings.LIBRARY_PATH),
        }
        for k, v in default_settings.items():
            conn.execute("""
                INSERT OR IGNORE INTO system_settings (key, value, updated_at)
                VALUES (?, ?, ?)
            """, (k, v, now))

        # Seed default admin user if no admin exists
        admin_row = conn.execute("SELECT id FROM users WHERE role = 'admin' LIMIT 1").fetchone()
        if not admin_row:
            from backend.auth import hash_password
            admin_id = str(uuid.uuid4())
            admin_hash = hash_password("admin123")
            conn.execute("""
                INSERT OR IGNORE INTO users (id, username, password_hash, full_name, role, is_active, created_at)
                VALUES (?, 'admin', ?, 'Studio Administrator', 'admin', 1, ?)
            """, (admin_id, admin_hash, now))


# --- User Management CRUD ----------------------------------------------------

def get_user_by_username(username: str) -> Optional[Dict[str, Any]]:
    """Fetch active user by username."""
    with get_db() as conn:
        row = conn.execute("SELECT * FROM users WHERE username = ?", (username.strip().lower(),)).fetchone()
        return dict(row) if row else None


def get_user_by_id(user_id: str) -> Optional[Dict[str, Any]]:
    """Fetch user by id."""
    with get_db() as conn:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        return dict(row) if row else None


def list_users() -> List[Dict[str, Any]]:
    """List all users with their download counts."""
    with get_db() as conn:
        rows = conn.execute("""
            SELECT u.id, u.username, u.full_name, u.role, u.is_active, u.created_at, u.last_login,
                   COUNT(j.id) as total_downloads
            FROM users u
            LEFT JOIN jobs j ON j.requested_by = u.username AND j.status IN ('completed', 'done')
            GROUP BY u.id
            ORDER BY u.created_at ASC
        """).fetchall()
        return [dict(r) for r in rows]


def create_user(username: str, password_hash: str, role: str = "editor", full_name: str = "") -> Dict[str, Any]:
    """Create a new user."""
    user_id = str(uuid.uuid4())
    now = datetime.now().isoformat()
    clean_username = username.strip().lower()
    with get_db(write=True) as conn:
        conn.execute("""
            INSERT INTO users (id, username, password_hash, full_name, role, is_active, created_at)
            VALUES (?, ?, ?, ?, ?, 1, ?)
        """, (user_id, clean_username, password_hash, full_name.strip(), role, now))
    return get_user_by_id(user_id)


def update_user(user_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Update user fields (full_name, role, is_active, password_hash)."""
    allowed_fields = {"full_name", "role", "is_active", "password_hash"}
    set_clauses = []
    values = []
    for k, v in updates.items():
        if k in allowed_fields:
            set_clauses.append(f"{k} = ?")
            values.append(v)
    if not set_clauses:
        return get_user_by_id(user_id)

    values.append(user_id)
    with get_db(write=True) as conn:
        conn.execute(f"UPDATE users SET {', '.join(set_clauses)} WHERE id = ?", tuple(values))
    return get_user_by_id(user_id)


def delete_user(user_id: str) -> bool:
    """Delete a user. Cannot delete the last admin."""
    with get_db(write=True) as conn:
        target = conn.execute("SELECT role FROM users WHERE id = ?", (user_id,)).fetchone()
        if not target:
            return False
        if target["role"] == "admin":
            admin_count = conn.execute("SELECT COUNT(*) FROM users WHERE role = 'admin' AND is_active = 1").fetchone()[0]
            if admin_count <= 1:
                raise ValueError("Cannot delete the only active administrator.")
        conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
        return True


def update_user_last_login(user_id: str):
    """Update last_login timestamp for a user."""
    now = datetime.now().isoformat()
    with get_db(write=True) as conn:
        conn.execute("UPDATE users SET last_login = ? WHERE id = ?", (now, user_id))


# --- Dynamic System Settings -------------------------------------------------

def get_dynamic_setting(key: str, default: Any = None) -> Any:
    """Read a setting from system_settings table with fallback to default."""
    with get_db() as conn:
        row = conn.execute("SELECT value FROM system_settings WHERE key = ?", (key,)).fetchone()
        return row["value"] if row else default


def set_dynamic_setting(key: str, value: str):
    """Write a setting to system_settings table."""
    now = datetime.now().isoformat()
    with get_db(write=True) as conn:
        conn.execute("""
            INSERT INTO system_settings (key, value, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
        """, (key, str(value), now))


def get_all_dynamic_settings() -> Dict[str, str]:
    """Retrieve all dynamic settings as a key-value dictionary."""
    with get_db() as conn:
        rows = conn.execute("SELECT key, value FROM system_settings").fetchall()
        return {r["key"]: r["value"] for r in rows}


def format_bytes_human(num_bytes: int) -> str:
    """Formats bytes into human readable string."""
    if not num_bytes:
        return "0 B"
    val = float(num_bytes)
    for unit in ['B', 'KB', 'MB', 'GB']:
        if abs(val) < 1024.0:
            return f"{val:.1f} {unit}"
        val /= 1024.0
    return f"{val:.1f} TB"


# --- User Activity & Audit Statistics ---------------------------------------

def log_reuse_event(
    track_id: str,
    variant: str,
    reused_by: str,
    source: str = "library_download",
) -> Optional[Dict[str, Any]]:
    """Records an asset reuse event with original attribution and file size."""
    with get_db(write=True) as conn:
        track = conn.execute(
            "SELECT * FROM tracks WHERE track_id = ? AND variant = ?",
            (track_id, variant)
        ).fetchone()
        if not track:
            return None

        event_id = str(uuid.uuid4())
        now_iso = datetime.now().isoformat()
        title = track["title"] or track["filename"] or track_id
        orig = track["requested_by"] or "studio"
        b = track["bytes"] or 0
        prov = track["provider"] or "artlist"
        cat = track["category"] or "music"

        conn.execute("""
            INSERT INTO reuse_events (id, track_id, variant, title, filename, reused_by, original_downloader, bytes, provider, category, source, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (event_id, track_id, variant, title, track["filename"], reused_by, orig, b, prov, cat, source, now_iso))

        return {
            "id": event_id,
            "track_id": track_id,
            "variant": variant,
            "title": title,
            "reused_by": reused_by,
            "original_downloader": orig,
            "bytes": b,
            "bytes_formatted": format_bytes_human(b),
            "provider": prov,
            "category": cat,
            "source": source,
            "created_at": now_iso,
        }


def get_reuse_statistics(days: int = 30) -> Dict[str, Any]:
    """Returns aggregated reuse statistics and top reused assets across the studio."""
    cutoff = (datetime.now() - timedelta(days=max(1, min(days, 365)))).strftime("%Y-%m-%d")
    with get_db() as conn:
        tot_row = conn.execute("""
            SELECT 
                COUNT(id) as total_reuses,
                COALESCE(SUM(bytes), 0) as total_bytes_saved
            FROM reuse_events
            WHERE created_at >= ?
        """, (cutoff,)).fetchone()

        total_reuses = tot_row["total_reuses"] or 0
        total_bytes_saved = tot_row["total_bytes_saved"] or 0

        top_assets = conn.execute("""
            SELECT 
                track_id, variant, title, provider, category, original_downloader,
                COUNT(id) as reuse_count,
                COALESCE(SUM(bytes), 0) as bytes_saved
            FROM reuse_events
            WHERE created_at >= ?
            GROUP BY track_id, variant
            ORDER BY reuse_count DESC, bytes_saved DESC
            LIMIT 10
        """, (cutoff,)).fetchall()

        top_reusers = conn.execute("""
            SELECT 
                reused_by,
                COUNT(id) as count,
                COALESCE(SUM(bytes), 0) as bytes_saved
            FROM reuse_events
            WHERE created_at >= ?
            GROUP BY reused_by
            ORDER BY count DESC
            LIMIT 10
        """, (cutoff,)).fetchall()

        return {
            "total_reuses": total_reuses,
            "total_bytes_saved": total_bytes_saved,
            "total_bytes_saved_formatted": format_bytes_human(total_bytes_saved),
            "top_assets": [
                {
                    "track_id": r["track_id"],
                    "variant": r["variant"],
                    "title": r["title"] or r["track_id"],
                    "provider": r["provider"] or "artlist",
                    "category": r["category"] or "music",
                    "original_downloader": r["original_downloader"] or "studio",
                    "reuse_count": r["reuse_count"],
                    "bytes_saved": r["bytes_saved"],
                    "bytes_saved_formatted": format_bytes_human(r["bytes_saved"]),
                }
                for r in top_assets
            ],
            "top_reusers": [
                {
                    "username": r["reused_by"],
                    "count": r["count"],
                    "bytes_saved": r["bytes_saved"],
                    "bytes_saved_formatted": format_bytes_human(r["bytes_saved"]),
                }
                for r in top_reusers
            ]
        }


def get_user_audit_stats() -> List[Dict[str, Any]]:
    """Returns recent activities including downloads, reuses, and cancellations."""
    with get_db() as conn:
        rows = conn.execute("""
            SELECT j.id, j.id as job_id, j.track_id, j.variant, j.requested_by, j.cancelled_by, j.error, j.url, j.filename,
                   j.bytes, j.status, j.source, j.created_at, j.completed_at,
                   COALESCE(t.title, j.phase_detail, j.track_id) AS title,
                   COALESCE(t.provider, j.provider, 'artlist') AS provider,
                   COALESCE(t.category, j.category, 'music') AS category,
                   COALESCE(t.requested_by, 'studio') AS original_downloader
            FROM jobs j
            LEFT JOIN tracks t ON j.track_id = t.track_id AND j.variant = t.variant
            ORDER BY j.created_at DESC
            LIMIT 150
        """).fetchall()

        results = []
        for r in rows:
            d = dict(r)
            status_val = d.get("status")
            source_val = d.get("source")
            is_reuse = (source_val in ("web_library", "library_reuse", "cache_reuse") or status_val == "cached")

            if status_val == "cancelled":
                event_type = "cancelled"
            elif status_val == "failed":
                event_type = "failed"
            elif is_reuse:
                event_type = "reuse"
            else:
                event_type = "download"

            d["is_reuse"] = is_reuse
            d["event_type"] = event_type
            d["formatted_bytes"] = format_bytes_human(d.get("bytes") or 0)
            results.append(d)
        return results


def get_user_detailed_report(user_id_or_username: str) -> Optional[Dict[str, Any]]:
    """
    Returns detailed profile stats, KPI metrics, platform breakdown,
    and complete personal download history for an individual user.
    """
    with get_db() as conn:
        user_row = conn.execute("""
            SELECT id, username, full_name, role, is_active, created_at, last_login, recent_cleared_at
            FROM users
            WHERE id = ? OR username = ?
        """, (user_id_or_username, user_id_or_username.lower())).fetchone()

        if not user_row:
            job_check = conn.execute("SELECT requested_by FROM jobs WHERE requested_by = ? LIMIT 1", (user_id_or_username,)).fetchone()
            if not job_check:
                return None
            user = {
                "id": user_id_or_username,
                "username": user_id_or_username,
                "full_name": user_id_or_username,
                "role": "editor",
                "is_active": 1,
                "created_at": "",
                "last_login": None,
            }
        else:
            user = dict(user_row)

        username = user["username"]

        summary_row = conn.execute("""
            SELECT 
                COUNT(id) as total_requests,
                SUM(CASE WHEN status IN ('completed', 'done') THEN 1 ELSE 0 END) as completed_downloads,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_downloads,
                SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_downloads,
                SUM(CASE WHEN status IN ('completed', 'done') THEN bytes ELSE 0 END) as total_bytes,
                COUNT(DISTINCT SUBSTR(created_at, 1, 10)) as active_days,
                MIN(created_at) as first_download_at,
                MAX(created_at) as last_download_at
            FROM jobs
            WHERE requested_by = ?
        """, (username,)).fetchone()

        total_requests = summary_row["total_requests"] or 0
        completed = summary_row["completed_downloads"] or 0
        failed = summary_row["failed_downloads"] or 0
        cancelled = summary_row["cancelled_downloads"] or 0
        total_bytes = summary_row["total_bytes"] or 0
        success_rate = round((completed / total_requests * 100), 1) if total_requests > 0 else 100.0

        # Personal reuse and team contribution metrics
        reuse_stat = conn.execute("""
            SELECT 
                COUNT(id) as personal_reuses,
                COALESCE(SUM(bytes), 0) as bandwidth_saved
            FROM reuse_events
            WHERE reused_by = ?
        """, (username,)).fetchone()

        teammate_stat = conn.execute("""
            SELECT 
                COUNT(id) as teammate_reuses
            FROM reuse_events
            WHERE original_downloader = ? AND reused_by != ?
        """, (username, username)).fetchone()

        personal_reuses = (reuse_stat["personal_reuses"] if reuse_stat else 0)
        bandwidth_saved = (reuse_stat["bandwidth_saved"] if reuse_stat else 0)
        teammate_reuses = (teammate_stat["teammate_reuses"] if teammate_stat else 0)

        platform_rows = conn.execute("""
            SELECT 
                COALESCE(provider, 'artlist') as provider_name,
                COUNT(id) as count,
                SUM(CASE WHEN status IN ('completed', 'done') THEN bytes ELSE 0 END) as bytes
            FROM jobs
            WHERE requested_by = ?
            GROUP BY provider_name
        """, (username,)).fetchall()

        platforms = {r["provider_name"].lower(): {"count": r["count"], "bytes": r["bytes"] or 0} for r in platform_rows}
        if "artlist" not in platforms:
            platforms["artlist"] = {"count": 0, "bytes": 0}
        if "envato" not in platforms:
            platforms["envato"] = {"count": 0, "bytes": 0}

        category_rows = conn.execute("""
            SELECT 
                COALESCE(t.category, j.category, 'music') as cat_name,
                COUNT(j.id) as count
            FROM jobs j
            LEFT JOIN tracks t ON j.track_id = t.track_id AND j.variant = t.variant
            WHERE j.requested_by = ?
            GROUP BY cat_name
            ORDER BY count DESC
        """, (username,)).fetchall()
        categories = [{"category": r["cat_name"], "count": r["count"]} for r in category_rows]

        history_rows = conn.execute("""
            SELECT 
                j.id as job_id,
                j.url,
                j.track_id,
                j.variant,
                j.format,
                j.status,
                j.source,
                j.phase,
                j.phase_detail,
                j.bytes,
                j.created_at,
                j.completed_at,
                j.cancelled_by,
                j.error,
                COALESCE(t.title, j.phase_detail, j.filename, j.track_id) as title,
                COALESCE(t.provider, j.provider, 'artlist') as provider,
                COALESCE(t.category, j.category, 'music') as category,
                COALESCE(t.requested_by, 'studio') as original_downloader
            FROM jobs j
            LEFT JOIN tracks t ON j.track_id = t.track_id AND j.variant = t.variant
            WHERE j.requested_by = ?
            ORDER BY j.created_at DESC
            LIMIT 200
        """, (username,)).fetchall()

        history = []
        for r in history_rows:
            d = dict(r)
            status_val = d.get("status")
            source_val = d.get("source")
            is_reuse = (source_val in ("web_library", "library_reuse", "cache_reuse") or status_val == "cached")
            if status_val == "cancelled":
                event_type = "cancelled"
            elif status_val == "failed":
                event_type = "failed"
            elif is_reuse:
                event_type = "reuse"
            else:
                event_type = "download"

            d["is_reuse"] = is_reuse
            d["event_type"] = event_type
            d["formatted_bytes"] = format_bytes_human(d.get("bytes") or 0)
            history.append(d)

        return {
            "user": {
                "id": user["id"],
                "username": user["username"],
                "full_name": user.get("full_name") or user["username"],
                "role": user["role"],
                "is_active": bool(user["is_active"]),
                "created_at": user["created_at"],
                "last_login": user.get("last_login"),
            },
            "summary": {
                "total_requests": total_requests,
                "completed_downloads": completed,
                "failed_downloads": failed,
                "cancelled_downloads": cancelled,
                "total_bytes": total_bytes,
                "formatted_bytes": format_bytes_human(total_bytes),
                "personal_reuses": personal_reuses,
                "bandwidth_saved": bandwidth_saved,
                "bandwidth_saved_formatted": format_bytes_human(bandwidth_saved),
                "teammate_reuses": teammate_reuses,
                "success_rate": success_rate,
                "active_days": summary_row["active_days"] or 0,
                "first_download_at": summary_row["first_download_at"],
                "last_download_at": summary_row["last_download_at"],
            },
            "platforms": platforms,
            "categories": categories,
            "history": history,
        }



# --- Analytics & Reporting Engine -------------------------------------------

def get_analytics_report(period: str = "daily", days: int = 30) -> Dict[str, Any]:
    """
    Computes comprehensive analytics across jobs, reuses, and tracks.
    Supports period = 'daily', 'weekly', 'monthly'.
    """
    now = datetime.now()
    clean_period = (period or "daily").lower()

    if clean_period == "daily":
        limit_days = max(1, min(days or 7, 90))
        cutoff = (now - timedelta(days=limit_days)).strftime("%Y-%m-%d")
        group_expr = "SUBSTR(j.created_at, 1, 10)"
    elif clean_period == "weekly":
        limit_weeks = 12
        cutoff = (now - timedelta(weeks=limit_weeks)).strftime("%Y-%m-%d")
        group_expr = "strftime('%Y-W%W', j.created_at)"
    else:  # monthly
        limit_months = 12
        cutoff = (now - timedelta(days=limit_months * 31)).strftime("%Y-%m-%d")
        group_expr = "SUBSTR(j.created_at, 1, 7)"

    with get_db() as conn:
        # 1. Summary KPI totals in window
        summary_row = conn.execute("""
            SELECT 
                COUNT(id) as total_requests,
                SUM(CASE WHEN status IN ('completed', 'done') THEN 1 ELSE 0 END) as completed_downloads,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_downloads,
                SUM(CASE WHEN status IN ('completed', 'done') THEN bytes ELSE 0 END) as total_bytes,
                COUNT(DISTINCT requested_by) as active_editors_count
            FROM jobs j
            WHERE j.created_at >= ?
        """, (cutoff,)).fetchone()

        total_requests = summary_row["total_requests"] or 0
        completed = summary_row["completed_downloads"] or 0
        failed = summary_row["failed_downloads"] or 0
        total_bytes = summary_row["total_bytes"] or 0
        active_editors = summary_row["active_editors_count"] or 0
        success_rate = round((completed / total_requests * 100.0), 1) if total_requests > 0 else 100.0

        # Reuse stats in window
        reuse_row = conn.execute("""
            SELECT 
                COUNT(id) as total_reuses,
                COALESCE(SUM(bytes), 0) as bandwidth_saved
            FROM reuse_events
            WHERE created_at >= ?
        """, (cutoff,)).fetchone()
        total_reuses = reuse_row["total_reuses"] or 0
        bandwidth_saved = reuse_row["bandwidth_saved"] or 0

        # 2. Timeline series buckets (including reuses)
        timeline_rows = conn.execute(f"""
            SELECT 
                {group_expr} as bucket,
                COUNT(id) as requests,
                SUM(CASE WHEN status IN ('completed', 'done') THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
                SUM(CASE WHEN source IN ('web_library', 'library_reuse', 'cache_reuse') THEN 1 ELSE 0 END) as reuses,
                SUM(CASE WHEN status IN ('completed', 'done') THEN bytes ELSE 0 END) as bytes
            FROM jobs j
            WHERE j.created_at >= ?
            GROUP BY bucket
            ORDER BY bucket ASC
        """, (cutoff,)).fetchall()

        timeline = [
            {
                "bucket": r["bucket"] or "Unknown",
                "requests": r["requests"],
                "completed": r["completed"],
                "failed": r["failed"],
                "reuses": r["reuses"] or 0,
                "bytes": r["bytes"] or 0
            }
            for r in timeline_rows if r["bucket"]
        ]

        # 3. Platform breakdown (Envato vs Artlist)
        platform_rows = conn.execute("""
            SELECT 
                COALESCE(provider, 'artlist') as provider_name,
                COUNT(id) as count,
                SUM(CASE WHEN status IN ('completed', 'done') THEN bytes ELSE 0 END) as bytes
            FROM jobs
            WHERE created_at >= ? AND status IN ('completed', 'done')
            GROUP BY provider_name
        """, (cutoff,)).fetchall()

        platforms = {r["provider_name"].lower(): {"count": r["count"], "bytes": r["bytes"] or 0} for r in platform_rows}

        # 4. Category breakdown
        category_rows = conn.execute("""
            SELECT 
                COALESCE(t.category, j.category, 'music') as cat_name,
                COUNT(j.id) as count,
                SUM(j.bytes) as bytes
            FROM jobs j
            LEFT JOIN tracks t ON j.track_id = t.track_id AND j.variant = t.variant
            WHERE j.created_at >= ? AND j.status IN ('completed', 'done')
            GROUP BY cat_name
            ORDER BY count DESC
        """, (cutoff,)).fetchall()

        categories = [
            {"category": r["cat_name"] or "other", "count": r["count"], "bytes": r["bytes"] or 0}
            for r in category_rows
        ]

        # 5. Top Reused Assets
        top_reused_rows = conn.execute("""
            SELECT 
                track_id, variant, title, provider, category, original_downloader,
                COUNT(id) as reuse_count,
                COALESCE(SUM(bytes), 0) as bytes_saved
            FROM reuse_events
            WHERE created_at >= ?
            GROUP BY track_id, variant
            ORDER BY reuse_count DESC, bytes_saved DESC
            LIMIT 5
        """, (cutoff,)).fetchall()

        top_reused = [
            {
                "track_id": r["track_id"],
                "variant": r["variant"],
                "title": r["title"] or r["track_id"],
                "provider": r["provider"] or "artlist",
                "category": r["category"] or "music",
                "original_downloader": r["original_downloader"] or "studio",
                "reuse_count": r["reuse_count"],
                "bytes_saved": r["bytes_saved"],
                "bytes_saved_formatted": format_bytes_human(r["bytes_saved"]),
            }
            for r in top_reused_rows
        ]

        # 6. Editor Leaderboard
        editor_rows = conn.execute("""
            SELECT 
                j.requested_by,
                u.full_name,
                COUNT(j.id) as total_requests,
                SUM(CASE WHEN j.status IN ('completed', 'done') THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN j.status IN ('completed', 'done') THEN j.bytes ELSE 0 END) as bytes,
                MAX(j.created_at) as last_active
            FROM jobs j
            LEFT JOIN users u ON u.username = j.requested_by
            WHERE j.created_at >= ?
            GROUP BY j.requested_by
            ORDER BY completed DESC, total_requests DESC
            LIMIT 25
        """, (cutoff,)).fetchall()

        leaderboard = [
            {
                "username": r["requested_by"],
                "full_name": r["full_name"] or r["requested_by"],
                "total_requests": r["total_requests"],
                "completed": r["completed"],
                "bytes": r["bytes"] or 0,
                "last_active": r["last_active"]
            }
            for r in editor_rows
        ]

        return {
            "period": clean_period,
            "cutoff_date": cutoff,
            "summary": {
                "total_requests": total_requests,
                "completed_downloads": completed,
                "failed_downloads": failed,
                "total_bytes": total_bytes,
                "total_bytes_formatted": format_bytes_human(total_bytes),
                "total_reuses": total_reuses,
                "bandwidth_saved": bandwidth_saved,
                "bandwidth_saved_formatted": format_bytes_human(bandwidth_saved),
                "success_rate": success_rate,
                "active_editors_count": active_editors
            },
            "timeline": timeline,
            "platforms": platforms,
            "categories": categories,
            "top_reused": top_reused,
            "leaderboard": leaderboard
        }


# --- Disaster Recovery & Backup Engine --------------------------------------

def get_backup_directory() -> Path:
    """Returns the configured backup directory or defaults to ./backups."""
    configured = get_dynamic_setting("backup_directory", "")
    if configured and configured.strip():
        p = Path(configured.strip())
    else:
        p = settings.DB_PATH.parent / "backups"
    try:
        p.mkdir(parents=True, exist_ok=True)
    except Exception:
        fallback = settings.DB_PATH.parent / "backups"
        fallback.mkdir(parents=True, exist_ok=True)
        return fallback
    return p


def cleanup_old_backups(backup_dir: Optional[Path] = None, max_keep: int = 30):
    """Deletes backups exceeding max_keep limit."""
    try:
        backups = list_database_backups(backup_dir)
        if len(backups) > max_keep:
            for extra in backups[max_keep:]:
                extra_path = Path(extra["path"])
                if extra_path.exists():
                    extra_path.unlink()
    except Exception as e:
        print(f"[Backup] Cleanup notice: {e}")


def list_database_backups(backup_dir: Optional[Path] = None) -> List[Dict[str, Any]]:
    """Returns list of existing backup files sorted newest first."""
    target_dir = backup_dir or get_backup_directory()
    if not target_dir.exists():
        return []

    files = [f for f in target_dir.glob("*.db") if f.is_file()]
    files.sort(key=lambda f: f.stat().st_mtime, reverse=True)

    backups = []
    for f in files:
        stat = f.stat()
        backups.append({
            "filename": f.name,
            "path": str(f.resolve()),
            "size_bytes": stat.st_size,
            "formatted_size": format_bytes_human(stat.st_size),
            "created_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
        })
    return backups


def create_database_backup(destination_dir: Optional[Path] = None, filename: Optional[str] = None) -> Path:
    """
    Creates a zero-downtime, fully consistent SQLite online backup of artlist_relay.db.
    Safe to run concurrently with active downloads.
    """
    dest_dir = destination_dir or get_backup_directory()
    dest_dir.mkdir(parents=True, exist_ok=True)

    if not filename:
        timestamp_str = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"artlist_relay_backup_{timestamp_str}.db"

    dest_path = dest_dir / filename

    src_conn = get_connection()
    dest_conn = sqlite3.connect(str(dest_path))
    try:
        with db_write_lock:
            src_conn.backup(dest_conn)
    finally:
        dest_conn.close()
        src_conn.close()

    cleanup_old_backups(dest_dir, max_keep=30)
    return dest_path


def restore_database_from_backup(backup_file_path: Path) -> bool:
    """
    Safely restores the live database from a backup file.
    Creates a pre-restore safety snapshot first.
    """
    if not backup_file_path.exists():
        raise FileNotFoundError(f"Backup file not found: {backup_file_path}")

    # Verify integrity of backup file
    test_conn = sqlite3.connect(str(backup_file_path))
    try:
        integrity = test_conn.execute("PRAGMA integrity_check;").fetchone()
        if not integrity or integrity[0] != "ok":
            raise ValueError(f"Backup file failed integrity check: {integrity[0] if integrity else 'unknown error'}")
    finally:
        test_conn.close()

    # Create safety backup of current live DB before replacing
    safety_name = f"pre_restore_safety_{datetime.now().strftime('%Y%m%d_%H%M%S')}.db"
    create_database_backup(filename=safety_name)

    # Perform online restore using backup API into main DB
    src_conn = sqlite3.connect(str(backup_file_path))
    dest_conn = get_connection()
    try:
        with db_write_lock:
            src_conn.backup(dest_conn)
    finally:
        dest_conn.close()
        src_conn.close()

    return True

