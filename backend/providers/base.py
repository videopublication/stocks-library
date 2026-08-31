"""
Base Provider Interface for Setu Creative Asset Bridge
======================================================
Defines the standard interface for all stock asset providers (Artlist, Envato Elements, etc.).
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, Tuple, List
from pathlib import Path


class BaseStockProvider(ABC):
    """Abstract base class for all stock content providers."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Provider identifier, e.g., 'artlist', 'envato'."""
        pass

    @property
    @abstractmethod
    def display_name(self) -> str:
        """Human-friendly display name, e.g., 'Artlist', 'Envato Elements'."""
        pass

    @abstractmethod
    def match_url(self, url: str) -> bool:
        """Check if the provided URL belongs to this stock provider."""
        pass

    @abstractmethod
    def parse_url(self, url: str) -> Dict[str, Any]:
        """
        Parses a URL to extract metadata:
        Returns dict with:
          - track_id: str (unique identifier on provider platform)
          - category: str (e.g. 'music', 'sfx', 'video-template', 'stock-video', 'graphic-template', 'other')
          - title_slug: str (human readable slug)
          - provider: str (provider name)
          - canonical_url: str
        """
        pass

    @abstractmethod
    def normalize_url(self, url: str) -> str:
        """Returns the canonical, clean URL without tracking params or incorrect routes."""
        pass

    @abstractmethod
    def get_supported_variants(self, category: str) -> List[str]:
        """Returns list of supported variants for a category, e.g. ['main', 'stems']."""
        pass
