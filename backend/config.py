import os
import secrets
from pathlib import Path
from pydantic import BaseModel

# Default base directory in workspace or user home
BASE_DIR = Path(__file__).resolve().parent.parent


def get_lan_ip() -> str:
    """Auto-detects the active LAN IPv4 address of this machine."""
    import socket
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


def get_all_lan_ips() -> list[str]:
    """Returns a list of all active IPv4 addresses on this machine (Ethernet, Wi-Fi, etc.)."""
    import socket
    ips = []
    primary = get_lan_ip()
    if primary and primary != "127.0.0.1":
        ips.append(primary)
    try:
        for ip in socket.gethostbyname_ex(socket.gethostname())[2]:
            if ip not in ips and not ip.startswith("127.") and not ip.startswith("169.254."):
                ips.append(ip)
    except Exception:
        pass
    return ips or ["127.0.0.1"]


def _default_token() -> str:
    """
    Read the shared token from env, or persist a secure token to .relay_token.
    This prevents connected browser tabs on LAN workstations from getting 401
    errors whenever the server restarts.
    """
    if os.getenv("AUTH_TOKEN"):
        return os.getenv("AUTH_TOKEN")
    token_file = BASE_DIR / ".relay_token"
    if token_file.exists():
        try:
            tok = token_file.read_text(encoding="utf-8").strip()
            if tok:
                return tok
        except Exception:
            pass
    token = secrets.token_urlsafe(24)
    try:
        token_file.write_text(token, encoding="utf-8")
    except Exception:
        pass
    return token


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
    # Automatically bound to active LAN IP for network studio access.
    HOST: str = os.getenv("HOST", get_lan_ip())
    PORT: int = int(os.getenv("PORT", "5000"))
    AUTH_TOKEN: str = _default_token()


settings = Settings()

# Allowed browser origins for the dashboard.
ALLOWED_ORIGINS = [
    "*",
    f"http://127.0.0.1:{settings.PORT}",
    f"http://localhost:{settings.PORT}",
    f"http://{settings.HOST}:{settings.PORT}",
    f"http://192.168.200.131:{settings.PORT}",
    f"http://10.50.1.222:{settings.PORT}",
    f"https://127.0.0.1:{settings.PORT}",
    f"https://localhost:{settings.PORT}",
    f"https://{settings.HOST}:{settings.PORT}",
    f"https://192.168.200.131:{settings.PORT}",
    f"https://10.50.1.222:{settings.PORT}",
]

# Ensure directories exist
settings.STAGING_PATH.mkdir(parents=True, exist_ok=True)
settings.LIBRARY_PATH.mkdir(parents=True, exist_ok=True)
