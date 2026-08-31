import os
import secrets
from pathlib import Path
from pydantic import BaseModel

# Default base directory in workspace or user home
BASE_DIR = Path(__file__).resolve().parent.parent


def _default_token() -> str:
    """
    Read the shared token from env, or generate a random one per process.

    A random default is deliberate: it means an unconfigured deployment is
    still authenticated (the dashboard receives the token server-side), rather
    than silently running wide open on a well-known string.
    """
    return os.getenv("AUTH_TOKEN") or secrets.token_urlsafe(24)


class Settings(BaseModel):
    # Storage Paths
    STAGING_PATH: Path = Path(os.getenv("STAGING_PATH", str(BASE_DIR / "staging")))

    # Additional directories the worker is allowed to hand files from, on top of
    # STAGING_PATH. Escape hatch for machines where Chrome's download directory
    # cannot be changed (managed policy, shared workstation). Semicolon-separated.
    # Prefer pointing Chrome at STAGING_PATH instead: a download written straight
    # into a synced or network folder exposes the .crdownload partial to whatever
    # watches that folder.
    EXTRA_DOWNLOAD_ROOTS: str = os.getenv("EXTRA_DOWNLOAD_ROOTS", "")
    LIBRARY_PATH: Path = Path(os.getenv("LIBRARY_PATH", str(BASE_DIR / "library")))
    DB_PATH: Path = Path(os.getenv("DB_PATH", str(BASE_DIR / "artlist_relay.db")))

    # Quota & Working Hours Guardrails
    DAILY_SAFETY_LIMIT: int = int(os.getenv("DAILY_SAFETY_LIMIT", "20"))
    WORKING_HOURS_ENABLED: bool = os.getenv("WORKING_HOURS_ENABLED", "false").lower() in ("true", "1", "yes")
    WORKING_HOURS_START: str = os.getenv("WORKING_HOURS_START", "09:00")
    WORKING_HOURS_END: str = os.getenv("WORKING_HOURS_END", "21:00")

    # Timing & Delays
    COOLDOWN_MIN_SECONDS: int = int(os.getenv("COOLDOWN_MIN_SECONDS", "0"))
    COOLDOWN_MAX_SECONDS: int = int(os.getenv("COOLDOWN_MAX_SECONDS", "0"))
    STALE_CLAIM_TIMEOUT_SECONDS: int = int(os.getenv("STALE_CLAIM_TIMEOUT_SECONDS", "300"))
    REAPER_INTERVAL_SECONDS: int = int(os.getenv("REAPER_INTERVAL_SECONDS", "30"))

    # Circuit breaker
    CONSECUTIVE_FAILURE_LIMIT: int = int(os.getenv("CONSECUTIVE_FAILURE_LIMIT", "3"))

    # Audio Validation - 10KB minimum to support short SFX (e.g. camera shutter, clicks)
    MIN_AUDIO_BYTES: int = int(os.getenv("MIN_AUDIO_BYTES", str(10 * 1024)))  # 10KB

    # Storage guard - refuse new jobs below this much free disk
    MIN_FREE_DISK_BYTES: int = int(os.getenv("MIN_FREE_DISK_BYTES", str(5 * 1024 ** 3)))  # 5GB

    # Server Settings
    # Bind to loopback by default. The API is unauthenticated from the browser's
    # point of view until the token check runs, and the node holds a live
    # Artlist session - it must not be reachable from the LAN by default.
    HOST: str = os.getenv("HOST", "127.0.0.1")
    PORT: int = int(os.getenv("PORT", "5000"))
    AUTH_TOKEN: str = _default_token()


settings = Settings()

# Allowed browser origins for the dashboard. Wildcard CORS is never correct here:
# the service runs on loopback alongside an authenticated Artlist session, so any
# page the user visits could otherwise queue downloads against their account.
ALLOWED_ORIGINS = [
    f"http://127.0.0.1:{settings.PORT}",
    f"http://localhost:{settings.PORT}",
]

# Ensure directories exist
settings.STAGING_PATH.mkdir(parents=True, exist_ok=True)
settings.LIBRARY_PATH.mkdir(parents=True, exist_ok=True)
