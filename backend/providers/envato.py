"""
Envato Elements Provider Implementation for Setu
================================================
Handles Envato Elements Video Templates (Premiere Pro, After Effects, DaVinci Resolve),
Stock Video, Music, Sound Effects, Graphics, and 3D Assets.
"""

import re
from typing import Dict, Any, List
from urllib.parse import urlparse
from backend.providers.base import BaseStockProvider


class EnvatoProvider(BaseStockProvider):
    @property
    def name(self) -> str:
        return "envato"

    @property
    def display_name(self) -> str:
        return "Envato Elements"

    def match_url(self, url: str) -> bool:
        cleaned = (url or "").strip().lower()
        return "elements.envato.com" in cleaned or "envato.com" in cleaned

    def parse_url(self, url: str) -> Dict[str, Any]:
        u = url.strip()
        if not u.startswith("http://") and not u.startswith("https://"):
            u = "https://" + u
        parsed = urlparse(u)
        path = parsed.path.rstrip("/")
        parts = [p for p in path.split("/") if p]

        if not parts:
            raise ValueError(f"Invalid Envato Elements URL: {url}")

        last_seg = parts[-1]

        # Envato item ID is usually at the end of the slug, e.g. "cinematic-trailer-9XYZ123" -> "9XYZ123"
        # or the slug itself if alphanumeric
        item_id_match = re.search(r"-([A-Z0-9]{5,12})$", last_seg, re.IGNORECASE)
        if item_id_match:
            track_id = item_id_match.group(1).upper()
        else:
            track_id = last_seg

        # Determine Category
        category = "template"
        path_lower = path.lower()
        if "video-template" in path_lower:
            category = "video-template"
        elif "sound-effect" in path_lower or "/sfx" in path_lower:
            category = "sfx"
        elif "audio" in path_lower or "music" in path_lower:
            category = "music"
        elif "stock-video" in path_lower:
            category = "stock-video"
        elif "graphic-template" in path_lower:
            category = "graphic-template"
        elif "photo" in path_lower:
            category = "photo"
        elif "3d" in path_lower:
            category = "3d"
        elif "font" in path_lower:
            category = "font"

        canonical_url = self.normalize_url(u)

        return {
            "track_id": track_id,
            "category": category,
            "title_slug": last_seg,
            "provider": self.name,
            "canonical_url": canonical_url,
        }

    def normalize_url(self, url: str) -> str:
        u = url.strip()
        parsed = urlparse(u)
        clean_path = parsed.path.rstrip("/")
        return f"https://elements.envato.com{clean_path}"

    def get_supported_variants(self, category: str) -> List[str]:
        return ["main"]
