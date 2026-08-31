"""
Artlist Provider Implementation for Setu
========================================
Handles Artlist music, sound effects, and multi-track stems.
"""

import re
from typing import Dict, Any, List
from urllib.parse import urlparse
from backend.providers.base import BaseStockProvider


class ArtlistProvider(BaseStockProvider):
    @property
    def name(self) -> str:
        return "artlist"

    @property
    def display_name(self) -> str:
        return "Artlist"

    def match_url(self, url: str) -> bool:
        cleaned = (url or "").strip().lower()
        return "artlist.io" in cleaned

    def parse_url(self, url: str) -> Dict[str, Any]:
        u = url.strip()
        if not u.startswith("http://") and not u.startswith("https://"):
            u = "https://" + u
        parsed = urlparse(u)
        path = parsed.path.rstrip("/")
        parts = [p for p in path.split("/") if p]

        # Extract track ID (typically the last numeric or alphanumeric token)
        track_id = None
        for seg in reversed(parts):
            if re.fullmatch(r"[A-Za-z0-9_-]+", seg) and (seg.isdigit() or len(seg) >= 4):
                track_id = seg
                break

        if not track_id and parts:
            track_id = parts[-1]

        if not track_id:
            raise ValueError(f"Could not extract track ID from Artlist URL: {url}")

        # Determine category
        is_sfx = "/sfx/" in path or "/sound-effects/" in path or "/sfx" in path
        category = "sfx" if is_sfx else "music"

        # Determine slug
        slug = parts[-2] if len(parts) >= 2 and parts[-1] == track_id else track_id

        canonical_url = self.normalize_url(u)

        return {
            "track_id": track_id,
            "category": category,
            "title_slug": slug,
            "provider": self.name,
            "canonical_url": canonical_url,
        }

    def normalize_url(self, url: str) -> str:
        u = url.strip()
        if not u.startswith("http://") and not u.startswith("https://"):
            u = "https://" + u
        parsed = urlparse(u)
        path = parsed.path.rstrip("/")
        parts = [p for p in path.split("/") if p]

        if len(parts) >= 2:
            track_id = parts[-1]
            slug = parts[-2]
            if "/sfx/" in path:
                return f"https://artlist.io/sfx/track/{slug}/{track_id}"
            elif "/sound-effects/" in path:
                return f"https://artlist.io/sound-effects/track/{slug}/{track_id}"
            else:
                return f"https://artlist.io/royalty-free-music/song/{slug}/{track_id}"

        # Strip search query params if already canonical
        return f"https://artlist.io{path}"

    def get_supported_variants(self, category: str) -> List[str]:
        if category == "music":
            return ["main", "stems"]
        return ["main"]
