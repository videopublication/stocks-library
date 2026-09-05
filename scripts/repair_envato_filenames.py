#!/usr/bin/env python3
"""
Repair script to migrate existing Envato items in library/ and SQLite DB
from '- Artlist.zip' to '- Envato.zip' and resolve 'Unknown Track' titles.
"""

import sys
import re
from pathlib import Path
from urllib.parse import urlparse

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

for stream in (sys.stdout, sys.stderr):
    try:
        stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

from backend.config import settings
from backend.database import get_db, init_db
from backend.service import get_effective_library_path


def parse_title_from_url(url: str) -> str:
    """Derives a clean human-readable asset title from its URL slug."""
    if not url:
        return ""
    try:
        parsed = urlparse(url)
        path = parsed.path.rstrip("/")
        parts = [p for p in path.split("/") if p]
        if not parts:
            return ""
        slug = parts[-1]

        # Remove trailing alphanumeric item ID e.g. -BK5FUP8, -WGFQYS7
        slug = re.sub(r"-[A-Za-z0-9]{5,12}$", "", slug)
        words = slug.replace("-", " ").replace("_", " ").split()
        if not words:
            return ""

        acronyms = {"lut", "luts", "sfx", "vfx", "fx", "4k", "8k", "hd", "ui", "3d", "pr", "ae", "pro", "premiere", "resolve"}
        title_words = []
        for w in words:
            wl = w.lower()
            if wl in ("for", "and", "with", "the", "in", "on", "a", "an", "of"):
                title_words.append(wl)
            elif wl in acronyms:
                title_words.append(w.upper() if len(w) <= 4 else w.capitalize())
            else:
                title_words.append(w.capitalize())

        if title_words:
            title_words[0] = title_words[0].capitalize()
            return " ".join(title_words)
    except Exception:
        pass
    return ""


def repair_envato_library():
    init_db()
    lib_dir = get_effective_library_path()
    print(f"Scanning library directory: {lib_dir}")

    with get_db(write=True) as conn:
        rows = conn.execute("""
            SELECT track_id, variant, title, filename, library_path, url, provider
            FROM tracks
            WHERE provider = 'envato'
        """).fetchall()

        repaired = 0
        for r in rows:
            track_id = r["track_id"]
            variant = (r["variant"] or "main").capitalize()
            old_title = r["title"]
            old_filename = r["filename"]
            old_path = Path(r["library_path"]) if r["library_path"] else lib_dir / old_filename
            url = r["url"] or ""

            # Check if title needs resolution
            new_title = old_title
            if not new_title or new_title.lower() in ("unknown track", "unknown"):
                slug_title = parse_title_from_url(url)
                if slug_title:
                    new_title = slug_title

            # Check extension
            ext = old_path.suffix or ".zip"

            # Clean new filename: "<Title> - <Variant> - Envato<ext>"
            new_filename = f"{new_title} - {variant} - Envato{ext}"
            new_path = lib_dir / new_filename

            # If filename already has duplicate collisions, handle nicely
            counter = 2
            while new_path.exists() and new_path.resolve() != old_path.resolve():
                new_filename = f"{new_title} - {variant} - Envato ({counter}){ext}"
                new_path = lib_dir / new_filename
                counter += 1

            # Rename file on disk if old file exists
            if old_path.exists() and old_path.resolve() != new_path.resolve():
                print(f"Renaming file: '{old_path.name}' -> '{new_path.name}'")
                old_path.rename(new_path)
            elif not old_path.exists() and new_path.exists():
                print(f"File already renamed on disk: '{new_path.name}'")

            # Update tracks record
            conn.execute("""
                UPDATE tracks
                SET title = ?, filename = ?, library_path = ?
                WHERE track_id = ? AND variant = ?
            """, (new_title, new_filename, str(new_path), track_id, r["variant"]))

            # Update jobs table matching records
            conn.execute("""
                UPDATE jobs
                SET filename = ?, library_path = ?
                WHERE track_id = ? AND variant = ?
            """, (new_filename, str(new_path), track_id, r["variant"]))

            # Also update jobs by old filename if any
            conn.execute("""
                UPDATE jobs
                SET filename = ?, library_path = ?
                WHERE filename = ?
            """, (new_filename, str(new_path), old_filename))

            repaired += 1
            print(f"✓ Repaired: [{track_id}] '{new_title}' ({new_filename})")

        print(f"\nCompleted! Repaired {repaired} Envato library items.")


if __name__ == "__main__":
    repair_envato_library()
