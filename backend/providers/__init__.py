"""
Stock Provider Registry and Router for Setu
===========================================
Automatically detects and routes asset URLs to the appropriate provider (Artlist, Envato, etc.).
"""

from typing import List, Optional, Dict, Any
from backend.providers.base import BaseStockProvider
from backend.providers.artlist import ArtlistProvider
from backend.providers.envato import EnvatoProvider

_PROVIDERS: List[BaseStockProvider] = [
    ArtlistProvider(),
    EnvatoProvider(),
]


def get_all_providers() -> List[BaseStockProvider]:
    """Returns all registered stock content providers."""
    return list(_PROVIDERS)


def get_provider_for_url(url: str) -> BaseStockProvider:
    """
    Finds the appropriate stock provider for a given URL.
    Raises ValueError if no matching provider is found.
    """
    cleaned = (url or "").strip()
    for provider in _PROVIDERS:
        if provider.match_url(cleaned):
            return provider
    
    # Default fallback to Artlist for legacy bare slugs/IDs if purely alphanumeric
    if cleaned and not cleaned.startswith("http"):
        return _PROVIDERS[0]

    raise ValueError(f"Unsupported stock platform URL: '{url}'. Supported: Artlist, Envato Elements.")


def parse_stock_url(url: str) -> Dict[str, Any]:
    """Convenience helper to parse any stock URL using its matched provider."""
    provider = get_provider_for_url(url)
    return provider.parse_url(url)
