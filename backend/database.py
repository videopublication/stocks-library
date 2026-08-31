import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime
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
    """Initialize database tables with WAL mode."""
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
        """)
        
        # --- migrations -------------------------------------------------
        # Live progress columns, added after the first release. ALTER TABLE is
        # used rather than a schema bump so existing databases keep their data.
        # Source URL on tracks, so the library can link back to Artlist.
        track_cols = {row[1] for row in conn.execute("PRAGMA table_info(tracks)")}
        if "url" not in track_cols:
            conn.execute("ALTER TABLE tracks ADD COLUMN url TEXT")

        existing = {row[1] for row in conn.execute("PRAGMA table_info(jobs)")}
        migrations = {
            "phase": "TEXT NOT NULL DEFAULT 'queued'",
            "phase_detail": "TEXT",
            "phase_updated_at": "TEXT",
            "progress_bytes": "INTEGER NOT NULL DEFAULT 0",
            "total_bytes": "INTEGER NOT NULL DEFAULT 0",
        }
        for column, ddl in migrations.items():
            if column not in existing:
                conn.execute(f"ALTER TABLE jobs ADD COLUMN {column} {ddl}")

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
