#!/usr/bin/env python3
"""
Artlist Asset Library & Download Relay - launcher.
Supports:
  - Standard Mode: FastAPI Server (for Web Dashboard & Chrome Extension)
  - OS-Agent Mode: FastAPI Server + Native OS-Level Automation Agent
"""

import sys
import threading
from pathlib import Path

# Windows consoles frequently default to cp1252, which cannot encode non-ASCII
# output and takes the whole process down at the first print(). Force UTF-8 and
# degrade gracefully rather than crash on a banner.
for stream in (sys.stdout, sys.stderr):
    try:
        stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

# Ensure Windows Per-Monitor DPI Awareness so laptop display scaling (125%/150%) does not distort click coordinates
if sys.platform == "win32":
    import ctypes
    try:
        ctypes.windll.shcore.SetProcessDpiAwareness(2)
    except Exception:
        try:
            ctypes.windll.user32.SetProcessDPIAware()
        except Exception:
            pass

import uvicorn  # noqa: E402

BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

from backend.config import settings  # noqa: E402


def start_os_agent_thread():
    """Starts the native OS-level automation agent in a background daemon thread."""
    from backend.os_agent import run_os_agent_loop
    agent_thread = threading.Thread(target=run_os_agent_loop, daemon=True)
    agent_thread.start()
    print("[INFO] Native OS-Level Automation Agent started in background thread.")


def main():
    enable_os_agent = "--os-agent" in sys.argv or "--agent" in sys.argv

    bar = "=" * 70
    print(bar)
    print(" STOCKS LIBRARY • STUDIO MEDIA ARCHIVE & DOWNLOAD RELAY")
    print(bar)
    print(f" Staging directory : {settings.STAGING_PATH}")
    print(f" Library directory : {settings.LIBRARY_PATH}")
    print(f" Database          : {settings.DB_PATH}")
    print(f" Daily safe limit  : {settings.DAILY_SAFETY_LIMIT} downloads/day")
    print(f" Working hours     : {settings.WORKING_HOURS_START} - {settings.WORKING_HOURS_END} "
          f"(enforced: {settings.WORKING_HOURS_ENABLED})")
    print(f" Bind address      : {settings.HOST}:{settings.PORT}")
    print(f" OS-Agent Mode     : {'ENABLED (Hardware OS Input)' if enable_os_agent else 'DISABLED (Use Extension)'}")
    print(bar)
    print(f" Dashboard         : http://127.0.0.1:{settings.PORT}/")
    if not enable_os_agent:
        print(f" Extension path    : {BASE_DIR / 'extension'}")
    print(bar)

    if settings.HOST not in ("127.0.0.1", "localhost", "::1"):
        print(" WARNING: bound to a non-loopback address. This node holds a live")
        print("          Artlist session - do not expose it beyond the local machine.")
        print(bar)

    if enable_os_agent:
        start_os_agent_thread()

    print("\n[INFO] Starting server...\n")

    uvicorn.run(
        "backend.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=False,
        log_level="info",
    )


if __name__ == "__main__":
    main()
